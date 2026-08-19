---
name: angel-system
description: Angel board position persistence and Wild mechanic. Use when working on Angel movement, position state, bonus entry reset, or Wild win recalculation.
---

# Angel System

Angel is a **persistent game entity** — board position is part of game state, not animation-only.

## Position Rules

| Event | Position |
|-------|----------|
| Main game round start | Center |
| After killing demon | Demon's cell (stays there) |
| Respin / next spin | Last position (no reset to center) |
| Bonus trigger (portal dive) | Reset to center in Hell |
| Bonus freespins | Same persistence as main game |

## Combat Movement (per kill)

1. *(Bonus + Divine Charge proc)* Charge up in place (~2.5s) before departure
2. Fly to target demon — **momentum chain** with motion trails
3. Destroy demon
4. Occupy demon's cell → new Angel position
5. Cell counts as **Wild** → recalc wins → resolve clusters
6. Angel remains on cell after resolution

## Movement Feel

Applies to **main game and bonus** combat. Abilities (e.g. Divine Charge) are bonus-only but share the same flight model.

| Aspect | Target |
|--------|--------|
| Model | **Momentum chain** — speed builds across consecutive kills; brief impact slowdown, then ramp again |
| Trails | Motion blur / angel trail during rush segments (`helldive_angel_trail`) |
| Pace | **Faster and more dynamic** than current fixed per-step durations; dramatic accel/decel over flat constant speed |
| Reference | Diablo 2 Paladin Divine Charge rush — wind-up, explosive launch, heavy hit |

Avoid static step-locked durations. Acceleration should be visible: slow start → fast finish on approaches; sustained momentum between demons in rush chains.

### Divine Charge interaction (bonus)

When `heroPath` step has `divineChargeProc: true`:

- Angel **freezes at current cell** before flying to that demon
- Charge VFX plays (~2.5s wind-up)
- Launch segment uses rush texture + Matrix-style trail at high speed
- Impact uses amplified shake / gore / loot drop (see `ability-system`)

Charge does **not** interrupt mid-flight between cells — only gates the start of the leg to the proc'd demon.

### Server contract

Client reads per-step flags from authoritative `heroPath` (see `ability-system` for `divineChargeProc` shape). Presentation in `GameScene.animateHeroHunt`; orchestration in `Client.js`.

## Wild Mechanic

Angel acts as **Wild** on any off-center board cell (not at `heroStartingPosition`). Center position is never wild.

- Applies during spin/respin cluster evaluation and hunt impact checks
- After killing a demon, angel occupies that cell and remains wild there
- Angel does not leave the cell after win resolution

## Main-Game Angel Multiplier

Multiplier **ramps inside each demon hunt** — one tier per kill, doubling as the chain continues.

Example starting from 1× carry:

| Kill # in hunt | Applied to that kill's impact wins | Badge after kill | Queued for next kill |
|----------------|-------------------------------------|------------------|----------------------|
| 1 | 1× | 1× | 2× |
| 2 | 2× | 2× | 4× |
| 3 | 4× | 4× | 8× |

Server: `applyMainGameAngelMultiplierProgression` in `executeDemonHunt`. Each `heroPath` step can carry `angelMultiplier` for client badges.

Two persisted fields after a hunt — do not confuse them:

| Field | Meaning |
|-------|---------|
| `heroAngelMultiplier` | **Last applied** tier from the hunt just finished (UI badge). Used for post-hunt respin cluster wins. `null` before any hunt this round. |
| `heroAngelNextMultiplier` | **Next hunt's opening tier** (doubled after the final kill). Not for respin cluster math. |

Rules:

- Initial spin and pre-hunt respin wins: no angel multiplier (`heroAngelMultiplier` is null → carry `1`).
- During demon hunt: impact wins use the progressive tier for that kill (see table above).
- After demon hunt: post-hunt respin cluster wins use `heroAngelMultiplier` (last earned tier), **not** `heroAngelNextMultiplier`.
- Hunt only runs once the win chain ends (no cluster wins left) and demons remain — see `combat-system`.

## State Implication

Client and server must agree on Angel position across spins. Presentation in GameScene must reflect authoritative position from server state.

See `combat-system` for kill sequencing; see `client-architecture` for where movement animation lives.
