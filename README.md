# Bouncy Tower

A browser tribute to the classic **Icy Tower** (Free Lunch Design). Climb an endless tower, build up speed, bounce off the walls and chain multi-floor combos before the screen catches you.

**Play:** https://matanbe20.github.io/bouncy_tower/

## Controls

| Key | Action |
| --- | --- |
| ← / → (or A / D) | Run (build up speed) |
| Space / ↑ (or W) | Jump (the faster you run, the higher you jump) |
| Esc / P | Pause |

Touch devices get an on-screen pad automatically.

## Rules

- The tower starts scrolling at floor 5 and speeds up every 30 seconds ("HURRY UP!").
- **Combos:** land jumps of 2+ floors in a row before the combo meter runs out.
- **Score:** 10 × highest floor + (combo floors)² for every combo of two or more jumps.
- **Floor styles:** the floor design changes every 100 floors. Passing a zone unlocks the style below it (reach floor 200 to unlock Ice, 300 for Wood, …); pick it under Options → Floor Style. It only changes the look, never the starting floor.

## Tech

Plain HTML5 canvas + JavaScript, no build step and no assets: all graphics are drawn in code and all sound and music is synthesized with the Web Audio API. Combo call-outs use the browser's speech synthesis.

Run locally with any static server, e.g. `python -m http.server` in this folder, or just open `index.html`.
