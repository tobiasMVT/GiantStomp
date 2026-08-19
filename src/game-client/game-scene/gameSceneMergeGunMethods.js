export function createGameSceneMergeGunMethods(deps = {}) {
  const {
    BONUS_MYSTERY_FEATURE_SYMBOL_ID,
    BONUS_WON_CRACKLING_ATLAS_TEXT_KEY,
    BONUS_WON_CRACKLING_SHEET_TEXTURE_KEY,
    DEPTH_HERO,
    DEPTH_MERGE_GUN_FEATURE,
    DEPTH_SYMBOLS,
    FEATURE_SYMBOL_CROSSFADE_DURATION_MS,
    FEATURE_SYMBOL_CROSSFADE_MAX_ALPHA,
    FEATURE_SYMBOL_CROSSFADE_MIN_ALPHA,
    GRID_OFFSET_X,
    GRID_OFFSET_Y,
    LIGHTNING_BEE_FEATURE_SYMBOL_ID,
    MERGE_GUN_FEATURE_INTENSE_TEXTURE_KEY,
    MERGE_GUN_FEATURE_SYMBOL_ID,
    MERGE_GUN_FLARE_AURA_FALLBACK_FRAME,
    MERGE_GUN_FLARE_AURA_FRAME_KEY,
    MERGE_GUN_FLARE_AURA_SOURCE_FRAME,
    MERGE_GUN_LASER_LOOP_VOLUME,
    Phaser,
    clientConfig,
    getBoardSymbolDepth,
    getFeatureSymbolIntenseTextureKey,
    getReelSymbolRenderable,
    getSymbolScale,
    normalScale,
    parseSpineAtlasFrames
  } = deps;

  return {
    syncMergeGunFeatureSymbolState() {
        if (!Array.isArray(this.reelSprites)) return;
        const visited = new Set();
        this.reelSprites.forEach((column) => {
          if (!Array.isArray(column)) return;
          column.forEach((cell) => {
            if (!cell || cell.destroyed) return;
            const renderable = getReelSymbolRenderable(cell);
            if (!renderable || renderable.destroyed || visited.has(renderable)) return;
            visited.add(renderable);
    
            const symbolId = this.getDisplayObjectSymbolId(cell);
            if (symbolId === MERGE_GUN_FEATURE_SYMBOL_ID) {
              this.ensureMergeGunFeaturePulseForDisplay(cell);
            } else {
              this.clearMergeGunFeaturePulseForDisplay(cell, { resetScale: true });
            }
          });
        });
      },

    getFeatureSymbolCrossfadeRoot(displayObject = null, target = null) {
        if (displayObject && !displayObject.destroyed) return displayObject;
        if (target?.parentContainer && !target.parentContainer.destroyed) {
          return target.parentContainer;
        }
        return target;
      },

    ensureFeatureSymbolCrossfadeForDisplay(displayObject = null) {
        const target = getReelSymbolRenderable(displayObject);
        if (!target || target.destroyed || !target.scene || !target.scene.sys) return;
    
        const root = this.getFeatureSymbolCrossfadeRoot(displayObject, target);
        const symbolId = this.getDisplayObjectSymbolId(root) ?? this.getDisplayObjectSymbolId(target);
        const textureKey = getFeatureSymbolIntenseTextureKey(symbolId);
        if (!textureKey || !this.textures?.exists(textureKey)) {
          this.clearFeatureSymbolCrossfadeForTarget(target);
          return;
        }
    
        const existingOverlay = target._featureSymbolCrossfadeOverlay;
        if (existingOverlay && !existingOverlay.destroyed && existingOverlay.texture?.key === textureKey) {
          existingOverlay._featureSymbolCrossfadeRoot = root;
          this.syncFeatureSymbolCrossfadeOverlay(existingOverlay);
          return;
        }
    
        this.clearFeatureSymbolCrossfadeForTarget(target);
    
        const depth = getBoardSymbolDepth(symbolId) ?? DEPTH_SYMBOLS;
        const overlay = this.add.image(target.x, target.y, textureKey)
          .setOrigin(target.originX ?? 0.5, target.originY ?? 0.5)
          .setScale(target.scaleX ?? 1, target.scaleY ?? 1)
          .setDepth(depth + 0.18)
          .setAlpha(0);
    
        overlay._featureSymbolCrossfadeTarget = target;
        overlay._featureSymbolCrossfadeRoot = root;
        overlay._featureSymbolCrossfadePhaseAlpha = FEATURE_SYMBOL_CROSSFADE_MIN_ALPHA;
        overlay._featureSymbolCrossfadeSyncHandler = () => {
          this.syncFeatureSymbolCrossfadeOverlay(overlay);
        };
        this.events.on("postupdate", overlay._featureSymbolCrossfadeSyncHandler);
    
        const tween = this.tweens.addCounter({
          from: FEATURE_SYMBOL_CROSSFADE_MIN_ALPHA,
          to: FEATURE_SYMBOL_CROSSFADE_MAX_ALPHA,
          duration: FEATURE_SYMBOL_CROSSFADE_DURATION_MS,
          yoyo: true,
          repeat: -1,
          ease: "Sine.easeInOut",
          onUpdate: (counterTween) => {
            if (!overlay || overlay.destroyed) {
              if (counterTween && typeof counterTween.stop === "function") {
                counterTween.stop();
              }
              return;
            }
            overlay._featureSymbolCrossfadePhaseAlpha = Phaser.Math.Clamp(
              Number(counterTween?.getValue?.() ?? FEATURE_SYMBOL_CROSSFADE_MIN_ALPHA),
              FEATURE_SYMBOL_CROSSFADE_MIN_ALPHA,
              FEATURE_SYMBOL_CROSSFADE_MAX_ALPHA
            );
          }
        });
    
        overlay._featureSymbolCrossfadeTween = tween;
        target._featureSymbolCrossfadeOverlay = overlay;
        target._featureSymbolCrossfadeTween = tween;
        this.syncFeatureSymbolCrossfadeOverlay(overlay);
      },

    syncFeatureSymbolCrossfadeOverlay(overlay = null) {
        if (!overlay || overlay.destroyed) return;
    
        const target = overlay._featureSymbolCrossfadeTarget;
        if (!target || target.destroyed || !target.scene || !target.scene.sys) {
          const syncHandler = overlay._featureSymbolCrossfadeSyncHandler;
          if (syncHandler) {
            this.events.off("postupdate", syncHandler);
          }
          const tween = overlay._featureSymbolCrossfadeTween;
          if (tween) {
            if (typeof tween.stop === "function") {
              tween.stop();
            }
            if (typeof tween.remove === "function") {
              tween.remove();
            }
          }
          if (!overlay.destroyed) {
            overlay.destroy();
          }
          return;
        }
    
        const root = this.getFeatureSymbolCrossfadeRoot(overlay._featureSymbolCrossfadeRoot, target);
        const symbolId = this.getDisplayObjectSymbolId(root) ?? this.getDisplayObjectSymbolId(target);
        const textureKey = getFeatureSymbolIntenseTextureKey(symbolId);
        if (!textureKey || textureKey !== overlay.texture?.key) {
          this.clearFeatureSymbolCrossfadeForTarget(target);
          return;
        }
    
        const worldMatrix = typeof target.getWorldTransformMatrix === "function"
          ? target.getWorldTransformMatrix()
          : null;
        if (
          worldMatrix &&
          Number.isFinite(Number(worldMatrix.tx)) &&
          Number.isFinite(Number(worldMatrix.ty))
        ) {
          overlay.setPosition(worldMatrix.tx, worldMatrix.ty);
        } else {
          overlay.setPosition(target.x, target.y);
        }
    
        const rootScaleX = root && root !== target ? Number(root.scaleX ?? 1) || 1 : 1;
        const rootScaleY = root && root !== target ? Number(root.scaleY ?? 1) || 1 : 1;
        const rootRotation = root && root !== target ? Number(root.rotation ?? 0) || 0 : 0;
        const rootAlpha = root && root !== target ? Number(root.alpha ?? 1) : 1;
        const targetAlpha = Number(target.alpha ?? 1);
        const phaseAlpha = Phaser.Math.Clamp(
          Number(overlay._featureSymbolCrossfadePhaseAlpha ?? FEATURE_SYMBOL_CROSSFADE_MIN_ALPHA),
          0,
          1
        );
        const depthFromSymbol = getBoardSymbolDepth(symbolId);
        const fallbackDepth = Number(root?.depth ?? target.depth ?? DEPTH_SYMBOLS);
        const overlayDepth = Number.isFinite(Number(depthFromSymbol))
          ? Number(depthFromSymbol)
          : (Number.isFinite(fallbackDepth) ? fallbackDepth : DEPTH_SYMBOLS);
    
        overlay
          .setOrigin(target.originX ?? 0.5, target.originY ?? 0.5)
          .setScale((Number(target.scaleX ?? 1) || 1) * rootScaleX, (Number(target.scaleY ?? 1) || 1) * rootScaleY)
          .setRotation((Number(target.rotation ?? 0) || 0) + rootRotation)
          .setDepth(overlayDepth + 0.18)
          .setVisible(target.visible !== false && root?.visible !== false)
          .setAlpha(Phaser.Math.Clamp(rootAlpha * targetAlpha * phaseAlpha, 0, 1));
    
        if (typeof overlay.setFlipX === "function") {
          overlay.setFlipX(Boolean(target.flipX));
        }
        if (typeof overlay.setFlipY === "function") {
          overlay.setFlipY(Boolean(target.flipY));
        }
      },

    clearFeatureSymbolCrossfadeForDisplay(displayObject = null, options = {}) {
        const target = getReelSymbolRenderable(displayObject);
        if (!target) return;
        this.clearFeatureSymbolCrossfadeForTarget(target, options);
      },

    clearFeatureSymbolCrossfadeForTarget(target = null, { textureKey = null } = {}) {
        if (!target) return;
    
        const overlay = target._featureSymbolCrossfadeOverlay;
        if (!overlay || overlay.destroyed) {
          target._featureSymbolCrossfadeOverlay = null;
          target._featureSymbolCrossfadeTween = null;
          return;
        }
    
        if (textureKey && overlay.texture?.key !== textureKey) {
          return;
        }
    
        const syncHandler = overlay._featureSymbolCrossfadeSyncHandler;
        if (syncHandler) {
          this.events.off("postupdate", syncHandler);
        }
    
        const tween = target._featureSymbolCrossfadeTween || overlay._featureSymbolCrossfadeTween;
        if (tween) {
          if (typeof tween.stop === "function") {
            tween.stop();
          }
          if (typeof tween.remove === "function") {
            tween.remove();
          }
        }
        this.tweens.killTweensOf(overlay);
    
        target._featureSymbolCrossfadeOverlay = null;
        target._featureSymbolCrossfadeTween = null;
        overlay._featureSymbolCrossfadeTarget = null;
        overlay._featureSymbolCrossfadeRoot = null;
        overlay._featureSymbolCrossfadeTween = null;
        overlay._featureSymbolCrossfadeSyncHandler = null;
    
        if (!overlay.destroyed) {
          overlay.destroy();
        }
      },

    ensureFeatureFloatingTiltForDisplay(displayObject = null, tweenKey = "_featureFloatTiltTween", {
        amplitude = 3,
        duration = 3400,
        baseAngle = 0
      } = {}) {
        const target = getReelSymbolRenderable(displayObject);
        if (!target || target.destroyed || !target.scene || !target.scene.sys) return;
        if (target[tweenKey]) return;
    
        const resolvedBaseAngle = Number.isFinite(Number(target.angle)) ? Number(target.angle) : Number(baseAngle) || 0;
        const resolvedAmplitude = Math.max(0.5, Number(amplitude) || 3);
        const resolvedDuration = Math.max(1600, Number(duration) || 3400);
        const phase = ((Number(target.x) || 0) * 0.013) + ((Number(target.y) || 0) * 0.017);
        const startedAt = Number(this.time?.now) || Date.now();
        target._featureFloatingTiltBaseAngle = resolvedBaseAngle;
        target[tweenKey] = this.tweens.addCounter({
          from: 0,
          to: 1,
          duration: resolvedDuration,
          repeat: -1,
          ease: "Sine.easeInOut",
          onUpdate: (counterTween) => {
            if (!target || target.destroyed || !target.scene || !target.scene.sys) {
              if (counterTween && typeof counterTween.stop === "function") {
                counterTween.stop();
              }
              return;
            }
    
            const t = Phaser.Math.Clamp(Number(counterTween?.getValue?.() || 0), 0, 1);
            const now = Number(this.time?.now) || Date.now();
            const ramp = Phaser.Math.Clamp((now - startedAt) / 240, 0, 1);
            target.setAngle(resolvedBaseAngle + Math.sin((t * Math.PI * 2) + phase) * resolvedAmplitude * ramp);
          }
        });
      },

    primeFeatureSymbolFloatingTilt(displayObject = null, rawSymbol = null) {
        const target = getReelSymbolRenderable(displayObject);
        if (!target || target.destroyed || !target.scene || !target.scene.sys) return;
        const symbolId = Number.isFinite(Number(rawSymbol))
          ? Math.floor(Number(rawSymbol))
          : this.getDisplayObjectSymbolId(displayObject);
        if (symbolId === BONUS_MYSTERY_FEATURE_SYMBOL_ID) {
          this.ensureFeatureFloatingTiltForDisplay(displayObject, "_bonusMysteryFeatureFloatTween", {
            amplitude: 3.6,
            duration: 3600
          });
        } else if (symbolId === MERGE_GUN_FEATURE_SYMBOL_ID) {
          this.ensureFeatureFloatingTiltForDisplay(displayObject, "_mergeGunFloatTween", {
            amplitude: 2.8,
            duration: 3800
          });
        } else if (symbolId === LIGHTNING_BEE_FEATURE_SYMBOL_ID) {
          this.ensureFeatureFloatingTiltForDisplay(displayObject, "_lightningBeeFloatTween", {
            amplitude: 4.4,
            duration: 2600
          });
        }
      },

    clearFeatureFloatingTiltForDisplay(displayObject = null, tweenKey = "_featureFloatTiltTween", { resetAngle = false } = {}) {
        const target = getReelSymbolRenderable(displayObject);
        if (!target || target.destroyed) return;
        const tween = target[tweenKey];
        if (tween) {
          if (typeof tween.stop === "function") {
            tween.stop();
          }
          if (typeof tween.remove === "function") {
            tween.remove();
          }
          target[tweenKey] = null;
        }
        if (resetAngle && target.scene && target.scene.sys) {
          const baseAngle = Number(target._featureFloatingTiltBaseAngle);
          target.setAngle(Number.isFinite(baseAngle) ? baseAngle : 0);
        }
        target._featureFloatingTiltBaseAngle = null;
      },

    ensureMergeGunFlareAuraFrame() {
        if (this._mergeGunFlareAuraFrameReady) {
          return this._mergeGunFlareAuraFrameKey || null;
        }
        this._mergeGunFlareAuraFrameReady = true;
        if (!this.textures?.exists?.(BONUS_WON_CRACKLING_SHEET_TEXTURE_KEY)) {
          return null;
        }
    
        const texture = this.textures.get(BONUS_WON_CRACKLING_SHEET_TEXTURE_KEY);
        const atlasText = this.cache?.text?.get?.(BONUS_WON_CRACKLING_ATLAS_TEXT_KEY) || "";
        const frames = parseSpineAtlasFrames(atlasText, {
          pageName: "frameAndBackground.webp"
        });
        const auraFrame = frames.find((frame) => (
          frame?.name === MERGE_GUN_FLARE_AURA_SOURCE_FRAME &&
          frame?.bounds &&
          frame.rotated !== true
        )) || frames.find((frame) => (
          frame?.name === MERGE_GUN_FLARE_AURA_FALLBACK_FRAME &&
          frame?.bounds &&
          frame.rotated !== true
        ));
        if (!auraFrame?.bounds) {
          return null;
        }
    
        if (!texture.frames?.[MERGE_GUN_FLARE_AURA_FRAME_KEY]) {
          texture.add(
            MERGE_GUN_FLARE_AURA_FRAME_KEY,
            0,
            auraFrame.bounds.x,
            auraFrame.bounds.y,
            auraFrame.bounds.width,
            auraFrame.bounds.height
          );
        }
        this._mergeGunFlareAuraFrameKey = MERGE_GUN_FLARE_AURA_FRAME_KEY;
        return this._mergeGunFlareAuraFrameKey;
      },

    ensureMergeGunFlareAuraForDisplay(displayObject = null, { held = false } = {}) {
        const target = getReelSymbolRenderable(displayObject);
        if (!target || target.destroyed || !target.scene || !target.scene.sys) return;
        const frameKey = this.ensureMergeGunFlareAuraFrame();
        if (!frameKey) {
          this.clearMergeGunFlareAuraForTarget(target);
          return;
        }
    
        const root = this.getFeatureSymbolCrossfadeRoot(displayObject, target);
        const existingAura = target._mergeGunFlareAura;
        if (existingAura && !existingAura.destroyed) {
          existingAura._mergeGunAuraRoot = root;
          existingAura._mergeGunAuraHeld = held === true;
          this.syncMergeGunFlareAura(existingAura);
          return;
        }
    
        this.clearMergeGunFlareAuraForTarget(target);
    
        const aura = this.add.image(target.x, target.y, BONUS_WON_CRACKLING_SHEET_TEXTURE_KEY, frameKey)
          .setOrigin(0.5)
          .setAlpha(0)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setTint(0xffffff);
        aura._mergeGunAuraTarget = target;
        aura._mergeGunAuraRoot = root;
        aura._mergeGunAuraHeld = held === true;
        aura._mergeGunAuraPhase = 0;
        aura._mergeGunAuraSyncHandler = () => {
          this.syncMergeGunFlareAura(aura);
        };
        this.events.on("postupdate", aura._mergeGunAuraSyncHandler);
    
        aura._mergeGunAuraTween = this.tweens.addCounter({
          from: 0,
          to: 1,
          duration: held ? 2800 : 4200,
          yoyo: true,
          repeat: -1,
          ease: "Sine.easeInOut",
          onUpdate: (counterTween) => {
            if (!aura || aura.destroyed) {
              if (counterTween && typeof counterTween.stop === "function") {
                counterTween.stop();
              }
              return;
            }
            aura._mergeGunAuraPhase = Phaser.Math.Clamp(Number(counterTween?.getValue?.() || 0), 0, 1);
          }
        });
    
        target._mergeGunFlareAura = aura;
        target._mergeGunFlareAuraTween = aura._mergeGunAuraTween;
        this.syncMergeGunFlareAura(aura);
      },

    syncMergeGunFlareAura(aura = null) {
        if (!aura || aura.destroyed) return;
        const target = aura._mergeGunAuraTarget;
        if (!target || target.destroyed || !target.scene || !target.scene.sys) {
          if (aura._mergeGunAuraSyncHandler) {
            this.events.off("postupdate", aura._mergeGunAuraSyncHandler);
          }
          const tween = aura._mergeGunAuraTween;
          if (tween) {
            if (typeof tween.stop === "function") {
              tween.stop();
            }
            if (typeof tween.remove === "function") {
              tween.remove();
            }
          }
          if (!aura.destroyed) aura.destroy();
          return;
        }
    
        const root = this.getFeatureSymbolCrossfadeRoot(aura._mergeGunAuraRoot, target);
        const worldMatrix = typeof target.getWorldTransformMatrix === "function"
          ? target.getWorldTransformMatrix()
          : null;
        if (
          worldMatrix &&
          Number.isFinite(Number(worldMatrix.tx)) &&
          Number.isFinite(Number(worldMatrix.ty))
        ) {
          aura.setPosition(worldMatrix.tx, worldMatrix.ty);
        } else {
          aura.setPosition(target.x, target.y);
        }
    
        const held = aura._mergeGunAuraHeld === true;
        const targetWidth = Math.max(1, Math.abs(Number(target.displayWidth) || 0));
        const targetAlpha = Number(target.alpha ?? 1);
        const rootAlpha = root && root !== target ? Number(root.alpha ?? 1) : 1;
        const phase = Phaser.Math.Clamp(Number(aura._mergeGunAuraPhase || 0), 0, 1);
        const pulse = Phaser.Math.Linear(0.985, 1.025, phase);
        const baseWidth = Phaser.Math.Clamp(
          targetWidth * (held ? 0.9 : 1),
          held ? 42 : 48,
          held ? 64 : 72
        );
        const baseHeight = baseWidth * 0.96;
        const fallbackDepth = Number(root?.depth ?? target.depth ?? DEPTH_MERGE_GUN_FEATURE);
        const depth = Number.isFinite(fallbackDepth)
          ? fallbackDepth - 0.35
          : DEPTH_MERGE_GUN_FEATURE - 0.35;
        const alpha = Phaser.Math.Clamp(
          rootAlpha * targetAlpha * Phaser.Math.Linear(held ? 0.08 : 0.09, held ? 0.16 : 0.18, phase),
          0,
          held ? 0.18 : 0.2
        );
    
        aura
          .setDisplaySize(baseWidth * pulse, baseHeight * pulse)
          .setRotation(0)
          .setDepth(depth)
          .setVisible(target.visible !== false && root?.visible !== false)
          .setAlpha(alpha);
      },

    clearMergeGunFlareAuraForDisplay(displayObject = null) {
        const target = getReelSymbolRenderable(displayObject);
        if (!target) return;
        this.clearMergeGunFlareAuraForTarget(target);
      },

    clearMergeGunFlareAuraForTarget(target = null) {
        if (!target) return;
        const aura = target._mergeGunFlareAura;
        if (!aura || aura.destroyed) {
          target._mergeGunFlareAura = null;
          target._mergeGunFlareAuraTween = null;
          return;
        }
    
        if (aura._mergeGunAuraSyncHandler) {
          this.events.off("postupdate", aura._mergeGunAuraSyncHandler);
        }
        const tween = target._mergeGunFlareAuraTween || aura._mergeGunAuraTween;
        if (tween) {
          if (typeof tween.stop === "function") {
            tween.stop();
          }
          if (typeof tween.remove === "function") {
            tween.remove();
          }
        }
        this.tweens.killTweensOf(aura);
        target._mergeGunFlareAura = null;
        target._mergeGunFlareAuraTween = null;
        aura._mergeGunAuraTarget = null;
        aura._mergeGunAuraRoot = null;
        aura._mergeGunAuraTween = null;
        aura._mergeGunAuraSyncHandler = null;
        if (!aura.destroyed) {
          aura.destroy();
        }
      },

    ensureMergeGunFeaturePulseForDisplay(displayObject = null) {
        const target = getReelSymbolRenderable(displayObject);
        if (!target || target.destroyed || !target.scene || !target.scene.sys) return;
        this.ensureFeatureSymbolCrossfadeForDisplay(displayObject);
        this.ensureMergeGunFlareAuraForDisplay(displayObject);
        this.ensureFeatureFloatingTiltForDisplay(displayObject, "_mergeGunFloatTween", {
          amplitude: 2.8,
          duration: 3800
        });
        if (target._mergeGunPulseTween) return;
    
        const baseScale = normalScale * 0.9;
        this.setReelCellGraphicDepth(displayObject, getBoardSymbolDepth(MERGE_GUN_FEATURE_SYMBOL_ID));
        target.setScale(baseScale);
        if (typeof target.setTint === "function") {
          target.setTint(0xFFFFFF);
        }
    
        target._mergeGunPulseTween = this.tweens.addCounter({
          from: 0,
          to: 1,
          duration: 920,
          yoyo: true,
          repeat: -1,
          ease: "Sine.easeInOut",
          onUpdate: (counterTween) => {
            if (!target || target.destroyed || !target.scene || !target.scene.sys) {
              if (counterTween && typeof counterTween.stop === "function") {
                counterTween.stop();
              }
              return;
            }
    
            const t = Phaser.Math.Clamp(Number(counterTween?.getValue?.() || 0), 0, 1);
            target.setScale(Phaser.Math.Linear(normalScale * 0.87, normalScale * 0.97, t));
            if (typeof target.setTint === "function") {
              const tint = this.interpolateBonusEndColor(0xFFFFFF, 0xDFFF7A, t);
              target.setTint(tint);
            }
          }
        });
      },

    clearMergeGunFeaturePulseForDisplay(displayObject = null, { resetScale = false } = {}) {
        const target = getReelSymbolRenderable(displayObject);
        if (!target || target.destroyed) return;
    
        const tween = target._mergeGunPulseTween;
        if (tween) {
          if (typeof tween.stop === "function") {
            tween.stop();
          }
          if (typeof tween.remove === "function") {
            tween.remove();
          }
          target._mergeGunPulseTween = null;
        }
        this.clearFeatureFloatingTiltForDisplay(displayObject, "_mergeGunFloatTween", { resetAngle: true });
        this.clearMergeGunFlareAuraForDisplay(displayObject);
        this.clearFeatureSymbolCrossfadeForDisplay(displayObject, {
          textureKey: MERGE_GUN_FEATURE_INTENSE_TEXTURE_KEY
        });
    
        if (resetScale === true && tween) {
          const symbolId = this.getDisplayObjectSymbolId(displayObject);
          target.setScale(getSymbolScale(symbolId));
        }
    
        if (typeof target.clearTint === "function") {
          target.clearTint();
        }
      },

    clearVisibleMergeGunFeatureSymbols({ fade = true } = {}) {
        if (!Array.isArray(this.reelSprites)) return;
    
        const symbolsToClear = [];
        this.reelSprites.forEach((column) => {
          if (!Array.isArray(column)) return;
          column.forEach((cell) => {
            if (!cell || cell.destroyed) return;
            const symbolId = this.getDisplayObjectSymbolId(cell);
            if (symbolId === MERGE_GUN_FEATURE_SYMBOL_ID) {
              symbolsToClear.push(cell);
            }
          });
        });
    
        symbolsToClear.forEach((cell) => {
          if (!cell || cell.destroyed) return;
          const renderable = getReelSymbolRenderable(cell);
          this.clearMergeGunFeaturePulseForDisplay(cell);
          this.clearReelSpriteReferencesForDisplayObject(cell);
          this.tweens.killTweensOf(cell);
          if (renderable && renderable !== cell) {
            this.tweens.killTweensOf(renderable);
          }
    
          if (!fade) {
            cell.destroy();
            return;
          }
    
          this.tweens.add({
            targets: cell,
            alpha: 0,
            scaleX: 0.6,
            scaleY: 0.6,
            duration: 140,
            ease: "Quad.easeOut",
            onComplete: () => {
              if (!cell.destroyed) cell.destroy();
            }
          });
        });
      },

    removeMergeGunFeatureSymbolAt(reel, row) {
        const parsedReel = Math.floor(Number(reel));
        const parsedRow = Math.floor(Number(row));
        if (
          !Number.isFinite(parsedReel) ||
          !Number.isFinite(parsedRow) ||
          parsedReel < 0 ||
          parsedReel >= clientConfig.area.width ||
          parsedRow < 0 ||
          parsedRow >= clientConfig.area.height
        ) {
          return false;
        }
    
        const cell = this.reelSprites?.[parsedReel]?.[parsedRow];
        if (!cell || cell.destroyed || this.getDisplayObjectSymbolId(cell) !== MERGE_GUN_FEATURE_SYMBOL_ID) {
          return false;
        }
    
        const renderable = getReelSymbolRenderable(cell);
        const center = this.getGridCellCenter(parsedReel, parsedRow);
        this.clearMergeGunFeaturePulseForDisplay(cell);
        this.clearReelSpriteReferencesForDisplayObject(cell);
        this.tweens.killTweensOf(cell);
        if (renderable && renderable !== cell) {
          this.tweens.killTweensOf(renderable);
        }
    
        const vanishFlash = this.add.circle(center.x, center.y, 18, 0xDFFF7A, 0.78)
          .setDepth(DEPTH_HERO + 9)
          .setBlendMode(Phaser.BlendModes.ADD);
        this.tweens.add({
          targets: vanishFlash,
          scale: 1.85,
          alpha: 0,
          duration: 150,
          ease: "Quad.easeOut",
          onComplete: () => {
            if (!vanishFlash.destroyed) vanishFlash.destroy();
          }
        });
    
        cell.destroy();
        return true;
      },

    createHeldMergeGunSpriteFromCell(reel, row) {
        const parsedReel = Math.floor(Number(reel));
        const parsedRow = Math.floor(Number(row));
        const hasValidCell =
          Number.isFinite(parsedReel) &&
          Number.isFinite(parsedRow) &&
          parsedReel >= 0 &&
          parsedReel < clientConfig.area.width &&
          parsedRow >= 0 &&
          parsedRow < clientConfig.area.height;
        const center = hasValidCell
          ? this.getGridCellCenter(parsedReel, parsedRow)
          : this.getCenterCollectTarget();
        let sourceX = center.x;
        let sourceY = center.y;
        let sourceScale = normalScale * 0.9;
    
        const cell = hasValidCell ? this.reelSprites?.[parsedReel]?.[parsedRow] : null;
        if (cell && !cell.destroyed && this.getDisplayObjectSymbolId(cell) === MERGE_GUN_FEATURE_SYMBOL_ID) {
          const renderable = getReelSymbolRenderable(cell);
          sourceX = Number.isFinite(Number(cell.x)) ? Number(cell.x) : sourceX;
          sourceY = Number.isFinite(Number(cell.y)) ? Number(cell.y) : sourceY;
          sourceScale = Math.max(0.34, Number(renderable?.scaleX ?? cell.scaleX ?? sourceScale) || sourceScale);
          this.clearMergeGunFeaturePulseForDisplay(cell);
          this.clearReelSpriteReferencesForDisplayObject(cell);
          this.tweens.killTweensOf(cell);
          if (renderable && renderable !== cell) {
            this.tweens.killTweensOf(renderable);
          }
          cell.destroy();
        }
    
        const pickupFlash = this.add.circle(sourceX, sourceY, 16, 0xDFFF7A, 0.62)
          .setDepth(DEPTH_HERO + 8)
          .setBlendMode(Phaser.BlendModes.ADD);
        this.tweens.add({
          targets: pickupFlash,
          scale: 1.7,
          alpha: 0,
          duration: 180,
          ease: "Quad.easeOut",
          onComplete: () => {
            if (!pickupFlash.destroyed) pickupFlash.destroy();
          }
        });
    
        return this.add.image(sourceX, sourceY, String(MERGE_GUN_FEATURE_SYMBOL_ID))
          .setOrigin(0.5)
          .setScale(sourceScale)
          .setDepth(DEPTH_HERO + 13)
          .setAlpha(1);
      },

    getMergeGunHeldTarget(fallback = null) {
        if (this.heroSprite && !this.heroSprite.destroyed) {
          return {
            x: this.heroSprite.x + 8,
            y: this.heroSprite.y + 8
          };
        }
    
        const fallbackX = Number(fallback?.x);
        const fallbackY = Number(fallback?.y);
        if (Number.isFinite(fallbackX) && Number.isFinite(fallbackY)) {
          return { x: fallbackX, y: fallbackY };
        }
    
        return this.getCenterCollectTarget();
      },

    playFeatureCollectionStinger(options = {}) {
        this.playSfx?.("bonus_won_stinger", {
          volume: 0.34,
          rate: Phaser.Math.FloatBetween(0.97, 1.04),
          ...options
        });
      },

    async moveMergeGunIntoHeroHands(activation = null, fallbackSource = null) {
        const pickupReel = activation?.pickupReel ?? activation?.sourceReel;
        const pickupRow = activation?.pickupRow ?? activation?.sourceRow;
        const gun = this.createHeldMergeGunSpriteFromCell(pickupReel, pickupRow);
        if (!gun || gun.destroyed) {
          return null;
        }
    
        this.playFeatureCollectionStinger();
        const heldTarget = this.getMergeGunHeldTarget(fallbackSource);
        const startX = gun.x;
        const startY = gun.y;
        const travel = Phaser.Math.Distance.Between(startX, startY, heldTarget.x, heldTarget.y);
        const arcHeight = Math.min(72, 28 + travel * 0.18);
        const targetScale = normalScale * 0.96;
        const state = { t: 0 };
    
        if (this.heroSprite && !this.heroSprite.destroyed) {
          this.tweens.add({
            targets: this.heroSprite,
            scaleX: this.heroSprite.scaleX * 1.04,
            scaleY: this.heroSprite.scaleY * 1.04,
            duration: 110,
            yoyo: true,
            ease: "Sine.easeOut"
          });
        }
    
        await new Promise((resolve) => {
          this.tweens.add({
            targets: state,
            t: 1,
            duration: 260,
            ease: "Cubic.easeOut",
            onUpdate: () => {
              const t = Phaser.Math.Clamp(Number(state.t || 0), 0, 1);
              gun.setPosition(
                Phaser.Math.Linear(startX, heldTarget.x, t),
                Phaser.Math.Linear(startY, heldTarget.y, t) - Math.sin(t * Math.PI) * arcHeight
              );
              gun.setScale(Phaser.Math.Linear(gun.scaleX, targetScale, 0.24));
              gun.setAngle(Phaser.Math.Linear(gun.angle, -10, 0.2));
            },
            onComplete: () => {
              if (!gun.destroyed) {
                gun.setPosition(heldTarget.x, heldTarget.y);
                gun.setScale(targetScale);
                gun.setAngle(-10);
              }
              resolve();
            }
          });
        });
    
        const holdGlow = this.add.circle(heldTarget.x, heldTarget.y, 18, 0xDFFF7A, 0.42)
          .setDepth(DEPTH_HERO + 12)
          .setBlendMode(Phaser.BlendModes.ADD);
        gun._heldMergeGunGlow = holdGlow;
        this.ensureMergeGunFlareAuraForDisplay(gun, { held: true });
        this.tweens.add({
          targets: holdGlow,
          scale: 1.35,
          alpha: 0.18,
          duration: 220,
          yoyo: true,
          repeat: -1,
          ease: "Sine.easeInOut"
        });
    
        return gun;
      },

    aimHeldMergeGunAt(gun = null, target = null) {
        if (!gun || gun.destroyed || !target) return;
        const angle = Phaser.Math.Angle.Between(gun.x, gun.y, target.x, target.y) * 180 / Math.PI;
        gun.setAngle(Phaser.Math.Clamp(angle, -45, 45));
        const glow = gun._heldMergeGunGlow;
        if (glow && !glow.destroyed) {
          glow.setPosition(gun.x, gun.y);
        }
      },

    async dismissHeldMergeGun(gun = null) {
        if (!gun || gun.destroyed) return;
    
        this.clearMergeGunFlareAuraForDisplay(gun);
        const glow = gun._heldMergeGunGlow;
        if (glow && !glow.destroyed) {
          this.tweens.killTweensOf(glow);
          this.tweens.add({
            targets: glow,
            scale: 2,
            alpha: 0,
            duration: 160,
            ease: "Quad.easeOut",
            onComplete: () => {
              if (!glow.destroyed) glow.destroy();
            }
          });
        }
    
        await new Promise((resolve) => {
          this.tweens.killTweensOf(gun);
          this.tweens.add({
            targets: gun,
            alpha: 0,
            scaleX: gun.scaleX * 0.65,
            scaleY: gun.scaleY * 0.65,
            angle: gun.angle + Phaser.Math.Between(-35, 35),
            duration: 170,
            ease: "Quad.easeIn",
            onComplete: () => {
              if (!gun.destroyed) {
                gun.destroy();
              }
              resolve();
            }
          });
        });
      },

    getNormalizedMergeGunAreas(rawAreas = []) {
        const normalized = [];
        (Array.isArray(rawAreas) ? rawAreas : []).forEach((area, index) => {
          const positions = [];
          const seen = new Set();
          (Array.isArray(area?.positions) ? area.positions : []).forEach((entry) => {
            const reel = Math.floor(Number(entry?.reel));
            const row = Math.floor(Number(entry?.row));
            if (!Number.isFinite(reel) || !Number.isFinite(row)) return;
            if (reel < 0 || reel >= clientConfig.area.width || row < 0 || row >= clientConfig.area.height) return;
            const key = `${reel},${row}`;
            if (seen.has(key)) return;
            seen.add(key);
            positions.push({ reel, row });
          });
          if (positions.length === 0) return;
    
          normalized.push({
            id: String(area?.id || `merge_area_${index}`),
            positions,
            cellCount: Math.max(1, Math.floor(Number(area?.cellCount) || positions.length)),
            baseValueTbm: Number(area?.baseValueTbm || 0),
            resultValueTbm: Number(area?.resultValueTbm ?? area?.totalTbm ?? 0),
            resultValueTwa: Number(area?.resultValueTwa ?? area?.totalTwa ?? 0),
            totalTbm: Number(area?.totalTbm ?? area?.resultValueTbm ?? 0),
            totalTwa: Number(area?.totalTwa ?? area?.resultValueTwa ?? 0)
          });
        });
        return normalized;
      },

    buildMergeGunAreasFromPositions(rawPositions = []) {
        const positionsByKey = new Map();
        (Array.isArray(rawPositions) ? rawPositions : []).forEach((entry) => {
          const reel = Math.floor(Number(entry?.reel));
          const row = Math.floor(Number(entry?.row));
          if (!Number.isFinite(reel) || !Number.isFinite(row)) return;
          positionsByKey.set(`${reel},${row}`, { reel, row });
        });
    
        const remainingKeys = new Set(positionsByKey.keys());
        const areas = [];
    
        while (remainingKeys.size > 0) {
          const seedKey = remainingKeys.values().next().value;
          const queue = [seedKey];
          const areaPositions = [];
          remainingKeys.delete(seedKey);
    
          while (queue.length > 0) {
            const key = queue.shift();
            const position = positionsByKey.get(key);
            if (!position) continue;
            areaPositions.push(position);
    
            [
              `${position.reel - 1},${position.row}`,
              `${position.reel + 1},${position.row}`,
              `${position.reel},${position.row - 1}`,
              `${position.reel},${position.row + 1}`
            ].forEach((neighborKey) => {
              if (!remainingKeys.has(neighborKey)) return;
              remainingKeys.delete(neighborKey);
              queue.push(neighborKey);
            });
          }
    
          areaPositions.sort((a, b) => (a.reel - b.reel) || (a.row - b.row));
          areas.push({
            id: `glue:${areaPositions.map((position) => `${position.reel},${position.row}`).join("|")}`,
            positions: areaPositions,
            cellCount: areaPositions.length
          });
        }
    
        return areas;
      },

    clearMergeGunAreas() {
        if (this.mergeGunAreaDisplays instanceof Map) {
          this.mergeGunAreaDisplays.forEach((display) => {
            this.stopBonusEndHighValuePulse(display);
            if (display?.graphics && !display.graphics.destroyed) display.graphics.destroy();
            if (display?.labelBackplate && !display.labelBackplate.destroyed) display.labelBackplate.destroy();
            if (display?.label && !display.label.destroyed) display.label.destroy();
          });
          this.mergeGunAreaDisplays.clear();
        } else {
          this.mergeGunAreaDisplays = new Map();
        }
        this.mergeGunAreas = [];
      },

    getMergeGunAreaHeatValueForCell(reel, row, areaValueMap = null) {
        const key = `${Math.floor(Number(reel))},${Math.floor(Number(row))}`;
        const normalizedAreas = Array.isArray(this.mergeGunAreas) ? this.mergeGunAreas : [];
        for (const area of normalizedAreas) {
          const positions = Array.isArray(area?.positions) ? area.positions : [];
          const hasCell = positions.some((position) => (
            Number(position?.reel) === Number(reel) && Number(position?.row) === Number(row)
          ));
          if (!hasCell) continue;
    
          const areaId = String(area?.id || "");
          if (areaValueMap instanceof Map && areaValueMap.has(areaId)) {
            const mappedValue = Math.max(0, Number(areaValueMap.get(areaId)) || 0);
            return mappedValue > 0 ? mappedValue : null;
          }
          const liveSummedValue = Array.isArray(area?.positions) && this.immediateLowPositionTbmByKey instanceof Map
            ? area.positions.reduce((sum, position) => (
              sum + Number(this.immediateLowPositionTbmByKey.get(`${position.reel},${position.row}`) || 0)
            ), 0)
            : 0;
          const areaValue = Math.max(
            liveSummedValue,
            Number(area?.totalTbm ?? area?.resultValueTbm ?? area?.baseValueTbm ?? 0) || 0
          );
          if (areaValue > 0) {
            return areaValue;
          }
        }
    
        return null;
      },

    getMergeGunAreaLabelLayout(area, { paddingPx = 12 } = {}) {
        const cellSize = 70;
        const positions = Array.isArray(area?.positions)
          ? area.positions
            .map((position) => ({
              reel: Math.floor(Number(position?.reel)),
              row: Math.floor(Number(position?.row))
            }))
            .filter((position) => (
              Number.isFinite(position.reel) &&
              Number.isFinite(position.row)
            ))
          : [];
        if (positions.length === 0) return null;
    
        const centroid = positions.reduce((acc, position) => {
          const center = this.getGridCellCenter(position.reel, position.row);
          acc.x += center.x;
          acc.y += center.y;
          return acc;
        }, { x: 0, y: 0 });
        centroid.x /= positions.length;
        centroid.y /= positions.length;
    
        const reelsByRow = new Map();
        positions.forEach((position) => {
          if (!reelsByRow.has(position.row)) {
            reelsByRow.set(position.row, []);
          }
          reelsByRow.get(position.row).push(position.reel);
        });
    
        const runs = [];
        reelsByRow.forEach((rawReels, row) => {
          const reels = [...new Set(rawReels)].sort((left, right) => left - right);
          let runStart = reels[0];
          let previous = reels[0];
          for (let index = 1; index <= reels.length; index++) {
            const current = reels[index];
            if (current === previous + 1) {
              previous = current;
              continue;
            }
    
            const runCellCount = previous - runStart + 1;
            const left = GRID_OFFSET_X + runStart * cellSize;
            const right = GRID_OFFSET_X + (previous + 1) * cellSize;
            const centerY = GRID_OFFSET_Y + (clientConfig.area.height - 1 - row) * cellSize + cellSize / 2;
            const centerX = (left + right) / 2;
            runs.push({
              row,
              minReel: runStart,
              maxReel: previous,
              runCellCount,
              x: centerX,
              y: centerY,
              maxWidth: Math.max(24, (runCellCount * cellSize) - paddingPx),
              maxHeight: Math.max(20, cellSize - paddingPx)
            });
    
            runStart = current;
            previous = current;
          }
        });
    
        return runs.reduce((best, run) => {
          const distancePenalty = Math.hypot(run.x - centroid.x, run.y - centroid.y);
          const score = run.maxWidth * 1.35 + run.runCellCount * 16 - distancePenalty;
          if (!best || score > best.score) {
            return { ...run, score };
          }
          return best;
        }, null);
      },

    drawMergeGunAreaShape(area, options = {}) {
        const {
          showValues = false,
          areaValueMap = null,
          pulseAreaIds = [],
          depthBase = DEPTH_HERO + 2,
          showAreaLabel = true
        } = options;
        const cellSize = 70;
        const positions = Array.isArray(area?.positions) ? area.positions : [];
        if (positions.length === 0) return null;
    
        const areaKeySet = new Set(positions.map((position) => `${position.reel},${position.row}`));
        const areaId = String(area?.id || "");
        const hasMappedAreaValue = areaValueMap instanceof Map && areaValueMap.has(areaId);
        const mappedAreaValue = hasMappedAreaValue
          ? Math.max(0, Number(areaValueMap.get(areaId)) || 0)
          : 0;
        const liveAreaValue = this.immediateLowPositionTbmByKey instanceof Map
          ? positions.reduce((sum, position) => (
            sum + Number(this.immediateLowPositionTbmByKey.get(`${position.reel},${position.row}`) || 0)
          ), 0)
          : 0;
        const baseAreaValue = Number(area?.baseValueTbm || 0) || 0;
        const resolvedAreaValue = Number(area?.resultValueTbm ?? area?.totalTbm ?? 0) || 0;
        const displayValueSource = showValues && hasMappedAreaValue
          ? mappedAreaValue
          : Math.max(
            0,
            mappedAreaValue,
            liveAreaValue,
            showValues ? resolvedAreaValue : baseAreaValue
          );
        const displayValue = Number(Math.max(0, displayValueSource).toFixed(4));
        const useAreaHeat = displayValue > 0;
        const heatStyle = this.getBonusEndBoardBackplateVisualStyle(useAreaHeat ? displayValue : 0.5);
        const fillColor = useAreaHeat ? heatStyle.fillColor : (showValues ? heatStyle.fillColor : 0x00E676);
        const strokeColor = useAreaHeat ? heatStyle.strokeColor : (showValues ? heatStyle.strokeColor : 0x00FF3D);
        const cellGlowColor = useAreaHeat ? heatStyle.strokeColor : (showValues ? heatStyle.strokeColor : 0x69F0AE);
        const labelColor = this.colorIntToCss(heatStyle.textColor);
        const valueBackplateAlpha = heatStyle.backplateAlpha;
        const liveAreaDepthBase = showValues ? depthBase : (DEPTH_SYMBOLS - 0.5);
        const graphics = this.add.graphics().setDepth(liveAreaDepthBase);
        if (!showValues && typeof graphics.setBlendMode === "function") {
          graphics.setBlendMode(Phaser.BlendModes.ADD);
        }
        const drawAreaGraphics = ({
          fill = fillColor,
          stroke = strokeColor,
          glow = cellGlowColor,
          fillAlpha = showValues ? valueBackplateAlpha : (useAreaHeat ? 0.3 : 0.22)
        } = {}) => {
          if (!graphics || graphics.destroyed) return;
          graphics.clear();
          graphics.fillStyle(fill, fillAlpha);
          const drawOuterEdge = (x1, y1, x2, y2) => {
            graphics.lineStyle(showValues ? 12 : 12, glow, showValues ? 0.22 : 0.5);
            graphics.beginPath();
            graphics.moveTo(x1, y1);
            graphics.lineTo(x2, y2);
            graphics.strokePath();
            graphics.lineStyle(showValues ? 10 : 7, showValues ? 0x201102 : 0x053B12, 0.98);
            graphics.beginPath();
            graphics.moveTo(x1, y1);
            graphics.lineTo(x2, y2);
            graphics.strokePath();
            graphics.lineStyle(showValues ? 6 : 4, stroke, 1);
            graphics.beginPath();
            graphics.moveTo(x1, y1);
            graphics.lineTo(x2, y2);
            graphics.strokePath();
            if (showValues) {
              graphics.lineStyle(2, 0xFFF7D6, 0.72);
              graphics.beginPath();
              graphics.moveTo(x1, y1);
              graphics.lineTo(x2, y2);
              graphics.strokePath();
            }
          };
    
          positions.forEach((position) => {
            const cellLeft = GRID_OFFSET_X + position.reel * cellSize + 4;
            const cellTop = GRID_OFFSET_Y + (clientConfig.area.height - 1 - position.row) * cellSize + 4;
            const innerSize = cellSize - 8;
            graphics.fillRect(cellLeft, cellTop, innerSize, innerSize);
    
            const neighbors = {
              left: areaKeySet.has(`${position.reel - 1},${position.row}`),
              right: areaKeySet.has(`${position.reel + 1},${position.row}`),
              up: areaKeySet.has(`${position.reel},${position.row + 1}`),
              down: areaKeySet.has(`${position.reel},${position.row - 1}`)
            };
            if (!neighbors.left) {
              drawOuterEdge(cellLeft, cellTop, cellLeft, cellTop + innerSize);
            }
            if (!neighbors.right) {
              drawOuterEdge(cellLeft + innerSize, cellTop, cellLeft + innerSize, cellTop + innerSize);
            }
            if (!neighbors.up) {
              drawOuterEdge(cellLeft, cellTop, cellLeft + innerSize, cellTop);
            }
            if (!neighbors.down) {
              drawOuterEdge(cellLeft, cellTop + innerSize, cellLeft + innerSize, cellTop + innerSize);
            }
          });
        };
        drawAreaGraphics();
    
        let label = null;
        let labelBackplate = null;
        const liveLabelStrength = Math.max(0.18, Math.min(0.68, 0.18 + Math.min(displayValue, 50) / 50 * 0.5));
        if (showAreaLabel !== false && displayValue > 0) {
          let centroidX = 0;
          let centroidY = 0;
          positions.forEach((position) => {
            const center = this.getGridCellCenter(position.reel, position.row);
            centroidX += center.x;
            centroidY += center.y;
          });
          centroidX /= positions.length;
          centroidY /= positions.length;
    
          let anchor = null;
          let bestAnchorScore = -Infinity;
          positions.forEach((position) => {
            const center = this.getGridCellCenter(position.reel, position.row);
            const neighbors = (
              (areaKeySet.has(`${position.reel - 1},${position.row}`) ? 1 : 0) +
              (areaKeySet.has(`${position.reel + 1},${position.row}`) ? 1 : 0) +
              (areaKeySet.has(`${position.reel},${position.row - 1}`) ? 1 : 0) +
              (areaKeySet.has(`${position.reel},${position.row + 1}`) ? 1 : 0)
            );
            const distancePenalty = Math.hypot(center.x - centroidX, center.y - centroidY);
            const score = showValues
              ? neighbors * 8 - distancePenalty
              : neighbors * 1000 - distancePenalty;
            if (score > bestAnchorScore) {
              bestAnchorScore = score;
              anchor = center;
            }
          });
    
          const labelLayout = showValues
            ? this.getMergeGunAreaLabelLayout(area, { paddingPx: 14 })
            : null;
          const centerX = Number(labelLayout?.x ?? anchor?.x ?? centroidX);
          const centerY = Number(labelLayout?.y ?? anchor?.y ?? centroidY);
          const labelY = showValues ? centerY : centerY + 6;
          const formattedValue = this.formatBonusEndBoardValue(displayValue);
          const labelWidth = showValues
            ? Math.max(24, Number(labelLayout?.maxWidth || cellSize - 14))
            : Math.max(74, Math.min(110, 74 + String(this.formatBonusEndBoardValue(displayValue)).length * 7));
          const labelHeight = showValues
            ? Math.max(20, Math.min(40, Number(labelLayout?.maxHeight || cellSize - 14)))
            : 34;
          const labelBackplateWidth = showValues ? Math.max(52, labelWidth + 8) : labelWidth;
          const labelBackplateHeight = showValues ? Math.max(32, labelHeight + 8) : labelHeight;
          labelBackplate = this.add.rectangle(
            centerX,
            labelY,
            labelBackplateWidth,
            labelBackplateHeight,
            showValues ? heatStyle.fillColor : 0x10170D,
            showValues ? valueBackplateAlpha : (0.12 + liveLabelStrength * 0.16)
          )
            .setStrokeStyle(
              showValues ? 3 : 2,
              showValues ? heatStyle.strokeColor : strokeColor,
              showValues ? (0.72 + heatStyle.ratio * 0.22) : (0.16 + liveLabelStrength * 0.45)
            )
            .setDepth(showValues ? depthBase + 0.7 : (DEPTH_SYMBOLS - 0.35))
            .setVisible(true);
          label = this.add.text(centerX, labelY, formattedValue, {
            fontSize: showValues
              ? (Number(labelLayout?.runCellCount || 1) >= 2 ? "28px" : "23px")
              : (positions.length >= 4 ? "22px" : "20px"),
            fontFamily: '"Cinzel", "Times New Roman", serif',
            fontStyle: "bold",
            color: labelColor,
            stroke: "#2B1706",
            strokeThickness: showValues ? 4 : 3
          })
            .setOrigin(0.5)
            .setDepth(showValues ? depthBase + 1.2 : (DEPTH_SYMBOLS - 0.2))
            .setVisible(true)
            .setAlpha(showValues ? 1 : liveLabelStrength);
    
          if (showValues) {
            const maxTextWidth = labelWidth - 10;
            const maxTextHeight = labelHeight - 6;
            const fitScale = Math.min(
              1,
              maxTextWidth / Math.max(1, Number(label.width) || 1),
              maxTextHeight / Math.max(1, Number(label.height) || 1)
            );
            label.setScale(Math.max(0.12, fitScale));
          }
        }
    
        const display = { graphics, labelBackplate, label, valueTbm: displayValue, heatValueTbm: displayValue };
        display.highValuePulseColors = {
          areaFillColor: fillColor,
          areaStrokeColor: strokeColor,
          areaGlowColor: cellGlowColor,
          areaFillAlpha: showValues ? valueBackplateAlpha : (useAreaHeat ? 0.3 : 0.22),
          backplateFillColor: heatStyle.fillColor,
          backplateFillAlpha: showValues ? valueBackplateAlpha : (0.12 + liveLabelStrength * 0.16),
          backplateStrokeColor: showValues ? heatStyle.strokeColor : strokeColor,
          backplateStrokeAlpha: showValues ? (0.72 + heatStyle.ratio * 0.22) : (0.16 + liveLabelStrength * 0.45),
          backplateStrokeWidth: showValues ? 3 : 2
        };
        display.redrawHighValuePulse = (brightnessAmount = 0) => {
          const colors = display.highValuePulseColors || {};
          drawAreaGraphics({
            fill: this.getBonusEndBrightenedColor(colors.areaFillColor ?? fillColor, brightnessAmount),
            stroke: this.getBonusEndBrightenedColor(colors.areaStrokeColor ?? strokeColor, brightnessAmount),
            glow: this.getBonusEndBrightenedColor(colors.areaGlowColor ?? cellGlowColor, brightnessAmount),
            fillAlpha: colors.areaFillAlpha ?? (showValues ? valueBackplateAlpha : (useAreaHeat ? 0.3 : 0.22))
          });
        };
        const highValuePulseStyle = useAreaHeat ? this.getBonusEndHighValuePulseStyle(displayValue) : null;
        const startHighValuePulse = () => {
          if (!highValuePulseStyle) return;
          this.applyBonusEndHighValuePulse(
            display,
            displayValue,
            { area: true }
          );
        };
    
        if (Array.isArray(pulseAreaIds) && pulseAreaIds.includes(String(area?.id))) {
          const pulseTargets = (label ? [graphics, labelBackplate, label] : [graphics])
            .filter((target) => target && !target.destroyed);
          this.tweens.add({
            targets: pulseTargets,
            alpha: 0.55,
            duration: 120,
            yoyo: true,
            repeat: 1,
            ease: "Sine.easeInOut",
            onComplete: startHighValuePulse
          });
        } else if (!showValues) {
          this.tweens.add({
            targets: [graphics],
            alpha: { from: 0.88, to: 0.48 },
            duration: 820,
            yoyo: true,
            repeat: -1,
            ease: "Sine.easeInOut"
          });
          startHighValuePulse();
        } else {
          startHighValuePulse();
        }
    
        return display;
      },

    syncMergeGunAreas(rawAreas = [], options = {}) {
        const {
          isBonus = this.isInBonusMode === true,
          showValues = false,
          areaValueMap = null,
          pulseAreaIds = [],
          depthBase = DEPTH_HERO + 2,
          preserveExistingOnEmpty = false,
          showAreaLabel = showValues,
          hideMergedAreaCells = showValues,
          refreshImmediateLowBackplates = true
        } = options;
        const normalizedAreas = this.getNormalizedMergeGunAreas(rawAreas);
        if (
          preserveExistingOnEmpty === true &&
          isBonus === true &&
          normalizedAreas.length === 0 &&
          Array.isArray(this.mergeGunAreas) &&
          this.mergeGunAreas.length > 0
        ) {
          return;
        }
        this.clearMergeGunAreas();
        this.mergeGunAreas = normalizedAreas;
    
        if (isBonus !== true || normalizedAreas.length === 0) {
          return;
        }
    
        normalizedAreas.forEach((area) => {
          const display = this.drawMergeGunAreaShape(area, {
            showValues,
            areaValueMap,
            pulseAreaIds,
            depthBase,
            showAreaLabel
          });
          if (display) {
            this.mergeGunAreaDisplays.set(String(area.id), display);
          }
        });
        if (refreshImmediateLowBackplates !== false) {
          this.refreshImmediateLowBackplateAreaHeat(areaValueMap, { hideMergedAreaCells });
        }
      },

    async playMergeGunActivations(activations = [], rawAreas = []) {
        const validActivations = Array.isArray(activations) ? activations : [];
        if (validActivations.length === 0) {
          this.syncMergeGunAreas(rawAreas, {
            isBonus: this.isInBonusMode === true,
            showValues: false
          });
          return;
        }
    
        const workingPositionMap = new Map();
        (Array.isArray(this.mergeGunAreas) ? this.mergeGunAreas : []).forEach((area) => {
          (Array.isArray(area?.positions) ? area.positions : []).forEach((position) => {
            const reel = Math.floor(Number(position?.reel));
            const row = Math.floor(Number(position?.row));
            if (!Number.isFinite(reel) || !Number.isFinite(row)) return;
            workingPositionMap.set(`${reel},${row}`, { reel, row });
          });
        });
        const syncWorkingMergeGunAreas = () => {
          const workingAreas = this.buildMergeGunAreasFromPositions(Array.from(workingPositionMap.values()));
          this.syncMergeGunAreas(workingAreas, {
            isBonus: this.isInBonusMode === true,
            showValues: false,
            pulseAreaIds: workingAreas.map((area) => String(area.id))
          });
        };
        let hitIndex = 0;
    
        for (const activation of validActivations) {
          const source = this.getGridCellCenter(
            Number(activation?.sourceReel ?? activation?.pickupReel ?? 0),
            Number(activation?.sourceRow ?? activation?.pickupRow ?? 0)
          );
          const targets = Array.isArray(activation?.firedTargets) ? activation.firedTargets : [];
          const rayPaths = Array.isArray(activation?.rayPaths) && activation.rayPaths.length > 0
            ? activation.rayPaths
            : [{ pathIndex: 0, positions: targets }];
          const laserTravelDuration = 170;
          const impactHoldDuration = 190;
          const segmentFadeDuration = 130;
          const rayResetDelay = 120;
          const laserPalette = [0x8DFF4A, 0xFFE55C, 0xB866FF];
          const getLaserColor = (index, offset = 0) => laserPalette[(index + offset) % laserPalette.length];
          const blendLaserColors = (fromColor, toColor, amount = 0) => {
            const from = Phaser.Display.Color.IntegerToColor(fromColor);
            const to = Phaser.Display.Color.IntegerToColor(toColor);
            const blended = Phaser.Display.Color.Interpolate.ColorWithColor(from, to, 100, Phaser.Math.Clamp(amount, 0, 1) * 100);
            return Number(blended?.color || fromColor);
          };
          const setLaserLine = (line, start, end) => {
            if (!line || line.destroyed) return;
            if (typeof line.setTo === "function") {
              line.setTo(start.x, start.y, end.x, end.y);
              return;
            }
            if (line.geom && typeof line.geom.setTo === "function") {
              line.geom.setTo(start.x, start.y, end.x, end.y);
            }
          };
          const styleLaserLine = (line, width, color, alpha) => {
            if (!line || line.destroyed) return;
            if (typeof line.setStrokeStyle === "function") {
              line.setStrokeStyle(width, color, alpha);
            }
            if (typeof line.setLineWidth === "function") {
              line.setLineWidth(width, width);
            }
          };
          const createGlueImpactHighlight = (center, color, nextColor) => {
            const impactGlow = this.add.circle(center.x, center.y, 18, color, 0.5)
              .setDepth(DEPTH_HERO + 9)
              .setBlendMode(Phaser.BlendModes.ADD);
            const impactRing = this.add.circle(center.x, center.y, 28, nextColor, 0)
              .setStrokeStyle(5, nextColor, 0.98)
              .setDepth(DEPTH_HERO + 10)
              .setBlendMode(Phaser.BlendModes.ADD);
            const glueFrame = this.add.rectangle(center.x, center.y, 62, 62, color, 0.16)
              .setStrokeStyle(5, color, 0.98)
              .setDepth(DEPTH_HERO + 8);
            const glueCore = this.add.rectangle(center.x, center.y, 45, 45, nextColor, 0.18)
              .setStrokeStyle(2, 0xFFFDE7, 0.78)
              .setDepth(DEPTH_HERO + 8);
            const targets = [impactGlow, impactRing, glueFrame, glueCore];
    
            this.tweens.add({
              targets: impactGlow,
              scale: 2.45,
              alpha: 0,
              duration: impactHoldDuration + 170,
              ease: "Quad.easeOut",
              onComplete: () => {
                if (!impactGlow.destroyed) impactGlow.destroy();
              }
            });
            this.tweens.add({
              targets: impactRing,
              radius: 48,
              alpha: 0,
              duration: impactHoldDuration + 220,
              ease: "Quad.easeOut",
              onComplete: () => {
                if (!impactRing.destroyed) impactRing.destroy();
              }
            });
            this.tweens.add({
              targets: [glueFrame, glueCore],
              scale: 1.1,
              alpha: 0,
              duration: impactHoldDuration + 210,
              ease: "Quad.easeOut",
              onComplete: () => {
                if (!glueFrame.destroyed) glueFrame.destroy();
                if (!glueCore.destroyed) glueCore.destroy();
              }
            });
    
            return targets;
          };
          const playLaserSegment = (start, end, colorIndex) => new Promise((resolve) => {
            const startColor = getLaserColor(colorIndex);
            const midColor = getLaserColor(colorIndex, 1);
            const endColor = getLaserColor(colorIndex, 2);
            const beamGlow = this.add.line(0, 0, start.x, start.y, start.x, start.y, startColor, 0.46)
              .setLineWidth(24, 24)
              .setDepth(DEPTH_HERO + 6)
              .setBlendMode(Phaser.BlendModes.ADD);
            const beamOuter = this.add.line(0, 0, start.x, start.y, start.x, start.y, midColor, 0.8)
              .setLineWidth(12, 12)
              .setDepth(DEPTH_HERO + 7)
              .setBlendMode(Phaser.BlendModes.ADD);
            const beamCore = this.add.line(0, 0, start.x, start.y, start.x, start.y, 0xFFFDE7, 1)
              .setLineWidth(5, 5)
              .setDepth(DEPTH_HERO + 8);
            const beamTip = this.add.circle(start.x, start.y, 10, 0xFFFDE7, 0.96)
              .setDepth(DEPTH_HERO + 10)
              .setBlendMode(Phaser.BlendModes.ADD);
            const muzzleFlash = this.add.circle(start.x, start.y, 22, startColor, 0.82)
              .setDepth(DEPTH_HERO + 9)
              .setBlendMode(Phaser.BlendModes.ADD);
            const segmentEffects = [beamGlow, beamOuter, beamCore, beamTip, muzzleFlash];
    
            this.tweens.add({
              targets: muzzleFlash,
              scale: 1.7,
              alpha: 0,
              duration: laserTravelDuration + 70,
              ease: "Quad.easeOut",
              onComplete: () => {
                if (!muzzleFlash.destroyed) muzzleFlash.destroy();
              }
            });
    
            this.tweens.addCounter({
              from: 0,
              to: 1,
              duration: laserTravelDuration,
              ease: "Cubic.easeOut",
              onUpdate: (counter) => {
                const t = Phaser.Math.Clamp(Number(counter?.getValue?.() || 0), 0, 1);
                const current = {
                  x: Phaser.Math.Linear(start.x, end.x, t),
                  y: Phaser.Math.Linear(start.y, end.y, t)
                };
                const activeColor = t < 0.5
                  ? blendLaserColors(startColor, midColor, t * 2)
                  : blendLaserColors(midColor, endColor, (t - 0.5) * 2);
                setLaserLine(beamGlow, start, current);
                setLaserLine(beamOuter, start, current);
                setLaserLine(beamCore, start, current);
                styleLaserLine(beamGlow, 24 + Math.sin(t * Math.PI) * 7, activeColor, 0.42);
                styleLaserLine(beamOuter, 12 + Math.sin(t * Math.PI) * 3, activeColor, 0.9);
                styleLaserLine(beamCore, 5, 0xFFFDE7, 1);
                beamTip.setPosition(current.x, current.y);
                beamTip.setFillStyle(activeColor, 0.95);
                beamTip.setScale(1 + Math.sin(t * Math.PI) * 0.8);
              },
              onComplete: () => {
                const impactEffects = createGlueImpactHighlight(end, endColor, startColor);
                resolve({ segmentEffects, impactEffects, color: endColor });
              }
            });
          });
    
          const heldGun = await this.moveMergeGunIntoHeroHands(activation, source);
          const laserSource = heldGun && !heldGun.destroyed
            ? { x: heldGun.x, y: heldGun.y }
            : source;
          this.playSfx?.("wins_highlight", { volume: 0.22 });
          const laserLoop = this.startLoopingSfx("merge_gun_laser_loop", {
            volume: MERGE_GUN_LASER_LOOP_VOLUME
          }, {
            allowDuringFastForward: false
          });
    
          try {
            for (const rayPath of rayPaths) {
              const positions = Array.isArray(rayPath?.positions) ? rayPath.positions : [];
              if (positions.length === 0) continue;
    
              let beamStart = laserSource;
              for (const target of positions) {
                const end = this.getGridCellCenter(Number(target?.reel || 0), Number(target?.row || 0));
                this.aimHeldMergeGunAt(heldGun, end);
                const { segmentEffects } = await playLaserSegment(beamStart, end, hitIndex);
                const targetReel = Math.floor(Number(target?.reel));
                const targetRow = Math.floor(Number(target?.row));
                if (Number.isFinite(targetReel) && Number.isFinite(targetRow)) {
                  workingPositionMap.set(`${targetReel},${targetRow}`, { reel: targetReel, row: targetRow });
                  syncWorkingMergeGunAreas();
                }
                const hitRate = Math.min(1.34, 0.96 + hitIndex * 0.04);
                this.playSfx?.("wins_explode", {
                  volume: 0.28,
                  rate: hitRate,
                  detune: Math.min(360, hitIndex * 15)
                });
                hitIndex += 1;
    
                await this.waitForPresentation(impactHoldDuration, { skippable: true });
                this.tweens.add({
                  targets: segmentEffects.filter((entry) => entry && !entry.destroyed),
                  alpha: 0,
                  duration: segmentFadeDuration,
                  ease: "Quad.easeOut",
                  onComplete: () => {
                    segmentEffects.forEach((effect) => {
                      if (effect && !effect.destroyed) {
                        effect.destroy();
                      }
                    });
                  }
                });
                await this.waitForPresentation(segmentFadeDuration, { skippable: true });
                beamStart = end;
              }
    
              if (rayPaths.length > 1) {
                await this.waitForPresentation(rayResetDelay, { skippable: true });
              }
            }
          } finally {
            this.stopLoopingSfx(laserLoop, 120);
            await this.dismissHeldMergeGun(heldGun);
          }
        }
    
        syncWorkingMergeGunAreas();
      }
  };
}
