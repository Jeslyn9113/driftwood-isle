// Driftwood Isle multiplayer server: serves the game files and runs the shared island over WebSocket.
const http = require('http');
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = Number(process.env.PORT) || 8000;
// gardens: how long a watered sprout takes to become a grown crop, and how long watered soil stays wet (real time)
const GARDEN_GROW_MS = 3 * 60 * 1000;
const GARDEN_WET_MS = 24 * 60 * 60 * 1000;
const WATER_EVERY_MS = 1000; // at most one watering per second per player
// What Bo the traveling buyer pays, in coins per item. Backpack kinds not listed here can't be sold to him.
// The keys are the backpack's item names; flowers aren't listed, so Bo doesn't buy them.
const SELL_PRICES = {
  coconut: 5, mango: 5, pineapple: 5, // fruit
  shell: 8,
  star: 12, // starfish
  smallfish: 10,
  bigfish: 25,
  butterfly: 15, beetle: 20, dragonfly: 30,
  carrot: 12, tomato: 12, cabbage: 12, // grown crops
  conch: 15, // beach
  crab: 18, // beach
  scarab: 35, // desert
  lizard: 28, // desert
  clownfish: 22, puffer: 30, // fished off the beach
};
// what a fishing catch turns out to be, rolled here on the server (chances add up to 1)
const CATCH_TABLE = [['smallfish', 0.6], ['bigfish', 0.25], ['shell', 0.075], ['star', 0.075]];
// fishing from the beach (the same test as atBeach in main.js) adds the beach's own catches
const BEACH_CATCH_TABLE = [['smallfish', 0.33], ['clownfish', 0.22], ['puffer', 0.15], ['bigfish', 0.13], ['crab', 0.1], ['star', 0.07]];
const BEACH_AREA = require('./island.js').LAYOUT.areas.beach;
const atBeach = (p) => Number.isFinite(p.x) && p.x < -43 && ((p.x - BEACH_AREA.x) / BEACH_AREA.rx) ** 2 + ((p.z - BEACH_AREA.z) / BEACH_AREA.rz) ** 2 < 2.56;
const START_COINS = 50; // every account starts with these (older accounts get them the first time they log in)
const ROOT = __dirname;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' };
const TREE_REGROW_MS = 90000; // matches the client
const PROTOCOL = 9; // bump with every change to the messages; must equal PROTOCOL in main.js
const PUBLIC = new Set(['/index.html', '/main.js', '/island.js', '/lib/three.module.js']);

const server = http.createServer((req, res) => {
  let url = decodeURIComponent((req.url || '/').split('?')[0]);
  if (url === '/') url = '/index.html';
  if (!PUBLIC.has(url)) { res.writeHead(404); res.end('Not found'); return; }
  fs.readFile(path.join(ROOT, url), (err, data) => {
    if (err) { res.writeHead(500); res.end('Error'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(url)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});

// ---------------------------------------------------------------- shared state
// Everything here is a pure function of wall-clock timestamps, never of a running timer,
// so the island is correct whenever the process wakes up (or restarts, via state.json).
const STATE_FILE = path.join(ROOT, 'state.json');
const items = new Map(); // id -> { gen, respawnAt, announced }; active while Date.now() >= respawnAt
const trees = new Map(); // fruit tree id -> readyAt; has fruit again once Date.now() >= readyAt
const bugs = new Map(); // bug id -> { gen, spawnAt }; clients derive each bug's path from (id, gen) and its age
// bump when the island layout changes: item, tree and bug ids then mean different things, so their saved
// state (and saved player positions) from an older island are dropped
const WORLD_VERSION = 14; // 14: smaller beach and desert, the volcano; 13: 13: one island again, the desert and beach grown onto it; 12: 12: the desert and the beach; 11: 11: the river (item and tree spots moved); 10: 10: some trees became cherry blossoms (fruit-tree ids moved); 9: 9: the island enlarged 1.7x, homes spread out; 8: the island laid out from the painting; 7: the rebuilt island (island.js); 6: the new look; 5: the loop road; 4: bigger island and yards
let savedState = {};
try { savedState = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) || {}; } catch { /* first run: fresh island */ }
if (savedState.world !== WORLD_VERSION) savedState = { islandWatered: savedState.islandWatered, islandHarvested: savedState.islandHarvested }; // the island garden keeps its state
for (const [id, gen, respawnAt] of savedState.items || []) items.set(id, { gen, respawnAt, announced: Date.now() >= respawnAt });
for (const [id, readyAt] of savedState.trees || []) trees.set(id, readyAt);
for (const [id, gen, spawnAt] of savedState.bugs || []) bugs.set(id, { gen, spawnAt });
let saveQueued = false;
function save() {
  if (saveQueued) return;
  saveQueued = true;
  setTimeout(() => {
    saveQueued = false;
    const data = {
      world: WORLD_VERSION,
      items: [...items.entries()].map(([id, s]) => [id, s.gen, s.respawnAt]),
      trees: [...trees.entries()],
      bugs: [...bugs.entries()].map(([id, b]) => [id, b.gen, b.spawnAt]),
      itemKinds: [...itemKinds.entries()],
      islandWatered, islandHarvested,
      treeKinds: [...treeKinds.entries()],
    };
    fs.writeFile(STATE_FILE, JSON.stringify(data), () => {});
  }, 1000);
}

function item(id) {
  if (!items.has(id)) items.set(id, { gen: 0, respawnAt: 0, announced: true });
  return items.get(id);
}
const isActive = (s, now = Date.now()) => now >= s.respawnAt;
function bug(id) {
  if (!bugs.has(id)) bugs.set(id, { gen: 0, spawnAt: 0 });
  return bugs.get(id);
}
const validId = (v, max) => Number.isInteger(v) && v >= 0 && v <= max;

// ---------------------------------------------------------------- per-player energy and backpack rules
// The server owns every player's energy and backpack: items only arrive through events it confirmed
// (pick, chop, catch, a timed fishing catch) and energy only changes through priced actions and eating.
const ENERGY_MAX = 100;
const COST = { axe: 5, cast: 5, net: 3, water: 3 }; // matches the client
const FOOD_ENERGY = { coconut: 15, mango: 15, pineapple: 15, carrot: 8, tomato: 8, cabbage: 8 }; // energy each food gives
const FOOD = new Set(['coconut', 'mango', 'pineapple']); // fruit from trees (crops come from harvesting)
const GARDEN_CROPS = ['carrot', 'tomato', 'cabbage']; // a plot square's crop is its column (idx % 3), as in the client
const ISLAND_CROPS = ['cabbage', 'tomato', 'carrot']; // the island garden's beds, 5 plants each (idx / 5)
const GROUND_KINDS = new Set(['shell', 'star', 'coconut', 'mango', 'pineapple', 'flower', 'conch']);
const BUG_KINDS = ['butterfly', 'butterfly', 'butterfly', 'beetle', 'beetle', 'dragonfly', 'dragonfly', 'scarab', 'scarab', 'crab', 'crab', 'lizard', 'lizard']; // bug id -> kind, as in the client
// what each ground item / fruit tree is, learned from the first report and then fixed, so it can't be changed later
const itemKinds = new Map(savedState.itemKinds || []);
const treeKinds = new Map(savedState.treeKinds || []);
function pinKind(map, id, kind, allowed) {
  if (!allowed.has(kind)) return false;
  if (!map.has(id)) { map.set(id, kind); save(); }
  return map.get(id) === kind;
}
function spend(p, cost) {
  if (p.energy < cost) return false;
  p.energy -= cost;
  return true;
}
// ---------------------------------------------------------------- plaza seats: two on each bench, two on the swing
// seat ids match the client: 0-1 left bench, 2-3 swing, 4-5 right bench. The swing's motion is computed by every
// client from this small state and the shared clock (same formula as swingAmp / swingAngle in main.js).
// 6-29: the 24 chairs of the seaside restaurant (six tables of four, in the client's order)
// 30-45: the beach seats: six pairs of loungers under parasols (12), then the festival's two benches (4)
const SEAT_COUNT = 6 + 24 + 12 + 4, SWING_SEATS = [2, 3];
const SWING = { RAMP: 2000, DECAY: 1500 };
const seats = new Map(); // seat id -> player id
const swing = { occupied: false, phase0: 0, occAt: 0, ampStart: 0, stop: 0, ampStop: 0 };
const smoothstep = (e0, e1, x) => { const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
function swingAmp(t) {
  return swing.occupied ? swing.ampStart + (1 - swing.ampStart) * smoothstep(0, SWING.RAMP, t - swing.occAt) : swing.ampStop * Math.exp(-Math.max(0, t - swing.stop) / SWING.DECAY);
}
// moves a player to a seat (or off every seat with seat = null) and starts / stops the swing as needed
function setSeat(p, seat) {
  for (const [s, id] of seats) if (id === p.id) seats.delete(s);
  if (seat !== null) seats.set(seat, p.id);
  const occ = SWING_SEATS.some((s) => seats.has(s)), t = Date.now();
  if (occ && !swing.occupied) { const a = swingAmp(t); if (a < 0.02) swing.phase0 = t; swing.ampStart = a; swing.occAt = t; swing.occupied = true; }
  else if (!occ && swing.occupied) { swing.ampStop = swingAmp(t); swing.stop = t; swing.occupied = false; }
}
const seatsMsg = () => ({ t: 'seats', seats: [...seats.entries()], swing });
// ---- the playground rides: one player per Ferris wheel gondola / merry-go-round animal. Both turn from the clock
// (angle = 2 PI * (now mod periodMs) / periodMs); a Ferris wheel ride lasts exactly one turn from when you board.
const RIDES = require('./island.js').LAYOUT.rides; // (the rest of the layout is loaded further down)
const rideOcc = { ferris: new Map(), carousel: new Map() }; // seat -> { id, at }
const ridesMsg = () => ({ t: 'rides', ferris: [...rideOcc.ferris].map(([k, o]) => [k, o.id, o.at]), carousel: [...rideOcc.carousel].map(([k, o]) => [k, o.id, o.at]) });
function leaveRides(p) {
  let changed = false;
  for (const m of Object.values(rideOcc)) for (const [k, o] of m) if (o.id === p.id) { m.delete(k); changed = true; }
  return changed;
}
// ---- bicycles: free from Rex's stand, one per player, never saved. The server owns where each one is: the rider's
// client sends where it rode to (checked against a top speed so nobody teleports), everyone else is told.
const RENTAL = require('./island.js').LAYOUT.rental;
const BIKE = { maxSpeed: 7.5, idleMs: 10 * 60 * 1000, colors: ['#9be0c0', '#f6b8d0', '#8fc0f0', '#f2e28a', '#c9a6ff'] };
const bikes = new Map(); // owner player id -> { id, owner, name, color, x, z, h, riding, at, lastRide }
const bikePub = (b) => ({ id: b.id, owner: b.owner, name: b.name, color: b.color, x: b.x, z: b.z, h: b.h, riding: b.riding });
function dropBike(p, how) { const b = bikes.get(p.id); if (!b) return; bikes.delete(p.id); broadcast({ t: 'bikeGone', id: b.id, how }); }
setInterval(() => { // a bicycle nobody has ridden for 10 minutes goes back to the stand by itself
  const now = Date.now();
  for (const [id, b] of bikes) if (!b.riding && now - b.lastRide > BIKE.idleMs) { bikes.delete(id); broadcast({ t: 'bikeGone', id: b.id, how: 'fade' }); }
}, 15000);
const nearRental = (p, reach) => Number.isFinite(p.x) && !p.room && Math.hypot(p.x - RENTAL.x, p.z - RENTAL.z) <= reach;
// ---- the hot air balloon: one basket for up to 4 players. The server keeps its state ('tied' on the pad, 'rising',
// 'up' at the top, 'descending'), the height it had at a moment, and who stands where; every client works out the
// height in between from the shared clock (same speeds as BALLOON in main.js). Never saved.
const BALLOON = { pad: require('./island.js').LAYOUT.balloon, maxH: 60, up: 2.2, down: 2.8, seats: 4, reach: 6.5 };
const balloon = { s: 'tied', h: 0, at: Date.now(), riders: [null, null, null, null], off: new Set() };
function balloonH(now = Date.now()) {
  const dt = (now - balloon.at) / 1000;
  if (balloon.s === 'rising') return Math.min(BALLOON.maxH, balloon.h + BALLOON.up * dt);
  if (balloon.s === 'descending') return Math.max(0, balloon.h - BALLOON.down * dt);
  return balloon.h;
}
const balloonMsg = () => ({ t: 'balloon', s: balloon.s, h: balloon.h, at: balloon.at, riders: balloon.riders, off: [...balloon.off] });
function balloonSet(state) { const now = Date.now(); balloon.h = balloonH(now); balloon.s = state; balloon.at = now; }
const balloonSpot = (id) => balloon.riders.indexOf(id);
function balloonLeave(id) { // a passenger leaves (or disconnects): their spot is free again
  const i = balloonSpot(id);
  if (i < 0) return false;
  balloon.riders[i] = null; balloon.off.delete(id);
  return true;
}
setInterval(() => { // reaching the top, landing, and coming down by itself when nobody is aboard
  let changed = false;
  const h = balloonH(), aboard = balloon.riders.filter((r) => r !== null);
  if (balloon.s === 'rising' && h >= BALLOON.maxH) { balloonSet('up'); changed = true; }
  if (balloon.s === 'descending' && h <= 0) { // landed: back on its ropes, and whoever wanted off steps out
    balloonSet('tied'); balloon.h = 0;
    for (const id of [...balloon.off]) balloonLeave(id);
    changed = true;
  }
  if ((balloon.s === 'rising' || balloon.s === 'up') && (!aboard.length || aboard.every((id) => balloon.off.has(id)))) { balloonSet('descending'); changed = true; }
  if (changed) broadcast(balloonMsg());
}, 150);
// ---- banana boat rides: each motorboat waits at the jetty ('wait'), tows its banana boat round the loop ('ride'), or
// heads back early because someone wants off ('return'). Where a boat is comes from its state and the shared clock
// (clients use the same paths from island.js), so only boarding and state changes go over the network. Never saved.
const { makePath, bananaCourse, bananaRideAt, bananaRetAt, bananaReturnCtrl } = require('./island.js');
const BANANA = require('./island.js').LAYOUT.beach.banana;
const bananas = BANANA.boats.map((z, bi) => ({ z, bi, driver: BANANA.drivers[bi], course: bananaCourse(bi), s: 'wait', riders: [null, null, null, null, null, null], first: 0, at: 0, ret: null }));
const bananaMsg = () => ({ t: 'banana', now: Date.now(), boats: bananas.map((b) => ({ driver: b.driver, s: b.s, riders: b.riders, first: b.first, at: b.at, ret: b.ret && { ctrl: b.ret.ctrl, at: b.ret.at, d0: b.ret.d0, v0: b.ret.v0 } })) });
function bananaFinish(b) { b.s = 'wait'; b.riders.fill(null); b.first = 0; b.at = 0; b.ret = null; }
function bananaReturn(b, now) { // back to the jetty from wherever it is: on along the lane, slower
  const r = bananaRideAt(b.course, b.at, now), ctrl = bananaReturnCtrl(b.course, b.bi, r.d);
  if (!ctrl) return; // already on the way in: just finish the loop
  const path = makePath(ctrl);
  b.s = 'return'; b.ret = { ctrl, at: now, d0: path.at[2], len: path.len, v0: +r.v.toFixed(3) }; // slows down smoothly from here
}
const bananaSeatOf = (id) => { for (let i = 0; i < bananas.length; i++) { const k = bananas[i].riders.indexOf(id); if (k >= 0) return { boat: i, seat: k }; } return null; };
const nearJetty = (p) => { const [[ax, az], [bx, bz]] = BANANA.jetty; if (!Number.isFinite(p.x) || p.room) return false; const t = Math.max(0, Math.min(1, ((p.x - ax) * (bx - ax) + (p.z - az) * (bz - az)) / ((bx - ax) ** 2 + (bz - az) ** 2))); return Math.hypot(p.x - (ax + (bx - ax) * t), p.z - (az + (bz - az) * t)) <= 10; };
setInterval(() => {
  const now = Date.now();
  let changed = false;
  for (const b of bananas) {
    const aboard = b.riders.some((r) => r !== null);
    if (b.s === 'wait' && aboard && now - b.first >= BANANA.waitMs) { b.s = 'ride'; b.at = now; changed = true; }
    else if (b.s === 'ride' && bananaRideAt(b.course, b.at, now).done) { bananaFinish(b); changed = true; }
    else if (b.s === 'ride' && !aboard) { bananaReturn(b, now); changed = true; } // an empty boat heads home to rest
    else if (b.s === 'return' && bananaRetAt(b.ret, b.ret.len, now).done) { bananaFinish(b); changed = true; }
  }
  if (changed) broadcast(bananaMsg());
}, 200);
// ---- beach volleyball: the match engine from island.js runs here (ball flights, rules, the practice bot, hit checks);
// clients only send join / practice / again / leave / hit and draw what this sends. Never saved.
const { volleyEngine, VOLLEY } = require('./island.js');
const playerById = (id) => { for (const q of players.values()) if (q.id === id) return q; return null; };
let volleyDirty = false;
const volley = volleyEngine({ now: () => Date.now(), emit: () => { volleyDirty = true; }, posOf: (id) => { const q = playerById(id); return q && Number.isFinite(q.x) && !q.room ? { x: q.x, z: q.z } : null; } });
const volleyMsg = () => ({ t: 'volley', now: Date.now(), ...volley.view() });
const nearCourt = (p) => Number.isFinite(p.x) && !p.room && Math.abs(p.x - VOLLEY.x) < VOLLEY.hw + 6 && Math.abs(p.z - VOLLEY.z) < VOLLEY.hl + 6;
let volleyBotT = 0;
setInterval(() => {
  volley.tick();
  const now = Date.now(); // the bot's position goes out ten times a second while it plays
  if (volley.S.bot && now - volleyBotT > 100) { volleyBotT = now; volleyDirty = true; }
  if (volleyDirty) { volleyDirty = false; broadcast(volleyMsg()); }
}, 50);
const DOLPHIN_SEED = Math.floor(Math.random() * 1e9); // the dolphins' shared jump schedule
const wheelAngle = (t) => ((t % RIDES.ferris.periodMs) / RIDES.ferris.periodMs) * Math.PI * 2;
// boards p onto a ride; returns '' when it worked, or the reason it didn't
function boardRide(p, kind, want) {
  const r = RIDES[kind], occ = rideOcc[kind], now = Date.now();
  if (!r) return "That ride doesn't exist";
  if (p.room) return "You're indoors";
  if (!Number.isFinite(p.x) || Math.hypot(p.x - r.x, p.z - r.z) > r.pad + 5) return 'Get a little closer to the ride';
  if (kind === 'ferris') { // the free gondola nearest the bottom (the boarding point)
    let best = null, bd = Infinity;
    for (let k = 0; k < r.gondolas; k++) {
      if (occ.has(k)) continue;
      const a = (k / r.gondolas) * Math.PI * 2 + wheelAngle(now), d = Math.abs(Math.atan2(Math.sin(a + Math.PI / 2), Math.cos(a + Math.PI / 2)));
      if (d < bd) { bd = d; best = k; }
    }
    if (best === null) return 'Every gondola is taken right now, try again in a moment';
    leaveRides(p); occ.set(best, { id: p.id, at: now });
    setTimeout(() => { const o = occ.get(best); if (o && o.id === p.id && o.at === now) { occ.delete(best); broadcast(ridesMsg()); } }, r.periodMs);
    return '';
  }
  if (!Number.isInteger(want) || want < 0 || want >= r.seats) return 'Pick an animal to ride';
  if (occ.has(want) && occ.get(want).id !== p.id) return occ.size >= r.seats ? 'Every animal is taken right now, try again in a moment' : 'Someone just took that animal, try another';
  leaveRides(p); occ.set(want, { id: p.id, at: now });
  return '';
}

// ---------------------------------------------------------------- home plots: 8 around the town, one per account, for good
const PLOT_COUNT = 8;
// the island's layout (plots, roads, Bo's walk) comes from island.js, the same file the game uses
const { LAYOUT, buildBoRoute, routeAt } = require('./island.js');
const plotCentre = (n) => LAYOUT.plots[n - 1];
// the garden sits inside the plot (within ~3 of its centre); a can reaches about 3 more
function nearPlot(p, n) {
  if (!Number.isFinite(p.x) || !Number.isFinite(p.z) || !LAYOUT.plots[n - 1]) return false;
  const c = plotCentre(n);
  return Math.hypot(p.x - c.x, p.z - c.z) <= 6;
}

// ---------------------------------------------------------------- Bo the traveling buyer
// He walks the loop road around the homes for ever. The server owns where he is: { s (distance along the route),
// moving, at (when s was true) }, so every client works out the same spot from the shared clock. He pauses a moment
// at each gate, and stands still while anyone has his sell panel open (each for up to 30 s without activity).
const boRoute = buildBoRoute(LAYOUT);
const BO = { speed: 1.0, pauseMs: 3500, holdMs: 30000, reach: 4.5, sellReach: 6.5 };
const bo = { s: 0, moving: true, at: Date.now(), pauseUntil: 0, holds: new Map() }; // holds: player id -> last activity
const boS = (now = Date.now()) => (bo.moving ? (bo.s + (BO.speed * (now - bo.at)) / 1000) % boRoute.len : bo.s);
const boMsg = () => ({ t: 'bo', s: bo.s, moving: bo.moving, at: bo.at, speed: BO.speed });
function boSet(moving, now) { bo.s = boS(now); bo.moving = moving; bo.at = now; broadcast(boMsg()); }
function nearBo(p, reach, now = Date.now()) {
  if (p.room || !Number.isFinite(p.x) || !Number.isFinite(p.z)) return false;
  const b = routeAt(boRoute, boS(now));
  return Math.hypot(p.x - b.x, p.z - b.z) <= reach;
}
let boLast = 0;
setInterval(() => {
  const now = Date.now();
  for (const [id, t] of bo.holds) { // let go of anyone who left, walked off or went quiet
    const p = [...players.values()].find((q) => q.id === id);
    if (!p || now - t > BO.holdMs || !nearBo(p, BO.sellReach + 1.5, now)) bo.holds.delete(id);
  }
  if (bo.holds.size) { if (bo.moving) boSet(false, now); boLast = bo.s; return; }
  if (!bo.moving) { if (now >= bo.pauseUntil) { boSet(true, now); boLast = bo.s; } return; }
  const sNow = boS(now);
  // reached a gate since the last tick: stop there for a moment
  const crossed = boRoute.pauses.find((m) => (boLast <= sNow ? m > boLast && m <= sNow : m > boLast || m <= sNow));
  if (crossed !== undefined) { bo.s = crossed; bo.moving = false; bo.at = now; bo.pauseUntil = now + BO.pauseMs; broadcast(boMsg()); boLast = crossed; return; }
  boLast = sNow;
}, 100);
setInterval(() => broadcast(boMsg()), 10000); // a regular reminder keeps everyone exactly in step
const ROOF_COLORS = ['#f4a6a6', '#a6c8f4', '#b8e2a8', '#f7d38a', '#d4b4f0', '#a8e0d8', '#f6b8d6', '#f5c49c'];
function firstFreePlot() {
  const taken = new Set(Object.values(accounts.users).map((u) => u.plot).filter(Boolean));
  for (let n = 1; n <= PLOT_COUNT; n++) if (!taken.has(n)) return n;
  return null;
}
// each claimed plot's garden: 6 squares kept on the owner's account, each { s, p, w }:
// s = 0 empty soil, 1 sprout, 2 grown crop; p = when it was planted; w = when it was last watered (ms timestamps).
// Growth is worked out from the timestamps, so it carries on offline and across restarts. Gardens saved before
// watering (plain numbers 0/1/2) load as squares that were never watered; accounts without one start empty.
const GARDEN_CELLS = 6;
const emptyCell = () => ({ s: 0, p: 0, w: 0 });
function gardenOf(acc) {
  if (!Array.isArray(acc.garden) || acc.garden.length !== GARDEN_CELLS) acc.garden = Array.from({ length: GARDEN_CELLS }, emptyCell);
  acc.garden = acc.garden.map((c) => (typeof c === 'number' ? { s: [0, 1, 2].includes(c) ? c : 0, p: 0, w: 0 } : { s: c.s | 0, p: +c.p || 0, w: +c.w || 0 }));
  return acc.garden;
}
// a watered sprout becomes a crop GARDEN_GROW_MS after watering; settled here whenever a square is looked at
function settleCell(c, now = Date.now()) {
  if (c.s === 1 && c.w && now - c.w >= GARDEN_GROW_MS) c.s = 2;
  return c;
}
const isWet = (c, now = Date.now()) => !!c.w && now - c.w < GARDEN_WET_MS;
// the shared island garden: anyone may water its 15 plants (3 beds x 5); it only remembers when each was watered
const ISLAND_SPOTS = 15;
// when each island plant was last harvested: it's bare until GARDEN_GROW_MS later, then grown again
let islandHarvested = Array.isArray(savedState.islandHarvested) && savedState.islandHarvested.length === ISLAND_SPOTS ? savedState.islandHarvested.map((v) => +v || 0) : new Array(ISLAND_SPOTS).fill(0);
const islandGrown = (idx, now = Date.now()) => now - islandHarvested[idx] >= GARDEN_GROW_MS;
let islandWatered = Array.isArray(savedState.islandWatered) && savedState.islandWatered.length === ISLAND_SPOTS ? savedState.islandWatered.map((v) => +v || 0) : new Array(ISLAND_SPOTS).fill(0);
const gardenList = () => Object.values(accounts.users).filter((u) => u.plot).map((u) => ({ plot: u.plot, cells: gardenOf(u) }));
const houseList = () => Object.values(accounts.users).filter((u) => u.plot).map((u) => ({ plot: u.plot, name: u.name, roof: u.roof }));
function sendStats(ws, p) { send(ws, { t: 'stats', pocket: p.pocket, energy: p.energy, coins: p.coins }); }
// the sky follows real Malaysia time; clients derive it from this timestamp so everyone matches
const clock = () => ({ now: Date.now() });

const COLORS = ['#f2877a', '#7ab8f2', '#8fd17a', '#f2c46a', '#c79af2', '#6ad6c8', '#f29ac8', '#f2a65a', '#9aa8f2', '#b8e06a'];
const players = new Map(); // ws -> { id, key, name, color, x, z, h, m, pocket, energy, tool } for logged-in players only
let nextId = 1;

// ---------------------------------------------------------------- accounts (accounts.json next to server.js)
// Passwords are stored only as scrypt(password, random salt); session tokens only as sha256(token).
const ACCOUNTS_FILE = path.join(ROOT, 'accounts.json');
let accounts = { users: {}, sessions: {} }; // users: lowercase name -> account; sessions: sha256(token) -> lowercase name
try {
  const saved = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, 'utf8'));
  if (saved && saved.users && saved.sessions) accounts = saved;
} catch { /* no accounts yet */ }
let accountsDirty = false;
function writeAccounts() {
  if (!accountsDirty) return;
  accountsDirty = false;
  const tmp = ACCOUNTS_FILE + '.tmp';
  try { fs.writeFileSync(tmp, JSON.stringify(accounts)); fs.renameSync(tmp, ACCOUNTS_FILE); } catch (e) { console.error('Could not save accounts:', e.message); accountsDirty = true; }
}
setInterval(() => { for (const p of players.values()) storeProgress(p); writeAccounts(); }, 30000); // autosave

const TOOLS = new Set(['axe', 'can', 'rod', 'net']);
const POCKET_KINDS = ['shell', 'star', 'coconut', 'mango', 'pineapple', 'smallfish', 'bigfish', 'carrot', 'tomato', 'cabbage', 'flower', 'butterfly', 'beetle', 'dragonfly', 'scarab', 'lizard', 'crab', 'conch', 'clownfish', 'puffer'];
const NAME_RE = /^[A-Za-z0-9 _.-]{3,16}$/;
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const scrypt = (password, salt) => new Promise((resolve, reject) => crypto.scrypt(password, salt, 64, (err, key) => (err ? reject(err) : resolve(key))));
function newSession(key) {
  const token = crypto.randomBytes(32).toString('hex');
  accounts.sessions[sha256(token)] = key;
  accountsDirty = true;
  return token;
}
function cleanPocket(raw) {
  const out = {};
  for (const k of POCKET_KINDS) { const n = raw ? Number(raw[k]) : 0; out[k] = Number.isInteger(n) && n > 0 ? Math.min(n, 99999) : 0; }
  const old = raw ? Number(raw.fish) : 0; // backpacks from before big fish: the generic "fish" were small fish
  if (Number.isInteger(old) && old > 0) out.smallfish = Math.min(out.smallfish + old, 99999);
  return out;
}
// copies a live player's state into their account; the autosave and disconnect write it to disk
function storeProgress(p) {
  const acc = accounts.users[p.key];
  if (!acc) return;
  acc.progress = { world: WORLD_VERSION, x: p.x, z: p.z, h: p.h, pocket: p.pocket, energy: p.energy, tool: p.tool, room: p.room || null, lastPlayed: Date.now() };
  acc.coins = p.coins;
  accountsDirty = true;
}

const wss = new WebSocketServer({ server });
function send(ws, msg) { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); }
function broadcast(msg, except) { const s = JSON.stringify(msg); for (const ws of players.keys()) if (ws !== except && ws.readyState === 1) ws.send(s); }
const pub = (p) => ({ id: p.id, name: p.name, color: p.color, x: p.x, z: p.z, y: p.y ?? null, h: p.h, m: p.m, room: p.room || null });

// ---------------------------------------------------------------- house rooms
// p.room is the plot number of the house a player is inside (null on the island). A room takes 8 at most.
// Each owner's furniture layout is saved on their account (roomLayout) and shown even when they're offline.
const ROOM_MAX_PLAYERS = 8, ROOM_ITEM_LIMIT = 60;
const ROOM_HALF = 3;
const TAU = Math.PI * 2;
const FLOOR_ITEMS = new Set(['bed', 'table', 'chair', 'sofa', 'bookshelf', 'rug', 'plant', 'lamp']);
const WALL_ITEMS = new Set(['window', 'picture']);
const ownerOfPlot = (plot) => Object.entries(accounts.users).find(([, u]) => u.plot === plot) || null;
const roomCount = (plot) => [...players.values()].filter((o) => o.room === plot).length;
const num = (v, lim) => (Number.isFinite(v) && Math.abs(v) <= lim ? Math.round(v * 100) / 100 : null);
// keeps only well-formed furniture entries, at most ROOM_ITEM_LIMIT of them
function cleanLayout(raw) {
  const out = [];
  for (const it of Array.isArray(raw) ? raw : []) {
    if (out.length >= ROOM_ITEM_LIMIT || !it || typeof it !== 'object') break;
    if (FLOOR_ITEMS.has(it.k)) {
      // any position and any angle (a, radians); layouts from before free placement had r in quarter turns
      const x = num(it.x, ROOM_HALF), z = num(it.z, ROOM_HALF);
      const a = Number.isFinite(it.a) ? it.a : [0, 1, 2, 3].includes(it.r) ? (it.r * Math.PI) / 2 : null;
      if (x !== null && z !== null && a !== null) out.push({ k: it.k, x, z, a: Math.round((((a % TAU) + TAU) % TAU) * 1000) / 1000 });
    } else if (WALL_ITEMS.has(it.k)) {
      const o = num(it.o, ROOM_HALF);
      if (o !== null && [0, 1, 2, 3].includes(it.w)) out.push({ k: it.k, w: it.w, o });
    }
  }
  return out;
}
function sendToRoom(plot, msg, except) {
  const str = JSON.stringify(msg);
  for (const [ws, o] of players) if (o.room === plot && ws !== except && ws.readyState === 1) ws.send(str);
}
function leaveRoom(ws, p) { // back onto the island
  if (!p.room) return;
  const plot = p.room;
  p.room = null;
  send(ws, { t: 'exited', plot });
  broadcast({ t: 'room', id: p.id, room: null }, ws);
}

wss.on('connection', (ws) => {
  let p = null; // set once logged in; until then only login / register / resume are accepted
  let busy = false;

  async function authenticate(msg) {
    if (msg.t === 'resume') {
      const key = typeof msg.token === 'string' ? accounts.sessions[sha256(msg.token)] : null;
      if (!key || !accounts.users[key]) { send(ws, { t: 'authError', msg: 'Your session has expired, please log in again.', expired: true }); return; }
      enter(key, msg.token);
      return;
    }
    const name = typeof msg.name === 'string' ? msg.name.trim() : '';
    const password = typeof msg.password === 'string' ? msg.password : '';
    if (!name || !password) { send(ws, { t: 'authError', msg: 'Please enter both a name and a password.' }); return; }
    if (!NAME_RE.test(name)) { send(ws, { t: 'authError', msg: 'Names are 3 to 16 characters: letters, numbers, spaces, _ . -' }); return; }
    if (password.length > 200) { send(ws, { t: 'authError', msg: 'That password is too long.' }); return; }
    const key = name.toLowerCase();
    if (msg.t === 'register') {
      if (password.length < 4) { send(ws, { t: 'authError', msg: 'Please use a password of at least 4 characters.' }); return; }
      if (accounts.users[key]) { send(ws, { t: 'authError', msg: 'That name is already taken. Try another one, or log in.' }); return; }
      const salt = crypto.randomBytes(16).toString('hex');
      const hash = (await scrypt(password, salt)).toString('hex');
      if (accounts.users[key]) { send(ws, { t: 'authError', msg: 'That name is already taken. Try another one, or log in.' }); return; }
      accounts.users[key] = { name, salt, hash, color: COLORS[Math.floor(Math.random() * COLORS.length)], created: Date.now(), progress: null, roomLayout: [] };
      const token = newSession(key);
      writeAccounts();
      enter(key, token);
    } else {
      const acc = accounts.users[key];
      // hash even for unknown names so both failures look the same
      const hash = await scrypt(password, acc ? acc.salt : 'no-such-account');
      if (!acc || !crypto.timingSafeEqual(hash, Buffer.from(acc.hash, 'hex'))) { send(ws, { t: 'authError', msg: 'Wrong name or password.' }); return; }
      const token = newSession(key);
      writeAccounts();
      enter(key, token);
    }
  }

  function enter(key, token) {
    if (ws.readyState !== 1) return;
    const acc = accounts.users[key];
    // the same account open in another window gets signed out there (its progress is saved first)
    for (const [other, op] of players) {
      if (op.key !== key) continue;
      storeProgress(op);
      if ([...seats.values()].includes(op.id)) { setSeat(op, null); broadcast(seatsMsg()); }
      players.delete(other); // leaves right away so the old window can't overwrite the new session's progress
      broadcast({ t: 'leave', id: op.id });
      send(other, { t: 'kicked', msg: 'You logged in from another window.' });
      other.close();
    }
    const prog = acc.progress || {};
    const samePlace = prog.world === WORLD_VERSION; // a position saved on an older island means nothing here
    // home plot: given once, the first time this account enters (new accounts, and older ones from before plots)
    let newHouse = false;
    if (acc.plot === undefined) {
      acc.plot = firstFreePlot();
      if (acc.plot) { acc.roof = ROOF_COLORS[Math.floor(Math.random() * ROOF_COLORS.length)]; newHouse = true; }
      accountsDirty = true; writeAccounts();
    }
    p = {
      id: nextId++, key, name: acc.name, color: acc.color,
      x: samePlace && Number.isFinite(prog.x) ? prog.x : null, z: samePlace && Number.isFinite(prog.z) ? prog.z : null, h: Number.isFinite(prog.h) ? prog.h : 0, m: 0,
      pocket: cleanPocket(prog.pocket), energy: Number.isFinite(prog.energy) ? Math.max(0, Math.min(100, prog.energy)) : 100,
      tool: TOOLS.has(prog.tool) ? prog.tool : null, announced: false, room: null,
      coins: Number.isInteger(acc.coins) && acc.coins >= 0 ? acc.coins : START_COINS, // kept on the account, outside progress
    };
    if (acc.coins !== p.coins) { acc.coins = p.coins; accountsDirty = true; }
    players.set(ws, p);
    send(ws, { t: 'auth', token, name: p.name, lastPlayed: prog.lastPlayed || null, plot: acc.plot || null, newHouse,
      progress: { x: p.x, z: p.z, h: p.h, pocket: p.pocket, energy: p.energy, coins: p.coins, tool: p.tool, outsideRoom: samePlace && Number.isInteger(prog.room) ? prog.room : null } });
    send(ws, {
      t: 'welcome', proto: PROTOCOL, id: p.id, name: p.name, color: p.color, clock: clock(),
      players: [...players.values()].filter((o) => o !== p && o.announced).map(pub),
      items: [...items.entries()].map(([id, s]) => [id, s.gen, isActive(s)]),
      trees: [...trees.entries()],
      bugs: [...bugs.entries()].map(([id, b]) => [id, b.gen, b.spawnAt]),
      houses: houseList(),
      gardens: gardenList(),
      islandWatered, islandHarvested,
      garden: { growMs: GARDEN_GROW_MS, wetMs: GARDEN_WET_MS },
      seats: [...seats.entries()], swing, rides: ridesMsg(), bikes: [...bikes.values()].map(bikePub), balloon: balloonMsg(), banana: bananaMsg(), volley: volleyMsg(), dolphinSeed: DOLPHIN_SEED,
      bo: boMsg(), sellPrices: SELL_PRICES,
    });
    if (newHouse) broadcast({ t: 'house', plot: acc.plot, name: acc.name, roof: acc.roof }, ws);
    broadcast({ t: 'count', n: players.size });
  }

  ws.on('message', async (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (!msg || typeof msg !== 'object') return;
    if (!p) {
      if (busy || !['login', 'register', 'resume'].includes(msg.t)) return;
      busy = true;
      try { await authenticate(msg); } catch { send(ws, { t: 'authError', msg: 'Something went wrong, please try again.' }); } finally { busy = false; }
      return;
    }
    if (msg.t === 'logout') {
      if (typeof msg.token === 'string') delete accounts.sessions[sha256(msg.token)];
      accountsDirty = true;
      ws.close(); // the close handler saves progress
    } else if (msg.t === 'enter') {
      // every outcome gets an answer, so the client can always tell the player what happened
      const plot = msg.plot;
      if (!Number.isInteger(plot) || plot < 1 || plot > PLOT_COUNT) return send(ws, { t: 'roomError', msg: "That house doesn't exist" });
      if (p.room && p.room !== plot) { const was = p.room; p.room = null; broadcast({ t: 'room', id: p.id, room: null }, ws); send(ws, { t: 'exited', plot: was, quiet: true }); }
      const owner = ownerOfPlot(plot);
      if (!owner) return send(ws, { t: 'roomError', msg: 'Nobody lives there yet' });
      // already counted as inside (the client lost track, e.g. after a failed switch): just let them back in
      if (p.room !== plot && roomCount(plot) >= ROOM_MAX_PLAYERS) return send(ws, { t: 'roomFull', plot });
      if ([...seats.values()].includes(p.id)) { setSeat(p, null); broadcast(seatsMsg()); }
      p.room = plot;
      const [ownerKey, acc] = owner;
      send(ws, { t: 'entered', plot, owner: acc.name, own: ownerKey === p.key, layout: acc.roomLayout || [] });
      broadcast({ t: 'room', id: p.id, room: plot }, ws);
    } else if (msg.t === 'exit') {
      leaveRoom(ws, p);
    } else if (msg.t === 'roomLayout') {
      // only the owner, standing in their own room, may change it
      if (!p.room) return;
      const owner = ownerOfPlot(p.room);
      if (!owner || owner[0] !== p.key) return;
      owner[1].roomLayout = cleanLayout(msg.layout);
      accountsDirty = true;
      sendToRoom(p.room, { t: 'roomLayout', plot: p.room, layout: owner[1].roomLayout }, ws);
    } else if (msg.t === 'harvest') {
      // a grown crop into the backpack, the square back to empty soil: plot squares only by their owner (who must be
      // at the plot), island plants by anyone. The crop kind comes from the square, never from the client.
      const idx = msg.idx, now = Date.now();
      const reply = (ok, kind, why) => { send(ws, { t: 'harvestResult', ok, kind, where: msg.where, plot: msg.plot, idx, msg: why }); sendStats(ws, p); };
      if (p.room) return reply(false, null, "You're indoors");
      if (msg.where === 'island') {
        if (!Number.isInteger(idx) || idx < 0 || idx >= ISLAND_SPOTS) return;
        if (!islandGrown(idx, now)) return reply(false, null, 'Nothing to pick yet');
        islandHarvested[idx] = now;
        const kind = ISLAND_CROPS[Math.floor(idx / 5)];
        p.pocket[kind]++; save();
        broadcast({ t: 'islandGarden', islandWatered, islandHarvested });
        return reply(true, kind, '');
      }
      const acc = accounts.users[p.key];
      if (!acc || !acc.plot || msg.plot !== acc.plot || !Number.isInteger(idx) || idx < 0 || idx >= GARDEN_CELLS) return reply(false, null, "That isn't your garden");
      if (!nearPlot(p, acc.plot)) return reply(false, null, 'Get a little closer');
      const cells = gardenOf(acc), c = settleCell(cells[idx], now);
      if (c.s !== 2) return reply(false, null, "It isn't ready yet");
      const kind = GARDEN_CROPS[idx % 3];
      cells[idx] = emptyCell();
      p.pocket[kind]++;
      storeProgress(p); accountsDirty = true; writeAccounts();
      broadcast({ t: 'garden', plot: acc.plot, cells });
      reply(true, kind, '');
    } else if (msg.t === 'garden') {
      // planting: only the plot's owner, only on empty soil (free for now)
      const acc = accounts.users[p.key], idx = msg.idx;
      if (!acc || !acc.plot || msg.plot !== acc.plot || !Number.isInteger(idx) || idx < 0 || idx >= GARDEN_CELLS) return;
      const cells = gardenOf(acc), c = settleCell(cells[idx]);
      if (msg.state !== 1 || c.s !== 0) return;
      cells[idx] = { s: 1, p: Date.now(), w: 0 };
      accountsDirty = true;
      broadcast({ t: 'garden', plot: acc.plot, cells });
    } else if (msg.t === 'waterGarden') {
      // anyone may water any plot garden or the island garden: 3 energy from whoever waters, at most once a second,
      // standing near it, and only a sprout that isn't wet yet; all checked here so it can't be faked
      const reply = (ok, text) => { send(ws, { t: 'waterResult', ok, msg: text }); sendStats(ws, p); };
      const idx = msg.idx, now = Date.now();
      if (p.room) return reply(false, "You're indoors");
      if (now - (p.lastWaterAt || 0) < WATER_EVERY_MS) return reply(false, 'One at a time!');
      if (msg.where === 'island') {
        if (!Number.isInteger(idx) || idx < 0 || idx >= ISLAND_SPOTS) return;
        if (now - islandWatered[idx] < GARDEN_WET_MS) return reply(false, 'Already watered');
        if (!spend(p, COST.water)) return reply(false, 'Too tired, eat something');
        p.lastWaterAt = now;
        islandWatered[idx] = now; save();
        broadcast({ t: 'islandGarden', islandWatered, islandHarvested });
        broadcast({ t: 'watered', where: 'island', idx, by: p.id, byName: p.name });
        return reply(true, '');
      }
      if (!Number.isInteger(msg.plot) || !Number.isInteger(idx) || idx < 0 || idx >= GARDEN_CELLS) return;
      const owner = ownerOfPlot(msg.plot);
      if (!owner) return reply(false, 'Plant something first'); // an unclaimed plot only has bare soil
      if (!nearPlot(p, msg.plot)) return reply(false, 'Get a little closer');
      const cells = gardenOf(owner[1]), c = settleCell(cells[idx], now);
      if (c.s === 0) return reply(false, 'Plant something first');
      if (isWet(c, now)) return reply(false, 'Already watered');
      if (c.s === 2) return reply(false, "It's fully grown");
      if (!spend(p, COST.water)) return reply(false, 'Too tired, eat something');
      p.lastWaterAt = now;
      c.w = now;
      accountsDirty = true;
      broadcast({ t: 'garden', plot: msg.plot, cells });
      broadcast({ t: 'watered', where: 'plot', plot: msg.plot, idx, by: p.id, byName: p.name, owner: owner[1].name });
      reply(true, '');
    } else if (msg.t === 'ride') {
      if ([...seats.values()].includes(p.id)) { setSeat(p, null); broadcast(seatsMsg()); }
      const why = boardRide(p, msg.ride, msg.seat);
      send(ws, { t: 'rideResult', ok: !why, msg: why });
      broadcast(ridesMsg());
    } else if (msg.t === 'bikeBorrow') { // from Rex: a free bicycle in the colour you picked, right beside you
      const have = bikes.get(p.id);
      if (have) return send(ws, { t: 'bikeResult', ok: false, why: 'have', x: have.x, z: have.z });
      if (!nearRental(p, 7)) return send(ws, { t: 'bikeResult', ok: false, why: 'far' });
      const b = { id: p.id, owner: p.id, name: p.name, color: BIKE.colors.includes(msg.color) ? msg.color : BIKE.colors[0], x: p.x + 1.1, z: p.z + 0.4, h: 0, riding: false, at: Date.now(), lastRide: Date.now() };
      bikes.set(p.id, b);
      send(ws, { t: 'bikeResult', ok: true, why: 'borrowed' });
      broadcast({ t: 'bike', bike: bikePub(b) });
    } else if (msg.t === 'bikeReturn') { // back to Rex (from wherever it's parked): it rolls home to the stand
      const b = bikes.get(p.id);
      if (!b) return send(ws, { t: 'bikeResult', ok: false, why: 'none' });
      if (b.riding) return send(ws, { t: 'bikeResult', ok: false, why: 'riding' });
      if (!nearRental(p, 7)) return send(ws, { t: 'bikeResult', ok: false, why: 'far' });
      dropBike(p, 'return');
      send(ws, { t: 'bikeResult', ok: true, why: 'returned' });
    } else if (msg.t === 'bikeMount') { // only your own bicycle, only when you're standing by it
      const b = bikes.get(p.id);
      if (!b || b.riding || p.room || balloonSpot(p.id) >= 0 || volley.sideOf(p.id) >= 0 || !Number.isFinite(p.x) || Math.hypot(p.x - b.x, p.z - b.z) > 3.5) return send(ws, { t: 'bikeResult', ok: false, why: 'mount' });
      if ([...seats.values()].includes(p.id)) { setSeat(p, null); broadcast(seatsMsg()); }
      if (leaveRides(p)) broadcast(ridesMsg());
      b.riding = true; b.at = Date.now();
      broadcast({ t: 'bike', bike: bikePub(b) });
    } else if (msg.t === 'bikeMove') { // where the rider got to: no faster than the top speed, inside the world
      const b = bikes.get(p.id), x = Number(msg.x), z = Number(msg.z), h = Number(msg.h), now = Date.now();
      if (!b || !b.riding || !Number.isFinite(x) || !Number.isFinite(z)) return;
      const dt = Math.min(2, (now - b.at) / 1000), d = Math.hypot(x - b.x, z - b.z);
      if (d > BIKE.maxSpeed * dt + 0.6 || Math.abs(x) > 150 || Math.abs(z) > 90) { b.at = now; return send(ws, { t: 'bikeFix', x: b.x, z: b.z, h: b.h }); }
      b.x = x; b.z = z; b.h = Number.isFinite(h) ? h : b.h; b.at = now; b.lastRide = now;
      p.x = x; p.z = z; // the rider is where the bicycle is
      broadcast({ t: 'bikeMove', id: b.id, x, z, h: b.h }, ws);
    } else if (msg.t === 'bikeDismount') {
      const b = bikes.get(p.id);
      if (!b || !b.riding) return;
      b.riding = false; b.lastRide = Date.now();
      broadcast({ t: 'bike', bike: bikePub(b) });
    } else if (msg.t === 'bananaBoard') { // a free seat on a waiting banana boat, from the jetty
      const bi = msg.boat, si = msg.seat, b = bananas[bi], bk = bikes.get(p.id);
      if (!Number.isInteger(bi) || !b || !Number.isInteger(si) || si < 0 || si > 5 || bananaSeatOf(p.id) || volley.sideOf(p.id) >= 0) return;
      const why = b.s !== 'wait' ? 'away' : b.riders[si] !== null ? 'taken' : !nearJetty(p) ? 'far' : balloonSpot(p.id) >= 0 ? 'balloon' : bk && bk.riding ? 'bike' : null;
      if (why) return send(ws, { t: 'bananaResult', ok: false, why });
      if ([...seats.values()].includes(p.id)) { setSeat(p, null); broadcast(seatsMsg()); }
      if (leaveRides(p)) broadcast(ridesMsg());
      b.riders[si] = p.id; if (!b.first) b.first = Date.now();
      broadcast(bananaMsg());
    } else if (msg.t === 'bananaStart') { // anyone aboard a waiting boat can start it right away
      const at = bananaSeatOf(p.id), b = at && bananas[at.boat];
      if (!b || b.s !== 'wait') return;
      b.s = 'ride'; b.at = Date.now(); broadcast(bananaMsg());
    } else if (msg.t === 'bananaOff') { // at the jetty: step off; out on the water: the boat brings everyone back
      const at = bananaSeatOf(p.id), b = at && bananas[at.boat];
      if (!b) return;
      if (b.s === 'wait') { b.riders[at.seat] = null; if (!b.riders.some((r) => r !== null)) b.first = 0; }
      else if (b.s === 'ride') bananaReturn(b, Date.now());
      broadcast(bananaMsg());
    } else if (msg.t === 'balloonBoard') { // step into the basket: only while it's tied on the pad, with a spot free
      if (balloonSpot(p.id) >= 0) return;
      const b = bikes.get(p.id), near = Number.isFinite(p.x) && !p.room && Math.hypot(p.x - BALLOON.pad.x, p.z - BALLOON.pad.z) <= BALLOON.reach;
      const free = balloon.riders.indexOf(null);
      const why = balloon.s !== 'tied' ? 'flying' : free < 0 ? 'full' : !near ? 'far' : b && b.riding ? 'bike' : bananaSeatOf(p.id) ? 'banana' : volley.sideOf(p.id) >= 0 ? 'volley' : null;
      if (why) return send(ws, { t: 'balloonResult', ok: false, why });
      if ([...seats.values()].includes(p.id)) { setSeat(p, null); broadcast(seatsMsg()); }
      if (leaveRides(p)) broadcast(ridesMsg());
      balloon.riders[free] = p.id;
      broadcast(balloonMsg());
    } else if (msg.t === 'balloonUp') { // anyone aboard can start the climb (not while someone is waiting to get off)
      if (balloonSpot(p.id) < 0 || !(balloon.s === 'tied' || (balloon.s === 'descending' && !balloon.off.size))) return;
      balloonSet('rising'); broadcast(balloonMsg());
    } else if (msg.t === 'balloonDown') {
      if (balloonSpot(p.id) < 0 || !(balloon.s === 'rising' || balloon.s === 'up')) return;
      balloonSet('descending'); broadcast(balloonMsg());
    } else if (msg.t === 'balloonOff') { // on the pad: step straight out; in the air: get out once it has landed
      if (balloonSpot(p.id) < 0) return;
      if (balloon.s === 'tied') balloonLeave(p.id);
      else balloon.off.add(p.id);
      broadcast(balloonMsg());
    } else if (msg.t === 'rideOff') {
      // the merry-go-round lets you off any time; the Ferris wheel only at the end of its turn
      for (const [k, o] of rideOcc.carousel) if (o.id === p.id) rideOcc.carousel.delete(k);
      broadcast(ridesMsg());
    } else if (msg.t === 'volleyJoin') { // a free side of the court, from the sand beside it
      const bk = bikes.get(p.id);
      const why = !nearCourt(p) ? 'far' : [...seats.values()].includes(p.id) ? 'seat' : bk && bk.riding ? 'bike' : balloonSpot(p.id) >= 0 ? 'balloon' : bananaSeatOf(p.id) ? 'banana' : volley.join(p.id, msg.side, p.name);
      if (why) send(ws, { t: 'volleyResult', why });
    } else if (msg.t === 'volleyPractice') { if (volley.practice(p.id)) send(ws, { t: 'volleyResult', why: 'practice' });
    } else if (msg.t === 'volleyAgain') { if (volley.again(p.id)) send(ws, { t: 'volleyResult', why: 'again' });
    } else if (msg.t === 'volleyLeave') { volley.leave(p.id);
    } else if (msg.t === 'volleyHit') {
      const why = volley.hit(p.id, Number(msg.at), Number(msg.tx), Number(msg.tz));
      if (why) send(ws, { t: 'volleyResult', why });
    } else if (msg.t === 'sit') {
      if (volley.sideOf(p.id) >= 0) return; // playing volleyball
      if (p.room) return; // the island's benches, not from inside a house
      if (leaveRides(p)) broadcast(ridesMsg());
      const seat = msg.seat;
      if (!Number.isInteger(seat) || seat < 0 || seat >= SEAT_COUNT) return;
      if (seats.has(seat) && seats.get(seat) !== p.id) return send(ws, seatsMsg()); // taken: tell them how things stand
      setSeat(p, seat);
      broadcast(seatsMsg());
    } else if (msg.t === 'stand') {
      if (![...seats.values()].includes(p.id)) return;
      setSeat(p, null);
      broadcast(seatsMsg());
    } else if (msg.t === 'boOpen') { // the sell panel: Bo stops and waits while it's open
      const ok = nearBo(p, BO.reach + 0.5);
      if (ok) { bo.holds.set(p.id, Date.now()); if (bo.moving) boSet(false, Date.now()); }
      send(ws, { t: 'boOpened', ok, msg: ok ? '' : 'Get a little closer to Bo' });
    } else if (msg.t === 'boPing') {
      if (bo.holds.has(p.id)) bo.holds.set(p.id, Date.now());
    } else if (msg.t === 'boClose') {
      bo.holds.delete(p.id);
    } else if (msg.t === 'sell') {
      // all or nothing: every count must be a whole number the player really has, of a kind Bo buys, and the price
      // comes from SELL_PRICES here, never from the client. Backpack and coins change together in one step.
      const want = msg.items && typeof msg.items === 'object' ? msg.items : {};
      let why = '', total = 0, count = 0;
      const sale = [];
      if (!nearBo(p, BO.sellReach)) why = 'Bo is too far away';
      else for (const [kind, n] of Object.entries(want)) {
        if (n === 0) continue;
        if (!Object.hasOwn(SELL_PRICES, kind) || !Object.hasOwn(p.pocket, kind)) { why = "Bo doesn't buy that"; break; }
        if (!Number.isInteger(n) || n < 0 || n > p.pocket[kind]) { why = "You don't have that many"; break; }
        sale.push([kind, n]); total += SELL_PRICES[kind] * n; count += n;
      }
      if (!why && !count) why = 'Pick something to sell';
      if (!why) {
        for (const [kind, n] of sale) p.pocket[kind] -= n;
        p.coins += total;
        if (bo.holds.has(p.id)) bo.holds.set(p.id, Date.now());
        storeProgress(p); writeAccounts(); // coins and backpack are saved right away
      }
      send(ws, { t: 'sellResult', ok: !why, gained: why ? 0 : total, count: why ? 0 : count, msg: why });
      sendStats(ws, p);
    } else if (msg.t === 'progress') {
      // only the selected tool comes from the client; backpack and energy are tracked here (see below)
      p.tool = TOOLS.has(msg.tool) ? msg.tool : null;
    } else if (msg.t === 'swing') { // a bug net swing; a catch must follow a paid swing
      if (!spend(p, COST.net)) return sendStats(ws, p);
      p.netSwingAt = Date.now();
      sendStats(ws, p);
    } else if (msg.t === 'water') {
      spend(p, COST.water);
      sendStats(ws, p);
    } else if (msg.t === 'cast') {
      p.cast = spend(p, COST.cast) ? { at: Date.now() } : null;
      sendStats(ws, p);
    } else if (msg.t === 'fish') {
      // a bite comes 3-8 s after landing and lasts ~1 s, so a real catch arrives 3.5-10 s (+ slack) after the cast
      const c = p.cast; p.cast = null;
      const age = c ? Date.now() - c.at : -1;
      let kind = null;
      if (age >= 3000 && age <= 13000) {
        let r = Math.random();
        const table = atBeach(p) && !p.room ? BEACH_CATCH_TABLE : CATCH_TABLE;
        kind = table[table.length - 1][0];
        for (const [k, chance] of table) { if (r < chance) { kind = k; break; } r -= chance; }
        p.pocket[kind]++;
      }
      send(ws, { t: 'fishResult', kind });
      sendStats(ws, p);
    } else if (msg.t === 'eat') {
      const kind = msg.kind;
      let ok = false, why = '', gained = 0;
      if (!Object.hasOwn(FOOD_ENERGY, kind)) why = "You can't eat that.";
      else if (!(p.pocket[kind] > 0)) why = "You don't have any left.";
      else if (p.energy >= ENERGY_MAX) why = 'Energy is full';
      else { p.pocket[kind]--; gained = Math.min(FOOD_ENERGY[kind], ENERGY_MAX - p.energy); p.energy += gained; ok = true; }
      send(ws, { t: 'eatResult', ok, kind, gained, msg: why });
      sendStats(ws, p);
    } else if (msg.t === 'move') {
      const x = Number(msg.x), z = Number(msg.z), h = Number(msg.h);
      if (!Number.isFinite(x) || !Number.isFinite(z) || Math.abs(x) > 150 || Math.abs(z) > 90) return;
      const first = !p.announced;
      p.announced = true;
      p.x = x; p.z = z; p.h = Number.isFinite(h) ? h : 0; p.m = msg.m ? 1 : 0;
      const y = Number(msg.y); p.y = Number.isFinite(y) && y > -1 && y < 12 ? y : null; // up on a beach cabin's balcony or bridge
      broadcast(first ? { t: 'join', p: pub(p) } : { t: 'move', id: p.id, x, z, h: p.h, m: p.m, y: p.y }, ws);
    } else if (msg.t === 'pick') {
      const id = Number(msg.item);
      if (!Number.isInteger(id) || id < 0 || id > 10000) return;
      const s = item(id);
      if (!isActive(s) || msg.gen !== s.gen) return;
      if (!pinKind(itemKinds, id, msg.kind, GROUND_KINDS)) return;
      s.gen++; s.announced = false; // the next spawn is a new generation (new spot)
      s.respawnAt = Date.now() + 20000 + Math.random() * 20000;
      broadcast({ t: 'picked', item: id, by: p.id });
      p.pocket[itemKinds.get(id)]++;
      sendStats(ws, p);
      save();
    } else if (msg.t === 'chop') {
      // first swing at a tree with fruit gets 1-3; everyone sees the shake (n = 0 when it's still regrowing)
      const id = msg.tree;
      if (!validId(id, 1000) || !pinKind(treeKinds, id, msg.kind, FOOD)) return;
      if (!spend(p, COST.axe)) return sendStats(ws, p); // every swing costs energy, fruit or not
      const now = Date.now();
      let n = 0;
      if (now >= (trees.get(id) || 0)) { n = 1 + Math.floor(Math.random() * 3); trees.set(id, now + TREE_REGROW_MS); save(); }
      broadcast({ t: 'chopped', tree: id, n, readyAt: trees.get(id) || 0, by: p.id });
      p.pocket[treeKinds.get(id)] += n;
      sendStats(ws, p);
    } else if (msg.t === 'catch') {
      const id = msg.bug;
      if (!validId(id, 1000)) return;
      if (!BUG_KINDS[id] || !(Date.now() - (p.netSwingAt || 0) < 2000)) return; // needs a paid swing just now
      p.netSwingAt = 0;
      const b = bug(id);
      if (Date.now() < b.spawnAt || msg.gen !== b.gen) return; // already caught by someone else
      b.gen++;
      b.spawnAt = Date.now() + 25000 + Math.random() * 20000;
      broadcast({ t: 'caught', bug: id, gen: b.gen, spawnAt: b.spawnAt, by: p.id });
      p.pocket[BUG_KINDS[id]]++;
      sendStats(ws, p);
      save();
    }
  });

  ws.on('close', () => {
    if (!p || players.get(ws) !== p) return; // never logged in, or already replaced by a newer login
    storeProgress(p); writeAccounts(); // save on disconnect
    players.delete(ws);
    bo.holds.delete(p.id);
    if ([...seats.values()].includes(p.id)) { setSeat(p, null); broadcast(seatsMsg()); }
    if (leaveRides(p)) broadcast(ridesMsg()); // a rider who disconnects frees the seat
    dropBike(p, 'fade'); // their bicycle fades away
    if (balloonLeave(p.id)) broadcast(balloonMsg()); // and their spot in the balloon is free
    volley.leave(p.id); // their side of the volleyball court is free (a match in play goes to the other player)
    { const at = bananaSeatOf(p.id); if (at) { bananas[at.boat].riders[at.seat] = null; if (bananas[at.boat].s === 'wait' && !bananas[at.boat].riders.some((r) => r !== null)) bananas[at.boat].first = 0; broadcast(bananaMsg()); } }
    broadcast({ t: 'leave', id: p.id });
    broadcast({ t: 'count', n: players.size });
  });
  ws.on('error', () => {});
});

// announce respawns that have come due (their state is already true by timestamp) + periodic clock sync
setInterval(() => {
  const now = Date.now();
  for (const [id, s] of items) {
    if (!s.announced && isActive(s, now)) { s.announced = true; broadcast({ t: 'spawn', item: id, gen: s.gen }); }
  }
}, 500);
setInterval(() => broadcast({ t: 'time', clock: clock() }), 15000);

server.listen(PORT, () => console.log(`Driftwood Isle is running (protocol ${PROTOCOL}): open http://localhost:${PORT}`));
