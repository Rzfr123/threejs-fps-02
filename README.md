# VOIDLINE — a three.js tactical FPS

[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/Rzfr123/threejs-fps-02/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/Rzfr123/threejs-fps-02/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

A round-based tactical shooter in the Counter-Strike style, built on three.js
0.187.0. One player plus four named bot teammates (NOVA) attack two bomb sites
against five defending robot squads (VOID) on "Helix Station", an orbital
station at the edge of the void — two glowing reactor towers, a mag-rail beam
over the core hall, neon conduits and holo pads marking sites A and B.
12 rounds, first to 7.

## How it plays

- **Objective:** plant the void charge on site A or B (hold E), or wipe the
  other team out. Defenders win by defusing, by running the 100 s clock out,
  or by elimination. A planted charge ticks 35 s, then detonates.
- **Arsenal:** LX-9 laser sidearm (free), VX-7 plasma rifle ($2700), PX-9
  pulse SMG ($1500), and the RG-1 railgun ($4100) — one shot, 95 damage,
  near-perfect accuracy, a slow 1.15 s cycle with a charge coil that burns
  bright when the next shot is ready. Every gun has its own procedural
  viewmodel, muzzle flash colour, tracer colour and synth voice.
- **Economy:** $800 start, $300 per kill, $300 per plant, $3250 round win,
  $1400 round loss. Buy phase (B) also sells the plasma charge ($300), ion
  veil ($400, a 12 s violet cloud that hides you from every bot's vision),
  Aegis vest ($650) and a defuse kit ($400, halves defuse time).
- **Gunplay:** hitscan with headshots (2.5x), recoil, spread that punishes
  firing on the move, distance falloff, reloads, crouch and jump, and AABB
  collision with the map.
- **Bots:** low-poly combat robots with glowing cores and visor strips, name
  tags and radio callouts ("go go, executing A", "Contact at Core Hall —
  engaging"). Each round picks a tactic (split, rush A, rush B, mid push);
  bots play profiles — rusher (fast pulse SMG), holder (heavy plasma),
  support (throws the ion veil at the site gate before a push), and one
  defender roams mid. Waypoint routes per lane, line-of-sight vision with
  reaction delays, burst fire, hearing nearby gunfire, planting and defusing.
  The veil blocks bot vision both ways. Walk cycles and aim poses are
  animated; tracers are coloured by the shooter's gun.
- **HUD:** minimap with sites and live dots, location name, health/armour,
  money, round timer, score, alive counts, kill feed with weapon and
  headshots, radio line, weapon slots + utility, bomb banner, plant/defuse
  progress, hit marker, buy menu.

## Run it

`node serve.ts`, then open http://localhost:8080 in desktop Chrome.
No network, no build step — static files only.

## Shots

`?shot=start|play|end&seed=N` renders a deterministic frame for screenshots.
The cover is the play frame: live combat in the core hall.
