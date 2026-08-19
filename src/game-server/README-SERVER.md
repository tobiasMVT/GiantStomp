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

`scatterLandings` records each landing and whether it counted. Anger ranges from 0 to 3
within a single paid round. Each new round starts at 0. At 3, bonus entry is latched,
Anger resets to 0, and later Scatters in that round are ignored.

The HTTP wrapper owns one long-lived `GameServer`, but Anger is not persisted across
HTTP round requests.

## Bonus

Bonus entry emits `bonustransition`, followed by exactly three `freespin` chains.
Freespins use the same ways and cascade math. Scatters do not retrigger or alter
Anger during the bonus. The final bonus action ends with `nextAction: "spin"`.

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
- `bonusEntry`: a paid spin that supplies enough Scatters to enter the bonus.

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
