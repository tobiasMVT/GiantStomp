# Payways Client Architecture

The previous feature-module facade has been removed. `GameScene.js` is now a compact, self-contained 5×3 renderer.

## Flow

`server state → Client.reactOnResponse → buildSegmentFlow → SegmentFlowRunner → GameScene`

## Action mapping

- `spin`: leave bonus if needed, reset win, slide old board out, full-board drop
- `respin`: apply downward `dropEvent.movements`
- `bonustransition`: fade main game into the `bonus_intro.png` planning scene, then into the bonus background/theme and initialized lives/trap meters
- `freespin`: spin the bonus reels, reveal cash, update lives, and collect traps
- bonus exit (after last `freespin` with `nextAction === "spin"`): ouch background, fake spin, `presentOuchStompSequence`
- `freerespin`: legacy compatibility only; the cash bonus does not cascade

All board actions then use the same optional scatter/Anger presentation, reveal checkpoint, ways-win highlight, explosion, and count-up.

## Scene state

- `reelSprites[reel][row]`: canonical visible board sprites
- `angerMeterState`: current server meter projection
- `freespinCounterValue`: framework-compatible projection of current bonus lives
- `trapMeterState`: four-light trap progress, completion values, and cumulative trap power
- `damageMeterState`: configured, removed, and remaining segments rendered by the damage meter
- `isPostBonusOuch` / `ouchScrollY`: pit descent offset during trap resolution
- `isInBonusMode`: background/music mode only
- `mainGameSpeedSettingIndex`: selected presentation speed (`1.5x`, `2x`, or `3x`)
- `presentationWaits` / `activeTweens`: fast-forward cleanup
- `layoutSnapshot`: responsive camera projection supplied by the framework

No house, Angel, demon combat, loot, chest, portal, mystery, bee, merge-gun, or collect-phase presentation remains in the client code.

## Spin speed

The minimal top-left fast-forward control uses drawn vector arrowheads. Its one, two, and
three arrows select `+50%`, `+100%`, and `+200%` presentation speed respectively.
`GameScene.tweenPromise` and `waitForPresentation` scale both main-game and bonus
presentation durations without changing server math or the existing one-shot fast-forward behavior.
