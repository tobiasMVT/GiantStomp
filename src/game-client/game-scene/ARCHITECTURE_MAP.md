# Payways Client Architecture

The previous feature-module facade has been removed. `GameScene.js` is now a compact, self-contained 5×3 renderer.

## Flow

`server state → Client.reactOnResponse → buildSegmentFlow → SegmentFlowRunner → GameScene`

## Action mapping

- `spin`: leave bonus if needed, reset win, slide old board out, full-board drop
- `respin`: apply downward `dropEvent.movements`
- `bonustransition`: crossfade bonus background/theme and initialize the freespin counter
- `freespin`: update counter, full-board drop using the shared flow
- `freerespin`: update counter, cascade using the shared flow

All board actions then use the same optional scatter/Anger presentation, reveal checkpoint, ways-win highlight, explosion, and count-up.

## Scene state

- `reelSprites[reel][row]`: canonical visible board sprites
- `angerMeterState`: current server meter projection
- `freespinCounterValue`: framework and local counter value
- `isInBonusMode`: background/music mode only
- `presentationWaits` / `activeTweens`: fast-forward cleanup
- `layoutSnapshot`: responsive camera projection supplied by the framework

No house, Angel, demon combat, loot, chest, portal, mystery, bee, merge-gun, or collect-phase presentation remains in the client code.
