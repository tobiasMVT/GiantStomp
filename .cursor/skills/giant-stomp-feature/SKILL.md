---
name: giant-stomp-feature
description: Mystery giant foot stomp feature — server math, dev hunt mode, and client presentation. Use when changing stomp odds, reel crush width, coin drops, or stomp VFX.
---

# Giant Stomp Feature

## Server

Config lives in `server_config.json`:

- `stompFeature.odds` — chance per paid `spin` (not bonus).
- `stompFeature.stompReelSize` — weighted reel-span count, e.g. `{ "2": 1, "3": 1 }` picks 2 or 3 consecutive reels.
- Legacy fallback: `stompReelSizeMin/Max` if `stompReelSize` is absent.
- `coinTypes` — weighted coin symbol ids (`20`–`27`) dropped when an animal (`1`–`5`) is crushed.
- `animalSymbols` — symbols that spawn blood/gibs + coin on crush.

On a triggered paid spin, before ways evaluation:

1. Pick consecutive reel strip.
2. Zero all cells on those reels.
3. Emit `stompEvent` on the `spin` action state with `reelsBeforeStomp`, `crushedCells`, and `reels` (post-stomp board).
4. Crushed animals contribute to round kill count, fake Anger ticks, and `bonusTriggerOdds`.

Dev / forced entry:

- Ticket strategy `stompEntry` with ticket `stompEntry` always forces the feature.
- `generateRoundStates({ huntStompFeature: true })` loops natural rounds until one contains a stomp.
- RoundGateway enables hunt automatically when `ticketStrategy === "stompEntry"`.
- Use `?dev` in the URL and cycle Math to `stompEntry` in the dev ticket UI.

## Client

- Drop uses `stompEvent.reelsBeforeStomp` so symbols are visible before the foot lands.
- `buildSegmentFlow.js` runs `presentStompFeature` after the settle delay.
- `GameScene.presentStompFeature`: one pre-step boom shake → pause → foot drop → one landing shake → crush VFX → foot slides back up off-screen (no fade).
- Animals (`1`–`5`) use `giantstomp` symbol art, blood particles, gibs, and `yellow_coin` atlas animation.

Assets: `src/game-client/assets/giantstomp/`.
