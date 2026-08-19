# Freespin UI

Owns freespin counter and ring presentation.

## Owns

- ring frame setup
- ring display creation / positioning
- ring ripple and consume animation
- freespin counter updates
- freespin award popup

## Main Entry Points

- `updateFreespinCounter(...)`
- `syncBonusFreespinRings(...)`
- `hideFreespinCounter()`

## Shared State

- `freespinCounterValue`
- `bonusFreespinRingDisplays`
- `bonusFreespinRingCount`
- `pendingBonusFreespinRingRemaining`

## Boundary

This module is UI-only. Spin count math still comes from server state and `Client.js`.
