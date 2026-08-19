# Architecture Decisions Log

## ADR-001: Controller is single gateway
- Status: Accepted
- Context: UI/scene currently initiate game flow.
- Decision: All meaningful actions go through GameController.
- Consequences: Better control for compliance, dialogs, spin readiness, and future adapters.

## ADR-002: Server returns full round states
- Status: Accepted
- Context: Need deterministic orchestration and decoupled playback.
- Decision: Server/gateway returns `roundStates[]` for one complete round.
- Consequences: Controller chooses fetch vs continue; playback can be local and testable.

## ADR-003: Renderer/UI are adapters
- Status: Accepted
- Context: Need framework-agnostic core.
- Decision: Core has no Phaser imports; Phaser implements adapter interfaces.
- Consequences: Easier future migration to Pixi/other engines.

## ADR-004: Dual Phaser scenes
- Status: Accepted
- Context: User wants non-React runtime UI.
- Decision: Use `GameScene` + `UIScene` with controller-mediated communication.
- Consequences: Cleaner layering and better scene responsibility boundaries.

## ADR-005: Playback policy is core-level
- Status: Accepted
- Context: Need skip/quickstop/fast-forward independent of rendering framework.
- Decision: Implement `PlaybackPolicy` in core; adapter maps to engine-specific timing.
- Consequences: Consistent behavior across renderers.

## ADR-006: Shared responsive layout system
- Status: Accepted
- Context: Resizing currently ad hoc and scene-coupled.
- Decision: Introduce framework-agnostic `LayoutManager` that outputs a layout snapshot for both renderers.
- Consequences: Stable reel area + flexible UI reflow.
