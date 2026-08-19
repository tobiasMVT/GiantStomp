# README-CLIENT

This file explains the intended logic split inside `src/game-client/`.
It is written as a maintenance note for humans and AI tools.

Everything in this folder is game-specific. To create a new game, copy this entire folder, including `assets/`, and modify it. The framework folders outside `src/game-client/` stay shared.

## Plain-English Mental Model

If you want the shortest accurate explanation, use this:

- the server tells the client what outcome/action happened
- `Client.js` decides how that outcome should be presented
- `buildSegmentFlow.js` describes the skippable presentation flow for migrated actions
- `SegmentFlowRunner` executes that flow and handles checkpoint-based skip behavior
- `GameScene.js` performs the actual visual and audio work

The key boundary is:
- `Client` decides the flow
- `GameScene` performs the flow

## Current Reality

This section is intentionally blunt so maintenance work starts from the actual state of the codebase, not the idealized design.

- `spin` and `respin` currently use `SegmentFlowRunner` through `buildSegmentFlow.js`
- most other actions still run inline in `Client.js`
- `waitForPresentation(...)` is now the preferred wait helper, but `GameScene.js` still contains older raw `setTimeout(...)` and `Date.now()` timing in legacy paths
- `playSfx(...)` is the standard one-shot SFX path, but music still uses dedicated theme lifecycle methods

Use the migrated path for new work when reasonable.
Do not assume all older scene internals already follow the latest pattern.

## Terminology

- `fast-forward`: the broad user intent to move presentation ahead faster
- `skip`: checkpoint-based jump behavior controlled by `SegmentFlowRunner`
- `quick-stop`: the immediate presentation boost/cancel behavior used in active phases before the next checkpoint is reached

In practice these are related, but not identical:
- controller policy decides whether fast-forward is allowed
- the runner handles checkpoint skip behavior
- the scene handles visual acceleration, cleanup, and SFX policy

## Files

### `GameScene.js`

Phaser scene that renders the game: backgrounds, symbol grid, animations, particles, sound, and scene-level presentation helpers. It also implements `getLayoutContentBounds()`, which tells the framework what area must stay visible on screen.

Dev-only overlays that are strictly local to the game scene can also live here when they do not belong in the shared framework UI. One example is the forced-outcome picker, which lets HellDive request an exact ticket from the game server without editing the shared dev toolbar.

### `Client.js`

Bridge between server responses and `GameScene`. Receives server/game states, chooses the correct presentation flow, runs migrated actions through `SegmentFlowRunner`, and emits round lifecycle events used by the framework.

### `buildSegmentFlow.js`

Converts a server response into an ordered list of animation segments such as drop, reveal, highlight, explode, and finalize. Each segment is declarative: `{ checkpoint, enabled, run, onSkipAction }`.

### `config/gameClientConfig.js`

Game manifest and single source of truth for game-level settings the framework reads:

- `gameName`: displayed in the regulatory bar.
- `layout.mustSeeBounds`: rectangle the UI/layout scene tries to keep visible at all times. This is the important gameplay area that should stay on screen across aspect ratios and responsive layout changes.
- `layout.freeArea`: areas the UI/layout scene is allowed to use for framework UI such as buttons, bars, and controls without covering the protected gameplay area.
- `theme`: UI palette used by the framework shell.

### `config/client_config.json`

Static game math config used by the client build: grid dimensions, symbols, paytable, and initial state. `bonusEndPayout.showSymbolConfigBaseTbmOnOverlay` (with `symbolBaseTbmById` for symbols 1–7) draws labels as **children of the symbol** on the **bonus grid** during freespin / freerespin / freespin hunt (including **during gravity / slide tweens**). Each map value can be a **positive number** (auto-formatted like TBM), a **string** (shown exactly, e.g. `"x4"`), or **`null`** / omitted / `""` to hide that symbol’s overlay. Payout ids **1 / 2 / 3** use **gold / silver / bronze** text styling (aligned with typical 4× / 3× / 2× tiers). Overlay vertical offset is `BONUS_GRID_OVERLAY_LOCAL_Y` in `GameScene.js` if you want it more centered on the art. With **`mouseOverBoxTbmInfo`**, hovering the **bonus fruit pile** opens a wider tooltip listing every **`payoutSymbols`** row as `{symbolBaseTbmById}[symbolDisplayNamesById]: collectCount` (collect count can be `0`), with the fruit icon on the right; tune display names in **`symbolDisplayNamesById`**.

### `config/layoutMetrics.js`

Internal rendering geometry derived from `client_config.json`: cell sizes, pixel anchors, and coordinate helpers used by `GameScene`.

### `config/flowInteractionPolicy.js`

Controls skip and fast-forward behavior:

- `skipAllowed`
- `fastForwardArmingDelayMs`
- `fastForwardCooldownMs`
- `stopContinuedActions`

### `config/soundInteractionPolicy.js`

Per-sound SFX rules for fast-forward. Keyed by sound name, each entry has `{ allowDuringFastForward }`.

Default rule:
- if a sound is not listed, it is allowed during fast-forward unless the caller overrides that behavior explicitly

### `assets/`

All static game assets: symbol images, background images, sound effects, music, shaders.

### `lib/ticketsPublic.js`

Game-specific utility helpers.

## Responsibilities

### `Client.js`

`Client` is the runtime bridge between server state and scene presentation.

- Entry point: `reactOnResponse(gameState, clientState)`
- Decides which action branch should run
- Emits round lifecycle events through `GameScene`
- Uses `SegmentFlowRunner` for actions that are checkpoint-skippable
- Falls back to inline action handling for actions that are not migrated to segment flow yet
- Uses the shared presentation wait API for top-level dramatic pauses

Important rule:
- `Client` owns **flow orchestration**
- `GameScene` owns **visual execution**

`Client` should not contain game rendering logic beyond choosing which scene methods to call and in what order.

### `GameScene.js`

`GameScene` owns rendering and presentation helpers:

- scene animations and Phaser tweens
- presentation timing helpers
- SFX playback policy
- phase-specific cleanup hooks needed for skip

If a visual phase cannot be skipped cleanly by a timeScale boost alone, give it an explicit scene cleanup method.
Example: `skipHighlightPhase()`.

## Skip / Fast-Forward Model

There are two related concepts:

1. **Policy**
   - `GameController` decides whether fast-forward is currently allowed.
   - The UI never bypasses the controller.

2. **Presentation skip behavior**
   - `Client.requestFastForward()` forwards the request into `SegmentFlowRunner`.
   - The runner executes the current segment `onSkipAction`.
   - After that segment resolves, the runner jumps to the next enabled checkpoint.
   - Outside segment flow, fast-forward still boosts scene presentation speed and cancels shared skippable waits.

For actions migrated to segment flow:
- define the segment order in `buildSegmentFlow.js`
- keep each segment declarative
- provide a safe `onSkipAction`

If you add a new skippable phase, update all of these together:
- `buildSegmentFlow.js`
- any scene cleanup/skip helper needed by that phase
- the action path in `Client.js`

## Presentation Timing

Fast-forward in this client is primarily a **presentation** concern.

Gameplay/server state is not time-scaled.
Only the local presentation layer is accelerated, cancelled, or skipped.

This distinction matters:
- round math should stay deterministic
- controller timing gates should stay authoritative
- presentation delays may be accelerated or cancelled

### Standard wait helper

The standard timing helper is:

```js
scene.waitForPresentation(ms, { skippable, useSceneTime })
```

Rules:
- use this for new top-level dramatic waits
- prefer `useSceneTime: true` so scene timeScale can affect the wait
- set `skippable: true` when fast-forward should resolve the wait immediately
- use `scene.cancelSkippablePresentationWaits()` instead of custom cancel tokens when a generic presentation delay is enough

Current usage:
- `Client` uses it for its top-level waits
- segment-flow breath delays use it through `waitCancellable`
- selected simple `GameScene` pauses in active flows also use it now

Important note:
- `GameScene` still contains legacy raw `setTimeout(...)` / `Date.now()` timing in older internal animation code
- new work should use `waitForPresentation(...)`
- legacy internals can be migrated incrementally when touched
- do not assume changing one helper will automatically update every legacy wait path

## Segment Flow Rules

`buildSegmentFlow.js` converts one server response into segments shaped like:

```js
{
  checkpoint: true,
  enabled: true,
  run: async () => {},
  onSkipAction: () => {}
}
```

Guidelines:
- `run` should await scene primitives
- long sleeps in skippable paths should use the shared presentation wait helper when possible
- `checkpoint: true` should mark safe skip landing points
- `onSkipAction` should leave the scene in a valid visual state quickly

Current migration status:
- `spin` uses segment flow
- `respin` uses segment flow
- other actions still run inline in `Client.js`

Target direction:
- new skippable actions should prefer segment flow unless there is a strong reason to keep them inline

## Sound Model

Use this split:

- **SFX**: use `GameScene.playSfx(...)`
- **Music**: use dedicated theme methods like `startMainTheme()` / `startBonusTheme()`

Why:
- SFX can be suppressed during fast-forward according to `config/soundInteractionPolicy.js`
- music has longer lifecycle rules and should not be treated like one-shot effects
- we keep sounds at normal playback speed instead of time-scaling audio

### SFX policy wrapper

`playSfx(...)` is the central wrapper for one-shot sounds.
It enforces:

- per-sound fast-forward suppression from `config/soundInteractionPolicy.js`
- shared audio interaction modes

### Audio interaction modes

Audio is separate from visual timeScale.

Current modes:
- `normal`: regular SFX behavior
- `duckSfx`: allowed SFX still play, but at reduced volume
- `muteSfx`: reserved mode for future use if skip becomes too noisy

Current fast-forward behavior:
- allowed SFX stay at normal playback speed
- suppressed sounds are dropped by policy
- allowed sounds are ducked in volume during fast-forward
- music lifecycle stays separate and is not ducked by this wrapper

When adding new sounds:
- if it is a one-shot effect, use `playSfx(...)`
- if it should be muted during fast-forward, add it to `config/soundInteractionPolicy.js`
- if it is long-lived music, keep it in the dedicated music methods

## When Adding A New Action

Use this checklist:

1. Decide whether the action should stay inline in `Client.js` or move into `buildSegmentFlow.js`.
2. If the action is skippable, prefer segment flow and define safe checkpoints.
3. Add or reuse scene primitives in `GameScene.js` for the actual visual work.
4. If skip could leave visual leftovers, add an explicit scene cleanup/skip helper.
5. Use `waitForPresentation(...)` for new dramatic pauses instead of raw `setTimeout(...)`.
6. Route one-shot sounds through `playSfx(...)`.
7. If a new SFX should be blocked during fast-forward, add it to `config/soundInteractionPolicy.js`.

## Editing Notes For AI

When changing this folder:

- Do not move skip policy into the scene or UI
- Do not call scene skip helpers directly from outside the client/runner path
- Prefer extending `buildSegmentFlow.js` over adding more hardcoded skip branching
- Prefer `playSfx(...)` over direct `this.sound.play(...)` for one-shot effects
- Keep music lifecycle separate from SFX policy
- Prefer `waitForPresentation(...)` for new dramatic pauses
- If a skipped phase leaves behind visuals, add an explicit scene cleanup method

## Board Sprite Rules

For board-symbol maintenance in `GameScene.js`, keep this mental model:

- `reels` / `reelsAfterDrop` plus `dropEvent.movements` are the source of truth for which symbols should still exist on the board
- when gravity preserves symbol visuals between phases, only preserve symbols that are truly stationary blockers in the same cell; if a cell is also a `dropEvent` target, that symbol is arriving and must animate in rather than appear instantly
- temporary symbol-looking FX such as collect flights, burst flights, or HUD/meter transfers must be marked as transient and excluded from cell-resolution helpers
- if a helper resolves "any matching-looking sprite near this cell", it can accidentally destroy an FX sprite and leave the real board symbol behind
- treat scene children as presentation only; use action data such as `heroPath`, `affectedPositions`, `reelsAfterDrop`, and `dropEvent.movements` to decide what should survive on the board
- examples in this game include bananas, the hero path, and meter-collect flights, but the same rule applies to future games with different feature symbols

## Known Legacy Areas

These areas still deserve extra care:

- `GameScene.js` contains older raw-timer presentation logic that has not all been migrated to `waitForPresentation(...)`
- not every action has been moved to segment flow yet
- some older scene effects still rely on time-scale boosting rather than explicit skip cleanup

## Short Mental Model

Think of it like this:

- `GameController`: "Is skip allowed right now?"
- `Client`: "What presentation flow should this action follow?"
- `SegmentFlowRunner`: "Where do we jump when skip is pressed?"
- `GameScene`: "How do we render or clean up the visuals?"

## Creating Or Migrating A Game Client

1. Copy the whole `src/game-client/` folder for a new game.
2. Update `config/gameClientConfig.js` with game name, layout policy, and theme.
3. Update `config/client_config.json` with symbols, area, and math-facing client config.
4. Replace `assets/` with the new game assets.
5. Implement `GameScene.js` rendering and presentation primitives.
6. Implement or extend `buildSegmentFlow.js` for actions that should be checkpoint-skippable.
7. Tune `flowInteractionPolicy.js` and `soundInteractionPolicy.js`.

## Editing Rule Of Thumb

If the change is about:

- action order or skip checkpoints: start in `Client.js` and `buildSegmentFlow.js`
- visual cleanup or animation behavior: start in `GameScene.js`
- fast-forward sound behavior: start in `playSfx(...)` and `config/soundInteractionPolicy.js`
- dramatic pauses or skippable waits: use `waitForPresentation(...)`
