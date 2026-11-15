# STRATEGY.md — IRONLINE design notes

## What the game is judged on

A tactical FPS lives or dies on whether a round *feels* tactical: slow,
deliberate gunfights, an objective that forces rotation, and an economy that
makes losing rounds still matter. Every system below exists to serve that.

## The loop

1. **Buy phase (12 s).** Money from the last round is spent in a shop.
   The choice is real: a rifle now vs saving for a sniper + armour next
   round. Bots buy by the same rule, so the economy is symmetric.
2. **Live round (100 s).** Attackers pick a site (randomised per round so
   defenders cannot pre-stack one site every time); defenders split
   2–2–1 across A, B and mid. The spike carrier is usually a bot, sometimes
   the player, so the objective pressure is shared.
3. **Resolution.** Elimination, detonation, defuse or timeout. Winners get
   $3,250; losers get a rising loss bonus ($1,900 → $3,400) so a team on a
   losing streak can still force-buy — the classic comeback mechanic.
4. **Match.** First to 8, max 15 rounds, sides swap after round 7 so both
   teams attack and defend.

## Gunplay: accuracy over speed

- Spread grows with movement and bloom, shrinks when crouched, still or
  aiming down sights. A walking player sprays; a still, ADS player lands
  shots. This is the core skill expression.
- Headshots multiply damage (2× pistol/SMG/shotgun, 4× rifle/sniper), so
  crosshair placement beats trigger speed.
- Damage falls off past each weapon's effective range, so weapon choice
  depends on the lane you intend to hold.
- Reloads are real (magazine + reserve), and firing the last round
  auto-reloads — running dry mid-fight is a punishable mistake.

## Bots

Bots navigate a hand-built waypoint graph (BFS paths), check line of sight
with real raycasts against the map, and only engage inside a vision cone
(or at point-blank range). Each has a reaction delay (0.25–0.65 s), burst
fire with pauses, strafing while engaged, and a hit probability that falls
with distance and target movement. Roles: the carrier pushes the chosen
site and plants when it is clear; defenders hold sites, converge on a
planted spike and defuse; attackers hold the site after planting. Bots
also pick up a dropped spike.

## Map: Foundry Yard

A 60×44 m container yard with two sites (west/east), a mid lane and two
long lanes. Crates and containers create cover, crossfire angles and
off-angles without long sightlines that would make the sniper dominant.
Every wall and crate is a real collider; the waypoint graph follows the
lanes, so bots never clip through cover.

## Presentation and robustness

- Everything is procedural: geometry from boxes, audio from WebAudio
  synthesis, labels from canvas textures. No downloaded assets, so the
  game runs offline from static files and cannot fail on a missing asset.
- The HUD shows exactly what a tactical player needs: health, armour,
  money, ammo, timer, round score, killfeed, minimap (teammates always,
  enemies only when recently seen), plant/defuse progress and contextual
  hints (e.g. “Hold E to plant”).
- `?selftest=1` plays a full bot match headlessly and reports the result,
  so the whole loop (buy → live → round end → match end) is verifiable
  without a human player.
