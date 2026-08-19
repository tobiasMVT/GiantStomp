export function createGameSceneLightningBeeMethods(deps = {}) {
  const {
    DEPTH_HERO,
    DEPTH_LIGHTNING_BEE_FEATURE,
    LIGHTNING_BEE_FEATURE_SYMBOL_ID,
    LIGHTNING_BEE_METER_ICON_OUTLINE_SCALE,
    LIGHTNING_BEE_METER_ICON_SCALE,
    LIGHTNING_BEE_MULTIPLIER_LADDER_FALLBACK,
    Phaser,
    clientConfig,
    getBoardSymbolDepth,
    getReelSymbolRenderable,
    getSymbolScale
  } = deps;

  return {
    getLightningBeeFeatureMultiplier(rawState = null) {
        const source = rawState && typeof rawState === "object"
          ? rawState
          : this.lightningBeeMeterState;
        const bees = [
          ...(Array.isArray(source?.collectedBees) ? source.collectedBees : []),
          ...(Array.isArray(source?.boardBees) ? source.boardBees : [])
        ];
        const multiplier = bees.reduce(
          (best, bee) => Math.max(best, Math.floor(Number(bee?.multiplier) || 1)),
          Math.max(1, Math.floor(Number(source?.multiplier) || 1))
        );
        return multiplier;
      },

    getLightningBeeBoardEntryAt(reel, row, state = null) {
        const source = state && typeof state === "object" ? state : this.lightningBeeMeterState;
        const boardBees = Array.isArray(source?.boardBees) ? source.boardBees : [];
        const normalizedReel = Math.floor(Number(reel));
        const normalizedRow = Math.floor(Number(row));
        if (!Number.isFinite(normalizedReel) || !Number.isFinite(normalizedRow)) return null;
        return boardBees.find((bee) =>
          Math.floor(Number(bee?.reel)) === normalizedReel &&
          Math.floor(Number(bee?.row)) === normalizedRow
        ) || null;
      },

    getLightningBeeMeterMultiplierSummary(state = null) {
        const source = state && typeof state === "object" ? state : this.lightningBeeMeterState;
        const collectedBees = Array.isArray(source?.collectedBees) ? source.collectedBees : [];
        if (collectedBees.length === 0) {
          return "x1";
        }
        const multipliers = collectedBees
          .map((bee) => Math.max(1, Math.floor(Number(bee?.multiplier) || 1)))
          .filter((value) => Number.isFinite(value));
        if (multipliers.length === 0) return "x1";
        const maxMultiplier = Math.max(...multipliers);
        const uniqueCount = new Set(multipliers).size;
        return uniqueCount > 1 ? `x${maxMultiplier}+` : `x${maxMultiplier}`;
      },

    getLightningBeeMeterTooltipEntries(state = null) {
        const source = state && typeof state === "object" ? state : this.lightningBeeMeterState;
        const collectedBees = Array.isArray(source?.collectedBees) ? source.collectedBees : [];
        return collectedBees.map((bee) => ({
          multiplier: Math.max(1, Math.floor(Number(bee?.multiplier) || 1))
        }));
      },

    ensureLightningBeeFeaturePulseForDisplay(displayObject = null, multiplier = null) {
        const target = getReelSymbolRenderable(displayObject);
        if (!target || target.destroyed || !target.scene || !target.scene.sys) return;
    
        const resolvedMultiplier = Math.max(
          1,
          Math.floor(Number(multiplier ?? this.lightningBeeMeterState?.multiplier ?? 1) || 1)
        );
        const root = this.getFeatureSymbolCrossfadeRoot(displayObject, target);
        const baseScale = getSymbolScale(LIGHTNING_BEE_FEATURE_SYMBOL_ID);
        this.setReelCellGraphicDepth(displayObject, getBoardSymbolDepth(LIGHTNING_BEE_FEATURE_SYMBOL_ID));
        this.ensureFeatureFloatingTiltForDisplay(displayObject, "_lightningBeeFloatTween", {
          amplitude: 4.4,
          duration: 2600
        });
    
        target.setScale(baseScale);
        target.setAlpha(1);
        target.setTint?.(0xFFFFFF);
    
        if (!target._lightningBeePulseTween) {
          target._lightningBeePulseTween = this.tweens.addCounter({
            from: 0,
            to: 1,
            duration: 640,
            yoyo: true,
            repeat: -1,
            ease: "Sine.easeInOut",
            onUpdate: (counterTween) => {
              if (!target || target.destroyed || !target.scene || !target.scene.sys) {
                counterTween?.stop?.();
                return;
              }
              const t = Phaser.Math.Clamp(Number(counterTween?.getValue?.() || 0), 0, 1);
              target.setScale(Phaser.Math.Linear(baseScale * 0.94, baseScale * 1.1, t));
              target.setTint?.(this.interpolateBonusEndColor(0xFFFFFF, 0xFFF06A, t));
            }
          });
        }
    
        const syncLabel = () => {
          const label = target._lightningBeeMultiplierLabel;
          if (!label || label.destroyed) return;
          const anchor = root && !root.destroyed ? root : target;
          if (!anchor || anchor.destroyed || target.destroyed) {
            this.events.off("postupdate", syncLabel);
            target._lightningBeeLabelSyncHandler = null;
            target._lightningBeeMultiplierLabel = null;
            label.destroy();
            return;
          }
          label.setPosition(Number(anchor.x || 0), Number(anchor.y || 0) + 18);
          label.setDepth(Math.max(DEPTH_LIGHTNING_BEE_FEATURE + 1, Number(anchor.depth || 0) + 0.4));
        };
    
        if (!target._lightningBeeMultiplierLabel || target._lightningBeeMultiplierLabel.destroyed) {
          target._lightningBeeMultiplierLabel = this.add.text(0, 0, `x${resolvedMultiplier}`, {
            fontSize: "18px",
            fontFamily: '"Cinzel", "Times New Roman", serif',
            fontStyle: "bold",
            color: "#FFF8D6",
            stroke: "#2A1400",
            strokeThickness: 5
          })
            .setOrigin(0.5)
            .setDepth(DEPTH_LIGHTNING_BEE_FEATURE + 1);
          target._lightningBeeMultiplierLabel._lightningBeeOwner = target;
          target._lightningBeeLabelSyncHandler = syncLabel;
          this.events.on("postupdate", syncLabel);
        }
    
        target._lightningBeeMultiplierLabel.setText(`x${resolvedMultiplier}`);
        syncLabel();
      },

    clearLightningBeeFeaturePulseForDisplay(displayObject = null, { resetScale = false, preserveLabel = false } = {}) {
        const target = getReelSymbolRenderable(displayObject);
        if (!target || target.destroyed) return;
    
        const tween = target._lightningBeePulseTween;
        if (tween) {
          tween.stop?.();
          tween.remove?.();
        }
        target._lightningBeePulseTween = null;
        this.clearFeatureFloatingTiltForDisplay(displayObject, "_lightningBeeFloatTween", { resetAngle: true });
    
        if (preserveLabel !== true) {
          const label = target._lightningBeeMultiplierLabel;
          const handler = target._lightningBeeLabelSyncHandler;
          if (handler) {
            this.events.off("postupdate", handler);
          }
          target._lightningBeeLabelSyncHandler = null;
          target._lightningBeeMultiplierLabel = null;
          if (label && !label.destroyed) {
            label.destroy();
          }
        }
    
        if (resetScale === true) {
          const symbolId = this.getDisplayObjectSymbolId(displayObject);
          target.setScale(getSymbolScale(symbolId));
        }
        target.clearTint?.();
      },

    syncLightningBeeFeatureSymbolState(multiplier = null, state = null) {
        if (!Array.isArray(this.reelSprites)) return;
        const sourceState = state && typeof state === "object" ? state : this.lightningBeeMeterState;
        const visited = new Set();
        this.reelSprites.forEach((column, reel) => {
          if (!Array.isArray(column)) return;
          column.forEach((cell, row) => {
            if (!cell || cell.destroyed) return;
            const renderable = getReelSymbolRenderable(cell);
            if (!renderable || renderable.destroyed || visited.has(renderable)) return;
            visited.add(renderable);
    
            const symbolId = this.getDisplayObjectSymbolId(cell);
            if (symbolId === LIGHTNING_BEE_FEATURE_SYMBOL_ID) {
              const boardEntry = this.getLightningBeeBoardEntryAt(reel, row, sourceState);
              if (boardEntry) {
                this.ensureLightningBeeFeaturePulseForDisplay(cell, multiplier ?? boardEntry?.multiplier ?? 1);
              } else {
                this.clearLightningBeeFeaturePulseForDisplay(cell, { resetScale: true });
              }
            } else {
              this.clearLightningBeeFeaturePulseForDisplay(cell, { resetScale: true });
            }
          });
        });
      },

    getLightningBeeMeterTarget() {
        const target = this.getBonusMysteryMeterTarget();
        return {
          x: Number(target.x) + 250,
          y: Number(target.y) + 2
        };
      },

    ensureLightningBeeMeterUi() {
        const target = this.getLightningBeeMeterTarget();
        if (this.countUpText && !this.countUpText.destroyed) {
          this.countUpText.setDepth(205);
        }
    
        if (!this.lightningBeeMeterIconOutline || this.lightningBeeMeterIconOutline.destroyed) {
          this.lightningBeeMeterIconOutline = this.add.image(target.x, target.y, String(LIGHTNING_BEE_FEATURE_SYMBOL_ID))
            .setOrigin(0.5)
            .setScale(LIGHTNING_BEE_METER_ICON_OUTLINE_SCALE)
            .setDepth(202.8)
            .setTint(0x000000)
            .setAlpha(0.72)
            .setVisible(false);
        } else {
          this.lightningBeeMeterIconOutline
            .setPosition(target.x, target.y)
            .setScale(LIGHTNING_BEE_METER_ICON_OUTLINE_SCALE)
            .setTint(0x000000)
            .setDepth(202.8);
        }
    
        if (!this.lightningBeeMeterIcon || this.lightningBeeMeterIcon.destroyed) {
          this.lightningBeeMeterIcon = this.add.image(target.x, target.y, String(LIGHTNING_BEE_FEATURE_SYMBOL_ID))
            .setOrigin(0.5)
            .setScale(LIGHTNING_BEE_METER_ICON_SCALE)
            .setDepth(203)
            .setVisible(false);
        } else {
          this.lightningBeeMeterIcon
            .setPosition(target.x, target.y)
            .setScale(LIGHTNING_BEE_METER_ICON_SCALE)
            .setDepth(203);
        }
    
        if (!this.lightningBeeMeterText || this.lightningBeeMeterText.destroyed) {
          this.lightningBeeMeterText = this.add.text(target.x, target.y + 1, "", {
            fontSize: "24px",
            fontFamily: '"Cinzel", "Times New Roman", serif',
            fontStyle: "bold",
            color: "#FFF8D6",
            stroke: "#000000",
            strokeThickness: 7
          })
            .setOrigin(0.5)
            .setDepth(204)
            .setVisible(false);
        } else {
          this.lightningBeeMeterText
            .setPosition(target.x, target.y + 1)
            .setDepth(204);
        }
    
        if (this.lightningBeeMeterMultiplierText && !this.lightningBeeMeterMultiplierText.destroyed) {
          this.lightningBeeMeterMultiplierText.destroy();
        }
        this.lightningBeeMeterMultiplierText = null;
    
        if (!this.lightningBeeMeterHitArea || this.lightningBeeMeterHitArea.destroyed) {
          this.lightningBeeMeterHitArea = this.add.zone(target.x, target.y + 8, 82, 92)
            .setOrigin(0.5)
            .setDepth(205)
            .setInteractive({ useHandCursor: true });
          this.lightningBeeMeterHitArea.on("pointerover", () => {
            this.lightningBeeMeterTooltipVisible = true;
            this.refreshLightningBeeMeterTooltip();
          });
          this.lightningBeeMeterHitArea.on("pointerout", () => {
            this.lightningBeeMeterTooltipVisible = false;
            if (this.lightningBeeMeterTooltip && !this.lightningBeeMeterTooltip.destroyed) {
              this.lightningBeeMeterTooltip.setVisible(false);
            }
          });
        } else {
          this.lightningBeeMeterHitArea
            .setPosition(target.x, target.y + 8)
            .setDepth(205);
        }
      },

    setLightningBeeMeterVisible(visible = false) {
        const isVisible = visible === true;
        [
          this.lightningBeeMeterIconOutline,
          this.lightningBeeMeterIcon,
          this.lightningBeeMeterText,
          this.lightningBeeMeterHitArea
        ].forEach((display) => {
          if (display && !display.destroyed) display.setVisible(isVisible);
        });
        if (!isVisible) {
          this.lightningBeeMeterTooltipVisible = false;
          if (this.lightningBeeMeterTooltip && !this.lightningBeeMeterTooltip.destroyed) {
            this.lightningBeeMeterTooltip.setVisible(false);
          }
        }
        this.applyLightningBeeMeterVisualState(isVisible);
      },

    applyLightningBeeMeterVisualState(visible = true) {
        const isVisible = visible === true;
        const collected = Math.max(0, Math.floor(Number(this.lightningBeeMeterState?.collected) || 0));
        const isActive = isVisible && collected > 0;
    
        this.lightningBeeMeterIconOutline?.setVisible(isVisible)?.setAlpha(isActive ? 0.76 : 0.48)?.setTint?.(0x000000);
        if (this.lightningBeeMeterIcon && !this.lightningBeeMeterIcon.destroyed) {
          this.lightningBeeMeterIcon
            .setVisible(isVisible)
            .setAlpha(isActive ? 1 : 0.62);
          if (isActive) {
            this.lightningBeeMeterIcon.clearTint?.();
          } else {
            this.lightningBeeMeterIcon.setTint?.(0x6E6740);
          }
        }
        if (this.lightningBeeMeterText && !this.lightningBeeMeterText.destroyed) {
          this.lightningBeeMeterText
            .setText(isActive ? String(collected) : "")
            .setVisible(isActive)
            .setAlpha(isActive ? 1 : 0);
        }
        this.refreshLightningBeeMeterTooltip();
      },

    updateLightningBeeMeter(state = null, { isBonus = this.isInBonusMode === true, pulse = false } = {}) {
        const max = Math.max(1, Math.floor(Number(state?.max ?? this.lightningBeeMeterState?.max ?? 3) || 3));
        const collected = Math.max(0, Math.min(max, Math.floor(Number(state?.collected ?? this.lightningBeeMeterState?.collected ?? 0) || 0)));
        const multiplierStep = Math.max(0, Math.floor(Number(state?.multiplierStep ?? this.lightningBeeMeterState?.multiplierStep ?? 0) || 0));
        const multiplier = Math.max(1, Math.floor(Number(state?.multiplier ?? this.lightningBeeMeterState?.multiplier ?? 1) || 1));
        const multiplierLadder = Array.isArray(state?.multiplierLadder)
          ? state.multiplierLadder
          : (this.lightningBeeMeterState?.multiplierLadder || LIGHTNING_BEE_MULTIPLIER_LADDER_FALLBACK);
        const boardBees = Array.isArray(state?.boardBees)
          ? state.boardBees
          : (Array.isArray(this.lightningBeeMeterState?.boardBees) ? this.lightningBeeMeterState.boardBees : []);
        const collectedBees = Array.isArray(state?.collectedBees)
          ? state.collectedBees
          : (Array.isArray(this.lightningBeeMeterState?.collectedBees) ? this.lightningBeeMeterState.collectedBees : []);
        const nextBeeId = Math.max(1, Math.floor(Number(state?.nextBeeId ?? this.lightningBeeMeterState?.nextBeeId ?? 1) || 1));
        this.lightningBeeMeterState = { collected, max, multiplierStep, multiplier, multiplierLadder, boardBees, collectedBees, nextBeeId };
        this.setLightningBeeMeterVisible(false);
        this.syncLightningBeeFeatureSymbolState(null, this.lightningBeeMeterState);
      },

    refreshLightningBeeMeterTooltip() {
        if (!this.lightningBeeMeterTooltipVisible) {
          if (this.lightningBeeMeterTooltip && !this.lightningBeeMeterTooltip.destroyed) {
            this.lightningBeeMeterTooltip.setVisible(false);
          }
          return;
        }
    
        if (this.lightningBeeMeterTooltip && !this.lightningBeeMeterTooltip.destroyed) {
          this.lightningBeeMeterTooltip.destroy();
        }
    
        const target = this.getLightningBeeMeterTarget();
        const entries = this.getLightningBeeMeterTooltipEntries(this.lightningBeeMeterState);
        const hasEntries = entries.length > 0;
        const rowHeight = 34;
        const width = hasEntries ? 118 : 150;
        const height = hasEntries ? Math.max(48, 12 + entries.length * rowHeight) : 42;
        const containerX = target.x + 58;
        const containerY = target.y - height - 18;
        const bg = this.add.rectangle(0, 0, width, height, 0x1E1408, 0.94)
          .setOrigin(0, 0)
          .setStrokeStyle(2, 0xFFE86A, 0.9);
        const children = [bg];
    
        if (hasEntries) {
          entries.forEach((entry, index) => {
            const rowCenterY = 12 + index * rowHeight + rowHeight / 2;
            const icon = this.add.image(24, rowCenterY, String(LIGHTNING_BEE_FEATURE_SYMBOL_ID))
              .setOrigin(0.5)
              .setScale(LIGHTNING_BEE_METER_ICON_SCALE * 0.52);
            const label = this.add.text(50, rowCenterY, `x${entry.multiplier}`, {
              fontSize: "21px",
              fontFamily: '"Cinzel", "Times New Roman", serif',
              fontStyle: "bold",
              color: "#FFF8D6",
              stroke: "#2A1400",
              strokeThickness: 5
            })
              .setOrigin(0, 0.5);
            children.push(icon, label);
          });
        } else {
          const label = this.add.text(12, height / 2, "No bees collected", {
            fontSize: "14px",
            fontFamily: '"Cinzel", "Times New Roman", serif',
            fontStyle: "bold",
            color: "#FFF8D6",
            stroke: "#2A1400",
            strokeThickness: 3
          })
            .setOrigin(0, 0.5);
          children.push(label);
        }
    
        this.lightningBeeMeterTooltip = this.add.container(containerX, containerY, children)
          .setDepth(DEPTH_HERO + 70)
          .setVisible(true);
      },

    playLightningBeeMeterSpendFx({ depleted = false } = {}) {
        return;
      },

    emitLightningBeeRadianceTrail(x, y, {
        depth = DEPTH_LIGHTNING_BEE_FEATURE + 2,
        count = 2,
        spread = 12,
        drift = 24,
        scale = 1
      } = {}) {
        const centerX = Number(x);
        const centerY = Number(y);
        if (!Number.isFinite(centerX) || !Number.isFinite(centerY)) return;
    
        const colors = [0xFFFFFF, 0xFFE86A, 0xFFF6B8, 0xBFFFE7];
        const particleCount = Math.max(1, Math.min(5, Math.floor(Number(count) || 2)));
        for (let index = 0; index < particleCount; index++) {
          const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
          const startDistance = Phaser.Math.FloatBetween(0, spread);
          const endDistance = Phaser.Math.FloatBetween(drift * 0.45, drift);
          const particle = this.add.circle(
            centerX + Math.cos(angle) * startDistance,
            centerY + Math.sin(angle) * startDistance,
            Phaser.Math.FloatBetween(1.4, 2.8) * Math.max(0.5, Number(scale) || 1),
            colors[Phaser.Math.Between(0, colors.length - 1)],
            Phaser.Math.FloatBetween(0.48, 0.78)
          )
            .setDepth(depth)
            .setBlendMode(Phaser.BlendModes.ADD);
    
          this.tweens.add({
            targets: particle,
            x: particle.x + Math.cos(angle + Phaser.Math.FloatBetween(-0.9, 0.9)) * endDistance,
            y: particle.y + Math.sin(angle + Phaser.Math.FloatBetween(-0.9, 0.9)) * endDistance - Phaser.Math.Between(4, 18),
            scale: 0.2,
            alpha: 0,
            duration: Phaser.Math.Between(230, 420),
            ease: "Cubic.easeOut",
            onComplete: () => {
              if (!particle.destroyed) particle.destroy();
            }
          });
        }
      },

    playLightningBeeMultiplierChargeFx(anchor = null, {
        depth = DEPTH_LIGHTNING_BEE_FEATURE + 4,
        durationMs = 620,
        finalMultiplier = null,
        scale = 1
      } = {}) {
        const safeDuration = Math.max(260, Math.floor(Number(durationMs) || 620));
        const resolveAnchorPosition = () => {
          const x = Number(anchor?.x);
          const y = Number(anchor?.y);
          if (anchor && !anchor.destroyed && Number.isFinite(x) && Number.isFinite(y)) {
            return { x, y };
          }
          return {
            x: Number.isFinite(x) ? x : 0,
            y: Number.isFinite(y) ? y : 0
          };
        };
        const multiplierText = Number.isFinite(Number(finalMultiplier))
          ? `x${Math.max(1, Math.floor(Number(finalMultiplier) || 1))}`
          : "";
        const pulseCount = 3;
        const pulseOffsets = [0, Math.floor(safeDuration * 0.28), Math.floor(safeDuration * 0.56)];
        const colors = [0xFFF8D6, 0xFFE86A, 0xBFFFE7];
    
        pulseOffsets.forEach((delay, index) => {
          this.time.delayedCall(delay, () => {
            const pos = resolveAnchorPosition();
            const color = colors[index % colors.length];
            const ring = this.add.circle(pos.x, pos.y + 4, 14 + index * 4, color, 0)
              .setDepth(depth)
              .setStrokeStyle(3 + index, color, 0.72)
              .setBlendMode(Phaser.BlendModes.ADD);
            const core = this.add.circle(pos.x, pos.y + 4, 10 + index * 2, color, 0.18)
              .setDepth(depth - 1)
              .setBlendMode(Phaser.BlendModes.ADD);
            this.emitLightningBeeRadianceTrail(pos.x, pos.y + 4, {
              depth: depth + 1,
              count: 3,
              spread: 12 + index * 3,
              drift: 22 + index * 8,
              scale: 0.9 * Math.max(0.5, Number(scale) || 1)
            });
            this.playSfx?.(`lightning_amb${(index % pulseCount) + 1}`, {
              volume: 0.08 + index * 0.025,
              rate: 1.18 + index * 0.08
            });
            this.tweens.add({
              targets: ring,
              radius: 32 + index * 9,
              alpha: 0,
              duration: 240,
              ease: "Quad.easeOut",
              onComplete: () => {
                if (!ring.destroyed) ring.destroy();
              }
            });
            this.tweens.add({
              targets: core,
              scale: 1.6 + index * 0.28,
              alpha: 0,
              duration: 220,
              ease: "Quad.easeOut",
              onComplete: () => {
                if (!core.destroyed) core.destroy();
              }
            });
          });
        });
    
        return new Promise((resolve) => {
          this.time.delayedCall(safeDuration, () => {
            const pos = resolveAnchorPosition();
            const burstRing = this.add.circle(pos.x, pos.y + 4, 20, 0xFFE86A, 0)
              .setDepth(depth + 2)
              .setStrokeStyle(7, 0xFFE86A, 0.96)
              .setBlendMode(Phaser.BlendModes.ADD);
            const burstCore = this.add.circle(pos.x, pos.y + 4, 17, 0xFFFFFF, 0.56)
              .setDepth(depth + 1)
              .setBlendMode(Phaser.BlendModes.ADD);
            const burstLabel = multiplierText
              ? this.add.text(pos.x, pos.y - 26, multiplierText, {
                fontSize: "24px",
                fontFamily: '"Cinzel", "Times New Roman", serif',
                fontStyle: "bold",
                color: "#FFF8D6",
                stroke: "#2A1400",
                strokeThickness: 6
              })
                .setOrigin(0.5)
                .setDepth(depth + 3)
                .setScale(0.65)
                .setAlpha(0.94)
              : null;
    
            this.emitLightningBeeRadianceTrail(pos.x, pos.y + 4, {
              depth: depth + 3,
              count: 5,
              spread: 18,
              drift: 44,
              scale: 1.15 * Math.max(0.5, Number(scale) || 1)
            });
            this.playSfx?.("lightning_at_lvl_up", { volume: 0.24, rate: 1.08 });
            this.tweens.add({
              targets: burstRing,
              radius: 66,
              alpha: 0,
              duration: 320,
              ease: "Quad.easeOut",
              onComplete: () => {
                if (!burstRing.destroyed) burstRing.destroy();
              }
            });
            this.tweens.add({
              targets: burstCore,
              scale: 2.25,
              alpha: 0,
              duration: 260,
              ease: "Quad.easeOut",
              onComplete: () => {
                if (!burstCore.destroyed) burstCore.destroy();
              }
            });
            if (burstLabel) {
              this.tweens.add({
                targets: burstLabel,
                y: burstLabel.y - 18,
                scaleX: 1.08,
                scaleY: 1.08,
                alpha: 0,
                duration: 520,
                ease: "Cubic.easeOut",
                onComplete: () => {
                  if (!burstLabel.destroyed) burstLabel.destroy();
                }
              });
            }
          });
          this.time.delayedCall(safeDuration + 80, resolve);
        });
      },

    playLightningBeeChargeHitFeedback(anchor = null, { multiplier = null, depth = DEPTH_LIGHTNING_BEE_FEATURE + 6 } = {}) {
        if (!anchor || anchor.destroyed) return;
        const target = getReelSymbolRenderable(anchor) || anchor;
        const x = Number(anchor.x ?? target.x ?? 0);
        const y = Number(anchor.y ?? target.y ?? 0);
        const multiplierValue = Math.max(1, Math.floor(Number(multiplier) || 1));
        this.tweens.killTweensOf(target);
        target._lightningBeePulseTween = null;
        target.setTint?.(0xFFF06A);
        this.tweens.add({
          targets: target,
          scaleX: Number(target.scaleX || 1) * 1.18,
          scaleY: Number(target.scaleY || 1) * 1.18,
          angle: Phaser.Math.Between(-9, 9),
          duration: 70,
          yoyo: true,
          repeat: 1,
          ease: "Quad.easeOut",
          onComplete: () => {
            if (!target.destroyed) {
              target.clearTint?.();
              target.setAngle?.(0);
            }
          }
        });
        const ring = this.add.circle(x, y + 4, 16, 0xFFE86A, 0)
          .setDepth(depth)
          .setStrokeStyle(5, 0xFFE86A, 0.9)
          .setBlendMode(Phaser.BlendModes.ADD);
        const core = this.add.circle(x, y + 4, 11, 0xFFFFFF, 0.4)
          .setDepth(depth - 1)
          .setBlendMode(Phaser.BlendModes.ADD);
        for (let i = 0; i < 9; i++) {
          const bolt = this.add.graphics()
            .setDepth(depth + 2)
            .setBlendMode(Phaser.BlendModes.ADD);
          const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
          const length = Phaser.Math.Between(24, 48 + Math.min(28, multiplierValue * 4));
          const startRadius = Phaser.Math.Between(8, 16);
          const startX = x + Math.cos(angle) * startRadius;
          const startY = y + 4 + Math.sin(angle) * startRadius;
          bolt.lineStyle(Phaser.Math.Between(2, 4), i % 3 === 0 ? 0xFFFFFF : 0xFFE86A, 0.95);
          bolt.beginPath();
          bolt.moveTo(startX, startY);
          const segments = 3;
          for (let segment = 1; segment <= segments; segment++) {
            const progress = segment / segments;
            const jitter = Phaser.Math.FloatBetween(-0.42, 0.42);
            bolt.lineTo(
              x + Math.cos(angle + jitter) * Phaser.Math.Linear(startRadius, length, progress),
              y + 4 + Math.sin(angle + jitter) * Phaser.Math.Linear(startRadius, length, progress)
            );
          }
          bolt.strokePath();
          this.tweens.add({
            targets: bolt,
            alpha: 0,
            duration: Phaser.Math.Between(120, 210),
            ease: "Quad.easeOut",
            onComplete: () => {
              if (!bolt.destroyed) bolt.destroy();
            }
          });
        }
        this.emitLightningBeeRadianceTrail(x, y + 4, {
          depth: depth + 1,
          count: 6 + Math.min(6, multiplierValue),
          spread: 18,
          drift: 44,
          scale: 1
        });
        this.tweens.add({
          targets: ring,
          radius: 46,
          alpha: 0,
          duration: 260,
          ease: "Quad.easeOut",
          onComplete: () => {
            if (!ring.destroyed) ring.destroy();
          }
        });
        this.tweens.add({
          targets: core,
          scale: 1.8,
          alpha: 0,
          duration: 210,
          ease: "Quad.easeOut",
          onComplete: () => {
            if (!core.destroyed) core.destroy();
          }
        });
      },

    removeLightningBeeFeatureSymbolAt(reel, row) {
        const parsedReel = Math.floor(Number(reel));
        const parsedRow = Math.floor(Number(row));
        const cell = this.findFeatureSpriteAtCell(parsedReel, parsedRow, LIGHTNING_BEE_FEATURE_SYMBOL_ID);
        if (!cell || cell.destroyed) return false;
        const renderable = getReelSymbolRenderable(cell);
        this.clearLightningBeeFeaturePulseForDisplay(cell, { resetScale: true });
        this.clearReelSpriteReferencesForDisplayObject(cell);
        this.tweens.killTweensOf(cell);
        if (renderable && renderable !== cell) {
          this.tweens.killTweensOf(renderable);
        }
        if (this.reelSprites?.[parsedReel]) {
          this.reelSprites[parsedReel][parsedRow] = null;
        }
        cell.destroy();
        return true;
      },

    async playLightningBeeFeatureCollection(entry = null) {
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
          return false;
        }
    
        this.ensureLightningBeeMeterUi();
        const cellCenter = this.getGridCellCenter(reel, row);
        const meterTarget = this.getLightningBeeMeterTarget();
        let sprite = this.findFeatureSpriteAtCell(reel, row, LIGHTNING_BEE_FEATURE_SYMBOL_ID);
        if (!sprite || sprite.destroyed) {
          sprite = this.add.image(cellCenter.x, cellCenter.y, String(LIGHTNING_BEE_FEATURE_SYMBOL_ID))
            .setOrigin(0.5)
            .setScale(getSymbolScale(LIGHTNING_BEE_FEATURE_SYMBOL_ID))
            .setDepth(DEPTH_HERO + 14);
          sprite.symbolKey = LIGHTNING_BEE_FEATURE_SYMBOL_ID;
        }
    
        const multiplier = Math.max(1, Math.floor(Number(entry?.multiplier ?? this.lightningBeeMeterState?.multiplier ?? 1) || 1));
        this.ensureLightningBeeFeaturePulseForDisplay(sprite, multiplier);
        this.clearLightningBeeFeaturePulseForDisplay(sprite, { preserveLabel: true });
        this.clearReelSpriteReferencesForDisplayObject(sprite);
        if (this.reelSprites?.[reel]) {
          this.reelSprites[reel][row] = null;
        }
        this.tweens.killTweensOf(sprite);
        sprite
          .setVisible(true)
          .setAlpha(1)
          .setDepth(DEPTH_HERO + 14)
          .setScale(getSymbolScale(LIGHTNING_BEE_FEATURE_SYMBOL_ID) * 1.18);
        sprite.clearTint?.();
    
        const renderable = getReelSymbolRenderable(sprite);
        let label = renderable?._lightningBeeMultiplierLabel || null;
        const labelFollowsSprite = !!(label && !label.destroyed && renderable?._lightningBeeLabelSyncHandler);
        if (!label || label.destroyed) {
          label = this.add.text(cellCenter.x, cellCenter.y + 18, `x${multiplier}`, {
            fontSize: "20px",
            fontFamily: '"Cinzel", "Times New Roman", serif',
            fontStyle: "bold",
            color: "#FFF8D6",
            stroke: "#2A1400",
            strokeThickness: 5
          })
            .setOrigin(0.5)
            .setDepth(DEPTH_HERO + 15);
        } else {
          label
            .setText(`x${multiplier}`)
            .setVisible(true)
            .setAlpha(1)
            .setDepth(DEPTH_HERO + 15);
        }
        this.tweens.killTweensOf(label);
    
        const flash = this.add.circle(cellCenter.x, cellCenter.y, 24, 0xFFE86A, 0.42)
          .setDepth(DEPTH_HERO + 13)
          .setBlendMode(Phaser.BlendModes.ADD);
        this.playFeatureCollectionStinger();
        this.playSfx?.("lightning_hammer", { volume: 0.18, rate: 1.2 });
        this.tweens.add({
          targets: flash,
          scale: 2,
          alpha: 0,
          duration: 260,
          ease: "Quad.easeOut",
          onComplete: () => flash.destroy()
        });
    
        await new Promise((resolve) => {
          this.tweens.add({
            targets: labelFollowsSprite ? [sprite] : [sprite, label],
            x: meterTarget.x,
            y: meterTarget.y,
            scaleX: 0.48,
            scaleY: 0.48,
            duration: 620,
            ease: "Sine.easeInOut",
            onComplete: resolve
          });
        });
    
        this.clearLightningBeeFeaturePulseForDisplay(sprite);
        if (!sprite.destroyed) sprite.destroy();
        if (!label.destroyed) label.destroy();
        if (entry?.applied === true) {
          const current = this.lightningBeeMeterState || { collected: 0, max: 3, multiplier };
          const max = Math.max(1, Math.floor(Number(current.max) || 3));
          const beeId = Math.max(1, Math.floor(Number(entry?.beeId ?? entry?.id ?? Date.now()) || 1));
          const collectedBees = Array.isArray(current.collectedBees) ? [...current.collectedBees] : [];
          if (!collectedBees.some((bee) => Math.floor(Number(bee?.beeId ?? bee?.id)) === beeId)) {
            collectedBees.push({
              id: beeId,
              beeId,
              multiplierStep: Math.max(0, Math.floor(Number(entry?.multiplierStep) || 0)),
              multiplier
            });
          }
          this.updateLightningBeeMeter({
            ...current,
            collected: Math.min(max, Math.max(0, Math.floor(Number(current.collected) || 0)) + 1),
            multiplier,
            collectedBees
          }, {
            isBonus: true,
            pulse: true
          });
        } else {
          this.updateLightningBeeMeter(this.lightningBeeMeterState, { isBonus: true, pulse: true });
        }
        this.playLightningBeeMeterSpendFx();
        await this.waitForPresentation(140, { skippable: true });
        return true;
      },

    async playLightningBeeMovements(movements = [], featureState = null) {
        const entries = Array.isArray(movements) ? movements : [];
        if (entries.length === 0) {
          this.updateLightningBeeMeter(featureState || this.lightningBeeMeterState, {
            isBonus: this.isInBonusMode === true,
            pulse: false
          });
          return false;
        }
    
        const nextMeterState = featureState && typeof featureState === "object"
          ? featureState
          : this.lightningBeeMeterState;
    
        const promises = entries.map((entry) => new Promise((resolve) => {
          const fromReel = Math.floor(Number(entry?.fromReel));
          const fromRow = Math.floor(Number(entry?.fromRow));
          const toReel = Math.floor(Number(entry?.toReel));
          const toRow = Math.floor(Number(entry?.toRow));
          if (!Number.isFinite(fromReel) || !Number.isFinite(fromRow) || !Number.isFinite(toReel) || !Number.isFinite(toRow)) {
            resolve(false);
            return;
          }
    
          const from = this.getGridCellCenter(fromReel, fromRow);
          const to = this.getGridCellCenter(toReel, toRow);
          let sprite = this.findFeatureSpriteAtCell(fromReel, fromRow, LIGHTNING_BEE_FEATURE_SYMBOL_ID);
          if (!sprite || sprite.destroyed) {
            sprite = this.add.image(from.x, from.y, String(LIGHTNING_BEE_FEATURE_SYMBOL_ID))
              .setOrigin(0.5)
              .setScale(getSymbolScale(LIGHTNING_BEE_FEATURE_SYMBOL_ID))
              .setDepth(DEPTH_LIGHTNING_BEE_FEATURE);
            sprite.symbolKey = LIGHTNING_BEE_FEATURE_SYMBOL_ID;
          }
    
          const previousMultiplier = Math.max(1, Math.floor(Number(entry?.fromMultiplier ?? entry?.previousMultiplier ?? entry?.multiplier ?? 1) || 1));
          const multiplier = Math.max(1, Math.floor(Number(entry?.multiplier ?? previousMultiplier) || previousMultiplier));
          const shouldPlayChargeUp = entry?.upgraded !== false && multiplier > previousMultiplier;
          this.ensureLightningBeeFeaturePulseForDisplay(sprite, shouldPlayChargeUp ? previousMultiplier : multiplier);
          this.tweens.killTweensOf(sprite);
          const renderable = getReelSymbolRenderable(sprite);
          if (renderable) {
            renderable._lightningBeePulseTween = null;
          }
          if (renderable && renderable !== sprite) {
            this.tweens.killTweensOf(renderable);
          }
          sprite.setDepth(DEPTH_LIGHTNING_BEE_FEATURE + 4).setVisible(true).setAlpha(1);
    
          if (this.reelSprites?.[fromReel]?.[fromRow] === sprite) {
            this.reelSprites[fromReel][fromRow] = null;
          }
          if (!this.reelSprites) this.reelSprites = [];
          if (!this.reelSprites[toReel]) this.reelSprites[toReel] = [];
          this.reelSprites[toReel][toRow] = sprite;
    
          const hopState = { t: 0 };
          this.playMonkeySymbolClearLightningBurst(from.x, from.y, {
            depth: DEPTH_HERO + 6,
            radius: 24,
            boltCount: 3,
            color: 0xFFE86A,
            intensityScale: 0.7
          });
          this.playSfx?.("lightning_hammer", { volume: 0.14, rate: 1.35 });
          const runHop = () => {
            if (shouldPlayChargeUp) {
              this.playLightningBeeChargeHitFeedback(sprite, {
                multiplier,
                depth: DEPTH_LIGHTNING_BEE_FEATURE + 7
              });
            }
            this.ensureLightningBeeFeaturePulseForDisplay(sprite, multiplier);
            this.tweens.add({
              targets: hopState,
              t: 1,
              duration: entry?.moved === false ? 220 : 360,
              ease: "Cubic.easeOut",
              onUpdate: () => {
                if (!sprite || sprite.destroyed) return;
                const t = hopState.t;
                sprite.x = Phaser.Math.Linear(from.x, to.x, t);
                sprite.y = Phaser.Math.Linear(from.y, to.y, t) - Math.sin(Math.PI * t) * 34;
                sprite.angle = Phaser.Math.Linear(-12, 12, t);
                const now = Number(this.time?.now) || Date.now();
                if (!sprite._lightningBeeTrailNextAt || now >= sprite._lightningBeeTrailNextAt) {
                  sprite._lightningBeeTrailNextAt = now + 48;
                  this.emitLightningBeeRadianceTrail(sprite.x, sprite.y + 4, {
                    depth: DEPTH_LIGHTNING_BEE_FEATURE + 3,
                    count: entry?.moved === false ? 1 : 2,
                    spread: 9,
                    drift: 22,
                    scale: 0.9
                  });
                }
                this.ensureLightningBeeFeaturePulseForDisplay(sprite, multiplier);
              },
              onComplete: () => {
                if (sprite && !sprite.destroyed) {
                  sprite.setPosition(to.x, to.y);
                  sprite.setAngle(0);
                  this.ensureLightningBeeFeaturePulseForDisplay(sprite, multiplier);
                  this.setReelCellGraphicDepth(sprite, getBoardSymbolDepth(LIGHTNING_BEE_FEATURE_SYMBOL_ID));
                }
                if (entry?.collectedByHero === true) {
                  const collectionEntry = entry?.collection && typeof entry.collection === "object"
                    ? entry.collection
                    : {
                        beeId: entry?.beeId,
                        reel: toReel,
                        row: toRow,
                        symbol: LIGHTNING_BEE_FEATURE_SYMBOL_ID,
                        applied: true,
                        multiplierStep: entry?.multiplierStep,
                        multiplier,
                        handledByLightningBeeMovement: true
                      };
                  const collectionPayload = {
                    ...collectionEntry,
                    reel: Number.isFinite(Math.floor(Number(collectionEntry?.reel))) ? Math.floor(Number(collectionEntry.reel)) : toReel,
                    row: Number.isFinite(Math.floor(Number(collectionEntry?.row))) ? Math.floor(Number(collectionEntry.row)) : toRow,
                    multiplier
                  };
                  this.playLightningBeeFeatureCollection(collectionPayload)
                    .then(() => resolve(true))
                    .catch(() => resolve(true));
                  return;
                }
                resolve(true);
              }
            });
          };
    
          if (shouldPlayChargeUp) {
            this.playLightningBeeMultiplierChargeFx(sprite, {
              depth: DEPTH_LIGHTNING_BEE_FEATURE + 5,
              durationMs: 560,
              finalMultiplier: multiplier,
              scale: 0.9
            }).finally(runHop);
          } else {
            runHop();
          }
        }));
    
        await Promise.all(promises);
        this.updateLightningBeeMeter(nextMeterState, {
          isBonus: true,
          pulse: false
        });
        this.syncLightningBeeFeatureSymbolState(null, nextMeterState);
        return true;
      },

    consumeLightningBeeFeatureCollections(entries = []) {
        if (!Array.isArray(entries) || entries.length === 0) {
          return 0;
        }
    
        let consumed = 0;
        entries.forEach((entry) => {
          if (entry?.handledByLightningBeeMovement === true) return;
          const reel = Math.floor(Number(entry?.reel));
          const row = Math.floor(Number(entry?.row));
          if (!Number.isFinite(reel) || !Number.isFinite(row)) return;
          if (reel < 0 || reel >= clientConfig.area.width || row < 0 || row >= clientConfig.area.height) return;
          if (this.removeLightningBeeFeatureSymbolAt(reel, row)) {
            consumed++;
          }
        });
    
        this.syncLightningBeeFeatureSymbolState();
        return consumed;
      }
  };
}
