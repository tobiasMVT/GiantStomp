# 3×5 Payways Server

`GameServer.generateRoundStates({ betSize, ticketStrategy, fakeNoWins })` is the public
entry point. It returns the complete action timeline for one accepted paid round.

## Math

- Board: 5 reels × 3 rows.
- Symbols 1–7 pay; symbol 8 is Scatter.
- A symbol wins on its longest consecutive run from reel 1, with 3, 4, or 5 reels.
- Ways are the product of matching symbol counts on those reels.
- Win amount is `configured TBM × ways × betSize`.
- All positions participating in all wins are removed together.
- Symbols fall toward row 0; replacement symbols enter from above.
- Cascades use `spin -> respin` in the base game and
  `freespin -> freerespin` in the bonus.

Every action state includes `waysWins`. `clusters` mirrors those wins for transitional
client compatibility. Winning states expose the post-removal board in
`reelsBeforeDrop`; cascade states expose the landed board in `reelsAfterDrop` and a
downward `dropEvent`.

## Scatter and Anger

Only newly landed Scatters count:

- all Scatters on an initial spin are new;
- on cascades, only Scatter symbols in replacement movements are new;
- existing Scatters moved by gravity are never counted again.

`scatterLandings` are still emitted for presentation, but they no longer charge Anger.

Bonus entry now rolls from crushed animals on paid spins. Each animal increments the
round kill count. After the stomp/crush resolves, the server rolls `bonusTriggerOdds`
using the capped kill count (`0`→`6` in config). The client fakes a 10-step Anger
meter: each kill can tick it using `angerMeterTickOdds`, but the display caps at step
9 until bonus actually triggers, when step 10 is shown and the round latches bonus.
Once bonus is latched, cascades stop immediately.

## Bonus cash game

Bonus entry emits `bonustransition`, then `freespin` actions containing independently
spun cash boards. A spin spends one of three lives. Any non-empty bonus symbol
(`111`–`1000`) restores all three lives; symbol `0` is empty. Bonus values build
unscaled `trapMeter.power` but do not enter `twa` until the post-bonus ouch stomp resolves.
The bonus ends after three consecutive empty spins.

When the bonus ends, `resolveOuchStomp()` runs on the final trap power and damage wheel.
Step 1 always consumes the leftmost remaining segment; each extra step rolls against
`damageMultilpierStepOdds` (default `0.66`). Win per step is `trapPower × segment value`;
the credited win is the **last** step's `winAmount`, attached as `ouchStompEvent` on the
final bonus `freespin` state and added to `twa`.

A spin reports `bonusState.livesBeforeSpin` and `livesAfterSpend` alongside the
post-spin `livesRemaining`, so the client can show the spent life without revealing
whether the spin resets it.

Trap symbols `666`, `777`, `888`, and `999` increment separate four-light collections.
Their displayed power is awarded once, when the fourth light lands, and that trap's
progress then resets to zero so it can be collected again. Landings carry
`trapLightsFilled` (lights shown before the reset) and `completedTrap`. Symbol `1000` is
a damage multiplier: it removes the lowest remaining value from `damageWheelSegments`
instead of using sockets. Symbols `111`–`555` add power immediately. Bonus states
expose `bonusLandings`, `bonusState`, `trapMeter`, and `damageWheel`; bonus spins have
no ways or cascades. `bonus.maxSpins` is a defensive termination cap.

## Giant Stomp

On paid `spin` actions with the `random` ticket, the server may trigger a mystery
stomp (`stompFeature.odds`). It crushes 2–3 consecutive reels, zeroes those cells,
and emits `stompEvent` with `reelsBeforeStomp`, `crushedCells`, and coin types for
animal symbols. Dev ticket `stompEntry` always forces the feature; `huntStompFeature`
loops until a natural stomp is found.

## Ticket Strategies

- `normal`: natural weighted-symbol board generation.
- `noWin`: a paid spin without a ways payout.
- `waysWin`: a paid spin containing a ways win.
- `bonusEntry`: a paid spin that forces crushed animals and guaranteed bonus entry.

The forced-outcome development endpoints remain compatible with these strategy and
ticket names.

## HTTP API

The existing routes remain:

- `GET /health`
- `GET /api/session`
- `GET /api/ticket-strategies`
- `GET|POST /api/dev/forced-ticket`
- `POST /api/round-states`

## Tests

Run:

```sh
node --test src/game-server/*.test.js
```
