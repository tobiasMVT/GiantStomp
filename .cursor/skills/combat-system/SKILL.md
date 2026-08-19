---
name: combat-system
description: Post-win combat — Angel targets closest demon, fly-kill-Wild-recalc loop. Use when implementing combat resolution, demon targeting, or main vs bonus spin flow.
---

# Combat System

Runs **after** standard win resolution completes. Demons never attack the Angel.

## Targeting

Always **closest surviving demon** first, then repeat until none remain.

## Kill Sequence (each demon)

```
Select closest → fly → destroy → occupy cell (Wild) → recalc wins → resolve wins → next demon
```

## Main Game Flow

```
Spin → cluster wins → explode → redrop → repeat until no wins
  → find surviving demons → combat sequence (above) → all demons dead
```

## Bonus Game Flow

- **No cluster win evaluation** on bonus spins
- Focus: demon kills, loot, multiplier progression, retriggers
- Loot stored until Collect Phase (see `loot-system`)
- First Hell bonus action should open with at least **one demon** so the Angel's bonus-entry attack has a live target

## Presentation Notes

Combat should feel fast and impactful. Orchestration in `Client.js`; fly/impact/VFX in `GameScene.js`.

Angel position persistence: see `angel-system`.

Hell bonus gargoyle escape timing: see `gargoyle-system`.
