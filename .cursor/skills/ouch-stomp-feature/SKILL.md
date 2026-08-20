---
name: ouch-stomp-feature
description: Post-bonus trap resolution — server depth math, ouchStompEvent contract, and client pit descent presentation. Use when changing damage multiplier steps, trap payout, or ouch stomp VFX/audio.
---

# Ouch Stomp Feature

## Server

Config in `server_config.json`:

- `damageMultilpierStepOdds` — per-step continuation chance after the guaranteed first step (default `0.66`).
- `ouchStompFeature.stepIntervalMs` — client pacing hint for extra steps (default `3000`).
- `ouchStompFeature.maxCoinsPerStep` — coin cap per step (default `20`).

After `appendBonusCashGame` finishes, `resolveOuchStomp(trapPower, damageWheel, betSize)` runs on the final bonus trackers:

1. Skip when `trapPower <= 0` or no `remainingSegments`.
2. **Step 1 is always free** — consume leftmost segment.
3. Each extra segment rolls `random() < damageMultilpierStepOdds` until fail or segments exhausted.
4. Per step: `winTbm = trapPower × multiplier`, `winAmount = winTbm × betSize`.
5. Final credited win = **last step's** `winAmount` (not cumulative across steps).
6. Attach `ouchStompEvent` to the last bonus `freespin` state; add final win to `totals.twa`.

### Event contract

```js
ouchStompEvent: {
  triggered: true,
  trapPower,
  steps: [{ step, multiplier, winTbm, winAmount }],
  finalMultiplier,
  finalWinTbm,
  finalWinAmount,
  coinCountPerStep: min(round(trapPower), maxCoinsPerStep),
  stepIntervalMs,
  damageWheelBefore: { segments, removedSegments, remainingSegments },
  consumedSegments: [1, 2, ...]
}
```

## Client

Triggered from `Client.reactOnResponse` when bonus ends (`nextAction === "spin"` while still in bonus mode):

1. `presentBonusExitSequence(gameState)` crossfades to `ouch_background`, fake doll spin.
2. `presentOuchStompSequence(ouchStompEvent)`:
   - **Impact:** foot slams trap, `spawnOuchDebrisBurst`, random `ouch_stomp1/2`, start `ouch_background-music`.
   - **Per step:** scroll pit up (`OUCH_PIT_STEP_DELTA_Y`), damage meter advance, coins → count-up ticks to `step.winAmount`.
   - **Step 2+:** wait `stepIntervalMs`, random pain scream + gore SFX, heavy blood/gibs before meter shift.
3. `leaveBonus()` on next paid spin resets scroll offset and stops ouch theme.

UI during ouch: damage meter + trap power readout + count-up (`setOuchUiVisible`).

Assets: `src/game-client/assets/giantstomp/sounds/ouch_*`, `giant_pain_scream*`.
