# Layout And Events

Owns the small framework-facing scene boundary.

## Owns

- layout bounds reporting
- layout debug visualization
- event bus registration
- round lifecycle emits

## Main Entry Points

- `setEventBus(...)`
- `getLayoutContentBounds()`
- `emitRoundStarted()`
- `emitRoundEnded()`
- `emitOutcomeRevealed()`

## Shared State

- `eventBus`
- `layoutSnapshot`
- `layoutDebugEnabled`
- `mustSeeDebugGraphics`

## Boundary

This module is the narrow bridge from game presentation into framework layout and lifecycle events.
