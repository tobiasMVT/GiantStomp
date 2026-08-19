import Phaser from "phaser";
import gameClientConfig from "../game-client/config/gameClientConfig";
import ResponsiveTextBox from "./ResponsiveTextBox";

const DEFAULT_THEME = {
  primary:   { bg: 0x1a0f00, bgAlpha: 0.9, border: 0xffd700, hover: 0x2a1800, hoverAlpha: 0.95, text: "#ffd700" },
  secondary: { bg: 0x14141e, bgAlpha: 0.85, border: 0x555577, hover: 0x22223a, hoverAlpha: 0.95, text: "#a7b8ca" },
  utility:   { bg: 0x14141e, bgAlpha: 0.7, border: 0x3a3a50, hover: 0x22223a, hoverAlpha: 0.85, text: "#a7b8ca" },
  disabled:  { bg: 0x111118, bgAlpha: 0.6, border: 0x333344, text: "#666688" },
  autoplayActive: { bg: 0x0f2a0f, bgAlpha: 0.9, border: 0x44cc44 },
  picker: {
    bg: 0x0a0a14, bgAlpha: 0.94, border: 0x555577,
    chipActive:   { bg: 0x2a1800, bgAlpha: 0.95, border: 0xffd700, text: "#ffd700" },
    chipInactive: { bg: 0x14141e, bgAlpha: 0.8, border: 0x555577, text: "#a7b8ca" },
  },
  secondaryBar:  { bg: 0x080810, bgAlpha: 0.78 },
  regulatoryBar: { bg: 0x050508, bgAlpha: 0.85, text: "#8fa3bc" },
  dialog: {
    overlay: { color: 0x000000, alpha: 0.65 },
    panel:   { bg: 0x0a0a14, bgAlpha: 0.95, border: 0x555577 },
  },
};

function mergeTheme(defaults, overrides) {
  if (!overrides) return { ...defaults };
  const result = {};
  for (const key of Object.keys(defaults)) {
    if (typeof defaults[key] === "object" && defaults[key] !== null && !Array.isArray(defaults[key])
        && typeof defaults[key] !== "number") {
      result[key] = mergeTheme(defaults[key], overrides[key]);
    } else {
      result[key] = overrides[key] !== undefined ? overrides[key] : defaults[key];
    }
  }
  for (const key of Object.keys(overrides || {})) {
    if (!(key in result)) result[key] = overrides[key];
  }
  return result;
}

export class UIScene extends Phaser.Scene {
  constructor() {
    super({ key: "UIScene" });
    this.eventBus = null;
    this.unsubscribeViewModel = null;
    this.unsubscribeLayout = null;
    this.unsubscribeLayoutDebugVisibility = null;
    this.unsubscribeGameSceneCameraRect = null;
    this.unsubscribeGameSceneMustSeeRect = null;
    this.unsubscribeFreespinsCounter = null;
    this.viewModel = {};
    this.layoutSnapshot = null;
    this.gameSceneCameraRect = null;
    this.gameSceneMustSeeRect = null;
    this.controls = {};
    this.responsiveTextBoxes = [];
    this.layoutDebugGraphics = null;
    this.layoutDebugLabels = [];
    this.layoutDebugEnabled = false;

    // Default strategy: use Phaser Text for responsive UI labels.
    // BitmapText can still be enabled globally via config or per label via style.useBitmap.
    this.preferBitmapUiText = !!gameClientConfig?.ui?.preferBitmapText;

    this.theme = mergeTheme(DEFAULT_THEME, gameClientConfig.theme);
    this.gameName = gameClientConfig.gameName || "default-name";
    this._clockTimer = null;

    // mustSeeBounds slider state
    this.mustSeeSlidersContainer = null;
    this.mustSeeSliders = {};
    this.mustSeeBoundsOverride = null; // null = use scene default
    this.mustSeeBaseValues = null;     // original values from scene

    // Camera slider state
    this.cameraSlidersContainer = null;
    this.cameraSliders = {};
    this.cameraOverride = null; // { zoom, scrollX, scrollY } or null
    this.cameraBaseValues = null;

    // Dev panel state
    this.devPanelOpen = false;
    this.devPanelContainer = null;
    this.spinPointerIntent = null;
    this.freespinsCounterValue = null;
  }

  create() {
    this.cameras.main.transparent = true;
    this.cameras.main.roundPixels = false;
    this.settings = null;
    this.layoutDebugGraphics = this.add.graphics().setDepth(5000);
    this.scale.on("resize", this.layoutUI, this);
    this.input.on("pointerdown", this.handleScenePointerDown, this);
    this.input.keyboard?.on("keydown-SPACE", this.handleSpaceKeyDown, this);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off("resize", this.layoutUI, this);
      this.input.off("pointerdown", this.handleScenePointerDown, this);
      this.input.keyboard?.off("keydown-SPACE", this.handleSpaceKeyDown, this);
      if (this.unsubscribeViewModel) {
        this.unsubscribeViewModel();
        this.unsubscribeViewModel = null;
      }
      if (this.unsubscribeLayout) {
        this.unsubscribeLayout();
        this.unsubscribeLayout = null;
      }
      if (this.unsubscribeLayoutDebugVisibility) {
        this.unsubscribeLayoutDebugVisibility();
        this.unsubscribeLayoutDebugVisibility = null;
      }
      if (this.unsubscribeGameSceneCameraRect) {
        this.unsubscribeGameSceneCameraRect();
        this.unsubscribeGameSceneCameraRect = null;
      }
      if (this.unsubscribeGameSceneMustSeeRect) {
        this.unsubscribeGameSceneMustSeeRect();
        this.unsubscribeGameSceneMustSeeRect = null;
      }
      if (this.unsubscribeFreespinsCounter) {
        this.unsubscribeFreespinsCounter();
        this.unsubscribeFreespinsCounter = null;
      }
      if (this.layoutDebugGraphics && !this.layoutDebugGraphics.destroyed) {
        this.layoutDebugGraphics.destroy();
      }
      this.layoutDebugGraphics = null;
      this.layoutDebugLabels.forEach((label) => {
        if (label && !label.destroyed) {
          label.destroy();
        }
      });
      this.layoutDebugLabels = [];
      this.spinPointerIntent = null;
      this.destroyMustSeeSliders();
      this.destroyCameraSliders();
      this.closeMustSeeInput();
      this.destroyResponsiveTextBoxes();
    });
  }

  setEventBus(eventBus) {
    this.eventBus = eventBus;
    if (this.unsubscribeViewModel) {
      this.unsubscribeViewModel();
      this.unsubscribeViewModel = null;
    }
    if (this.unsubscribeFreespinsCounter) {
      this.unsubscribeFreespinsCounter();
      this.unsubscribeFreespinsCounter = null;
    }
    if (eventBus) {
      this.unsubscribeViewModel = eventBus.on("ui:viewModel", (viewModel) => {
        this.setViewModel(viewModel);
      });
      this.unsubscribeLayout = eventBus.on("layout:changed", (layoutSnapshot) => {
        this.layoutSnapshot = layoutSnapshot;
        this.layoutUI();
        this.redrawLayoutDebugOverlay();
        this.refreshCameraSliderPositions();
      });
      this.unsubscribeLayoutDebugVisibility = eventBus.on("layout:debug:visibility", ({ enabled } = {}) => {
        this.layoutDebugEnabled = !!enabled;
        this.redrawLayoutDebugOverlay();
        if (this.layoutDebugEnabled) {
          this.buildMustSeeSliders();
          this.buildCameraSliders();
        } else {
          this.destroyMustSeeSliders();
          this.destroyCameraSliders();
        }
      });
      this.unsubscribeGameSceneCameraRect = eventBus.on("layout:gamescene:cameraRect", (cameraRect) => {
        this.gameSceneCameraRect = cameraRect;
        this.redrawLayoutDebugOverlay();
      });
      this.unsubscribeGameSceneMustSeeRect = eventBus.on("layout:gamescene:mustSeeRect", (mustSeeRect) => {
        this.gameSceneMustSeeRect = mustSeeRect;
        this.redrawLayoutDebugOverlay();
      });
      this.unsubscribeFreespinsCounter = eventBus.on("setFreespinsCounter", (remaining) => {
        this.setFreespinsCounter(remaining);
      });
    }
  }

  crispText(x, y, str, style = {}) {
    const dpr = window.devicePixelRatio || 1;
    const resolution = Math.min(3, Math.max(1, dpr));
    const merged = { ...style };
    delete merged._originX;
    delete merged._originY;
    const t = this.add.text(x, y, str, merged).setOrigin(style._originX ?? 0.5, style._originY ?? 0.5);
    t.setResolution(resolution);
    t._crispRes = 1;
    return t;
  }

  parseTintFromColor(color, fallback = 0xffffff) {
    if (typeof color !== "string") return fallback;
    const normalized = color.trim();
    if (normalized.startsWith("#")) {
      const value = Number.parseInt(normalized.slice(1), 16);
      return Number.isFinite(value) ? value : fallback;
    }
    return fallback;
  }

  normalizeBitmapText(value) {
    return String(value ?? "").replace(/\u221E/g, "INF");
  }

  canUseBitmapText(value) {
    const text = this.normalizeBitmapText(value);
    return /^[\x20-\x7E]*$/.test(text);
  }

  createUiText(x, y, str, style = {}) {
    const bitmapKey = "uiBitmap";
    const originX = style._originX ?? 0.5;
    const originY = style._originY ?? 0.5;
    const bitmapRequested = style.useBitmap === true
      || (this.preferBitmapUiText && style.useBitmap !== false);
    const canUseBitmap = bitmapRequested
      && !style.forceSystemFont
      && this.cache?.bitmapFont?.exists?.(bitmapKey)
      && this.canUseBitmapText(str);

    if (canUseBitmap) {
      const size = parseInt(style.fontSize, 10) || 16;
      const bitmapText = this.add.bitmapText(
        x,
        y,
        bitmapKey,
        this.normalizeBitmapText(str),
        size
      ).setOrigin(originX, originY);
      if (style.color) {
        bitmapText.setTint(this.parseTintFromColor(style.color));
      }
      bitmapText._isBitmap = true;
      bitmapText._crispRes = 1;
      return bitmapText;
    }

    const text = this.crispText(x, y, str, style);
    text._isBitmap = false;
    return text;
  }

  createResponsiveUiText(config = {}) {
    const box = new ResponsiveTextBox(this, config);
    this.responsiveTextBoxes.push(box);
    return box.displayObject;
  }

  setResponsiveBounds(label, bounds) {
    const box = label?._responsiveBox;
    if (!box) return;
    box.setBounds(bounds);
  }

  destroyResponsiveTextBoxes() {
    this.responsiveTextBoxes.forEach((box) => {
      if (box && typeof box.destroy === "function") {
        box.destroy();
      }
    });
    this.responsiveTextBoxes = [];
  }

  setLabelText(label, value) {
    if (!label || label.destroyed) return;
    const text = label._isBitmap ? this.normalizeBitmapText(value) : String(value ?? "");
    if (label._responsiveBox) {
      label._responsiveBox.setText(text);
      return;
    }
    label.setText(text);
  }

  setLabelColor(label, color) {
    if (!label || label.destroyed) return;
    if (label._responsiveBox) {
      label._responsiveBox.setStyle({ color }, true);
      return;
    }
    if (label._isBitmap) {
      label.setTint(this.parseTintFromColor(color));
      return;
    }
    if (typeof label.setColor === "function") {
      label.setColor(color);
    }
  }

  setLabelFontStyle(label, fontStyle) {
    if (!label || label.destroyed || label._isBitmap) return;
    if (typeof label.setFontStyle === "function") {
      label.setFontStyle(fontStyle);
    }
  }

  setViewModel(viewModel = {}) {
    this.viewModel = { ...this.viewModel, ...viewModel };
    this.refreshUI();
  }

  setFreespinsCounter(remaining) {
    if (Number.isFinite(remaining)) {
      this.freespinsCounterValue = Math.max(0, Math.trunc(remaining));
    } else {
      this.freespinsCounterValue = null;
    }
    this.refreshSpinInfoLabel();
  }

  refreshSpinInfoLabel() {
    const text = this.controls?.spinInfoText;
    if (!text) return;
    const hasValue = Number.isFinite(this.freespinsCounterValue);
    text.setVisible(hasValue);
    if (hasValue) {
      this.setLabelText(text, `Freespins: ${this.freespinsCounterValue}`);
    }
  }

  configureUI(settings) {
    this.settings = settings;
    this.destroyUI();
    this.buildUI();
    this.layoutUI();
  }

  destroyUI() {
    this._stopClock();
    this.closeBetPicker();
    this.closeAutoplayPicker();
    this.closeDevStrategyPicker();
    this.destroyResponsiveTextBoxes();
    if (this._spinCutoutGfx) {
      this._spinCutoutGfx.destroy();
      this._spinCutoutGfx = null;
    }
    this._spinCutoutMask = null;
    Object.values(this.controls).forEach((ctrl) => {
      if (ctrl && !ctrl.destroyed && typeof ctrl.destroy === "function") {
        ctrl.destroy(true);
      }
    });
    this.controls = {};
  }

  buildUI() {
    this.controls.balanceText = this.createResponsiveUiText({
      bounds: { x: 0, y: 0, width: 120, height: 20 },
      text: "Balance: 0.00",
      minFontSize: 11,
      maxFontSize: 24,
      padding: { left: 2, right: 2, top: 0, bottom: 0 },
      wrap: false,
      hAlign: "left",
      vAlign: "middle",
      roundPixels: true,
      ellipsis: true,
      depth: 1000,
      style: {
        fontFamily: "Arial",
        color: "#a7b8ca",
        stroke: "#000000",
        strokeThickness: 3
      }
    });

    this.controls.bottomBar = this.add.rectangle(0, 0, 100, 70, 0x000000, 0)
      .setOrigin(0.5)
      .setDepth(998);
    this.controls.bottomBarBorder = this.add.rectangle(0, 0, 100, 2, 0x000000, 0)
      .setOrigin(0.5, 1)
      .setDepth(999);
    const secBarTheme = this.theme.secondaryBar;
    this.controls.secondaryBar = this.add.rectangle(0, 0, 100, 30, secBarTheme.bg, secBarTheme.bgAlpha)
      .setOrigin(0.5)
      .setDepth(998)
      .setInteractive();

    this.controls.spinButton = this.createSpinButton();
    this.controls.spinInfoText = this.createResponsiveUiText({
      bounds: { x: 0, y: 0, width: 140, height: 24 },
      text: "",
      minFontSize: 10,
      maxFontSize: 22,
      padding: { left: 4, right: 4, top: 1, bottom: 1 },
      wrap: false,
      hAlign: "center",
      vAlign: "middle",
      roundPixels: true,
      ellipsis: true,
      depth: 1002,
      style: {
        fontFamily: "Arial",
        fontStyle: "bold",
        color: "#ffd700",
        stroke: "#000000",
        strokeThickness: 3
      }
    }).setVisible(false);

    if (this.settings?.autoplay?.allowed) {
      this.controls.autoplayButton = this.createArcButton(
        "Autoplay", () => this.handleAutoplayClick(), "left"
      );
    }
    this.controls.betButton = this.createArcButton(
      "Bet: 1", () => this.toggleBetPicker(), "right"
    );

    this._spinCutoutGfx = this.make.graphics();
    this._spinCutoutMask = this._spinCutoutGfx.createGeometryMask();
    this._spinCutoutMask.invertAlpha = true;
    this.controls.betButton.setMask(this._spinCutoutMask);
    if (this.controls.autoplayButton) {
      this.controls.autoplayButton.setMask(this._spinCutoutMask);
    }

    this.controls.rulesButton = this.createIconButton("\u2139", () => this.eventBus?.emit("intent:paytableRequested"));
    this.controls.lobbyButton = this.createIconButton("\u2302", () => this.eventBus?.emit("intent:lobbyRequested"));
    this.controls.soundButton = this.createIconButton("\u266B", () => this.eventBus?.emit("intent:soundToggled"));

    const regTheme = this.theme.regulatoryBar;
    this.controls.regulatoryBar = this.add.rectangle(0, 0, 100, 20, regTheme.bg, regTheme.bgAlpha)
      .setOrigin(0.5)
      .setDepth(998)
      .setInteractive();

    this.controls.clockText = this.createResponsiveUiText({
      bounds: { x: 0, y: 0, width: 70, height: 16 },
      text: this._formatLocalTime(),
      minFontSize: 8,
      maxFontSize: 13,
      padding: { left: 1, right: 1, top: 0, bottom: 0 },
      wrap: false,
      hAlign: "left",
      vAlign: "middle",
      roundPixels: true,
      ellipsis: true,
      depth: 1000,
      style: {
        fontFamily: "Arial",
        color: regTheme.text,
        stroke: "#000000",
        strokeThickness: 2
      }
    });

    this.controls.freeplayText = this.createResponsiveUiText({
      bounds: { x: 0, y: 0, width: 84, height: 16 },
      text: "FREEPLAY",
      minFontSize: 8,
      maxFontSize: 13,
      padding: { left: 1, right: 1, top: 0, bottom: 0 },
      wrap: false,
      hAlign: "left",
      vAlign: "middle",
      roundPixels: true,
      ellipsis: true,
      depth: 1000,
      style: {
        fontFamily: "Arial",
        color: regTheme.text,
        stroke: "#000000",
        strokeThickness: 2
      }
    });

    this.controls.gameNameText = this.createResponsiveUiText({
      bounds: { x: 0, y: 0, width: 110, height: 16 },
      text: this.gameName,
      minFontSize: 8,
      maxFontSize: 13,
      padding: { left: 1, right: 1, top: 0, bottom: 0 },
      wrap: false,
      hAlign: "right",
      vAlign: "middle",
      roundPixels: true,
      ellipsis: true,
      depth: 1000,
      style: {
        fontFamily: "Arial",
        color: regTheme.text,
        stroke: "#000000",
        strokeThickness: 2
      }
    });

    this._startClock();

    if (this.isDevMode()) {
      this.buildDevTab();
    }
  }

  _formatLocalTime() {
    const d = new Date();
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  _startClock() {
    this._stopClock();
    this._clockTimer = this.time.addEvent({
      delay: 1000,
      loop: true,
      callback: () => {
        if (this.controls.clockText && !this.controls.clockText.destroyed) {
          this.setLabelText(this.controls.clockText, this._formatLocalTime());
        }
      }
    });
  }

  _stopClock() {
    if (this._clockTimer) {
      this._clockTimer.remove(false);
      this._clockTimer = null;
    }
  }

  createSpinButton() {
    const radius = 48;
    const container = this.add.container(0, 0).setDepth(1000);
    const gfx = this.add.graphics();
    const hitZone = this.add.zone(0, 0, radius * 2, radius * 2)
      .setInteractive(
        new Phaser.Geom.Circle(radius, radius, radius),
        Phaser.Geom.Circle.Contains
      );
    hitZone.input.cursor = "pointer";
    container.add([gfx, hitZone]);
    container.setSize(radius * 2, radius * 2);
    const pri = this.theme.primary;
    const dis = this.theme.disabled;
    hitZone.on("pointerdown", (pointer) => {
      if (container.getData("enabled")) {
        this.spinPointerIntent = {
          id: pointer?.id ?? null,
          at: this.time?.now ?? Date.now()
        };
        this.eventBus?.emit("intent:spinRequested");
      }
    });
    hitZone.on("pointerover", () => {
      if (container.getData("enabled")) {
        const iconMode = container.getData("iconMode") || "continue";
        this.drawSpinButtonIcon(gfx, radius, pri.hover, pri.hoverAlpha, pri.border, 1, iconMode);
      }
    });
    hitZone.on("pointerout", () => {
      const enabled = container.getData("enabled");
      const iconMode = container.getData("iconMode") || "continue";
      if (enabled) {
        this.drawSpinButtonIcon(gfx, radius, pri.bg, pri.bgAlpha, pri.border, 0.9, iconMode);
      } else {
        this.drawSpinButtonIcon(gfx, radius, dis.bg, dis.bgAlpha, dis.border, 0.5, iconMode);
      }
    });
    container.setData("gfx", gfx);
    container.setData("radius", radius);
    container.setData("enabled", true);
    container.setData("iconMode", "continue");
    container.setData("role", "primary");
    this.drawSpinButtonIcon(gfx, radius, pri.bg, pri.bgAlpha, pri.border, 0.9, "continue");
    return container;
  }

  drawSpinButtonIcon(gfx, radius, bgColor, bgAlpha, fgColor, fgAlpha, mode = "continue") {
    if (mode === "continue") {
      this.drawContinueSpinIcon(gfx, radius, bgColor, bgAlpha, fgColor, fgAlpha);
      return;
    }
    this.drawStartSpinIcon(gfx, radius, bgColor, bgAlpha, fgColor, fgAlpha);
  }

  drawStartSpinIcon(gfx, radius, bgColor, bgAlpha, fgColor, fgAlpha) {
    gfx.clear();

    gfx.fillStyle(bgColor, bgAlpha);
    gfx.fillCircle(0, 0, radius);
    gfx.lineStyle(2.5, fgColor, fgAlpha);
    gfx.strokeCircle(0, 0, radius);

    const triangleW = radius * 0.9;
    const triangleH = radius * 0.95;
    const offsetX = radius * 0.08;

    gfx.fillStyle(fgColor, fgAlpha);
    gfx.fillTriangle(
      -triangleW * 0.35 + offsetX,
      -triangleH * 0.5,
      -triangleW * 0.35 + offsetX,
      triangleH * 0.5,
      triangleW * 0.45 + offsetX,
      0
    );
  }

  drawContinueSpinIcon(gfx, radius, bgColor, bgAlpha, fgColor, fgAlpha) {
    gfx.clear();

    gfx.fillStyle(bgColor, bgAlpha);
    gfx.fillCircle(0, 0, radius);
    gfx.lineStyle(2.5, fgColor, fgAlpha);
    gfx.strokeCircle(0, 0, radius);

    const arcR = radius * 0.42;
    const lineW = 3.5;
    const arrowSize = 7;

    gfx.lineStyle(lineW, fgColor, fgAlpha);

    // Top arc: sweeps clockwise from ~210Â° to ~330Â°
    gfx.beginPath();
    const steps = 20;
    const startA1 = (210 * Math.PI) / 180;
    const endA1 = (330 * Math.PI) / 180;
    for (let i = 0; i <= steps; i++) {
      const a = startA1 + (endA1 - startA1) * (i / steps);
      const px = Math.cos(a) * arcR;
      const py = Math.sin(a) * arcR;
      if (i === 0) gfx.moveTo(px, py);
      else gfx.lineTo(px, py);
    }
    gfx.strokePath();

    // Arrowhead at end of top arc (pointing clockwise)
    const tipA1 = endA1;
    const tipX1 = Math.cos(tipA1) * arcR;
    const tipY1 = Math.sin(tipA1) * arcR;
    const tangent1 = tipA1 + Math.PI / 2;
    gfx.fillStyle(fgColor, fgAlpha);
    gfx.fillTriangle(
      tipX1 + Math.cos(tangent1) * arrowSize,
      tipY1 + Math.sin(tangent1) * arrowSize,
      tipX1 + Math.cos(tangent1 + 2.5) * arrowSize,
      tipY1 + Math.sin(tangent1 + 2.5) * arrowSize,
      tipX1 + Math.cos(tangent1 - 2.5) * arrowSize,
      tipY1 + Math.sin(tangent1 - 2.5) * arrowSize
    );

    // Bottom arc: sweeps clockwise from ~30Â° to ~150Â°
    gfx.lineStyle(lineW, fgColor, fgAlpha);
    gfx.beginPath();
    const startA2 = (30 * Math.PI) / 180;
    const endA2 = (150 * Math.PI) / 180;
    for (let i = 0; i <= steps; i++) {
      const a = startA2 + (endA2 - startA2) * (i / steps);
      const px = Math.cos(a) * arcR;
      const py = Math.sin(a) * arcR;
      if (i === 0) gfx.moveTo(px, py);
      else gfx.lineTo(px, py);
    }
    gfx.strokePath();

    // Arrowhead at end of bottom arc
    const tipA2 = endA2;
    const tipX2 = Math.cos(tipA2) * arcR;
    const tipY2 = Math.sin(tipA2) * arcR;
    const tangent2 = tipA2 + Math.PI / 2;
    gfx.fillStyle(fgColor, fgAlpha);
    gfx.fillTriangle(
      tipX2 + Math.cos(tangent2) * arrowSize,
      tipY2 + Math.sin(tangent2) * arrowSize,
      tipX2 + Math.cos(tangent2 + 2.5) * arrowSize,
      tipY2 + Math.sin(tangent2 + 2.5) * arrowSize,
      tipX2 + Math.cos(tangent2 - 2.5) * arrowSize,
      tipY2 + Math.sin(tangent2 - 2.5) * arrowSize
    );
  }

  createArcButton(label, onClick, side) {
    const btnW = 110;
    const btnH = 52;
    const sec = this.theme.secondary;
    const container = this.add.container(0, 0).setDepth(1000);
    const gfx = this.add.graphics();

    const hitZone = this.add.zone(0, 0, btnW, btnH)
      .setInteractive({ useHandCursor: true });
    const text = this.createUiText(0, 0, label, {
      fontSize: "15px", color: sec.text, fontFamily: "Arial"
    });

    container.add([gfx, hitZone, text]);
    container.setSize(btnW, btnH);

    hitZone.on("pointerdown", () => {
      if (container.getData("enabled")) onClick();
    });
    hitZone.on("pointerover", () => {
      if (container.getData("enabled")) {
        this.drawRoundedButton(gfx, btnW, btnH, sec.hover, sec.hoverAlpha, sec.border);
      }
    });
    hitZone.on("pointerout", () => {
      const s = container.getData("colors");
      if (s) this.drawRoundedButton(gfx, btnW, btnH, s.bg, s.bgA, s.border);
    });

    container.setData("gfx", gfx);
    container.setData("text", text);
    container.setData("side", side);
    container.setData("btnW", btnW);
    container.setData("btnH", btnH);
    container.setData("enabled", true);
    container.setData("role", "secondary");
    container.setData("colors", { bg: sec.bg, bgA: sec.bgAlpha, border: sec.border });
    container.setData("style", { bgColor: sec.bg, bgAlpha: sec.bgAlpha, borderColor: sec.border, textColor: sec.text });
    this.drawRoundedButton(gfx, btnW, btnH, sec.bg, sec.bgAlpha, sec.border);
    return container;
  }

  drawRoundedButton(gfx, w, h, fillColor, fillAlpha, strokeColor) {
    gfx.clear();
    gfx.fillStyle(fillColor, fillAlpha);
    gfx.fillRoundedRect(-w / 2, -h / 2, w, h, 10);
    gfx.lineStyle(1.5, strokeColor, 0.85);
    gfx.strokeRoundedRect(-w / 2, -h / 2, w, h, 10);
  }

  setContainerTextWorldScale(container, worldUiScale = 1) {
    const text = container?.getData?.("text");
    if (!text || text.destroyed) return;

    const res = text._crispRes || 1;
    const sx = Math.abs(container.scaleX) > 1e-4 ? Math.abs(container.scaleX) : 1;
    const sy = Math.abs(container.scaleY) > 1e-4 ? Math.abs(container.scaleY) : 1;
    const localScale = worldUiScale / res;
    text.setScale(localScale / sx, localScale / sy);
  }

  createIconButton(icon, onClick) {
    const size = 36;
    const util = this.theme.utility;
    const container = this.add.container(0, 0).setDepth(1000);
    const bg = this.add.circle(0, 0, size / 2, util.bg, util.bgAlpha)
      .setStrokeStyle(1, util.border, 0.6)
      .setInteractive({ useHandCursor: true });
    const text = this.crispText(0, 0, icon, {
      fontSize: "18px", color: util.text, fontFamily: "Arial"
    });
    container.add([bg, text]);
    container.setSize(size, size);
    bg.on("pointerdown", () => onClick());
    bg.on("pointerover", () => bg.setFillStyle(util.hover, util.hoverAlpha));
    bg.on("pointerout", () => bg.setFillStyle(util.bg, util.bgAlpha));
    container.setData("text", text);
    container.setData("bg", bg);
    return container;
  }

  createButton(label, onClick, enabled, role = "secondary") {
    const styles = {
      primary: {
        width: 160, height: 52,
        bgColor: 0x1a0f00, bgAlpha: 0.9,
        borderColor: 0xffd700, borderWidth: 2.5,
        fontSize: "20px", textColor: "#ffd700",
        hoverBg: 0x2a1800, hoverAlpha: 0.95
      },
      secondary: {
        width: 120, height: 44,
        bgColor: 0x14141e, bgAlpha: 0.85,
        borderColor: 0x555577, borderWidth: 1.5,
        fontSize: "15px", textColor: "#a7b8ca",
        hoverBg: 0x22223a, hoverAlpha: 0.95
      },
      utility: {
        width: 72, height: 42,
        bgColor: 0x14141e, bgAlpha: 0.7,
        borderColor: 0x3a3a50, borderWidth: 1,
        fontSize: "13px", textColor: "#8fa3bc",
        hoverBg: 0x22223a, hoverAlpha: 0.85
      }
    };
    const s = styles[role] || styles.secondary;

    const container = this.add.container(0, 0).setDepth(1000);
    const bg = this.add.rectangle(0, 0, s.width, s.height, s.bgColor, s.bgAlpha)
      .setStrokeStyle(s.borderWidth, s.borderColor, 0.85);
    const text = this.createUiText(0, 0, label, {
      fontSize: s.fontSize,
      color: s.textColor,
      fontFamily: "Arial",
      fontStyle: role === "primary" ? "bold" : "normal"
    });

    bg.setInteractive({ useHandCursor: true });
    container.add([bg, text]);
    container.setSize(s.width, s.height);
    bg.on("pointerdown", () => {
      if (container.getData("enabled")) onClick();
    });
    bg.on("pointerover", () => {
      if (container.getData("enabled")) bg.setFillStyle(s.hoverBg, s.hoverAlpha);
    });
    bg.on("pointerout", () => {
      bg.setFillStyle(s.bgColor, s.bgAlpha);
    });

    container.setData("bg", bg);
    container.setData("text", text);
    container.setData("role", role);
    container.setData("style", s);
    this.setButtonState(container, enabled);
    return container;
  }

  setButtonState(button, enabled, label) {
    const text = button.getData("text");
    const s = button.getData("style");
    const dis = this.theme.disabled;
    const sec = this.theme.secondary;
    button.setData("enabled", enabled);

    if (label) this.setLabelText(text, label);

    const gfx = button.getData("gfx");
    if (gfx) {
      const btnW = button.getData("btnW");
      const btnH = button.getData("btnH");
      if (enabled) {
        const c = { bg: s?.bgColor ?? sec.bg, bgA: s?.bgAlpha ?? sec.bgAlpha, border: s?.borderColor ?? sec.border };
        button.setData("colors", c);
        this.drawRoundedButton(gfx, btnW, btnH, c.bg, c.bgA, c.border);
        this.setLabelColor(text, s?.textColor ?? sec.text);
        button.setAlpha(1);
      } else {
        const c = { bg: dis.bg, bgA: dis.bgAlpha, border: dis.border };
        button.setData("colors", c);
        this.drawRoundedButton(gfx, btnW, btnH, c.bg, c.bgA, c.border);
        this.setLabelColor(text, dis.text);
        button.setAlpha(0.7);
      }
      return;
    }

    const bg = button.getData("bg");
    if (bg) {
      if (enabled) {
        bg.setFillStyle(s?.bgColor ?? sec.bg, s?.bgAlpha ?? sec.bgAlpha);
        this.setLabelColor(text, s?.textColor ?? sec.text);
        button.setAlpha(1);
      } else {
        bg.setFillStyle(dis.bg, dis.bgAlpha);
        this.setLabelColor(text, dis.text);
        button.setAlpha(0.7);
      }
    }
  }

  layoutUI() {
    if (!this.controls.spinButton) return;

    const { width, height } = this.scale;
    const safeRect = this.layoutSnapshot?.safeRect || { x: 0, y: 0, width, height };
    const freeBottom = this.layoutSnapshot?.freeAreas?.bottom;
    const freeRight = this.layoutSnapshot?.freeAreas?.right;

    const MIN_BAR_H = 130;
    const MAX_BAR_H = 180;
    const SECONDARY_ROW_H = 32;
    const REGULATORY_ROW_H = 18;
    const spinRadius = 48;
    const secBtnW = 110;
    const maskExtra = 28;
    const baseGap = 4;

    const hasAutoplay = !!this.controls.autoplayButton;
    const effectiveEdge = spinRadius + maskExtra + baseGap;
    const mainRowNaturalW = hasAutoplay
      ? secBtnW + effectiveEdge * 2
      : effectiveEdge + secBtnW;
    const availableW = (freeBottom?.width ?? safeRect.width) - 24;
    const hScale = Math.min(1.1, availableW / mainRowNaturalW);

    const rawFreeH = freeBottom?.height ?? 140;
    let totalBarH = Math.max(MIN_BAR_H, Math.min(MAX_BAR_H, rawFreeH));
    const vScale = totalBarH / MAX_BAR_H;
    const uiScale = Math.max(0.55, Math.min(hScale, vScale));

    const barX = freeBottom?.x ?? safeRect.x;
    const barW = freeBottom?.width ?? safeRect.width;
    const barBottom = freeBottom
      ? freeBottom.y + freeBottom.height
      : safeRect.y + safeRect.height;
    const centerX = barX + barW / 2;

    const regRowH = REGULATORY_ROW_H * uiScale;
    const secRowH = SECONDARY_ROW_H * uiScale;

    const scaledSpinR = spinRadius * uiScale;
    const scaledMaskR = (spinRadius + maskExtra) * uiScale;
    const scaledGap = baseGap * uiScale;
    const sideCount = hasAutoplay ? 2 : 1;
    const spaceForBtns = (barW / 2 - scaledMaskR - scaledGap) * sideCount;
    const idealTotalBtnW = secBtnW * uiScale * sideCount;
    const btnScale = idealTotalBtnW > spaceForBtns
      ? (spaceForBtns / idealTotalBtnW) * uiScale
      : uiScale;
    const scaledSecW = secBtnW * btnScale;
    const btnOffset = scaledMaskR + scaledGap + scaledSecW / 2;

    const isLandscape = safeRect.width > safeRect.height;
    const freeAreaCfg = gameClientConfig?.layout?.freeArea || {};
    const rightRailPadding = 10;
    const rightRailMinSafeHeight = Math.max(0, Number(freeAreaCfg.rightRailMinSafeHeightPx) || 0);
    const railSpinLiftPx = Math.max(0, Number(freeAreaCfg.railSpinLiftPx) || 14);
    const rightRailScaleBaseSafeHeight = Math.max(1, Number(freeAreaCfg.rightRailScaleBaseSafeHeightPx) || 780);
    const rightRailScaleMin = Math.max(0.6, Number(freeAreaCfg.rightRailScaleMin) || 0.95);
    const rightRailScaleMax = Math.max(rightRailScaleMin, Number(freeAreaCfg.rightRailScaleMax) || 1.3);
    const rightRailWidth = Math.max(0, freeRight?.width || 0);
    const rightRailHeight = Math.max(0, freeRight?.height || 0);
    const rightRailInnerW = Math.max(0, rightRailWidth - rightRailPadding * 2);
    const rightRailInnerH = Math.max(0, rightRailHeight - rightRailPadding * 2);
    const railBaseBtnH = this.controls.betButton?.getData("btnH") || 52;
    const railBaseGap = 10;
    const railExtraSpinTopGapBase = Number.isFinite(this.freespinsCounterValue) ? 26 : 14;
    const railAboveSpinCount = hasAutoplay ? 2 : 1;
    const railBaseStackH = (spinRadius * 2)
      + (railBaseBtnH * railAboveSpinCount)
      + (railBaseGap * railAboveSpinCount)
      + railExtraSpinTopGapBase;
    const railScaleByWidth = rightRailInnerW > 0
      ? rightRailInnerW / Math.max(secBtnW, spinRadius * 2)
      : 0;
    const railScaleByHeight = rightRailInnerH > 0
      ? rightRailInnerH / Math.max(1, railBaseStackH)
      : 0;
    const railTargetScaleBySafeHeight = safeRect.height / rightRailScaleBaseSafeHeight;
    const railTargetScale = Phaser.Math.Clamp(
      railTargetScaleBySafeHeight,
      rightRailScaleMin,
      rightRailScaleMax
    );
    const railFitScale = Math.min(railScaleByWidth, railScaleByHeight);
    const railActionScale = Math.max(0.6, Math.min(railTargetScale, railFitScale));
    const railSpinR = spinRadius * railActionScale;
    const railBtnH = railBaseBtnH * railActionScale;
    const railGap = railBaseGap * railActionScale;
    const railExtraSpinTopGap = railExtraSpinTopGapBase * railActionScale;
    const railNeededH = (railSpinR * 2)
      + (railBtnH * railAboveSpinCount)
      + (railGap * railAboveSpinCount)
      + railExtraSpinTopGap;
    const useRightRail = !!freeRight
      && isLandscape
      && safeRect.height >= rightRailMinSafeHeight
      && rightRailInnerW >= 72
      && rightRailInnerH >= railNeededH;

    if (useRightRail) {
      // Right rail mode: reclaim bottom free-area for game and keep only slim status bars.
      const compactMainH = Phaser.Math.Clamp(rawFreeH - secRowH - regRowH, 4 * uiScale, 18 * uiScale);
      totalBarH = Math.max(secRowH + regRowH + compactMainH, secRowH + regRowH);
    }

    const barTop = barBottom - totalBarH;
    const mainRowH = Math.max(0, totalBarH - secRowH - regRowH);
    const mainRowCenterY = barTop + mainRowH / 2;
    const secRowCenterY = barTop + mainRowH + secRowH / 2;
    const regRowCenterY = barTop + mainRowH + secRowH + regRowH / 2;

    this.controls.bottomBar
      .setPosition(centerX, barTop + mainRowH / 2)
      .setDisplaySize(barW + 40, mainRowH)
      .setVisible(mainRowH > 6);
    this.controls.bottomBarBorder
      .setPosition(centerX, barTop)
      .setDisplaySize(barW + 40, 2 * uiScale);
    this.controls.secondaryBar
      .setPosition(centerX, secRowCenterY)
      .setDisplaySize(barW + 40, secRowH);
    this.controls.regulatoryBar
      .setPosition(centerX, regRowCenterY)
      .setDisplaySize(barW + 40, regRowH);

    let spinScale = uiScale;
    let actionBtnScale = btnScale;
    let spinX = centerX;
    let spinY = mainRowCenterY;
    let betX = centerX + btnOffset;
    let betY = mainRowCenterY;
    let autoplayX = centerX - btnOffset;
    let autoplayY = mainRowCenterY;

    if (useRightRail) {
      const railButtonBaseW = this.controls.betButton?.getData("btnW") || secBtnW;
      const railHalfControlW = Math.max(railSpinR, (railButtonBaseW * railActionScale) / 2);
      const railNearGameGap = Math.max(20, 24 * railActionScale);
      const railMinCenterX = freeRight.x + railNearGameGap + railHalfControlW;
      const railMaxCenterX = freeRight.x + freeRight.width - rightRailPadding - railHalfControlW;
      const railAnchorX = freeRight.x + railNearGameGap + railHalfControlW;
      const railCenterX = railMaxCenterX > railMinCenterX
        ? Phaser.Math.Clamp(railAnchorX, railMinCenterX, railMaxCenterX)
        : freeRight.x + freeRight.width / 2;
      const secBarTopY = secRowCenterY - secRowH / 2;
      const railBottomByArea = freeRight.y + freeRight.height - rightRailPadding;
      const railBottomByBars = secBarTopY - Math.max(8, railSpinLiftPx * railActionScale);
      const railBottom = Math.min(railBottomByArea, railBottomByBars);
      let cursorBottom = railBottom;

      spinScale = railActionScale;
      actionBtnScale = railActionScale;

      spinY = cursorBottom - railSpinR;
      spinX = railCenterX;
      cursorBottom = spinY - railSpinR - railGap - railExtraSpinTopGap;

      betY = cursorBottom - railBtnH / 2;
      betX = railCenterX;
      cursorBottom = betY - railBtnH / 2 - railGap;

      if (hasAutoplay) {
        autoplayY = cursorBottom - railBtnH / 2;
        autoplayX = railCenterX;
      }
    }

    this.controls.spinButton.setScale(spinScale).setPosition(spinX, spinY);
    if (this.controls.spinInfoText) {
      const labelY = useRightRail
        ? Math.max(safeRect.y + 10, spinY - spinRadius * spinScale - 8 * spinScale)
        : Math.max(
          barTop + 10 * uiScale,
          mainRowCenterY - scaledSpinR - 8 * uiScale
        );
      const labelW = Math.max(120, Math.round(176 * spinScale));
      const labelH = Math.max(18, Math.round(30 * spinScale));
      this.setResponsiveBounds(this.controls.spinInfoText, {
        x: Math.round(spinX - labelW / 2),
        y: Math.round(labelY - labelH),
        width: labelW,
        height: labelH
      });
    }
    this.controls.betButton.setScale(actionBtnScale).setPosition(betX, betY);
    if (hasAutoplay) {
      this.controls.autoplayButton.setScale(actionBtnScale).setPosition(autoplayX, autoplayY);
    }

    const actionTextUiScale = Phaser.Math.Clamp(Math.max(actionBtnScale, 0.95), 0.95, 1.15);
    this.setContainerTextWorldScale(this.controls.betButton, actionTextUiScale);
    if (hasAutoplay) {
      this.setContainerTextWorldScale(this.controls.autoplayButton, actionTextUiScale);
    }

    if (this._spinCutoutGfx) {
      this._spinCutoutGfx.clear();
      if (!useRightRail) {
        this._spinCutoutGfx.fillStyle(0xffffff);
        this._spinCutoutGfx.fillCircle(centerX, mainRowCenterY, scaledMaskR);
      }
    }

    const iconGap = 32 * uiScale;
    const rightEdge = barX + barW - 12;
    this.controls.soundButton.setScale(uiScale).setPosition(rightEdge - iconGap * 0, secRowCenterY);
    this.controls.lobbyButton.setScale(uiScale).setPosition(rightEdge - iconGap * 1, secRowCenterY);
    this.controls.rulesButton.setScale(uiScale).setPosition(rightEdge - iconGap * 2, secRowCenterY);
    const iconTextUiScale = Phaser.Math.Clamp(Math.max(uiScale, 0.95), 0.95, 1.15);
    this.setContainerTextWorldScale(this.controls.soundButton, iconTextUiScale);
    this.setContainerTextWorldScale(this.controls.lobbyButton, iconTextUiScale);
    this.setContainerTextWorldScale(this.controls.rulesButton, iconTextUiScale);

    const iconHalfW = 18 * uiScale;
    const leftIconX = rightEdge - iconGap * 2;
    const balanceLeft = Math.round(barX + 10);
    const balanceRight = Math.max(balanceLeft + 80, Math.round(leftIconX - iconHalfW - 8 * uiScale));
    const balanceW = Math.max(1, balanceRight - balanceLeft);
    this.setResponsiveBounds(this.controls.balanceText, {
      x: balanceLeft,
      y: Math.round(secRowCenterY - secRowH / 2),
      width: balanceW,
      height: Math.max(1, Math.round(secRowH))
    });

    const regPad = Math.max(4, Math.round(6 * uiScale));
    const regGap = Math.max(4, Math.round(6 * uiScale));
    const regY = Math.round(regRowCenterY - regRowH / 2);
    const regInnerX = Math.round(barX + regPad);
    const regInnerW = Math.max(1, Math.round(barW - regPad * 2));
    const clockW = Math.max(1, Math.round(regInnerW * 0.22));
    const freeplayW = Math.max(1, Math.round(regInnerW * 0.2));
    const gameNameW = Math.max(1, regInnerW - clockW - freeplayW - regGap * 2);
    const clockX = regInnerX;
    const freeplayX = clockX + clockW + regGap;
    const gameNameX = freeplayX + freeplayW + regGap;
    const regHeight = Math.max(1, Math.round(regRowH));

    this.setResponsiveBounds(this.controls.clockText, {
      x: clockX,
      y: regY,
      width: clockW,
      height: regHeight
    });
    this.setResponsiveBounds(this.controls.freeplayText, {
      x: freeplayX,
      y: regY,
      width: freeplayW,
      height: regHeight
    });
    this.setResponsiveBounds(this.controls.gameNameText, {
      x: gameNameX,
      y: regY,
      width: gameNameW,
      height: regHeight
    });

    this._cachedLayout = {
      barTop,
      barBottom,
      barX,
      barW,
      centerX,
      uiScale,
      mainRowCenterY,
      secRowCenterY,
      secRowH,
      regRowCenterY,
      regRowH,
      actionLayout: useRightRail ? "right-rail" : "bottom-row"
    };
    this.layoutDevTab();
    this.layoutBetPicker();
    this.layoutAutoplayPicker();
    this.layoutDevStrategyPicker();
  }

  refreshUI() {
    const vm = this.viewModel;
    if (!vm || !this.controls.spinButton) return;

    if (typeof vm.balance === "number") {
      this.setLabelText(this.controls.balanceText, `Balance: ${vm.balance.toFixed(2)}`);
    }

    this.setSpinButtonState(!!vm.spinEnabled, !!vm.continuationPending);
    this.refreshSpinInfoLabel();
    this.setButtonState(this.controls.betButton, !!vm.betEnabled, `Bet: ${vm.betSize ?? 1}`);

    if (this.controls.autoplayButton) {
      const apActive = vm.autoplay === "on";
      const apRemaining = vm.autoplayRemaining;
      let apLabel = "Autoplay";
      if (apActive && typeof apRemaining === "number") {
        apLabel = apRemaining === Infinity ? "Autoplay \u221E" : `Autoplay ${apRemaining}`;
      }
      const apEnabled = !vm.gamePlayPrevented;
      this.setButtonState(this.controls.autoplayButton, apEnabled, apLabel);
      if (apEnabled) this.setAutoplayHighlight(apActive);
    }

    const soundIcon = vm.sound === "off" ? "\u266B\u0338" : "\u266B";
    this.controls.soundButton?.getData("text")?.setText(soundIcon);

    if (this.controls.devLayoutBtn) {
      this.setButtonState(this.controls.devLayoutBtn, true, `Layout: ${vm.layoutDebugEnabled ? "on" : "off"}`);
    }
    if (this.controls.devStrategyBtn) {
      const strategyId = vm.ticketStrategy || "normal";
      const strategyLabel = this.getDevStrategyOptions().find((opt) => opt.id === strategyId)?.label || strategyId;
      this.setButtonState(this.controls.devStrategyBtn, true, `Math: ${strategyLabel}`);
    }
    this.refreshDevStrategyPickerHighlight();

    if (this._betPickerVisible) this.refreshBetPickerHighlight();
  }

  setSpinButtonState(enabled, continuationPending = false) {
    const btn = this.controls.spinButton;
    if (!btn) return;
    const gfx = btn.getData("gfx");
    const radius = btn.getData("radius") || 48;
    const pri = this.theme.primary;
    const dis = this.theme.disabled;
    const iconMode = continuationPending ? "play" : "continue";
    btn.setData("enabled", enabled);
    btn.setData("iconMode", iconMode);
    if (enabled) {
      this.drawSpinButtonIcon(gfx, radius, pri.bg, pri.bgAlpha, pri.border, 0.9, iconMode);
      btn.setAlpha(1);
    } else {
      this.drawSpinButtonIcon(gfx, radius, dis.bg, dis.bgAlpha, dis.border, 0.5, iconMode);
      btn.setAlpha(0.7);
    }
  }

  setAutoplayHighlight(active) {
    const btn = this.controls.autoplayButton;
    if (!btn) return;
    const gfx = btn.getData("gfx");
    const text = btn.getData("text");
    const btnW = btn.getData("btnW");
    const btnH = btn.getData("btnH");
    const apTheme = this.theme.autoplayActive;
    const sec = this.theme.secondary;
    if (active) {
      const c = { bg: apTheme.bg, bgA: apTheme.bgAlpha, border: apTheme.border };
      btn.setData("colors", c);
      if (gfx) this.drawRoundedButton(gfx, btnW, btnH, c.bg, c.bgA, c.border);
      this.setLabelColor(text, "#44cc44");
    } else {
      const s = btn.getData("style");
      const c = { bg: s?.bgColor ?? sec.bg, bgA: s?.bgAlpha ?? sec.bgAlpha, border: s?.borderColor ?? sec.border };
      btn.setData("colors", c);
      if (gfx) this.drawRoundedButton(gfx, btnW, btnH, c.bg, c.bgA, c.border);
      this.setLabelColor(text, s?.textColor ?? sec.text);
    }
  }

  redrawLayoutDebugOverlay() {
    if (!this.layoutDebugGraphics) {
      return;
    }

    this.layoutDebugGraphics.clear();
    this.layoutDebugLabels.forEach((label) => {
      if (label && !label.destroyed) {
        label.destroy();
      }
    });
    this.layoutDebugLabels = [];
    if (!this.layoutDebugEnabled) {
      return;
    }

    const viewport = this.layoutSnapshot?.viewport || { width: this.scale.width, height: this.scale.height };
    const safeRect = this.layoutSnapshot?.safeRect || { x: 0, y: 0, width: viewport.width, height: viewport.height };
    const gameRect = this.layoutSnapshot?.gameRect || { x: 0, y: 0, width: viewport.width, height: viewport.height };
    const freeAreas = this.layoutSnapshot?.freeAreas || null;

    // Viewport bounds
    this.layoutDebugGraphics.lineStyle(2, 0xffd54f, 0.9);
    this.layoutDebugGraphics.strokeRect(0, 0, viewport.width, viewport.height);

    // UI safe area
    this.layoutDebugGraphics.lineStyle(2, 0x7cff7c, 0.95);
    this.layoutDebugGraphics.strokeRect(safeRect.x, safeRect.y, safeRect.width, safeRect.height);

    // Reel/game presentation area
    this.layoutDebugGraphics.fillStyle(0x4fc3f7, 0.08);
    this.layoutDebugGraphics.fillRect(gameRect.x, gameRect.y, gameRect.width, gameRect.height);
    this.layoutDebugGraphics.lineStyle(3, 0x4fc3f7, 0.98);
    this.layoutDebugGraphics.strokeRect(gameRect.x, gameRect.y, gameRect.width, gameRect.height);

    if (freeAreas?.bottom) {
      this.layoutDebugGraphics.fillStyle(0xff9800, 0.07);
      this.layoutDebugGraphics.fillRect(
        freeAreas.bottom.x,
        freeAreas.bottom.y,
        freeAreas.bottom.width,
        freeAreas.bottom.height
      );
      this.layoutDebugGraphics.lineStyle(1.5, 0xff9800, 0.9);
      this.layoutDebugGraphics.strokeRect(
        freeAreas.bottom.x,
        freeAreas.bottom.y,
        freeAreas.bottom.width,
        freeAreas.bottom.height
      );
    }

    // Actual GameScene camera viewport (true render rect from GameScene).
    const cameraRect = this.gameSceneCameraRect;
    if (cameraRect) {
      this.layoutDebugGraphics.lineStyle(1.5, 0xff66cc, 0.98);
      this.layoutDebugGraphics.strokeRect(cameraRect.x, cameraRect.y, cameraRect.width, cameraRect.height);
      // CAMERA center: filled green circle (larger)
      this.layoutDebugGraphics.fillStyle(0x00ff00, 0.95);
      this.layoutDebugGraphics.fillCircle(
        cameraRect.x + cameraRect.width / 2,
        cameraRect.y + cameraRect.height / 2,
        7
      );
    }

    const mustSeeRect = this.gameSceneMustSeeRect;
    if (mustSeeRect) {
      this.layoutDebugGraphics.lineStyle(1.5, 0xff2d2d, 0.98);
      this.layoutDebugGraphics.strokeRect(mustSeeRect.x, mustSeeRect.y, mustSeeRect.width, mustSeeRect.height);
    }

    const mkLabel = (x, y, text, color) => {
      const label = this.add.text(x, y, text, {
        fontSize: "12px",
        color,
        fontFamily: "Arial",
        stroke: "#000000",
        strokeThickness: 3
      }).setDepth(5001);
      this.layoutDebugLabels.push(label);
    };

    mkLabel(8, 8, "VIEWPORT", "#ffd54f");
    mkLabel(safeRect.x + 6, safeRect.y + 6, "SAFE", "#7cff7c");
    mkLabel(gameRect.x + 6, gameRect.y + 6, "GAME", "#4fc3f7");
    if (cameraRect) {
      mkLabel(cameraRect.x + 6, cameraRect.y + 6, "CAMERA", "#ff66cc");
    }
    if (mustSeeRect) {
      mkLabel(mustSeeRect.x + 6, mustSeeRect.y + 22, "MUST_SEE", "#ff2d2d");
    }
    if (freeAreas?.bottom) {
      mkLabel(freeAreas.bottom.x + 6, freeAreas.bottom.y + 6, "FREE_BOTTOM", "#ff9800");
    }

    if (this._cachedLayout) {
      const { barX, barW, secRowCenterY, secRowH, regRowCenterY, regRowH } = this._cachedLayout;
      if (secRowH) {
        const sy = secRowCenterY - secRowH / 2;
        this.layoutDebugGraphics.lineStyle(1.5, 0xb388ff, 0.85);
        this.layoutDebugGraphics.strokeRect(barX, sy, barW, secRowH);
        mkLabel(barX + 6, sy + 2, "SEC_BAR", "#b388ff");
      }
      if (regRowH) {
        const ry = regRowCenterY - regRowH / 2;
        this.layoutDebugGraphics.lineStyle(1.5, 0x66ccff, 0.85);
        this.layoutDebugGraphics.strokeRect(barX, ry, barW, regRowH);
        mkLabel(barX + 6, ry + 2, "REG_BAR", "#66ccff");
      }
    }
  }

  handleScenePointerDown(pointer, currentlyOver = []) {
    if (this._betPickerVisible || this._autoplayPickerVisible || this._devStrategyPickerVisible) {
      const age = this.time.now - (this._pickerOpenedAt || 0);
      if (age > 100) {
        this.closeBetPicker();
        this.closeAutoplayPicker();
        this.closeDevStrategyPicker();
      }
      return;
    }

    // Any interactive UI element was hit â€” never fast-forward
    if (currentlyOver.length > 0) {
      const vm = this.viewModel || {};
      const spinButton = this.controls.spinButton;
      const clickedSpinArea = currentlyOver.some(
        (obj) => obj === spinButton || spinButton?.getAll?.()?.includes(obj)
      );
      if (clickedSpinArea) {
        const intent = this.spinPointerIntent;
        if (intent) {
          const now = this.time?.now ?? Date.now();
          const withinWindow = now - intent.at <= 150;
          const samePointer = intent.id === null || pointer?.id === intent.id;
          if (withinWindow && samePointer) {
            this.spinPointerIntent = null;
            return;
          }
          if (!withinWindow) {
            this.spinPointerIntent = null;
          }
        }
      }
      if (clickedSpinArea && !vm.spinEnabled && vm.canFastForward) {
        this.eventBus?.emit("intent:fastForwardRequested");
      }
      return;
    }

    // Click landed in the bar area â€” absorb it
    if (this._cachedLayout) {
      const { barTop } = this._cachedLayout;
      if (pointer.y >= barTop) return;
    }

    const vm = this.viewModel || {};
    if (!vm.canFastForward) return;
    this.eventBus?.emit("intent:fastForwardRequested");
  }

  handleSpaceKeyDown(event) {
    if (event?.repeat) {
      return;
    }

    const vm = this.viewModel || {};
    if (vm.spinEnabled) {
      this.eventBus?.emit("intent:spinRequested");
      return;
    }

    if (vm.canFastForward) {
      this.eventBus?.emit("intent:fastForwardRequested");
    }
  }

  isDevMode() {
    try {
      return window.location.search.includes("dev");
    } catch (_) {
      return false;
    }
  }

  buildDevTab() {
    const tabW = 24;
    const tabH = 60;
    const tabBg = this.add.rectangle(0, 0, tabW, tabH, 0x14141e, 0.85)
      .setStrokeStyle(1, 0x555577, 0.6)
      .setOrigin(1, 0);
    const tabArrow = this.add.text(-tabW / 2, tabH / 2, "<", {
      fontSize: "16px", color: "#8fa3bc", fontFamily: "Arial"
    }).setOrigin(0.5);
    const tabHit = this.add.zone(-tabW / 2, tabH / 2, tabW + 8, tabH + 8)
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    this.controls.devTab = this.add.container(0, 0, [tabBg, tabArrow, tabHit])
      .setDepth(5500)
      .setSize(tabW, tabH);
    this.controls.devTab.setData("arrow", tabArrow);
    tabHit.on("pointerdown", () => this.toggleDevPanel());

    const panelW = 170;
    const btnH = 32;
    const gap = 6;
    const panelPad = 8;
    const strategyOptions = this.getDevStrategyOptions();
    const coreButtonCount = 5; // layout + math + rc + msg + theme
    const btnCount = coreButtonCount;
    const panelH = panelPad * 2 + btnCount * btnH + (btnCount - 1) * gap;

    this.devPanelContainer = this.add.container(0, 0).setDepth(5500).setVisible(false);
    const panelBg = this.add.rectangle(0, 0, panelW, panelH, 0x0a0a14, 0.92)
      .setStrokeStyle(1, 0x555577, 0.6)
      .setOrigin(1, 0);
    this.devPanelContainer.add(panelBg);

    const mkBtn = (label, y, onClick) => {
      const btnW = panelW - panelPad * 2;
      const bx = -panelPad - btnW / 2;
      const by = panelPad + y + btnH / 2;
      const btn = this.createButton(label, onClick, true, "utility");
      btn.setPosition(bx, by);
      const bg = btn.getData("bg");
      if (bg) bg.setDisplaySize(btnW, btnH);
      btn.setSize(btnW, btnH);
      this.devPanelContainer.add(btn);
      return btn;
    };

    let row = 0;
    this.controls.devLayoutBtn = mkBtn("Layout: off", (btnH + gap) * row, () => this.eventBus?.emit("intent:layoutDebugToggled"));
    row += 1;

    this.controls.devStrategyBtn = mkBtn("Math: normal", (btnH + gap) * row, () => this.toggleDevStrategyPicker());
    this._devStrategyOptions = strategyOptions;
    row += 1;

    mkBtn("RC", (btnH + gap) * row, () => this.eventBus?.emit("intent:injectRealityCheck"));
    row += 1;
    mkBtn("MSG", (btnH + gap) * row, () => this.eventBus?.emit("intent:injectPlayerMessage"));
    row += 1;
    mkBtn("Theme", (btnH + gap) * row, () => this.openThemeEditor());
  }

  getDevStrategyOptions() {
    const raw = this.settings?.dev?.ticketStrategies;
    const entries = Array.isArray(raw) ? raw : [];
    const normalized = entries
      .map((item) => {
        if (typeof item === "string") {
          return { id: item, label: item };
        }
        if (item && typeof item === "object" && typeof item.id === "string") {
          return { id: item.id, label: item.label || item.id };
        }
        return null;
      })
      .filter(Boolean);

    if (normalized.length === 0) {
      return [{ id: "normal", label: "normal" }];
    }
    return normalized;
  }

  toggleDevStrategyPicker() {
    if (this._devStrategyPickerVisible) {
      this.closeDevStrategyPicker();
    } else {
      this.closeBetPicker();
      this.closeAutoplayPicker();
      this.openDevStrategyPicker();
    }
  }

  openDevStrategyPicker() {
    if (this._devStrategyPickerContainer) this.closeDevStrategyPicker();

    const options = this.getDevStrategyOptions();
    if (!options.length) return;

    const container = this.add.container(0, 0).setDepth(1500);
    const chipH = 32;
    const chipW = 150;
    const gap = 4;
    const pad = 8;
    const panelW = chipW + pad * 2;
    const panelH = options.length * (chipH + gap) - gap + pad * 2;

    const bg = this.add.rectangle(0, 0, panelW, panelH, 0x0a0a14, 0.94)
      .setStrokeStyle(1.5, 0x555577, 0.7)
      .setOrigin(1, 0);
    container.add(bg);

    const activeId = this.viewModel?.ticketStrategy || this.settings?.dev?.defaultTicketStrategy || options[0].id;
    this._devStrategyChips = [];
    options.forEach((strategy, i) => {
      const isActive = strategy.id === activeId;
      const cx = -panelW + pad + chipW / 2;
      const cy = pad + i * (chipH + gap) + chipH / 2;
      const chipBg = this.add.rectangle(
        cx,
        cy,
        chipW,
        chipH,
        isActive ? 0x2a1800 : 0x14141e,
        isActive ? 0.95 : 0.8
      ).setStrokeStyle(1.5, isActive ? 0xffd700 : 0x555577, 0.8)
        .setInteractive({ useHandCursor: true });
      const chipText = this.crispText(cx, cy, strategy.label, {
        fontSize: "14px",
        color: isActive ? "#ffd700" : "#a7b8ca",
        fontFamily: "Arial",
        fontStyle: isActive ? "bold" : "normal"
      });
      chipBg.on("pointerdown", () => {
        this.eventBus?.emit("intent:ticketStrategySelected", strategy.id);
        this.closeDevStrategyPicker();
      });
      chipBg.on("pointerover", () => chipBg.setFillStyle(0x22223a, 0.95));
      chipBg.on("pointerout", () =>
        chipBg.setFillStyle(isActive ? 0x2a1800 : 0x14141e, isActive ? 0.95 : 0.8)
      );

      container.add([chipBg, chipText]);
      this._devStrategyChips.push({ id: strategy.id, bg: chipBg, text: chipText });
    });

    this._devStrategyPickerContainer = container;
    this._devStrategyPickerVisible = true;
    this._pickerOpenedAt = this.time.now;
    this.setPickerMode(true);
    this.controls.devStrategyBtn?.setAlpha(1);
    this.controls.devStrategyBtn?.setData("enabled", true);
    this.layoutDevStrategyPicker();
  }

  closeDevStrategyPicker() {
    if (this._devStrategyPickerContainer) {
      this._devStrategyPickerContainer.destroy(true);
      this._devStrategyPickerContainer = null;
    }
    this._devStrategyChips = null;
    this._devStrategyPickerVisible = false;
    if (!this._betPickerVisible && !this._autoplayPickerVisible) this.setPickerMode(false);
  }

  layoutDevStrategyPicker() {
    if (!this._devStrategyPickerContainer || !this.controls.devStrategyBtn) return;
    const btnBounds = this.controls.devStrategyBtn.getBounds();
    if (!btnBounds) return;

    let px = btnBounds.left - 6;
    let py = btnBounds.bottom + 4;

    const bounds = this._devStrategyPickerContainer.getBounds();
    const pw = bounds?.width || 120;
    const ph = bounds?.height || 120;
    const safeRect = this.layoutSnapshot?.safeRect || { x: 0, y: 0, width: this.scale.width, height: this.scale.height };
    const rightEdge = safeRect.x + safeRect.width;
    const bottomEdge = safeRect.y + safeRect.height;

    if (px - pw < safeRect.x) {
      px = safeRect.x + pw + 4;
    }
    if (py + ph > bottomEdge) {
      py = Math.max(safeRect.y + 4, btnBounds.top - ph - 4);
    }
    if (px > rightEdge - 4) {
      px = rightEdge - 4;
    }

    this._devStrategyPickerContainer.setPosition(px, py);
  }

  refreshDevStrategyPickerHighlight() {
    if (!this._devStrategyChips) return;
    const activeId = this.viewModel?.ticketStrategy;
    this._devStrategyChips.forEach(({ id, bg, text }) => {
      const isActive = id === activeId;
      bg.setFillStyle(isActive ? 0x2a1800 : 0x14141e, isActive ? 0.95 : 0.8);
      bg.setStrokeStyle(1.5, isActive ? 0xffd700 : 0x555577, 0.8);
      text.setColor(isActive ? "#ffd700" : "#a7b8ca");
      text.setFontStyle(isActive ? "bold" : "normal");
    });
  }

  layoutDevTab() {
    if (!this.controls.devTab) return;
    const { width } = this.scale;
    const safeRect = this.layoutSnapshot?.safeRect || { x: 0, y: 0, width, height: this.scale.height };
    const rightEdge = safeRect.x + safeRect.width;
    const topY = safeRect.y + 40;

    this.controls.devTab.setPosition(rightEdge, topY);
    if (this.devPanelContainer) {
      this.devPanelContainer.setPosition(rightEdge - 24, topY);
    }
  }

  toggleDevPanel() {
    this.devPanelOpen = !this.devPanelOpen;
    if (this.devPanelContainer) {
      this.devPanelContainer.setVisible(this.devPanelOpen);
    }
    const arrow = this.controls.devTab?.getData("arrow");
    if (arrow) {
      arrow.setText(this.devPanelOpen ? ">" : "<");
    }
  }

  // =====================================================================
  // Theme Editor (dev mode)
  // =====================================================================

  openThemeEditor() {
    if (this._themeEditorEl) {
      this.closeThemeEditor();
      return;
    }

    const panel = document.createElement("div");
    Object.assign(panel.style, {
      position: "fixed", top: "10px", left: "10px", zIndex: "99999",
      background: "#0a0a14ee", border: "1px solid #555577", borderRadius: "8px",
      padding: "12px", color: "#a7b8ca", fontFamily: "Arial, sans-serif",
      fontSize: "12px", maxHeight: "90vh", overflowY: "auto", minWidth: "260px",
      boxShadow: "0 4px 24px rgba(0,0,0,0.6)",
    });

    const title = document.createElement("div");
    title.textContent = "Theme Editor";
    Object.assign(title.style, { fontSize: "14px", fontWeight: "bold", marginBottom: "10px", color: "#ffd700" });
    panel.appendChild(title);

    const groups = [
      { key: "primary", label: "Primary (Spin)", fields: ["bg", "border", "hover"] },
      { key: "secondary", label: "Secondary (Auto/Bet)", fields: ["bg", "border", "hover"] },
      { key: "utility", label: "Utility (Icons)", fields: ["bg", "border", "hover"] },
      { key: "disabled", label: "Disabled", fields: ["bg", "border"] },
      { key: "autoplayActive", label: "Autoplay Active", fields: ["bg", "border"] },
      { key: "secondaryBar", label: "Secondary Bar", fields: ["bg"] },
      { key: "regulatoryBar", label: "Regulatory Bar", fields: ["bg"] },
    ];

    const toHex = (n) => "#" + ("000000" + (n >>> 0).toString(16)).slice(-6);
    const fromHex = (s) => parseInt(s.replace("#", ""), 16);

    for (const group of groups) {
      const section = document.createElement("div");
      section.style.marginBottom = "8px";
      const heading = document.createElement("div");
      heading.textContent = group.label;
      Object.assign(heading.style, { fontSize: "11px", color: "#8fa3bc", marginBottom: "4px", fontWeight: "bold" });
      section.appendChild(heading);

      const themeGroup = this.theme[group.key];
      if (!themeGroup) continue;

      for (const field of group.fields) {
        if (themeGroup[field] === undefined) continue;
        const row = document.createElement("div");
        Object.assign(row.style, { display: "flex", alignItems: "center", gap: "6px", marginBottom: "2px" });

        const lbl = document.createElement("span");
        lbl.textContent = field;
        lbl.style.width = "50px";

        const input = document.createElement("input");
        input.type = "color";
        input.value = toHex(themeGroup[field]);
        Object.assign(input.style, { width: "36px", height: "22px", border: "none", cursor: "pointer", background: "transparent" });

        const hexLbl = document.createElement("span");
        hexLbl.textContent = toHex(themeGroup[field]);
        hexLbl.style.color = "#666688";
        hexLbl.style.fontSize = "10px";

        input.addEventListener("input", () => {
          themeGroup[field] = fromHex(input.value);
          hexLbl.textContent = input.value;
          this._applyThemeLive();
        });

        row.appendChild(lbl);
        row.appendChild(input);
        row.appendChild(hexLbl);
        section.appendChild(row);
      }
      panel.appendChild(section);
    }

    const btnRow = document.createElement("div");
    Object.assign(btnRow.style, { display: "flex", gap: "6px", marginTop: "10px" });

    const copyBtn = document.createElement("button");
    copyBtn.textContent = "Copy Config";
    Object.assign(copyBtn.style, {
      flex: "1", padding: "6px", background: "#1a0f00", color: "#ffd700",
      border: "1px solid #ffd700", borderRadius: "4px", cursor: "pointer", fontSize: "12px",
    });
    copyBtn.addEventListener("click", () => {
      const cfg = this._exportThemeConfig();
      navigator.clipboard.writeText(cfg).then(() => {
        copyBtn.textContent = "Copied!";
        setTimeout(() => { copyBtn.textContent = "Copy Config"; }, 1500);
      });
    });

    const closeBtn = document.createElement("button");
    closeBtn.textContent = "Close";
    Object.assign(closeBtn.style, {
      flex: "1", padding: "6px", background: "#14141e", color: "#a7b8ca",
      border: "1px solid #555577", borderRadius: "4px", cursor: "pointer", fontSize: "12px",
    });
    closeBtn.addEventListener("click", () => this.closeThemeEditor());

    btnRow.appendChild(copyBtn);
    btnRow.appendChild(closeBtn);
    panel.appendChild(btnRow);

    document.body.appendChild(panel);
    this._themeEditorEl = panel;
  }

  closeThemeEditor() {
    if (this._themeEditorEl) {
      this._themeEditorEl.remove();
      this._themeEditorEl = null;
    }
  }

  _applyThemeLive() {
    this.destroyUI();
    this.buildUI();
    this.layoutUI();
    this.refreshUI();
  }

  _exportThemeConfig() {
    const t = this.theme;
    const h = (n) => "0x" + ("000000" + (n >>> 0).toString(16)).slice(-6);

    return `const gameClientConfig = {
  gameName: "${this.gameName}",

  theme: {
    primary: {
      bg: ${h(t.primary.bg)}, bgAlpha: ${t.primary.bgAlpha},
      border: ${h(t.primary.border)},
      hover: ${h(t.primary.hover)}, hoverAlpha: ${t.primary.hoverAlpha},
      text: "${t.primary.text}",
    },
    secondary: {
      bg: ${h(t.secondary.bg)}, bgAlpha: ${t.secondary.bgAlpha},
      border: ${h(t.secondary.border)},
      hover: ${h(t.secondary.hover)}, hoverAlpha: ${t.secondary.hoverAlpha},
      text: "${t.secondary.text}",
    },
    utility: {
      bg: ${h(t.utility.bg)}, bgAlpha: ${t.utility.bgAlpha},
      border: ${h(t.utility.border)},
      hover: ${h(t.utility.hover)}, hoverAlpha: ${t.utility.hoverAlpha},
      text: "${t.utility.text}",
    },
    disabled: {
      bg: ${h(t.disabled.bg)}, bgAlpha: ${t.disabled.bgAlpha},
      border: ${h(t.disabled.border)},
      text: "${t.disabled.text}",
    },
    autoplayActive: {
      bg: ${h(t.autoplayActive.bg)}, bgAlpha: ${t.autoplayActive.bgAlpha},
      border: ${h(t.autoplayActive.border)},
    },
    picker: {
      bg: ${h(t.picker.bg)}, bgAlpha: ${t.picker.bgAlpha},
      border: ${h(t.picker.border)},
      chipActive: { bg: ${h(t.picker.chipActive.bg)}, bgAlpha: ${t.picker.chipActive.bgAlpha}, border: ${h(t.picker.chipActive.border)}, text: "${t.picker.chipActive.text}" },
      chipInactive: { bg: ${h(t.picker.chipInactive.bg)}, bgAlpha: ${t.picker.chipInactive.bgAlpha}, border: ${h(t.picker.chipInactive.border)}, text: "${t.picker.chipInactive.text}" },
    },
    secondaryBar: {
      bg: ${h(t.secondaryBar.bg)}, bgAlpha: ${t.secondaryBar.bgAlpha},
    },
    regulatoryBar: {
      bg: ${h(t.regulatoryBar.bg)}, bgAlpha: ${t.regulatoryBar.bgAlpha},
      text: "${t.regulatoryBar.text}",
    },
    dialog: {
      overlay: { color: ${h(t.dialog.overlay.color)}, alpha: ${t.dialog.overlay.alpha} },
      panel: { bg: ${h(t.dialog.panel.bg)}, bgAlpha: ${t.dialog.panel.bgAlpha}, border: ${h(t.dialog.panel.border)} },
    },
  },
};

export default gameClientConfig;
`;
  }

  // =====================================================================
  // Bet Picker
  // =====================================================================

  toggleBetPicker() {
    if (this._betPickerVisible) {
      this.closeBetPicker();
    } else {
      this.closeAutoplayPicker();
      this.closeDevStrategyPicker();
      this.openBetPicker();
    }
  }

  setPickerMode(active) {
    if (active) {
      this.controls.spinButton?.setData("enabled", false);
      this.setSpinButtonState(false, !!this.viewModel?.continuationPending);
      if (this.controls.autoplayButton) {
        this.controls.autoplayButton.setAlpha(0.4);
        this.controls.autoplayButton.setData("enabled", false);
      }
      this.controls.betButton?.setAlpha(0.4);
      this.controls.betButton?.setData("enabled", false);
    } else {
      this.refreshUI();
    }
  }

  openBetPicker() {
    if (this._betPickerContainer) this.closeBetPicker();

    const betLevels = this.viewModel?.betLevels || [];
    if (betLevels.length === 0) return;

    const container = this.add.container(0, 0).setDepth(1500);
    const chipH = 36;
    const chipW = 72;
    const gap = 4;
    const pad = 8;
    const n = betLevels.length;
    const rows = n > 1 ? 2 : 1;
    const cols = Math.ceil(n / rows);
    const rowItems = [];
    let remaining = n;
    for (let r = 0; r < rows; r++) {
      const rowsLeft = rows - r;
      const count = Math.ceil(remaining / rowsLeft);
      rowItems.push(count);
      remaining -= count;
    }

    const maxCols = Math.max(...rowItems);
    const panelW = maxCols * (chipW + gap) - gap + pad * 2;
    const panelH = rows * (chipH + gap) - gap + pad * 2;

    const bg = this.add.rectangle(0, 0, panelW, panelH, 0x0a0a14, 0.94)
      .setStrokeStyle(1.5, 0x555577, 0.7)
      .setOrigin(0.5, 1);
    container.add(bg);

    this._betChips = [];
    let chipIdx = 0;
    rowItems.forEach((count, row) => {
      const rowW = count * (chipW + gap) - gap;
      const rowStartX = -rowW / 2 + chipW / 2;
      for (let c = 0; c < count; c++) {
        const bet = betLevels[chipIdx++];
        const cx = rowStartX + c * (chipW + gap);
        const cy = -panelH + pad + row * (chipH + gap) + chipH / 2;
        const isActive = bet === this.viewModel?.betSize;
        const chipBg = this.add.rectangle(cx, cy, chipW, chipH,
          isActive ? 0x2a1800 : 0x14141e, isActive ? 0.95 : 0.8
        ).setStrokeStyle(1.5, isActive ? 0xffd700 : 0x555577, 0.8)
          .setInteractive({ useHandCursor: true });
        const chipText = this.crispText(cx, cy, String(bet), {
          fontSize: "15px", color: isActive ? "#ffd700" : "#a7b8ca", fontFamily: "Arial",
          fontStyle: isActive ? "bold" : "normal"
        });
        chipBg.on("pointerdown", () => {
          this.eventBus?.emit("intent:betSelected", bet);
          this.closeBetPicker();
        });
        chipBg.on("pointerover", () => chipBg.setFillStyle(0x22223a, 0.95));
        chipBg.on("pointerout", () => chipBg.setFillStyle(
          isActive ? 0x2a1800 : 0x14141e, isActive ? 0.95 : 0.8
        ));
        container.add([chipBg, chipText]);
        this._betChips.push({ bet, bg: chipBg, text: chipText });
      }
    });

    this._betPickerContainer = container;
    this._betPickerVisible = true;
    this._pickerOpenedAt = this.time.now;
    this.setPickerMode(true);
    this.controls.betButton?.setAlpha(1);
    this.controls.betButton?.setData("enabled", true);
    this.layoutBetPicker();
  }

  closeBetPicker() {
    if (this._betPickerContainer) {
      this._betPickerContainer.destroy(true);
      this._betPickerContainer = null;
    }
    this._betChips = null;
    this._betPickerVisible = false;
    if (!this._autoplayPickerVisible && !this._devStrategyPickerVisible) this.setPickerMode(false);
  }

  positionPickerNearButton(pickerContainer, button, pickerScale) {
    if (!pickerContainer || !button) return;

    const safeRect = this.layoutSnapshot?.safeRect || {
      x: 0,
      y: 0,
      width: this.scale.width,
      height: this.scale.height
    };
    const safeLeft = safeRect.x + 4;
    const safeTop = safeRect.y + 4;
    const safeRight = safeRect.x + safeRect.width - 4;
    const safeBottom = safeRect.y + safeRect.height - 4;
    const isRightRail = this._cachedLayout?.actionLayout === "right-rail";

    pickerContainer.setScale(pickerScale);
    const bounds = pickerContainer.getBounds();
    const pw = bounds?.width || 100;
    const ph = bounds?.height || 50;
    const btnBounds = button.getBounds();

    let x = btnBounds.centerX;
    let y = btnBounds.top - 6;

    if (isRightRail) {
      // In rail mode, open picker to the left of the vertical button stack.
      x = btnBounds.left - 8 - pw / 2;
      y = btnBounds.centerY + ph / 2;
    }

    const minX = safeLeft + pw / 2;
    const maxX = safeRight - pw / 2;
    const minY = safeTop + ph;
    const maxY = safeBottom;

    x = Phaser.Math.Clamp(x, minX, maxX);
    y = Phaser.Math.Clamp(y, minY, maxY);
    pickerContainer.setPosition(x, y);
  }

  layoutBetPicker() {
    if (!this._betPickerContainer || !this._cachedLayout) return;
    const fallbackScale = this._cachedLayout.uiScale || 1;
    const buttonScale = this.controls.betButton?.scaleX || fallbackScale;
    const pickerScale = this._cachedLayout.actionLayout === "right-rail"
      ? Math.max(0.9, buttonScale)
      : fallbackScale;
    this.positionPickerNearButton(this._betPickerContainer, this.controls.betButton, pickerScale);
  }

  refreshBetPickerHighlight() {
    if (!this._betChips) return;
    const currentBet = this.viewModel?.betSize;
    this._betChips.forEach(({ bet, bg, text }) => {
      const isActive = bet === currentBet;
      bg.setFillStyle(isActive ? 0x2a1800 : 0x14141e, isActive ? 0.95 : 0.8);
      bg.setStrokeStyle(1.5, isActive ? 0xffd700 : 0x555577, 0.8);
      text.setColor(isActive ? "#ffd700" : "#a7b8ca");
      text.setFontStyle(isActive ? "bold" : "normal");
    });
  }

  // =====================================================================
  // Autoplay Picker
  // =====================================================================

  handleAutoplayClick() {
    const vm = this.viewModel || {};
    if (vm.autoplay === "on") {
      this.eventBus?.emit("intent:autoplayToggled");
    } else {
      this.toggleAutoplayPicker();
    }
  }

  toggleAutoplayPicker() {
    if (this._autoplayPickerVisible) {
      this.closeAutoplayPicker();
    } else {
      this.closeBetPicker();
      this.closeDevStrategyPicker();
      this.openAutoplayPicker();
    }
  }

  openAutoplayPicker() {
    if (this._autoplayPickerContainer) this.closeAutoplayPicker();

    const options = [10, 20, 50, 100, Infinity];
    const labels = ["10", "20", "50", "100", "\u221E"];
    const container = this.add.container(0, 0).setDepth(1500);

    const chipH = 36;
    const chipW = 56;
    const gap = 4;
    const pad = 8;
    const panelW = options.length * (chipW + gap) - gap + pad * 2;
    const panelH = chipH + pad * 2;

    const bg = this.add.rectangle(0, 0, panelW, panelH, 0x0a0a14, 0.94)
      .setStrokeStyle(1.5, 0x555577, 0.7)
      .setOrigin(0.5, 1);
    container.add(bg);

    const currentAp = this.viewModel?.autoplay;
    const currentCount = this.viewModel?.autoplayTarget;

    options.forEach((count, i) => {
      const cx = -panelW / 2 + pad + i * (chipW + gap) + chipW / 2;
      const cy = -panelH + pad + chipH / 2;
      const isActive = currentAp === "on" && currentCount === count;
      const chipBg = this.add.rectangle(cx, cy, chipW, chipH,
        isActive ? 0x2a1800 : 0x14141e, isActive ? 0.95 : 0.8
      ).setStrokeStyle(1.5, isActive ? 0xffd700 : 0x555577, 0.8)
        .setInteractive({ useHandCursor: true });
      const chipText = this.crispText(cx, cy, labels[i], {
        fontSize: "15px", color: isActive ? "#ffd700" : "#a7b8ca", fontFamily: "Arial",
        fontStyle: isActive ? "bold" : "normal"
      });
      chipBg.on("pointerdown", () => {
        this.eventBus?.emit("intent:autoplaySet", count);
        this.closeAutoplayPicker();
      });
      chipBg.on("pointerover", () => chipBg.setFillStyle(0x22223a, 0.95));
      chipBg.on("pointerout", () => chipBg.setFillStyle(
        isActive ? 0x2a1800 : 0x14141e, isActive ? 0.95 : 0.8
      ));
      container.add([chipBg, chipText]);
    });

    this._autoplayPickerContainer = container;
    this._autoplayPickerVisible = true;
    this._pickerOpenedAt = this.time.now;
    this.setPickerMode(true);
    if (this.controls.autoplayButton) {
      this.controls.autoplayButton.setAlpha(1);
      this.controls.autoplayButton.setData("enabled", true);
    }
    this.layoutAutoplayPicker();
  }

  closeAutoplayPicker() {
    if (this._autoplayPickerContainer) {
      this._autoplayPickerContainer.destroy(true);
      this._autoplayPickerContainer = null;
    }
    this._autoplayPickerVisible = false;
    if (!this._betPickerVisible && !this._devStrategyPickerVisible) this.setPickerMode(false);
  }

  layoutAutoplayPicker() {
    if (!this._autoplayPickerContainer || !this._cachedLayout) return;
    if (!this.controls.autoplayButton) return;
    const fallbackScale = this._cachedLayout.uiScale || 1;
    const buttonScale = this.controls.autoplayButton.scaleX || fallbackScale;
    const pickerScale = this._cachedLayout.actionLayout === "right-rail"
      ? Math.max(0.9, buttonScale)
      : fallbackScale;
    this.positionPickerNearButton(this._autoplayPickerContainer, this.controls.autoplayButton, pickerScale);
  }

  showDialog(msg) {
    return new Promise((resolve) => {
      this.destroyDialog();

      const { width, height } = this.scale;
      const dialogElements = [];

      const overlay = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.65)
        .setDepth(2000)
        .setInteractive();
      dialogElements.push(overlay);

      const panelW = Math.min(420, width * 0.85);
      const panelH = 200;
      const panelX = width / 2;
      const panelY = height / 2;

      const panel = this.add.rectangle(panelX, panelY, panelW, panelH, 0x0a0a14, 0.95)
        .setStrokeStyle(2, 0x555577, 0.85)
        .setDepth(2001);
      dialogElements.push(panel);

      const title = this.add.text(panelX, panelY - panelH / 2 + 24, msg.title || "Notice", {
        fontSize: "20px", color: "#ffd700", fontFamily: "Arial", fontStyle: "bold",
        stroke: "#000000", strokeThickness: 3
      }).setOrigin(0.5, 0).setDepth(2002);
      dialogElements.push(title);

      const body = this.add.text(panelX, panelY - 10, msg.body || "", {
        fontSize: "15px", color: "#a7b8ca", fontFamily: "Arial",
        stroke: "#000000", strokeThickness: 2,
        wordWrap: { width: panelW - 40 }, align: "center"
      }).setOrigin(0.5).setDepth(2002);
      dialogElements.push(body);

      const actions = msg.actions || ["OK"];
      const btnGap = 16;
      const btnW = 100;
      const totalBtnsW = actions.length * btnW + (actions.length - 1) * btnGap;
      const startX = panelX - totalBtnsW / 2 + btnW / 2;
      const btnY = panelY + panelH / 2 - 36;

      actions.forEach((label, i) => {
        const bx = startX + i * (btnW + btnGap);
        const btnBg = this.add.rectangle(bx, btnY, btnW, 36, 0x1a0f00, 0.9)
          .setStrokeStyle(1.5, 0xffd700, 0.85)
          .setDepth(2002)
          .setInteractive({ useHandCursor: true });
        const btnText = this.add.text(bx, btnY, label, {
          fontSize: "15px", color: "#ffd700", fontFamily: "Arial", fontStyle: "bold"
        }).setOrigin(0.5).setDepth(2003);

        btnBg.on("pointerover", () => btnBg.setFillStyle(0x2a1800, 0.95));
        btnBg.on("pointerout", () => btnBg.setFillStyle(0x1a0f00, 0.9));
        btnBg.on("pointerdown", () => {
          this.destroyDialog();
          resolve(label);
        });

        dialogElements.push(btnBg, btnText);
      });

      this._dialogElements = dialogElements;
    });
  }

  destroyDialog() {
    if (!this._dialogElements) return;
    this._dialogElements.forEach((el) => {
      if (el && !el.destroyed) el.destroy();
    });
    this._dialogElements = null;
  }

  // =====================================================================
  // mustSeeBounds interactive sliders (visible when layout debug is on)
  // =====================================================================

  getPointerLocalXInContainer(pointer, container) {
    const camPoint = pointer?.positionToCamera?.(this.cameras.main) || pointer;
    return (camPoint?.x ?? 0) - (container?.x ?? 0);
  }

  buildMustSeeSliders() {
    if (this.mustSeeSlidersContainer) return;

    // Grab original values from GameScene
    const gameScene = this.scene.get("GameScene");
    const bounds = gameScene?.getLayoutContentBounds?.()?.mustSeeBounds;
    if (!bounds) return;

    this.mustSeeBaseValues = { ...bounds };
    this.mustSeeBoundsOverride = { ...bounds };

    const PANEL_W = 260;
    const PANEL_H = 210;
    const panelX = 10;
    const panelY = 80;

    this.mustSeeSlidersContainer = this.add.container(panelX, panelY).setDepth(6000);

    // Panel background
    const bg = this.add.rectangle(0, 0, PANEL_W, PANEL_H, 0x000000, 0.82)
      .setOrigin(0, 0)
      .setStrokeStyle(1, 0xff2d2d, 0.6);
    this.mustSeeSlidersContainer.add(bg);

    const title = this.add.text(PANEL_W / 2, 12, "mustSeeBounds", {
      fontSize: "13px", color: "#ff4444", fontFamily: "Arial",
      stroke: "#000000", strokeThickness: 2
    }).setOrigin(0.5, 0);
    this.mustSeeSlidersContainer.add(title);

    // Reset button
    const resetBtn = this.add.text(PANEL_W - 10, 12, "Reset", {
      fontSize: "11px", color: "#aaaaaa", fontFamily: "Arial",
      stroke: "#000000", strokeThickness: 2
    }).setOrigin(1, 0).setInteractive({ useHandCursor: true });
    resetBtn.on("pointerdown", () => {
      this.mustSeeBoundsOverride = { ...this.mustSeeBaseValues };
      this.refreshMustSeeSliderPositions();
      this.emitMustSeeOverride();
    });
    this.mustSeeSlidersContainer.add(resetBtn);

    // Slider configs: label, key, min, max
    const sliders = [
      { label: "X",      key: "x",      min: -200, max: 400  },
      { label: "Y",      key: "y",      min: -200, max: 400  },
      { label: "Width",  key: "width",  min: 50,   max: 1200 },
      { label: "Height", key: "height", min: 50,   max: 1200 }
    ];

    const TRACK_X = 70;
    const TRACK_W = 160;
    const START_Y = 42;
    const ROW_H = 40;

    sliders.forEach((cfg, i) => {
      const rowY = START_Y + i * ROW_H;

      // Label
      const lbl = this.add.text(8, rowY + 6, cfg.label, {
        fontSize: "12px", color: "#cccccc", fontFamily: "Arial",
        stroke: "#000000", strokeThickness: 2
      });
      this.mustSeeSlidersContainer.add(lbl);

      // Track background
      const track = this.add.rectangle(TRACK_X, rowY + 12, TRACK_W, 6, 0x444444, 0.9)
        .setOrigin(0, 0.5);
      this.mustSeeSlidersContainer.add(track);

      // Wide, forgiving hit area for clicking/dragging on track.
      const trackHit = this.add.zone(TRACK_X + TRACK_W / 2, rowY + 12, TRACK_W + 18, 28)
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
      this.mustSeeSlidersContainer.add(trackHit);

      // Value text (right of track) â€” clickable to type exact value
      const valText = this.add.text(TRACK_X + TRACK_W + 6, rowY + 4, "", {
        fontSize: "12px", color: "#ffffff", fontFamily: "Arial",
        stroke: "#000000", strokeThickness: 2,
        backgroundColor: "#222222",
        padding: { x: 4, y: 2 }
      }).setInteractive({ useHandCursor: true });
      this.mustSeeSlidersContainer.add(valText);

      // Click value text -> open a tiny DOM input to type exact number
      valText.on("pointerdown", () => {
        this.openMustSeeInput(cfg.key);
      });

      // Drag handle
      const handle = this.add.rectangle(0, rowY + 12, 14, 22, 0xff5555, 0.95)
        .setOrigin(0.5)
        .setStrokeStyle(1, 0xffffff, 0.7);
      this.mustSeeSlidersContainer.add(handle);

      const handleHit = this.add.zone(0, rowY + 12, 24, 30)
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
      this.mustSeeSlidersContainer.add(handleHit);

      const applySliderFromLocalX = (localX) => {
        const clampedX = Phaser.Math.Clamp(localX, TRACK_X, TRACK_X + TRACK_W);
        handle.x = clampedX;
        handleHit.x = clampedX;
        const t = (clampedX - TRACK_X) / TRACK_W;
        const value = Math.round(cfg.min + t * (cfg.max - cfg.min));
        this.mustSeeBoundsOverride[cfg.key] = value;
        valText.setText(String(value));
        this.emitMustSeeOverride();
      };

      trackHit.on("pointerdown", (pointer) => {
        const localX = this.getPointerLocalXInContainer(pointer, this.mustSeeSlidersContainer);
        applySliderFromLocalX(localX);
      });

      this.input.setDraggable(handleHit);
      handleHit.on("drag", (pointer) => {
        const localX = this.getPointerLocalXInContainer(pointer, this.mustSeeSlidersContainer);
        applySliderFromLocalX(localX);
      });

      this.mustSeeSliders[cfg.key] = {
        handle,
        handleHit,
        track,
        trackHit,
        valText,
        cfg,
        trackX: TRACK_X,
        trackW: TRACK_W
      };
    });

    this.refreshMustSeeSliderPositions();
  }

  refreshMustSeeSliderPositions() {
    if (!this.mustSeeBoundsOverride) return;

    Object.entries(this.mustSeeSliders).forEach(([key, slider]) => {
      const { handle, handleHit, valText, cfg, trackX, trackW } = slider;
      const value = this.mustSeeBoundsOverride[key];
      const t = Phaser.Math.Clamp((value - cfg.min) / (cfg.max - cfg.min), 0, 1);
      handle.x = trackX + t * trackW;
      if (handleHit) handleHit.x = handle.x;
      valText.setText(String(Math.round(value)));
    });
  }

  /**
   * Opens a tiny DOM <input> over the value label so the user can type an exact number.
   */
  openMustSeeInput(key) {
    // Remove any existing input first
    this.closeMustSeeInput();

    const slider = this.mustSeeSliders[key];
    if (!slider || !this.mustSeeBoundsOverride) return;

    const { valText, cfg } = slider;
    const currentValue = this.mustSeeBoundsOverride[key];

    // Calculate screen position of the valText relative to the canvas
    const canvas = this.sys.game.canvas;
    if (!canvas) return;
    const canvasRect = canvas.getBoundingClientRect();
    const container = this.mustSeeSlidersContainer;
    const containerX = container ? container.x : 0;
    const containerY = container ? container.y : 0;

    // Scale from game coords to screen coords
    const scaleX = canvasRect.width / this.scale.width;
    const scaleY = canvasRect.height / this.scale.height;
    const screenX = canvasRect.left + (containerX + valText.x) * scaleX;
    const screenY = canvasRect.top + (containerY + valText.y) * scaleY;

    // Create DOM input
    const input = document.createElement("input");
    input.type = "number";
    input.value = String(Math.round(currentValue));
    input.style.cssText = `
      position: fixed;
      left: ${screenX}px;
      top: ${screenY}px;
      width: 60px;
      height: 22px;
      font-size: 12px;
      font-family: Arial, sans-serif;
      background: #1a1a1a;
      color: #ff6666;
      border: 1px solid #ff4444;
      border-radius: 3px;
      padding: 0 4px;
      outline: none;
      z-index: 99999;
      text-align: center;
    `;

    document.body.appendChild(input);
    input.focus();
    input.select();

    let committed = false;
    const commit = () => {
      if (committed) return;
      committed = true;
      const parsed = parseInt(input.value, 10);
      if (!isNaN(parsed) && this.mustSeeBoundsOverride) {
        this.mustSeeBoundsOverride[key] = Phaser.Math.Clamp(parsed, cfg.min, cfg.max);
        this.refreshMustSeeSliderPositions();
        this.emitMustSeeOverride();
      }
      this.closeMustSeeInput();
    };

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); commit(); }
      if (e.key === "Escape") { e.preventDefault(); this.closeMustSeeInput(); }
      e.stopPropagation(); // prevent Phaser from catching keystrokes
    });
    input.addEventListener("blur", () => commit());

    this._activeMustSeeInput = input;
  }

  closeMustSeeInput() {
    const el = this._activeMustSeeInput;
    if (!el) return;
    this._activeMustSeeInput = null; // clear ref first to prevent re-entry
    try {
      if (el.parentNode) el.parentNode.removeChild(el);
    } catch (_) {
      // already removed (e.g. blur fired during removeChild) â€” ignore
    }
  }

  emitMustSeeOverride() {
    if (!this.mustSeeBoundsOverride || !this.eventBus) return;
    const gameScene = this.scene.get("GameScene");
    const baseFreeArea = gameScene?.getLayoutContentBounds?.()?.freeArea || { minBottomPx: 120, fitPaddingPx: 0 };
    this.eventBus.emit("layout:contentBoundsChanged", {
      mustSeeBounds: { ...this.mustSeeBoundsOverride },
      freeArea: baseFreeArea
    });
  }

  destroyMustSeeSliders() {
    this.closeMustSeeInput();
    const hadOverride = !!this.mustSeeBoundsOverride;
    if (this.mustSeeSlidersContainer && !this.mustSeeSlidersContainer.destroyed) {
      this.mustSeeSlidersContainer.destroy(true);
    }
    this.mustSeeSlidersContainer = null;
    this.mustSeeSliders = {};
    this.mustSeeBoundsOverride = null;
    this.mustSeeBaseValues = null;

    // Revert to scene's original mustSeeBounds when sliders are dismissed
    if (hadOverride && this.eventBus) {
      const gameScene = this.scene.get("GameScene");
      const original = gameScene?.getLayoutContentBounds?.();
      if (original) {
        this.eventBus.emit("layout:contentBoundsChanged", original);
      }
    }
  }

  // =====================================================================
  // Camera interactive sliders (visible when layout debug is on)
  // =====================================================================

  buildCameraSliders() {
    if (this.cameraSlidersContainer) return;

    const gameScene = this.scene.get("GameScene");
    const camera = gameScene?.cameras?.main;
    if (!camera) return;

    this.cameraBaseValues = {
      zoom: camera.zoom,
      scrollX: camera.scrollX,
      scrollY: camera.scrollY
    };
    this.cameraOverride = { ...this.cameraBaseValues };

    const PANEL_W = 260;
    const PANEL_H = 170;
    const panelX = 10;
    const panelY = 300; // below mustSeeBounds panel

    this.cameraSlidersContainer = this.add.container(panelX, panelY).setDepth(6000);

    // Panel background
    const bg = this.add.rectangle(0, 0, PANEL_W, PANEL_H, 0x000000, 0.82)
      .setOrigin(0, 0)
      .setStrokeStyle(1, 0xff66cc, 0.6);
    this.cameraSlidersContainer.add(bg);

    const title = this.add.text(PANEL_W / 2, 12, "Camera Override", {
      fontSize: "13px", color: "#ff66cc", fontFamily: "Arial",
      stroke: "#000000", strokeThickness: 2
    }).setOrigin(0.5, 0);
    this.cameraSlidersContainer.add(title);

    // Reset button
    const resetBtn = this.add.text(PANEL_W - 10, 12, "Reset", {
      fontSize: "11px", color: "#aaaaaa", fontFamily: "Arial",
      stroke: "#000000", strokeThickness: 2
    }).setOrigin(1, 0).setInteractive({ useHandCursor: true });
    resetBtn.on("pointerdown", () => {
      this.cameraOverride = { ...this.cameraBaseValues };
      this.refreshCameraSliderPositions();
      this.applyCameraOverride();
    });
    this.cameraSlidersContainer.add(resetBtn);

    const sliders = [
      { label: "Zoom",    key: "zoom",    min: 0.1,   max: 5,    step: 0.01 },
      { label: "ScrollX", key: "scrollX", min: -500,  max: 1000, step: 1    },
      { label: "ScrollY", key: "scrollY", min: -500,  max: 1000, step: 1    }
    ];

    const TRACK_X = 70;
    const TRACK_W = 160;
    const START_Y = 38;
    const ROW_H = 40;

    sliders.forEach((cfg, i) => {
      const rowY = START_Y + i * ROW_H;

      const lbl = this.add.text(8, rowY + 6, cfg.label, {
        fontSize: "12px", color: "#cccccc", fontFamily: "Arial",
        stroke: "#000000", strokeThickness: 2
      });
      this.cameraSlidersContainer.add(lbl);

      const track = this.add.rectangle(TRACK_X, rowY + 12, TRACK_W, 6, 0x444444, 0.9)
        .setOrigin(0, 0.5);
      this.cameraSlidersContainer.add(track);

      const trackHit = this.add.zone(TRACK_X + TRACK_W / 2, rowY + 12, TRACK_W + 18, 28)
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
      this.cameraSlidersContainer.add(trackHit);

      const valText = this.add.text(TRACK_X + TRACK_W + 6, rowY + 4, "", {
        fontSize: "12px", color: "#ffffff", fontFamily: "Arial",
        stroke: "#000000", strokeThickness: 2,
        backgroundColor: "#222222",
        padding: { x: 4, y: 2 }
      }).setInteractive({ useHandCursor: true });
      this.cameraSlidersContainer.add(valText);

      // Click value text -> open DOM input
      valText.on("pointerdown", () => {
        this.openCameraInput(cfg.key);
      });

      const handle = this.add.rectangle(0, rowY + 12, 14, 22, 0xff66cc, 0.95)
        .setOrigin(0.5)
        .setStrokeStyle(1, 0xffffff, 0.7);
      this.cameraSlidersContainer.add(handle);

      const handleHit = this.add.zone(0, rowY + 12, 24, 30)
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
      this.cameraSlidersContainer.add(handleHit);

      const applySliderFromLocalX = (localX) => {
        const clampedX = Phaser.Math.Clamp(localX, TRACK_X, TRACK_X + TRACK_W);
        handle.x = clampedX;
        handleHit.x = clampedX;
        const t = (clampedX - TRACK_X) / TRACK_W;
        let value = cfg.min + t * (cfg.max - cfg.min);
        value = cfg.step < 1 ? Math.round(value * 100) / 100 : Math.round(value);
        this.cameraOverride[cfg.key] = value;
        valText.setText(String(value));
        this.applyCameraOverride();
      };

      trackHit.on("pointerdown", (pointer) => {
        const localX = this.getPointerLocalXInContainer(pointer, this.cameraSlidersContainer);
        applySliderFromLocalX(localX);
      });

      this.input.setDraggable(handleHit);
      handleHit.on("drag", (pointer) => {
        const localX = this.getPointerLocalXInContainer(pointer, this.cameraSlidersContainer);
        applySliderFromLocalX(localX);
      });

      this.cameraSliders[cfg.key] = {
        handle,
        handleHit,
        track,
        trackHit,
        valText,
        cfg,
        trackX: TRACK_X,
        trackW: TRACK_W
      };
    });

    this.refreshCameraSliderPositions();
  }

  refreshCameraSliderPositions() {
    if (!this.cameraOverride) return;

    // Re-read current camera state so sliders track layout-driven changes
    const gameScene = this.scene.get("GameScene");
    const camera = gameScene?.cameras?.main;
    if (camera && !this._cameraUserDragging) {
      this.cameraOverride.zoom = Math.round(camera.zoom * 100) / 100;
      this.cameraOverride.scrollX = Math.round(camera.scrollX);
      this.cameraOverride.scrollY = Math.round(camera.scrollY);
    }

    Object.entries(this.cameraSliders).forEach(([key, slider]) => {
      const { handle, handleHit, valText, cfg, trackX, trackW } = slider;
      const value = this.cameraOverride[key];
      const t = Phaser.Math.Clamp((value - cfg.min) / (cfg.max - cfg.min), 0, 1);
      handle.x = trackX + t * trackW;
      if (handleHit) handleHit.x = handle.x;
      const display = cfg.step < 1 ? (Math.round(value * 100) / 100).toString() : String(Math.round(value));
      valText.setText(display);
    });
  }

  applyCameraOverride() {
    if (!this.cameraOverride) return;
    const gameScene = this.scene.get("GameScene");
    const camera = gameScene?.cameras?.main;
    if (!camera) return;

    this._cameraUserDragging = true;
    camera.setZoom(this.cameraOverride.zoom);
    camera.setScroll(this.cameraOverride.scrollX, this.cameraOverride.scrollY);

    // Clear drag flag after a tick so layout-driven refreshes don't fight the user
    if (this._cameraDragClearTimer) clearTimeout(this._cameraDragClearTimer);
    this._cameraDragClearTimer = setTimeout(() => { this._cameraUserDragging = false; }, 200);
  }

  openCameraInput(key) {
    this.closeCameraInput();

    const slider = this.cameraSliders[key];
    if (!slider || !this.cameraOverride) return;
    const { valText, cfg } = slider;
    const currentValue = this.cameraOverride[key];

    const canvas = this.sys.game.canvas;
    if (!canvas) return;
    const canvasRect = canvas.getBoundingClientRect();
    const container = this.cameraSlidersContainer;
    const containerX = container ? container.x : 0;
    const containerY = container ? container.y : 0;
    const scaleX = canvasRect.width / this.scale.width;
    const scaleY = canvasRect.height / this.scale.height;
    const screenX = canvasRect.left + (containerX + valText.x) * scaleX;
    const screenY = canvasRect.top + (containerY + valText.y) * scaleY;

    const input = document.createElement("input");
    input.type = "number";
    input.step = String(cfg.step < 1 ? 0.01 : 1);
    input.value = cfg.step < 1 ? String(Math.round(currentValue * 100) / 100) : String(Math.round(currentValue));
    input.style.cssText = `
      position: fixed;
      left: ${screenX}px;
      top: ${screenY}px;
      width: 60px;
      height: 22px;
      font-size: 12px;
      font-family: Arial, sans-serif;
      background: #1a1a1a;
      color: #ff66cc;
      border: 1px solid #ff66cc;
      border-radius: 3px;
      padding: 0 4px;
      outline: none;
      z-index: 99999;
      text-align: center;
    `;

    document.body.appendChild(input);
    input.focus();
    input.select();

    let committed = false;
    const commit = () => {
      if (committed) return;
      committed = true;
      const parsed = parseFloat(input.value);
      if (!isNaN(parsed) && this.cameraOverride) {
        this.cameraOverride[key] = Phaser.Math.Clamp(parsed, cfg.min, cfg.max);
        this.refreshCameraSliderPositions();
        this.applyCameraOverride();
      }
      this.closeCameraInput();
    };

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); commit(); }
      if (e.key === "Escape") { e.preventDefault(); this.closeCameraInput(); }
      e.stopPropagation();
    });
    input.addEventListener("blur", () => commit());

    this._activeCameraInput = input;
  }

  closeCameraInput() {
    const el = this._activeCameraInput;
    if (!el) return;
    this._activeCameraInput = null;
    try {
      if (el.parentNode) el.parentNode.removeChild(el);
    } catch (_) {
      // already removed â€” ignore
    }
  }

  destroyCameraSliders() {
    this.closeCameraInput();
    if (this._cameraDragClearTimer) {
      clearTimeout(this._cameraDragClearTimer);
      this._cameraDragClearTimer = null;
    }
    if (this.cameraSlidersContainer && !this.cameraSlidersContainer.destroyed) {
      this.cameraSlidersContainer.destroy(true);
    }
    this.cameraSlidersContainer = null;
    this.cameraSliders = {};
    this.cameraOverride = null;
    this.cameraBaseValues = null;
    this._cameraUserDragging = false;
  }
}

export default UIScene;


