---
name: client-architecture
description: Client.js vs GameScene.js responsibility split, segment flow, skip model. Use when editing Client.js, GameScene.js, buildSegmentFlow.js, SegmentFlowRunner, or adding presentation features.
---

# Client Architecture

**Server** → what happened. **Client.js** → what happens next. **GameScene.js** → how it looks/sounds.

## Responsibility Split

| Layer | Owns | Must NOT |
|-------|------|----------|
| `Client.js` | Action selection, flow orchestration, checkpoints, waits/skips, scene method calls | Rendering, animations, SFX |
| `GameScene.js` | Animations, VFX, audio, particles, camera, symbol display, cleanup | Game flow decisions |
| `buildSegmentFlow.js` | Segment definitions for skippable actions | Visual execution |
| `SegmentFlowRunner` | Segment execution + skip/fast-forward | Gameplay state changes |

## Decision Rule

- **What should happen?** → `Client.js`
- **How should it look/sound?** → `GameScene.js`

## Execution Path

```
Server response → Client selects action → Client builds flow → GameScene presents → Client continues
```

Skippable path: `Client → buildSegmentFlow → SegmentFlowRunner → GameScene`

## Skip Model

Skip/fast-forward affects **presentation timing only**. Gameplay state and server math are never accelerated.

## Adding Features Checklist

**Client.js:** sequencing, state transitions, flow decisions, triggers, checkpoints.

**GameScene.js:** animations, particles, sound, UI visuals, camera, cleanup.
