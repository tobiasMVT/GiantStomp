---
name: superbonus-feature
description: Rainbow unicorn wild (symbol 14) and guaranteed 4-life superbonus entry when the unicorn is stomped or crushed. Use when changing unicorn injection, wild ways, superbonus lives, rainbow anger overcharge, or the fourth life sigil.
---

# Superbonus Feature

## Symbol 14 (unicorn)

- Config: `unicornSymbol`, `wildSymbols`, `unicorn_injection.odds` in `server_config.json`.
- Weight is **0** in `symbolWeights`; appears via random injection on paid spins, party boards, or dev ticket boards.
- Acts as a **wild** in `evaluateWays` — substitutes for paying symbols 1–10.
- Asset: `src/game-client/assets/giantstomp/unicorn_trans.png` (board + 4th life sigil).
- Client plays `unicorn_appear` (`giant-video-game-character-dialogue-vocalization-i-can-smell-you.mp3`) whenever symbol 14 lands on the board, independent of bonus or feature outcomes.
- A compact **SUPER / BONUS** badge (anger-meter badge style) sits above the unicorn on the board. Text alternates every ~520ms. It is parented to the symbol container, follows golfswing grabs, and is destroyed when the unicorn vanishes into rainbow dust.
- During superbonus, a calmer **SUPER** above **BONUS** sign sits at the top-right of the reel frame (same badge styling, muted colors, static labels with a slow alpha breathe). It shows while bonus UI is visible and hides on regular bonus exit.

## Entry

When symbol 14 is in `crushedCells` from stomp or crush:

1. **Guaranteed** superbonus — no `bonusTriggerOdds` roll.
2. Overrides normal animal-crush bonus if both die in the same feature.
3. Emits `superBonusTriggered: true`, `unicornCrushEvent`, `bonusGameWonEvent.source: "unicornCrush"`.
4. `bonustransition` uses `bonusState.maxLives: 4`, `isSuperBonus: true`.

Regular bonus (3 lives, `animalCrush` source) is unchanged when no unicorn is crushed.

## Bonus shell difference

| | Regular bonus | Superbonus |
|---|---|---|
| Lives | `bonus.lives` (3) | `superBonus.lives` (4) |
| Life reset on cash landing | 3 | 4 |
| 4th sigil | Hidden | Unicorn texture + label `4` |

`appendBonusCashGame` reads `maxLives` from the preceding `bonustransition` state.

## Client presentation

- Unicorn crush: dense low-alpha rainbow cloud (`createUnicornRainbowCloud`) — unicorn vanishes into it in ~80ms; cloud lingers while rainbow orbs collect to the anger meter, then fades in `dismissUnicornRainbowCloud`.
- Superbonus trigger: `presentUnicornSuperBonusOvercharge(fromX, fromY)` — rainbow orbs/trails fill the anger meter (`updateAngerMeter({ rainbow: true })`).
- Replaces `presentAnimalKillAngerOvercharge` when `superBonusTriggered` on stomp/crush events.

## Dev ticket

- Strategy: `superBonusEntry` — board with unicorn on stomp reels + forced stomp.
- Use forced-outcome overlay or `generateRoundStates({ ticketStrategy: "superBonusEntry" })`.

## Code locations

| Layer | Path |
|-------|------|
| Config | `src/game-server/server_config.json` |
| Math | `src/game-server/Gameserver.js` — injection, wild ways, crush targeting, trigger |
| Assets | `src/game-client/queueGameSceneAssets.js` |
| VFX / UI | `src/game-client/GameScene.js` — life meter, rainbow overcharge |
