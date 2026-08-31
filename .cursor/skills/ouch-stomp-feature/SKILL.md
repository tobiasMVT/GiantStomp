---
name: ouch-stomp-feature
description: Post-bonus trap resolution — server depth math, ouchStompEvent contract, and client pit descent presentation. Use when changing damage multiplier steps, trap payout, or ouch stomp VFX/audio.
---

# Ouch Stomp Feature

## Server

Config in `server_config.json`:

- `multilpierOdds` — trap-power brackets mapped to per-segment weights. Array index matches `damageWheelSegments` index. Bracket keys use floor semantics (`0` → 0–4.99, `5` → 5+).
- `ouchStompFeature.maxDamageHammers` — when this many hammers were collected during bonus, ouch stomp always picks the final segment and no further hammer symbols can land in bonus.
- Before the weighted pick, segment indices already banked by hammers get weight `0` (one hammer zeroes index `0`, three hammers zeroes indices `0`–`2`, etc.).
- `damageMultilpierStepOdds` — legacy continuation odds (unused by current weighted segment pick).
- `adjust0ForBonusGate_TrapPowerValueAffects0odds` — power-range brackets that shift the bonus empty-gate weight. Each key is the range start (`0` → 0–4.99, `5` → 5–9.99, etc.).
- `damageMultilpierStepOddsReductionBasedOnCurrentWinAmount` — legacy winTbm brake table (unused by current weighted segment pick).
- `adjustdamageMultilpierStepOdds_TrapPowerUpToValueAffectOdds` — legacy trap-power continuation table (unused by `resolveOuchStomp`; kept for tuning experiments).
- `ouchStompFeature.stepIntervalMs` — client pacing hint for extra steps (default `3000`).
- `ouchStompFeature.maxCoinsPerStep` — coin cap per step (default `20`).

After `appendBonusCashGame` finishes, `resolveOuchStomp(trapPower, damageWheel, betSize)` runs on the final bonus trackers:

1. Skip when `trapPower <= 0` or no `remainingSegments`.
2. Resolve the active segment index from `remainingSegments[0]`.
3. Pick a target segment index from `multilpierOdds[trapPowerBracket]` using direct weights. Indices already banked by hammers are zeroed before the draw.
4. Force the final segment when hammer count reaches `maxDamageHammers`.
5. Emit one step per segment from active index through target index; final credited win = **last step's** `winAmount`.
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
   - **Banked replay:** bonus-advanced multiplier segments are gold `BANKED` stomps. Each banked rung replays as: damage symbol (1000) drops from the top and nests beside the skipped ladder rung → `ouch_damage_confirm` scratch SFX + rung pulse → snared giant foot ratchets downward (`construction_1/2/3`, four nudges) → ladder foot marker advances → decorative gold coins (no win credit). Ouch ladder multipliers render above the snared giant foot depth.
   - **Per step:** scroll pit up, advance multiplier highlight, foot pushes deeper (no lift wobble), coins → count-up ticks to `step.winAmount`.
   - **Step 2+:** the next multiplier tile charges for the full `stepIntervalMs` before revealing the deeper stomp; random pain scream + gore SFX then play on success.
   - **Success cue:** the target tile makes a bright confirmation swap, launches star particles, and receives short downward arrows before the foot moves deeper.
   - **Terminal reveal:** when unvisited segments remain after the final resolved step, the next tile flashes red with `STOMP STOPS`; reaching the final segment instead shows `MAX DEPTH`.
   - **Exit:** when multiplier stops advancing, foot partially pulls out with blood pour + stacked pain screams, fade to black, then fade into total-win scene.
3. `leaveBonus()` on next paid spin resets scroll offset and stops ouch theme.

UI: bonus uses the horizontal multiplier strip. Ouch rebuilds the same segment style as a vertical `STOMP DEPTH` rail on the left side of the pit, ordered from the low multiplier at the top to the high multiplier at the bottom. Gold banked steps remain distinct from normal completed and risky steps.

Assets: `src/game-client/assets/giantstomp/sounds/ouch_*`, `giant_pain_scream*`, `ouch_damage_confirm` (scratch confirm on hammer landing).
