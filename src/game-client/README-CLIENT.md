# 3×5 Payways Client

This folder is the game-specific presentation client. The framework outside this folder remains reusable.

## Outcome contract

The client accepts `spin`, `respin`, `bonustransition`, `freespin`, and `freerespin`.

- `reels`, `reelsBeforeDrop`, and `reelsAfterDrop` describe five reels with three rows.
- `dropEvent.movements` describes downward cascade movement.
- wins come from `waysWins`; `clusters[*].positions` remains a compatibility fallback.
- `angerMeter` is `{ count, max }` with a 10-step fake display driven by crushed animals.
- Scatters still land visually via `scatterLandings`, but they no longer charge Anger.
- `bonusState` supplies cash-game lives and spin count.
- `bonusLandings` supplies per-cell cash wins and trap collection steps.
- `trapMeter` supplies four-light progress, completion values, and accumulated trap power.
- `damageWheel` supplies configured, removed, and remaining damage segments.
- `ouchStompEvent` on the final bonus spin supplies pre-calculated trap-resolution steps, win amounts, and pacing hints for the ouch stomp scene.

## Responsibilities

- `Client.js` selects the action flow, maintains round lifecycle emits, switches bonus theme/counter state, and forwards fast-forward requests.
- `buildSegmentFlow.js` defines the shared skippable drop, scatter, win highlight, and count-up sequence.
- `GameScene.js` owns the 5×3 board, Phaser animation, sound, themes, meter, counter, and responsive bounds.
- `queueGameSceneAssets.js` queues the main and bonus symbols, backgrounds, feature art, and presentation audio.
- `config/layoutMetrics.js` is the single board-coordinate source.

## Presentation

A main-game spin moves the old board down and out, then stagger-drops a complete board from above. Ways wins highlight in place; symbols are not removed. Legacy `respin` / `freerespin` segments remain for compatibility but the server no longer emits those actions.

Each newly landed scatter still animates, but bonus entry now comes from crushed animals.
On stomp impact every crushed cell dies, bleeds, and drops coins together while anger
embers fly in parallel; meter segments only fill on successful server ticks. Bonus entry
then overcharges the meter one step at a time to 10 with streams from every kill point.

The bonus crossfades to `background_bonus.png` while retaining the reel frame. Its
`freespin` action uses a reel-spin presentation and the `111`–`999` bonus symbol art;
`0` renders as an empty cell. Cash symbols `111`–`555` overlay `client_config.bonusWinAmounts`
on the icon (keep those values in sync with `server_config.bonusWinAmounts`). The bonus UI replaces Anger with a three-segment life
meter built from `life1`/`life2`/`life3`, large collectors for `666`/`777`/`888`/`999`,
an uncapped trap-power readout whose text heats from green through yellow to red, and
a green/yellow/red segmented Multiplier whose segment count follows the server
damage-wheel values.

A bonus spin darkens the spent life segment up front, so the meter never spoils the
outcome. The first presented landing relights the meter to full and the flow waits for
that lit pop before continuing, keeping the spend and the refill visually separate. A
collector awards its value on the fourth light and then resets its own lights. Every
landed bonus item is pulled out of the masked reels and arced down into the wide hole
area painted on the bonus background, which kicks up a heavy cartoon dust cloud before
its trap, power, or multiplier state updates.
Multiplier segments stay fixed in place; passed values keep their hue but render faded,
while the active segment is fully lit. Symbol `1000` advances the meter one step. Trap
power is presentation state during bonus spins; it credits through the ouch stomp at
bonus exit.

When bonus lives are exhausted, the client crossfades to `ouch_background.png`, runs a
fake doll spin, then `presentOuchStompSequence`. The foot slams the camouflaged trap with
a large leaf/twig debris burst (`ouch_stomp1/2` + `ouch_background-music`). Any multiplier
segments already passed during bonus then replay as fast foot re-stomps (lift, slam, pit
scroll, meter advance) before the server-resolved ouch steps begin. Each server step
scrolls the pit upward, advances the multiplier meter, drops win coins (up to 20 per
step), and ticks the count-up to `trapPower × multiplier`. Extra steps wait
`stepIntervalMs`, play random pain screams and gore SFX, and spawn heavy blood/gibs.

## Skip model

`Client.requestFastForward()` asks `SegmentFlowRunner` to skip the active segment. Scene waits are cancellable, visual tweens accelerate, and win audio listed in `soundInteractionPolicy.js` is suppressed during fast-forward. Gameplay state is never changed by skipping.

## Framework interfaces

Keep these stable:

- `GameScene` constructor and Phaser `create`/shutdown lifecycle
- `GameScene.setEventBus`, layout bounds, audio controls, and round event emitters
- `Client.reactOnResponse(gameState, clientState)`
- `Client.requestFastForward()`
- `queueGameSceneAssets(load, deps)`
