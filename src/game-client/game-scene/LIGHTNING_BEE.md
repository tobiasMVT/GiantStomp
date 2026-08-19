# Lightning Bee

Owns Lightning Bee feature visuals, meter, and collection flow.

## Owns

- bee meter UI and tooltip
- bee symbol pulse state
- bee movement / charge FX
- collection animation
- multiplier charge / hit feedback

## Main Entry Points

- `updateLightningBeeMeter(...)`
- `playLightningBeeMovements(...)`
- `playLightningBeeFeatureCollection(...)`
- `consumeLightningBeeFeatureCollections(...)`

## Shared State

- `lightningBeeMeterState`
- `lightningBeeMeterIcon`
- `lightningBeeMeterText`
- `lightningBeeMeterMultiplierText`

## Boundary

This module reads scene board state but does not choose when the feature should trigger.
