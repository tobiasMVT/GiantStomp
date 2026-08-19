---
name: retrigger-system
description: Hell bonus kill meter, retrigger freespins, and end-of-battle settlement. Use when implementing demon kill counts, meter overflow display, or ability unlock timing.
---

# Retrigger System (Kill Meter)

Hell bonus tracks **demon kills** (not bananas). Meter upgrades and retriggers fire at **end of battle** — when the board has no demons left and no more Angel hunt paths will run for that wave.

## State Fields (server)

| Field | Scope | Meaning |
|-------|-------|---------|
| `demonsKilled` | Whole bonus until reset | Cumulative demon kills across all bonus actions. Resets only on post-bonus `spin`. |
| `demonsKilledThisAction` | Single action | Kills scored in the current `freespinbananaHunt` / combat action. Reset at each `getResponse` start. |
| `totalDemonsKilledInSequence` | Round / speed | Running total for hunt-speed tuning. |
| `heavenHell.bonus.killsTowardsUnlock` | Persisted meter | Settled kill count toward next unlock (e.g. `2` after crossing `30`). |
| `heavenHell.bonus.killsTowardsUnlockAtActionStart` | Per action | Meter value before this battle's kills (e.g. `29`). |
| `heavenHell.bonus.killsTowardsUnlockBeforeSettlement` | Per action | Meter after kills, before end-of-battle settlement (e.g. `32`). Used for overflow display. |
| `heavenHell.bonus.killMeterSettledThisAction` | Per action | `true` after retrigger + ability rewards are applied for a cleared board. |

## Flow

### During battle (Angel hunt animation)

1. Snapshot `killsTowardsUnlockAtActionStart` (e.g. `29`).
2. Add weighted kills from hunt + abilities → `killsTowardsUnlockBeforeSettlement` (e.g. `32`).
3. **Do not** settle unlocks yet if demons may remain on the board.
4. Client meter may show **overflow** during animation: `32 / 30`.

### End of battle (board clear)

Triggered when `countHeavenHellDemons(reels) === 0` after a bonus hunt.

1. Call `settleHeavenHellKillMeterUnlocks(gameState)`.
2. While `killsTowardsUnlock >= killsPerUnlock`:
   - Award `freespinsAwardedPerUnlock` (+2 default) → `bonusState.finalFreespins`
   - Unlock random ability (or freespin-only reward if pool empty)
   - Push proc into `abilityProcsThisAction`
   - Subtract threshold from meter
3. Persist remainder: e.g. `32 → 2` stored in `killsTowardsUnlock`.
4. Client syncs meter to settled value (`2 / 30`) and plays retrigger + ability FX.

### Example

| Step | Meter display | Events |
|------|---------------|--------|
| Action start | `29 / 30` | — |
| Kill 3 demons (animation) | `32 / 30` | Overflow OK during hunt |
| Board cleared, action ends | `2 / 30` | +2 freespins, ability unlock |

### Chained hunts (demons still on board)

If demons remain after a hunt, meter accumulates (`29 → 30`) but **no settlement** until the board is fully cleared. Next hunt continues from the accumulated value.

## Reset Rules

| Event | What resets |
|-------|-------------|
| Each `getResponse` | `demonsKilledThisAction`, `killMeterSettledThisAction`, `abilityProcsThisAction` |
| Post-bonus `spin` (`resetGameState`) | `demonsKilled`, `totalDemonsKilledInSequence`, full bonus state |
| Bonus entry (`bonustransition`) | `heavenHell.bonus.killsTotal`, `killsTowardsUnlock` (fresh meter) |

## Rule Guardrails

- Do not treat `5` demon kills / bananas as a bonus trigger. That was legacy presentation only.
- Bonus entry is now decided by the game’s random trigger flow before `bonustransition`.
- During main-game hero combat, meter growth can still level up visuals, but it must not show a `FREESPINS WON` award from hitting `5`.

## Config (`server_config.json` → `heavenHell.bonus.abilityUnlock`)

```json
{
  "killsPerUnlock": 30,
  "freespinsAwardedPerUnlock": 2,
  "unlockAbilitiesMin": 1,
  "unlockAbilitiesMax": 2
}
```

## Code Locations

| Layer | Path | Notes |
|-------|------|-------|
| Kill accumulation | `Gameserver.js` hunt handlers | `demonsKilled += demonsKilledThisAction` |
| Deferred settlement | `Gameserver.js` → `settleHeavenHellKillMeterUnlocks` | Called when board clear after bonus hunt |
| Meter animation | `GameScene.js` → `getHeavenHellMeterActionPlan`, `tickHeavenHellKillMeterOnKill` | Overflow during hunt; no mid-animation subtract. Bonus kills defer `tickHeavenHellKillMeterOnKill` until the soul trail reaches the ability charge meter (`createHeavenHellBonusSoulCollectionFx`). |
| End-of-action sync | `GameScene.js` → `updateHeavenHellAbilityText` | Settled `killsTowardsUnlock` + reward FX |
| Client flow | `Client.js` | Passes `demonsKilledThisAction` for meter start offset |

## Related Skills

- `ability-system` — Portal, Divine Charge, Divine Wrath proc rules
- `combat-system` — Angel hunt path and demon targeting
- `loot-system` — Loot drops from kills (settled at Collect Phase)
