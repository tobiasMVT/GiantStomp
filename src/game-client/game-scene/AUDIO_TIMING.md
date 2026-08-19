# Audio And Timing

Owns presentation timing and sound behavior.

## Owns

- `waitForPresentation(...)`
- fast-forward / quick-stop state
- SFX wrapper policy via `playSfx(...)`
- music lifecycle: main theme / bonus theme
- sound-volume debug tool
- pause / slow-mo helpers
- `_recalcScales(...)` for combining baseline, slow-mo, and soft-pause timescales

## Called From

- `Client.js` for `waitForPresentation(...)`
- many scene feature modules for SFX, waits, and fast-forward behavior

## Shared State

- `_fastForwardRequested`
- `_fastForwardWaiters`
- `_skippablePresentationWaits`
- `soundVolumeMultipliers`
- `_soundVolumeToolElements`

## Rule

Keep gameplay decisions out of this module. It only changes how presentation time and audio behave.
