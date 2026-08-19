# Merge Gun

Owns Merge Gun feature rendering and activation presentation.

## Owns

- feature symbol pulse / flare visuals
- merge-gun area building and drawing
- held gun movement into hero hands
- aiming and activation sequence
- merge-gun cleanup helpers

## Main Entry Points

- `syncMergeGunAreas(...)`
- `playMergeGunActivations(...)`
- `clearVisibleMergeGunFeatureSymbols(...)`

## Shared State

- `mergeGunAreas`
- `mergeGunAreaDisplays`

## Boundary

`Client.js` still decides when activations should play. This module only performs the visual sequence and area sync.
