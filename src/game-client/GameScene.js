import Phaser from "phaser";
import gameClientConfig from "./config/gameClientConfig";
import soundInteractionPolicy from "./config/soundInteractionPolicy";
import {
  CELL_SIZE,
  GRID_HEIGHT_PX,
  GRID_OFFSET_X,
  GRID_OFFSET_Y,
  GRID_WIDTH_PX,
  getCellCenter,
} from "./config/layoutMetrics";

const REELS = 5;
const ROWS = 3;
const SYMBOL_SCALE = 0.76;
const DEPTH = { background: 0, board: 4, symbols: 10, effects: 20, ui: 30 };

const getReel = (reels, reel) => reels?.[reel] ?? reels?.[String(reel)] ?? [];
const getSymbol = (reels, reel, row) => getReel(reels, reel)?.[row] ?? null;

function normalizePosition(value) {
  if (Array.isArray(value)) {
    const reel = Number(value[0]);
    const row = Number(value[1]);
    return Number.isFinite(reel) && Number.isFinite(row) ? { reel, row } : null;
  }
  if (!value || typeof value !== "object") return null;
  const reel = Number(value.reel ?? value.x ?? value.column ?? value.col);
  const row = Number(value.row ?? value.y);
  return Number.isFinite(reel) && Number.isFinite(row) ? { reel, row } : null;
}

function extractPositions(source = []) {
  const positions = new Map();
  const visit = (value) => {
    const position = normalizePosition(value);
    if (position && position.reel >= 0 && position.reel < REELS && position.row >= 0 && position.row < ROWS) {
      positions.set(`${position.reel}:${position.row}`, position);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== "object") return;
    ["positions", "winningPositions", "cells", "cluster", "landings"].forEach((key) => {
      if (value[key]) visit(value[key]);
    });
  };
  visit(source);
  return [...positions.values()];
}

export class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: "GameScene" });
    this.reelSprites = Array.from({ length: REELS }, () => Array(ROWS).fill(null));
    this.eventBus = null;
    this.layoutSnapshot = null;
    this.layoutDebugEnabled = false;
    this.presentationWaits = new Set();
    this.activeTweens = new Set();
    this.highlightedSprites = new Set();
    this.fastForwardRequested = false;
    this.currentWin = 0;
    this.freespinCounterValue = null;
    this.isInBonusMode = false;
    this.musicMuted = false;
  }

  create() {
    this.cameras.main.setBackgroundColor(0x090b14);
    this.createEnvironment();
    this.createBoardUi();
    this.applyLayoutSnapshot();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.applyLayoutSnapshot, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
    this.emitLayoutContentBounds();
  }

  shutdown() {
    this.scale.off(Phaser.Scale.Events.RESIZE, this.applyLayoutSnapshot, this);
    this.unsubscribeLayout?.();
    this.unsubscribeLayoutDebug?.();
    this.cancelSkippablePresentationWaits();
    this.finishActiveTweens();
  }

  createEnvironment() {
    const x = GRID_OFFSET_X + GRID_WIDTH_PX / 2;
    const y = GRID_OFFSET_Y + GRID_HEIGHT_PX / 2;
    this.background = this.add.image(x, y, "main_background").setDepth(DEPTH.background);
    this.bonusBackground = this.add.image(x, y, "bonus_background")
      .setDepth(DEPTH.background)
      .setAlpha(0);
    [this.background, this.bonusBackground].forEach((image) => {
      const source = image.texture.getSourceImage?.();
      if (!source?.width || !source?.height) return;
      image.setScale(Math.max((GRID_WIDTH_PX + 180) / source.width, (GRID_HEIGHT_PX + 250) / source.height));
    });
    this.add.rectangle(x, y, GRID_WIDTH_PX + 18, GRID_HEIGHT_PX + 18, 0x080b12, 0.78)
      .setStrokeStyle(3, 0x8f7138, 0.9)
      .setDepth(DEPTH.board);
  }

  createBoardUi() {
    const centerX = GRID_OFFSET_X + GRID_WIDTH_PX / 2;
    const bottom = GRID_OFFSET_Y + GRID_HEIGHT_PX;
    const textStyle = {
      fontFamily: "Arial Black, Arial",
      color: "#ffe5a2",
      stroke: "#351d04",
      strokeThickness: 5,
    };
    this.countUpText = this.add.text(centerX, bottom + 46, "WIN 0.00", {
      ...textStyle,
      fontSize: "30px",
    }).setOrigin(0.5).setDepth(DEPTH.ui);
    this.freespinText = this.add.text(centerX, GRID_OFFSET_Y - 38, "", {
      ...textStyle,
      fontSize: "25px",
    }).setOrigin(0.5).setDepth(DEPTH.ui).setVisible(false);

    const meterX = GRID_OFFSET_X + GRID_WIDTH_PX - 146;
    const meterY = bottom + 88;
    this.add.text(meterX - 14, meterY, "ANGER", {
      fontFamily: "Arial Black, Arial",
      fontSize: "16px",
      color: "#ffd6b0",
    }).setOrigin(1, 0.5).setDepth(DEPTH.ui);
    this.angerSegments = [0, 1, 2].map((index) => this.add.rectangle(
      meterX + index * 42, meterY, 34, 16, 0x341912, 0.9
    ).setStrokeStyle(2, 0x9b4b2b, 1).setDepth(DEPTH.ui));
    this.angerMeterState = { count: 0, max: 3 };
  }

  setEventBus(eventBus) {
    this.unsubscribeLayout?.();
    this.unsubscribeLayoutDebug?.();
    this.eventBus = eventBus;
    if (eventBus) {
      this.unsubscribeLayout = eventBus.on("layout:changed", (snapshot) => {
        this.layoutSnapshot = snapshot;
        this.applyLayoutSnapshot();
      });
      this.unsubscribeLayoutDebug = eventBus.on("layout:debug:visibility", ({ enabled } = {}) => {
        this.layoutDebugEnabled = enabled === true;
        this.cameras.main.setBackgroundColor(this.layoutDebugEnabled ? 0x262626 : 0x090b14);
      });
    }
    this.emitFreespinsCounter(this.freespinCounterValue);
    this.emitLayoutContentBounds();
  }

  getLayoutContentBounds() {
    const config = gameClientConfig.layout;
    const freeArea = { ...config.freeArea };
    if ((this.scale?.width || 0) > (this.scale?.height || 0)) {
      freeArea.minBottomPx = Math.max(36, Number(freeArea.landscapeMinBottomPx) || 48);
      freeArea.minRightPx = Math.max(150, Number(freeArea.landscapeMinRightPx) || 150);
    } else {
      freeArea.minRightPx = 0;
    }
    return { mustSeeBounds: { ...config.mustSeeBounds }, freeArea };
  }

  emitLayoutContentBounds() {
    this.eventBus?.emit("layout:contentBoundsChanged", this.getLayoutContentBounds());
  }

  applyLayoutSnapshot() {
    const camera = this.cameras?.main;
    if (!camera) return;
    const screenW = Math.max(1, this.scale.width);
    const screenH = Math.max(1, this.scale.height);
    const rect = this.layoutSnapshot?.gameRect || { x: 0, y: 0, width: screenW, height: screenH };
    const bounds = this.layoutSnapshot?.mustSeeBounds || this.getLayoutContentBounds().mustSeeBounds;
    const zoom = Math.max(0.01, Math.min(rect.width / bounds.width, rect.height / bounds.height));
    const gameCenterX = rect.x + rect.width / 2;
    const gameCenterY = rect.y + rect.height / 2;
    camera.setViewport(0, 0, screenW, screenH).setZoom(zoom).setRoundPixels(false);
    camera.setScroll(
      bounds.x + bounds.width / 2 - screenW / 2 - (gameCenterX - screenW / 2) / zoom,
      bounds.y + bounds.height / 2 - screenH / 2 - (gameCenterY - screenH / 2) / zoom
    );
    this.eventBus?.emit("layout:gamescene:cameraRect", { ...rect });
    this.eventBus?.emit("layout:gamescene:mustSeeRect", {
      x: gameCenterX - bounds.width * zoom / 2,
      y: gameCenterY - bounds.height * zoom / 2,
      width: bounds.width * zoom,
      height: bounds.height * zoom,
    });
  }

  getGridCellCenter(reel, row) {
    return getCellCenter(reel, row);
  }

  createSymbol(symbol, reel, row, startY = null) {
    const center = getCellCenter(reel, row);
    const texture = this.textures.exists(String(symbol)) ? String(symbol) : "1";
    const sprite = this.add.image(center.x, startY ?? center.y, texture)
      .setScale(SYMBOL_SCALE)
      .setDepth(DEPTH.symbols);
    Object.assign(sprite, { symbolId: Number(symbol), reel, row });
    return sprite;
  }

  async slideOutOldSymbols() {
    const sprites = this.reelSprites.flat().filter(Boolean);
    this.reelSprites = Array.from({ length: REELS }, () => Array(ROWS).fill(null));
    await Promise.all(sprites.map((sprite, index) => this.tweenPromise({
      targets: sprite,
      y: GRID_OFFSET_Y + GRID_HEIGHT_PX + CELL_SIZE * 1.5,
      alpha: 0,
      angle: Phaser.Math.Between(-7, 7),
      duration: 280,
      delay: index * 10,
      ease: "Cubic.easeIn",
      onComplete: () => sprite.destroy(),
    })));
  }

  async dropSymbols(reels) {
    const tweens = [];
    for (let reel = 0; reel < REELS; reel += 1) {
      for (let row = 0; row < ROWS; row += 1) {
        const symbol = getSymbol(reels, reel, row);
        if (symbol === null || Number(symbol) <= 0) continue;
        const target = getCellCenter(reel, row);
        const sprite = this.createSymbol(symbol, reel, row, GRID_OFFSET_Y - CELL_SIZE * (ROWS - row + 1));
        this.reelSprites[reel][row] = sprite;
        tweens.push(this.tweenPromise({
          targets: sprite,
          y: target.y,
          duration: 430,
          delay: reel * 65 + row * 32,
          ease: "Bounce.easeOut",
          onStart: () => this.playSfx(`land${reel + 1}`, { volume: 0.28 }),
        }));
      }
    }
    await Promise.all(tweens);
  }

  normalizeMovement(movement) {
    if (
      Number.isFinite(Number(movement?.reel)) &&
      Number.isFinite(Number(movement?.from)) &&
      Number.isFinite(Number(movement?.to))
    ) {
      return {
        from: { reel: Number(movement.reel), row: Number(movement.from) },
        to: { reel: Number(movement.reel), row: Number(movement.to) },
      };
    }
    return {
      from: normalizePosition(movement?.from ?? movement?.source ?? movement?.start ?? movement?.fromPosition),
      to: normalizePosition(movement?.to ?? movement?.target ?? movement?.end ?? movement?.position ?? movement?.toPosition),
    };
  }

  async applyGravityAnimation(reelsAfterDrop, dropEvent = {}) {
    const movements = Array.isArray(dropEvent.movements) ? dropEvent.movements : [];
    const oldGrid = this.reelSprites;
    const nextGrid = Array.from({ length: REELS }, () => Array(ROWS).fill(null));
    const claimed = new Set();
    const tweens = [];

    movements.forEach((movement, index) => {
      const { from, to } = this.normalizeMovement(movement);
      if (!to || to.reel < 0 || to.reel >= REELS || to.row < 0 || to.row >= ROWS) return;
      const symbol = getSymbol(reelsAfterDrop, to.reel, to.row);
      let sprite = from ? oldGrid[from.reel]?.[from.row] : null;
      if (!sprite || sprite.destroyed || claimed.has(sprite)) {
        const startRow = Number(movement?.startRow ?? movement?.fromRow ?? from?.row);
        sprite = this.createSymbol(
          symbol,
          to.reel,
          to.row,
          Number.isFinite(startRow) ? getCellCenter(to.reel, startRow).y : GRID_OFFSET_Y - CELL_SIZE * (1 + index % ROWS)
        );
      }
      claimed.add(sprite);
      Object.assign(sprite, { reel: to.reel, row: to.row, symbolId: Number(symbol) });
      nextGrid[to.reel][to.row] = sprite;
      const target = getCellCenter(to.reel, to.row);
      tweens.push(this.tweenPromise({
        targets: sprite,
        x: target.x,
        y: target.y,
        duration: 300,
        delay: index * 28,
        ease: "Cubic.easeInOut",
      }));
    });

    for (let reel = 0; reel < REELS; reel += 1) {
      for (let row = 0; row < ROWS; row += 1) {
        const symbol = getSymbol(reelsAfterDrop, reel, row);
        if (symbol === null || Number(symbol) <= 0 || nextGrid[reel][row]) continue;
        const existing = oldGrid[reel]?.[row];
        if (existing && !claimed.has(existing) && Number(existing.symbolId) === Number(symbol)) {
          claimed.add(existing);
          nextGrid[reel][row] = existing;
          continue;
        }
        const sprite = this.createSymbol(symbol, reel, row, GRID_OFFSET_Y - CELL_SIZE * (ROWS - row + 1));
        claimed.add(sprite);
        nextGrid[reel][row] = sprite;
        tweens.push(this.tweenPromise({
          targets: sprite,
          y: getCellCenter(reel, row).y,
          duration: 330,
          delay: reel * 45 + row * 24,
          ease: "Bounce.easeOut",
        }));
      }
    }
    oldGrid.flat().filter(Boolean).forEach((sprite) => {
      if (!claimed.has(sprite) && !sprite.destroyed) sprite.destroy();
    });
    this.reelSprites = nextGrid;
    await Promise.all(tweens);
  }

  getWinPositions(gameState = {}) {
    return extractPositions(gameState.waysWins?.length ? gameState.waysWins : gameState.clusters);
  }

  async highlightWins(gameState) {
    const sprites = this.getWinPositions(gameState)
      .map(({ reel, row }) => this.reelSprites[reel]?.[row])
      .filter(Boolean);
    if (!sprites.length) return;
    this.playSfx("wins_highlight", { volume: 0.65 });
    sprites.forEach((sprite) => {
      sprite.setTint(0xffef9c);
      this.highlightedSprites.add(sprite);
    });
    await Promise.all(sprites.map((sprite, index) => this.tweenPromise({
      targets: sprite,
      scaleX: SYMBOL_SCALE * 1.12,
      scaleY: SYMBOL_SCALE * 1.12,
      duration: 180,
      delay: index * 18,
      yoyo: true,
      repeat: 1,
      ease: "Sine.easeInOut",
    })));
    this.clearHighlights();
  }

  clearHighlights() {
    this.highlightedSprites.forEach((sprite) => {
      if (!sprite.destroyed) sprite.clearTint().setScale(SYMBOL_SCALE);
    });
    this.highlightedSprites.clear();
  }

  skipHighlightPhase() {
    this.clearHighlights();
    this.finishActiveTweens();
  }

  async explodeWins(gameState) {
    const effects = [];
    this.getWinPositions(gameState).forEach(({ reel, row }, index) => {
      const sprite = this.reelSprites[reel]?.[row];
      if (!sprite) return;
      this.reelSprites[reel][row] = null;
      const flash = this.add.circle(sprite.x, sprite.y, 12, 0xffd36b, 0.9)
        .setDepth(DEPTH.effects)
        .setBlendMode(Phaser.BlendModes.ADD);
      effects.push(this.tweenPromise({
        targets: [sprite, flash],
        scaleX: 1.45,
        scaleY: 1.45,
        alpha: 0,
        duration: 230,
        delay: index * 16,
        ease: "Cubic.easeOut",
        onComplete: () => {
          sprite.destroy();
          flash.destroy();
        },
      }));
    });
    if (effects.length) this.playSfx("wins_explode", { volume: 0.7 });
    await Promise.all(effects);
  }

  async presentScatterLandings(scatterLandings = [], angerMeter = null) {
    const landings = Array.isArray(scatterLandings)
      ? scatterLandings
        .map((landing) => ({ landing, position: normalizePosition(landing) }))
        .filter(({ position }) => position)
      : [];
    for (let index = 0; index < landings.length; index += 1) {
      const { landing, position: { reel, row } } = landings[index];
      const sprite = this.reelSprites[reel]?.[row];
      if (!sprite) continue;
      const ring = this.add.circle(sprite.x, sprite.y, CELL_SIZE * 0.34, 0xff682b, 0)
        .setStrokeStyle(4, 0xffa33b, 0.95)
        .setDepth(DEPTH.effects);
      await Promise.all([
        this.tweenPromise({
          targets: sprite,
          scaleX: SYMBOL_SCALE * 1.2,
          scaleY: SYMBOL_SCALE * 1.2,
          duration: 150,
          yoyo: true,
          ease: "Back.easeOut",
        }),
        this.tweenPromise({
          targets: ring,
          radius: CELL_SIZE * 0.58,
          alpha: 0,
          duration: 360,
          onComplete: () => ring.destroy(),
        }),
      ]);
      if (landing?.counted !== false) {
        const max = Number(angerMeter?.max) || this.angerMeterState.max || 3;
        const reportedAfter = Number(landing?.angerAfter);
        const count = landing?.triggeredBonus === true
          ? max
          : (Number.isFinite(reportedAfter) ? reportedAfter : this.angerMeterState.count + 1);
        await this.updateAngerMeter({ count, max });
      }
      await this.tweenPromise({
        targets: sprite,
        alpha: 0.42,
        scaleX: SYMBOL_SCALE,
        scaleY: SYMBOL_SCALE,
        duration: 180,
        onComplete: () => {
          sprite.scatterConsumed = true;
          sprite.setTint(0x706863);
        },
      });
    }
    if (angerMeter) await this.updateAngerMeter(angerMeter);
  }

  async updateAngerMeter(angerMeter = {}) {
    const max = Math.max(1, Number(angerMeter.max) || 3);
    const count = Phaser.Math.Clamp(Number(angerMeter.count) || 0, 0, max);
    this.angerMeterState = { count, max };
    const filled = Math.round((count / max) * this.angerSegments.length);
    await Promise.all(this.angerSegments.map((segment, index) => {
      const active = index < filled;
      segment.setFillStyle(active ? 0xe55328 : 0x341912, active ? 1 : 0.9);
      return active
        ? this.tweenPromise({ targets: segment, scaleX: 1.16, scaleY: 1.25, duration: 110, yoyo: true })
        : Promise.resolve();
    }));
  }

  updateCountUp(targetValue = 0) {
    const target = Number(targetValue) || 0;
    const counter = { value: this.currentWin };
    if (target > this.currentWin) this.playSfx("wins_payout", { volume: 0.55 });
    return this.tweenPromise({
      targets: counter,
      value: target,
      duration: 420,
      ease: "Cubic.easeOut",
      onUpdate: () => this.countUpText?.setText(`WIN ${counter.value.toFixed(2)}`),
      onComplete: () => {
        this.currentWin = target;
        this.countUpText?.setText(`WIN ${target.toFixed(2)}`);
      },
    });
  }

  resetForNewSpin() {
    this.currentWin = 0;
    this.countUpText?.setText("WIN 0.00");
    this.clearPendingFastForward();
  }

  async enterBonus(gameState = {}) {
    this.isInBonusMode = true;
    this.startBonusTheme();
    this.updateFreespinCounter(this.getRemainingFreespins(gameState));
    await Promise.all([
      this.tweenPromise({ targets: this.background, alpha: 0, duration: 450 }),
      this.tweenPromise({ targets: this.bonusBackground, alpha: 1, duration: 450 }),
    ]);
  }

  async leaveBonus() {
    if (!this.isInBonusMode) return;
    this.isInBonusMode = false;
    this.hideFreespinCounter();
    this.stopBonusTheme();
    await Promise.all([
      this.tweenPromise({ targets: this.background, alpha: 1, duration: 300 }),
      this.tweenPromise({ targets: this.bonusBackground, alpha: 0, duration: 300 }),
    ]);
  }

  getRemainingFreespins(gameState = {}) {
    return Math.max(0, Math.floor(Number(
      gameState.bonusState?.remaining ??
      gameState.bonusState?.remainingFreespins ??
      gameState.bonusState?.finalFreespins ??
      gameState.bonusState?.initial ??
      gameState.bonusState?.initialFreespins ??
      0
    ) || 0));
  }

  updateFreespinCounter(remaining) {
    this.freespinCounterValue = Math.max(0, Math.floor(Number(remaining) || 0));
    this.freespinText?.setText(`FREESPINS ${this.freespinCounterValue}`).setVisible(true);
    this.emitFreespinsCounter(this.freespinCounterValue);
  }

  hideFreespinCounter() {
    this.freespinCounterValue = null;
    this.freespinText?.setVisible(false);
    this.emitFreespinsCounter(null);
  }

  emitFreespinsCounter(value) {
    this.eventBus?.emit("setFreespinsCounter", value);
  }

  emitRoundStarted() {
    this.eventBus?.emit("render:roundStarted");
  }

  emitOutcomeRevealed() {
    this.eventBus?.emit("render:outcomeRevealed");
  }

  emitRoundEnded() {
    this.eventBus?.emit("render:roundEnded");
  }

  tweenPromise(config) {
    if (!this.tweens) return Promise.resolve();
    return new Promise((resolve) => {
      const originalComplete = config.onComplete;
      let tween = null;
      tween = this.tweens.add({
        ...config,
        duration: this.fastForwardRequested ? Math.min(45, Number(config.duration) || 0) : config.duration,
        delay: this.fastForwardRequested ? 0 : config.delay,
        onComplete: (...args) => {
          this.activeTweens.delete(tween);
          originalComplete?.(...args);
          resolve();
        },
      });
      this.activeTweens.add(tween);
    });
  }

  waitForPresentation(ms, { skippable = true } = {}) {
    if (this.fastForwardRequested && skippable) return Promise.resolve();
    return new Promise((resolve) => {
      let entry = null;
      const timer = this.time.delayedCall(ms, () => {
        this.presentationWaits.delete(entry);
        resolve();
      });
      entry = {
        skippable,
        finish: () => {
          timer.remove(false);
          this.presentationWaits.delete(entry);
          resolve();
        },
      };
      this.presentationWaits.add(entry);
    });
  }

  cancelSkippablePresentationWaits() {
    [...this.presentationWaits].filter((entry) => entry.skippable).forEach((entry) => entry.finish());
  }

  finishActiveTweens() {
    [...this.activeTweens].forEach((tween) => tween?.complete?.());
  }

  requestFastForward() {
    this.fastForwardRequested = true;
    this.time.timeScale = 5;
    this.tweens.timeScale = 5;
    this.cancelSkippablePresentationWaits();
    this.time.delayedCall(120, () => {
      this.time.timeScale = 1;
      this.tweens.timeScale = 1;
    });
  }

  clearPendingFastForward() {
    this.fastForwardRequested = false;
    if (this.time) this.time.timeScale = 1;
    if (this.tweens) this.tweens.timeScale = 1;
  }

  playSfx(key, config = {}) {
    if (!this.sound || !this.cache.audio.exists(key)) return null;
    if (this.fastForwardRequested && soundInteractionPolicy[key]?.allowDuringFastForward === false) return null;
    return this.sound.play(key, {
      ...config,
      volume: (Number(config.volume) || 1) * (this.fastForwardRequested ? 0.55 : 1),
    });
  }

  playSpinClickSound() {
    this.playSfx("action_spin_click", { volume: 0.55 });
  }

  startMainTheme() {
    if (this.musicMuted || this.isInBonusMode || this.mainTheme?.isPlaying) return;
    this.mainTheme = this.sound.add("theme_main", { loop: true, volume: 0.5 });
    this.mainTheme.play();
  }

  startBonusTheme() {
    this.mainTheme?.stop();
    if (this.musicMuted || this.bonusTheme?.isPlaying) return;
    this.bonusTheme = this.sound.add("theme_bonus", { loop: true, volume: 0.42 });
    this.bonusTheme.play();
  }

  stopBonusTheme() {
    this.bonusTheme?.stop();
    this.bonusTheme = null;
    this.startMainTheme();
  }

  toggleMusic() {
    this.musicMuted = !this.musicMuted;
    [this.mainTheme, this.bonusTheme].forEach((theme) => theme?.setMute(this.musicMuted));
    return this.musicMuted;
  }

  isMusicMuted() {
    return this.musicMuted;
  }

  setMuted(muted) {
    this.sound.mute = muted === true;
  }

  pauseGame({ timers = true, audio = true } = {}) {
    if (timers) {
      this.time.paused = true;
      this.tweens.pauseAll();
    }
    if (audio) this.sound.pauseAll();
  }

  resumeGame({ audio = true } = {}) {
    this.time.paused = false;
    this.tweens.resumeAll();
    if (audio) this.sound.resumeAll();
  }
}
