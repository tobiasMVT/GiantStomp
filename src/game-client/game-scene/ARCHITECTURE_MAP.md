# GameScene Extraction Map

`GameScene.js` is now a facade.

`Client.js` and `buildSegmentFlow.js` still call scene methods on `GameScene`, but many method bodies now live in feature modules under this folder and are assigned back onto `GameScene.prototype`.

## Flow

`Client.js` -> `GameScene` facade -> extracted feature module method -> shared scene state / Phaser objects

## Main Boundaries

- `gameSceneAudioTimingMethods.js`: fast-forward, waits, SFX, music, sound-volume tool, pause / slow-mo helpers
- `gameSceneHeavenHellMethods.js`: Heaven/Hell background, portal, angel, loot ground, collect phase, kill meter, ability panel
- `gameSceneBonusMysteryMethods.js`: mystery feature symbol visuals, meter UI, release / collection handling
- `gameSceneLightningBeeMethods.js`: bee symbol visuals, bee meter, movement / charge FX, collection handling
- `gameSceneMergeGunMethods.js`: merge-gun symbols, area visuals, held gun flow, activation sequence
- `gameSceneFreespinUiMethods.js`: freespin counter and ring presentation
- `gameSceneLayoutMethods.js`: event bus, layout bounds, layout debug emits

## Shared State Still Owned By GameScene

- Board state: `reelSprites`
- Hero state: `heroSprite`, `currentHeroFootprintSize`, `currentHeroAnchor`, `currentHeroTextureKey`
- Bonus state: `isInBonusMode`, `currentAction`, `currentBonusStage`
- Feature state: mystery meter, bee meter, merge-gun areas, Heaven/Hell meter runtime
- Audio / skip state: fast-forward flags, tracked sounds, sound-volume tool state

## Small Boundary Cleanup

`Client.js` no longer writes these scene fields directly:

- `currentAction`
- `currentHeroFootprintSize`
- `lightningCount`

It now goes through scene setters on the facade instead.
