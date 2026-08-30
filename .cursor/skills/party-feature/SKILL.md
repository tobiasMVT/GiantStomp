---
name: party-feature
description: Animal party mystery feature — server odds, animal-only boards, giant stomp/crush weights, and client confetti pre-drop presentation. Use when changing party odds, celebrating symbol landings, or party giant resolution.
---

# Party Feature

Mystery main-game feature where confetti starts before symbols land, the board fills with animals only, and symbols use celebrating art.

## Server

Config in `server_config.json`:

- `partyFeature.odds` — chance per paid `spin` (main game only).
- `partyFeature.oddsForGiant` — chance the giant appears once party triggers (default `0.5`).
- `partyFeature.oddsForStomp` / `oddsForCrush` — weighted giant type when he appears (`1` / `0` = always stomp today).
- `partyFeature.preDropMs` — client hint for confetti lead time before reel drop (default `1400`).
- Uses `animalSymbols` (`1`–`5`) for the injected board; low symbols (`6`–`10`) are excluded.
- After the animal board is built, `maybeInjectUnicorn` runs with the same `unicorn_injection.odds` as normal paid spins (symbol `14` can appear on the party grid). Party giant resolution stays stomp-only in config; crush during party is unused.

Resolution order on paid spin (before ways evaluation):

1. Try `partyFeature` first.
2. If party triggers, replace the board with animal-only symbols, then roll unicorn injection.
3. If the giant roll passes, resolve stomp using party weights (`forceStomp`). Crush during party is not used.
4. Otherwise emit party only (celebrating animals, optional unicorn, no giant).

Emits `partyEvent` on the `spin` action state:

```js
{
  triggered: true,
  giantAppeared: boolean,
  preDropMs: 1400
}
```

When the giant stomps during party, `stompEvent.reelsBeforeStomp` is the party board (celebrating animals plus any injected unicorn).

Dev entry:

- Ticket strategy `partyEntry` with ticket `partyEntry` always forces party.
- `isTicketMatch` validates `partyEntry` via `hasParty(roundStates)`.

## Client

- `buildSegmentFlow.js` slides old symbols out first, then runs `startPartyCelebration` before the staggered drop.
- Confetti spawns above the grid, drifts down slowly, and fades out near the bottom (fewer pieces than total-win confetti).
- Party drops land **reel-by-reel** with a short gap between each column.
- Confetti and party FX clear when stomp/crush starts, the next spin begins, or bonus intro starts.
