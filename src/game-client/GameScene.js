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
  layoutReelFrame,
} from "./config/layoutMetrics";

const REELS = 5;
const ROWS = 3;
const SYMBOL_SCALE = 0.65;
const ANIMAL_SYMBOLS = new Set([1, 2, 3, 4, 5]);
// Normalized thumb/finger gap in each hand texture (0–1). Tune if art shifts.
const CRUSH_HAND_GRIP = {
  open_hand: { x: 0.91, y: 0.36 },
  snapped_hand: { x: 0.91, y: 0.36 },
};
const CRUSH_HAND_SCALE = 2;
const DEPTH = {
  background: 0,
  crushBackground: 1,
  board: 4,
  crushHand: 12,
  symbols: 10,
  crushGrab: 12,
  effects: 20,
  stomp: 25,
  stompVfx: 27,
  ui: 30,
};

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
    this.stompLandedCoins = [];
    this.stompCoinsRegistry = new Set();
    this.stompCoinLaunchPromises = [];
  }

  create() {
    this.cameras.main.setBackgroundColor(0x090b14);
    this.createEnvironment();
    this.createBoardUi();
    this.ensureCoinAnimation();
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
    this.crushBackground = this.add.image(x, y, "crush_giant_bg")
      .setDepth(DEPTH.crushBackground)
      .setAlpha(0);
    this.bonusBackground = this.add.image(x, y, "bonus_background")
      .setDepth(DEPTH.background)
      .setAlpha(0);
    [this.background, this.crushBackground, this.bonusBackground].forEach((image) => {
      this.layoutBackgroundImage(image);
    });
    this.reelFrame = this.add.image(x, y, "reel_frame").setDepth(DEPTH.board);
    const reelFrameSource = this.reelFrame.texture.getSourceImage?.();
    if (reelFrameSource?.width && reelFrameSource?.height) {
      layoutReelFrame(this.reelFrame, reelFrameSource);
    }
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

  ensureCoinAnimation() {
    if (this.anims?.exists("yellow_coin_spin")) return;
    if (!this.textures.exists("yellow_coin")) return;

    const frameNames = this.textures.get("yellow_coin")
      .getFrameNames()
      .filter((name) => name !== "__BASE" && name.startsWith("image_"))
      .sort();
    if (!frameNames.length) return;

    this.anims.create({
      key: "yellow_coin_spin",
      frames: frameNames.map((frame) => ({ key: "yellow_coin", frame })),
      frameRate: 28,
      repeat: -1,
    });
  }

  getCoinFrameName() {
    if (!this.textures.exists("yellow_coin")) return "image_0000.png";
    const frameNames = this.textures.get("yellow_coin")
      .getFrameNames()
      .filter((name) => name !== "__BASE" && name.startsWith("image_"))
      .sort();
    return frameNames[0] || "image_0000.png";
  }

  getStompReelBounds(reels = []) {
    const sorted = [...reels].map(Number).filter(Number.isFinite).sort((a, b) => a - b);
    if (!sorted.length) return null;
    const left = sorted[0];
    const right = sorted[sorted.length - 1];
    const topLeft = getCellCenter(left, ROWS - 1);
    const bottomRight = getCellCenter(right, 0);
    return {
      centerX: (topLeft.x + bottomRight.x) / 2,
      centerY: (topLeft.y + bottomRight.y) / 2,
      width: bottomRight.x - topLeft.x + CELL_SIZE,
      height: bottomRight.y - topLeft.y + CELL_SIZE,
    };
  }

  async presentStompTease(teaseMs = 900) {
    const pulses = Math.max(3, Math.floor(teaseMs / 220));
    for (let index = 0; index < pulses; index += 1) {
      this.cameras.main.shake(130, 0.0018 + index * 0.0008);
      await this.waitForPresentation(Math.floor(teaseMs / pulses), { skippable: true });
    }
  }

  attachMotionTrail(target, {
    color = 0xffffff,
    radius = 4,
    depth = DEPTH.stompVfx,
    intervalMs = 22,
    fadeMs = 260,
  } = {}) {
    if (!target) return () => {};
    const timer = this.time.addEvent({
      delay: intervalMs,
      loop: true,
      callback: () => {
        if (!target.active || target.alpha <= 0.05) return;
        const mark = this.add.circle(target.x, target.y, radius, color, 0.72).setDepth(depth - 1);
        this.tweenPromise({
          targets: mark,
          alpha: 0,
          scale: 0.15,
          duration: fadeMs,
          ease: "Quad.easeOut",
          onComplete: () => mark.destroy(),
        });
      },
    });
    return () => timer.remove(false);
  }

  getStompGroundY(y = 0) {
    return Math.max(y + CELL_SIZE * 0.35, GRID_OFFSET_Y + GRID_HEIGHT_PX - 6);
  }

  launchArcProjectile({
    sprite,
    startX,
    startY,
    groundY,
    horizontalSpread = 140,
    launchHeight = 200,
    riseDuration = 200,
    fallDuration = 480,
    trailColor = 0xffffff,
    trailRadius = 4,
    depth = DEPTH.stompVfx,
    spinSpeed = 420,
    settleMode = "fade",
    onSettle = null,
  }) {
    sprite.setDepth(depth);
    const endX = startX + Phaser.Math.Between(-horizontalSpread, horizontalSpread);
    const peakY = startY - Phaser.Math.Between(launchHeight * 0.65, launchHeight);
    const stopTrail = this.attachMotionTrail(sprite, {
      color: trailColor,
      radius: trailRadius,
      depth,
      intervalMs: 18,
    });

    return new Promise((resolve, reject) => {
      this.tweenPromise({
        targets: sprite,
        x: endX,
        y: peakY,
        angle: sprite.angle + spinSpeed * 0.35,
        duration: riseDuration,
        ease: "Quad.easeOut",
      }).then(() => this.tweenPromise({
        targets: sprite,
        y: groundY,
        angle: sprite.angle + spinSpeed * 0.65,
        duration: fallDuration,
        ease: "Quad.easeIn",
      })).then(() => {
        stopTrail();
        return this.tweenPromise({
          targets: sprite,
          y: groundY + 6,
          duration: 65,
          yoyo: true,
          ease: "Quad.easeOut",
        });
      }).then(() => {
        if (settleMode === "rest") {
          if (sprite.anims?.isPlaying) {
            sprite.anims.stop();
          }
          sprite.setData("landedAt", performance.now());
          onSettle?.(sprite);
          resolve();
          return;
        }
        this.tweenPromise({
          targets: sprite,
          alpha: 0,
          scaleX: sprite.scaleX * 0.55,
          scaleY: sprite.scaleY * 0.55,
          duration: 320,
          delay: 120,
          onComplete: () => {
            sprite.destroy();
            resolve();
          },
        });
      }).catch((error) => {
        if (settleMode === "rest" && sprite?.active) {
          sprite.setData("landedAt", performance.now());
          onSettle?.(sprite);
          resolve();
          return;
        }
        reject(error);
      });
    });
  }

  registerStompCoin(coin) {
    if (!coin?.active) return;
    if (!this.stompCoinsRegistry) this.stompCoinsRegistry = new Set();
    if (!Array.isArray(this.stompLandedCoins)) this.stompLandedCoins = [];
    this.stompCoinsRegistry.add(coin);
    if (!this.stompLandedCoins.includes(coin)) {
      this.stompLandedCoins.push(coin);
    }
  }

  clearStompLandedCoins() {
    this.stompCoinsRegistry?.forEach((coin) => coin?.destroy?.());
    this.stompCoinsRegistry?.clear();
    this.stompLandedCoins = [];
    this.stompCoinLaunchPromises = [];
  }

  trackStompCoinLaunch(promise) {
    if (!Array.isArray(this.stompCoinLaunchPromises)) this.stompCoinLaunchPromises = [];
    this.stompCoinLaunchPromises.push(promise);
    promise.finally(() => {
      this.stompCoinLaunchPromises = (this.stompCoinLaunchPromises || [])
        .filter((entry) => entry !== promise);
    });
    return promise;
  }

  async waitForStompCoinSettling() {
    const pending = [...(this.stompCoinLaunchPromises || [])];
    if (pending.length) {
      await Promise.allSettled(pending);
    }
  }

  async collectStompCoinsToWin() {
    await this.waitForStompCoinSettling();

    const coins = [...(this.stompCoinsRegistry || [])].filter((coin) => coin?.active);
    this.stompCoinsRegistry?.clear();
    this.stompLandedCoins = [];
    if (!coins.length || !this.countUpText) return;

    const now = performance.now();
    const restMs = Math.max(
      0,
      ...coins.map((coin) => 1000 - (now - (coin.getData("landedAt") || now)))
    );
    await this.waitForPresentation(restMs, { skippable: true });

    const targetX = this.countUpText.x;
    const targetY = this.countUpText.y;
    let collectedValue = this.currentWin;

    await Promise.all(coins.map((coin, index) => new Promise((resolve) => {
      const coinValue = Number(coin.getData("coinValue")) || 0;
      this.tweenPromise({
        targets: coin,
        x: targetX,
        y: targetY,
        scaleX: 0.06,
        scaleY: 0.06,
        alpha: 0.15,
        angle: coin.angle + Phaser.Math.Between(180, 540),
        duration: 420,
        delay: index * 45,
        ease: "Cubic.easeIn",
        onComplete: () => {
          if (coinValue > 0) {
            collectedValue = Number((collectedValue + coinValue).toFixed(2));
            this.countUpText?.setText(`WIN ${collectedValue.toFixed(2)}`);
          }
          coin.destroy();
          resolve();
        },
      });
    })));

    this.currentWin = collectedValue;

    await this.tweenPromise({
      targets: this.countUpText,
      scaleX: 1.14,
      scaleY: 1.14,
      duration: 90,
      yoyo: true,
      ease: "Back.easeOut",
    });
  }

  spawnStompImpactBurst(x, y, width = CELL_SIZE) {
    const effects = [];
    for (let index = 0; index < 6; index += 1) {
      const shard = this.add.circle(
        x + Phaser.Math.Between(-width * 0.45, width * 0.45),
        y + Phaser.Math.Between(-8, 16),
        Phaser.Math.Between(4, 14),
        Phaser.Math.RND.pick([0x6b4a2e, 0x8a6239, 0xc41b1b, 0x3d2818]),
        0.88
      ).setDepth(DEPTH.stompVfx - 1);
      effects.push(this.tweenPromise({
        targets: shard,
        y: shard.y + Phaser.Math.Between(28, 90),
        x: shard.x + Phaser.Math.Between(-40, 40),
        alpha: 0,
        scale: Phaser.Math.FloatBetween(0.2, 1.8),
        duration: Phaser.Math.Between(220, 480),
        ease: "Quad.easeIn",
        onComplete: () => shard.destroy(),
      }));
    }
    return Promise.all(effects);
  }

  spawnBloodBurst(x, y, groundY = this.getStompGroundY(y)) {
    const effects = [];
    const burstCount = 22;
    for (let index = 0; index < burstCount; index += 1) {
      const drop = this.add.circle(
        x,
        y,
        Phaser.Math.Between(3, 10),
        Phaser.Math.RND.pick([0x8b0000, 0xc41b1b, 0xff2a2a, 0x5d0f0f]),
        0.94
      ).setDepth(DEPTH.stompVfx);
      const endX = x + Phaser.Math.Between(-110, 110);
      const peakY = y - Phaser.Math.Between(60, 190);
      const stopTrail = this.attachMotionTrail(drop, {
        color: 0xc41b1b,
        radius: Phaser.Math.Between(2, 5),
        depth: DEPTH.stompVfx,
        intervalMs: 16,
        fadeMs: 220,
      });
      effects.push(
        this.tweenPromise({
          targets: drop,
          x: endX,
          y: peakY,
          scale: Phaser.Math.FloatBetween(0.7, 1.8),
          duration: Phaser.Math.Between(120, 200),
          ease: "Quad.easeOut",
        }).then(() => this.tweenPromise({
          targets: drop,
          y: groundY + Phaser.Math.Between(-4, 10),
          x: endX + Phaser.Math.Between(-20, 20),
          alpha: 0,
          scale: Phaser.Math.FloatBetween(0.3, 0.9),
          duration: Phaser.Math.Between(280, 520),
          ease: "Quad.easeIn",
          onComplete: () => {
            stopTrail();
            drop.destroy();
          },
        }))
      );
    }
    return Promise.all(effects);
  }

  spawnGibs(x, y, groundY = this.getStompGroundY(y)) {
    const effects = [];
    for (let index = 0; index < 10; index += 1) {
      const gib = this.add.rectangle(
        x,
        y,
        Phaser.Math.Between(4, 12),
        Phaser.Math.Between(4, 12),
        Phaser.Math.RND.pick([0x5d0f0f, 0x8b0000, 0xc41b1b, 0x3b0505]),
        0.95
      ).setDepth(DEPTH.stompVfx).setAngle(Phaser.Math.Between(0, 360));
      const endX = x + Phaser.Math.Between(-95, 95);
      const peakY = y - Phaser.Math.Between(40, 160);
      const stopTrail = this.attachMotionTrail(gib, {
        color: 0x8b0000,
        radius: 3,
        depth: DEPTH.stompVfx,
        intervalMs: 20,
      });
      effects.push(
        this.tweenPromise({
          targets: gib,
          x: endX,
          y: peakY,
          angle: gib.angle + Phaser.Math.Between(-240, 240),
          duration: Phaser.Math.Between(140, 220),
          ease: "Quad.easeOut",
        }).then(() => this.tweenPromise({
          targets: gib,
          y: groundY + Phaser.Math.Between(0, 14),
          alpha: 0,
          angle: gib.angle + Phaser.Math.Between(-120, 120),
          duration: Phaser.Math.Between(320, 640),
          ease: "Quad.easeIn",
          onComplete: () => {
            stopTrail();
            gib.destroy();
          },
        }))
      );
    }
    return Promise.all(effects);
  }

  spawnCoinDrop(x, y, groundY = this.getStompGroundY(y), cell = {}) {
    if (cell.isAnimal !== true || !(Number(cell.coinValue) > 0)) {
      return Promise.resolve();
    }

    this.ensureCoinAnimation();
    if (!this.anims.exists("yellow_coin_spin")) return Promise.resolve();

    const coin = this.add.sprite(x, y, "yellow_coin", this.getCoinFrameName())
      .setScale(Phaser.Math.FloatBetween(0.26, 0.3))
      .setDepth(DEPTH.stompVfx);
    coin.setData("stompCoin", true);
    coin.setData("coinType", Number(cell.coinType) || 20);
    coin.setData("coinValue", Number(cell.coinValue) || 0);
    this.stompCoinsRegistry?.add(coin);
    coin.anims.play("yellow_coin_spin");

    return this.trackStompCoinLaunch(this.launchArcProjectile({
      sprite: coin,
      startX: coin.x,
      startY: coin.y,
      groundY: groundY + Phaser.Math.Between(-2, 8),
      horizontalSpread: Phaser.Math.Between(70, 130),
      launchHeight: Phaser.Math.Between(120, 210),
      riseDuration: Phaser.Math.Between(170, 240),
      fallDuration: Phaser.Math.Between(460, 620),
      trailColor: 0xffd24a,
      trailRadius: Phaser.Math.Between(3, 6),
      spinSpeed: Phaser.Math.Between(300, 560),
      settleMode: "rest",
      onSettle: (landedCoin) => this.registerStompCoin(landedCoin),
    }));
  }

  crushStompedSymbol(cell = {}) {
    const reel = Number(cell.reel);
    const row = Number(cell.row);
    const sprite = this.reelSprites[reel]?.[row];
    if (!sprite) return Promise.resolve();
    const isAnimal = cell.isAnimal === true;

    const { x, y } = sprite;
    const groundY = this.getStompGroundY(y);

    const crushTween = this.tweenPromise({
      targets: sprite,
      scaleX: SYMBOL_SCALE * 0.15,
      scaleY: SYMBOL_SCALE * 0.08,
      alpha: 0,
      angle: Phaser.Math.Between(-18, 18),
      duration: 180,
      ease: "Quad.easeIn",
      onComplete: () => {
        sprite.destroy();
        this.reelSprites[reel][row] = null;
      },
    });

    if (isAnimal) {
      this.playSfx("wins_explode", { volume: 0.45 });
      this.spawnBloodBurst(x, y, groundY);
      this.spawnGibs(x, y, groundY);
      this.spawnCoinDrop(x, y, groundY, cell);
    }

    return crushTween;
  }

  async presentStompFeature(stompEvent = {}) {
    if (!stompEvent?.triggered) return;
    const crushedCells = Array.isArray(stompEvent.crushedCells) ? stompEvent.crushedCells : [];
    const bounds = this.getStompReelBounds(stompEvent.reels || []);
    if (!bounds || !crushedCells.length) return;

    await this.presentStompTease(Number(stompEvent.teaseMs) || 900);
    await this.waitForPresentation(Number(stompEvent.pauseMs) || 450, { skippable: true });

    const footWidth = bounds.width + CELL_SIZE * 0.55;
    const footScale = footWidth / 420;
    const startY = GRID_OFFSET_Y - CELL_SIZE * 4.1;
    const impactY = bounds.centerY + CELL_SIZE * 0.08;
    const slamY = impactY + CELL_SIZE * 0.1;
    const holdY = impactY - CELL_SIZE * 0.42;
    const foot = this.add.image(bounds.centerX, startY, "giantfoot")
      .setDepth(DEPTH.stomp)
      .setScale(footScale * 0.78, footScale * 0.9)
      .setAlpha(0.98);

    await this.tweenPromise({
      targets: foot,
      y: slamY,
      scaleX: footScale * 1.02,
      scaleY: footScale * 1.03,
      duration: 260,
      ease: "Quad.easeIn",
    });

    await this.tweenPromise({
      targets: foot,
      y: impactY,
      scaleX: footScale * 1.04,
      scaleY: footScale * 0.97,
      duration: 90,
      ease: "Quad.easeOut",
    });

    this.cameras.main.shake(340, 0.013);
    this.playSfx("wins_explode", { volume: 0.82 });
    this.spawnStompImpactBurst(bounds.centerX, impactY + CELL_SIZE * 0.16, bounds.width);
    await Promise.all(crushedCells.map((cell) => this.crushStompedSymbol(cell)));

    await this.tweenPromise({
      targets: foot,
      y: holdY,
      scaleX: footScale,
      scaleY: footScale,
      duration: 360,
      ease: "Back.easeOut",
    });

    await this.waitForPresentation(650, { skippable: true });

    await this.tweenPromise({
      targets: foot,
      y: startY,
      scaleX: footScale * 0.78,
      scaleY: footScale * 0.9,
      duration: 520,
      ease: "Quad.easeIn",
      onComplete: () => foot.destroy(),
    });
  }

  layoutBackgroundImage(image) {
    const source = image?.texture?.getSourceImage?.();
    if (!source?.width || !source?.height) return;
    image.setScale(Math.max((GRID_WIDTH_PX + 260) / source.width, (GRID_HEIGHT_PX + 340) / source.height));
  }

  syncCrushHandPair(openHand, snappedHand) {
    if (!openHand?.active || !snappedHand?.active) return;
    snappedHand.setPosition(openHand.x, openHand.y).setScale(openHand.scaleX, openHand.scaleY);
  }

  createCrushHand(textureKey, x, y, scale) {
    const grip = CRUSH_HAND_GRIP[textureKey] || CRUSH_HAND_GRIP.open_hand;
    return this.add.image(x, y, textureKey)
      .setOrigin(grip.x, grip.y)
      .setScale(scale);
  }

  getCrushHandScale() {
    return ((CELL_SIZE * 1.35) / 420) * CRUSH_HAND_SCALE;
  }

  async showCrushGiantBackground(duration = 520) {
    const bg = this.crushBackground;
    if (!bg) return;
    const peekX = GRID_OFFSET_X + GRID_WIDTH_PX * 0.54;
    const peekY = GRID_OFFSET_Y + GRID_HEIGHT_PX * 0.36;
    bg.setPosition(peekX, peekY);
    this.layoutBackgroundImage(bg);
    const peekScale = bg.scaleX * 1.14;
    bg.setScale(peekScale);

    await this.tweenPromise({ targets: bg, alpha: 1, duration, ease: "Quad.easeInOut" });
  }

  async hideCrushGiantBackground(duration = 360) {
    const bg = this.crushBackground;
    if (!bg) return;
    const centerX = GRID_OFFSET_X + GRID_WIDTH_PX / 2;
    const centerY = GRID_OFFSET_Y + GRID_HEIGHT_PX / 2;

    await this.tweenPromise({
      targets: bg,
      alpha: 0,
      x: centerX,
      y: centerY,
      duration,
      ease: "Quad.easeInOut",
      onComplete: () => {
        this.layoutBackgroundImage(bg);
        bg.setPosition(centerX, centerY);
      },
    });
  }

  async presentMiniSqueezeShake(targets, durationMs = 300) {
    const items = (Array.isArray(targets) ? targets : [targets]).filter(Boolean);
    if (!items.length) return;

    const bases = items.map((target) => ({
      target,
      x: target.x,
      y: target.y,
      scaleX: target.scaleX,
      scaleY: target.scaleY,
    }));

    const pulses = 4;
    const stepMs = Math.max(40, Math.floor(durationMs / pulses));
    for (let index = 0; index < pulses; index += 1) {
      const nudgeX = Phaser.Math.Between(-4, 4);
      const nudgeY = Phaser.Math.Between(-3, 3);
      const scalePulse = index % 2 === 0 ? 1.04 : 0.97;
      await Promise.all(bases.map(({ target, x, y, scaleX, scaleY }) => this.tweenPromise({
        targets: target,
        x: x + nudgeX,
        y: y + nudgeY,
        scaleX: scaleX * scalePulse,
        scaleY: scaleY * scalePulse,
        duration: stepMs,
        ease: "Sine.easeInOut",
      })));
    }
  }

  async crossfadeCrushHand(openHand, snappedHand, duration = 120) {
    if (!openHand?.active || !snappedHand?.active) return;
    snappedHand.setAlpha(0);
    await Promise.all([
      this.tweenPromise({ targets: openHand, alpha: 0, duration, ease: "Quad.easeIn" }),
      this.tweenPromise({ targets: snappedHand, alpha: 0.98, duration, ease: "Quad.easeOut" }),
    ]);
    openHand.destroy();
  }

  async crushGrabbedSymbol(sprite, handX, handY) {
    if (!sprite?.active) return;
    const reel = Number(sprite.reel);
    const row = Number(sprite.row);
    const groundY = this.getStompGroundY(handY);

    this.playSfx("wins_explode", { volume: 0.58 });
    await this.tweenPromise({
      targets: sprite,
      scaleX: SYMBOL_SCALE * 0.12,
      scaleY: SYMBOL_SCALE * 0.06,
      angle: Phaser.Math.Between(-24, 24),
      alpha: 0,
      duration: 240,
      ease: "Quad.easeIn",
      onComplete: () => {
        sprite.destroy();
        if (Number.isFinite(reel) && Number.isFinite(row)) {
          this.reelSprites[reel][row] = null;
        }
      },
    });

    this.spawnBloodBurst(handX, handY - CELL_SIZE * 0.05, groundY);
    this.spawnGibs(handX, handY - CELL_SIZE * 0.05, groundY);
    this.cameras.main.shake(220, 0.009);
  }

  getCrushHandExitX(enterX) {
    return enterX - CELL_SIZE * 0.8;
  }

  async slideCrushHandOut(hand, exitX, duration = 460) {
    if (!hand?.active) return;
    await this.tweenPromise({
      targets: hand,
      x: exitX,
      duration,
      ease: "Cubic.easeIn",
      onComplete: () => hand.destroy(),
    });
  }

  async exitCrushHandAfterGrab(enterX, targetY, handScale) {
    const exitX = this.getCrushHandExitX(enterX);
    const openHand = this.createCrushHand("open_hand", enterX, targetY, handScale)
      .setDepth(DEPTH.crushHand)
      .setAlpha(0.98);
    await this.slideCrushHandOut(openHand, exitX);
  }

  getCrushCells(crushEvent = {}) {
    if (Array.isArray(crushEvent.crushedCells) && crushEvent.crushedCells.length) {
      return crushEvent.crushedCells;
    }
    const reel = Number(crushEvent.reel);
    const row = Number(crushEvent.row);
    if (!Number.isFinite(reel) || !Number.isFinite(row)) return [];
    return [{ reel, row, symbol: crushEvent.symbol, isAnimal: true }];
  }

  async presentSingleCrushGrab(cell, { enterX, handScale, isFirstGrab = false }) {
    const reel = Number(cell.reel);
    const row = Number(cell.row);
    const target = getCellCenter(reel, row);
    const sprite = this.reelSprites[reel]?.[row];
    if (!sprite) return;

    const openHand = this.createCrushHand("open_hand", enterX, target.y, handScale)
      .setDepth(DEPTH.crushHand)
      .setAlpha(0.98);
    const snappedHand = this.createCrushHand("snapped_hand", enterX, target.y, handScale)
      .setDepth(DEPTH.crushHand)
      .setAlpha(0)
      .setVisible(false);

    await this.tweenPromise({
      targets: openHand,
      x: target.x,
      y: target.y,
      duration: isFirstGrab ? 420 : 360,
      ease: "Cubic.easeOut",
    });
    snappedHand.setPosition(openHand.x, openHand.y).setVisible(true);

    openHand.setDepth(DEPTH.crushGrab);
    snappedHand.setDepth(DEPTH.crushGrab);
    await this.tweenPromise({
      targets: openHand,
      scaleX: handScale * 1.05,
      scaleY: handScale * 1.05,
      duration: 180,
      ease: "Quad.easeOut",
      onUpdate: () => this.syncCrushHandPair(openHand, snappedHand),
    });
    this.syncCrushHandPair(openHand, snappedHand);

    sprite.setDepth(DEPTH.crushGrab - 1);

    await this.presentMiniSqueezeShake(openHand, 300);
    this.syncCrushHandPair(openHand, snappedHand);
    await this.crossfadeCrushHand(openHand, snappedHand, 130);
    await this.crushGrabbedSymbol(sprite, target.x, target.y);

    await this.waitForPresentation(280, { skippable: true });

    const exitX = this.getCrushHandExitX(enterX);
    await this.slideCrushHandOut(snappedHand, exitX);
    await this.exitCrushHandAfterGrab(enterX, target.y, handScale);
  }

  async presentCrushFeature(crushEvent = {}) {
    if (!crushEvent?.triggered) return;
    const crushedCells = this.getCrushCells(crushEvent);
    if (!crushedCells.length) return;

    const handScale = this.getCrushHandScale();
    const enterX = GRID_OFFSET_X - CELL_SIZE * 1.6;

    await this.showCrushGiantBackground(520);
    await this.waitForPresentation(Number(crushEvent.teaseMs) || 700, { skippable: true });
    await this.waitForPresentation(Number(crushEvent.pauseMs) || 350, { skippable: true });

    for (let index = 0; index < crushedCells.length; index += 1) {
      await this.presentSingleCrushGrab(crushedCells[index], {
        enterX,
        handScale,
        isFirstGrab: index === 0,
      });
      if (index < crushedCells.length - 1) {
        await this.waitForPresentation(180, { skippable: true });
      }
    }

    await this.hideCrushGiantBackground(360);
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

  async updateCountUp(targetValue = 0) {
    await this.collectStompCoinsToWin();

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
    this.countUpText?.setScale(1, 1);
    this.clearStompLandedCoins();
    this.clearPendingFastForward();
    const max = this.angerMeterState?.max || 3;
    this.angerMeterState = { count: 0, max };
    this.angerSegments?.forEach((segment) => {
      segment.setFillStyle(0x341912, 0.9);
      segment.setScale(1, 1);
    });
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
