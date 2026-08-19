---
name: SlotFrameworkMasterplan
overview: Create a phased, test-gated migration roadmap so you can refactor toward controller-driven, adapter-based architecture without breaking the working game.
todos:
  - id: phase0-baseline
    content: Create baseline fixtures, smoke scenarios, and migration docs with checklists
    status: in_progress
  - id: phase1-controller-gateway
    content: Introduce GameController as single action gateway without changing visible behavior
    status: pending
    dependencies:
      - phase0-baseline
  - id: phase2-round-contract
    content: Move round fetch queue into RoundGateway with full roundStates[] contract
    status: pending
    dependencies:
      - phase1-controller-gateway
  - id: phase3-roundplayer-adapter
    content: Add RoundPlayer and wrap current Client/GameScene behind PhaserRendererAdapter
    status: pending
    dependencies:
      - phase2-round-contract
  - id: phase4-phaser-uiscene
    content: Migrate UI controls to Phaser UIScene with intent-only events
    status: pending
    dependencies:
      - phase3-roundplayer-adapter
  - id: phase5-playback-policy
    content: Implement framework-agnostic fast/quickstop policy and adapter mapping
    status: pending
    dependencies:
      - phase4-phaser-uiscene
  - id: phase6-layout-manager
    content: Implement responsive LayoutManager and apply snapshots to both scenes
    status: pending
    dependencies:
      - phase5-playback-policy
  - id: phase7-regulator-policy
    content: Add regulator rule module and controller gating for spin readiness
    status: pending
    dependencies:
      - phase6-layout-manager
---

# Slot Framework Masterplan (Phased + Checkpoints)

## Current Status
- [x] Migration masterplan created in repo
- [x] Phase 0 support docs scaffolded (`test-matrix`, `round-fixtures`, `decisions`)
- [ ] Phase 0 baseline execution completed
- [ ] Phase 1 implementation started

## Strategy
Refactor in small reversible slices with a strict rule: each phase must pass a manual test checklist before moving on. Keep legacy path available behind a feature flag until the new path is stable.

## Phase 0 Today Checklist (Practical)

1. Fill environment baseline in `docs/migration/test-matrix.md`.
2. Run S01-S09 and mark each Pass/Fail with notes.
3. Capture at least 5 `roundStates[]` payload fixtures into `docs/migration/fixtures/`.
4. Fill fixture index in `docs/migration/round-fixtures.md`.
5. Record baseline commit hash in test matrix.
6. Open follow-up tasks for any failed scenario.
7. Commit Phase 0 docs + fixtures before coding Phase 1.

## Master Checklist Structure
Create and maintain these docs in the repo:
- `docs/migration/masterplan.md` (phases, owners, status)
- `docs/migration/test-matrix.md` (manual verification per phase)
- `docs/migration/round-fixtures.md` (known good server round payloads)
- `docs/migration/decisions.md` (architecture decisions and rationale)

## Phases With Exit Criteria

### Phase 0: Baseline & Safety Net
**Goal:** Freeze current behavior so you can compare later.
- Capture 5-10 representative round payloads and expected visual outcomes.
- Define smoke scenarios: normal spin, multi-cascade round, autoplay, stop, sound toggle, pause.
- Add runtime feature flag: `engineMode = legacy | controllerV1`.

**Exit criteria:** baseline scenarios documented and reproducible.

### Phase 1: Controller Skeleton (No behavior change)
**Goal:** Introduce `GameController` as the only gateway while still using old internals.
- Route `SpinButton` intent into controller.
- Controller calls existing round fetch logic and existing client reaction path.
- UI readiness/lock state comes from controller projection.

**Exit criteria:** gameplay unchanged; spin enable/disable handled only by controller.

### Phase 2: RoundGateway + Full-Round Contract
**Goal:** Formalize server interaction as `fetchRound() -> roundStates[]`.
- Move replay queue ownership to controller/round gateway.
- Remove direct server calls from UI code.

**Exit criteria:** UI has zero server knowledge; round fetch is centralized.

### Phase 3: RoundPlayer + RendererAdapter
**Goal:** Make playback framework-agnostic.
- Introduce `RoundPlayer` (state timeline executor).
- Wrap current `Client` + `GameScene` as `PhaserRendererAdapter`.
- Renderer emits completion events; no game logic decisions.

**Exit criteria:** controller orchestrates step flow using adapter events.

### Phase 4: Phaser UIScene Migration
**Goal:** Move UI controls from React components to Phaser `UIScene`.
- `UIScene` emits intents only.
- Controller projects UI state (`spinReady`, `betLocked`, dialogs).
- Keep React as shell only (or remove later).

**Exit criteria:** spin/bet/autoplay/sound no longer own logic.

### Phase 5: PlaybackPolicy (Fast/QuickStop)
**Goal:** Unified skip/speed system independent of Phaser.
- Add core `PlaybackPolicy` (`normal|fast|skipSegment`).
- Controller updates policy; renderer adapter maps to Phaser execution.
- Define skippable and non-skippable segments.

**Exit criteria:** quickstop/fastforward works consistently and predictably.

### Phase 6: Responsive Layout System
**Goal:** Centralized responsive system for game + UI renderer.
- Add framework-agnostic `LayoutManager` with profiles.
- Generate `LayoutSnapshot` used by both `GameScene` and `UIScene`.
- Remove ad hoc per-scene scaling math.

**Exit criteria:** stable layout across portrait/landscape/tablet/desktop.

### Phase 7: Regulator Rules Module
**Goal:** Controller-driven compliance.
- Add `RegulatorPolicy` module for bet levels, spin delay, mandatory blocking dialogs/checks.
- Controller gates `spinReady` only after all mandatory checks are cleared.

**Exit criteria:** UI cannot bypass compliance rules.

## Manual Test Matrix (Minimum per phase)
For each phase, run these and mark pass/fail:
1. Spin lifecycle: idle -> spin -> cascades -> idle
2. Round branching: next action `spin` vs `respin` transitions
3. Autoplay behavior: start, stop, edge stop during animation
4. Balance/bet correctness: debit/credit, bet lock windows
5. Quickstop/fast mode: no deadlocks, consistent end state
6. Sound behavior: key effects trigger once, mute/unmute consistency
7. Pause/resume: no stuck tweens/timers
8. Responsive checks: 4 viewport profiles minimum
9. Error path: failed round fetch handled without broken UI state

## Suggested Initial Milestone
- Complete Phase 0 fully.
- Start Phase 1 only after Phase 0 docs are filled and committed.

## Risks To Watch
- Hidden state mutations in old UI components.
- Timing race between animation completion and controller transitions.
- Duplicate sound triggers when skip/fast mode changes mid-segment.
- Layout drift if scenes still compute geometry independently.

## Definition of Done (overall)
- All meaningful actions pass through `GameController`.
- Server communication exists only in `RoundGateway`.
- Renderer/UI are adapters and emit events only.
- Compliance and spin readiness are controller-owned.
- Responsive behavior comes from one layout system.
