---
name: forced-outcome-dev-tool
description: Dev-only forced ticket selection for HellDive. Use when wiring UI that asks the round generator for an exact ticketed outcome, or when debugging `server_config.json` ticket buckets from the client.
---

# Forced Outcome Dev Tool

This system lets the client request one exact ticket from `server_config.json` instead of drawing a weighted ticket normally.

## Purpose

- debug ticket buckets from inside the running client
- repeatedly request outcomes like `normal / noWin` or `normal / bonus_min5_max50`
- support both local in-process server mode and HTTP server mode

## Code Locations

| Layer | Path |
|-------|------|
| shared dev selection store | `src/game-server/lib/devForcedOutcomeStore.js` |
| round generation override | `src/game-server/game-server/gameServerFlowMethods.js`, `src/game-server/Gameserver.js` |
| remote sync endpoints | `src/game-server/httpServer.js` |
| client overlay | `src/game-client/game-scene/gameSceneForcedOutcomeMethods.js` |

## Mental Model

1. The client picks a `{ strategy, ticket }`.
2. That selection is stored in a shared dev store.
3. In local mode, the in-browser `GameServer` reads the same selection directly.
4. In HTTP mode, the client also mirrors the selection to `/api/dev/forced-ticket`.
5. `generateRoundStates(...)` uses that exact ticket before normal weighted ticket drawing.

## Guardrails

- Keep this dev-only.
- Do not let it change core round math beyond ticket selection.
- If a forced ticket no longer exists or has non-positive weight, fall back safely to normal behavior.
