---
name: bonus-intro-transition
description: Presentation-only story cut between main game and Giant Stomp bonus entry. Use when changing the planning-scene art, timing, camera drift, or bonus handoff visuals.
---

# Bonus Intro Transition

## Purpose

This system adds a short narrative scene between the main game and the Giant Stomp bonus.
It does **not** change math, bonus triggering, or server state. It only changes how
`bonustransition` looks and sounds.

## Ownership

- `src/game-client/Client.js`
  - Still decides that `bonustransition` should call `scene.enterBonus(gameState)`.
- `src/game-client/GameScene.js`
  - Owns the visual sequence.
  - `enterBonus()` hides the normal HUD, pre-syncs bonus UI state, and calls `presentBonusIntroScene()`.
  - `presentBonusIntroScene()` fades out the main game, stages the planning artwork, runs the slow drift/glow beat, and then fades into the real bonus background.
- `src/game-client/queueGameSceneAssets.js`
  - Loads `bonus_intro.png`.

## Assets

- `src/game-client/assets/giantstomp/bonus symbol/bonus_intro.png`
  - Full-scene artwork showing the animals planning revenge.

## Rules

- Keep this sequence presentation-only.
- Preserve fast-forward behavior by using scene tweens / presentation waits instead of gameplay delays.
- Bonus HUD should stay hidden until the planning scene finishes.
- If the art or framing changes, update the client docs in `src/game-client/README-CLIENT.md`.
