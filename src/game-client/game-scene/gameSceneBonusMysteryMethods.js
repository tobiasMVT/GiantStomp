export function createGameSceneBonusMysteryMethods(deps = {}) {
  const {
    BONUS_END_BALLOON_TEXTURE_FALLBACK,
    BONUS_MYSTERY_FEATURE_ANIM_FPS,
    BONUS_MYSTERY_FEATURE_ANIM_KEY,
    BONUS_MYSTERY_FEATURE_ATLAS_KEY,
    BONUS_MYSTERY_FEATURE_FRAME_COUNT,
    BONUS_MYSTERY_FEATURE_INTENSE_TEXTURE_KEY,
    BONUS_MYSTERY_FEATURE_SPIN_DURATION_MS,
    BONUS_MYSTERY_FEATURE_SYMBOL_ID,
    BONUS_MYSTERY_FEATURE_USE_ATLAS_ANIMATION,
    BONUS_MYSTERY_METER_ICON_OUTLINE_SCALE,
    BONUS_MYSTERY_METER_ICON_SCALE,
    DEPTH_HERO,
    GRID_OFFSET_X,
    GRID_OFFSET_Y,
    LIGHTNING_BEE_FEATURE_SYMBOL_ID,
    MERGE_GUN_FEATURE_SYMBOL_ID,
    Phaser,
    clientConfig,
    getBoardSymbolDepth,
    getReelSymbolRenderable,
    getSymbolScale
  } = deps;

  return {
    ensureBonusMysteryFeatureAnimation() {
        if (!BONUS_MYSTERY_FEATURE_USE_ATLAS_ANIMATION) return false;
        if (!this.anims) return false;
        if (this.anims.exists(BONUS_MYSTERY_FEATURE_ANIM_KEY)) {
          return true;
        }
        if (!this.textures?.exists(BONUS_MYSTERY_FEATURE_ATLAS_KEY)) {
          return false;
        }
        this.anims.create({
          key: BONUS_MYSTERY_FEATURE_ANIM_KEY,
          frames: this.anims.generateFrameNames(BONUS_MYSTERY_FEATURE_ATLAS_KEY, {
            prefix: "image_",
            start: 0,
            end: 28,
            zeroPad: 4,
            suffix: ".png"
          }),
          frameRate: BONUS_MYSTERY_FEATURE_ANIM_FPS,
          repeat: -1
        });
        return true;
      },

    ensureBonusMysterySpinForDisplay(displayObject = null) {
        const target = getReelSymbolRenderable(displayObject);
        if (!target || target.destroyed || !target.scene || !target.scene.sys) return;
        const symbolId = this.getDisplayObjectSymbolId(displayObject);
        if (symbolId !== BONUS_MYSTERY_FEATURE_SYMBOL_ID) {
          this.clearBonusMysterySpinForDisplay(displayObject, { resetAngle: true });
          return;
        }
    
        const baseScale = getSymbolScale(BONUS_MYSTERY_FEATURE_SYMBOL_ID);
        this.ensureFeatureSymbolCrossfadeForDisplay(displayObject);
        this.ensureFeatureFloatingTiltForDisplay(displayObject, "_bonusMysteryFeatureFloatTween", {
          amplitude: 3.6,
          duration: 3600
        });
        if (!target._bonusMysteryFeaturePulseTween) {
          target.setScale(baseScale);
        }
        this.ensureBonusMysteryFeaturePulseForDisplay(displayObject);
        if (!BONUS_MYSTERY_FEATURE_USE_ATLAS_ANIMATION) {
          const existingFrameTween = target._bonusMysteryFrameTween;
          if (existingFrameTween) {
            if (typeof existingFrameTween.stop === "function") {
              existingFrameTween.stop();
            }
            if (typeof existingFrameTween.remove === "function") {
              existingFrameTween.remove();
            }
          }
          const existingSpinTween = target._bonusMysterySpinTween;
          if (existingSpinTween) {
            if (typeof existingSpinTween.stop === "function") {
              existingSpinTween.stop();
            }
            if (typeof existingSpinTween.remove === "function") {
              existingSpinTween.remove();
            }
          }
          target._bonusMysteryFrameTween = null;
          target._bonusMysterySpinTween = null;
          target._bonusMysterySpinDirection = null;
          if (target.texture?.key !== String(BONUS_MYSTERY_FEATURE_SYMBOL_ID) && typeof target.setTexture === "function") {
            target.setTexture(String(BONUS_MYSTERY_FEATURE_SYMBOL_ID));
          }
          this.ensureBonusMysteryFeaturePulseForDisplay(displayObject);
          return;
        }
    
        const canUseAtlasFrames =
          this.textures?.exists(BONUS_MYSTERY_FEATURE_ATLAS_KEY) &&
          typeof target.setTexture === "function" &&
          typeof target.setFrame === "function";
    
        if (canUseAtlasFrames) {
          const existingRotateTween = target._bonusMysterySpinTween;
          if (existingRotateTween) {
            if (typeof existingRotateTween.stop === "function") {
              existingRotateTween.stop();
            }
            if (typeof existingRotateTween.remove === "function") {
              existingRotateTween.remove();
            }
            target._bonusMysterySpinTween = null;
            target._bonusMysterySpinDirection = null;
          }
    
          if (target.texture?.key !== BONUS_MYSTERY_FEATURE_ATLAS_KEY) {
            target.setTexture(BONUS_MYSTERY_FEATURE_ATLAS_KEY, "image_0000.png");
          }
    
          const existingFrameTween = target._bonusMysteryFrameTween;
          if (existingFrameTween) {
            return;
          }
    
          target._bonusMysteryFrameTween = this.tweens.addCounter({
            from: 0,
            // Keep the tween below FRAME_COUNT so frame 0 is not shown twice per loop.
            to: BONUS_MYSTERY_FEATURE_FRAME_COUNT - Number.EPSILON,
            duration: BONUS_MYSTERY_FEATURE_SPIN_DURATION_MS,
            ease: "Linear",
            repeat: -1,
            onUpdate: (counterTween) => {
              if (!target || target.destroyed || !target.scene || !target.scene.sys) {
                if (counterTween) {
                  if (typeof counterTween.stop === "function") {
                    counterTween.stop();
                  }
                  if (typeof counterTween.remove === "function") {
                    counterTween.remove();
                  }
                }
                if (target && !target.destroyed) {
                  target._bonusMysteryFrameTween = null;
                }
                return;
              }
              const rawValue = Number(counterTween?.getValue?.() ?? 0);
              const frameIndex = Math.max(
                0,
                Math.min(BONUS_MYSTERY_FEATURE_FRAME_COUNT - 1, Math.floor(rawValue))
              );
              const frameName = `image_${String(frameIndex).padStart(4, "0")}.png`;
              target.setFrame(frameName);
            },
            onComplete: () => {
              if (target && !target.destroyed) {
                target._bonusMysteryFrameTween = null;
              }
            }
          });
          return;
        }
    
        const existingFrameTween = target._bonusMysteryFrameTween;
        if (existingFrameTween) {
          if (typeof existingFrameTween.stop === "function") {
            existingFrameTween.stop();
          }
          if (typeof existingFrameTween.remove === "function") {
            existingFrameTween.remove();
          }
          target._bonusMysteryFrameTween = null;
        }
    
        const existingTween = target._bonusMysterySpinTween;
        const desiredDirection = "ccw";
        if (existingTween && target._bonusMysterySpinDirection === desiredDirection) {
          return;
        }
        if (existingTween) {
          if (typeof existingTween.stop === "function") {
            existingTween.stop();
          }
          if (typeof existingTween.remove === "function") {
            existingTween.remove();
          }
          target._bonusMysterySpinTween = null;
        }
    
        target._bonusMysterySpinTween = this.tweens.add({
          targets: target,
          angle: "-=360",
          duration: 900,
          ease: "Linear",
          repeat: -1
        });
        target._bonusMysterySpinDirection = desiredDirection;
      },

    clearBonusMysterySpinForDisplay(displayObject = null, { resetAngle = false } = {}) {
        const target = getReelSymbolRenderable(displayObject);
        if (!target || target.destroyed) return;
        const existingFrameTween = target._bonusMysteryFrameTween;
        if (existingFrameTween) {
          if (typeof existingFrameTween.stop === "function") {
            existingFrameTween.stop();
          }
          if (typeof existingFrameTween.remove === "function") {
            existingFrameTween.remove();
          }
        }
        const existingTween = target._bonusMysterySpinTween;
        if (existingTween) {
          if (typeof existingTween.stop === "function") {
            existingTween.stop();
          }
          if (typeof existingTween.remove === "function") {
            existingTween.remove();
          }
        }
        const existingPulseTween = target._bonusMysteryFeaturePulseTween;
        if (existingPulseTween) {
          if (typeof existingPulseTween.stop === "function") {
            existingPulseTween.stop();
          }
          if (typeof existingPulseTween.remove === "function") {
            existingPulseTween.remove();
          }
        }
        this.clearFeatureFloatingTiltForDisplay(displayObject, "_bonusMysteryFeatureFloatTween", { resetAngle });
        target._bonusMysteryFrameTween = null;
        target._bonusMysterySpinTween = null;
        target._bonusMysterySpinDirection = null;
        target._bonusMysteryFeaturePulseTween = null;
        target._bonusMysteryFeatureBaseScale = null;
        this.clearFeatureSymbolCrossfadeForDisplay(displayObject, {
          textureKey: BONUS_MYSTERY_FEATURE_INTENSE_TEXTURE_KEY
        });
        if (existingPulseTween) {
          const symbolId = this.getDisplayObjectSymbolId(displayObject);
          target.setScale(getSymbolScale(symbolId));
          target.setAlpha(1);
          if (typeof target.clearTint === "function") {
            target.clearTint();
          }
        }
      },

    ensureBonusMysteryFeaturePulseForDisplay(displayObject = null) {
        const target = getReelSymbolRenderable(displayObject);
        if (!target || target.destroyed || !target.scene || !target.scene.sys) return;
        if (target._bonusMysteryFeaturePulseTween) return;
    
        const baseScale = getSymbolScale(BONUS_MYSTERY_FEATURE_SYMBOL_ID);
        this.setReelCellGraphicDepth(displayObject, getBoardSymbolDepth(BONUS_MYSTERY_FEATURE_SYMBOL_ID));
        target._bonusMysteryFeatureBaseScale = baseScale;
        target.setScale(baseScale);
        if (typeof target.setTint === "function") {
          target.setTint(0xFFFFFF);
        }
    
        target._bonusMysteryFeaturePulseTween = this.tweens.addCounter({
          from: 0,
          to: 1,
          duration: 980,
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
            const currentBaseScale = Number(target._bonusMysteryFeatureBaseScale || baseScale);
            target.setScale(Phaser.Math.Linear(currentBaseScale * 0.96, currentBaseScale * 1.12, t));
            target.setAlpha(Phaser.Math.Linear(0.94, 1, t));
            if (typeof target.setTint === "function") {
              const tint = this.interpolateBonusEndColor(0xE8D9FF, 0xFFFFFF, t);
              target.setTint(tint);
            }
          }
        });
      },

    syncBonusMysteryFeatureSpinState() {
        if (!Array.isArray(this.reelSprites)) return;
        const visited = new Set();
        this.reelSprites.forEach((column) => {
          if (!Array.isArray(column)) return;
          column.forEach((cell) => {
            if (!cell || cell.destroyed) return;
            const renderable = getReelSymbolRenderable(cell);
            if (!renderable || renderable.destroyed || !renderable.scene || !renderable.scene.sys) return;
            if (visited.has(renderable)) return;
            visited.add(renderable);
            const symbolId = this.getDisplayObjectSymbolId(cell);
            if (symbolId === BONUS_MYSTERY_FEATURE_SYMBOL_ID) {
              this.ensureBonusMysterySpinForDisplay(cell);
            } else {
              this.clearBonusMysterySpinForDisplay(cell, { resetAngle: true });
            }
          });
        });
        this.syncMergeGunFeatureSymbolState();
        this.syncLightningBeeFeatureSymbolState();
      },

    ensureBonusMysteryMeterIconSpin() {
        const displays = [
          this.bonusMysteryMeterIcon,
          this.bonusMysteryMeterIconOutline
        ];
    
        displays.forEach((display) => {
          if (!display || display.destroyed) return;
          const existingTween = display._bonusMysteryMeterSpinTween;
          if (existingTween && typeof existingTween.stop === "function") {
            existingTween.stop();
          }
          if (existingTween && typeof existingTween.remove === "function") {
            existingTween.remove();
          }
          display._bonusMysteryMeterSpinTween = null;
          if (display.texture?.key !== String(BONUS_MYSTERY_FEATURE_SYMBOL_ID) && typeof display.setTexture === "function") {
            display.setTexture(String(BONUS_MYSTERY_FEATURE_SYMBOL_ID));
          }
          display.setAngle?.(0);
        });
      },

    getBonusMysteryMeterTarget() {
        const cellSize = 70;
        const fallbackX = (clientConfig.area.width * cellSize) / 2 + GRID_OFFSET_X;
        const fallbackY = clientConfig.area.height * cellSize + 40 + GRID_OFFSET_Y;
        return {
          x: Number(this.countUpText?.x ?? fallbackX),
          y: Number(this.countUpText?.y ?? fallbackY)
        };
      },

    ensureBonusMysteryMeterUi() {
        const target = this.getBonusMysteryMeterTarget();
        const meterCenterX = target.x + 190;
        const meterCenterY = target.y + 2;
        if (this.countUpText && !this.countUpText.destroyed) {
          this.countUpText.setDepth(205);
        }
    
        if (this.bonusMysteryMeterBg && !this.bonusMysteryMeterBg.destroyed) {
          this.bonusMysteryMeterBg.destroy();
          this.bonusMysteryMeterBg = null;
        }
    
        if (!this.bonusMysteryMeterIconOutline || this.bonusMysteryMeterIconOutline.destroyed) {
          this.bonusMysteryMeterIconOutline = this.add.image(meterCenterX, meterCenterY, String(BONUS_MYSTERY_FEATURE_SYMBOL_ID))
            .setOrigin(0.5)
            .setScale(BONUS_MYSTERY_METER_ICON_OUTLINE_SCALE)
            .setDepth(202.8)
            .setTint(0x000000)
            .setAlpha(0.72)
            .setVisible(false);
        } else {
          this.bonusMysteryMeterIconOutline
            .setPosition(meterCenterX, meterCenterY)
            .setScale(BONUS_MYSTERY_METER_ICON_OUTLINE_SCALE)
            .setTint(0x000000)
            .setAlpha(0.72)
            .setDepth(202.8);
        }
    
        if (!this.bonusMysteryMeterIcon || this.bonusMysteryMeterIcon.destroyed) {
          this.bonusMysteryMeterIcon = this.add.image(meterCenterX, meterCenterY, String(BONUS_MYSTERY_FEATURE_SYMBOL_ID));
          this.bonusMysteryMeterIcon
            .setOrigin(0.5)
            .setScale(BONUS_MYSTERY_METER_ICON_SCALE)
            .setDepth(203)
            .setVisible(false);
        } else {
          this.bonusMysteryMeterIcon
            .setPosition(meterCenterX, meterCenterY)
            .setScale(BONUS_MYSTERY_METER_ICON_SCALE)
            .setDepth(203);
        }
        this.ensureBonusMysteryMeterIconSpin();
    
        if (!this.bonusMysteryMeterText || this.bonusMysteryMeterText.destroyed) {
          this.bonusMysteryMeterText = this.add.text(meterCenterX, meterCenterY + 1, "0", {
            fontSize: "27px",
            fontFamily: '"Cinzel", "Times New Roman", serif',
            fontStyle: "bold",
            color: "#FFF8D6",
            stroke: "#000000",
            strokeThickness: 7,
            shadow: {
              offsetX: 0,
              offsetY: 2,
              color: "#000000",
              blur: 4,
              fill: true
            }
          })
            .setOrigin(0.5)
            .setDepth(204)
            .setVisible(false);
        } else {
          this.bonusMysteryMeterText
            .setPosition(meterCenterX, meterCenterY + 1)
            .setDepth(204);
        }
      },

    setBonusMysteryMeterVisible(visible = false) {
        const isVisible = visible === true;
        if (this.bonusMysteryMeterBg && !this.bonusMysteryMeterBg.destroyed) {
          this.bonusMysteryMeterBg.setVisible(isVisible);
        }
        if (this.bonusMysteryMeterIconOutline && !this.bonusMysteryMeterIconOutline.destroyed) {
          this.bonusMysteryMeterIconOutline.setVisible(isVisible);
        }
        if (this.bonusMysteryMeterIcon && !this.bonusMysteryMeterIcon.destroyed) {
          this.bonusMysteryMeterIcon.setVisible(isVisible);
        }
        if (this.bonusMysteryMeterText && !this.bonusMysteryMeterText.destroyed) {
          const collected = Math.max(0, Math.floor(Number(this.bonusMysteryMeterState?.collected) || 0));
          this.bonusMysteryMeterText.setVisible(isVisible && collected > 0);
        }
        this.applyBonusMysteryMeterVisualState(isVisible);
      },

    applyBonusMysteryMeterVisualState(visible = true) {
        const isVisible = visible === true;
        const collected = Math.max(0, Math.floor(Number(this.bonusMysteryMeterState?.collected) || 0));
        const isActive = isVisible && collected > 0;
    
        if (this.bonusMysteryMeterIconOutline && !this.bonusMysteryMeterIconOutline.destroyed) {
          this.bonusMysteryMeterIconOutline
            .setVisible(isVisible)
            .setAlpha(isActive ? 0.76 : 0.5)
            .setTint(0x000000);
        }
    
        if (this.bonusMysteryMeterIcon && !this.bonusMysteryMeterIcon.destroyed) {
          this.bonusMysteryMeterIcon
            .setVisible(isVisible)
            .setAlpha(isActive ? 1 : 0.58);
          if (isActive && typeof this.bonusMysteryMeterIcon.clearTint === "function") {
            this.bonusMysteryMeterIcon.clearTint();
          } else {
            this.bonusMysteryMeterIcon.setTint?.(0x5E6F67);
          }
        }
    
        if (this.bonusMysteryMeterText && !this.bonusMysteryMeterText.destroyed) {
          this.bonusMysteryMeterText
            .setText(isActive ? String(collected) : "")
            .setColor("#FFE082")
            .setVisible(isActive)
            .setAlpha(isActive ? 1 : 0);
        }
      },

    updateBonusMysteryMeter(state = null, { isBonus = this.isInBonusMode === true, pulse = false } = {}) {
        const max = Math.max(1, Math.floor(Number(state?.max ?? this.bonusMysteryMeterState?.max ?? 3) || 3));
        const collected = Math.max(0, Math.min(max, Math.floor(Number(state?.collected ?? this.bonusMysteryMeterState?.collected ?? 0) || 0)));
        this.bonusMysteryMeterState = { collected, max };
        this.setBonusMysteryMeterVisible(false);
      },

    playBonusMysteryMeterSpendFx({ depleted = false } = {}) {
        return;
      },

    async playBonusMysteryFeatureCollection(entry = null) {
        const reel = Math.floor(Number(entry?.reel));
        const row = Math.floor(Number(entry?.row));
        if (
          !Number.isFinite(reel) ||
          !Number.isFinite(row) ||
          reel < 0 ||
          reel >= clientConfig.area.width ||
          row < 0 ||
          row >= clientConfig.area.height
        ) {
          return Promise.resolve(false);
        }
    
        this.ensureBonusMysteryMeterUi();
        const cellCenter = this.getGridCellCenter(reel, row);
        const meterTarget = {
          x: Number(this.bonusMysteryMeterIcon?.x ?? this.getBonusMysteryMeterTarget().x),
          y: Number(this.bonusMysteryMeterIcon?.y ?? this.getBonusMysteryMeterTarget().y)
        };
        const findBoardSpriteAtCell = () => {
          const tracked = this.reelSprites?.[reel]?.[row];
          if (tracked && !tracked.destroyed && this.getDisplayObjectSymbolId(tracked) === BONUS_MYSTERY_FEATURE_SYMBOL_ID) {
            return tracked;
          }
    
          const sceneChildren = this.children?.list;
          if (!Array.isArray(sceneChildren) || sceneChildren.length === 0) {
            return null;
          }
    
          const tolerance = Math.max(8, Math.floor(70 * 0.34));
          let resolved = null;
          sceneChildren.forEach((child) => {
            if (!child || child.destroyed) return;
            if (this.isBonusFruitPileTokenSprite(child)) return;
            if (!Number.isFinite(child.x) || !Number.isFinite(child.y)) return;
            if (Math.abs(child.x - cellCenter.x) > tolerance) return;
            if (Math.abs(child.y - cellCenter.y) > tolerance) return;
            if (this.getDisplayObjectSymbolId(child) !== BONUS_MYSTERY_FEATURE_SYMBOL_ID) return;
            if (!resolved || Number(child.depth || 0) >= Number(resolved.depth || 0)) {
              resolved = child;
            }
          });
          return resolved;
        };
        const destroyDuplicateSpritesAtCell = (preserved = null) => {
          const sceneChildren = this.children?.list;
          if (!Array.isArray(sceneChildren) || sceneChildren.length === 0) return;
    
          const preservedRenderable = getReelSymbolRenderable(preserved);
          const tolerance = Math.max(8, Math.floor(70 * 0.34));
          sceneChildren.forEach((child) => {
            if (!child || child.destroyed || child === preserved || child === preservedRenderable) return;
            if (this.isBonusFruitPileTokenSprite(child)) return;
            if (!Number.isFinite(child.x) || !Number.isFinite(child.y)) return;
            if (Math.abs(child.x - cellCenter.x) > tolerance) return;
            if (Math.abs(child.y - cellCenter.y) > tolerance) return;
            if (this.getDisplayObjectSymbolId(child) !== BONUS_MYSTERY_FEATURE_SYMBOL_ID) return;
            this.clearReelSpriteReferencesForDisplayObject(child);
            this.tweens.killTweensOf(child);
            this.clearBonusMysterySpinForDisplay(child);
            if (!child.destroyed) child.destroy();
          });
        };
    
        const addTweenPromise = ({ onComplete, ...config }) => new Promise((resolve) => {
          this.tweens.add({
            ...config,
            onComplete: (...args) => {
              onComplete?.(...args);
              resolve();
            }
          });
        });
        const playRandomCollectionSfx = (soundKeys = [], options = {}) => {
          const validKeys = soundKeys.filter((key) => typeof key === "string" && key.length > 0);
          if (validKeys.length === 0) return;
          const selectedKey = validKeys[Math.floor(Math.random() * validKeys.length)];
          this.playSfx?.(selectedKey, options);
        };
        const collectionBaseScale = getSymbolScale(BONUS_MYSTERY_FEATURE_SYMBOL_ID) * 1.24;
        const collectionTargetScale = getSymbolScale(BONUS_MYSTERY_FEATURE_SYMBOL_ID) * 0.78;
        let sprite = findBoardSpriteAtCell();
        if (!sprite || sprite.destroyed) {
          sprite = this.add.image(cellCenter.x, cellCenter.y, String(BONUS_MYSTERY_FEATURE_SYMBOL_ID))
            .setOrigin(0.5)
            .setScale(collectionBaseScale)
            .setDepth(DEPTH_HERO + 11);
          sprite.symbolKey = BONUS_MYSTERY_FEATURE_SYMBOL_ID;
        }
    
        this.clearBonusMysterySpinForDisplay(sprite);
        this.clearReelSpriteReferencesForDisplayObject(sprite);
        destroyDuplicateSpritesAtCell(sprite);
        if (this.reelSprites?.[reel]) {
          this.reelSprites[reel][row] = null;
        }
        this.tweens.killTweensOf(sprite);
        this.destroyBananaBackplate(sprite);
        sprite.setVisible(true);
        sprite.setAlpha(1);
        sprite.setScale(collectionBaseScale);
        if (typeof sprite.setTint === "function") {
          sprite.setTint(0xFFFFFF);
        }
        sprite.setDepth(DEPTH_HERO + 14);
        this.playFeatureCollectionStinger();
    
        const sparkColors = [0xFFFFFF, 0xFFF07A, 0xC56BFF, 0x7FFFE8];
        const burstRing = this.add.circle(cellCenter.x, cellCenter.y, 32, 0xFFFFFF, 0)
          .setStrokeStyle(7, 0xFFFFFF, 0.95)
          .setDepth(DEPTH_HERO + 13)
          .setBlendMode(Phaser.BlendModes.ADD);
        const burstRingPurple = this.add.circle(cellCenter.x, cellCenter.y, 20, 0xC56BFF, 0)
          .setStrokeStyle(5, 0xC56BFF, 0.9)
          .setDepth(DEPTH_HERO + 13)
          .setBlendMode(Phaser.BlendModes.ADD);
        const burstCore = this.add.circle(cellCenter.x, cellCenter.y, 22, 0xFFF07A, 0.68)
          .setDepth(DEPTH_HERO + 13)
          .setBlendMode(Phaser.BlendModes.ADD);
        const collectPulseRing = this.add.circle(cellCenter.x, cellCenter.y, 34, 0xFFFFFF, 0)
          .setStrokeStyle(6, 0xFFF07A, 0.96)
          .setDepth(DEPTH_HERO + 16)
          .setBlendMode(Phaser.BlendModes.ADD);
        const collectPulseAura = this.add.circle(cellCenter.x, cellCenter.y, 28, 0xC56BFF, 0.28)
          .setDepth(DEPTH_HERO + 13)
          .setBlendMode(Phaser.BlendModes.ADD);
        const plusLabel = this.add.text(cellCenter.x, cellCenter.y - 34, "+1", {
          fontSize: "30px",
          fontFamily: '"Cinzel", "Times New Roman", serif',
          fontStyle: "bold",
          color: "#FFFFFF",
          stroke: "#2B0948",
          strokeThickness: 6
        })
          .setOrigin(0.5)
          .setDepth(DEPTH_HERO + 15);
    
        const beam = this.add.graphics()
          .setDepth(DEPTH_HERO + 12)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setAlpha(1);
        const beamState = { progress: 0, alpha: 1 };
        this.tweens.add({
          targets: beamState,
          progress: 1,
          duration: 620,
          ease: "Cubic.easeOut",
          onUpdate: () => {
            if (!beam || beam.destroyed) return;
            const endX = Phaser.Math.Linear(cellCenter.x, meterTarget.x, beamState.progress);
            const endY = Phaser.Math.Linear(cellCenter.y, meterTarget.y, beamState.progress);
            beam.clear();
            beam.lineStyle(13, 0xFFFFFF, 0.22 * beamState.alpha);
            beam.lineBetween(cellCenter.x, cellCenter.y, endX, endY);
            beam.lineStyle(7, 0xFFF07A, 0.42 * beamState.alpha);
            beam.lineBetween(cellCenter.x, cellCenter.y, endX, endY);
            beam.lineStyle(3, 0xC56BFF, 0.8 * beamState.alpha);
            beam.lineBetween(cellCenter.x, cellCenter.y, endX, endY);
          },
          onComplete: () => {
            this.tweens.add({
              targets: beamState,
              alpha: 0,
              duration: 320,
              ease: "Quad.easeOut",
              onUpdate: () => {
                if (!beam || beam.destroyed) return;
                beam.alpha = beamState.alpha;
              },
              onComplete: () => {
                if (beam && !beam.destroyed) beam.destroy();
              }
            });
          }
        });
    
        for (let i = 0; i < 18; i++) {
          const angle = (Math.PI * 2 * i) / 18 + Phaser.Math.FloatBetween(-0.18, 0.18);
          const distance = Phaser.Math.Between(32, 74);
          const color = sparkColors[i % sparkColors.length];
          const spark = this.add.circle(cellCenter.x, cellCenter.y, Phaser.Math.FloatBetween(2.2, 4.8), color, 0.95)
            .setDepth(DEPTH_HERO + 15)
            .setBlendMode(Phaser.BlendModes.ADD);
          this.tweens.add({
            targets: spark,
            x: cellCenter.x + Math.cos(angle) * distance,
            y: cellCenter.y + Math.sin(angle) * distance,
            alpha: 0,
            scale: 0.25,
            duration: Phaser.Math.Between(360, 620),
            ease: "Cubic.easeOut",
            onComplete: () => {
              if (!spark.destroyed) spark.destroy();
            }
          });
        }
    
        for (let i = 0; i < 11; i++) {
          const color = sparkColors[(i + 1) % sparkColors.length];
          const trail = this.add.circle(
            cellCenter.x + Phaser.Math.Between(-8, 8),
            cellCenter.y + Phaser.Math.Between(-8, 8),
            Phaser.Math.FloatBetween(2.5, 4.5),
            color,
            0.92
          )
            .setDepth(DEPTH_HERO + 14)
            .setBlendMode(Phaser.BlendModes.ADD);
          this.tweens.add({
            targets: trail,
            x: meterTarget.x + Phaser.Math.Between(-10, 10),
            y: meterTarget.y + Phaser.Math.Between(-10, 10),
            alpha: 0,
            scale: 0.35,
            delay: 170 + i * 38,
            duration: 760 + i * 16,
            ease: "Cubic.easeInOut",
            onComplete: () => {
              if (!trail.destroyed) trail.destroy();
            }
          });
        }
    
        playRandomCollectionSfx(["mystery_reveal", "orb_collect", "wins_highlight"], {
          volume: 0.26,
          rate: Phaser.Math.FloatBetween(1.04, 1.16)
        });
        this.tweens.add({
          targets: burstRing,
          radius: 72,
          alpha: 0,
          duration: 520,
          ease: "Quad.easeOut",
          onComplete: () => {
            if (!burstRing.destroyed) burstRing.destroy();
          }
        });
        this.tweens.add({
          targets: burstRingPurple,
          radius: 54,
          alpha: 0,
          duration: 430,
          ease: "Quad.easeOut",
          onComplete: () => {
            if (!burstRingPurple.destroyed) burstRingPurple.destroy();
          }
        });
        this.tweens.add({
          targets: burstCore,
          scale: 2.6,
          alpha: 0,
          duration: 340,
          ease: "Quad.easeOut",
          onComplete: () => {
            if (!burstCore.destroyed) burstCore.destroy();
          }
        });
        this.tweens.add({
          targets: collectPulseRing,
          radius: 66,
          alpha: 0.18,
          duration: 170,
          yoyo: true,
          repeat: 1,
          ease: "Sine.easeInOut",
          onComplete: () => {
            this.tweens.add({
              targets: collectPulseRing,
              radius: 86,
              alpha: 0,
              duration: 260,
              ease: "Quad.easeOut",
              onComplete: () => {
                if (!collectPulseRing.destroyed) collectPulseRing.destroy();
              }
            });
          }
        });
        this.tweens.add({
          targets: collectPulseAura,
          scale: 2.45,
          alpha: 0,
          duration: 620,
          ease: "Quad.easeOut",
          onComplete: () => {
            if (!collectPulseAura.destroyed) collectPulseAura.destroy();
          }
        });
        this.tweens.add({
          targets: plusLabel,
          y: plusLabel.y - 30,
          alpha: 0,
          scale: 1.18,
          duration: 720,
          ease: "Quad.easeOut",
          onComplete: () => {
            if (!plusLabel.destroyed) plusLabel.destroy();
          }
        });
    
        await addTweenPromise({
          targets: sprite,
          scaleX: collectionBaseScale * 1.28,
          scaleY: collectionBaseScale * 1.28,
          angle: sprite.angle - 7,
          duration: 150,
          ease: "Sine.easeOut"
        });
    
        await addTweenPromise({
          targets: sprite,
          scaleX: collectionBaseScale * 1.08,
          scaleY: collectionBaseScale * 1.08,
          angle: sprite.angle + 12,
          duration: 150,
          yoyo: true,
          repeat: 1,
          ease: "Sine.easeInOut"
        });
    
        this.playSfx?.('ballon_won_celebration', {
          volume: 0.46
        });
    
        await addTweenPromise({
          targets: sprite,
          x: meterTarget.x,
          y: meterTarget.y,
          scaleX: collectionTargetScale,
          scaleY: collectionTargetScale,
          angle: sprite.angle + 34,
          duration: 860,
          ease: "Sine.easeInOut",
          onComplete: () => {
            if (!sprite.destroyed) {
              sprite.destroy();
            }
            if (entry?.applied === true) {
              const current = this.bonusMysteryMeterState || { collected: 0, max: 3 };
              const max = Math.max(1, Math.floor(Number(current.max) || 3));
              this.updateBonusMysteryMeter({
                collected: Math.min(max, Math.max(0, Math.floor(Number(current.collected) || 0)) + 1),
                max
              }, {
                isBonus: true,
                pulse: true
              });
            } else {
              this.updateBonusMysteryMeter(this.bonusMysteryMeterState, {
                isBonus: true,
                pulse: true
              });
            }
            playRandomCollectionSfx(["orb_collect", "wheel_diamond_appear", "wins_highlight"], {
              volume: 0.24,
              rate: Phaser.Math.FloatBetween(1.08, 1.24)
            });
    
            const meterImpactRing = this.add.circle(meterTarget.x, meterTarget.y, 18, 0xFFFFFF, 0)
              .setStrokeStyle(5, 0xFFF07A, 0.95)
              .setDepth(DEPTH_HERO + 16)
              .setBlendMode(Phaser.BlendModes.ADD);
            const meterImpactCore = this.add.circle(meterTarget.x, meterTarget.y, 14, 0xC56BFF, 0.62)
              .setDepth(DEPTH_HERO + 15)
              .setBlendMode(Phaser.BlendModes.ADD);
            this.tweens.add({
              targets: meterImpactRing,
              radius: 46,
              alpha: 0,
              duration: 260,
              ease: "Quad.easeOut",
              onComplete: () => {
                if (!meterImpactRing.destroyed) meterImpactRing.destroy();
              }
            });
            this.tweens.add({
              targets: meterImpactCore,
              scale: 2,
              alpha: 0,
              duration: 220,
              ease: "Quad.easeOut",
              onComplete: () => {
                if (!meterImpactCore.destroyed) meterImpactCore.destroy();
              }
            });
          }
        });
    
        await this.waitForPresentation(360, { skippable: true });
        return true;
      },

    async playBonusMysteryFeatureReleaseAfterKapow(
        releaseFeature = null,
        {
          allowFeatureBlockedLanding = false,
          bonusMysteryFeatureState = null
        } = {}
      ) {
        const collectedBalloons = Math.max(
          0,
          Math.floor(
            Number(
              releaseFeature?.collectedBalloons ??
              releaseFeature?.balloonCount ??
              0
            ) || 0
          )
        );
        const events = releaseFeature?.triggered === true && Array.isArray(releaseFeature?.events)
          ? releaseFeature.events
          : [];
        if (collectedBalloons <= 0 || events.length === 0) {
          if (bonusMysteryFeatureState && typeof this.updateBonusMysteryMeter === "function") {
            this.updateBonusMysteryMeter(bonusMysteryFeatureState, {
              isBonus: true,
              pulse: false
            });
          }
          return { triggered: false, poppedCount: 0 };
        }
    
        const cellSize = 70;
        const boardWidth = clientConfig.area.width * cellSize;
        const boardHeight = clientConfig.area.height * cellSize;
        const boardLeft = GRID_OFFSET_X;
        const boardRight = boardLeft + boardWidth;
        const boardTop = GRID_OFFSET_Y;
        const boardBottom = boardTop + boardHeight;
        const minX = boardLeft + 20;
        const maxX = boardRight - 20;
        const stagedCenterTarget = this.getBonusMysteryMeterTarget();
        const stagedCenterX = Number(this.bonusMysteryMeterIcon?.x ?? stagedCenterTarget.x) + 8;
        const stagedCenterY = boardBottom + 34;
        const stagedSpread = Phaser.Math.Clamp((events.length - 1) * 34, 90, 260);
        const parseFinite = (value, fallback = 0) => {
          const parsed = Number(value);
          return Number.isFinite(parsed) ? parsed : fallback;
        };
        const resolveTextureKey = (rawTextureKey = null) => {
          const desired = String(rawTextureKey || "");
          if (desired && this.textures?.exists(desired)) return desired;
          if (this.textures?.exists(BONUS_END_BALLOON_TEXTURE_FALLBACK)) {
            return BONUS_END_BALLOON_TEXTURE_FALLBACK;
          }
          return String(BONUS_MYSTERY_FEATURE_SYMBOL_ID);
        };
        const resolveBalloonCoinValueTbm = (event = null) => {
          const added = parseFinite(event?.addedTbm, 0);
          if (added > 0) return added;
          const after = parseFinite(event?.afterResultValueTbm, 0);
          const before = parseFinite(event?.beforeResultValueTbm, 0);
          const diff = Number((after - before).toFixed(4));
          if (diff > 0) return diff;
          const fallback = parseFinite(event?.noPositiveTargetFallbackAwardTbm, 0);
          if (fallback > 0) return fallback;
          return 1;
        };
        const applyBalloonEmptyTargetBackplateUpgrade = (event = null) => {
          if (event?.popped !== true) return;
          const reel = Math.floor(Number(event?.reel));
          const row = Math.floor(Number(event?.row));
          if (!Number.isFinite(reel) || !Number.isFinite(row)) return;
          if (reel < 0 || reel >= clientConfig.area.width) return;
          if (row < 0 || row >= clientConfig.area.height) return;
          if (typeof this.isHouse === "function" && this.isHouse(reel, row)) return;
    
          const usedFallbackAward = event?.usedNoPositiveTargetFallbackAward === true;
          const beforeValueTbm = parseFinite(event?.beforeResultValueTbm, 0);
          if (!usedFallbackAward && beforeValueTbm > 0) return;
    
          if (!(this.immediateLowPositionTbmByKey instanceof Map)) {
            this.immediateLowPositionTbmByKey = new Map();
          }
          const key = this.getImmediateLowBackplateKey(reel, row);
          const currentValueTbm = parseFinite(this.immediateLowPositionTbmByKey.get(key), 0);
          const afterValueTbm = parseFinite(event?.afterResultValueTbm, 0);
          const addedValueTbm = parseFinite(event?.addedTbm, resolveBalloonCoinValueTbm(event));
          const nextValueTbm = Number((
            afterValueTbm > 0
              ? afterValueTbm
              : (currentValueTbm + Math.max(0, addedValueTbm))
          ).toFixed(4));
          if (!(nextValueTbm > 0)) return;
    
          this.immediateLowPositionTbmByKey.set(key, nextValueTbm);
          this.ensureImmediateLowPositionBackplateDisplay?.(reel, row, nextValueTbm, {
            pulse: true
          });
          this.refreshImmediateLowBackplateAreaHeat?.();
        };
        const isHeroFootprintCell = (reel, row) => {
          const anchorReel = Math.floor(Number(this.currentHeroAnchor?.reel));
          const anchorRow = Math.floor(Number(this.currentHeroAnchor?.row));
          if (!Number.isFinite(anchorReel) || !Number.isFinite(anchorRow)) return false;
          const size = Math.max(1, Math.floor(Number(this.currentHeroFootprintSize) || 1));
          return reel >= anchorReel &&
            reel < anchorReel + size &&
            row >= anchorRow &&
            row < anchorRow + size;
        };
        const isBlockingFeatureSymbolId = (symbolId) => {
          const normalizedSymbolId = Math.floor(Number(symbolId));
          if (!Number.isFinite(normalizedSymbolId)) return true;
          return normalizedSymbolId === Math.floor(BONUS_MYSTERY_FEATURE_SYMBOL_ID) ||
            normalizedSymbolId === Math.floor(MERGE_GUN_FEATURE_SYMBOL_ID) ||
            normalizedSymbolId === Math.floor(LIGHTNING_BEE_FEATURE_SYMBOL_ID);
        };
        const isTargetBlockedByFeature = (reel, row) => {
          const normalizedReel = Math.floor(Number(reel));
          const normalizedRow = Math.floor(Number(row));
          if (
            !Number.isFinite(normalizedReel) ||
            !Number.isFinite(normalizedRow) ||
            normalizedReel < 0 ||
            normalizedReel >= clientConfig.area.width ||
            normalizedRow < 0 ||
            normalizedRow >= clientConfig.area.height
          ) {
            return true;
          }
          if (isHeroFootprintCell(normalizedReel, normalizedRow)) return true;
          const symbolDisplay = this.reelSprites?.[normalizedReel]?.[normalizedRow];
          const symbolId = this.getDisplayObjectSymbolId(symbolDisplay);
          return isBlockingFeatureSymbolId(symbolId);
        };
        const waitForFeatureTargetClear = async (reel, row) => {
          if (allowFeatureBlockedLanding === true) return;
          const maxWaitMs = 1600;
          const pollMs = 55;
          let waitedMs = 0;
          while (waitedMs < maxWaitMs && isTargetBlockedByFeature(reel, row)) {
            await this.waitForPresentation(pollMs, { skippable: true });
            waitedMs += pollMs;
          }
        };
    
        const spawnReleaseBalloon = (event, index) => new Promise((resolve) => {
          const laneRatioRaw = events.length <= 1 ? 0.5 : index / (events.length - 1);
          const laneRatio = Phaser.Math.Clamp(laneRatioRaw, 0.04, 0.96);
          const startX = Phaser.Math.Clamp(
            stagedCenterX +
            Phaser.Math.Linear(-stagedSpread / 2, stagedSpread / 2, laneRatio) +
            Phaser.Math.Between(-8, 8),
            minX,
            maxX
          );
          const startY = stagedCenterY + Phaser.Math.Between(-7, 9);
          const targetReel = Number.isFinite(Number(event?.reel))
            ? Math.floor(Number(event.reel))
            : null;
          const targetRow = Number.isFinite(Number(event?.row))
            ? Math.floor(Number(event.row))
            : null;
          let targetCenter = Number.isFinite(targetReel) && Number.isFinite(targetRow)
            ? this.getGridCellCenter(targetReel, targetRow)
            : {
                x: Phaser.Math.Between(minX, maxX),
                y: Phaser.Math.Between(boardTop + 80, boardBottom - 60)
              };
          const popped = event?.popped === true;
          const multiplier = Math.max(2, Math.floor(Number(event?.multiplier) || 2));
          const flight = event?.flight || {};
          const driftXRatio = Phaser.Math.Clamp(Number(flight?.driftXRatio || Phaser.Math.FloatBetween(-0.2, 0.2)), -0.45, 0.45);
          const randomSideBiasRatioAbs = Phaser.Math.Clamp(
            Math.abs(Number(flight?.randomSideBiasRatioAbs || 0.1)),
            0,
            0.25
          );
          const randomSideBiasRatio = randomSideBiasRatioAbs > 0
            ? Phaser.Math.FloatBetween(-randomSideBiasRatioAbs, randomSideBiasRatioAbs)
            : 0;
          const missOffsetX = popped ? 0 : Phaser.Math.Between(-Math.floor(cellSize * 2.1), Math.floor(cellSize * 2.1));
          let endX = Phaser.Math.Clamp(
            targetCenter.x + (driftXRatio + randomSideBiasRatio) * boardWidth + missOffsetX,
            minX,
            maxX
          );
          const endY = boardTop - Phaser.Math.Between(28, 92);
          const swayAmplitudeRatio = Phaser.Math.Clamp(Math.abs(Number(flight?.swayAmplitudeRatio) || 0.03), 0.02, 0.12);
          const swayCycles = Phaser.Math.Clamp(Number(flight?.swayCycles) || 1.8, 0.8, 4.5);
          const swayAmplitude = Math.max(8, swayAmplitudeRatio * boardWidth);
          const phaseOffset = Phaser.Math.FloatBetween(0, Math.PI * 2);
          const riseDurationMs = popped
            ? Phaser.Math.Clamp(Math.floor(Number(flight?.riseDurationMs || 1400) * 0.82), 740, 2200)
            : Phaser.Math.Clamp(Math.floor(Number(flight?.riseDurationMs || 1400) * 0.9), 760, 2400);
          const popAtProgress = Phaser.Math.Clamp(Number(flight?.popAtProgress || 0.72), 0.45, 0.96);
          const scaleBase = (0.18 + Math.min(0.08, (multiplier - 2) * 0.008)) * 1.4 * 1.69;
          const balloon = this.add.image(startX, startY, resolveTextureKey(event?.spriteKey))
            .setOrigin(0.5)
            .setDepth(DEPTH_HERO + 8)
            .setScale(scaleBase)
            .setAlpha(0.97);
          const label = this.add.text(startX, startY + 2, `x${multiplier}`, {
            fontSize: "34px",
            fontFamily: '"Cinzel", "Times New Roman", serif',
            fontStyle: "bold",
            color: "#FFF4CC",
            stroke: "#3E2204",
            strokeThickness: 6
          })
            .setOrigin(0.5)
            .setDepth(DEPTH_HERO + 10)
            .setScale(1.02)
            .setAlpha(0.99);
          const startDelay = Math.max(0, Math.floor(index * 120 + Phaser.Math.Between(0, 44)));
          let settled = false;
          const finish = () => {
            if (settled) return;
            settled = true;
            if (label && !label.destroyed) label.destroy();
            resolve();
          };
    
          this.time.delayedCall(startDelay, async () => {
            if (!balloon || balloon.destroyed) {
              finish();
              return;
            }
            if (Number.isFinite(targetReel) && Number.isFinite(targetRow)) {
              await waitForFeatureTargetClear(targetReel, targetRow);
              if (!balloon || balloon.destroyed) {
                finish();
                return;
              }
              targetCenter = this.getGridCellCenter(targetReel, targetRow);
              endX = Phaser.Math.Clamp(
                targetCenter.x + (driftXRatio + randomSideBiasRatio) * boardWidth + missOffsetX,
                minX,
                maxX
              );
            }
            await this.waitForPresentation(120, { skippable: true });
            if (!balloon || balloon.destroyed) {
              finish();
              return;
            }
    
            this.tweens.addCounter({
              from: 0,
              to: 1,
              duration: riseDurationMs,
              ease: "Linear",
              onUpdate: (counter) => {
                if (!balloon || balloon.destroyed) return;
                const t = Phaser.Math.Clamp(Number(counter?.getValue?.() || 0), 0, 1);
                const sway = Math.sin((t * Math.PI * 2 * swayCycles) + phaseOffset) * swayAmplitude * (1 - t * 0.7);
                if (popped) {
                  const approachT = Phaser.Math.Clamp(t / Math.max(0.01, popAtProgress), 0, 1);
                  const easedApproach = Phaser.Math.SmoothStep(approachT, 0, 1);
                  const targetSway = Math.sin((t * Math.PI * 2 * swayCycles) + phaseOffset) * swayAmplitude * 0.42 * (1 - easedApproach);
                  balloon.x = Phaser.Math.Linear(startX, targetCenter.x, easedApproach) + targetSway;
                  balloon.y = Phaser.Math.Linear(startY, targetCenter.y, easedApproach);
                } else {
                  balloon.x = Phaser.Math.Linear(startX, endX, t) + sway;
                  balloon.y = Phaser.Math.Linear(startY, endY, t);
                }
                balloon.angle = Math.sin((t * Math.PI * 2 * 1.8) + phaseOffset) * 8;
                balloon.setScale(scaleBase * (1 + (Math.sin((t * Math.PI * 2 * 1.2) + phaseOffset) * 0.06)));
                if (label && !label.destroyed) {
                  label.x = balloon.x;
                  label.y = balloon.y + 2;
                  label.setAlpha(balloon.alpha);
                }
    
                const reachedTarget = t >= popAtProgress ||
                  Phaser.Math.Distance.Between(balloon.x, balloon.y, targetCenter.x, targetCenter.y) <= 10;
                if (popped && !balloon._bonusMysteryReleasePopped && reachedTarget) {
                  balloon._bonusMysteryReleasePopped = true;
                  balloon.setPosition(targetCenter.x, targetCenter.y);
                  if (label && !label.destroyed) {
                    label.setPosition(targetCenter.x, targetCenter.y + 2);
                  }
                  const flash = this.add.circle(targetCenter.x, targetCenter.y, 12, 0xFFF3B0, 0.88)
                    .setDepth(DEPTH_HERO + 9)
                    .setBlendMode(Phaser.BlendModes.ADD);
                  this.tweens.add({
                    targets: flash,
                    radius: 44,
                    alpha: 0,
                    duration: 180,
                    ease: "Quad.easeOut",
                    onComplete: () => flash.destroy()
                  });
                  this.createBonusEndLandingSplash(targetCenter.x, targetCenter.y, {
                    isMultiplier: true,
                    intensity: "medium"
                  });
                  applyBalloonEmptyTargetBackplateUpgrade(event);
                  this.playBonusEndLandingCoinBurst(
                    targetCenter.x,
                    targetCenter.y + 6,
                    resolveBalloonCoinValueTbm(event),
                    { depth: DEPTH_HERO + 15 }
                  );
                  this.playSfx?.("wins_highlight", { volume: 0.22 });
                  if (!balloon.destroyed) balloon.destroy();
                  if (label && !label.destroyed) {
                    this.tweens.add({
                      targets: label,
                      alpha: 0,
                      scaleX: label.scaleX * 1.12,
                      scaleY: label.scaleY * 1.12,
                      duration: 140,
                      ease: "Quad.easeOut",
                      onComplete: () => {
                        if (!label.destroyed) label.destroy();
                      }
                    });
                  }
                }
              },
              onComplete: () => {
                if (balloon && !balloon.destroyed) {
                  this.tweens.add({
                    targets: [balloon, label].filter((entry) => entry && !entry.destroyed),
                    alpha: 0,
                    duration: 120,
                    ease: "Quad.easeOut",
                    onComplete: () => {
                      if (balloon && !balloon.destroyed) balloon.destroy();
                      if (label && !label.destroyed) label.destroy();
                      finish();
                    }
                  });
                  return;
                }
                finish();
              }
            });
          });
        });
    
        await Promise.all(events.map((event, index) => spawnReleaseBalloon(event, index)));
        await this.waitForPresentation(140, { skippable: true });
        if (bonusMysteryFeatureState && typeof this.updateBonusMysteryMeter === "function") {
          this.updateBonusMysteryMeter(bonusMysteryFeatureState, {
            isBonus: true,
            pulse: true
          });
        }
        return {
          triggered: true,
          poppedCount: events.filter((event) => event?.popped === true).length
        };
      },

    consumeBonusMysteryFeatureCollections(entries = []) {
        if (!Array.isArray(entries) || entries.length === 0) {
          return 0;
        }
    
        const parseSymbolId = (displayObject = null) => this.getDisplayObjectSymbolId(displayObject);
    
        const findBoardSpriteAtCell = (reel, row) => {
          const tracked = this.reelSprites?.[reel]?.[row];
          if (tracked && !tracked.destroyed) {
            return tracked;
          }
    
          const sceneChildren = this.children?.list;
          if (!Array.isArray(sceneChildren) || sceneChildren.length === 0) {
            return null;
          }
    
          const cellSize = 70;
          const centerX = reel * cellSize + cellSize / 2 + GRID_OFFSET_X;
          const centerY = (clientConfig.area.height - 1 - row) * cellSize + cellSize / 2 + GRID_OFFSET_Y;
          const tolerance = Math.max(8, Math.floor(cellSize * 0.34));
          let resolved = null;
    
          sceneChildren.forEach((child) => {
            if (!child || child.destroyed) return;
            if (this.isBonusFruitPileTokenSprite(child)) return;
            if (!Number.isFinite(child.x) || !Number.isFinite(child.y)) return;
            if (Math.abs(child.x - centerX) > tolerance) return;
            if (Math.abs(child.y - centerY) > tolerance) return;
            const symbolId = parseSymbolId(child);
            if (symbolId !== BONUS_MYSTERY_FEATURE_SYMBOL_ID) return;
            if (!resolved || Number(child.depth || 0) >= Number(resolved.depth || 0)) {
              resolved = child;
            }
          });
    
          return resolved;
        };
    
        const destroyMysterySpritesAtCell = (reel, row) => {
          const sceneChildren = this.children?.list;
          if (!Array.isArray(sceneChildren) || sceneChildren.length === 0) {
            return;
          }
    
          const cellSize = 70;
          const centerX = reel * cellSize + cellSize / 2 + GRID_OFFSET_X;
          const centerY = (clientConfig.area.height - 1 - row) * cellSize + cellSize / 2 + GRID_OFFSET_Y;
          const tolerance = Math.max(8, Math.floor(cellSize * 0.34));
    
          sceneChildren.forEach((child) => {
            if (!child || child.destroyed) return;
            if (this.isBonusFruitPileTokenSprite(child)) return;
            if (!Number.isFinite(child.x) || !Number.isFinite(child.y)) return;
            if (Math.abs(child.x - centerX) > tolerance) return;
            if (Math.abs(child.y - centerY) > tolerance) return;
            const symbolId = parseSymbolId(child);
            if (symbolId !== BONUS_MYSTERY_FEATURE_SYMBOL_ID) return;
            this.clearReelSpriteReferencesForDisplayObject(child);
            this.tweens.killTweensOf(child);
            this.destroyBananaBackplate(child);
            if (!child.destroyed) {
              child.destroy();
            }
          });
        };
    
        let consumed = 0;
        entries.forEach((entry) => {
          const reel = Math.floor(Number(entry?.reel));
          const row = Math.floor(Number(entry?.row));
          if (!Number.isFinite(reel) || !Number.isFinite(row)) return;
          if (reel < 0 || reel >= clientConfig.area.width || row < 0 || row >= clientConfig.area.height) return;
    
          const tracked = findBoardSpriteAtCell(reel, row);
          const symbolId = parseSymbolId(tracked);
          if (tracked && symbolId === BONUS_MYSTERY_FEATURE_SYMBOL_ID) {
            this.clearReelSpriteReferencesForDisplayObject(tracked);
            this.tweens.killTweensOf(tracked);
            this.destroyBananaBackplate(tracked);
            if (!tracked.destroyed) {
              tracked.destroy();
            }
          }
          destroyMysterySpritesAtCell(reel, row);
          if (this.reelSprites?.[reel]) {
            this.reelSprites[reel][row] = null;
          }
          consumed += 1;
        });
    
        this.purgeUntrackedGridCollectableSprites();
        this.syncBonusMysteryFeatureSpinState();
        return consumed;
      }
  };
}
