---
name: helldive-overview
description: Current game overview for the 5x3 cascading 243-ways prototype. Use when starting game-specific work or deciding which subsystem owns reel math, cascades, Anger, or bonus flow.
---

# Game Overview

The active prototype is a 5-reel by 3-row, 243-ways cascading slot. The old house, Angel combat, demons, loot, and feature-heavy Hell bonus no longer belong to the active design.

## Core Loop

**Main game:** Spin → evaluate ways → highlight wins (symbols stay) → next spin or bonus entry.

Each newly landed scatter charges one of three Anger segments once within the same paid round (from `spin` through cascades until the next `spin`). Full Anger resets and enters a temporary three-freespin bonus shell.

**Current prototype:** bonus entry is driven by crushed animals and a fake 10-step Anger display, not scatters.

**Bonus:** Three freespins using the same 5x3 ways and cascade loop. Special bonus symbols and recharge rules are deferred.

## System Skills

- `payways-cascade`: board contract, ways scoring, cascades, scatter consumption, Anger, and freespins.
- `giant-stomp-feature`: mystery giant foot crush, coin drops, dev stompEntry hunt.
- `crush-feature`: giant hand grab/squeeze on a random animal, dev crushEntry.
- `party-feature`: animal-only party spin with pre-drop confetti and optional giant stomp.
- `golfswing-feature`: post-payout giant grab, aim minigame, and jackpot wheel.
- `superbonus-feature`: unicorn wild, rainbow superbonus entry, 4-life bonus shell.
- `client-architecture`: Client/GameScene presentation responsibility split.
- `forced-outcome-dev-tool`: dev-only outcome selection.

## Code Locations

| Layer | Path |
|-------|------|
| Client flow | `src/game-client/Client.js`, `buildSegmentFlow.js` |
| Presentation | `src/game-client/GameScene.js` |
| Math / state | `src/game-server/` |
| Client config | `src/game-client/config/client_config.json` |
| Server config | `src/game-server/server_config.json` |

Human docs: `src/game-client/README-CLIENT.md`, `src/game-server/README-SERVER.md`, `GAME_SUMMARY.md`.
