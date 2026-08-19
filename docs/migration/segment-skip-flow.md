# Segment Skip Flow (AI Guide)

This document is the source of truth for skip/quickstop behavior.
If AI changes skip logic, it must follow this file.

## Goal

Keep skip behavior generic and explicit:

- UI sends one fast-forward intent.
- Controller decides if fast-forward is currently allowed.
- Client uses a checkpoint flow to decide where to jump.
- Scene executes visual actions only (no business rules).

## Runtime Flow

1. `UIScene` emits `intent:fastForwardRequested`.
2. `GameRuntime` forwards to `GameController.handleFastForwardRequested()`.
3. Controller checks policy (`canQuickStop` / `canSkip`) and regulator flags.
4. Controller also checks timing gates:
   - arming delay after round start (`fastForwardArmingDelayMs`)
   - cooldown after each skip (`fastForwardCooldownMs`)
5. If allowed, controller calls `Client.requestFastForward()`.
6. `Client` forwards to `SegmentFlowRunner.requestSkip()`.
7. Runner applies current segment skip action:
   - executes segment-specific skip action
   - jumps to the **next enabled checkpoint**
8. Scene emits render lifecycle events; controller updates spin/skip states accordingly.

## Policy Rules (Current)

- `QuickStop`: allowed at early round phase (initial drop window) if regulator allows.
- `Skip`: allowed after outcome reveal phase if regulator allows.
- Spin button readiness is controlled by round lifecycle events:
  - disabled on `render:roundStarted`
  - enabled on `render:roundEnded`
- Fast-forward input is accepted only when controller says allowed.

## Core Files

- `src/core/GameController.js`
  - Owns fast-forward policy gates and regulator timing settings.
- `src/core/GameRuntime.js`
  - Projects controller state to UI and schedules arming/cooldown refresh.
- `src/flow/SegmentFlowRunner.js`
  - Generic runner for segment list execution and checkpoint jumps.
- `src/flow/buildSegmentFlow.js`
  - Builds spin/respin checkpoint segments (`checkpoint`, `run`, `onSkipAction`).
- `src/classes/Client.js`
  - Creates flow per state and delegates skip decisions to runner.
- `src/components/GameScene.js`
  - Executes visual skip actions (`requestFastForward`, `skipHighlightPhase`, cleanup).

## Segment Definition Shape

Each segment uses this structure:

```js
{
  checkpoint: true,
  enabled: true,
  run: async () => { ... },
  onSkipAction: () => { ... }
}
```

- `checkpoint`: generic skip stop-point (no game-specific naming required).
- `enabled`: include/skip this segment.
- `run`: normal phase action.
- `onSkipAction`: what to force immediately when skip is pressed.

Runner rule:
- when skip is requested, it executes current segment `onSkipAction`
- then resumes from the **next enabled segment where `checkpoint === true`**

## AI Change Rules (Must Follow)

- Do not add game-specific skip routing IDs as primary control flow.
- Prefer generic checkpoints over named semantic jump targets.
- Do not bypass controller policy by calling scene skip methods directly from UI.
- Do not reintroduce DOM click hacks for skip/spin.
- Do not use hard `setTimeout` for critical skip-sensitive presentation flow.
- If adding a new visual phase, define:
  - its segment in `buildSegmentFlow`
  - its `checkpoint` value
  - its `onSkipAction`
  - any needed scene cleanup on fast-forward.

## Await Rules For Skip (Important)

Use these rules when writing/adjusting async flow:

- **Await segment primitives, not arbitrary sleeps**
  - Good: `await scene.highlightClusters(...)`, `await scene.applyGravityAnimation(...)`
  - Bad: `await new Promise(setTimeout(...))` in flow logic for critical phases
- **If delay is needed, make it cancellable**
  - Use scene clock / cancellable wait helper
  - Ensure skip can resolve/cancel pending wait safely
- **Every await in a skippable path must have an escape**
  - token invalidation, cancel function, or fallback timeout
- **Do not block runner with unbounded waits**
  - scene primitives should always resolve (normal, skipped, or timeout fallback)
- **Skip action should be immediate and side-effect safe**
  - `onSkipAction` should force current phase to a valid end-state quickly
  - It must not leave transient overlays/tweens orphaned
- **Checkpoint jump happens after current await resolves**
  - Runner executes current segment `onSkipAction`
  - Then continues from next enabled checkpoint
- **Scene owns visual timing defaults**
  - Flow should not micromanage effect durations unless explicitly required by policy
- **Never rely on DOM click chaining for continuation**
  - continuation must stay inside controller/runner logic

## Known Event Names

- UI intent: `intent:fastForwardRequested`
- Render lifecycle: `render:roundStarted`, `render:roundEnded`
- Optional render diagnostics:
  - `render:fastForwardRequested`
  - `render:fastForwardConsumed`
  - `render:fastForwardCleared`

## Notes for New Games

- Keep checkpoint names generic or anonymous; order matters more than naming.
- Add or remove segments per theme/game mode without changing runner logic.
- Regulator-specific behavior should be implemented in controller policy, not scene code.
