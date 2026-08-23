---
name: ouch-stomp-feature
description: Post-bonus trap resolution — server depth math, ouchStompEvent contract, and client pit descent presentation. Use when changing damage multiplier steps, trap payout, or ouch stomp VFX/audio.
---

# Ouch Stomp Feature

## Server

Config in `server_config.json`:

- `damageMultilpierStepOdds` — base per-draw continuation chance after the guaranteed first step (default `0.75`).
- `adjust0ForBonusGate_TrapPowerValueAffects0odds` — power-range brackets that shift the bonus empty-gate weight. Each key is the range start (`0` → 0–4.99, `5` → 5–9.99, etc.).
- `damageMultilpierStepOddsReductionBasedOnCurrentWinAmount` — winTbm brackets (`trapPower × activeMultiplier`) that subtract from continuation odds before each extra draw. Same floor-bracket semantics as the bonus gate table. Replaces trap-power continuation tuning for ouch stomp.
- `adjustdamageMultilpierStepOdds_TrapPowerUpToValueAffectOdds` — legacy trap-power continuation table (unused by `resolveOuchStomp`; kept for tuning experiments).
- `ouchStompFeature.stepIntervalMs` — client pacing hint for extra steps (default `3000`).
- `ouchStompFeature.maxCoinsPerStep` — coin cap per step (default `20`).

After `appendBonusCashGame` finishes, `resolveOuchStomp(trapPower, damageWheel, betSize)` runs on the final bonus trackers:

1. Skip when `trapPower <= 0` or no `remainingSegments`.
2. **Step 1 is always free** — consume leftmost segment.
3. Each extra segment rolls against continuation odds until fail or segments exhausted. Before each draw, subtract the bracket value from `damageMultilpierStepOddsReductionBasedOnCurrentWinAmount` using the last step's `winTbm` (`trapPower × multiplier`).
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
   - **Banked replay:** bonus-advanced multiplier segments are gold `BANKED` stomps. They replay as fast lift-and-slam stomps with decorative gold coins (no win credit) before any risky step.
   - **Per step:** scroll pit up, advance multiplier highlight, foot pushes deeper (no lift wobble), coins → count-up ticks to `step.winAmount`.
   - **Step 2+:** the next multiplier tile charges for the full `stepIntervalMs` before revealing the deeper stomp; random pain scream + gore SFX then play on success.
   - **Success cue:** the target tile makes a bright confirmation swap, launches star particles, and receives short downward arrows before the foot moves deeper.
   - **Terminal reveal:** when unvisited segments remain after the final resolved step, the next tile flashes red with `STOMP STOPS`; reaching the final segment instead shows `MAX DEPTH`.
   - **Exit:** when multiplier stops advancing, foot partially pulls out with blood pour + stacked pain screams, fade to black, then fade into total-win scene.
3. `leaveBonus()` on next paid spin resets scroll offset and stops ouch theme.

UI: bonus uses the horizontal multiplier strip. Ouch rebuilds the same segment style as a vertical `STOMP DEPTH` rail on the left side of the pit, ordered from the low multiplier at the top to the high multiplier at the bottom. Gold banked steps remain distinct from normal completed and risky steps.

Assets: `src/game-client/assets/giantstomp/sounds/ouch_*`, `giant_pain_scream*`.
