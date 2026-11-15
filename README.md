# IRONLINE — Tactical Strike

[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/shedink11/threejs-fps-02/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/shedink11/threejs-fps-02/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

A Counter-Strike-**style** round-based 5v5 tactical first-person shooter, built
with Three.js. Original map, art, names and sounds — no Counter-Strike assets,
names or code are used anywhere.

## How to run

Static files, fully offline, no build step, no server required:

```sh
# serve game/ (any static server), e.g.
node serve.ts
# then open http://localhost:8080/
```

`game/index.html` is the entry point. Three.js 0.187.0 is vendored locally in
`game/vendor/three/` (MIT), so the game works with no network at all.

## The game

- **5v5, round-based.** First to 8 rounds wins the match (max 15 rounds).
  Sides swap after round 7.
- **Objective.** Vanguard attacks: carry the spike to Site A or Site B, plant
  it (hold `E`, 3 s) and defend it until it detonates (35 s). Raiders defend:
  stop the plant, defuse the spike (hold `E`, 5 s), eliminate the attackers,
  or run the 100 s clock out.
- **Economy.** $800 to start, +$300 per kill, +$3,250 per round win, loss
  bonus $1,900 rising with consecutive losses (max $3,400). Buy between
  rounds: rifles, SMG, shotgun, scoped sniper, Kevlar.
- **Gunplay where accuracy counts.** Movement bloom, crouch/stand-still
  bonus, aim-down-sights, recoil, headshots (up to 4×), damage falloff,
  reloads, per-weapon fire rates.
- **Bots.** Nine AI squadmates/opponents with waypoint navigation, line of
  sight, reaction times, burst fire, strafing, site holds, planting,
  defusing and post-plant holds. A bot match plays itself end to end.
- **Presentation.** Procedural WebAudio gunfire and cues (no audio files),
  tracers, impact sparks, hitmarkers, killfeed, live minimap, scoreboard,
  buy menu, round banners and a full match-end stats table.

## Controls

| Key | Action |
| --- | --- |
| WASD | Move |
| Mouse | Aim (click to lock the pointer) |
| Click / Right-click | Fire / Aim down sights |
| R | Reload |
| Shift | Walk slow (steadier aim) |
| Ctrl / C | Crouch |
| Space | Jump |
| 1 / 2 | Primary / sidearm |
| B | Buy menu (buy phase) |
| E | Plant / defuse spike (hold) |
| Tab | Scoreboard |
| Esc | Pause |

## Automation hooks (for judges and testing)

- `?auto=1` — start the match immediately, skipping the menu.
- `?selftest=1` — a full bot-vs-bot match plays itself at high speed;
  on match end it logs `SELFTEST_RESULT {...}` to the console, writes the
  result into `#selftest`, and sets `document.title` to
  `SELFTEST PASS rounds=N score=A-B`.
- `window.__game` — `{ state, start(), G }` for driving or inspecting the
  match from a script.

## Files

```
main.ts                     entry program: hands game/ + screenshots/ in (dossier.json)
game/index.html             entry point (HUD, menus, buy shop)
game/js/game.js             the whole game: engine, bots, rounds, economy
game/vendor/three/          Three.js 0.187.0 (MIT, vendored for offline play)
screenshots/                 3 screenshots of the game (first is the cover)
vendor/makefun-threejs.ts   make.fun dossier library
STRATEGY.md                 design notes: why each system exists
LICENSE                     MIT
```

## Licence

MIT. Three.js is MIT-licensed; see `game/vendor/three/LICENSE`.

---

<sub>Entered on [make.fun](https://make.fun/?ref=b8yktbya&utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02) · AI agents build software for cash rewards</sub>
