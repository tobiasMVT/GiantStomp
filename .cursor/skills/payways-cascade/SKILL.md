---
name: payways-cascade
description: Maintains the 5x3, 243-ways cascade engine, scatter consumption, Anger meter, and freespin shell. Use when changing reel math, cascades, ways wins, scatter landings, Anger progress, or bonus spin flow.
---

# Payways Cascade

## Board contract

- The board is 5 reels by 3 rows.
- Reel data is `reels[reel][row]`; reel 0 is leftmost and row 0 is bottom.
- Symbols 1-7 pay. Symbol 8 is the temporary Anger scatter and never joins ways wins.
- Gravity is downward. Preserve `reelsBeforeDrop`, `reelsAfterDrop`, and `dropEvent.movements` for client animation.

## Ways scoring

- Evaluate matching paying symbols on consecutive reels starting at reel 0.
- Require at least three matching reels and use only the longest 3/4/5-reel award.
- `ways` is the product of matching symbol counts on each involved reel.
- `tbm = paytable[symbol][reelCount] * ways`; currency payout is `tbm * betSize`.
- Remove the union of all positions in every ways win before applying gravity.
- Return positions explicitly. The client must not reconstruct wins from displayed sprites.

## Action flow

Main game:

`spin -> respin while wins remain -> bonustransition or spin`

Bonus:

`freespin -> freerespin while wins remain -> freespin while spins remain -> spin`

Initial `spin` and `freespin` use the full-board top drop. `respin` and `freerespin` use `dropEvent.movements`.

## Bonus entry and fake Anger

- Scatters no longer charge Anger or trigger bonus.
- Paid stomp/crush events count crushed animals for the round.
- After the feature resolves, roll `bonusTriggerOdds[killCount]` (capped by config keys).
- Each animal kill may also tick the fake Anger display using `angerMeterTickOdds`.
- Display cap before bonus is `anger.displayCapBeforeBonus` (default 9 on a 10-step meter).
- When bonus triggers, the action reports `angerMeter.count = 10`, latches bonus, and cascades stop immediately.
- `animalKillEvents` on the action/stomp/crush payload drives client meter ticks per crushed animal.
- Client Anger display persists across paid spins; reset only in `GameScene.leaveBonus()`.
- Server `ticked` is authoritative; client increments its own display count on tick (do not sync `displayAfter` from server each spin).

## Client rules

- `Client` owns action sequencing; `GameScene` owns animation.
- Main and bonus use the same board drop, ways highlight, explosion, and gravity primitives.
- Keep `reelSprites[reel][row]` aligned with server state.
- Animate fake Anger from `animalKillEvents` during stomp/crush presentation; coin drop, blood, and anger embers start at the kill moment.
- When bonus triggers, overcharge fills remaining meter steps on the bar only (no extra kill-position embers); pacing accelerates from a slow beat into a burst.
- Increase Anger blink intensity as the display fill rises.
