import { decompressFrames, parseGIF } from "gifuct-js";

export function createGameSceneHeavenHellMethods(deps = {}) {
  const {
    DEPTH_BANANAS,
    DEPTH_HERO,
    DEPTH_HOUSE,
    DEPTH_SYMBOLS,
    GRID_OFFSET_X,
    GRID_OFFSET_Y,
    HERO_STAGE_TEXTURE_KEYS,
    Phaser,
    TROLL_SYMBOL_ID,
    clientConfig,
    getHeroScaleForFootprint,
    getSymbolScale
  } = deps;
  const SOUL_COLLECT_TRAIL_DEPTH = DEPTH_HOUSE + 1;
  const SOUL_COLLECT_ORB_DEPTH = DEPTH_HOUSE + 2;
  const SOUL_COLLECT_INTAKE_DEPTH = DEPTH_HOUSE + 3;
  const BONUS_SOUL_COLLECT_TRAIL_DEPTH = DEPTH_HERO + 36;
  const BONUS_SOUL_COLLECT_ORB_DEPTH = DEPTH_HERO + 37;
  const BONUS_SOUL_COLLECT_INTAKE_DEPTH = DEPTH_HERO + 38;
  // Above hero feet and frontOfHero loot (DEPTH_HERO + 1), below chest-open FX.
  const DEPTH_HEAVEN_HELL_GROUND_CHEST = DEPTH_HERO + 3;
  const HEAVEN_HELL_ATTACK_GIF_DEFS = {
    attack: {
      path: "assets/helldive/effects/attack.gif",
      texturePrefix: "helldive_attack_gif_frame_",
      baseScale: 0.72
    },
    attack2: {
      path: "assets/helldive/effects/attack2.gif",
      texturePrefix: "helldive_attack2_gif_frame_",
      baseScale: 0.84
    }
  };

  return {
    clearHeavenHellRippleFx() {
        if (!Array.isArray(this.heavenHellRippleFx)) {
          this.heavenHellRippleFx = [];
          return;
        }
        this.heavenHellRippleFx.forEach((fx) => {
          if (fx && !fx.destroyed) fx.destroy();
        });
        this.heavenHellRippleFx = [];
      },

    clearHeavenHellDivineGroundFx({ fade = true } = {}) {
        if (!Array.isArray(this.heavenHellDivineGroundFx)) {
          this.heavenHellDivineGroundFx = [];
          return;
        }
        const fxList = this.heavenHellDivineGroundFx;
        this.heavenHellDivineGroundFx = [];
        fxList.forEach((fx) => {
          if (!fx || fx.destroyed) return;
          if (fade) {
            this.tweens.add({
              targets: fx,
              alpha: 0,
              duration: 420,
              ease: "Sine.easeOut",
              onComplete: () => fx.destroy()
            });
          } else {
            fx.destroy();
          }
        });
      },

    getHeavenHellAttackGifDefinition(effectId = "attack") {
        return HEAVEN_HELL_ATTACK_GIF_DEFS[String(effectId || "attack")] || HEAVEN_HELL_ATTACK_GIF_DEFS.attack;
      },

    primeHeavenHellAttackGifCache() {
        if (this._heavenHellAttackGifCachePrimed) return;
        this._heavenHellAttackGifCachePrimed = true;
        Object.keys(HEAVEN_HELL_ATTACK_GIF_DEFS).forEach((effectId) => {
          void this.ensureHeavenHellAttackGifFrames(effectId);
        });
      },

    async ensureHeavenHellAttackGifFrames(effectId = "attack") {
        if (!this.textures) return null;
        const definition = this.getHeavenHellAttackGifDefinition(effectId);
        if (!definition?.path) return null;
        if (!this._heavenHellAttackGifCache || typeof this._heavenHellAttackGifCache !== "object") {
          this._heavenHellAttackGifCache = {};
        }

        const cacheKey = String(effectId || "attack");
        const existing = this._heavenHellAttackGifCache[cacheKey];
        if (existing?.frameKeys?.length) {
          return existing;
        }
        if (existing?.loadPromise) {
          return existing.loadPromise;
        }

        const loadPromise = fetch(definition.path)
          .then((response) => {
            if (!response.ok) {
              throw new Error(`Attack GIF fetch failed: ${response.status}`);
            }
            return response.arrayBuffer();
          })
          .then((buffer) => {
            const parsed = parseGIF(buffer);
            const frames = decompressFrames(parsed, true);
            const width = Math.max(1, Number(parsed?.lsd?.width) || Number(frames?.[0]?.dims?.width) || 1);
            const height = Math.max(1, Number(parsed?.lsd?.height) || Number(frames?.[0]?.dims?.height) || 1);
            const compositeCanvas = document.createElement("canvas");
            compositeCanvas.width = width;
            compositeCanvas.height = height;
            const compositeCtx = compositeCanvas.getContext("2d");
            const patchCanvas = document.createElement("canvas");
            const patchCtx = patchCanvas.getContext("2d");
            let patchImageData = null;
            let previousFrame = null;
            const frameKeys = [];
            const frameDurations = [];

            frames.forEach((frame, index) => {
              const dims = frame?.dims;
              if (!frame?.patch || !dims || !compositeCtx || !patchCtx) {
                return;
              }

              if (previousFrame?.dims && Number(previousFrame?.disposalType) === 2) {
                compositeCtx.clearRect(
                  Number(previousFrame.dims.left) || 0,
                  Number(previousFrame.dims.top) || 0,
                  Number(previousFrame.dims.width) || 0,
                  Number(previousFrame.dims.height) || 0
                );
              }

              const isFullFrame =
                Number(dims.left) === 0 &&
                Number(dims.top) === 0 &&
                Number(dims.width) === width &&
                Number(dims.height) === height;
              if (isFullFrame) {
                compositeCtx.clearRect(0, 0, width, height);
              }

              if (patchCanvas.width !== dims.width || patchCanvas.height !== dims.height) {
                patchCanvas.width = dims.width;
                patchCanvas.height = dims.height;
                patchImageData = null;
              }
              if (!patchImageData || patchImageData.width !== dims.width || patchImageData.height !== dims.height) {
                patchImageData = patchCtx.createImageData(dims.width, dims.height);
              }
              patchImageData.data.set(frame.patch);
              patchCtx.putImageData(patchImageData, 0, 0);
              compositeCtx.drawImage(patchCanvas, dims.left, dims.top);

              const frameKey = `${definition.texturePrefix}${String(index).padStart(2, "0")}`;
              if (this.textures.exists(frameKey)) {
                this.textures.remove(frameKey);
              }
              const frameTexture = this.textures.createCanvas(frameKey, width, height);
              const frameCtx = frameTexture.getContext();
              frameCtx.clearRect(0, 0, width, height);
              frameCtx.drawImage(compositeCanvas, 0, 0);
              frameTexture.refresh();

              frameKeys.push(frameKey);
              frameDurations.push(Math.max(16, Number(frame?.delay) || 66));
              previousFrame = frame;
            });

            const resolved = {
              frameKeys,
              frameDurations,
              width,
              height,
              baseScale: Number(definition.baseScale) || 1
            };
            this._heavenHellAttackGifCache[cacheKey] = resolved;
            return resolved;
          })
          .catch((error) => {
            console.warn(`[HeavenHell] Attack GIF decode failed for ${cacheKey}`, error);
            this._heavenHellAttackGifCache[cacheKey] = { frameKeys: [], frameDurations: [], failed: true };
            return null;
          })
          .finally(() => {
            if (this._heavenHellAttackGifCache?.[cacheKey]?.loadPromise === loadPromise) {
              delete this._heavenHellAttackGifCache[cacheKey].loadPromise;
            }
          });

        this._heavenHellAttackGifCache[cacheKey] = {
          ...(existing || {}),
          loadPromise
        };
        return loadPromise;
      },

    playHeavenHellAttackGifBurst(effectId = "attack", x = 0, y = 0, {
        angle = 0,
        scale = 1,
        depth = DEPTH_HERO + 53,
        alpha = 1,
        tint = null,
        blendMode = Phaser.BlendModes.ADD
      } = {}) {
        const cacheKey = String(effectId || "attack");
        const animation = this._heavenHellAttackGifCache?.[cacheKey];
        if (!animation?.frameKeys?.length) {
          void this.ensureHeavenHellAttackGifFrames(cacheKey);
          return null;
        }

        const resolvedScale = Math.max(0.1, (Number(animation.baseScale) || 1) * (Number(scale) || 1));
        const sprite = this.add.image(x, y, animation.frameKeys[0])
          .setDepth(depth)
          .setScale(resolvedScale)
          .setAlpha(alpha)
          .setAngle(angle)
          .setBlendMode(blendMode);
        if (tint !== null && tint !== undefined && typeof sprite.setTint === "function") {
          sprite.setTint(tint);
        }

        const frameEvents = [];
        let elapsed = 0;
        for (let index = 1; index < animation.frameKeys.length; index += 1) {
          elapsed += Math.max(16, Number(animation.frameDurations[index - 1]) || 66);
          const frameKey = animation.frameKeys[index];
          frameEvents.push(this.time.delayedCall(elapsed, () => {
            if (!sprite || sprite.destroyed) return;
            sprite.setTexture(frameKey);
          }));
        }
        const totalDuration = elapsed + Math.max(16, Number(animation.frameDurations[animation.frameDurations.length - 1]) || 66);
        const cleanup = () => {
          frameEvents.forEach((event) => event?.remove?.(false));
          if (sprite && !sprite.destroyed) {
            sprite.destroy();
          }
        };
        const destroyEvent = this.time.delayedCall(totalDuration, cleanup);
        sprite.once?.("destroy", () => {
          destroyEvent?.remove?.(false);
          frameEvents.forEach((event) => event?.remove?.(false));
        });
        return sprite;
      },

    clearHeavenHellPentagramFx() {
        if (!Array.isArray(this.heavenHellPentagramFx)) {
          this.heavenHellPentagramFx = [];
          return;
        }
        this.heavenHellPentagramFx.forEach((fx) => {
          if (fx && !fx.destroyed) fx.destroy();
        });
        this.heavenHellPentagramFx = [];
      },

    getHeavenHellPentagramPointCenter(point = {}) {
        const pointX = Number(point?.x);
        const pointY = Number(point?.y);
        if (!Number.isFinite(pointX) || !Number.isFinite(pointY)) return null;
        const cellSize = 70;
        return {
          x: pointX * cellSize + cellSize / 2 + GRID_OFFSET_X,
          y: (clientConfig.area.height - 1 - pointY) * cellSize + cellSize / 2 + GRID_OFFSET_Y
        };
      },

    getHeavenHellPentagramSegments(points = []) {
        const pointMap = new Map(
          (Array.isArray(points) ? points : [])
            .filter((point) => point && typeof point === "object")
            .map((point) => [String(point.id || point.segmentId || ""), point])
        );
        const layout = [
          { segmentId: "A", from: "A", to: "C" },
          { segmentId: "B", from: "B", to: "D" },
          { segmentId: "C", from: "C", to: "E" },
          { segmentId: "D", from: "D", to: "A" },
          { segmentId: "E", from: "E", to: "B" }
        ];
        return layout
          .map((segment) => {
            const fromPoint = pointMap.get(segment.from);
            const toPoint = pointMap.get(segment.to);
            if (!fromPoint || !toPoint) return null;
            const from = this.getHeavenHellPentagramPointCenter(fromPoint);
            const to = this.getHeavenHellPentagramPointCenter(toPoint);
            if (!from || !to) return null;
            return {
              ...segment,
              fromPoint,
              toPoint,
              from,
              to
            };
          })
          .filter(Boolean);
      },

    ensureHeavenHellPentagramUi() {
        if (this.heavenHellPentagramUi?.container && !this.heavenHellPentagramUi.container.destroyed) {
          return this.heavenHellPentagramUi;
        }
        const container = this.add.container(0, 0).setDepth(DEPTH_SYMBOLS + 18);
        const inactiveGraphics = this.add.graphics();
        const activeGlowGraphics = this.add.graphics();
        const activeGraphics = this.add.graphics();
        const debugGraphics = this.add.graphics();
        const pointGraphics = this.add.graphics();
        container.add([inactiveGraphics, activeGlowGraphics, activeGraphics, debugGraphics, pointGraphics]);
        this.heavenHellPentagramUi = {
          container,
          inactiveGraphics,
          activeGlowGraphics,
          activeGraphics,
          debugGraphics,
          pointGraphics,
          points: [],
          segments: [],
          segmentState: {}
        };
        return this.heavenHellPentagramUi;
      },

    drawHeavenHellPentagramState(points = [], pointState = {}, { completed = false } = {}) {
        const ui = this.ensureHeavenHellPentagramUi();
        const segments = this.getHeavenHellPentagramSegments(points);
        ui.points = Array.isArray(points) ? points : [];
        ui.segments = segments;
        ui.segmentState = { ...(pointState || {}) };
        ui.container.setVisible(true);

        const inactiveGraphics = ui.inactiveGraphics;
        const activeGlowGraphics = ui.activeGlowGraphics;
        const activeGraphics = ui.activeGraphics;
        const debugGraphics = ui.debugGraphics;
        const pointGraphics = ui.pointGraphics;
        inactiveGraphics.clear();
        activeGlowGraphics.clear();
        activeGraphics.clear();
        debugGraphics.clear();
        pointGraphics.clear();

        segments.forEach((segment) => {
          const segmentActive = pointState?.[String(segment?.segmentId || "")] === true;
          inactiveGraphics.lineStyle(5, 0x2A0D18, 0.34);
          inactiveGraphics.beginPath();
          inactiveGraphics.moveTo(segment.from.x, segment.from.y);
          inactiveGraphics.lineTo(segment.to.x, segment.to.y);
          inactiveGraphics.strokePath();

          if (segmentActive || completed === true) {
            const lineColor = completed ? 0xFFE8A6 : 0xF7E08A;
            const glowColor = completed ? 0xFFF6D2 : 0xFFF1BF;
            activeGlowGraphics.lineStyle(completed ? 15 : 13, glowColor, completed ? 0.18 : 0.16);
            activeGlowGraphics.beginPath();
            activeGlowGraphics.moveTo(segment.from.x, segment.from.y);
            activeGlowGraphics.lineTo(segment.to.x, segment.to.y);
            activeGlowGraphics.strokePath();

            activeGraphics.lineStyle(completed ? 7 : 6, lineColor, completed ? 0.94 : 0.84);
            activeGraphics.beginPath();
            activeGraphics.moveTo(segment.from.x, segment.from.y);
            activeGraphics.lineTo(segment.to.x, segment.to.y);
            activeGraphics.strokePath();
          }
        });

        points.forEach((point) => {
          const active = pointState?.[String(point?.segmentId || point?.id || "")] === true;
          if (active !== true && point?.debugShowTriggerCells === true && Array.isArray(point?.triggerCells)) {
            point.triggerCells.forEach((cell) => {
              const reel = Math.floor(Number(cell?.reel));
              const row = Math.floor(Number(cell?.row));
              if (!Number.isFinite(reel) || !Number.isFinite(row)) return;
              const center = this.getGridCellCenter(reel, row);
              debugGraphics.fillStyle(0xFFFBEA, 0.16);
              debugGraphics.fillRoundedRect(center.x - 30, center.y - 30, 60, 60, 10);
              debugGraphics.lineStyle(2, 0xFFFDF4, 0.42);
              debugGraphics.strokeRoundedRect(center.x - 30, center.y - 30, 60, 60, 10);
            });
          }
          const center = this.getHeavenHellPentagramPointCenter(point);
          if (!center) return;
          pointGraphics.fillStyle(active ? (completed ? 0xFFF0B8 : 0xFFE7A0) : 0x1A0A11, active ? 0.92 : 0.7);
          pointGraphics.fillCircle(center.x, center.y, active ? 8 : 6);
          pointGraphics.lineStyle(active ? 3 : 2, active ? (completed ? 0xFFFFF0 : 0xFFF8DA) : 0x5F2630, active ? 0.95 : 0.7);
          pointGraphics.strokeCircle(center.x, center.y, active ? 11 : 8);
          if (active) {
            pointGraphics.fillStyle(completed ? 0xFFF8D6 : 0xFFF1C8, completed ? 0.3 : 0.22);
            pointGraphics.fillCircle(center.x, center.y, completed ? 18 : 15);
          }
        });
      },

    syncHeavenHellPentagram(gameState = {}) {
        const pentagram = gameState?.heavenHell?.bonus?.pentagram;
        if (!pentagram || gameState?.isBonus !== true || pentagram?.enabled !== true) {
          this.clearHeavenHellPentagramFx?.();
          if (this.heavenHellPentagramUi?.container && !this.heavenHellPentagramUi.container.destroyed) {
            this.heavenHellPentagramUi.container.setVisible(false);
          }
          return false;
        }

        const points = Array.isArray(pentagram?.points) ? pentagram.points : [];
        const pointState = pentagram?.pointStates && typeof pentagram.pointStates === "object"
          ? pentagram.pointStates
          : {};
        this.drawHeavenHellPentagramState(points, pointState, {
          completed: pentagram?.completed === true
        });
        return true;
      },

    getHeavenHellPentagramStepEvents(gameState = {}, pathIndex = -1) {
        const pentagram = gameState?.heavenHell?.bonus?.pentagram;
        if (!pentagram || gameState?.isBonus !== true || pentagram?.enabled !== true) {
          return { activations: [], completionEvent: null };
        }
        const activations = (Array.isArray(pentagram?.activationsThisAction) ? pentagram.activationsThisAction : [])
          .filter((entry) => Math.floor(Number(entry?.pathIndex ?? -1)) === Math.floor(Number(pathIndex) || -1));
        const completionEvent = Math.floor(Number(pentagram?.completionEventThisAction?.pathIndex ?? -2)) === Math.floor(Number(pathIndex) || -1)
          ? pentagram.completionEventThisAction
          : null;
        return { activations, completionEvent };
      },

    getHeavenHellPentagramAbilityEvents(gameState = {}, pathIndex = -1, ability = "") {
        const { activations } = this.getHeavenHellPentagramStepEvents?.(gameState, pathIndex) || {};
        const abilityKey = String(ability || "");
        if (!abilityKey) return [];
        return (Array.isArray(activations) ? activations : []).filter((event) => (
          String(event?.ability || "") === abilityKey
        ));
      },

    async playHeavenHellPentagramActivationEvent(event = {}) {
        if (!event || event.__presentationPlayed === true) {
          return false;
        }
        event.__presentationPlayed = true;
        await this.playHeavenHellPentagramPointHitEffect?.(event);
        if (event?.activated === true) {
          await this.playHeavenHellPentagramSegmentActivation?.(event);
        }
        return true;
      },

    getHeavenHellPentagramDivineXTargetKeyForEvent(event = {}, xTargets = []) {
        if (Number.isFinite(Number(event?.triggerReel)) && Number.isFinite(Number(event?.triggerRow))) {
          return `${Math.floor(Number(event.triggerReel))},${Math.floor(Number(event.triggerRow))},${Math.max(1, Math.floor(Number(event?.triggerWave) || 1))}`;
        }
        const pointX = Number(event?.point?.x);
        const pointY = Number(event?.point?.y);
        const originReel = Number(event?.originReel);
        const originRow = Number(event?.originRow);
        if (!Number.isFinite(pointX) || !Number.isFinite(pointY)) {
          return null;
        }

        const desiredWave = (
          Number.isFinite(originReel) && Number.isFinite(originRow)
            ? Math.max(1, Math.ceil(Math.max(Math.abs(pointX - originReel), Math.abs(pointY - originRow)) - 0.5))
            : null
        );
        let bestTarget = null;
        let bestDistance = Number.POSITIVE_INFINITY;
        (Array.isArray(xTargets) ? xTargets : []).forEach((target) => {
          const reel = Number(target?.reel);
          const row = Number(target?.row);
          if (!Number.isFinite(reel) || !Number.isFinite(row)) return;
          const wave = Math.max(1, Math.floor(Number(target?.wave) || 1));
          if (desiredWave !== null && wave !== desiredWave) return;
          const distance = Math.abs(reel - pointX) + Math.abs(row - pointY);
          if (distance < bestDistance) {
            bestDistance = distance;
            bestTarget = target;
          }
        });

        if (!bestTarget) return null;
        return `${Math.floor(Number(bestTarget.reel))},${Math.floor(Number(bestTarget.row))},${Math.max(1, Math.floor(Number(bestTarget.wave) || 1))}`;
      },

    getHeavenHellPentagramDivineStrikeTargetKeyForEvent(event = {}, strikeTargets = []) {
        if (Number.isFinite(Number(event?.triggerReel)) && Number.isFinite(Number(event?.triggerRow))) {
          return `${Math.floor(Number(event.triggerReel))},${Math.floor(Number(event.triggerRow))},${Math.max(0, Math.floor(Number(event?.triggerWave) || 0))}`;
        }
        const pointX = Number(event?.point?.x);
        const pointY = Number(event?.point?.y);
        const originReel = Number(event?.originReel);
        const originRow = Number(event?.originRow);
        if (!Number.isFinite(pointX) || !Number.isFinite(pointY) || !Number.isFinite(originReel) || !Number.isFinite(originRow)) {
          return null;
        }

        const desiredWave = Math.max(1, Math.ceil(
          Math.max(Math.abs(pointX - originReel), Math.abs(pointY - originRow)) - 0.5
        ));
        let bestTarget = null;
        let bestDistance = Number.POSITIVE_INFINITY;
        (Array.isArray(strikeTargets) ? strikeTargets : []).forEach((target) => {
          const reel = Number(target?.reel);
          const row = Number(target?.row);
          if (!Number.isFinite(reel) || !Number.isFinite(row)) return;
          const wave = Math.max(0, Math.floor(Number(target?.wave) || 0));
          if (wave !== desiredWave) return;
          const distance = Math.abs(reel - pointX) + Math.abs(row - pointY);
          if (distance < bestDistance) {
            bestDistance = distance;
            bestTarget = target;
          }
        });

        if (!bestTarget) return null;
        return `${Math.floor(Number(bestTarget.reel))},${Math.floor(Number(bestTarget.row))},${Math.max(0, Math.floor(Number(bestTarget.wave) || 0))}`;
      },

    async playHeavenHellPentagramPointHitEffect(event = {}) {
        const center = this.getHeavenHellPentagramPointCenter(event?.point || {});
        if (!center) return;
        if (!Array.isArray(this.heavenHellPentagramFx)) {
          this.heavenHellPentagramFx = [];
        }
        const ring = this.add.circle(center.x, center.y, 10, 0xF8E08B, 0.24)
          .setDepth(DEPTH_SYMBOLS + 26)
          .setBlendMode(Phaser.BlendModes.ADD);
        const pulse = this.add.circle(center.x, center.y, 5, 0xFFF9E1, 0.88)
          .setDepth(DEPTH_SYMBOLS + 27)
          .setBlendMode(Phaser.BlendModes.ADD);
        const blink = this.add.circle(center.x, center.y, 8, 0xFFF6CF, 0.22)
          .setDepth(DEPTH_SYMBOLS + 28)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setScale(0.6);
        this.heavenHellPentagramFx.push(ring, pulse, blink);
        this.tweens.add({
          targets: ring,
          scale: 3.1,
          alpha: 0,
          duration: 260,
          ease: "Cubic.easeOut",
          onComplete: () => ring.destroy()
        });
        this.tweens.add({
          targets: pulse,
          scale: 2.4,
          alpha: 0,
          duration: 180,
          ease: "Cubic.easeOut",
          onComplete: () => pulse.destroy()
        });
        this.tweens.add({
          targets: blink,
          scale: 2.2,
          alpha: 0,
          duration: 150,
          ease: "Cubic.easeOut",
          onComplete: () => blink.destroy()
        });
        this.playSfx?.("lightning_thor_impact", {
          volume: 0.16,
          rate: event?.ability === "divineX" ? 1.08 : 1
        });
      },

    async playHeavenHellPentagramSegmentActivation(event = {}) {
        const ui = this.ensureHeavenHellPentagramUi();
        const segment = (Array.isArray(ui?.segments) ? ui.segments : []).find(
          (entry) => String(entry?.segmentId || "") === String(event?.litPointId || event?.segmentId || "")
        );
        if (!segment) return;
        if (!Array.isArray(this.heavenHellPentagramFx)) {
          this.heavenHellPentagramFx = [];
        }

        const pointCenter = this.getHeavenHellPentagramPointCenter(segment.fromPoint || {});
        if (!pointCenter) return;
        const lineFlash = this.add.graphics().setDepth(DEPTH_SYMBOLS + 28).setBlendMode(Phaser.BlendModes.ADD);
        lineFlash.lineStyle(16, 0xFFF3C2, 0.62);
        lineFlash.beginPath();
        lineFlash.moveTo(segment.from.x, segment.from.y);
        lineFlash.lineTo(segment.to.x, segment.to.y);
        lineFlash.strokePath();
        const flare = this.add.circle(pointCenter.x, pointCenter.y, 12, 0xFFF0BA, 0.34)
          .setDepth(DEPTH_SYMBOLS + 29)
          .setBlendMode(Phaser.BlendModes.ADD);
        const halo = this.add.circle(pointCenter.x, pointCenter.y, 7, 0xFFF6DC, 0.72)
          .setDepth(DEPTH_SYMBOLS + 30)
          .setBlendMode(Phaser.BlendModes.ADD);
        this.heavenHellPentagramFx.push(lineFlash, flare, halo);
        ui.segmentState[String(event?.litPointId || event?.segmentId || "")] = true;
        this.drawHeavenHellPentagramState(ui.points, ui.segmentState, { completed: false });
        this.tweens.add({
          targets: lineFlash,
          alpha: 0,
          duration: 180,
          ease: "Sine.easeOut",
          onComplete: () => lineFlash.destroy()
        });
        this.tweens.add({
          targets: flare,
          scale: 2.4,
          alpha: 0,
          duration: 320,
          ease: "Cubic.easeOut",
          onComplete: () => flare.destroy()
        });
        this.tweens.add({
          targets: halo,
          scale: 1.8,
          alpha: 0,
          duration: 200,
          ease: "Cubic.easeOut",
          onComplete: () => halo.destroy()
        });
        this.cameras?.main?.shake?.(90, 0.0024);
        this.playSfx?.("wins_highlight", { volume: 0.12 });
        await this.waitForPresentation(40, { skippable: true });
      },

    async playHeavenHellPentagramCompletionSequence(gameState = {}, completionEvent = {}, { stepQuickStop = false } = {}) {
        if (!completionEvent) return false;
        if (stepQuickStop) {
          this.createOrUpdateHouse?.(completionEvent?.afterMultiplier || gameState?.multiplier || 1);
          return true;
        }
        if (!Array.isArray(this.heavenHellPentagramFx)) {
          this.heavenHellPentagramFx = [];
        }

        const completedPointIds = Array.isArray(completionEvent?.completedPointIds)
          ? completionEvent.completedPointIds
          : ["A", "B", "C", "D", "E"];
        const completionPointStates = completedPointIds.reduce((acc, pointId) => {
          acc[String(pointId)] = true;
          return acc;
        }, {});
        this.drawHeavenHellPentagramState(
          Array.isArray(gameState?.heavenHell?.bonus?.pentagram?.points) ? gameState.heavenHell.bonus.pentagram.points : [],
          completionPointStates,
          { completed: true }
        );

        const triggerPoint = Array.isArray(gameState?.heavenHell?.bonus?.pentagram?.points)
          ? gameState.heavenHell.bonus.pentagram.points.find((point) => String(point?.id || "") === String(completionEvent?.pointId || ""))
          : null;
        const beamStart = this.getHeavenHellPentagramPointCenter(triggerPoint) || {
          x: GRID_OFFSET_X + (clientConfig.area.width * 70) * 0.5,
          y: GRID_OFFSET_Y + (clientConfig.area.height * 70) * 0.5
        };
        const target = this.getCenterCollectTarget?.() || {
          x: this.multiplierText?.x ?? this.houseSprite?.x ?? beamStart.x,
          y: this.multiplierText?.y ?? this.houseSprite?.y ?? beamStart.y
        };
        const dx = Number(target.x) - Number(beamStart.x);
        const dy = Number(target.y) - Number(beamStart.y);
        const distance = Math.max(1, Math.sqrt(dx * dx + dy * dy));
        const angle = Phaser.Math.RadToDeg(Math.atan2(dy, dx));
        const rayMidX = beamStart.x + dx * 0.5;
        const rayMidY = beamStart.y + dy * 0.5;
        const steps = Array.isArray(completionEvent?.steps) ? completionEvent.steps : [];
        const stepCount = Math.max(1, steps.length);
        const rayRevealMs = 240;
        const rayWarmupMs = 260;
        const rayFadeMs = 420;
        const rayTailMs = 260;
        const targetSequenceMs = Phaser.Math.Clamp(3600 + (stepCount * 220), 3800, 5200);
        const tickIntervalMs = Math.max(
          360,
          Math.round((targetSequenceMs - (rayRevealMs + rayWarmupMs + rayFadeMs + rayTailMs)) / stepCount)
        );
        const rayCore = this.add.rectangle(rayMidX, rayMidY, distance, 12, 0xFFF0C8, 0.96)
          .setDepth(DEPTH_HERO + 54)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setAngle(angle)
          .setScale(0.04, 0.92)
          .setAlpha(0);
        const rayGlow = this.add.rectangle(rayMidX, rayMidY, distance, 34, 0xFFD77A, 0.4)
          .setDepth(DEPTH_HERO + 53)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setAngle(angle)
          .setScale(0.04, 0.8)
          .setAlpha(0);
        const rayBeam = this.textures?.exists?.("helldive_divine_wrath_beam")
          ? this.add.image(rayMidX, rayMidY, "helldive_divine_wrath_beam")
              .setDepth(DEPTH_HERO + 55)
              .setBlendMode(Phaser.BlendModes.ADD)
              .setAngle(angle + 90)
              .setScale(Math.max(0.34, distance / 360), 0.22)
              .setAlpha(0)
          : null;
        const originBurst = this.add.circle(beamStart.x, beamStart.y, 18, 0xFFD37A, 0.28)
          .setDepth(DEPTH_HERO + 55)
          .setBlendMode(Phaser.BlendModes.ADD);
        const targetBurst = this.add.circle(target.x, target.y, 22, 0xFFF1B0, 0.3)
          .setDepth(DEPTH_HERO + 56)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setScale(0.4);
        const targetHalo = this.add.circle(target.x, target.y, 38, 0xFFE58C, 0.18)
          .setDepth(DEPTH_HERO + 55)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setScale(0.72)
          .setAlpha(0);
        this.heavenHellPentagramFx.push(rayCore, rayGlow, originBurst, targetBurst, targetHalo);
        if (rayBeam) {
          this.heavenHellPentagramFx.push(rayBeam);
        }
        this.tweens.add({
          targets: [rayCore, rayGlow, rayBeam, targetHalo].filter(Boolean),
          alpha: { from: 0, to: 0.98 },
          scaleX: 1,
          duration: rayRevealMs,
          ease: "Cubic.easeOut"
        });
        this.tweens.add({
          targets: rayGlow,
          alpha: { from: 0.48, to: 0.86 },
          scaleY: { from: 0.92, to: 1.12 },
          duration: 540,
          yoyo: true,
          repeat: -1,
          ease: "Sine.easeInOut"
        });
        this.tweens.add({
          targets: rayCore,
          alpha: { from: 0.74, to: 0.98 },
          duration: 260,
          yoyo: true,
          repeat: -1,
          ease: "Sine.easeInOut"
        });
        if (rayBeam) {
          this.tweens.add({
            targets: rayBeam,
            alpha: { from: 0.42, to: 0.84 },
            scaleY: { from: 0.2, to: 0.28 },
            duration: 460,
            yoyo: true,
            repeat: -1,
            ease: "Sine.easeInOut"
          });
        }
        this.tweens.add({
          targets: originBurst,
          scale: 2.2,
          alpha: 0,
          duration: 320,
          ease: "Cubic.easeOut",
          onComplete: () => originBurst.destroy()
        });
        this.tweens.add({
          targets: targetBurst,
          scale: 3.1,
          alpha: 0,
          duration: 360,
          ease: "Cubic.easeOut",
          onComplete: () => targetBurst.destroy()
        });
        this.tweens.add({
          targets: targetHalo,
          scale: 1.2,
          alpha: 0.28,
          duration: 340,
          ease: "Sine.easeOut"
        });
        this.tweens.add({
          targets: targetHalo,
          scale: 1.36,
          alpha: 0.12,
          duration: 620,
          yoyo: true,
          repeat: -1,
          ease: "Sine.easeInOut"
        });
        this.playSfx?.("lightning_at_lvl_up", { volume: 0.2 });
        this.cameras?.main?.shake?.(180, 0.004);
        await this.waitForPresentation(rayWarmupMs, { skippable: true });

        let liveMultiplier = Math.max(1, Math.floor(Number(completionEvent?.beforeMultiplier || gameState?.multiplier || 1) || 1));
        for (let stepIndex = 0; stepIndex < steps.length; stepIndex++) {
          const amount = Math.max(1, Math.floor(Number(steps[stepIndex]?.amount || 1) || 1));
          liveMultiplier += amount;
          this.createOrUpdateHouse?.(liveMultiplier);
          this.createHeavenHellAbilityImpactLabel?.(target.x, target.y - 26, steps[stepIndex]?.label || `+${amount}`, {
            depth: DEPTH_HERO + 58,
            fontSize: "20px",
            scale: 0.74,
            rise: 34,
            duration: 620,
            color: "#FFF3B8",
            stroke: "#4A2400",
            shadow: "#241100"
          });
          const stepPulse = this.add.circle(target.x, target.y, 14, 0xFFF2C2, 0.3)
            .setDepth(DEPTH_HERO + 57)
            .setBlendMode(Phaser.BlendModes.ADD);
          this.heavenHellPentagramFx.push(stepPulse);
          this.tweens.add({
            targets: stepPulse,
            scale: 2.8,
            alpha: 0,
            duration: Math.max(240, Math.min(420, tickIntervalMs - 90)),
            ease: "Cubic.easeOut",
            onComplete: () => stepPulse.destroy()
          });
          this.playSfx?.("orb_collect", { volume: 0.18, rate: 1 + stepIndex * 0.02 });
          this.cameras?.main?.shake?.(70, 0.0014);
          await this.waitForPresentation(tickIntervalMs, { skippable: true });
        }

        this.tweens.add({
          targets: [rayCore, rayGlow, rayBeam, targetHalo].filter(Boolean),
          alpha: 0,
          duration: rayFadeMs,
          ease: "Sine.easeOut",
          onComplete: () => {
            rayCore.destroy();
            rayGlow.destroy();
            rayBeam?.destroy?.();
            targetHalo.destroy();
          }
        });
        await this.waitForPresentation(rayFadeMs + rayTailMs, { skippable: true });
        return true;
      },

    async playHeavenHellPentagramStepEffects(gameState = {}, pathIndex = -1, { stepQuickStop = false } = {}) {
        const { activations, completionEvent } = this.getHeavenHellPentagramStepEvents?.(gameState, pathIndex) || {};
        if ((!activations || activations.length === 0) && !completionEvent) {
          return false;
        }
        if (stepQuickStop) {
          this.syncHeavenHellPentagram?.(gameState);
          if (completionEvent) {
            this.createOrUpdateHouse?.(completionEvent?.afterMultiplier || gameState?.multiplier || 1);
          }
          return true;
        }

        if (completionEvent) {
          await this.playHeavenHellPentagramCompletionSequence?.(gameState, completionEvent, { stepQuickStop });
          this.syncHeavenHellPentagram?.(gameState);
          return true;
        }
        this.syncHeavenHellPentagram?.(gameState);
        return true;
      },

    getHellDiveBackgroundTextureKey(gameState = {}) {
        const action = String(gameState?.executedAction || "");
        const leavingBonusAfterResolvedAction =
          (action === "freespin" || action === "freerespin") && gameState?.nextAction === "spin";
        return gameState?.isBonus === true && !leavingBonusAfterResolvedAction
          ? "helldive_hell_bonus_bg"
          : "helldive_heaven_bg";
      },

    updateHellDiveBackground(gameState = {}, { immediate = false, fade = true } = {}) {
        if (!this.mainBackground || this.mainBackground.destroyed || !this.textures) return;
        if (gameState?.isBonus === true) {
          this.primeHeavenHellAttackGifCache?.();
        }
        const desiredTexture = this.getHellDiveBackgroundTextureKey?.(gameState) || "helldive_heaven_bg";
        if (!this.textures.exists(desiredTexture)) return;
        if (this.mainBackground.texture?.key === desiredTexture) return;
        if (this._hellDiveBackgroundTargetTexture === desiredTexture) return;
    
        this._hellDiveBackgroundTargetTexture = desiredTexture;
    
        if (immediate || fade === false || !this.add || !this.tweens) {
          this.mainBackground.setTexture(desiredTexture);
          this.applySceneBackgroundLayout?.({ textureKey: desiredTexture });
          this._hellDiveBackgroundTargetTexture = null;
          return;
        }
    
        if (this._hellDiveBackgroundFade && !this._hellDiveBackgroundFade.destroyed) {
          this._hellDiveBackgroundFade.destroy();
        }
    
        const fadeImage = this.add.image(this.mainBackground.x, this.mainBackground.y, desiredTexture)
          .setOrigin(this.mainBackground.originX ?? 0, this.mainBackground.originY ?? 0)
          .setDepth((this.mainBackground.depth ?? 0) + 0.02)
          .setScale(this.mainBackground.scaleX || 1, this.mainBackground.scaleY || 1)
          .setAlpha(0);
        fadeImage.setScrollFactor?.(this.mainBackground.scrollFactorX ?? 1, this.mainBackground.scrollFactorY ?? 1);
        this._hellDiveBackgroundFade = fadeImage;
    
        this.tweens.add({
          targets: fadeImage,
          alpha: 1,
          duration: gameState?.nextAction === "spin" ? 720 : 520,
          ease: "Sine.easeInOut",
          onComplete: () => {
            if (this.mainBackground && !this.mainBackground.destroyed) {
              this.mainBackground.setTexture(desiredTexture);
              this.applySceneBackgroundLayout?.({ textureKey: desiredTexture });
            }
            if (fadeImage && !fadeImage.destroyed) {
              fadeImage.destroy();
            }
            if (this._hellDiveBackgroundFade === fadeImage) {
              this._hellDiveBackgroundFade = null;
            }
            if (this._hellDiveBackgroundTargetTexture === desiredTexture) {
              this._hellDiveBackgroundTargetTexture = null;
            }
          }
        });
      },

    showHeavenHellPortalAura(_gameState = {}) {
        const centerX = GRID_OFFSET_X + (clientConfig.area.width * 70) / 2;
        const centerY = GRID_OFFSET_Y + (clientConfig.area.height * 70) / 2;
        if (!this.heavenHellPortalAura || this.heavenHellPortalAura.destroyed) {
          this.heavenHellPortalAura = this.add.circle(centerX, centerY, 46, 0x6BC9FF, 0.08)
            .setDepth(DEPTH_HERO + 1);
        }
        this.heavenHellPortalAura.setPosition(centerX, centerY);
        this.heavenHellPortalAura.setVisible(true);
        this.tweens.killTweensOf(this.heavenHellPortalAura);
        this.tweens.add({
          targets: this.heavenHellPortalAura,
          alpha: 0.2,
          scale: 1.18,
          duration: 460,
          yoyo: true,
          repeat: -1,
          ease: "Sine.easeInOut"
        });
      },

    async playHeavenHellRippleSpawn(gameState = {}) {
        const rippleInjections = Array.isArray(gameState?.heavenHell?.bonus?.rippleInjectionsThisAction)
          ? gameState.heavenHell.bonus.rippleInjectionsThisAction
          : [];
    
        this.clearHeavenHellRippleFx?.();
    
        const isFreespinWave = gameState?.executedAction === "freespin";
        const waveTextureKey = isFreespinWave ? "helldive_divine_wave_tile" : "helldive_hell_wave_tile";
        const waveStyle = isFreespinWave
          ? {
              fill: 0xFFE8A3,
              hotFill: 0xFFF7D4,
              border: 0xFFD76A,
              hotBorder: 0xFFFFFF,
              spark: 0xFFF9DA,
              baseAlpha: 0.3,
              hotAlpha: 0.66,
              baseScale: 0.56,
              hotScale: 1.12,
              cleanScale: 1.04,
              borderAlpha: 0.62,
              hotBorderAlpha: 0.92,
              spinAngle: 11
            }
          : {
              fill: 0x5A0707,
              hotFill: 0x9D1010,
              border: 0xAA2418,
              hotBorder: 0xFF4A3D,
              spark: 0xFFB04D,
              baseAlpha: 0.32,
              hotAlpha: 0.58,
              baseScale: 0.62,
              hotScale: 1.16,
              cleanScale: 1.06,
              borderAlpha: 0.45,
              hotBorderAlpha: 0.9,
              spinAngle: 0
            };
    
        const occupied = new Set(rippleInjections.map((entry) => `${entry?.reel},${entry?.row}`));
        const cellSize = 70;
        const waveCells = [];
        for (let reel = 0; reel < clientConfig.area.width; reel++) {
          for (let row = 0; row < clientConfig.area.height; row++) {
            const symbol = gameState?.reels?.[reel]?.[row];
            if (symbol === "HOUSE" || symbol === clientConfig.symbolsMapping?.house) continue;
            const center = this.getGridCellCenter(reel, row);
            waveCells.push({ reel, row, center, diagonal: reel + (clientConfig.area.height - 1 - row) });
          }
        }
    
        const maxDiagonal = waveCells.reduce((max, cell) => Math.max(max, cell.diagonal), 0);
        const waveDuration = Math.max(360, (maxDiagonal + 1) * 38 + 190);
    
        this.syncSpritesToReelState(gameState?.reels || {});
        this.hideNonHeavenHellBonusSymbols(gameState);
    
        // Hide incoming demons until their server-provided spawn position is animated.
        rippleInjections.forEach((entry) => {
          const reel = Math.floor(Number(entry?.reel));
          const row = Math.floor(Number(entry?.row));
          const sprite = this.reelSprites?.[reel]?.[row];
          if (!sprite || sprite.destroyed) return;
          sprite.setAlpha(0);
          sprite.setScale((getSymbolScale(sprite.symbolKey) || 1) * 0.68);
        });
    
        const spawnOneDemon = (entry, delay = 0) => new Promise((resolve) => {
          const reel = Math.floor(Number(entry?.reel));
          const row = Math.floor(Number(entry?.row));
          if (!Number.isFinite(reel) || !Number.isFinite(row)) {
            resolve();
            return;
          }
          const center = this.getGridCellCenter(reel, row);
          const sprite = this.reelSprites?.[reel]?.[row];
          this.time.delayedCall(Math.max(0, delay), () => {
            const portalSprite = this.textures?.exists?.("helldive_portal_red")
              ? this.add.image(center.x, center.y, "helldive_portal_red").setScale(0.35).setAlpha(0.9)
              : null;
            if (portalSprite) portalSprite.setDepth(DEPTH_SYMBOLS + 8).setBlendMode(Phaser.BlendModes.ADD);
            const portalRing = this.add.circle(center.x, center.y, 12, 0xFF2C1F, 0.5)
              .setDepth(DEPTH_SYMBOLS + 8)
              .setBlendMode(Phaser.BlendModes.ADD);
            const ember = this.add.circle(center.x, center.y, 5, 0xFFB04D, 0.85)
              .setDepth(DEPTH_SYMBOLS + 9)
              .setBlendMode(Phaser.BlendModes.ADD);
            this.heavenHellRippleFx.push(portalRing, ember);
            if (portalSprite) this.heavenHellRippleFx.push(portalSprite);
            this.playSfx?.("banana_spawn", { volume: entry?.portalInjected ? 0.42 : 0.35 });
            this.tweens.add({
              targets: portalRing,
              scale: entry?.portalInjected ? 4.4 : 3.8,
              alpha: 0,
              duration: entry?.portalInjected ? 430 : 360,
              ease: "Cubic.easeOut",
              onComplete: () => portalRing.destroy()
            });
            if (portalSprite) {
              this.tweens.add({
                targets: portalSprite,
                scale: entry?.portalInjected ? 1.08 : 0.95,
                angle: entry?.portalInjected ? 130 : 85,
                alpha: 0,
                duration: entry?.portalInjected ? 460 : 380,
                ease: "Cubic.easeOut",
                onComplete: () => portalSprite.destroy()
              });
            }
            this.tweens.add({
              targets: ember,
              y: center.y - 18,
              scale: entry?.portalInjected ? 2.45 : 2.1,
              alpha: 0,
              duration: 320,
              ease: "Sine.easeOut",
              onComplete: () => ember.destroy()
            });
            if (sprite && !sprite.destroyed) {
              this.tweens.add({
                targets: sprite,
                alpha: 1,
                scaleX: (getSymbolScale(sprite.symbolKey) || 1) * 1.2,
                scaleY: (getSymbolScale(sprite.symbolKey) || 1) * 1.2,
                duration: 165,
                ease: "Back.easeOut",
                onComplete: () => {
                  this.tweens.add({
                    targets: sprite,
                    scaleX: getSymbolScale(sprite.symbolKey) || 1,
                    scaleY: getSymbolScale(sprite.symbolKey) || 1,
                    duration: 120,
                    ease: "Sine.easeOut",
                    onComplete: resolve
                  });
                }
              });
            } else {
              resolve();
            }
          });
        });
    
        // Portal ability demons punch in first, so Portal feels like a separate clustered injection.
        const portalEntries = rippleInjections.filter((entry) => entry?.portalInjected === true);
        const nonPortalEntries = rippleInjections.filter((entry) => entry?.portalInjected !== true);
        const portalSpawnPromises = portalEntries.map((entry, index) => spawnOneDemon(entry, 35 + index * 55));
    
        const wavePromise = new Promise((resolve) => {
          const waveStartDelay = portalEntries.length > 0 ? Math.min(260, 80 + portalEntries.length * 24) : 0;
    
          this.playSfx?.('symbolWave', {
            volume: isFreespinWave ? 0.45 : 0.35
          });
          waveCells.forEach((cell) => {
            const delay = waveStartDelay + cell.diagonal * 38;
            this.time.delayedCall(delay, () => {
              const hot = occupied.has(`${cell.reel},${cell.row}`);
              const tile = this.textures?.exists?.(waveTextureKey)
                ? this.add.image(cell.center.x, cell.center.y, waveTextureKey).setScale(waveStyle.baseScale)
                : this.add.rectangle(
                    cell.center.x,
                    cell.center.y,
                    cellSize - 5,
                    cellSize - 5,
                    hot ? waveStyle.hotFill : waveStyle.fill,
                    hot ? waveStyle.hotAlpha : waveStyle.baseAlpha
                  );
              tile
                .setDepth(DEPTH_SYMBOLS + 4)
                .setBlendMode(Phaser.BlendModes.ADD)
                .setAlpha(hot ? waveStyle.hotAlpha : waveStyle.baseAlpha);
              if (isFreespinWave) {
                tile.setAngle(-waveStyle.spinAngle);
              }
              const border = this.add.rectangle(cell.center.x, cell.center.y, cellSize - 4, cellSize - 4)
                .setStrokeStyle(hot ? 3 : 2, hot ? waveStyle.hotBorder : waveStyle.border, hot ? waveStyle.hotBorderAlpha : waveStyle.borderAlpha)
                .setDepth(DEPTH_SYMBOLS + 5)
                .setBlendMode(Phaser.BlendModes.ADD)
                .setScale(0.78);
              const spark = isFreespinWave
                ? this.add.circle(cell.center.x, cell.center.y, hot ? 8 : 5, waveStyle.spark, hot ? 0.38 : 0.24)
                    .setDepth(DEPTH_SYMBOLS + 6)
                    .setBlendMode(Phaser.BlendModes.ADD)
                : null;
              this.heavenHellRippleFx.push(tile, border);
              if (spark) this.heavenHellRippleFx.push(spark);
              const tweenTargets = spark ? [tile, border, spark] : [tile, border];
              this.tweens.add({
                targets: tweenTargets,
                scale: hot ? waveStyle.hotScale : waveStyle.cleanScale,
                alpha: hot ? 0.84 : (isFreespinWave ? 0.56 : 0.48),
                angle: isFreespinWave ? waveStyle.spinAngle : 0,
                duration: isFreespinWave ? 145 : 105,
                yoyo: true,
                ease: "Cubic.easeOut",
                onComplete: () => {
                  this.tweens.add({
                    targets: tweenTargets,
                    alpha: 0,
                    scale: 0.96,
                    duration: isFreespinWave ? 360 : 300,
                    ease: "Sine.easeOut",
                    onComplete: () => {
                      tile.destroy();
                      border.destroy();
                      spark?.destroy?.();
                    }
                  });
                }
              });
            });
          });
          this.time.delayedCall(waveStartDelay + waveDuration, resolve);
        });
    
        const spawnPromises = nonPortalEntries.map((entry, index) => {
          const reel = Math.floor(Number(entry?.reel));
          const row = Math.floor(Number(entry?.row));
          const diagonal = reel + (clientConfig.area.height - 1 - row);
          return spawnOneDemon(entry, (portalEntries.length > 0 ? 120 : 0) + diagonal * 38 + (isFreespinWave ? 145 : 80) + index * 4);
        });
    
        await Promise.all([...portalSpawnPromises, wavePromise, ...spawnPromises]);
        this.hideNonHeavenHellBonusSymbols(gameState);
      },

    hideNonHeavenHellBonusSymbols(gameState = {}) {
        const demonSet = new Set([
          Number(clientConfig?.symbolsMapping?.banana || 11),
          Number(clientConfig?.symbolsMapping?.banana2 || 12),
          Number(clientConfig?.symbolsMapping?.banana3 || 13),
          Number(
            clientConfig?.heavenHell?.bonus?.symbols?.gargoyleDemon ??
            clientConfig?.symbolsMapping?.gargoyleDemon ??
            21
          )
        ]);
        const heroId = Number(
          clientConfig?.symbolsMapping?.hero ??
          gameState?.symbolsMapping?.hero ??
          10
        );
        for (let reel = 0; reel < (this.reelSprites?.length || 0); reel++) {
          const column = this.reelSprites?.[reel];
          if (!column) continue;
          for (let row = 0; row < column.length; row++) {
            const sprite = column[row];
            if (!sprite || sprite.destroyed) continue;
            const symbol = Number(sprite.symbolKey);
            const show = demonSet.has(symbol) || symbol === heroId;
            sprite.setVisible(show);
            if (show) {
              sprite.setAlpha(1);
              this.setBonusAwareSymbolTexture(sprite, symbol, { forceBase: true });
            }
          }
        }
      },

    clearMainGameSymbolsForHeavenHellBonus() {
        if (!Array.isArray(this.reelSprites)) return;
        for (let reel = 0; reel < this.reelSprites.length; reel++) {
          const column = this.reelSprites[reel];
          if (!Array.isArray(column)) continue;
          for (let row = 0; row < column.length; row++) {
            const sprite = column[row];
            if (!sprite || sprite.destroyed) continue;
            this.destroyBananaBackplate(sprite);
            sprite.destroy();
            column[row] = null;
          }
        }
      },

    async playHeavenHellBonusEntryPortalTransition() {
        const camera = this.cameras?.main;
        if (!camera) return;
        this.heavenHellBonusEntryAngelArrivalPlayed = false;
    
        const width = Number(camera.width || this.scale?.width || 1280);
        const height = Number(camera.height || this.scale?.height || 720);
        const fadeLayer = this.add.rectangle(0, 0, width, height, 0x000000, 0)
          .setOrigin(0, 0)
          .setScrollFactor(0)
          .setDepth(9999);
        const whiteLayer = this.add.rectangle(0, 0, width, height, 0xFFFFFF, 0)
          .setOrigin(0, 0)
          .setScrollFactor(0)
          .setDepth(10001);
        const cellSize = 70;
        const houseCenterX = this.houseSprite?.x
          ?? (clientConfig.area.width / 2 * cellSize + GRID_OFFSET_X);
        const houseCenterY = this.houseSprite?.y
          ?? ((clientConfig.area.height - clientConfig.area.height / 2) * cellSize + GRID_OFFSET_Y);
        const label = this.add.text(houseCenterX, houseCenterY, "HELLDIVE...", {
          fontSize: "42px",
          fontFamily: '"Cinzel", "Times New Roman", serif',
          fontStyle: "bold italic",
          color: "#FFF8E3",
          stroke: "#7A1C00",
          strokeThickness: 8
        })
          .setOrigin(0.5)
          .setDepth(10000)
          .setAlpha(0);
    
        const fadeCountUpPromise = this.fadeBonusEntryCountUpDisplay();
        const fadeBoardShadowPromise = this.fadeBoardShadowOverlayForBonusEntry?.();
        this.tweens.add({
          targets: fadeLayer,
          alpha: 0.42,
          duration: 320,
          ease: "Sine.easeOut"
        });

        this.tweens.add({
          targets: label,
          alpha: 1,
          scale: { from: 0.94, to: 1 },
          duration: 260,
          ease: "Sine.easeOut"
        });

        const portalChargeDurationMs = 850;
        const portalChargePromise = this.playMainGamePortalBonusEntryCharge?.({
          durationMs: portalChargeDurationMs
        });

        await Promise.all([
          fadeCountUpPromise,
          fadeBoardShadowPromise,
          portalChargePromise,
          this.waitForPresentation(240, { skippable: true })
        ]);

        const angelDivePromise = this.playHeavenHellAngelDiveIntoPortal();
        this.tweens.add({
          targets: label,
          alpha: 0,
          y: label.y - 24,
          duration: 440,
          ease: "Sine.easeIn"
        });

        await angelDivePromise;

        await this.waitForPresentation(80, { skippable: true });

        const portalDiveDurationMs = 1850;
        const portalDivePromise = this.playMainGamePortalBonusEntryDive?.({
          durationMs: portalDiveDurationMs
        });
        const whiteOutPromise = new Promise((resolve) => {
          this.tweens.add({
            targets: whiteLayer,
            alpha: 1,
            duration: portalDiveDurationMs,
            ease: "Cubic.easeIn",
            onComplete: resolve
          });
        });

        await Promise.all([portalDivePromise, whiteOutPromise]);

        this.updateHellDiveBackground?.({ isBonus: true }, { immediate: true, fade: false });
        this.resetMainGamePortalBonusEntryPresentation?.();
    
        label.destroy();
        await new Promise((resolve) => {
          this.tweens.add({
            targets: [fadeLayer, whiteLayer],
            alpha: 0,
            duration: 240,
            ease: "Sine.easeIn",
            onComplete: resolve
          });
        });
        fadeLayer.destroy();
        whiteLayer.destroy();
      },

    fadeBonusEntryCountUpDisplay(duration = 320) {
        const countUpText = this.countUpText;
        if (!countUpText || countUpText.destroyed || countUpText.visible !== true) {
          return Promise.resolve(false);
        }
    
        this.tweens.killTweensOf(countUpText);
        return new Promise((resolve) => {
          this.tweens.add({
            targets: countUpText,
            alpha: 0,
            duration,
            ease: "Sine.easeInOut",
            onComplete: () => {
              if (countUpText && !countUpText.destroyed) {
                countUpText.setVisible(false);
                countUpText.setAlpha(1);
              }
              resolve(true);
            }
          });
        });
      },

    getHeavenHellBonusEntryPortalPosition() {
        if (typeof this.getMainGamePortalDisplayPosition === "function") {
          const cfg = this.getMainGamePortalConfig?.();
          if (cfg?.enabled) {
            return this.getMainGamePortalDisplayPosition();
          }
        }
        const lastReel = Math.max(0, clientConfig.area.width - 1);
        const upperRow = Math.max(0, Math.min(clientConfig.area.height - 1, clientConfig.area.height - 2));
        const lowerRow = Math.max(0, upperRow - 1);
        const upperCell = this.getGridCellCenter(lastReel, upperRow);
        const lowerCell = this.getGridCellCenter(lastReel, lowerRow);
        return {
          x: upperCell.x + 10,
          y: ((upperCell.y + lowerCell.y) * 0.5) - 8
        };
      },

    async playHeavenHellAngelDiveIntoPortal() {
        const portalTarget = this.getHeavenHellBonusEntryPortalPosition();
        const heroTexture = this.getHeavenHellHeroTextureKey?.(HERO_STAGE_TEXTURE_KEYS.rush) || HERO_STAGE_TEXTURE_KEYS.base;
        const footprintSize = Math.max(1, Math.floor(Number(this.currentHeroFootprintSize) || 1));
        const fallbackScale = getHeroScaleForFootprint(footprintSize, heroTexture);
    
        if (!this.heroSprite || this.heroSprite.destroyed) {
          const fallbackAnchor = this.currentHeroAnchor &&
            Number.isFinite(Number(this.currentHeroAnchor.reel)) &&
            Number.isFinite(Number(this.currentHeroAnchor.row))
              ? this.currentHeroAnchor
              : (clientConfig.heroStartingPosition || { reel: 4, row: 2 });
          const fallbackCenter = this.getHeroAnchorCenter(
            Number(fallbackAnchor.reel) || 4,
            Number(fallbackAnchor.row) || 2,
            footprintSize
          );
          this.heroSprite = this.add.image(fallbackCenter.x, fallbackCenter.y, heroTexture)
            .setOrigin(0.5)
            .setScale(fallbackScale)
            .setDepth(DEPTH_HERO + 12)
            .setAlpha(1);
        }
    
        const hero = this.heroSprite;
        if (!hero || hero.destroyed) return;
    
        const startX = Number(hero.x || portalTarget.x);
        const startY = Number(hero.y || portalTarget.y);
        const startScale = Number(hero.scaleX) || fallbackScale;
        hero.setTexture?.(heroTexture);
        hero.setDepth?.(DEPTH_HERO + 14);
        hero.setAlpha?.(1);
    
        const portalSprite = this.textures?.exists?.("helldive_portal_red")
          ? this.add.image(portalTarget.x, portalTarget.y, "helldive_portal_red")
              .setScale(0.34)
              .setAlpha(0.88)
              .setDepth(DEPTH_SYMBOLS + 16)
              .setBlendMode(Phaser.BlendModes.ADD)
          : null;
        const portalRing = this.add.circle(portalTarget.x, portalTarget.y, 18, 0xFF5638, 0.34)
          .setDepth(DEPTH_SYMBOLS + 15)
          .setStrokeStyle(4, 0xFFD5A0, 0.95)
          .setBlendMode(Phaser.BlendModes.ADD);
        const portalCore = this.add.circle(portalTarget.x, portalTarget.y, 8, 0xFFF2BE, 0.8)
          .setDepth(DEPTH_SYMBOLS + 17)
          .setBlendMode(Phaser.BlendModes.ADD);
    
        if (portalSprite) {
          this.tweens.add({
            targets: portalSprite,
            scale: 0.42,
            alpha: 1,
            angle: 24,
            duration: 380,
            yoyo: true,
            repeat: -1,
            ease: "Sine.easeInOut"
          });
        }
        this.tweens.add({
          targets: portalRing,
          scale: 1.32,
          alpha: 0.78,
          duration: 360,
          yoyo: true,
          repeat: -1,
          ease: "Sine.easeInOut"
        });
        this.tweens.add({
          targets: portalCore,
          scale: 1.85,
          alpha: 0.24,
          duration: 320,
          yoyo: true,
          repeat: -1,
          ease: "Sine.easeInOut"
        });
    
        this.playSfx?.("wins_highlight", { volume: 0.28 });
        this.time.delayedCall(120, () => this.playSfx?.("lightning_at_lvl_up", { volume: 0.42 }));
        this.startAngelMovementLightEmitter({ tint: 0xFFE39C, intervalMs: 20, burstScale: 1.05 });
        this.spawnHeavenHellChargeLaunchTrails(startX, startY, portalTarget.x, portalTarget.y, {
          heroScale: startScale
        });
    
        await this.waitForPresentation(140, { skippable: true });

        this.startBonusTheme?.();
    
        await new Promise((resolve) => {
          this.tweens.add({
            targets: hero,
            x: portalTarget.x,
            y: portalTarget.y,
            scale: Math.max(0.08, startScale * 0.12),
            alpha: 0.12,
            angle: hero.angle + 18,
            duration: 720,
            ease: "Cubic.easeIn",
            onComplete: resolve
          });
        });
    
        this.stopAngelMovementLightEmitter();
        this.playSfx?.("wins_explode", { volume: 0.36 });
        const intakeFlash = this.add.circle(portalTarget.x, portalTarget.y, 18, 0xFFF4B8, 0.95)
          .setDepth(DEPTH_SYMBOLS + 18)
          .setBlendMode(Phaser.BlendModes.ADD);
        const intakeShock = this.add.circle(portalTarget.x, portalTarget.y, 30, 0xFF7A47, 0.44)
          .setDepth(DEPTH_SYMBOLS + 17)
          .setBlendMode(Phaser.BlendModes.ADD);
        this.tweens.add({
          targets: intakeFlash,
          scale: 2.8,
          alpha: 0,
          duration: 220,
          ease: "Cubic.easeOut",
          onComplete: () => intakeFlash.destroy()
        });
        this.tweens.add({
          targets: intakeShock,
          scale: 2.2,
          alpha: 0,
          duration: 320,
          ease: "Cubic.easeOut",
          onComplete: () => intakeShock.destroy()
        });
    
        if (hero && !hero.destroyed) {
          hero.destroy();
        }
        this.heroSprite = null;
        this.clearMonkeyWildStrengthBadge();
        this.clearHeroWildActiveBadge();
    
        await this.waitForPresentation(120, { skippable: true });
    
        if (portalSprite && !portalSprite.destroyed) {
          portalSprite.destroy();
        }
        if (!portalRing.destroyed) {
          portalRing.destroy();
        }
        if (!portalCore.destroyed) {
          portalCore.destroy();
        }
      },

    getHeavenHellSoulFlightDurationMs(startX, startY, endX, endY) {
        const distance = Math.max(1, Math.hypot(endX - startX, endY - startY));
        return Phaser.Math.Clamp(Math.round(420 + distance * 1.05), 560, 920);
      },

    getHeavenHellSoulDiveTweenDurationMs(flightMs) {
        const globalTweenScale = Math.max(0.001, Number(this.tweens?.timeScale) || 1);
        return Math.round(flightMs * globalTweenScale);
      },

    getHeavenHellSoulCollectVisualPreset(divineXDoubleKill = false, visualPreset = "main") {
        const isBonus = visualPreset === "bonus";
        if (isBonus) {
          return {
            ghostTint: divineXDoubleKill ? 0xFF55EE : 0xFF3311,
            trailTint: divineXDoubleKill ? 0xFF7CF4 : 0xFF5A2A,
            particleTint: divineXDoubleKill ? 0xFF55EE : 0xFF3616,
            alternateTint: divineXDoubleKill ? 0xFFAAFF : 0xFF7799,
            darkTint: divineXDoubleKill ? 0x880066 : 0x660011,
            darkChance: 0.3,
            lingerDotTints: divineXDoubleKill
              ? [0xFF88FF, 0xFF55EE, 0xFF66CC, 0xCC2288]
              : [0xFF6688, 0xFF4466, 0xFF3355, 0xCC1133],
            soulBlendMode: Phaser.BlendModes.ADD,
            ghostBlendMode: Phaser.BlendModes.ADD,
            trailBlendMode: Phaser.BlendModes.ADD,
            lingerDotBlendMode: Phaser.BlendModes.ADD,
            particleBlendMode: Phaser.BlendModes.ADD
          };
        }
        return {
          ghostTint: divineXDoubleKill ? 0xCC44AA : 0xAA1122,
          trailTint: divineXDoubleKill ? 0xDD66CC : 0xCC2244,
          particleTint: divineXDoubleKill ? 0xCC4488 : 0xAA1122,
          alternateTint: divineXDoubleKill ? 0xDD66BB : 0xCC3355,
          darkTint: divineXDoubleKill ? 0x440033 : 0x4A0010,
          darkChance: 0.64,
          lingerDotTints: divineXDoubleKill
            ? [0x660044, 0x880066, 0xAA2288, 0x550033]
            : [0x660011, 0x880018, 0xAA1122, 0x771122],
          soulBlendMode: Phaser.BlendModes.NORMAL,
          ghostBlendMode: Phaser.BlendModes.NORMAL,
          trailBlendMode: Phaser.BlendModes.NORMAL,
          lingerDotBlendMode: Phaser.BlendModes.NORMAL,
          particleBlendMode: Phaser.BlendModes.NORMAL
        };
      },

    playHeavenHellSoulDiveIntoPortal({
        startX,
        startY,
        intensity = 1,
        divineXDoubleKill = false,
        onComplete = null
      } = {}) {
        void this._playHeavenHellSoulDiveIntoPortal({
          startX,
          startY,
          intensity,
          divineXDoubleKill,
          onComplete
        });
      },

    playHeavenHellSoulDiveIntoMeter({
        startX,
        startY,
        intensity = 1,
        divineXDoubleKill = false,
        reel = null,
        row = null,
        gameState = null,
        killWeight = null,
        onComplete = null
      } = {}) {
        void this._playHeavenHellSoulDiveIntoMeter({
          startX,
          startY,
          intensity,
          divineXDoubleKill,
          reel,
          row,
          gameState,
          killWeight,
          onComplete
        });
      },

    async _playHeavenHellSoulDiveIntoPortal({
        startX,
        startY,
        intensity = 1,
        divineXDoubleKill = false,
        onComplete = null
      } = {}) {
        const portalTarget = this.getHeavenHellBonusEntryPortalPosition?.();
        if (!portalTarget) return;

        await this._playHeavenHellSoulCollectFlight({
          startX,
          startY,
          targetX: portalTarget.x,
          targetY: portalTarget.y,
          intensity,
          divineXDoubleKill,
          visualPreset: "main",
          intakePreset: "portal",
          onComplete
        });
      },

    async _playHeavenHellSoulDiveIntoMeter({
        startX,
        startY,
        intensity = 1,
        divineXDoubleKill = false,
        reel = null,
        row = null,
        gameState = null,
        killWeight = null,
        onComplete = null
      } = {}) {
        this.incrementHeavenHellPendingMeterSoulTrails?.();
        try {
          const meterTarget = this.getHeavenHellMeterSoulIntakePosition?.();
          const resolvedGameState = gameState || this._heavenHellActiveGameState;
          const resolvedReel = Math.floor(Number(reel));
          const resolvedRow = Math.floor(Number(row));

          if (!meterTarget) {
            if (Number.isFinite(resolvedReel) && Number.isFinite(resolvedRow)) {
              this.tickHeavenHellKillMeterOnKill(resolvedReel, resolvedRow, resolvedGameState, { killWeight });
            }
            onComplete?.();
            return;
          }

          await this._playHeavenHellSoulCollectFlight({
            startX,
            startY,
            targetX: meterTarget.x,
            targetY: meterTarget.y,
            intensity,
            divineXDoubleKill,
            visualPreset: "bonus",
            intakePreset: "meter",
            resolveTargetAtImpact: true,
            onComplete: () => {
              if (Number.isFinite(resolvedReel) && Number.isFinite(resolvedRow)) {
                this.tickHeavenHellKillMeterOnKill(resolvedReel, resolvedRow, resolvedGameState, { killWeight });
              }
              onComplete?.();
            }
          });
        } finally {
          this.decrementHeavenHellPendingMeterSoulTrails?.();
        }
      },

    async _playHeavenHellSoulCollectFlight({
        startX,
        startY,
        targetX,
        targetY,
        intensity = 1,
        divineXDoubleKill = false,
        visualPreset = "main",
        intakePreset = "portal",
        resolveTargetAtImpact = false,
        onComplete = null
      } = {}) {
        if (!this.add || !this.tweens || !this.time) return;

        const isBonusVisual = visualPreset === "bonus";
        const trailDepth = isBonusVisual ? BONUS_SOUL_COLLECT_TRAIL_DEPTH : SOUL_COLLECT_TRAIL_DEPTH;
        const orbDepth = isBonusVisual ? BONUS_SOUL_COLLECT_ORB_DEPTH : SOUL_COLLECT_ORB_DEPTH;
        const intakeDepth = isBonusVisual ? BONUS_SOUL_COLLECT_INTAKE_DEPTH : SOUL_COLLECT_INTAKE_DEPTH;
        const heroTexture = this.getHeavenHellHeroTextureKey?.(HERO_STAGE_TEXTURE_KEYS.rush) || HERO_STAGE_TEXTURE_KEYS.base;
        const power = Phaser.Math.Clamp(Number(intensity) || 1, 0.7, 2.2);
        const soulScale = 0.14 + power * 0.03;
        const preset = this.getHeavenHellSoulCollectVisualPreset(divineXDoubleKill, visualPreset);
        const fromX = Number(startX);
        const fromY = Number(startY);
        let endX = Number(targetX);
        let endY = Number(targetY);
        const flightMs = this.getHeavenHellSoulFlightDurationMs(fromX, fromY, endX, endY);
        const tweenDurationMs = this.getHeavenHellSoulDiveTweenDurationMs(flightMs);
        const emitterStateKey = `_heavenHellSoulLightEmitter_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

        const soulSprite = this.add.image(fromX, fromY, heroTexture)
          .setOrigin(0.5)
          .setScale(soulScale)
          .setTint(preset.ghostTint)
          .setDepth(orbDepth)
          .setAlpha(0.95)
          .setBlendMode(preset.soulBlendMode);

        this.spawnHeavenHellChargeLaunchTrails(fromX, fromY, endX, endY, {
          heroScale: soulScale,
          ghostTint: preset.ghostTint,
          trailTint: preset.trailTint,
          trailDurationMs: tweenDurationMs,
          fadeDurationMs: 520,
          trailCountScale: 1.55,
          spawnLingerDots: true,
          lingerDotTints: preset.lingerDotTints,
          lingerDotBlendMode: preset.lingerDotBlendMode,
          lingerDotFadeMs: 820,
          ghostBlendMode: preset.ghostBlendMode,
          trailBlendMode: preset.trailBlendMode,
          depthBase: trailDepth,
          useSoulOrbGhost: true
        });

        await this.waitForPresentation?.(55, { skippable: true });

        if (intakePreset === "meter") {
          const liveTarget = this.getHeavenHellMeterSoulIntakePosition?.();
          if (liveTarget) {
            endX = Number(liveTarget.x);
            endY = Number(liveTarget.y);
          }
        }

        this.startFollowSpriteLightEmitter?.(soulSprite, {
          tint: preset.particleTint,
          alternateTint: preset.alternateTint,
          alternateChance: visualPreset === "bonus" ? 0.48 : 0.34,
          darkTint: preset.darkTint,
          darkChance: preset.darkChance,
          intervalMs: 10,
          burstScale: visualPreset === "bonus" ? 0.92 : 1.05,
          fadeDurationMs: [340, 560],
          driftScale: 0.48,
          blendMode: preset.particleBlendMode,
          depth: trailDepth,
          stateKey: emitterStateKey,
          stopMethod: "stopFollowSpriteLightEmitter"
        });

        await new Promise((resolve) => {
          this.tweens.add({
            targets: soulSprite,
            x: endX,
            y: endY,
            scale: Math.max(0.04, soulScale * 0.18),
            alpha: 0.18,
            angle: 18,
            duration: tweenDurationMs,
            ease: "Cubic.easeIn",
            onComplete: resolve
          });
        });

        this.stopFollowSpriteLightEmitter?.(emitterStateKey);

        if (soulSprite && !soulSprite.destroyed) {
          soulSprite.destroy();
        }

        if (resolveTargetAtImpact && intakePreset === "meter") {
          const liveTarget = this.getHeavenHellMeterSoulIntakePosition?.();
          if (liveTarget) {
            endX = Number(liveTarget.x);
            endY = Number(liveTarget.y);
          }
        }

        if (intakePreset === "meter") {
          const intakeFlash = this.add.circle(endX, endY, 10, 0xFF6688, 0.95)
            .setDepth(intakeDepth)
            .setBlendMode(Phaser.BlendModes.ADD);
          const intakeShock = this.add.circle(endX, endY, 18, 0xFF2244, 0.55)
            .setDepth(intakeDepth - 0.01)
            .setBlendMode(Phaser.BlendModes.ADD);
          this.tweens.add({
            targets: intakeFlash,
            scale: 2.6,
            alpha: 0,
            duration: 220,
            ease: "Cubic.easeOut",
            onComplete: () => intakeFlash.destroy()
          });
          this.tweens.add({
            targets: intakeShock,
            scale: 2.2,
            alpha: 0,
            duration: 300,
            ease: "Cubic.easeOut",
            onComplete: () => intakeShock.destroy()
          });
        } else {
          const intakeFlash = this.add.circle(endX, endY, 10, 0xFF4422, 0.88)
            .setDepth(intakeDepth)
            .setBlendMode(Phaser.BlendModes.ADD);
          const intakeShock = this.add.circle(endX, endY, 16, 0xCC1100, 0.42)
            .setDepth(intakeDepth - 0.01)
            .setBlendMode(Phaser.BlendModes.ADD);
          this.tweens.add({
            targets: intakeFlash,
            scale: 2.2,
            alpha: 0,
            duration: 180,
            ease: "Cubic.easeOut",
            onComplete: () => intakeFlash.destroy()
          });
          this.tweens.add({
            targets: intakeShock,
            scale: 1.8,
            alpha: 0,
            duration: 260,
            ease: "Cubic.easeOut",
            onComplete: () => intakeShock.destroy()
          });
        }

        this.playSfx?.("orb_collect", {
          volume: divineXDoubleKill ? 0.38 : 0.3,
          rate: divineXDoubleKill ? 1.12 : 1.02
        });
        if (intakePreset === "meter") {
          onComplete?.();
          this.pulseHeavenHellMeterOnSoulIntake?.();
        } else {
          onComplete?.();
        }
      },

    playHeavenHellBonusAngelArrival() {
        if (this.heavenHellBonusEntryAngelArrivalPlayed === true) return false;
        if (!this.mainBackground || this.mainBackground.destroyed) return false;
        if (this.mainBackground.texture?.key !== "helldive_hell_bonus_bg") return false;
    
        this.heavenHellBonusEntryAngelArrivalPlayed = true;
    
        const collectTarget = this.getCenterCollectTarget();
        const heroTexture = this.getHeavenHellHeroTextureKey?.(HERO_STAGE_TEXTURE_KEYS.base) || HERO_STAGE_TEXTURE_KEYS.base;
        const heroScale = getHeroScaleForFootprint(1, heroTexture);
    
        if (this.heroSprite && !this.heroSprite.destroyed) {
          this.heroSprite.destroy();
        }
    
        const descentGlow = this.add.circle(collectTarget.x, collectTarget.y - 170, 32, 0xFFF2A8, 0.45)
          .setDepth(DEPTH_HERO + 18)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setScale(0.8);
        this.tweens.add({
          targets: descentGlow,
          y: collectTarget.y - 30,
          scale: 1.9,
          alpha: 0,
          duration: 520,
          ease: "Cubic.easeIn",
          onComplete: () => descentGlow.destroy()
        });
    
        this.heroSprite = this.add.image(collectTarget.x, collectTarget.y - 210, heroTexture)
          .setOrigin(0.5)
          .setScale(heroScale * 0.42)
          .setDepth(DEPTH_HERO + 20)
          .setAlpha(0);
    
        this.currentHeroFootprintSize = 1;
        this.currentHeroRushActive = false;
        this.currentBonusStage = 0;
        this.currentHeroTextureKey = heroTexture;
    
        this.playSfx?.("lightning_at_lvl_up", { volume: 0.62 });
        this.playSfx?.("wins_highlight", { volume: 0.32 });
    
        this.tweens.add({
          targets: this.heroSprite,
          y: collectTarget.y,
          scale: heroScale * 1.18,
          alpha: 1,
          duration: 560,
          ease: "Cubic.easeIn",
          onComplete: () => {
            if (!this.heroSprite || this.heroSprite.destroyed) return;
    
            this.playSfx?.("wins_explode", { volume: 0.45 });
            this.cameras?.main?.shake?.(280, 0.012);
            this.startBonusWonCenterEnergy(collectTarget.x, collectTarget.y, {
              depth: DEPTH_HERO + 26,
              scale: 1.28,
              tint: 0xFFF07A
            });
    
            const centerFlash = this.add.circle(collectTarget.x, collectTarget.y, 30, 0xFFF5BD, 0.92)
              .setDepth(DEPTH_HERO + 24)
              .setBlendMode(Phaser.BlendModes.ADD);
            const shockRing = this.add.circle(collectTarget.x, collectTarget.y, 44, 0xFFB84D, 0.3)
              .setDepth(DEPTH_HERO + 23)
              .setStrokeStyle(12, 0xFFE08A, 0.82)
              .setBlendMode(Phaser.BlendModes.ADD);
            this.tweens.add({
              targets: centerFlash,
              scale: 4.4,
              alpha: 0,
              duration: 280,
              ease: "Cubic.easeOut",
              onComplete: () => centerFlash.destroy()
            });
            this.tweens.add({
              targets: shockRing,
              scale: 3.3,
              alpha: 0,
              duration: 420,
              ease: "Cubic.easeOut",
              onComplete: () => shockRing.destroy()
            });
    
            void this.playMonkeyLevelUpRingBurst(null, {
              heroFootprintSize: 1,
              intensity: "major",
              preferHeroSprite: true,
              durationMs: 820,
              radialScale: 1.18
            }).catch(() => {});
    
            this.tweens.add({
              targets: this.heroSprite,
              scale: heroScale,
              duration: 220,
              ease: "Sine.easeOut"
            });
          }
        });
    
        return true;
      },

    getHeavenHellLootDropSignature(drop = {}) {
        const reel = Math.floor(Number(drop?.reel));
        const row = Math.floor(Number(drop?.row));
        const offsetX = Number.isFinite(Number(drop?.offsetX)) ? Number(drop.offsetX) : 0;
        const offsetY = Number.isFinite(Number(drop?.offsetY)) ? Number(drop.offsetY) : 0;
        const baseValue = Number(drop?.baseValue ?? drop?.value ?? 0);
        const lootType = String(drop?.lootType || drop?.lootKind || "").toLowerCase();
        const source = String(drop?.source || "");
        return `${reel},${row},${offsetX},${offsetY},${baseValue},${lootType},${source}`;
      },

    getHeavenHellLootDropKey(drop = {}, index = 0) {
        return `${this.getHeavenHellLootDropSignature(drop)},${Math.max(0, Math.floor(Number(index) || 0))}`;
      },

    isHeavenHellLootDropRendered(drop = {}, index = 0) {
        const key = this.getHeavenHellLootDropKey(drop, index);
        if (this.heavenHellRenderedLootKeys?.has(key)) return true;
        return (Array.isArray(this.heavenHellLootSprites) ? this.heavenHellLootSprites : []).some((entry) => (
          entry &&
          !entry.destroyed &&
          entry.heavenHellLootDropKey === key
        ));
      },

    registerHeavenHellLootSprite(token, drop = {}, index = 0) {
        if (!token || token.destroyed) return token;
        if (!Array.isArray(this.heavenHellLootSprites)) {
          this.heavenHellLootSprites = [];
        }
        if (!this.heavenHellRenderedLootKeys) {
          this.heavenHellRenderedLootKeys = new Set();
        }
        const key = this.getHeavenHellLootDropKey(drop, index);
        token.heavenHellLootDropKey = key;
        this.heavenHellRenderedLootKeys.add(key);
        this.heavenHellLootSprites.push(token);
        return token;
      },

    findHeavenHellLootGroundIndex(drop = {}, gameState = null) {
        const resolvedGameState = gameState || this._heavenHellActiveGameState;
        const lootGround = Array.isArray(resolvedGameState?.heavenHell?.bonus?.lootGround)
          ? resolvedGameState.heavenHell.bonus.lootGround
          : [];
        if (lootGround.length === 0) return -1;
        const signature = this.getHeavenHellLootDropSignature(drop);
        for (let index = 0; index < lootGround.length; index++) {
          const candidate = lootGround[index];
          if (this.getHeavenHellLootDropSignature(candidate) !== signature) continue;
          if (this.isHeavenHellLootDropRendered(candidate, index)) continue;
          return index;
        }
        return -1;
      },

    trackHeavenHellPendingGroundPresentation(promise, { kind = "loot" } = {}) {
        if (!promise || typeof promise.then !== "function") {
          return promise;
        }
        const propertyName = kind === "chest"
          ? "_heavenHellPendingChestGroundPromises"
          : "_heavenHellPendingLootGroundPromises";
        if (!(this[propertyName] instanceof Set)) {
          this[propertyName] = new Set();
        }
        const trackedPromise = Promise.resolve(promise).catch(() => null);
        this[propertyName].add(trackedPromise);
        trackedPromise.finally(() => {
          this[propertyName]?.delete?.(trackedPromise);
        });
        return trackedPromise;
      },

    async waitForHeavenHellPendingGroundPresentation({ loot = true, chests = true, timeoutMs = 3000 } = {}) {
        const waits = [];
        if (loot && this._heavenHellPendingLootGroundPromises instanceof Set) {
          waits.push(...this._heavenHellPendingLootGroundPromises);
        }
        if (chests && this._heavenHellPendingChestGroundPromises instanceof Set) {
          waits.push(...this._heavenHellPendingChestGroundPromises);
        }
        if (waits.length === 0) {
          return;
        }
        let timedOut = false;
        await Promise.race([
          Promise.allSettled(waits),
          this.waitForPresentation(Math.max(250, Math.floor(Number(timeoutMs) || 3000)), { skippable: true })
            .then(() => {
              timedOut = true;
            })
        ]);

        if (!timedOut) {
          return;
        }

        if (loot && this._heavenHellPendingLootGroundPromises instanceof Set) {
          this._heavenHellPendingLootGroundPromises.clear();
        }
        if (chests && this._heavenHellPendingChestGroundPromises instanceof Set) {
          this._heavenHellPendingChestGroundPromises.clear();
          this.finalizeHeavenHellVisibleGroundChests();
        }
      },

    clearHeavenHellLootGround() {
        (Array.isArray(this.heavenHellLootSprites) ? this.heavenHellLootSprites : []).forEach((entry) => {
          if (!entry || entry.destroyed) return;
          this.tweens.killTweensOf(entry);
          entry.destroy();
        });
        this.heavenHellLootSprites = [];
        this.heavenHellRenderedLootKeys = new Set();
        this.heavenHellLootLayerLock = null;
        this.setHeavenHellGroundLootDisplayTotal?.(0);
      },

    clearHeavenHellGroundChests() {
        (Array.isArray(this.heavenHellGroundChestSprites) ? this.heavenHellGroundChestSprites : []).forEach((entry) => {
          if (!entry || entry.destroyed) return;
          this.tweens.killTweensOf(entry);
          entry.destroy();
        });
        this.heavenHellGroundChestSprites = [];
        this.heavenHellRenderedChestKeys = new Set();
      },

    getHeavenHellChestIdentityKey(chest = {}) {
        const numericId = Number(chest?.id ?? chest?.pendingId ?? chest?.chestId);
        if (Number.isFinite(numericId) && numericId > 0) {
          return `chest:${numericId}`;
        }
        const reel = Math.floor(Number(chest?.reel));
        const row = Math.floor(Number(chest?.row));
        const type = String(chest?.chestType || "unknown");
        if (!Number.isFinite(reel) || !Number.isFinite(row)) {
          return null;
        }
        return `chest:${reel},${row},${type}`;
      },

    getHeavenHellChestRenderKey(chest = {}, index = 0) {
        const identityKey = this.getHeavenHellChestIdentityKey(chest);
        if (identityKey) {
          return identityKey;
        }
        return `chest:unknown,${Math.max(0, Math.floor(Number(index) || 0))}`;
      },

    clearHeavenHellChestRenderedFlag(chest = {}, index = 0) {
        if (!this.heavenHellRenderedChestKeys) return;
        this.heavenHellRenderedChestKeys.delete(this.getHeavenHellChestRenderKey(chest, index));
        const identityKey = this.getHeavenHellChestIdentityKey(chest);
        if (identityKey) {
          this.heavenHellRenderedChestKeys.delete(identityKey);
        }
      },

    isHeavenHellChestRendered(chest = {}, index = 0) {
        const key = this.getHeavenHellChestRenderKey(chest, index);
        return Boolean(this.heavenHellRenderedChestKeys?.has?.(key));
      },

    getHeavenHellQueuedChestEvents(gameState = null) {
        const resolvedGameState = gameState || this._heavenHellActiveGameState;
        return Array.isArray(resolvedGameState?.heavenHell?.bonus?.chestEventsThisAction)
          ? resolvedGameState.heavenHell.bonus.chestEventsThisAction.filter((entry) => entry?.type === "dropQueued")
          : [];
      },

    getHeavenHellPendingGroundChests(gameState = null) {
        const resolvedGameState = gameState || this._heavenHellActiveGameState;
        const bonus = resolvedGameState?.heavenHell?.bonus;
        if (!bonus) {
          return [];
        }

        // Full battlefield queue — not chestEventsThisAction (per-action drops only).
        const pendingChests = Array.isArray(bonus.pendingChests) ? bonus.pendingChests : [];
        if (pendingChests.length > 0) {
          return pendingChests;
        }

        const events = Array.isArray(bonus.chestEventsThisAction) ? bonus.chestEventsThisAction : [];
        if (events.length === 0) {
          return [];
        }

        const resolvedRewardChests = events.filter((entry) => (
          entry &&
          entry?.type !== "dropQueued" &&
          Number.isFinite(Number(entry?.reel)) &&
          Number.isFinite(Number(entry?.row))
        ));
        if (resolvedRewardChests.length > 0) {
          return resolvedRewardChests;
        }

        return events.filter((entry) => entry?.type === "dropQueued");
      },

    finalizeHeavenHellVisibleGroundChests() {
        (Array.isArray(this.heavenHellGroundChestSprites) ? this.heavenHellGroundChestSprites : []).forEach((sprite) => {
          if (!sprite || sprite.destroyed) return;
          this.finalizeHeavenHellGroundChestSprite(sprite, sprite.heavenHellChestData || {});
        });
      },

    getHeavenHellGroundChestPosition(chest = {}) {
        const reel = Math.floor(Number(chest?.reel));
        const row = Math.floor(Number(chest?.row));
        const target = this.getGridCellCenter(reel, row);
        return {
          x: target.x,
          y: target.y + 12
        };
      },

    getHeavenHellChestTextureKey(chest = {}) {
        const chestType = String(chest?.chestType || "").toLowerCase();
        if (chestType === "wooden" && this.textures?.exists?.("helldive_chest_wooden")) {
          return "helldive_chest_wooden";
        }
        if ((chestType === "divine" || chestType === "gold") && this.textures?.exists?.("helldive_chest_divine")) {
          return "helldive_chest_divine";
        }
        if (this.textures?.exists?.("helldive_chest_divine")) {
          return "helldive_chest_divine";
        }
        return "bonus_chest";
      },

    createHeavenHellGroundChestSprite(chest = {}, { x = null, y = null, scale = 0.42, alpha = 0.98, index = 0 } = {}) {
        const position = Number.isFinite(Number(x)) && Number.isFinite(Number(y))
          ? { x: Number(x), y: Number(y) }
          : this.getHeavenHellGroundChestPosition(chest);
        const textureKey = this.getHeavenHellChestTextureKey(chest);
        const sprite = this.add.image(position.x, position.y, textureKey)
          .setDepth(DEPTH_HEAVEN_HELL_GROUND_CHEST)
          .setScale(scale)
          .setAlpha(alpha);
        sprite.heavenHellChestData = chest;
        sprite.heavenHellChestKey = this.getHeavenHellChestRenderKey(chest, index);
        return sprite;
      },

    finalizeHeavenHellGroundChestSprite(sprite, chest = {}) {
        if (!sprite || sprite.destroyed) return sprite;
        const resolvedChest = chest?.heavenHellChestData || chest;
        const land = this.getHeavenHellGroundChestPosition(resolvedChest);
        this.tweens.killTweensOf(sprite);
        sprite.setPosition(land.x, land.y);
        sprite.setScale(0.44);
        sprite.setAlpha(0.98);
        sprite.setDepth(DEPTH_HEAVEN_HELL_GROUND_CHEST);
        return sprite;
      },

    syncHeavenHellGroundChestDepths() {
        if (!Array.isArray(this.heavenHellGroundChestSprites)) return;
        this.heavenHellGroundChestSprites.forEach((entry) => {
          if (!entry || entry.destroyed || typeof entry.setDepth !== "function") return;
          entry.setDepth(DEPTH_HEAVEN_HELL_GROUND_CHEST);
        });
      },

    syncHeavenHellRewardGroundChests(chests = [], { openedThroughIndex = -1 } = {}) {
        const list = Array.isArray(chests) ? chests : [];
        const pendingEntries = list
          .map((chest, index) => ({ chest, index }))
          .filter(({ index }) => index > openedThroughIndex);
        const pendingKeys = new Set(
          pendingEntries
            .map(({ chest, index }) => this.getHeavenHellChestRenderKey(chest, index))
            .filter(Boolean)
        );
        const pendingIdentityKeys = new Set(
          pendingEntries
            .map(({ chest }) => this.getHeavenHellChestIdentityKey(chest))
            .filter(Boolean)
        );
        const presentationSprite = this.heavenHellChestSprite && !this.heavenHellChestSprite.destroyed
          ? this.heavenHellChestSprite
          : null;

        this.heavenHellGroundChestSprites = (Array.isArray(this.heavenHellGroundChestSprites)
          ? this.heavenHellGroundChestSprites
          : []
        ).filter((sprite) => {
          if (!sprite || sprite.destroyed) return false;
          if (presentationSprite && sprite === presentationSprite) return false;
          const spriteIdentity = this.getHeavenHellChestIdentityKey(sprite.heavenHellChestData || {});
          if (pendingKeys.has(sprite.heavenHellChestKey) || (spriteIdentity && pendingIdentityKeys.has(spriteIdentity))) {
            this.finalizeHeavenHellGroundChestSprite(sprite, sprite.heavenHellChestData || {});
            return true;
          }
          this.tweens.killTweensOf(sprite);
          this.heavenHellRenderedChestKeys?.delete?.(sprite.heavenHellChestKey);
          if (spriteIdentity) {
            this.heavenHellRenderedChestKeys?.delete?.(spriteIdentity);
          }
          sprite.destroy();
          return false;
        });

        for (let index = Math.max(0, openedThroughIndex + 1); index < list.length; index++) {
          const chest = list[index];
          if (!chest) continue;
          const existing = this.findHeavenHellGroundChestSprite(chest, index)
            || this.findHeavenHellGroundChestSpriteByIdentity(chest);
          if (existing) {
            existing.heavenHellChestData = chest;
            existing.heavenHellChestKey = this.getHeavenHellChestRenderKey(chest, index);
            this.heavenHellRenderedChestKeys?.add?.(existing.heavenHellChestKey);
            this.finalizeHeavenHellGroundChestSprite(existing, chest);
            continue;
          }
          if (this.isHeavenHellChestRendered(chest, index)) {
            this.clearHeavenHellChestRenderedFlag(chest, index);
          }
          const sprite = this.createHeavenHellGroundChestSprite(chest, { scale: 0.44, index });
          this.registerHeavenHellGroundChestSprite(sprite, chest, index);
        }

        this.syncHeavenHellGroundChestDepths();
      },

    registerHeavenHellGroundChestSprite(sprite, chest = {}, index = 0) {
        if (!sprite || sprite.destroyed) return sprite;
        if (!Array.isArray(this.heavenHellGroundChestSprites)) {
          this.heavenHellGroundChestSprites = [];
        }
        if (!this.heavenHellRenderedChestKeys) {
          this.heavenHellRenderedChestKeys = new Set();
        }
        const key = this.getHeavenHellChestRenderKey(chest, index);
        sprite.heavenHellChestData = chest;
        sprite.heavenHellChestKey = key;
        this.heavenHellRenderedChestKeys.add(key);
        this.heavenHellGroundChestSprites.push(sprite);
        return sprite;
      },

    findHeavenHellGroundChestSprite(chest = {}, index = 0) {
        const key = this.getHeavenHellChestRenderKey(chest, index);
        return (Array.isArray(this.heavenHellGroundChestSprites) ? this.heavenHellGroundChestSprites : [])
          .find((entry) => entry && !entry.destroyed && entry.heavenHellChestKey === key) || null;
      },

    findHeavenHellGroundChestSpriteByIdentity(chest = {}) {
        const identityKey = this.getHeavenHellChestIdentityKey(chest);
        if (!identityKey) return null;
        return (Array.isArray(this.heavenHellGroundChestSprites) ? this.heavenHellGroundChestSprites : [])
          .find((entry) => {
            if (!entry || entry.destroyed) return false;
            if (entry.heavenHellChestKey === identityKey) return true;
            return this.getHeavenHellChestIdentityKey(entry.heavenHellChestData || {}) === identityKey;
          }) || null;
      },

    takeHeavenHellGroundChestSprite(chest = {}, index = 0) {
        const key = this.getHeavenHellChestRenderKey(chest, index);
        if (!Array.isArray(this.heavenHellGroundChestSprites)) {
          this.heavenHellGroundChestSprites = [];
          return null;
        }
        let spriteIndex = this.heavenHellGroundChestSprites.findIndex(
          (entry) => entry && !entry.destroyed && entry.heavenHellChestKey === key
        );
        if (spriteIndex < 0) {
          const byIdentity = this.findHeavenHellGroundChestSpriteByIdentity(chest);
          if (byIdentity) {
            spriteIndex = this.heavenHellGroundChestSprites.indexOf(byIdentity);
          }
        }
        if (spriteIndex < 0) return null;
        const [sprite] = this.heavenHellGroundChestSprites.splice(spriteIndex, 1);
        this.heavenHellRenderedChestKeys?.delete?.(key);
        const identityKey = this.getHeavenHellChestIdentityKey(chest);
        if (identityKey) {
          this.heavenHellRenderedChestKeys?.delete?.(identityKey);
        }
        return sprite || null;
      },

    resolveHeavenHellGroundChestSpriteForReward(chest = {}, index = 0) {
        const taken = this.takeHeavenHellGroundChestSprite(chest, index);
        if (taken && !taken.destroyed) {
          return taken;
        }
        return this.createHeavenHellGroundChestSprite(chest, { scale: 0.44, index });
      },

    promoteHeavenHellGroundChestForPresentation(sprite, chest = {}, chestCenter = null) {
        if (!sprite || sprite.destroyed) return null;
        const center = chestCenter || this.getHeavenHellGroundChestPosition(chest);
        this.tweens.killTweensOf(sprite);
        sprite.heavenHellChestData = chest;
        sprite.heavenHellChestKey = this.getHeavenHellChestRenderKey(chest);
        sprite
          .setPosition(center.x, center.y)
          .setDepth(DEPTH_HERO + 31)
          .setScale(0.44)
          .setAlpha(1);
        this.heavenHellChestSprite = sprite;
        return sprite;
      },

    findHeavenHellQueuedChestForCell(reel, row, gameState = null) {
        const normalizedReel = Math.floor(Number(reel));
        const normalizedRow = Math.floor(Number(row));
        const queued = this.getHeavenHellQueuedChestEvents(gameState);
        for (let index = 0; index < queued.length; index++) {
          const chest = queued[index];
          if (Math.floor(Number(chest?.reel)) !== normalizedReel || Math.floor(Number(chest?.row)) !== normalizedRow) {
            continue;
          }
          if (this.isHeavenHellChestRendered(chest, index)) {
            continue;
          }
          return { chest, index };
        }
        return null;
      },

    async playHeavenHellKillCellLootDrops(gameState = null, cells = [], { stepQuickStop = false } = {}) {
        const resolvedGameState = gameState || this._heavenHellActiveGameState;
        const killCells = (Array.isArray(cells) ? cells : [])
          .map((cell) => ({
            reel: Math.floor(Number(cell?.reel)),
            row: Math.floor(Number(cell?.row))
          }))
          .filter((cell) => Number.isFinite(cell.reel) && Number.isFinite(cell.row));
        if (killCells.length === 0 || resolvedGameState?.isBonus !== true) return;

        if (stepQuickStop) {
          return;
        }

        await this.playHeavenHellLootDropPattern(resolvedGameState, {
          launchFromDropCell: true,
          filterCells: killCells,
          persistToGround: true
        });
      },

    trackHeavenHellKillGroundDrops(pathStep = {}, cells = [], gameState = null, { stepQuickStop = false } = {}) {
        const resolvedGameState = gameState || this._heavenHellActiveGameState;
        if (resolvedGameState?.isBonus !== true) return;

        const cellList = Array.isArray(cells) ? cells : [];
        const killCells = cellList
          .map((target) => ({
            reel: Math.floor(Number(target?.reel)),
            row: Math.floor(Number(target?.row))
          }))
          .filter((cell) => Number.isFinite(cell.reel) && Number.isFinite(cell.row));

        if (killCells.length > 0 && !stepQuickStop) {
          this.trackHeavenHellPendingGroundPresentation(
            this.playHeavenHellKillCellLootDrops(resolvedGameState, killCells, { stepQuickStop }),
            { kind: "loot" }
          );
        }

        const stepChestDrops = Array.isArray(pathStep?.chestDrops) ? pathStep.chestDrops : [];
        if (stepChestDrops.length > 0) {
          this.trackHeavenHellPendingGroundPresentation(
            this.playHeavenHellQueuedChestDrops(stepChestDrops, { stepQuickStop }),
            { kind: "chest" }
          );
        } else if (killCells.length > 0) {
          this.trackHeavenHellPendingGroundPresentation(
            this.playHeavenHellQueuedChestDropsForCells(cellList, resolvedGameState, { stepQuickStop }),
            { kind: "chest" }
          );
        }
      },

    async playHeavenHellQueuedChestDrop(chest = {}, { index = 0, stepQuickStop = false } = {}) {
        if (!chest) return null;
        if (this.isHeavenHellChestRendered(chest, index)) {
          const existing = this.findHeavenHellGroundChestSprite(chest, index);
          return existing ? this.finalizeHeavenHellGroundChestSprite(existing, chest) : existing;
        }

        if (stepQuickStop) {
          const sprite = this.createHeavenHellGroundChestSprite(chest, { scale: 0.44, index });
          this.registerHeavenHellGroundChestSprite(sprite, chest, index);
          return this.finalizeHeavenHellGroundChestSprite(sprite, chest);
        }

        const land = this.getHeavenHellGroundChestPosition(chest);
        const shadow = this.add.ellipse(land.x, land.y + 20, 46, 14, 0x000000, 0.08)
          .setDepth(DEPTH_HEAVEN_HELL_GROUND_CHEST - 1)
          .setScale(0.6, 0.7);
        const sprite = this.createHeavenHellGroundChestSprite(chest, {
          x: land.x,
          y: land.y - 64,
          scale: 0.38,
          alpha: 0,
          index
        }).setDepth(DEPTH_HEAVEN_HELL_GROUND_CHEST + 1);
        this.registerHeavenHellGroundChestSprite(sprite, chest, index);
        const flash = this.add.circle(land.x, land.y - 6, 18, 0xFFF0B8, 0.18)
          .setDepth(DEPTH_HEAVEN_HELL_GROUND_CHEST)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setScale(0.3);

        this.playSfx?.("gold_drop", { volume: 0.16, rate: 0.96 + index * 0.02 });

        try {
          await new Promise((resolve) => {
            this.tweens.add({
              targets: sprite,
              y: land.y,
              alpha: 1,
              scaleX: 0.46,
              scaleY: 0.46,
              duration: 260,
              ease: "Cubic.easeIn",
              onComplete: () => {
                this.playSfx?.("coin2", { volume: 0.18 });
                this.tweens.add({
                  targets: sprite,
                  y: land.y + 5,
                  duration: 180,
                  yoyo: true,
                  ease: "Bounce.easeOut",
                  onComplete: resolve
                });
              }
            });
            this.tweens.add({
              targets: shadow,
              alpha: 0.3,
              scaleX: 1,
              scaleY: 1,
              duration: 240,
              ease: "Sine.easeIn"
            });
            this.tweens.add({
              targets: flash,
              scale: 2.2,
              alpha: 0,
              duration: 280,
              ease: "Cubic.easeOut",
              onComplete: () => flash.destroy()
            });
          });

          this.tweens.add({
            targets: shadow,
            alpha: 0,
            duration: 240,
            ease: "Sine.easeOut",
            onComplete: () => shadow.destroy()
          });
        } finally {
          this.finalizeHeavenHellGroundChestSprite(sprite, chest);
        }

        return sprite;
      },

    async ensureHeavenHellQueuedChestDrops(gameState = {}, { animateMissing = false } = {}) {
        const queued = this.getHeavenHellPendingGroundChests(gameState);
        if (queued.length === 0) {
          this.finalizeHeavenHellVisibleGroundChests();
          return;
        }

        const pendingEntries = queued.map((chest, index) => ({ chest, index }));
        const queuedKeys = new Set(
          pendingEntries.map(({ chest, index }) => this.getHeavenHellChestRenderKey(chest, index))
        );
        const queuedIdentityKeys = new Set(
          pendingEntries
            .map(({ chest }) => this.getHeavenHellChestIdentityKey(chest))
            .filter(Boolean)
        );
        const presentationSprite = this.heavenHellChestSprite && !this.heavenHellChestSprite.destroyed
          ? this.heavenHellChestSprite
          : null;

        this.heavenHellGroundChestSprites = (Array.isArray(this.heavenHellGroundChestSprites)
          ? this.heavenHellGroundChestSprites
          : []
        ).filter((sprite) => {
          if (!sprite || sprite.destroyed) return false;
          if (presentationSprite && sprite === presentationSprite) return false;
          const spriteIdentity = this.getHeavenHellChestIdentityKey(sprite.heavenHellChestData || {});
          if (queuedKeys.has(sprite.heavenHellChestKey) || (spriteIdentity && queuedIdentityKeys.has(spriteIdentity))) {
            this.finalizeHeavenHellGroundChestSprite(sprite, sprite.heavenHellChestData || {});
            return true;
          }
          this.tweens.killTweensOf(sprite);
          this.heavenHellRenderedChestKeys?.delete?.(sprite.heavenHellChestKey);
          if (spriteIdentity) {
            this.heavenHellRenderedChestKeys?.delete?.(spriteIdentity);
          }
          sprite.destroy();
          return false;
        });

        for (let index = 0; index < queued.length; index++) {
          const chest = queued[index];
          const existing = this.findHeavenHellGroundChestSprite(chest, index)
            || this.findHeavenHellGroundChestSpriteByIdentity(chest);
          if (existing) {
            existing.heavenHellChestData = chest;
            existing.heavenHellChestKey = this.getHeavenHellChestRenderKey(chest, index);
            this.heavenHellRenderedChestKeys?.add?.(existing.heavenHellChestKey);
            this.finalizeHeavenHellGroundChestSprite(existing, chest);
            continue;
          }
          if (this.isHeavenHellChestRendered(chest, index)) {
            this.clearHeavenHellChestRenderedFlag(chest, index);
          }
          if (animateMissing) {
            await this.playHeavenHellQueuedChestDrop(chest, { index });
            continue;
          }
          const sprite = this.createHeavenHellGroundChestSprite(chest, { scale: 0.44, index });
          this.registerHeavenHellGroundChestSprite(sprite, chest, index);
        }

        this.syncHeavenHellGroundChestDepths();
      },

    async playHeavenHellQueuedChestDropsForCells(cells = [], gameState = null, { stepQuickStop = false } = {}) {
        const resolvedGameState = gameState || this._heavenHellActiveGameState;
        const list = Array.isArray(cells) ? cells : [];
        for (let index = 0; index < list.length; index++) {
          const cell = list[index] || {};
          const queuedChestDrop = this.findHeavenHellQueuedChestForCell(cell?.reel, cell?.row, resolvedGameState);
          if (!queuedChestDrop) continue;
          await this.playHeavenHellQueuedChestDrop(queuedChestDrop.chest, {
            index: queuedChestDrop.index,
            stepQuickStop
          });
        }
      },

    async playHeavenHellQueuedChestDrops(chests = [], { stepQuickStop = false } = {}) {
        const list = Array.isArray(chests) ? chests : [];
        for (let index = 0; index < list.length; index++) {
          const chest = list[index];
          if (!chest) continue;
          await this.playHeavenHellQueuedChestDrop(chest, { index, stepQuickStop });
        }
      },

    normalizeHeavenHellLootLayer(layer = null) {
        if (typeof layer === "boolean") {
          return layer ? "frontOfHero" : "behindHero";
        }
        if (layer === "frontOfHero" || layer === "behindHero" || layer === "behindDemons") {
          return layer;
        }
        return null;
      },

    setHeavenHellLootLayerLock(layer = null) {
        this.heavenHellLootLayerLock = this.normalizeHeavenHellLootLayer(layer);
        return this.heavenHellLootLayerLock;
      },

    getHeavenHellResolvedLootLayer(layer = null) {
        const explicitLayer = this.normalizeHeavenHellLootLayer(layer);
        if (explicitLayer) {
          return explicitLayer;
        }
        return this.normalizeHeavenHellLootLayer(this.heavenHellLootLayerLock) || "behindDemons";
      },

    getHeavenHellLootDepth(layer = "behindHero") {
        if (layer === "frontOfHero") {
          return DEPTH_HERO + 1;
        }
        if (layer === "behindDemons") {
          return DEPTH_BANANAS - 1;
        }
        return DEPTH_HERO - 1;
      },

    getHeavenHellLootTokenScale(drop = {}, { ground = true } = {}) {
        const baseScale = ground ? 0.34 : 0.42;
        if (drop?.isBoss === true) {
          return Math.max(baseScale, ground ? 0.5 : 0.5);
        }
        return baseScale;
      },

    syncHeavenHellLootGround(drops = [], { layer = "behindHero" } = {}) {
        if (!Array.isArray(this.heavenHellLootSprites)) {
          this.heavenHellLootSprites = [];
        }
        if (!this.heavenHellRenderedLootKeys) {
          this.heavenHellRenderedLootKeys = new Set();
        }
        const list = Array.isArray(drops) ? drops : [];
        const maxRender = Math.min(64, list.length);
        const resolvedLayer = this.getHeavenHellResolvedLootLayer(layer);
        for (let i = 0; i < maxRender; i++) {
          const drop = list[i];
          if (this.isHeavenHellLootDropRendered(drop, i)) continue;
          const reel = Math.floor(Number(drop?.reel));
          const row = Math.floor(Number(drop?.row));
          if (!Number.isFinite(reel) || !Number.isFinite(row)) continue;
          const position = this.getHeavenHellLootGroundPosition(drop, i);
          const token = this.createHeavenHellLootToken(position.x, position.y, drop, i, {
            scale: this.getHeavenHellLootTokenScale(drop, { ground: true })
          });
          token.setDepth(this.getHeavenHellLootDepth(resolvedLayer));
          this.registerHeavenHellLootSprite(token, drop, i);
        }
      },

    renderHeavenHellLootGround(drops = [], options = {}) {
        this.syncHeavenHellLootGround(drops, options);
        this.syncHeavenHellLootSpriteDepths(options?.layer);
      },

    syncHeavenHellLootSpriteDepths(layer = "behindHero") {
        const lootDepth = this.getHeavenHellLootDepth(this.getHeavenHellResolvedLootLayer(layer));
        if (!Array.isArray(this.heavenHellLootSprites)) return;
        this.heavenHellLootSprites.forEach((entry) => {
          if (!entry || entry.destroyed || typeof entry.setDepth !== "function") return;
          entry.setDepth(lootDepth);
        });
      },

    getHeavenHellLootGroundPosition(drop = {}, index = 0) {
        const reel = Math.floor(Number(drop?.reel));
        const row = Math.floor(Number(drop?.row));
        const target = this.getGridCellCenter(reel, row);
        const fallbackOffsetX = ((index % 3) - 1) * 5;
        const fallbackOffsetY = ((((index / 3) | 0) % 2) * 4);
        const offsetX = Number.isFinite(Number(drop?.offsetX)) ? Number(drop.offsetX) : fallbackOffsetX;
        const offsetY = Number.isFinite(Number(drop?.offsetY)) ? Number(drop.offsetY) : fallbackOffsetY;
        return {
          x: target.x + offsetX,
          y: target.y + 14 + offsetY
        };
      },

    getHeavenHellGroundLootBaseValueTotal(drops = []) {
        return (Array.isArray(drops) ? drops : []).reduce((sum, drop) => {
          const baseValue = Math.max(0, Number(drop?.baseValue ?? drop?.value ?? 0));
          return sum + baseValue;
        }, 0);
      },

    syncHeavenHellGroundLootDisplayFromGameState(gameState = null, { preserveVisibleTotal = true } = {}) {
        const resolvedGameState = gameState || this._heavenHellActiveGameState;
        const drops = Array.isArray(resolvedGameState?.heavenHell?.bonus?.lootGround)
          ? resolvedGameState.heavenHell.bonus.lootGround
          : [];
        const total = this.getHeavenHellGroundLootBaseValueTotal(drops);
        const current = Math.max(0, Number(this._heavenHellGroundLootDisplayValue || 0));
        if (preserveVisibleTotal && current > 0 && current >= total) {
          this.syncHeavenHellGroundLootDisplayText?.();
          return current;
        }
        this.setHeavenHellGroundLootDisplayTotal?.(total);
        return total;
      },

    setHeavenHellGroundLootDisplayTotal(value = 0) {
        this._heavenHellGroundLootDisplayValue = Math.max(0, Number(value) || 0);
        this.syncHeavenHellGroundLootDisplayText?.();
        return this._heavenHellGroundLootDisplayValue;
      },

    incrementHeavenHellGroundLootDisplayTotal(value = 0) {
        const delta = Math.max(0, Number(value) || 0);
        if (delta <= 0) {
          return Math.max(0, Number(this._heavenHellGroundLootDisplayValue || 0));
        }
        this._heavenHellGroundLootDisplayValue = Math.max(
          0,
          Number(this._heavenHellGroundLootDisplayValue || 0) + delta
        );
        this.syncHeavenHellGroundLootDisplayText?.();
        return this._heavenHellGroundLootDisplayValue;
      },

    syncHeavenHellGroundLootDisplayText() {
        const ui = this._heavenHellMeterUi;
        if (!ui?.lootChestValueText || ui.lootChestValueText.destroyed) return;
        const value = Math.max(0, Number(this._heavenHellGroundLootDisplayValue || 0));
        ui.lootChestValueText.setText(this.formatBonusEndBoardValue(value));
      },

    getHeavenHellLootDotColor(baseValue = 0) {
        const colorByBaseValue = {
          "0.1": 0x8BC5FF,
          "0.2": 0x7CFFB2,
          "0.3": 0xFF7B7B,
          "0.5": 0xC89BFF,
          "1": 0x7BB7FF,
          "5": 0xF8F8FF
        };
        return colorByBaseValue[String(Number(baseValue || 0))] || 0xFDD76A;
      },

    getHeavenHellLootTexture(dropOrValue = 0, index = 0) {
        const drop = dropOrValue && typeof dropOrValue === "object" ? dropOrValue : null;
        const lootKind = String(drop?.lootType || drop?.lootKind || "").toLowerCase();
        const textureByLootKind = {
          coin: "helldive_loot_coin",
          emerald: "helldive_loot_emerald",
          ruby: "helldive_loot_ruby",
          amethyst: "helldive_loot_amethyst",
          sapphire: "helldive_loot_sapphire",
          diamond: "helldive_loot_diamond"
        };
        if (textureByLootKind[lootKind]) return textureByLootKind[lootKind];
        const baseValue = drop ? drop?.baseValue : dropOrValue;
        const normalized = Number(baseValue || 0);
        const textureByValue = {
          "0.1": "helldive_loot_coin",
          "0.2": "helldive_loot_emerald",
          "0.3": "helldive_loot_ruby",
          "0.5": "helldive_loot_amethyst",
          "1": "helldive_loot_sapphire",
          "5": "helldive_loot_diamond"
        };
        const exactTexture = textureByValue[String(normalized)];
        if (exactTexture) return exactTexture;
        if (Number.isFinite(normalized) && normalized > 0) {
          const closestValue = Object.keys(textureByValue)
            .map((value) => Number(value))
            .reduce((closest, current) => {
              const currentDiff = Math.abs(current - normalized);
              const closestDiff = Math.abs(closest - normalized);
              if (currentDiff < closestDiff) return current;
              if (Math.abs(currentDiff - closestDiff) < 0.000001 && current < closest) return current;
              return closest;
            }, 0.1);
          return textureByValue[String(closestValue)] || "helldive_loot_coin";
        }
        return "helldive_loot_coin";
      },

    createHeavenHellLootToken(x, y, drop = {}, index = 0, { scale = 0.42 } = {}) {
        const textureKey = this.getHeavenHellLootTexture(drop, index);
        if (this.textures?.exists?.(textureKey)) {
          const bossScale = drop?.isBoss === true ? Math.max(scale, 0.5) : scale;
          return this.add.image(x, y, textureKey).setScale(bossScale).setAlpha(0.96);
        }
        return this.add.circle(x, y, 7, this.getHeavenHellLootDotColor(drop?.baseValue), 0.95);
      },

    getHeavenHellHeroTextureKey(preferredTextureKey = null) {
        const candidates = [
          preferredTextureKey,
          this.currentHeroTextureKey,
          HERO_STAGE_TEXTURE_KEYS.rush,
          HERO_STAGE_TEXTURE_KEYS.base
        ].filter(Boolean);
        return candidates.find((key) => this.textures?.exists?.(key)) || candidates[0] || HERO_STAGE_TEXTURE_KEYS.base;
      },

    playHeavenHellLootLaunchSfx(index = 0) {
        const launchKey = index % 4 === 0 ? "gold_drop" : `coin${(index % 6) + 1}`;
        this.playSfx?.(launchKey, { volume: index % 4 === 0 ? 0.18 : 0.12 });
      },

    playHeavenHellLootLandSfx(index = 0, options = {}) {
        const normalizedIndex = Math.max(0, Math.floor(Number(index) || 0));
        const soft = options?.soft === true;
        const value = Number(options?.baseValue ?? options?.drop?.baseValue ?? 0);
        const highValue = value >= 1 || options?.isBoss === true || options?.drop?.isBoss === true;
        const coinKey = `coin${((normalizedIndex + (highValue ? 2 : 0)) % 6) + 1}`;
    
        if (soft) {
          this.playSfx?.("gold_drop", { volume: 0.15, rate: 1.05 + (normalizedIndex % 3) * 0.03 });
          return;
        }
    
        this.playSfx?.(highValue ? "gold_drop" : coinKey, {
          volume: highValue ? 0.36 : 0.28,
          rate: 0.92 + (normalizedIndex % 5) * 0.04
        });
        if (highValue) {
          this.time?.delayedCall?.(90, () => this.playSfx?.(coinKey, { volume: 0.24 }));
        }
      },

    getHeavenHellMultiplierDemonId() {
        return Number(
          clientConfig?.heavenHell?.bonus?.symbols?.multiplierDemon ??
          clientConfig?.symbolsMapping?.banana2 ??
          12
        );
      },

    getHeavenHellBossDemonId() {
        return Number(
          clientConfig?.heavenHell?.bonus?.symbols?.bossDemon ??
          clientConfig?.symbolsMapping?.banana3 ??
          13
        );
      },

    getHeavenHellGargoyleDemonId() {
        return Number(
          clientConfig?.heavenHell?.bonus?.symbols?.gargoyleDemon ??
          clientConfig?.symbolsMapping?.gargoyleDemon ??
          21
        );
      },

    getHeavenHellBossMultiplierGain() {
        // Client does not currently receive an explicit per-kill boss multiplier event.
        // Mirror the current server default so multiplier-demon orb budget stays aligned.
        return 2;
      },

    buildHeavenHellMultiplierOrbPlan(gameState = {}) {
        if (gameState?.isBonus !== true || !gameState?.heavenHell?.bonus) {
          return { allowedKeys: new Set(), totalBudget: 0 };
        }

        const orderedKills = [];
        const killMap = new Map();
        const multiplierDemonId = this.getHeavenHellMultiplierDemonId();
        const bossDemonId = this.getHeavenHellBossDemonId();
        const resolveKillFlags = (reel, row, flags = {}) => {
          const normalizedReel = Math.floor(Number(reel));
          const normalizedRow = Math.floor(Number(row));
          const spriteSymbolId = Number(this.reelSprites?.[normalizedReel]?.[normalizedRow]?.symbolKey);
          return {
            isMultiplierDemon: flags?.isMultiplierDemon === true || spriteSymbolId === multiplierDemonId,
            isBoss: flags?.isBoss === true || spriteSymbolId === bossDemonId
          };
        };
        const pushKill = (reel, row, {
          isMultiplierDemon = false,
          isBoss = false,
          abilityTriggered = false
        } = {}) => {
          const normalizedReel = Math.floor(Number(reel));
          const normalizedRow = Math.floor(Number(row));
          if (!Number.isFinite(normalizedReel) || !Number.isFinite(normalizedRow)) return;

          const key = `${normalizedReel},${normalizedRow}`;
          const resolvedFlags = resolveKillFlags(normalizedReel, normalizedRow, {
            isMultiplierDemon,
            isBoss
          });
          let entry = killMap.get(key);
          if (!entry) {
            entry = {
              key,
              reel: normalizedReel,
              row: normalizedRow,
              isMultiplierDemon: false,
              isBoss: false,
              abilityTriggered: false
            };
            killMap.set(key, entry);
            orderedKills.push(entry);
          }

          entry.isMultiplierDemon = entry.isMultiplierDemon || resolvedFlags.isMultiplierDemon === true;
          entry.isBoss = entry.isBoss || resolvedFlags.isBoss === true;
          entry.abilityTriggered = entry.abilityTriggered || abilityTriggered === true;
        };

        const heroPath = Array.isArray(gameState?.heroPath) ? gameState.heroPath : [];
        heroPath.forEach((step) => {
          const abilityTriggered =
            step?.divineChargeProc === true ||
            step?.divineStrikeProc === true ||
            step?.divineXProc === true;

          if (step?.banana === true) {
            const bananaTargets =
              Array.isArray(step?.eatenBananas) && step.eatenBananas.length > 0
                ? step.eatenBananas
                : [{ reel: step?.reel, row: step?.row }];
            bananaTargets.forEach((target) => {
              pushKill(target?.reel, target?.row, {
                isMultiplierDemon: target?.isMultiplierDemon === true,
                isBoss: target?.isBoss === true,
                abilityTriggered
              });
            });
          }

          const strikeTargets = Array.isArray(step?.divineStrikeTargets) ? step.divineStrikeTargets : [];
          strikeTargets.forEach((target) => {
            const hitCells = Array.isArray(target?.hitCells) ? target.hitCells : [];
            hitCells.forEach((cell) => {
              if (cell?.killed !== true) return;
              pushKill(cell?.reel, cell?.row, {
                isMultiplierDemon: cell?.isMultiplierDemon === true,
                isBoss: cell?.isBoss === true,
                abilityTriggered: true
              });
            });
          });

          const xTargets = Array.isArray(step?.divineXTargets) ? step.divineXTargets : [];
          xTargets.forEach((target) => {
            if (target?.killed !== true) return;
            pushKill(target?.reel, target?.row, {
              isMultiplierDemon: target?.isMultiplierDemon === true,
              isBoss: target?.isBoss === true,
              abilityTriggered: true
            });
          });
        });

        const startMultiplier = Math.max(
          1,
          Math.floor(Number(this.currentMultiplier ?? gameState?.multiplier ?? 1) || 1)
        );
        const finalMultiplier = Math.max(
          1,
          Math.floor(Number(gameState?.heavenHell?.bonus?.globalMultiplier ?? gameState?.multiplier ?? startMultiplier) || startMultiplier)
        );
        const pentagramAdded = Math.max(
          0,
          Math.floor(Number(gameState?.heavenHell?.bonus?.pentagram?.completionEventThisAction?.totalAdded ?? 0) || 0)
        );
        const bossGainTotal = orderedKills.reduce((sum, entry) => (
          entry.isBoss === true ? sum + this.getHeavenHellBossMultiplierGain() : sum
        ), 0);
        const totalBudget = Math.max(0, finalMultiplier - startMultiplier - pentagramAdded - bossGainTotal);

        const multiplierKills = orderedKills.filter((entry) => entry.isMultiplierDemon === true);
        const abilityMultiplierKills = multiplierKills.filter((entry) => entry.abilityTriggered === true);
        const baseMultiplierKills = multiplierKills.filter((entry) => entry.abilityTriggered !== true);
        const prioritizedKills = totalBudget <= abilityMultiplierKills.length
          ? abilityMultiplierKills
          : [...abilityMultiplierKills, ...baseMultiplierKills];
        const allowedKeys = new Set(
          prioritizedKills
            .slice(0, totalBudget)
            .map((entry) => entry.key)
        );

        return {
          allowedKeys,
          totalBudget
        };
      },

    prepareHeavenHellMultiplierOrbPlan(gameState = {}) {
        this._heavenHellMultiplierOrbPlan = this.buildHeavenHellMultiplierOrbPlan(gameState);
        return this._heavenHellMultiplierOrbPlan;
      },

    shouldConsumeHeavenHellMultiplierOrbAt(reel, row, { gameState = null, isMultiplierDemon = null } = {}) {
        const normalizedReel = Math.floor(Number(reel));
        const normalizedRow = Math.floor(Number(row));
        if (!Number.isFinite(normalizedReel) || !Number.isFinite(normalizedRow)) return false;

        const resolvedGameState = gameState || this._heavenHellActiveGameState;
        if (resolvedGameState?.isBonus !== true || !resolvedGameState?.heavenHell?.bonus) {
          return isMultiplierDemon === true;
        }

        const multiplierDemonId = this.getHeavenHellMultiplierDemonId();
        const sprite = this.reelSprites?.[normalizedReel]?.[normalizedRow];
        const spriteSymbolId = Number(sprite?.symbolKey);
        const isMultiplierKill = isMultiplierDemon === true || spriteSymbolId === multiplierDemonId;
        if (!isMultiplierKill) return false;

        const plan = this._heavenHellMultiplierOrbPlan || this.prepareHeavenHellMultiplierOrbPlan(resolvedGameState);
        const key = `${normalizedReel},${normalizedRow}`;
        if (!plan?.allowedKeys?.has(key)) {
          return false;
        }

        plan.allowedKeys.delete(key);
        return true;
      },

    dropHeavenHellMultiplierDemonOrb(x, y) {
        const orbSize = 12;
        const orbColors = [0x00D1CE, 0x1EFF90, 0x41E169, 0x00D1CE];
        this.dropEnergyOrbs?.(x, y, 1, orbSize, orbColors, 150, 600);
      },

    getHeavenHellChargeLootJitter(step = {}, { base = 18 } = {}) {
        const lootMultiplier = Math.max(1, Math.floor(Number(step?.divineChargeLootMultiplier ?? 1) || 1));
        if (lootMultiplier >= 10) return 18;
        if (lootMultiplier > 1) return 14;
        return base;
      },

    pushHeavenHellStepBananaLootCells(step = {}, pushLootCell = () => {}) {
        if (step?.banana !== true || typeof pushLootCell !== "function") return;
        const bananaTargets = Array.isArray(step?.eatenBananas) && step.eatenBananas.length > 0
          ? step.eatenBananas
          : [{ reel: step?.reel, row: step?.row }];
        bananaTargets.forEach((banana) => pushLootCell(banana?.reel, banana?.row));
      },

    playHeavenHellDemonDeathFx(reel, row, {
        center = null,
        intensity = 1,
        destroySprite = true,
        gameState = null,
        killWeight = null,
        divineXDoubleKill = false,
        isMultiplierDemon = null
      } = {}) {
        const target = center || this.getGridCellCenter(reel, row);
        const sprite = this.reelSprites?.[reel]?.[row];
        const power = Math.max(0.7, Math.min(2.2, Number(intensity) || 1));
        const resolvedGameState = gameState || this._heavenHellActiveGameState;
        const multiplierDemonId = this.getHeavenHellMultiplierDemonId();
        const symbolId = Number(sprite?.symbolKey);
        const isMultiplierDemonKill =
          resolvedGameState?.heavenHell?.bonus &&
          resolvedGameState?.isBonus === true &&
          (isMultiplierDemon === true || (Number.isFinite(symbolId) && symbolId === multiplierDemonId));
        if (isMultiplierDemonKill && this.shouldConsumeHeavenHellMultiplierOrbAt(reel, row, {
          gameState: resolvedGameState,
          isMultiplierDemon
        })) {
          this.dropHeavenHellMultiplierDemonOrb(target.x, target.y);
        }
    
        const hitSound = `banana_hit_${Phaser.Math.Between(1, 4)}`;
        this.playSfx?.(hitSound, { volume: Math.min(0.58, 0.24 + power * 0.12) });
        this.playSfx?.("freespin_smash_symbol_explosion_1", { volume: Math.min(0.78, 0.3 + power * 0.16) });
    
        const corpseShadow = this.add.ellipse(target.x, target.y + 28, 48 * power, 16 * power, 0x120000, 0.34)
          .setDepth(DEPTH_HERO + 42);
    
        const spatter = this.textures?.exists?.("helldive_demon_death_spatter")
          ? this.add.image(target.x, target.y + 4, "helldive_demon_death_spatter")
              .setDepth(DEPTH_HERO + 47)
              .setScale(0.38 * power)
              .setAlpha(0.96)
              .setAngle(Phaser.Math.Between(-28, 28))
          : this.add.circle(target.x, target.y, 18 * power, 0x8F0300, 0.72)
              .setDepth(DEPTH_HERO + 47);
        spatter.setBlendMode?.(Phaser.BlendModes.NORMAL);
    
        const fireBurst = this.add.circle(target.x, target.y, 16 * power, 0xFF4B22, 0.48)
          .setDepth(DEPTH_HERO + 48)
          .setBlendMode(Phaser.BlendModes.ADD);
        const soulFlash = this.add.circle(target.x, target.y - 12, 10 * power, 0xD6F5FF, 0.55)
          .setDepth(DEPTH_HERO + 50)
          .setBlendMode(Phaser.BlendModes.ADD);
        let divineXRing = null;
        let divineXGlow = null;
        let divineXLabel = null;
        if (divineXDoubleKill) {
          divineXRing = this.add.circle(target.x, target.y, 18 * power, 0xE14BFF, 0.24)
            .setDepth(DEPTH_HERO + 49)
            .setStrokeStyle(5, 0xFFD3FF, 0.96)
            .setBlendMode(Phaser.BlendModes.ADD)
            .setScale(0.42);
          divineXGlow = this.add.circle(target.x, target.y, 12 * power, 0xFF7BEF, 0.28)
            .setDepth(DEPTH_HERO + 48)
            .setBlendMode(Phaser.BlendModes.ADD)
            .setScale(0.36);
          divineXLabel = this.add.text(target.x, target.y - 26, "x2", {
            fontSize: "20px",
            fontFamily: '"Cinzel", "Times New Roman", serif',
            fontStyle: "bold",
            color: "#FFE8FF",
            stroke: "#4A1368",
            strokeThickness: 5
          }).setOrigin(0.5).setDepth(DEPTH_HERO + 56).setAlpha(0.94);
          fireBurst.setFillStyle?.(0xF24CFF, 0.62);
          soulFlash.setFillStyle?.(0xFFD8FF, 0.78);
        }
    
        this.tweens.add({
          targets: corpseShadow,
          scaleX: 1.55,
          alpha: 0,
          duration: 720,
          ease: "Sine.easeOut",
          onComplete: () => corpseShadow.destroy()
        });
        this.tweens.add({
          targets: spatter,
          scale: (spatter.scaleX || 1) * 1.42,
          alpha: 0,
          duration: 840,
          ease: "Cubic.easeOut",
          onComplete: () => spatter.destroy()
        });
        this.tweens.add({
          targets: fireBurst,
          scale: 3.5 * power,
          alpha: 0,
          duration: 330,
          ease: "Cubic.easeOut",
          onComplete: () => fireBurst.destroy()
        });
        this.tweens.add({
          targets: soulFlash,
          y: target.y - 70,
          scale: 2.1,
          alpha: 0,
          duration: 480,
          ease: "Sine.easeOut",
          onComplete: () => soulFlash.destroy()
        });
        if (divineXRing) {
          this.tweens.add({
            targets: divineXRing,
            scale: 3.2 * power,
            alpha: 0,
            duration: 360,
            ease: "Cubic.easeOut",
            onComplete: () => divineXRing.destroy()
          });
        }
        if (divineXGlow) {
          this.tweens.add({
            targets: divineXGlow,
            scale: 4.2 * power,
            alpha: 0,
            duration: 320,
            ease: "Cubic.easeOut",
            onComplete: () => divineXGlow.destroy()
          });
        }
        if (divineXLabel) {
          this.tweens.add({
            targets: divineXLabel,
            y: divineXLabel.y - 28,
            scaleX: 1.2,
            scaleY: 1.2,
            alpha: 0,
            duration: 520,
            ease: "Cubic.easeOut",
            onComplete: () => divineXLabel.destroy()
          });
        }
    
        for (let i = 0; i < 12; i++) {
          const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
          const distance = Phaser.Math.Between(24, 68) * power;
          const drop = this.add.circle(target.x, target.y, Phaser.Math.Between(2, 5) * power, i % 3 === 0 ? 0xFF4A21 : 0x9D0200, 0.84)
            .setDepth(DEPTH_HERO + 49)
            .setBlendMode(i % 3 === 0 ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL);
          this.tweens.add({
            targets: drop,
            x: target.x + Math.cos(angle) * distance,
            y: target.y + Math.sin(angle) * distance * 0.62,
            alpha: 0,
            scale: 0.22,
            duration: Phaser.Math.Between(260, 560),
            ease: "Cubic.easeOut",
            onComplete: () => drop.destroy()
          });
        }
    
        if (sprite && !sprite.destroyed) {
          const deathEcho = this.add.image(sprite.x, sprite.y, sprite.texture?.key || sprite.symbolKey)
            .setDepth((sprite.depth || DEPTH_SYMBOLS) + 3)
            .setScale(sprite.scaleX || 1, sprite.scaleY || 1)
            .setAlpha(0.54)
            .setTint(0xFF3A24)
            .setBlendMode(Phaser.BlendModes.ADD);
          this.tweens.add({
            targets: deathEcho,
            scaleX: (sprite.scaleX || 1) * 1.55,
            scaleY: (sprite.scaleY || 1) * 1.2,
            alpha: 0,
            duration: 260,
            ease: "Cubic.easeOut",
            onComplete: () => deathEcho.destroy()
          });
    
          this.tweens.killTweensOf(sprite);
          sprite.setTint?.(0xFF5338);
          this.tweens.add({
            targets: sprite,
            y: sprite.y - 12,
            scaleX: (sprite.scaleX || 1) * (1.2 + power * 0.12),
            scaleY: (sprite.scaleY || 1) * 0.68,
            angle: Phaser.Math.Between(-18, 18),
            duration: 105,
            ease: "Cubic.easeOut",
            onComplete: () => {
              this.tweens.add({
                targets: sprite,
                y: target.y + 18,
                scaleX: (sprite.scaleX || 1) * 0.52,
                scaleY: (sprite.scaleY || 1) * 0.16,
                alpha: 0,
                angle: sprite.angle + Phaser.Math.Between(-35, 35),
                duration: 190,
                ease: "Cubic.easeIn",
                onComplete: () => {
                  if (destroySprite && sprite && !sprite.destroyed) sprite.destroy();
                  if (destroySprite && this.reelSprites?.[reel]) this.reelSprites[reel][row] = null;
                }
              });
            }
          });
        }

        const isBonusKill = resolvedGameState?.heavenHell?.bonus && resolvedGameState?.isBonus === true;
        if (isBonusKill && this.shouldPlayHeavenHellBonusSoulCollectionFx?.()) {
          this.createHeavenHellBonusSoulCollectionFx?.({
            reel,
            row,
            center,
            intensity,
            divineXDoubleKill,
            gameState: resolvedGameState,
            killWeight
          });
        } else if (isBonusKill) {
          this.tickHeavenHellKillMeterOnKill(reel, row, resolvedGameState, { killWeight });
        } else {
          this.createHeavenHellSoulCollectionFx?.({
            reel,
            row,
            center,
            intensity,
            divineXDoubleKill,
            gameState: resolvedGameState
          });
        }
      },

    async playHeavenHellQueuedGargoyleEscapes(escapeEntries = [], gameState = null, { stepQuickStop = false } = {}) {
        const escapes = Array.isArray(escapeEntries) ? escapeEntries : [];
        if (escapes.length === 0) return;

        const animateOne = (escape) => new Promise((resolve) => {
          const reel = Number(escape?.reel);
          const row = Number(escape?.row);
          if (!Number.isFinite(reel) || !Number.isFinite(row)) {
            resolve();
            return;
          }

          const sprite = this.reelSprites?.[reel]?.[row] || null;
          if (this.reelSprites?.[reel]) {
            this.reelSprites[reel][row] = null;
          }
          if (!sprite || sprite.destroyed) {
            resolve();
            return;
          }

          const target = this.getGridCellCenter(reel, row);
          const escapeDuration = stepQuickStop ? 1 : 150;
          const driftX = stepQuickStop ? 0 : Phaser.Math.Between(-18, 18);
          const riseY = stepQuickStop ? 0 : Phaser.Math.Between(92, 118);
          const trailTexture = sprite.texture?.key || String(escape?.symbol || this.getHeavenHellGargoyleDemonId?.() || 21);

          this.tweens.killTweensOf(sprite);
          this.destroyBananaBackplate?.(sprite);
          sprite.setDepth(DEPTH_HERO + 45);

          const trail = this.add.image(target.x, target.y + 10, trailTexture)
            .setDepth(DEPTH_HERO + 44)
            .setScale((sprite.scaleX || 1) * 0.92, (sprite.scaleY || 1) * 0.92)
            .setAlpha(0.2)
            .setTint(0xCFEFFF);
          const shadow = this.add.ellipse(target.x, target.y + 30, 34, 12, 0x000000, 0.22)
            .setDepth(DEPTH_HERO + 40);

          let remainingTweens = 2;
          const finish = () => {
            remainingTweens -= 1;
            if (remainingTweens > 0) return;
            if (trail && !trail.destroyed) trail.destroy();
            if (shadow && !shadow.destroyed) shadow.destroy();
            if (!sprite.destroyed) sprite.destroy();
            resolve();
          };

          this.tweens.add({
            targets: sprite,
            x: target.x + driftX,
            y: target.y - riseY,
            alpha: 0,
            angle: stepQuickStop ? (sprite.angle || 0) : Phaser.Math.Between(-16, 16),
            scaleX: (sprite.scaleX || 1) * 0.82,
            scaleY: (sprite.scaleY || 1) * 0.82,
            duration: escapeDuration,
            ease: "Cubic.easeOut",
            onComplete: finish
          });
          const trailTweenConfig = {
            targets: [trail, shadow],
            alpha: 0,
            duration: escapeDuration,
            ease: "Quad.easeOut",
            onComplete: finish
          };
          if (!stepQuickStop) {
            trailTweenConfig.y = target.y - 10;
          }
          this.tweens.add(trailTweenConfig);
        });

        await Promise.all(escapes.map((escape) => animateOne(escape)));
      },

    playHeavenHellAngelStrikeSlash(from, to, { scale = 1, palette = "gold", gifEffect = null } = {}) {
        if (!from || !to) return;
        const midX = (from.x + to.x) * 0.5;
        const midY = (from.y + to.y) * 0.5;
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const distance = Math.max(1, Math.sqrt(dx * dx + dy * dy));
        const angle = Phaser.Math.RadToDeg(Math.atan2(dy, dx));
        const paletteKey = String(palette || "gold").toLowerCase();
        const paletteConfig = paletteKey === "divinex"
          ? {
              line: 0xFF9BF5,
              lineAlpha: 0.62,
              fallbackSlash: 0xFFD2FF,
              sparkA: 0xFF8BF1,
              sparkB: 0xFEE7FF,
              gifTint: 0xFF93F6
            }
          : paletteKey === "charge"
            ? {
                line: 0xDDF7FF,
                lineAlpha: 0.64,
                fallbackSlash: 0xF2FDFF,
                sparkA: 0xBFE9FF,
                sparkB: 0xFFF3C8,
                gifTint: 0xD7F6FF
              }
            : {
                line: 0xEFFFFF,
                lineAlpha: 0.55,
                fallbackSlash: 0xFFF4B0,
                sparkA: 0xFFF1A8,
                sparkB: 0xBFE9FF,
                gifTint: null
              };

        const strikeLine = this.add.rectangle(midX, midY, distance, 5 * scale, paletteConfig.line, paletteConfig.lineAlpha)
          .setDepth(DEPTH_HERO + 52)
          .setAngle(angle)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setScale(0.25, 1);
        this.tweens.add({
          targets: strikeLine,
          scaleX: 1,
          alpha: 0,
          duration: 170,
          ease: "Cubic.easeOut",
          onComplete: () => strikeLine.destroy()
        });

        const resolvedGifEffect = gifEffect || (
          paletteKey === "divinex"
            ? "attack2"
            : (Phaser.Math.Between(0, 1) === 0 ? "attack" : "attack2")
        );
        const gifScale = Phaser.Math.Clamp((distance / 170) * (paletteKey === "charge" ? 1.1 : 1), 0.74, 1.22) * scale;
        const gifSlash = this.playHeavenHellAttackGifBurst?.(resolvedGifEffect, midX, midY, {
          angle,
          scale: gifScale,
          depth: DEPTH_HERO + 53,
          alpha: 0.98,
          tint: paletteConfig.gifTint
        });
        if (!gifSlash) {
          const slash = this.textures?.exists?.("helldive_divine_strike_slash")
            ? this.add.image(midX, midY, "helldive_divine_strike_slash")
                .setDepth(DEPTH_HERO + 53)
                .setScale(0.5 * scale)
                .setAlpha(0.98)
                .setAngle(angle)
                .setBlendMode(Phaser.BlendModes.ADD)
            : this.add.rectangle(midX, midY, 150 * scale, 10 * scale, paletteConfig.fallbackSlash, 0.88)
                .setDepth(DEPTH_HERO + 53)
                .setAngle(angle)
                .setBlendMode(Phaser.BlendModes.ADD);
          if (paletteConfig.gifTint !== null && slash && typeof slash.setTint === "function") {
            slash.setTint(paletteConfig.gifTint);
          }
          this.tweens.add({
            targets: slash,
            scaleX: (slash.scaleX || 1) * 1.5,
            scaleY: (slash.scaleY || 1) * 1.14,
            alpha: 0,
            duration: 260,
            ease: "Cubic.easeOut",
            onComplete: () => slash.destroy()
          });
        }
    
        for (let i = 0; i < 10; i++) {
          const t = i / 9;
          const spark = this.add.circle(
            from.x + dx * t + Phaser.Math.Between(-8, 8),
            from.y + dy * t + Phaser.Math.Between(-8, 8),
            Phaser.Math.Between(2, 4) * scale,
            i % 2 === 0 ? paletteConfig.sparkA : paletteConfig.sparkB,
            0.75
          ).setDepth(DEPTH_HERO + 54).setBlendMode(Phaser.BlendModes.ADD);
          this.tweens.add({
            targets: spark,
            x: spark.x + Phaser.Math.Between(-16, 16),
            y: spark.y + Phaser.Math.Between(-16, 16),
            alpha: 0,
            scale: 0.2,
            duration: Phaser.Math.Between(180, 340),
            ease: "Sine.easeOut",
            onComplete: () => spark.destroy()
          });
        }
      },

    createHeavenHellDivineXCrossRays(center = null, { wave = 1 } = {}) {
        if (!center) return [];
        if (!Array.isArray(this.heavenHellDivineGroundFx)) {
          this.heavenHellDivineGroundFx = [];
        }

        const waveIndex = Math.max(1, Math.floor(Number(wave) || 1));
        const rayLength = 132 + waveIndex * 18;
        const rayThickness = 10 + Math.min(4, waveIndex);
        const beamA = this.add.rectangle(center.x, center.y, rayLength, rayThickness, 0xFF7BEF, 0.72)
          .setAngle(45)
          .setDepth(DEPTH_SYMBOLS + 16)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setScale(0.2, 0.3)
          .setAlpha(0);
        const beamB = this.add.rectangle(center.x, center.y, rayLength, rayThickness, 0xFFC7FF, 0.76)
          .setAngle(-45)
          .setDepth(DEPTH_SYMBOLS + 17)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setScale(0.2, 0.3)
          .setAlpha(0);
        const glowA = this.add.rectangle(center.x, center.y, rayLength * 1.12, rayThickness * 1.8, 0xFF53E3, 0.18)
          .setAngle(45)
          .setDepth(DEPTH_SYMBOLS + 15)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setScale(0.18, 0.22)
          .setAlpha(0);
        const glowB = this.add.rectangle(center.x, center.y, rayLength * 1.12, rayThickness * 1.8, 0xFF98FA, 0.18)
          .setAngle(-45)
          .setDepth(DEPTH_SYMBOLS + 15)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setScale(0.18, 0.22)
          .setAlpha(0);
        const core = this.add.circle(center.x, center.y, 10 + waveIndex, 0xFFF0FF, 0.34)
          .setDepth(DEPTH_SYMBOLS + 18)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setScale(0.2)
          .setAlpha(0);
        const fxParts = [glowA, glowB, beamA, beamB, core];
        this.heavenHellDivineGroundFx.push(...fxParts);

        this.tweens.add({
          targets: [beamA, beamB],
          alpha: 0.96,
          scaleX: 1.08,
          scaleY: 1,
          duration: 120,
          ease: "Cubic.easeOut"
        });
        this.tweens.add({
          targets: [glowA, glowB],
          alpha: 0.34,
          scaleX: 1.18,
          scaleY: 1.06,
          duration: 150,
          ease: "Cubic.easeOut"
        });
        this.tweens.add({
          targets: core,
          alpha: 0.88,
          scale: 1.4,
          duration: 130,
          ease: "Back.easeOut"
        });

        this.time.delayedCall(150 + waveIndex * 24, () => {
          const activeFx = fxParts.filter((fx) => fx && !fx.destroyed);
          if (activeFx.length === 0) return;
          this.tweens.add({
            targets: [beamA, beamB, glowA, glowB, core],
            alpha: 0,
            duration: 320 + waveIndex * 28,
            ease: "Sine.easeOut",
            onComplete: () => {
              activeFx.forEach((fx) => {
                if (fx && !fx.destroyed) fx.destroy();
              });
            }
          });
          this.tweens.add({
            targets: [beamA, beamB],
            scaleX: 1.42,
            duration: 320,
            ease: "Sine.easeOut"
          });
          this.tweens.add({
            targets: [glowA, glowB],
            scaleX: 1.68,
            duration: 340,
            ease: "Sine.easeOut"
          });
          this.tweens.add({
            targets: core,
            scale: 2,
            duration: 280,
            ease: "Sine.easeOut"
          });
        });

        return fxParts;
      },

    createHeavenHellDivineStrikeGroundGlitter(center = null, { wave = 0, intensity = 1 } = {}) {
        if (!center) return [];
        if (!Array.isArray(this.heavenHellDivineGroundFx)) {
          this.heavenHellDivineGroundFx = [];
        }

        const waveIndex = Math.max(0, Math.floor(Number(wave) || 0));
        const sparkleCount = Math.max(5, 7 + waveIndex + Math.floor(Number(intensity) || 0));
        const sparkleRadius = 20 + waveIndex * 4 + Math.max(0, Number(intensity) || 0) * 3;
        const sparkles = [];

        for (let index = 0; index < sparkleCount; index += 1) {
          const angle = (Math.PI * 2 * index) / sparkleCount;
          const radius = Phaser.Math.Between(Math.max(12, sparkleRadius - 12), sparkleRadius + 6);
          const sparkle = this.add.circle(
            center.x + Math.cos(angle) * radius,
            center.y + Math.sin(angle) * radius * 0.82,
            Phaser.Math.FloatBetween(1.8, 3.8),
            index % 2 === 0 ? 0xFFF8DC : 0xFFE89A,
            0
          )
            .setDepth(DEPTH_SYMBOLS + 16)
            .setBlendMode(Phaser.BlendModes.ADD)
            .setScale(0.2);
          sparkles.push(sparkle);
        }

        this.heavenHellDivineGroundFx.push(...sparkles);
        sparkles.forEach((sparkle, index) => {
          const rise = Phaser.Math.Between(4, 12);
          this.tweens.add({
            targets: sparkle,
            alpha: 0.82,
            scale: Phaser.Math.FloatBetween(0.85, 1.35),
            delay: index * 28,
            duration: 180,
            yoyo: true,
            repeat: 2,
            ease: "Sine.easeInOut"
          });
          this.tweens.add({
            targets: sparkle,
            y: sparkle.y - rise,
            delay: index * 28,
            duration: 620 + waveIndex * 70,
            ease: "Sine.easeOut",
            onComplete: () => {
              if (!sparkle.destroyed) {
                sparkle.destroy();
              }
            }
          });
        });

        return sparkles;
      },

    getHeavenHellRandomAbilitySwingSfxKey() {
        return Math.random() < 0.5 ? "swing_1" : "swing_2";
      },

    playHeavenHellDivineXImpactSound({ impactLeadMs = 0, volume = 0.6 } = {}) {
        const impactOffsetSeconds = 1.5;
        const leadMs = Math.max(0, Number(impactLeadMs) || 0);
        const seek = Math.max(0, impactOffsetSeconds - (leadMs / 1000));
        this.playSfx?.("divine_x_impact", { volume, seek }, { allowDuringFastForward: false });
      },

    async playHeavenHellDivineChargeWindup(step = {}, { stepQuickStop = false } = {}) {
        if (stepQuickStop || step?.divineChargeProc !== true) return false;
        if (!this.heroSprite || this.heroSprite.destroyed) return false;
    
        const heroX = Number(this.heroSprite.x);
        const heroY = Number(this.heroSprite.y);
        const heroBaseScaleX = Number(this.heroSprite.scaleX || 1);
        const heroBaseScaleY = Number(this.heroSprite.scaleY || heroBaseScaleX || 1);
        const chargeText = this.add.text(heroX, heroY - 78, "DIVINE CHARGE", {
          fontSize: "20px",
          fontFamily: '"Cinzel", "Times New Roman", serif',
          fontStyle: "bold",
          color: "#FFF6C7",
          stroke: "#210B00",
          strokeThickness: 5
        }).setOrigin(0.5).setDepth(DEPTH_HERO + 42).setAlpha(0);
        this.tweens.add({ targets: chargeText, alpha: 1, y: heroY - 96, duration: 220, ease: "Sine.easeOut" });

        const chargeDurationMs = 2000;
        const chargeObjects = [];
        const createChargeGradientOrb = (x, y, radius, {
          outerColor = 0x7FDBFF,
          midColor = 0xBFE9FF,
          innerColor = 0xF2FBFF,
          outerAlpha = 0.34,
          midAlpha = 0.6,
          innerAlpha = 0.92,
          depth = DEPTH_HERO + 33
        } = {}) => {
          const orb = this.add.container(x, y).setDepth(depth);
          const outer = this.add.circle(0, 0, radius * 1.8, outerColor, outerAlpha)
            .setBlendMode(Phaser.BlendModes.ADD);
          const mid = this.add.circle(0, 0, radius * 1.2, midColor, midAlpha)
            .setBlendMode(Phaser.BlendModes.ADD);
          const inner = this.add.circle(0, 0, radius * 0.68, innerColor, innerAlpha)
            .setBlendMode(Phaser.BlendModes.ADD);
          orb.add([outer, mid, inner]);
          return orb;
        };
        const chargeGlow = this.add.circle(heroX, heroY, 20, 0xF4E6A4, 0.24)
          .setDepth(DEPTH_HERO + 31)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setScale(0.75);
        const chargeCore = createChargeGradientOrb(heroX, heroY, 11, {
          outerColor: 0x8BDEFF,
          midColor: 0xD5F3FF,
          innerColor: 0xFFFFFF,
          outerAlpha: 0.3,
          midAlpha: 0.72,
          innerAlpha: 0.88,
          depth: DEPTH_HERO + 34
        }).setScale(0.48);
        const chargeHalo = this.add.circle(heroX, heroY, 30, 0xBFE9FF, 0.18)
          .setDepth(DEPTH_HERO + 30)
          .setStrokeStyle(3, 0xFFF1B8, 0.5)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setScale(0.58);
        const chargeBacklight = this.add.circle(heroX, heroY + 4, 42, 0x7FDBFF, 0.1)
          .setDepth(DEPTH_HERO + 29)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setScale(0.4, 0.32);
        chargeObjects.push(chargeGlow, chargeCore, chargeHalo, chargeBacklight);

        this.tweens.add({
          targets: chargeGlow,
          scale: 1.95,
          alpha: 0.52,
          duration: chargeDurationMs,
          ease: "Cubic.easeIn"
        });
        this.tweens.add({
          targets: chargeCore,
          scale: 2.55,
          alpha: 0.78,
          duration: chargeDurationMs,
          ease: "Cubic.easeIn"
        });
        this.tweens.add({
          targets: chargeHalo,
          scale: 1.72,
          alpha: 0.62,
          duration: chargeDurationMs,
          ease: "Sine.easeInOut"
        });
        this.tweens.add({
          targets: chargeHalo,
          angle: 120,
          duration: chargeDurationMs,
          ease: "Sine.easeInOut"
        });
        this.tweens.add({
          targets: chargeBacklight,
          scaleX: 1.5,
          scaleY: 1.18,
          alpha: 0.28,
          duration: chargeDurationMs,
          ease: "Cubic.easeIn"
        });

        if (!this.heroSprite.destroyed) {
          this.tweens.add({
            targets: this.heroSprite,
            scaleX: heroBaseScaleX * 1.06,
            scaleY: heroBaseScaleY * 1.06,
            duration: chargeDurationMs,
            ease: "Cubic.easeIn"
          });
        }

        for (let i = 0; i < 12; i++) {
          const angle = (Math.PI * 2 * i) / 12;
          const startRadius = 16 + (i % 3) * 6;
          const sparkRadius = Phaser.Math.FloatBetween(2.6, 4.2);
          const spark = i % 3 === 1
            ? createChargeGradientOrb(
              heroX + Math.cos(angle) * startRadius,
              heroY + Math.sin(angle) * startRadius * 0.82,
              sparkRadius,
              {
                outerColor: 0x59CFFF,
                midColor: 0xB9EEFF,
                innerColor: 0xF7FDFF,
                outerAlpha: 0.28,
                midAlpha: 0.56,
                innerAlpha: 0.82
              }
            )
            : this.add.circle(
              heroX + Math.cos(angle) * startRadius,
              heroY + Math.sin(angle) * startRadius * 0.82,
              sparkRadius,
              i % 2 === 0 ? 0xFFF0A8 : 0xBFE9FF,
              0.82
            )
              .setDepth(DEPTH_HERO + 33)
              .setBlendMode(Phaser.BlendModes.ADD);
          chargeObjects.push(spark);
          this.tweens.add({
            targets: spark,
            x: heroX + Math.cos(angle) * Phaser.Math.Between(38, 54),
            y: heroY + Math.sin(angle) * Phaser.Math.Between(28, 42),
            alpha: 0.18,
            scale: Phaser.Math.FloatBetween(1.4, 1.9),
            delay: i * 28,
            duration: chargeDurationMs - 80,
            ease: "Cubic.easeIn"
          });
        }

        this.playSfx?.("divine_charge_windup", { volume: 0.56 }, { allowDuringFastForward: false });
        this.time.delayedCall(520, () => {
          if (stepQuickStop) return;
          this.playSfx?.("freespin_orb_appear", { volume: 0.16, rate: 0.86 });
        });

        await this.waitForPresentation(chargeDurationMs, { skippable: true });
        chargeObjects.forEach((obj) => {
          if (!obj || obj.destroyed) return;
          this.tweens.killTweensOf(obj);
          obj.destroy();
        });
        if (this.heroSprite && !this.heroSprite.destroyed) {
          this.tweens.killTweensOf(this.heroSprite);
          this.heroSprite.setScale(heroBaseScaleX, heroBaseScaleY);
        }

        this.playSfx?.(this.getHeavenHellRandomAbilitySwingSfxKey?.() || "attack_swing", { volume: 0.48 });
        const launchBurst = this.add.circle(heroX, heroY, 18, 0xDDF7FF, 0.72)
          .setDepth(DEPTH_HERO + 44)
          .setBlendMode(Phaser.BlendModes.ADD);
        this.tweens.add({
          targets: launchBurst,
          scale: 3.8,
          alpha: 0,
          duration: 280,
          ease: "Cubic.easeOut",
          onComplete: () => launchBurst.destroy()
        });
        this.tweens.add({
          targets: chargeText,
          alpha: 0,
          y: chargeText.y - 20,
          duration: 220,
          ease: "Sine.easeOut",
          onComplete: () => chargeText.destroy()
        });
        return true;
      },

    spawnHeavenHellChargeLaunchTrails(fromX, fromY, toX, toY, {
        heroScale = 1,
        ghostTint = 0xBFE9FF,
        trailTint = 0xFFFFFF,
        curvePointAt = null,
        trailDurationMs = null,
        fadeDurationMs = 220,
        trailCountScale = 1,
        spawnLingerDots = false,
        lingerDotTints = [0xFF5588, 0xFF2244],
        lingerDotBlendMode = Phaser.BlendModes.ADD,
        lingerDotFadeMs = 560,
        ghostBlendMode = Phaser.BlendModes.ADD,
        trailBlendMode = Phaser.BlendModes.ADD,
        depthBase = DEPTH_HERO + 39,
        useSoulOrbGhost = false
      } = {}) {
        const dx = toX - fromX;
        const dy = toY - fromY;
        const distance = Math.max(1, Math.sqrt(dx * dx + dy * dy));
        const trailCount = Math.min(
          22,
          Math.max(5, Math.floor((distance / 38) * Math.max(0.5, Number(trailCountScale) || 1)))
        );
        const angelTextureKey = this.getHeavenHellHeroTextureKey?.(HERO_STAGE_TEXTURE_KEYS.rush) || HERO_STAGE_TEXTURE_KEYS.base;
        const resolvedFadeMs = Math.max(120, Math.floor(Number(fadeDurationMs) || 220));
        const resolvedLingerFadeMs = Math.max(resolvedFadeMs, Math.floor(Number(lingerDotFadeMs) || 560));
        const staggerMs = trailDurationMs
          ? Math.max(10, Math.floor(trailDurationMs / (trailCount + 2)))
          : 12;
        const resolvePoint = (t) => {
          if (typeof curvePointAt === "function") {
            const point = curvePointAt(t);
            const prev = curvePointAt(Math.max(0, t - 0.05));
            return {
              x: point.x,
              y: point.y,
              angle: Math.atan2(point.y - prev.y, point.x - prev.x)
            };
          }
          return {
            x: fromX + dx * t,
            y: fromY + dy * t,
            angle: Math.atan2(dy, dx)
          };
        };

        for (let i = 1; i <= trailCount; i++) {
          const t = i / (trailCount + 1);
          this.time.delayedCall(i * staggerMs, () => {
            const point = resolvePoint(t);
            const trailPoint = resolvePoint(Math.max(0, t - 0.04));
            const trail = this.textures?.exists?.("helldive_angel_trail")
              ? this.add.image(trailPoint.x, trailPoint.y, "helldive_angel_trail")
                  .setDepth(depthBase)
                  .setScale(0.56 + t * 0.34)
                  .setAlpha(0.5 * (1 - t * 0.3))
                  .setTint(trailTint)
                  .setBlendMode(trailBlendMode)
              : null;
            if (trail) trail.setRotation(point.angle);
            const ghost = useSoulOrbGhost
              ? this.add.circle(point.x, point.y, Phaser.Math.FloatBetween(6, 9) + t * 4, ghostTint, 0.82)
                  .setDepth(depthBase + 1)
                  .setBlendMode(ghostBlendMode)
              : this.add.image(point.x, point.y, angelTextureKey)
                  .setDepth(depthBase + 1)
                  .setScale(heroScale * (1.06 - t * 0.3))
                  .setAlpha(0.48 * (1 - t * 0.42))
                  .setTint(ghostTint)
                  .setBlendMode(ghostBlendMode);
            this.tweens.add({
              targets: ghost,
              alpha: 0,
              scale: (ghost.scaleX || 1) * 1.32,
              duration: resolvedFadeMs,
              ease: "Sine.easeOut",
              onComplete: () => ghost.destroy()
            });
            if (trail) {
              this.tweens.add({
                targets: trail,
                alpha: 0,
                scale: trail.scaleX * 1.4,
                duration: resolvedFadeMs,
                ease: "Sine.easeOut",
                onComplete: () => trail.destroy()
              });
            }
            if (spawnLingerDots) {
              const dotTint = lingerDotTints[i % lingerDotTints.length] ?? 0xFF5588;
              const dotX = point.x + Phaser.Math.FloatBetween(-6, 6);
              const dotY = point.y + Phaser.Math.FloatBetween(-6, 6);
              const dotRadius = Phaser.Math.FloatBetween(3.6, 7.2);
              const lingerDot = this.add.circle(
                dotX,
                dotY,
                dotRadius,
                dotTint,
                Phaser.Math.FloatBetween(0.78, 0.96)
              )
                .setDepth(depthBase - 0.02)
                .setBlendMode(lingerDotBlendMode);
              this.tweens.add({
                targets: lingerDot,
                scale: Phaser.Math.FloatBetween(0.35, 0.62),
                alpha: 0,
                duration: resolvedLingerFadeMs + Phaser.Math.Between(0, 180),
                ease: "Sine.easeOut",
                onComplete: () => lingerDot.destroy()
              });
              if (lingerDotBlendMode === Phaser.BlendModes.NORMAL) {
                const accentDot = this.add.circle(
                  dotX,
                  dotY,
                  dotRadius * 0.55,
                  0xFF6688,
                  Phaser.Math.FloatBetween(0.35, 0.55)
                )
                  .setDepth(depthBase + 0.01)
                  .setBlendMode(Phaser.BlendModes.ADD);
                this.tweens.add({
                  targets: accentDot,
                  scale: 0.2,
                  alpha: 0,
                  duration: resolvedLingerFadeMs * 0.72,
                  ease: "Sine.easeOut",
                  onComplete: () => accentDot.destroy()
                });
              }
            }
          });
        }
      },

    async playHeavenHellDivineChargeImpact(step = {}, gameState = {}, targetCenter = null, { waitForLootDrop = true } = {}) {
        if (step?.divineChargeProc !== true) return;
        const reel = Math.floor(Number(step?.reel));
        const row = Math.floor(Number(step?.row));
        if (!Number.isFinite(reel) || !Number.isFinite(row)) return;
        const target = targetCenter || this.getGridCellCenter(reel, row);
        const heroX = Number(this.heroSprite?.x || target.x);
        const heroY = Number(this.heroSprite?.y || target.y);
    
        this.playSfx?.("divine_charge_impact", { volume: 0.72 }, { allowDuringFastForward: false });
        this.playSfx?.("finisher_sword", { volume: 0.46 });
        this.playHeavenHellAngelStrikeSlash?.({ x: heroX, y: heroY }, target, {
          scale: 1.22,
          palette: "charge",
          gifEffect: "attack2"
        });
        this.cameras?.main?.shake?.(280, 0.011);
        const splash = this.textures?.exists?.("helldive_demon_splash")
          ? this.add.image(target.x, target.y, "helldive_demon_splash").setScale(0.5).setAlpha(0.96).setDepth(DEPTH_HERO + 49).setBlendMode(Phaser.BlendModes.ADD)
          : null;
        const impact = this.add.circle(target.x, target.y, 20, 0xFFF1AD, 0.95)
          .setDepth(DEPTH_HERO + 48)
          .setBlendMode(Phaser.BlendModes.ADD);
        const shock = this.add.circle(target.x, target.y, 34, 0xFF3A24, 0.24)
          .setDepth(DEPTH_HERO + 47)
          .setBlendMode(Phaser.BlendModes.ADD);
        if (splash) this.tweens.add({ targets: splash, scale: 1.4, angle: Phaser.Math.Between(-30, 30), alpha: 0, duration: 380, ease: "Cubic.easeOut", onComplete: () => splash.destroy() });
        this.tweens.add({ targets: impact, scale: 4.6, alpha: 0, duration: 320, ease: "Cubic.easeOut", onComplete: () => impact.destroy() });
        this.tweens.add({ targets: shock, scale: 3.4, alpha: 0, duration: 420, ease: "Cubic.easeOut", onComplete: () => shock.destroy() });
    
        void this.playMonkeyLevelUpRingBurst(
          { reel, row, heroFootprintSize: this.currentHeroFootprintSize },
          {
            heroFootprintSize: this.currentHeroFootprintSize,
            intensity: "medium",
            preferHeroSprite: false,
            durationMs: 560,
            radialScale: 0.72
          }
        ).catch(() => {});
    
        const lootMultiplier = Math.max(1, Math.floor(Number(step?.divineChargeLootMultiplier ?? 1) || 1));
        const lootDropPromise = this.playHeavenHellLootDropPattern(gameState, {
          source: "divineCharge",
          from: { x: target.x, y: target.y - 70 },
          jitterStrength: lootMultiplier >= 10 ? 18 : 14,
          filterCells: [{ reel, row }],
          persistToGround: true
        });
        if (waitForLootDrop) {
          await lootDropPromise;
        } else {
          this.trackHeavenHellPendingGroundPresentation(lootDropPromise, { kind: "loot" });
        }
      },

    async playHeavenHellDivineChargeSequence(gameState = {}) {
        if (gameState?.heavenHell?.bonus && gameState?.isBonus === true) {
          this._heavenHellActiveGameState = gameState;
        }
      },

    createHeavenHellLootValueLabel(x, y, value, {
        prefix = "",
        depth = DEPTH_HERO + 56,
        fontSize = "20px",
        scale = 0.76,
        rise = 44,
        duration = 1600,
        fadeDelay = 320,
        alpha = 1,
        driftX = 0,
        driftY = 0
      } = {}) {
        const numericValue = Math.max(0, Number(value) || 0);
        if (numericValue <= 0) return null;
    
        const label = this.add.text(
          Number(x) + Number(driftX || 0),
          Number(y) + Number(driftY || 0),
          `${prefix}${this.formatBonusEndBoardValue(numericValue)}`,
          {
            fontSize,
            fontFamily: '"Cinzel", "Times New Roman", serif',
            fontStyle: "bold",
            color: "#FFF4B8",
            stroke: "#4A2A00",
            strokeThickness: 4
          }
        ).setOrigin(0.5).setDepth(depth).setScale(scale).setAlpha(alpha);
        label.setShadow(0, 3, "#1A0B00", 10, true, true);
    
        this.tweens.add({
          targets: label,
          scaleX: Math.max(1.16, scale * 1.5),
          scaleY: Math.max(1.16, scale * 1.5),
          y: label.y - rise,
          duration,
          ease: "Cubic.easeOut",
        });

        this.tweens.add({
          targets: label,
          alpha: 0,
          delay: Math.max(0, Math.min(duration - 80, Number(fadeDelay) || 0)),
          duration: Math.max(120, duration - Math.max(0, Math.min(duration - 80, Number(fadeDelay) || 0))),
          ease: "Sine.easeOut",
          onComplete: () => label.destroy()
        });
    
        return label;
      },

    createHeavenHellAbilityImpactLabel(x, y, text, {
        depth = DEPTH_HERO + 56,
        fontSize = "19px",
        scale = 0.72,
        rise = 38,
        duration = 820,
        alpha = 0.98,
        driftX = 0,
        driftY = 0,
        color = "#F8E9FF",
        stroke = "#3B124F",
        shadow = "#1A071F"
      } = {}) {
        const labelText = String(text || "").trim();
        if (!labelText) return null;

        const label = this.add.text(
          Number(x) + Number(driftX || 0),
          Number(y) + Number(driftY || 0),
          labelText,
          {
            fontSize,
            fontFamily: '"Cinzel", "Times New Roman", serif',
            fontStyle: "bold",
            color,
            stroke,
            strokeThickness: 5
          }
        ).setOrigin(0.5).setDepth(depth).setScale(scale).setAlpha(alpha);
        label.setShadow(0, 3, shadow, 10, true, true);

        this.tweens.add({
          targets: label,
          scaleX: Math.max(1.05, scale * 1.34),
          scaleY: Math.max(1.05, scale * 1.34),
          y: label.y - rise,
          alpha: 0,
          duration,
          ease: "Cubic.easeOut",
          onComplete: () => label.destroy()
        });

        return label;
      },

    getHeavenHellTriggeredStepAbilities(step = {}) {
        const ordered = [];
        if (step?.divineXProc === true) ordered.push("divineX");
        if (step?.divineChargeProc === true) ordered.push("divineCharge");
        if (step?.divineStrikeProc === true) ordered.push("divineStrike");
        return ordered;
      },

    getHeavenHellComboAbilityBadgeLabel(abilityKey = "") {
        if (abilityKey === "divineX") return "X";
        if (abilityKey === "divineCharge") return "CHARGE";
        if (abilityKey === "divineStrike") return "STRIKE";
        return this.getHeavenHellChestTickerLabel?.(abilityKey) || String(abilityKey || "").toUpperCase();
      },

    createHeavenHellGradientLetterRow(x, y, text, colors = [], {
        depth = DEPTH_HERO + 58,
        fontSize = "16px",
        stroke = "#2B0C0C",
        strokeThickness = 4,
        letterSpacing = 1
      } = {}) {
        const chars = Array.from(String(text || ""));
        if (chars.length === 0) return [];

        const palette = Array.isArray(colors) && colors.length > 0
          ? colors.map((color) => Phaser.Display.Color.IntegerToRGB(Number(color) || 0xFFFFFF))
          : [Phaser.Display.Color.IntegerToRGB(0xFFFFFF)];
        const totalSteps = Math.max(1, chars.filter((char) => char !== " ").length - 1);
        let paintedIndex = 0;
        const letters = chars.map((char) => {
          const isSpace = char === " ";
          let fillHex = "#FFFFFF";
          if (!isSpace) {
            const progress = totalSteps <= 0 ? 0 : paintedIndex / totalSteps;
            const scaled = progress * Math.max(0, palette.length - 1);
            const leftIndex = Math.floor(scaled);
            const rightIndex = Math.min(palette.length - 1, leftIndex + 1);
            const mix = scaled - leftIndex;
            const left = palette[leftIndex];
            const right = palette[rightIndex];
            const r = Math.round(left.r + (right.r - left.r) * mix);
            const g = Math.round(left.g + (right.g - left.g) * mix);
            const b = Math.round(left.b + (right.b - left.b) * mix);
            fillHex = Phaser.Display.Color.RGBToString(r, g, b, 0, "#");
            paintedIndex += 1;
          }

          return this.add.text(0, 0, char, {
            fontSize,
            fontFamily: '"Cinzel", "Times New Roman", serif',
            fontStyle: "bold",
            color: fillHex,
            stroke,
            strokeThickness
          }).setOrigin(0.5).setDepth(depth);
        });

        let width = 0;
        letters.forEach((letter, index) => {
          width += Number(letter.width || 0);
          if (index < letters.length - 1) {
            width += letterSpacing;
          }
        });

        let cursorX = Number(x) - width * 0.5;
        letters.forEach((letter, index) => {
          const letterWidth = Number(letter.width || 0);
          letter.setPosition(cursorX + letterWidth * 0.5, Number(y));
          cursorX += letterWidth;
          if (index < letters.length - 1) {
            cursorX += letterSpacing;
          }
        });

        return letters;
      },

    playHeavenHellAbilityComboPopup(step = {}, anchor = null, { stepQuickStop = false } = {}) {
        if (stepQuickStop) return null;
        const triggeredAbilities = this.getHeavenHellTriggeredStepAbilities?.(step) || [];
        if (triggeredAbilities.length < 2) return null;

        const originX = Number(anchor?.x ?? this.heroSprite?.x ?? 0);
        const originY = Number(anchor?.y ?? this.heroSprite?.y ?? 0);
        const comboColors = triggeredAbilities.map((abilityKey) => {
          const palette = this.getHeavenHellChestRewardPalette?.(abilityKey, null);
          return Number(palette?.fill || 0xFFFFFF);
        });
        const titleLetters = this.createHeavenHellGradientLetterRow?.(originX, originY - 74, "COMBO STRIKE!", comboColors, {
          depth: DEPTH_HERO + 58,
          fontSize: "17px",
          stroke: "#22070F",
          strokeThickness: 4,
          letterSpacing: 1
        }) || [];

        const popupParts = [...titleLetters].filter(Boolean);
        popupParts.forEach((part) => {
          part.setAlpha?.(0);
          part.setScale?.(0.92);
        });

        this.tweens.add({
          targets: popupParts,
          alpha: 1,
          scaleX: 1,
          scaleY: 1,
          duration: 110,
          ease: "Sine.easeOut"
        });
        this.tweens.add({
          targets: popupParts,
          y: "-=12",
          alpha: 0,
          delay: 620,
          duration: 680,
          ease: "Sine.easeIn",
          onComplete: () => {
            popupParts.forEach((part) => {
              if (part && !part.destroyed) {
                part.destroy();
              }
            });
          }
        });

        return popupParts;
      },

    async playHeavenHellLootDropPattern(gameState = {}, { source = null, from = null, jitterStrength = 6, filterCells = null, persistToGround = false, launchFromDropCell = false } = {}) {
        const drops = Array.isArray(gameState?.heavenHell?.bonus?.lootGround)
          ? gameState.heavenHell.bonus.lootGround
          : [];
        let scoped = drops.map((entry, index) => ({ entry, index }));
        if (Array.isArray(filterCells) && filterCells.length > 0) {
          const cellKeys = new Set(filterCells.map((cell) => `${Math.floor(Number(cell?.reel))},${Math.floor(Number(cell?.row))}`));
          scoped = scoped.filter(({ entry }) => cellKeys.has(`${Math.floor(Number(entry?.reel))},${Math.floor(Number(entry?.row))}`));
        } else if (source) {
          scoped = scoped.filter(({ entry }) => entry?.source === source);
        }
        scoped = scoped.filter(({ entry, index }) => !this.isHeavenHellLootDropRendered(entry, index));
        if (scoped.length === 0) return;
    
        const fallbackStartX = Number(from?.x || (GRID_OFFSET_X + (clientConfig.area.width * 70) * 0.5));
        const fallbackStartY = Number(from?.y || (GRID_OFFSET_Y - 40));
        const maxDrops = Math.min(28, scoped.length);
        const promises = [];
    
        for (let i = 0; i < maxDrops; i++) {
          const drop = scoped[i].entry;
          const dropIndex = scoped[i].index;
          const reel = Math.floor(Number(drop?.reel));
          const row = Math.floor(Number(drop?.row));
          if (!Number.isFinite(reel) || !Number.isFinite(row)) continue;
    
          const target = this.getGridCellCenter(reel, row);
          const launchPoint = launchFromDropCell
            ? target
            : { x: fallbackStartX, y: fallbackStartY };
          const startX = Number(launchPoint?.x || fallbackStartX);
          const startY = Number(launchPoint?.y || fallbackStartY);
          const token = this.createHeavenHellLootToken(startX, startY, drop, dropIndex, {
            scale: this.getHeavenHellLootTokenScale(drop, { ground: false })
          });
          token.setDepth(DEPTH_HERO + 55);
          token.setAlpha(0);
          token.setAngle(Phaser.Math.Between(-18, 18));
          if (persistToGround) {
            this.registerHeavenHellLootSprite(token, drop, dropIndex);
          }
    
          const shadow = this.add.ellipse(startX, startY + 16, 22, 8, 0x000000, 0)
            .setDepth(DEPTH_HERO + 33);
    
          const p = new Promise((resolve) => {
            this.time.delayedCall(i * 66, () => {
              const hasStoredOffsets = Number.isFinite(Number(drop?.offsetX)) && Number.isFinite(Number(drop?.offsetY));
              const jitterX = hasStoredOffsets
                ? 0
                : Phaser.Math.Between(-Math.max(0, jitterStrength), Math.max(0, jitterStrength));
              const jitterY = hasStoredOffsets
                ? 0
                : Phaser.Math.Between(-Math.max(0, Math.floor(jitterStrength * 0.7)), Math.max(0, Math.floor(jitterStrength * 0.7)));
              const storedPosition = this.getHeavenHellLootGroundPosition(drop, dropIndex);
              const landX = hasStoredOffsets ? storedPosition.x : target.x + (((dropIndex % 3) - 1) * 5) + jitterX;
              const landY = hasStoredOffsets ? storedPosition.y : target.y + 14 + ((((dropIndex / 3) | 0) % 2) * 4) + jitterY;
              const arcPeakY = Math.min(startY, landY) - Phaser.Math.Between(72, 116);
              const controlX = (startX + landX) * 0.5 + Phaser.Math.Between(-42, 42);
              const flightMs = Phaser.Math.Between(420, 540);
              const launchScaleX = token.scaleX || 1;
              const launchScaleY = token.scaleY || 1;
              const flight = { t: 0 };
    
              this.playHeavenHellLootLandSfx?.(i, { soft: true, drop });
              this.tweens.add({ targets: token, alpha: 1, duration: 70, ease: "Sine.easeOut" });
              this.tweens.add({
                targets: shadow,
                alpha: 0.24,
                x: landX,
                y: landY + 16,
                scaleX: 1.24,
                scaleY: 0.82,
                duration: flightMs,
                ease: "Sine.easeIn"
              });
              this.tweens.add({
                targets: flight,
                t: 1,
                duration: flightMs,
                ease: "Sine.easeInOut",
                onUpdate: () => {
                  const t = Phaser.Math.Clamp(flight.t, 0, 1);
                  const inv = 1 - t;
                  token.x = inv * inv * startX + 2 * inv * t * controlX + t * t * landX;
                  token.y = inv * inv * startY + 2 * inv * t * arcPeakY + t * t * landY;
                  token.angle += 10 + i * 0.2;
                  const scalePulse = 1 + Math.sin(t * Math.PI) * 0.2;
                  token.setScale(launchScaleX * scalePulse, launchScaleY * scalePulse);
                },
                onComplete: () => {
                  token.setPosition(landX, landY);
                  token.setScale(launchScaleX * 0.96, launchScaleY * 0.96);
                  this.playHeavenHellLootLandSfx?.(i, { soft: false, drop });
                  this.playSfx?.("freespin_orb_appear", { volume: 0.12, rate: 1.2 });
                  const landedValue = Math.max(0, Number(drop?.settledValue ?? drop?.baseValue ?? drop?.value ?? 0));
    
                  const glow = this.textures?.exists?.("helldive_loot_land_glow")
                    ? this.add.image(landX, landY + 7, "helldive_loot_land_glow").setScale(0.54).setAlpha(0.76)
                    : this.add.circle(landX, landY + 5, 13, 0xFFD45A, 0.35);
                  glow.setDepth(DEPTH_HERO + 34).setBlendMode?.(Phaser.BlendModes.ADD);
                  this.tweens.add({
                    targets: glow,
                    scale: (glow.scaleX || 1) * 1.9,
                    alpha: 0,
                    duration: 330,
                    ease: "Cubic.easeOut",
                    onComplete: () => glow.destroy()
                  });
                  this.tweens.add({
                    targets: shadow,
                    alpha: 0,
                    scaleX: 1.8,
                    duration: 260,
                    ease: "Sine.easeOut",
                    onComplete: () => shadow.destroy()
                  });
                  this.tweens.add({
                    targets: token,
                    y: landY - 11,
                    scaleX: launchScaleX * 1.05,
                    scaleY: launchScaleY * 1.05,
                    duration: 105,
                    yoyo: true,
                    ease: "Back.easeOut",
                    onComplete: () => {
                      this.createHeavenHellLootValueLabel(landX, landY - 18, landedValue, {
                        depth: DEPTH_HERO + 58,
                        duration: 1820,
                        rise: 62,
                        driftX: Phaser.Math.Between(-6, 6),
                        driftY: Phaser.Math.Between(-4, 4)
                      });
                      if (persistToGround) {
                        this.incrementHeavenHellGroundLootDisplayTotal?.(landedValue);
                      }
                      if (persistToGround) {
                        token.setPosition(landX, landY);
                        const groundScale = this.getHeavenHellLootTokenScale(drop, { ground: true });
                        token.setScale(groundScale, groundScale);
                        token.setAlpha(0.96);
                        token.setDepth(DEPTH_HERO + 1);
                        resolve();
                        return;
                      }
                      this.tweens.add({
                        targets: token,
                        alpha: 0,
                        y: token.y + 7,
                        scaleX: launchScaleX * 0.82,
                        scaleY: launchScaleY * 0.82,
                        duration: 260,
                        ease: "Sine.easeIn",
                        onComplete: () => {
                          token.destroy();
                          resolve();
                        }
                      });
                    }
                  });
                }
              });
            });
          });
          promises.push(p);
        }
    
        await Promise.all(promises);
      },

    clearHeavenHellChestPresentation() {
        const cleanupTargets = [
          this.heavenHellChestSprite,
          this.heavenHellChestGlow,
          this.heavenHellChestShadow,
          this.heavenHellChestPulseRing,
          ...(Array.isArray(this.heavenHellChestReelPanels) ? this.heavenHellChestReelPanels : []),
          ...(Array.isArray(this.heavenHellChestRewardSprites) ? this.heavenHellChestRewardSprites : [])
        ].filter(Boolean);

        cleanupTargets.forEach((entry) => {
          if (!entry || entry.destroyed) return;
          if (entry.heavenHellPersistOnChestCleanup === true) return;
          if (entry.chestTickerEvent) {
            entry.chestTickerEvent.remove(false);
            entry.chestTickerEvent = null;
          }
          this.tweens.killTweensOf(entry);
          entry.destroy();
        });

        this.heavenHellChestSprite = null;
        this.heavenHellChestGlow = null;
        this.heavenHellChestShadow = null;
        this.heavenHellChestPulseRing = null;
        this.heavenHellChestReelPanels = [];
        this.heavenHellChestRewardSprites = [];
      },

    clearHeavenHellAbilityUnlockPresentation() {
        const cleanupTargets = [
          this.heavenHellAbilityUnlockTitle,
          ...(Array.isArray(this.heavenHellAbilityUnlockPanels) ? this.heavenHellAbilityUnlockPanels : [])
        ].filter(Boolean);

        cleanupTargets.forEach((entry) => {
          if (!entry || entry.destroyed) return;
          if (entry.chestTickerEvent) {
            entry.chestTickerEvent.remove(false);
            entry.chestTickerEvent = null;
          }
          this.tweens.killTweensOf(entry);
          entry.destroy();
        });

        this.heavenHellAbilityUnlockTitle = null;
        this.heavenHellAbilityUnlockPanels = [];
      },

    getHeavenHellChestSpinStageCenter(chestCenter = null) {
        if (chestCenter && Number.isFinite(Number(chestCenter?.x)) && Number.isFinite(Number(chestCenter?.y))) {
          return {
            x: Number(chestCenter.x),
            y: Number(chestCenter.y - 18)
          };
        }
        const cellSize = 70;
        const gridWidth = clientConfig.area.width * cellSize;
        const gridHeight = clientConfig.area.height * cellSize;
        return {
          x: GRID_OFFSET_X + gridWidth / 2,
          y: GRID_OFFSET_Y + gridHeight * 0.44
        };
      },

    getHeavenHellAbilityUnlockEvents(gameState = {}) {
        const procs = Array.isArray(gameState?.heavenHell?.bonus?.abilityProcsThisAction)
          ? gameState.heavenHell.bonus.abilityProcsThisAction
          : [];
        return procs.filter((entry) =>
          entry &&
          (entry.type === "abilityUnlock" || entry.type === "abilityReward") &&
          typeof entry.ability === "string" &&
          entry.ability.length > 0
        );
      },

    getHeavenHellAbilityUnlockPool(gameState = {}, unlockEvents = []) {
        const defaults = ["divineX", "divineStrike", "divineCharge"];
        const configured = Object.keys(gameState?.heavenHell?.bonus?.abilities || {});
        const fromEvents = (Array.isArray(unlockEvents) ? unlockEvents : []).map((entry) => String(entry?.ability || ""));
        return [...new Set([...defaults, ...configured, ...fromEvents].filter(Boolean))];
      },

    getHeavenHellAbilityUnlockCandidateKeys(abilities = {}, unlockPool = []) {
        return (Array.isArray(unlockPool) ? unlockPool : [])
          .filter((abilityKey) => Math.max(0, Math.floor(Number(abilities?.[abilityKey] || 0))) < 2);
      },

    getHeavenHellActionPresentationAbilities(gameState = {}) {
        const finalAbilities = gameState?.heavenHell?.bonus?.abilities;
        if (!finalAbilities || typeof finalAbilities !== "object") {
          return {};
        }

        const presentationAbilities = { ...finalAbilities };
        const unlockEvents = this.getHeavenHellAbilityUnlockEvents(gameState);
        unlockEvents.forEach((entry) => {
          const abilityKey = String(entry?.ability || "");
          if (!abilityKey) return;
          presentationAbilities[abilityKey] = Math.max(
            0,
            Math.floor(Number(presentationAbilities[abilityKey] || 0)) - 1
          );
        });
        return presentationAbilities;
      },

    buildHeavenHellAbilityUnlockSequence(gameState = {}) {
        const unlockEvents = this.getHeavenHellAbilityUnlockEvents(gameState);
        if (unlockEvents.length === 0) {
          return null;
        }

        const finalAbilities = gameState?.heavenHell?.bonus?.abilities || {};
        const startingAbilities = { ...finalAbilities };
        unlockEvents.forEach((entry) => {
          const abilityKey = String(entry?.ability || "");
          if (!abilityKey) return;
          startingAbilities[abilityKey] = Math.max(
            0,
            Math.floor(Number(startingAbilities[abilityKey] || 0)) - 1
          );
        });

        const unlockPool = this.getHeavenHellAbilityUnlockPool(gameState, unlockEvents);
        const events = [];
        const rollingAbilities = { ...startingAbilities };
        unlockEvents.forEach((entry) => {
          const abilityKey = String(entry?.ability || "");
          if (!abilityKey) return;
          const level = Math.max(
            1,
            Math.min(
              2,
              Math.floor(
                Number(entry?.level || (Math.max(0, Number(rollingAbilities[abilityKey] || 0)) + 1))
              )
            )
          );
          events.push({
            ...entry,
            ability: abilityKey,
            level,
            availableKeysBeforeReveal: this.getHeavenHellAbilityUnlockCandidateKeys(rollingAbilities, unlockPool)
          });
          rollingAbilities[abilityKey] = level;
        });

        return {
          events,
          startingAbilities,
          unlockPool
        };
      },

    getHeavenHellAbilityUnlockRevealLabel(entry = {}) {
        const baseLabel = this.getHeavenHellChestTickerLabel(String(entry?.ability || ""));
        const level = Math.max(1, Math.floor(Number(entry?.level || 1) || 1));
        return `${baseLabel} LV ${level}`;
      },

    async revealHeavenHellAbilityUnlockPanel(panel, entry = {}) {
        if (!panel || panel.destroyed) return;
        if (panel.chestTickerEvent) {
          panel.chestTickerEvent.remove(false);
          panel.chestTickerEvent = null;
        }

        const abilityKey = String(entry?.ability || "");
        const palette = this.getHeavenHellChestRewardPalette(abilityKey, {
          kind: "ability",
          abilityKey
        });
        const finalLabel = this.getHeavenHellAbilityUnlockRevealLabel(entry);

        panel.panelLabel?.setText(finalLabel);
        panel.panelLabel?.setColor(palette.text);
        panel.panelBg?.setFillStyle(palette.fill, 0.96);
        panel.panelBg?.setStrokeStyle(2, palette.stroke, 1);
        this.tweens.add({
          targets: panel,
          scaleX: 1.1,
          scaleY: 1.1,
          duration: 130,
          yoyo: true,
          ease: "Back.easeOut"
        });
        this.playSfx?.("wins_highlight", { volume: 0.17 });
        await this.waitForPresentation(150, { skippable: true });
      },

    async playHeavenHellAbilityUnlockSequence(gameState = {}, { allowRewardFx = true } = {}) {
        const sequence = this.buildHeavenHellAbilityUnlockSequence(gameState);
        if (!sequence || !Array.isArray(sequence.events) || sequence.events.length === 0) {
          return false;
        }

        const presentationState = JSON.parse(JSON.stringify(gameState));
        if (!presentationState?.heavenHell?.bonus) {
          return false;
        }

        const { centerX, centerY } = this.getHeavenHellMeterPanelPosition();
        const panelY = centerY - 62;
        const presentationAbilities = { ...sequence.startingAbilities };
        presentationState.heavenHell.bonus.abilities = { ...presentationAbilities };

        const getTickerLabels = () => this.getHeavenHellAbilityUnlockCandidateKeys(
          presentationAbilities,
          sequence.unlockPool
        ).map((abilityKey) => this.getHeavenHellChestTickerLabel(abilityKey)).filter(Boolean);

        const refreshPendingPanels = (panels = [], startIndex = 0) => {
          const tickLabels = getTickerLabels();
          for (let panelIndex = startIndex; panelIndex < panels.length; panelIndex++) {
            const panel = panels[panelIndex];
            if (!panel || panel.destroyed || panel.unlockResolved === true) continue;
            if (panel.chestTickerEvent) {
              panel.chestTickerEvent.remove(false);
              panel.chestTickerEvent = null;
            }
            if (tickLabels.length > 1) {
              this.startHeavenHellChestReelTicker(panel, tickLabels, {
                startIndex: panelIndex,
                intervalMs: 90
              });
            } else {
              panel.panelLabel?.setText(tickLabels[0] || "?");
              panel.panelLabel?.setColor("#F7E8C6");
              panel.panelBg?.setFillStyle(0x24160C, 0.92);
              panel.panelBg?.setStrokeStyle(2, 0xE3B468, 0.95);
            }
          }
        };

        this.clearHeavenHellAbilityUnlockPresentation();
        this.updateHeavenHellAbilityText?.(presentationState, { allowRewardFx: false });

        const title = this.add.text(centerX, panelY - 48, "ABILITY UPGRADE", {
          fontFamily: '"Cinzel", "Times New Roman", serif',
          fontSize: "17px",
          fontStyle: "bold",
          color: "#FFE7A2",
          stroke: "#2A1406",
          strokeThickness: 5
        })
          .setOrigin(0.5)
          .setDepth(DEPTH_HERO + 38)
          .setAlpha(0);
        this.heavenHellAbilityUnlockTitle = title;
        this.tweens.add({
          targets: title,
          alpha: 1,
          y: title.y - 8,
          duration: 180,
          ease: "Sine.easeOut"
        });

        const panels = sequence.events.map(() => {
          const panel = this.createHeavenHellChestReelPanel(centerX, panelY, 124, 56);
          panel.setScale(0.2);
          panel.setAlpha(0);
          panel.unlockResolved = false;
          this.tweens.add({
            targets: panel,
            scaleX: 1,
            scaleY: 1,
            alpha: 1,
            duration: 190,
            ease: "Back.easeOut"
          });
          return panel;
        });
        this.heavenHellAbilityUnlockPanels = panels;
        this.layoutHeavenHellChestPanels(panels, panels.length, centerX, panelY, { animate: false });
        refreshPendingPanels(panels, 0);

        await this.waitForPresentation(360, { skippable: true });

        for (let revealIndex = 0; revealIndex < sequence.events.length; revealIndex++) {
          const panel = panels[revealIndex];
          const entry = sequence.events[revealIndex];
          const availableKeys = this.getHeavenHellAbilityUnlockCandidateKeys(
            presentationAbilities,
            sequence.unlockPool
          );

          if (availableKeys.length > 1) {
            await this.waitForPresentation(720, { skippable: true });
          } else {
            panel?.panelLabel?.setText(
              this.getHeavenHellChestTickerLabel(availableKeys[0] || entry?.ability || "")
            );
            await this.waitForPresentation(180, { skippable: true });
          }

          await this.revealHeavenHellAbilityUnlockPanel(panel, entry);
          if (panel) {
            panel.unlockResolved = true;
          }

          presentationAbilities[entry.ability] = Math.max(
            Number(presentationAbilities[entry.ability] || 0),
            Number(entry.level || 1)
          );
          presentationState.heavenHell.bonus.abilities = { ...presentationAbilities };
          this.updateHeavenHellAbilityText?.(presentationState, { allowRewardFx: false });

          refreshPendingPanels(panels, revealIndex + 1);
          await this.waitForPresentation(revealIndex < sequence.events.length - 1 ? 220 : 300, {
            skippable: true
          });
        }

        this.updateHeavenHellAbilityText?.(gameState, { allowRewardFx });
        this.tweens.add({
          targets: [title, ...panels].filter((entry) => entry && !entry.destroyed),
          alpha: 0,
          y: "-=18",
          duration: 180,
          ease: "Sine.easeIn"
        });
        await this.waitForPresentation(200, { skippable: true });
        this.clearHeavenHellAbilityUnlockPresentation();
        return true;
      },

    async focusHeavenHellChestCamera(chestCenter = null) {
        const camera = this.cameras?.main;
        if (!camera || !chestCenter) return null;
        const snapshot = {
          scrollX: Number(camera.scrollX || 0),
          scrollY: Number(camera.scrollY || 0),
          zoom: Number(camera.zoom || 1)
        };
        const targetZoom = Math.max(0.01, snapshot.zoom * 1.03);
        const focusX = Number(chestCenter.x || 0);
        const focusY = Number(chestCenter.y || 0) - 56;
        const targetScrollX = focusX - (camera.width * 0.5) / targetZoom;
        const targetScrollY = focusY - (camera.height * 0.5) / targetZoom;

        await new Promise((resolve) => {
          this.tweens.add({
            targets: camera,
            scrollX: targetScrollX,
            scrollY: targetScrollY,
            zoom: targetZoom,
            duration: 240,
            ease: "Sine.easeInOut",
            onComplete: resolve
          });
        });
        return snapshot;
      },

    async restoreHeavenHellChestCamera(snapshot = null) {
        const camera = this.cameras?.main;
        if (!camera || !snapshot) return;
        await new Promise((resolve) => {
          this.tweens.add({
            targets: camera,
            scrollX: Number(snapshot.scrollX || 0),
            scrollY: Number(snapshot.scrollY || 0),
            zoom: Math.max(0.01, Number(snapshot.zoom || 1)),
            duration: 220,
            ease: "Sine.easeInOut",
            onComplete: resolve
          });
        });
      },

    getHeavenHellChestColor(rawColor = null, fallback = 0xF6D58D) {
        if (typeof rawColor === "number" && Number.isFinite(rawColor)) {
          return rawColor;
        }
        if (typeof rawColor === "string" && rawColor.trim()) {
          const normalized = rawColor.startsWith("#") ? rawColor : `#${rawColor}`;
          try {
            return Phaser.Display.Color.HexStringToColor(normalized).color;
          } catch (_error) {
            return fallback;
          }
        }
        return fallback;
      },

    getHeavenHellChestRewardLabel(symbol = "", resolvedReward = null) {
        if (symbol === "respin") return "RESPIN";
        if (symbol === "respinReel") return "+ REEL";
        if (symbol === "coin" || symbol === "diamond") {
          const value = Number(resolvedReward?.baseValue ?? resolvedReward?.rewardValue ?? 0);
          return value > 0 ? `${symbol.toUpperCase()} ${value}` : symbol.toUpperCase();
        }
        if (symbol === "freeSpin") {
          const amount = Math.max(1, Math.floor(Number(resolvedReward?.appliedValue ?? resolvedReward?.rewardValue ?? 1) || 1));
          return `+${amount} SPIN${amount === 1 ? "" : "S"}`;
        }
        if (symbol === "multiplier") {
          const gained = Math.max(0, Math.floor(Number(resolvedReward?.appliedValue ?? resolvedReward?.rewardValue ?? 0) || 0));
          return gained > 0 ? `MULTI +${gained}` : "MULTI";
        }
        if (symbol === "divineStrike") {
          const gained = Math.max(0, Math.floor(Number(resolvedReward?.appliedValue ?? 0) || 0));
          return gained > 0 ? `STRIKE +${gained}` : "STRIKE MAX";
        }
        if (symbol === "divineX") {
          const gained = Math.max(0, Math.floor(Number(resolvedReward?.appliedValue ?? 0) || 0));
          return gained > 0 ? `DIVINE X +${gained}` : "DIVINE X MAX";
        }
        if (symbol === "divineCharge") {
          const gained = Math.max(0, Math.floor(Number(resolvedReward?.appliedValue ?? 0) || 0));
          return gained > 0 ? `CHARGE +${gained}` : "CHARGE MAX";
        }
        return String(symbol || "").replace(/([A-Z])/g, " $1").trim().toUpperCase();
      },

    getHeavenHellChestTickerLabel(symbol = "") {
        if (symbol === "respin") return "RESPIN";
        if (symbol === "respinReel") return "+ REEL";
        if (symbol === "coin") return "COIN";
        if (symbol === "diamond") return "DIAMOND";
        if (symbol === "freeSpin") return "+ SPIN";
        if (symbol === "multiplier") return "MULTI";
        if (symbol === "divineStrike") return "STRIKE";
        if (symbol === "divineX") return "DIVINE X";
        if (symbol === "divineCharge") return "CHARGE";
        return String(symbol || "").replace(/([A-Z])/g, " $1").trim().toUpperCase();
      },

    getHeavenHellChestRewardPalette(symbol = "", resolvedReward = null) {
        if (symbol === "diamond") return { fill: 0x66E9FF, stroke: 0xE6FCFF, text: "#EFFFFF" };
        if (symbol === "coin") return { fill: 0xE2A93A, stroke: 0xFFF0B8, text: "#FFF5DA" };
        if (symbol === "freeSpin") return { fill: 0xFFD75E, stroke: 0xFFF3C4, text: "#FFF7DA" };
        if (symbol === "multiplier") return { fill: 0x33C17A, stroke: 0xD9FFE9, text: "#F3FFF8" };
        if (symbol === "divineStrike") return { fill: 0xD85B39, stroke: 0xFFD4B0, text: "#FFF0E7" };
        if (symbol === "divineX") return { fill: 0x845DFF, stroke: 0xE6DBFF, text: "#F7F3FF" };
        if (symbol === "divineCharge") return { fill: 0x45B9FF, stroke: 0xD8F4FF, text: "#F2FBFF" };
        if (symbol === "respinReel") return { fill: 0x8AD7FF, stroke: 0xF0FBFF, text: "#F4FDFF" };
        if (symbol === "respin") return { fill: 0xF0A95A, stroke: 0xFFF0CC, text: "#FFF7E5" };
        return resolvedReward?.kind === "loot"
          ? { fill: 0xE2A93A, stroke: 0xFFF0B8, text: "#FFF5DA" }
          : { fill: 0x443321, stroke: 0xE9CB8A, text: "#FFF6DA" };
      },

    createHeavenHellChestReelPanel(x, y, width = 102, height = 54) {
        const bg = this.add.rectangle(0, 0, width, height, 0x140D07, 0.94)
          .setStrokeStyle(2, 0xE3B468, 0.95);
        const shine = this.add.rectangle(0, -(height * 0.22), width - 10, Math.max(8, height * 0.22), 0xFFF0C0, 0.12);
        const label = this.add.text(0, 0, "?", {
          fontFamily: '"Cinzel", "Times New Roman", serif',
          fontSize: "16px",
          fontStyle: "bold",
          color: "#FFF3D4",
          stroke: "#2D1706",
          strokeThickness: 4,
          align: "center"
        }).setOrigin(0.5);
        const container = this.add.container(x, y, [bg, shine, label]).setDepth(DEPTH_HERO + 36);
        container.panelBg = bg;
        container.panelLabel = label;
        return container;
      },

    startHeavenHellChestReelTicker(panel, tickLabels = [], { startIndex = 0, intervalMs = 95 } = {}) {
        if (!panel || panel.destroyed) return;
        if (panel.chestTickerEvent) {
          panel.chestTickerEvent.remove(false);
          panel.chestTickerEvent = null;
        }

        const labels = Array.isArray(tickLabels) && tickLabels.length > 0 ? tickLabels : ["?"];
        let tickIndex = Math.max(0, Math.floor(Number(startIndex) || 0));
        const applyTickLabel = () => {
          const label = labels[tickIndex % labels.length] || "?";
          panel.panelLabel?.setText(label);
          panel.panelLabel?.setColor("#F7E8C6");
          panel.panelBg?.setFillStyle(0x24160C, 0.92);
          panel.panelBg?.setStrokeStyle(2, 0xE3B468, 0.95);
          tickIndex += 1;
        };

        applyTickLabel();
        panel.chestTickerEvent = this.time.addEvent({
          delay: Math.max(60, Math.floor(Number(intervalMs) || 95)),
          loop: true,
          callback: () => {
            if (!panel || panel.destroyed) return;
            applyTickLabel();
            this.playSfx?.(tickIndex % 2 === 0 ? "coin3" : "coin4", { volume: 0.07 });
          }
        });
      },

    async tickHeavenHellChestReel(panel, reveal = {}, tickLabels = []) {
        if (!panel || panel.destroyed) return;
        this.startHeavenHellChestReelTicker(panel, tickLabels, {
          startIndex: Number(reveal?.reelIndex || 0),
          intervalMs: 95
        });

        await this.waitForPresentation(720, { skippable: true });
        if (panel.chestTickerEvent) {
          panel.chestTickerEvent.remove(false);
          panel.chestTickerEvent = null;
        }

        const resolvedReward = reveal?.resolvedReward || null;
        const symbol = String(reveal?.symbol || "");
        const palette = this.getHeavenHellChestRewardPalette(symbol, resolvedReward);
        const finalLabel = this.getHeavenHellChestRewardLabel(symbol, resolvedReward);

        panel.panelLabel?.setText(finalLabel);
        panel.panelLabel?.setColor(palette.text);
        panel.panelBg?.setFillStyle(palette.fill, 0.96);
        panel.panelBg?.setStrokeStyle(2, palette.stroke, 1);
        this.tweens.add({
          targets: panel,
          scaleX: 1.08,
          scaleY: 1.08,
          duration: 110,
          yoyo: true,
          ease: "Back.easeOut"
        });
        this.playSfx?.("wins_highlight", { volume: (symbol === "respin" || symbol === "respinReel") ? 0.12 : 0.16 });
        await this.waitForPresentation(150, { skippable: true });
      },

    layoutHeavenHellChestPanels(panels = [], reelCount = 1, centerX = 0, centerY = 0, { animate = true } = {}) {
        const activeCount = Math.max(1, Math.floor(Number(reelCount) || 1));
        const spacing = 112;
        const baseX = centerX - ((activeCount - 1) * spacing * 0.5);
        panels.forEach((panel, panelIndex) => {
          if (!panel || panel.destroyed) return;
          const targetX = baseX + (panelIndex * spacing);
          const tweenConfig = {
            targets: panel,
            x: targetX,
            y: centerY,
            duration: animate ? 180 : 0,
            ease: "Sine.easeOut"
          };
          if (animate) {
            this.tweens.add(tweenConfig);
          } else {
            panel.setPosition(targetX, centerY);
          }
          panel.setVisible(panelIndex < activeCount);
          panel.setAlpha(panelIndex < activeCount ? 1 : 0);
        });
      },

    async flyAngelToHeavenHellChest(chest = {}) {
        const reel = Math.floor(Number(chest?.reel));
        const row = Math.floor(Number(chest?.row));
        const target = this.getGridCellCenter(reel, row);
        this.previewHeroModel?.(HERO_STAGE_TEXTURE_KEYS.base, {
          reel: Number.isFinite(Number(this.currentHeroAnchor?.reel)) ? Number(this.currentHeroAnchor.reel) : reel,
          row: Number.isFinite(Number(this.currentHeroAnchor?.row)) ? Number(this.currentHeroAnchor.row) : row
        });
        if (!this.heroSprite || this.heroSprite.destroyed) return target;

        this.playSfx?.("attack_swing", { volume: 0.18, rate: 1.18 });
        this.tweens.add({
          targets: this.heroSprite,
          x: target.x,
          y: target.y + 10,
          duration: 420,
          ease: "Sine.easeInOut"
        });
        await this.waitForPresentation(430, { skippable: true });
        this.currentHeroAnchor = { reel, row };
        return target;
      },

    async animateHeavenHellChestRewardBursts(chestCenter, spin = {}, uiState = null, gameState = null) {
        const reveals = Array.isArray(spin?.reveals) ? spin.reveals : [];
        const rewardAnimations = reveals
          .filter((reveal) => reveal?.resolvedReward?.kind && reveal.resolvedReward.kind !== "none")
          .map((reveal, revealIndex) => new Promise((resolve) => {
            const resolvedReward = reveal.resolvedReward;
            const symbol = String(reveal?.symbol || "");
            const palette = this.getHeavenHellChestRewardPalette(symbol, resolvedReward);
            const label = this.getHeavenHellChestRewardLabel(symbol, resolvedReward);

            if (resolvedReward.kind === "loot" && resolvedReward.lootDrop) {
              const drop = resolvedReward.lootDrop;
              const groundIndex = this.findHeavenHellLootGroundIndex(drop, gameState);
              const dropIndex = groundIndex >= 0 ? groundIndex : revealIndex;
              const target = this.getHeavenHellLootGroundPosition(drop, dropIndex);
              const finalScale = this.getHeavenHellLootTokenScale(drop, { ground: true });
              const token = this.createHeavenHellLootToken(chestCenter.x, chestCenter.y - 22, drop, dropIndex, { scale: finalScale })
                .setDepth(DEPTH_HERO + 40)
                .setAlpha(0)
                .setScale(finalScale * 0.96);
              const shadow = this.add.ellipse(target.x, target.y + 16, 22, 8, 0x000000, 0)
                .setDepth(DEPTH_HERO + 37)
                .setScale(0.7, 0.78);
              const landingRing = this.add.circle(target.x, target.y + 4, 16, 0xFFE6A0, 0)
                .setDepth(DEPTH_HERO + 38)
                .setStrokeStyle(3, 0xFFF3CC, 0.92)
                .setBlendMode(Phaser.BlendModes.ADD)
                .setScale(0.4);
              this.heavenHellChestRewardSprites.push(token, shadow, landingRing);
              this.playHeavenHellLootLaunchSfx?.(revealIndex);
              this.tweens.add({
                targets: shadow,
                alpha: 0.18,
                scaleX: 1,
                scaleY: 1,
                duration: 360,
                ease: "Sine.easeIn"
              });
              this.tweens.add({
                targets: token,
                alpha: 1,
                scaleX: finalScale,
                scaleY: finalScale,
                y: chestCenter.y - 82,
                duration: 180,
                ease: "Sine.easeOut",
                onComplete: () => {
                  this.tweens.add({
                    targets: token,
                    x: target.x,
                    y: target.y,
                    duration: 360,
                    ease: "Cubic.easeIn",
                    onComplete: () => {
                      this.playHeavenHellLootLandSfx?.(revealIndex, { drop });
                      this.setHeavenHellLootLayerLock?.("frontOfHero");
                      const pulseScale = finalScale * 1.06;
                      const glow = this.add.circle(target.x, target.y, 12, 0xFFF2B2, 0.26)
                        .setDepth(DEPTH_HERO + 38)
                        .setBlendMode(Phaser.BlendModes.ADD);
                      this.tweens.add({
                        targets: glow,
                        scale: 2.1,
                        alpha: 0,
                        duration: 260,
                        ease: "Cubic.easeOut",
                        onComplete: () => glow.destroy()
                      });
                      this.tweens.add({
                        targets: landingRing,
                        alpha: 0.48,
                        scale: 1.8,
                        duration: 260,
                        ease: "Cubic.easeOut",
                        onComplete: () => landingRing.destroy()
                      });
                      this.tweens.add({
                        targets: shadow,
                        alpha: 0,
                        scaleX: 1.5,
                        duration: 240,
                        ease: "Sine.easeOut",
                        onComplete: () => shadow.destroy()
                      });
                      this.createHeavenHellLootValueLabel(target.x, target.y - 18, resolvedReward.baseValue, {
                        depth: DEPTH_HERO + 58,
                        duration: 1680,
                        rise: 54,
                        driftX: Phaser.Math.Between(-8, 8),
                        driftY: Phaser.Math.Between(-4, 4)
                      });
                      this.incrementHeavenHellGroundLootDisplayTotal?.(resolvedReward.baseValue);
                      this.tweens.add({
                        targets: token,
                        y: target.y - 9,
                        scaleX: pulseScale,
                        scaleY: finalScale * 0.94,
                        duration: 96,
                        yoyo: true,
                        ease: "Sine.easeOut",
                        onComplete: () => {
                          token.setPosition(target.x, target.y);
                          token.setScale(finalScale, finalScale);
                          token.setAlpha(0.96);
                          token.setDepth(this.getHeavenHellLootDepth("frontOfHero"));
                          token.heavenHellPersistOnChestCleanup = true;
                          if (groundIndex >= 0) {
                            this.registerHeavenHellLootSprite(token, drop, groundIndex);
                          }
                          resolve();
                        }
                      });
                    }
                  });
                }
              });
              return;
            }

            const badge = this.add.container(chestCenter.x, chestCenter.y - 30).setDepth(DEPTH_HERO + 42).setAlpha(0);
            const bg = this.add.rectangle(0, 0, Math.max(110, label.length * 10), 34, palette.fill, 0.95)
              .setStrokeStyle(2, palette.stroke, 1);
            const text = this.add.text(0, 0, label, {
              fontFamily: '"Cinzel", "Times New Roman", serif',
              fontSize: "15px",
              fontStyle: "bold",
              color: palette.text,
              stroke: "#2A1406",
              strokeThickness: 4
            }).setOrigin(0.5);
            badge.add([bg, text]);
            this.heavenHellChestRewardSprites.push(badge);

            this.tweens.add({
              targets: badge,
              alpha: 1,
              y: chestCenter.y - 96,
              duration: 220,
              ease: "Cubic.easeOut",
              onComplete: () => {
                if (resolvedReward.kind === "freespin" && uiState) {
                  uiState.freespins = Math.max(0, uiState.freespins + Math.max(0, Math.floor(Number(resolvedReward.appliedValue || 0))));
                  this.updateFreespinCounter?.(uiState.freespins, { deferRingConsume: true });
                }
                if (resolvedReward.kind === "ability" && uiState && resolvedReward.abilityKey) {
                  uiState.abilities[resolvedReward.abilityKey] = Math.max(
                    Number(uiState.abilities[resolvedReward.abilityKey] || 0),
                    Number(resolvedReward.after || 0)
                  );
                  uiState.gameState.heavenHell.bonus.abilities = { ...uiState.abilities };
                  this.updateHeavenHellAbilityText?.(uiState.gameState, { allowRewardFx: false });
                }
                if (resolvedReward.kind === "multiplier" && uiState) {
                  const targetX = Number(this.multiplierText?.x ?? this.houseSprite?.x ?? chestCenter.x);
                  const targetY = Number(this.multiplierText?.y ?? this.houseSprite?.y ?? (chestCenter.y - 110));
                  const orb = this.add.circle(chestCenter.x, chestCenter.y - 68, 12, palette.fill, 0.95)
                    .setDepth(DEPTH_HERO + 48)
                    .setStrokeStyle(2, palette.stroke, 1)
                    .setBlendMode(Phaser.BlendModes.ADD);
                  const trail = this.add.circle(chestCenter.x, chestCenter.y - 68, 20, palette.fill, 0.24)
                    .setDepth(DEPTH_HERO + 47)
                    .setBlendMode(Phaser.BlendModes.ADD);
                  this.tweens.add({
                    targets: [orb, trail],
                    x: targetX,
                    y: targetY,
                    scaleX: 0.7,
                    scaleY: 0.7,
                    alpha: { from: 1, to: 0.2 },
                    duration: 340,
                    ease: "Cubic.easeIn",
                    onComplete: () => {
                      orb.destroy();
                      trail.destroy();
                      uiState.multiplier = Math.max(
                        1,
                        Number(uiState.multiplier || 1),
                        Number(resolvedReward.after || 1)
                      );
                      uiState.gameState.multiplier = uiState.multiplier;
                      uiState.gameState.heavenHell.bonus.globalMultiplier = uiState.multiplier;
                      this.createOrUpdateHouse?.(uiState.multiplier);
                    }
                  });
                }
                this.tweens.add({
                  targets: badge,
                  alpha: 0,
                  y: badge.y - 34,
                  duration: 320,
                  delay: 260,
                  ease: "Sine.easeIn",
                  onComplete: () => {
                    badge.destroy();
                    resolve();
                  }
                });
              }
            });
            this.playSfx?.("wins_highlight", { volume: 0.16 });
          }));

        await Promise.all(rewardAnimations);
      },

    async playHeavenHellChestRewardSequence(gameState = {}) {
        await this.waitForHeavenHellPendingGroundPresentation({ loot: true, chests: true });
        const chestEvents = Array.isArray(gameState?.heavenHell?.bonus?.chestEventsThisAction)
          ? gameState.heavenHell.bonus.chestEventsThisAction
          : [];
        if (chestEvents.length === 0) {
          this.clearHeavenHellGroundChests();
          this.updateFreespinCounter?.(gameState?.bonusState?.finalFreespins || 0, { deferRingConsume: true });
          return false;
        }

        const chestSummary = gameState?.heavenHell?.bonus?.chestActionSummary || {};
        const uiState = {
          freespins: Math.max(
            0,
            Number(gameState?.bonusState?.finalFreespins || 0) - Math.max(0, Number(chestSummary?.freeSpinsAdded || 0))
          ),
          multiplier: Math.max(
            1,
            Number(gameState?.multiplier || 1) - Math.max(0, Number(chestSummary?.multiplierAdded || 0))
          ),
          abilities: {
            divineStrike: Math.max(0, Number(gameState?.heavenHell?.bonus?.abilities?.divineStrike || 0) - Math.max(0, Number(chestSummary?.abilityGains?.divineStrike || 0))),
            divineX: Math.max(0, Number(gameState?.heavenHell?.bonus?.abilities?.divineX || 0) - Math.max(0, Number(chestSummary?.abilityGains?.divineX || 0))),
            divineCharge: Math.max(0, Number(gameState?.heavenHell?.bonus?.abilities?.divineCharge || 0) - Math.max(0, Number(chestSummary?.abilityGains?.divineCharge || 0)))
          },
          gameState: JSON.parse(JSON.stringify(gameState))
        };

        uiState.gameState.bonusState.finalFreespins = uiState.freespins;
        uiState.gameState.multiplier = uiState.multiplier;
        uiState.gameState.heavenHell.bonus.globalMultiplier = uiState.multiplier;
        uiState.gameState.heavenHell.bonus.abilities = { ...uiState.abilities };

        this.createOrUpdateHouse?.(uiState.multiplier);
        this.updateFreespinCounter?.(uiState.freespins, { deferRingConsume: true });
        this.updateHeavenHellAbilityText?.(uiState.gameState, { allowRewardFx: false });
        this.clearHeavenHellChestPresentation();
        this.finalizeHeavenHellVisibleGroundChests();
        this.syncHeavenHellRewardGroundChests(chestEvents, { openedThroughIndex: -1 });

        for (let chestIndex = 0; chestIndex < chestEvents.length; chestIndex++) {
          const chest = chestEvents[chestIndex] || {};
          const chestCenter = this.getHeavenHellGroundChestPosition(chest);
          const chestSpinStageCenter = this.getHeavenHellChestSpinStageCenter(chestCenter);
          const glowColor = this.getHeavenHellChestColor(chest?.highlight?.glowColor, 0xF6D58D);
          const glowAlpha = Number.isFinite(Number(chest?.highlight?.glowAlpha)) ? Number(chest.highlight.glowAlpha) : 0.28;
          const glowScale = Number.isFinite(Number(chest?.highlight?.glowScale)) ? Number(chest.highlight.glowScale) : 1.16;

          this.promoteHeavenHellGroundChestForPresentation(
            this.resolveHeavenHellGroundChestSpriteForReward(chest, chestIndex),
            chest,
            chestCenter
          );

          this.heavenHellChestShadow = this.add.ellipse(chestCenter.x, chestCenter.y + 20, 58, 18, 0x000000, 0.34)
            .setDepth(DEPTH_HERO + 28);
          this.heavenHellChestGlow = this.add.circle(chestCenter.x, chestCenter.y, 38, glowColor, glowAlpha)
            .setDepth(DEPTH_HERO + 29)
            .setBlendMode(Phaser.BlendModes.ADD)
            .setScale(0.7);
          this.heavenHellChestPulseRing = this.add.circle(chestCenter.x, chestCenter.y, 24, glowColor, Math.min(0.42, glowAlpha + 0.08))
            .setDepth(DEPTH_HERO + 30)
            .setStrokeStyle(3, 0xFFF2D0, 0.95)
            .setBlendMode(Phaser.BlendModes.ADD)
            .setScale(0.65)
            .setAlpha(0.3);

          const cameraSnapshot = await this.focusHeavenHellChestCamera(chestCenter);

          this.tweens.add({
            targets: this.heavenHellChestGlow,
            scale: glowScale,
            alpha: Math.min(0.5, glowAlpha + 0.08),
            duration: 360,
            yoyo: true,
            repeat: -1,
            ease: "Sine.easeInOut"
          });
          this.tweens.add({
            targets: this.heavenHellChestPulseRing,
            scale: glowScale + 0.24,
            alpha: 0,
            duration: 760,
            repeat: -1,
            ease: "Sine.easeOut"
          });

          this.playSfx?.("wins_highlight", { volume: 0.18 });
          this.tweens.add({
            targets: this.heavenHellChestSprite,
            scaleX: 0.48,
            scaleY: 0.48,
            duration: 180,
            ease: "Sine.easeOut",
            onComplete: () => {
              this.tweens.add({
                targets: this.heavenHellChestSprite,
                y: chestCenter.y + 5,
                duration: 180,
                yoyo: true,
                ease: "Bounce.easeOut"
              });
            }
          });
          await this.waitForPresentation(420, { skippable: true });

          await this.flyAngelToHeavenHellChest(chest);

          this.tweens.add({
            targets: this.heavenHellChestSprite,
            scaleX: 0.66,
            scaleY: 0.66,
            angle: -7,
            duration: 120,
            yoyo: true,
            repeat: 1,
            ease: "Sine.easeOut"
          });
          this.tweens.add({
            targets: this.heavenHellChestGlow,
            scale: glowScale + 0.28,
            alpha: Math.min(0.62, glowAlpha + 0.18),
            duration: 180,
            yoyo: true,
            ease: "Sine.easeOut"
          });
          this.tweens.add({
            targets: this.heavenHellChestPulseRing,
            scale: glowScale + 0.5,
            alpha: 0,
            duration: 240,
            ease: "Cubic.easeOut"
          });
          if (this.heroSprite && !this.heroSprite.destroyed) {
            this.tweens.add({
              targets: this.heroSprite,
              y: this.heroSprite.y - 12,
              duration: 140,
              yoyo: true,
              ease: "Sine.easeInOut"
            });
          }
          const spinStageFlash = this.add.circle(chestSpinStageCenter.x, chestSpinStageCenter.y - 18, 26, 0xFFF0B8, 0.22)
            .setDepth(DEPTH_HERO + 34)
            .setBlendMode(Phaser.BlendModes.ADD);
          this.tweens.add({
            targets: spinStageFlash,
            scale: 2.4,
            alpha: 0,
            duration: 260,
            ease: "Cubic.easeOut",
            onComplete: () => spinStageFlash.destroy()
          });
          await this.waitForPresentation(280, { skippable: true });

          this.playSfx?.("gold_drop", { volume: 0.16 });
          this.tweens.add({
            targets: this.heavenHellChestSprite,
            scaleX: 0.6,
            scaleY: 0.6,
            angle: -4,
            duration: 110,
            yoyo: true,
            repeat: 1,
            ease: "Sine.easeOut"
          });
          await this.waitForPresentation(180, { skippable: true });

          const spins = Array.isArray(chest?.spins) ? chest.spins : [];
          const panels = [];
          for (let spinIndex = 0; spinIndex < spins.length; spinIndex++) {
            const spin = spins[spinIndex] || {};
            const reelCount = Math.max(1, Math.floor(Number(spin?.reelCount || 1)));
            const reelY = chestSpinStageCenter.y - 62;

            while (panels.length < reelCount) {
              const panel = this.createHeavenHellChestReelPanel(chestCenter.x, chestCenter.y - 68, 102, 54);
              panel.setScale(0.2);
              panel.setAlpha(0);
              panels.push(panel);
              this.heavenHellChestReelPanels.push(panel);
              this.tweens.add({
                targets: panel,
                scaleX: 1,
                scaleY: 1,
                alpha: 1,
                duration: 180,
                ease: "Back.easeOut"
              });
            }

            this.layoutHeavenHellChestPanels(panels, reelCount, chestSpinStageCenter.x, reelY, { animate: true });

            const reveals = Array.isArray(spin?.reveals) ? spin.reveals : [];
            const tickLabels = (Array.isArray(spin?.availableTickSymbols) ? spin.availableTickSymbols : [])
              .map((symbol) => this.getHeavenHellChestTickerLabel(symbol))
              .filter(Boolean);
            panels.slice(0, reelCount).forEach((panel, revealIndex) => {
              this.startHeavenHellChestReelTicker(panel, tickLabels, {
                startIndex: revealIndex + spinIndex,
                intervalMs: 90
              });
            });

            await this.waitForPresentation(260, { skippable: true });
            for (let revealIndex = 0; revealIndex < reelCount; revealIndex++) {
              const panel = panels[revealIndex];
              const reveal = reveals[revealIndex] || { reelIndex: revealIndex, symbol: "coin" };
              if (panel?.chestTickerEvent) {
                panel.chestTickerEvent.remove(false);
                panel.chestTickerEvent = null;
              }
              await this.tickHeavenHellChestReel(panel, reveal, tickLabels);
            }

            await this.animateHeavenHellChestRewardBursts(chestSpinStageCenter, spin, uiState, gameState);
            await this.waitForPresentation(spinIndex < spins.length - 1 ? 220 : 140, { skippable: true });
          }

          this.tweens.add({
            targets: [this.heavenHellChestSprite, this.heavenHellChestGlow, this.heavenHellChestShadow],
            alpha: 0,
            duration: 220,
            ease: "Sine.easeIn"
          });
          await this.waitForPresentation(240, { skippable: true });
          this.clearHeavenHellChestPresentation();
          await this.restoreHeavenHellChestCamera(cameraSnapshot);
          this.syncHeavenHellRewardGroundChests(chestEvents, { openedThroughIndex: chestIndex });
        }

        this.updateFreespinCounter?.(gameState?.bonusState?.finalFreespins || 0, { deferRingConsume: true });
        this.updateHeavenHellAbilityText?.(gameState, { allowRewardFx: false });
        return true;
      },

    async playHeavenHellCollectPhase(gameState = {}) {
        await this.waitForHeavenHellPendingGroundPresentation({ loot: true, chests: true });
        const settledDrops = Array.isArray(gameState?.heavenHell?.bonus?.lootGroundSettled)
          ? gameState.heavenHell.bonus.lootGroundSettled
          : [];
        if (settledDrops.length === 0) return;
    
        if (!Array.isArray(this.heavenHellLootSprites) || this.heavenHellLootSprites.length === 0) {
          this.renderHeavenHellLootGround(settledDrops);
        }
    
        const activeSprites = (Array.isArray(this.heavenHellLootSprites) ? this.heavenHellLootSprites : [])
          .filter((entry) => entry && !entry.destroyed);
        if (activeSprites.length === 0) return;
    
        const betSize = Math.max(0, Number(gameState?.betSize ?? gameState?.roundMeta?.betSize ?? 0));
        const totalLootTwa = settledDrops.reduce((sum, drop) => {
          const settledValue = Number(drop?.settledValue ?? drop?.baseValue ?? drop?.value ?? 0);
          return sum + settledValue * betSize;
        }, 0);
        const finalTwa = Math.max(0, Number(gameState?.twa || 0));
        const baseTwa = Math.max(0, finalTwa - totalLootTwa);
        const resolvedMultiplier = Math.max(1, Math.floor(Number(gameState?.multiplier ?? this.currentMultiplier ?? 1) || 1));
        this.createOrUpdateHouse?.(resolvedMultiplier);
        if (this.houseSprite && !this.houseSprite.destroyed) {
          this.houseSprite.setVisible(true);
        }
        if (this.multiplierText && !this.multiplierText.destroyed) {
          this.multiplierText.setVisible(true);
        }
        if (this.multiplierHighlight && !this.multiplierHighlight.destroyed) {
          this.multiplierHighlight.setVisible(true);
        }
        if (this.multiplierGlowOuter && !this.multiplierGlowOuter.destroyed) {
          this.multiplierGlowOuter.setVisible(true);
        }
        if (this.multiplierGlowInner && !this.multiplierGlowInner.destroyed) {
          this.multiplierGlowInner.setVisible(true);
        }
        const centerTarget = this.getCenterCollectTarget?.() || {
          x: this.multiplierText?.x ?? this.houseSprite?.x ?? (GRID_OFFSET_X + (clientConfig.area.width * 70) * 0.5),
          y: this.multiplierText?.y ?? this.houseSprite?.y ?? (GRID_OFFSET_Y + (clientConfig.area.height * 70) * 0.5)
        };
        const targetX = Number(centerTarget.x);
        const targetY = Number(centerTarget.y);
        let runningTwa = baseTwa;
        let collectedLootTwa = 0;
        const pulseCountUpHit = () => {
          if (!this.countUpText || this.countUpText.destroyed || this.countUpText.visible !== true) return;
          this.tweens.killTweensOf(this.countUpText);
          this.countUpText.setScale(1);
          this.tweens.add({
            targets: this.countUpText,
            scaleX: 1.1,
            scaleY: 1.1,
            duration: 90,
            yoyo: true,
            ease: "Sine.easeOut"
          });
        };
        const blinkMultiplierHit = () => {
          const blink = this.add.circle(targetX, targetY, 14, 0xFFF0AE, 0.34)
            .setDepth(DEPTH_HERO + 57)
            .setBlendMode(Phaser.BlendModes.ADD);
          this.tweens.add({
            targets: blink,
            scale: 3.2,
            alpha: 0,
            duration: 180,
            ease: "Cubic.easeOut",
            onComplete: () => blink.destroy()
          });
          if (this.multiplierText && !this.multiplierText.destroyed) {
            this.tweens.add({
              targets: this.multiplierText,
              scaleX: 1.12,
              scaleY: 1.12,
              duration: 85,
              yoyo: true,
              ease: "Sine.easeOut"
            });
          }
          if (this.multiplierHighlight && !this.multiplierHighlight.destroyed) {
            this.tweens.add({
              targets: this.multiplierHighlight,
              alpha: 1,
              scaleX: 1.16,
              scaleY: 1.16,
              duration: 90,
              yoyo: true,
              ease: "Sine.easeOut"
            });
          }
          if (this.multiplierGlowOuter && !this.multiplierGlowOuter.destroyed) {
            this.tweens.add({
              targets: this.multiplierGlowOuter,
              alpha: 0.38,
              scale: 1.42,
              duration: 120,
              yoyo: true,
              ease: "Sine.easeOut"
            });
          }
          if (this.multiplierGlowInner && !this.multiplierGlowInner.destroyed) {
            this.tweens.add({
              targets: this.multiplierGlowInner,
              alpha: 0.42,
              scale: 1.28,
              duration: 120,
              yoyo: true,
              ease: "Sine.easeOut"
            });
          }
        };
    
        this.updateCountUp(baseTwa);
        this.ensureCollectPhaseLootCounter?.(0);

        // COLLECT PHASE HIDE
        const title = this.add.text(targetX, targetY - 96, "COLLECT PHASE", {
          fontSize: "22px",
          fontFamily: '"Cinzel", "Times New Roman", serif',
          fontStyle: "bold",
          color: "#FFE8A3",
          stroke: "#260D00",
          strokeThickness: 6
        }).setOrigin(0.5).setDepth(DEPTH_HERO + 52).setAlpha(0);
        this.tweens.add({ targets: title, alpha: 1, y: targetY - 114, duration: 220, ease: "Sine.easeOut" });
    
        const vortexGlow = this.add.circle(targetX, targetY, 34, 0xFFE08A, 0.18)
          .setDepth(DEPTH_HERO + 48)
          .setBlendMode(Phaser.BlendModes.ADD);
        const vortexRing = this.add.circle(targetX, targetY, 58, 0xFFF0B8, 0.12)
          .setDepth(DEPTH_HERO + 47)
          .setStrokeStyle(3, 0xFFE6A0, 0.22)
          .setBlendMode(Phaser.BlendModes.ADD);
        this.tweens.add({
          targets: vortexGlow,
          scale: 1.35,
          alpha: 0.28,
          duration: 420,
          yoyo: true,
          repeat: -1,
          ease: "Sine.easeInOut"
        });
        this.tweens.add({
          targets: vortexRing,
          angle: 180,
          scale: 0.88,
          alpha: 0.18,
          duration: 760,
          yoyo: true,
          repeat: -1,
          ease: "Sine.easeInOut"
        });
    
        const swirlPromises = activeSprites.map((token, index) => new Promise((resolve) => {
          const drop = settledDrops[index] || {};
          const settledValue = Math.max(0, Number(drop?.settledValue ?? drop?.baseValue ?? drop?.value ?? 0));
          const payoutTwa = settledValue * betSize;
          this.time.delayedCall(index * 30, () => {
            this.playSfx?.("coin1", { volume: 0.08 + Math.min(0.1, index * 0.002) });
            const dx = Number(token.x || 0) - targetX;
            const dy = Number(token.y || 0) - targetY;
            const startRadius = Math.max(18, Math.sqrt((dx * dx) + (dy * dy)));
            const startAngle = Math.atan2(dy, dx);
            const swirlTurns = Phaser.Math.FloatBetween(2.4, 3.4) * (index % 2 === 0 ? 1 : -1);
            const travel = { progress: 0 };
            const duration = 2800 + (index % 6) * 90;
            const tokenBaseScaleX = Number(token.scaleX || 0.34);
            const tokenBaseScaleY = Number(token.scaleY || 0.34);
    
            this.tweens.add({
              targets: travel,
              progress: 1,
              duration,
              ease: "Sine.easeIn",
              onUpdate: () => {
                const t = Phaser.Math.Clamp(travel.progress, 0, 1);
                const eased = Math.pow(t, 3.15);
                const snapPhase = Phaser.Math.Clamp((t - 0.86) / 0.14, 0, 1);
                const snapBoost = 1 - Math.pow(1 - snapPhase, 3.8);
                const radiusBase = Phaser.Math.Linear(startRadius, 5, eased);
                const radius = Phaser.Math.Linear(radiusBase, 1.5, snapBoost);
                const angleProgress = eased + (snapBoost * 0.18);
                const angle = startAngle + (Math.PI * 2 * swirlTurns * angleProgress);
                const orbitX = targetX + Math.cos(angle) * radius;
                const orbitY = targetY + Math.sin(angle) * radius * 0.72;
                token.x = Phaser.Math.Linear(orbitX, targetX, snapBoost * 0.28);
                token.y = Phaser.Math.Linear(orbitY, targetY, snapBoost * 0.28);
                token.setScale(tokenBaseScaleX, tokenBaseScaleY);
                token.setAlpha(0.96);
                token.angle += 16 + (index % 5) * 2 + (snapBoost * 16);
              },
              onComplete: () => {
                if (payoutTwa > 0) {
                  collectedLootTwa += payoutTwa;
                  runningTwa += payoutTwa;
                  this.updateCollectPhaseLootCounter?.(collectedLootTwa, { animate: true });
                  this.updateCountUp(Math.min(finalTwa, runningTwa));
                  pulseCountUpHit();
                  blinkMultiplierHit();
                }
                const burst = this.add.circle(targetX, targetY, 10, 0xFFF1B2, 0.32)
                  .setDepth(DEPTH_HERO + 55)
                  .setBlendMode(Phaser.BlendModes.ADD);
                this.tweens.add({
                  targets: burst,
                  scale: 2.6,
                  alpha: 0,
                  duration: 220,
                  ease: "Cubic.easeOut",
                  onComplete: () => burst.destroy()
                });
                token.destroy();
                if (payoutTwa > 0) {
                  this.createHeavenHellLootValueLabel(targetX, targetY - 56, payoutTwa, {
                    depth: DEPTH_HERO + 58,
                    duration: 1980,
                    rise: 70,
                    driftX: Phaser.Math.Between(-10, 10),
                    driftY: Phaser.Math.Between(-12, 2)
                  });
                }
                this.tweens.killTweensOf(token);
                this.tweens.add({
                  targets: token,
                  scaleX: 0.08,
                  scaleY: 0.08,
                  alpha: 0,
                  duration: 90,
                  ease: "Cubic.easeOut",
                  onComplete: () => {
                    if (!token.destroyed) {
                      token.destroy();
                    }
                    resolve();
                  }
                });
              }
            });
          });
        }));
    
        await Promise.all(swirlPromises);
        this.clearHeavenHellLootGround();
        this.updateCountUp(finalTwa);
        this.playSfx?.("gold_drop", { volume: 0.18 });
        vortexGlow.destroy();
        vortexRing.destroy();
        this.tweens.add({
          targets: title,
          alpha: 0,
          y: title.y - 18,
          duration: 240,
          ease: "Sine.easeOut",
          onComplete: () => title.destroy()
        });
        await this.waitForPresentation(180, { skippable: true });
        this.destroyCollectPhaseLootCounter?.();
      },

    async playHeavenHellDivineStrikeAnticipation(
        step = {},
        targetCenter = null,
        {
          stepQuickStop = false,
          durationMs = 850,
          impactLeadMs = null,
          slowMoFactor = 0.18,
          showTitle = true
        } = {}
      ) {
        if (stepQuickStop || step?.divineStrikeProc !== true) return false;
        if (!this.heroSprite || this.heroSprite.destroyed) return false;

        const target = targetCenter || this.getGridCellCenter(
          Math.floor(Number(step?.reel)),
          Math.floor(Number(step?.row))
        );
        const heroX = Number(this.heroSprite.x || target.x);
        const heroY = Number(this.heroSprite.y || target.y);
        const safeDuration = Math.max(1, Math.floor(Number(durationMs) || 850));
        const clampedSlowMoFactor = Phaser.Math.Clamp(Number(slowMoFactor) || 0.18, 0.08, 0.95);
        const title = showTitle
          ? this.add.text(heroX, heroY - 92, "DIVINE STRIKE", {
              fontSize: "22px",
              fontFamily: '"Cinzel", "Times New Roman", serif',
              fontStyle: "bold",
              color: "#FFF0AA",
              stroke: "#260D00",
              strokeThickness: 6
            }).setOrigin(0.5).setDepth(DEPTH_HERO + 52).setAlpha(0)
          : null;
        const targetRing = this.add.circle(target.x, target.y, 22, 0xFFE6B0, 0.24)
          .setDepth(DEPTH_HERO + 48)
          .setStrokeStyle(4, 0xFFF7D0, 0.95)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setScale(0.72);
        const targetFlash = this.add.circle(target.x, target.y, 14, 0xFFF6CE, 0.38)
          .setDepth(DEPTH_HERO + 49)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setScale(0.52);

        if (title) {
          this.tweens.add({ targets: title, alpha: 1, y: heroY - 112, duration: 180, ease: "Sine.easeOut" });
        }
        this.tweens.add({
          targets: targetRing,
          scale: 2.8,
          alpha: 0.88,
          duration: safeDuration,
          ease: "Sine.easeInOut"
        });
        this.tweens.add({
          targets: targetFlash,
          scale: 3.8,
          alpha: 0.08,
          duration: safeDuration,
          ease: "Sine.easeInOut"
        });
        if (this.heroSprite && !this.heroSprite.destroyed) {
          this.tweens.add({
            targets: this.heroSprite,
            scaleX: (this.heroSprite.scaleX || 1) * 1.08,
            scaleY: (this.heroSprite.scaleY || 1) * 0.96,
            duration: Math.max(180, Math.floor(safeDuration * 0.32)),
            yoyo: true,
            repeat: 2,
            ease: "Sine.easeInOut"
          });
        }

        if (step?.divineXProc === true) {
          const leadMs = Math.max(
            0,
            Number.isFinite(Number(impactLeadMs))
              ? Number(impactLeadMs)
              : safeDuration
          );
          this.playHeavenHellDivineXImpactSound?.({ impactLeadMs: leadMs, volume: 0.58 });
          step._clientDivineXImpactSoundPrimed = true;
        }

        this.endSlowMo?.();
        this.beginBriefSlowMo?.(clampedSlowMoFactor, safeDuration, { affectTimers: false });
        await this.waitForPresentation(safeDuration, { skippable: true, useSceneTime: false });
        this.endSlowMo?.();

        if (targetRing && !targetRing.destroyed) targetRing.destroy();
        if (targetFlash && !targetFlash.destroyed) targetFlash.destroy();
        if (title) {
          this.tweens.add({
            targets: title,
            alpha: 0,
            y: title.y - 18,
            duration: 160,
            ease: "Sine.easeOut",
            onComplete: () => title.destroy()
          });
        }
        return true;
      },

    createHeavenHellDivineXWaveMarker(center = null, { wave = 1 } = {}) {
        if (!center) return [];
        if (!Array.isArray(this.heavenHellDivineGroundFx)) {
          this.heavenHellDivineGroundFx = [];
        }

        const waveIndex = Math.max(1, Math.floor(Number(wave) || 1));
        const lineLength = 70 + waveIndex * 8;
        const lineThickness = 7 + Math.min(3, waveIndex);
        const ringRadius = 15 + waveIndex * 2;
        const haloRadius = 24 + waveIndex * 4;
        const lineA = this.add.rectangle(center.x, center.y, lineLength, lineThickness, 0xFF9BF5, 0.96)
          .setAngle(45)
          .setDepth(DEPTH_SYMBOLS + 12)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setAlpha(0)
          .setScale(0.18, 0.26);
        const lineB = this.add.rectangle(center.x, center.y, lineLength, lineThickness, 0xFFD9FF, 0.98)
          .setAngle(-45)
          .setDepth(DEPTH_SYMBOLS + 13)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setAlpha(0)
          .setScale(0.18, 0.26);
        const ring = this.add.circle(center.x, center.y, ringRadius, 0xF056FF, 0.24)
          .setDepth(DEPTH_SYMBOLS + 11)
          .setStrokeStyle(3, 0xFFE0FF, 0.96)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setAlpha(0)
          .setScale(0.24);
        const halo = this.add.circle(center.x, center.y, haloRadius, 0xFF8BF1, 0.16)
          .setDepth(DEPTH_SYMBOLS + 10)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setAlpha(0)
          .setScale(0.18);
        const core = this.add.circle(center.x, center.y, 8 + waveIndex, 0xFFF1FF, 0.42)
          .setDepth(DEPTH_SYMBOLS + 14)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setAlpha(0)
          .setScale(0.22);

        const fxParts = [lineA, lineB, ring, halo, core];
        this.heavenHellDivineGroundFx.push(...fxParts);

        this.tweens.add({
          targets: [lineA, lineB],
          alpha: 0.96,
          scaleX: 1.06,
          scaleY: 1.02,
          duration: 110,
          ease: "Cubic.easeOut"
        });
        this.tweens.add({
          targets: ring,
          alpha: 0.78,
          scale: 1.36,
          duration: 130,
          ease: "Back.easeOut"
        });
        this.tweens.add({
          targets: halo,
          alpha: 0.34,
          scale: 1.42,
          duration: 140,
          ease: "Sine.easeOut"
        });
        this.tweens.add({
          targets: core,
          alpha: 0.88,
          scale: 1.18,
          duration: 90,
          ease: "Cubic.easeOut"
        });

        const holdMs = 140 + waveIndex * 36;
        const fadeMs = 280 + waveIndex * 40;
        this.time.delayedCall(holdMs, () => {
          const activeFx = fxParts.filter((fx) => fx && !fx.destroyed);
          if (activeFx.length === 0) return;

          this.tweens.add({
            targets: [lineA, lineB],
            scaleX: 1.28,
            scaleY: 1.14,
            alpha: 0,
            duration: fadeMs,
            ease: "Sine.easeOut"
          });
          this.tweens.add({
            targets: ring,
            scale: 2.35,
            alpha: 0,
            duration: fadeMs,
            ease: "Sine.easeOut"
          });
          this.tweens.add({
            targets: halo,
            scale: 3.2,
            alpha: 0,
            duration: fadeMs + 120,
            ease: "Sine.easeOut",
            onComplete: () => {
              activeFx.forEach((fx) => {
                if (fx && !fx.destroyed) fx.destroy();
              });
            }
          });
          this.tweens.add({
            targets: core,
            scale: 1.72,
            alpha: 0,
            duration: Math.max(320, fadeMs - 120),
            ease: "Sine.easeOut"
          });
        });

        return fxParts;
      },

    createHeavenHellDivineStrikeSigil(center = null, { wave = 0, isCenter = false } = {}) {
        if (!center) return [];
        if (!Array.isArray(this.heavenHellDivineGroundFx)) {
          this.heavenHellDivineGroundFx = [];
        }

        const waveIndex = Math.max(0, Math.floor(Number(wave) || 0));
        const baseScale = isCenter ? 0.86 : 0.74 + waveIndex * 0.04;
        const litPlate = this.add.rectangle(
          center.x,
          center.y + 4,
          isCenter ? 74 : 68,
          isCenter ? 74 : 68,
          0xFFE39A,
          isCenter ? 0.26 : 0.22
        )
          .setDepth(DEPTH_SYMBOLS + 9)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setAngle(45)
          .setScale(0.72)
          .setAlpha(0);
        const litPlateGlow = this.add.rectangle(
          center.x,
          center.y + 4,
          isCenter ? 88 : 80,
          isCenter ? 88 : 80,
          0xFFF4CF,
          0.12
        )
          .setDepth(DEPTH_SYMBOLS + 8)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setAngle(45)
          .setScale(0.66)
          .setAlpha(0);
        const ground = this.textures?.exists?.("helldive_divine_ground")
          ? this.add.image(center.x, center.y, "helldive_divine_ground")
              .setScale(baseScale)
              .setAlpha(0.94)
          : this.add.rectangle(center.x, center.y, 66, 66, 0xFFF1A8, 0.36);
        ground
          .setDepth(DEPTH_SYMBOLS + 11)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setAlpha(0);

        const rune = this.add.rectangle(center.x, center.y, isCenter ? 64 : 58, isCenter ? 64 : 58)
          .setStrokeStyle(3, 0xFFE07A, 0.96)
          .setDepth(DEPTH_SYMBOLS + 12)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setAngle(45)
          .setScale(0.72)
          .setAlpha(0);

        const pentagram = typeof this.add.star === "function"
          ? this.add.star(
              center.x,
              center.y,
              5,
              isCenter ? 12 : 10,
              isCenter ? 28 : 24,
              0xFFF3C6,
              0.18
            )
          : this.add.circle(center.x, center.y, isCenter ? 24 : 20, 0xFFF3C6, 0.18);
        pentagram
          .setDepth(DEPTH_SYMBOLS + 13)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setAngle(-18)
          .setScale(0.42)
          .setAlpha(0);

        const innerRune = this.add.rectangle(center.x, center.y, isCenter ? 42 : 38, isCenter ? 42 : 38)
          .setStrokeStyle(2, 0xFFF7D8, 0.82)
          .setDepth(DEPTH_SYMBOLS + 14)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setAngle(45)
          .setScale(0.58)
          .setAlpha(0);

        const beam = this.textures?.exists?.("helldive_divine_wrath_beam")
          ? this.add.image(center.x, center.y - 72, "helldive_divine_wrath_beam")
              .setDepth(DEPTH_HERO + 51)
              .setBlendMode(Phaser.BlendModes.ADD)
              .setScale(0.2, 0.38)
              .setAlpha(0.78)
          : this.add.rectangle(center.x, center.y - 82, 12, 164, 0xFFFBE0, 0.66)
              .setDepth(DEPTH_HERO + 51)
              .setBlendMode(Phaser.BlendModes.ADD)
              .setScale(0.24, 0.22);
        beam.setAlpha(0);

        const sealGlow = this.add.circle(center.x, center.y, isCenter ? 30 : 24, 0xFFF2BC, 0.18)
          .setDepth(DEPTH_SYMBOLS + 15)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setScale(0.24)
          .setAlpha(0);

        const fxParts = [litPlate, litPlateGlow, ground, rune, pentagram, innerRune, beam, sealGlow];
        this.heavenHellDivineGroundFx.push(...fxParts);
        this.createHeavenHellDivineStrikeGroundGlitter?.(center, {
          wave: waveIndex,
          intensity: isCenter ? 2 : 1
        });

        this.tweens.add({
          targets: [litPlate, litPlateGlow, ground, rune, pentagram, innerRune],
          alpha: 0.94,
          duration: 110,
          ease: "Sine.easeOut"
        });
        this.tweens.add({
          targets: [litPlate, litPlateGlow, ground, rune],
          scale: (target, key, value) => (Number(value) || 1) * 1.1,
          duration: 150,
          yoyo: true,
          repeat: 1,
          ease: "Cubic.easeOut"
        });
        this.tweens.add({
          targets: pentagram,
          angle: pentagram.angle + 28,
          scale: 1.12,
          alpha: 0.82,
          duration: 240,
          ease: "Sine.easeOut"
        });
        this.tweens.add({
          targets: innerRune,
          angle: innerRune.angle + 25,
          scale: 1.02,
          duration: 240,
          ease: "Sine.easeOut"
        });
        this.tweens.add({
          targets: beam,
          alpha: 0.92,
          scaleX: (beam.scaleX || 1) * 3.4,
          scaleY: (beam.scaleY || 1) * 1.4,
          duration: 320,
          ease: "Cubic.easeOut"
        });
        this.tweens.add({
          targets: sealGlow,
          alpha: 0.56,
          scale: 2.4,
          duration: 280,
          ease: "Cubic.easeOut"
        });

        const holdMs = isCenter ? 520 : 460 + waveIndex * 80;
        const fadeMs = isCenter ? 820 : 720 + waveIndex * 90;
        const beamFadeStartMs = Math.max(140, Math.floor(holdMs * 0.5));
        const beamFadeMs = Math.max(140, Math.floor((isCenter ? 430 : 360) * 0.5));
        this.time.delayedCall(holdMs, () => {
          const activeFx = fxParts.filter((fx) => fx && !fx.destroyed);
          if (activeFx.length === 0) return;

          this.tweens.add({
            targets: [litPlate, litPlateGlow, ground, rune, pentagram, innerRune, sealGlow],
            alpha: 0,
            duration: fadeMs,
            ease: "Sine.easeOut"
          });
          this.tweens.add({
            targets: litPlate,
            scaleX: (litPlate.scaleX || 1) * 1.14,
            scaleY: (litPlate.scaleY || 1) * 1.14,
            duration: fadeMs,
            ease: "Sine.easeOut"
          });
          this.tweens.add({
            targets: litPlateGlow,
            scaleX: (litPlateGlow.scaleX || 1) * 1.22,
            scaleY: (litPlateGlow.scaleY || 1) * 1.22,
            duration: fadeMs,
            ease: "Sine.easeOut"
          });
          this.tweens.add({
            targets: ground,
            scaleX: (ground.scaleX || 1) * 1.18,
            scaleY: (ground.scaleY || 1) * 1.18,
            duration: fadeMs,
            ease: "Sine.easeOut"
          });
          this.tweens.add({
            targets: rune,
            angle: rune.angle + 18,
            scale: 1.22,
            duration: fadeMs,
            ease: "Sine.easeOut"
          });
          this.tweens.add({
            targets: pentagram,
            angle: pentagram.angle - 34,
            scale: 1.24,
            duration: fadeMs,
            ease: "Sine.easeOut"
          });
          this.tweens.add({
            targets: innerRune,
            angle: innerRune.angle - 28,
            scale: 1.14,
            duration: fadeMs,
            ease: "Sine.easeOut"
          });
        });

        this.time.delayedCall(beamFadeStartMs, () => {
          if (!beam || beam.destroyed) return;
          this.tweens.add({
            targets: beam,
            alpha: 0,
            scaleX: (beam.scaleX || 1) * 1.25,
            duration: beamFadeMs,
            ease: "Sine.easeOut"
          });
        });

        return fxParts;
      },

    createHeavenHellDivineStrikeReachMarker(center = null, { wave = 0, distance = 0, isOrigin = false, isKilled = false, onImpact = null } = {}) {
        if (!center) return [];
        if (!Array.isArray(this.heavenHellDivineGroundFx)) {
          this.heavenHellDivineGroundFx = [];
        }

        const waveIndex = Math.max(0, Math.floor(Number(wave) || 0));
        const distanceIndex = Math.max(0, Math.floor(Number(distance) || 0));
        const plateAlpha = isKilled ? 0.26 : (isOrigin ? 0.22 : 0.16);
        const starAlpha = isKilled ? 0.2 : (isOrigin ? 0.16 : 0.12);
        const plate = this.add.rectangle(center.x, center.y + 4, 62, 62, 0xFFE3A0, plateAlpha)
          .setDepth(DEPTH_SYMBOLS + 8)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setAngle(45)
          .setScale(0.7)
          .setAlpha(0);
        const frame = this.add.rectangle(center.x, center.y + 4, 66, 66)
          .setDepth(DEPTH_SYMBOLS + 9)
          .setStrokeStyle(isKilled ? 3 : 2, isKilled ? 0xFFF4D0 : 0xFFE8B2, isKilled ? 0.86 : 0.62)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setAngle(45)
          .setScale(0.66)
          .setAlpha(0);
        const star = typeof this.add.star === "function"
          ? this.add.star(center.x, center.y, 5, isKilled ? 9 : 8, isKilled ? 20 : 18, 0xFFF3C6, starAlpha)
          : this.add.circle(center.x, center.y, isKilled ? 18 : 16, 0xFFF3C6, starAlpha);
        star
          .setDepth(DEPTH_SYMBOLS + 10)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setAngle(isOrigin ? -18 : -10)
          .setScale(isOrigin ? 0.46 : 0.4)
          .setAlpha(0);
        const pulse = this.add.circle(center.x, center.y, isKilled ? 16 : 14, isKilled ? 0xFFF0C2 : 0xFFE5AE, isKilled ? 0.22 : 0.14)
          .setDepth(DEPTH_SYMBOLS + 11)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setScale(0.22)
          .setAlpha(0);
        const beam = this.textures?.exists?.("helldive_divine_wrath_beam")
          ? this.add.image(center.x, center.y - 68, "helldive_divine_wrath_beam")
              .setDepth(DEPTH_HERO + 50)
              .setBlendMode(Phaser.BlendModes.ADD)
              .setScale(isKilled ? 0.16 : 0.12, isKilled ? 0.32 : 0.24)
          : this.add.rectangle(
              center.x,
              center.y - 76,
              isKilled ? 10 : 8,
              isKilled ? 150 : 126,
              0xFFFBE0,
              isKilled ? 0.78 : 0.56
            )
              .setDepth(DEPTH_HERO + 50)
              .setBlendMode(Phaser.BlendModes.ADD)
              .setScale(0.22, 0.18);
        beam.setAlpha(0);
        const beamFlare = this.add.circle(center.x, center.y, isKilled ? 20 : 16, isKilled ? 0xFFF2C2 : 0xFFE5AE, isKilled ? 0.28 : 0.18)
          .setDepth(DEPTH_SYMBOLS + 12)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setScale(0.18)
          .setAlpha(0);

        const fxParts = [plate, frame, star, pulse, beam, beamFlare];
        this.heavenHellDivineGroundFx.push(...fxParts);
        this.createHeavenHellDivineStrikeGroundGlitter?.(center, {
          wave: waveIndex,
          intensity: isKilled ? 2 : 1
        });
        let impactTriggered = false;
        const triggerImpact = () => {
          if (impactTriggered) return;
          impactTriggered = true;
          onImpact?.();
        };

        this.tweens.add({
          targets: [plate, frame, star],
          alpha: 0.92,
          duration: 90,
          ease: "Sine.easeOut"
        });
        this.tweens.add({
          targets: [plate, frame],
          scale: (target, key, value) => (Number(value) || 1) * 1.08,
          duration: 140,
          ease: "Cubic.easeOut"
        });
        this.tweens.add({
          targets: star,
          alpha: isKilled ? 0.92 : 0.7,
          angle: star.angle + (isOrigin ? 24 : 18),
          scale: isOrigin ? 1.02 : 0.92,
          duration: 220,
          ease: "Sine.easeOut"
        });
        this.tweens.add({
          targets: beam,
          alpha: isKilled ? 0.96 : 0.72,
          scaleX: (beam.scaleX || 1) * (isKilled ? 4.4 : 3.4),
          scaleY: (beam.scaleY || 1) * (isKilled ? 1.55 : 1.35),
          duration: isKilled ? 250 : 220,
          ease: "Cubic.easeOut",
          onStart: triggerImpact
        });
        this.tweens.add({
          targets: beamFlare,
          alpha: isKilled ? 0.72 : 0.46,
          scale: isKilled ? 2.7 : 2.1,
          duration: isKilled ? 240 : 220,
          ease: "Cubic.easeOut"
        });
        this.tweens.add({
          targets: pulse,
          alpha: isKilled ? 0.7 : 0.48,
          scale: 2 + waveIndex * 0.08 + distanceIndex * 0.06,
          duration: 240,
          ease: "Cubic.easeOut"
        });

        const holdMs = 280 + waveIndex * 40 + distanceIndex * 50;
        const fadeMs = isKilled ? 700 : 620;
        const beamFadeStartMs = Math.max(120, Math.floor(holdMs * 0.5));
        const beamFadeMs = Math.max(120, Math.floor((isKilled ? 280 : 240) * 0.5));
        this.time.delayedCall(holdMs, () => {
          const activeFx = fxParts.filter((fx) => fx && !fx.destroyed);
          if (activeFx.length === 0) return;
          this.tweens.add({
            targets: [plate, frame, star, pulse, beamFlare],
            alpha: 0,
            duration: fadeMs,
            ease: "Sine.easeOut"
          });
          this.tweens.add({
            targets: plate,
            scaleX: (plate.scaleX || 1) * 1.12,
            scaleY: (plate.scaleY || 1) * 1.12,
            duration: fadeMs,
            ease: "Sine.easeOut"
          });
          this.tweens.add({
            targets: frame,
            angle: frame.angle + 12,
            scale: 1.16,
            duration: fadeMs,
            ease: "Sine.easeOut"
          });
          this.tweens.add({
            targets: star,
            angle: star.angle - 24,
            scale: 1.14,
            duration: fadeMs,
            ease: "Sine.easeOut"
          });
        });

        this.time.delayedCall(beamFadeStartMs, () => {
          if (!beam || beam.destroyed) return;
          this.tweens.add({
            targets: beam,
            alpha: 0,
            scaleX: (beam.scaleX || 1) * 1.28,
            duration: beamFadeMs,
            ease: "Sine.easeOut"
          });
        });

        return fxParts;
      },

    async playHeavenHellDivineStrikeAtStep(step = {}, gameState = {}, { stepQuickStop = false, origin = null, waitForLootDrop = true } = {}) {
        if (stepQuickStop || step?.divineStrikeProc !== true) return;
        if (gameState?.heavenHell?.bonus && gameState?.isBonus === true) {
          this._heavenHellActiveGameState = gameState;
        }

        const strikeTargets = Array.isArray(step?.divineStrikeTargets) ? step.divineStrikeTargets : [];
        if (strikeTargets.length === 0) return;

        this.playSfx?.("divine_strike_impact", { volume: 0.58 }, { allowDuringFastForward: false });

        this.clearHeavenHellDivineGroundFx?.({ fade: true });

        const heroX = Number(this.heroSprite?.x || (origin?.x ?? (GRID_OFFSET_X + (clientConfig.area.width * 70) * 0.5)));
        const heroY = Number(this.heroSprite?.y || (origin?.y ?? (GRID_OFFSET_Y + (clientConfig.area.height * 70) * 0.5)));
        const originPoint = {
          x: Number(origin?.x || heroX),
          y: Number(origin?.y || heroY)
        };
        const killedCells = [];
        const lootCells = [];
        const lootCellKeys = new Set();
        const killedKeys = new Set();
        const markedReachKeys = new Set();
        const pushLootCell = (reel, row) => {
          const cellReel = Math.floor(Number(reel));
          const cellRow = Math.floor(Number(row));
          if (!Number.isFinite(cellReel) || !Number.isFinite(cellRow)) return;
          const key = `${cellReel},${cellRow}`;
          if (lootCellKeys.has(key)) return;
          lootCellKeys.add(key);
          lootCells.push({ reel: cellReel, row: cellRow });
        };
        const waves = [...new Set(strikeTargets.map((target) => Math.max(0, Math.floor(Number(target?.wave) || 0))))].sort((a, b) => a - b);
        const orderedTargets = waves.flatMap((wave) => (
          strikeTargets
            .filter((target) => Math.max(0, Math.floor(Number(target?.wave) || 0)) === wave)
            .sort((a, b) => Number(a?.row) - Number(b?.row) || Number(a?.reel) - Number(b?.reel))
            .map((target) => ({ ...target, wave }))
        ));
        const pentagramStrikeEvents = this.getHeavenHellPentagramAbilityEvents?.(
          gameState,
          step?.pathIndex,
          "divineStrike"
        ) || [];
        const pentagramStrikeEventMap = new Map();
        pentagramStrikeEvents.forEach((event) => {
          const key = this.getHeavenHellPentagramDivineStrikeTargetKeyForEvent?.(event, orderedTargets);
          if (!key) return;
          if (!pentagramStrikeEventMap.has(key)) {
            pentagramStrikeEventMap.set(key, []);
          }
          pentagramStrikeEventMap.get(key).push(event);
        });

        for (let targetIndex = 0; targetIndex < orderedTargets.length; targetIndex++) {
          const target = orderedTargets[targetIndex];
          const wave = Math.max(0, Math.floor(Number(target?.wave) || 0));
          const reel = Math.floor(Number(target?.reel));
          const row = Math.floor(Number(target?.row));
          if (!Number.isFinite(reel) || !Number.isFinite(row)) continue;

          const center = this.getGridCellCenter(reel, row);
          this.createHeavenHellDivineStrikeSigil?.(center, {
            wave,
            isCenter: target?.center === true
          });
          const strikeImpact = this.add.circle(center.x, center.y, target?.center === true ? 20 : 18, 0xFFEAB0, 0.18)
            .setDepth(DEPTH_SYMBOLS + 15)
            .setStrokeStyle(4, 0xFFF8D4, 0.92)
            .setBlendMode(Phaser.BlendModes.ADD)
            .setScale(0.42);
          if (target?.center !== true) {
            this.createHeavenHellDivineXWaveMarker?.(center, { wave: Math.max(1, wave) });
          }
          this.heavenHellDivineGroundFx.push(strikeImpact);
          this.tweens.add({ targets: strikeImpact, scale: 3.6, alpha: 0, duration: 220, ease: "Cubic.easeOut" });
          this.playSfx?.(this.getHeavenHellRandomAbilitySwingSfxKey?.() || "attack_swing", { volume: 0.24, rate: 0.98 + wave * 0.04 });
          this.playSfx?.("lightning_thor", { volume: 0.18, rate: 0.96 + wave * 0.04 });
          this.playHeavenHellAngelStrikeSlash?.(originPoint, center, {
            scale: target?.center === true ? 0.96 : 0.88 + wave * 0.05
          });
          if (targetIndex < orderedTargets.length - 1) {
            await this.waitForPresentation(14, { skippable: true });
          }
        }

        for (const target of orderedTargets) {
          const wave = Math.max(0, Math.floor(Number(target?.wave) || 0));
          const hitCells = Array.isArray(target?.hitCells) ? target.hitCells : [];
          hitCells.forEach((cell) => {
            const cellReel = Math.floor(Number(cell?.reel));
            const cellRow = Math.floor(Number(cell?.row));
            if (!Number.isFinite(cellReel) || !Number.isFinite(cellRow)) return;

            const cellCenter = this.getGridCellCenter(cellReel, cellRow);
            const reachKey = `${cellReel},${cellRow}`;
            if (!markedReachKeys.has(reachKey)) {
              markedReachKeys.add(reachKey);
              const pentagramEventsAtCell = pentagramStrikeEventMap.get(`${cellReel},${cellRow},${wave}`) || [];
              this.createHeavenHellDivineStrikeReachMarker?.(cellCenter, {
                wave,
                distance: Number(cell?.distance || 0),
                isOrigin: cell?.origin === true,
                isKilled: cell?.killed === true,
                onImpact: pentagramEventsAtCell.length > 0
                  ? () => {
                      pentagramEventsAtCell.forEach((event) => {
                        void this.playHeavenHellPentagramActivationEvent?.(event);
                      });
                    }
                  : null
              });
            }

            if (cell?.killed === true || (cell?.hadDemon === true && cell?.origin === true)) {
              pushLootCell(cellReel, cellRow);
            }
            if (cell?.killed !== true) return;
            if (killedKeys.has(reachKey)) return;
            killedKeys.add(reachKey);

            const sprite = this.reelSprites?.[cellReel]?.[cellRow];
            if (sprite && !sprite.destroyed) {
              this.playHeavenHellDemonDeathFx?.(cellReel, cellRow, {
                center: cellCenter,
                intensity: cell?.origin === true ? 1.22 : 1.02,
                destroySprite: true,
                gameState,
                killWeight: cell?.killCountMultiplier,
                divineXDoubleKill: cell?.divineXDoubleKill === true,
                isMultiplierDemon: cell?.isMultiplierDemon === true
              });
            } else if (cell?.isMultiplierDemon === true && this.shouldConsumeHeavenHellMultiplierOrbAt(cellReel, cellRow, {
              gameState,
              isMultiplierDemon: true
            })) {
              this.dropHeavenHellMultiplierDemonOrb(cellCenter.x, cellCenter.y);
            }
            if (this.reelSprites?.[cellReel]) {
              this.reelSprites[cellReel][cellRow] = null;
            }
            killedCells.push({ reel: cellReel, row: cellRow });
          });
        }

        this.pushHeavenHellStepBananaLootCells(step, pushLootCell);

        this.cameras?.main?.shake?.(130, 0.0042);
        await this.waitForPresentation(44, { skippable: true });

        if (lootCells.length > 0) {
          const lootDropPromise = this.playHeavenHellLootDropPattern(gameState, {
            source: "divineStrike",
            launchFromDropCell: true,
            jitterStrength: this.getHeavenHellChargeLootJitter(step),
            filterCells: lootCells,
            persistToGround: true
          });
          if (waitForLootDrop) {
            await lootDropPromise;
          } else {
            this.trackHeavenHellPendingGroundPresentation(lootDropPromise, { kind: "loot" });
          }
        }

        this.time.delayedCall(1800, () => this.clearHeavenHellDivineGroundFx?.({ fade: true }));
      },

    async playHeavenHellDivineXAtStep(step = {}, gameState = {}, { stepQuickStop = false, origin = null, strikeAtTargets = false, waitForLootDrop = true } = {}) {
        if (stepQuickStop || step?.divineXProc !== true) return;
        if (gameState?.heavenHell?.bonus && gameState?.isBonus === true) {
          this._heavenHellActiveGameState = gameState;
        }

        const xTargets = Array.isArray(step?.divineXTargets) ? step.divineXTargets : [];
        if (xTargets.length === 0) return;

        const divineXSoundWasPrimed = step?._clientDivineXImpactSoundPrimed === true;
        step._clientDivineXImpactSoundPrimed = false;
        if (!divineXSoundWasPrimed) {
          this.playHeavenHellDivineXImpactSound?.({ impactLeadMs: 0, volume: 0.6 });
        }

        this.clearHeavenHellDivineGroundFx?.({ fade: true });

        const heroX = Number(this.heroSprite?.x || (origin?.x ?? (GRID_OFFSET_X + (clientConfig.area.width * 70) * 0.5)));
        const heroY = Number(this.heroSprite?.y || (origin?.y ?? (GRID_OFFSET_Y + (clientConfig.area.height * 70) * 0.5)));
        const originPoint = {
          x: Number(origin?.x || heroX),
          y: Number(origin?.y || heroY)
        };
        const title = this.add.text(heroX, heroY - 96, "DIVINE X", {
          fontSize: "22px",
          fontFamily: '"Cinzel", "Times New Roman", serif',
          fontStyle: "bold",
          color: "#FFE4FF",
          stroke: "#420C56",
          strokeThickness: 6
        }).setOrigin(0.5).setDepth(DEPTH_HERO + 52).setAlpha(0);
        if (title) {
          this.tweens.add({
            targets: title,
            alpha: 1,
            y: strikeAtTargets ? heroY - 108 : heroY - 116,
            duration: strikeAtTargets ? 100 : 120,
            ease: "Sine.easeOut"
          });
        }

        const waves = [...new Set(xTargets.map((target) => Math.max(1, Math.floor(Number(target?.wave) || 1))))].sort((a, b) => a - b);
        const divineStrikeTargets = Array.isArray(step?.divineStrikeTargets) ? step.divineStrikeTargets : [];
        const divineStrikeTargetMap = new Map(
          divineStrikeTargets
            .filter((entry) => Number.isFinite(Number(entry?.reel)) && Number.isFinite(Number(entry?.row)))
            .map((entry) => [`${Math.floor(Number(entry.reel))},${Math.floor(Number(entry.row))}`, entry])
        );
        const killedCells = [];
        const lootCells = [];
        const lootCellKeys = new Set();
        const killedKeys = new Set();
        const pushLootCell = (reel, row) => {
          const cellReel = Math.floor(Number(reel));
          const cellRow = Math.floor(Number(row));
          if (!Number.isFinite(cellReel) || !Number.isFinite(cellRow)) return;
          const key = `${cellReel},${cellRow}`;
          if (lootCellKeys.has(key)) return;
          lootCellKeys.add(key);
          lootCells.push({ reel: cellReel, row: cellRow });
        };

        const orderedXTargets = waves.flatMap((wave) => (
          xTargets
            .filter((target) => Math.max(1, Math.floor(Number(target?.wave) || 1)) === wave)
            .sort((a, b) => Number(a?.row) - Number(b?.row) || Number(a?.reel) - Number(b?.reel))
            .map((target) => ({ ...target, wave }))
        ));
        const pentagramDivineXEvents = this.getHeavenHellPentagramAbilityEvents?.(
          gameState,
          step?.pathIndex,
          "divineX"
        ) || [];
        const pentagramDivineXEventMap = new Map();
        pentagramDivineXEvents.forEach((event) => {
          const targetKey = this.getHeavenHellPentagramDivineXTargetKeyForEvent?.(event, orderedXTargets);
          if (!targetKey) return;
          if (!pentagramDivineXEventMap.has(targetKey)) {
            pentagramDivineXEventMap.set(targetKey, []);
          }
          pentagramDivineXEventMap.get(targetKey).push(event);
        });

        const telegraphDivineXTarget = (target) => {
          const wave = Math.max(1, Math.floor(Number(target?.wave) || 1));
          const reel = Math.floor(Number(target?.reel));
          const row = Math.floor(Number(target?.row));
          if (!Number.isFinite(reel) || !Number.isFinite(row)) return null;

          const center = this.getGridCellCenter(reel, row);
          this.createHeavenHellDivineXCrossRays?.(center, { wave });
          this.createHeavenHellDivineXWaveMarker?.(center, { wave });

          if (strikeAtTargets) {
            this.playSfx?.(this.getHeavenHellRandomAbilitySwingSfxKey?.() || "attack_swing", { volume: 0.22, rate: 1.02 + wave * 0.03 });
            this.playHeavenHellAngelStrikeSlash?.(originPoint, center, {
              scale: 0.82 + wave * 0.06,
              palette: "divineX",
              gifEffect: "attack2"
            });
          } else {
            this.playSfx?.("lightning_thor", { volume: 0.22, rate: 1.14 + wave * 0.02 });
          }
          return center;
        };

        const showDivineXHitLabel = (center, wave = 1) => {
          if (!center) return;
          this.createHeavenHellAbilityImpactLabel?.(center.x, center.y - 18, "DIVINE X", {
            depth: DEPTH_HERO + 57,
            fontSize: "18px",
            scale: 0.66 + Math.min(0.12, Math.max(0, Number(wave) - 1) * 0.03),
            rise: 34,
            duration: 760,
            driftY: -8,
            color: "#FFE6FF",
            stroke: "#4A1368",
            shadow: "#21052D"
          });
        };

        const resolveDivineXTargetKills = (target) => {
          const wave = Math.max(1, Math.floor(Number(target?.wave) || 1));
          const reel = Math.floor(Number(target?.reel));
          const row = Math.floor(Number(target?.row));
          if (!Number.isFinite(reel) || !Number.isFinite(row)) return;
          const pentagramEventsAtTarget = pentagramDivineXEventMap.get(`${reel},${row},${wave}`) || [];

          const center = this.getGridCellCenter(reel, row);
          const linkedStrikeTarget = strikeAtTargets
            ? divineStrikeTargetMap.get(`${reel},${row}`)
            : null;
          const strikeHitCells = Array.isArray(linkedStrikeTarget?.hitCells) ? linkedStrikeTarget.hitCells : [];

          if (linkedStrikeTarget) {
              this.createHeavenHellDivineStrikeSigil?.(center, {
                wave,
                isCenter: false
              });
              const strikeImpact = this.add.circle(center.x, center.y, 18, 0xFF8AF4, 0.3)
                .setDepth(DEPTH_SYMBOLS + 15)
                .setBlendMode(Phaser.BlendModes.ADD);
              const strikeBloom = this.add.circle(center.x, center.y, 14, 0xFFD4FF, 0.24)
                .setDepth(DEPTH_SYMBOLS + 14)
                .setBlendMode(Phaser.BlendModes.ADD)
                .setScale(0.4);
              this.heavenHellDivineGroundFx.push(strikeImpact);
              this.heavenHellDivineGroundFx.push(strikeBloom);
              this.playSfx?.("lightning_thor_impact", { volume: 0.2, rate: 1.04 + wave * 0.03 });
              this.tweens.add({
                targets: strikeImpact,
                scale: 3.4,
                alpha: 0,
                duration: 300,
                ease: "Cubic.easeOut",
                onStart: () => {
                  pentagramEventsAtTarget.forEach((event) => {
                    void this.playHeavenHellPentagramActivationEvent?.(event);
                  });
                }
              });
              this.tweens.add({
                targets: strikeBloom,
                scale: 2.8,
                alpha: 0,
                duration: 280,
                ease: "Cubic.easeOut"
              });

              if (strikeHitCells.some((cell) => cell?.killed === true)) {
                showDivineXHitLabel(center, wave);
              }

              strikeHitCells.forEach((cell) => {
                const cellReel = Math.floor(Number(cell?.reel));
                const cellRow = Math.floor(Number(cell?.row));
                if (!Number.isFinite(cellReel) || !Number.isFinite(cellRow)) return;

                const cellCenter = this.getGridCellCenter(cellReel, cellRow);
                const ripple = this.add.circle(cellCenter.x, cellCenter.y, cell?.origin === true ? 14 : 12, cell?.origin === true ? 0xFF89F3 : 0xD96BFF, 0.18)
                  .setDepth(DEPTH_SYMBOLS + 13)
                  .setStrokeStyle(cell?.origin === true ? 3 : 2, cell?.origin === true ? 0xFFE5FF : 0xF6D7FF, 0.86)
                  .setBlendMode(Phaser.BlendModes.ADD)
                  .setScale(0.45);
                this.heavenHellDivineGroundFx.push(ripple);
                this.tweens.add({
                  targets: ripple,
                  scale: cell?.origin === true ? 1.9 : 1.5,
                  alpha: 0,
                  duration: 260,
                  ease: "Cubic.easeOut"
                });

                if (cell?.killed !== true) return;
                const key = `${cellReel},${cellRow}`;
                if (killedKeys.has(key)) return;
                killedKeys.add(key);

                const sprite = this.reelSprites?.[cellReel]?.[cellRow];
                if (sprite && !sprite.destroyed) {
                  this.playHeavenHellDemonDeathFx?.(cellReel, cellRow, {
                    center: cellCenter,
                    intensity: cell?.origin === true ? 1.22 : 1.04,
                    destroySprite: true,
                    gameState,
                    killWeight: cell?.killCountMultiplier,
                    divineXDoubleKill: cell?.divineXDoubleKill === true,
                    isMultiplierDemon: cell?.isMultiplierDemon === true
                  });
                } else if (cell?.isMultiplierDemon === true && this.shouldConsumeHeavenHellMultiplierOrbAt(cellReel, cellRow, {
                  gameState,
                  isMultiplierDemon: true
                })) {
                  this.dropHeavenHellMultiplierDemonOrb(cellCenter.x, cellCenter.y);
                }
                if (this.reelSprites?.[cellReel]) {
                  this.reelSprites[cellReel][cellRow] = null;
                }
                killedCells.push({ reel: cellReel, row: cellRow });
                pushLootCell(cellReel, cellRow);
              });
            } else if (target?.killed === true) {
              const targetImpactPulse = this.add.circle(center.x, center.y, 14, 0xF0C6FF, 0.22)
                .setDepth(DEPTH_SYMBOLS + 15)
                .setBlendMode(Phaser.BlendModes.ADD)
                .setScale(0.42);
              this.heavenHellDivineGroundFx.push(targetImpactPulse);
              this.tweens.add({
                targets: targetImpactPulse,
                scale: 2.6,
                alpha: 0,
                duration: 240,
                ease: "Cubic.easeOut",
                onStart: () => {
                  pentagramEventsAtTarget.forEach((event) => {
                    void this.playHeavenHellPentagramActivationEvent?.(event);
                  });
                }
              });
              const sprite = this.reelSprites?.[reel]?.[row];
              if (sprite && !sprite.destroyed) {
                showDivineXHitLabel(center, wave);
                this.playHeavenHellDemonDeathFx?.(reel, row, {
                  center,
                  intensity: strikeAtTargets ? 1.18 : 0.98,
                  destroySprite: true,
                  gameState,
                  killWeight: target?.killCountMultiplier,
                  divineXDoubleKill: target?.divineXDoubleKill === true,
                  isMultiplierDemon: target?.isMultiplierDemon === true
                });
              } else if (target?.isMultiplierDemon === true && this.shouldConsumeHeavenHellMultiplierOrbAt(reel, row, {
                gameState,
                isMultiplierDemon: true
              })) {
                this.dropHeavenHellMultiplierDemonOrb(center.x, center.y);
              }
              if (this.reelSprites?.[reel]) {
                this.reelSprites[reel][row] = null;
              }
              killedKeys.add(`${reel},${row}`);
              killedCells.push({ reel, row });
              pushLootCell(reel, row);
            }
        };

        if (strikeAtTargets) {
          for (let targetIndex = 0; targetIndex < orderedXTargets.length; targetIndex++) {
            const target = orderedXTargets[targetIndex];
            telegraphDivineXTarget(target);
            if (targetIndex < orderedXTargets.length - 1) {
              await this.waitForPresentation(12, { skippable: true });
            }
          }
          for (const target of orderedXTargets) {
            resolveDivineXTargetKills(target);
          }
        } else {
          for (const wave of waves) {
            const waveTargets = orderedXTargets.filter((target) => Math.max(1, Math.floor(Number(target?.wave) || 1)) === wave);
            for (const target of waveTargets) {
              telegraphDivineXTarget(target);
              resolveDivineXTargetKills(target);
              await this.waitForPresentation(16, { skippable: true });
            }
            this.cameras?.main?.shake?.(110, 0.0032 + wave * 0.001);
            await this.waitForPresentation(24, { skippable: true });
          }
        }

        this.pushHeavenHellStepBananaLootCells(step, pushLootCell);

        if (title) {
          this.tweens.add({
            targets: title,
            alpha: 0,
            y: title.y - 18,
            duration: 160,
            ease: "Sine.easeOut",
            onComplete: () => title.destroy()
          });
        }

        if (strikeAtTargets) {
          this.cameras?.main?.shake?.(110, 0.0036);
        }

        if (lootCells.length > 0) {
          const lootDropPromise = this.playHeavenHellLootDropPattern(gameState, {
            source: "divineX",
            launchFromDropCell: true,
            jitterStrength: this.getHeavenHellChargeLootJitter(step),
            filterCells: lootCells,
            persistToGround: true
          });
          if (waitForLootDrop) {
            await lootDropPromise;
          } else {
            this.trackHeavenHellPendingGroundPresentation(lootDropPromise, { kind: "loot" });
          }
        }

        this.time.delayedCall(1800, () => this.clearHeavenHellDivineGroundFx?.({ fade: true }));
      },

    async playHeavenHellDivineXAreaTelegraph(gameState = {}) {
        if (gameState?.heavenHell?.bonus && gameState?.isBonus === true) {
          this._heavenHellActiveGameState = gameState;
        }
      },

    getHeavenHellMeterPanelPosition() {
        const cellSize = 70;
        const gridWidth = clientConfig.area.width * cellSize;
        const gridHeight = clientConfig.area.height * cellSize;
        return {
          centerX: GRID_OFFSET_X + gridWidth / 2,
          centerY: GRID_OFFSET_Y + gridHeight + 52
        };
      },

    getHeavenHellMeterSoulIntakePosition() {
        const ui = this._heavenHellMeterUi;
        if (ui?.container && !ui.container.destroyed) {
          const matrix = ui.container.getWorldTransformMatrix();
          const meterCenterLocalX = Number(ui.meterX ?? 0) + (Number(ui.meterWidth ?? 320) * 0.5);
          const meterY = Number(ui.meterY ?? -2);
          return {
            x: matrix.tx + meterCenterLocalX * matrix.scaleX,
            y: matrix.ty + meterY * matrix.scaleY
          };
        }

        const { centerX, centerY } = this.getHeavenHellMeterPanelPosition();
        return {
          x: centerX,
          y: centerY - 2
        };
      },

    incrementHeavenHellPendingMeterSoulTrails() {
        this._heavenHellPendingMeterSoulTrails = Math.max(
          0,
          Math.floor(Number(this._heavenHellPendingMeterSoulTrails) || 0)
        ) + 1;
      },

    decrementHeavenHellPendingMeterSoulTrails() {
        this._heavenHellPendingMeterSoulTrails = Math.max(
          0,
          Math.floor(Number(this._heavenHellPendingMeterSoulTrails) || 0) - 1
        );
      },

    hasPendingHeavenHellMeterSoulTrails() {
        return Math.max(0, Math.floor(Number(this._heavenHellPendingMeterSoulTrails) || 0)) > 0;
      },

    async waitForHeavenHellPendingMeterSoulTrails(timeoutMs = 5000) {
        const deadline = Date.now() + Math.max(500, Math.floor(Number(timeoutMs) || 5000));
        while (this.hasPendingHeavenHellMeterSoulTrails() && Date.now() < deadline) {
          await this.waitForPresentation?.(40, { skippable: true });
        }
      },

    pulseHeavenHellMeterOnSoulIntake() {
        const ui = this._heavenHellMeterUi;
        if (!ui?.container || ui.container.destroyed) return;

        const meterCenterX = ui.container.x + (Number(ui.meterX ?? 0) + Number(ui.meterWidth ?? 320) * 0.5);
        const meterCenterY = ui.container.y + (ui.meterY ?? -2);
        const meterWidth = ui.meterWidth ?? 320;
        const meterHeight = ui.meterHeight ?? 9;

        const barFlash = this.add.rectangle(
          meterCenterX,
          meterCenterY,
          meterWidth + 8,
          meterHeight + 10,
          0xFF3355,
          0.82
        )
          .setDepth(BONUS_SOUL_COLLECT_INTAKE_DEPTH + 1)
          .setBlendMode(Phaser.BlendModes.ADD);
        const barGlow = this.add.rectangle(
          meterCenterX,
          meterCenterY,
          meterWidth + 20,
          meterHeight + 18,
          0xFF6688,
          0.34
        )
          .setDepth(BONUS_SOUL_COLLECT_INTAKE_DEPTH)
          .setBlendMode(Phaser.BlendModes.ADD);
        this.tweens.add({
          targets: [barFlash, barGlow],
          alpha: 0,
          scaleX: 1.12,
          scaleY: 1.35,
          duration: 320,
          ease: "Cubic.easeOut",
          onComplete: () => {
            if (barFlash && !barFlash.destroyed) barFlash.destroy();
            if (barGlow && !barGlow.destroyed) barGlow.destroy();
          }
        });

        if (ui.trackBg && !ui.trackBg.destroyed) {
          this.tweens.killTweensOf(ui.trackBg);
          ui.trackBg.setFillStyle(0xAA1122, 0.98);
          this.tweens.add({
            targets: ui.trackBg,
            alpha: { from: 1, to: 0.55 },
            duration: 90,
            yoyo: true,
            repeat: 2,
            ease: "Sine.easeInOut",
            onComplete: () => {
              if (ui.trackBg && !ui.trackBg.destroyed) {
                ui.trackBg.setFillStyle(0x090706, 0.95);
                ui.trackBg.setAlpha(1);
              }
            }
          });
        }

        if (ui.killCountText && !ui.killCountText.destroyed) {
          const defaultColor = "#FFF4C8";
          ui.killCountText.setColor("#FF88AA");
          this.time.delayedCall(260, () => {
            if (ui.killCountText && !ui.killCountText.destroyed) {
              ui.killCountText.setColor(defaultColor);
            }
          });
        }

        this.tweens.add({
          targets: ui.container,
          scaleX: 1.05,
          scaleY: 1.05,
          duration: 120,
          yoyo: true,
          ease: "Back.easeOut"
        });
        if (ui.shimmer) {
          ui.shimmer.setVisible(true);
          this.tweens.add({
            targets: ui.shimmer,
            alpha: { from: 0.42, to: 0.95 },
            duration: 100,
            yoyo: true,
            ease: "Sine.easeOut"
          });
        }
        if (ui.outerGlow) {
          this.tweens.add({
            targets: ui.outerGlow,
            alpha: 0.34,
            duration: 140,
            yoyo: true,
            ease: "Sine.easeOut"
          });
        }
      },

    getHeavenHellBossKillWeight() {
        return 9;
      },

    getHeavenHellMeterUnlockCount(gameState = {}) {
        const procs = Array.isArray(gameState?.heavenHell?.bonus?.abilityProcsThisAction)
          ? gameState.heavenHell.bonus.abilityProcsThisAction
          : [];
        return procs.filter((entry) => entry?.type === "abilityUnlock" || entry?.type === "abilityReward").length;
      },

    getHeavenHellMeterActionPlan(gameState = {}) {
        const bonus = gameState?.heavenHell?.bonus;
        if (!bonus || gameState?.isBonus !== true) {
          return null;
        }
        const nextUnlock = Math.max(1, Math.floor(Number(bonus?.nextAbilityKillThreshold || 20)));
        const hasActionStart = Number.isFinite(Number(bonus?.killsTowardsUnlockAtActionStart));
        const hasPersistedStart = Number.isFinite(Number(this._heavenHellMeterDisplayKills));
        const startKills = hasActionStart
          ? Math.max(0, Math.floor(Number(bonus.killsTowardsUnlockAtActionStart)))
          : (hasPersistedStart
            ? Math.max(0, Math.floor(Number(this._heavenHellMeterDisplayKills)))
            : 0);
        const endKills = Math.max(
          0,
          Math.floor(
            Number(
              bonus?.killsTowardsUnlockBeforeSettlement ??
              bonus?.killsTowardsUnlock ??
              startKills
            )
          )
        );
        const weightedBudget = Math.max(0, endKills - startKills);
        return {
          startKills,
          endKills,
          nextUnlock,
          unlocks: 0,
          weightedBudget
        };
      },

    getHeavenHellKillWeightForCell(reel, row, gameState = {}) {
        const bossId = Number(clientConfig.symbolsMapping?.banana3 || TROLL_SYMBOL_ID || 13);
        const sprite = this.reelSprites?.[reel]?.[row];
        const spriteSymbol = Number(sprite?.symbolKey);
        if (Number.isFinite(spriteSymbol) && spriteSymbol > 0) {
          return spriteSymbol === bossId ? this.getHeavenHellBossKillWeight() : 1;
        }
        const affected = Array.isArray(gameState?.affectedPositions) ? gameState.affectedPositions : [];
        const match = affected.find((pos) => Number(pos?.reel) === reel && Number(pos?.row) === row);
        const wasSymbol = Number(match?.wasSymbol);
        if (Number.isFinite(wasSymbol) && wasSymbol > 0) {
          return wasSymbol === bossId ? this.getHeavenHellBossKillWeight() : 1;
        }
        return 1;
      },

    prepareHeavenHellKillMeterForAction(gameState = {}) {
        const bonus = gameState?.heavenHell?.bonus;
        if (!bonus || gameState?.isBonus !== true) return;
        const plan = this.getHeavenHellMeterActionPlan(gameState);
        if (!plan) return;
    
        this._heavenHellActiveGameState = gameState;
        this._heavenHellPendingMeterSoulTrails = 0;
        this._heavenHellMeterRuntime = {
          nextUnlock: plan.nextUnlock,
          endKills: plan.endKills,
          displayKills: plan.startKills,
          killBudgetRemaining: plan.weightedBudget
        };
        const presentationAbilities = this.getHeavenHellActionPresentationAbilities(gameState);
        const ui = this._heavenHellMeterUi;
        const prevProgress = ui
          ? Number(ui.lastProgress) || 0
          : Math.max(0, Math.min(1, plan.startKills / plan.nextUnlock));
        this.renderHeavenHellKillMeterDisplay({
          displayKills: plan.startKills,
          nextUnlock: plan.nextUnlock,
          abilities: presentationAbilities,
          prevProgress,
          allowRewardFx: false,
          skipUnlockBlink: true,
          skipMilestones: true
        });
      },

    tickHeavenHellKillMeterOnKill(reel, row, gameState = {}, { allowRewardFx = false, killWeight = null } = {}) {
        const bonus = gameState?.heavenHell?.bonus;
        if (!bonus || gameState?.isBonus !== true) return;
        if (!this._heavenHellMeterRuntime) {
          this.prepareHeavenHellKillMeterForAction(gameState);
        }
        const runtime = this._heavenHellMeterRuntime;
        if (!runtime) return;
        const persistedDisplayKills = Number.isFinite(Number(this._heavenHellMeterDisplayKills))
          ? Math.max(0, Math.floor(Number(this._heavenHellMeterDisplayKills)))
          : null;
        if (persistedDisplayKills !== null && persistedDisplayKills > runtime.displayKills) {
          runtime.displayKills = persistedDisplayKills;
          runtime.killBudgetRemaining = Math.max(0, runtime.endKills - runtime.displayKills);
        }
        if (runtime.killBudgetRemaining <= 0) return;
        const presentationAbilities = this.getHeavenHellActionPresentationAbilities(gameState);
    
        const ui = this._heavenHellMeterUi;
        const prevProgress = ui
          ? Number(ui.lastProgress) || 0
          : Math.max(0, Math.min(1, runtime.displayKills / runtime.nextUnlock));
        const resolvedKillWeight = Number.isFinite(Number(killWeight))
          ? Math.max(1, Math.floor(Number(killWeight) || 1))
          : this.getHeavenHellKillWeightForCell(reel, row, gameState);
        const appliedWeight = Math.min(resolvedKillWeight, runtime.killBudgetRemaining);
        if (appliedWeight <= 0) return;
    
        runtime.killBudgetRemaining -= appliedWeight;
        const previousDisplayKills = runtime.displayKills;
        runtime.displayKills = Math.max(0, runtime.displayKills + appliedWeight);
        if (previousDisplayKills < runtime.nextUnlock && runtime.displayKills >= runtime.nextUnlock) {
          this.playHeavenHellMeterMilestoneFx("ready");
        }
        this.renderHeavenHellKillMeterDisplay({
          displayKills: runtime.displayKills,
          nextUnlock: runtime.nextUnlock,
          abilities: presentationAbilities,
          prevProgress,
          allowRewardFx,
          skipUnlockBlink: true
        });
      },

    renderHeavenHellKillMeterDisplay({
        displayKills = 0,
        nextUnlock = 20,
        abilities = {},
        prevProgress = 0,
        allowRewardFx = false,
        skipUnlockBlink = false,
        skipMilestones = false,
        killsTotal = 0,
        actionCount = 0,
        procs = []
      } = {}) {
        const resolvedKills = Math.max(0, Math.floor(Number(displayKills) || 0));
        const resolvedUnlock = Math.max(1, Math.floor(Number(nextUnlock) || 20));
        const progress = Math.max(0, Math.min(1, resolvedKills / resolvedUnlock));
        const displayTextKills = resolvedKills;
        const ui = this.ensureHeavenHellAbilityPanel();
        const { centerX, centerY } = this.getHeavenHellMeterPanelPosition();
    
        ui.container.setPosition(centerX, centerY);
        ui.container.setVisible(true);
        ui.killCountText.setText(`⚔ ${displayTextKills} / ${resolvedUnlock}`);
        this.syncHeavenHellGroundLootDisplayText?.();
        this.redrawHeavenHellMeterFill(ui, progress);
        this.refreshHeavenHellAbilitySlots(ui, abilities);
    
        if (!skipMilestones) {
          if (prevProgress < 0.5 && progress >= 0.5) {
            this.playHeavenHellMeterMilestoneFx("half");
          }
          if (prevProgress < 0.75 && progress >= 0.75) {
            this.playHeavenHellMeterMilestoneFx("threeQuarter");
          }
          if (!skipUnlockBlink && prevProgress < 1 && progress >= 1) {
            this.playHeavenHellMeterMilestoneFx("ready");
          }
        }
        ui.lastProgress = progress;
        this._heavenHellMeterDisplayKills = resolvedKills;
    
        if (!skipUnlockBlink && resolvedKills >= resolvedUnlock && !this.heavenHellMeterBlinkTween) {
          this.playHeavenHellMeterBlink(2);
        }
        const awardedFreespins = this.getHeavenHellAwardedFreespinsThisAction(procs);
        if (allowRewardFx && awardedFreespins > 0) {
          const rewardFxKey = `reward:${actionCount}:${awardedFreespins}:${Math.floor(killsTotal)}`;
          if (this.heavenHellLastRewardFxKey !== rewardFxKey) {
            this.heavenHellLastRewardFxKey = rewardFxKey;
            this.playHeavenHellMeterBlink(4);
            this.playHeavenHellFreespinAwardPopup(awardedFreespins);
          }
        }
      },

    getHeavenHellAbilitySlotPalette(abilityKey = "divineX") {
        const palettes = {
          divineX: { fill: 0x7B4DFF, glow: 0xD8B8FF, empty: 0x171126 },
          divineStrike: { fill: 0xD94A2B, glow: 0xFFB48A, empty: 0x24140F },
          divineCharge: { fill: 0x3FA8FF, glow: 0xB8E8FF, empty: 0x0F1A28 }
        };
        return palettes[abilityKey] || palettes.divineX;
      },

    destroyHeavenHellAbilityPanel() {
        const ui = this._heavenHellMeterUi;
        if (!ui) return;
        if (ui.shimmerTween) {
          ui.shimmerTween.stop();
          ui.shimmerTween = null;
        }
        if (ui.container && !ui.container.destroyed) {
          ui.container.destroy();
        }
        this._heavenHellMeterUi = null;
        this.heavenHellAbilityPanel = null;
      },

    hideHeavenHellAbilityPanel() {
        if (this.heavenHellAbilityPanel && !this.heavenHellAbilityPanel.destroyed) {
          this.heavenHellAbilityPanel.setVisible(false);
        }
        if (this.heavenHellMeterBlinkTween) {
          this.heavenHellMeterBlinkTween.stop();
          this.heavenHellMeterBlinkTween = null;
        }
      },

    createHeavenHellAbilitySlot(x, y, filled, abilityKey = "divineX") {
        const palette = this.getHeavenHellAbilitySlotPalette(abilityKey);
        const size = 14;
        const slotBg = this.add.rectangle(x, y, size, size, filled ? palette.fill : palette.empty, filled ? 0.96 : 0.72)
          .setStrokeStyle(2, filled ? 0xFFE87A : 0x5E4A24, filled ? 1 : 0.8);
        const children = [slotBg];
        if (filled) {
          const gem = this.add.rectangle(x, y, size * 0.42, size * 0.42, palette.glow, 0.92)
            .setRotation(Math.PI / 4);
          const spark = this.add.circle(x, y, size * 0.16, 0xFFF8D6, 0.85);
          children.push(gem, spark);
        } else {
          children.push(
            this.add.rectangle(x, y, size * 0.3, size * 0.3, 0x000000, 0.42)
          );
        }
        return children;
      },

    ensureHeavenHellAbilityPanel() {
        const HEAVEN_HELL_METER_PANEL_HEIGHT = 74;
        if (
          this.heavenHellAbilityPanel &&
          !this.heavenHellAbilityPanel.destroyed &&
          this._heavenHellMeterUi?.panelHeight === HEAVEN_HELL_METER_PANEL_HEIGHT
        ) {
          return this._heavenHellMeterUi;
        }
        if (this.heavenHellAbilityPanel && !this.heavenHellAbilityPanel.destroyed) {
          this.destroyHeavenHellAbilityPanel();
        }
    
        const panelWidth = 470;
        const panelHeight = HEAVEN_HELL_METER_PANEL_HEIGHT;
        const leftSectionWidth = 302;
        const rightSectionWidth = 132;
        const dividerX = 84;
        const leftSectionLeft = -panelWidth / 2 + 10;
        const leftSectionRight = dividerX - 12;
        const rightSectionCenterX = dividerX + (rightSectionWidth / 2) + 10;
        const meterWidth = 238;
        const meterHeight = 9;
        const meterX = leftSectionLeft + 14;
        const meterY = -2;
        const { centerX, centerY } = this.getHeavenHellMeterPanelPosition();
        const children = [];
    
        const outerGlow = this.add.rectangle(0, 0, panelWidth + 18, panelHeight + 18, 0xFFE87A, 0.08)
          .setBlendMode(Phaser.BlendModes.ADD);
        const panelBg = this.add.rectangle(0, 0, panelWidth, panelHeight, 0x14100C, 0.94);
        const innerShadow = this.add.rectangle(0, 1, panelWidth - 8, panelHeight - 8, 0x000000, 0.28);
        const leftSectionBg = this.add.rectangle(
          (leftSectionLeft + leftSectionRight) / 2,
          1,
          leftSectionRight - leftSectionLeft,
          panelHeight - 16,
          0x1A130D,
          0.42
        ).setStrokeStyle(1, 0x6C4C18, 0.22);
        const rightSectionBg = this.add.rectangle(
          rightSectionCenterX,
          1,
          rightSectionWidth,
          panelHeight - 16,
          0x17110A,
          0.5
        ).setStrokeStyle(1, 0x6C4C18, 0.26);
        const dividerGlow = this.add.rectangle(dividerX, 1, 3, panelHeight - 18, 0xF3D37A, 0.12)
          .setBlendMode(Phaser.BlendModes.ADD);
        const dividerLine = this.add.rectangle(dividerX, 1, 1, panelHeight - 18, 0x8A6A1E, 0.85);
        const goldBorder = this.add.rectangle(0, 0, panelWidth, panelHeight)
          .setStrokeStyle(2, 0xD4AF37, 0.95)
          .setFillStyle(0x000000, 0);
        const innerBorder = this.add.rectangle(0, 0, panelWidth - 6, panelHeight - 6)
          .setStrokeStyle(1, 0x8A6A1E, 0.55)
          .setFillStyle(0x000000, 0);
        const titleText = this.add.text(leftSectionLeft + 8, -panelHeight / 2 + 12, "ABILITIES", {
          fontFamily: '"Cinzel", "Trajan Pro", "Times New Roman", serif',
          fontSize: "10px",
          fontStyle: "bold",
          color: "#F8E7B0",
          stroke: "#2A1A05",
          strokeThickness: 3
        }).setOrigin(0, 0.5);
        const killCountText = this.add.text(leftSectionRight - 8, -panelHeight / 2 + 12, "⚔ 0 / 20", {
          fontFamily: '"Cinzel", "Trajan Pro", "Times New Roman", serif',
          fontSize: "18px",
          fontStyle: "bold",
          color: "#FFF4C8",
          stroke: "#2A1400",
          strokeThickness: 4
        }).setOrigin(1, 0.5);
        const trackBg = this.add.rectangle(meterX, meterY, meterWidth, meterHeight, 0x090706, 0.95)
          .setOrigin(0, 0.5)
          .setStrokeStyle(1, 0x3A2D18, 0.95);
        const trackInner = this.add.rectangle(meterX + 1, meterY, meterWidth - 2, meterHeight - 2, 0x000000, 0.35)
          .setOrigin(0, 0.5);
        const fillGfx = this.add.graphics();
        const shimmer = this.add.rectangle(meterX - 28, meterY, 22, meterHeight - 2, 0xFFF4C8, 0.42)
          .setOrigin(0, 0.5)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setVisible(false);
        const lootChestX = rightSectionCenterX;
        const lootChestY = meterY + 2;
        const lootChestLabel = this.add.text(lootChestX, -panelHeight / 2 + 12, "GROUND LOOT", {
          fontFamily: '"Cinzel", "Trajan Pro", "Times New Roman", serif',
          fontSize: "10px",
          fontStyle: "bold",
          color: "#F8E7B0",
          stroke: "#2A1A05",
          strokeThickness: 3
        }).setOrigin(0.5, 0.5);
        const lootChestGlow = this.add.circle(lootChestX, lootChestY + 4, 27, 0xFFD86A, 0.12)
          .setBlendMode(Phaser.BlendModes.ADD);
        const lootChestIcon = this.textures?.exists?.("helldive_ui_chest")
          ? this.add.image(lootChestX, lootChestY + 5, "helldive_ui_chest").setScale(0.16).setAlpha(0.98)
          : this.add.circle(lootChestX, lootChestY + 5, 18, 0x8A5A12, 0.95).setStrokeStyle(2, 0xF0C96B, 0.9);
        const lootChestValueText = this.add.text(lootChestX, lootChestY - 4, "0", {
          fontFamily: '"Cinzel", "Trajan Pro", "Times New Roman", serif',
          fontSize: "18px",
          fontStyle: "bold",
          color: "#FFF7D5",
          stroke: "#2A1400",
          strokeThickness: 5
        }).setOrigin(0.5, 0.5);
    
        children.push(
          outerGlow,
          panelBg,
          innerShadow,
          leftSectionBg,
          rightSectionBg,
          dividerGlow,
          dividerLine,
          goldBorder,
          innerBorder,
          titleText,
          killCountText,
          trackBg,
          trackInner,
          fillGfx,
          shimmer,
          lootChestGlow,
          lootChestIcon,
          lootChestValueText,
          lootChestLabel
        );
    
        const abilityRows = [];
        const abilityDefs = [
          { key: "divineX", label: "X", maxSlots: 2 },
          { key: "divineStrike", label: "Strike", maxSlots: 2 },
          { key: "divineCharge", label: "Charge", maxSlots: 2 }
        ];
        const abilityRowY = panelHeight / 2 - 14;
        let abilityCursorX = leftSectionLeft + 12;
        abilityDefs.forEach((def) => {
          const label = this.add.text(abilityCursorX, abilityRowY, def.label, {
            fontFamily: '"Cinzel", "Times New Roman", serif',
            fontSize: "10px",
            fontStyle: "bold",
            color: "#D8C79A",
            stroke: "#1A1208",
            strokeThickness: 2
          }).setOrigin(0, 0.5);
          children.push(label);
          abilityCursorX += label.width + 6;
          const slots = [];
          for (let slotIndex = 0; slotIndex < def.maxSlots; slotIndex++) {
            const slotX = abilityCursorX + slotIndex * 18 + 7;
            const slotChildren = this.createHeavenHellAbilitySlot(slotX, abilityRowY, false, def.key);
            slotChildren.forEach((child) => children.push(child));
            slots.push({ slotChildren, slotX, rowY: abilityRowY });
          }
          abilityCursorX += def.maxSlots * 18 + 14;
          abilityRows.push({ ...def, label, slots });
        });
    
        const container = this.add.container(centerX, centerY, children)
          .setDepth(DEPTH_HERO + 24);
    
        const ui = {
          container,
          outerGlow,
          panelBg,
          goldBorder,
          titleText,
          killCountText,
          trackBg,
          fillGfx,
          shimmer,
          lootChestLabel,
          lootChestGlow,
          lootChestIcon,
          lootChestValueText,
          abilityRows,
          panelWidth,
          panelHeight,
          meterWidth,
          meterHeight,
          meterX,
          meterY,
          shimmerTween: null,
          lastProgress: 0,
          lastFillWidth: -1,
          lastAbilityLevels: null
        };
        this._heavenHellMeterUi = ui;
        this.heavenHellAbilityPanel = container;
        this.syncHeavenHellGroundLootDisplayText?.();
    
        return ui;
      },

    redrawHeavenHellMeterFill(ui, progress = 0) {
        if (!ui?.fillGfx || ui.fillGfx.destroyed) return;
        const fillWidth = Math.max(0, Math.floor((ui.meterWidth - 4) * progress));
        const x = ui.meterX + 2;
        const y = ui.meterY - (ui.meterHeight - 4) / 2;
        const height = ui.meterHeight - 4;
        const glowBoost = 0.35 + progress * 0.65;
    
        ui.fillGfx.clear();
        if (fillWidth <= 0) {
          if (ui.shimmer) ui.shimmer.setVisible(false);
          if (ui.shimmerTween) {
            ui.shimmerTween.stop();
            ui.shimmerTween = null;
          }
          ui.lastFillWidth = 0;
          if (ui.outerGlow) ui.outerGlow.setAlpha(0.06 + progress * 0.12);
          return;
        }
    
        ui.fillGfx.fillGradientStyle(
          0x6A4A10,
          0x6A4A10,
          0xFFD45A,
          0xFFF0A8,
          0.92
        );
        ui.fillGfx.fillRect(x, y, fillWidth, height);
        ui.fillGfx.fillStyle(0xFFFFFF, 0.08 + progress * 0.12);
        ui.fillGfx.fillRect(x, y, fillWidth, Math.max(2, Math.floor(height * 0.35)));
    
        if (ui.shimmer) {
          ui.shimmer.setVisible(true);
          ui.shimmer.y = ui.meterY;
          ui.shimmer.displayHeight = height;
          ui.shimmer.setAlpha(0.18 + progress * 0.42);
          if (ui.lastFillWidth !== fillWidth) {
            ui.lastFillWidth = fillWidth;
            if (ui.shimmerTween) {
              ui.shimmerTween.stop();
              ui.shimmerTween = null;
            }
            ui.shimmer.x = x - 36;
            ui.shimmerTween = this.tweens.add({
              targets: ui.shimmer,
              x: x + fillWidth + 18,
              duration: 1100 - Math.floor(progress * 350),
              repeat: -1,
              ease: "Sine.easeInOut",
              onRepeat: () => {
                if (ui.shimmer && !ui.shimmer.destroyed) {
                  ui.shimmer.x = x - 36;
                }
              }
            });
          }
        }
    
        if (ui.outerGlow) {
          ui.outerGlow.setAlpha(0.08 + glowBoost * 0.14);
          ui.outerGlow.setScale(1 + progress * 0.04);
        }
      },

    refreshHeavenHellAbilitySlots(ui, abilities = {}) {
        if (!ui?.abilityRows) return;
        const levels = {
          divineX: Math.max(0, Math.floor(Number(abilities?.divineX || 0))),
          divineStrike: Math.max(0, Math.floor(Number(abilities?.divineStrike || 0))),
          divineCharge: Math.max(0, Math.floor(Number(abilities?.divineCharge || 0)))
        };
        const levelsKey = `${levels.divineX}:${levels.divineStrike}:${levels.divineCharge}`;
        if (ui.lastAbilityLevels === levelsKey) return;
        ui.lastAbilityLevels = levelsKey;
    
        ui.abilityRows.forEach((row) => {
          const level = levels[row.key] || 0;
          row.slots.forEach((slot, slotIndex) => {
            const filled = level > slotIndex;
            slot.slotChildren.forEach((child) => {
              if (!child || child.destroyed) return;
              child.destroy();
            });
            const refreshed = this.createHeavenHellAbilitySlot(slot.slotX, slot.rowY, filled, row.key);
            slot.slotChildren = refreshed;
            refreshed.forEach((child) => ui.container.add(child));
          });
        });
      },

    playHeavenHellMeterMilestoneFx(level = "half") {
        const ui = this._heavenHellMeterUi;
        if (!ui?.container || ui.container.destroyed) return;
    
        const pulseStrength = level === "ready" ? 1.14 : level === "threeQuarter" ? 1.08 : 1.04;
        const glowAlpha = level === "ready" ? 0.42 : level === "threeQuarter" ? 0.28 : 0.18;
        const duration = level === "ready" ? 260 : 180;
    
        this.tweens.add({
          targets: ui.container,
          scaleX: pulseStrength,
          scaleY: pulseStrength,
          duration,
          yoyo: true,
          ease: "Back.easeOut"
        });
        if (ui.outerGlow) {
          this.tweens.add({
            targets: ui.outerGlow,
            alpha: glowAlpha,
            duration,
            yoyo: true,
            ease: "Sine.easeOut"
          });
        }
        if (level === "ready") {
          this.cameras?.main?.shake?.(240, 0.006);
          const flash = this.add.rectangle(ui.container.x, ui.container.y, ui.panelWidth + 12, ui.panelHeight + 12, 0xFFF0A0, 0.55)
            .setDepth(DEPTH_HERO + 30)
            .setBlendMode(Phaser.BlendModes.ADD);
          this.tweens.add({
            targets: flash,
            alpha: 0,
            scaleX: 1.12,
            scaleY: 1.12,
            duration: 420,
            ease: "Cubic.easeOut",
            onComplete: () => flash.destroy()
          });
        }
      },

    updateHeavenHellAbilityText(gameState = {}, { allowRewardFx = true } = {}) {
        const heavenHell = gameState?.heavenHell;
        const isBonus = gameState?.isBonus === true;
        if (!heavenHell || !isBonus) {
          this._heavenHellActiveGameState = null;
          this._heavenHellMeterRuntime = null;
          this._heavenHellPendingMeterSoulTrails = 0;
          this._heavenHellGroundLootDisplayValue = 0;
          this.clearHeavenHellGroundChests();
          this.hideHeavenHellAbilityPanel();
          return;
        }

        if (this.hasPendingHeavenHellMeterSoulTrails?.()) {
          return;
        }
    
        const bonus = heavenHell?.bonus || {};
        this.syncHeavenHellGroundLootDisplayFromGameState?.(gameState, { preserveVisibleTotal: true });
        const killsTotal = Math.max(0, Number(bonus?.killsTotal || 0));
        const killsTowardsUnlock = Math.max(0, Number(bonus?.killsTowardsUnlock ?? 0));
        const nextUnlock = Math.max(1, Number(bonus?.nextAbilityKillThreshold || 20));
        const ui = this._heavenHellMeterUi;
        const runtime = this._heavenHellMeterRuntime;
        const displayedKills = runtime
          ? Math.max(0, Math.floor(Number(runtime.displayKills) || 0))
          : (Number.isFinite(Number(this._heavenHellMeterDisplayKills))
            ? Math.max(0, Math.floor(Number(this._heavenHellMeterDisplayKills)))
            : killsTowardsUnlock);
        const prevProgress = ui ? Number(ui.lastProgress) || 0 : 0;
        const needsFinalSync = displayedKills !== killsTowardsUnlock;
        this._heavenHellActiveGameState = null;
        this._heavenHellMeterRuntime = null;
        this.renderHeavenHellKillMeterDisplay({
          displayKills: killsTowardsUnlock,
          nextUnlock,
          abilities: bonus?.abilities || {},
          prevProgress,
          allowRewardFx,
          skipMilestones: needsFinalSync,
          skipUnlockBlink: needsFinalSync,
          killsTotal,
          actionCount: Math.max(0, Math.floor(Number(bonus?.actionCount || 0))),
          procs: Array.isArray(bonus?.abilityProcsThisAction) ? bonus.abilityProcsThisAction : []
        });
        this._heavenHellMeterDisplayKills = killsTowardsUnlock;
      },

    getHeavenHellAwardedFreespinsThisAction(procs = []) {
        return (Array.isArray(procs) ? procs : []).reduce((sum, entry) => {
          if (!entry || (entry.type !== "abilityUnlock" && entry.type !== "abilityReward")) return sum;
          const awarded = Math.max(0, Math.floor(Number(entry?.freespinsAwarded || 0)));
          return sum + awarded;
        }, 0);
      },

    playHeavenHellMeterBlink(blinkCount = 3) {
        const ui = this._heavenHellMeterUi;
        if (!ui?.container || ui.container.destroyed) return;
        if (this.heavenHellMeterBlinkTween) {
          this.heavenHellMeterBlinkTween.stop();
          this.heavenHellMeterBlinkTween = null;
        }
        const targets = [ui.goldBorder, ui.outerGlow].filter((obj) => obj && !obj.destroyed);
        if (targets.length === 0) return;
        this.heavenHellMeterBlinkTween = this.tweens.add({
          targets,
          alpha: { from: 1, to: 0.2 },
          duration: 120,
          yoyo: true,
          repeat: Math.max(1, Math.floor(Number(blinkCount) || 3)),
          ease: "Sine.easeInOut",
          onComplete: () => {
            if (ui.goldBorder && !ui.goldBorder.destroyed) {
              ui.goldBorder.setAlpha(1);
            }
            if (ui.outerGlow && !ui.outerGlow.destroyed) {
              ui.outerGlow.setAlpha(0.12);
            }
            this.heavenHellMeterBlinkTween = null;
          }
        });
      },

    playHeavenHellFreespinAwardPopup(awardedFreespins = 2) {
        const ui = this._heavenHellMeterUi;
        if (!ui?.container || ui.container.destroyed) return;
        const amount = Math.max(1, Math.floor(Number(awardedFreespins) || 2));
        const popup = this.add.text(
          ui.container.x,
          ui.container.y - ui.panelHeight / 2 - 14,
          `+${amount} Freespins`,
          {
            fontFamily: '"Cinzel", "Times New Roman", serif',
            fontSize: "22px",
            fontStyle: "bold",
            color: "#FFD55D",
            stroke: "#2A1400",
            strokeThickness: 5
          }
        )
          .setOrigin(0.5, 1)
          .setDepth(DEPTH_HERO + 30)
          .setAlpha(0);
    
        this.tweens.add({
          targets: popup,
          alpha: 1,
          y: popup.y - 24,
          duration: 260,
          ease: "Sine.easeOut",
          onComplete: () => {
            this.tweens.add({
              targets: popup,
              alpha: 0,
              y: popup.y - 14,
              duration: 420,
              ease: "Sine.easeIn",
              onComplete: () => popup.destroy()
            });
          }
        });
      }
  };
}
