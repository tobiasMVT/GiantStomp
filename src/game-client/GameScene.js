import Phaser from "phaser";
import clientConfig from "./config/client_config.json";
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
  BONUS_BACKGROUND_OFFSET_Y,
  OUCH_BACKGROUND_OFFSET_Y,
  OUCH_BACKGROUND_SCALE,
  OUCH_STOMP_OFFSET_X,
  OUCH_PIT_STEP_DELTA_Y,
} from "./config/layoutMetrics";

const REELS = 5;
const ROWS = 3;
const SYMBOL_SCALE = 0.65;
const ANIMAL_SYMBOLS = new Set([1, 2, 3, 4, 5]);
const LOW_SYMBOLS = [6, 7, 8, 9, 10];
const OUCH_FAKE_SPIN_LOW_REEL = 0;
const OUCH_FAKE_SPIN_ANIMAL_REEL = 1;
const OUCH_FAKE_SPIN_MIN_ANIMALS = 7;
const BONUS_SYMBOLS = [111, 222, 333, 444, 555, 666, 777, 888, 999, 1000];
const CASH_BONUS_SYMBOLS = new Set([111, 222, 333, 444, 555]);
const TRAP_SYMBOLS = [666, 777, 888, 999];
const DAMAGE_SYMBOL = 1000;
const DEFAULT_DAMAGE_METER_SEGMENTS = [1, 2, 3, 4, 5, 10, 15, 20, 25, 50, 75, 100];
const LIFE_SEGMENT_SCALE = 0.3;
const ANGER_SEGMENT_COUNT = 10;
const CONSTRUCTION_SFX = ["construction_1", "construction_2", "construction_3"];
const ANIMAL_CRUSH_SFX = ["animal_crush_splatter", "animal_crush_gore"];
const OUCH_STOMP_SFX = ["ouch_stomp1", "ouch_stomp2"];
const GIANT_PAIN_SFX = ["giant_pain_scream", "giant_pain_scream2"];
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
  angerVfx: 28,
  ui: 30,
};
const STOMP_COIN_SCALE_MIN = 0.13;
const STOMP_COIN_SCALE_MAX = 0.15;

const getReel = (reels, reel) => reels?.[reel] ?? reels?.[String(reel)] ?? [];
const getSymbol = (reels, reel, row) => getReel(reels, reel)?.[row] ?? null;

function formatCashSymbolValue(symbol) {
  if (!CASH_BONUS_SYMBOLS.has(Number(symbol))) return "";
  const amount = Number(clientConfig.bonusWinAmounts?.[String(symbol)]);
  if (!Number.isFinite(amount) || amount <= 0) return "";
  return amount.toFixed(1);
}

function distributeMoneyAmount(total, count) {
  const parts = Math.max(1, Number(count) || 1);
  const totalCents = Math.round((Number(total) || 0) * 100);
  const baseCents = Math.floor(totalCents / parts);
  const remainder = totalCents - (baseCents * parts);
  return Array.from({ length: parts }, (_, index) => (
    (baseCents + (index < remainder ? 1 : 0)) / 100
  ));
}

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
    this.countUpLabel = "WIN";
    this.freespinCounterValue = null;
    this.isInBonusMode = false;
    this.isPostBonusOuch = false;
    this.ouchScrollY = 0;
    this.ouchTheme = null;
    this.ouchFoot = null;
    this.musicMuted = false;
    this.activeAnimalCrushSfx = null;
    this.activeOuchLaughSfx = null;
    this.activeOuchCelebrationSfx = null;
    this.stompLandedCoins = [];
    this.stompCoinsRegistry = new Set();
    this.stompCoinLaunchPromises = [];
    this.totalWinBackground = null;
    this.bonusUi = [];
    this.lifeSegments = [];
    this.trapPowerText = null;
    this.trapPowerMultiplierText = null;
    this.trapLightGroups = {};
    this.trapMeterState = { progress: {}, required: 4, values: {}, power: 0 };
    this.angerBlinkTween = null;
    this.damageMeterObjects = [];
    this.damageMeterEntries = [];
    this.damageMeterSlots = [];
    this.damageMeterState = {
      segments: [...DEFAULT_DAMAGE_METER_SEGMENTS],
      removedSegments: [],
      remainingSegments: [...DEFAULT_DAMAGE_METER_SEGMENTS],
    };
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
    this.bonusBackground = this.add.image(x, y + BONUS_BACKGROUND_OFFSET_Y, "bonus_background")
      .setDepth(DEPTH.background)
      .setAlpha(0);
    this.ouchBackground = this.add.image(x, y + OUCH_BACKGROUND_OFFSET_Y, "ouch_background")
      .setDepth(DEPTH.background)
      .setAlpha(0);
    this.totalWinBackground = this.add.image(x, y, "total_win_background")
      .setDepth(DEPTH.background)
      .setAlpha(0);
    [this.background, this.crushBackground, this.bonusBackground, this.totalWinBackground].forEach((image) => {
      this.layoutBackgroundImage(image);
    });
    this.layoutBackgroundImage(this.ouchBackground, OUCH_BACKGROUND_SCALE);
    this.reelFrame = this.add.image(x, y, "reel_frame").setDepth(DEPTH.board);
    const reelFrameSource = this.reelFrame.texture.getSourceImage?.();
    if (reelFrameSource?.width && reelFrameSource?.height) {
      layoutReelFrame(this.reelFrame, reelFrameSource);
    }
    this.reelMaskShape = this.add.graphics().setAlpha(0.001).setDepth(DEPTH.background);
    this.reelMaskShape.clear();
    this.reelMaskShape.fillStyle(0xffffff, 1);
    this.reelMaskShape.fillRect(
      GRID_OFFSET_X - 2,
      GRID_OFFSET_Y - 16,
      GRID_WIDTH_PX + 4,
      GRID_HEIGHT_PX + 32
    );
    this.reelMask = this.reelMaskShape.createGeometryMask();
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
    }).setOrigin(0.5).setDepth(DEPTH.ui).setVisible(false);
    this.totalWinTitleText = this.add.text(centerX, bottom + 20, "TOTAL WIN", {
      ...textStyle,
      fontSize: "24px",
      align: "center",
    }).setOrigin(0.5).setDepth(DEPTH.ui).setVisible(false);
    this.freespinText = this.add.text(centerX, GRID_OFFSET_Y - 38, "", {
      ...textStyle,
      fontSize: "25px",
    }).setOrigin(0.5).setDepth(DEPTH.ui).setVisible(false);

    const meterWidth = 168;
    const segmentGap = 2;
    const segmentWidth = (meterWidth - segmentGap * (ANGER_SEGMENT_COUNT - 1)) / ANGER_SEGMENT_COUNT;
    const meterX = GRID_OFFSET_X + GRID_WIDTH_PX - meterWidth - 8;
    const meterY = bottom + 88;
    this.angerLabel = this.add.text(meterX - 14, meterY, "ANGER", {
      fontFamily: "Arial Black, Arial",
      fontSize: "16px",
      color: "#ffd6b0",
    }).setOrigin(1, 0.5).setDepth(DEPTH.ui);
    this.angerSegments = Array.from({ length: ANGER_SEGMENT_COUNT }, (_, index) => this.add.rectangle(
      meterX + segmentWidth / 2 + index * (segmentWidth + segmentGap),
      meterY,
      segmentWidth,
      14,
      0x341912,
      0.9
    ).setStrokeStyle(1, 0x9b4b2b, 1).setDepth(DEPTH.ui));
    this.angerMeterState = { count: 0, max: ANGER_SEGMENT_COUNT };

    this.createBonusUi();
  }

  createBonusUi() {
    const left = GRID_OFFSET_X;
    const centerX = GRID_OFFSET_X + GRID_WIDTH_PX / 2;
    const top = GRID_OFFSET_Y;
    const bottom = GRID_OFFSET_Y + GRID_HEIGHT_PX;
    const textStyle = {
      fontFamily: "Arial Black, Arial",
      color: "#f5f7ff",
      stroke: "#111827",
      strokeThickness: 4,
    };

    this.lifeSegments = [1, 2, 3].map((life, index) => {
      const segment = this.add.image(left + 26 + index * 40, bottom + 64, `bonus_life_${life}`)
        .setScale(LIFE_SEGMENT_SCALE)
        .setDepth(DEPTH.ui);
      segment.lifeActive = true;
      return segment;
    });

    TRAP_SYMBOLS.forEach((symbol, trapIndex) => {
      const x = centerX + (trapIndex - 1.5) * 82;
      const icon = this.add.image(x, top - 42, String(symbol))
        .setScale(0.58)
        .setDepth(DEPTH.ui);
      const valueLabel = this.add.text(x, top - 14, "", {
        ...textStyle,
        fontSize: "12px",
        color: "#ffdc73",
      }).setOrigin(0.5).setDepth(DEPTH.ui);
      const lights = [0, 1, 2, 3].map((lightIndex) => this.add.circle(
        x - 18 + lightIndex * 12,
        top + 1,
        4,
        0x202936,
        1
      ).setStrokeStyle(2, 0xd6dde8, 0.9).setDepth(DEPTH.ui));
      this.trapLightGroups[String(symbol)] = {
        icon,
        valueLabel,
        lights,
        target: { x, y: top - 42 },
      };
    });

    this.createDamageMeter(DEFAULT_DAMAGE_METER_SEGMENTS);

    this.trapPowerText = this.add.text(centerX, bottom + 94, "TRAP POWER 0.00", {
      ...textStyle,
      fontSize: "16px",
      color: "#32df7f",
      stroke: "#07170e",
      strokeThickness: 5,
    }).setOrigin(0.5).setDepth(DEPTH.ui);

    this.trapPowerMultiplierText = this.add.text(centerX, bottom + 94, "", {
      ...textStyle,
      fontSize: "16px",
      color: "#26d07c",
      stroke: "#161a20",
      strokeThickness: 4,
    }).setOrigin(0, 0.5).setDepth(DEPTH.ui).setVisible(false);

    this.bonusUi = [
      ...this.lifeSegments,
      this.trapPowerText,
      this.trapPowerMultiplierText,
      ...Object.values(this.trapLightGroups)
        .flatMap(({ icon, valueLabel, lights }) => [icon, valueLabel, ...lights]),
    ];
    this.setBonusUiVisible(false);
  }

  createDamageMeter(segments = []) {
    this.damageMeterObjects?.forEach((object) => object?.destroy?.());
    this.damageMeterObjects = [];
    this.damageMeterEntries = [];
    this.damageMeterValues = [];
    const values = Array.isArray(segments) && segments.length
      ? segments.map(Number)
      : [...DEFAULT_DAMAGE_METER_SEGMENTS];
    const centerX = GRID_OFFSET_X + GRID_WIDTH_PX / 2;
    const bottom = GRID_OFFSET_Y + GRID_HEIGHT_PX;
    const gap = 3;
    const segmentWidth = (GRID_WIDTH_PX - gap * (values.length - 1)) / values.length;
    this.damageMeterValues = [...values];
    this.damageMeterSlots = values.map((_, index) => ({
      x: GRID_OFFSET_X + segmentWidth / 2 + index * (segmentWidth + gap),
      y: bottom + 129,
    }));
    const panel = this.add.rectangle(centerX, bottom + 129, GRID_WIDTH_PX + 18, 34, 0x07110d, 0.86)
      .setStrokeStyle(2, 0xd8c26a, 0.6)
      .setDepth(DEPTH.ui - 1);
    this.damageMeterObjects.push(panel);
    const title = this.add.text(centerX, bottom + 111, "DAMAGE MULTIPLIER", {
      fontFamily: "Arial Black, Arial",
      fontSize: "12px",
      color: "#fff0bf",
      stroke: "#241508",
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(DEPTH.ui);
    this.damageMeterObjects.push(title);

    values.forEach((value, index) => {
      const slot = this.damageMeterSlots[index];
      const ratio = index / Math.max(1, values.length - 1);
      const from = Phaser.Display.Color.ValueToColor(ratio < 0.5 ? 0x26d07c : 0xffd166);
      const to = Phaser.Display.Color.ValueToColor(ratio < 0.5 ? 0xffd166 : 0xef476f);
      const color = Phaser.Display.Color.Interpolate.ColorWithColor(
        from,
        to,
        100,
        Math.round((ratio < 0.5 ? ratio * 2 : (ratio - 0.5) * 2) * 100)
      );
      const activeColor = Phaser.Display.Color.GetColor(color.r, color.g, color.b);
      const marker = this.add.rectangle(slot.x, slot.y, segmentWidth, 24, 0x111923, 0.94)
        .setStrokeStyle(2, activeColor, 0.74)
        .setDepth(DEPTH.ui);
      const label = this.add.text(slot.x, slot.y, `${value}x`, {
        fontFamily: "Arial Black, Arial",
        fontSize: values.length > 12 ? "8px" : "10px",
        color: "#ffffff",
        stroke: "#161a20",
        strokeThickness: 2,
      }).setOrigin(0.5).setDepth(DEPTH.ui);
      this.damageMeterEntries.push({ value, marker, label, activeColor });
      this.damageMeterObjects.push(marker, label);
    });

    this.applyDamageMeterHighlight();
    this.damageMeterObjects.forEach((object) => object.setVisible(this.isInBonusMode));
  }

  applyDamageMeterHighlight(activeIndex = 0) {
    this.damageMeterHighlightIndex = activeIndex;
    this.damageMeterEntries.forEach((entry, index) => {
      const isActive = index === activeIndex;
      const isNext = index === activeIndex + 1;
      entry.marker
        ?.setFillStyle(
          isActive ? entry.activeColor : (isNext ? 0x262c36 : 0x090d12),
          isActive ? 1 : (isNext ? 0.96 : 0.98)
        )
        .setStrokeStyle(
          isActive ? 3 : (isNext ? 2 : 1),
          isActive ? 0xffffff : (isNext ? entry.activeColor : 0x1a2028),
          isActive ? 1 : (isNext ? 0.88 : 0.42)
        )
        .setAlpha(isActive ? 1 : (isNext ? 0.9 : 0.28));
      entry.label
        ?.setAlpha(isActive ? 1 : (isNext ? 0.72 : 0.14))
        .setScale(isActive ? 1.08 : (isNext ? 1.02 : 0.96));
    });
  }

  async pulseDamageMeterHighlight(activeIndex = 0) {
    this.applyDamageMeterHighlight(activeIndex);
    const entry = this.damageMeterEntries[activeIndex];
    if (!entry) return;
    await Promise.all([entry.marker, entry.label].filter(Boolean).map((object) => this.tweenPromise({
      targets: object,
      scaleX: object.scaleX * 1.18,
      scaleY: object.scaleY * 1.18,
      duration: 180,
      yoyo: true,
      ease: "Back.easeOut",
    })));
  }

  layoutDamageMeter({ animate = false } = {}) {
    const tweens = this.damageMeterEntries.map((entry, index) => {
      const slot = this.damageMeterSlots[index];
      if (!slot) return Promise.resolve();
      if (!animate) {
        entry.marker?.setPosition(slot.x, slot.y);
        entry.label?.setPosition(slot.x, slot.y);
        return Promise.resolve();
      }
      return Promise.all([entry.marker, entry.label].filter(Boolean).map((object) => this.tweenPromise({
        targets: object,
        x: slot.x,
        y: slot.y,
        duration: 260,
        delay: index * 22,
        ease: "Cubic.easeOut",
      })));
    });
    this.applyDamageMeterHighlight();
    return Promise.all(tweens);
  }

  removeDamageMeterEntry(index) {
    const entry = this.damageMeterEntries[index];
    if (!entry) return;
    this.damageMeterEntries.splice(index, 1);
    [entry.marker, entry.label].filter(Boolean).forEach((object) => {
      this.damageMeterObjects = this.damageMeterObjects.filter((item) => item !== object);
      object.destroy();
    });
    this.refreshTrapPowerDisplay();
  }

  async popDamageMeterSegment(value) {
    const index = this.damageMeterEntries.findIndex((entry) => Number(entry.value) === Number(value));
    const entry = this.damageMeterEntries[index >= 0 ? index : 0];
    if (!entry) return;
    await Promise.all([entry.marker, entry.label].filter(Boolean).map((object) => this.tweenPromise({
      targets: object,
      scaleX: 1.8,
      scaleY: 1.8,
      alpha: 0,
      duration: 190,
      ease: "Quad.easeOut",
    })));
    this.removeDamageMeterEntry(index >= 0 ? index : 0);
    await this.layoutDamageMeter({ animate: true });
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
    if (this.totalWinTitleText?.visible) {
      this.layoutTotalWinTexts();
    }
  }

  getTotalWinTextLayout() {
    const centerX = GRID_OFFSET_X + GRID_WIDTH_PX / 2;
    const centerY = GRID_OFFSET_Y + GRID_HEIGHT_PX * 0.52;
    const bounds = this.layoutSnapshot?.mustSeeBounds || this.getLayoutContentBounds().mustSeeBounds;
    const rect = this.layoutSnapshot?.gameRect || { height: this.scale?.height || bounds.height };
    const zoom = Math.max(0.01, this.cameras?.main?.zoom || 1);
    const visibleWorldHeight = rect.height / zoom;
    const scaleFactor = Phaser.Math.Clamp(visibleWorldHeight / bounds.height, 0.72, 1.28);
    const titleFontSize = Math.round(Phaser.Math.Clamp(22 * scaleFactor, 15, 28));
    const amountFontSize = Math.round(Phaser.Math.Clamp(36 * scaleFactor, 22, 46));
    const rowGap = Math.round(Phaser.Math.Clamp(20 * scaleFactor, 12, 28));
    return {
      centerX,
      titleY: centerY - rowGap,
      amountY: centerY + rowGap * 0.45,
      titleFontSize: `${titleFontSize}px`,
      amountFontSize: `${amountFontSize}px`,
      amountScale: Phaser.Math.Clamp(1.05 * scaleFactor, 0.88, 1.28),
    };
  }

  layoutTotalWinTexts() {
    const layout = this.getTotalWinTextLayout();
    this.totalWinTitleText
      ?.setPosition(layout.centerX, layout.titleY)
      .setFontSize(layout.titleFontSize);
    this.countUpText
      ?.setPosition(layout.centerX, layout.amountY)
      .setFontSize(layout.amountFontSize)
      .setScale(layout.amountScale, layout.amountScale);
    return layout;
  }

  getGridCellCenter(reel, row) {
    return getCellCenter(reel, row);
  }

  createSymbol(symbol, reel, row, startY = null, textureKey = null) {
    const center = getCellCenter(reel, row);
    const texture = textureKey
      || (this.textures.exists(String(symbol)) ? String(symbol) : "1");
    const x = center.x;
    const y = startY ?? center.y;
    const valueText = formatCashSymbolValue(symbol);
    if (!valueText) {
      const sprite = this.add.image(x, y, texture)
        .setScale(SYMBOL_SCALE)
        .setDepth(DEPTH.symbols);
      if (this.reelMask) sprite.setMask(this.reelMask);
      Object.assign(sprite, { symbolId: Number(symbol), reel, row });
      return sprite;
    }

    const image = this.add.image(0, 0, texture);
    const label = this.add.text(0, 18, valueText, {
      fontFamily: "Arial Black, Arial",
      fontSize: "34px",
      color: "#fff6c8",
      stroke: "#1a1208",
      strokeThickness: 6,
    }).setOrigin(0.5);
    const sprite = this.add.container(x, y, [image, label])
      .setScale(SYMBOL_SCALE)
      .setDepth(DEPTH.symbols);
    sprite.setSize(image.width, image.height);
    if (this.reelMask) sprite.setMask(this.reelMask);
    sprite.setTint = (color) => {
      image.setTint(color);
      return sprite;
    };
    sprite.clearTint = () => {
      image.clearTint();
      return sprite;
    };
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

  async dropSymbols(reels, { getTextureKey = null } = {}) {
    const tweens = [];
    for (let reel = 0; reel < REELS; reel += 1) {
      for (let row = 0; row < ROWS; row += 1) {
        const symbol = getSymbol(reels, reel, row);
        if (symbol === null || Number(symbol) <= 0) continue;
        const target = getCellCenter(reel, row);
        const textureKey = getTextureKey?.(symbol, reel, row) ?? null;
        const sprite = this.createSymbol(
          symbol,
          reel,
          row,
          GRID_OFFSET_Y - CELL_SIZE * (ROWS - row + 1),
          textureKey
        );
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

  pickRandomLowSymbol() {
    return LOW_SYMBOLS[Phaser.Math.Between(0, LOW_SYMBOLS.length - 1)];
  }

  pickRandomAnimalSymbol() {
    return Phaser.Math.Between(1, 5);
  }

  pickVariedAnimalSymbols(count) {
    const pool = [1, 2, 3, 4, 5];
    Phaser.Utils.Array.Shuffle(pool);
    return Array.from({ length: count }, (_, index) => pool[index % pool.length]);
  }

  buildOuchFakeSpinReels() {
    const reels = Array.from({ length: REELS }, () => Array(ROWS).fill(null));

    for (let row = 0; row < ROWS; row += 1) {
      reels[OUCH_FAKE_SPIN_LOW_REEL][row] = this.pickRandomLowSymbol();
    }
    reels[OUCH_FAKE_SPIN_ANIMAL_REEL] = this.pickVariedAnimalSymbols(ROWS);

    let animalCount = ROWS;
    const tailSlots = [];
    for (let reel = OUCH_FAKE_SPIN_ANIMAL_REEL + 1; reel < REELS; reel += 1) {
      for (let row = 0; row < ROWS; row += 1) {
        reels[reel][row] = this.pickRandomLowSymbol();
        tailSlots.push({ reel, row });
      }
    }

    Phaser.Utils.Array.Shuffle(tailSlots);
    for (const slot of tailSlots) {
      if (animalCount >= OUCH_FAKE_SPIN_MIN_ANIMALS) break;
      reels[slot.reel][slot.row] = this.pickRandomAnimalSymbol();
      animalCount += 1;
    }

    return reels;
  }

  getOuchFakeSpinTexture(symbol, reel) {
    if (reel === OUCH_FAKE_SPIN_LOW_REEL || !ANIMAL_SYMBOLS.has(Number(symbol))) return null;
    const dollKey = `${symbol}_doll`;
    return this.textures.exists(dollKey) ? dollKey : null;
  }

  async presentOuchFakeSpin() {
    this.playSpinClickSound?.();
    await this.dropSymbols(this.buildOuchFakeSpinReels(), {
      getTextureKey: (symbol, reel) => this.getOuchFakeSpinTexture(symbol, reel),
    });
    await this.waitForPresentation(420, { skippable: true });
  }

  async spinBonusReels(reels) {
    const oldSprites = this.reelSprites.flat().filter(Boolean);
    this.reelSprites = Array.from({ length: REELS }, () => Array(ROWS).fill(null));
    const tweens = oldSprites.map((sprite, index) => this.tweenPromise({
      targets: sprite,
      y: GRID_OFFSET_Y + GRID_HEIGHT_PX + CELL_SIZE * 1.5,
      duration: 220,
      delay: (sprite.reel || 0) * 45 + index * 3,
      ease: "Cubic.easeIn",
      onComplete: () => sprite.destroy(),
    }));

    for (let reel = 0; reel < REELS; reel += 1) {
      const stopDelay = 170 + reel * 105;
      for (let filler = 0; filler < ROWS + 2; filler += 1) {
        const symbol = BONUS_SYMBOLS[Phaser.Math.Between(0, BONUS_SYMBOLS.length - 1)];
        const sprite = this.createSymbol(
          symbol,
          reel,
          0,
          GRID_OFFSET_Y - CELL_SIZE * (filler + 1)
        );
        tweens.push(this.tweenPromise({
          targets: sprite,
          y: GRID_OFFSET_Y + GRID_HEIGHT_PX + CELL_SIZE * (ROWS - filler + 1),
          duration: 500,
          delay: reel * 70 + filler * 24,
          ease: "Linear",
          onComplete: () => sprite.destroy(),
        }));
      }

      for (let row = 0; row < ROWS; row += 1) {
        const symbol = getSymbol(reels, reel, row);
        if (symbol === null || Number(symbol) <= 0) continue;
        const target = getCellCenter(reel, row);
        const sprite = this.createSymbol(
          symbol,
          reel,
          row,
          GRID_OFFSET_Y - CELL_SIZE * (ROWS - row + 1)
        );
        this.reelSprites[reel][row] = sprite;
        tweens.push(this.tweenPromise({
          targets: sprite,
          y: target.y,
          duration: 330,
          delay: stopDelay + row * 28,
          ease: "Back.easeOut",
          onStart: () => this.playSfx(`land${reel + 1}`, { volume: 0.3 }),
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
  }

  getLitAngerSegmentCount(count = 0, max = ANGER_SEGMENT_COUNT) {
    const safeMax = Math.max(1, Number(max) || ANGER_SEGMENT_COUNT);
    const safeCount = Math.max(0, Number(count) || 0);
    if (safeCount >= safeMax) return safeMax;
    return Math.min(safeCount, safeMax - 1);
  }

  getAngerSegmentTarget(segmentIndex = 0) {
    const segment = this.angerSegments?.[segmentIndex];
    if (segment) return { x: segment.x, y: segment.y };
    const fallback = this.angerSegments?.[this.angerSegments.length - 1];
    return fallback
      ? { x: fallback.x, y: fallback.y }
      : {
        x: GRID_OFFSET_X + GRID_WIDTH_PX - 84,
        y: GRID_OFFSET_Y + GRID_HEIGHT_PX + 88,
      };
  }

  getNextAngerDisplayCount() {
    const current = Number(this.angerMeterState?.count) || 0;
    const cap = ANGER_SEGMENT_COUNT - 1;
    return Math.min(current + 1, cap);
  }

  spawnAngerImpactSpark(x, y, { weak = false } = {}) {
    const sparks = Array.from({ length: weak ? 3 : 6 }, (_, index) => {
      const spark = this.add.circle(
        x,
        y,
        Phaser.Math.Between(weak ? 2 : 3, weak ? 4 : 5),
        weak ? 0xffa56a : 0xff8a3d,
        weak ? 0.55 : 0.95
      )
        .setDepth(DEPTH.angerVfx)
        .setBlendMode(Phaser.BlendModes.ADD);
      const angle = Phaser.Math.DegToRad(-150 + index * (weak ? 36 : 28));
      return this.tweenPromise({
        targets: spark,
        x: x + Math.cos(angle) * Phaser.Math.Between(weak ? 6 : 10, weak ? 14 : 22),
        y: y + Math.sin(angle) * Phaser.Math.Between(weak ? 5 : 8, weak ? 12 : 18),
        alpha: 0,
        scale: Phaser.Math.FloatBetween(weak ? 1.1 : 1.4, weak ? 1.6 : 2),
        duration: Phaser.Math.Between(weak ? 140 : 180, weak ? 200 : 260),
        ease: "Quad.easeOut",
        onComplete: () => spark.destroy(),
      });
    });
    return Promise.all(sparks);
  }

  launchAngerMeterOrb(fromX, fromY, target, delay = 0) {
    const colors = [0xff5a1f, 0xff8f3f, 0xff2d00];
    const orb = this.add.circle(fromX, fromY, Phaser.Math.Between(4, 7), colors[0], 0.92)
      .setDepth(DEPTH.angerVfx)
      .setBlendMode(Phaser.BlendModes.ADD);
    const stopTrail = this.attachMotionTrail(orb, {
      color: colors[1],
      radius: Phaser.Math.Between(3, 5),
      depth: DEPTH.angerVfx,
      intervalMs: 14,
      fadeMs: 200,
    });
    const curve = new Phaser.Curves.QuadraticBezier(
      new Phaser.Math.Vector2(fromX, fromY),
      new Phaser.Math.Vector2(
        (fromX + target.x) * 0.5 + Phaser.Math.Between(-18, 18),
        fromY + (target.y - fromY) * 0.42 - Phaser.Math.Between(24, 64)
      ),
      new Phaser.Math.Vector2(target.x, target.y)
    );
    const point = new Phaser.Math.Vector2();
    const travel = { t: 0 };

    return this.tweenPromise({
      targets: travel,
      t: 1,
      delay,
      duration: Phaser.Math.Between(360, 460),
      ease: "Cubic.easeInOut",
      onUpdate: () => {
        curve.getPoint(travel.t, point);
        orb.setPosition(point.x, point.y).setScale(0.8 + travel.t * 0.7);
        orb.setFillStyle(colors[travel.t > 0.65 ? 2 : 1], 0.95 - travel.t * 0.2);
      },
      onComplete: () => {
        stopTrail();
        orb.destroy();
      },
    });
  }

  async launchAngerMeterStream(fromX, fromY, targetSegmentIndex = 0, { weak = false, orbStagger = 38 } = {}) {
    const target = this.getAngerSegmentTarget(targetSegmentIndex);
    const streamCount = weak ? 3 : 4;
    await Promise.all(Array.from({ length: streamCount }, (_, index) => (
      this.launchAngerMeterOrb(fromX, fromY, target, index * orbStagger)
    )));
    await this.spawnAngerImpactSpark(target.x, target.y, { weak });
  }

  async launchAngerMeterForKill(fromX, fromY, killEvent = {}) {
    const current = Number(this.angerMeterState?.count) || 0;
    const targetSegmentIndex = killEvent?.ticked
      ? current
      : Math.min(current, ANGER_SEGMENT_COUNT - 2);
    await this.launchAngerMeterStream(fromX, fromY, targetSegmentIndex, { weak: !killEvent?.ticked });
  }

  async stompKillCell(cell = {}, killEvent = null) {
    const reel = Number(cell.reel);
    const row = Number(cell.row);
    const sprite = this.reelSprites[reel]?.[row];
    if (!sprite) return killEvent;
    const isAnimal = cell.isAnimal === true;
    const { x, y } = sprite;
    const groundY = this.getStompGroundY(y);

    if (isAnimal) {
      this.playAnimalCrushSfx();
      this.spawnBloodBurst(x, y, groundY);
      this.spawnGibs(x, y, groundY);
      this.spawnCoinDrop(x, y, groundY, cell);
    }

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
    const angerPromise = isAnimal && killEvent
      ? this.launchAngerMeterForKill(x, y, killEvent)
      : Promise.resolve();

    await Promise.all([crushTween, angerPromise]);
    return killEvent;
  }

  async presentParallelStompKills(crushedCells = [], animalKillEvents = []) {
    await Promise.all(crushedCells.map((cell) => {
      const killEvent = cell.isAnimal
        ? this.getAnimalKillEvent(animalKillEvents, cell)
        : null;
      return this.stompKillCell(cell, killEvent);
    }));

    const tickedEvents = crushedCells
      .filter((cell) => cell.isAnimal)
      .map((cell) => this.getAnimalKillEvent(animalKillEvents, cell))
      .filter((killEvent) => killEvent.ticked);

    for (const killEvent of tickedEvents) {
      await this.updateAngerMeter({
        count: this.getNextAngerDisplayCount(),
        max: ANGER_SEGMENT_COUNT,
      });
      await this.waitForPresentation(70, { skippable: true });
    }
  }

  async presentAnimalKillAngerOvercharge() {
    const start = Number(this.angerMeterState?.count) || 0;
    if (start >= ANGER_SEGMENT_COUNT) return;

    const stepCount = ANGER_SEGMENT_COUNT - start;
    await this.waitForPresentation(180, { skippable: true });

    for (let step = 0; step < stepCount; step += 1) {
      const count = start + step + 1;
      const isFinal = count === ANGER_SEGMENT_COUNT;
      const target = this.getAngerSegmentTarget(count - 1);
      const ramp = (step + 1) / stepCount;
      const burst = ramp > 0.45;

      await this.spawnAngerImpactSpark(target.x, target.y, { weak: !burst });
      if (burst) {
        this.cameras.main.shake(90 + ramp * 140, 0.004 + ramp * 0.007);
      }

      await this.updateAngerMeter({
        count,
        max: ANGER_SEGMENT_COUNT,
        explode: isFinal,
      });

      if (isFinal) {
        await this.waitForPresentation(420, { skippable: true });
        continue;
      }

      const progress = step / Math.max(1, stepCount - 2);
      const eased = progress * progress * progress;
      const waitMs = Phaser.Math.Linear(280, 32, eased);
      await this.waitForPresentation(waitMs, { skippable: true });
    }
  }

  async presentAnimalKillAngerFeedback(fromX, fromY, killEvent = {}) {
    await this.launchAngerMeterForKill(fromX, fromY, killEvent);
    if (!killEvent?.ticked) return;
    await this.updateAngerMeter({
      count: this.getNextAngerDisplayCount(),
      max: ANGER_SEGMENT_COUNT,
    });
  }

  getAnimalKillEvent(killEvents = [], cell = {}) {
    return (Array.isArray(killEvents) ? killEvents : []).find(
      (event) => Number(event.reel) === Number(cell.reel) && Number(event.row) === Number(cell.row)
    ) || { ticked: false, displayAfter: Number(this.angerMeterState?.count) || 0 };
  }

  stopAngerBlink() {
    if (this.angerBlinkTween) {
      this.angerBlinkTween.stop();
      this.angerBlinkTween.remove();
      this.angerBlinkTween = null;
    }
    this.angerSegments?.forEach((segment) => segment.setAlpha(1));
  }

  syncAngerBlink(count = 0, max = ANGER_SEGMENT_COUNT) {
    this.stopAngerBlink();
    const litCount = this.getLitAngerSegmentCount(count, max);
    if (litCount <= 0 || !this.tweens) return;

    const intensity = litCount / Math.max(1, max);
    const blinkTargets = this.angerSegments.slice(0, litCount);
    const minAlpha = Phaser.Math.Clamp(0.72 - intensity * 0.12, 0.52, 0.72);
    this.angerBlinkTween = this.tweens.add({
      targets: blinkTargets,
      alpha: { from: 1, to: minAlpha },
      duration: Phaser.Math.Clamp(560 - litCount * 34, 180, 560),
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
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

  getOuchStompBounds() {
    const bounds = this.getStompReelBounds([Math.floor((REELS - 1) / 2)]);
    if (!bounds) return null;
    return {
      ...bounds,
      centerX: bounds.centerX + OUCH_STOMP_OFFSET_X,
    };
  }

  async presentStompTease(teaseMs = 500) {
    this.cameras.main.shake(180, 0.006);
    await this.waitForPresentation(teaseMs, { skippable: true });
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

  async collectStompCoinsToWin(targetWin = null) {
    await this.waitForStompCoinSettling();

    const coins = [...(this.stompCoinsRegistry || [])].filter((coin) => coin?.active);
    this.stompCoinsRegistry?.clear();
    this.stompLandedCoins = [];
    if (!coins.length || !this.countUpText) return;

    const now = performance.now();
    const settleHoldMs = 180;
    const restMs = Math.max(
      0,
      ...coins.map((coin) => settleHoldMs - (now - (coin.getData("landedAt") || now)))
    );
    await this.waitForPresentation(restMs, { skippable: true });

    const targetX = this.countUpText.x;
    const targetY = this.countUpText.y;
    const resolvedTarget = targetWin === null ? null : Number(targetWin) || 0;
    const coinValues = coins.map((coin) => Number(coin.getData("coinValue")) || 0);
    const coinTotal = coinValues.reduce((sum, value) => sum + value, 0);
    let collectedValue = this.currentWin;
    if (resolvedTarget !== null && coinTotal > 0) {
      const scale = (resolvedTarget - collectedValue) / coinTotal;
      coinValues.forEach((value, index) => {
        coins[index].setData("coinValue", Number((value * scale).toFixed(8)));
      });
    }

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
        duration: 260,
        delay: index * 22,
        ease: "Cubic.easeIn",
        onComplete: () => {
          this.playSfx("wins_payout", { volume: 0.55 });
          if (coinValue > 0) {
            collectedValue = Number((collectedValue + coinValue).toFixed(2));
            this.syncCountUpDisplay(collectedValue);
          }
          coin.destroy();
          resolve();
        },
      });
    })));

    if (resolvedTarget !== null) {
      collectedValue = resolvedTarget;
    }
    this.currentWin = collectedValue;

    if (collectedValue > 0) {
      await this.tweenPromise({
        targets: this.countUpText,
        scaleX: 1.14,
        scaleY: 1.14,
        duration: 90,
        yoyo: true,
        ease: "Back.easeOut",
      });
    }
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

  spawnOuchDebrisBurst(x, y, width = CELL_SIZE) {
    const debrisColors = [0x3d6b2e, 0x4f7a34, 0x6b4a2e, 0x8a6239, 0x5d4020, 0x2f4f23, 0x7a5230, 0x96b84d, 0x654321];
    const effects = [];
    const spreadX = width * 1.18;
    const spreadY = width * 0.5;
    const shardCount = 92;

    for (let index = 0; index < shardCount; index += 1) {
      const useLeaf = index % 3 === 0;
      const color = Phaser.Math.RND.pick(debrisColors);
      const shard = useLeaf
        ? this.add.ellipse(
          x + Phaser.Math.Between(-spreadX, spreadX),
          y + Phaser.Math.Between(-spreadY * 0.35, spreadY * 0.55),
          Phaser.Math.Between(12, 34),
          Phaser.Math.Between(6, 18),
          color,
          Phaser.Math.FloatBetween(0.78, 0.98)
        ).setDepth(DEPTH.stompVfx).setAngle(Phaser.Math.Between(-80, 80))
        : this.add.circle(
          x + Phaser.Math.Between(-spreadX, spreadX),
          y + Phaser.Math.Between(-spreadY * 0.35, spreadY * 0.55),
          Phaser.Math.Between(5, 18),
          color,
          Phaser.Math.FloatBetween(0.82, 0.98)
        ).setDepth(DEPTH.stompVfx);
      const angle = Phaser.Math.FloatBetween(-Math.PI, Math.PI);
      const distance = Phaser.Math.Between(width * 0.18, width * 1.3);
      effects.push(this.tweenPromise({
        targets: shard,
        x: shard.x + Math.cos(angle) * distance,
        y: shard.y + Math.sin(angle) * distance + Phaser.Math.Between(28, 164),
        alpha: 0,
        angle: shard.angle + Phaser.Math.Between(-220, 220),
        scaleX: shard.scaleX * Phaser.Math.FloatBetween(0.35, 3.1),
        scaleY: shard.scaleY * Phaser.Math.FloatBetween(0.35, 3.1),
        duration: Phaser.Math.Between(260, 760),
        ease: "Quad.easeOut",
        onComplete: () => shard.destroy(),
      }));
    }

    for (let puff = 0; puff < 16; puff += 1) {
      const dust = this.add.circle(
        x + Phaser.Math.Between(-spreadX * 0.8, spreadX * 0.8),
        y + Phaser.Math.Between(-16, 24),
        Phaser.Math.Between(28, 74),
        Phaser.Math.RND.pick([0x5d4020, 0x6b4a2e, 0x3d6b2e]),
        Phaser.Math.FloatBetween(0.2, 0.38)
      ).setDepth(DEPTH.stompVfx - 1);
      effects.push(this.tweenPromise({
        targets: dust,
        scaleX: Phaser.Math.FloatBetween(2.4, 4.6),
        scaleY: Phaser.Math.FloatBetween(1.8, 3.5),
        alpha: 0,
        x: dust.x + Phaser.Math.Between(-40, 40),
        y: dust.y - Phaser.Math.Between(10, 42),
        duration: Phaser.Math.Between(340, 620),
        ease: "Quad.easeOut",
        onComplete: () => dust.destroy(),
      }));
    }

    return Promise.all(effects);
  }

  spawnOuchImpactCloud(x, y, width = CELL_SIZE) {
    const dustColors = [0x4f3721, 0x6b4a2e, 0x8a6239, 0x3d6b2e, 0x7b6a4f];
    const effects = [];
    const coverWidth = Math.max(width * 1.15, GRID_WIDTH_PX * 0.92);

    for (let index = 0; index < 14; index += 1) {
      const cloud = this.add.ellipse(
        x + Phaser.Math.Between(-coverWidth * 0.42, coverWidth * 0.42),
        y + Phaser.Math.Between(-28, 36),
        Phaser.Math.Between(88, 180),
        Phaser.Math.Between(54, 120),
        Phaser.Math.RND.pick(dustColors),
        Phaser.Math.FloatBetween(0.24, 0.42)
      ).setDepth(DEPTH.stompVfx + 1);
      effects.push(this.tweenPromise({
        targets: cloud,
        x: cloud.x + Phaser.Math.Between(-64, 64),
        y: cloud.y - Phaser.Math.Between(8, 44),
        scaleX: Phaser.Math.FloatBetween(2.1, 3.9),
        scaleY: Phaser.Math.FloatBetween(1.6, 2.8),
        alpha: 0,
        duration: Phaser.Math.Between(440, 780),
        ease: "Quad.easeOut",
        onComplete: () => cloud.destroy(),
      }));
    }

    for (let index = 0; index < 4; index += 1) {
      const blanket = this.add.ellipse(
        x + (index - 1.5) * coverWidth * 0.2,
        y + Phaser.Math.Between(-10, 26),
        coverWidth * Phaser.Math.FloatBetween(0.5, 0.72),
        Phaser.Math.Between(120, 190),
        Phaser.Math.RND.pick(dustColors),
        Phaser.Math.FloatBetween(0.2, 0.3)
      ).setDepth(DEPTH.stompVfx + 2);
      effects.push(this.tweenPromise({
        targets: blanket,
        y: blanket.y - Phaser.Math.Between(12, 38),
        scaleX: Phaser.Math.FloatBetween(1.25, 1.8),
        scaleY: Phaser.Math.FloatBetween(1.05, 1.35),
        alpha: 0,
        duration: Phaser.Math.Between(520, 900),
        ease: "Sine.easeOut",
        onComplete: () => blanket.destroy(),
      }));
    }

    return Promise.all(effects);
  }

  getOuchScrollTargets() {
    const sprites = this.reelSprites.flat().filter(Boolean);
    return [
      this.ouchBackground,
      this.reelFrame,
      this.reelMaskShape,
      ...sprites,
    ].filter(Boolean);
  }

  async scrollOuchPit(deltaY = OUCH_PIT_STEP_DELTA_Y) {
    const shift = Number(deltaY) || OUCH_PIT_STEP_DELTA_Y;
    this.ouchScrollY += shift;
    const targets = this.getOuchScrollTargets();
    await Promise.all(targets.map((target) => this.tweenPromise({
      targets: target,
      y: target.y - shift,
      duration: 240,
      ease: "Cubic.easeInOut",
    })));
    this.cameras.main.shake(140, 0.0065);
  }

  resetOuchPitScroll() {
    if (!this.ouchScrollY) return;
    const shift = this.ouchScrollY;
    this.getOuchScrollTargets().forEach((target) => {
      target.y += shift;
    });
    this.ouchScrollY = 0;
  }

  async spawnOuchWinCoins(centerX, centerY, count = 1, totalWin = 0) {
    const coinCount = Math.max(1, Number(count) || 1);
    const winTotal = Number(totalWin) || 0;
    const coinValues = distributeMoneyAmount(winTotal, coinCount);
    this.ensureCoinAnimation();
    if (!this.anims.exists("yellow_coin_spin")) return;

    const groundY = this.getStompGroundY(centerY);
    const launches = [];
    for (let index = 0; index < coinCount; index += 1) {
      const coin = this.add.sprite(
        centerX + Phaser.Math.Between(-36, 36),
        centerY + Phaser.Math.Between(-24, 12),
        "yellow_coin",
        this.getCoinFrameName()
      )
        .setScale(Phaser.Math.FloatBetween(STOMP_COIN_SCALE_MIN, STOMP_COIN_SCALE_MAX))
        .setDepth(DEPTH.stompVfx);
      coin.setData("stompCoin", true);
      coin.setData("coinType", 20);
      coin.setData("coinValue", coinValues[index] || 0);
      this.stompCoinsRegistry?.add(coin);
      coin.anims.play("yellow_coin_spin");
      launches.push(this.trackStompCoinLaunch(this.launchArcProjectile({
        sprite: coin,
        startX: coin.x,
        startY: coin.y,
        groundY: groundY + Phaser.Math.Between(-2, 8),
        horizontalSpread: Phaser.Math.Between(80, 150),
        launchHeight: Phaser.Math.Between(120, 180),
        riseDuration: Phaser.Math.Between(140, 190),
        fallDuration: Phaser.Math.Between(280, 380),
        trailColor: 0xffd24a,
        trailRadius: Phaser.Math.Between(3, 6),
        spinSpeed: Phaser.Math.Between(300, 560),
        settleMode: "rest",
        onSettle: (landedCoin) => this.registerStompCoin(landedCoin),
      })));
    }
    await Promise.allSettled(launches);
  }

  async presentOuchDamageMeterCharge(stepNumber = 1, leadInMs = 0) {
    const activeEntry = this.damageMeterEntries[0];
    if (!activeEntry) {
      if (leadInMs > 0) {
        await this.waitForPresentation(leadInMs, { skippable: true });
      }
      return;
    }

    const chargeMs = Math.max(
      stepNumber > 1 ? 760 : 420,
      Math.min(Math.max(0, Number(leadInMs) || 0), 1500)
    );
    const pulses = stepNumber > 1 ? [170, 130, 96, 72] : [150, 112, 84];
    const pulseBudget = pulses.reduce((sum, value) => sum + value, 0);
    const introWait = Math.max(0, chargeMs - pulseBudget);
    if (introWait > 0) {
      await this.waitForPresentation(introWait, { skippable: true });
    }

    const accentTargets = [activeEntry.marker, activeEntry.label].filter(Boolean);
    for (let index = 0; index < pulses.length; index += 1) {
      const pulseMs = pulses[index];
      await Promise.all([
        ...accentTargets.map((target) => this.tweenPromise({
          targets: target,
          alpha: 0.32,
          scaleX: target.scaleX * (1.06 + index * 0.03),
          scaleY: target.scaleY * (1.06 + index * 0.03),
          duration: Math.max(48, Math.round(pulseMs / 2)),
          yoyo: true,
          ease: "Sine.easeInOut",
          onComplete: () => {
            target.setAlpha(1);
          },
        })),
        this.tweenPromise({
          targets: this.countUpText,
          alpha: 0.72,
          duration: Math.max(42, Math.round(pulseMs / 2)),
          yoyo: true,
          ease: "Sine.easeInOut",
          onComplete: () => this.countUpText?.setAlpha(1),
        }),
      ]);
      const isFinalPulse = index === pulses.length - 1;
      if (isFinalPulse && stepNumber > 1) {
        this.cameras.main.shake(70, 0.0018);
      } else if (isFinalPulse) {
        this.cameras.main.shake(45, 0.0012);
      }
      this.applyDamageMeterHighlight(0);
    }
  }

  async spawnCelebrationCoinBurst(centerX, centerY, count = 12) {
    const coinCount = Math.max(1, Number(count) || 1);
    this.ensureCoinAnimation();
    if (!this.anims.exists("yellow_coin_spin")) return;

    const launches = [];
    for (let index = 0; index < coinCount; index += 1) {
      const coin = this.add.sprite(
        centerX + Phaser.Math.Between(-16, 16),
        centerY + Phaser.Math.Between(-14, 14),
        "yellow_coin",
        this.getCoinFrameName()
      )
        .setScale(Phaser.Math.FloatBetween(STOMP_COIN_SCALE_MIN, STOMP_COIN_SCALE_MAX) * 1.1)
        .setDepth(DEPTH.stompVfx + 2);
      coin.anims.play("yellow_coin_spin");
      launches.push(this.launchArcProjectile({
        sprite: coin,
        startX: coin.x,
        startY: coin.y,
        groundY: centerY + Phaser.Math.Between(90, 150),
        horizontalSpread: Phaser.Math.Between(120, 220),
        launchHeight: Phaser.Math.Between(120, 220),
        riseDuration: Phaser.Math.Between(140, 200),
        fallDuration: Phaser.Math.Between(260, 420),
        trailColor: 0xffd24a,
        trailRadius: Phaser.Math.Between(3, 5),
        spinSpeed: Phaser.Math.Between(360, 620),
        settleMode: "fade",
      }));
    }

    await Promise.allSettled(launches);
  }

  async presentOuchStompImpact(bounds) {
    if (!bounds) return null;

    this.playOuchLaughSfx();
    await this.waitForPresentation(420, { skippable: true });
    await this.presentStompTease(320);
    await this.waitForPresentation(180, { skippable: true });

    const footWidth = bounds.width + CELL_SIZE * 0.95;
    const footScale = footWidth / 420;
    const startY = GRID_OFFSET_Y - CELL_SIZE * 4.1;
    const impactY = bounds.centerY + CELL_SIZE * 0.08;
    const slamY = impactY + CELL_SIZE * 0.1;
    const foot = this.add.image(bounds.centerX, startY, "giantfoot")
      .setDepth(DEPTH.stomp)
      .setScale(footScale * 0.78, footScale * 0.9)
      .setAlpha(0.98);

    await this.tweenPromise({
      targets: foot,
      y: slamY,
      scaleX: footScale * 1.02,
      scaleY: footScale * 1.03,
      duration: 190,
      ease: "Quad.easeIn",
    });

    await this.tweenPromise({
      targets: foot,
      y: impactY,
      scaleX: footScale * 1.04,
      scaleY: footScale * 0.97,
      duration: 70,
      ease: "Quad.easeOut",
    });

    this.cameras.main.shake(320, 0.018);
    this.playOuchStompSfx();
    this.startOuchTheme();
    this.spawnOuchDebrisBurst(bounds.centerX, impactY + CELL_SIZE * 0.12, footWidth * 1.08);
    this.spawnOuchImpactCloud(bounds.centerX, impactY + CELL_SIZE * 0.1, footWidth * 1.12);
    this.ouchFoot = foot;
    return { foot, impactY, footWidth, footScale, bounds };
  }

  spawnOuchPainEffects(centerX, centerY, intensity = 1) {
    const spread = Math.round(18 * Math.min(intensity, 1.5));
    this.playGiantPainSfx();
    this.playAnimalCrushSfx();
    const bloodCount = Math.round(10 + intensity * 3);
    const gibCount = Math.round(3 + intensity * 1.5);
    this.spawnBloodBurst(
      centerX + Phaser.Math.Between(-spread * 0.35, spread * 0.35),
      centerY + Phaser.Math.Between(-10, 12),
      undefined,
      bloodCount
    );
    if (intensity > 1.25) {
      this.spawnBloodBurst(
        centerX + Phaser.Math.Between(-spread, spread),
        centerY + Phaser.Math.Between(-8, 14),
        undefined,
        Math.round(6 + intensity * 2)
      );
    }
    this.spawnGibs(centerX, centerY, undefined, gibCount);
    this.cameras.main.shake(130, Math.min(0.012, 0.004 + intensity * 0.002));
  }

  async presentOuchTotalWinSequence(totalWin = 0) {
    const grandTotal = Math.max(0, Number(totalWin) || 0);
    const fadeTargets = [
      this.ouchBackground,
      this.reelFrame,
      this.ouchFoot,
      ...this.reelSprites.flat().filter(Boolean),
    ].filter(Boolean);

    this.setOuchUiVisible(false);
    this.startOuchTheme();
    await Promise.all([
      this.tweenPromise({ targets: fadeTargets, alpha: 0, duration: 340, ease: "Quad.easeInOut" }),
      this.tweenPromise({ targets: this.totalWinBackground, alpha: 1, duration: 420, ease: "Quad.easeInOut" }),
    ]);
    this.ouchFoot?.destroy();
    this.ouchFoot = null;

    this.currentWin = 0;
    this.countUpLabel = "TOTAL WIN";
    this.totalWinTitleText?.setVisible(true).setAlpha(1);
    const layout = this.layoutTotalWinTexts();
    this.countUpText
      ?.setAlpha(1)
      .setVisible(true);
    this.syncCountUpDisplay(0);

    const popScale = layout.amountScale * 1.08;
    await this.tweenPromise({
      targets: this.countUpText,
      scaleX: popScale,
      scaleY: popScale,
      duration: 180,
      yoyo: true,
      ease: "Back.easeOut",
    });
    this.playOuchCelebrationSfx();
    await this.updateCountUp(grandTotal, {
      duration: Phaser.Math.Clamp(900 + grandTotal * 80, 900, 1700),
    });
    await this.spawnCelebrationCoinBurst(
      layout.centerX,
      layout.amountY - 14,
      Phaser.Math.Clamp(Math.round(10 + grandTotal * 2), 10, 20)
    );
    await this.waitForPresentation(320, { skippable: true });
  }

  async presentOuchStompStep(step = {}, ouchEvent = {}, impact = {}) {
    const stepNumber = Number(step.step) || 1;
    const stepIntervalMs = Number(ouchEvent.stepIntervalMs) || 3000;
    const coinCount = Number(ouchEvent.coinCountPerStep) || 1;
    const winAmount = Number(step.winAmount) || 0;
    const centerX = impact?.bounds?.centerX || (GRID_OFFSET_X + GRID_WIDTH_PX / 2);
    const centerY = (impact?.impactY || GRID_OFFSET_Y + GRID_HEIGHT_PX * 0.55) + CELL_SIZE * 0.1;

    if (stepNumber > 1) {
      await this.presentOuchDamageMeterCharge(stepNumber, stepIntervalMs);
      this.removeDamageMeterEntry(0);
      this.playSfx("wins_explode", { volume: 0.48 });
      await this.layoutDamageMeter({ animate: true });
      await this.pulseDamageMeterHighlight(0);
    } else {
      await this.presentOuchDamageMeterCharge(stepNumber, 420);
      await this.pulseDamageMeterHighlight(0);
    }

    this.spawnOuchPainEffects(centerX, centerY, 1 + (stepNumber - 1) * 0.35);
    await this.scrollOuchPit();
    const coinLaunch = this.spawnOuchWinCoins(centerX, centerY, coinCount, winAmount);
    await this.collectStompCoinsToWin(winAmount);
    await coinLaunch;
  }

  async presentOuchStompSequence(ouchEvent = {}, gameState = {}) {
    if (!ouchEvent?.triggered || !Array.isArray(ouchEvent.steps) || !ouchEvent.steps.length) {
      await this.presentStompVisual(this.getOuchStompBounds());
      return;
    }

    const damageWheel = ouchEvent.damageWheelBefore || gameState.damageWheel || {};
    this.updateDamageMeter({
      segments: damageWheel.segments || damageWheel.remainingSegments || DEFAULT_DAMAGE_METER_SEGMENTS,
      remainingSegments: damageWheel.remainingSegments || damageWheel.segments || DEFAULT_DAMAGE_METER_SEGMENTS,
      removedSegments: damageWheel.removedSegments || [],
    });
    this.updateTrapPowerMeter(ouchEvent.trapPower || gameState.trapMeter?.power || 0);
    this.setOuchUiVisible(true);
    this.currentWin = 0;
    this.syncCountUpDisplay(0);
    this.countUpText?.setVisible(true);

    const bounds = this.getOuchStompBounds();
    const impact = await this.presentOuchStompImpact(bounds);
    if (!impact) return;

    for (const step of ouchEvent.steps) {
      await this.presentOuchStompStep(step, ouchEvent, impact);
    }

    await this.waitForPresentation(220, { skippable: true });
    await this.presentOuchTotalWinSequence(gameState.twa || ouchEvent.finalWinAmount || this.currentWin);
  }

  spawnBloodBurst(x, y, groundY, particleCount = 22) {
    const effects = [];
    const resolvedGroundY = groundY ?? this.getStompGroundY(y);
    const burstCount = Math.max(4, Number(particleCount) || 22);
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
          y: resolvedGroundY + Phaser.Math.Between(-4, 10),
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

  spawnGibs(x, y, groundY, gibCount = 10) {
    const effects = [];
    const resolvedGroundY = groundY ?? this.getStompGroundY(y);
    const count = Math.max(2, Number(gibCount) || 10);
    for (let index = 0; index < count; index += 1) {
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
          y: resolvedGroundY + Phaser.Math.Between(0, 14),
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
      .setScale(Phaser.Math.FloatBetween(STOMP_COIN_SCALE_MIN, STOMP_COIN_SCALE_MAX))
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
      this.playAnimalCrushSfx();
      this.spawnBloodBurst(x, y, groundY);
      this.spawnGibs(x, y, groundY);
      this.spawnCoinDrop(x, y, groundY, cell);
    }

    return crushTween;
  }

  async presentStompVisual(bounds, {
    crushedCells = [],
    animalKillEvents = [],
    bonusTriggered = false,
    teaseMs = 500,
    pauseMs = 450,
  } = {}) {
    if (!bounds) return;

    await this.presentStompTease(teaseMs);
    await this.waitForPresentation(pauseMs, { skippable: true });

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

    this.cameras.main.shake(200, 0.009);
    this.playSfx("giant_stomp", { volume: 0.78 });
    this.spawnStompImpactBurst(bounds.centerX, impactY + CELL_SIZE * 0.16, bounds.width);
    this.time.delayedCall(320, () => this.playGiantLaughSfx());
    if (crushedCells.length) {
      await this.presentParallelStompKills(crushedCells, animalKillEvents);
      if (bonusTriggered) {
        await this.presentAnimalKillAngerOvercharge();
      }
    }

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

  async presentStompFeature(stompEvent = {}) {
    if (!stompEvent?.triggered) return;
    const crushedCells = Array.isArray(stompEvent.crushedCells) ? stompEvent.crushedCells : [];
    const bounds = this.getStompReelBounds(stompEvent.reels || []);
    if (!bounds || !crushedCells.length) return;

    await this.presentStompVisual(bounds, {
      crushedCells,
      animalKillEvents: stompEvent.animalKillEvents,
      bonusTriggered: stompEvent.bonusTriggered,
      teaseMs: Number(stompEvent.teaseMs) || 500,
      pauseMs: Number(stompEvent.pauseMs) || 450,
    });
  }

  layoutBackgroundImage(image, scaleMultiplier = 1) {
    const source = image?.texture?.getSourceImage?.();
    if (!source?.width || !source?.height) return;
    const baseScale = Math.max(
      (GRID_WIDTH_PX + 260) / source.width,
      (GRID_HEIGHT_PX + 340) / source.height
    );
    image.setScale(baseScale * scaleMultiplier);
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

  async crushGrabbedSymbol(sprite, handX, handY, cell = {}, killEvent = null) {
    if (!sprite?.active) return;
    const reel = Number(sprite.reel);
    const row = Number(sprite.row);
    const effectX = handX;
    const effectY = handY - CELL_SIZE * 0.05;
    const groundY = this.getStompGroundY(handY);

    this.playAnimalCrushSfx();
    this.spawnBloodBurst(effectX, effectY, groundY);
    this.spawnGibs(effectX, effectY, groundY);
    this.spawnCoinDrop(effectX, effectY, groundY, cell);

    const crushTween = this.tweenPromise({
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
    const angerPromise = killEvent
      ? this.launchAngerMeterForKill(effectX, effectY, killEvent)
      : Promise.resolve();

    await Promise.all([crushTween, angerPromise]);
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

  async presentSingleCrushGrab(cell, { enterX, handScale, isFirstGrab = false, killEvent = null }) {
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
    if (isFirstGrab) this.playGiantLaughSfx();
    await this.crushGrabbedSymbol(sprite, target.x, target.y, cell, killEvent);
    if (killEvent?.ticked) {
      await this.updateAngerMeter({
        count: this.getNextAngerDisplayCount(),
        max: ANGER_SEGMENT_COUNT,
      });
      await this.waitForPresentation(70, { skippable: true });
    }

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
      const cell = crushedCells[index];
      const killEvent = cell.isAnimal !== false
        ? this.getAnimalKillEvent(crushEvent.animalKillEvents, cell)
        : null;
      await this.presentSingleCrushGrab(cell, {
        enterX,
        handScale,
        isFirstGrab: index === 0,
        killEvent,
      });
      if (index < crushedCells.length - 1) {
        await this.waitForPresentation(180, { skippable: true });
      }
    }

    if (crushEvent.bonusTriggered) {
      await this.presentAnimalKillAngerOvercharge();
    }

    await this.hideCrushGiantBackground(360);
  }

  setBonusUiVisible(visible) {
    this.bonusUi?.forEach((item) => item?.setVisible(visible));
    this.damageMeterObjects?.forEach((item) => item?.setVisible(visible));
    this.freespinText?.setVisible(false);
    this.setAngerUiVisible(!visible && !this.isInBonusMode && !this.isPostBonusOuch);
  }

  setAngerUiVisible(visible) {
    this.angerLabel?.setVisible(visible);
    this.angerSegments?.forEach((segment) => segment.setVisible(visible));
  }

  setOuchUiVisible(visible) {
    this.setBonusUiVisible(false);
    this.setAngerUiVisible(false);
    this.damageMeterObjects?.forEach((item) => item?.setVisible(visible));
    this.trapPowerText?.setVisible(visible);
    this.trapPowerMultiplierText?.setVisible(visible && Boolean(this.trapPowerMultiplierText?.text));
    this.countUpText?.setVisible(visible);
  }

  async updateLifeMeter(lives = 0, maxLives = 3) {
    const safeMax = Math.max(1, Number(maxLives) || 3);
    const safeLives = Phaser.Math.Clamp(Number(lives) || 0, 0, safeMax);
    const pops = [];
    this.lifeSegments?.forEach((segment, index) => {
      const active = index < safeLives;
      const changed = segment.lifeActive !== active;
      segment.lifeActive = active;
      if (active) {
        segment.clearTint();
        segment.setAlpha(1);
      } else {
        segment.setTint(0x27303f);
        segment.setAlpha(0.4);
      }
      if (!changed) return;
      pops.push(this.tweenPromise({
        targets: segment,
        scaleX: LIFE_SEGMENT_SCALE * (active ? 1.28 : 0.86),
        scaleY: LIFE_SEGMENT_SCALE * (active ? 1.28 : 0.86),
        duration: active ? 150 : 120,
        yoyo: true,
        ease: active ? "Back.easeOut" : "Quad.easeOut",
      }));
    });
    this.freespinCounterValue = safeLives;
    this.emitFreespinsCounter(safeLives);
    await Promise.all(pops);
  }

  async restoreLivesOnLanding(bonusState = {}) {
    const maxLives = Math.max(1, Number(bonusState?.maxLives ?? bonusState?.initialFreespins) || 3);
    const resets = bonusState?.resetLives ?? (Number(bonusState?.livesRemaining) >= maxLives);
    if (!resets || this.freespinCounterValue === maxLives) return;
    await this.updateLifeMeter(maxLives, maxLives);
    await this.waitForPresentation(240, { skippable: true });
  }

  beginBonusSpin(bonusState = {}) {
    const maxLives = Number(bonusState?.maxLives ?? bonusState?.initialFreespins ?? 3);
    const spentLives = Number(
      bonusState?.livesAfterSpend
      ?? Math.max(0, Number(bonusState?.livesBeforeSpin ?? maxLives) - 1)
    );
    this.updateLifeMeter(spentLives, maxLives);
  }

  updateTrapLights(symbol, count = 0, required = 4) {
    const group = this.trapLightGroups?.[String(symbol)];
    if (!group) return;
    const safeRequired = Math.max(1, Number(required) || 4);
    const safeCount = Phaser.Math.Clamp(Number(count) || 0, 0, safeRequired);
    group.lights.forEach((light, index) => {
      const active = index < Math.round((safeCount / safeRequired) * group.lights.length);
      light
        .setFillStyle(active ? 0x69ff9f : 0x101722, active ? 1 : 0.95)
        .setStrokeStyle(2, active ? 0xeafff1 : 0x697586, active ? 1 : 0.8);
    });
  }

  getActiveDamageMultiplierEntry() {
    return this.damageMeterEntries?.[0] ?? null;
  }

  getActiveDamageMultiplier() {
    const multiplier = Number(this.getActiveDamageMultiplierEntry()?.value);
    return Number.isFinite(multiplier) ? multiplier : null;
  }

  getDamageMultiplierCssColor(entry = this.getActiveDamageMultiplierEntry()) {
    const colorInt = Number(entry?.activeColor);
    if (!Number.isFinite(colorInt)) return "#26d07c";
    return `#${(colorInt & 0xffffff).toString(16).padStart(6, "0")}`;
  }

  layoutTrapPowerTexts(power = 0, multiplier = this.getActiveDamageMultiplier()) {
    const centerX = GRID_OFFSET_X + GRID_WIDTH_PX / 2;
    const y = GRID_OFFSET_Y + GRID_HEIGHT_PX + 94;
    const powerLabel = `TRAP POWER ${Math.max(0, Number(power) || 0).toFixed(2)}`;
    const visible = this.isInBonusMode || this.isPostBonusOuch;

    this.trapPowerText?.setText(powerLabel);
    if (multiplier === null || !this.trapPowerMultiplierText) {
      this.trapPowerMultiplierText?.setVisible(false);
      this.trapPowerText
        ?.setOrigin(0.5, 0.5)
        .setPosition(centerX, y)
        .setVisible(visible);
      return;
    }

    const multiplierLabel = ` x ${multiplier}`;
    const multiplierColor = this.getDamageMultiplierCssColor();
    this.trapPowerMultiplierText
      .setText(multiplierLabel)
      .setColor(multiplierColor);

    const powerWidth = this.trapPowerText.width;
    const multiplierWidth = this.trapPowerMultiplierText.width;
    const totalWidth = powerWidth + multiplierWidth;
    const startX = centerX - (totalWidth / 2);

    this.trapPowerText
      .setOrigin(0, 0.5)
      .setPosition(startX, y)
      .setVisible(visible);
    this.trapPowerMultiplierText
      .setOrigin(0, 0.5)
      .setPosition(startX + powerWidth, y)
      .setVisible(visible);
  }

  refreshTrapPowerDisplay() {
    this.updateTrapPowerMeter(this.trapMeterState?.power ?? 0);
  }

  updateTrapPowerMeter(amount = 0) {
    const value = Math.max(0, Number(amount) || 0);
    this.trapMeterState = {
      ...(this.trapMeterState || {}),
      power: value,
    };
    const heat = 1 - Math.exp(-Math.log1p(value) / 4);
    const from = Phaser.Display.Color.ValueToColor(heat < 0.5 ? 0x32df7f : 0xffd166);
    const to = Phaser.Display.Color.ValueToColor(heat < 0.5 ? 0xffd166 : 0xef476f);
    const color = Phaser.Display.Color.Interpolate.ColorWithColor(
      from,
      to,
      100,
      Math.round((heat < 0.5 ? heat * 2 : (heat - 0.5) * 2) * 100)
    );
    const cssColor = `#${Phaser.Display.Color.GetColor(color.r, color.g, color.b)
      .toString(16)
      .padStart(6, "0")}`;
    this.trapPowerText?.setColor(cssColor);
    this.layoutTrapPowerTexts(value);
  }

  updateDamageMeter(damageWheel = {}) {
    const segments = Array.isArray(damageWheel?.segments) && damageWheel.segments.length
      ? damageWheel.segments.map(Number)
      : [...DEFAULT_DAMAGE_METER_SEGMENTS];
    const remaining = Array.isArray(damageWheel?.remainingSegments)
      ? damageWheel.remainingSegments.map(Number)
      : segments;
    if (segments.join(",") !== (this.damageMeterValues || []).join(",")
      || remaining.length > this.damageMeterEntries.length) {
      this.createDamageMeter(segments);
    }
    while (this.damageMeterEntries.length > remaining.length) {
      this.removeDamageMeterEntry(0);
    }
    this.layoutDamageMeter();
    this.damageMeterState = {
      segments,
      removedSegments: [...(damageWheel?.removedSegments || [])],
      remainingSegments: [...remaining],
    };
    this.refreshTrapPowerDisplay();
  }

  updateBonusState(bonusState = {}, trapMeter = {}, damageWheel = {}) {
    const lives = bonusState?.livesRemaining
      ?? bonusState?.remaining
      ?? bonusState?.finalFreespins
      ?? 0;
    const maxLives = bonusState?.maxLives
      ?? bonusState?.initialFreespins
      ?? 3;
    this.updateLifeMeter(lives, maxLives);
    const required = Math.max(1, Number(trapMeter?.required) || 4);
    TRAP_SYMBOLS.forEach((symbol) => {
      this.updateTrapLights(symbol, trapMeter?.progress?.[String(symbol)] || 0, required);
      this.trapLightGroups?.[String(symbol)]?.valueLabel
        ?.setText(String(Math.round(Number(trapMeter?.values?.[String(symbol)] || 0))));
    });
    this.updateTrapPowerMeter(trapMeter?.power || 0);
    this.updateDamageMeter(damageWheel);
    this.trapMeterState = {
      progress: { ...(trapMeter?.progress || {}) },
      required,
      values: { ...(trapMeter?.values || {}) },
      power: Number(trapMeter?.power) || 0,
    };
  }

  getBonusHoleAnchor() {
    const centerX = GRID_OFFSET_X + GRID_WIDTH_PX / 2;
    const bottom = GRID_OFFSET_Y + GRID_HEIGHT_PX;
    return {
      x: centerX + Phaser.Math.Between(-72, 72),
      y: bottom + Phaser.Math.Between(58, 78),
    };
  }

  spawnCartoonDustPuff(x, y, dustColors, index, total, delay = 0, intensity = 1) {
    const angle = Phaser.Math.DegToRad(-175 + (index / Math.max(1, total - 1)) * 350);
    const distance = Phaser.Math.Between(28, 72) * intensity;
    const puff = this.add.circle(
      x + Phaser.Math.Between(-18, 18) * intensity,
      y + Phaser.Math.Between(-6, 6) * intensity,
      Phaser.Math.Between(6, 14) * intensity,
      dustColors[index % dustColors.length],
      Phaser.Math.FloatBetween(0.82, 0.95)
    ).setDepth(DEPTH.effects);
    return this.tweenPromise({
      targets: puff,
      x: puff.x + Math.cos(angle) * distance,
      y: puff.y + Math.sin(angle) * distance - Phaser.Math.Between(6, 16) * intensity,
      scaleX: Phaser.Math.FloatBetween(1.5, 2.6) * intensity,
      scaleY: Phaser.Math.FloatBetween(1.3, 2.1) * intensity,
      alpha: 0,
      delay,
      duration: Phaser.Math.Between(280, 480),
      ease: "Quad.easeOut",
      onComplete: () => puff.destroy(),
    });
  }

  async createCartoonDustCloud(x, y, { big = false } = {}) {
    this.playRandomConstructionSfx();
    const dustColors = [0xf2d39b, 0xd8a866, 0x9b6a3c, 0xc49a62, 0xe8c78a];
    const primaryCount = big ? 34 : 18;
    const secondaryCount = big ? 26 : 12;
    const intensity = big ? 1.65 : 1;
    if (big) this.playSfx("wins_payout", { volume: 0.58 });
    await Promise.all([
      ...Array.from({ length: primaryCount }, (_, index) => (
        this.spawnCartoonDustPuff(x, y, dustColors, index, primaryCount, 0, intensity)
      )),
      ...Array.from({ length: secondaryCount }, (_, index) => (
        this.spawnCartoonDustPuff(
          x,
          y,
          dustColors,
          index,
          secondaryCount,
          Phaser.Math.Between(60, 120),
          intensity
        )
      )),
    ]);
  }

  spawnTrapCompletionSparks(x, y) {
    const colors = [0xffdc73, 0x69ff9f, 0xffffff, 0xffb347];
    const sparks = Array.from({ length: 10 }, (_, index) => {
      const spark = this.add.circle(
        x,
        y,
        Phaser.Math.Between(3, 5),
        colors[index % colors.length],
        0.95
      )
        .setDepth(DEPTH.effects + 2)
        .setBlendMode(Phaser.BlendModes.ADD);
      const angle = Phaser.Math.DegToRad(-165 + index * 36);
      return this.tweenPromise({
        targets: spark,
        x: x + Math.cos(angle) * Phaser.Math.Between(18, 42),
        y: y + Math.sin(angle) * Phaser.Math.Between(14, 34),
        alpha: 0,
        scale: Phaser.Math.FloatBetween(1.5, 2.4),
        duration: Phaser.Math.Between(220, 360),
        delay: index * 18,
        ease: "Quad.easeOut",
        onComplete: () => spark.destroy(),
      });
    });
    return Promise.all(sparks);
  }

  async celebrateTrapSealCompletion(group, landing = {}) {
    const { icon, valueLabel, lights } = group;
    if (!icon) return;
    const iconScaleX = icon.scaleX;
    const iconScaleY = icon.scaleY;
    const valueScaleX = valueLabel?.scaleX ?? 1;
    const valueScaleY = valueLabel?.scaleY ?? 1;
    lights?.forEach((light) => {
      light
        .setFillStyle(0xffdc73, 1)
        .setStrokeStyle(2, 0xffffff, 1);
    });
    const ring = this.add.circle(icon.x, icon.y, 18, 0xffdc73, 0)
      .setStrokeStyle(3, 0xffdc73, 0.95)
      .setDepth(DEPTH.effects + 1);
    this.playSfx("wins_payout", { volume: 0.68 });
    await Promise.all([
      this.tweenPromise({
        targets: ring,
        radius: 52,
        alpha: 0,
        duration: 460,
        ease: "Quad.easeOut",
        onComplete: () => ring.destroy(),
      }),
      icon && this.tweenPromise({
        targets: icon,
        scaleX: iconScaleX * 1.28,
        scaleY: iconScaleY * 1.28,
        duration: 150,
        yoyo: true,
        repeat: 1,
        ease: "Back.easeOut",
      }),
      valueLabel && this.tweenPromise({
        targets: valueLabel,
        scaleX: valueScaleX * 1.28,
        scaleY: valueScaleY * 1.28,
        duration: 150,
        yoyo: true,
        repeat: 1,
        ease: "Back.easeOut",
      }),
      ...(lights || []).map((light, index) => this.tweenPromise({
        targets: light,
        scaleX: 1.55,
        scaleY: 1.55,
        duration: 130,
        delay: index * 35,
        yoyo: true,
        ease: "Sine.easeOut",
        onComplete: () => light.setScale(1, 1),
      })),
      this.spawnTrapCompletionSparks(icon.x, icon.y),
    ]);
    await this.waitForPresentation(120, { skippable: true });
  }

  createTrapSealFlightClone(group, symbol, valueText) {
    const { icon, valueLabel } = group;
    const centerY = icon.y + (valueLabel.y - icon.y) * 0.35;
    const container = this.add.container(icon.x, centerY).setDepth(DEPTH.effects + 3);
    const iconClone = this.add.image(0, icon.y - centerY, String(symbol))
      .setScale(icon.scaleX, icon.scaleY);
    const valueClone = this.add.text(0, valueLabel.y - centerY, valueText, {
      fontFamily: "Arial Black, Arial",
      fontSize: "12px",
      color: "#ffdc73",
      stroke: "#111827",
      strokeThickness: 4,
    }).setOrigin(0.5);
    container.add([iconClone, valueClone]);
    return container;
  }

  async flyTrapSealToHole(group, landing = {}) {
    const valueText = group.valueLabel?.text
      || String(Math.round(Number(landing.powerAwarded) || 0));
    const clone = this.createTrapSealFlightClone(group, landing.symbol, valueText);
    const anchor = this.getBonusHoleAnchor();
    await this.tweenPromise({
      targets: clone,
      y: clone.y - 14,
      scaleX: 1.1,
      scaleY: 1.1,
      duration: 105,
      ease: "Back.easeOut",
    });
    const startX = clone.x;
    const startY = clone.y;
    const curve = new Phaser.Curves.QuadraticBezier(
      new Phaser.Math.Vector2(startX, startY),
      new Phaser.Math.Vector2(
        startX + Phaser.Math.Between(-34, 34),
        startY + (anchor.y - startY) * 0.48
      ),
      new Phaser.Math.Vector2(anchor.x, anchor.y)
    );
    const travel = { t: 0 };
    const point = new Phaser.Math.Vector2();
    await this.tweenPromise({
      targets: travel,
      t: 1,
      duration: 460,
      ease: "Cubic.easeIn",
      onUpdate: () => {
        curve.getPoint(travel.t, point);
        clone.setPosition(point.x, point.y);
        const shrink = 1 - travel.t * 0.82;
        clone.setScale(shrink);
        clone.setAlpha(1 - travel.t * 0.55);
        clone.setAngle(travel.t * 120);
      },
      onComplete: () => clone.destroy(),
    });
    await this.createCartoonDustCloud(anchor.x, anchor.y, { big: true });
    await this.presentTrapPowerIncrease(landing);
  }

  async suckBonusSymbolIntoHole(sprite) {
    if (!sprite || sprite.destroyed) return;
    const startX = sprite.x;
    const startY = sprite.y;
    const anchor = this.getBonusHoleAnchor();
    const curve = new Phaser.Curves.QuadraticBezier(
      new Phaser.Math.Vector2(startX, startY),
      new Phaser.Math.Vector2(
        startX + (anchor.x - startX) * 0.35 + Phaser.Math.Between(-24, 24),
        startY + (anchor.y - startY) * 0.45
      ),
      new Phaser.Math.Vector2(anchor.x, anchor.y)
    );
    const point = new Phaser.Math.Vector2();
    const travel = { t: 0 };
    sprite.clearMask?.();
    sprite.setDepth(DEPTH.effects);
    await this.tweenPromise({
      targets: sprite,
      y: startY - 12,
      scaleX: SYMBOL_SCALE * 1.08,
      scaleY: SYMBOL_SCALE * 1.08,
      duration: 95,
      ease: "Back.easeOut",
    });
    await this.tweenPromise({
      targets: travel,
      t: 1,
      duration: 340,
      ease: "Cubic.easeIn",
      onUpdate: () => {
        curve.getPoint(travel.t, point);
        sprite.setPosition(point.x, point.y);
        const shrink = 1 - travel.t * 0.92;
        sprite.setScale(SYMBOL_SCALE * shrink, SYMBOL_SCALE * shrink * 0.55);
        sprite.setAngle(travel.t * 180);
        sprite.setAlpha(1 - travel.t * 0.82);
      },
      onComplete: () => sprite.setVisible(false),
    });
    await this.createCartoonDustCloud(anchor.x, anchor.y);
  }

  async presentTrapPowerIncrease(landing = {}) {
    const powerBefore = Number(landing.trapPowerBefore) || 0;
    const powerAfter = Number(landing.trapPowerAfter) || 0;
    if (Number(landing.powerAwarded) <= 0) return;
    const counter = { value: powerBefore };
    await this.tweenPromise({
      targets: counter,
      value: powerAfter,
      duration: 420,
      ease: "Cubic.easeOut",
      onUpdate: () => this.updateTrapPowerMeter(counter.value),
    });
    await this.tweenPromise({
      targets: [this.trapPowerText, this.trapPowerMultiplierText].filter(Boolean),
      scaleX: 1.25,
      scaleY: 1.25,
      duration: 140,
      yoyo: true,
      ease: "Back.easeOut",
    });
  }

  async presentBonusCashLandings(landings = [], trapMeter = {}, bonusState = {}, damageWheel = {}) {
    let livesRestored = false;
    for (const landing of landings) {
      const sprite = this.reelSprites?.[landing.reel]?.[landing.row];
      if (!sprite || sprite.destroyed) continue;
      await this.tweenPromise({
        targets: sprite,
        scaleX: SYMBOL_SCALE * 1.14,
        scaleY: SYMBOL_SCALE * 1.14,
        duration: 105,
        yoyo: true,
        ease: "Sine.easeInOut",
      });
      if (!livesRestored) {
        livesRestored = true;
        await this.restoreLivesOnLanding(bonusState);
      }
      await this.suckBonusSymbolIntoHole(sprite);
      if (landing.isDamage || Number(landing.symbol) === DAMAGE_SYMBOL) {
        await this.popDamageMeterSegment(landing.damageRemovedSegment);
        continue;
      }

      const group = this.trapLightGroups?.[String(landing.symbol)];
      if (landing.isTrap && group) {
        const required = trapMeter?.required || 4;
        this.updateTrapLights(
          landing.symbol,
          landing.trapLightsFilled ?? landing.trapProgressAfter,
          required
        );
        if (landing.completedTrap) {
          await this.celebrateTrapSealCompletion(group, landing);
          await this.flyTrapSealToHole(group, landing);
          this.updateTrapLights(landing.symbol, landing.trapProgressAfter, required);
        } else {
          await this.tweenPromise({
            targets: group.icon,
            scaleX: group.icon.scaleX * 1.18,
            scaleY: group.icon.scaleY * 1.18,
            duration: 90,
            yoyo: true,
          });
        }
      } else if (Number(landing.powerAwarded) > 0) {
        await this.presentTrapPowerIncrease(landing);
      }
    }
    this.updateBonusState(bonusState, trapMeter, damageWheel);
  }

  async updateAngerMeter(angerMeter = {}) {
    const max = Math.max(1, Number(angerMeter.max) || ANGER_SEGMENT_COUNT);
    const count = Phaser.Math.Clamp(Number(angerMeter.count) || 0, 0, max);
    const litCount = this.getLitAngerSegmentCount(count, max);
    this.angerMeterState = { count, max };
    await Promise.all(this.angerSegments.map((segment, index) => {
      const active = index < litCount;
      const heat = litCount / max;
      let fillColor = 0x341912;
      if (active) {
        const blended = Phaser.Display.Color.Interpolate.ColorWithColor(
          Phaser.Display.Color.ValueToColor(0xe55328),
          Phaser.Display.Color.ValueToColor(0xff2a00),
          100,
          Math.round(heat * 100)
        );
        fillColor = Phaser.Display.Color.GetColor(blended.r, blended.g, blended.b);
      }
      segment.setFillStyle(fillColor, active ? 1 : 0.9);
      segment.setStrokeStyle(active ? 2 : 1, active ? 0xffc07a : 0x9b4b2b, active ? 1 : 0.85);
      if (!active) {
        segment.setScale(1, 1);
        return Promise.resolve();
      }
      const popScale = angerMeter.explode && index === litCount - 1
        ? { x: 1.34, y: 1.42 }
        : { x: 1.14 + heat * 0.08, y: 1.22 + heat * 0.1 };
      return this.tweenPromise({
        targets: segment,
        scaleX: popScale.x,
        scaleY: popScale.y,
        duration: angerMeter.explode ? 150 : 110,
        yoyo: true,
        ease: angerMeter.explode ? "Back.easeOut" : "Sine.easeOut",
      });
    }));
    this.syncAngerBlink(count, max);
  }

  syncCountUpDisplay(value = this.currentWin) {
    const amount = Number(value) || 0;
    if (!this.countUpText) return;
    if (this.totalWinTitleText?.visible) {
      this.countUpText.setText(amount.toFixed(2));
      this.countUpText.setVisible(true);
      return;
    }
    this.countUpText.setText(`${this.countUpLabel || "WIN"} ${amount.toFixed(2)}`);
    this.countUpText.setVisible(amount > 0 || this.countUpLabel !== "WIN");
  }

  setCountUpLabel(label = "WIN") {
    this.countUpLabel = label;
    this.syncCountUpDisplay(this.currentWin);
  }

  resetCountUpPresentation() {
    const centerX = GRID_OFFSET_X + GRID_WIDTH_PX / 2;
    const bottom = GRID_OFFSET_Y + GRID_HEIGHT_PX;
    this.countUpLabel = "WIN";
    this.totalWinTitleText?.setVisible(false);
    this.countUpText
      ?.setPosition(centerX, bottom + 46)
      .setFontSize("30px")
      .setScale(1, 1)
      .setAlpha(1)
      .setVisible(false);
  }

  async updateCountUp(targetValue = 0, { duration = 420 } = {}) {
    await this.collectStompCoinsToWin();

    const target = Number(targetValue) || 0;
    if (target <= 0 && this.currentWin <= 0) {
      this.syncCountUpDisplay(0);
      return;
    }

    const counter = { value: this.currentWin };
    if (target > 0) this.countUpText?.setVisible(true);
    return this.tweenPromise({
      targets: counter,
      value: target,
      duration,
      ease: "Cubic.easeOut",
      onUpdate: () => this.syncCountUpDisplay(counter.value),
      onComplete: () => {
        this.currentWin = target;
        this.syncCountUpDisplay(target);
      },
    });
  }

  resetAngerMeter() {
    this.stopAngerBlink();
    this.angerMeterState = { count: 0, max: ANGER_SEGMENT_COUNT };
    this.angerSegments?.forEach((segment) => {
      segment.setFillStyle(0x341912, 0.9);
      segment.setStrokeStyle(1, 0x9b4b2b, 0.85);
      segment.setScale(1, 1);
      segment.setAlpha(1);
    });
  }

  resetForNewSpin() {
    this.currentWin = 0;
    this.resetCountUpPresentation();
    this.syncCountUpDisplay(0);
    this.clearStompLandedCoins();
    this.clearPendingFastForward();
  }

  getMainGameSymbolSprites() {
    return this.reelSprites.flat().filter((sprite) => sprite?.active);
  }

  fadeMainGameSymbols(alpha = 0, duration = 450) {
    const targets = this.getMainGameSymbolSprites();
    if (!targets.length || !this.tweens) return Promise.resolve();
    return this.tweenPromise({
      targets,
      alpha,
      duration,
      ease: "Quad.easeInOut",
    });
  }

  restoreMainGameSymbols(duration = 300) {
    const targets = this.getMainGameSymbolSprites();
    if (!targets.length || !this.tweens) return Promise.resolve();
    return this.tweenPromise({
      targets,
      alpha: 1,
      duration,
      ease: "Quad.easeInOut",
    });
  }

  async enterBonus(gameState = {}) {
    this.isInBonusMode = true;
    this.startBonusTheme();
    this.setAngerUiVisible(false);
    this.totalWinBackground?.setAlpha(0);
    this.reelFrame?.setAlpha(1);
    this.resetCountUpPresentation();
    this.setBonusUiVisible(true);
    this.countUpText?.setVisible(false);
    this.updateBonusState(gameState.bonusState, gameState.trapMeter, gameState.damageWheel);
    await Promise.all([
      this.tweenPromise({ targets: this.background, alpha: 0, duration: 450 }),
      this.tweenPromise({ targets: this.bonusBackground, alpha: 1, duration: 450 }),
      this.fadeMainGameSymbols(0, 450),
    ]);
  }

  async presentBonusExitSequence(gameState = {}) {
    if (!this.isInBonusMode || this.isPostBonusOuch) return;
    this.isPostBonusOuch = true;
    this.setAngerUiVisible(false);
    this.totalWinBackground?.setAlpha(0);
    this.setBonusUiVisible(false);
    this.hideFreespinCounter();
    this.countUpText?.setVisible(false);
    this.stopBonusTheme();
    await this.slideOutOldSymbols();
    await Promise.all([
      this.tweenPromise({ targets: this.bonusBackground, alpha: 0, duration: 450 }),
      this.tweenPromise({ targets: this.ouchBackground, alpha: 1, duration: 450 }),
    ]);
    await this.presentOuchFakeSpin();
    await this.presentOuchStompSequence(gameState.ouchStompEvent || {}, gameState);
  }

  async leaveBonus() {
    if (!this.isInBonusMode && !this.isPostBonusOuch) return;
    this.isInBonusMode = false;
    this.isPostBonusOuch = false;
    this.hideFreespinCounter();
    this.setBonusUiVisible(false);
    this.setOuchUiVisible(false);
    this.countUpText?.setVisible(false);
    this.stopBonusTheme();
    this.stopOuchTheme();
    this.ouchFoot?.destroy();
    this.ouchFoot = null;
    this.resetOuchPitScroll();
    this.reelSprites.flat().forEach((sprite) => sprite?.setVisible(true).setAlpha(1));
    await Promise.all([
      this.tweenPromise({ targets: this.background, alpha: 1, duration: 300 }),
      this.tweenPromise({ targets: this.bonusBackground, alpha: 0, duration: 300 }),
      this.tweenPromise({ targets: this.ouchBackground, alpha: 0, duration: 300 }),
      this.tweenPromise({ targets: this.totalWinBackground, alpha: 0, duration: 300 }),
      this.tweenPromise({ targets: this.reelFrame, alpha: 1, duration: 300 }),
      this.restoreMainGameSymbols(300),
    ]);
    this.resetAngerMeter();
    this.setAngerUiVisible(true);
    this.resetCountUpPresentation();
    this.syncCountUpDisplay(this.currentWin);
  }

  getRemainingFreespins(gameState = {}) {
    return Math.max(0, Math.floor(Number(
      gameState.bonusState?.remaining ??
      gameState.bonusState?.livesRemaining ??
      gameState.bonusState?.remainingFreespins ??
      gameState.bonusState?.finalFreespins ??
      gameState.bonusState?.initial ??
      gameState.bonusState?.initialFreespins ??
      0
    ) || 0));
  }

  updateFreespinCounter(remaining) {
    this.updateLifeMeter(remaining, 3);
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

  playRandomConstructionSfx() {
    const key = Phaser.Utils.Array.GetRandom(CONSTRUCTION_SFX);
    this.playSfx(key, { volume: 0.62 });
  }

  playGiantLaughSfx() {
    this.playSfx("giant_laugh", { volume: 0.68 });
  }

  stopOuchLaughSfx() {
    const sound = this.activeOuchLaughSfx;
    if (!sound) return;
    this.activeOuchLaughSfx = null;
    sound.stop();
    sound.destroy();
  }

  playOuchLaughSfx() {
    this.stopOuchLaughSfx();
    if (!this.sound || !this.cache.audio.exists("giant_laugh")) return;
    if (this.fastForwardRequested && soundInteractionPolicy.giant_laugh?.allowDuringFastForward === false) return;

    const sound = this.sound.add("giant_laugh", {
      volume: 0.68 * (this.fastForwardRequested ? 0.55 : 1),
    });
    this.activeOuchLaughSfx = sound;
    const release = () => {
      if (this.activeOuchLaughSfx === sound) {
        this.activeOuchLaughSfx = null;
      }
      sound.destroy();
    };
    sound.once("complete", release);
    sound.once("stop", release);
    if (!sound.play()) release();
  }

  playOuchCelebrationSfx() {
    if (this.activeOuchCelebrationSfx?.isPlaying) return;
    if (!this.sound || !this.cache.audio.exists("ouch_celebration_cheer")) return;
    if (this.fastForwardRequested && soundInteractionPolicy.ouch_celebration_cheer?.allowDuringFastForward === false) return;

    const sound = this.sound.add("ouch_celebration_cheer", {
      volume: 0.62 * (this.fastForwardRequested ? 0.55 : 1),
    });
    this.activeOuchCelebrationSfx = sound;
    const release = () => {
      if (this.activeOuchCelebrationSfx === sound) {
        this.activeOuchCelebrationSfx = null;
      }
      sound.destroy();
    };
    sound.once("complete", release);
    sound.once("stop", release);
    if (!sound.play()) release();
  }

  stopOuchCelebrationSfx() {
    const sound = this.activeOuchCelebrationSfx;
    if (!sound) return;
    this.activeOuchCelebrationSfx = null;
    sound.stop();
    sound.destroy();
  }

  playOuchStompSfx() {
    this.playSfx(OUCH_STOMP_SFX[0], { volume: 0.82 });
    this.time?.delayedCall(60, () => {
      this.playSfx(OUCH_STOMP_SFX[1], { volume: 0.78 });
    });
  }

  playGiantPainSfx() {
    this.stopOuchLaughSfx();
    const key = Phaser.Utils.Array.GetRandom(GIANT_PAIN_SFX);
    this.playSfx(key, { volume: 0.76 });
  }

  playAnimalCrushSfx() {
    if (this.activeAnimalCrushSfx?.isPlaying) return;
    const key = Phaser.Utils.Array.GetRandom(ANIMAL_CRUSH_SFX);
    if (!this.sound || !this.cache.audio.exists(key)) return;
    if (this.fastForwardRequested && soundInteractionPolicy[key]?.allowDuringFastForward === false) return;

    const sound = this.sound.add(key, {
      volume: 0.58 * (this.fastForwardRequested ? 0.55 : 1),
    });
    this.activeAnimalCrushSfx = sound;
    const release = () => {
      if (this.activeAnimalCrushSfx === sound) {
        this.activeAnimalCrushSfx = null;
      }
      sound.destroy();
    };
    sound.once("complete", release);
    sound.once("stop", release);
    if (!sound.play()) release();
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
    if (!this.isPostBonusOuch) {
      this.startMainTheme();
    }
  }

  startOuchTheme() {
    this.mainTheme?.stop();
    this.bonusTheme?.stop();
    if (this.musicMuted) return;
    if (!this.ouchTheme) {
      this.ouchTheme = this.sound.add("ouch_background-music", { loop: true, volume: 0.46 });
    }
    if (!this.ouchTheme.isPlaying) {
      this.ouchTheme.play({ loop: true });
    }
  }

  stopOuchTheme() {
    this.stopOuchLaughSfx();
    this.stopOuchCelebrationSfx();
    this.ouchTheme?.stop();
    this.ouchTheme = null;
  }

  toggleMusic() {
    this.musicMuted = !this.musicMuted;
    [this.mainTheme, this.bonusTheme, this.ouchTheme].forEach((theme) => theme?.setMute(this.musicMuted));
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
