# SANDLINE — a three.js tactical FPS

A round-based tactical shooter in the Counter-Strike style, built on three.js
0.187.0. One player plus four named bot teammates (SANDLINE) attack two bomb
sites against five defending bots (VULTURES) in "Silo Yard", a decommissioned
grain yard at dusk — two rusted silo towers, a gantry crane over the mill hall,
and painted A/B site letters on the north wall. 12 rounds, first to 7.

## How it plays

- **Objective:** plant the charge on site A or B (hold E), or wipe the other
  team out. Defenders win by defusing, by running the 100 s clock out, or by
  elimination. A planted bomb ticks 35 s, then detonates.
- **Economy:** $800 start, $300 per kill, $300 per plant, $3250 round win,
  $1400 round loss. Buy phase (B) sells the VK-7 rifle ($2700), RAT-9 SMG
  ($1500), frag grenade ($300), Kevlar ($650) and a defuse kit ($400, halves
  defuse time). Pistol is free.
- **Gunplay:** hitscan with headshots (2.5x), recoil, spread that punishes
  firing on the move, distance falloff, reloads, crouch and jump, and AABB
  collision with the map.
- **Bots:** named (Dune, Vex, Sable, Rook, Fennec, Mira, Jolt, Pike, Nadir,
  Onyx) with name tags and radio callouts ("go go, executing A", "Contact at
  Mill Hall — engaging"). Waypoint routes per lane, line-of-sight vision with
  reaction delays, burst fire, hearing nearby gunfire, planting and defusing.
- **HUD:** minimap with sites and live dots, location name, health/armour,
  money, round timer, score, alive counts, kill feed with weapon and
  headshots, radio line, weapon slots + utility, bomb banner, plant/defuse
  progress, hit marker, buy menu.

## Run it

`node serve.ts`, then open http://localhost:8080 in desktop Chrome.
No network, no build step — static files only.

## Shots

`?shot=start|play|end&seed=N` renders a deterministic frame for screenshots.
The cover is the play frame: live combat in the mill hall.
