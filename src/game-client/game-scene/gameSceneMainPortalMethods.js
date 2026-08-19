import { decompressFrames, parseGIF } from "gifuct-js";

export const MAIN_GAME_PORTAL_SOURCE_GIF = "gif";
export const MAIN_GAME_PORTAL_SOURCE_RED_PNG = "redPng";
export const MAIN_GAME_PORTAL_CANVAS_KEY = "helldive_main_portal_canvas";
export const MAIN_GAME_PORTAL_MASK_KEY = "helldive_main_portal_mask";
export const RED_PORTAL_FRAME_COUNT = 23;
export const RED_PORTAL_FRAME_KEY_PREFIX = "helldive_red_portal_";

export function getRedPortalFrameKey(index) {
  return `${RED_PORTAL_FRAME_KEY_PREFIX}${String(index).padStart(2, "0")}`;
}

export function getRedPortalFramePath(index) {
  return `assets/helldive/backgrounds/redportal/Lager ${index}.png`;
}

export function getRedPortalFrameKeys() {
  return Array.from({ length: RED_PORTAL_FRAME_COUNT }, (_, i) => getRedPortalFrameKey(i + 1));
}

export function createGameSceneMainPortalMethods(deps = {}) {
  const {
    Phaser,
    gameClientConfig,
    clientConfig,
    GRID_OFFSET_X,
    GRID_OFFSET_Y,
    SOUL_PORTAL_DEPTH,
    SOUL_PORTAL_BASE_RADIUS,
    SOUL_PORTAL_KILLS_FOR_MAX_SIZE,
    SOUL_PORTAL_MAX_SCALE,
    MAIN_GAME_PORTAL_PRELOAD_KEY,
    MAIN_GAME_PORTAL_CANVAS_KEY,
    MAIN_GAME_PORTAL_MASK_KEY,
  } = deps;

  return {
    getMainGamePortalConfig() {
      const defaults = {
        enabled: true,
        replaceDot: true,
        source: MAIN_GAME_PORTAL_SOURCE_GIF,
        sources: {
          gif: { path: "assets/helldive/backgrounds/portal.gif" },
          redPng: {
            folder: "assets/helldive/backgrounds/redportal",
            frameCount: RED_PORTAL_FRAME_COUNT,
            frameRate: 25,
          },
        },
        anchor: { reel: -1, rowA: 5, rowB: 6, offsetX: 40, offsetY: 15 },
        dot: { offsetX: 0, offsetY: 0, radius: SOUL_PORTAL_BASE_RADIUS },
        portal: { offsetX: 0, offsetY: 0, scale: 1, displaySize: 540, alpha: 1, depth: SOUL_PORTAL_DEPTH },
        zoomFocus: { reelA: 3, reelB: 4, rowA: 1, rowB: 2, offsetX: 0, offsetY: 0 },
        mask: {
          enabled: false,
          edgeSoftness: 0.35,
          growth: {
            startRadius: 20,
            startInnerHold: 0.1,
            endRadius: 200,
            endInnerHold: 0.4,
          },
          bonusEntry: {
            radius: 300,
            durationMs: 1300,
            cameraZoom: 1.35,
          },
        },
      };
      const configured = gameClientConfig?.layout?.mainGamePortal || {};
      return {
        ...defaults,
        ...configured,
        sources: {
          ...defaults.sources,
          ...(configured.sources || {}),
          gif: { ...defaults.sources.gif, ...(configured.sources?.gif || {}) },
          redPng: { ...defaults.sources.redPng, ...(configured.sources?.redPng || {}) },
        },
        anchor: { ...defaults.anchor, ...(configured.anchor || {}) },
        dot: { ...defaults.dot, ...(configured.dot || {}) },
        portal: { ...defaults.portal, ...(configured.portal || {}) },
        zoomFocus: { ...defaults.zoomFocus, ...(configured.zoomFocus || {}) },
        mask: {
          ...defaults.mask,
          ...(configured.mask || {}),
          growth: { ...defaults.mask.growth, ...(configured.mask?.growth || {}) },
          bonusEntry: { ...defaults.mask.bonusEntry, ...(configured.mask?.bonusEntry || {}) },
        },
      };
    },

    getMainGamePortalSourceKey() {
      const key = String(this.getMainGamePortalConfig().source || MAIN_GAME_PORTAL_SOURCE_GIF).toLowerCase();
      return key === MAIN_GAME_PORTAL_SOURCE_RED_PNG ? MAIN_GAME_PORTAL_SOURCE_RED_PNG : MAIN_GAME_PORTAL_SOURCE_GIF;
    },

    getMainGamePortalGifUrl() {
      const cfg = this.getMainGamePortalConfig();
      return cfg.sources?.gif?.path || "assets/helldive/backgrounds/portal.gif";
    },

    getMainGamePortalInitialTextureKey() {
      if (this.getMainGamePortalSourceKey() === MAIN_GAME_PORTAL_SOURCE_RED_PNG) {
        return getRedPortalFrameKey(1);
      }
      return MAIN_GAME_PORTAL_PRELOAD_KEY;
    },

    getHeavenHellSoulPortalKillProgress(killCount = this.getHeavenHellSoulPortalKillCount()) {
      return Phaser.Math.Clamp(killCount / SOUL_PORTAL_KILLS_FOR_MAX_SIZE, 0, 1);
    },

    getMainGamePortalMaskRadius(killCount = this.getHeavenHellSoulPortalKillCount()) {
      if (Number.isFinite(Number(this._mainGamePortalMaskRuntime?.radius))) {
        return Number(this._mainGamePortalMaskRuntime.radius);
      }
      const growth = this.getMainGamePortalConfig().mask?.growth || {};
      const startRadius = Number(growth.startRadius ?? 20);
      const endRadius = Number(growth.endRadius ?? 200);
      const progress = this.getHeavenHellSoulPortalKillProgress(killCount);
      return Phaser.Math.Linear(startRadius, endRadius, progress);
    },

    getMainGamePortalMaskInnerHold(killCount = this.getHeavenHellSoulPortalKillCount()) {
      if (Number.isFinite(Number(this._mainGamePortalMaskRuntime?.innerHold))) {
        return Number(this._mainGamePortalMaskRuntime.innerHold);
      }
      const growth = this.getMainGamePortalConfig().mask?.growth || {};
      const startInnerHold = Number(growth.startInnerHold ?? 0.1);
      const endInnerHold = Number(growth.endInnerHold ?? 0.4);
      const progress = this.getHeavenHellSoulPortalKillProgress(killCount);
      return Phaser.Math.Linear(startInnerHold, endInnerHold, progress);
    },

    resolveMainGamePortalAnchor() {
      const anchor = this.getMainGamePortalConfig().anchor || {};
      const reelIndex = Number(anchor.reel);
      const resolvedReel = reelIndex < 0
        ? Math.max(0, clientConfig.area.width - 1)
        : Math.max(0, Math.min(clientConfig.area.width - 1, reelIndex));
      const rowA = Math.max(0, Math.min(clientConfig.area.height - 1, Number(anchor.rowA ?? 5)));
      const rowB = Math.max(0, Math.min(clientConfig.area.height - 1, Number(anchor.rowB ?? 6)));
      const cellA = this.getGridCellCenter(resolvedReel, rowA);
      const cellB = this.getGridCellCenter(resolvedReel, rowB);
      return {
        x: cellA.x + Number(anchor.offsetX || 0),
        y: ((cellA.y + cellB.y) * 0.5) + Number(anchor.offsetY || 0),
      };
    },

    getHeavenHellBonusEntryPortalPosition() {
      return this.getMainGamePortalDisplayPosition();
    },

    getHeavenHellPortalSoulFlashPosition() {
      const anchor = this.resolveMainGamePortalAnchor?.();
      if (!anchor) {
        return {
          x: GRID_OFFSET_X + (clientConfig.area.width * 70),
          y: GRID_OFFSET_Y + (clientConfig.area.height * 70 * 0.5),
        };
      }
      const dot = this.getMainGamePortalConfig().dot || {};
      return {
        x: anchor.x + Number(dot.offsetX || 0),
        y: anchor.y + Number(dot.offsetY || 0),
      };
    },

    shouldMainGamePortalReplaceDot() {
      const cfg = this.getMainGamePortalConfig();
      return cfg.enabled === true && cfg.replaceDot !== false;
    },

    isMainGamePortalMaskEnabled() {
      return this.getMainGamePortalConfig().mask?.enabled === true;
    },

    getMainGamePortalDisplaySizePx() {
      const portalCfg = this.getMainGamePortalConfig().portal || {};
      const basePx = Number(portalCfg.displaySize) || 540;
      const entryScale = Number(this._mainGamePortalEntryScale) || 1;
      const zoom = Number(this._mainGamePortalBonusZoom) || 1;
      return basePx * (Number(portalCfg.scale) || 1) * entryScale * zoom;
    },

    getMainGamePortalDisplayPosition() {
      const dotPos = this.getHeavenHellPortalSoulFlashPosition();
      const portal = this.getMainGamePortalConfig().portal || {};
      return {
        x: dotPos.x + Number(portal.offsetX || 0),
        y: dotPos.y + Number(portal.offsetY || 0),
      };
    },

    getMainGamePortalZoomFocusPosition() {
      const zoomFocus = this.getMainGamePortalConfig().zoomFocus || {};
      const reelA = Math.max(0, Math.min(clientConfig.area.width - 1, Number(zoomFocus.reelA ?? 3)));
      const reelB = Math.max(0, Math.min(clientConfig.area.width - 1, Number(zoomFocus.reelB ?? reelA)));
      const rowA = Math.max(0, Math.min(clientConfig.area.height - 1, Number(zoomFocus.rowA ?? 1)));
      const rowB = Math.max(0, Math.min(clientConfig.area.height - 1, Number(zoomFocus.rowB ?? rowA)));
      const cellA = this.getGridCellCenter(reelA, rowA);
      const cellB = this.getGridCellCenter(reelB, rowB);
      return {
        x: ((Number(cellA?.x) || 0) + (Number(cellB?.x) || 0)) * 0.5 + Number(zoomFocus.offsetX || 0),
        y: ((Number(cellA?.y) || 0) + (Number(cellB?.y) || 0)) * 0.5 + Number(zoomFocus.offsetY || 0),
      };
    },

    applyMainGamePortalSpriteLayout(sprite) {
      if (!sprite || sprite.destroyed) return;
      const portalCfg = this.getMainGamePortalConfig().portal || {};
      const pos = this.getMainGamePortalDisplayPosition();
      const sizePx = this.getMainGamePortalDisplaySizePx();

      sprite
        .setPosition(pos.x, pos.y)
        .setDisplaySize(sizePx, sizePx)
        .setAlpha(Number(portalCfg.alpha ?? 1))
        .setDepth(Number(portalCfg.depth) || SOUL_PORTAL_DEPTH);
    },

    clearMainGamePortalMask() {
      if (this._mainGamePortalSprite && !this._mainGamePortalSprite.destroyed) {
        this._mainGamePortalSprite.clearMask();
      }
      if (this._mainGamePortalBitmapMask) {
        this._mainGamePortalBitmapMask.destroy();
        this._mainGamePortalBitmapMask = null;
      }
      if (this._mainGamePortalMaskSprite && !this._mainGamePortalMaskSprite.destroyed) {
        this._mainGamePortalMaskSprite.destroy();
      }
      this._mainGamePortalMaskSprite = null;
    },

    ensureMainGamePortalMaskTexture(killCount = this.getHeavenHellSoulPortalKillCount()) {
      const maskCfg = this.getMainGamePortalConfig().mask || {};
      const radius = Math.max(8, this.getMainGamePortalMaskRadius(killCount));
      const edgeSoftness = Phaser.Math.Clamp(Number(maskCfg.edgeSoftness ?? 0.35), 0.05, 1);
      const innerHold = Phaser.Math.Clamp(this.getMainGamePortalMaskInnerHold(killCount), 0, 0.95);
      const signature = `${radius}|${edgeSoftness}|${innerHold}`;
      if (this._mainGamePortalMaskSignature === signature && this.textures?.exists?.(MAIN_GAME_PORTAL_MASK_KEY)) {
        return;
      }
      this._mainGamePortalMaskSignature = signature;

      if (this.textures?.exists?.(MAIN_GAME_PORTAL_MASK_KEY)) {
        this.textures.remove(MAIN_GAME_PORTAL_MASK_KEY);
      }

      const size = Math.ceil(radius * 2);
      const canvasTex = this.textures.createCanvas(MAIN_GAME_PORTAL_MASK_KEY, size, size);
      const ctx = canvasTex.getContext();
      const cx = size / 2;
      const grad = ctx.createRadialGradient(cx, cx, 0, cx, cx, radius);
      grad.addColorStop(0, "rgba(255,255,255,1)");
      grad.addColorStop(innerHold, "rgba(255,255,255,1)");
      const fadeEnd = Math.min(1, innerHold + edgeSoftness * (1 - innerHold));
      grad.addColorStop(fadeEnd, "rgba(255,255,255,0)");
      grad.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, size, size);
      canvasTex.refresh();

      if (this._mainGamePortalMaskSprite && !this._mainGamePortalMaskSprite.destroyed) {
        this._mainGamePortalMaskSprite.setTexture(MAIN_GAME_PORTAL_MASK_KEY);
      }
    },

    applyMainGamePortalMask(killCount = this.getHeavenHellSoulPortalKillCount()) {
      if (!this.isMainGamePortalMaskEnabled()) {
        this.clearMainGamePortalMask();
        return;
      }

      this.ensureMainGamePortalMaskTexture(killCount);

      if (!this._mainGamePortalMaskSprite || this._mainGamePortalMaskSprite.destroyed) {
        this._mainGamePortalMaskSprite = this.add.image(0, 0, MAIN_GAME_PORTAL_MASK_KEY)
          .setOrigin(0.5)
          .setVisible(false);
      }

      if (this._mainGamePortalBitmapMask) {
        this._mainGamePortalBitmapMask.destroy();
      }
      this._mainGamePortalBitmapMask = this._mainGamePortalMaskSprite.createBitmapMask();

      if (this._mainGamePortalSprite && !this._mainGamePortalSprite.destroyed) {
        this._mainGamePortalSprite.setMask(this._mainGamePortalBitmapMask);
      }
    },

    loadMainGamePortalGifFrames() {
      if (this._mainGamePortalGifFrames?.length) {
        return Promise.resolve(this._mainGamePortalGifFrames);
      }
      if (this._mainGamePortalGifLoadPromise) {
        return this._mainGamePortalGifLoadPromise;
      }

      this._mainGamePortalGifLoadPromise = fetch(this.getMainGamePortalGifUrl())
        .then((response) => {
          if (!response.ok) {
            throw new Error(`Portal GIF fetch failed: ${response.status}`);
          }
          return response.arrayBuffer();
        })
        .then((buffer) => {
          const parsed = parseGIF(buffer);
          const frames = decompressFrames(parsed, true);
          this._mainGamePortalGifWidth = Number(parsed?.lsd?.width) || 540;
          this._mainGamePortalGifHeight = Number(parsed?.lsd?.height) || 540;
          this._mainGamePortalGifFrames = frames;
          this._mainGamePortalFrameIndex = 0;
          this._mainGamePortalFrameElapsed = 0;
          return frames;
        })
        .catch((error) => {
          console.warn("[MainGamePortal] GIF decode failed", error);
          this._mainGamePortalGifFrames = null;
          return null;
        })
        .finally(() => {
          this._mainGamePortalGifLoadPromise = null;
        });

      return this._mainGamePortalGifLoadPromise;
    },

    ensureMainGamePortalPatchCanvas(width, height) {
      if (!this._mainGamePortalPatchCanvas) {
        this._mainGamePortalPatchCanvas = document.createElement("canvas");
        this._mainGamePortalPatchCtx = this._mainGamePortalPatchCanvas.getContext("2d");
        this._mainGamePortalPatchImageData = null;
      }
      if (this._mainGamePortalPatchCanvas.width !== width || this._mainGamePortalPatchCanvas.height !== height) {
        this._mainGamePortalPatchCanvas.width = width;
        this._mainGamePortalPatchCanvas.height = height;
        this._mainGamePortalPatchImageData = null;
      }
    },

    paintMainGamePortalGifFrame(frameIndex = 0) {
      const frames = this._mainGamePortalGifFrames;
      if (!frames?.length || !this.textures?.exists?.(MAIN_GAME_PORTAL_CANVAS_KEY)) {
        return;
      }

      const frame = frames[frameIndex];
      if (!frame?.patch || !frame?.dims) return;

      const dims = frame.dims;
      this.ensureMainGamePortalPatchCanvas(dims.width, dims.height);
      const patchCtx = this._mainGamePortalPatchCtx;
      if (
        !this._mainGamePortalPatchImageData
        || this._mainGamePortalPatchImageData.width !== dims.width
        || this._mainGamePortalPatchImageData.height !== dims.height
      ) {
        this._mainGamePortalPatchImageData = patchCtx.createImageData(dims.width, dims.height);
      }
      this._mainGamePortalPatchImageData.data.set(frame.patch);
      patchCtx.putImageData(this._mainGamePortalPatchImageData, 0, 0);

      const tex = this.textures.get(MAIN_GAME_PORTAL_CANVAS_KEY);
      const gifCtx = tex.getContext();
      gifCtx.drawImage(this._mainGamePortalPatchCanvas, dims.left, dims.top);
      tex.refresh();
    },

    beginMainGamePortalCanvasAnimation(frames) {
      if (!frames?.length || !this._mainGamePortalSprite || this._mainGamePortalSprite.destroyed) {
        return;
      }

      const width = this._mainGamePortalGifWidth || frames[0]?.dims?.width || 540;
      const height = this._mainGamePortalGifHeight || frames[0]?.dims?.height || 540;

      if (!this.textures.exists(MAIN_GAME_PORTAL_CANVAS_KEY)) {
        this.textures.createCanvas(MAIN_GAME_PORTAL_CANVAS_KEY, width, height);
      }

      this._mainGamePortalAnimationReady = true;
      this._mainGamePortalFrameIndex = 0;
      this._mainGamePortalFrameElapsed = 0;
      this._mainGamePortalSprite.setTexture(MAIN_GAME_PORTAL_CANVAS_KEY);

      const gifCtx = this.textures.get(MAIN_GAME_PORTAL_CANVAS_KEY).getContext();
      gifCtx.clearRect(0, 0, width, height);
      this.paintMainGamePortalGifFrame(0);

      if (!this._mainGamePortalUpdateHandler) {
        this._mainGamePortalUpdateHandler = (_time, delta) => this.updateMainGamePortalAnimationFrame(_time, delta);
        this.events.on("postupdate", this._mainGamePortalUpdateHandler);
      }

      this.applyMainGamePortalSpriteLayout(this._mainGamePortalSprite);
    },

    beginMainGamePortalPngAnimation() {
      const cfg = this.getMainGamePortalConfig();
      const frameCount = Number(cfg.sources?.redPng?.frameCount) || RED_PORTAL_FRAME_COUNT;
      const keys = Array.from({ length: frameCount }, (_, i) => getRedPortalFrameKey(i + 1))
        .filter((key) => this.textures?.exists?.(key));

      if (!keys.length || !this._mainGamePortalSprite || this._mainGamePortalSprite.destroyed) {
        return;
      }

      this._mainGamePortalPngKeys = keys;
      this._mainGamePortalAnimationReady = true;
      this._mainGamePortalFrameIndex = 0;
      this._mainGamePortalFrameElapsed = 0;
      this._mainGamePortalSprite.setTexture(keys[0]);

      if (!this._mainGamePortalUpdateHandler) {
        this._mainGamePortalUpdateHandler = (_time, delta) => this.updateMainGamePortalAnimationFrame(_time, delta);
        this.events.on("postupdate", this._mainGamePortalUpdateHandler);
      }

      this.applyMainGamePortalSpriteLayout(this._mainGamePortalSprite);
    },

    updateMainGamePortalPngFrame(delta = 16) {
      const keys = this._mainGamePortalPngKeys;
      if (!keys?.length || !this._mainGamePortalSprite || this._mainGamePortalSprite.destroyed) {
        return;
      }

      const cfg = this.getMainGamePortalConfig();
      const frameRate = Number(cfg.sources?.redPng?.frameRate) || 25;
      const frameDelay = Math.max(16, 1000 / frameRate);
      this._mainGamePortalFrameElapsed += Number(delta) || 16;

      if (this._mainGamePortalFrameElapsed < frameDelay) {
        return;
      }

      this._mainGamePortalFrameElapsed = 0;
      this._mainGamePortalFrameIndex = (this._mainGamePortalFrameIndex + 1) % keys.length;
      this._mainGamePortalSprite.setTexture(keys[this._mainGamePortalFrameIndex]);
    },

    updateMainGamePortalCanvasFrame(_time, delta = 16) {
      if (!this._mainGamePortalGifFrames?.length || !this.textures?.exists?.(MAIN_GAME_PORTAL_CANVAS_KEY)) {
        return;
      }

      const frames = this._mainGamePortalGifFrames;
      const currentFrame = frames[this._mainGamePortalFrameIndex];
      const frameDelay = Math.max(16, Number(currentFrame?.delay) || 100);
      this._mainGamePortalFrameElapsed += Number(delta) || 16;

      if (this._mainGamePortalFrameElapsed < frameDelay) {
        return;
      }

      this._mainGamePortalFrameElapsed = 0;
      const nextIndex = (this._mainGamePortalFrameIndex + 1) % frames.length;
      const nextFrame = frames[nextIndex];
      const tex = this.textures.get(MAIN_GAME_PORTAL_CANVAS_KEY);
      const gifCtx = tex.getContext();
      const dims = nextFrame?.dims;
      const isFullFrame = dims
        && dims.left === 0
        && dims.top === 0
        && dims.width === tex.width
        && dims.height === tex.height;

      if (Number(nextFrame?.disposalType) === 2 || isFullFrame) {
        gifCtx.clearRect(0, 0, tex.width, tex.height);
      }

      this._mainGamePortalFrameIndex = nextIndex;
      this.paintMainGamePortalGifFrame(nextIndex);
    },

    updateMainGamePortalAnimationFrame(_time, delta = 16) {
      if (this._mainGamePortalPaused) return;
      if (this.getMainGamePortalSourceKey() === MAIN_GAME_PORTAL_SOURCE_RED_PNG) {
        this.updateMainGamePortalPngFrame(delta);
        return;
      }
      this.updateMainGamePortalCanvasFrame(_time, delta);
    },

    layoutMainGamePortalBackground(killCount = this.getHeavenHellSoulPortalKillCount()) {
      const cfg = this.getMainGamePortalConfig();
      if (!cfg.enabled) return;

      this.applyMainGamePortalMask(killCount);

      const pos = this.getMainGamePortalDisplayPosition();

      if (this._mainGamePortalSprite && !this._mainGamePortalSprite.destroyed) {
        this.applyMainGamePortalSpriteLayout(this._mainGamePortalSprite);
      }

      if (this._mainGamePortalMaskSprite && !this._mainGamePortalMaskSprite.destroyed) {
        this._mainGamePortalMaskSprite.setPosition(pos.x, pos.y);
      }
    },

    setMainGamePortalVisible(visible, { force = false } = {}) {
      const cfg = this.getMainGamePortalConfig();
      const shouldShow = visible === true && cfg.enabled === true && (force === true || this.isInBonusMode !== true);
      this._mainGamePortalPaused = !shouldShow;

      if (this._mainGamePortalSprite && !this._mainGamePortalSprite.destroyed) {
        this._mainGamePortalSprite.setVisible(shouldShow);
      }
    },

    resetMainGamePortalBonusEntryPresentation() {
      this._mainGamePortalMaskRuntime = null;
      this._mainGamePortalEntryScale = 1;
      this._mainGamePortalBonusZoom = 1;
      this.applyLayoutSnapshot?.();
      this.layoutMainGamePortalBackground?.();
    },

    async playMainGamePortalBonusEntryCharge(options = {}) {
      const cfg = this.getMainGamePortalConfig();
      if (!cfg.enabled) return;

      this.ensureMainGamePortalBackground();
      this.setMainGamePortalVisible(true, { force: true });

      if (!this.tweens) return;

      const bonusCfg = cfg.mask?.bonusEntry || {};
      const duration = Math.max(200, Number(options?.durationMs) || 850);
      const targetRadius = Math.max(
        this.getMainGamePortalMaskRadius(),
        Number(options?.targetRadius) || Number(bonusCfg.radius) || 300
      );
      const startRadius = this.getMainGamePortalMaskRadius();
      const startInnerHold = this.getMainGamePortalMaskInnerHold();
      const targetInnerHold = Math.max(startInnerHold, Number(cfg.mask?.growth?.endInnerHold) || 0.4);
      const startEntryScale = Number(this._mainGamePortalEntryScale) || 1;
      const targetEntryScale = Math.max(startEntryScale, Number(options?.scaleMultiplier) || 1.24);
      const tweenState = { progress: 0 };

      await new Promise((resolve) => {
        this.tweens.add({
          targets: tweenState,
          progress: 1,
          duration,
          ease: "Sine.easeInOut",
          onUpdate: () => {
            const p = tweenState.progress;
            this._mainGamePortalMaskRuntime = {
              radius: Phaser.Math.Linear(startRadius, targetRadius, p),
              innerHold: Phaser.Math.Linear(startInnerHold, targetInnerHold, p),
            };
            this._mainGamePortalEntryScale = Phaser.Math.Linear(startEntryScale, targetEntryScale, p);
            this.layoutMainGamePortalBackground?.();
          },
          onComplete: resolve,
        });
      });
    },

    async playMainGamePortalBonusEntryDive(options = {}) {
      const cfg = this.getMainGamePortalConfig();
      if (!cfg.enabled) return;

      this.ensureMainGamePortalBackground();
      this.setMainGamePortalVisible(true, { force: true });

      const camera = this.cameras?.main;
      if (!camera || !this.tweens) return;

      const bonusCfg = cfg.mask?.bonusEntry || {};
      const duration = Math.max(300, Number(options?.durationMs) || Number(bonusCfg.durationMs) || 1800);
      const targetRadius = Math.max(8, Number(bonusCfg.radius) || 300);
      const zoomMultiplier = Math.max(1, Number(bonusCfg.cameraZoom) || 1.35);
      const startRadius = this.getMainGamePortalMaskRadius();
      const startInnerHold = this.getMainGamePortalMaskInnerHold();
      const endInnerHold = Math.max(startInnerHold, Number(cfg.mask?.growth?.endInnerHold) || 0.4);
      const startZoom = Number(camera.zoom) || 1;
      const targetZoom = startZoom * zoomMultiplier;
      const startBonusZoom = Number(this._mainGamePortalBonusZoom) || 1;
      const targetBonusZoom = startBonusZoom * zoomMultiplier;
      const startCenterX = Number(camera.midPoint?.x) || (Number(camera.scrollX) + Number(camera.width || 0) * 0.5 / Math.max(0.001, startZoom));
      const startCenterY = Number(camera.midPoint?.y) || (Number(camera.scrollY) + Number(camera.height || 0) * 0.5 / Math.max(0.001, startZoom));

      const tweenState = { progress: 0 };

      await new Promise((resolve) => {
        this.tweens.add({
          targets: tweenState,
          progress: 1,
          duration,
          ease: "Cubic.easeIn",
          onUpdate: () => {
            const p = tweenState.progress;
            const focus = this.getMainGamePortalZoomFocusPosition();
            const currentZoom = Phaser.Math.Linear(startZoom, targetZoom, p);
            const currentCenterX = Phaser.Math.Linear(startCenterX, focus.x, p);
            const currentCenterY = Phaser.Math.Linear(startCenterY, focus.y, p);

            this._mainGamePortalMaskRuntime = {
              radius: Phaser.Math.Linear(startRadius, targetRadius, p),
              innerHold: Phaser.Math.Linear(startInnerHold, endInnerHold, p),
            };
            this._mainGamePortalBonusZoom = Phaser.Math.Linear(startBonusZoom, targetBonusZoom, p);
            camera.setZoom(currentZoom);
            camera.centerOn(currentCenterX, currentCenterY);
            this.layoutMainGamePortalBackground?.();
          },
          onComplete: resolve,
        });
      });
    },

    destroyMainGamePortalBackground() {
      if (this._mainGamePortalUpdateHandler) {
        this.events.off("postupdate", this._mainGamePortalUpdateHandler);
        this._mainGamePortalUpdateHandler = null;
      }
      this.clearMainGamePortalMask();
      if (this._mainGamePortalSprite && !this._mainGamePortalSprite.destroyed) {
        this._mainGamePortalSprite.destroy();
      }
      this._mainGamePortalSprite = null;
      this._mainGamePortalGifFrames = null;
      this._mainGamePortalGifLoadPromise = null;
      this._mainGamePortalPngKeys = null;
      this._mainGamePortalPatchCanvas = null;
      this._mainGamePortalPatchCtx = null;
      this._mainGamePortalPatchImageData = null;
      this._mainGamePortalFrameIndex = 0;
      this._mainGamePortalFrameElapsed = 0;
      this._mainGamePortalAnimationReady = false;
      this._mainGamePortalPaused = true;
      this._mainGamePortalMaskSignature = null;
      this._mainGamePortalMaskRuntime = null;
      this._mainGamePortalBonusZoom = 1;
      if (this.textures?.exists?.(MAIN_GAME_PORTAL_CANVAS_KEY)) {
        this.textures.remove(MAIN_GAME_PORTAL_CANVAS_KEY);
      }
      if (this.textures?.exists?.(MAIN_GAME_PORTAL_MASK_KEY)) {
        this.textures.remove(MAIN_GAME_PORTAL_MASK_KEY);
      }
    },

    startMainGamePortalAnimation() {
      if (this._mainGamePortalAnimationReady || this._mainGamePortalGifLoading) {
        return;
      }

      if (this.getMainGamePortalSourceKey() === MAIN_GAME_PORTAL_SOURCE_RED_PNG) {
        this.beginMainGamePortalPngAnimation();
        return;
      }

      this._mainGamePortalGifLoading = true;
      this.loadMainGamePortalGifFrames()
        .then((frames) => {
          this._mainGamePortalGifLoading = false;
          this.beginMainGamePortalCanvasAnimation(frames);
        })
        .catch(() => {
          this._mainGamePortalGifLoading = false;
        });
    },

    ensureMainGamePortalBackground() {
      const cfg = this.getMainGamePortalConfig();
      if (!cfg.enabled || !this.add || !this.textures) return null;

      const initialKey = this.getMainGamePortalInitialTextureKey();
      if (!this.textures.exists(initialKey)) return null;

      if (!this._mainGamePortalSprite || this._mainGamePortalSprite.destroyed) {
        this._mainGamePortalSprite = this.add.image(0, 0, initialKey)
          .setOrigin(0.5)
          .setDepth(Number(cfg.portal?.depth) || SOUL_PORTAL_DEPTH);
      }

      this.startMainGamePortalAnimation();
      this.layoutMainGamePortalBackground();
      this.setMainGamePortalVisible(this.isInBonusMode !== true);
      return this._mainGamePortalSprite;
    },

    tweenMainGamePortalMaskLayout(killCount = this.getHeavenHellSoulPortalKillCount(), {
      duration = 200,
      pulseScale = 1,
    } = {}) {
      const previousKillCount = pulseScale === 1
        ? Math.max(0, killCount - 1)
        : killCount;
      const startRadius = this.getMainGamePortalMaskRadius(previousKillCount);
      const startInnerHold = this.getMainGamePortalMaskInnerHold(previousKillCount);
      const targetRadius = this.getMainGamePortalMaskRadius(killCount) * pulseScale;
      const targetInnerHold = this.getMainGamePortalMaskInnerHold(killCount);
      const tweenState = { progress: 0 };

      this.tweens.killTweensOf(tweenState);
      return new Promise((resolve) => {
        this.tweens.add({
          targets: tweenState,
          progress: 1,
          duration,
          ease: pulseScale === 1 ? "Sine.easeOut" : "Sine.easeInOut",
          yoyo: pulseScale !== 1,
          onUpdate: () => {
            const p = tweenState.progress;
            this._mainGamePortalMaskRuntime = {
              radius: Phaser.Math.Linear(startRadius, targetRadius, p),
              innerHold: Phaser.Math.Linear(startInnerHold, targetInnerHold, p),
            };
            this.layoutMainGamePortalBackground(killCount);
          },
          onComplete: () => {
            this._mainGamePortalMaskRuntime = null;
            this.layoutMainGamePortalBackground(killCount);
            resolve();
          },
        });
      });
    },
  };
}
