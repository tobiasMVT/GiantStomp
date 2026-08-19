---
name: crush-feature
description: Giant hand crush feature — server odds, stomp exclusivity, and client grab/squeeze VFX. Use when changing crush odds, hand animation, or background peek layout.
---

# Crush Feature

Mystery main-game feature where the giant peeks from `giant_in_bg.png` over the normal background and a hand grabs animal(s), squeezes, and spawns blood/gibs.

## Server

Config in `server_config.json`:

- `crushFeature.odds` — chance per paid `spin` (main game only, not bonus).
- `crushFeature.crushAmount` — weighted count of animals grabbed, e.g. `{ "1": 1, "2": 1, "3": 1 }`.
- Uses `animalSymbols` (`1`–`5`) for eligible targets.

Resolution order on paid spin (before ways evaluation):

1. Try `stompFeature` first.
2. If stomp triggered, **crush is skipped**.
3. Otherwise roll crush odds; if pass, draw `crushAmount`, pick that many distinct animals, zero their cells.

Emits `crushEvent` on the `spin` action state:

```js
{
  triggered: true,
  crushedCells: [{ reel, row, symbol, isAnimal: true }, ...],
  crushCount,
  reelsBeforeCrush,
  teaseMs: 700,
  pauseMs: 350
}
```

Dev entry:

- Ticket strategy `crushEntry` with ticket `crushEntry` always forces crush (when animals exist).
- `isTicketMatch` validates `crushEntry` via `hasCrush(roundStates)`.

## Client

- Drop uses `crushEvent.reelsBeforeCrush` so grabbed animals are visible before the hand arrives.
- `buildSegmentFlow.js` runs `presentCrushFeature` after settle (mutually exclusive with stomp segment).
- For each crushed cell: `open_hand.png` slides in → pinch → mini squeeze shake → crossfade to `snapped_hand.png` → blood/gibs → snapped hand slides out left → open hand reappears and slides out left again.
- No hand/foot fade exits — both slide out the same direction they entered.

Assets: `src/game-client/assets/giantstomp/giant_in_bg.png`, `open_hand.png`, `snapped_hand.png`.

Hand alignment uses texture-space grip origins in `GameScene.js` (`CRUSH_HAND_GRIP`) so the thumb/finger gap sits on the target cell. Tune those values if the art shifts.
