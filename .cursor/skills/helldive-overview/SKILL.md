---
name: helldive-overview
description: HellDive game design overview — cluster slot plus Angel combat, Hell bonus, Collect Phase. Use when starting HellDive work, planning features, or unsure which subsystem applies.
---

# HellDive Overview

Cluster-pay slot with an action-combat layer. Demons appear on the board; after normal win resolution the Angel attacks survivors.

## Core Loop

**Main game:** Spin → cluster wins → explode/redrop → repeat → combat (Angel vs surviving demons) → Wild recalc wins.

**Bonus (Hell):** No cluster wins. Focus: demon kills, loot, multipliers, ability unlocks. Loot paid only at **Collect Phase** end.

## Systems (see dedicated skills)

| System | Skill | Key fact |
|--------|-------|----------|
| Client layering | `client-architecture` | Client = flow; GameScene = presentation |
| Angel position | `angel-system` | Persistent board position; counts as Wild |
| Combat | `combat-system` | Closest demon first; demons never attack back |
| Gargoyle | `gargoyle-system` | Hell-bonus gargoyles can flee between attacks when nearby demons die |
| Loot | `loot-system` | Visible on board until Collect Phase |
| Abilities | `ability-system` | Unlocked in bonus; all config in `server_config.json` |
| Pentagram | `pentagram-system` | Bonus-only overlay hit by Divine Strike / Divine X, upgrades center multiplier on completion |
| Retrigger / kill meter | `retrigger-system` | Meter overflows during hunt; settles at end of battle when board is clear |

## Design Targets

Fast combat. Persistent Angel position. Strong visual progression. Action-RPG feel on slot math.

## Code Locations

| Layer | Path |
|-------|------|
| Client flow | `src/game-client/Client.js`, `buildSegmentFlow.js` |
| Presentation | `src/game-client/GameScene.js` |
| Math / state | `src/game-server/` |
| Client config | `src/game-client/config/client_config.json` |
| Server config | `server_config.json` (abilities, loot tables) |

Human docs: `src/game-client/README-CLIENT.md`, `src/game-server/README-SERVER.md`, `GAME_SUMMARY.md`.
