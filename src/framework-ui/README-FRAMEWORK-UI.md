# README-FRAMEWORK-UI

This folder contains shared framework UI code.
It is not game-specific.

## Mental Model

- `UIScene.js` is the framework-owned Phaser UI scene
- it renders shared shell UI such as controls, bars, dialogs, and layout debug tools
- it reads game-specific config from `src/game-client/config/`, but the scene itself belongs to the framework
- `ResponsiveTextBox.js` is a shared helper for fitting text into responsive UI bounds

## Boundary

- `src/game-client/` owns game presentation and game-specific scene logic
- `src/framework-ui/` owns shared framework UI that sits above the game scene
- `src/core/` owns runtime, layout, controller, and bootstrapping

If you are changing shared overlay UI, `UIScene.js` is the right place.
If you are changing game-specific visuals, use `src/game-client/` instead.
