# Heaven Hell

Owns the Hell bonus presentation layer.

## Owns

- Heaven/Hell background swap
- portal aura and ripple spawn
- angel portal dive / arrival / charge / wrath FX
- attack slash GIF playback (`attack.gif`, `attack2.gif`) via decoded frames, not native Phaser GIF animation
- loot ground rendering and loot collect phase
- Heaven/Hell kill meter and ability panel
- ground-loot chest tracker on the bonus meter panel

## Main Entry Points

- `updateHellDiveBackground(...)`
- `playHeavenHellBonusEntryPortalTransition(...)`
- `playHeavenHellRippleSpawn(...)`
- `syncHeavenHellLootGround(...)` / `renderHeavenHellLootGround(...)` (incremental add only)
- `clearHeavenHellLootGround(...)` (bonus exit + collect phase only)
- `playHeavenHellCollectPhase(...)`
- `updateHeavenHellAbilityText(...)`

## Shared State

- `heavenHellLootSprites`
- `heavenHellRenderedLootKeys`
- `heavenHellPortalAura`
- `_mainGamePortalSprite` / `_mainGamePortalMaskSprite` (main-game portal GIF behind reels)
- `_heavenHellMeterUi`
- `_heavenHellMeterRuntime`
- `_heavenHellGroundLootDisplayValue`
- `_heavenHellActiveGameState`

## Ground Loot Tracker

The bonus meter panel is split into `Abilities | Ground Loot`.

- `Abilities` owns the kill count, progress bar, and ability slots.
- `Ground Loot` owns the chest icon and the displayed ground-loot total.

- It does **not** include the Heaven/Hell multiplier.
- It advances on the same presentation beat as loot landing labels.
- It resets when ground loot is cleared at Collect Phase / bonus exit.

## Main-Game Portal Background

Tuned via `gameClientConfig.layout.mainGamePortal`:

| Key | Purpose |
|-----|---------|
| `enabled` | Toggle portal GIF |
| `replaceDot` | When true, portal replaces the red kill dot |
| `anchor.reel/rowA/rowB/offsetX/offsetY` | Shared grid anchor for portal + soul FX |
| `dot.offsetX/Y`, `dot.radius` | Portal anchor fine-tune (red dot only when `replaceDot: false`) |
| `portal.offsetX/Y`, `portal.scale`, `portal.alpha`, `portal.depth` | Extra nudge, base size, opacity, draw order |
| `zoomFocus.reelA/reelB/rowA/rowB/offsetX/offsetY` | Separate camera zoom target when portal art and zoom sweet-spot differ |
| `source` | `"gif"` or `"redPng"` — swap portal art without code changes |
| `mask.growth.startRadius/startInnerHold` | Mask size at 0 kills |
| `mask.growth.endRadius/endInnerHold` | Mask size at max kills (75) |
| `mask.bonusEntry.radius/durationMs/cameraZoom` | Hell-dive zoom on bonus trigger |

Hidden during bonus (`isInBonusMode`). Animated with `gifuct-js` frame decoding into a Phaser canvas texture.

Bonus entry timing:

- let the main-game resolve finish before the entry beats start
- show `HELLDIVE...` first while the portal grows to full size
- when the portal is open, fly the Angel into it
- after the Angel vanishes, keep the current camera framing and ease it into the portal anchor dot over a longer zoom, then swap to the Hell background behind that whiteout

## Boundary

`Client.js` still decides when Heaven/Hell phases happen. This module only renders them.

## GIF Note

Slash GIFs in `assets/helldive/effects/` need the same kind of manual frame decode approach as the main-game portal.
They do not autoplay as animated GIFs inside Phaser images.
