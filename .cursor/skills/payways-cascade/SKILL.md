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

## Scatter and Anger rules

- Count each newly landed scatter once, including scatter symbols introduced by a cascade.
- Emit `scatterLandings` on the action where the scatter arrives.
- A scatter is consumed after charging Anger and must not charge again if it survives into another cascade.
- Anger persists across paid rounds on the server session instance.
- Three consumed scatters fill Anger, reset it, and enter a three-freespin bonus.
- Once a round has triggered the bonus, further scatters in that round have no effect.
- Bonus recharge and special bonus symbols are intentionally deferred.

## Client rules

- `Client` owns action sequencing; `GameScene` owns animation.
- Main and bonus use the same board drop, ways highlight, explosion, and gravity primitives.
- Keep `reelSprites[reel][row]` aligned with server state.
- Animate Anger from `scatterLandings`; never infer a new charge from a scatter merely remaining visible.
