// Driftwood Isle: the island, laid out from the concept painting (day panel for layout; dusk and night panels for the
// lamps and lit windows). This file holds the trace below, the colour palette, the LAYOUT data that the game and the
// server both use (plaza, shops, home plots, roads, pier, Bo's walk), and builds the ground, water and scenery.
// No imports: main.js passes THREE and its math helpers in; server.js require()s it just for LAYOUT and Bo's route.
//
// NOTE: the island has since been enlarged 1.7x and the homes spread out over it (see LAYOUT below); the trace
// describes the painting itself, and the town is still placed exactly as traced.
// ==== TRACE OF THE DAY PANEL (image pixels px, py in a 550 x 940 panel -> island units)
// Mapping: x = (px - 285) * 0.08, z = (py - 430) * 0.125. The painting looks down at about 50 degrees, so its
// vertical distances are squeezed; 0.125 / 0.08 undoes that. -z is the top of the picture (north), +z the bottom.
// Scale check: a home yard in the painting is ~120 px wide -> 9.6 units, a house ~50 px -> 4 units, the plaza ~100 px
// across -> 8-10 units, matching the game's 7.2-unit yards, 3-unit houses and the character (1.6 tall).
//
// Silhouette: one broad rounded island, about 43 wide (x -22..21) and 62 long (z -36..26), leaning slightly: the
//   top right rises into a rocky headland (lighthouse), the left side is fairly straight with a pond tucked against
//   the coast, the bottom is a long gentle curve of beach. No deep bays.
// Coastline (clockwise from the headland, px -> units): (470,145) (14.8,-35.6) . (520,170) (18.8,-32.5) .
//   (540,210) (20.4,-27.5) . (545,260) (20.8,-21.3) . (540,330) (20.4,-12.5) . (550,400) (21.2,-3.8) .
//   (545,460) (20.8,3.8) . (530,520) (19.6,11.3) . (500,570) (17.2,17.5) . (470,600) (14.8,21.3) .
//   (420,625) (10.8,24.4) . (350,640) (5.2,26.3) . (250,640) (-2.8,26.3) . (180,640) (-8.4,26.3) .
//   (110,620) (-14,23.8) . (60,590) (-18,20) . (25,550) (-20.8,15) . (10,500) (-22,8.8) . (5,440) (-22.4,1.3) .
//   (15,380) (-21.6,-6.3) . (5,330) (-22.4,-12.5) . (10,300) (-22,-16.3) . (40,270) (-19.6,-20) .
//   (90,240) (-15.6,-23.8) . (150,215) (-10.8,-26.9) . (220,200) (-5.2,-28.8) . (290,190) (0.4,-30) .
//   (360,180) (6,-31.3) . (420,150) (10.8,-35).
// Beaches: pale sand all round; wide (3-4 units) along the bottom and lower left where the pier is, thin (1 unit)
//   on the left and top. Cliffs: low grey cliffs down the whole right side and around the headland, with big
//   rounded boulders stacked at their feet and spilling into the water. Shallows: a band of turquoise all round,
//   widest off the bottom beach; dark boulders poke out of it at the bottom left, near the pier and on the right.
//
// Buildings (13 in the painting, numbered here; footprint ~3-4 units unless noted; all face the viewer / +z unless noted):
//   Town, around the plaza at (300,365) -> (1.2,-8.1), plaza radius ~5, a round fountain in its middle:
//   T1 (215,350) -> (-5.6,-11.5) blue roof, cream walls, left of the plaza            -> SEED SHOP (Mira)
//   T2 (250,305) -> (-2.8,-15.6) orange roof, behind the plaza on the left           -> CLOTHES SHOP (Tess)
//   T3 (295,295) -> (0.8,-16.9) red-and-white striped awning, top middle             -> cafe (decor)
//   T4 (345,290) -> (4.8,-17.5) tall cream clock tower, pointed red-brown roof         -> clock tower (decor)
//   T5 (395,335) -> (8.8,-11.9) teal awning and roof, right of the plaza             -> FURNITURE SHOP (Oak)
//   T6 (425,345) -> (12.8,-11.5) red roof with an awning, far right of the plaza       -> PET SHOP (Pip)
//   T7 (490,385) -> (17.8,-4) small blue-roofed cottage alone on the right, by the cliff -> cottage (decor)
//   Homes, six square yards with round bush hedges, inside the loop road (two staggered rows of three):
//   H1 (150,405) -> (-10.8,-3.1) green roof               -> PLOT 1 (gate faces the left road)
//   H2 (270,445) -> (-1.2,1.9)  blue-violet roof, centre  -> PLOT 2 (gate faces up, to the plaza)
//   H3 (395,410) -> (8.8,-2.5)  blue roof                 -> PLOT 3 (gate faces the right road)
//   H4 (155,495) -> (-10.4,8.1) blue roof (red at dusk)   -> PLOT 4 (gate faces the left road)
//   H5 (280,535) -> (-0.4,13.1) yellow roof, bottom       -> PLOT 5 (gate faces the bottom road)
//   H6 (390,480) -> (8.4,6.3)   orange roof               -> PLOT 6 (gate faces the right road)
//   Plus the lighthouse L (485,150) -> (16,-32.5): red-and-white tower on the headland, lamp lit at dusk and night.
//   The painting has 6 home yards, the game needs 8: PLOT 7 at (-9.5,-20) on the open lawn behind the town (top
//   left, among the trees) and PLOT 8 at (10.5,-19) on the lawn beside the lighthouse road. Both are new.
// Roads and paths (light warm-grey stone):
//   R1 the loop road, a rounded rectangle around the six homes: x -16.5..14.5, z -8.3..18.7, corners ~3 units; its
//      top edge runs into the plaza (where it curves round the bottom of the fountain).
//   R2 short spurs from the loop to each yard's gate. R3 the pier walk from the bottom of the loop (1.2,18.7) down
//      to the pier. R4 the lighthouse road from the loop's top right corner up the right side to the headland.
//   R5 a short path from the loop's left side to the pond.
// Pier and boat: the pier leaves the bottom beach at (300,630) -> (1.2,25) and runs down-right to (370,720) ->
//   (6.8,36.3), about 12 long, wooden with posts; a small white sailboat is moored to its left at (220,700) ->
//   (-5.2,33.8).
// Water feature: a round pond at (70,325) -> (-17.2,-13.1), radius ~3.4, turquoise, with a tiny jetty on its left.
// Trees: big round broadleaf trees (2-3 balls of foliage, 2.5-4 units across) in three greens. Packed densely in the
//   band between the loop road and the coast (thickest at the top behind the town, along the left, and on the
//   headland), a few scattered between the homes, almost none on the beaches. A couple of palms on the bottom beach.
// Lamps (from the dusk/night panels): along the loop road roughly every 7 units, two at the plaza, along the pier
//   (both sides), on the lighthouse road; every house and shop window glows warm yellow at night.
// Colours: PALETTE below. Sky, light and fog moods: day = clear bright blue sky, white puffy clouds, crisp short
//   shadows, turquoise to royal blue sea; dusk = violet sky melting into orange at the horizon, low big sun, warm
//   peach light, pink-violet sea; night = deep navy with stars and a full moon, cool blue light, warm lamps and
//   windows, lit lighthouse. Light haze toward the horizon in all three.

export const PALETTE = {
  sand: 0xf3dca0, wetSand: 0xdcbd84,
  grass: 0x7cc34e, grassLight: 0xa8d95c, grassDark: 0x55a03c,
  treeLight: 0x7dc64a, treeMid: 0x4f9e3c, treeDark: 0x2f7a35,
  rock: 0x8e97a0, rockDark: 0x646e79, moss: 0x78b24e,
  shallow: 0x5fe3d8, sea: 0x22a6dc, deep: 0x1a5fbf,
  foam: 0xffffff, path: 0xd9cdb5, wall: 0xf4ecd8,
  dayTop: 0x4aa8f0, dayHorizon: 0xc2eafc, duskTop: 0x5f4a9e, duskHorizon: 0xff9a5c, nightTop: 0x091538, nightHorizon: 0x24438a,
  roofs: ['#5b8fd6', '#4fa36a', '#d9584a', '#f0a040', '#8a7bd0', '#5fb4b0', '#f2c656', '#e27aa0'],
};

// ==== LAYOUT (island units), used by main.js and server.js. Plot numbers are the saved accounts' plot numbers.
// face: the way the yard's gate looks (its local +z), as a world yaw: 0 = +z (down), PI = up, +-PI/2 = right/left.
const HALF_PI = Math.PI / 2;
// The island's land is the painting's island scaled up 1.7x about (0, -4) (about 3x the area); the town (plaza,
// shops, cafe, clock tower) keeps its traced size and place, and the 8 homes are spread out over the new land.
export const ISLAND_SCALE = 1.7;
const grow = ([x, z]) => [x * ISLAND_SCALE, (z + 4) * ISLAND_SCALE - 4];
const TOWN_CENTRE = { x: 2, z: -10 }; // the middle of the town (plaza, shops and their back row)
// homes: varied spots in a relaxed ring round the town (at least ~14 units apart, 18+ from the town's buildings),
// each yard turned so its gate looks back toward the town and the road that runs inside the ring
const HOME_SPOTS = [[-28, -24], [-27, -5], [-24, 15], [-6, 22], [13, 27], [28, 12], [-14, -42], [10, -44]];
const faceTown = ([x, z]) => Math.atan2(TOWN_CENTRE.x - x, TOWN_CENTRE.z - z);
const ROAD_IN = 6.4; // the road passes this far in front of each yard's centre (the gate front is at 4.8)
const toward = ([x, z], d) => { const dx = TOWN_CENTRE.x - x, dz = TOWN_CENTRE.z - z, l = Math.hypot(dx, dz); return [x + (dx / l) * d, z + (dz / l) * d]; };
export const LAYOUT = {
  plaza: { x: 1.2, z: -8.1, r: 6 }, // a wide paved ring round the fountain (ref/notes.md)
  shops: [
    // a half ring round the back of the plaza, 9.5 from the fountain at 50-degree steps, each facing it (ref/notes.md)
    { kind: 'clothes', x: -7.41, z: -12.11, roof: '#d9584a' }, // left, like the reference's restaurant
    { kind: 'seed', x: -1.26, z: -17.28, roof: '#4fa36a' }, // straight across the fountain, like its flower shop
    { kind: 'furniture', x: 6.65, z: -15.88, roof: '#5fb4b0' }, // back right
    { kind: 'pet', x: 10.66, z: -8.93, roof: '#8a7bd0' }, // right, like its arcade
  ],
  decor: [
    { kind: 'cafe', x: -7.5, z: -23.5 }, // T3, behind the town now
    { kind: 'tower', x: 11, z: -22.5 }, // T4, behind the town now
    { kind: 'cottage', x: 30.3, z: -4 }, // T7, by the right-hand cliffs
  ],
  plotHalf: 3.6,
  // plot numbers stay the accounts' plot numbers; plots 1-6 keep their old order round the island (left, then
  // bottom, then right), 7 and 8 sit at the top behind the town
  plots: HOME_SPOTS.map(([x, z], i) => ({ n: i + 1, x, z, face: faceTown([x, z]) })),
  // the ring road: a smooth loop through a point just in front of every gate (in the order round the town),
  // plus one on the open right side where the lighthouse road leaves it
  loop: { ctrl: [[28, 12], [13, 27], [-6, 22], [-24, 15], [-27, -5], [-28, -24], [-14, -42], [10, -44]].map((p) => toward(p, ROAD_IN))
    .flatMap((p, i) => (i === 7 ? [p, [27, -22]] : [p])), width: 1.9 },
  // stone paths from the plaza out to the ring (left, right, down) so every gate can reach the town
  townSpokes: [[[-4.8, -7.8], [-12, -7.2], [-20.5, -6.4]], [[5.9, -4.4], [14, -4.5], [24.5, -9.6]], [[1.2, -2.1], [1.8, 6], [3, 17.6]]],
  // the playground behind and to the right of the town (ref/notes.md): a Ferris wheel and, beside it, a merry-go-round.
  // periodMs: one full turn; the server and every client turn them from the shared clock
  rides: {
    ferris: { x: 19, z: -15.5, pad: 3.9, gondolas: 8, periodMs: 30000, radius: 4, hubY: 5.2 },
    carousel: { x: 19, z: -0.5, pad: 3.1, seats: 6, periodMs: 24000, seatR: 2.1 },
  },
  pier: { root: { x: 2.0, z: 37.4 }, dir: { x: 0.446, z: 0.895 }, len: 14 },
  pond: { x: -14, z: -22, r: 3.5 }, // on the lawn between the town and home 1
  lighthouse: { x: 27.2, z: -52.5 },
  lighthouseRoad: [[27, -22], [28.5, -32], [28.6, -42], [27.6, -48.5]],
  pondPath: [[-12, -7.4], [-13.2, -17.9]], // from the left town path down to the pond
  // the river: out of the pond's south-west side, winding south past the island garden and between homes 3 and 4 to
  // the sea at the bottom-left beach (kept 3+ units from the plaza, the yards, the houses and the rides)
  river: { pts: [[-16.5, -19.5], [-17, -12], [-16.5, -7], [-16, 0], [-15.6, 6], [-14.5, 13], [-15.5, 21], [-18.5, 30], [-20, 38], [-21.5, 48]], half: 1.2 },
  // ---- the island's two new regions: it grows outward on both sides as one landmass, a desert on the east and a
  // beach on the west (each a broad bulge of land overlapping the old coast), with lawn between them and the homes.
  // Each is reached by a road from the ring road; Bo still only walks round the homes.
  areas: {
    desert: { x: 50, z: -8, rx: 22, rz: 30 },
    beach: { x: -52, z: -6, rx: 22, rz: 32 },
  },
  roads: {
    desert: [[24.5, -9.6], [34, -9.6], [44, -9.4], [52, -10], [57, -12.6]], // ends at the oasis edge
    beach: [[-21.6, -14], [-32, -14], [-40, -11], [-46, -8]],
  },
  desert: {
    oasis: { x: 60, z: -19, r: 3.5 }, huts: [{ x: 54, z: 6, face: Math.PI }, { x: 64, z: 4, face: Math.PI }], hutPath: [[47, -9.5], [49, 0], [56, 2], [62, 0.5]],
    volcano: { x: 50, z: -31, r: 5.5, h: 6.5 }, // a little volcano that erupts cherry blossom petals
  },
  beach: {
    boardwalk: [[-46, -8], [-56, -4], [-64, -1], [-68, 0.5]],
    pier: { root: { x: -70, z: 1 }, dir: { x: -1, z: 0.12 }, len: 16 },
    hut: { x: -56, z: 7, face: 0 }, // a little beach hut with a striped awning (snacks and towels)
    tower: { x: -66, z: 9 }, // the lifeguard tower, looking out to sea
    // the seaside festival: booths along the boardwalk ([kind, distance along it from the road's end, side: 1 north,
    // -1 south]), string-light poles, lantern poles, benches and the stage ([s, side, distance out]); tall cabins on
    // stilts at the back of the beach (face: their front's direction; stairs: which side, if any) joined by bridges
    festival: {
      booths: [['swim', 3.5, 1], ['rings', 7.5, -1], ['lantern', 11.5, 1], ['snack', 15.5, -1], ['games', 19.5, 1]],
      poles: [1.5, 5.5, 9.5, 13.5, 17.5, 21.5],
      lanternPoles: [[3.5, -1, 2.4], [11.5, -1, 2.4], [19.5, -1, 2.4]],
      benches: [[1.0, -1, 4.6], [21.5, -1, 4.6]],
      stage: [11.5, -1, 9.5],
      cabins: [{ x: -47, z: 11.5, face: -Math.PI / 2, stairs: 1 }],
      bridges: [],
      volley: { x: -55, z: 18 }, // where the old net stood (kept so the beach scenery lays out the same); the court is VOLLEY
      surf: [[-51, 16], [-50.2, 16.4], [-49.4, 16.2]],
      parasols: [[-64.5, -11.5], [-52, -14.5]],
    },
    // the seafood restaurant on stilts, half over the shallows on the south shore; face: the way it looks (out to sea)
    restaurant: { x: -68.9, z: -24, face: -2.03 },
    // banana boat rides: a jetty from the sand out into the water, Captain Lia's booth beside its root, and two motorboats
    // (each towing a banana boat) waiting along the jetty's north side at these z lines. Their loop goes out past the
    // swimming buoys and back; swimmers keep out of the boats' lane (x0..x1, z0..z1).
    banana: {
      jetty: [[-70.5, -14.8], [-82.5, -14.8]], booth: { x: -68.6, z: -10.6, face: -Math.PI / 2 },
      boats: [-12.5, -5.4], speed: 3.9, returnSpeed: 2.2, accel: 1.6, waitMs: 10000,
      // the drivers at the wheel, one per motorboat (the same for everyone; nothing saved)
      drivers: ['Suri', 'Mak Jah'],
      lane: { x0: -125, x1: -72.5, z0: -16.2, z1: 0.6 },
    },
    // pink dolphins out in the deep, in two little groups beyond the swimming buoys (well clear of the boats' lane)
    dolphins: [{ x: -114, z: -32, r: 6 }, { x: -110, z: 26, r: 6 }],
    // a little sandcastle a few steps from the waves on the north shore (face: toward the sea)
    sandcastle: { x: -64, z: 12.6, face: -1.01 },
  },
  // the hot air balloon park: an open meadow between the plaza and the two northern homes, a short path from the ring road
  balloon: { x: 3, z: -30 },
  // the bicycle stand: beside the main path from the plaza down to the pier, its front facing that path (-x)
  rental: { x: 7.6, z: 4.2, face: -Math.PI / 2 },
  // a footpath from the island garden west over the river to the ring road (one of the three bridges)
  gardenPath: [[-11.6, 2.5], [-21.2, 2.6]],
  picnic: { x: -10.5, z: -27.5 },
  spawn: { x: 2.0, z: 34 },
  islandGarden: { x: -9.6, z: 2.5 }, // 3+ units from the river
  coast: [[14.8, -35.6], [18.8, -32.5], [20.4, -27.5], [20.8, -21.3], [20.4, -12.5], [21.2, -3.8], [20.8, 3.8], [19.6, 11.3], [17.2, 17.5],
    [14.8, 21.3], [10.8, 24.4], [5.2, 26.3], [1.2, 26.3], [-2.8, 26.3], [-8.4, 26.3], [-14, 23.8], [-18, 20], [-20.8, 15], [-22, 8.8],
    [-22.4, 1.3], [-21.6, -6.3], [-22.4, -12.5], [-22, -16.3], [-19.6, -20], [-15.6, -23.8], [-10.8, -26.9], [-5.2, -28.8], [0.4, -30],
    [6, -31.3], [10.8, -35]].map(grow),
};

// the ring road as a closed polyline: a smooth (Catmull-Rom) curve through its control points
export function loopPolyline(L = LAYOUT, step = 0.5) {
  const c = L.loop.ctrl, n = c.length, pts = [];
  for (let i = 0; i < n; i++) {
    const p0 = c[(i - 1 + n) % n], p1 = c[i], p2 = c[(i + 1) % n], p3 = c[(i + 2) % n];
    const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]), m = Math.max(2, Math.ceil(len / step));
    for (let k = 0; k < m; k++) {
      const t = k / m, t2 = t * t, t3 = t2 * t;
      const f = (a, b, cc, d) => 0.5 * (2 * b + (-a + cc) * t + (2 * a - 5 * b + 4 * cc - d) * t2 + (-a + 3 * b - 3 * cc + d) * t3);
      pts.push({ x: f(p0[0], p1[0], p2[0], p3[0]), z: f(p0[1], p1[1], p2[1], p3[1]) });
    }
  }
  return pts;
}

// a yard's gate front (1.2 outside the hedge) and the waypoints from the loop to it
// the river's centre line, smoothed (Catmull-Rom) into points about `step` apart
export function riverPolyline(L = LAYOUT, step = 0.5) {
  const c = L.river.pts, out = [];
  for (let i = 0; i < c.length - 1; i++) {
    const p0 = c[Math.max(0, i - 1)], p1 = c[i], p2 = c[i + 1], p3 = c[Math.min(c.length - 1, i + 2)];
    const m = Math.max(2, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
    for (let k = 0; k < m; k++) {
      const t = k / m, t2 = t * t, t3 = t2 * t;
      const f = (a, b, cc, d) => 0.5 * (2 * b + (-a + cc) * t + (2 * a - 5 * b + 4 * cc - d) * t2 + (-a + 3 * b - 3 * cc + d) * t3);
      out.push({ x: f(p0[0], p1[0], p2[0], p3[0]), z: f(p0[1], p1[1], p2[1], p3[1]) });
    }
  }
  const e = c[c.length - 1]; out.push({ x: e[0], z: e[1] });
  return out;
}
export function gateFront(p, L = LAYOUT) { const d = L.plotHalf + 1.2; return { x: p.x + Math.sin(p.face) * d, z: p.z + Math.cos(p.face) * d }; }
export function plotVisit(p, L = LAYOUT) { return [...(p.via || []).map(([x, z]) => ({ x, z })), gateFront(p, L)]; }

// Bo's walk (used by the server and every client): round the loop road, and at each home a detour from the nearest
// point of the loop along its path to the front of its gate (where he pauses a moment) and back.
export function buildBoRoute(L = LAYOUT) {
  const loop = loopPolyline(L, 0.5);
  const joinAt = new Map(); // loop index -> plots that branch off there
  for (const p of L.plots) {
    const first = plotVisit(p, L)[0];
    let best = 0, bd = Infinity;
    loop.forEach((q, i) => { const d = Math.hypot(q.x - first.x, q.z - first.z); if (d < bd) { bd = d; best = i; } });
    if (!joinAt.has(best)) joinAt.set(best, []);
    joinAt.get(best).push(p);
  }
  const pts = [];
  loop.forEach((q, i) => {
    pts.push({ x: q.x, z: q.z });
    for (const p of joinAt.get(i) || []) {
      const way = plotVisit(p, L);
      way.forEach((w, k) => pts.push({ x: w.x, z: w.z, pause: k === way.length - 1 }));
      for (let k = way.length - 2; k >= 0; k--) pts.push({ x: way[k].x, z: way[k].z });
      pts.push({ x: q.x, z: q.z });
    }
  });
  const cum = [0];
  for (let i = 1; i <= pts.length; i++) { const a = pts[i - 1], b = pts[i % pts.length]; cum.push(cum[i - 1] + Math.hypot(b.x - a.x, b.z - a.z)); }
  return { pts, cum, len: cum[pts.length], pauses: pts.map((p, i) => (p.pause ? cum[i] : null)).filter((v) => v !== null) };
}
// where along the route distance s is: { x, z } plus the walking direction (dx, dz)
export function routeAt(route, s) {
  const { pts, cum, len } = route;
  s = ((s % len) + len) % len;
  let lo = 0, hi = pts.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (cum[mid] <= s) lo = mid; else hi = mid - 1; }
  const a = pts[lo], b = pts[(lo + 1) % pts.length], seg = cum[lo + 1] - cum[lo] || 1, u = (s - cum[lo]) / seg;
  return { x: a.x + (b.x - a.x) * u, z: a.z + (b.z - a.z) * u, dx: (b.x - a.x) / seg, dz: (b.z - a.z) / seg };
}

// ==== the island itself (browser only)
// a smooth path through control points [[x, z], ...] (Catmull-Rom, sampled every step units), for the boats
export function makePath(ctrl, step = 0.4) {
  const pts = [], marks = [0];
  for (let i = 0; i + 1 < ctrl.length; i++) {
    const p0 = ctrl[Math.max(0, i - 1)], p1 = ctrl[i], p2 = ctrl[i + 1], p3 = ctrl[Math.min(ctrl.length - 1, i + 2)];
    const n = Math.max(1, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t, f = (a, b, c, d) => 0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (3 * b - a - 3 * c + d) * t3);
      pts.push({ x: f(p0[0], p1[0], p2[0], p3[0]), z: f(p0[1], p1[1], p2[1], p3[1]) });
    }
    marks.push(pts.length);
  }
  const last = ctrl[ctrl.length - 1]; pts.push({ x: last[0], z: last[1] });
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
  return { pts, cum, len: cum[cum.length - 1], at: marks.map((i) => cum[Math.min(i, cum.length - 1)]) }; // at: distance at each control point
}
// where along a path (distance d from its start): position and heading
export function pathAt(path, d) {
  const { pts, cum } = path, D = Math.max(0, Math.min(path.len, d));
  let lo = 0, hi = cum.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= D) lo = m; else hi = m; }
  const a = pts[lo], b = pts[hi], u = cum[hi] > cum[lo] ? (D - cum[lo]) / (cum[hi] - cum[lo]) : 0;
  return { x: a.x + (b.x - a.x) * u, z: a.z + (b.z - a.z) * u, yaw: Math.atan2(b.x - a.x, b.z - a.z) };
}
// a banana boat's loop, for boat bi (moored on line z): out west along its line past the buoys, wide S-curves out in
// the deep (the south boat swings south, the north boat north, so they never meet), a sweeping turn at the far end,
// back east and in along the lane, round to the mooring again (the towed banana starts and ends 6 units behind)
export const BANANA_IN = 14; // the control point where a loop comes back in at the lane's mouth
export function bananaCtrl(bi) {
  const z = LAYOUT.beach.banana.boats[bi];
  const far = bi === 0
    ? [[-106, -16], [-117, -21], [-128, -16], [-139, -21], [-150, -17.5], [-154, -11.5], [-148, -7], [-137, -10.5], [-126, -6.5], [-115, -10], [-104, -7.5]]
    : [[-106, -1.5], [-117, 4], [-128, 0], [-139, 5], [-150, 3], [-154, 9], [-147, 13], [-136, 9.5], [-125, 13.5], [-114, 9.5], [-103, 5.5]];
  return [[-80, z], [-86, z], [-96, z], ...far, [-96, z + 5], [-88, z + 5], [-80, z + 3.6], [-75.5, z + 2.6], [-76.5, z + 0.6], [-80, z], [-86, z]];
}
export const bananaCourse = (bi) => makePath(bananaCtrl(bi));
// how far along a run of length L you are t seconds after setting off at speed v0: change to cruising speed vc at
// accel a, cruise, then brake smoothly to a stop right at the end. { d, v, done }
export function travel(t, L, v0, vc, a) {
  const t1 = Math.abs(vc - v0) / a, d1 = ((v0 + vc) / 2) * t1, db = (vc * vc) / (2 * a);
  const tb = t1 + Math.max(0, L - d1 - db) / vc, T = tb + vc / a;
  if (t <= 0) return { d: 0, v: v0, done: false };
  if (t >= T) return { d: L, v: 0, done: true };
  if (t < t1) { const s = Math.sign(vc - v0); return { d: Math.min(L, v0 * t + (s * a * t * t) / 2), v: v0 + s * a * t, done: false }; }
  if (t < tb) return { d: Math.min(L, d1 + vc * (t - t1)), v: vc, done: false };
  const u = t - tb; return { d: Math.min(L, d1 + vc * (tb - t1) + vc * u - (a * u * u) / 2), v: Math.max(0, vc - a * u), done: false };
}
// where a banana boat is along its loop (state 'ride' since at), or along its way home ('return')
export function bananaRideAt(course, at, now) { const B = LAYOUT.beach.banana, r = travel((now - at) / 1000, course.len - course.at[1], 0, B.speed, B.accel); return { d: course.at[1] + r.d, v: r.v, done: r.done }; }
export function bananaRetAt(ret, len, now) { const B = LAYOUT.beach.banana, r = travel((now - ret.at) / 1000, len - ret.d0, ret.v0 == null ? B.returnSpeed : ret.v0, B.returnSpeed, B.accel * 0.6); return { d: ret.d0 + r.d, v: r.v, done: r.done }; }
// "get off" out on the water: ease off, swing round in a wide turn and head home along the lane. null if already on
// the way in. The control points are rounded so they travel the network the same on every client.
export function bananaReturnCtrl(course, bi, d) {
  if (d >= course.at[BANANA_IN] - 2) return null;
  const q = (k) => { const a = pathAt(course, k); return [+a.x.toFixed(2), +a.z.toFixed(2)]; };
  const tail = bananaCtrl(bi).slice(BANANA_IN), here = pathAt(course, d), fx = Math.sin(here.yaw), fz = Math.cos(here.yaw);
  const side = (tail[0][0] - here.x) * fz - (tail[0][1] - here.z) * fx > 0 ? 1 : -1; // turn toward home
  const turn = [+(here.x + fx * 6 + fz * side * 6).toFixed(2), +(here.z + fz * 6 - fx * side * 6).toFixed(2)];
  const home = Math.hypot(tail[0][0] - here.x, tail[0][1] - here.z) > 14 ? [turn] : [];
  return [q(d - 8), q(d - 4), q(d), ...home, ...tail];
}

// ---------------------------------------------------------------- beach volleyball: the court and the match rules
// One court on the beach. The net runs along x through (x, z); side 0 ("Left") is the half with smaller z, side 1
// ("Right") the other. The ball flies in parabolas the server works out at every hit (segments with a start time on
// the shared clock), so every client draws exactly the same ball. The same engine runs the match on the server and,
// on the solo island, in the browser.
export const VOLLEY = { x: -55, z: 15.5, hw: 2.6, hl: 4, net: 2.15, r: 0.22, g: 7, reach: 1.9, toWin: 7, cap: 9 };
const VS = (side) => (side ? 1 : -1); // which way a side's half lies from the net (along z)
export const volleyStart = (side) => ({ x: VOLLEY.x, z: VOLLEY.z + VS(side) * 2.6 });
export const volleyInCourt = (x, z) => Math.abs(x - VOLLEY.x) <= VOLLEY.hw + VOLLEY.r && Math.abs(z - VOLLEY.z) <= VOLLEY.hl + VOLLEY.r;
export const volleyHalfOf = (z) => (z < VOLLEY.z ? 0 : 1);
// where you may stand while playing: your own half plus a little room behind and beside the lines, never across the net
export function volleyClamp(side, x, z) {
  const s = VS(side), d = Math.min(VOLLEY.hl + 1.4, Math.max(0.45, (z - VOLLEY.z) * s));
  return { x: Math.min(VOLLEY.x + VOLLEY.hw + 1.4, Math.max(VOLLEY.x - VOLLEY.hw - 1.4, x)), z: VOLLEY.z + d * s };
}
// a flight from p with velocity v starting at t0 (ms): until it lands (y = r), then a few bounces on the sand
const landAfter = (y, vy) => (vy + Math.sqrt(vy * vy + 2 * VOLLEY.g * Math.max(0, y - VOLLEY.r))) / VOLLEY.g;
function flightAt(f, t) { // seconds after the flight started
  const g = VOLLEY.g;
  let p = f.p, v = f.v, u = t;
  for (let k = 0; k < 5; k++) {
    const T = landAfter(p[1], v[1]);
    if (u <= T || k === 4) { u = Math.min(u, T); return [p[0] + v[0] * u, p[1] + v[1] * u - (g * u * u) / 2, p[2] + v[2] * u]; }
    const vyL = v[1] - g * T, q = [p[0] + v[0] * T, VOLLEY.r, p[2] + v[2] * T];
    u -= T; p = q; v = [v[0] * 0.5, -vyL * 0.42, v[2] * 0.5];
    if (v[1] < 0.6) { const roll = Math.min(u, 0.6); return [p[0] + v[0] * roll * (1 - roll / 1.2), VOLLEY.r, p[2] + v[2] * roll * (1 - roll / 1.2)]; }
  }
  return p;
}
// the ball at time t (ms): ball = { segs: [{ p, v, t0, end }], rest: [x, y, z] }
export function volleyBallAt(ball, t) {
  if (!ball || !ball.segs || !ball.segs.length) return ball && ball.rest ? ball.rest : [VOLLEY.x, VOLLEY.r, VOLLEY.z - 1];
  let s = ball.segs[0];
  for (const q of ball.segs) if (t >= q.t0) s = q;
  const u = Math.max(0, (t - s.t0) / 1000);
  if (s.end != null && u > s.end) { const g = VOLLEY.g, e = s.end; return [s.p[0] + s.v[0] * e, s.p[1] + s.v[1] * e - (g * e * e) / 2, s.p[2] + s.v[2] * e]; }
  return flightAt(s, u);
}
// launch from p toward (tx, tz) taking T seconds; returns the flight segments, where and when it lands
function launch(p, tx, tz, T, now, fixNet) {
  const g = VOLLEY.g;
  for (let k = 0; k < 8; k++, T += 0.12) {
    const v = [(tx - p[0]) / T, (VOLLEY.r - p[1] + (g * T * T) / 2) / T, (tz - p[2]) / T];
    const tn = Math.abs(v[2]) > 1e-6 ? (VOLLEY.z - p[2]) / v[2] : -1, yn = tn > 0 && tn < T ? p[1] + v[1] * tn - (g * tn * tn) / 2 : 99;
    const xn = p[0] + v[0] * Math.max(0, tn), netHit = yn < VOLLEY.net + VOLLEY.r && Math.abs(xn - VOLLEY.x) <= VOLLEY.hw + 0.4;
    if (netHit && fixNet && k < 7) continue; // a good hit always clears the net: a higher arc
    if (!netHit) return { segs: [{ p, v, t0: now }], land: { x: tx, z: tz, t: now + T * 1000 }, net: false };
    // into the net: it stops there and drops back down on the hitter's side
    const q = [xn, yn, VOLLEY.z - Math.sign(v[2]) * 0.25], v2 = [v[0] * 0.15, Math.min(0, v[1] - g * tn) * 0.3, -v[2] * 0.12], T2 = landAfter(q[1], v2[1]);
    return { segs: [{ p, v, t0: now, end: tn }, { p: q, v: v2, t0: now + tn * 1000 }], land: { x: q[0] + v2[0] * T2, z: q[2] + v2[2] * T2, t: now + (tn + T2) * 1000 }, net: true };
  }
}
// ---- the match. hooks: now() ms, emit() after any change, posOf(id) -> { x, z } | null, nameOf(id), rand()
export function volleyEngine(hooks) {
  const rand = hooks.rand || Math.random;
  const S = { st: 'idle', sides: [null, null], names: ['', ''], score: [0, 0], serve: 0, ball: { segs: [], rest: [VOLLEY.x, VOLLEY.r, VOLLEY.z - 1.2] }, land: null, last: -1, hit: null, until: 0, winner: -1, why: '', bot: null, join: [null, null], seq: 0 };
  const human = (i) => S.sides[i] !== null && S.sides[i] !== 'bot';
  const live = () => ['count', 'serve', 'rally', 'point'].includes(S.st);
  const changed = () => { S.seq++; hooks.emit(); };
  const sideOf = (id) => S.sides.indexOf(id);
  const reset = () => { S.score = [0, 0]; S.serve = rand() < 0.5 ? 0 : 1; S.last = -1; S.winner = -1; S.why = ''; S.hit = null; S.land = null; };
  const startCount = (now) => { reset(); S.st = 'count'; S.until = now + 3200; S.ball = { segs: [], rest: [VOLLEY.x, VOLLEY.r, VOLLEY.z - 1.2] }; };
  const holdBall = () => { // the server holds the ball, waiting to serve
    S.st = 'serve'; S.last = -1; S.land = null;
    const p = S.sides[S.serve] === 'bot' ? S.bot : hooks.posOf(S.sides[S.serve]) || volleyStart(S.serve);
    S.ball = { segs: [], rest: [p.x, 2.0, p.z], held: S.serve };
  };
  const botIn = (side) => { S.sides[side] = 'bot'; S.names[side] = 'Bonbon'; const st = volleyStart(side); S.bot = { x: st.x, z: st.z, side, think: 0 }; };
  const clearSide = (i) => { if (S.sides[i] === 'bot') S.bot = null; S.sides[i] = null; S.names[i] = ''; };
  function hitBall(side, at, tx, tz, q, now) {
    const s = VS(1 - side), from = S.st === 'serve' ? [S.ball.rest[0], 2.0, S.ball.rest[2]] : volleyBallAt(S.ball, at);
    // aim: somewhere on the other half (the middle if no aim), a little off for an ordinary hit, short for a weak one
    let ax = Number.isFinite(tx) ? tx : VOLLEY.x, az = Number.isFinite(tz) ? tz : VOLLEY.z + s * VOLLEY.hl * 0.55;
    ax = Math.min(VOLLEY.x + VOLLEY.hw - 0.2, Math.max(VOLLEY.x - VOLLEY.hw + 0.2, ax));
    let d = Math.min(VOLLEY.hl - 0.25, Math.max(0.9, (az - VOLLEY.z) * s));
    const err = q === 'great' ? 0.15 : q === 'ok' ? 0.55 : 1.0;
    if (q === 'weak') d *= 0.55;
    ax += (rand() - 0.5) * 2 * err; d += (rand() - 0.5) * 2 * err * (q === 'weak' ? 1.4 : 1);
    const T = q === 'great' ? 0.95 : q === 'ok' ? 1.25 : 1.5;
    const f = launch(from, ax, VOLLEY.z + d * s, T, now, q !== 'weak');
    S.ball = { segs: f.segs }; S.land = f.land; S.last = side; S.st = 'rally';
    S.hit = { side, at: now, q, serve: from[1] >= 1.99 && !S.hit };
  }
  const quality = (y) => { const e = Math.abs(y - 1.75); return e < 0.32 ? 'great' : e < 0.85 ? 'ok' : 'weak'; };
  const api = {
    S, sideOf,
    join(id, side, name) { // a free side, or one the practice bot holds (it hands over after this point)
      if (!(side === 0 || side === 1) || sideOf(id) >= 0) return 'busy';
      if (human(side)) return 'taken';
      const now = hooks.now();
      if (S.sides[side] === 'bot') {
        if (live() && S.st !== 'count') { S.join[side] = { id, name }; changed(); return null; }
        clearSide(side);
      }
      S.sides[side] = id; S.names[side] = name || 'Player';
      if (human(0) && human(1)) startCount(now); else if (S.st === 'idle' || S.st === 'over') S.st = 'wait';
      if (!human(1 - side) && S.sides[1 - side] === 'bot' && S.st === 'count') { /* still counting down with the bot */ }
      changed(); return null;
    },
    practice(id) {
      const i = sideOf(id); if (i < 0 || S.sides[1 - i] !== null || live()) return 'no';
      botIn(1 - i); startCount(hooks.now()); changed(); return null;
    },
    again(id) {
      const i = sideOf(id); if (i < 0 || live() || S.sides[1 - i] === null) return 'no';
      startCount(hooks.now()); changed(); return null;
    },
    leave(id) {
      const i = sideOf(id);
      for (const k of [0, 1]) if (S.join[k] && S.join[k].id === id) { S.join[k] = null; changed(); }
      if (i < 0) return;
      const was = live();
      clearSide(i);
      if (was && human(1 - i)) { S.st = 'over'; S.winner = 1 - i; S.why = 'left'; S.until = hooks.now() + 5000; S.ball = { segs: [], rest: volleyBallAt(S.ball, hooks.now()) }; S.ball.rest[1] = VOLLEY.r; }
      else { if (S.sides[1 - i] === 'bot') clearSide(1 - i); S.st = S.sides[1 - i] !== null ? 'wait' : 'idle'; S.ball = { segs: [], rest: [VOLLEY.x, VOLLEY.r, VOLLEY.z - 1.2] }; }
      changed();
    },
    hit(id, at, tx, tz) { // validated: your turn, the ball close to you, not your second touch in a row
      const i = sideOf(id), now = hooks.now();
      if (i < 0) return 'no';
      const when = Number.isFinite(at) && at <= now + 50 && at >= now - 450 ? at : now;
      if (S.st === 'serve') { if (S.serve !== i) return 'turn'; hitBall(i, when, tx, tz, 'ok', now); changed(); return null; }
      if (S.st !== 'rally' || S.last === i) return 'turn';
      const b = volleyBallAt(S.ball, when), me = hooks.posOf(id);
      if (!me || b[1] < 0.3 || b[1] > 3.6) return 'reach';
      if (Math.hypot(b[0] - me.x, b[2] - me.z) > VOLLEY.reach + 0.5) return 'reach';
      if ((b[2] - VOLLEY.z) * VS(i) < -0.6) return 'reach'; // over on the other side of the net
      if (when > S.land.t) return 'late';
      hitBall(i, when, tx, tz, quality(b[1]), now); changed(); return null;
    },
    tick() {
      const now = hooks.now();
      if (S.st === 'count' && now >= S.until) { holdBall(); changed(); }
      else if (S.st === 'rally' && now >= S.land.t) { // it's down: whose point?
        const L = S.land, inside = volleyInCourt(L.x, L.z), loser = inside ? volleyHalfOf(L.z) : S.last, w = 1 - loser;
        S.score[w]++; S.serve = w; S.st = 'point'; S.until = now + 2300; S.pointTo = w; S.out = !inside;
        const sw = S.score[w], so = S.score[loser];
        if (sw >= VOLLEY.toWin && (sw - so >= 2 || sw >= VOLLEY.cap)) { S.winner = w; S.why = 'won'; }
        changed();
      } else if (S.st === 'point' && now >= S.until) {
        S.ball = { segs: [], rest: volleyBallAt(S.ball, now) };
        if (S.winner >= 0) { S.st = 'over'; S.until = now + 5000; }
        else {
          let fresh = false;
          for (const k of [0, 1]) if (S.join[k] && S.sides[k] === 'bot') { clearSide(k); S.sides[k] = S.join[k].id; S.names[k] = S.join[k].name; S.join[k] = null; fresh = true; }
          if (fresh) startCount(now); else holdBall();
        }
        changed();
      } else if (S.st === 'over' && now >= S.until) {
        S.st = S.sides[0] !== null || S.sides[1] !== null ? 'wait' : 'idle';
        for (const k of [0, 1]) if (S.join[k]) { if (S.sides[k] === 'bot') clearSide(k); if (S.sides[k] === null) { S.sides[k] = S.join[k].id; S.names[k] = S.join[k].name; } S.join[k] = null; }
        if (S.sides.includes('bot') && !(human(0) || human(1))) { clearSide(S.sides.indexOf('bot')); S.st = 'idle'; }
        changed();
      }
      // the practice bot: runs to where the ball will come down, bumps it back when it's at a nice height
      const B = S.bot;
      if (B) {
        const side = B.side, s = VS(side), home = volleyStart(side);
        let goal = home;
        if (S.st === 'rally' && S.last !== side && S.land && volleyHalfOf(S.land.z) === side) goal = { x: S.land.x, z: S.land.z + s * 0.4 };
        if (S.st === 'serve' && S.serve === side) goal = home;
        const dx = goal.x - B.x, dz = goal.z - B.z, dd = Math.hypot(dx, dz), step = 2.7 * 0.05;
        if (dd > 0.05) { const k = Math.min(1, step / dd); const c = volleyClamp(side, B.x + dx * k, B.z + dz * k); B.x = c.x; B.z = c.z; }
        if (S.st === 'serve' && S.serve === side && now - (S.hit ? 0 : 0) > 0) {
          B.think = B.think || now + 1300;
          if (now >= B.think) { B.think = 0; S.ball.rest = [B.x, 2.0, B.z]; hitBall(side, now, VOLLEY.x + (rand() - 0.5) * 3, VOLLEY.z - s * (1.2 + rand() * 2.4), 'ok', now); changed(); }
        } else if (S.st === 'rally' && S.last !== side) {
          const b = volleyBallAt(S.ball, now), vyDown = volleyBallAt(S.ball, now + 50)[1] < b[1];
          if (Math.hypot(b[0] - B.x, b[2] - B.z) < VOLLEY.reach && b[1] < 2.0 && b[1] > 1.2 && vyDown && (b[2] - VOLLEY.z) * s > 0) {
            if (B.miss === undefined) B.miss = rand() < 0.22; // now and then it just misses (it's still learning)
            if (!B.miss) { const r = rand(); hitBall(side, now, VOLLEY.x + (rand() - 0.5) * 4, VOLLEY.z - s * (1 + rand() * 2.8), r < 0.15 ? 'great' : r < 0.85 ? 'ok' : 'weak', now); B.miss = undefined; changed(); }
          }
        } else B.miss = undefined;
        B.moving = dd > 0.05;
      }
    },
    view() { return { st: S.st, sides: S.sides.map((s) => (s === 'bot' ? 'bot' : s)), names: S.names, score: S.score, serve: S.serve, ball: S.ball, land: S.land, last: S.last, hit: S.hit, until: S.until, winner: S.winner, why: S.why, pointTo: S.pointTo, out: S.out, bot: S.bot && { x: +S.bot.x.toFixed(2), z: +S.bot.z.toFixed(2), side: S.bot.side, m: S.bot.moving ? 1 : 0 }, join: S.join.map((j) => j && j.id), seq: S.seq }; },
  };
  return api;
}
// whether a side is one hit from winning
export const volleyMatchPoint = (score, side) => { const s = score[side] + 1, o = score[1 - side]; return s >= VOLLEY.toWin && (s - o >= 2 || s >= VOLLEY.cap); };

// the home pond's outline: a soft kidney shape, its radius along direction th (atan2 of z, x from the pond's middle).
// Long axis toward the river mouth (north-west) and the dock (south-east), a gentle dip on the north-east side. Never
// wider than the old round pond (LAYOUT.pond.r), so the banks, paths and everything round it stay where they were.
export function pondR(th) {
  const r = LAYOUT.pond.r, s = Math.sin(th - (3 * Math.PI) / 4), c = Math.cos(th - Math.PI / 4);
  return r * (1 - 0.13 * s * s - 0.17 * Math.pow(Math.max(0, c), 3));
}
export const POND_DOCK = { a: [-10.15, -24.65], b: [-12.45, -23.05], ya: 0.87, yb: 0.6, hw: 0.55 }; // the little dock: from the lawn (bank end) gently down over the water
export const atPond = (x, z) => Number.isFinite(x) && Math.hypot(x - LAYOUT.pond.x, z - LAYOUT.pond.z) < LAYOUT.pond.r + 3.2; // fishing here gives pond catches

// ---- the town piano: a little grand piano on a round rug in a cleared glade among the cherry blossoms beside Rex's
// bicycle stand (main.js keeps an 8 x 8 square round it free of trees and props), its keyboard and bench toward the fountain. When nobody sits at it, it plays a loop of short
// original pieces by itself, timed from the shared clock (auto0: when the loop last (re)started, set by the server),
// so everyone nearby hears the same note at the same moment.
export const PIANO = { x: 13, z: 3, clear: 4, face: Math.atan2(LAYOUT.plaza.x - 13, LAYOUT.plaza.z - 3), hear: 25, resumeMs: 10000, gapMs: 3500 };
// the pieces, composed for the island. mel: "degree:beats" (degree 0 = the key's tonic, counted along its scale; r = a
// rest); prog: the chord under each bar (a scale degree); hand: how the left hand plays it
const PIANO_SCORES = [
  { name: 'Morning Tide', key: 60, scale: 'major', beats: 4, bpm: 92, hand: 'arp', prog: '0 5 3 4 0 3 4 0',
    mel: '4:1 7:1 6:.5 4:.5 5:1  7:1.5 9:.5 8:2  5:1 7:1 9:1 11:1  10:1.5 9:.5 8:2  4:1 7:1 6:.5 4:.5 2:1  3:1 5:1 9:1 8:1  7:.5 8:.5 9:1 8:1 6:1  7:3 r:1' },
  { name: 'Lantern Waltz', key: 65, scale: 'major', beats: 3, bpm: 126, hand: 'waltz', prog: '0 0 4 0 1 3 0 3 0 3 4 0',
    mel: '4:2 5:1  4:1 2:1 0:1  1:2 2:1  4:3  5:2 6:1  7:1 6:1 5:1  4:1 5:1 2:1  3:3  2:2 4:1  7:2 6:1  5:1 3:1 1:1  0:3' },
  { name: 'Sleepy Kitten', key: 67, scale: 'major', beats: 4, bpm: 76, hand: 'block', prog: '0 2 3 4 0 5 4 0',
    mel: '2:1 1:.5 0:.5 1:2  2:1 4:1 2:2  3:1 2:.5 1:.5 2:1 4:1  1:4  2:1 1:.5 0:.5 -1:2  0:1 2:1 5:2  4:1 3:1 2:1 1:1  0:4' },
  { name: 'Raindrop Steps', key: 62, scale: 'major', beats: 4, bpm: 104, hand: 'arp', prog: '0 4 5 0 0 5 4 0',
    mel: '7:.5 6:.5 4:.5 2:.5 4:1 7:1  8:1.5 7:.5 6:2  5:.5 4:.5 2:.5 0:.5 2:1 5:1  4:3 r:1  7:.5 9:.5 8:.5 7:.5 6:1 4:1  5:1 7:1 9:2  8:1 6:1 4:1 6:1  7:3 r:1' },
  { name: 'Cloud Boat', key: 69, scale: 'minor', beats: 4, bpm: 84, hand: 'arp', prog: '0 6 2 4 0 5 3 0',
    mel: '4:1 2:.5 4:.5 7:2  6:1 5:.5 4:.5 3:2  2:1 3:.5 4:.5 5:1 4:1  1:3 r:1  4:1 2:.5 4:.5 8:2  7:1 6:.5 5:.5 4:2  3:1 2:1 1:1 2:1  0:4' },
  { name: 'Firefly Lullaby', key: 70, scale: 'major', beats: 3, bpm: 96, hand: 'waltz', prog: '0 3 0 5 0 4 4 0',
    mel: '4:2 2:1  3:1 4:1 5:1  4:2 0:1  2:3  4:2 7:1  6:1 5:1 4:1  3:1 1:1 2:1  0:3' },
  { name: 'Seashell Song', key: 60, scale: 'major', beats: 4, bpm: 112, hand: 'arp', prog: '0 3 1 4 0 5 4 0',
    mel: '0:.5 2:.5 4:.5 7:.5 6:1 4:1  5:.5 4:.5 3:.5 2:.5 3:2  1:.5 3:.5 5:.5 8:.5 7:1 5:1  4:3 r:1  7:.5 9:.5 11:.5 9:.5 8:1 7:1  5:1 6:1 7:1 9:1  8:1.5 7:.5 6:1 8:1  7:3 r:1' },
];
const PIANO_SCALES = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10] };
export const PIANO_LOW = 48, PIANO_HIGH = 83; // the 3D piano's keys: C3 .. B5
const scaleNote = (sc, key, d) => key + sc[((d % 7) + 7) % 7] + 12 * Math.floor(d / 7);
const keepOnKeys = (m) => { while (m < PIANO_LOW) m += 12; while (m > PIANO_HIGH) m -= 12; return m; };
// one piece as notes { t: ms from its start, m: midi, d: ms held, v: loudness 0..1, h: 0 left hand / 1 right hand }
function scoreNotes(s) {
  const sc = PIANO_SCALES[s.scale], beat = 60000 / s.bpm, notes = [];
  let b = 0;
  for (const tok of s.mel.trim().split(/\s+/)) {
    const [dg, len] = tok.split(':'), l = Number(len);
    if (dg !== 'r') notes.push({ t: b * beat, m: keepOnKeys(scaleNote(sc, s.key, Number(dg))), d: Math.max(l, 0.5) * beat * 1.05, v: 0.8, h: 1 });
    b += l;
  }
  s.prog.trim().split(/\s+/).forEach((c, bar) => {
    const root = Number(c), t0 = bar * s.beats * beat, low = s.key - 12;
    const tone = (k) => keepOnKeys(scaleNote(sc, low, root + k));
    const add = (at, k, d, v) => notes.push({ t: t0 + at * beat, m: tone(k), d: d * beat, v, h: 0 });
    if (s.hand === 'arp') [0, 4, 9, 4, 0, 4, 9, 4].forEach((k, i) => add(i * 0.5, k, 1, i % 4 ? 0.34 : 0.46));
    else if (s.hand === 'waltz') { add(0, 0, 3, 0.48); for (const at of [1, 2]) { add(at, 2, 0.9, 0.3); add(at, 4, 0.9, 0.3); } }
    else { for (const k of [0, 4, 9]) add(0, k, 4, 0.4); for (const k of [4, 9]) add(2, k, 2, 0.26); }
  });
  notes.sort((a, c) => a.t - c.t);
  return { name: s.name, notes, len: b * beat + 600 };
}
export const PIANO_PIECES = PIANO_SCORES.map(scoreNotes);
// the demo song in the keyboard panel: the first piece's tune alone (all on the panel's two octaves, C4 .. B5)
export const PIANO_DEMO = PIANO_PIECES[0].notes.filter((n) => n.h === 1).map((n) => ({ t: n.t, m: n.m, d: n.d }));
// the auto-play loop from auto0: every piece once (starting with a different one each time it restarts), a soft pause
// after each. Returns [{ i, start, len }] for the pieces overlapping [from, to)
function pianoOrder(auto0) {
  const n = PIANO_PIECES.length, first = Math.floor(auto0 / 1000) % n, order = [];
  let off = 0;
  for (let k = 0; k < n; k++) { const i = (first + k) % n; order.push({ i, off }); off += PIANO_PIECES[i].len + PIANO.gapMs; }
  return { order, cycle: off };
}
export function pianoPiecesIn(from, to, auto0) {
  if (!Number.isFinite(auto0) || to <= auto0) return [];
  const { order, cycle } = pianoOrder(auto0), out = [];
  const c0 = Math.max(0, Math.floor((from - auto0) / cycle) - 1), c1 = Math.floor((to - auto0) / cycle);
  for (let c = c0; c <= c1; c++) for (const o of order) {
    const start = auto0 + c * cycle + o.off, len = PIANO_PIECES[o.i].len;
    if (start < to && start + len > from) out.push({ i: o.i, start, len });
  }
  return out;
}
// the auto-play notes that start in [from, to): { at (shared-clock ms), m, d, v }
export function pianoAutoNotes(from, to, auto0) {
  const out = [];
  for (const p of pianoPiecesIn(from, to, auto0)) for (const n of PIANO_PIECES[p.i].notes) {
    const at = p.start + n.t;
    if (at >= from && at < to) out.push({ at, m: n.m, d: n.d, v: n.v });
  }
  return out;
}

export function createIsland({ THREE, hash, vnoise, fbm, smooth, lerp, TAU }) {
  const C = (h) => new THREE.Color(h);
  const L = LAYOUT;

  // coastline: the traced polygon, read as a radius for every direction from the origin, with a little roughness
  const coastTable = (() => {
    const N = 1440, out = new Float32Array(N), poly = L.coast;
    for (let i = 0; i < N; i++) {
      const th = (i / N) * TAU, dx = Math.cos(th), dz = Math.sin(th);
      let best = 0;
      for (let k = 0; k < poly.length; k++) {
        const [ax, az] = poly[k], [bx, bz] = poly[(k + 1) % poly.length], ex = bx - ax, ez = bz - az;
        const den = dx * ez - dz * ex;
        if (Math.abs(den) < 1e-9) continue;
        const t = (ax * ez - az * ex) / den, u = (ax * dz - az * dx) / den;
        if (t > 0 && u >= 0 && u <= 1) best = Math.max(best, t);
      }
      out[i] = best;
    }
    // soften the polygon's corners
    const sm = new Float32Array(N);
    for (let i = 0; i < N; i++) { let s = 0; for (let k = -12; k <= 12; k++) s += out[(i + k + N) % N]; sm[i] = s / 25; }
    return sm;
  })();
  function coastR(th) {
    const N = coastTable.length, f = ((((th / TAU) % 1) + 1) % 1) * N, i = Math.floor(f), u = f - i;
    const r = coastTable[i % N] * (1 - u) + coastTable[(i + 1) % N] * u;
    return r + (vnoise(Math.cos(th) * 4 + 11, Math.sin(th) * 4 + 4) - 0.5) * 1.2;
  }
  const ISLAND = { ax: 37, az: 54 }; // rough half extents (x, z) for anything that scatters things over the land
  // where a point was on the painting's island before the 1.7x enlargement: the cliffs and beaches stay where they were
  const orig = (x, z) => [x / ISLAND_SCALE, (z + 4) / ISLAND_SCALE - 4];
  // cliffs: the right side and the headland; sand everywhere else
  const rockyAt = (x0, z0) => { const [x, z] = orig(x0, z0); return Math.max(smooth(12, 17, x) * smooth(16, 8, z), smooth(-24, -29, z) * smooth(-6, 2, x)); };
  const beachAt = (x0, z0) => { const [x, z] = orig(x0, z0); return lerp(lerp(0.05, 0.13, smooth(12, 20, z) + smooth(-12, -19, x) * smooth(6, 14, z)), 0.015, rockyAt(x0, z0)); }; // fraction of the radius
  const HILL = { x: L.lighthouse.x, z: L.lighthouse.z + 0.5, r: 10, h: 4 };
  const POND = L.pond;

  // the desert and the beach: big rounded landmasses with a slightly wobbly coast
  const areaD = (a, x, z) => { const dx = (x - a.x) / a.rx, dz = (z - a.z) / a.rz, th = Math.atan2(dz, dx); return Math.hypot(dx, dz) * (1 + (vnoise(Math.cos(th) * 3 + a.x, Math.sin(th) * 3 + a.z) - 0.5) * 0.12); };
  const OASIS = L.desert.oasis;
  function desertH(x, z) {
    const a = L.areas.desert, d = areaD(a, x, z);
    if (d >= 1.25) return -4.5;
    if (d >= 1) return Math.max(-0.12 - (d - 1) * 14, -4.5);
    let h = -0.12 + smooth(1, 0.93, d) * 0.45; // a thin warm beach, then the dunes
    const dunes = (0.5 + 0.5 * Math.sin(x * 0.21 + Math.sin(z * 0.12) * 2.2)) * (0.55 + fbm(x * 0.05, z * 0.05) * 0.7);
    h += smooth(0.95, 0.75, d) * (0.35 + dunes * 0.95);
    const od = Math.hypot(x - OASIS.x, z - OASIS.z);
    if (od < OASIS.r + 4) h = lerp(h, -0.7, smooth(OASIS.r + 2.5, OASIS.r - 1.2, od)); // the oasis pond
    return h;
  }
  function beachH(x, z) {
    const a = L.areas.beach, d = areaD(a, x, z);
    if (d >= 1.6) return -4.5;
    if (d >= 1.17) return Math.max(-0.72 - (d - 1.17) * 12, -4.5); // then the drop to deep blue water
    if (d >= 1) return -0.12 - (d - 1) * 3.5; // a wide sandy shelf of clear turquoise shallows
    return -0.12 + smooth(1, 0.8, d) * 0.42 + smooth(0.75, 0.45, d) * (0.18 + fbm(x * 0.07 + 5, z * 0.07 + 1) * 0.4);
  }
  // which area a point belongs to, softly: the desert east of x ~40, the beach west of x ~ -40
  const areaW = (x) => ({ desert: smooth(38, 48, x), beach: smooth(-38, -48, x) });
  // how much a point sits where a new region joins the old coast (there the old cliffs give way to open ground)
  const joinW = (x, z) => Math.max(smooth(1.15, 0.85, areaD(L.areas.desert, x, z)), smooth(1.15, 0.85, areaD(L.areas.beach, x, z)));
  function areaAt(x, z) { const w = areaW(x); return w.desert > 0.5 ? 'desert' : w.beach > 0.5 ? 'beach' : 'home'; }
  // a random spot in an area (for items and bugs): 'shore' = on the sand by the water, else inland
  function randomInArea(area, rnd, where = 'land') {
    const a = L.areas[area];
    for (let k = 0; k < 300; k++) {
      const t = rnd() * TAU, r = Math.sqrt(rnd()), x = a.x + Math.cos(t) * a.rx * r, z = a.z + Math.sin(t) * a.rz * r, h = rawH(x, z);
      if (where === 'shore' ? h > 0.04 && h < 0.45 : h > 0.4) return { x, z };
    }
    return null;
  }
  function rawH(x, z) {
    return Math.max(homeH(x, z), desertH(x, z), beachH(x, z));
  }
  function homeH(x, z) {
    const r = Math.hypot(x, z), th = Math.atan2(z, x), R = coastR(th), d = r / R, rocky = rockyAt(x, z) * (1 - joinW(x, z));
    if (d > 1.6) return -4.5;
    let h;
    if (d >= 1) h = Math.max(-0.12 - (d - 1) * lerp(14, 40, rocky), -4.5);
    else {
      const bw = beachAt(x, z);
      h = -0.12 + smooth(1, 1 - bw, d) * 0.44;
      h += smooth(1 - bw, 1 - bw - 0.12, d) * (0.3 + fbm(x * 0.12 + 10, z * 0.12 + 10) * 0.4);
      h += rocky * smooth(1.0, 0.96, d) * 0.9; // low cliffs
    }
    const hd = Math.hypot(x - HILL.x, z - HILL.z);
    if (hd < HILL.r) h += HILL.h * smooth(HILL.r, HILL.r * 0.25, hd);
    const pr = Math.hypot(x - POND.x, z - POND.z), pd = pr < POND.r + 0.55 ? pr * lerp(POND.r / pondR(Math.atan2(z - POND.z, x - POND.x)), 1, smooth(POND.r - 0.6, POND.r + 0.55, pr)) : pr; // the kidney shape (the old round banks from r + 0.55 out)
    if (pd < POND.r + 2) h = lerp(h, -0.8, smooth(POND.r + 0.9, POND.r - 1.2, pd));
    const rd = riverDist(x, z); // soft sandy banks sloping down into the river bed
    if (rd < L.river.half + 3) h = lerp(h, -0.65, smooth(L.river.half + 2.3, L.river.half - 0.2, rd));
    return h;
  }
  // distance to the river's centre line (a quick box test first: most of the island is nowhere near it)
  const RIVER = riverPolyline(L, 0.75), RB = RIVER.reduce((b, q) => ({ x0: Math.min(b.x0, q.x), x1: Math.max(b.x1, q.x), z0: Math.min(b.z0, q.z), z1: Math.max(b.z1, q.z) }), { x0: 1e9, x1: -1e9, z0: 1e9, z1: -1e9 });
  function riverDist(x, z) {
    if (x < RB.x0 - 6 || x > RB.x1 + 6 || z < RB.z0 - 6 || z > RB.z1 + 6) return 99;
    let best = 99;
    for (let i = 0; i + 1 < RIVER.length; i++) {
      const a = RIVER[i], b = RIVER[i + 1], dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (l2 || 1)));
      best = Math.min(best, Math.hypot(x - a.x - t * dx, z - a.z - t * dz));
    }
    return best;
  }
  let flats = [];
  const setFlats = (list) => { flats = list; };
  function H(x, z) {
    let h = rawH(x, z);
    for (const f of flats) {
      const dd = Math.hypot(x - f.x, z - f.z);
      if (dd > f.r + 1.4) continue;
      h = lerp(h, f.h, smooth(f.r + 1.4, f.r, dd));
    }
    return h;
  }
  const landD = (x, z) => Math.hypot(x, z) / coastR(Math.atan2(z, x));
  function waterR(th) { // the outer waterline along a direction (scanning in from the sea, so the pond never counts)
    const R = coastR(th), c = Math.cos(th), s = Math.sin(th);
    for (let r = R * 1.3; r > R * 0.4; r -= 0.03) if (H(c * r, s * r) >= 0) return r + 0.03;
    return R;
  }
  const nearTown = (x, z, m = 0) => Math.hypot(x - L.plaza.x, z - L.plaza.z + 3) < 16 + m; // the town and its edge

  // ---- ground, sea, foam, far islands
  function buildSurface(scene, { mat }) {
    const geo = new THREE.PlaneGeometry(200, 172, 500, 430);
    geo.rotateX(-Math.PI / 2);
    {
      const p = geo.attributes.position, cols = new Float32Array(p.count * 3);
      const sand = C(PALETTE.sand), wet = C(PALETTE.wetSand), under = C(0x9fd8c8), grass = C(PALETTE.grass), light = C(PALETTE.grassLight), dark = C(PALETTE.grassDark);
      const rock = C(PALETTE.rock), rockDark = C(PALETTE.rockDark), c = new THREE.Color(), g = new THREE.Color();
      const DESERT_SAND = C(0xebc27c), DESERT_SHADE = C(0xd39b5a), BEACH_SAND = C(0xf7e6b4), BEACH_GRASS = C(0x9ccf62), BEACH_WET = C(0xdcc08a), BEACH_FLOOR = C(0xe9e0b8);
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), z = p.getZ(i), h = H(x, z);
        p.setY(i, h);
        if (h < 0) c.copy(wet).lerp(under, smooth(0, -1.0, h));
        else c.copy(wet).lerp(sand, smooth(0.0, 0.12, h));
        g.copy(grass).lerp(light, smooth(0.5, 0.78, fbm(x * 0.09 + 3, z * 0.09 + 7)) * 0.7).lerp(dark, smooth(0.55, 0.8, fbm(x * 0.15 + 20, z * 0.15 + 2)) * 0.5);
        c.lerp(g, smooth(0.28, 0.4, h)); // a soft grass-to-sand blend
        // the desert's warm dunes and the beach's pale sand, blending softly into the home island's green
        const aw = areaW(x);
        if (aw.desert > 0) c.lerp(g.copy(DESERT_SAND).lerp(DESERT_SHADE, smooth(0.9, 0.3, (Math.sin(x * 0.21 + Math.sin(z * 0.12) * 2.2) + 1) / 2) * 0.5), aw.desert * smooth(-0.1, 0.12, h));
        if (aw.beach > 0) {
          if (h >= 0) c.lerp(g.copy(BEACH_SAND).lerp(BEACH_WET, smooth(0.2, 0.03, h)).lerp(BEACH_GRASS, smooth(0.6, 0.8, h)), aw.beach);
          else c.lerp(g.copy(BEACH_FLOOR).lerp(BEACH_WET, smooth(-0.15, 0, h)).lerp(under, smooth(-0.6, -1.4, h)), aw.beach);
        }
        if (h > -0.3) {
          const slope = Math.abs(H(x + 0.4, z) - H(x - 0.4, z)) + Math.abs(H(x, z + 0.4) - H(x, z - 0.4));
          const k = smooth(0.4, 0.8, slope);
          if (k > 0) c.lerp(g.copy(rock).lerp(rockDark, hash(Math.round(x * 2), Math.round(z * 2)) * 0.6), k);
        }
        cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
      geo.computeVertexNormals();
    }
    const terrain = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true }));
    terrain.receiveShadow = true;
    scene.add(terrain);

    const waterGeo = new THREE.PlaneGeometry(900, 900, 280, 280);
    waterGeo.rotateX(-Math.PI / 2);
    const waterBase = new Float32Array(waterGeo.attributes.position.count * 2);
    {
      const p = waterGeo.attributes.position, cols = new Float32Array(p.count * 4);
      const shallow = C(PALETTE.shallow), mid = C(PALETTE.sea), deep = C(PALETTE.deep), c = new THREE.Color();
      const turq = C(0x5fe3d2), lagoon = C(0x2fb8d0);
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), z = p.getZ(i);
        waterBase[i * 2] = x; waterBase[i * 2 + 1] = z;
        const depth = Math.abs(x) < 150 && Math.abs(z) < 90 ? -H(x, z) : 6;
        c.copy(shallow).lerp(mid, smooth(0.1, 1.5, depth)).lerp(deep, smooth(1.5, 4.3, depth));
        let a = 1;
        const bw = Math.abs(x) < 150 && Math.abs(z) < 90 ? areaW(x).beach * smooth(1.75, 1.3, areaD(L.areas.beach, x, z)) : 0;
        if (bw > 0) {
          const b = turq.clone().lerp(lagoon, smooth(0.35, 1.1, depth)).lerp(deep, smooth(1.4, 4.3, depth));
          c.lerp(b, bw);
          a = lerp(1, lerp(0.62, 1, smooth(0.3, 1.6, depth)), bw); // clear over the sand, so the floor shows through
        }
        cols[i * 4] = c.r; cols[i * 4 + 1] = c.g; cols[i * 4 + 2] = c.b; cols[i * 4 + 3] = a;
      }
      waterGeo.setAttribute('color', new THREE.BufferAttribute(cols, 4));
    }
    const waterMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.18, metalness: 0.05, flatShading: true, transparent: true, opacity: 0.8 });
    const water = new THREE.Mesh(waterGeo, waterMat);
    water.receiveShadow = true;
    scene.add(water);
    const farSea = new THREE.Mesh(new THREE.RingGeometry(440, 1600, 64, 1), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, metalness: 0.05 }));
    farSea.geometry.rotateX(-Math.PI / 2);
    const dc = C(PALETTE.deep);
    farSea.geometry.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(farSea.geometry.attributes.position.count * 3).fill(0).map((_, i) => [dc.r, dc.g, dc.b][i % 3]), 3));
    farSea.material.vertexColors = true;
    farSea.position.y = -0.06;
    scene.add(farSea);
    const waveY = (x, z, t) => 0.05 * Math.sin(x * 0.35 + t * 1.1) + 0.04 * Math.sin(z * 0.42 + t * 1.4) + 0.03 * Math.sin((x + z) * 0.8 + t * 2.0);

    const foamGeo = (() => {
      const N = 360, pos = [], uv = [], dir = [], idx = [];
      for (const [cx, cz, maxR] of [[0, -5, 72], [L.areas.desert.x, L.areas.desert.z, 38], [L.areas.beach.x, L.areas.beach.z, 40]]) {
        // the first waterline out from (cx, cz) in every direction; none (or a jump) leaves a gap, e.g. across a neck
        const rws = [];
        for (let i = 0; i <= N; i++) {
          const th = (i / N) * TAU, c = Math.cos(th), sn = Math.sin(th);
          let rw = null;
          for (let r = 4; r < maxR; r += 0.25) if (H(cx + c * r, cz + sn * r) < 0) { rw = r; break; }
          rws.push(rw);
        }
        for (let i = 0; i <= N; i++) {
          const th = (i / N) * TAU, c = Math.cos(th), sn = Math.sin(th), rw = rws[i] ?? 0, base = pos.length / 3;
          pos.push(cx + c * (rw - 0.2), 0, cz + sn * (rw - 0.2), cx + c * (rw + 0.8), 0, cz + sn * (rw + 0.8));
          uv.push(i / N, 0, i / N, 1);
          dir.push(c, sn, c, sn);
          const nx = rws[i + 1];
          if (i < N && rws[i] !== null && nx !== null && Math.abs(nx - rws[i]) < 3) idx.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setAttribute('aDir', new THREE.Float32BufferAttribute(dir, 2));
      g.setIndex(idx);
      return g;
    })();
    const makeFoam = (y) => {
      const m = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false,
        uniforms: { uTime: { value: 0 }, uOffset: { value: 0 }, uAlpha: { value: 1 }, uColor: { value: C(PALETTE.foam) }, uWidth: { value: 1 } },
        vertexShader: `
          attribute vec2 aDir; uniform float uOffset; uniform float uWidth; varying vec2 vUv;
          void main(){ vUv = uv; vec3 p = position + vec3(aDir.x, 0.0, aDir.y) * (uOffset + uv.y * (uWidth - 1.0));
            gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }`,
        fragmentShader: `
          uniform float uTime; uniform float uAlpha; uniform vec3 uColor; varying vec2 vUv;
          void main(){
            float edge = smoothstep(0.0, 0.12, vUv.y) * (1.0 - smoothstep(0.2, 0.9, vUv.y));
            float broken = 0.55 + 0.45 * sin(vUv.x * 420.0 + uTime * 1.3) * sin(vUv.x * 151.0 - uTime * 0.7);
            gl_FragColor = vec4(uColor, edge * clamp(broken, 0.0, 1.0) * uAlpha);
            #include <colorspace_fragment>
          }`,
      });
      const f = new THREE.Mesh(foamGeo, m);
      f.position.y = y; f.renderOrder = 2;
      scene.add(f);
      return m;
    };
    const foamA = makeFoam(0.1), foamB = makeFoam(0.11), foamEvent = makeFoam(0.12);
    // the river's own water: a ribbon along its course with slow flowing ripples and sparkles (and warm lamp glints
    // at night); it fades out where the river meets the sea
    const river = (() => {
      const pts = riverPolyline(L, 0.6), w = L.river.half + 0.9, pos = [], uv = [], idx = [];
      let run = 0;
      pts.forEach((q, i) => {
        const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
        if (i) run += Math.hypot(q.x - pts[i - 1].x, q.z - pts[i - 1].z);
        const nx = -dz / l, nz = dx / l;
        pos.push(q.x + nx * w, 0.03, q.z + nz * w, q.x - nx * w, 0.03, q.z - nz * w);
        uv.push(run, 0, run, 1);
        if (i + 1 < pts.length) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
      });
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      const m = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false,
        uniforms: { uTime: { value: 0 }, uLamp: { value: 0 }, uTint: { value: new THREE.Color(1, 1, 1) }, uLen: { value: run } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: `
          uniform float uTime; uniform float uLamp; uniform vec3 uTint; uniform float uLen; varying vec2 vUv;
          void main(){
            float across = abs(vUv.y - 0.5) * 2.0;
            vec3 c = mix(vec3(0.16, 0.58, 0.86), vec3(0.47, 0.88, 0.9), smoothstep(0.2, 1.0, across));
            float flow = sin(vUv.x * 2.2 - uTime * 1.4 + sin(vUv.y * 8.0 + vUv.x * 0.7) * 0.9) * 0.5 + 0.5;
            c += vec3(0.07) * flow;
            float sp = pow(max(0.0, sin(vUv.x * 9.0 - uTime * 2.1) * sin(vUv.y * 21.0 + uTime * 1.6 + vUv.x * 3.0)), 22.0);
            c += vec3(1.0) * sp * 0.75;
            c *= uTint;
            c += vec3(1.0, 0.72, 0.32) * uLamp * 0.45 * pow(max(0.0, sin(vUv.x * 1.3 + uTime * 0.5) * sin(vUv.y * 6.0 - uTime * 0.8)), 8.0);
            float a = (1.0 - smoothstep(0.72, 1.0, across)) * 0.8 * (1.0 - smoothstep(uLen - 9.0, uLen, vUv.x));
            gl_FragColor = vec4(c, a);
            #include <colorspace_fragment>
          }`,
      });
      const mesh_ = new THREE.Mesh(g, m); mesh_.renderOrder = 1; scene.add(mesh_);
      return m;
    })();
    foamEvent.uniforms.uAlpha.value = 0;
    const caustics = (() => {
      const a = L.areas.beach, x0 = a.x - a.rx * 1.75, x1 = a.x + a.rx * 0.6, z0 = a.z - a.rz * 1.6, z1 = a.z + a.rz * 1.6, step = 0.5;
      const nx = Math.round((x1 - x0) / step), nz = Math.round((z1 - z0) / step), pos = [], dep = [], idx = [];
      const keep = new Uint8Array((nx + 1) * (nz + 1));
      for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
        const x = x0 + i * step, z = z0 + j * step, h = H(x, z), k = j * (nx + 1) + i;
        pos.push(x, h + 0.035, z); dep.push(-h);
        keep[k] = h < 0.02 && h > -1.3 && areaW(x).beach > 0.3 ? 1 : 0;
      }
      for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
        const k = j * (nx + 1) + i;
        if (keep[k] || keep[k + 1] || keep[k + nx + 1] || keep[k + nx + 2]) idx.push(k, k + nx + 1, k + 1, k + 1, k + nx + 1, k + nx + 2);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('aDepth', new THREE.Float32BufferAttribute(dep, 1));
      g.setIndex(idx);
      const m = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        uniforms: { uTime: { value: 0 }, uTint: { value: new THREE.Color(1, 1, 1) }, uDay: { value: 1 } },
        vertexShader: 'attribute float aDepth; varying float vD; varying vec2 vP; void main(){ vD = aDepth; vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: `
          uniform float uTime; uniform vec3 uTint; uniform float uDay; varying float vD; varying vec2 vP;
          float cell(vec2 p){ vec2 q = p + vec2(sin(p.y * 1.3 + uTime * 0.7), cos(p.x * 1.1 - uTime * 0.6)) * 0.45;
            return abs(sin(q.x * 1.9) * sin(q.y * 1.9)); }
          void main(){
            vec2 p = vP * 0.9;
            float c = pow(1.0 - cell(p), 6.0) + pow(1.0 - cell(p * 1.37 + 5.0), 6.0) * 0.7; // soft bright webs
            float a = smoothstep(-0.02, 0.12, vD) * (1.0 - smoothstep(0.7, 1.25, vD));
            gl_FragColor = vec4(vec3(0.75, 1.0, 0.95) * uTint * c * a * 0.32 * (0.35 + 0.65 * uDay), 1.0);
            #include <colorspace_fragment>
          }`,
      });
      const cm = new THREE.Mesh(g, m); cm.renderOrder = -1; cm.frustumCulled = true; scene.add(cm);
      return m;
    })();
    // misty islands on the horizon (top left and top right in the painting)
    for (const [th, s] of [[-2.3, 1], [-1.9, 0.6], [-0.55, 0.55], [-0.2, 0.4]]) {
      const hill = new THREE.Mesh(new THREE.SphereGeometry(60, 12, 8, 0, TAU, 0, Math.PI / 2), mat('#6d9a90'));
      hill.scale.set(1.5 * s, 0.3 * s, 0.6 * s);
      hill.position.set(Math.cos(th) * 520, -2, Math.sin(th) * 520);
      hill.lookAt(0, -2, 0);
      scene.add(hill);
    }
    return { terrain, water, waterGeo, waterBase, waterMat, farSea, foamA, foamB, foamEvent, waveY, riverMat: river, causticsMat: caustics };
  }

  // ---- the scenery: town decor buildings, lighthouse, pond, rocks, plants, boats at sea
  function buildScenery(ctx) {
    const { scene, rr, rand, pick, mesh, mat, M, place, blocked, colliders, avoid, lampData, glowTex, makeAwning, makeBench, loop } = ctx;
    let volcano = null, capybaras = [];
    const leafSets = [[mat('#7dc64a'), mat('#5aa83e'), mat('#9ad65a')], [mat('#4f9e3c'), mat('#3a8a36'), mat('#6cba48')], [mat('#5fb048'), mat('#2f7a35'), mat('#86cc52')]];
    function makeTree(size = 1) {
      const g = new THREE.Group(), [mid, dark, light] = pick(leafSets);
      const h = rr(1.0, 1.4);
      g.add(mesh(new THREE.CylinderGeometry(0.15, 0.25, h, 7), M.trunk, 0, h / 2, 0));
      const crown = new THREE.Group(); crown.position.y = h; g.add(crown);
      crown.add(mesh(new THREE.IcosahedronGeometry(1.25, 1), mid, 0, 0.9, 0));
      const n = 4 + Math.floor(rand() * 3);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + rr(-0.3, 0.3), s = rr(0.65, 0.95), up = rr(0.4, 1.3);
        crown.add(mesh(new THREE.IcosahedronGeometry(s, 1), up > 0.95 ? light : up < 0.65 ? dark : mid, Math.cos(a) * rr(0.7, 1.0), up, Math.sin(a) * rr(0.7, 1.0)));
      }
      crown.add(mesh(new THREE.IcosahedronGeometry(0.75, 1), light, rr(-0.2, 0.2), 1.75, rr(-0.2, 0.2)));
      g.userData.sway = crown;
      g.scale.setScalar(size * rr(0.85, 1.12));
      return g;
    }
    function makePalm() {
      const g = new THREE.Group();
      const lean = rr(0.15, 0.35), segs = 6, h = rr(3.2, 4.0);
      let x = 0, y = 0;
      for (let i = 0; i < segs; i++) {
        const r = lerp(0.2, 0.13, i / segs);
        const seg = mesh(new THREE.CylinderGeometry(r * 0.9, r, h / segs + 0.05, 7), M.palmTrunk, x, y + h / segs / 2, 0);
        seg.rotation.z = -lean * (i / segs) * 0.8; g.add(seg);
        y += h / segs; x += lean * (i / segs) * 0.7;
      }
      const crown = new THREE.Group(); crown.position.set(x, y, 0); g.add(crown);
      for (let i = 0; i < 8; i++) {
        const pivot = new THREE.Group(); pivot.rotation.y = (i / 8) * TAU + rr(-0.2, 0.2);
        const leafGeo = new THREE.ConeGeometry(0.42, 2.1, 4); leafGeo.rotateX(Math.PI / 2); leafGeo.translate(0, 0, 1.05); leafGeo.scale(1, 0.18, 1);
        const leaf = mesh(leafGeo, i % 2 ? M.leaf : M.leafDark); leaf.rotation.x = rr(0.35, 0.65);
        pivot.add(leaf); crown.add(pivot);
      }
      for (let i = 0; i < 3; i++) crown.add(mesh(new THREE.SphereGeometry(0.14, 8, 6), mat('#8a6a3a'), Math.cos(i * 2.1) * 0.2, -0.15, Math.sin(i * 2.1) * 0.2));
      g.rotation.y = rr(0, TAU);
      g.userData.sway = crown;
      return g;
    }
    function makeBush() {
      const g = new THREE.Group(), [mid, dark, light] = pick(leafSets);
      for (let i = 0; i < 3; i++) g.add(mesh(new THREE.IcosahedronGeometry(rr(0.34, 0.5), 1), pick([mid, dark, light]), rr(-0.3, 0.3), 0.28, rr(-0.3, 0.3)));
      if (rand() < 0.4) for (let i = 0; i < 4; i++) { const a = rr(0, TAU); g.add(mesh(new THREE.SphereGeometry(0.07, 6, 4), pick([M.flowerW, M.flowerY, mat('#ff9ec4')]), Math.cos(a) * 0.45, rr(0.35, 0.6), Math.sin(a) * 0.45)); }
      return g;
    }
    const rockMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, flatShading: true });
    const rockGeos = [0, 1, 2, 3, 4].map((seed) => {
      const geo = new THREE.DodecahedronGeometry(1, 1);
      const p = geo.attributes.position, cols = new Float32Array(p.count * 3);
      const stone = C(PALETTE.rock), dark = C(PALETTE.rockDark), moss = C(PALETTE.moss), c = new THREE.Color();
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        const k = 1 + (hash(Math.round(x * 50) + seed * 17, Math.round(y * 50) + Math.round(z * 50) * 3.1) - 0.5) * 0.3;
        p.setXYZ(i, x * k, y * k * 0.78, z * k);
        c.copy(stone).lerp(dark, hash(x * 9 + seed, z * 7) * 0.8);
        if (y > 0.55) c.lerp(moss, 0.5);
        cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
      geo.computeVertexNormals();
      return geo;
    });
    const makeRock = (s) => { const r = mesh(pick(rockGeos), rockMat); r.scale.set(s * rr(0.8, 1.2), s * rr(0.7, 1.05), s * rr(0.8, 1.2)); r.rotation.y = rr(0, TAU); return r; };
    const pier = L.pier, nearPier = (x, z, m) => {
      const px = x - pier.root.x, pz = z - pier.root.z, along = px * pier.dir.x + pz * pier.dir.z, across = Math.abs(px * pier.dir.z - pz * pier.dir.x);
      return along > -3 && along < pier.len + 3 && across < m;
    };
    const windowLit = (g, x, y, z, w = 0.55, h = 0.5) => { const m = mesh(new THREE.BoxGeometry(w, h, 0.08), M.window, x, y, z); m.castShadow = false; g.add(m); };
    const pyramid = (w, d, h, color) => { const r = mesh(new THREE.ConeGeometry(Math.hypot(w, d) / 2, h, 4), mat(color)); r.rotation.y = Math.PI / 4; r.scale.set(w / Math.hypot(w, d) * Math.SQRT2, 1, d / Math.hypot(w, d) * Math.SQRT2); return r; };

    // town decor buildings from the painting (T3 cafe, T4 clock tower, T7 cottage), facing the viewer (+z)
    const wall = mat('#f4ecd8');
    for (const d of L.decor) {
      const g = new THREE.Group();
      if (d.kind === 'cafe') {
        g.add(mesh(new THREE.BoxGeometry(3.0, 2.0, 2.4), wall, 0, 1.0, 0));
        const roof = pyramid(3.4, 2.8, 1.1, '#e8e2d4'); roof.position.y = 2.55; g.add(roof);
        if (makeAwning) { const aw = makeAwning(3.0, '#d9584a'); aw.position.set(0, 1.75, 1.2); g.add(aw); }
        windowLit(g, -0.75, 1.0, 1.22, 0.9, 0.7); windowLit(g, 0.75, 1.0, 1.22, 0.9, 0.7);
        for (const x of [-0.9, 0.9]) { g.add(mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.05, 10), M.white, x, 0.7, 2.0)); g.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.7, 5), M.woodDark, x, 0.35, 2.0)); }
      } else if (d.kind === 'tower') {
        g.add(mesh(new THREE.BoxGeometry(2.0, 4.4, 2.0), wall, 0, 2.2, 0));
        g.add(mesh(new THREE.BoxGeometry(2.3, 0.25, 2.3), mat('#d9cdb5'), 0, 4.45, 0));
        const roof = pyramid(2.4, 2.4, 1.8, '#c2614a'); roof.position.y = 5.45; g.add(roof);
        const face = mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.08, 20), M.white, 0, 3.5, 1.02); face.rotation.x = Math.PI / 2; g.add(face);
        const hand = mesh(new THREE.BoxGeometry(0.06, 0.4, 0.04), M.woodDark, 0, 3.62, 1.08); g.add(hand);
        const hand2 = mesh(new THREE.BoxGeometry(0.3, 0.06, 0.04), M.woodDark, 0.12, 3.5, 1.08); g.add(hand2);
        g.add(mesh(new THREE.BoxGeometry(0.8, 1.3, 0.08), mat('#a8744a'), 0, 0.65, 1.02));
        windowLit(g, 0, 2.3, 1.02, 0.5, 0.7);
      } else {
        g.add(mesh(new THREE.BoxGeometry(2.2, 1.6, 2.0), wall, 0, 0.8, 0));
        const roof = pyramid(2.7, 2.5, 1.1, '#5b8fd6'); roof.position.y = 2.15; g.add(roof);
        g.add(mesh(new THREE.BoxGeometry(0.55, 0.95, 0.08), mat('#a8744a'), -0.4, 0.48, 1.02));
        windowLit(g, 0.5, 0.95, 1.02);
      }
      place(g, d.x, d.z, d.kind === 'cottage' ? 1.3 : 1.55, 3.4); // wide enough that nothing grows under the roof
    }

    // the lighthouse on the headland (L)
    const lighthouse = (() => {
      const g = new THREE.Group(), white = mat('#fbf6ec'), red = mat('#d9584a');
      g.add(mesh(new THREE.CylinderGeometry(1.4, 1.6, 0.5, 10), mat('#b9bec4'), 0, 0.2, 0));
      for (let i = 0; i < 4; i++) { const r0 = 1.05 - i * 0.11; g.add(mesh(new THREE.CylinderGeometry(r0 - 0.11, r0, 1.0, 12), i % 2 ? red : white, 0, 0.95 + i * 1.0, 0)); }
      g.add(mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.14, 12), M.woodDark, 0, 4.5, 0));
      for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; g.add(mesh(new THREE.BoxGeometry(0.05, 0.34, 0.05), white, Math.cos(a) * 0.85, 4.72, Math.sin(a) * 0.85)); }
      const lamp = mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.72, 10), M.lantern, 0, 4.95, 0); lamp.castShadow = false; g.add(lamp);
      g.add(mesh(new THREE.ConeGeometry(0.68, 0.66, 10), red, 0, 5.65, 0));
      g.add(mesh(new THREE.BoxGeometry(0.48, 0.8, 0.08), mat('#a8744a'), 0, 0.8, 1.1));
      g.rotation.y = Math.PI * 0.85; // the door looks down the road
      place(g, L.lighthouse.x, L.lighthouse.z, 1.5, 2.6);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
      glow.position.set(L.lighthouse.x, g.position.y + 4.95, L.lighthouse.z); glow.scale.set(4.2, 4.2, 1); scene.add(glow);
      lampData.push({ pos: glow.position.clone(), light: null, glow });
      return g;
    })();

    // the pond (left): its plants, animals and dock are built in main.js now. The old lily pads drew these random
    // numbers; they're still drawn (and not used) so everything placed after keeps exactly its old spot.
    {
      for (let i = 0; i < 6; i++) { rr(0, TAU); rr(0.6, POND.r - 1.3); rr(0.22, 0.34); rr(0.22, 0.34); rand(); }
      avoid.push({ x: POND.x, z: POND.z, r: POND.r + 0.6 });
    }

    // boulders: stacked at the feet of the cliffs (right side, headland), scattered on the bottom-left beach and by the
    // pier, and poking out of the shallows all round
    for (let i = 0; i < 480; i++) {
      const th = rr(0, TAU), rw = waterR(th), r = rw + rr(-1.0, 1.3), x = Math.cos(th) * r, z = Math.sin(th) * r;
      if (H(x, z) > 0.6 || joinW(x, z) > 0.3) continue; // that "coast" is inland now
      const rocky = rockyAt(x, z), bottomLeft = smooth(8, 18, z) * smooth(-4, -16, x);
      if (rand() > 0.15 + rocky * 0.85 + bottomLeft * 0.5 || nearPier(x, z, 2.2) || blocked(x, z, 0.3)) continue;
      const s = rr(0.4, 1.0) * (1 + rocky * 0.7);
      const rock = makeRock(s);
      rock.position.set(x, Math.max(H(x, z), -0.35) + s * 0.12, z);
      scene.add(rock);
      if (H(x, z) > -0.1) colliders.push({ x, z, r: s * 0.85 });
    }
    for (let i = 0; i < 80; i++) {
      const th = rr(0, TAU), r = coastR(th) * rr(1.05, 1.18), x = Math.cos(th) * r, z = Math.sin(th) * r;
      if (nearPier(x, z, 3)) continue;
      const s = rr(0.4, 1.0), rock = makeRock(s); rock.position.set(x, rr(-0.4, -0.1), z); scene.add(rock);
    }

    // plants: dense round trees between the loop road and the coast and on the headland, a few between the homes
    const swayers = [], palms = [], trees = [];
    function scatter(count, tries, test, make, colR, avoidR) {
      let placed = 0;
      for (let k = 0; k < tries && placed < count; k++) {
        const x = rr(-ISLAND.ax - 2, ISLAND.ax + 2), z = rr(-ISLAND.az - 6, ISLAND.az);
        if (landD(x, z) > 1 || !test(landD(x, z), H(x, z), x, z) || blocked(x, z, avoidR)) continue;
        const o = make(x, z);
        place(o, x, z, colR, avoidR);
        if (o.userData.sway) swayers.push({ o: o.userData.sway, ph: rand() * TAU });
        placed++;
      }
    }
    scatter(12, 8000, (d, h, x, z) => d > 0.84 && h > 0.12 && h < 0.45 && orig(x, z)[1] > 14 && !nearPier(x, z, 3), () => { const p = makePalm(); palms.push(p); return p; }, 0.4, 1.6);
    // groves: trees gather where a slow noise is high, with a scattering elsewhere; the town keeps only a few
    const grove = (x, z) => smooth(0.42, 0.62, fbm(x * 0.05 + 40, z * 0.05 + 9));
    scatter(430, 90000, (d, h, x, z) => d < 0.88 && h > 0.3 && rand() < (nearTown(x, z) ? 0.15 : 0.12 + grove(x, z) * 0.88), () => { const t = makeTree(rr(0.8, 1.1)); trees.push(t); return t; }, 0.45, 0.75); // canopies overlap, as in the painting
    scatter(150, 30000, (d, h) => d < 0.92 && h > 0.36, () => makeBush(), 0.4, 0.8);
    // flower patches on the open lawns
    {
      const petals = [mat('#ff9ec4'), mat('#fff27a'), mat('#ffffff'), mat('#c9a6ff'), mat('#ff8a6a')], stem = M.leafDark;
      let made = 0;
      for (let k = 0; k < 3000 && made < 30; k++) {
        const x = rr(-ISLAND.ax, ISLAND.ax), z = rr(-ISLAND.az, ISLAND.az);
        if (landD(x, z) > 0.85 || H(x, z) < 0.4 || blocked(x, z, 1.3) || nearTown(x, z)) continue;
        const col = pick(petals);
        for (let f = 0; f < 9; f++) {
          const fx = x + rr(-1.1, 1.1), fz = z + rr(-1.1, 1.1), y = H(fx, fz);
          scene.add(mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.22, 4), stem, fx, y + 0.11, fz));
          const head = mesh(new THREE.SphereGeometry(0.08, 6, 4), f % 4 ? col : M.flowerY, fx, y + 0.24, fz); head.scale.y = 0.6; scene.add(head);
        }
        avoid.push({ x, z, r: 1.3 });
        made++;
      }
    }
    // a few benches by the ring road (scenery to sit by; the plaza's seats are the ones players use)
    if (makeBench && loop) {
      let made = 0;
      for (const u of [0.06, 0.31, 0.56, 0.81]) {
        const i = Math.floor(u * loop.length), a = loop[i], b = loop[(i + 3) % loop.length];
        const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
        for (const side of [1, -1]) {
          const x = a.x - (dz / l) * 2.3 * side, z = a.z + (dx / l) * 2.3 * side;
          if (H(x, z) < 0.3 || blocked(x, z, 0.9)) continue;
          const bench = makeBench(); bench.rotation.y = Math.atan2(a.x - x, a.z - z);
          place(bench, x, z, 0.75, 1.3); made++;
          break;
        }
      }
    }
    // a picnic spot on the lawn near the pond: a checked blanket, a basket and two cushions
    {
      const { x, z } = L.picnic;
      if (!blocked(x, z, 1.4) && H(x, z) > 0.3) {
        const g = new THREE.Group();
        for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
          const t = mesh(new THREE.BoxGeometry(0.5, 0.03, 0.5), mat((i + j) % 2 ? '#e05a4f' : '#fbf6ec'), -0.75 + i * 0.5, 0.02, -0.75 + j * 0.5); t.castShadow = false; g.add(t);
        }
        g.add(mesh(new THREE.BoxGeometry(0.5, 0.3, 0.36), mat('#c9955f'), 0.4, 0.17, -0.3));
        const handle = mesh(new THREE.TorusGeometry(0.17, 0.025, 4, 10, Math.PI), M.woodDark, 0.4, 0.32, -0.3); g.add(handle);
        for (const [cx, cz] of [[-0.5, 0.4], [0.5, 0.5]]) g.add(mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.08, 10), mat('#7ab8f2'), cx, 0.06, cz));
        g.rotation.y = 0.4;
        place(g, x, z, 0, 1.8);
      }
    }
    const grassTufts = (() => {
      const tuftGeo = new THREE.ConeGeometry(0.07, 0.28, 3); tuftGeo.translate(0, 0.14, 0);
      const inst = new THREE.InstancedMesh(tuftGeo, mat('#6cb848'), 4200);
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), v = new THREE.Vector3();
      let n = 0;
      for (let k = 0; k < 40000 && n < 4200; k++) {
        const x = rr(-ISLAND.ax, ISLAND.ax), z = rr(-ISLAND.az - 5, ISLAND.az), h = H(x, z);
        if (h < 0.45 || landD(x, z) > 0.9 || blocked(x, z, 0.1)) continue;
        e.set(rr(-0.25, 0.25), rr(0, TAU), rr(-0.25, 0.25)); q.setFromEuler(e);
        s.setScalar(rr(0.7, 1.3));
        m4.compose(v.set(x, h - 0.02, z), q, s);
        inst.setMatrixAt(n++, m4);
      }
      inst.count = n; inst.receiveShadow = true;
      scene.add(inst);
      return inst;
    })();

    // small sailboats far out (top right and right of the painting)
    const sailboats = [];
    for (let i = 0; i < 4; i++) {
      const b = new THREE.Group();
      b.add(mesh(new THREE.BoxGeometry(0.9, 0.35, 2.6), M.white, 0, 0.1, 0));
      b.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.8, 5), M.woodDark, 0, 1.5, 0));
      const sail = new THREE.Mesh(new THREE.ConeGeometry(0.9, 2.4, 3), M.white); sail.position.set(0, 1.6, -0.35); sail.scale.set(0.1, 1, 1); b.add(sail);
      b.scale.setScalar(rr(1.3, 2.0));
      b.userData = { th: rr(-1.9, -0.4), r: rr(105, 170), sp: rr(0.003, 0.007) * (rand() > 0.5 ? 1 : -1), ph: rr(0, TAU) };
      scene.add(b); sailboats.push(b);
    }
    function updateSailboats(dt, t) {
      for (const b of sailboats) {
        const u = b.userData; u.th += u.sp * dt;
        b.position.set(Math.cos(u.th) * u.r, Math.sin(t * 0.8 + u.ph) * 0.08 - 0.05, Math.sin(u.th) * u.r);
        b.rotation.set(Math.sin(t * 0.9 + u.ph) * 0.05, -u.th + (u.sp > 0 ? 0 : Math.PI), Math.sin(t * 0.7 + u.ph) * 0.06);
      }
    }
    // the river banks: pebbles at the water's edge, a few rocks, clumps of reeds and flowers (never on a bridge)
    {
      const near = (x, z) => (ctx.bridges || []).some((b) => Math.hypot(b.x - x, b.z - z) < b.len / 2 + 1.5);
      const banks = riverPolyline(L, 0.9), pebbleGeo = new THREE.DodecahedronGeometry(0.12, 0);
      const pebbles = new THREE.InstancedMesh(pebbleGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true }), banks.length * 6);
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), v = new THREE.Vector3(), col = new THREE.Color();
      const tones = [0xc9c1b4, 0xb3aca2, 0xd8d0c2, 0x9d978f];
      const reed = mat('#6aa84a'), reedTop = mat('#8a6a3a'), petals = [mat('#ffffff'), mat('#fff27a'), mat('#c9a6ff')];
      let n = 0;
      banks.forEach((c, i) => {
        const a = banks[Math.max(0, i - 1)], b = banks[Math.min(banks.length - 1, i + 1)], dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1, nx = -dz / l, nz = dx / l;
        for (const side of [1, -1]) {
          for (let k = 0; k < 3; k++) {
            const off = L.river.half + rr(0.4, 1.6), x = c.x + nx * off * side + rr(-0.3, 0.3), z = c.z + nz * off * side + rr(-0.3, 0.3), y = H(x, z);
            if (y < -0.1 || landD(x, z) > 0.97 || near(x, z)) continue;
            q.setFromAxisAngle(v.set(0, 1, 0), rr(0, TAU)); sc.set(rr(0.7, 1.6), rr(0.5, 0.9), rr(0.7, 1.4));
            m4.compose(v.set(x, Math.max(y, -0.05) + 0.03, z), q, sc);
            pebbles.setColorAt(n, col.setHex(pick(tones))); pebbles.setMatrixAt(n++, m4);
          }
          const off = L.river.half + rr(1.0, 2.2), x = c.x + nx * off * side, z = c.z + nz * off * side, y = H(x, z);
          if (y < 0 || near(x, z)) continue;
          const roll = rand();
          if (roll < 0.06) { // a rock
            const s = rr(0.35, 0.7), rock = makeRock(s); rock.position.set(x, y + s * 0.1, z); scene.add(rock); colliders.push({ x, z, r: s * 0.8 });
          } else if (roll < 0.22) { // a clump of reeds with brown tips
            for (let r = 0; r < 5; r++) {
              const rx = x + rr(-0.3, 0.3), rz = z + rr(-0.3, 0.3), h = rr(0.6, 1.0);
              const st = mesh(new THREE.CylinderGeometry(0.02, 0.03, h, 4), reed, rx, H(rx, rz) + h / 2, rz); st.rotation.z = rr(-0.15, 0.15); scene.add(st);
              if (r % 2 === 0) scene.add(mesh(new THREE.CapsuleGeometry(0.04, 0.12, 2, 4), reedTop, rx, H(rx, rz) + h + 0.05, rz));
            }
          } else if (roll < 0.3) { // a few wild flowers
            const pc = pick(petals);
            for (let fl = 0; fl < 4; fl++) {
              const fx = x + rr(-0.4, 0.4), fz = z + rr(-0.4, 0.4), fy = H(fx, fz);
              scene.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.2, 4), M.leafDark, fx, fy + 0.1, fz));
              scene.add(mesh(new THREE.SphereGeometry(0.06, 6, 4), pc, fx, fy + 0.21, fz));
            }
          }
        }
      });
      pebbles.count = n; pebbles.receiveShadow = true; scene.add(pebbles);
    }
    // ---- the desert: cacti, red rocks, dry bushes, an oasis with palms, two adobe huts
    {
      const D = L.areas.desert, inD = (x, z) => areaD(D, x, z) < 0.9 && rawH(x, z) > 0.4;
      const cactusMat = mat('#5fa860'), cactusDark = mat('#4a8a4c'), flowerC = mat('#ff8fb0');
      function makeCactus() {
        const g = new THREE.Group(), h = rr(1.4, 2.4);
        g.add(mesh(new THREE.CapsuleGeometry(0.22, h, 4, 8), cactusMat, 0, h / 2 + 0.2, 0));
        for (const side of [-1, 1]) if (rand() < 0.75) {
          const y = rr(0.7, h * 0.7), arm = new THREE.Group(); arm.position.set(side * 0.22, y, 0); g.add(arm);
          const elbow = mesh(new THREE.CapsuleGeometry(0.13, 0.35, 3, 6), cactusDark, side * 0.25, 0, 0); elbow.rotation.z = Math.PI / 2; arm.add(elbow);
          arm.add(mesh(new THREE.CapsuleGeometry(0.13, rr(0.4, 0.7), 3, 6), cactusDark, side * 0.45, 0.3, 0));
        }
        if (rand() < 0.4) g.add(mesh(new THREE.SphereGeometry(0.1, 6, 4), flowerC, 0, h + 0.55, 0));
        g.rotation.y = rr(0, TAU);
        return g;
      }
      function makeDryBush() {
        const g = new THREE.Group(), stick = mat('#a07a50');
        for (let i = 0; i < 7; i++) { const a = rr(0, TAU), l = rr(0.4, 0.8), st = mesh(new THREE.CylinderGeometry(0.02, 0.03, l, 4), stick, Math.cos(a) * 0.12, l / 2, Math.sin(a) * 0.12); st.rotation.set(Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6); g.add(st); }
        g.add(mesh(new THREE.IcosahedronGeometry(0.22, 0), mat('#b8a060'), 0, 0.2, 0));
        return g;
      }
      const redRock = new THREE.MeshStandardMaterial({ color: 0xc98a62, roughness: 0.95, flatShading: true });
      const placeIn = (count, make, colR, avoidR, test = inD) => {
        let n = 0;
        for (let k = 0; k < count * 40 && n < count; k++) {
          const x = D.x + rr(-D.rx, D.rx), z = D.z + rr(-D.rz, D.rz);
          if (!test(x, z) || blocked(x, z, avoidR)) continue;
          place(make(), x, z, colR, avoidR); n++;
        }
      };
      // the oasis: palms round the pond (they give coconuts), reeds at the edge
      for (let i = 0; i < 7; i++) {
        const a = (i / 9) * TAU + rr(-0.2, 0.2), r = OASIS.r + rr(1.6, 3.2), x = OASIS.x + Math.cos(a) * r, z = OASIS.z + Math.sin(a) * r;
        if (rawH(x, z) < 0.15 || blocked(x, z, 1.2)) continue;
        const pm = makePalm(); place(pm, x, z, 0.4, 1.4); palms.push(pm); swayers.push({ o: pm.userData.sway, ph: rand() * TAU });
      }
      avoid.push({ x: OASIS.x, z: OASIS.z, r: OASIS.r + 1 });
      // ---- the cherry blossom volcano: a stout rocky cone with a pink glowing crater that puffs out blossom petals
      {
        const V = L.desert.volcano;
        let base = Infinity; for (let a = 0; a < TAU; a += 0.4) base = Math.min(base, rawH(V.x + Math.cos(a) * V.r, V.z + Math.sin(a) * V.r));
        const g = new THREE.Group(); g.position.set(V.x, base - 0.3, V.z); scene.add(g);
        const rockV = new THREE.MeshStandardMaterial({ color: 0x8a6f66, roughness: 0.95, flatShading: true });
        const cone = new THREE.Mesh(new THREE.CylinderGeometry(1.7, V.r, V.h, 11, 3), rockV); cone.position.y = V.h / 2; cone.castShadow = cone.receiveShadow = true; g.add(cone);
        { // a little irregularity, so it isn't a perfect cone
          const pa = cone.geometry.attributes.position;
          for (let i = 0; i < pa.count; i++) { const k = 1 + (hash(Math.round(pa.getX(i) * 7), Math.round(pa.getZ(i) * 7 + pa.getY(i) * 3)) - 0.5) * 0.16; if (pa.getY(i) < V.h / 2 - 0.01) pa.setXYZ(i, pa.getX(i) * k, pa.getY(i), pa.getZ(i) * k); }
          cone.geometry.computeVertexNormals();
        }
        for (let i = 0; i < 7; i++) { // pink blossom "lava" streaks running down the sides
          const a = (i / 7) * TAU + 0.3, streak = new THREE.Mesh(new THREE.BoxGeometry(0.35, V.h * 0.55, 0.12), new THREE.MeshStandardMaterial({ color: 0xffb3cf, emissive: 0xff7ab0, emissiveIntensity: 0.35, flatShading: true }));
          const rr0 = (1.7 + V.r) / 2 + 0.15; streak.position.set(Math.cos(a) * rr0, V.h * 0.62, Math.sin(a) * rr0);
          streak.lookAt(g.position.clone().add(new THREE.Vector3(0, V.h * 0.62, 0)).add(new THREE.Vector3(Math.cos(a) * 9, 0, Math.sin(a) * 9)));
          streak.rotateX(-Math.atan2(V.r - 1.7, V.h)); g.add(streak);
        }
        const crater = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.35, 0.2, 14), new THREE.MeshStandardMaterial({ color: 0xffc4dc, emissive: 0xff6aa8, emissiveIntensity: 0.6 }));
        crater.position.y = V.h - 0.05; g.add(crater);
        const rim = mesh(new THREE.TorusGeometry(1.55, 0.25, 6, 16), rockV, 0, V.h, 0); rim.rotation.x = Math.PI / 2; g.add(rim);
        const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xff9cc8, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.35 }));
        glow.position.set(V.x, base + V.h + 0.6, V.z); glow.scale.set(6, 6, 1); scene.add(glow);
        colliders.push({ x: V.x, z: V.z, r: V.r - 0.3 }); avoid.push({ x: V.x, z: V.z, r: V.r + 2.5 });
        // the petals: each one is flung up out of the crater, drifts on the wind and flutters down round the volcano
        const N = 420, pos = new Float32Array(N * 3), info = [];
        for (let i = 0; i < N; i++) info.push({ ph: rand(), a: rand() * TAU, out: 1.5 + rand() * 4.5, up: 6 + rand() * 6, spin: rand() * TAU });
        const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        const petalMat = new THREE.PointsMaterial({ map: glowTex, color: 0xffb8d4, size: 0.32, transparent: true, depthWrite: false });
        const petals = new THREE.Points(geo, petalMat); petals.frustumCulled = false; scene.add(petals);
        volcano = { top: new THREE.Vector3(V.x, base + V.h, V.z), info, geo, glow, crater: crater.material, petalMat };
      }
      // ---- capybaras round the oasis: chunky, calm, round-snouted; one soaks in the pond with an orange on its head
      {
        const fur = mat('#9a6b45'), furDark = mat('#7d5535'), nose = mat('#4a3426');
        const makeCapy = (soaking) => {
          const g = new THREE.Group();
          const body = mesh(new THREE.CapsuleGeometry(0.42, 0.7, 4, 10), fur, 0, 0.55, 0); body.rotation.x = Math.PI / 2; body.scale.set(1, 1, 0.9); g.add(body);
          const head = new THREE.Group(); head.position.set(0, 0.78, 0.62); g.add(head);
          head.add(mesh(new THREE.BoxGeometry(0.46, 0.42, 0.55), fur, 0, 0, 0.12));
          head.add(mesh(new THREE.BoxGeometry(0.4, 0.3, 0.12), furDark, 0, -0.04, 0.42)); // the blunt snout
          head.add(mesh(new THREE.BoxGeometry(0.16, 0.06, 0.04), nose, 0, 0.04, 0.48));
          for (const x of [-0.17, 0.17]) { head.add(mesh(new THREE.SphereGeometry(0.04, 6, 4), nose, x, 0.1, 0.28)); head.add(mesh(new THREE.SphereGeometry(0.07, 6, 4), furDark, x, 0.24, -0.06)); }
          if (!soaking) for (const [lx, lz] of [[-0.24, 0.35], [0.24, 0.35], [-0.24, -0.35], [0.24, -0.35]]) g.add(mesh(new THREE.CylinderGeometry(0.09, 0.08, 0.32, 6), furDark, lx, 0.16, lz));
          if (soaking) { head.add(mesh(new THREE.SphereGeometry(0.13, 8, 6), mat('#ffa13a'), 0, 0.32, 0.1)); head.add(mesh(new THREE.ConeGeometry(0.03, 0.06, 4), M.leafDark, 0.03, 0.46, 0.1)); }
          g.userData.head = head;
          return g;
        };
        capybaras = [];
        for (let k = 0; k < 120 && capybaras.length < 5; k++) { // five grown-ups lounging on the dry ground round the pond
          const a = rr(0, TAU), r = OASIS.r + rr(3.2, 6.5), x = OASIS.x + Math.cos(a) * r, z = OASIS.z + Math.sin(a) * r;
          if (rawH(x, z) < 0.25 || blocked(x, z, 0.7)) continue;
          const c = makeCapy(false); c.rotation.y = rr(0, TAU); place(c, x, z, 0.6, 1.2); c.scale.setScalar(rr(0.9, 1.1));
          capybaras.push({ g: c, ph: rand() * 20, base: c.rotation.y, y: c.position.y });
        }
        const soak = makeCapy(true); soak.position.set(OASIS.x + 0.6, -0.42, OASIS.z - 0.4); soak.rotation.y = 2.4; scene.add(soak);
        capybaras.push({ g: soak, ph: rand() * 20, base: soak.rotation.y, y: soak.position.y, soaking: true });
        const baby = makeCapy(false); baby.scale.setScalar(0.55); // a little one next to a grown-up
        if (capybaras[0]) { const c = capybaras[0].g; baby.position.set(c.position.x + 0.9, c.position.y, c.position.z + 0.5); baby.rotation.y = c.rotation.y; scene.add(baby); capybaras.push({ g: baby, ph: rand() * 20, base: baby.rotation.y, y: baby.position.y }); }
      }
      // two adobe huts: rounded warm walls, a flat roof with beams poking out, a blue door, pots by the wall
      const adobe = mat('#e2a873'), adobeDark = mat('#c98a58'), beam = mat('#8a6040');
      for (const hu of L.desert.huts) {
        const g = new THREE.Group();
        g.add(mesh(new THREE.BoxGeometry(3.2, 2.2, 2.8), adobe, 0, 1.1, 0));
        g.add(mesh(new THREE.BoxGeometry(3.4, 0.25, 3.0), adobeDark, 0, 2.3, 0));
        for (let i = -1; i <= 1; i++) { const bm = mesh(new THREE.CylinderGeometry(0.08, 0.08, 3.6, 6), beam, i * 0.9, 2.1, 0); bm.rotation.x = Math.PI / 2; g.add(bm); }
        g.add(mesh(new THREE.BoxGeometry(0.8, 1.4, 0.08), mat('#5b8fd6'), -0.6, 0.7, 1.41));
        const w = mesh(new THREE.BoxGeometry(0.6, 0.5, 0.08), M.window, 0.8, 1.3, 1.41); w.castShadow = false; g.add(w);
        for (const [px, pz, c] of [[1.9, 1.2, '#d07a50'], [2.1, 0.5, '#e8b04a']]) g.add(mesh(new THREE.CylinderGeometry(0.2, 0.14, 0.45, 8), mat(c), px, 0.22, pz));
        g.rotation.y = hu.face;
        place(g, hu.x, hu.z, 1.9, 3.2);
      }
      placeIn(26, makeCactus, 0.35, 1.4);
      placeIn(22, makeDryBush, 0, 0.8);
      placeIn(14, () => { const r = mesh(new THREE.DodecahedronGeometry(rr(0.5, 1.2), 0), redRock); r.scale.y = rr(0.5, 0.9); r.rotation.y = rr(0, TAU); return r; }, 0.8, 1.6);
    }
    // ---- the beach: palms, striped umbrellas with beach chairs, the boardwalk planks
    const beachPalms = [], palmShadows = [], beachInfo = { reefs: [] };
    {
      const B = L.areas.beach, inB = (x, z, lo = 0.12, hi = 2) => areaD(B, x, z) < 0.95 && rawH(x, z) > lo && rawH(x, z) < hi;
      let n = 0;
      for (let k = 0; k < 2000 && n < 13; k++) {
        const x = B.x + rr(-B.rx, B.rx), z = B.z + rr(-B.rz, B.rz);
        if (!inB(x, z, 0.15, 0.7) || blocked(x, z, 1.6)) continue;
        const pm = makePalm(); place(pm, x, z, 0.4, 1.6); palms.push(pm); beachPalms.push(pm); swayers.push({ o: pm.userData.sway, ph: rand() * TAU }); n++;
      }
      const stripes = [['#f29ab8', '#fbf0dc'], ['#6fd3d0', '#fbf0dc'], ['#f2c94c', '#ffffff'], ['#8fc0f0', '#ffffff']];
      n = 0;
      for (let k = 0; k < 2000 && n < 6; k++) {
        const x = B.x + rr(-B.rx * 0.8, B.rx * 0.8), z = B.z + rr(-B.rz * 0.8, B.rz * 0.8);
        if (!inB(x, z, 0.12, 0.45) || blocked(x, z, 2.2)) continue;
        const g = new THREE.Group(), [c1, c2] = pick(stripes);
        g.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.2, 5), M.white, 0, 1.1, 0));
        const geo = new THREE.ConeGeometry(1.25, 0.5, 8, 1, true); geo.clearGroups(); for (let i = 0; i < 8; i++) geo.addGroup(i * 6, 6, i % 2);
        const top = new THREE.Mesh(geo, [mat(c1, { side: THREE.DoubleSide }), mat(c2, { side: THREE.DoubleSide })]); top.position.y = 2.2; top.castShadow = true; g.add(top);
        const pair = { g, top, chairs: [] }; (beachInfo.loungers = beachInfo.loungers || []).push(pair);
        for (const side of [-1, 1]) { // two loungers
          const ch = new THREE.Group(); pair.chairs.push(ch); ch.position.set(side * 1.2, 0, 0.8); ch.rotation.y = side * 0.2; g.add(ch);
          ch.add(mesh(new THREE.BoxGeometry(0.6, 0.06, 1.3), mat(c1), 0, 0.3, 0));
          const back = mesh(new THREE.BoxGeometry(0.6, 0.06, 0.6), mat(c1), 0, 0.5, -0.75); back.rotation.x = 0.7; ch.add(back);
          for (const lz of [-0.5, 0.5]) for (const lx of [-0.25, 0.25]) ch.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.3, 4), M.white, lx, 0.15, lz));
        }
        g.rotation.y = rr(0, TAU);
        { // turn the pair to face the sea (the nearest open water), so whoever lies on them gets the view
          let best = 99, seaA = g.rotation.y;
          for (let a = 0; a < TAU; a += TAU / 24) for (let d = 1; d < Math.min(best, 30); d += 0.5) if (rawH(x + Math.sin(a) * d, z + Math.cos(a) * d) < 0) { if (d < best) { best = d; seaA = a; } break; }
          // as close to facing the sea as keeps both loungers on dry sand
          const dry = (a, f) => [-1, 1].every((sd) => rawH(x + sd * 1.2 * Math.cos(a) + f * 1.3 * Math.sin(a), z - sd * 1.2 * Math.sin(a) + f * 1.3 * Math.cos(a)) > 0.15);
          let done = best >= 99;
          for (const off of [0, 0.25, -0.25, 0.5, -0.5, 0.8, -0.8]) if (!done && dry(seaA + off, 1)) { g.rotation.y = seaA + off; done = true; }
          if (!done && dry(seaA, -1)) { // right by the water: the loungers go on the land side of the parasol, still facing the sea
            g.rotation.y = seaA; for (const ch of pair.chairs) ch.position.z = -0.8;
          }
        }
        place(g, x, z, 0.3, 2.2);
        for (const ch of pair.chairs) { const c = Math.cos(g.rotation.y), sn = Math.sin(g.rotation.y), lx = ch.position.x, lz = ch.position.z; colliders.push({ x: x + lx * c + lz * sn, z: z - lx * sn + lz * c, r: 0.5 }); } // each lounger
        n++;
      }
      // a little beach hut: a white-and-teal box with a striped awning and a surfboard leaning on it
      {
        const h = L.beach.hut, g = new THREE.Group(), teal = mat('#6fd3d0');
        g.add(mesh(new THREE.BoxGeometry(3.0, 2.0, 2.4), M.white, 0, 1.0, 0));
        g.add(mesh(new THREE.BoxGeometry(3.3, 0.3, 2.7), teal, 0, 2.15, 0));
        if (makeAwning) { const aw = makeAwning(3.0, '#6fd3d0'); aw.position.set(0, 1.7, 1.2); g.add(aw); }
        const win = mesh(new THREE.BoxGeometry(1.6, 0.7, 0.08), M.window, 0, 1.15, 1.21); win.castShadow = false; g.add(win);
        g.add(mesh(new THREE.BoxGeometry(1.8, 0.1, 0.4), M.wood, 0, 0.8, 1.35)); // the counter
        const board = mesh(new THREE.CapsuleGeometry(0.22, 1.5, 3, 8), mat('#f2c94c'), 1.75, 0.95, 0.4); board.rotation.z = 0.25; board.scale.z = 0.25; g.add(board);
        g.rotation.y = h.face;
        place(g, h.x, h.z, 1.7, 3.2);
      }
      // the lifeguard tower: a red-and-white hut on four tall legs with a ladder, a flag and a ring buoy
      {
        const t = L.beach.tower, g = new THREE.Group(), red = mat('#e0584a'), white = M.white;
        for (const [lx, lz] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]]) g.add(mesh(new THREE.CylinderGeometry(0.07, 0.09, 2.4, 6), white, lx, 1.2, lz));
        g.add(mesh(new THREE.BoxGeometry(2.3, 0.15, 2.3), M.wood, 0, 2.45, 0));
        g.add(mesh(new THREE.BoxGeometry(1.7, 1.1, 1.7), red, 0, 3.05, 0));
        const roof = mesh(new THREE.ConeGeometry(1.5, 0.6, 4), white, 0, 3.9, 0); roof.rotation.y = Math.PI / 4; g.add(roof);
        for (let i = 0; i < 6; i++) g.add(mesh(new THREE.BoxGeometry(0.6, 0.05, 0.08), M.wood, 0, 0.3 + i * 0.4, 1.35)); // ladder rungs
        for (const lx of [-0.3, 0.3]) g.add(mesh(new THREE.BoxGeometry(0.06, 2.4, 0.06), M.wood, lx, 1.2, 1.35));
        g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.2, 4), M.woodDark, 0.8, 4.4, -0.8));
        const flag = mesh(new THREE.BoxGeometry(0.6, 0.35, 0.03), red, 1.1, 4.8, -0.8); g.add(flag);
        const buoy = mesh(new THREE.TorusGeometry(0.28, 0.08, 6, 12), mat('#ff8a3a'), 0, 3.0, 0.88); g.add(buoy);
        g.rotation.y = -Math.PI / 2; // looking west, out to sea
        place(g, t.x, t.z, 1.4, 2.6);
      }
      // everything new here uses its own little random sequence, so the rest of the island stays exactly as it was
      let seed = 917331;
      const br = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
      const brr = (a0, b0) => a0 + br() * (b0 - a0), bpick = (arr) => arr[Math.floor(br() * arr.length)];
      const nearBeach = (x, z) => areaW(x).beach > 0.6 && areaD(B, x, z) < 1.5;
      const rockM = mat('#a39d94'), rockM2 = mat('#8e9a95'), coralCols = ['#ff8fb8', '#b48ce8', '#f6d55c', '#4fd1c5', '#ff9f7a'];
      const coralPiece = (g, kind, col, x, y, z, k) => {
        const cm = mat(col);
        if (kind === 0) { // branching coral: a little bunch of rounded fingers
          for (let i = 0; i < 4; i++) { const a = i * 1.6 + k, f = mesh(new THREE.CylinderGeometry(0.035, 0.06, 0.34, 5), cm, x + Math.cos(a) * 0.07, y + 0.15, z + Math.sin(a) * 0.07); f.rotation.set(Math.sin(a) * 0.5, 0, Math.cos(a) * 0.5); g.add(f); g.add(mesh(new THREE.SphereGeometry(0.045, 5, 4), cm, x + Math.cos(a) * 0.15, y + 0.31, z + Math.sin(a) * 0.15)); }
        } else if (kind === 1) { // brain coral: a squashed ball
          const b = mesh(new THREE.IcosahedronGeometry(0.2, 1), cm, x, y + 0.08, z); b.scale.y = 0.65; g.add(b);
        } else if (kind === 2) { // fan coral: a flat round fan
          const f = mesh(new THREE.CircleGeometry(0.24, 7), mat(col, { side: THREE.DoubleSide }), x, y + 0.24, z); f.rotation.y = k; g.add(f);
          g.add(mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.12, 4), cm, x, y + 0.05, z));
        } else { // a sea plant: tall thin blades
          for (let i = 0; i < 3; i++) { const bl = mesh(new THREE.ConeGeometry(0.04, brr(0.4, 0.7), 4), mat('#5cbf7a'), x + (i - 1) * 0.06, y + 0.22, z); bl.rotation.z = (i - 1) * 0.25; g.add(bl); }
        }
      };
      const reefs = [];
      for (let k = 0, n = 0; k < 3000 && n < 8; k++) { // rocks in the shallows, covered in coral
        const x = B.x + brr(-B.rx * 1.6, B.rx * 0.4), z = B.z + brr(-B.rz * 1.5, B.rz * 1.5), h = rawH(x, z);
        if (!nearBeach(x, z) || h > -0.2 || h < -0.65 || blocked(x, z, 2.4) || reefs.some((r) => Math.hypot(r.x - x, r.z - z) < 6)) continue;
        const sc = brr(0.8, 1.3), g = new THREE.Group();
        const base = mesh(new THREE.DodecahedronGeometry(0.75 * sc, 0), n % 2 ? rockM : rockM2, 0, 0.15, 0); base.scale.set(1.2, 0.75, 1); base.rotation.y = brr(0, TAU); g.add(base);
        const top = 0.15 + 0.55 * sc;
        for (let i = 0; i < 6; i++) { const a = i * 1.05 + brr(0, 0.6), r = 0.35 * sc * (i % 3 === 0 ? 0.2 : 1); coralPiece(g, i % 4, bpick(coralCols), Math.cos(a) * r, top - 0.12 - (r > 0.1 ? 0.1 : 0), Math.sin(a) * r, a); }
        for (let i = 0; i < 3; i++) { const a = brr(0, TAU), r = 0.95 * sc; coralPiece(g, i === 0 ? 3 : bpick([0, 1, 3]), bpick(coralCols), Math.cos(a) * r, -0.05, Math.sin(a) * r, a); }
        g.position.set(x, h, z); scene.add(g);
        colliders.push({ x, z, r: 0.85 * sc }); avoid.push({ x, z, r: 1.6 * sc });
        reefs.push({ x, z, r: 0.85 * sc }); n++;
      }
      for (let k = 0, n = 0; k < 2000 && n < 5; k++) { // a few big smooth rocks on the sand
        const x = B.x + brr(-B.rx, B.rx * 0.5), z = B.z + brr(-B.rz, B.rz), h = rawH(x, z);
        if (!nearBeach(x, z) || h < 0.08 || h > 0.45 || blocked(x, z, 1.5)) continue;
        const sc = brr(0.7, 1.2), r = mesh(new THREE.DodecahedronGeometry(0.8 * sc, 1), rockM, 0, 0.3 * sc, 0); r.scale.set(1.3, 0.7, 1); r.rotation.y = brr(0, TAU);
        const g = new THREE.Group(); g.add(r); g.position.set(x, h - 0.05, z); scene.add(g);
        colliders.push({ x, z, r: 0.9 * sc }); avoid.push({ x, z, r: 1.4 * sc }); n++;
      }
      { // pebbles by the water's edge and seagrass in the shallows (instanced: cheap however many)
        const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sv = new THREE.Vector3();
        const pebbles = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.08, 0), mat('#c9c2b6'), 70);
        const grass = new THREE.InstancedMesh(new THREE.ConeGeometry(0.05, 0.5, 4), mat('#4fb37a'), 90);
        let np = 0, ng = 0;
        for (let k = 0; k < 6000 && (np < 70 || ng < 90); k++) {
          const x = B.x + brr(-B.rx * 1.6, B.rx * 0.5), z = B.z + brr(-B.rz * 1.5, B.rz * 1.5), h = rawH(x, z);
          if (!nearBeach(x, z) || blocked(x, z, 0.3)) continue;
          if (np < 70 && h > -0.15 && h < 0.25) { e.set(brr(0, 3), brr(0, 3), 0); sv.set(1, 0.6, 1).multiplyScalar(brr(0.6, 1.6)); pebbles.setMatrixAt(np++, m4.compose(v.set(x, h + 0.02, z), q.setFromEuler(e), sv)); }
          else if (ng < 90 && h < -0.2 && h > -0.7) { const cx = x, cz = z; for (let i = 0; i < 3 && ng < 90; i++) { e.set(brr(-0.3, 0.3), 0, brr(-0.3, 0.3)); sv.set(1, brr(0.7, 1.3), 1); grass.setMatrixAt(ng++, m4.compose(v.set(cx + brr(-0.15, 0.15), h + 0.2, cz + brr(-0.15, 0.15)), q.setFromEuler(e), sv)); } }
        }
        pebbles.count = np; grass.count = ng; pebbles.castShadow = false;
        scene.add(pebbles, grass);
      }
      // soft palm shadows on the sand: a frond-shaped shadow under every beach palm, gently swaying with it
      if (typeof document !== 'undefined') {
        const cv = document.createElement('canvas'); cv.width = cv.height = 128;
        const c2 = cv.getContext('2d');
        if (c2 && c2.translate) {
          c2.translate(64, 64); c2.fillStyle = 'rgba(0,0,0,1)';
          for (let i = 0; i < 7; i++) { c2.rotate(TAU / 7); c2.beginPath(); c2.ellipse(30, 0, 30, 8, 0, 0, TAU); c2.fill(); }
          c2.beginPath(); c2.arc(0, 0, 10, 0, TAU); c2.fill();
        }
        const tex = new THREE.CanvasTexture(cv);
        const shM = new THREE.MeshBasicMaterial({ map: tex, color: 0x3a2a10, transparent: true, opacity: 0.2, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
        for (const pm of beachPalms) {
          const sh = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 4.2), shM); sh.rotation.x = -Math.PI / 2; sh.rotation.z = brr(0, TAU);
          const x = pm.position.x + 1.1, z = pm.position.z + 0.7;
          sh.position.set(x, Math.max(rawH(x, z), 0) + 0.04, z); sh.renderOrder = 1; scene.add(sh);
          palmShadows.push({ o: sh, ph: brr(0, TAU) });
        }
      }
      // soft lamps along the beach path (they glow at dusk and night with every other lamp)
      if (glowTex) {
        const bwp = L.beach.boardwalk;
        for (let i = 0; i + 1 < bwp.length; i++) {
          const [ax, az] = bwp[i], [bx, bz] = bwp[i + 1], len = Math.hypot(bx - ax, bz - az), nx = -(bz - az) / len, nz = (bx - ax) / len;
          for (let u = 0.25; u < 1; u += 0.5) {
            const side = (i + (u > 0.5 ? 1 : 0)) % 2 ? 1 : -1, x = lerp(ax, bx, u) + nx * 1.6 * side, z = lerp(az, bz, u) + nz * 1.6 * side, y = Math.max(rawH(x, z), 0);
            if (y <= 0.05) continue;
            const g = new THREE.Group();
            g.add(mesh(new THREE.CylinderGeometry(0.05, 0.07, 1.5, 6), M.woodDark, 0, 0.75, 0));
            const lan = mesh(new THREE.BoxGeometry(0.22, 0.26, 0.22), M.lantern, 0, 1.6, 0); lan.castShadow = false; g.add(lan);
            g.add(mesh(new THREE.ConeGeometry(0.2, 0.14, 4), M.woodDark, 0, 1.8, 0));
            g.position.set(x, y, z); scene.add(g);
            const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
            glow.position.set(x, y + 1.6, z); glow.scale.set(1.5, 1.5, 1); scene.add(glow);
            lampData.push({ pos: glow.position.clone(), light: null, glow });
            colliders.push({ x, z, r: 0.12 }); avoid.push({ x, z, r: 0.6 });
          }
        }
      }
      beachInfo.reefs = reefs;
      // the boardwalk: weathered planks laid across the walk from the road to the big pier
      const bw = L.beach.boardwalk, plankA = mat('#c9a06e'), plankB = mat('#b48a5a');
      for (let i = 0; i + 1 < bw.length; i++) {
        const [ax, az] = bw[i], [bx, bz] = bw[i + 1], len = Math.hypot(bx - ax, bz - az), m = Math.round(len / 0.45), yaw = Math.atan2(bx - ax, bz - az);
        for (let k = 0; k < m; k++) {
          const u = (k + 0.5) / m, x = lerp(ax, bx, u), z = lerp(az, bz, u);
          const pl = mesh(new THREE.BoxGeometry(2.2, 0.08, 0.38), k % 3 ? plankA : plankB, x, Math.max(rawH(x, z), 0) + 0.06, z); pl.rotation.y = yaw; pl.castShadow = false; scene.add(pl);
        }
      }
    }
    // the volcano's petals and the capybaras' gentle idling, every frame
    function updateDesert(t, nightGlow) {
      if (volcano) {
        const p = volcano.geo.attributes.position, T = 7; // seconds from crater to ground
        volcano.info.forEach((o, i) => {
          const u = (t / T + o.ph) % 1, k = u * T;
          const x = volcano.top.x + Math.cos(o.a) * o.out * u * 2 + Math.sin(t * 1.1 + o.spin) * 0.4 * u;
          const z = volcano.top.z + Math.sin(o.a) * o.out * u * 2 + Math.cos(t * 0.9 + o.spin) * 0.4 * u;
          const y = Math.max(volcano.top.y + o.up * k * 0.55 - 1.1 * k * k, rawH(x, z) + 0.05);
          p.setXYZ(i, x, y, z);
        });
        p.needsUpdate = true;
        const puff = 0.5 + 0.5 * Math.sin(t * 0.8);
        volcano.crater.emissiveIntensity = 0.45 + puff * 0.35 + nightGlow * 0.6;
        volcano.glow.material.opacity = 0.2 + puff * 0.15 + nightGlow * 0.4;
        volcano.petalMat.color.setRGB(1, 0.72 + 0.1 * (1 - nightGlow), 0.83);
      }
      for (const s of palmShadows) s.o.rotation.z += Math.sin(t * 0.8 + s.ph) * 0.0006; // the fronds' shadows sway a touch
      for (const c of capybaras) { // a slow look about, a nibble now and then; the soaking one bobs
        const h = c.g.userData.head;
        h.rotation.y = Math.sin(t * 0.3 + c.ph) * 0.4;
        h.rotation.x = Math.max(0, Math.sin(t * 0.45 + c.ph * 1.7)) * 0.35;
        if (c.soaking) c.g.position.y = c.y + Math.sin(t * 0.9 + c.ph) * 0.03;
      }
    }
    return { palms, trees, swayers, grassTufts, lighthouse, sailboats, updateSailboats, updateDesert, capybaras: () => capybaras, volcano: () => volcano, beach: beachInfo };
  }

  return { ISLAND, HILL, POND, coastR, rockyAt, rawH, setFlats, H, landD, waterR, nearTown, riverDist, areaAt, areaW, randomInArea, buildSurface, buildScenery };
}
