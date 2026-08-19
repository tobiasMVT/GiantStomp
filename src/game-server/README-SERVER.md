# README-SERVER

This file explains the intended logic split inside `src/game-server/`.
It is written as a maintenance note for humans and AI tools.

## Plain-English Mental Model

If you want the shortest accurate explanation, use this:

- the server generates one full game round at a time
- a game round is returned as `roundStates[]`, not as one final result object
- each entry in `roundStates[]` is the server snapshot after one executed action
- `Gameserver.js` decides which action runs now through `executedAction`
- `Gameserver.js` decides which action runs next through `nextAction`
- ticket strategy is a round-selection layer on top of the math, not the action engine itself

The key boundary is:
- `getResponse(...)` advances one action
- `generateRoundStates(...)` keeps advancing until the whole round is complete

## Current Reality

This section is intentionally blunt so maintenance work starts from the actual state of the codebase, not the idealized design.

- the main public server entry point is `GameServer.generateRoundStates({ betSize, ticketStrategy })`
- the controller/client side usually consumes a full `roundStates[]` timeline and then replays it locally
- a round is considered complete when the returned state's `nextAction === "spin"`
- action logic is heavily branch-based inside one large `getResponse(...)` function
- ticket strategies are defined as weighted buckets in `server_config.json`
- when ticket mode is active, the server may generate and discard many full rounds before returning one

## Files

### `Gameserver.js`

Main game-specific server logic.
It owns:

- action progression
- round generation
- ticket selection and ticket matching
- all math/state mutation for spins, respins, bonus actions, troll actions, and round summary data

### `server_config.json`

Static server config and the default game state.
Important things live here:

- initial `gameState`
- `mathStyle`
- ticket strategy buckets such as `normal`, `bonus`, `trollBonus`, `mystery`, and `max`
- wallet and cost config
- symbol weights and other math settings

### `httpServer.js`

Small local HTTP wrapper around `GameServer`.
It does not change the math.
It only exposes the same server behavior over HTTP.

### `simulation_config.json`

Local simulation-oriented config values such as round count, bet size, and output naming.
In this repo, backend simulation still uses the normal round-generation path rather than a separate server-only engine.

### `lib/ticketsPublic.js`

Game-specific ticket helper data used by the server-side ticket system.

## How A Round Is Generated

The normal server flow is:

1. `generateRoundStates(...)` resolves the requested ticket strategy.
2. If that strategy has a weighted ticket bucket, the server draws one ticket from that bucket.
3. The server builds a fresh round by cloning `server_config.gameState` and repeatedly calling `getResponse(...)`.
4. Every response snapshot is pushed into `roundStates[]`.
5. When the current response says `nextAction === "spin"`, the round is finished and the timeline is complete.
6. If ticket mode is active, the finished round is checked against the selected ticket.
7. If the round does not match, the whole round is discarded and generation starts again.

Important detail:
- the server returns the full action timeline for the round, not just the final state

Each state also gets `roundMeta`, which currently includes:

- `betSize`
- `baseCost`
- `strategyCostMultiplier`
- `roundCost`
- `ticketStrategy`

## Action State Machine

The action model is state-driven, not event-stream driven.

At the start of `getResponse(gameState, betSize)`:

- `pastAction = executedAction`
- `executedAction = nextAction`

After that, the server runs the logic branch for the new `executedAction`.
That branch mutates the board, win state, bonus state, and finally decides the next step by setting `nextAction`.

This means:

- `executedAction` means "what the server is processing right now"
- `nextAction` means "what should happen on the next server step"
- `pastAction` is just the previous action for context/debugging

Common actions in the current server are:

- `spin`
- `respin`
- `bananaHunt`
- `bonustransition`
- `freespin`
- `freerespin`
- `freespinbananaHunt`
- `chestreward`
- `trolltease`
- `trollrush`

Important rule:
- do not treat the action flow like a generic queue
- the logic is highly action-specific, and many branches assume exact action names and exact state shapes

## Ticket Strategy Model

Ticket strategy is a dev and selection layer.
It is not the same thing as the action state machine.

The current model is:

- a strategy name such as `normal` or `bonus` resolves to a weighted bucket in `server_config.json`
- `drawWeightedTicket(...)` picks one ticket from that bucket
- the server then keeps generating full rounds until one matches the chosen ticket

Examples of ticket names:

- `bonus`
- `noBonus`
- `bonus_min0_max500`
- `mysteryRunNoBonus_min0_max30`

The `_minX` and `_maxY` suffixes are parsed as TBM constraints on the final round result.

`isTicketMatch(...)` checks the finished round timeline for conditions such as:

- whether bonus happened
- whether banana hunt happened
- whether a real troll run happened
- whether a troll tease happened
- whether certain hero abilities appeared
- whether final `tbm` is inside the requested range

Important rule:
- ticket strategies change which finished rounds are accepted
- they do not directly decide the per-action logic inside `getResponse(...)`

## Local Vs HTTP Server

Most of the app currently uses the server locally in-process.

`RoundGateway` does this:

- if `apiBaseUrl` is empty, it creates and calls `new GameServer()` directly
- if `apiBaseUrl` is set, it calls the HTTP API instead

So the same round-generation model can run in two ways:

- local mode: direct JS call to `generateRoundStates(...)`
- remote mode: `POST /api/round-states`

`httpServer.js` currently exposes:

- `GET /health`
- `GET /api/session`
- `GET /api/ticket-strategies`
- `GET /api/dev/forced-ticket`
- `POST /api/dev/forced-ticket`
- `POST /api/round-states`

Important rule:
- `httpServer.js` is a transport wrapper
- `Gameserver.js` is the actual game logic

### Forced outcome dev override

There is also a dev-only forced-outcome layer now:

- the client tool can store `{ strategy, ticket }` as a forced selection
- local in-process mode shares that selection through a browser/global store
- HTTP mode mirrors the same selection through `/api/dev/forced-ticket`
- when present, round generation uses that exact ticket instead of drawing a weighted ticket

This is intentionally a dev convenience, not player-facing math behavior.

## Simulations

Simulation in this repo still goes through the normal round-generation path.

`GameController.runBackendSimulation()` repeatedly calls `roundGateway.fetchRoundStates(...)`.
That means simulations use:

- the same `generateRoundStates(...)` entry point
- the same ticket strategy behavior
- the same local-vs-remote gateway choice

So there is not a separate "simulation math engine" here.
Simulation is just repeated use of the normal server round generator.

## Editing Notes

If you change server logic, keep these rules in mind:

- when debugging a wrong flow, inspect `executedAction`, `nextAction`, and the final round state together
- when changing ticket behavior, verify whether you are changing selection logic or actual math logic
- when changing round completion behavior, remember that many consumers assume a round ends when `nextAction === "spin"`
- when changing state shape, remember the client replays the returned `roundStates[]` timeline directly
- when adding a new action, update both the action branch logic and any code that assumes which actions can appear in a round
- when changing strategy buckets in `server_config.json`, remember that zero or missing weights effectively disable ticket-mode selection for that bucket

The main mental split to preserve is:

- action logic decides what happens inside a round
- ticket logic decides which complete rounds are accepted and returned


