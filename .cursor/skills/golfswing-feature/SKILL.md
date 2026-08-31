---
name: golfswing-feature
description: Giant hand golf swing mystery feature — server hit/miss and jackpot draw, client grab/aim/wheel presentation. Use when changing golfswing odds, jackpot segments, or aim/wheel VFX.
---

# Golf Swing Feature

Mystery main-game feature where the giant grabs a random animal after normal ways payout, fades the board, and attempts a golf swing at a hit zone. Hit converts the zone into a weighted jackpot wheel; miss pays 0.

## Server

Config in `server_config.json`:

- `golfswingFeature.odds` — chance per paid `spin` (main game only).
- `golfswingFeature.hitWeight` / `missWeight` — weighted hit vs miss once feature triggers.
- `golfSwingJackpotSegmentsAndWeight` — jackpot TBM segments when hit (e.g. `1`, `2`, … `512`).
- `golfSwingSuperJackpotSegmentsAndWeight` — super jackpot TBM segments when the rainbow unicorn is picked (~10× tiers).
- `symHitRateAdjustments.winInjection` — on `normal` strategy `noWin` ticket draws, optional organic 3-reel symbol win injection (disabled for dev `noWin` strategy).

Resolution order on paid spin:

1. Party / stomp / crush run first (unchanged).
2. `evaluateWays()` on the post-feature board — **normal payout happens here**.
3. If no stomp, crush, or party giant: roll golfswing odds.
4. Pick one random target from the **landing board** (pre-stomp/crush): animals **or** unicorn (symbol 14). No targets → feature fizzles (`null` event).
5. Unicorn pick → **superGolfSwing** using `golfSwingSuperJackpotSegmentsAndWeight`. Animal pick → normal jackpot table.
6. Roll hit/miss, then weighted jackpot segment if hit.
7. Add `jackpotWin` to `twa` via `applyWinCapAddition`.

Emits `golfswingEvent` on the `spin` action state:

```js
{
  triggered: true,
  isSuperGolfswing: boolean,       // true when unicorn was picked
  pickedCell: { reel, row, symbol, isAnimal, isUnicorn },
  reelsBeforeGolfswing: [...],
  hit: boolean,
  aimDurationMs: 3000–5000,
  hitZone: { x: 0.5, y: 0.45, radius: 0.34 }, // same size as jackpot wheel (~68% screen width diameter)
  crosshairEndX: number,
  crosshairEndY: number,
  crosshairInsideHitZone: boolean, // always matches `hit`
  jackpotSegment: 50,              // TBM multiplier if hit
  jackpotWin: 50 * betSize,        // 0 on miss
  jackpotSegments: [1, 2, 4, ...], // sorted ascending (color rank)
  jackpotWheelSegments: [4, 512, 1, 64, ...], // shuffled wheel layout
  teaseMs: 700,
  pauseMs: 350
}
```

Dev entry:

- Ticket strategy `golfswingEntry` — forces golf swing with animal pick.
- Ticket strategy `superGolfswingEntry` — forces golf swing with unicorn pick + super jackpot.
- **Bet+ feature buy:** `Golf Swing` cost `7`; `Super Golf Swing` cost `70` (both ~94.5% RTP vs their jackpot EV: 50% hit × weighted segment average).
- `isTicketMatch` validates via `hasGolfswing` / `hasSuperGolfswing`.

## Client

Segment flow (`buildSegmentFlow.js`):

1. Drop, stomp/crush, scatters, wins, main `updateCountUp` (excludes golf jackpot).
2. `presentGolfswingFeature` checkpoint segment.
3. Optional second `updateCountUp` to full `twa` when jackpot hits.

Presentation (`GameScene.js`):

1. Crush-style hand grab on `pickedCell` — animal is **unmasked from the reel**, parented to the hand grip, and follows through squeeze and exit left (behind the open hand).
2. Reel frame + symbols fade; placeholder `goldswingBackground` label top-right; small distant animal sprite for the tee shot.
3. Large centered hit zone ellipse; landing point comes from server `crosshairEndX/Y`. The aim path is **built backward from that pixel** — 2–3 sinus in/out loops with **per-loop ease-in/out**. The **tee shot fires around 86%** through the aim while the crosshair is still sliding into place.
4. **Bat swing:** animal always arcs toward the crosshair landing point; on hit it splats there, on miss it **flies through the crosshair, rushes past the camera**, then is destroyed off screen.
5. **On hit:** animal splats at impact (blood for animals; super unicorn vanishes into a rainbow cloud on screen contact only). Super golf skips blood slide trails. Cloud dismisses when presentation ends.
6. **On miss:** one continuous shot through the crosshair and past the camera; animal is destroyed only after exiting below screen; `MISS` label, win 0.
7. Win amount + anger meter fade out when the golf scene starts and fade back in when it ends.
8. Board fades back in; cleanup via `clearGolfswingPresentation`.

All RNG is server-side; client only animates predetermined outcomes.

## Audio

| Asset key | File | When |
|---|---|---|
| `golf_feature_start` | `golf_feature_starts.mp3` | Giant appears at grab start; loops until hit/miss |
| `giant_laugh` | `laugh.mp3` | Hand reaches to grab the picked animal |
| `golf_swing` | `swing.mp3` | Animal impact on hit |
| `golf_miss` | `giant_missing_in_golf.mp3` | Ball passes crosshair on miss |
| `golf_jackpot_hit` | `giant_hit_jackpot.mp3` | Hit impact through jackpot wheel end (full clip) |
| `wins_highlight` / `wins_payout` | existing win SFX | Jackpot confirm hit when wheel lands (via `playGolfJackpotConfirmSfx`) |

Jackpot wheel spin: constant-speed spin until the drums enter at **5.0s**, then one deceleration curve through the remaining sting so the pointer lands on the winning slice when `golf_jackpot_hit` ends. On land: `playGolfJackpotConfirmSfx()` fires `wins_highlight` + `wins_payout`, golden slice glow, and label pulse on the winning segment.
