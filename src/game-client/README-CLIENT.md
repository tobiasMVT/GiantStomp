# 3×5 Payways Client

This folder is the game-specific presentation client. The framework outside this folder remains reusable.

## Outcome contract

The client accepts `spin`, `respin`, `bonustransition`, `freespin`, and `freerespin`.

- `reels`, `reelsBeforeDrop`, and `reelsAfterDrop` describe five reels with three rows.
- `dropEvent.movements` describes downward cascade movement.
- wins come from `waysWins`; `clusters[*].positions` remains a compatibility fallback.
- scatter symbol `8` landings come from `scatterLandings`.
- `angerMeter` is `{ count, max }` and is displayed as three visual segments.
- `bonusState` supplies remaining/initial freespins.

## Responsibilities

- `Client.js` selects the action flow, maintains round lifecycle emits, switches bonus theme/counter state, and forwards fast-forward requests.
- `buildSegmentFlow.js` defines the shared skippable drop/cascade, scatter, win, explosion, and count-up sequence.
- `GameScene.js` owns the 5×3 board, Phaser animation, sound, themes, meter, counter, and responsive bounds.
- `queueGameSceneAssets.js` queues only symbols 1–8, the two backgrounds, and presentation audio.
- `config/layoutMetrics.js` is the single board-coordinate source.

## Presentation

A full spin moves the old board down and out, then stagger-drops a complete board from above. Respins preserve and move existing sprites according to `dropEvent.movements`, create incoming symbols above the board, and reconcile against `reelsAfterDrop`.

Win positions pulse, tint, explode, and are removed before the next cascade. Scatter landings pulse one at a time, update the Anger meter, and then remain visibly dimmed as consumed symbols if a cascade moves them. Main and bonus use the same board flow; bonus transition only changes background, music, and freespin counter.

## Skip model

`Client.requestFastForward()` asks `SegmentFlowRunner` to skip the active segment. Scene waits are cancellable, visual tweens accelerate, and win audio listed in `soundInteractionPolicy.js` is suppressed during fast-forward. Gameplay state is never changed by skipping.

## Framework interfaces

Keep these stable:

- `GameScene` constructor and Phaser `create`/shutdown lifecycle
- `GameScene.setEventBus`, layout bounds, audio controls, and round event emitters
- `Client.reactOnResponse(gameState, clientState)`
- `Client.requestFastForward()`
- `queueGameSceneAssets(load, deps)`
