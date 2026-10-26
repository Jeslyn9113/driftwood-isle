# 🏝️ Driftwood Isle

A cozy, low-poly multiplayer island game that runs in the browser. Wander a pastel island with friends, decorate your own house, grow a garden, fish, catch bugs, ride the Ferris wheel, and sell your finds to Bo, the traveling trader. The day, dusk and night cycle follows real Malaysia time.

Built with [Three.js](https://threejs.org/) on the client and a small Node.js WebSocket server.

## Features

- **One shared island:** a green home area with a town plaza, fountain, shops, a river with bridges, a lighthouse, and a beach region and a desert region grown onto its sides.
- **Your own home:** 8 hedged yards, each with a house you can enter and decorate with the House Tool (drafts save only when you tap Save), plus a vegetable garden.
- **Gardening:** plant, water and harvest carrots, tomatoes and cabbages. Visitors can help water your sprouts, and golden stars show when they do.
- **Tools:** axe for fruit trees, watering can, fishing rod (small fish, big fish, shells and starfish) and bug net (butterflies, beetles, dragonflies, desert scarabs and lizards, beach crabs).
- **Energy and backpack:** actions cost energy, and fruit and veggies refill it.
- **Coins and trading:** Bo walks the loop road around the homes and buys your finds at fixed prices.
- **Town folk:** shopkeepers Mira, Tess, Pip and Oak chat with greetings that change with the time of day.
- **Rides:** a Ferris wheel and a merry-go-round, synced for everyone.
- **Little extras:** benches and a swing, string lights, cherry blossom trees, capybaras by the desert oasis, and a volcano that erupts cherry blossom petals.
- **Multiplayer:** accounts with login, other players visible in real time, and everything that matters (items, coins, gardens, rides) checked by the server.

## Getting started

You need [Node.js](https://nodejs.org/) 22 or newer.

```bash
npm install
node server.js
```

Then open http://localhost:8000 in your browser, create an account, and play. Open more browser windows (or invite friends on your network) to play together.

On Windows you can also double-click `start.bat`. It starts the server and a Cloudflare tunnel (`cloudflared` must be installed) so friends outside your network can join.

## How to play

| Action | Mouse | Touch |
| --- | --- | --- |
| Walk | Click the ground | Tap the ground |
| Look around | Drag | Drag with one finger |
| Zoom | Scroll wheel | Pinch |
| Use a tool | Pick it from the toolbox, then click a tree, the water, a bug or a garden square | Same, with taps |
| Talk, sit, ride, enter | Click the floating circle buttons | Tap them |

Keys `1`, `2` and `3` preview day, dusk and night, and `0` returns to real time.

## Project layout

| File | What it does |
| --- | --- |
| `index.html` | The page, its UI (HUD, panels, popups) and styles |
| `main.js` | The game client: player, tools, town, homes, NPCs, rides, networking |
| `island.js` | The island's layout, terrain, water and scenery; also used by the server for shared positions |
| `server.js` | The game server: accounts, saved progress, items, prices, Bo's route, rides |
| `lib/three.module.js` | Three.js |

The server writes `accounts.json` (player accounts) and `state.json` (the world) next to `server.js`. They're kept out of the repository on purpose.
