export function createGameSceneFreespinUiMethods(deps = {}) {
  const {
    BONUS_FREESPIN_POWER_CIRCLE_TEXTURE_KEY,
    BONUS_FREESPIN_RING_ATLAS_PAGE,
    BONUS_FREESPIN_RING_ORB_ANIM_KEY,
    BONUS_FREESPIN_RING_SHEET_TEXTURE_KEY,
    BONUS_FREESPIN_RING_VISUALS_ENABLED,
    BONUS_WON_CRACKLING_ATLAS_TEXT_KEY,
    DEPTH_BOARD_BACKDROP,
    GRID_OFFSET_X,
    GRID_OFFSET_Y,
    Phaser,
    clientConfig,
    gameClientConfig,
    parseSpineAtlasFrames
  } = deps;

  return {
    ensureBonusFreespinRingFrames() {
        if (this._bonusFreespinRingFramesReady) {
          return this._bonusFreespinRingFrames || null;
        }
        if (!this.textures?.exists?.(BONUS_FREESPIN_RING_SHEET_TEXTURE_KEY)) {
          return null;
        }
    
        const texture = this.textures.get(BONUS_FREESPIN_RING_SHEET_TEXTURE_KEY);
        const atlasText = this.cache?.text?.get?.(BONUS_WON_CRACKLING_ATLAS_TEXT_KEY) || "";
        const frames = parseSpineAtlasFrames(atlasText, {
          pageName: BONUS_FREESPIN_RING_ATLAS_PAGE
        });
        const byName = new Map(frames.map((frame) => [frame.name, frame]));
        const addFrame = (sourceName, frameKey) => {
          const frame = byName.get(sourceName);
          if (!frame?.bounds || frame.rotated) return null;
          if (!texture.frames?.[frameKey]) {
            texture.add(
              frameKey,
              0,
              frame.bounds.x,
              frame.bounds.y,
              frame.bounds.width,
              frame.bounds.height
            );
          }
          return frameKey;
        };
    
        const hasPowerCircle = this.textures?.exists?.(BONUS_FREESPIN_POWER_CIRCLE_TEXTURE_KEY) === true;
        const ringTextureKey = hasPowerCircle
          ? BONUS_FREESPIN_POWER_CIRCLE_TEXTURE_KEY
          : BONUS_FREESPIN_RING_SHEET_TEXTURE_KEY;
        const ringIdleKey = hasPowerCircle
          ? null
          : addFrame("normal/separateTexture_1/level_locked_Circle", "bonus_freespin_ring_idle");
        const ringLitKey = ringIdleKey;
        const orbFrameKeys = frames
          .filter((frame) => (
            frame.name?.startsWith("normal/separateTexture_1/finalLevel_") &&
            !frame.rotated &&
            frame?.bounds &&
            frame.bounds.width >= 90 &&
            frame.bounds.height >= 90 &&
            frame.bounds.width <= 130 &&
            frame.bounds.height <= 130
          ))
          .sort((a, b) => {
            const aIndex = Number(String(a.name || "").match(/finalLevel_(\d+)/)?.[1] ?? 0);
            const bIndex = Number(String(b.name || "").match(/finalLevel_(\d+)/)?.[1] ?? 0);
            return aIndex - bIndex;
          })
          .map((frame, index) => {
            const frameKey = `bonus_freespin_orb_${String(index).padStart(2, "0")}`;
            if (!texture.frames?.[frameKey]) {
              texture.add(
                frameKey,
                0,
                frame.bounds.x,
                frame.bounds.y,
                frame.bounds.width,
                frame.bounds.height
              );
            }
            return frameKey;
          });
        if (this.anims && orbFrameKeys.length > 0 && !this.anims.exists(BONUS_FREESPIN_RING_ORB_ANIM_KEY)) {
          this.anims.create({
            key: BONUS_FREESPIN_RING_ORB_ANIM_KEY,
            frames: orbFrameKeys.map((frame) => ({
              key: BONUS_FREESPIN_RING_SHEET_TEXTURE_KEY,
              frame
            })),
            frameRate: 20,
            repeat: -1
          });
        }
    
        this._bonusFreespinRingFramesReady = true;
        this._bonusFreespinRingFrames = (hasPowerCircle || ringIdleKey) && orbFrameKeys.length > 0
          ? { ringTextureKey, ringIdleKey, ringLitKey, orbFrameKeys }
          : null;
        return this._bonusFreespinRingFrames;
      },

    getBonusFreespinRingLayout(count = 0) {
        const displayCount = Math.max(0, Math.min(30, Math.floor(Number(count) || 0)));
        if (displayCount <= 0) return [];
    
        const cellSize = 70;
        const gridWidth = clientConfig.area.width * cellSize;
        const gridBottom = GRID_OFFSET_Y + clientConfig.area.height * cellSize;
        const mustSeeBounds = gameClientConfig?.layout?.mustSeeBounds || {};
        const layoutLeft = Number.isFinite(Number(mustSeeBounds.x))
          ? Number(mustSeeBounds.x)
          : GRID_OFFSET_X;
        const layoutWidth = Math.max(
          gridWidth,
          Number.isFinite(Number(mustSeeBounds.width)) ? Number(mustSeeBounds.width) : gridWidth
        );
        const mustSeeBottom = Number.isFinite(Number(mustSeeBounds.y)) && Number.isFinite(Number(mustSeeBounds.height))
          ? Number(mustSeeBounds.y) + Number(mustSeeBounds.height)
          : gridBottom + 160;
        const ringSize = 62;
        const spacing = ringSize * 1.08;
        let maxPerRow = Math.max(1, Math.floor(Math.max(0, layoutWidth - ringSize) / spacing) + 1);
        const shouldReserveBalloonMeter =
          this.isInBonusMode === true ||
          this.bonusMysteryMeterIcon?.visible === true ||
          this.bonusMysteryMeterIconOutline?.visible === true;
        if (shouldReserveBalloonMeter) {
          const mysteryMeterTarget = this.getBonusMysteryMeterTarget();
          const mysteryMeterCenterX = Number(
            this.bonusMysteryMeterIcon?.x ??
            (Number(mysteryMeterTarget?.x) + 190)
          );
          if (Number.isFinite(mysteryMeterCenterX)) {
            const lastSafeRingCenterX = mysteryMeterCenterX - ringSize * 0.65;
            const maxBeforeBalloonMeter = Math.max(
              1,
              Math.floor(Math.max(0, lastSafeRingCenterX - (layoutLeft + ringSize / 2)) / spacing) + 1
            );
            maxPerRow = Math.min(maxPerRow, maxBeforeBalloonMeter);
          }
        }
        const rowCount = Math.ceil(displayCount / maxPerRow);
        const baseY = gridBottom + ringSize * 0.72;
        const maxY = mustSeeBottom - ringSize * 0.5;
        const rowSpacing = rowCount > 1
          ? Math.min(ringSize * 0.68, Math.max(28, (maxY - baseY) / (rowCount - 1)))
          : ringSize * 0.68;
        const positions = [];
    
        for (let index = 0; index < displayCount; index++) {
          const row = Math.floor(index / maxPerRow);
          const col = index % maxPerRow;
          positions.push({
            x: layoutLeft + ringSize / 2 + col * spacing,
            y: baseY + row * rowSpacing,
            size: ringSize
          });
        }
    
        return positions;
      },

    createBonusFreespinRingDisplay(index, position, frames) {
        if (!BONUS_FREESPIN_RING_VISUALS_ENABLED) return null;
        const ringSize = position.size || 32;
        const ringTextureKey = frames.ringTextureKey || BONUS_FREESPIN_RING_SHEET_TEXTURE_KEY;
        const usesPowerCircle = ringTextureKey === BONUS_FREESPIN_POWER_CIRCLE_TEXTURE_KEY;
        const ringHeightRatio = usesPowerCircle ? 91 / 87 : 1;
        const orbRatio = usesPowerCircle ? 0.64 : 0.74;
        const container = this.add.container(position.x, position.y)
          .setDepth(DEPTH_BOARD_BACKDROP + 1.1)
          .setScale(0.82)
          .setAlpha(0);
        const glow = this.add.circle(0, 0, ringSize * 0.38, 0xffa325, 0)
          .setBlendMode(Phaser.BlendModes.ADD);
        const ring = this.add.image(0, 0, ringTextureKey, frames.ringIdleKey || undefined)
          .setOrigin(0.5)
          .setDisplaySize(ringSize, ringSize * ringHeightRatio)
          .setAlpha(usesPowerCircle ? 0.9 : 0.68);
        const orbFrame = frames.orbFrameKeys[index % frames.orbFrameKeys.length];
        const orb = this.add.sprite(0, 0, BONUS_FREESPIN_RING_SHEET_TEXTURE_KEY, orbFrame)
          .setOrigin(0.5)
          .setDisplaySize(ringSize * orbRatio, ringSize * orbRatio)
          .setAlpha(0.58)
          .setBlendMode(Phaser.BlendModes.ADD);
        if (this.anims?.exists?.(BONUS_FREESPIN_RING_ORB_ANIM_KEY)) {
          orb.play(BONUS_FREESPIN_RING_ORB_ANIM_KEY);
          orb.anims?.setProgress?.(Phaser.Math.FloatBetween(0, 1));
        }
    
        const sparkles = [];
        for (let sparkIndex = 0; sparkIndex < 4; sparkIndex++) {
          const angle = (sparkIndex / 4) * Math.PI * 2 + Phaser.Math.FloatBetween(-0.28, 0.28);
          const radiusRatio = Phaser.Math.FloatBetween(0.08, 0.22);
          const radiusScale = Phaser.Math.FloatBetween(0.014, 0.026);
          const sparkle = this.add.circle(
            Math.cos(angle) * ringSize * radiusRatio,
            Math.sin(angle) * ringSize * radiusRatio,
            ringSize * radiusScale,
            sparkIndex === 0 ? 0xffffff : 0xfff0a3,
            sparkIndex === 0 ? 0.4 : 0.28
          )
            .setBlendMode(Phaser.BlendModes.ADD);
          sparkle._bonusFreespinSpark = { angle, radiusRatio, radiusScale };
          sparkles.push(sparkle);
        }
    
        container.add([glow, ring, orb, ...sparkles]);
        const display = {
          container,
          glow,
          ring,
          orb,
          sparkles,
          index,
          size: ringSize,
          ringHeightRatio,
          orbRatio,
          usesPowerCircle
        };
        this.startBonusFreespinRingSparkleLoop(display);
        return display;
      },

    startBonusFreespinRingSparkleLoop(display) {
        if (!BONUS_FREESPIN_RING_VISUALS_ENABLED) return;
        if (!display?.sparkles || !Array.isArray(display.sparkles)) return;
        display.sparkles.forEach((sparkle, sparkIndex) => {
          if (!sparkle || sparkle.destroyed) return;
          this.tweens.killTweensOf(sparkle);
          this.tweens.add({
            targets: sparkle,
            alpha: { from: sparkIndex === 0 ? 0.18 : 0.12, to: sparkIndex === 0 ? 0.95 : 0.72 },
            scale: { from: 0.5, to: 1.35 },
            duration: Phaser.Math.Between(520, 880),
            delay: sparkIndex * 115 + Phaser.Math.Between(0, 80),
            yoyo: true,
            repeat: -1,
            ease: "Sine.easeInOut"
          });
        });
      },

    positionBonusFreespinRingDisplay(display, position, animate = true) {
        if (!BONUS_FREESPIN_RING_VISUALS_ENABLED) return;
        if (!display?.container || display.container.destroyed || !position) return;
        display.size = position.size || display.size || 32;
        display.ring?.setDisplaySize(display.size, display.size * (display.ringHeightRatio || 1));
        const orbRatio = display.orbRatio || 0.74;
        display.orb?.setDisplaySize(display.size * orbRatio, display.size * orbRatio);
        display.glow?.setRadius?.(display.size * 0.38);
        display.sparkles?.forEach((sparkle) => {
          if (!sparkle || sparkle.destroyed) return;
          const spark = sparkle._bonusFreespinSpark || {};
          const angle = Number.isFinite(spark.angle) ? spark.angle : 0;
          const radiusRatio = Number.isFinite(spark.radiusRatio) ? spark.radiusRatio : 0.15;
          const radiusScale = Number.isFinite(spark.radiusScale) ? spark.radiusScale : 0.02;
          sparkle.setPosition(
            Math.cos(angle) * display.size * radiusRatio,
            Math.sin(angle) * display.size * radiusRatio
          );
          sparkle.setRadius?.(display.size * radiusScale);
        });
    
        if (animate && display.container.alpha > 0) {
          this.tweens.add({
            targets: display.container,
            x: position.x,
            y: position.y,
            duration: 260,
            ease: "Sine.easeOut"
          });
        } else {
          display.container.setPosition(position.x, position.y);
        }
      },

    setBonusFreespinRingLit(display, lit = true) {
        if (!BONUS_FREESPIN_RING_VISUALS_ENABLED) return;
        const frames = this.ensureBonusFreespinRingFrames();
        if (!display || !frames) return;
        if (display.ring && frames.ringIdleKey) {
          display.ring.setFrame(lit ? frames.ringLitKey : frames.ringIdleKey);
        }
        display.ring?.setDisplaySize(display.size || 32, (display.size || 32) * (display.ringHeightRatio || 1));
        display.ring?.setAlpha(lit ? (display.usesPowerCircle ? 1 : 0.96) : (display.usesPowerCircle ? 0.82 : 0.68));
        display.orb?.setAlpha(lit ? 0.94 : 0.58);
        display.sparkles?.forEach((sparkle, index) => {
          if (!sparkle || sparkle.destroyed) return;
          sparkle.setAlpha(lit ? (index === 0 ? 0.72 : 0.46) : 0.18);
        });
      },

    getFreespinEssenceSoundKey(sequenceIndex = 0, sequenceCount = 1) {
        const count = Math.max(1, Math.floor(Number(sequenceCount) || 1));
        const index = Phaser.Math.Clamp(Math.floor(Number(sequenceIndex) || 0), 0, count - 1);
        const essenceIndex = count <= 1
          ? 1
          : Phaser.Math.Clamp(Math.round((index / (count - 1)) * 4) + 1, 1, 5);
        return `freespin_essence_${essenceIndex}`;
      },

    playBonusFreespinRingRipple(display, delay = 0, {
        playAppearSound = true,
        essenceSoundKey = null
      } = {}) {
        if (!BONUS_FREESPIN_RING_VISUALS_ENABLED) return;
        if (!display?.container || display.container.destroyed) return;
        this.time.delayedCall(Math.max(0, Math.floor(delay) || 0), () => {
          if (!display?.container || display.container.destroyed) return;
          if (playAppearSound === true) {
            this.playSfx?.("freespin_orb_appear", {
              volume: 0.7,
              rate: Phaser.Math.FloatBetween(0.96, 1.06)
            });
          }
          if (essenceSoundKey) {
            this.playSfx?.(essenceSoundKey, { volume: 0.68 });
          }
          this.tweens.killTweensOf([display.container, display.glow, display.orb, ...(display.sparkles || [])]);
          this.setBonusFreespinRingLit(display, true);
          display.container.setAlpha(1).setScale(0.28);
          display.glow?.setAlpha?.(0.72);
          const ripple = this.add.circle(display.container.x, display.container.y, (display.size || 42) * 0.44, 0xff8c20, 0)
            .setStrokeStyle(3, 0xffc15a, 0.78)
            .setDepth(DEPTH_BOARD_BACKDROP + 1)
            .setBlendMode(Phaser.BlendModes.ADD);
          this.tweens.add({
            targets: ripple,
            radius: (display.size || 42) * 0.82,
            alpha: 0,
            duration: 460,
            ease: "Cubic.easeOut",
            onComplete: () => ripple.destroy()
          });
          this.tweens.add({
            targets: display.container,
            scale: 1.24,
            duration: 170,
            ease: "Back.easeOut",
            onComplete: () => {
              if (display.container.destroyed) return;
              this.tweens.add({
                targets: display.container,
                scale: 1,
                duration: 150,
                ease: "Sine.easeOut"
              });
            }
          });
          if (display.glow) {
            this.tweens.add({
              targets: display.glow,
              alpha: 0.08,
              scale: 2.25,
              duration: 520,
              ease: "Sine.easeOut"
            });
          }
          if (display.orb) {
            display.orb.setAlpha(1);
            this.tweens.add({
              targets: display.orb,
              alpha: 0.9,
              duration: 320,
              ease: "Sine.easeOut"
            });
          }
          display.sparkles?.forEach((sparkle, index) => {
            if (!sparkle || sparkle.destroyed) return;
            sparkle.setAlpha(index === 0 ? 1 : 0.78).setScale(1.45);
            this.tweens.add({
              targets: sparkle,
              alpha: index === 0 ? 0.72 : 0.48,
              scale: 1,
              duration: 360,
              ease: "Sine.easeOut"
            });
          });
          this.time.delayedCall(390, () => this.startBonusFreespinRingSparkleLoop(display));
        });
      },

    consumeBonusFreespinRingDisplay(display, delay = 0) {
        if (!display?.container || display.container.destroyed) return;
        if (!BONUS_FREESPIN_RING_VISUALS_ENABLED) {
          this.tweens.killTweensOf([display.container, display.glow, display.orb, ...(display.sparkles || [])]);
          display.container.destroy();
          return;
        }
        this.time.delayedCall(Math.max(0, Math.floor(delay) || 0), () => {
          if (!display?.container || display.container.destroyed) return;
          const x = display.container.x;
          const y = display.container.y;
          this.tweens.killTweensOf([display.container, display.glow, display.orb, ...(display.sparkles || [])]);
          this.setBonusFreespinRingLit(display, true);
          display.glow?.setAlpha?.(0.52);
    
          const popFlash = this.add.circle(x, y, Math.max(7, (display.size || 42) * 0.16), 0xffffff, 0.22)
            .setDepth(DEPTH_BOARD_BACKDROP + 1.35)
            .setBlendMode(Phaser.BlendModes.ADD);
          this.tweens.add({
            targets: popFlash,
            scale: 1.7,
            alpha: 0,
            duration: 160,
            ease: "Quad.easeOut",
            onComplete: () => popFlash.destroy()
          });
    
          for (let index = 0; index < 6; index++) {
            const angle = (index / 6) * Math.PI * 2 + Phaser.Math.FloatBetween(-0.2, 0.2);
            const distance = Phaser.Math.Between(8, 19);
            const spark = this.add.circle(x, y, Phaser.Math.FloatBetween(1.1, 2.1), index % 2 === 0 ? 0xfff6b0 : 0xffffff, 0.72)
              .setDepth(DEPTH_BOARD_BACKDROP + 1.4)
              .setBlendMode(Phaser.BlendModes.ADD);
            this.tweens.add({
              targets: spark,
              x: x + Math.cos(angle) * distance,
              y: y + Math.sin(angle) * distance,
              alpha: 0,
              scale: 0.2,
              duration: Phaser.Math.Between(150, 260),
              ease: "Quad.easeOut",
              onComplete: () => spark.destroy()
            });
          }
    
          this.tweens.add({
            targets: display.container,
            scale: 1.35,
            alpha: 0,
            duration: 260,
            ease: "Back.easeIn",
            onComplete: () => {
              if (!display.container.destroyed) display.container.destroy();
            }
          });
        });
      },

    syncBonusFreespinRings(remaining = 0, {
        ripple = false,
        consumeDelay = 0
      } = {}) {
        const displayCount = Math.max(0, Math.min(30, Math.floor(Number(remaining) || 0)));
        if (!BONUS_FREESPIN_RING_VISUALS_ENABLED) {
          if (displayCount <= 0) {
            this.clearBonusFreespinRings({ fade: false });
            this.bonusFreespinRingCount = 0;
            return;
          }
          this.clearBonusFreespinRings({ fade: false });
          this.bonusFreespinRingDisplays = [];
          this.bonusFreespinRingCount = displayCount;
          return;
        }
    
        const frames = this.ensureBonusFreespinRingFrames();
        if (!frames) return;
    
        const displays = Array.isArray(this.bonusFreespinRingDisplays)
          ? this.bonusFreespinRingDisplays
          : [];
        const existingCount = displays.length;
    
        if (displayCount <= 0) {
          this.clearBonusFreespinRings({ fade: true });
          this.bonusFreespinRingCount = 0;
          return;
        }
    
        const positions = this.getBonusFreespinRingLayout(displayCount);
    
        if (displayCount < existingCount) {
          const removed = displays.splice(displayCount);
          removed.forEach((display, index) => {
            this.consumeBonusFreespinRingDisplay(display, consumeDelay + index * 45);
          });
        }
    
        for (let index = displays.length; index < displayCount; index++) {
          const display = this.createBonusFreespinRingDisplay(index, positions[index], frames);
          displays.push(display);
        }
    
        displays.forEach((display, index) => {
          display.index = index;
          this.positionBonusFreespinRingDisplay(display, positions[index], true);
          this.setBonusFreespinRingLit(display, true);
          if (display.container.alpha <= 0) {
            display.container.setAlpha(0).setScale(0.82);
          }
        });
    
        const shouldRipple = ripple || displayCount > existingCount;
        if (shouldRipple) {
          this.suppressCountUpUntilBonusEndPayout = true;
          if (this.countUpText && !this.countUpText.destroyed) {
            this.countUpText.setVisible(false);
          }
          const firstRippleIndex = displayCount > existingCount ? existingCount : 0;
          const newPowercircleCount = Math.max(0, displayCount - existingCount);
          if (newPowercircleCount > 0) {
            this.playSfx?.("freespin_orb_start", { volume: 0.7 });
          }
          displays.forEach((display, index) => {
            if (index < firstRippleIndex) return;
            const sequenceIndex = index - firstRippleIndex;
            const isNewPowercircle = index >= existingCount;
            this.playBonusFreespinRingRipple(display, (index - firstRippleIndex) * 155, {
              playAppearSound: isNewPowercircle,
              essenceSoundKey: isNewPowercircle
                ? this.getFreespinEssenceSoundKey(sequenceIndex, newPowercircleCount)
                : null
            });
          });
        }
    
        this.bonusFreespinRingDisplays = displays;
        this.bonusFreespinRingCount = displayCount;
      },

    flushPendingBonusFreespinRingConsume({
        consumeDelay = 0
      } = {}) {
        if (!Number.isFinite(Number(this.pendingBonusFreespinRingRemaining))) {
          return false;
        }
    
        const currentDisplayCount = Array.isArray(this.bonusFreespinRingDisplays)
          ? this.bonusFreespinRingDisplays.length
          : Math.max(0, Math.floor(Number(this.bonusFreespinRingCount) || 0));
        if (currentDisplayCount <= 0) {
          this.pendingBonusFreespinRingRemaining = null;
          return false;
        }
    
        const remaining = Math.max(0, currentDisplayCount - 1);
        this.pendingBonusFreespinRingRemaining = null;
        this.syncBonusFreespinRings(remaining, {
          ripple: false,
          consumeDelay
        });
        return true;
      },

    showBonusFreespinRingAward(amount = 0) {
        const awarded = Math.max(0, Math.floor(Number(amount) || 0));
        if (awarded <= 0) return;
        this.pendingBonusFreespinRingRemaining = null;
        const existing = Math.max(
          Number(this.bonusFreespinRingCount) || 0,
          Array.isArray(this.bonusFreespinRingDisplays) ? this.bonusFreespinRingDisplays.length : 0
        );
        this.syncBonusFreespinRings(Math.max(existing, awarded), { ripple: true });
      },

    clearBonusFreespinRings({ fade = true } = {}) {
        const displays = Array.isArray(this.bonusFreespinRingDisplays)
          ? this.bonusFreespinRingDisplays
          : [];
        this.bonusFreespinRingDisplays = [];
        this.bonusFreespinRingCount = 0;
        this.pendingBonusFreespinRingRemaining = null;
        displays.forEach((display, index) => {
          if (!display?.container || display.container.destroyed) return;
          this.tweens.killTweensOf([display.container, display.glow, display.orb, ...(display.sparkles || [])]);
          if (fade && BONUS_FREESPIN_RING_VISUALS_ENABLED) {
            this.consumeBonusFreespinRingDisplay(display, index * 24);
          } else {
            display.container.destroy();
          }
        });
      },

    updateFreespinCounter(remaining, {
        deferRingConsume = false
      } = {}) {
        const previousRemaining = Number.isFinite(Number(this.freespinCounterValue))
          ? Math.max(0, Math.floor(Number(this.freespinCounterValue)))
          : null;
        const resolvedRemaining = Math.max(0, Math.floor(Number(remaining) || 0));
        this.freespinCounterValue = resolvedRemaining;
        if (this.freespinCounter && !this.freespinCounter.destroyed) {
          this.freespinCounter.destroy();
          this.freespinCounter = null;
        }
        if (this.freespinLabel && !this.freespinLabel.destroyed) {
          this.freespinLabel.destroy();
          this.freespinLabel = null;
        }
    
        this.emitFreespinsCounter(resolvedRemaining);
        const isDecrement = previousRemaining !== null && resolvedRemaining < previousRemaining;
        if (deferRingConsume && isDecrement) {
          this.pendingBonusFreespinRingRemaining = resolvedRemaining;
          return;
        }
    
        this.pendingBonusFreespinRingRemaining = null;
        this.syncBonusFreespinRings(resolvedRemaining, {
          ripple: previousRemaining === null || resolvedRemaining > previousRemaining,
          consumeDelay: isDecrement ? 220 : 0
        });
      },

    hideFreespinCounter() {
        if (this.freespinCounter && !this.freespinCounter.destroyed) {
          this.freespinCounter.destroy();
          this.freespinCounter = null;
        }
        if (this.freespinLabel && !this.freespinLabel.destroyed) {
          this.freespinLabel.destroy();
          this.freespinLabel = null;
        }
        this.freespinCounterValue = null;
        this.emitFreespinsCounter(null);
        this.clearBonusFreespinRings({ fade: true });
      },

    emitFreespinsCounter(remaining) {
        this.eventBus?.emit("setFreespinsCounter", remaining);
      },

    getDisplayedFreespinCounterValue() {
        if (Number.isFinite(Number(this.freespinCounterValue))) {
          return Math.max(0, Math.floor(Number(this.freespinCounterValue)));
        }
        if (!this.freespinCounter || this.freespinCounter.destroyed) {
          return null;
        }
        const parsed = Number(this.freespinCounter.text);
        if (!Number.isFinite(parsed)) {
          return null;
        }
        return Math.max(0, Math.floor(parsed));
      },

    incrementFreespinCounter(amount = 0) {
        const delta = Math.max(0, Math.floor(Number(amount) || 0));
        if (delta <= 0) return null;
    
        const current = this.getDisplayedFreespinCounterValue();
        if (!Number.isFinite(current)) return null;
    
        const next = current + delta;
        this.updateFreespinCounter(next);
    
        if (this.freespinCounter && !this.freespinCounter.destroyed) {
          this.tweens.add({
            targets: this.freespinCounter,
            scaleX: 1.15,
            scaleY: 1.15,
            duration: 120,
            yoyo: true,
            ease: "Back.easeOut"
          });
        }
    
        return next;
      },

    showFreespinAwardPopup(amount = 2) {
        const awarded = Math.max(0, Math.floor(Number(amount) || 0));
        if (awarded <= 0) return;
        const suffix = awarded === 1 ? "FREESPIN" : "FREESPINS";
        void this.playBonusWonFloatingLabel(`${awarded} ${suffix} WON`, {
          fontSize: "48px",
          glowFontSize: "52px"
        });
      }
  };
}
