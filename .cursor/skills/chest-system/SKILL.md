---
name: chest-system
description: Heaven/Hell chest drops, queued chestreward action, expanding reel chest rewards, and client chest presentation. Use when editing HellDive chest config, chestreward flow, or chest visuals.
---

# Chest System

HellDive chests are a Heaven/Hell bonus feature. Demons queue chest drops during combat; queued chests open only after the board is clear.

## Server Flow

```text
Demon kill
-> normal loot roll
-> chest drop roll
-> chest stored in heavenHell.bonus.pendingChests[]
-> matching heroPath kill step gets chestDrops[] annotation for presentation timing

Board clears
-> nextAction = chestreward
-> queued chests resolve in order
-> rewards apply immediately
-> resume freerespin or settle bonus

Defensive rule:
- never settle bonus / force `nextAction = spin` while `heavenHell.bonus.pendingChests[]` is non-empty
- even forced exits such as win-cap or bonus-action caps must route through `chestreward` first
```

## Main Files

- `src/game-server/lib/chestSystem.js`
- `src/game-server/game-server/gameServerBonusActionMethods.js`
- `src/game-server/server_config.json`
- `src/game-client/client/clientActionMethods.js`
- `src/game-client/game-scene/gameSceneHeavenHellMethods.js`

## Config Surface

All config lives under `server_config.json > heavenHell > bonus`.

### Drop config

```json
"chests": {
  "initialReelCount": 1,
  "maxReels": 6,
  "dropChance": {
    "normal": 0.02,
    "multiplier": 0.08,
    "boss": 1.0
  },
  "respinChanceByReelCount": {
    "1": 0.5,
    "2": 0.4,
    "3": 0.3,
    "4": 0.2,
    "5": 0.1,
    "6": 0.05
  }
}
```

### Chest types

Each entry in `chestTypes` supports:

- `dropWeight`
- `presentation`
- `symbolWeights`
- `rewardTable`

`symbolWeights` contains all reveal symbols, including `respin` and `respinReel`.

`rewardTable` is keyed by symbol and usually contains weighted `{ value, weight }` arrays.

## State Shape

Persistent Heaven/Hell chest state lives in `gameState.heavenHell.bonus`:

- `pendingChests`
- `nextChestId`
- `chestsRewarded`
- `chestRewardResumeAction`

Per-action payloads:

- `chestEventsThisAction`
- `chestActionSummary`

Legacy mirror counters also stay synced on `gameState.bonusState`:

- `chestsPending`
- `chestsRewarded`

## Reward Rules

- `coin`, `diamond`: added to battlefield loot immediately
- `freeSpin`: added to `bonusState.finalFreespins` immediately
- `divineStrike`, `divineX`, `divineCharge`: applied to Heaven/Hell ability levels immediately
- `respin`, `respinReel`: continue chest sequence only, never grant loot directly

## Client Notes

`Client.js` decides when the chest action runs.

`gameSceneHeavenHellMethods.js` handles:

- queued chest drop landing on the kill cell during combat
- persistent ground-chest rendering until the reward action
- angel move-to-chest
- reel tick/reveal panels displayed directly above the opened chest
- reward pop / battlefield landing from the chest to the ground
- final UI sync for freespins and abilities

## Current Presentation Rules

- Chest drops should appear as soon as the demon dies, using the kill cell.
- `trackHeavenHellKillGroundDrops` runs immediately after demon death FX; loot and chest land asynchronously (tracked via `trackHeavenHellPendingGroundPresentation`, not awaited) so combat keeps pace.
- End-of-battle retrigger / ability unlock sequences stay unchanged and run after the hunt completes.
- Chests stay closed on the battlefield until all demons are dead and `chestreward` runs.
- Ground chest sprites render at `DEPTH_HERO + 3` so they stay visible above the angel and ground loot.
- Ground chest sync uses `heavenHell.bonus.pendingChests` (full battlefield queue), not `chestEventsThisAction` alone — that array only lists drops from the current action and must not drive prune/recreate logic.
- `chestEventsThisAction` is still used for per-step drop animation timing (`dropQueued`) and chestreward resolved payloads when `pendingChests` is already cleared.
- Do not call `ensureHeavenHellQueuedChestDrops` again at chestreward action start — `playHeavenHellChestRewardSequence` owns that sync.
- Ground chest sprites match by stable chest id; reward presentation promotes the existing sprite before camera focus.
- During multi-chest reward, `syncHeavenHellRewardGroundChests` keeps unopened chests on the battlefield between opens.
- Interrupted drop tweens are finalized so chests never remain at alpha 0.
- Reel/tick reveal UI should be framed over the chest itself, with camera reframing if needed.
- Loot rewards from chest reveals should pop out of the chest and land on the ground near it.
- Loot from chest reveals should never fly directly to the hero mid-bonus.

Keep reward math on the server. Keep chest visuals in the scene.
