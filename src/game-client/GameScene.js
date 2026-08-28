import Phaser from "phaser";
import clientConfig from "./config/client_config.json";
import gameClientConfig from "./config/gameClientConfig";
import soundInteractionPolicy from "./config/soundInteractionPolicy";
import flowInteractionPolicy from "./config/flowInteractionPolicy";
import {
  CELL_SIZE,
  GRID_HEIGHT_PX,
  GRID_OFFSET_X,
  GRID_OFFSET_Y,
  GRID_WIDTH_PX,
  getCellCenter,
  layoutReelFrame,
  getReelFrameScale,
  BONUS_METER_LADDER_SIZE,
  getBonusDamageMeterAnchor,
  getBonusDamageMeterSlotPositions,
  layoutBonusDamageMeterLadder,
  BONUS_METER_NUMBERS_OFFSET_X,
  BONUS_METER_NUMBERS_OFFSET_Y,
  BONUS_METER_SHOW_ANCHOR_DEBUG,
  BONUS_BACKGROUND_OFFSET_Y,
  OUCH_BACKGROUND_OFFSET_Y,
  OUCH_BACKGROUND_SCALE,
  OUCH_STOMP_OFFSET_X,
  OUCH_PIT_STEP_DELTA_Y,
  OUCH_UI_OFFSET_Y,
  getOuchDamageMeterLadderLayout,
} from "./config/layoutMetrics";

const REELS = 5;
const ROWS = 3;
const SYMBOL_SCALE = 0.65;
const HIGHLIGHT_SYMBOL_SCALE = SYMBOL_SCALE * 1.02;
const HIGHLIGHT_SYMBOL_POP_SCALE = SYMBOL_SCALE * 1.05;
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
const AUTHORED_OUCH_LADDER_SEGMENTS = [...DEFAULT_DAMAGE_METER_SEGMENTS];
const BONUS_INTRO_SCALE = 1.06;
const BONUS_INTRO_DRIFT_X = 22;
const BONUS_INTRO_DRIFT_Y = -18;
const BONUS_INTRO_HOLD_MS = 1500;
const BONUS_HOLE_LIGHT_CENTER_OFFSET_X = 0;
const BONUS_HOLE_LIGHT_CENTER_OFFSET_Y = 68;
const BONUS_INTRO_SPARKLES = [
  { x: -214, y: 20, radius: 8, color: 0xffcc73 },
  { x: -126, y: 50, radius: 6, color: 0x7dd3fc },
  { x: -18, y: -44, radius: 7, color: 0xfff1a8 },
  { x: 102, y: 16, radius: 6, color: 0x93c5fd },
  { x: 206, y: -10, radius: 8, color: 0xffd47a },
];

function getMultiplierSegmentColor(index, total) {
  const ratio = total <= 1 ? 0 : index / (total - 1);
  const stops = [
    { at: 0, color: 0x22c55e },
    { at: 0.22, color: 0x84cc16 },
    { at: 0.42, color: 0xeab308 },
    { at: 0.62, color: 0xf97316 },
    { at: 0.82, color: 0xef4444 },
    { at: 1, color: 0xb91c1c },
  ];
  let left = stops[0];
  let right = stops.at(-1);
  for (let stopIndex = 0; stopIndex < stops.length - 1; stopIndex += 1) {
    if (ratio >= stops[stopIndex].at && ratio <= stops[stopIndex + 1].at) {
      left = stops[stopIndex];
      right = stops[stopIndex + 1];
      break;
    }
  }
  const span = Math.max(0.0001, right.at - left.at);
  const localRatio = (ratio - left.at) / span;
  const from = Phaser.Display.Color.ValueToColor(left.color);
  const to = Phaser.Display.Color.ValueToColor(right.color);
  const blended = Phaser.Display.Color.Interpolate.ColorWithColor(
    from,
    to,
    100,
    Math.round(localRatio * 100)
  );
  return Phaser.Display.Color.GetColor(blended.r, blended.g, blended.b);
}

function blendMultiplierColor(colorInt, factor) {
  const segment = Phaser.Display.Color.ValueToColor(colorInt);
  const base = Phaser.Display.Color.ValueToColor(0x0a0e12);
  return Phaser.Display.Color.GetColor(
    Math.round(base.r + (segment.r - base.r) * factor),
    Math.round(base.g + (segment.g - base.g) * factor),
    Math.round(base.b + (segment.b - base.b) * factor)
  );
}
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
const CRUSH_HAND_TARGET_OFFSET_X = -20;
const CRUSH_HAND_SCALE = 2;
const DEPTH = {
  background: 0,
  crushBackground: 1,
  board: 4,
  crushHand: 12,
  symbols: 10,
  crushGrab: 12,
  crushGrabSymbol: 13,
  effects: 20,
  stomp: 25,
  stompVfx: 27,
  angerVfx: 28,
  transition: 29,
  transitionFx: 29.5,
  ui: 30,
};
const BONUS_METER_DEPTH = {
  ladder: DEPTH.ui + 2,
  numbers: DEPTH.ui + 3,
  foot: DEPTH.ui + 5,
  activeNumber: DEPTH.ui + 6,
  debug: DEPTH.ui + 7,
};
const STOMP_COIN_SCALE_MIN = 0.13;
const STOMP_COIN_SCALE_MAX = 0.15;
const WIN_CAP = Math.max(0, Number(clientConfig.wincap) || 0);
const SYMBOL_LAND_EASE = "Back.easeOut";
const SYMBOL_LAND_EASE_PARAMS = [1.08];
const OUCH_LAYOUT_TUNER_VALUES = [1, 2, 3, 4, 5, 10, 15, 20, 25, 50, 75, 100];
const MAIN_GAME_SPEED_SETTINGS = [
  { label: ">", multiplier: 1.5 },
  { label: ">>", multiplier: 2 },
  { label: ">>>", multiplier: 3 },
];

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
    this.highlightGlows = new Set();
    this.fastForwardRequested = false;
    this.currentWin = 0;
    this.countUpLabel = "WIN";
    this.freespinCounterValue = null;
    this.isInBonusMode = false;
    this.isBonusUiVisible = false;
    this.isPostBonusOuch = false;
    this.ouchScrollY = 0;
    this.ouchTrapPowerMultiplierIndex = null;
    this.ouchTheme = null;
    this.ouchFoot = null;
    this.ouchGear = null;
    this.ouchSnare = null;
    this.ouchRope = null;
    this.ouchTrapTension = 0;
    this.ouchTrapImpact = null;
    this.ouchFadeOverlay = null;
    this.ouchCoinCollectQueue = null;
    this.musicMuted = false;
    this.activeAnimalCrushSfx = null;
    this.activeOuchLaughSfx = null;
    this.activeOuchCelebrationSfx = null;
    this.stompLandedCoins = [];
    this.stompCoinsRegistry = new Set();
    this.stompCoinLaunchPromises = [];
    this.stompWinCapHandled = false;
    this.totalWinBackground = null;
    this.totalWinFormulaText = null;
    this.animalEmotion = "normal";
    this.totalWinCelebrants = [];
    this.totalWinCelebrationTimers = [];
    this.bonusIntroImage = null;
    this.bonusIntroShade = null;
    this.bonusIntroSunGlow = null;
    this.bonusIntroBlueprintGlow = null;
    this.bonusIntroSparkles = [];
    this.bonusHoleLightShader = null;
    this.bonusHoleLightFadeState = { value: 0 };
    this.bonusHoleLightPulseState = { value: 0 };
    this.bonusHoleLightPulseTween = null;
    this.bonusUi = [];
    this.lifeSegments = [];
    this.lifeLabels = [];
    this.trapPowerText = null;
    this.trapPowerMultiplierText = null;
    this.trapPowerMultiplierPulse = null;
    this.trapLightGroups = {};
    this.trapMeterState = { progress: {}, required: 4, values: {}, power: 0 };
    this.angerBlinkTween = null;
    this.angerBonusPulseTween = null;
    this.damageMeterObjects = [];
    this.damageMeterEntries = [];
    this.damageMeterSlots = [];
    this.damageMeterOrientation = "bonus";
    this.damageMeterUsesOuchLadder = false;
    this.damageMeterLadderLayout = null;
    this.damageMeterLadderDisplayIndex = -1;
    this.damageMeterBankedCount = 0;
    this.damageMeterPanel = null;
    this.damageMeterTitle = null;
    this.damageMeterStatusText = null;
    this.damageMeterLadder = null;
    this.damageMeterFoot = null;
    this.damageMeterActiveNumber = null;
    this.damageMeterIntroComplete = false;
    this.damageMeterDebugAnchors = [];
    this.damageMeterReelScale = 1;
    this.damageMeterActiveIndex = 0;
    this.damageMeterAdvanceQueue = Promise.resolve();
    this.damageMeterState = {
      segments: [...DEFAULT_DAMAGE_METER_SEGMENTS],
      removedSegments: [],
      remainingSegments: [...DEFAULT_DAMAGE_METER_SEGMENTS],
    };
    this.ouchLayoutTuner = null;
    this.ouchLayoutTunerKeyHandler = null;
    this.mainGameSpeedSettingIndex = 0;
    this.mainGameSpeedControl = [];
    this.mainGameSpeedButton = null;
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
    if (this.isOuchLayoutTunerRequested()) {
      this.time.delayedCall(150, () => this.presentOuchLayoutTunerPreview());
    }
  }

  shutdown() {
    this.scale.off(Phaser.Scale.Events.RESIZE, this.applyLayoutSnapshot, this);
    this.unsubscribeLayout?.();
    this.unsubscribeLayoutDebug?.();
    this.cancelSkippablePresentationWaits();
    this.stopBonusHoleLightFlicker();
    this.stopAngerBonusPulse();
    this.finishActiveTweens();
    this.destroyOuchTrapRig();
    this.destroyOuchLayoutTuner();
    this.clearTotalWinCelebration();
  }

  isOuchLayoutTunerRequested() {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("ouchLayout") === "1";
  }

  presentOuchLayoutTunerPreview() {
    if (this.ouchLayoutTuner || !this.isOuchLayoutTunerRequested()) return;
    this.isInBonusMode = true;
    this.isPostBonusOuch = true;
    this.background?.setAlpha(0);
    this.bonusBackground?.setAlpha(0);
    this.ouchBackground?.setAlpha(1);
    this.reelFrame?.setAlpha(0);
    this.reelSprites.flat().forEach((sprite) => sprite?.setVisible(false));
    this.setAngerUiVisible(false);
    this.setBonusUiVisible(false);
    this.setOuchUiVisible(false);
    this.startOuchTheme();

    const bounds = this.getOuchStompBounds();
    if (!bounds) return;
    const footWidth = bounds.width + CELL_SIZE * 0.95;
    const footScale = footWidth / 420;
    const impactY = bounds.centerY + CELL_SIZE * 0.08;
    this.ouchFoot?.destroy();
    this.ouchFoot = this.add.image(bounds.centerX, impactY, "ouch_snared_foot")
      .setDepth(DEPTH.stomp)
      .setScale(footScale * 1.04, footScale * 0.97)
      .setAlpha(0.98);
    this.ouchTrapImpact = { foot: this.ouchFoot, impactY, footWidth, footScale, bounds };
    this.createOuchLayoutTuner();
  }

  createOuchLayoutTuner() {
    const saved = this.readOuchLayoutTunerSettings();
    const centerX = GRID_OFFSET_X + GRID_WIDTH_PX * 0.18;
    const centerY = GRID_OFFSET_Y + GRID_HEIGHT_PX * 0.7;
    const settings = {
      x: Number(saved?.x) || centerX,
      y: Number(saved?.y) || centerY,
      width: Phaser.Math.Clamp(Number(saved?.width) || 88, 30, 240),
      stepGap: Phaser.Math.Clamp(Number(saved?.stepGap) || 52, 12, 120),
      selectedStep: Phaser.Math.Clamp(Math.round(Number(saved?.selectedStep) || 0), 0, OUCH_LAYOUT_TUNER_VALUES.length - 1),
      pullDistance: Phaser.Math.Clamp(Number(saved?.pullDistance) || 18, 2, 120),
      cameraX: Number(saved?.cameraX) || 0,
      cameraY: Number(saved?.cameraY) || 0,
      cameraZoom: Phaser.Math.Clamp(Number(saved?.cameraZoom) || 1, 0.5, 2),
      artX: Number(saved?.artX) || centerX,
      artY: Number(saved?.artY) || centerY,
      artWidth: Phaser.Math.Clamp(Number(saved?.artWidth) || 110, 30, 320),
      artHeight: Phaser.Math.Clamp(Number(saved?.artHeight) || 670, 100, 1200),
    };
    const graphics = this.add.graphics().setDepth(DEPTH.ui + 20);
    const artLadder = this.add.image(settings.artX, settings.artY, "ouch_damage_meter_ladder")
      .setDisplaySize(settings.artWidth, settings.artHeight)
      .setAlpha(0.8)
      .setDepth(DEPTH.ui + 20)
      .setInteractive({ draggable: true, useHandCursor: true });
    const dragTarget = this.add.rectangle(settings.x, settings.y, settings.width + 52, settings.stepGap * 11 + 60, 0x00d9ff, 0.001)
      .setDepth(DEPTH.ui + 18)
      .setInteractive({ draggable: true, useHandCursor: true });
    const marker = this.add.image(settings.x - settings.width / 2 - 24, settings.y, "ouch_damage_meter_foot")
      .setScale(0.42)
      .setDepth(DEPTH.ui + 22);
    const panel = this.add.text(GRID_OFFSET_X + 4, GRID_OFFSET_Y + 4, "", {
      fontFamily: "monospace",
      fontSize: "11px",
      color: "#d9fbff",
      stroke: "#00141d",
      strokeThickness: 3,
      lineSpacing: 2,
    }).setDepth(DEPTH.ui + 25).setOrigin(0, 0);
    const camera = this.cameras.main;
    this.ouchLayoutTuner = {
      settings,
      graphics,
      artLadder,
      dragTarget,
      marker,
      panel,
      camera,
      baseCameraScrollX: camera.scrollX,
      baseCameraScrollY: camera.scrollY,
      baseCameraZoom: camera.zoom,
      previewFootY: this.ouchFoot?.y,
    };
    dragTarget.on("drag", (_pointer, dragX, dragY) => {
      settings.x = Math.round(dragX);
      settings.y = Math.round(dragY);
      this.renderOuchLayoutTuner();
    });
    artLadder.on("drag", (_pointer, dragX, dragY) => {
      settings.artX = Math.round(dragX);
      settings.artY = Math.round(dragY);
      this.renderOuchLayoutTuner();
    });
    this.ouchLayoutTunerKeyHandler = (event) => this.handleOuchLayoutTunerKey(event);
    this.input.keyboard?.on("keydown", this.ouchLayoutTunerKeyHandler);
    this.renderOuchLayoutTuner();
  }

  readOuchLayoutTunerSettings() {
    try {
      const raw = window.localStorage.getItem("giantStomp.ouchLayoutTuner.v1");
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  saveOuchLayoutTunerSettings() {
    if (!this.ouchLayoutTuner || typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        "giantStomp.ouchLayoutTuner.v1",
        JSON.stringify(this.ouchLayoutTuner.settings)
      );
    } catch (_) {
      // Local storage is optional for this dev-only tool.
    }
  }

  getOuchLayoutTunerStepY(index) {
    const tuner = this.ouchLayoutTuner;
    if (!tuner) return 0;
    return tuner.settings.y - (tuner.settings.stepGap * 11) / 2 + index * tuner.settings.stepGap;
  }

  renderOuchLayoutTuner() {
    const tuner = this.ouchLayoutTuner;
    if (!tuner) return;
    const { settings, graphics, artLadder, dragTarget, marker, panel } = tuner;
    const topY = this.getOuchLayoutTunerStepY(0) - 20;
    const bottomY = this.getOuchLayoutTunerStepY(11) + 20;
    const leftX = settings.x - settings.width / 2;
    const rightX = settings.x + settings.width / 2;
    graphics.clear();
    graphics.lineStyle(3, 0x00d9ff, 0.95);
    graphics.strokeRect(leftX, topY, settings.width, bottomY - topY);
    OUCH_LAYOUT_TUNER_VALUES.forEach((value, index) => {
      const y = this.getOuchLayoutTunerStepY(index);
      const active = index === settings.selectedStep;
      graphics.lineStyle(active ? 5 : 2, active ? 0xffe066 : 0x5ae8ff, active ? 1 : 0.78);
      graphics.lineBetween(leftX, y, rightX, y);
      const label = this.add.text(rightX + 8, y, `x${value}`, {
        fontFamily: "Arial Black, Arial",
        fontSize: "11px",
        color: active ? "#fff3a6" : "#b7f7ff",
        stroke: "#003343",
        strokeThickness: 2,
      }).setOrigin(0, 0.5).setDepth(DEPTH.ui + 21);
      tuner.labels ||= [];
      tuner.labels[index] ? tuner.labels[index].destroy() : null;
      tuner.labels[index] = label;
    });
    marker.setPosition(leftX - 24, this.getOuchLayoutTunerStepY(settings.selectedStep));
    dragTarget.setPosition(settings.x, settings.y).setSize(settings.width + 52, bottomY - topY + 40);
    artLadder.setPosition(settings.artX, settings.artY).setDisplaySize(settings.artWidth, settings.artHeight);
    this.applyOuchLayoutTunerCamera();
    panel.setText(
      `OUCH LADDER TUNER  (?ouchLayout=1)\n`
      + `Drag cyan guide | Arrows move (${settings.x}, ${settings.y})\n`
      + `[ / ] width: ${settings.width}   - / = step gap: ${settings.stepGap}\n`
      + `Drag PICTURE ladder | Z / X picture width: ${settings.artWidth}   V / B picture height: ${settings.artHeight}\n`
      + `Picture center: (${settings.artX}, ${settings.artY})\n`
      + `, / . selected step: ${settings.selectedStep + 1}/${OUCH_LAYOUT_TUNER_VALUES.length}\n`
      + `N / M foot pull: ${settings.pullDistance}px | Space preview pull\n`
      + `W A S D camera: (${settings.cameraX}, ${settings.cameraY}) | Q / E zoom: ${settings.cameraZoom.toFixed(2)}\n`
      + `C copy coordinates | R reset\n\n`
      + `COPY THIS:\n`
      + `{ x: ${settings.x}, y: ${settings.y}, width: ${settings.width}, stepGap: ${settings.stepGap}, selectedStep: ${settings.selectedStep}, pullDistance: ${settings.pullDistance}, cameraX: ${settings.cameraX}, cameraY: ${settings.cameraY}, cameraZoom: ${settings.cameraZoom.toFixed(2)}, artX: ${settings.artX}, artY: ${settings.artY}, artWidth: ${settings.artWidth}, artHeight: ${settings.artHeight} }`
    );
    this.saveOuchLayoutTunerSettings();
  }

  applyOuchLayoutTunerCamera() {
    const tuner = this.ouchLayoutTuner;
    if (!tuner?.camera) return;
    tuner.camera.setZoom(tuner.baseCameraZoom * tuner.settings.cameraZoom);
    tuner.camera.setScroll(
      tuner.baseCameraScrollX + tuner.settings.cameraX,
      tuner.baseCameraScrollY + tuner.settings.cameraY
    );
  }

  async previewOuchLayoutTunerPull() {
    const tuner = this.ouchLayoutTuner;
    const foot = this.ouchFoot;
    if (!tuner || !foot?.active) return;
    const baseY = tuner.previewFootY ?? foot.y;
    await this.tweenPromise({
      targets: foot,
      y: baseY + tuner.settings.pullDistance,
      duration: 150,
      ease: "Quad.easeIn",
    });
    await this.waitForPresentation(90, { skippable: true });
    await this.tweenPromise({
      targets: foot,
      y: baseY,
      duration: 130,
      ease: "Quad.easeOut",
    });
  }

  handleOuchLayoutTunerKey(event) {
    const tuner = this.ouchLayoutTuner;
    if (!tuner) return;
    const { settings } = tuner;
    const move = event.shiftKey ? 10 : 2;
    const cameraMove = event.shiftKey ? 80 : 20;
    const key = event.key;
    if (key === "ArrowLeft") settings.x -= move;
    else if (key === "ArrowRight") settings.x += move;
    else if (key === "ArrowUp") settings.y -= move;
    else if (key === "ArrowDown") settings.y += move;
    else if (key === "[") settings.width = Phaser.Math.Clamp(settings.width - 4, 30, 240);
    else if (key === "]") settings.width = Phaser.Math.Clamp(settings.width + 4, 30, 240);
    else if (key === "-") settings.stepGap = Phaser.Math.Clamp(settings.stepGap - 2, 12, 120);
    else if (key === "=") settings.stepGap = Phaser.Math.Clamp(settings.stepGap + 2, 12, 120);
    else if (key === ",") settings.selectedStep = Phaser.Math.Clamp(settings.selectedStep - 1, 0, 11);
    else if (key === ".") settings.selectedStep = Phaser.Math.Clamp(settings.selectedStep + 1, 0, 11);
    else if (key.toLowerCase() === "n") settings.pullDistance = Phaser.Math.Clamp(settings.pullDistance - 2, 2, 120);
    else if (key.toLowerCase() === "m") settings.pullDistance = Phaser.Math.Clamp(settings.pullDistance + 2, 2, 120);
    else if (key.toLowerCase() === "a") settings.cameraX -= cameraMove;
    else if (key.toLowerCase() === "d") settings.cameraX += cameraMove;
    else if (key.toLowerCase() === "w") settings.cameraY -= cameraMove;
    else if (key.toLowerCase() === "s") settings.cameraY += cameraMove;
    else if (key.toLowerCase() === "q") settings.cameraZoom = Phaser.Math.Clamp(settings.cameraZoom - 0.05, 0.5, 2);
    else if (key.toLowerCase() === "e") settings.cameraZoom = Phaser.Math.Clamp(settings.cameraZoom + 0.05, 0.5, 2);
    else if (key.toLowerCase() === "z") settings.artWidth = Phaser.Math.Clamp(settings.artWidth - 4, 30, 320);
    else if (key.toLowerCase() === "x") settings.artWidth = Phaser.Math.Clamp(settings.artWidth + 4, 30, 320);
    else if (key.toLowerCase() === "v") settings.artHeight = Phaser.Math.Clamp(settings.artHeight - 8, 100, 1200);
    else if (key.toLowerCase() === "b") settings.artHeight = Phaser.Math.Clamp(settings.artHeight + 8, 100, 1200);
    else if (key === " ") {
      this.previewOuchLayoutTunerPull();
      return;
    }
    else if (key.toLowerCase() === "r") {
      tuner.camera?.setZoom(tuner.baseCameraZoom).setScroll(tuner.baseCameraScrollX, tuner.baseCameraScrollY);
      window.localStorage.removeItem("giantStomp.ouchLayoutTuner.v1");
      this.destroyOuchLayoutTuner();
      this.createOuchLayoutTuner();
      return;
    } else if (key.toLowerCase() === "c") {
      const payload = JSON.stringify(settings);
      console.log("OUCH LADDER TUNER", payload);
      navigator.clipboard?.writeText(payload).catch(() => {});
      tuner.panel?.setText?.(tuner.panel.text.replace("COPY THIS:", "COPIED:"));
      return;
    } else return;
    event.preventDefault();
    this.renderOuchLayoutTuner();
  }

  destroyOuchLayoutTuner() {
    const tuner = this.ouchLayoutTuner;
    if (!tuner) return;
    this.input.keyboard?.off("keydown", this.ouchLayoutTunerKeyHandler);
    tuner.graphics?.destroy();
    tuner.artLadder?.destroy();
    tuner.dragTarget?.destroy();
    tuner.marker?.destroy();
    tuner.panel?.destroy();
    tuner.labels?.forEach((label) => label?.destroy());
    this.ouchLayoutTuner = null;
    this.ouchLayoutTunerKeyHandler = null;
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
    this.createBonusHoleLightFx();
    this.createBonusIntroScene();
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
    this.totalWinFormulaText = this.add.text(centerX, bottom + 46, "", {
      ...textStyle,
      fontSize: "22px",
      color: "#f5df8a",
    }).setOrigin(0.5).setDepth(DEPTH.ui + 1).setVisible(false);
    this.freespinText = this.add.text(centerX, GRID_OFFSET_Y - 38, "", {
      ...textStyle,
      fontSize: "25px",
    }).setOrigin(0.5).setDepth(DEPTH.ui).setVisible(false);

    const meterWidth = 130;
    const bonusBadgeWidth = 58;
    const bonusBadgeGap = 8;
    const segmentGap = 2;
    const segmentWidth = (meterWidth - segmentGap * (ANGER_SEGMENT_COUNT - 1)) / ANGER_SEGMENT_COUNT;
    const meterX = GRID_OFFSET_X + GRID_WIDTH_PX - meterWidth - bonusBadgeWidth - bonusBadgeGap - 4;
    const meterY = bottom + 88;
    this.angerLabel = this.add.text(meterX - 12, meterY, "ANGER\nMETER", {
      fontFamily: "Arial Black, Arial",
      fontSize: "13px",
      align: "right",
      lineSpacing: -3,
      color: "#ffe1a8",
      stroke: "#3a130d",
      strokeThickness: 3,
    }).setOrigin(1, 0.5).setDepth(DEPTH.ui + 1);
    this.angerMeterCaption = this.add.text(meterX + meterWidth / 2, meterY - 16, "FEED THE FURY", {
      fontFamily: "Arial Black, Arial",
      fontSize: "8px",
      color: "#f6b35f",
      letterSpacing: 1,
      stroke: "#3a130d",
      strokeThickness: 2,
    }).setOrigin(0.5).setDepth(DEPTH.ui + 1);
    this.angerSegments = Array.from({ length: ANGER_SEGMENT_COUNT }, (_, index) => this.add.rectangle(
      meterX + segmentWidth / 2 + index * (segmentWidth + segmentGap),
      meterY,
      segmentWidth,
      14,
      0x341912,
      0.9
    ).setStrokeStyle(1, 0x9b4b2b, 1).setDepth(DEPTH.ui));
    this.angerBonusBadge = this.add.text(
      meterX + meterWidth + bonusBadgeGap + bonusBadgeWidth / 2,
      meterY,
      "BONUS",
      {
        fontFamily: "Arial Black, Arial",
        fontSize: "12px",
        color: "#a96648",
        backgroundColor: "#351712",
        stroke: "#170806",
        strokeThickness: 3,
        padding: { left: 5, right: 5, top: 3, bottom: 3 },
      }
    ).setOrigin(0.5).setDepth(DEPTH.ui + 1);
    this.angerMeterState = { count: 0, max: ANGER_SEGMENT_COUNT };

    this.createMainGameSpeedControl();

    this.createBonusUi();
  }

  createMainGameSpeedControl() {
    const x = GRID_OFFSET_X + 14;
    const y = GRID_OFFSET_Y - 42;
    const graphic = this.add.graphics().setDepth(DEPTH.ui + 2);
    const hitArea = this.add.rectangle(x + 20, y, 48, 28, 0x000000, 0.001)
      .setDepth(DEPTH.ui + 1);

    hitArea.setInteractive({ useHandCursor: true });

    hitArea.on("pointerdown", () => this.cycleMainGameSpeed());
    hitArea.on("pointerover", () => this.drawMainGameSpeedControl(true));
    hitArea.on("pointerout", () => this.drawMainGameSpeedControl(false));
    this.mainGameSpeedControl = [hitArea, graphic];
    this.mainGameSpeedButton = graphic;
    this.updateMainGameSpeedControl();
  }

  drawMainGameSpeedControl(hovered = false) {
    const graphic = this.mainGameSpeedButton;
    if (!graphic) return;
    const x = GRID_OFFSET_X + 14;
    const y = GRID_OFFSET_Y - 42;
    const arrowCount = this.mainGameSpeedSettingIndex + 1;
    const width = 40;
    const height = 24;
    const arrowWidth = 9;
    const arrowGap = 2;
    const groupWidth = arrowCount * arrowWidth + (arrowCount - 1) * arrowGap;
    const startX = x + (width - groupWidth) / 2;
    const iconColor = 0xffd783;

    graphic.clear();
    graphic.fillStyle(0x150f0c, hovered ? 0.7 : 0.45);
    graphic.fillRoundedRect(x, y - height / 2, width, height, 8);
    graphic.lineStyle(1, iconColor, hovered ? 0.8 : 0.48);
    graphic.strokeRoundedRect(x + 0.5, y - height / 2 + 0.5, width - 1, height - 1, 8);
    graphic.fillStyle(iconColor, hovered ? 1 : 0.82);
    for (let index = 0; index < arrowCount; index += 1) {
      const arrowX = startX + index * (arrowWidth + arrowGap);
      graphic.fillTriangle(
        arrowX,
        y - 6,
        arrowX + arrowWidth,
        y,
        arrowX,
        y + 6
      );
    }
  }

  cycleMainGameSpeed() {
    this.mainGameSpeedSettingIndex = (
      this.mainGameSpeedSettingIndex + 1
    ) % MAIN_GAME_SPEED_SETTINGS.length;
    this.updateMainGameSpeedControl();
  }

  getMainGameSpeedMultiplier() {
    return MAIN_GAME_SPEED_SETTINGS[this.mainGameSpeedSettingIndex]?.multiplier ?? 1;
  }

  updateMainGameSpeedControl() {
    this.drawMainGameSpeedControl();
    this.applyPresentationSpeedMultiplier();
  }

  applyPresentationSpeedMultiplier({ force = false } = {}) {
    const speedMultiplier = this.getMainGameSpeedMultiplier();
    if (this.time && (force || !this.fastForwardRequested)) this.time.timeScale = speedMultiplier;
    if (this.tweens && (force || !this.fastForwardRequested)) this.tweens.timeScale = speedMultiplier;
  }

  createBonusIntroScene() {
    const layout = this.getBonusIntroLayout();
    this.bonusIntroImage = this.add.image(layout.centerX, layout.centerY, "bonus_intro")
      .setDepth(DEPTH.transition)
      .setAlpha(0);
    this.layoutBackgroundImage(this.bonusIntroImage, BONUS_INTRO_SCALE);
    this.bonusIntroSunGlow = this.add.ellipse(
      layout.sunX,
      layout.sunY,
      440,
      210,
      0xffb25f,
      0.22
    )
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(DEPTH.transitionFx - 1)
      .setAlpha(0);
    this.bonusIntroBlueprintGlow = this.add.ellipse(
      layout.blueprintX,
      layout.blueprintY,
      560,
      190,
      0x5ba6ff,
      0.18
    )
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(DEPTH.transitionFx)
      .setAlpha(0);
    this.bonusIntroShade = this.add.rectangle(
      layout.centerX,
      layout.centerY,
      GRID_WIDTH_PX + 760,
      GRID_HEIGHT_PX + 760,
      0x050811,
      0.54
    )
      .setDepth(DEPTH.transitionFx)
      .setAlpha(0);
    this.bonusIntroSparkles = BONUS_INTRO_SPARKLES.map(({ x, y, radius, color }) => this.add.circle(
      layout.blueprintX + x,
      layout.blueprintY + y,
      radius,
      color,
      0.88
    )
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(DEPTH.transitionFx)
      .setAlpha(0));
    this.resetBonusIntroScene();
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
    this.lifeLabels = this.lifeSegments.map((segment, index) => this.add.text(segment.x, segment.y, String(index + 1), {
      fontFamily: "Arial Black, Arial",
      fontSize: "11px",
      color: "#fff1b8",
      stroke: "#241508",
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(DEPTH.ui + 1));

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

    this.trapPowerText = this.add.text(centerX, bottom + 94, "0.00", {
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
      ...this.lifeLabels,
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
    this.damageMeterLadder = null;
    this.damageMeterFoot = null;
    this.damageMeterActiveNumber = null;
    this.damageMeterIntroComplete = false;
    this.damageMeterDebugAnchors = [];
    this.damageMeterOrientation = this.isPostBonusOuch ? "ouch" : "bonus";
    const values = Array.isArray(segments) && segments.length
      ? segments.map(Number)
      : [...DEFAULT_DAMAGE_METER_SEGMENTS];
    const isOuch = this.damageMeterOrientation === "ouch";
    if (isOuch) {
      this.damageMeterUsesOuchLadder = this.canUseAuthoredOuchLadder(values);
      if (this.damageMeterUsesOuchLadder) {
        this.createOuchLadderMeter(values);
      } else {
        this.createOuchDamageMeter(values);
      }
    } else {
      this.damageMeterUsesOuchLadder = false;
      this.createBonusDamageMeter(values);
    }
    this.applyDamageMeterHighlight();
    if (!this.damageMeterUsesOuchLadder) {
      this.syncDamageMeterFootPosition(this.damageMeterActiveIndex ?? 0);
    }
    this.damageMeterObjects.forEach((object) => object.setVisible(this.isBonusUiVisible || this.isPostBonusOuch));
  }

  canUseAuthoredOuchLadder(values = []) {
    return values.length === AUTHORED_OUCH_LADDER_SEGMENTS.length
      && values.every((value, index) => Number(value) === AUTHORED_OUCH_LADDER_SEGMENTS[index]);
  }

  createOuchLadderMeter(values = []) {
    const layout = getOuchDamageMeterLadderLayout(values.length);
    this.damageMeterValues = [...values];
    this.damageMeterSlots = layout.slots;
    this.damageMeterLadderLayout = layout;
    this.damageMeterLadderDisplayIndex = -1;
    this.damageMeterPanel = null;
    this.damageMeterTitle = null;
    this.damageMeterStatusText = this.add.text(
      GRID_OFFSET_X + GRID_WIDTH_PX / 2,
      GRID_OFFSET_Y + 16 + OUCH_UI_OFFSET_Y,
      "",
      {
        fontFamily: "Arial Black, Arial",
        fontSize: "9px",
        color: "#ffe7a6",
        stroke: "#241508",
        strokeThickness: 2,
      }
    ).setOrigin(0.5).setDepth(DEPTH.ui + 2).setVisible(false);
    this.damageMeterObjects.push(this.damageMeterStatusText);

    this.damageMeterLadder = this.add.image(layout.centerX, layout.centerY, "ouch_damage_meter_ladder")
      .setDisplaySize(layout.artWidth, layout.artHeight)
      .setDepth(DEPTH.board + 1);
    this.damageMeterFoot = this.add.image(layout.slots[0]?.x || layout.centerX, layout.startY, "ouch_damage_meter_foot")
      .setOrigin(0.5)
      .setScale(layout.scale * 0.72)
      .setDepth(DEPTH.symbols + 5);
    this.damageMeterObjects.push(this.damageMeterLadder, this.damageMeterFoot);

    values.forEach((value, index) => {
      const slot = layout.slots[index];
      const numberSprite = this.add.text(layout.numberX, slot?.y ?? layout.startY, `x${value}`, {
        fontFamily: "Arial Black, Arial",
        fontSize: "14px",
        color: "#e7c581",
        stroke: "#1a1007",
        strokeThickness: 2,
      }).setOrigin(0, 0.5).setDepth(DEPTH.symbols + 4);
      this.damageMeterEntries.push({
        value,
        marker: null,
        label: null,
        numberSprite,
        bankedStamp: null,
        activeColor: getMultiplierSegmentColor(index, values.length),
        baseScale: 1,
      });
      this.damageMeterObjects.push(numberSprite);
    });
  }

  createOuchDamageMeter(values = []) {
    const centerX = GRID_OFFSET_X + GRID_WIDTH_PX / 2;
    const bottom = GRID_OFFSET_Y + GRID_HEIGHT_PX;
    const gap = 2;
    const railHeight = GRID_HEIGHT_PX - 28;
    const segmentWidth = 70;
    const segmentHeight = Math.max(13, (railHeight - gap * (values.length - 1)) / values.length);
    const railX = GRID_OFFSET_X + 48;
    const railTop = GRID_OFFSET_Y + 14 + OUCH_UI_OFFSET_Y;
    this.damageMeterValues = [...values];
    this.damageMeterSlots = values.map((_, index) => ({
      x: railX,
      y: railTop + segmentHeight / 2 + index * (segmentHeight + gap),
    }));
    this.damageMeterPanel = this.add.rectangle(
      railX,
      railTop + railHeight / 2,
      segmentWidth + 16,
      railHeight + 38,
      0x07110d,
      0.86
    )
      .setStrokeStyle(2, 0xd8c26a, 0.6)
      .setDepth(DEPTH.ui - 1);
    this.damageMeterObjects.push(this.damageMeterPanel);
    this.damageMeterTitle = this.add.text(railX, railTop - 16, "STOMP DEPTH", {
      fontFamily: "Arial Black, Arial",
      fontSize: "10px",
      color: "#fff0bf",
      stroke: "#241508",
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(DEPTH.ui);
    this.damageMeterStatusText = this.add.text(railX, railTop + railHeight + 17, "", {
      fontFamily: "Arial Black, Arial",
      fontSize: "8px",
      color: "#ffe7a6",
      stroke: "#241508",
      strokeThickness: 2,
    }).setOrigin(0.5).setDepth(DEPTH.ui + 1).setVisible(false);
    this.damageMeterObjects.push(this.damageMeterTitle, this.damageMeterStatusText);

    values.forEach((value, index) => {
      const slot = this.damageMeterSlots[index];
      const activeColor = getMultiplierSegmentColor(index, values.length);
      const marker = this.add.rectangle(slot.x, slot.y, segmentWidth, segmentHeight, 0x111923, 0.94)
        .setStrokeStyle(2, activeColor, 0.74)
        .setDepth(DEPTH.ui);
      const label = this.add.text(slot.x, slot.y, `x${value}`, {
        fontFamily: "Arial Black, Arial",
        fontSize: "8px",
        color: "#ffffff",
        stroke: "#161a20",
        strokeThickness: 2,
      }).setOrigin(0.5).setDepth(DEPTH.ui);
      const bankedStamp = this.add.text(slot.x, slot.y, "BANKED", {
        fontFamily: "Arial Black, Arial",
        fontSize: "5px",
        color: "#241508",
        stroke: "#ffe5a0",
        strokeThickness: 1,
      }).setOrigin(0.5).setDepth(DEPTH.ui + 1).setVisible(false);
      this.damageMeterEntries.push({ value, marker, label, bankedStamp, activeColor });
      this.damageMeterObjects.push(marker, label, bankedStamp);
    });
  }

  createBonusDamageMeter(values = []) {
    const reelFrameSource = this.reelFrame?.texture?.getSourceImage?.();
    const scale = reelFrameSource?.width ? getReelFrameScale(reelFrameSource) : 1;
    this.damageMeterReelScale = scale;
    const { centerX, centerY } = getBonusDamageMeterAnchor();
    const ladderHalfH = (BONUS_METER_LADDER_SIZE.height * scale) / 2;
    this.damageMeterValues = [...values];
    this.damageMeterSlots = getBonusDamageMeterSlotPositions(values.length, scale, centerX, centerY);
    this.damageMeterPanel = null;
    this.damageMeterTitle = null;
    this.damageMeterStatusText = this.add.text(centerX, centerY + ladderHalfH + 14, "", {
      fontFamily: "Arial Black, Arial",
      fontSize: "9px",
      color: "#ffe7a6",
      stroke: "#241508",
      strokeThickness: 2,
    }).setOrigin(0.5).setDepth(BONUS_METER_DEPTH.debug).setVisible(false);
    this.damageMeterObjects.push(this.damageMeterStatusText);

    values.forEach((value, index) => {
      const slot = this.damageMeterSlots[index];
      const activeColor = getMultiplierSegmentColor(index, values.length);
      const numberSprite = this.add.text(slot.x, slot.numberY, `x${value}`, {
        fontFamily: "Arial Black, Arial",
        fontSize: `${Math.max(9, 26 * scale)}px`,
        color: "#e7c581",
        stroke: "#1a1007",
        strokeThickness: Math.max(1, 2 * scale),
      })
        .setOrigin(0.5)
        .setDepth(BONUS_METER_DEPTH.numbers);
      this.damageMeterEntries.push({
        value,
        marker: null,
        label: null,
        numberSprite,
        dimOverlay: null,
        bankedStamp: null,
        activeColor,
        baseScale: 1,
      });
      this.damageMeterObjects.push(numberSprite);
    });

    this.damageMeterLadder = this.add.image(centerX, centerY, "damage_meter_ladder")
      .setDepth(BONUS_METER_DEPTH.ladder);
    layoutBonusDamageMeterLadder(this.damageMeterLadder, scale);
    this.damageMeterObjects.push(this.damageMeterLadder);

    const footScale = scale * 1.1;
    this.damageMeterFoot = this.add.image(centerX, centerY, "damage_meter_foot")
      .setOrigin(0.5, 0.72)
      .setScale(footScale)
      .setDepth(BONUS_METER_DEPTH.foot);
    this.damageMeterObjects.push(this.damageMeterFoot);

    this.damageMeterActiveNumber = this.add.text(centerX, centerY, "x1", {
      fontFamily: "Arial Black, Arial",
      fontSize: `${Math.max(13, 34 * scale)}px`,
      color: "#fff1c7",
      stroke: "#3b1d08",
      strokeThickness: Math.max(2, 3 * scale),
    })
      .setOrigin(0.5)
      .setDepth(BONUS_METER_DEPTH.activeNumber)
      .setVisible(false);
    this.damageMeterObjects.push(this.damageMeterActiveNumber);

    this.createBonusDamageMeterDebugAnchors(values);
  }

  createBonusDamageMeterDebugAnchors(values = []) {
    this.damageMeterDebugAnchors?.forEach((object) => object?.destroy?.());
    this.damageMeterDebugAnchors = [];
    if (!BONUS_METER_SHOW_ANCHOR_DEBUG) return;

    values.forEach((value, index) => {
      const slot = this.damageMeterSlots[index];
      if (!slot) return;
      const dot = this.add.circle(slot.x, slot.numberY, 4, 0x00ff44, 1)
        .setDepth(BONUS_METER_DEPTH.debug)
        .setStrokeStyle(1, 0xffffff, 0.9);
      const label = this.add.text(slot.x, slot.numberY - 9, `x${value}`, {
        fontFamily: "Arial Black, Arial",
        fontSize: "7px",
        color: "#00ff44",
        stroke: "#001a08",
        strokeThickness: 2,
      }).setOrigin(0.5).setDepth(BONUS_METER_DEPTH.debug);
      this.damageMeterDebugAnchors.push(dot, label);
      this.damageMeterObjects.push(dot, label);
    });
  }

  layoutBonusDamageMeterDebugAnchors() {
    if (!BONUS_METER_SHOW_ANCHOR_DEBUG) return;
    this.damageMeterDebugAnchors?.forEach((object) => object?.destroy?.());
    this.damageMeterDebugAnchors = [];
    this.createBonusDamageMeterDebugAnchors(this.damageMeterValues || DEFAULT_DAMAGE_METER_SEGMENTS);
  }

  getBonusDamageMeterLayout() {
    const reelFrameSource = this.reelFrame?.texture?.getSourceImage?.();
    const scale = reelFrameSource?.width ? getReelFrameScale(reelFrameSource) : this.damageMeterReelScale || 1;
    this.damageMeterReelScale = scale;
    const anchor = getBonusDamageMeterAnchor();
    return {
      ...anchor,
      scale,
      slots: getBonusDamageMeterSlotPositions(
        this.damageMeterValues?.length || DEFAULT_DAMAGE_METER_SEGMENTS.length,
        scale,
        anchor.centerX,
        anchor.centerY
      ),
    };
  }

  layoutBonusDamageMeterArt() {
    const layout = this.getBonusDamageMeterLayout();
    layoutBonusDamageMeterLadder(this.damageMeterLadder, layout.scale);
    const ladderHalfH = (BONUS_METER_LADDER_SIZE.height * layout.scale) / 2;
    this.damageMeterStatusText?.setPosition(layout.centerX, layout.centerY + ladderHalfH + 14);
    this.damageMeterSlots = layout.slots;
    const footScale = layout.scale * 1.1;
    this.damageMeterFoot?.setScale(footScale).setDepth(BONUS_METER_DEPTH.foot);
    this.damageMeterLadder?.setDepth(BONUS_METER_DEPTH.ladder);
    this.damageMeterEntries.forEach((entry, index) => {
      const slot = this.damageMeterSlots[index];
      if (!slot) return;
      entry.numberSprite
        ?.setPosition(slot.x, slot.numberY)
        .setScale(entry.baseScale || 1);
    });
    this.layoutBonusDamageMeterDebugAnchors();
  }

  syncDamageMeterFootPosition(index = 0) {
    const slot = this.damageMeterSlots?.[index];
    if (!slot || !this.damageMeterFoot) return;
    if (this.damageMeterUsesOuchLadder) {
      this.damageMeterLadderDisplayIndex = index;
      this.damageMeterFoot.setPosition(slot.x, slot.footY);
      this.refreshOuchTrapRig();
      return;
    }
    if (this.damageMeterOrientation !== "bonus") return;
    this.damageMeterFoot.setPosition(slot.x, slot.footY);
    this.damageMeterFoot.setDepth(BONUS_METER_DEPTH.foot);
    this.syncDamageMeterActiveNumber(index);
  }

  syncDamageMeterActiveNumber(index = 0) {
    const slot = this.damageMeterSlots?.[index];
    if (!slot || !this.damageMeterActiveNumber || this.damageMeterOrientation !== "bonus") return;
    if (!this.damageMeterIntroComplete) {
      this.damageMeterActiveNumber.setVisible(false);
      return;
    }
    const value = this.damageMeterEntries?.[index]?.value ?? 1;
    this.damageMeterActiveNumber
      .setText(`x${value}`)
      .setPosition(slot.x, slot.numberY)
      .setColor("#fff3c4")
      .setStroke("#5a2d09", Math.max(2, (this.damageMeterReelScale || 1) * 3))
      .setScale(1.08)
      .setVisible(true);
  }

  async slideDamageMeterFootToIndex(
    targetIndex = 0,
    { fast = false, fromIndex = null } = {}
  ) {
    const startIndex = fromIndex ?? this.damageMeterActiveIndex ?? 0;
    const fromSlot = this.damageMeterSlots?.[startIndex];
    const toSlot = this.damageMeterSlots?.[targetIndex];
    if (!fromSlot || !toSlot || !this.damageMeterFoot || this.damageMeterOrientation !== "bonus") return;

    const travel = { x: fromSlot.x };

    await this.tweenPromise({
      targets: travel,
      x: toSlot.x,
      duration: fast ? 120 : 360,
      ease: "Cubic.easeInOut",
      onUpdate: () => {
        this.damageMeterFoot?.setPosition(travel.x, toSlot.footY);
        this.damageMeterFoot?.setDepth(BONUS_METER_DEPTH.foot);
        this.damageMeterActiveNumber?.setPosition(travel.x, toSlot.numberY);
      },
    });
    this.syncDamageMeterFootPosition(targetIndex);
  }

  getDamageMeterActiveIndex(damageWheel = {}) {
    const segments = Array.isArray(damageWheel?.segments) && damageWheel.segments.length
      ? damageWheel.segments.map(Number)
      : (this.damageMeterValues || DEFAULT_DAMAGE_METER_SEGMENTS);
    const remaining = Array.isArray(damageWheel?.remainingSegments)
      ? damageWheel.remainingSegments.map(Number)
      : segments;
    if (!remaining.length) return segments.length;
    const index = segments.findIndex((value) => Number(value) === Number(remaining[0]));
    return index >= 0 ? index : Math.max(0, segments.length - remaining.length);
  }

  applyDamageMeterHighlight(activeIndex = 0) {
    this.damageMeterActiveIndex = activeIndex;
    this.damageMeterHighlightIndex = activeIndex;
    const bankedCount = Math.min(this.damageMeterBankedCount || 0, this.damageMeterEntries.length);
    this.damageMeterEntries.forEach((entry, index) => {
      const isPassed = index < activeIndex;
      const isBanked = index < bankedCount;
      const isActive = index === activeIndex;
      const isNext = index === activeIndex + 1;
      let fillColor;
      let fillAlpha;
      let strokeColor;
      let strokeWidth;
      let strokeAlpha;
      let markerAlpha;
      let labelAlpha;
      let labelScale;

      if (isPassed && isBanked) {
        fillColor = 0xe5a62d;
        fillAlpha = 0.96;
        strokeColor = 0xfff1a8;
        strokeWidth = 2;
        strokeAlpha = 0.98;
        markerAlpha = 1;
        labelAlpha = 0.96;
        labelScale = 0.9;
      } else if (isPassed) {
        fillColor = blendMultiplierColor(entry.activeColor, 0.5);
        fillAlpha = 0.82;
        strokeColor = entry.activeColor;
        strokeWidth = 1;
        strokeAlpha = 0.52;
        markerAlpha = 0.86;
        labelAlpha = 0.66;
        labelScale = 0.94;
      } else if (isActive) {
        fillColor = entry.activeColor;
        fillAlpha = 1;
        strokeColor = 0xffffff;
        strokeWidth = 3;
        strokeAlpha = 1;
        markerAlpha = 1;
        labelAlpha = 1;
        labelScale = 1.08;
      } else if (isNext) {
        fillColor = blendMultiplierColor(entry.activeColor, 0.32);
        fillAlpha = 0.94;
        strokeColor = entry.activeColor;
        strokeWidth = 2;
        strokeAlpha = 0.82;
        markerAlpha = 0.96;
        labelAlpha = 0.84;
        labelScale = 1.02;
      } else {
        fillColor = blendMultiplierColor(entry.activeColor, 0.2);
        fillAlpha = 0.9;
        strokeColor = entry.activeColor;
        strokeWidth = 1;
        strokeAlpha = 0.36;
        markerAlpha = 0.72;
        labelAlpha = 0.42;
        labelScale = 0.96;
      }

      entry.marker
        ?.setFillStyle(fillColor, fillAlpha)
        .setStrokeStyle(strokeWidth, strokeColor, strokeAlpha)
        .setAlpha(markerAlpha);
      entry.label
        ?.setAlpha(labelAlpha)
        .setScale(labelScale);
      if (entry.numberSprite && this.damageMeterOrientation === "bonus") {
        if (index === 0 && !this.damageMeterIntroComplete) {
          entry.numberSprite.setAlpha(0);
        } else {
        const ladderColor = this.getDamageMultiplierCssColor(entry);
        let numberColor = ladderColor;
        let numberStroke = "#1c1007";
        let numberAlpha = 0.65;
        let numberScale = 1;
        if (isPassed) {
          numberAlpha = isBanked ? 0.8 : 0.68;
        }
        if (isNext) {
          numberStroke = "#482406";
          numberAlpha = 1;
          numberScale = 1.1;
        }
        entry.numberSprite
          .setColor(numberColor)
          .setStroke(numberStroke, isNext ? 2.25 : 1.5)
          .setAlpha(numberAlpha)
          .setScale((entry.baseScale || 1) * numberScale);
        }
      } else if (entry.numberSprite) {
        const baseScale = entry.baseScale || this.damageMeterReelScale || 1;
        entry.numberSprite
          .setColor(this.getDamageMultiplierCssColor(entry))
          .setAlpha(labelAlpha)
          .setScale(baseScale * labelScale)
          .clearTint();
        if (isActive) {
          this.children.bringToTop(entry.numberSprite);
        }
      }
      entry.bankedStamp
        ?.setVisible(
          this.damageMeterOrientation === "ouch"
          && isBanked
          && isPassed
          && (this.isBonusUiVisible || this.isPostBonusOuch)
        )
        .setAlpha(isBanked ? 0.95 : 0);
    });
    if (this.damageMeterOrientation === "bonus") {
      this.syncDamageMeterFootPosition(activeIndex);
    }
    this.refreshTrapPowerDisplay();
  }

  setDamageMeterBankedCount(count = 0) {
    this.damageMeterBankedCount = Phaser.Math.Clamp(
      Math.floor(Number(count) || 0),
      0,
      this.damageMeterEntries.length
    );
    this.applyDamageMeterHighlight(this.damageMeterActiveIndex ?? 0);
  }

  setDamageMeterStatus(text = "", color = "#ffe7a6") {
    if (!this.damageMeterStatusText) return;
    this.damageMeterStatusText
      .setText(text)
      .setColor(color)
      .setVisible(Boolean(text) && (this.isBonusUiVisible || this.isPostBonusOuch));
  }

  async pulseDamageMeterHighlight(activeIndex = 0, { fast = false } = {}) {
    this.applyDamageMeterHighlight(activeIndex);
    const entry = this.damageMeterEntries[activeIndex];
    if (!entry) return;
    const scaleBoost = this.damageMeterOrientation === "bonus"
      ? (fast ? 1.035 : 1.065)
      : (fast ? 1.08 : 1.14);
    const duration = fast ? 68 : 140;
    const pulseTargets = this.damageMeterOrientation === "bonus"
      ? [this.damageMeterActiveNumber].filter(Boolean)
      : [entry.marker, entry.label].filter(Boolean);
    await Promise.all(pulseTargets.map((object) => this.tweenPromise({
      targets: object,
      scaleX: object.scaleX * scaleBoost,
      scaleY: object.scaleY * scaleBoost,
      duration,
      yoyo: true,
      ease: fast ? "Quad.easeOut" : "Back.easeOut",
    })));
  }

  async presentBonusMultiplierLadderIntro() {
    if (this.damageMeterOrientation !== "bonus" || !this.isInBonusMode) return;
    const reveals = this.damageMeterEntries
      .map((entry) => entry.numberSprite)
      .filter(Boolean)
      .map((number) => ({
        number,
        alpha: number.alpha,
        scaleX: number.scaleX,
        scaleY: number.scaleY,
      }));
    if (!reveals.length) return;
    const ripple = this.add.circle(0, 0, 7, 0xffd36b, 0)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(BONUS_METER_DEPTH.activeNumber - 0.25);
    try {
      for (let index = reveals.length - 1; index >= 0; index -= 1) {
        const reveal = reveals[index];
        ripple
          .setPosition(reveal.number.x, reveal.number.y)
          .setAlpha(0.82)
          .setScale(0.55)
          .setVisible(true);
        reveal.number
          .setColor("#fff0ad")
          .setStroke("#704009", 2.25)
          .setAlpha(1)
          .setScale(reveal.scaleX * 1.16, reveal.scaleY * 1.16);
        await Promise.all([
          this.tweenPromise({
            targets: reveal.number,
            alpha: reveal.alpha,
            scaleX: reveal.scaleX,
            scaleY: reveal.scaleY,
            duration: 86,
            ease: "Quad.easeOut",
          }),
          this.tweenPromise({
            targets: ripple,
            alpha: 0,
            scaleX: 1.8,
            scaleY: 1.8,
            duration: 110,
            ease: "Quad.easeOut",
          }),
        ]);
      }
    } finally {
      ripple.destroy();
      this.damageMeterIntroComplete = true;
      this.applyDamageMeterHighlight(this.damageMeterActiveIndex ?? 0);
    }
  }

  layoutDamageMeter() {
    this.layoutDamageMeterChrome();
    if (this.damageMeterOrientation === "bonus") {
      this.layoutBonusDamageMeterArt();
    } else if (this.damageMeterUsesOuchLadder) {
      this.layoutOuchDamageMeterArt();
    } else {
      this.damageMeterEntries.forEach((entry, index) => {
        const slot = this.damageMeterSlots[index];
        if (!slot) return;
        entry.marker?.setPosition(slot.x, slot.y);
        entry.label?.setPosition(slot.x, slot.y);
        entry.bankedStamp?.setPosition(slot.x, slot.y);
      });
    }
    if (!this.damageMeterUsesOuchLadder) {
      this.syncDamageMeterFootPosition(this.damageMeterActiveIndex ?? 0);
    }
    this.applyDamageMeterHighlight(this.damageMeterActiveIndex ?? 0);
  }

  layoutOuchDamageMeterArt() {
    const layout = getOuchDamageMeterLadderLayout(this.damageMeterValues.length);
    this.damageMeterLadderLayout = layout;
    this.damageMeterSlots = layout.slots;
    this.damageMeterLadder
      ?.setPosition(layout.centerX, layout.centerY)
      .setDisplaySize(layout.artWidth, layout.artHeight)
      .setDepth(DEPTH.board + 1);
    this.damageMeterFoot?.setScale(layout.scale * 0.72).setDepth(DEPTH.symbols + 5);
    this.damageMeterEntries.forEach((entry, index) => {
      const slot = layout.slots[index];
      entry.numberSprite?.setPosition(layout.numberX, slot?.y || layout.startY);
    });
    if (this.damageMeterLadderDisplayIndex < 0) {
      this.damageMeterFoot?.setPosition(layout.slots[0]?.x || layout.centerX, layout.startY);
      return;
    }
    const slot = layout.slots[this.damageMeterLadderDisplayIndex];
    this.damageMeterFoot?.setPosition(slot?.x || layout.centerX, slot?.footY || layout.startY);
  }

  async advanceDamageMeterSegment(value) {
    // Material flights may overlap, but the single multiplier foot must make
    // one complete move before the next 1000 landing advances it.
    const advance = this.damageMeterAdvanceQueue
      .catch(() => {})
      .then(() => this.playDamageMeterSegmentAdvance(value));
    this.damageMeterAdvanceQueue = advance;
    return advance;
  }

  async playDamageMeterSegmentAdvance(_value) {
    const activeIndex = this.damageMeterActiveIndex ?? 0;
    const entry = this.damageMeterEntries[activeIndex];
    if (!entry) return;
    await this.pulseDamageMeterHighlight(activeIndex);
    const nextIndex = activeIndex + 1;
    if (nextIndex <= this.damageMeterEntries.length) {
      if (this.damageMeterOrientation === "bonus") {
        await this.slideDamageMeterFootToIndex(nextIndex, {
          fast: this.fastForwardRequested,
          fromIndex: activeIndex,
        });
      }
      this.applyDamageMeterHighlight(nextIndex);
    }
    await this.bopTrapPowerDisplay();
  }

  async advanceDamageMeterForOuchStep() {
    const nextIndex = (this.damageMeterActiveIndex ?? 0) + 1;
    this.applyDamageMeterHighlight(nextIndex);
  }

  async presentOuchFootRecoilStomp(impact = {}, { fast = false } = {}) {
    const foot = impact?.foot || this.ouchFoot;
    if (!foot || foot.destroyed) return;

    const impactY = impact.impactY ?? (GRID_OFFSET_Y + GRID_HEIGHT_PX * 0.58);
    const footScale = impact.footScale ?? 1;
    const footWidth = impact.footWidth ?? impact.bounds?.width ?? GRID_WIDTH_PX;
    const bounds = impact.bounds;
    const liftY = impactY - CELL_SIZE * (fast ? 0.34 : 0.72);
    const slamY = impactY + CELL_SIZE * 0.1;

    await this.tweenPromise({
      targets: foot,
      y: liftY,
      scaleX: footScale * (fast ? 0.96 : 0.88),
      scaleY: footScale * (fast ? 0.98 : 0.86),
      duration: fast ? 52 : 170,
      ease: "Quad.easeOut",
      onUpdate: () => this.refreshOuchTrapRig(),
    });

    await this.tweenPromise({
      targets: foot,
      y: slamY,
      scaleX: footScale * 1.02,
      scaleY: footScale * 1.03,
      duration: fast ? 38 : 185,
      ease: "Quad.easeIn",
      onUpdate: () => this.refreshOuchTrapRig(),
    });

    await this.tweenPromise({
      targets: foot,
      y: impactY,
      scaleX: footScale * 1.04,
      scaleY: footScale * 0.97,
      duration: fast ? 26 : 68,
      ease: "Quad.easeOut",
      onUpdate: () => this.refreshOuchTrapRig(),
    });

    this.cameras.main.shake(fast ? 58 : 190, fast ? 0.006 : 0.014);
    this.playOuchStompSfx(fast ? 0.48 : 0.82);
    if (bounds && !fast) {
      this.spawnOuchDebrisBurst(bounds.centerX, impactY + CELL_SIZE * 0.12, footWidth * 0.82);
    }
  }

  async presentOuchFootPushDown(impact = {}) {
    const foot = impact?.foot || this.ouchFoot;
    if (!foot || foot.destroyed) return;

    const impactY = impact.impactY ?? (GRID_OFFSET_Y + GRID_HEIGHT_PX * 0.58);
    const footScale = impact.footScale ?? 1;
    const pushDepth = (impact.ouchPushDepth = (impact.ouchPushDepth || 0) + CELL_SIZE * 0.045);
    const pushY = impactY + pushDepth;

    await this.tweenPromise({
      targets: foot,
      y: pushY,
      scaleX: footScale * 1.05,
      scaleY: footScale * 0.93,
      duration: 72,
      ease: "Quad.easeIn",
      onUpdate: () => this.refreshOuchTrapRig(),
    });

    this.cameras.main.shake(88, 0.007);
    this.playOuchStompSfx(0.62);
  }

  async presentOuchPassedMultiplierReplay(targetIndex = 0, impact = {}, ouchEvent = {}, betSize = 1) {
    if (targetIndex <= 0 || !impact?.foot) return;

    this.applyDamageMeterHighlight(0);
    const centerX = impact.bounds?.centerX || (GRID_OFFSET_X + GRID_WIDTH_PX / 2);
    const centerY = (impact.impactY || GRID_OFFSET_Y + GRID_HEIGHT_PX * 0.55) + CELL_SIZE * 0.1;
    const trapPower = Number(ouchEvent.trapPower) || Number(this.trapMeterState?.power) || 1;
    const normalizedBet = Number(betSize) || 1;
    const coinCountPerStep = Math.max(1, Number(ouchEvent.coinCountPerStep) || Math.min(Math.round(trapPower), 20));
    this.ouchCoinCollectQueue = Promise.resolve();

    for (let index = 0; index < targetIndex; index += 1) {
      this.applyDamageMeterHighlight(index);
      await this.presentOuchDamageMeterCharge(1, 0, { fast: true });
      await this.presentOuchFootRecoilStomp(impact, { fast: true });
      await this.pulseDamageMeterHighlight(index, { fast: true });
      await this.moveOuchLadderFootToIndex(index, { fast: true });
      this.applyDamageMeterHighlight(index + 1);
      this.spawnOuchPainEffects(centerX, centerY, 0.45 + index * 0.06);
      const multiplier = Number(this.damageMeterEntries[index]?.value) || 1;
      const stepDisplayWin = Number((trapPower * multiplier * normalizedBet).toFixed(2));
      const replayCoinCount = Phaser.Math.Clamp(Math.round(coinCountPerStep * 0.55), 4, 12);
      const coinLaunch = this.spawnOuchWinCoins(
        centerX,
        centerY,
        replayCoinCount,
        stepDisplayWin,
        { fast: true }
      );
      this.enqueueOuchCoinCollection(coinLaunch, stepDisplayWin);
      await this.scrollOuchPit(undefined, { fast: true });
      await this.waitForPresentation(18, { skippable: true });
    }

    this.applyDamageMeterHighlight(targetIndex);
    await this.flushOuchCoinCollection();
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
    this.layoutBonusIntroScene();
    this.layoutBonusHoleLightFx();
  }

  getTotalWinTextLayout() {
    const centerX = GRID_OFFSET_X + GRID_WIDTH_PX / 2;
    const centerY = GRID_OFFSET_Y + GRID_HEIGHT_PX * 0.52;
    const ouchUiYOffset = this.getOuchUiYOffset();
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
      titleY: centerY - rowGap + ouchUiYOffset,
      amountY: centerY + rowGap * 0.45 + ouchUiYOffset,
      titleFontSize: `${titleFontSize}px`,
      amountFontSize: `${amountFontSize}px`,
      amountScale: Phaser.Math.Clamp(1.05 * scaleFactor, 0.88, 1.28),
    };
  }

  getOuchUiYOffset() {
    return this.isPostBonusOuch ? OUCH_UI_OFFSET_Y : 0;
  }

  getBonusIntroLayout() {
    const centerX = GRID_OFFSET_X + GRID_WIDTH_PX / 2;
    const centerY = GRID_OFFSET_Y + GRID_HEIGHT_PX / 2 - 10;
    const blueprintX = centerX - 6;
    const blueprintY = centerY + GRID_HEIGHT_PX * 0.32;
    return {
      centerX,
      centerY,
      sunX: centerX + 8,
      sunY: centerY - GRID_HEIGHT_PX * 0.34,
      blueprintX,
      blueprintY,
    };
  }

  layoutBonusIntroScene() {
    if (!this.bonusIntroImage) return;
    const layout = this.getBonusIntroLayout();
    this.layoutBackgroundImage(this.bonusIntroImage, BONUS_INTRO_SCALE);
    this.bonusIntroImage.setPosition(layout.centerX, layout.centerY);
    this.bonusIntroShade?.setPosition(layout.centerX, layout.centerY);
    this.bonusIntroSunGlow?.setPosition(layout.sunX, layout.sunY);
    this.bonusIntroBlueprintGlow?.setPosition(layout.blueprintX, layout.blueprintY);
    this.bonusIntroSparkles?.forEach((sparkle, index) => {
      const spec = BONUS_INTRO_SPARKLES[index];
      if (!spec) return;
      sparkle.setPosition(layout.blueprintX + spec.x, layout.blueprintY + spec.y);
    });
  }

  getBonusHoleLightLayout() {
    const centerX = GRID_OFFSET_X + GRID_WIDTH_PX / 2 + BONUS_HOLE_LIGHT_CENTER_OFFSET_X;
    const centerY = GRID_OFFSET_Y + GRID_HEIGHT_PX + BONUS_HOLE_LIGHT_CENTER_OFFSET_Y;
    const background = this.bonusBackground;
    const displayWidth = Math.max(1, background?.displayWidth || (background?.width * background?.scaleX) || 1);
    const displayHeight = Math.max(1, background?.displayHeight || (background?.height * background?.scaleY) || 1);
    const left = (background?.x || centerX) - displayWidth / 2;
    const top = (background?.y || centerY) - displayHeight / 2;
    return {
      centerX,
      centerY,
      uvX: Phaser.Math.Clamp((centerX - left) / displayWidth, 0.0, 1.0),
      uvY: Phaser.Math.Clamp(1 - ((centerY - top) / displayHeight), 0.0, 1.0),
    };
  }

  createBonusHoleLightFx() {
    if (!this.add.shader || !this.cache?.shader?.has?.("bonus_hole_light")) return;
    const frame = this.textures.getFrame("bonus_background");
    if (!frame?.width || !frame?.height) return;
    const shader = this.add.shader(
      "bonus_hole_light",
      this.bonusBackground.x,
      this.bonusBackground.y,
      frame.width,
      frame.height,
      ["bonus_torch_height", "bonus_torch_normal"],
      { repeat: false }
    );
    shader
      .setDepth(DEPTH.background + 0.5)
      .setVisible(false);
    this.bonusHoleLightShader = shader;
    this.layoutBonusHoleLightFx();
    this.resetBonusHoleLightFx();
  }

  layoutBonusHoleLightFx() {
    if (!this.bonusHoleLightShader) return;
    const layout = this.getBonusHoleLightLayout();
    this.bonusHoleLightShader
      .setPosition(this.bonusBackground.x, this.bonusBackground.y)
      .setScale(this.bonusBackground.scaleX, this.bonusBackground.scaleY)
      .setUniform("lightPos.value.x", layout.uvX)
      .setUniform("lightPos.value.y", layout.uvY);
  }

  resetBonusHoleLightFx() {
    this.bonusHoleLightFadeState.value = 0;
    this.bonusHoleLightPulseState.value = 0;
    if (!this.bonusHoleLightShader) return;
    this.bonusHoleLightShader
      .setUniform("sceneAlpha.value", 0)
      .setUniform("flare.value", 0);
  }

  startBonusHoleLightFlicker() {
    this.layoutBonusHoleLightFx();
  }

  stopBonusHoleLightFlicker() {
    this.bonusHoleLightPulseTween?.remove?.();
    this.bonusHoleLightPulseTween = null;
    this.bonusHoleLightPulseState.value = 0;
    this.bonusHoleLightShader?.setUniform("flare.value", 0);
  }

  setBonusHoleLightVisible(visible, { duration = 0 } = {}) {
    if (!this.bonusHoleLightShader) return Promise.resolve();
    if (visible) {
      this.layoutBonusHoleLightFx();
      this.bonusHoleLightShader.setVisible(true);
      this.startBonusHoleLightFlicker();
    } else {
      this.stopBonusHoleLightFlicker();
    }
    const targetValue = visible ? 1 : 0;
    if (!duration || !this.tweens) {
      this.bonusHoleLightFadeState.value = targetValue;
      this.bonusHoleLightShader
        .setUniform("sceneAlpha.value", targetValue)
        .setVisible(visible);
      return Promise.resolve();
    }
    return this.tweenPromise({
      targets: this.bonusHoleLightFadeState,
      value: targetValue,
      duration,
      ease: "Quad.easeInOut",
      onUpdate: () => {
        this.bonusHoleLightShader?.setUniform("sceneAlpha.value", this.bonusHoleLightFadeState.value);
      },
      onComplete: () => {
        this.bonusHoleLightShader?.setUniform("sceneAlpha.value", this.bonusHoleLightFadeState.value);
        if (!visible) this.bonusHoleLightShader?.setVisible(false);
      },
    });
  }

  pulseBonusHoleLight({ strength = 1 } = {}) {
    if (!this.bonusHoleLightShader?.visible || !this.tweens) return;
    const normalizedStrength = Phaser.Math.Clamp(Number(strength) || 1, 0.65, 1.65);
    this.bonusHoleLightPulseTween?.remove?.();
    this.bonusHoleLightPulseState.value = 0;
    this.bonusHoleLightShader.setUniform("flare.value", 0);
    this.bonusHoleLightPulseTween = this.tweens.add({
      targets: this.bonusHoleLightPulseState,
      value: normalizedStrength,
      duration: 180,
      yoyo: true,
      ease: "Sine.easeOut",
      onUpdate: () => {
        this.bonusHoleLightShader?.setUniform("flare.value", this.bonusHoleLightPulseState.value);
      },
      onComplete: () => {
        this.bonusHoleLightPulseState.value = 0;
        this.bonusHoleLightShader?.setUniform("flare.value", 0);
        this.bonusHoleLightPulseTween = null;
      },
    });
  }

  resetBonusIntroScene() {
    if (!this.bonusIntroImage) return;
    this.layoutBonusIntroScene();
    const baseScaleX = this.bonusIntroImage.scaleX;
    const baseScaleY = this.bonusIntroImage.scaleY;
    this.bonusIntroImage
      .setScale(baseScaleX, baseScaleY)
      .setAlpha(0);
    this.bonusIntroShade
      .setAlpha(0);
    this.bonusIntroSunGlow
      .setScale(1)
      .setAlpha(0);
    this.bonusIntroBlueprintGlow
      .setScale(1)
      .setAlpha(0);
    this.bonusIntroSparkles?.forEach((sparkle) => sparkle.setScale(1).setAlpha(0));
  }

  async presentBonusIntroScene() {
    this.resetBonusIntroScene();
    this.mainTheme?.stop();
    this.crushBackground?.setAlpha(0);
    const introImage = this.bonusIntroImage;
    if (!introImage) {
      this.startBonusTheme();
      await Promise.all([
        this.tweenPromise({ targets: this.background, alpha: 0, duration: 450 }),
        this.tweenPromise({ targets: this.bonusBackground, alpha: 1, duration: 450 }),
        this.setBonusHoleLightVisible(true, { duration: 450 }),
        this.fadeMainGameSymbols(0, 450),
      ]);
      return;
    }

    const introFxTargets = [
      this.bonusIntroShade,
      this.bonusIntroSunGlow,
      this.bonusIntroBlueprintGlow,
      ...this.bonusIntroSparkles,
    ].filter(Boolean);

    await Promise.all([
      this.tweenPromise({ targets: this.background, alpha: 0.08, duration: 420, ease: "Quad.easeInOut" }),
      this.tweenPromise({ targets: this.reelFrame, alpha: 0, duration: 420, ease: "Quad.easeInOut" }),
      this.fadeMainGameSymbols(0, 420),
      this.tweenPromise({ targets: introImage, alpha: 1, duration: 520, ease: "Quad.easeInOut" }),
      this.tweenPromise({ targets: this.bonusIntroShade, alpha: 0.52, duration: 520, ease: "Quad.easeInOut" }),
      this.tweenPromise({ targets: this.bonusIntroSunGlow, alpha: 0.24, duration: 560, ease: "Sine.easeOut" }),
      this.tweenPromise({
        targets: this.bonusIntroBlueprintGlow,
        alpha: 0.2,
        duration: 560,
        ease: "Sine.easeOut",
      }),
    ]);

    this.playRandomConstructionSfx();
    const sparkleMotion = this.bonusIntroSparkles.map((sparkle, index) => this.tweenPromise({
      targets: sparkle,
      alpha: 0.16 + (index % 2) * 0.06,
      x: sparkle.x + (index % 2 === 0 ? 14 : -12),
      y: sparkle.y - 20 - index * 2,
      scaleX: 1.15,
      scaleY: 1.15,
      delay: index * 55,
      duration: BONUS_INTRO_HOLD_MS - 160 + index * 40,
      ease: "Sine.easeInOut",
    }));
    await Promise.all([
      this.tweenPromise({
        targets: introImage,
        x: introImage.x + BONUS_INTRO_DRIFT_X,
        y: introImage.y + BONUS_INTRO_DRIFT_Y,
        scaleX: introImage.scaleX * 1.05,
        scaleY: introImage.scaleY * 1.05,
        duration: BONUS_INTRO_HOLD_MS,
        ease: "Sine.easeInOut",
      }),
      this.tweenPromise({
        targets: this.bonusIntroSunGlow,
        alpha: 0.34,
        scaleX: 1.12,
        scaleY: 1.08,
        duration: BONUS_INTRO_HOLD_MS,
        ease: "Sine.easeInOut",
      }),
      this.tweenPromise({
        targets: this.bonusIntroBlueprintGlow,
        alpha: 0.28,
        scaleX: 1.08,
        scaleY: 1.04,
        duration: BONUS_INTRO_HOLD_MS,
        ease: "Sine.easeInOut",
      }),
      ...sparkleMotion,
    ]);

    this.startBonusTheme();
    await Promise.all([
      this.tweenPromise({ targets: this.background, alpha: 0, duration: 420, ease: "Quad.easeInOut" }),
      this.tweenPromise({ targets: this.bonusBackground, alpha: 1, duration: 460, ease: "Quad.easeInOut" }),
      this.setBonusHoleLightVisible(true, { duration: 460 }),
      this.tweenPromise({ targets: this.reelFrame, alpha: 1, duration: 420, ease: "Quad.easeInOut" }),
      this.tweenPromise({ targets: introImage, alpha: 0, duration: 380, ease: "Quad.easeInOut" }),
      this.tweenPromise({ targets: introFxTargets, alpha: 0, duration: 340, ease: "Quad.easeInOut" }),
    ]);
    this.resetBonusIntroScene();
  }

  layoutDamageMeterChrome() {
    const centerX = GRID_OFFSET_X + GRID_WIDTH_PX / 2;
    const bottom = GRID_OFFSET_Y + GRID_HEIGHT_PX;
    if (this.damageMeterOrientation === "ouch") {
      if (this.damageMeterUsesOuchLadder) {
        this.damageMeterStatusText?.setPosition(
          GRID_OFFSET_X + GRID_WIDTH_PX / 2,
          GRID_OFFSET_Y + 16 + OUCH_UI_OFFSET_Y
        );
        return;
      }
      const railHeight = GRID_HEIGHT_PX - 28;
      const railX = GRID_OFFSET_X + 48;
      const railTop = GRID_OFFSET_Y + 14 + OUCH_UI_OFFSET_Y;
      this.damageMeterPanel?.setPosition(railX, railTop + railHeight / 2);
      this.damageMeterTitle?.setPosition(railX, railTop - 16);
      this.damageMeterStatusText?.setPosition(railX, railTop + railHeight + 17);
      return;
    }
    if (this.damageMeterLadder) {
      this.layoutBonusDamageMeterArt();
      return;
    }
    this.damageMeterPanel?.setPosition(centerX, bottom + 129);
    this.damageMeterTitle?.setPosition(centerX, bottom + 111);
    this.damageMeterStatusText?.setPosition(centerX, bottom + 151);
  }

  layoutOuchHud() {
    this.layoutDamageMeterChrome();
    this.layoutDamageMeter();
    this.layoutTrapPowerTexts(this.trapMeterState?.power ?? 0);
    const centerX = GRID_OFFSET_X + GRID_WIDTH_PX / 2;
    const bottom = GRID_OFFSET_Y + GRID_HEIGHT_PX;
    if (this.totalWinTitleText?.visible) {
      this.layoutTotalWinTexts();
    } else {
      this.countUpText?.setPosition(centerX, bottom + 46 + this.getOuchUiYOffset());
    }
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
    this.totalWinFormulaText
      ?.setPosition(layout.centerX, layout.amountY)
      .setFontSize(layout.titleFontSize);
    return layout;
  }

  getGridCellCenter(reel, row) {
    return getCellCenter(reel, row);
  }

  createSymbol(symbol, reel, row, startY = null, textureKey = null) {
    const center = getCellCenter(reel, row);
    const texture = textureKey
      || this.getAnimalEmotionTexture(symbol)
      || (this.textures.exists(String(symbol)) ? String(symbol) : "1");
    const x = center.x;
    const y = startY ?? center.y;
    const valueText = formatCashSymbolValue(symbol);
    if (!valueText) {
      const sprite = this.add.image(x, y, texture)
        .setScale(SYMBOL_SCALE)
        .setDepth(DEPTH.symbols);
      if (this.reelMask) sprite.setMask(this.reelMask);
      Object.assign(sprite, {
        symbolId: Number(symbol),
        reel,
        row,
        baseTextureKey: texture,
      });
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
    Object.assign(sprite, {
      symbolId: Number(symbol),
      reel,
      row,
      baseTextureKey: texture,
    });
    return sprite;
  }

  async slideOutOldSymbols() {
    this.clearHighlights();
    const sprites = this.reelSprites.flat().filter(Boolean);
    this.reelSprites = Array.from({ length: REELS }, () => Array(ROWS).fill(null));
    await Promise.all(sprites.map((sprite, index) => this.tweenPromise({
        targets: sprite,
        y: GRID_OFFSET_Y + GRID_HEIGHT_PX + CELL_SIZE * 1.5,
        alpha: 0,
        duration: 280,
        delay: index * 10,
        ease: "Cubic.easeIn",
        onComplete: () => sprite.destroy(),
      })));
    // The new board is always normal; keep the previous emotion until its sprites have exited.
    this.animalEmotion = "normal";
  }

  async dropSymbols(reels, { getTextureKey = null } = {}) {
    const tweens = [];
    for (let reel = 0; reel < REELS; reel += 1) {
      let playedReelLandSound = false;
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
          ease: SYMBOL_LAND_EASE,
          easeParams: SYMBOL_LAND_EASE_PARAMS,
          onStart: () => {
            if (playedReelLandSound) return;
            playedReelLandSound = true;
            this.playSfx(`land${reel + 1}`, { volume: 0.28 });
          },
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
    this.clearHighlights();
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
          ease: SYMBOL_LAND_EASE,
          easeParams: SYMBOL_LAND_EASE_PARAMS,
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
          ease: SYMBOL_LAND_EASE,
          easeParams: SYMBOL_LAND_EASE_PARAMS,
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

  createWinHighlightAura(sprite) {
    const texture = sprite.baseTextureKey
      || (this.textures.exists(String(sprite.symbolId)) ? String(sprite.symbolId) : null);
    if (!texture) return {};

    const makeGlow = ({ tint, alpha, scale }) => {
      const glow = this.add.image(sprite.x, sprite.y, texture)
        .setDepth(DEPTH.symbols - 1)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setAlpha(0)
        .setTint(tint)
        .setScale(scale);
      if (this.reelMask) glow.setMask(this.reelMask);
      this.highlightGlows.add(glow);
      glow.highlightBaseAlpha = alpha;
      glow.highlightBaseScale = scale;
      return glow;
    };

    const warmGlow = makeGlow({
      tint: 0xffe08a,
      alpha: 0.5,
      scale: SYMBOL_SCALE * 1.2,
    });
    const brightGlow = makeGlow({
      tint: 0xffffff,
      alpha: 0.88,
      scale: SYMBOL_SCALE * 1.12,
    });
    const crispGlow = makeGlow({
      tint: 0xffffff,
      alpha: 0.58,
      scale: SYMBOL_SCALE * 1.05,
    });

    return {
      warmGlow,
      brightGlow,
      crispGlow,
    };
  }

  async highlightWins(gameState) {
    const sprites = this.getWinPositions(gameState)
      .map(({ reel, row }) => this.reelSprites[reel]?.[row])
      .filter(Boolean);
    if (!sprites.length) return;
    this.playSfx("wins_highlight", { volume: 0.65 });

    const entries = sprites.map((sprite) => {
      sprite.setTint(0xffffff);
      this.highlightedSprites.add(sprite);
      const glow = this.createWinHighlightAura(sprite);
      return { sprite, ...glow };
    });

    await Promise.all(entries.map(({ sprite, warmGlow, brightGlow, crispGlow }, index) => {
      const delay = index * 5;
      const pop = () => Promise.all([
        this.tweenPromise({
          targets: sprite,
          scaleX: HIGHLIGHT_SYMBOL_POP_SCALE,
          scaleY: HIGHLIGHT_SYMBOL_POP_SCALE,
          duration: 78,
          delay,
          ease: "Quad.easeOut",
        }),
        ...(warmGlow ? [this.tweenPromise({
          targets: warmGlow,
          alpha: 0.62,
          scaleX: SYMBOL_SCALE * 1.25,
          scaleY: SYMBOL_SCALE * 1.25,
          duration: 76,
          delay,
          ease: "Quad.easeOut",
        })] : []),
        ...(brightGlow ? [this.tweenPromise({
          targets: brightGlow,
          alpha: 0.98,
          scaleX: SYMBOL_SCALE * 1.16,
          scaleY: SYMBOL_SCALE * 1.16,
          duration: 74,
          delay,
          ease: "Quad.easeOut",
        })] : []),
        ...(crispGlow ? [this.tweenPromise({
          targets: crispGlow,
          alpha: 0.84,
          scaleX: SYMBOL_SCALE * 1.08,
          scaleY: SYMBOL_SCALE * 1.08,
          duration: 68,
          delay,
          ease: "Quad.easeOut",
        })] : []),
      ]);
      const settleTweens = [
        this.tweenPromise({
          targets: sprite,
          scaleX: HIGHLIGHT_SYMBOL_SCALE,
          scaleY: HIGHLIGHT_SYMBOL_SCALE,
          duration: 95,
          ease: "Quad.easeOut",
        }),
      ];
      if (warmGlow) {
        settleTweens.push(this.tweenPromise({
          targets: warmGlow,
          alpha: warmGlow.highlightBaseAlpha,
          scaleX: warmGlow.highlightBaseScale,
          scaleY: warmGlow.highlightBaseScale,
          duration: 118,
          ease: "Quad.easeOut",
        }));
      }
      if (brightGlow) {
        settleTweens.push(this.tweenPromise({
          targets: brightGlow,
          alpha: brightGlow.highlightBaseAlpha,
          scaleX: brightGlow.highlightBaseScale,
          scaleY: brightGlow.highlightBaseScale,
          duration: 110,
          ease: "Quad.easeOut",
        }));
      }
      if (crispGlow) {
        settleTweens.push(this.tweenPromise({
          targets: crispGlow,
          alpha: crispGlow.highlightBaseAlpha,
          scaleX: crispGlow.highlightBaseScale,
          scaleY: crispGlow.highlightBaseScale,
          duration: 96,
          ease: "Quad.easeOut",
        }));
      }
      const settle = () => Promise.all(settleTweens);
      return pop().then(settle);
    }));
  }

  clearHighlights() {
    this.highlightedSprites.forEach((sprite) => {
      if (!sprite.destroyed) sprite.clearTint().setScale(SYMBOL_SCALE);
    });
    this.highlightedSprites.clear();
    this.highlightGlows.forEach((glow) => {
      if (!glow.destroyed) glow.destroy();
    });
    this.highlightGlows.clear();
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

  launchAngerMeterOrb(fromX, fromY, target, delay = 0, { lead = false } = {}) {
    const colors = lead ? [0xfff0a1, 0xff7b22, 0x7a1209] : [0xff5a1f, 0xff8f3f, 0xff2d00];
    const orb = this.add.circle(fromX, fromY, lead ? 9 : Phaser.Math.Between(4, 7), colors[0], 0.96)
      .setDepth(DEPTH.angerVfx)
      .setBlendMode(Phaser.BlendModes.ADD);
    const stopTrail = this.attachMotionTrail(orb, {
      color: lead ? 0xffc04e : colors[1],
      radius: lead ? 7 : Phaser.Math.Between(3, 5),
      depth: DEPTH.angerVfx,
      intervalMs: lead ? 10 : 14,
      fadeMs: lead ? 280 : 200,
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
      duration: lead ? 430 : Phaser.Math.Between(360, 460),
      ease: "Cubic.easeInOut",
      onUpdate: () => {
        curve.getPoint(travel.t, point);
        orb.setPosition(point.x, point.y).setScale((lead ? 1 : 0.8) + travel.t * (lead ? 0.9 : 0.7));
        orb.setFillStyle(colors[travel.t > 0.65 ? 2 : 1], 0.95 - travel.t * 0.2);
      },
      onComplete: () => {
        stopTrail();
        orb.destroy();
      },
    });
  }

  createAngerMeterArc(fromX, fromY, target) {
    const controlX = (fromX + target.x) * 0.5 + Phaser.Math.Between(-18, 18);
    const controlY = fromY + (target.y - fromY) * 0.42 - Phaser.Math.Between(40, 78);
    const curve = new Phaser.Curves.QuadraticBezier(
      new Phaser.Math.Vector2(fromX, fromY),
      new Phaser.Math.Vector2(controlX, controlY),
      new Phaser.Math.Vector2(target.x, target.y)
    );
    const glow = this.add.graphics().setDepth(DEPTH.angerVfx - 1).setBlendMode(Phaser.BlendModes.ADD);
    const core = this.add.graphics().setDepth(DEPTH.angerVfx).setBlendMode(Phaser.BlendModes.ADD);
    const points = curve.getPoints(22);
    glow.lineStyle(10, 0xff4d1d, 0.22);
    core.lineStyle(3, 0xffd166, 0.92);
    [glow, core].forEach((graphic) => {
      graphic.beginPath();
      graphic.moveTo(points[0].x, points[0].y);
      points.slice(1).forEach((point) => graphic.lineTo(point.x, point.y));
      graphic.strokePath();
    });
    this.tweenPromise({
      targets: [glow, core],
      alpha: 0,
      delay: 210,
      duration: 260,
      ease: "Quad.easeOut",
      onComplete: () => {
        glow.destroy();
        core.destroy();
      },
    });
  }

  async presentAngerMeterCollectConfirm(target) {
    const flash = this.add.circle(target.x, target.y, 10, 0xfff3b0, 0.95)
      .setDepth(DEPTH.angerVfx + 1)
      .setBlendMode(Phaser.BlendModes.ADD);
    const ring = this.add.circle(target.x, target.y, 8, 0xff7a22, 0)
      .setStrokeStyle(4, 0xffd166, 1)
      .setDepth(DEPTH.angerVfx + 1)
      .setBlendMode(Phaser.BlendModes.ADD);
    const label = this.add.text(target.x, target.y - 16, "ANGER +1", {
      fontFamily: "Arial Black, Arial, sans-serif",
      fontSize: "13px",
      color: "#fff0a6",
      stroke: "#7a1209",
      strokeThickness: 4,
    }).setOrigin(0.5).setDepth(DEPTH.angerVfx + 2).setBlendMode(Phaser.BlendModes.ADD);
    const sparks = this.spawnAngerImpactSpark(target.x, target.y, { weak: false });
    this.cameras.main.shake(75, 0.0035);
    await Promise.all([
      sparks,
      this.tweenPromise({
        targets: flash,
        scaleX: 3.1,
        scaleY: 3.1,
        alpha: 0,
        duration: 210,
        ease: "Quad.easeOut",
        onComplete: () => flash.destroy(),
      }),
      this.tweenPromise({
        targets: ring,
        radius: 30,
        alpha: 0,
        duration: 280,
        ease: "Cubic.easeOut",
        onComplete: () => ring.destroy(),
      }),
      this.tweenPromise({
        targets: label,
        y: target.y - 42,
        scaleX: 1.18,
        scaleY: 1.18,
        alpha: 0,
        duration: 420,
        ease: "Cubic.easeOut",
        onComplete: () => label.destroy(),
      }),
    ]);
  }

  async launchAngerMeterStream(fromX, fromY, targetSegmentIndex = 0, { weak = false, orbStagger = 38 } = {}) {
    const target = this.getAngerSegmentTarget(targetSegmentIndex);
    const streamCount = weak ? 3 : 4;
    if (!weak) this.createAngerMeterArc(fromX, fromY, target);
    await Promise.all(Array.from({ length: streamCount }, (_, index) => (
      this.launchAngerMeterOrb(fromX, fromY, target, index * orbStagger, { lead: !weak && index === 0 })
    )));
    if (weak) {
      await this.spawnAngerImpactSpark(target.x, target.y, { weak: true });
    } else {
      await this.presentAngerMeterCollectConfirm(target);
    }
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
      const fast = this.fastForwardRequested;
      await this.waitForPresentation(fast ? 40 : 70, { skippable: !fast });
    }
  }

  async presentAnimalKillAngerOvercharge() {
    const start = Number(this.angerMeterState?.count) || 0;
    if (start >= ANGER_SEGMENT_COUNT) return;

    const fast = this.fastForwardRequested;
    const stepCount = ANGER_SEGMENT_COUNT - start;
    await this.waitForPresentation(fast ? 80 : 180, { skippable: !fast });

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
        await this.waitForPresentation(fast ? 140 : 420, { skippable: !fast });
        continue;
      }

      const progress = step / Math.max(1, stepCount - 2);
      const eased = progress * progress * progress;
      const waitMs = Phaser.Math.Linear(280, 32, eased);
      await this.waitForPresentation(
        fast ? Math.max(48, waitMs * 0.22) : waitMs,
        { skippable: !fast }
      );
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

  stopAngerBonusPulse() {
    if (this.angerBonusPulseTween) {
      this.angerBonusPulseTween.stop();
      this.angerBonusPulseTween.remove();
      this.angerBonusPulseTween = null;
    }
  }

  syncAngerBonusBadge(count = 0, max = ANGER_SEGMENT_COUNT) {
    const bonusReady = Number(count) >= Math.max(1, Number(max) || ANGER_SEGMENT_COUNT);
    const badge = this.angerBonusBadge;
    if (!badge) return;

    if (!bonusReady) {
      this.stopAngerBonusPulse();
      badge
        .setColor("#a96648")
        .setBackgroundColor("#351712")
        .setScale(1)
        .setAlpha(0.86);
      return;
    }

    badge
      .setColor("#fff2a8")
      .setBackgroundColor("#a62d18")
      .setAlpha(1);
    if (this.angerBonusPulseTween || !this.tweens) return;
    this.angerBonusPulseTween = this.tweens.add({
      targets: badge,
      scaleX: 1.12,
      scaleY: 1.12,
      alpha: 0.72,
      duration: 190,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
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
    const fast = this.fastForwardRequested;
    this.cameras.main.shake(fast ? 90 : 180, 0.006);
    const duration = fast ? Math.min(160, teaseMs) : teaseMs;
    await this.waitForPresentation(duration, { skippable: !fast });
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

  async collectStompCoinsToWin(targetWin = null, { fast = false } = {}) {
    await this.waitForStompCoinSettling();

    const coins = [...(this.stompCoinsRegistry || [])].filter((coin) => coin?.active);
    this.stompCoinsRegistry?.clear();
    this.stompLandedCoins = [];
    if (!coins.length || !this.countUpText) return;

    const now = performance.now();
    const settleHoldMs = fast ? 48 : 180;
    const restMs = Math.max(
      0,
      ...coins.map((coin) => settleHoldMs - (now - (coin.getData("landedAt") || now)))
    );
    await this.waitForPresentation(restMs, { skippable: true });

    const targetX = this.countUpText.x;
    const targetY = this.countUpText.y;
    const resolvedTarget = targetWin === null
      ? null
      : this.clampToWinCap(Number(targetWin) || 0);
    const coinValues = coins.map((coin) => Number(coin.getData("coinValue")) || 0);
    const coinTotal = coinValues.reduce((sum, value) => sum + value, 0);
    let collectedValue = this.clampToWinCap(this.currentWin);
    if (resolvedTarget !== null && coinTotal > 0) {
      const scale = (resolvedTarget - collectedValue) / coinTotal;
      coinValues.forEach((value, index) => {
        coins[index].setData("coinValue", Number((value * scale).toFixed(8)));
      });
    }

    const coinDuration = fast ? 120 : 260;
    const coinDelay = fast ? 8 : 22;
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
        duration: coinDuration,
        delay: index * coinDelay,
        ease: "Cubic.easeIn",
        onComplete: () => {
          this.playSfx("wins_payout", { volume: 0.55 });
          if (coinValue > 0) {
            collectedValue = this.clampToWinCap(Number((collectedValue + coinValue).toFixed(2)));
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
    this.currentWin = this.clampToWinCap(collectedValue);

    if (collectedValue > 0) {
      await this.tweenPromise({
        targets: this.countUpText,
        scaleX: 1.14,
        scaleY: 1.14,
        duration: fast ? 48 : 90,
        yoyo: true,
        ease: fast ? "Quad.easeOut" : "Back.easeOut",
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
      this.damageMeterUsesOuchLadder ? this.damageMeterLadder : null,
      this.damageMeterUsesOuchLadder ? this.damageMeterFoot : null,
      ...(this.damageMeterUsesOuchLadder
        ? this.damageMeterEntries.map((entry) => entry.numberSprite).filter(Boolean)
        : []),
      this.ouchGear,
      ...sprites,
    ].filter(Boolean);
  }

  getAnimalEmotionTexture(symbol, emotion = this.animalEmotion) {
    if (!ANIMAL_SYMBOLS.has(Number(symbol)) || !emotion || emotion === "normal") return null;
    const texture = `animal_${Number(symbol)}_${emotion}`;
    return this.textures.exists(texture) ? texture : null;
  }

  async crossfadeAnimalEmotion(emotion = "normal", { excludeCells = [], duration = 120 } = {}) {
    const excluded = new Set((excludeCells || []).map((cell) => `${Number(cell.reel)}:${Number(cell.row)}`));
    const swaps = this.reelSprites.flat().filter((sprite) => (
      sprite?.active
      && ANIMAL_SYMBOLS.has(Number(sprite.symbolId))
      && !excluded.has(`${Number(sprite.reel)}:${Number(sprite.row)}`)
    )).map((sprite) => {
      const texture = this.getAnimalEmotionTexture(sprite.symbolId, emotion)
        || String(sprite.symbolId);
      if (sprite.baseTextureKey === texture) return Promise.resolve();
      const replacement = this.add.image(sprite.x, sprite.y, texture)
        .setScale(sprite.scaleX, sprite.scaleY)
        .setDepth(sprite.depth)
        .setAngle(sprite.angle)
        .setAlpha(0)
        .setFlip(sprite.flipX, sprite.flipY);
      if (this.reelMask) replacement.setMask(this.reelMask);
      Object.assign(replacement, {
        symbolId: sprite.symbolId,
        reel: sprite.reel,
        row: sprite.row,
        baseTextureKey: texture,
      });
      this.reelSprites[sprite.reel][sprite.row] = replacement;
      return Promise.all([
        this.tweenPromise({ targets: sprite, alpha: 0, duration, ease: "Quad.easeIn" }),
        this.tweenPromise({ targets: replacement, alpha: 1, duration, ease: "Quad.easeOut" }),
      ]).then(() => sprite.destroy());
    });
    this.animalEmotion = emotion;
    await Promise.all(swaps);
  }

  async resolveAnimalAngerMood(bonusTriggered = false) {
    if (bonusTriggered) {
      this.animalEmotion = "angry";
      return;
    }
    // Keep survivors scared/angry until the next spin removes their existing sprites.
  }

  async scrollOuchPit(deltaY = undefined, { fast = false } = {}) {
    const shift = Number(deltaY)
      || (this.damageMeterUsesOuchLadder ? this.damageMeterLadderLayout?.stepGap : 0)
      || OUCH_PIT_STEP_DELTA_Y;
    this.ouchScrollY += shift;
    const targets = this.getOuchScrollTargets();
    await Promise.all(targets.map((target) => this.tweenPromise({
      targets: target,
      y: target.y - shift,
      duration: fast ? 78 : 165,
      ease: "Cubic.easeInOut",
      onUpdate: () => this.refreshOuchTrapRig(),
    })));
    this.refreshOuchTrapRig();
    this.cameras.main.shake(fast ? 44 : 105, fast ? 0.0028 : 0.005);
  }

  resetOuchPitScroll() {
    if (!this.ouchScrollY) return;
    const shift = this.ouchScrollY;
    this.getOuchScrollTargets().forEach((target) => {
      target.y += shift;
    });
    this.ouchScrollY = 0;
    this.refreshOuchTrapRig();
  }

  createOuchTrapRig(impact = {}) {
    this.destroyOuchTrapRig();
    const foot = impact?.foot || this.ouchFoot;
    if (!foot?.active) return;

    const footWidth = Number(impact?.footWidth) || GRID_WIDTH_PX;
    this.ouchTrapImpact = { ...impact, foot, footWidth };
    this.ouchTrapTension = 0.2;
    // The supplied Ouch foot already contains the complete rope snare. The
    // background now owns the winches, so only dust and the foot motion sell
    // the pull; do not add a second foreground rope/gear rig.
  }

  refreshOuchTrapRig() {
    const foot = this.ouchTrapImpact?.foot || this.ouchFoot;
    const gear = this.ouchGear;
    const snare = this.ouchSnare;
    const rope = this.ouchRope;
    if (!foot?.active || !gear?.active || !snare?.active || !rope?.active) return;

    const footWidth = Number(this.ouchTrapImpact?.footWidth) || GRID_WIDTH_PX;
    const snareX = foot.x - footWidth * 0.04;
    const snareY = foot.y + footWidth * 0.06;
    snare.setPosition(snareX, snareY);

    // The winch sits below and beside the stomp. Its rope runs up from beneath
    // the foot, so the pull reads as the trap dragging the giant downward.
    const startX = gear.x - gear.displayWidth * 0.18;
    const startY = gear.y - gear.displayHeight * 0.12;
    const endX = snareX + snare.displayWidth * 0.28;
    const endY = snareY + snare.displayHeight * 0.28;
    const sag = (1 - Phaser.Math.Clamp(this.ouchTrapTension || 0, 0, 1)) * 24;
    const controlX = (startX + endX) / 2 - 8;
    const controlY = (startY + endY) / 2 + sag;
    rope.clear();
    rope.lineStyle(7, 0x351308, 0.96);
    rope.beginPath();
    rope.moveTo(startX, startY);
    rope.lineTo(controlX, controlY);
    rope.lineTo(endX, endY);
    rope.strokePath();
    rope.lineStyle(3, 0xe59a32, 0.95);
    rope.beginPath();
    rope.moveTo(startX, startY - 1);
    rope.lineTo(controlX, controlY - 1);
    rope.lineTo(endX, endY - 1);
    rope.strokePath();
  }

  destroyOuchTrapRig() {
    this.ouchGear?.destroy();
    this.ouchSnare?.destroy();
    this.ouchRope?.destroy();
    this.ouchGear = null;
    this.ouchSnare = null;
    this.ouchRope = null;
    this.ouchTrapImpact = null;
    this.ouchTrapTension = 0;
  }

  async moveOuchLadderFootToIndex(index = 0, { fast = false } = {}) {
    if (!this.damageMeterUsesOuchLadder || !this.damageMeterFoot) return;
    const slot = this.damageMeterSlots?.[index];
    if (!slot) return;
    this.damageMeterLadderDisplayIndex = index;
    await this.tweenPromise({
      targets: this.damageMeterFoot,
      x: slot.x,
      // The pit and ladder scroll after every success. Target the rung in its
      // current scrolled position so the arrow stays on that same rung.
      y: slot.footY - this.ouchScrollY,
      duration: fast ? 58 : 170,
      ease: "Cubic.easeInOut",
      onUpdate: () => this.refreshOuchTrapRig(),
    });
    if (this.isPostBonusOuch) {
      // Do not reveal the new multiplier below the foot until its arrow has
      // physically reached the confirmed rung.
      this.ouchTrapPowerMultiplierIndex = index;
      this.refreshTrapPowerDisplay();
    }
    this.refreshOuchTrapRig();
  }

  async presentOuchTrapStruggle(stepNumber = 1, impact = {}) {
    if (!this.damageMeterUsesOuchLadder || this.fastForwardRequested) return;
    const foot = impact?.foot || this.ouchFoot;
    if (!foot?.active) return;
    const marker = this.damageMeterFoot?.active ? this.damageMeterFoot : null;
    const footY = foot.y;
    const markerY = marker?.y;
    const footWidth = Number(impact?.footWidth) || GRID_WIDTH_PX;
    const tug = async (pullNumber) => {
      this.setDamageMeterStatus(`NOW PULL! ${pullNumber}/3`, "#ffd166");
      this.spawnOuchPullDust(foot, footWidth, pullNumber);
      this.playRandomConstructionSfx();
      await Promise.all([
        this.tweenPromise({
          targets: foot,
          y: footY + 9 + pullNumber * 2,
          duration: 105,
          ease: "Quad.easeIn",
        }),
        marker ? this.tweenPromise({
          targets: marker,
          y: markerY + 7 + pullNumber * 2,
          duration: 105,
          ease: "Quad.easeIn",
        }) : Promise.resolve(),
      ]);
      await this.waitForPresentation(82, { skippable: true });
      await Promise.all([
        this.tweenPromise({
          targets: foot,
          y: footY - 5,
          duration: 92,
          ease: "Quad.easeOut",
        }),
        marker ? this.tweenPromise({
          targets: marker,
          y: markerY - 4,
          duration: 92,
          ease: "Quad.easeOut",
        }) : Promise.resolve(),
      ]);
    };

    this.setDamageMeterStatus(stepNumber > 1 ? "THE GIANT FIGHTS BACK!" : "TRAP PULLS TIGHT!", "#ffd166");
    await tug(1);
    await tug(2);
    await tug(3);
  }

  async presentOuchTrapRecoil() {
    const foot = this.ouchFoot;
    if (!foot?.active) return;
    this.spawnOuchPullDust(foot, this.ouchTrapImpact?.footWidth || GRID_WIDTH_PX, 4);
    await this.tweenPromise({
      targets: foot,
      y: foot.y - 12,
      duration: 180,
      ease: "Quad.easeOut",
    });
    this.setDamageMeterStatus("THE GIANT RIPS FREE!", "#ff8585");
  }

  spawnOuchPullDust(foot, footWidth = GRID_WIDTH_PX, pullNumber = 1) {
    if (!foot?.active) return;
    const colors = [0x6e4829, 0x9a6a3d, 0xc79758, 0xe0bb78];
    const dustY = foot.y + footWidth * 0.35;
    for (let index = 0; index < 10; index += 1) {
      const side = index % 2 === 0 ? -1 : 1;
      const dust = this.add.ellipse(
        foot.x + side * footWidth * Phaser.Math.FloatBetween(0.36, 0.52),
        dustY + Phaser.Math.Between(-22, 24),
        Phaser.Math.Between(10, 22),
        Phaser.Math.Between(7, 15),
        colors[index % colors.length],
        0.66
      ).setDepth(DEPTH.stompVfx - 1);
      this.tweenPromise({
        targets: dust,
        x: dust.x + side * Phaser.Math.Between(12, 38),
        y: dust.y + Phaser.Math.Between(18, 54),
        scaleX: Phaser.Math.FloatBetween(1.4, 2.2),
        scaleY: Phaser.Math.FloatBetween(1.2, 1.8),
        alpha: 0,
        delay: index * 14 + pullNumber * 8,
        duration: Phaser.Math.Between(230, 380),
        ease: "Quad.easeOut",
        onComplete: () => dust.destroy(),
      });
    }
  }

  async spawnOuchWinCoins(centerX, centerY, count = 1, totalWin = 0, { fast = false } = {}) {
    const coinCount = Math.max(1, Number(count) || 1);
    const winTotal = Number(totalWin) || 0;
    const coinValues = distributeMoneyAmount(winTotal, coinCount);
    this.ensureCoinAnimation();
    if (!this.anims.exists("yellow_coin_spin")) return Promise.resolve();

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
        horizontalSpread: Phaser.Math.Between(fast ? 60 : 80, fast ? 110 : 150),
        launchHeight: Phaser.Math.Between(fast ? 80 : 120, fast ? 130 : 180),
        riseDuration: Phaser.Math.Between(fast ? 90 : 140, fast ? 120 : 190),
        fallDuration: Phaser.Math.Between(fast ? 160 : 280, fast ? 220 : 380),
        trailColor: 0xffd24a,
        trailRadius: Phaser.Math.Between(3, 6),
        spinSpeed: Phaser.Math.Between(300, 560),
        settleMode: "rest",
        onSettle: (landedCoin) => this.registerStompCoin(landedCoin),
      })));
    }
    return Promise.allSettled(launches);
  }

  enqueueOuchCoinCollection(coinLaunchPromise, targetWin = 0) {
    this.ouchCoinCollectQueue = (this.ouchCoinCollectQueue || Promise.resolve())
      .then(() => coinLaunchPromise)
      .then(() => this.collectStompCoinsToWin(targetWin, { fast: true }));
    return this.ouchCoinCollectQueue;
  }

  async flushOuchCoinCollection() {
    if (!this.ouchCoinCollectQueue) return;
    try {
      await this.ouchCoinCollectQueue;
    } finally {
      this.ouchCoinCollectQueue = null;
    }
  }

  async presentOuchDamageMeterCharge(stepNumber = 1, leadInMs = 0, { fast = false } = {}) {
    const activeIndex = this.damageMeterActiveIndex ?? 0;
    const activeEntry = this.damageMeterEntries[activeIndex];
    if (this.damageMeterUsesOuchLadder) return;
    if (!activeEntry) {
      if (leadInMs > 0) {
        await this.waitForPresentation(leadInMs, { skippable: true });
      }
      return;
    }

    if (fast) {
      this.setDamageMeterStatus("BANKED STOMP", "#ffe7a6");
      const accentTargets = [activeEntry.marker, activeEntry.label].filter(Boolean);
      await Promise.all(accentTargets.map((target) => this.tweenPromise({
        targets: target,
        alpha: 0.55,
        scaleX: target.scaleX * 1.06,
        scaleY: target.scaleY * 1.06,
        duration: 34,
        yoyo: true,
        ease: "Quad.easeOut",
        onComplete: () => target.setAlpha(1),
      })));
      this.applyDamageMeterHighlight(activeIndex);
      return;
    }

    const isContinuation = stepNumber > 1;
    const chargeMs = Math.max(
      isContinuation ? 720 : 420,
      Math.max(0, Number(leadInMs) || 0)
    );
    const pulseCount = isContinuation ? 5 : 3;
    const introWait = Math.round(chargeMs * (isContinuation ? 0.34 : 0.22));
    const pulseMs = Math.max(72, Math.round((chargeMs - introWait) / pulseCount));
    this.setDamageMeterStatus(
      isContinuation ? "WILL IT GO DEEPER?" : "FIRST STOMP • GUARANTEED",
      isContinuation ? "#ffd166" : "#b6ffce"
    );
    if (introWait > 0) {
      await this.waitForPresentation(introWait, { skippable: true });
    }

    const accentTargets = [activeEntry.marker, activeEntry.label].filter(Boolean);
    for (let index = 0; index < pulseCount; index += 1) {
      const pulseScale = 1.05 + index * (isContinuation ? 0.035 : 0.025);
      await Promise.all([
        ...accentTargets.map((target) => this.tweenPromise({
          targets: target,
          alpha: 0.24,
          scaleX: target.scaleX * pulseScale,
          scaleY: target.scaleY * pulseScale,
          duration: Math.max(42, Math.round(pulseMs / 2)),
          yoyo: true,
          ease: "Sine.easeInOut",
          onComplete: () => {
            target.setAlpha(1);
          },
        })),
        this.tweenPromise({
          targets: this.countUpText,
          alpha: 0.66,
          duration: Math.max(42, Math.round(pulseMs / 2)),
          yoyo: true,
          ease: "Sine.easeInOut",
          onComplete: () => this.countUpText?.setAlpha(1),
        }),
      ]);
      const isFinalPulse = index === pulseCount - 1;
      if (isFinalPulse && isContinuation) {
        this.cameras.main.shake(82, 0.0022);
      } else if (isFinalPulse) {
        this.cameras.main.shake(52, 0.0014);
      }
      this.applyDamageMeterHighlight(activeIndex);
    }
  }

  spawnOuchDrawSuccessStars(entry) {
    if (!entry?.marker) return Promise.resolve();
    const colors = [0xffffff, 0xffdf70, 0xd8ff9b, 0xffb347];
    const stars = Array.from({ length: 10 }, (_, index) => {
      const star = this.add.star(
        entry.marker.x + Phaser.Math.Between(-18, 18),
        entry.marker.y + Phaser.Math.Between(-5, 5),
        4,
        Phaser.Math.Between(2, 3),
        Phaser.Math.Between(5, 8),
        colors[index % colors.length],
        1
      )
        .setDepth(DEPTH.ui + 3)
        .setBlendMode(Phaser.BlendModes.ADD);
      const angle = Phaser.Math.DegToRad(-165 + index * 33);
      return this.tweenPromise({
        targets: star,
        x: star.x + Math.cos(angle) * Phaser.Math.Between(18, 42),
        y: star.y + Math.sin(angle) * Phaser.Math.Between(14, 38),
        scaleX: Phaser.Math.FloatBetween(1.25, 2),
        scaleY: Phaser.Math.FloatBetween(1.25, 2),
        alpha: 0,
        angle: Phaser.Math.Between(-80, 80),
        delay: index * 14,
        duration: Phaser.Math.Between(190, 300),
        ease: "Quad.easeOut",
        onComplete: () => star.destroy(),
      });
    });
    return Promise.all(stars);
  }

  spawnOuchDepthArrows(entry) {
    if (!entry?.marker) return Promise.resolve();
    const railTop = GRID_OFFSET_Y + 14 + OUCH_UI_OFFSET_Y;
    const targetY = entry.marker.y - entry.marker.height * 0.55;
    const startY = Math.max(railTop - 4, targetY - 28);
    const arrows = Array.from({ length: 3 }, (_, index) => {
      const arrow = this.add.text(entry.marker.x, startY - index * 7, "▼", {
        fontFamily: "Arial Black, Arial",
        fontSize: "14px",
        color: "#fff4a8",
        stroke: "#5d3b0c",
        strokeThickness: 2,
      })
        .setOrigin(0.5)
        .setDepth(DEPTH.ui + 3)
        .setAlpha(0);
      return this.tweenPromise({
        targets: arrow,
        y: targetY + 5,
        alpha: 1,
        scaleX: 1.12,
        scaleY: 1.12,
        delay: index * 54,
        duration: 150,
        ease: "Quad.easeIn",
      }).then(() => this.tweenPromise({
        targets: arrow,
        alpha: 0,
        y: targetY + 13,
        duration: 90,
        ease: "Quad.easeOut",
        onComplete: () => arrow.destroy(),
      }));
    });
    return Promise.all(arrows);
  }

  async presentOuchDrawSuccess(activeIndex = this.damageMeterActiveIndex ?? 0) {
    const entry = this.damageMeterEntries[activeIndex];
    if (!entry) return;
    const multiplier = Number(entry.value) || 1;
    this.setDamageMeterStatus(`DEEPER! • ${multiplier}x`, "#f8ffbd");
    if (this.fastForwardRequested) {
      this.applyDamageMeterHighlight(activeIndex);
      return;
    }

    entry.marker
      ?.setFillStyle(0xffffff, 1)
      .setStrokeStyle(3, 0xffee8a, 1)
      .setAlpha(1);
    entry.label?.setColor("#1b2a18").setAlpha(1).setScale(1.16);
    this.playSfx("wins_explode", { volume: 0.56 });
    const confirmationTweens = [
      entry.marker ? this.tweenPromise({
        targets: entry.marker,
        scaleX: entry.marker.scaleX * 1.22,
        scaleY: entry.marker.scaleY * 1.22,
        duration: 105,
        yoyo: true,
        ease: "Back.easeOut",
      }) : null,
      entry.label ? this.tweenPromise({
        targets: entry.label,
        scaleX: entry.label.scaleX * 1.18,
        scaleY: entry.label.scaleY * 1.18,
        duration: 105,
        yoyo: true,
        ease: "Back.easeOut",
      }) : null,
    ].filter(Boolean);
    await Promise.all([
      ...confirmationTweens,
      this.spawnOuchDrawSuccessStars(entry),
      this.spawnOuchDepthArrows(entry),
    ]);
    this.applyDamageMeterHighlight(activeIndex);
  }

  async presentOuchStompStopReveal(finalIndex = 0) {
    const nextEntry = this.damageMeterEntries[finalIndex + 1];
    if (!nextEntry) return false;
    this.setDamageMeterStatus("STOMP STOPS", "#ff8585");
    nextEntry.marker
      ?.setFillStyle(0x5e1118, 0.98)
      .setStrokeStyle(3, 0xff505f, 1)
      .setAlpha(1);
    nextEntry.label?.setColor("#ffe2e5").setAlpha(1).setScale(1.14);
    this.cameras.main.shake(130, 0.006);
    await Promise.all([nextEntry.marker, nextEntry.label].filter(Boolean).map((target) => this.tweenPromise({
      targets: target,
      scaleX: target.scaleX * 1.16,
      scaleY: target.scaleY * 1.16,
      duration: 130,
      yoyo: true,
      repeat: 1,
      ease: "Quad.easeOut",
    })));
    await this.waitForPresentation(340, { skippable: true });
    return true;
  }

  async presentOuchMaxDepthReveal() {
    const lastEntry = this.damageMeterEntries[this.damageMeterEntries.length - 1];
    if (!lastEntry) return;
    this.setDamageMeterStatus("MAX DEPTH!", "#fff0a8");
    await this.pulseDamageMeterHighlight(this.damageMeterEntries.length - 1);
    this.cameras.main.shake(120, 0.004);
    await this.waitForPresentation(280, { skippable: true });
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
    const snaredFoot = this.add.image(bounds.centerX, impactY, "ouch_snared_foot")
      .setDepth(DEPTH.stomp)
      .setScale(foot.scaleX, foot.scaleY)
      .setAlpha(0);
    await Promise.all([
      this.tweenPromise({ targets: foot, alpha: 0, duration: 110, ease: "Quad.easeIn" }),
      this.tweenPromise({ targets: snaredFoot, alpha: 0.98, duration: 110, ease: "Quad.easeOut" }),
    ]);
    foot.destroy();
    this.ouchFoot = snaredFoot;
    const impact = { foot: snaredFoot, impactY, footWidth, footScale, bounds };
    this.createOuchTrapRig(impact);
    this.layoutTrapPowerTexts(this.trapMeterState?.power ?? 0);
    return impact;
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

  ensureOuchFadeOverlay() {
    if (this.ouchFadeOverlay && !this.ouchFadeOverlay.destroyed) {
      return this.ouchFadeOverlay;
    }
    const camera = this.cameras.main;
    const width = Math.max(camera.width, this.scale.width) * 2.4;
    const height = Math.max(camera.height, this.scale.height) * 2.4;
    this.ouchFadeOverlay = this.add.rectangle(
      camera.midPoint.x + camera.scrollX,
      camera.midPoint.y + camera.scrollY,
      width,
      height,
      0x000000,
      1
    )
      .setDepth(DEPTH.ui + 60)
      .setAlpha(0)
      .setVisible(false);
    return this.ouchFadeOverlay;
  }

  spawnOuchBloodPour(centerX, centerY) {
    const groundY = this.getStompGroundY(centerY) + 48;
    this.spawnBloodBurst(centerX, centerY, groundY, 34);
    this.spawnBloodBurst(
      centerX + Phaser.Math.Between(-36, 36),
      centerY + Phaser.Math.Between(4, 18),
      groundY,
      26
    );
    this.spawnGibs(centerX, centerY, groundY, 16);
    for (let index = 0; index < 28; index += 1) {
      this.time?.delayedCall(index * 42, () => {
        const x = centerX + Phaser.Math.Between(-54, 54);
        const drop = this.add.circle(
          x,
          centerY + Phaser.Math.Between(-8, 20),
          Phaser.Math.Between(4, 10),
          Phaser.Math.RND.pick([0x8b0000, 0xc41b1b, 0xff2a2a, 0x5d0f0f]),
          0.94
        ).setDepth(DEPTH.stompVfx + 1);
        this.tweenPromise({
          targets: drop,
          y: groundY + Phaser.Math.Between(24, 96),
          x: x + Phaser.Math.Between(-22, 22),
          alpha: 0,
          scale: Phaser.Math.FloatBetween(1.1, 2.2),
          duration: Phaser.Math.Between(360, 680),
          ease: "Quad.easeIn",
          onComplete: () => drop.destroy(),
        });
      });
    }
  }

  playOuchLegPullScream() {
    this.stopOuchLaughSfx();
    GIANT_PAIN_SFX.forEach((key, index) => {
      this.time?.delayedCall(index * 130, () => {
        this.playSfx(key, { volume: 0.94 });
      });
    });
  }

  async presentOuchLegPullExit(impact = {}) {
    const foot = impact?.foot || this.ouchFoot;
    if (!foot || foot.destroyed) return false;

    const footScale = impact.footScale ?? 1;
    const centerX = impact.bounds?.centerX ?? foot.x;
    const startY = foot.y;
    const pullY = startY - CELL_SIZE * 2.15;
    const bloodY = startY + CELL_SIZE * 0.18;

    this.playOuchLegPullScream();
    this.spawnOuchBloodPour(centerX, bloodY);
    this.cameras.main.shake(220, 0.014);

    const overlay = this.ensureOuchFadeOverlay();
    overlay.setVisible(true).setAlpha(0);

    const pullPromise = this.tweenPromise({
      targets: foot,
      y: pullY,
      scaleX: footScale * 0.9,
      scaleY: footScale * 1.06,
      alpha: 0.72,
      duration: 720,
      ease: "Cubic.easeOut",
      onUpdate: () => this.refreshOuchTrapRig(),
    });

    await this.waitForPresentation(260, { skippable: true });

    await Promise.all([
      pullPromise,
      this.tweenPromise({
        targets: overlay,
        alpha: 1,
        duration: 540,
        ease: "Quad.easeIn",
      }),
    ]);

    this.setOuchUiVisible(false);
    foot.setVisible(false);
    return true;
  }

  clearTotalWinCelebration() {
    this.totalWinCelebrationTimers?.forEach((timer) => timer?.remove?.(false));
    this.totalWinCelebrationTimers = [];
    this.totalWinCelebrants?.forEach((item) => {
      this.tweens?.killTweensOf(item);
      item?.destroy?.();
    });
    this.totalWinCelebrants = [];
  }

  startTotalWinCelebration() {
    this.clearTotalWinCelebration();
    const centerX = GRID_OFFSET_X + GRID_WIDTH_PX / 2;
    const centerY = GRID_OFFSET_Y + GRID_HEIGHT_PX * 0.57;
    const partySlots = [
      { symbol: 1, x: -154, y: 126, tilt: -9 },
      { symbol: 2, x: -54, y: 134, tilt: 7 },
      { symbol: 4, x: 54, y: 134, tilt: -7 },
      { symbol: 5, x: 154, y: 126, tilt: 9 },
      { symbol: 2, x: -112, y: 106, tilt: -5, crowdScale: 0.66 },
      { symbol: 1, x: -38, y: 116, tilt: 5, crowdScale: 0.64 },
      { symbol: 5, x: 38, y: 116, tilt: -5, crowdScale: 0.64 },
      { symbol: 4, x: 112, y: 106, tilt: 5, crowdScale: 0.66 },
    ];

    partySlots.forEach((slot, index) => {
      const texture = this.getAnimalEmotionTexture(slot.symbol, "celebrating");
      if (!texture) return;
      const source = this.textures.get(texture)?.getSourceImage?.();
      const scale = Phaser.Math.Clamp(
        (148 / Math.max(source?.width || 260, source?.height || 260)) * (slot.crowdScale || 1),
        0.15,
        0.62
      );
      const animal = this.add.image(centerX + slot.x, centerY + slot.y, texture)
        .setDepth(DEPTH.ui - 1)
        .setScale(scale)
        .setAngle(slot.tilt)
        .setAlpha(0);
      this.totalWinCelebrants.push(animal);
      this.tweens.add({
        targets: animal,
        alpha: 1,
        y: animal.y - 8,
        duration: 220 + index * 35,
        ease: "Back.easeOut",
      });
      this.tweens.add({
        targets: animal,
        y: animal.y - 13,
        angle: slot.tilt + (index % 2 ? 5 : -5),
        scaleX: scale * 1.06,
        scaleY: scale * 0.96,
        duration: 420 + index * 35,
        delay: 220 + index * 40,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    });

    const birdTexture = this.getAnimalEmotionTexture(3, "celebrating");
    if (birdTexture) {
      const source = this.textures.get(birdTexture)?.getSourceImage?.();
      const birdScale = Phaser.Math.Clamp(156 / Math.max(source?.width || 260, source?.height || 260), 0.22, 0.62);
      const birdHalfWidth = Math.max(18, (source?.width || 260) * birdScale * 0.5 + 8);
      const birdLeftX = GRID_OFFSET_X + birdHalfWidth;
      const birdRightX = GRID_OFFSET_X + GRID_WIDTH_PX - birdHalfWidth;
      const bird = this.add.image(birdLeftX, centerY - 152, birdTexture)
        .setDepth(DEPTH.ui - 1)
        .setScale(birdScale)
        .setAngle(-9)
        .setAlpha(0);
      this.totalWinCelebrants.push(bird);
      this.tweens.add({
        targets: bird,
        alpha: 1,
        duration: 240,
        ease: "Quad.easeOut",
      });
      this.tweens.add({
        targets: bird,
        x: birdRightX,
        y: centerY - 176,
        angle: 9,
        scaleX: birdScale * 1.08,
        scaleY: birdScale * 0.94,
        duration: 1900,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
      this.totalWinCelebrationTimers.push(this.time.addEvent({
        delay: 520,
        startAt: 240,
        loop: true,
        callback: () => this.spawnBirdCelebrationConfetti(bird),
      }));
    }

    const confettiColors = [0xffd166, 0xff5d8f, 0x74d3ff, 0x8cff8c, 0xc084fc];
    for (let index = 0; index < 32; index += 1) {
      const confetti = this.add.rectangle(
        centerX + Phaser.Math.Between(-260, 260),
        centerY + Phaser.Math.Between(-150, 54),
        Phaser.Math.Between(5, 10),
        Phaser.Math.Between(10, 18),
        confettiColors[index % confettiColors.length],
        0.96
      ).setDepth(DEPTH.ui + 2).setAngle(Phaser.Math.Between(-40, 40));
      this.totalWinCelebrants.push(confetti);
      this.tweens.add({
        targets: confetti,
        y: confetti.y + Phaser.Math.Between(170, 310),
        x: confetti.x + Phaser.Math.Between(-85, 85),
        angle: confetti.angle + Phaser.Math.Between(180, 540),
        alpha: 0.16,
        duration: Phaser.Math.Between(1050, 1850),
        delay: index * 24,
        repeat: -1,
        repeatDelay: Phaser.Math.Between(140, 500),
        yoyo: false,
        ease: "Sine.easeIn",
        onRepeat: () => confetti.setPosition(
          centerX + Phaser.Math.Between(-260, 260),
          centerY + Phaser.Math.Between(-150, 54)
        ).setAlpha(0.96),
      });
    }
  }

  spawnBirdCelebrationConfetti(bird) {
    if (!bird?.active) return;
    const confettiColors = [0xffd166, 0xff5d8f, 0x74d3ff, 0x8cff8c, 0xc084fc];
    for (let index = 0; index < 7; index += 1) {
      const confetti = this.add.rectangle(
        bird.x + Phaser.Math.Between(-18, 18),
        bird.y + Phaser.Math.Between(8, 24),
        Phaser.Math.Between(4, 8),
        Phaser.Math.Between(8, 14),
        confettiColors[Phaser.Math.Between(0, confettiColors.length - 1)],
        0.96
      ).setDepth(DEPTH.ui + 2).setAngle(Phaser.Math.Between(-45, 45));
      this.totalWinCelebrants.push(confetti);
      this.tweenPromise({
        targets: confetti,
        x: confetti.x + Phaser.Math.Between(-70, 70),
        y: confetti.y + Phaser.Math.Between(105, 180),
        angle: confetti.angle + Phaser.Math.Between(180, 540),
        alpha: 0,
        duration: Phaser.Math.Between(640, 1050),
        ease: "Quad.easeIn",
        onComplete: () => confetti.destroy(),
      });
    }
  }

  async presentOuchTotalWinSequence(totalWin = 0, ouchEvent = {}) {
    const grandTotal = this.clampToWinCap(totalWin);
    const overlay = this.ouchFadeOverlay;
    const fromBlack = overlay?.visible && overlay.alpha > 0.5;
    const fadeTargets = [
      this.ouchBackground,
      this.reelFrame,
      this.ouchFoot,
      ...this.reelSprites.flat().filter(Boolean),
    ].filter(Boolean);

    this.setOuchUiVisible(false);
    if (fromBlack) {
      fadeTargets.forEach((target) => target?.setAlpha?.(0));
      this.ouchFoot?.destroy();
      this.ouchFoot = null;
      this.totalWinBackground?.setAlpha(1);
    } else {
      this.startOuchTheme();
      await Promise.all([
        this.tweenPromise({ targets: fadeTargets, alpha: 0, duration: 340, ease: "Quad.easeInOut" }),
        this.tweenPromise({ targets: this.totalWinBackground, alpha: 1, duration: 420, ease: "Quad.easeInOut" }),
      ]);
      this.ouchFoot?.destroy();
      this.ouchFoot = null;
    }
    this.startTotalWinCelebration();

    this.currentWin = 0;
    this.countUpLabel = "TOTAL WIN";
    const layout = this.layoutTotalWinTexts();
    const trapPower = Math.max(0, Number(ouchEvent.trapPower ?? this.trapMeterState?.power) || 0);
    const multiplier = Math.max(1, Number(ouchEvent.finalMultiplier ?? this.getActiveDamageMultiplier()) || 1);
    this.totalWinTitleText?.setVisible(false);
    this.countUpText?.setVisible(false);
    this.totalWinFormulaText
      ?.setText(`${trapPower.toFixed(2)}  ×  x${multiplier}`)
      .setAlpha(0)
      .setScale(0.72)
      .setVisible(true);

    if (fromBlack) {
      await this.tweenPromise({
        targets: overlay,
        alpha: 0,
        duration: 480,
        ease: "Quad.easeOut",
        onComplete: () => overlay?.setVisible(false),
      });
    }

    await this.tweenPromise({
      targets: this.totalWinFormulaText,
      alpha: 1,
      scaleX: 1.12,
      scaleY: 1.12,
      duration: 210,
      ease: "Back.easeOut",
    });
    await this.tweenPromise({
      targets: this.totalWinFormulaText,
      scaleX: 0.9,
      scaleY: 0.9,
      alpha: 0,
      duration: 230,
      delay: 260,
      ease: "Quad.easeIn",
      onComplete: () => this.totalWinFormulaText?.setVisible(false),
    });
    this.totalWinTitleText?.setVisible(true).setAlpha(1);
    this.countUpText?.setAlpha(1).setVisible(true);
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
      skipStompCoinCollect: true,
    });
    await this.spawnCelebrationCoinBurst(
      layout.centerX,
      layout.amountY - 14,
      Phaser.Math.Clamp(Math.round(10 + grandTotal * 2), 10, 20)
    );
    await this.waitForPresentation(320, { skippable: true });
  }

  async presentWinCapSequence(totalWin = 0) {
    const grandTotal = this.clampToWinCap(totalWin);
    if (grandTotal <= 0 || WIN_CAP <= 0 || grandTotal < WIN_CAP) return;

    const fadeTargets = [
      this.background,
      this.reelFrame,
      ...this.reelSprites.flat().filter(Boolean),
    ].filter(Boolean);

    this.setAngerUiVisible(false);
    await Promise.all([
      this.tweenPromise({ targets: fadeTargets, alpha: 0, duration: 340, ease: "Quad.easeInOut" }),
      this.tweenPromise({ targets: this.totalWinBackground, alpha: 1, duration: 420, ease: "Quad.easeInOut" }),
    ]);
    this.startTotalWinCelebration();

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
      duration: Phaser.Math.Clamp(900 + grandTotal * 0.08, 900, 1700),
      skipStompCoinCollect: true,
    });
    await this.spawnCelebrationCoinBurst(
      layout.centerX,
      layout.amountY - 14,
      Phaser.Math.Clamp(Math.round(10 + grandTotal * 0.002), 10, 20)
    );
    await this.waitForPresentation(320, { skippable: true });
  }

  async presentOuchStompStep(step = {}, ouchEvent = {}, impact = {}) {
    const stepNumber = Number(step.step) || 1;
    const stepIntervalMs = Number(ouchEvent.stepIntervalMs) || 3000;
    const coinCount = Number(ouchEvent.coinCountPerStep) || 1;
    const winAmount = this.clampToWinCap(Number(step.winAmount) || 0);
    const centerX = impact?.bounds?.centerX || (GRID_OFFSET_X + GRID_WIDTH_PX / 2);
    const centerY = (impact?.impactY || GRID_OFFSET_Y + GRID_HEIGHT_PX * 0.55) + CELL_SIZE * 0.1;

    const targetIndex = stepNumber > 1
      ? (this.damageMeterActiveIndex ?? 0) + 1
      : (this.damageMeterActiveIndex ?? 0);

    if (stepNumber > 1) {
      await this.presentOuchDamageMeterCharge(stepNumber, stepIntervalMs);
      await this.presentOuchTrapStruggle(stepNumber, impact);
      await this.moveOuchLadderFootToIndex(targetIndex, {
        fast: this.fastForwardRequested,
      });
      await this.advanceDamageMeterForOuchStep();
      await this.presentOuchDrawSuccess(this.damageMeterActiveIndex ?? 0);
      await this.pulseDamageMeterHighlight(this.damageMeterActiveIndex ?? 0);
    } else {
      await this.presentOuchDamageMeterCharge(stepNumber, 260);
      await this.presentOuchTrapStruggle(stepNumber, impact);
      await this.moveOuchLadderFootToIndex(targetIndex, {
        fast: this.fastForwardRequested,
      });
      await this.presentOuchDrawSuccess(this.damageMeterActiveIndex ?? 0);
    }

    const activeMultiplier = Number(this.damageMeterEntries[this.damageMeterActiveIndex]?.value) || 1;
    this.setDamageMeterStatus(`DEEPER • ${activeMultiplier}x`, "#d8ffba");
    this.spawnOuchPainEffects(centerX, centerY, 1 + (stepNumber - 1) * 0.35);
    await this.scrollOuchPit();
    const coinLaunch = this.spawnOuchWinCoins(centerX, centerY, coinCount, winAmount);
    await this.collectStompCoinsToWin(winAmount);
    await coinLaunch;
  }

  async presentOuchStompSequence(ouchEvent = {}, gameState = {}) {
    if (!ouchEvent?.triggered || !Array.isArray(ouchEvent.steps) || !ouchEvent.steps.length) {
      const damageWheel = gameState.damageWheel || {};
      if (damageWheel.segments?.length || damageWheel.remainingSegments?.length) {
        this.updateDamageMeter(damageWheel);
        this.setOuchUiVisible(true);
      }
      await this.presentStompVisual(this.getOuchStompBounds());
      return;
    }

    const damageWheel = ouchEvent.damageWheelBefore || gameState.damageWheel || {};
    const meterSegments = damageWheel.segments || damageWheel.remainingSegments || DEFAULT_DAMAGE_METER_SEGMENTS;
    this.updateDamageMeter({
      segments: meterSegments,
      remainingSegments: damageWheel.remainingSegments || damageWheel.segments || DEFAULT_DAMAGE_METER_SEGMENTS,
      removedSegments: damageWheel.removedSegments || [],
    });
    const catchUpIndex = this.getDamageMeterActiveIndex({
      segments: meterSegments,
      remainingSegments: damageWheel.remainingSegments || damageWheel.segments || DEFAULT_DAMAGE_METER_SEGMENTS,
    });
    this.setDamageMeterBankedCount(catchUpIndex);
    this.ouchTrapPowerMultiplierIndex = Math.max(0, catchUpIndex - 1);
    this.updateTrapPowerMeter(ouchEvent.trapPower || gameState.trapMeter?.power || 0);
    this.setOuchUiVisible(true);
    this.currentWin = 0;
    this.syncCountUpDisplay(0);
    this.countUpText?.setVisible(false);

    const bounds = this.getOuchStompBounds();
    const impact = await this.presentOuchStompImpact(bounds);
    if (!impact) return;

    if (catchUpIndex > 0) {
      const bankedLabel = catchUpIndex === 1 ? "1 BANKED STOMP" : `${catchUpIndex} BANKED STOMPS`;
      this.setDamageMeterStatus(bankedLabel, "#ffe7a6");
    }
    await this.presentOuchPassedMultiplierReplay(catchUpIndex, impact, ouchEvent, gameState.betSize);
    const firstLiveEntry = this.damageMeterEntries[this.damageMeterActiveIndex];
    if (firstLiveEntry) {
      this.setDamageMeterStatus(`NEXT STOMP • ${firstLiveEntry.value}x`, "#b6ffce");
    }

    for (const step of ouchEvent.steps) {
      await this.presentOuchStompStep(step, ouchEvent, impact);
    }

    const finalIndex = this.damageMeterActiveIndex ?? 0;
    if (finalIndex >= this.damageMeterEntries.length - 1) {
      await this.presentOuchMaxDepthReveal();
    } else {
      await this.presentOuchStompStopReveal(finalIndex);
      await this.presentOuchTrapRecoil();
    }
    await this.waitForPresentation(220, { skippable: true });
    await this.presentOuchLegPullExit(impact);
    this.destroyOuchTrapRig();
    const cappedTotal = this.clampToWinCap(
      gameState.twa || ouchEvent.finalWinAmount || this.currentWin
    );
    const hitWinCap = gameState.winCapReached === true
      || ouchEvent.winCapReached === true
      || this.isWinCapReached(cappedTotal);
    if (hitWinCap) {
      await this.presentWinCapSequence(cappedTotal);
    } else {
      await this.presentOuchTotalWinSequence(cappedTotal, ouchEvent);
    }
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
    winCapReached = false,
    roundTwa = 0,
  } = {}) {
    if (!bounds) return;

    await this.presentStompTease(teaseMs);
    const fast = this.fastForwardRequested;
    await this.waitForPresentation(pauseMs, { skippable: !fast });

    const footWidth = bounds.width + CELL_SIZE * 0.55;
    const footScale = footWidth / 420;
    const startY = GRID_OFFSET_Y - CELL_SIZE * 4.1;
    const impactY = bounds.centerY + CELL_SIZE * 0.08;
    const slamY = impactY + CELL_SIZE * 0.1;
    const holdY = impactY - CELL_SIZE * 0.42;
    const fearRevealY = impactY - CELL_SIZE * 1.35;
    const foot = this.add.image(bounds.centerX, startY, "giantfoot")
      .setDepth(DEPTH.stomp)
      .setScale(footScale * 0.78, footScale * 0.9)
      .setAlpha(0.98);

    await this.tweenPromise({
      targets: foot,
      y: fearRevealY,
      scaleX: footScale * 0.92,
      scaleY: footScale * 0.96,
      duration: 200,
      ease: "Quad.easeIn",
    });

    // Change before the final drop so even the animals under the foot get a readable scared beat.
    await this.crossfadeAnimalEmotion("scared", {
      duration: this.fastForwardRequested ? 45 : 100,
    });
    await this.waitForPresentation(this.fastForwardRequested ? 30 : 120, { skippable: true });

    await this.tweenPromise({
      targets: foot,
      y: slamY,
      scaleX: footScale * 1.02,
      scaleY: footScale * 1.03,
      duration: 90,
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
      if (winCapReached) {
        await this.waitForStompCoinSettling();
        const capTarget = this.clampToWinCap(roundTwa);
        await this.collectStompCoinsToWin(capTarget, { fast: false });
        this.stompWinCapHandled = true;
        this.currentWin = capTarget;
        await this.pullStompFootOut(foot, startY, footScale);
        return;
      }
      if (bonusTriggered) {
        await this.presentAnimalKillAngerOvercharge();
      }
    }

    await this.resolveAnimalAngerMood(bonusTriggered);

    await this.tweenPromise({
      targets: foot,
      y: holdY,
      scaleX: footScale,
      scaleY: footScale,
      duration: 360,
      ease: "Back.easeOut",
    });

    await this.waitForPresentation(650, { skippable: true });

    await this.pullStompFootOut(foot, startY, footScale);
  }

  async presentStompFeature(stompEvent = {}, { roundTwa = 0 } = {}) {
    if (!stompEvent?.triggered) return;
    const crushedCells = Array.isArray(stompEvent.crushedCells) ? stompEvent.crushedCells : [];
    const bounds = this.getStompReelBounds(stompEvent.reels || []);
    if (!bounds || !crushedCells.length) return;

    const cappedRoundTwa = this.clampToWinCap(roundTwa);
    const winCapReached = stompEvent.winCapReached === true
      || this.isWinCapReached(cappedRoundTwa);

    await this.presentStompVisual(bounds, {
      crushedCells,
      animalKillEvents: stompEvent.animalKillEvents,
      bonusTriggered: stompEvent.bonusTriggered,
      teaseMs: Number(stompEvent.teaseMs) || 500,
      pauseMs: Number(stompEvent.pauseMs) || 450,
      winCapReached,
      roundTwa: cappedRoundTwa,
    });
  }

  getWinCap() {
    return WIN_CAP;
  }

  clampToWinCap(value = 0) {
    const amount = Math.max(0, Number(value) || 0);
    if (WIN_CAP <= 0) return amount;
    return Math.min(amount, WIN_CAP);
  }

  isWinCapReached(value = this.currentWin) {
    return WIN_CAP > 0 && this.clampToWinCap(value) >= WIN_CAP;
  }

  async pullStompFootOut(foot, startY, footScale) {
    if (!foot?.active) return;
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
    snappedHand
      .setPosition(openHand.x, openHand.y)
      .setScale(openHand.scaleX, openHand.scaleY)
      .setAngle(openHand.angle);
  }

  createCrushHandPair(startX, startY, handScale) {
    const openHand = this.createCrushHand("open_hand", startX, startY, handScale)
      .setDepth(DEPTH.crushHand)
      .setAlpha(0.98);
    const snappedHand = this.createCrushHand("snapped_hand", startX, startY, handScale)
      .setDepth(DEPTH.crushHand)
      .setAlpha(0)
      .setVisible(false);
    return { openHand, snappedHand };
  }

  getCrushHandTravelAngles(fromX, fromY, toX, toY) {
    const dx = toX - fromX;
    const dy = toY - fromY;
    const dirAngle = Phaser.Math.RadToDeg(Math.atan2(dy, Math.max(Math.abs(dx), 8)));
    const startAngle = Phaser.Math.Clamp(dirAngle * 0.38 - 5, -18, 14);
    return { startAngle, endAngle: 0 };
  }

  async moveCrushHandPair(openHand, snappedHand, toX, toY, handScale, {
    fromX,
    fromY,
    duration = 360,
  } = {}) {
    const startX = fromX ?? openHand.x;
    const startY = fromY ?? openHand.y;
    const { startAngle, endAngle } = this.getCrushHandTravelAngles(startX, startY, toX, toY);
    openHand.setPosition(startX, startY).setAngle(startAngle);
    this.syncCrushHandPair(openHand, snappedHand);

    await this.tweenPromise({
      targets: openHand,
      x: toX,
      y: toY,
      angle: endAngle,
      duration,
      ease: "Cubic.easeInOut",
      onUpdate: () => this.syncCrushHandPair(openHand, snappedHand),
    });
    this.syncCrushHandPair(openHand, snappedHand);
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

  async hideCrushGiantBackground(duration = 400) {
    const bg = this.crushBackground;
    if (!bg) return;
    const centerX = GRID_OFFSET_X + GRID_WIDTH_PX / 2;
    const centerY = GRID_OFFSET_Y + GRID_HEIGHT_PX / 2;

    await this.tweenPromise({
      targets: bg,
      alpha: 0,
      duration,
      ease: "Quad.easeOut",
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
    snappedHand
      .setPosition(openHand.x, openHand.y)
      .setScale(openHand.scaleX, openHand.scaleY)
      .setAngle(openHand.angle)
      .setAlpha(0)
      .setVisible(true);
    await Promise.all([
      this.tweenPromise({ targets: openHand, alpha: 0, duration, ease: "Quad.easeIn" }),
      this.tweenPromise({ targets: snappedHand, alpha: 0.98, duration, ease: "Quad.easeOut" }),
    ]);
    openHand.setVisible(false).setAlpha(0);
  }

  async crossfadeCrushHandToOpen(openHand, snappedHand, handScale, duration = 120) {
    if (!openHand?.active || !snappedHand?.active) return;
    openHand
      .setPosition(snappedHand.x, snappedHand.y)
      .setScale(handScale, handScale)
      .setAngle(snappedHand.angle)
      .setAlpha(0)
      .setVisible(true);
    await Promise.all([
      this.tweenPromise({ targets: snappedHand, alpha: 0, duration, ease: "Quad.easeIn" }),
      this.tweenPromise({ targets: openHand, alpha: 0.98, duration, ease: "Quad.easeOut" }),
    ]);
    snappedHand.setVisible(false).setAlpha(0);
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
  }

  getCrushHandExitX(enterX) {
    return enterX - CELL_SIZE * 0.5;
  }

  async slideCrushHandOut(hand, exitX, duration = 480, {
    exitAngle = -12,
    fadeDuration = 160,
  } = {}) {
    if (!hand?.active) return;
    await this.tweenPromise({
      targets: hand,
      x: exitX,
      angle: exitAngle,
      duration,
      ease: "Cubic.easeIn",
    });
    await this.tweenPromise({
      targets: hand,
      alpha: 0,
      duration: fadeDuration,
      ease: "Quad.easeIn",
      onComplete: () => hand.destroy(),
    });
  }

  async exitCrushHands(snappedHand, openHand, handScale, enterX) {
    if (!snappedHand?.active && !openHand?.active) return;

    if (snappedHand?.active && openHand?.active) {
      await this.crossfadeCrushHandToOpen(openHand, snappedHand, handScale, 100);
    }

    if (snappedHand?.active) snappedHand.destroy();

    if (!openHand?.active) return;
    const exitX = this.getCrushHandExitX(enterX);
    await this.slideCrushHandOut(openHand, exitX, 480, { exitAngle: openHand.angle - 10 });
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

  async performCrushGrabSequence(openHand, snappedHand, cell, target, handScale, {
    isFirstGrab = false,
    killEvent = null,
  } = {}) {
    const reel = Number(cell.reel);
    const row = Number(cell.row);
    const sprite = this.reelSprites[reel]?.[row];
    if (!sprite) return;

    openHand.setDepth(DEPTH.crushGrab);
    snappedHand.setDepth(DEPTH.crushGrab);
    sprite.setDepth(DEPTH.crushGrabSymbol);

    await this.tweenPromise({
      targets: openHand,
      scaleX: handScale * 1.05,
      scaleY: handScale * 1.05,
      duration: 180,
      ease: "Quad.easeOut",
      onUpdate: () => this.syncCrushHandPair(openHand, snappedHand),
    });
    this.syncCrushHandPair(openHand, snappedHand);

    await this.presentMiniSqueezeShake(openHand, 300);
    this.syncCrushHandPair(openHand, snappedHand);
    this.cameras.main.shake(220, 0.009);
    await this.crossfadeCrushHand(openHand, snappedHand, 130);
    if (isFirstGrab) this.playGiantLaughSfx();
    await this.crushGrabbedSymbol(sprite, target.x, target.y, cell, killEvent);
    if (killEvent?.ticked) {
      await this.updateAngerMeter({
        count: this.getNextAngerDisplayCount(),
        max: ANGER_SEGMENT_COUNT,
      });
      const fast = this.fastForwardRequested;
      await this.waitForPresentation(fast ? 40 : 70, { skippable: !fast });
    }
  }

  async presentCrushFeature(crushEvent = {}) {
    if (!crushEvent?.triggered) return;
    const crushedCells = this.getCrushCells(crushEvent);
    if (!crushedCells.length) return;

    const handScale = this.getCrushHandScale();
    const enterX = GRID_OFFSET_X - CELL_SIZE * 1.6;

    await this.showCrushGiantBackground(520);
    const fast = this.fastForwardRequested;
    await this.waitForPresentation(
      fast ? 90 : Math.max(750, Number(crushEvent.teaseMs) || 700),
      { skippable: !fast }
    );
    await this.crossfadeAnimalEmotion("scared", {
      duration: this.fastForwardRequested ? 45 : 120,
    });
    await this.waitForPresentation(fast ? 40 : 120, { skippable: !fast });
    await this.waitForPresentation(Number(crushEvent.pauseMs) || 350, { skippable: !fast });

    let openHand = null;
    let snappedHand = null;

    for (let index = 0; index < crushedCells.length; index += 1) {
      const cell = crushedCells[index];
      const isFirstGrab = index === 0;
      const isLastGrab = index === crushedCells.length - 1;
      const killEvent = cell.isAnimal !== false
        ? this.getAnimalKillEvent(crushEvent.animalKillEvents, cell)
        : null;
      const reel = Number(cell.reel);
      const row = Number(cell.row);
      const target = getCellCenter(reel, row);
      const grabX = target.x + CRUSH_HAND_TARGET_OFFSET_X;
      const grabY = target.y;

      if (isFirstGrab) {
        ({ openHand, snappedHand } = this.createCrushHandPair(enterX, grabY, handScale));
        await this.moveCrushHandPair(openHand, snappedHand, grabX, grabY, handScale, {
          fromX: enterX,
          fromY: grabY,
          duration: 420,
        });
      } else {
        await this.crossfadeCrushHandToOpen(openHand, snappedHand, handScale, 130);
        await this.moveCrushHandPair(openHand, snappedHand, grabX, grabY, handScale, {
          duration: 380,
        });
      }

      await this.performCrushGrabSequence(openHand, snappedHand, cell, target, handScale, {
        isFirstGrab,
        killEvent,
      });

      await this.waitForPresentation(280, { skippable: true });

      if (isLastGrab) {
        await this.exitCrushHands(snappedHand, openHand, handScale, enterX);
      }
    }

    await this.hideCrushGiantBackground(420);

    if (crushEvent.bonusTriggered) {
      await this.presentAnimalKillAngerOvercharge();
    }
    await this.resolveAnimalAngerMood(crushEvent.bonusTriggered);
  }

  setBonusUiVisible(visible) {
    this.isBonusUiVisible = visible === true;
    this.bonusUi?.forEach((item) => item?.setVisible(visible));
    this.damageMeterObjects?.forEach((item) => item?.setVisible(visible));
    if (visible) {
      this.applyDamageMeterHighlight(this.damageMeterActiveIndex ?? 0);
      this.damageMeterStatusText?.setVisible(Boolean(this.damageMeterStatusText?.text));
    }
    this.freespinText?.setVisible(false);
    this.setAngerUiVisible(!visible && !this.isInBonusMode && !this.isPostBonusOuch);
  }

  setAngerUiVisible(visible) {
    this.angerLabel?.setVisible(visible);
    this.angerMeterCaption?.setVisible(visible);
    this.angerBonusBadge?.setVisible(visible);
    this.angerSegments?.forEach((segment) => segment.setVisible(visible));
  }

  setOuchUiVisible(visible) {
    this.isBonusUiVisible = false;
    this.setBonusUiVisible(false);
    this.setAngerUiVisible(false);
    this.damageMeterObjects?.forEach((item) => item?.setVisible(visible));
    this.applyDamageMeterHighlight(this.damageMeterActiveIndex ?? 0);
    this.damageMeterStatusText?.setVisible(visible && Boolean(this.damageMeterStatusText?.text));
    this.trapPowerText?.setVisible(visible);
    this.trapPowerMultiplierText?.setVisible(visible && Boolean(this.trapPowerMultiplierText?.text));
    this.countUpText?.setVisible(false);
    if (visible) {
      this.layoutOuchHud();
    }
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
        this.lifeLabels?.[index]?.setAlpha(1).clearTint();
      } else {
        // Spent sockets should read as unavailable, not disappear into the bonus background.
        segment.setTint(0x77839a);
        segment.setAlpha(0.74);
        this.lifeLabels?.[index]?.setTint(0xa7b3ca).setAlpha(0.82);
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
    const index = this.damageMeterActiveIndex ?? 0;
    return this.damageMeterEntries?.[index] ?? null;
  }

  getActiveDamageMultiplier() {
    const multiplier = Number(this.getActiveDamageMultiplierEntry()?.value);
    // The authored wheel begins at x1; never expose an empty/zero multiplier
    // while the bonus UI is initializing.
    return Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 1;
  }

  getDamageMultiplierCssColor(entry = this.getActiveDamageMultiplierEntry()) {
    const colorInt = Number(entry?.activeColor);
    if (!Number.isFinite(colorInt)) return "#26d07c";
    return `#${(colorInt & 0xffffff).toString(16).padStart(6, "0")}`;
  }

  layoutTrapPowerTexts(power = 0, multiplier = this.getActiveDamageMultiplier()) {
    let centerX = GRID_OFFSET_X + GRID_WIDTH_PX / 2;
    // In the pit scene, keep the live calculation close to the DEEPER cue
    // instead of down in the generic HUD band.
    const ouchLift = this.isPostBonusOuch ? 54 : 0;
    let y = GRID_OFFSET_Y + GRID_HEIGHT_PX + 94 + this.getOuchUiYOffset() - ouchLift;
    if (this.isPostBonusOuch && this.ouchFoot?.active) {
      const footWidth = this.ouchTrapImpact?.footWidth || CELL_SIZE * 2;
      centerX = Phaser.Math.Clamp(
        this.ouchFoot.x + footWidth * 0.76,
        GRID_OFFSET_X + GRID_WIDTH_PX * 0.66,
        GRID_OFFSET_X + GRID_WIDTH_PX - 42
      );
      y = this.ouchFoot.y + 8;
    }
    const powerLabel = Math.max(0, Number(power) || 0).toFixed(2);
    const visible = this.isBonusUiVisible || this.isPostBonusOuch;
    const heldOuchMultiplier = this.isPostBonusOuch
      ? Number(this.damageMeterEntries?.[this.ouchTrapPowerMultiplierIndex]?.value)
      : NaN;
    // A missing ladder entry used to coerce to 0 and render "x0" while the
    // foot/arrow was already on a valid multiplier rung. Only accept positive
    // wheel values; otherwise use the active multiplier (which is at least x1).
    const activeMultiplier = Number(multiplier);
    const displayMultiplier = Number.isFinite(heldOuchMultiplier) && heldOuchMultiplier > 0
      ? heldOuchMultiplier
      : (Number.isFinite(activeMultiplier) && activeMultiplier > 0 ? activeMultiplier : 1);

    const isOuchHud = this.isPostBonusOuch;
    this.trapPowerText?.setFontSize(isOuchHud ? "25px" : "16px");
    this.trapPowerMultiplierText?.setFontSize(isOuchHud ? "23px" : "16px");

    this.trapPowerText?.setText(powerLabel);
    if (displayMultiplier === null || !this.trapPowerMultiplierText) {
      this.trapPowerMultiplierText?.setVisible(false);
      this.syncTrapPowerMultiplierPulse(false);
      this.trapPowerText
        ?.setOrigin(0.5, 0.5)
        .setPosition(centerX, y)
        .setVisible(visible);
      return;
    }

    const multiplierLabel = `x${displayMultiplier}`;
    const multiplierColor = this.getDamageMultiplierCssColor(
      this.damageMeterEntries?.[this.ouchTrapPowerMultiplierIndex] || this.getActiveDamageMultiplierEntry()
    );
    this.trapPowerMultiplierText
      .setText(multiplierLabel)
      .setColor(multiplierColor);

    const powerWidth = this.trapPowerText.width;
    const multiplierWidth = this.trapPowerMultiplierText.width;
    const totalWidth = powerWidth + multiplierWidth;
    // In Ouch, keep the enlarged calculation aligned to the right of the
    // giant rather than centering it over the old bonus HUD position.
    const startX = isOuchHud
      ? GRID_OFFSET_X + GRID_WIDTH_PX + 12 - totalWidth
      : centerX - (totalWidth / 2);

    this.trapPowerText
      .setOrigin(0, 0.5)
      .setPosition(startX, y)
      .setVisible(visible);
    this.trapPowerMultiplierText
      .setOrigin(0, 0.5)
      .setPosition(startX + powerWidth, y)
      .setVisible(visible);
    this.syncTrapPowerMultiplierPulse(visible && this.isBonusUiVisible);
  }

  syncTrapPowerMultiplierPulse(shouldPulse = false) {
    if (!shouldPulse || !this.trapPowerMultiplierText?.visible) {
      this.trapPowerMultiplierPulse?.stop();
      this.trapPowerMultiplierPulse = null;
      this.trapPowerMultiplierText?.setAlpha(1).setAngle(0);
      return;
    }
    if (this.trapPowerMultiplierPulse?.isPlaying) return;
    this.trapPowerMultiplierText.setAlpha(1).setAngle(-1.15);
    this.trapPowerMultiplierPulse = this.tweens.add({
      targets: this.trapPowerMultiplierText,
      angle: 1.15,
      duration: 1050,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }

  async bopTrapPowerDisplay() {
    this.layoutTrapPowerTexts(this.trapMeterState?.power ?? 0);
    const targets = [this.trapPowerText, this.trapPowerMultiplierText]
      .filter((target) => target?.visible);
    if (!targets.length) return;
    targets.forEach((target) => target.setScale(1));
    await Promise.all(targets.map((target) => this.tweenPromise({
      targets: target,
      scaleX: 1.25,
      scaleY: 1.25,
      duration: 140,
      yoyo: true,
      ease: "Back.easeOut",
      onComplete: () => target.setScale(1),
    })));
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
    const expectedOrientation = this.isPostBonusOuch ? "ouch" : "bonus";
    if (
      segments.join(",") !== (this.damageMeterValues || []).join(",")
      || this.damageMeterOrientation !== expectedOrientation
    ) {
      this.createDamageMeter(segments);
    }
    const activeIndex = this.getDamageMeterActiveIndex({ segments, remainingSegments: remaining });
    this.layoutDamageMeter();
    if (!this.isPostBonusOuch) {
      this.setDamageMeterStatus("", "#ffe7a6");
    }
    this.applyDamageMeterHighlight(activeIndex);
    this.damageMeterState = {
      segments,
      removedSegments: [...(damageWheel?.removedSegments || [])],
      remainingSegments: [...remaining],
    };
  }

  syncBonusUiFromState({ bonusState = {}, trapMeter = {}, damageWheel = {} } = {}) {
    this.updateBonusState(bonusState, trapMeter, damageWheel);
  }

  async presentBonusDeadSpinHold(bonusState = {}, trapMeter = {}, damageWheel = {}) {
    this.syncBonusUiFromState({ bonusState, trapMeter, damageWheel });
    const holdMs = flowInteractionPolicy.bonusDeadSpinHoldMs ?? 550;
    const fast = this.fastForwardRequested;
    await this.waitForPresentation(
      fast ? Math.min(180, holdMs) : holdMs,
      { skippable: !fast }
    );
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
    this.pulseBonusHoleLight({ strength: 1.25 });
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
    this.pulseBonusHoleLight({ strength: 1 });
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
    await this.bopTrapPowerDisplay();
  }

  async presentBonusCashLandings(landings = [], trapMeter = {}, bonusState = {}, damageWheel = {}) {
    if (this.fastForwardRequested) {
      this.syncBonusUiFromState({ bonusState, trapMeter, damageWheel });
      return;
    }

    // The server stores row 0 at the bottom. Reverse rows here so the visual
    // collection sweep reads naturally from the top-left to the bottom-right.
    // Each landing keeps its normal animation duration; only its start time is
    // staggered, allowing several materials to be in flight together.
    const collectionStartStaggerMs = 200;
    const orderedLandings = [...landings].sort((left, right) => (
      (Number(left.reel) - Number(right.reel))
      || (Number(right.row) - Number(left.row))
    ));
    let livesRestored = false;
    const presentLanding = async (landing, startDelayMs) => {
      if (startDelayMs > 0) {
        await this.waitForPresentation(startDelayMs, { skippable: true });
      }
      if (this.fastForwardRequested) return;

      const sprite = this.reelSprites?.[landing.reel]?.[landing.row];
      if (!sprite || sprite.destroyed) return;
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
        await this.advanceDamageMeterSegment(landing.damageRemovedSegment);
        return;
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
    };
    await Promise.all(orderedLandings.map((landing, index) => (
      presentLanding(landing, index * collectionStartStaggerMs)
    )));
    this.updateBonusState(bonusState, trapMeter, damageWheel);
  }

  async updateAngerMeter(angerMeter = {}) {
    const max = Math.max(1, Number(angerMeter.max) || ANGER_SEGMENT_COUNT);
    const count = Phaser.Math.Clamp(Number(angerMeter.count) || 0, 0, max);
    const litCount = this.getLitAngerSegmentCount(count, max);
    this.angerMeterState = { count, max };
    await Promise.all(this.angerSegments.map((segment, index) => {
      const active = index < litCount;
      let fillColor = 0x341912;
      if (active) {
        const rage = max <= 1 ? 1 : index / (max - 1);
        const blended = Phaser.Display.Color.Interpolate.ColorWithColor(
          Phaser.Display.Color.ValueToColor(0xe34a2d),
          Phaser.Display.Color.ValueToColor(0x5b0b12),
          100,
          Math.round(rage * 100)
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
        : { x: 1.14 + (litCount / max) * 0.08, y: 1.22 + (litCount / max) * 0.1 };
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
    this.syncAngerBonusBadge(count, max);
    if (count >= ANGER_SEGMENT_COUNT - 1 && this.animalEmotion !== "angry") {
      await this.crossfadeAnimalEmotion("angry", {
        duration: this.fastForwardRequested ? 50 : 150,
      });
    }
  }

  syncCountUpDisplay(value = this.currentWin) {
    const amount = this.clampToWinCap(value);
    if (!this.countUpText) return;
    if (this.totalWinTitleText?.visible) {
      this.countUpText.setText(amount.toFixed(2));
      this.countUpText.setVisible(true);
      return;
    }
    if (this.isPostBonusOuch) {
      this.countUpText.setVisible(false);
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
    this.totalWinFormulaText?.setVisible(false);
    this.countUpText
      ?.setPosition(centerX, bottom + 46)
      .setFontSize("30px")
      .setScale(1, 1)
      .setAlpha(1)
      .setVisible(false);
  }

  getMainCountUpDuration(targetValue = 0, currentValue = this.currentWin) {
    const target = Math.max(0, Number(targetValue) || 0);
    const current = Math.max(0, Number(currentValue) || 0);
    const delta = Math.max(0, target - current);
    return Phaser.Math.Clamp(80 + delta * 18, 80, 180);
  }

  async updateCountUp(targetValue = 0, { duration = 420, fast = false, skipStompCoinCollect = false } = {}) {
    if (!skipStompCoinCollect && !this.stompWinCapHandled) {
      await this.collectStompCoinsToWin(null, { fast });
    }

    const target = this.clampToWinCap(targetValue);
    if (target <= 0 && this.currentWin <= 0) {
      this.syncCountUpDisplay(0);
      return;
    }

    if (Math.abs(target - this.currentWin) < 0.005) {
      this.currentWin = target;
      this.syncCountUpDisplay(target);
      return;
    }

    const counter = { value: this.currentWin };
    if (target > 0) this.countUpText?.setVisible(true);
    return this.tweenPromise({
      targets: counter,
      value: target,
      duration,
      ease: fast ? "Quad.easeOut" : "Cubic.easeOut",
      onUpdate: () => this.syncCountUpDisplay(counter.value),
      onComplete: () => {
        this.currentWin = target;
        this.syncCountUpDisplay(target);
      },
    });
  }

  resetAngerMeter() {
    this.stopAngerBlink();
    this.stopAngerBonusPulse();
    this.angerMeterState = { count: 0, max: ANGER_SEGMENT_COUNT };
    this.angerSegments?.forEach((segment) => {
      segment.setFillStyle(0x341912, 0.9);
      segment.setStrokeStyle(1, 0x9b4b2b, 0.85);
      segment.setScale(1, 1);
      segment.setAlpha(1);
    });
    this.syncAngerBonusBadge(0, ANGER_SEGMENT_COUNT);
    this.animalEmotion = "normal";
  }

  resetForNewSpin() {
    this.currentWin = 0;
    this.stompWinCapHandled = false;
    this.resetCountUpPresentation();
    this.syncCountUpDisplay(0);
    this.clearStompLandedCoins();
    this.clearTotalWinCelebration();
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
    this.clearHighlights();
    this.isInBonusMode = true;
    this.damageMeterIntroComplete = false;
    this.setAngerUiVisible(false);
    this.totalWinBackground?.setAlpha(0);
    this.reelFrame?.setAlpha(1);
    this.resetCountUpPresentation();
    this.setBonusUiVisible(false);
    this.hideFreespinCounter();
    this.countUpText?.setVisible(false);
    this.updateBonusState(gameState.bonusState, gameState.trapMeter, gameState.damageWheel);
    await this.presentBonusIntroScene();
    this.setBonusUiVisible(true);
    await this.presentBonusMultiplierLadderIntro();
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
      this.setBonusHoleLightVisible(false, { duration: 450 }),
      this.tweenPromise({ targets: this.ouchBackground, alpha: 1, duration: 450 }),
    ]);
    await this.presentOuchFakeSpin();
    await this.presentOuchStompSequence(gameState.ouchStompEvent || {}, gameState);
  }

  async leaveBonus() {
    if (!this.isInBonusMode && !this.isPostBonusOuch) return;
    this.isInBonusMode = false;
    this.isPostBonusOuch = false;
    this.ouchTrapPowerMultiplierIndex = null;
    this.resetBonusIntroScene();
    this.hideFreespinCounter();
    this.setBonusUiVisible(false);
    this.setOuchUiVisible(false);
    this.countUpText?.setVisible(false);
    this.stopBonusTheme();
    this.stopOuchTheme();
    this.ouchFoot?.destroy();
    this.ouchFoot = null;
    this.destroyOuchTrapRig();
    this.ouchFadeOverlay?.destroy();
    this.ouchFadeOverlay = null;
    this.resetOuchPitScroll();
    this.reelSprites.flat().forEach((sprite) => sprite?.setVisible(true).setAlpha(1));
    await Promise.all([
      this.tweenPromise({ targets: this.background, alpha: 1, duration: 300 }),
      this.tweenPromise({ targets: this.bonusBackground, alpha: 0, duration: 300 }),
      this.setBonusHoleLightVisible(false, { duration: 300 }),
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
        duration: this.fastForwardRequested
          ? Math.min(45, Number(config.duration) || 0)
          : config.duration,
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
    const fastForwardScale = 5 * this.getMainGameSpeedMultiplier();
    this.time.timeScale = fastForwardScale;
    this.tweens.timeScale = fastForwardScale;
    this.cancelSkippablePresentationWaits();
    this.time.delayedCall(120, () => {
      this.applyPresentationSpeedMultiplier({ force: true });
    });
  }

  clearPendingFastForward() {
    this.fastForwardRequested = false;
    this.applyPresentationSpeedMultiplier();
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

  playOuchStompSfx(volume = 0.82) {
    this.playSfx(OUCH_STOMP_SFX[0], { volume });
    this.time?.delayedCall(60, () => {
      this.playSfx(OUCH_STOMP_SFX[1], { volume: volume * 0.95 });
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
    this.bonusTheme = this.sound.add("theme_bonus", { loop: true, volume: 0.64 });
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
