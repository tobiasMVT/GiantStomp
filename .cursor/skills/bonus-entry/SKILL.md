---
name: bonus-entry
description: HellDive bonus entrance flow for portal dive, count-up fade, sky text handoff, and Hell landing impact. Use when editing the main-to-bonus transition or the first freespin entrance presentation.
---

# Bonus Entry

This skill covers the **visual handoff from the main board into Hell bonus**.

## Responsibility Split

- `Client.js`: decides **when** the bonus-entry sequence runs.
- `GameScene.js`: owns **how** the entrance looks and sounds.

For the current Heaven/Hell flow:

1. `Client.js` bonus action `bonustransition`
2. `GameScene.playHeavenHellBonusEntryPortalTransition()`
3. `GameScene.updateHellDiveBackground(...)`
4. `GameScene.startBonusMode()`

## Current Hell Entrance Design

Main-game exit:

- Fade the count-up display below the grid when the dive text appears
- Fade the board shadow backplates when `HELLDIVE...` appears (only when `layout.boardShadowBackplates.enabled` is true)
- Show `HELLDIVE...`
- Angel flies toward a portal near the top of the last reel
- Angel shrinks into the portal and fully disappears
- Portal flashes before the scene hands off

Hell arrival:

- Do **not** spawn the Angel idling in center first
- First Hell bonus hunt should open with a **top-down heaven dive**
- Angel lands directly on the first demon kill
- Use a larger radial burst feel, similar to Divine Charge / level-up energy
- Camera shake + blood-heavy impact should sell the opening blow

## Important Hooks

- `playHeavenHellBonusEntryPortalTransition()`
  Main black-overlay transition and main-board exit animation.

- `fadeBonusEntryCountUpDisplay()`
  Fades the under-grid win count-up cleanly before bonus entry.

- `fadeBoardShadowOverlayForBonusEntry()`
  Fades the per-cell board shadow backplates when `HELLDIVE...` appears.

- `playHeavenHellAngelDiveIntoPortal()`
  Main-board angel exit into the portal.

- `animateHeroHunt(...)`
  First Hell bonus hunt can own the re-entry, landing, and first-kill impact.

- `startBonusMode()`
  Should not pre-spawn the Angel in Hell before the first attack.

## Editing Rules

- Keep flow decisions in `Client.js`, not in `GameScene.js`.
- Keep one-time guards on the Hell landing so the first freespin does not replay the entrance.
- For Hell bonus, the first action should visually read as **arrival through combat**, not a separate idle spawn.
- If you move the portal location, update `getHeavenHellBonusEntryPortalPosition()`.
- If you strengthen the landing, prefer reusing existing radial/lightning helpers before inventing a separate effect stack.

## Tuning Notes

- Portal target is intentionally biased to the **upper portion of the last reel**
- Count-up should **fade**, not pop off
- Entry timing should feel forceful but still leave the player enough time to read the dive text
