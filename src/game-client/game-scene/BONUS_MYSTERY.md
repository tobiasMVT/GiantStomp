# Bonus Mystery

Owns Bonus Mystery feature visuals and meter presentation.

## Owns

- feature symbol spin / pulse visuals
- mystery meter UI
- feature release after smash / kapow
- feature collection animation
- consumption helpers used by `Client.js`

## Main Entry Points

- `updateBonusMysteryMeter(...)`
- `playBonusMysteryFeatureReleaseAfterKapow(...)`
- `playBonusMysteryFeatureCollection(...)`
- `consumeBonusMysteryFeatureCollections(...)`

## Shared State

- `bonusMysteryMeterState`
- `bonusMysteryMeterIcon`
- `bonusMysteryMeterText`

## Boundary

This module should stay presentation-only. Feature sequencing still belongs in `Client.js`.
