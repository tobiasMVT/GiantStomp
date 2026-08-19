---
name: gargoyle-system
description: Hell bonus gargoyle demon behavior. Use when editing gargoyle spawn injection, post-attack flee logic, gargoyle loot/chest routing, or client escape presentation.
---

# Gargoyle System

Gargoyle is a **Hell-bonus-only** demon type with its own symbol, loot table, chest chance, and post-attack escape rule.

## Core Rule

- Gargoyle can flee **between attacks**, never before the first attack.
- After each completed attack step, check every surviving gargoyle against demons killed by that same step.
- If any kill happened within **Chebyshev distance 2**, the gargoyle escapes.
- Gargoyles killed by the direct attack, **Divine Strike**, or **Divine X** do **not** escape.

## Spawn Model

- Spawned by a separate Hell bonus injection pass.
- Config:
  - `heavenHell.bonus.gargoyleInjection.chance`
  - `minGargoyles`
  - `maxGargoyles`
  - `fleeDistance`
- Injection runs after ordinary Hell demon placement and uses only free valid cells.
- Boss and multiplier conversions must not overwrite gargoyle cells.

## Reward Rules

- Gargoyle kill counts as **1 kill**.
- Escaping gargoyle gives:
  - no kill credit
  - no orb drop
  - no loot
  - no chest
- Killed gargoyles use:
  - loot table `gargoyle_demon`
  - chest source `gargoyle`

## Server Payload

Per-step client payload:

```js
step.gargoyleEscapesAfterStep = [
  {
    reel,
    row,
    symbol,
    triggeredBy: [{ reel, row }]
  }
]
```

Meaning:
- play these escapes after this step resolves
- remove them before the next attack begins

## Client Timing

- Escape animation belongs in `animateHeroHunt(...)`.
- Play it after kill/divine/chest/impact resolution for the step.
- Keep it fast so the combat cadence stays aggressive.
