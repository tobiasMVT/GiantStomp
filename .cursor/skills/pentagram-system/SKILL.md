---
name: pentagram-system
description: Hell bonus Pentagram overlay. Use when editing bonus-only Pentagram points, segment progression, Divine Strike / Divine X hit detection, completion rewards, or multiplier ray presentation.
---

# Pentagram System

Bonus-only ritual overlay that sits outside the 8x8 board.

## Core Rules

- The Pentagram is **not** part of reels, symbols, gravity, respins, or demon spawn logic.
- It uses its own point coordinates stored under `heavenHell.bonus.pentagram.points`.
- Only **Divine Strike** and **Divine X** currently interact with it.
- Each point owns exactly one segment / dot state.
- Dots stay lit until the Pentagram completes, then the completion ray resolves and the Pentagram resets so it can be filled again in the same battle.

## Server Responsibilities

- Persist Pentagram state under `gameState.heavenHell.bonus.pentagram`.
- Evaluate Divine Strike / Divine X areas against Pentagram points during bonus hunt ability resolution.
- Mark dot progress once per fill cycle.
- When all 5 dots are lit, queue a completion payload for the client, apply the multiplier reward through configurable stepped upgrades, then reset the Pentagram state for the next cycle.
- Keep all reward tuning in `src/game-server/server_config.json` under `heavenHell.bonus.pentagram`.

## Client Responsibilities

- Render the faint Pentagram from bonus start.
- Keep it outside the reel area while sharing the same world-space camera.
- Animate point hits immediately, pause combat on completion, fire the multiplier ray into the center house multiplier, then return the Pentagram to its faint idle state.
- Apply the reward visually as `+1`, `+1`, `+1` style labels, not a single lump-sum popup.

## Key Files

- Server state and hit detection: `src/game-server/Gameserver.js`
- Server tuning: `src/game-server/server_config.json`
- Client flow hooks: `src/game-client/client/clientHeavenHellMethods.js`, `src/game-client/client/clientActionMethods.js`
- Client presentation: `src/game-client/game-scene/gameSceneHeavenHellMethods.js`, `src/game-client/game-scene/gameSceneHeroCombatMethods.js`

## Ticket Hook

- Use `bonusPentagram` in the ticket buckets when you want rounds that both enter bonus and complete the Pentagram.
