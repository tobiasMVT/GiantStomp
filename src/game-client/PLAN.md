# Heaven/Hell Implementation Plan

## Summary
- Implement the heaven/hell game variant directly in `src/game-server/**` and `src/game-client/**` with server/client sync first.
- First execution step is this file (`src/game-client/PLAN.md`) so the plan is easy to retrieve.
- Keep existing assets and grid size, keep base-game cluster flow, and replace feature behavior with new demon/angel/portal/bonus logic.

## Key Changes

### 1. Plan persistence
- Create `src/game-client/PLAN.md` before code changes.
- Keep it updated with implemented checkpoints and config keys.

### 2. Server (`Gameserver.js`, `server_config.json`)
- Keep action IDs compatible, reinterpret banana hunt as angel-vs-demon combat.
- Main game:
  - Keep clusters/cascades unchanged.
  - Per demon kill, roll pure random portal trigger chance to enter bonus.
- Bonus entry:
  - Award 5 freespins.
  - Bonus-only persistent multiplier starts/continues here.
  - Unlock one random level-1 ability at entry.
- Bonus loop:
  - `freespin` consumes counter.
  - `freerespin` does not consume counter.
  - If kills happen in bonus action, chain another `freerespin`.
  - Add configurable spawn dampening after N chained freerespins.
- Bonus board/combat:
  - Demon-only spawn model.
  - Grid-shortest-path target logic from server; client flies straight visually.
  - First bonus attack starts from center.
- Abilities:
  - Portal 1/2 spawn and multiplier-demon guarantees.
  - Divine Wrath 1/2 (3x3 / 5x5) with guaranteed loot on affected kills.
  - Divine Charge 1/2 (x5/x10 guaranteed loot).
  - Wrath+Charge combined behavior applies charge multiplier to wrath kills.
  - Every 20 kills: random unlock/upgrade +2 freespins.
- Loot/boss/chest:
  - Normal demon loot default 30% (configurable).
  - Guaranteed effects force 100% drop path.
  - Multiplier-demon chance configurable.
  - Boss spawn odds configurable per action type; main defaults can remain 0.
  - Boss kill counts as +9 kills.
  - Config crit chance and x5/x10 crit table.
  - Boss crit guarantees chest and applies requested chest/extra-loot behavior.
- Add state payload fields for portal/abilities/procs/loot ground/boss/chest/kill counters while preserving backward-compatible core fields.

### 3. Client (`Client.js`, `GameScene.js`)
- Keep existing orchestration structure but switch semantics to angel/demon/portal.
- Bonus presentation:
  - Replace normal bonus cascade feel with ripple injection flow (top-left spreading downward).
  - Consume deterministic server spawn metadata.
- Combat presentation:
  - Start angel at center on bonus entry.
  - Fly shortest straight visual path to targets.
- Ground loot:
  - Render persistent non-symbol loot objects across bonus actions.
  - Collect/settle at bonus end with multiplier application.
- Keep skip/fast-forward and round lifecycle events stable.

## Test Plan
- Server action-chain tests:
  - Main kill can portal-trigger bonus randomly.
  - Bonus starts with 5 spins and one random level-1 ability.
  - `freespin` decrements, `freerespin` does not.
  - Kill-positive bonus actions chain `freerespin`.
- Ability and reward tests:
  - Portal spawn guarantees, wrath/charge proc behavior, combined proc logic.
  - Loot chance vs guaranteed path correctness.
  - Boss +9 kill accounting.
  - Boss crit chest guarantees and crit multiplier behavior.
- Client replay tests:
  - Round-state replay stays synchronized through bonus transitions/chains.
  - Ripple injection order and combat path visuals match server data.
  - Ground loot persists until final settlement.
- Regression:
  - Base-game clusters and existing spin/respin flow remain intact.

## Assumptions
- Work remains strictly inside allowed write scope:
  - `src/game-server/**`
  - `src/game-client/**`
- Existing action names remain for compatibility; behavior and presentation change underneath.
- Advanced polish passes (art/audio tuning) follow after this functional vertical slice.

## Implementation Checkpoints (Current Pass)
- `src/game-client/PLAN.md` created first as requested.
- Server:
  - Added `heavenHell` config surface in `server_config.json`.
  - Added `heavenHell` runtime state in default `gameState` and reset flow.
  - Added main-game per-kill random portal trigger logic.
  - Added bonus-entry setup with fixed 5 freespins and random level-1 entry unlock.
  - Added dedicated heaven/hell bonus spawn path for `freespin` / `freerespin`.
  - Added demon-only ripple injection payload (`dropEvent.direction = "ripple"` + ordered injections).
  - Added ability unlock/proc framework (portal/divineWrath/divineCharge).
  - Added loot-ground persistence, bonus global multiplier tracking, and end-of-bonus settlement.
  - Added boss/multiplier-demon handling hooks from config.
- Client:
  - Added heaven/hell mode checks in orchestration.
  - Added ripple-spawn playback hook calls.
  - Added portal aura, ripple pulse, and persistent loot-ground rendering helpers in `GameScene`.
  - Wired loot-ground rendering into main/bounty action flow and bonus loop.

## Implemented Config Keys
- `heavenHell.enabled`
- `heavenHell.main.portalTriggerChancePerKill`
- `heavenHell.bonus.entryFreespins`
- `heavenHell.bonus.spawnDampeningAfterFreerespins`
- `heavenHell.bonus.spawnDampeningFactorPerStep`
- `heavenHell.bonus.maxFreerespinDampeningSteps`
- `heavenHell.bonus.actionSpawnBase.freespin|minDemons|maxDemons`
- `heavenHell.bonus.actionSpawnBase.freerespin|minDemons|maxDemons`
- `heavenHell.bonus.portalSpawnByLevel`
- `heavenHell.bonus.abilityUnlock`
- `heavenHell.bonus.abilityProc.divineWrath`
- `heavenHell.bonus.abilityProc.divineCharge`
- `heavenHell.bonus.loot.baseDropChance`
- `heavenHell.bonus.loot.multiplierDemonSpawnChance`
- `heavenHell.bonus.loot.values`
- `heavenHell.bonus.boss.spawnChanceByAction`
- `heavenHell.bonus.boss.killsGranted`
- `heavenHell.bonus.boss.multiplierGain`
- `heavenHell.bonus.boss.critChance`
- `heavenHell.bonus.boss.critLootMultiplierWeights`
- `heavenHell.bonus.boss.chest.guaranteedOnCritKill`
- `heavenHell.bonus.symbols.demon|multiplierDemon|bossDemon`
