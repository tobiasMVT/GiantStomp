---
name: loot-system
description: Demon loot drops, loot tables, battlefield persistence, Collect Phase payout. Use when implementing loot generation, bonus accumulation, multiplier payout, or collection animation.
---

# Loot System

Demons may drop loot on kill. Loot stays **visible on board** and in game state until bonus ends. Never auto-collected mid-bonus.

## Drop Flow

```
Demon destroyed -> roll drop chance -> if hit, pick loot type from demon-type table -> resolve value from lootDrops -> spawn on board
```

All values in `server_config.json` - nothing hardcoded.

## Config Shape (example)

```json
{
  "lootDropChance": 0.5,
  "tables": {
    "normal_demon": [
      { "value": "coin", "weight": 35 },
      { "value": "emerald", "weight": 28 },
      { "value": "ruby", "weight": 20 }
    ]
  },
  "lootDrops": {
    "coin": { "id": 1, "value": 0.1 },
    "emerald": { "id": 2, "value": 0.2 },
    "ruby": { "id": 3, "value": 0.3 }
  }
}
```

Each demon type has its own independent table. Support new types via config only.

Legacy numeric table entries may still be tolerated as fallback, but the preferred format is loot type names so texture + value stay aligned.

## Persistence

- Stored in visual + mathematical game state
- Accumulates across bonus: `total = sum of all dropped values`
- Player sees loot on battlefield throughout bonus

## Collect Phase (bonus end)

**Formula:** `finalValue = lootValue x finalMultiplier` (per piece, then sum)

Example: loot `[0.2, 0.5, 1.0]`, multiplier `x10` -> `2 + 5 + 10 = 17.0`

## Presentation (GameScene)

**Drop:** spawn at demon center, small arc upward, land near feet.

**Collect:** all pieces activate -> spiral/vortex to center -> absorb at multiplier -> per-item win labels + running total count-up.

Orchestration timing in `Client.js`; animations in `GameScene.js`.

**Client sprite lifecycle:** `syncHeavenHellLootGround` only **adds** missing tokens (tracked via `heavenHellRenderedLootKeys`). Never destroy/rebuild the full ground between bonus actions. Loot sprites are cleared only in `clearHeavenHellLootGround` - called after Collect Phase vortex and when exiting bonus back to main spin.

Divine Charge guaranteed loot + multipliers: see `ability-system`.

If multiple loot drops due to divinecharge the loot should be scattered more so its visually clear that, multiplier from divine charge did something.

Visual Loot Clustering

Loot should communicate value at a glance.

A single loot drop may land near the demon.

Multiple loot drops from the same kill should create a visible treasure pile.

Standard Demon

1 loot:

land near demon feet

2-3 loot:

spread slightly around the center
radius 10-20 pixels
Divine Charge

Divine Charge is intended to feel explosive and rewarding.

When Divine Charge multiplies loot:

scatter radius increases significantly
radius 25-45 pixels
pieces should form a visible pile around the impact point

Example:

Normal kill:
o

Divine Charge:
o o
oo
o o

Players should immediately understand that extra loot was generated.

Divine Wrath

When Divine Wrath kills multiple demons:

Each demon creates its own local loot cluster.

Do not merge all drops into one location.

The battlefield should visibly fill with treasure.

Boss Kills

Boss kills should create the largest visual spread.

Scatter radius:

40-60 pixels

Boss loot should feel like an explosion of treasure.

Persistence

Loot positions are generated once and stored.

Example:

{
  value: 0.5,
  lootType: "amethyst",
  reel: 3,
  row: 4,
  offsetX: 22,
  offsetY: -14
}

Offsets must persist for the entire bonus.

Loot should never visually reshuffle between spins.

Design Goal

As the bonus progresses the battlefield should gradually become covered with treasure piles.

The player should be able to estimate:

where large kills happened
where Divine Charge triggered
where bosses died

simply by looking at the accumulated loot.

Heaven/Hell multiplier lifecycle

The resolved bonus multiplier must stay on the final bonus state through `chestreward` and Collect Phase.

Do not reset the Heaven/Hell `globalMultiplier` inside bonus settlement.
Reset it when a new round starts or when a fresh Heaven/Hell bonus is entered.
