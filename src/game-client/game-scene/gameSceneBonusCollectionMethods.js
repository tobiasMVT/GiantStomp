export function createGameSceneBonusCollectionMethods(deps = {}) {
  const {
    BONUS_END_BALLOON_TEXTURE_FALLBACK,
    BONUS_END_COIN_ATLAS_KEY,
    BONUS_END_COIN_FRAME_COUNT,
    BONUS_END_COIN_SPIN_ANIM_KEY,
    BONUS_GRID_OVERLAY_LOCAL_Y,
    BONUS_IMMEDIATE_LOW_SYMBOL_IDS,
    BONUS_MULTIPLIER_FRUIT_CHARGE_OFFSET_Y,
    BONUS_MYSTERY_FEATURE_SYMBOL_ID,
    BONUS_PILE_KEEP_TOKENS,
    COLLECT_FALL_IMPACT_DURATION_MS,
    COLLECT_FALL_SPEED_MULTIPLIER,
    DEPTH_HERO,
    DEPTH_HOUSE,
    DEPTH_SYMBOLS,
    GRID_OFFSET_X,
    GRID_OFFSET_Y,
    LIGHTNING_BEE_FEATURE_SYMBOL_ID,
    MERGE_GUN_FEATURE_SYMBOL_ID,
    Phaser,
    WIN_HIGHLIGHT_ORB_INTENSITY_TEXTURE_KEYS,
    clientConfig,
    getBoardSymbolDepth,
    getReelSymbolRenderable,
    getSymbolScale,
    normalScale,
    normalizeSymbolKey
  } = deps;

  return {
    createOrUpdateHouse(multiplier = 1) {
        // IMPORTANT: Sync internal multiplier counter with the passed value
        // This ensures dropSymbols/applyGravityAnimation use the correct multiplier
        this.currentMultiplier = multiplier;
        
        const cellSize = 70;
        // House is at reels 3-4, rows 3-4 (2x2 area)
        // Center position: between reels 3 and 4, between rows 3 and 4 (with offset)
        const centerX = clientConfig.area.width / 2 * cellSize + GRID_OFFSET_X;
        const centerY = (clientConfig.area.height - clientConfig.area.height / 2) * cellSize + GRID_OFFSET_Y;
    
        // Keep board shadow aligned with the fixed 2x2 house opening.
        this.createOrUpdateBoardShadowOverlay();
        
        // Create or update house sprite (only create once)
        if (!this.houseSprite || this.houseSprite.destroyed) {
          this.houseSprite = this.add.image(centerX, centerY, 'house')
            .setOrigin(0.5)
            .setDisplaySize(cellSize * 2.5, cellSize * 2.5)
            .setDepth(DEPTH_HOUSE) // Always on top of symbols
            .setAlpha(0);
        }
        
        // Make house visible (in case it was hidden during bonus transition)
        if (this.houseSprite && !this.houseSprite.destroyed) {
          this.houseSprite.setVisible(true);
        }
        
        // Update or create multiplier text
        if (multiplier > 1) {
          if (!this.multiplierText || this.multiplierText.destroyed) {
            const textY = centerY - cellSize * 0.3;
            
            // === OUTER GLOW RING (pulsing energy) ===
            this.multiplierGlowOuter = this.add.circle(centerX, textY, 38, 0x22FF88)
              .setDepth(99)
              .setAlpha(0.15)
              .setBlendMode(Phaser.BlendModes.ADD);
            
            this.multiplierGlowInner = this.add.circle(centerX, textY, 28, 0x66FFAA)
              .setDepth(99)
              .setAlpha(0.2)
              .setBlendMode(Phaser.BlendModes.ADD);
            
            // Pulsing glow animation
            this.tweens.add({
              targets: this.multiplierGlowOuter,
              scale: 1.25,
              alpha: 0.08,
              duration: 1200,
              yoyo: true,
              repeat: -1,
              ease: 'Sine.easeInOut'
            });
            
            this.tweens.add({
              targets: this.multiplierGlowInner,
              scale: 1.15,
              alpha: 0.12,
              duration: 900,
              yoyo: true,
              repeat: -1,
              ease: 'Sine.easeInOut'
            });
            
            // === MAIN TEXT (metallic steel green) ===
            this.multiplierText = this.add.text(
              centerX,
              textY,
              `x${multiplier}`,
              {
                fontSize: '68px',
                fontFamily: '"Cinzel", "Trajan Pro", "Times New Roman", serif',
                fontStyle: 'bold',
                color: '#A8F0C0', // Steel green
                stroke: '#1A5C3A', // Dark green stroke
                strokeThickness: 7,
                shadow: {
                  offsetX: 0,
                  offsetY: 0,
                  color: '#44DD99',
                  blur: 15,
                  fill: true
                }
              }
            )
              .setOrigin(0.5)
              .setDepth(101);
            
            // === HIGHLIGHT LAYER (bright shine) ===
            this.multiplierHighlight = this.add.text(
              centerX,
              textY - 2,
              `x${multiplier}`,
              {
                fontSize: '68px',
                fontFamily: '"Cinzel", "Trajan Pro", "Times New Roman", serif',
                fontStyle: 'bold',
                color: '#FFFFFF',
              }
            )
              .setOrigin(0.5)
              .setDepth(102)
              .setAlpha(0.2);
            
            // === ENERGY PARTICLES around text ===
            this.multiplierParticles = [];
            const particleCount = 8;
            for (let i = 0; i < particleCount; i++) {
              const angle = (i / particleCount) * Math.PI * 2;
              const radius = 50;
              const px = centerX + Math.cos(angle) * radius;
              const py = textY + Math.sin(angle) * radius;
              
              const particle = this.add.circle(px, py, 2, 0x88DDFF)
                .setDepth(100)
                .setAlpha(0.6)
                .setBlendMode(Phaser.BlendModes.ADD);
              
              this.multiplierParticles.push(particle);
              
              // Orbit animation
            this.tweens.add({
                targets: particle,
                angle: 360,
                duration: 4000 + i * 200,
                repeat: -1,
                ease: 'Linear',
                onUpdate: () => {
                  const currentAngle = ((i / particleCount) * Math.PI * 2) + (particle.angle * Math.PI / 180);
                  const r = 45 + Math.sin(this.time.now / 500 + i) * 8;
                  particle.x = centerX + Math.cos(currentAngle) * r;
                  particle.y = textY + Math.sin(currentAngle) * r;
                }
              });
              
              // Twinkle
              this.tweens.add({
                targets: particle,
                alpha: 0.2,
                scale: 0.5,
                duration: 600 + i * 100,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut'
              });
            }
            
            // === TEXT BREATHING ===
            this.tweens.add({
              targets: [this.multiplierText, this.multiplierHighlight],
              scale: 1.08,
              duration: 1200,
              yoyo: true,
              repeat: -1,
              ease: 'Sine.easeInOut'
            });
          } else {
            // Update existing text (preserves animation)
            this.multiplierText.setVisible(true);
            this.multiplierText.setText(`x${multiplier}`);
            if (this.multiplierHighlight && !this.multiplierHighlight.destroyed) {
              this.multiplierHighlight.setVisible(true);
              this.multiplierHighlight.setText(`x${multiplier}`);
            }
            if (this.multiplierGlowOuter && !this.multiplierGlowOuter.destroyed) {
              this.multiplierGlowOuter.setVisible(true);
            }
            if (this.multiplierGlowInner && !this.multiplierGlowInner.destroyed) {
              this.multiplierGlowInner.setVisible(true);
            }
          }
        } else {
          // Remove all multiplier effects
          this.cleanupMultiplierEffects();
        }
      },

    cleanupMultiplierEffects() {
        this.destroyCollectPhaseLootCounter();
          if (this.multiplierText && !this.multiplierText.destroyed) {
            this.multiplierText.destroy();
            this.multiplierText = null;
          }
        if (this.multiplierHighlight && !this.multiplierHighlight.destroyed) {
          this.multiplierHighlight.destroy();
          this.multiplierHighlight = null;
        }
        if (this.multiplierGlowOuter && !this.multiplierGlowOuter.destroyed) {
          this.multiplierGlowOuter.destroy();
          this.multiplierGlowOuter = null;
        }
        if (this.multiplierGlowInner && !this.multiplierGlowInner.destroyed) {
          this.multiplierGlowInner.destroy();
          this.multiplierGlowInner = null;
        }
        if (this.multiplierParticles) {
          this.multiplierParticles.forEach(p => {
            if (p && !p.destroyed) p.destroy();
          });
          this.multiplierParticles = null;
        }
        if (this.multiplierGlintTimer) {
          this.multiplierGlintTimer.destroy();
          this.multiplierGlintTimer = null;
        }
      },

    getCollectPhaseLootCounterTarget() {
        const center = this.getCenterCollectTarget();
        return {
          x: center.x,
          y: center.y - 58
        };
      },

    ensureCollectPhaseLootCounter(startValueTwa = 0) {
        const target = this.getCollectPhaseLootCounterTarget();
        const initialValue = Math.max(0, Number(startValueTwa) || 0);
        let counter = this.collectPhaseLootCounter;

        if (counter?.valueText?.destroyed || counter?.labelText?.destroyed) {
          this.destroyCollectPhaseLootCounter();
          counter = null;
        }

        if (!counter) {
          const labelText = this.add.text(target.x, target.y - 30, "TOTALWIN", {
            fontSize: "24px",
            fontFamily: '"Cinzel", "Trajan Pro", "Times New Roman", serif',
            fontStyle: "bold",
            color: "#FFE8A3",
            stroke: "#260D00",
            strokeThickness: 5
          })
            .setOrigin(0.5)
            .setDepth(104)
            .setAlpha(0.95);

          const glow = this.add.circle(target.x, target.y + 6, 44, 0xFFD36B, 0.12)
            .setDepth(103)
            .setBlendMode(Phaser.BlendModes.ADD);

          const valueText = this.add.text(target.x, target.y + 6, this.formatBonusEndBoardValue(initialValue), {
            fontSize: "34px",
            fontFamily: '"Cinzel", "Trajan Pro", "Times New Roman", serif',
            fontStyle: "bold",
            color: "#FFF4C4",
            stroke: "#7A3C00",
            strokeThickness: 6,
            shadow: {
              offsetX: 0,
              offsetY: 0,
              color: "#FFB347",
              blur: 10,
              fill: true
            }
          })
            .setOrigin(0.5)
            .setDepth(105);

          counter = {
            glow,
            labelText,
            valueText,
            displayedValue: initialValue,
            targetValue: initialValue,
            tween: null
          };
          this.collectPhaseLootCounter = counter;

          this.tweens.add({
            targets: glow,
            scale: 1.16,
            alpha: 0.2,
            duration: 820,
            yoyo: true,
            repeat: -1,
            ease: "Sine.easeInOut"
          });
        } else {
          counter.labelText.setPosition(target.x, target.y - 18).setVisible(true);
          counter.glow.setPosition(target.x, target.y + 6).setVisible(true);
          counter.valueText.setPosition(target.x, target.y + 6).setVisible(true);
          counter.displayedValue = initialValue;
          counter.targetValue = initialValue;
          counter.valueText.setText(this.formatBonusEndBoardValue(initialValue));
        }

        return counter;
      },

    updateCollectPhaseLootCounter(valueTwa = 0, { animate = false } = {}) {
        const counter = this.ensureCollectPhaseLootCounter(valueTwa);
        if (!counter) return;

        const nextValue = Math.max(0, Number(valueTwa) || 0);
        const applyValue = (rawValue) => {
          const resolvedValue = Math.max(0, Number(rawValue) || 0);
          counter.displayedValue = resolvedValue;
          if (counter.valueText && !counter.valueText.destroyed) {
            counter.valueText.setText(this.formatBonusEndBoardValue(resolvedValue));
          }
        };

        if (counter.tween) {
          counter.tween.stop();
          counter.tween = null;
        }
        this.tweens.killTweensOf(counter.valueText);
        this.tweens.killTweensOf(counter.labelText);
        this.tweens.killTweensOf(counter.glow);

        counter.targetValue = nextValue;

        if (!animate || Math.abs(nextValue - counter.displayedValue) < 0.0001) {
          applyValue(nextValue);
          return;
        }

        const tweenState = { value: counter.displayedValue };
        counter.tween = this.tweens.add({
          targets: tweenState,
          value: nextValue,
          duration: 170,
          ease: "Cubic.easeOut",
          onUpdate: () => applyValue(tweenState.value),
          onComplete: () => {
            applyValue(nextValue);
            counter.tween = null;
          }
        });

        this.tweens.add({
          targets: counter.valueText,
          scaleX: 1.12,
          scaleY: 1.12,
          duration: 90,
          yoyo: true,
          ease: "Sine.easeOut"
        });
        this.tweens.add({
          targets: counter.labelText,
          alpha: 1,
          duration: 90,
          yoyo: true,
          ease: "Sine.easeOut"
        });
        this.tweens.add({
          targets: counter.glow,
          alpha: 0.28,
          scale: 1.3,
          duration: 120,
          yoyo: true,
          ease: "Sine.easeOut"
        });
      },

    destroyCollectPhaseLootCounter() {
        const counter = this.collectPhaseLootCounter;
        if (!counter) return;

        if (counter.tween) {
          counter.tween.stop();
        }
        ["glow", "labelText", "valueText"].forEach((key) => {
          const node = counter[key];
          if (node && !node.destroyed) {
            this.tweens.killTweensOf(node);
            node.destroy();
          }
        });
        this.collectPhaseLootCounter = null;
      },

    getCollectableBonusSymbolId(rawSymbol) {
        const parsed = Number(rawSymbol);
        if (!Number.isFinite(parsed)) return null;
        const payoutSymbols = Array.isArray(clientConfig.payoutSymbols) ? clientConfig.payoutSymbols : [];
        return payoutSymbols.includes(parsed) ? parsed : null;
      },

    getBonusMultiplierFruitStateSource(input = null) {
        if (!input || typeof input !== "object") return null;
        return input.bonusMultiplierFruits || input.bonusState?.bonusMultiplierFruits || input;
      },

    normalizeBonusMultiplierFruitState(rawInput = null) {
        const rawState = this.getBonusMultiplierFruitStateSource(rawInput);
        if (!rawState || typeof rawState !== "object") return null;
    
        const rawSelected = Array.isArray(rawState.selectedSymbols)
          ? rawState.selectedSymbols
          : (Array.isArray(rawState.symbols) ? rawState.symbols : []);
        const rawAssigned = Array.isArray(rawState.assigned) ? rawState.assigned : [];
        const candidates = rawSelected.length > 0
          ? rawSelected
          : rawAssigned.map((entry) => entry?.symbol ?? entry?.symbolId);
        const selectedSymbols = [];
        const seen = new Set();
    
        candidates.forEach((symbol) => {
          const symbolId = this.getCollectableBonusSymbolId(symbol);
          if (symbolId === null || seen.has(symbolId)) return;
          seen.add(symbolId);
          selectedSymbols.push(symbolId);
        });
    
        const cappedSymbols = selectedSymbols.slice(0, 3);
        if (cappedSymbols.length === 0) return null;
    
        const rawMultiplierBySymbol = rawState.multiplierBySymbol && typeof rawState.multiplierBySymbol === "object"
          ? rawState.multiplierBySymbol
          : {};
        const assignedBySymbol = new Map(
          rawAssigned
            .map((entry) => [String(entry?.symbol ?? entry?.symbolId), Number(entry?.multiplier)])
            .filter(([symbol, multiplier]) => symbol !== "undefined" && Number.isFinite(multiplier))
        );
        const fallbackValues = [4, 3, 2];
        const multiplierBySymbol = {};
        const assigned = cappedSymbols.map((symbolId, index) => {
          const key = String(symbolId);
          const configured = Number(
            rawMultiplierBySymbol[key] ??
            rawMultiplierBySymbol[symbolId] ??
            assignedBySymbol.get(key)
          );
          const fallback = fallbackValues[index] ?? 2;
          const multiplier = fallbackValues.includes(configured) ? configured : fallback;
          multiplierBySymbol[key] = multiplier;
          return {
            symbol: symbolId,
            multiplier,
            rank: index + 1
          };
        });
    
        return {
          selectedSymbols: cappedSymbols,
          multiplierBySymbol,
          assigned,
          maxSelected: 3,
          signature: cappedSymbols.map((symbolId) => `${symbolId}:${multiplierBySymbol[String(symbolId)]}`).join("|")
        };
      },

    syncBonusMultiplierFruits(input = null, { refreshVisuals = true } = {}) {
        const state = this.normalizeBonusMultiplierFruitState(input);
        this.bonusMultiplierFruits = state;
        this.bonusMultiplierFruitSymbolIds = new Set(state?.selectedSymbols || []);
    
        if (refreshVisuals) {
          this.refreshBonusMultiplierFruitOrbVisuals();
          this.refreshAllBonusGridSymbolBaseTbmOverlays();
          this.refreshBonusFruitPileTooltip();
        }
    
        return state;
      },

    clearBonusMultiplierFruits() {
        this.bonusMultiplierFruits = null;
        this.bonusMultiplierFruitSymbolIds = new Set();
        this.bonusMultiplierFruitPresentationSignature = null;
      },

    getBonusMultiplierForSymbol(symbolId) {
        const collectableSymbolId = this.getCollectableBonusSymbolId(symbolId);
        if (collectableSymbolId === null) return null;
    
        const multiplier = Number(this.bonusMultiplierFruits?.multiplierBySymbol?.[String(collectableSymbolId)]);
        return [2, 3, 4].includes(multiplier) ? multiplier : null;
      },

    isDynamicBonusMultiplierFruitStateActive() {
        return Array.isArray(this.bonusMultiplierFruits?.selectedSymbols) &&
          this.bonusMultiplierFruits.selectedSymbols.length > 0;
      },

    getBonusMultiplierFruitOrbTextureKey(symbolId) {
        const collectableSymbolId = this.getCollectableBonusSymbolId(symbolId);
        if (collectableSymbolId === null) return null;
        if (!this.bonusMultiplierFruitSymbolIds?.has?.(collectableSymbolId)) return null;
        const textureKey = `${collectableSymbolId}_orb`;
        return this.textures?.exists?.(textureKey) ? textureKey : null;
      },

    getBonusMultiplierFruitOrbIntensityTextureKey(symbolId) {
        const collectableSymbolId = this.getCollectableBonusSymbolId(symbolId);
        if (collectableSymbolId === null) return null;
        if (!this.bonusMultiplierFruitSymbolIds?.has?.(collectableSymbolId)) return null;
        const textureKey = WIN_HIGHLIGHT_ORB_INTENSITY_TEXTURE_KEYS[collectableSymbolId];
        return textureKey && this.textures?.exists?.(textureKey) ? textureKey : null;
      },

    getBonusAwareSymbolTextureKey(symbolId, { forceBase = false } = {}) {
        const normalizedSymbol = normalizeSymbolKey(symbolId);
        if (forceBase !== true) {
          const orbTextureKey = this.getBonusMultiplierFruitOrbTextureKey(normalizedSymbol);
          if (orbTextureKey) return orbTextureKey;
        }
        return String(normalizedSymbol);
      },

    setBonusAwareSymbolTexture(displayObject = null, symbolId = null, options = {}) {
        if (!displayObject || displayObject.destroyed) return false;
        const normalizedSymbol = normalizeSymbolKey(symbolId ?? displayObject?.symbolKey);
        const textureKey = this.getBonusAwareSymbolTextureKey(normalizedSymbol, options);
        const target = getReelSymbolRenderable(displayObject);
        if (!target || target.destroyed || typeof target.setTexture !== "function") return false;
        if (this.textures?.exists?.(textureKey)) {
          target.setTexture(textureKey);
        }
        target.symbolKey = normalizedSymbol;
        displayObject.symbolKey = normalizedSymbol;
        return true;
      },

    applyBonusMultiplierFruitOrbTexture(displayObject = null, symbolId = null) {
        if (!displayObject || displayObject.destroyed) return false;
        const collectableSymbolId = this.getCollectableBonusSymbolId(symbolId ?? this.getDisplayObjectSymbolId(displayObject));
        const textureKey = this.getBonusMultiplierFruitOrbTextureKey(collectableSymbolId);
        if (!textureKey) return false;
    
        const target = getReelSymbolRenderable(displayObject);
        if (!target || target.destroyed || typeof target.setTexture !== "function") return false;
        target.setTexture(textureKey);
        target.symbolKey = collectableSymbolId;
        displayObject.symbolKey = collectableSymbolId;
        return true;
      },

    refreshBonusMultiplierFruitOrbVisuals() {
        if (!this.isDynamicBonusMultiplierFruitStateActive() || !Array.isArray(this.reelSprites)) {
          return 0;
        }
    
        let changed = 0;
        for (let reel = 0; reel < this.reelSprites.length; reel++) {
          const column = this.reelSprites[reel];
          if (!Array.isArray(column)) continue;
          for (let row = 0; row < column.length; row++) {
            const cell = column[row];
            if (!cell || cell.destroyed) continue;
            const symbolId = this.resolveCollectableSymbolIdFromDisplayObject(cell);
            if (symbolId === null || !this.bonusMultiplierFruitSymbolIds.has(symbolId)) continue;
            if (this.applyBonusMultiplierFruitOrbTexture(cell, symbolId)) {
              changed++;
            }
          }
        }
        return changed;
      },

    getVisibleBonusMultiplierFruitTargets(symbolId) {
        const collectableSymbolId = this.getCollectableBonusSymbolId(symbolId);
        if (collectableSymbolId === null || !Array.isArray(this.reelSprites)) return [];
    
        const targets = [];
        const seen = new Set();
        for (let reel = 0; reel < this.reelSprites.length; reel++) {
          const column = this.reelSprites[reel];
          if (!Array.isArray(column)) continue;
          for (let row = 0; row < column.length; row++) {
            const cell = column[row];
            if (!cell || cell.destroyed) continue;
            const symbol = this.resolveCollectableSymbolIdFromDisplayObject(cell);
            if (symbol !== collectableSymbolId) continue;
            const renderable = getReelSymbolRenderable(cell);
            if (!renderable || renderable.destroyed || seen.has(renderable)) continue;
            seen.add(renderable);
            targets.push({
              cell,
              renderable,
              reel,
              row,
              x: Number(cell.x ?? renderable.x),
              y: Number(cell.y ?? renderable.y),
              temporary: false
            });
          }
        }
    
        return targets;
      },

    createBonusMultiplierFruitFallbackTarget(symbolId, index = 0, total = 1) {
        const collectableSymbolId = this.getCollectableBonusSymbolId(symbolId);
        if (collectableSymbolId === null || !this.textures?.exists?.(String(collectableSymbolId))) return null;
    
        const center = this.getBonusMultiplierFruitChargeTarget();
        const spacing = 64;
        const x = center.x + (index - (Math.max(1, total) - 1) / 2) * spacing;
        const y = center.y - 108;
        const sprite = this.add.image(x, y, this.getBonusAwareSymbolTextureKey(collectableSymbolId, { forceBase: true }))
          .setOrigin(0.5)
          .setScale(0.72)
          .setDepth(DEPTH_HERO + 34)
          .setAlpha(0);
        sprite.symbolKey = collectableSymbolId;
        this.tweens.add({
          targets: sprite,
          alpha: 1,
          y: y - 10,
          duration: 160,
          ease: "Back.easeOut"
        });
    
        return {
          cell: sprite,
          renderable: sprite,
          reel: null,
          row: null,
          x,
          y,
          temporary: true
        };
      },

    drawBonusMultiplierFruitLightningBolt(from, to, { color = 0x78FFD2, width = 3 } = {}) {
        if (!from || !to) return null;
    
        const graphics = this.add.graphics()
          .setDepth(DEPTH_HERO + 33)
          .setBlendMode(Phaser.BlendModes.ADD);
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const distance = Math.max(1, Math.hypot(dx, dy));
        const normalX = -dy / distance;
        const normalY = dx / distance;
        const points = [];
        const segments = Math.max(4, Math.min(9, Math.floor(distance / 70)));
    
        for (let i = 0; i <= segments; i++) {
          const t = i / segments;
          const jitter = i === 0 || i === segments ? 0 : Phaser.Math.Between(-10, 10);
          points.push({
            x: from.x + dx * t + normalX * jitter,
            y: from.y + dy * t + normalY * jitter
          });
        }
    
        const strokePath = (strokeWidth, strokeColor, alpha) => {
          graphics.lineStyle(strokeWidth, strokeColor, alpha);
          graphics.beginPath();
          graphics.moveTo(points[0].x, points[0].y);
          for (let i = 1; i < points.length; i++) {
            graphics.lineTo(points[i].x, points[i].y);
          }
          graphics.strokePath();
        };
    
        strokePath(width + 3, color, 0.28);
        strokePath(width, color, 0.82);
        strokePath(Math.max(1, width - 1), 0xFFFFFF, 0.72);
    
        this.tweens.add({
          targets: graphics,
          alpha: 0,
          duration: 170,
          ease: "Quad.easeOut",
          onComplete: () => graphics.destroy()
        });
    
        return graphics;
      },

    async playBonusMultiplierFruitChargeUp({ nearMiss = false } = {}) {
        const center = this.getBonusMultiplierFruitChargeTarget();
        const durationMs = 1500;
        const depth = DEPTH_HERO + 31;
        const core = this.add.circle(center.x, center.y, 16, 0x5BFF9A, 0.18)
          .setDepth(depth)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setScale(0.4);
        const ring = this.add.circle(center.x, center.y, 28, 0x78FFD2, 0)
          .setDepth(depth - 1)
          .setStrokeStyle(4, 0x78FFD2, 0.32)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setScale(0.45);
    
        this.playSfx?.("wins_highlight", { volume: nearMiss ? 0.16 : 0.22 });
        this.tweens.add({
          targets: core,
          scale: nearMiss ? 2.1 : 2.55,
          alpha: nearMiss ? 0.28 : 0.52,
          duration: durationMs,
          ease: "Cubic.easeIn"
        });
        this.tweens.add({
          targets: ring,
          scale: nearMiss ? 3.2 : 3.75,
          alpha: nearMiss ? 0.24 : 0.42,
          duration: durationMs,
          ease: "Cubic.easeIn"
        });
    
        const sparkSteps = 12;
        for (let index = 0; index < sparkSteps; index++) {
          this.time.delayedCall(index * 115, () => {
            const progress = (index + 1) / sparkSteps;
            const radius = 18 + progress * (nearMiss ? 28 : 40);
            this.spawnCenterCollectGreenLightningBurst({
              x: center.x,
              y: center.y,
              boltCount: Math.max(2, Math.round(2 + progress * (nearMiss ? 3 : 5))),
              radius,
              color: nearMiss ? 0x78FFD2 : 0x5BFF9A,
              orbSize: 8 + progress * (nearMiss ? 7 : 10),
              depth,
              intensityScale: (nearMiss ? 0.22 : 0.28) + progress * (nearMiss ? 0.24 : 0.42),
              lightningLengthScale: 0.32 + progress * 0.22
            });
          });
        }
    
        await this.waitForPresentation(durationMs, { skippable: true, useSceneTime: true });
    
        this.tweens.add({
          targets: [core, ring],
          alpha: 0,
          scale: "+=0.45",
          duration: 220,
          ease: "Quad.easeOut",
          onComplete: () => {
            if (!core.destroyed) core.destroy();
            if (!ring.destroyed) ring.destroy();
          }
        });
    
        if (nearMiss) {
          this.spawnCenterCollectGreenLightningBurst({
            x: center.x,
            y: center.y,
            boltCount: 2,
            radius: 26,
            color: 0x78FFD2,
            orbSize: 10,
            depth,
            intensityScale: 0.22,
            lightningLengthScale: 0.34
          });
          await this.waitForPresentation(320, { skippable: true, useSceneTime: true });
        }
      },

    async strikeBonusMultiplierFruitTarget(target, symbolId, { delay = 0, pulseScale = true } = {}) {
        if (!target?.renderable || target.renderable.destroyed) return false;
        if (delay > 0) {
          await this.waitForPresentation(delay, { skippable: true, useSceneTime: true });
        }
        if (!target?.renderable || target.renderable.destroyed) return false;
    
        const center = this.getBonusMultiplierFruitChargeTarget();
        const end = { x: target.x, y: target.y };
        this.drawBonusMultiplierFruitLightningBolt(center, end, { color: 0x5BFF9A, width: 3 });
        this.playSfx?.("lightning_hammer", { volume: 0.16 });
    
        const flash = this.add.circle(end.x, end.y, 30, 0xC8FFE8, 0.75)
          .setDepth(DEPTH_HERO + 34)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setScale(0.25);
        this.tweens.add({
          targets: flash,
          scale: 1.35,
          alpha: 0,
          duration: 220,
          ease: "Quad.easeOut",
          onComplete: () => flash.destroy()
        });
    
        await this.waitForPresentation(70, { skippable: true, useSceneTime: true });
        this.applyBonusMultiplierFruitOrbTexture(target.cell, symbolId);
        if (pulseScale) {
          target.renderable.setScale?.((target.renderable.scaleX || getSymbolScale(symbolId)) * 1.06);
          this.tweens.add({
            targets: target.renderable,
            scaleX: getSymbolScale(symbolId),
            scaleY: getSymbolScale(symbolId),
            duration: 180,
            ease: "Back.easeOut"
          });
        }
    
        if (target.temporary) {
          this.tweens.add({
            targets: target.renderable,
            alpha: 0,
            y: target.renderable.y - 26,
            duration: 300,
            delay: 260,
            ease: "Cubic.easeIn",
            onComplete: () => {
              if (!target.renderable.destroyed) {
                target.renderable.destroy();
              }
            }
          });
        }
    
        return true;
      },

    async strikeBonusMultiplierFruitType(symbolId) {
        let targets = this.getVisibleBonusMultiplierFruitTargets(symbolId);
        if (targets.length === 0) {
          const fallback = this.createBonusMultiplierFruitFallbackTarget(symbolId, 0, 1);
          targets = fallback ? [fallback] : [];
        }
    
        for (let index = 0; index < targets.length; index++) {
          await this.strikeBonusMultiplierFruitTarget(targets[index], symbolId);
          if (index < targets.length - 1) {
            const nextDelay = Math.max(90, 500 - index * 55);
            await this.waitForPresentation(nextDelay, { skippable: true, useSceneTime: true });
          }
        }
    
        return targets.length;
      },

    async playBonusMultiplierFruitReveal(input = null) {
        const state = this.syncBonusMultiplierFruits(input, { refreshVisuals: false });
        const selectedSymbols = Array.isArray(state?.selectedSymbols) ? state.selectedSymbols.slice(0, 3) : [];
        if (selectedSymbols.length === 0) return false;
    
        const signature = state.signature || selectedSymbols.join("|");
        if (this.bonusMultiplierFruitPresentationSignature === signature) {
          this.refreshBonusMultiplierFruitOrbVisuals();
          return false;
        }
        this.bonusMultiplierFruitPresentationSignature = signature;
    
        for (let index = 0; index < selectedSymbols.length; index++) {
          await this.playBonusMultiplierFruitChargeUp({ nearMiss: false });
          await this.strikeBonusMultiplierFruitType(selectedSymbols[index]);
          if (index < selectedSymbols.length - 1 || selectedSymbols.length < 3) {
            await this.waitForPresentation(320, { skippable: true, useSceneTime: true });
          }
        }
    
        if (selectedSymbols.length < 3) {
          await this.playBonusMultiplierFruitChargeUp({ nearMiss: true });
        }
    
        this.refreshBonusMultiplierFruitOrbVisuals();
        this.refreshAllBonusGridSymbolBaseTbmOverlays();
        this.refreshBonusFruitPileTooltip();
        return true;
      },

    isBonusImmediateLowSymbol(rawSymbol) {
        const symbolId = this.getCollectableBonusSymbolId(rawSymbol);
        if (symbolId === null) return false;
        if (this.getBonusMultiplierForSymbol(symbolId) !== null) return false;
        if (this.isDynamicBonusMultiplierFruitStateActive()) return true;
        return BONUS_IMMEDIATE_LOW_SYMBOL_IDS.has(symbolId);
      },

    getBonusImmediateLowUpgradeLabelText(rawSymbol, explicitValueTbm = null) {
        const symbolId = this.getCollectableBonusSymbolId(rawSymbol);
        if (!this.isBonusImmediateLowSymbol(symbolId)) return "";
    
        const parsedExplicitValue = Number(explicitValueTbm);
        if (Number.isFinite(parsedExplicitValue) && parsedExplicitValue > 0) {
          return `+${Number(parsedExplicitValue.toFixed(2)).toString().replace(/\.00$/, "")}`;
        }
    
        const rawLabel = clientConfig?.bonusEndPayout?.symbolBaseTbmById?.[String(symbolId)];
        const configured = this.getBonusGridSymbolOverlayLabelText(rawLabel);
        if (configured) {
          return configured.startsWith("+") ? configured : `+${configured}`;
        }
    
        const fallback = {
          "4": "+0.5",
          "5": "+0.4",
          "6": "+0.3",
          "7": "+0.2"
        };
        return fallback[String(symbolId)] || "+0";
      },

    getBonusMultiplierFruitOverlayLabelText(symbolId) {
        const multiplier = this.getBonusMultiplierForSymbol(symbolId);
        if (multiplier) return `x${multiplier}`;
        return "";
      },

    getConfiguredBonusGridSymbolOverlayLabelText(symbolId) {
        const collectableSymbolId = this.getCollectableBonusSymbolId(symbolId);
        if (collectableSymbolId === null) return "";
    
        const dynamicStateActive = this.isDynamicBonusMultiplierFruitStateActive();
        const dynamicLabel = this.getBonusMultiplierFruitOverlayLabelText(collectableSymbolId);
        if (dynamicLabel) return dynamicLabel;
    
        const raw = clientConfig?.bonusEndPayout?.symbolBaseTbmById?.[String(collectableSymbolId)];
        if (dynamicStateActive && typeof raw === "string" && /^x\s*\d+(?:\.\d+)?$/i.test(raw.trim())) {
          return "";
        }
    
        return this.getBonusGridSymbolOverlayLabelText(raw);
      },

    getNormalizedBonusFruitCounts(rawCounts = null) {
        const normalized = {};
        const payoutSymbols = Array.isArray(clientConfig.payoutSymbols) ? clientConfig.payoutSymbols : [];
    
        payoutSymbols.forEach((symbolId) => {
          if (!this.isBonusCenterMachineCollectableSymbol(symbolId)) return;
          const value = Math.max(
            0,
            Math.floor(Number(rawCounts?.[symbolId] ?? rawCounts?.[String(symbolId)] ?? 0) || 0)
          );
          if (value > 0) {
            normalized[String(symbolId)] = value;
          }
        });
    
        return normalized;
      },

    formatBonusGridConfigBaseTbmLabel(value) {
        const v = Number(value);
        if (!Number.isFinite(v) || v <= 0) return "";
        if (Math.abs(v - Math.round(v)) < 1e-6) return String(Math.round(v));
        return String(parseFloat(v.toFixed(2)));
      },

    getBonusGridSymbolOverlayLabelText(raw) {
        if (raw === null || raw === undefined) return "";
        if (typeof raw === "string") {
          return raw.trim();
        }
        if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
          return this.formatBonusGridConfigBaseTbmLabel(raw);
        }
        return "";
      },

    getBonusGridSymbolOverlayStyle(payoutId) {
        const dynamicMultiplier = this.getBonusMultiplierForSymbol(payoutId);
        if (dynamicMultiplier) {
          switch (Number(dynamicMultiplier)) {
            case 4:
              return { fill: "#FFD54F", stroke: "#5C4300" };
            case 3:
              return { fill: "#ECEFF1", stroke: "#455A64" };
            case 2:
              return { fill: "#D7A574", stroke: "#3E2723" };
            default:
              return { fill: "#FFE066", stroke: "#2B1706" };
          }
        }
    
        switch (Number(payoutId)) {
          case 1:
            return { fill: "#FFD54F", stroke: "#5C4300" };
          case 2:
            return { fill: "#ECEFF1", stroke: "#455A64" };
          case 3:
            return { fill: "#D7A574", stroke: "#3E2723" };
          default:
            return { fill: "#FFE066", stroke: "#2B1706" };
        }
      },

    applyBonusGridOverlayTextStyle(textObj, payoutId) {
        if (!textObj || textObj.destroyed) return;
        const { fill, stroke } = this.getBonusGridSymbolOverlayStyle(payoutId);
        textObj.setColor(fill);
        textObj.setStroke(stroke, 5);
      },

    isBonusGridSymbolsBaseTbmOverlayActive() {
        if (this.isInBonusMode !== true) return false;
        const a = this.currentAction;
        return a === "freespin" || a === "freerespin" || a === "freespinbananaHunt";
      },

    bundleReelCellForBonusBaseTbmOverlay(image, reel, row, slotGrid = null) {
        if (!image || image.destroyed || image.reelSymbolImage) return image;
        if (!Number.isFinite(reel) || !Number.isFinite(row)) return image;
        const grid = slotGrid || this.reelSprites;
        if (!grid) return image;
        const ix = image.x;
        const iy = image.y;
        const depth = image.depth;
        const container = this.add.container(ix, iy);
        container.setDepth(depth);
        image.x = 0;
        image.y = 0;
        container.add(image);
        container.symbolKey = image.symbolKey;
        container.isDepleted = image.isDepleted;
        container.isTroll3x3 = image.isTroll3x3;
        container.isBeingDestroyed = image.isBeingDestroyed;
        container.reelSymbolImage = image;
        if (image.bananaBackplate) {
          container.bananaBackplate = image.bananaBackplate;
        }
        if (image.symbolBackdrop) {
          container.symbolBackdrop = image.symbolBackdrop;
          image.symbolBackdrop = null;
        }
        if (!grid[reel]) {
          grid[reel] = new Array(clientConfig.area.height).fill(null);
        }
        grid[reel][row] = container;
        return container;
      },

    unwrapReelCellBundleIfPresent(cell, reel, row, slotGrid = null) {
        if (!cell?.reelSymbolImage || cell.destroyed) return cell;
        if (!Number.isFinite(reel) || !Number.isFinite(row)) return cell;
        const grid = slotGrid || this.reelSprites;
        const img = cell.reelSymbolImage;
        const wx = cell.x;
        const wy = cell.y;
        const depth = cell.depth;
        this.tweens.killTweensOf(cell);
        cell.remove(img, false);
        cell.destroy();
        img.setPosition(wx, wy);
        img.setDepth(depth);
        img.symbolKey = cell.symbolKey;
        img.isDepleted = cell.isDepleted;
        img.isTroll3x3 = cell.isTroll3x3;
        img.isBeingDestroyed = cell.isBeingDestroyed;
        if (cell.symbolBackdrop) {
          img.symbolBackdrop = cell.symbolBackdrop;
        }
        if (cell.bananaBackplate) {
          img.bananaBackplate = cell.bananaBackplate;
        }
        if (grid && grid[reel]) {
          grid[reel][row] = img;
        }
        return img;
      },

    setReelCellGraphicDepth(cell, depth = null) {
        const g = getReelSymbolRenderable(cell);
        if (!g) return;
        const symbolDepth = getBoardSymbolDepth(this.getDisplayObjectSymbolId(cell));
        const resolvedDepth = Number.isFinite(Number(symbolDepth))
          ? symbolDepth
          : (Number.isFinite(Number(depth)) ? Number(depth) : DEPTH_SYMBOLS);
        if (cell.reelSymbolImage) {
          cell.setDepth(resolvedDepth);
        } else {
          g.setDepth(resolvedDepth);
        }
      },

    destroySymbolBonusGridBaseTbmOverlay(cell, reel = null, row = null, slotGrid = null) {
        if (!cell) return;
        const lbl = cell.symbolBonusBaseTbmLabel;
        if (lbl && !lbl.destroyed) {
          if (typeof cell.remove === "function") {
            cell.remove(lbl, true);
          } else {
            lbl.destroy();
          }
        }
        cell.symbolBonusBaseTbmLabel = null;
        if (cell.reelSymbolImage && reel != null && row != null) {
          this.unwrapReelCellBundleIfPresent(cell, reel, row, slotGrid);
        }
      },

    ensureSymbolBonusGridBaseTbmOverlay(cell, reel, row, slotGrid = null) {
        if (!cell || cell.destroyed) return;
        const cfg = clientConfig.bonusEndPayout;
        const flag = cfg?.showSymbolConfigBaseTbmOnOverlay === true;
        const payoutId = this.getCollectableBonusSymbolId(cell.symbolKey);
        const labelText = payoutId != null ? this.getConfiguredBonusGridSymbolOverlayLabelText(payoutId) : "";
        const shouldShow =
          flag &&
          this.isBonusGridSymbolsBaseTbmOverlayActive() &&
          payoutId != null &&
          labelText.length > 0 &&
          Number.isFinite(reel) &&
          Number.isFinite(row);
    
        if (!shouldShow) {
          this.destroySymbolBonusGridBaseTbmOverlay(cell, reel, row, slotGrid);
          return;
        }
    
        let root = cell;
        if (!root.reelSymbolImage) {
          root = this.bundleReelCellForBonusBaseTbmOverlay(getReelSymbolRenderable(root), reel, row, slotGrid);
        }
    
        const ly = BONUS_GRID_OVERLAY_LOCAL_Y;
        if (!root.symbolBonusBaseTbmLabel || root.symbolBonusBaseTbmLabel.destroyed) {
          const t = this.add.text(0, ly, labelText, {
            fontSize: "24px",
            fontFamily: '"Cinzel", "Times New Roman", serif',
            fontStyle: "bold",
            color: "#FFE066",
            stroke: "#2B1706",
            strokeThickness: 5
          }).setOrigin(0.5);
          this.applyBonusGridOverlayTextStyle(t, payoutId);
          root.add(t);
          root.symbolBonusBaseTbmLabel = t;
        } else {
          root.symbolBonusBaseTbmLabel.setText(labelText);
          root.symbolBonusBaseTbmLabel.setY(ly);
          this.applyBonusGridOverlayTextStyle(root.symbolBonusBaseTbmLabel, payoutId);
        }
      },

    refreshAllBonusGridSymbolBaseTbmOverlays() {
        if (!this.reelSprites) return;
        for (let reel = 0; reel < this.reelSprites.length; reel++) {
          const column = this.reelSprites[reel];
          if (!column) continue;
          for (let row = 0; row < column.length; row++) {
            const cell = column[row];
            if (!cell || cell.destroyed) continue;
            this.ensureSymbolBonusGridBaseTbmOverlay(cell, reel, row);
          }
        }
      },

    getBonusFruitPileTarget() {
        const cellSize = 70;
        return {
          x: this.multiplierText?.x ?? this.houseSprite?.x ?? (GRID_OFFSET_X + (clientConfig.area.width * cellSize) / 2),
          y: (this.multiplierText?.y ?? this.houseSprite?.y ?? (GRID_OFFSET_Y + (clientConfig.area.height * cellSize) / 2)) + 18
        };
      },

    getCenterCollectTarget() {
        const cellSize = 70;
        return {
          x: this.multiplierText?.x ?? this.houseSprite?.x ?? (GRID_OFFSET_X + (clientConfig.area.width * cellSize) / 2),
          y: this.multiplierText?.y ?? this.houseSprite?.y ?? (GRID_OFFSET_Y + (clientConfig.area.height * cellSize) / 2)
        };
      },

    getBonusMultiplierFruitChargeTarget() {
        const center = this.getCenterCollectTarget();
        return {
          x: center.x,
          y: center.y + BONUS_MULTIPLIER_FRUIT_CHARGE_OFFSET_Y
        };
      },

    getCollectedMultiplierValue(symbolId) {
        const collectableSymbolId = this.getCollectableBonusSymbolId(symbolId);
        if (collectableSymbolId === null) return null;
    
        const dynamicMultiplier = this.getBonusMultiplierForSymbol(collectableSymbolId);
        if (dynamicMultiplier) {
          return dynamicMultiplier;
        }
        if (this.isDynamicBonusMultiplierFruitStateActive()) {
          return null;
        }
    
        const rawLabel = clientConfig?.bonusEndPayout?.symbolBaseTbmById?.[String(collectableSymbolId)];
        if (typeof rawLabel === "string") {
          const match = rawLabel.trim().match(/^x\s*(\d+(?:\.\d+)?)$/i);
          const parsed = Number(match?.[1]);
          if ([2, 3, 4].includes(parsed)) {
            return parsed;
          }
        }
    
        const fallbackBySymbol = { 1: 4, 2: 3, 3: 2 };
        const fallback = fallbackBySymbol[collectableSymbolId];
        return [2, 3, 4].includes(fallback) ? fallback : null;
      },

    isBonusCenterMachineCollectableSymbol(symbolId) {
        const collectableSymbolId = this.getCollectableBonusSymbolId(symbolId);
        if (collectableSymbolId === null) return false;
    
        return this.getCollectedMultiplierValue(collectableSymbolId) !== null;
      },

    consumeCollectedMultiplierOutburstAudioSlot() {
        const now = Number(this.time?.now) || Date.now();
        const burstWindowMs = 900;
        const maxAudibleBursts = 3;
        const state = this._collectedMultiplierOutburstAudioState || {
          windowStartedAt: now,
          count: 0
        };
    
        if (now - state.windowStartedAt > burstWindowMs) {
          state.windowStartedAt = now;
          state.count = 0;
        }
    
        state.count += 1;
        this._collectedMultiplierOutburstAudioState = state;
        return state.count <= maxAudibleBursts;
      },

    playCollectedMultiplierEnergyOutburst(symbolId = null) {
        const multiplierValue = this.getCollectedMultiplierValue(symbolId);
        if (!multiplierValue) {
          return Promise.resolve(false);
        }
    
        const target = this.getCenterCollectTarget();
        const depth = DEPTH_HERO + 24;
        const isStrong = multiplierValue >= 4;
        const effectDuration = isStrong ? 720 : 600;
        const boltCount = 5 + multiplierValue * 2;
        const baseRadius = 20 + multiplierValue * 3;
        const radiusMin = Math.max(34, baseRadius * 0.75);
        const radiusMax = baseRadius + (isStrong ? 78 : 58);
        const centerLightningLengthScale = 0.62;
        const boltRadiusMin = Math.max(22, radiusMin * centerLightningLengthScale);
        const boltRadiusMax = Math.max(32, radiusMax * centerLightningLengthScale);
        const colors = [0x1EFF90, 0x00D1CE, 0x78FFD2, 0xC8FFE8];
    
        if (this.consumeCollectedMultiplierOutburstAudioSlot()) {
          const cappedAudioMultiplier = Math.min(3, multiplierValue);
          this.playSfx?.("orb_collect", { volume: 0.22 + cappedAudioMultiplier * 0.022 });
          this.playSfx?.("lightning_hammer", { volume: 0.06 + cappedAudioMultiplier * 0.01 });
        }
        this.spawnCenterCollectGreenLightningBurst({
          x: target.x,
          y: target.y,
          boltCount: isStrong ? 6 : 4,
          radius: boltRadiusMax * (isStrong ? 0.68 : 0.6),
          color: 0x1EFF90,
          orbSize: isStrong ? 22 : 18,
          depth: depth + 4,
          intensityScale: 0.65,
          lightningLengthScale: centerLightningLengthScale
        });
    
        const core = this.add.circle(target.x, target.y, isStrong ? 24 : 20, 0x1EFF90, 0.62)
          .setDepth(depth + 2)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setScale(0.35);
        this.tweens.add({
          targets: core,
          scale: isStrong ? 3.4 : 2.7,
          alpha: 0,
          duration: isStrong ? 560 : 450,
          ease: "Cubic.easeOut",
          onComplete: () => core.destroy()
        });
    
        const ringWaves = [
          { delay: 0, color: 0x1EFF90, width: isStrong ? 5 : 4, scale: isStrong ? 2.6 : 2.1, alpha: 0.9 },
          { delay: 75, color: 0x78FFD2, width: isStrong ? 3 : 2, scale: isStrong ? 2.2 : 1.75, alpha: 0.58 }
        ];
        ringWaves.forEach((wave, index) => {
          const ring = this.add.circle(target.x, target.y, baseRadius, wave.color, 0)
            .setDepth(depth + 1 - index)
            .setStrokeStyle(wave.width, wave.color, wave.alpha)
            .setBlendMode(Phaser.BlendModes.ADD)
            .setScale(0.35);
          this.tweens.add({
            targets: ring,
            scale: wave.scale,
            alpha: 0,
            delay: wave.delay,
            duration: isStrong ? 520 : 430,
            ease: "Cubic.easeOut",
            onComplete: () => ring.destroy()
          });
        });
    
        for (let i = 0; i < boltCount; i++) {
          const angle = (i / boltCount) * Math.PI * 2 + Phaser.Math.FloatBetween(-0.24, 0.24);
          const distance = Phaser.Math.Between(boltRadiusMin, boltRadiusMax);
          const bend = Phaser.Math.FloatBetween(-0.45, 0.45);
          const points = [];
          const segmentCount = Phaser.Math.Between(3, 5);
          for (let segment = 0; segment <= segmentCount; segment++) {
            const t = segment / segmentCount;
            const jitter = segment === 0 || segment === segmentCount ? 0 : Phaser.Math.FloatBetween(-10, 10);
            const segmentAngle = angle + bend * t + Phaser.Math.FloatBetween(-0.1, 0.1);
            const segmentDistance = distance * t + jitter;
            points.push({
              x: target.x + Math.cos(segmentAngle) * segmentDistance,
              y: target.y + Math.sin(segmentAngle) * segmentDistance
            });
          }
    
          const bolt = this.add.graphics()
            .setDepth(depth)
            .setBlendMode(Phaser.BlendModes.ADD)
            .setAlpha(0.95);
          const outerColor = colors[i % colors.length];
          const drawBoltPath = (width, color, alpha) => {
            bolt.lineStyle(width, color, alpha);
            bolt.beginPath();
            bolt.moveTo(points[0].x, points[0].y);
            for (let pointIndex = 1; pointIndex < points.length; pointIndex++) {
              bolt.lineTo(points[pointIndex].x, points[pointIndex].y);
            }
            bolt.strokePath();
          };
          drawBoltPath(isStrong ? 5 : 4, outerColor, 0.48);
          drawBoltPath(isStrong ? 2 : 1.5, 0xC8FFE8, 0.95);
    
          this.tweens.add({
            targets: bolt,
            alpha: 0,
            delay: Phaser.Math.Between(0, 150),
            duration: Phaser.Math.Between(isStrong ? 310 : 260, isStrong ? 560 : 460),
            ease: "Quad.easeOut",
            onComplete: () => bolt.destroy()
          });
        }
    
        const sparkCount = 5 + multiplierValue * 2;
        for (let i = 0; i < sparkCount; i++) {
          const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
          const distance = Phaser.Math.Between(boltRadiusMin, boltRadiusMax + 24);
          const spark = this.add.circle(
            target.x + Phaser.Math.Between(-5, 5),
            target.y + Phaser.Math.Between(-5, 5),
            Phaser.Math.FloatBetween(1.6, isStrong ? 3.8 : 3),
            colors[Phaser.Math.Between(0, colors.length - 1)],
            0.88
          )
            .setDepth(depth + 3)
            .setBlendMode(Phaser.BlendModes.ADD);
    
          this.tweens.add({
            targets: spark,
            x: target.x + Math.cos(angle) * distance,
            y: target.y + Math.sin(angle) * distance,
            scale: 0.2,
            alpha: 0,
            delay: Phaser.Math.Between(0, 120),
            duration: Phaser.Math.Between(420, isStrong ? 700 : 590),
            ease: "Cubic.easeOut",
            onComplete: () => spark.destroy()
          });
        }
    
        return this.waitForPresentation(effectDuration, { skippable: true }).then(() => true);
      },

    ensureBonusFruitPileUi() {
        const target = this.getBonusFruitPileTarget();
    
        if (!this.bonusFruitPileHitArea || this.bonusFruitPileHitArea.destroyed) {
          this.bonusFruitPileHitArea = this.add.zone(target.x, target.y, 170, 145)
            .setOrigin(0.5)
            .setDepth(DEPTH_HOUSE + 10)
            .setInteractive({ useHandCursor: true });
    
          this.bonusFruitPileHitArea.on("pointerover", () => {
            this.bonusFruitPileTooltipVisible = true;
            this.refreshBonusFruitPileTooltip();
          });
          this.bonusFruitPileHitArea.on("pointerout", () => {
            this.bonusFruitPileTooltipVisible = false;
            if (this.bonusFruitPileTooltip && !this.bonusFruitPileTooltip.destroyed) {
              this.bonusFruitPileTooltip.setVisible(false);
            }
          });
        }
    
        this.bonusFruitPileHitArea.setPosition(target.x, target.y);
        this.refreshBonusFruitPileTooltip();
        return target;
      },

    getBonusFruitPileTooltipValueText(symbolId) {
        return this.getConfiguredBonusGridSymbolOverlayLabelText(symbolId);
      },

    refreshBonusFruitPileTooltip() {
        const target = this.getBonusFruitPileTarget();
        const normalizedPositive = this.getNormalizedBonusFruitCounts(this.bonusFruitPileCounts);
        const tbmHoverInfo = clientConfig.bonusEndPayout?.mouseOverBoxTbmInfo === true;
        const rawPile = this.bonusFruitPileCounts || {};
    
        if (this.bonusFruitPileTooltip && !this.bonusFruitPileTooltip.destroyed) {
          this.bonusFruitPileTooltip.destroy();
        }
    
        const rows = Object.entries(normalizedPositive)
          .map(([symbol, count]) => [String(symbol), Math.max(0, Math.floor(Number(count) || 0))])
          .filter(([symbol, count]) => count > 0 && !this.isBonusImmediateLowSymbol(Number(symbol)));
        const width = tbmHoverInfo ? 220 : 140;
        const rowHeight = tbmHoverInfo ? 28 : 24;
        const height = rows.length > 0 ? 18 + rows.length * rowHeight : 46;
        const containerX = target.x + 110;
        const containerY = target.y - 10;
        const bg = this.add.rectangle(0, 0, width, height, 0x1E1408, 0.92)
          .setOrigin(0, 0)
          .setStrokeStyle(2, 0xC89C3D, 1);
        const children = [bg];
    
        if (rows.length === 0) {
          children.push(
            this.add.text(12, 14, "No fruit yet", {
              fontSize: "16px",
              fontFamily: '"Cinzel", "Times New Roman", serif',
              color: "#F4E4B5",
              stroke: "#000000",
              strokeThickness: 2
            }).setOrigin(0, 0)
          );
        } else if (tbmHoverInfo) {
          rows.forEach(([symbol, count], index) => {
            const rowY = 12 + index * rowHeight;
            const valueText = this.getBonusFruitPileTooltipValueText(symbol);
            const payoutId = this.getCollectableBonusSymbolId(symbol);
            const valueObj = this.add.text(10, rowY, valueText, {
              fontSize: "15px",
              fontFamily: '"Cinzel", "Times New Roman", serif',
              fontStyle: "bold",
              color: "#FFF2C2",
              stroke: "#000000",
              strokeThickness: 3
            }).setOrigin(0, 0);
            if (payoutId != null) {
              this.applyBonusGridOverlayTextStyle(valueObj, payoutId);
            }
            const iconX = 68;
            const icon = this.add.image(iconX, rowY + 11, this.getBonusAwareSymbolTextureKey(symbol))
              .setOrigin(0.5)
              .setScale(0.28);
            const countObj = this.add.text(iconX + 16, rowY, `: ${count}`, {
              fontSize: "15px",
              fontFamily: '"Cinzel", "Times New Roman", serif',
              fontStyle: "bold",
              color: "#FFF2C2",
              stroke: "#000000",
              strokeThickness: 3
            }).setOrigin(0, 0);
    
            children.push(valueObj, icon, countObj);
          });
        } else {
          rows.forEach(([symbol, count], index) => {
            const rowY = 12 + index * rowHeight;
            children.push(
              this.add.image(18, rowY + 8, this.getBonusAwareSymbolTextureKey(symbol))
                .setOrigin(0.5)
                .setScale(0.28)
            );
            children.push(
              this.add.text(34, rowY, `x${count}`, {
                fontSize: "16px",
                fontFamily: '"Cinzel", "Times New Roman", serif',
                color: "#FFF2C2",
                stroke: "#000000",
                strokeThickness: 2
              }).setOrigin(0, 0)
            );
          });
        }
    
        this.bonusFruitPileTooltip = this.add.container(containerX, containerY, children)
          .setDepth(DEPTH_HERO + 20)
          .setVisible(this.bonusFruitPileTooltipVisible === true);
      },

    resetBonusFruitPile(targetCounts = {}) {
        if (Array.isArray(this.bonusFruitPileTokens)) {
          this.bonusFruitPileTokens.forEach((sprite) => {
            if (sprite && !sprite.destroyed) {
              sprite.destroy();
            }
          });
        }
        this.bonusFruitPileTokens = [];
        this.bonusFruitPileCounts = this.getNormalizedBonusFruitCounts(targetCounts);
        this.bonusFruitPileTooltipVisible = false;
    
        if (this.bonusFruitPileTooltip && !this.bonusFruitPileTooltip.destroyed) {
          this.bonusFruitPileTooltip.destroy();
        }
        this.bonusFruitPileTooltip = null;
    
        if (this.bonusFruitPileHitArea && !this.bonusFruitPileHitArea.destroyed) {
          this.bonusFruitPileHitArea.destroy();
        }
        this.bonusFruitPileHitArea = null;
    
        const counts = this.getNormalizedBonusFruitCounts(targetCounts);
        if (BONUS_PILE_KEEP_TOKENS) {
          const maxVisibleTokens = 48;
          let created = 0;
          Object.entries(counts).forEach(([symbol, count]) => {
            for (let i = 0; i < count && created < maxVisibleTokens; i++) {
              this.spawnBonusFruitPileToken(Number(symbol), { animate: false });
              created++;
            }
          });
        }
        this.bonusFruitPileCounts = counts;
        this.refreshBonusFruitPileTooltip();
      },

    getBonusFruitPileLandingPosition() {
        const target = this.getBonusFruitPileTarget();
        const visibleCount = Array.isArray(this.bonusFruitPileTokens) ? this.bonusFruitPileTokens.length : 0;
        const spreadX = Math.min(52, 16 + visibleCount * 1.1);
        const spreadY = Math.min(26, 8 + visibleCount * 0.55);
    
        return {
          x: target.x + Phaser.Math.Between(-Math.round(spreadX), Math.round(spreadX)),
          y: target.y + Phaser.Math.Between(-Math.round(spreadY), Math.round(spreadY)),
          scale: 0.2 + Math.min(0.12, visibleCount * 0.002)
        };
      },

    finalizeBonusFruitPileToken(sprite, symbolId) {
        if (!sprite || sprite.destroyed) return;
    
        if (!BONUS_PILE_KEEP_TOKENS) {
          sprite.destroy();
          this.refreshBonusFruitPileTooltip();
          return;
        }
    
        sprite.symbolKey = symbolId;
        sprite.setAlpha(1);
        sprite.setAngle(Phaser.Math.Between(-14, 14));
        sprite.setDepth(DEPTH_HERO - 1 + Math.max(0, Math.floor((sprite.y - this.getBonusFruitPileTarget().y) / 12)));
        this.bonusFruitPileTokens.push(sprite);
        this.refreshBonusFruitPileTooltip();
      },

    incrementBonusFruitCount(symbolId, amount = 1) {
        const collectableSymbolId = this.getCollectableBonusSymbolId(symbolId);
        const incrementBy = Math.max(0, Math.floor(Number(amount) || 0));
        if (collectableSymbolId === null || incrementBy <= 0) return;
        if (!this.isBonusCenterMachineCollectableSymbol(collectableSymbolId)) return;
    
        this.bonusFruitPileCounts = this.getNormalizedBonusFruitCounts(this.bonusFruitPileCounts);
        const key = String(collectableSymbolId);
        this.bonusFruitPileCounts[key] = Number(this.bonusFruitPileCounts[key] || 0) + incrementBy;
        this.refreshBonusFruitPileTooltip();
      },

    getImmediateLowBackplateKey(reel, row) {
        return `${Math.floor(Number(reel))},${Math.floor(Number(row))}`;
      },

    getImmediateLowSymbolValueTbm(rawSymbol, explicitValueTbm = null) {
        const symbolId = this.getCollectableBonusSymbolId(rawSymbol);
        if (!this.isBonusImmediateLowSymbol(symbolId)) return 0;
    
        const parsedExplicitValue = Number(explicitValueTbm);
        if (Number.isFinite(parsedExplicitValue) && parsedExplicitValue > 0) {
          return Number(parsedExplicitValue);
        }
    
        const raw = clientConfig?.bonusEndPayout?.symbolBaseTbmById?.[String(symbolId)];
        if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
          return Number(raw);
        }
        if (typeof raw === "string") {
          const parsed = Number.parseFloat(raw.replace(/[^0-9.+-]/g, ""));
          if (Number.isFinite(parsed) && parsed > 0) {
            return Number(parsed);
          }
        }
    
        const fallback = {
          4: 0.5,
          5: 0.4,
          6: 0.3,
          7: 0.2
        };
        return Number(fallback[symbolId] || 0);
      },

    clearImmediateLowPositionBackplates() {
        if (this.immediateLowBackplateDisplays instanceof Map) {
          this.immediateLowBackplateDisplays.forEach((display) => {
            this.stopBonusEndHighValuePulse(display);
            if (display?.glow && !display.glow.destroyed) display.glow.destroy();
            if (display?.backplate && !display.backplate.destroyed) display.backplate.destroy();
            if (display?.label && !display.label.destroyed) display.label.destroy();
          });
          this.immediateLowBackplateDisplays.clear();
        } else {
          this.immediateLowBackplateDisplays = new Map();
        }
    
        if (this.immediateLowPositionTbmByKey instanceof Map) {
          this.immediateLowPositionTbmByKey.clear();
        } else {
          this.immediateLowPositionTbmByKey = new Map();
        }
      },

    ensureImmediateLowPositionBackplateDisplay(reel, row, rawValueTbm = 0, { pulse = false, areaValueMap = null } = {}) {
        const valueTbm = Number(rawValueTbm || 0);
        const key = this.getImmediateLowBackplateKey(reel, row);
        if (!(this.immediateLowBackplateDisplays instanceof Map)) {
          this.immediateLowBackplateDisplays = new Map();
        }
    
        if (!(valueTbm > 0)) {
          const stale = this.immediateLowBackplateDisplays.get(key);
          if (stale) {
            this.stopBonusEndHighValuePulse(stale);
            if (stale.glow && !stale.glow.destroyed) stale.glow.destroy();
            if (stale.backplate && !stale.backplate.destroyed) stale.backplate.destroy();
            if (stale.label && !stale.label.destroyed) stale.label.destroy();
            this.immediateLowBackplateDisplays.delete(key);
          }
          return null;
        }
    
        const cellSize = 70;
        const centerX = Number(reel) * cellSize + cellSize / 2 + GRID_OFFSET_X;
        const centerY = (clientConfig.area.height - 1 - Number(row)) * cellSize + cellSize / 2 + GRID_OFFSET_Y;
        const areaHeatValue = this.getMergeGunAreaHeatValueForCell(reel, row, areaValueMap);
        const heatValueTbm = Number.isFinite(Number(areaHeatValue)) && Number(areaHeatValue) > 0
          ? Number(areaHeatValue)
          : valueTbm;
        const heatStyle = this.getBonusEndBoardBackplateVisualStyle(heatValueTbm);
        const resetScale = (display) => {
          if (!display) return;
          if (display.glow && !display.glow.destroyed) {
            this.tweens.killTweensOf(display.glow);
            display.glow.setScale(Math.max(0.01, Number(display.glowBaseScale || 1)));
            display.glow.setAlpha(Math.max(0, Number(display.glowBaseAlpha ?? display.glow.alpha ?? 1)));
          }
          if (display.backplate && !display.backplate.destroyed) {
            this.tweens.killTweensOf(display.backplate);
            display.backplate.setScale(1);
            display.backplate.setAlpha(1);
          }
          if (display.label && !display.label.destroyed) {
            this.tweens.killTweensOf(display.label);
            display.label.setScale(1);
            display.label.setAlpha(1);
          }
        };
    
        let display = this.immediateLowBackplateDisplays.get(key);
        if (!display || display.label?.destroyed) {
          const glow = this.add.circle(centerX, centerY + 6, 30, heatStyle.glowColor, 0.22)
            .setDepth(DEPTH_SYMBOLS - 2)
            .setBlendMode(Phaser.BlendModes.ADD);
          const backplate = this.add.rectangle(centerX, centerY + 6, 70, 70, heatStyle.fillColor, 0.78)
            .setDepth(DEPTH_SYMBOLS - 1)
            .setStrokeStyle(0, heatStyle.strokeColor, 0);
          const label = this.add.text(centerX, centerY + 6, this.formatBonusEndBoardValue(valueTbm), {
            fontSize: "24px",
            fontFamily: '"Cinzel", "Times New Roman", serif',
            fontStyle: "bold",
            color: this.colorIntToCss(heatStyle.textColor),
            stroke: "#2B1706",
            strokeThickness: 5
          })
            .setOrigin(0.5)
            .setDepth(DEPTH_SYMBOLS - 0.8);
    
          display = { glow, backplate, label };
          this.immediateLowBackplateDisplays.set(key, display);
        } else {
          this.stopBonusEndHighValuePulse(display);
          resetScale(display);
          display.glow.setPosition(centerX, centerY + 6);
          display.backplate.setPosition(centerX, centerY + 6);
          display.label.setPosition(centerX, centerY + 6);
        }
    
        this.stopBonusEndHighValuePulse(display);
        this.applyBonusEndBoardValueDisplayStyle(display, valueTbm, { heatTbm: heatValueTbm });
        display.backplate.setDepth(DEPTH_SYMBOLS - 1);
        display.glow.setDepth(DEPTH_SYMBOLS - 2);
        display.label.setDepth(DEPTH_SYMBOLS - 0.8);
    
        const startHighValuePulse = () => {
          this.applyBonusEndHighValuePulse(display, display.heatValueTbm ?? display.valueTbm);
        };
        if (pulse) {
          resetScale(display);
          this.tweens.add({
            targets: [display.glow, display.backplate, display.label],
            scale: 1.12,
            duration: 90,
            yoyo: true,
            ease: "Back.easeOut",
            onComplete: () => {
              resetScale(display);
              startHighValuePulse();
            }
          });
        } else {
          startHighValuePulse();
        }
    
        return display;
      },

    addImmediateLowPositionBackplateValue(reel, row, rawSymbol, {
        pulse = true,
        valueTbm = null,
        coinToss = true,
        coinSound = true
      } = {}) {
        const symbolId = this.getCollectableBonusSymbolId(rawSymbol);
        if (!this.isBonusImmediateLowSymbol(symbolId)) return false;
    
        const parsedReel = Math.floor(Number(reel));
        const parsedRow = Math.floor(Number(row));
        if (!Number.isFinite(parsedReel) || !Number.isFinite(parsedRow)) return false;
        if (parsedReel < 0 || parsedReel >= clientConfig.area.width) return false;
        if (parsedRow < 0 || parsedRow >= clientConfig.area.height) return false;
        if (typeof this.isHouse === "function" && this.isHouse(parsedReel, parsedRow)) return false;
    
        const incrementTbm = this.getImmediateLowSymbolValueTbm(symbolId, valueTbm);
        if (!(incrementTbm > 0)) return false;
    
        if (!(this.immediateLowPositionTbmByKey instanceof Map)) {
          this.immediateLowPositionTbmByKey = new Map();
        }
    
        const key = this.getImmediateLowBackplateKey(parsedReel, parsedRow);
        const currentTbm = Number(this.immediateLowPositionTbmByKey.get(key) || 0);
        const nextTbm = Number((currentTbm + incrementTbm).toFixed(4));
        this.immediateLowPositionTbmByKey.set(key, nextTbm);
        this.ensureImmediateLowPositionBackplateDisplay(parsedReel, parsedRow, nextTbm, { pulse });
        if (coinToss === true) {
          this.playImmediateLowBackplateCoinToss(parsedReel, parsedRow, incrementTbm, {
            playSound: coinSound === true
          });
        }
        this.refreshImmediateLowBackplateAreaHeat();
        return true;
      },

    syncImmediateLowPositionBackplates(rawLandings = []) {
        const landings = Array.isArray(rawLandings) ? rawLandings : [];
        const nextTotals = new Map();
    
        landings.forEach((entry) => {
          const symbolId = this.getCollectableBonusSymbolId(entry?.symbol ?? entry?.symbolId);
          if (!this.isBonusImmediateLowSymbol(symbolId)) return;
    
          const reel = Math.floor(Number(entry?.reel));
          const row = Math.floor(Number(entry?.row));
          if (!Number.isFinite(reel) || !Number.isFinite(row)) return;
          if (reel < 0 || reel >= clientConfig.area.width) return;
          if (row < 0 || row >= clientConfig.area.height) return;
          if (typeof this.isHouse === "function" && this.isHouse(reel, row)) return;
    
          const incrementTbm = this.getImmediateLowSymbolValueTbm(symbolId, entry?.valueTbm);
          if (!(incrementTbm > 0)) return;
    
          const key = this.getImmediateLowBackplateKey(reel, row);
          const current = nextTotals.get(key) || { reel, row, valueTbm: 0 };
          current.valueTbm = Number((Number(current.valueTbm || 0) + incrementTbm).toFixed(4));
          nextTotals.set(key, current);
        });
    
        const previousDisplays = this.immediateLowBackplateDisplays instanceof Map
          ? this.immediateLowBackplateDisplays
          : new Map();
        previousDisplays.forEach((display, key) => {
          if (nextTotals.has(key)) return;
          this.stopBonusEndHighValuePulse(display);
          if (display?.glow && !display.glow.destroyed) display.glow.destroy();
          if (display?.backplate && !display.backplate.destroyed) display.backplate.destroy();
          if (display?.label && !display.label.destroyed) display.label.destroy();
        });
    
        this.immediateLowBackplateDisplays = new Map(
          [...previousDisplays.entries()].filter(([key]) => nextTotals.has(key))
        );
        this.immediateLowPositionTbmByKey = new Map();
        nextTotals.forEach((entry, key) => {
          this.immediateLowPositionTbmByKey.set(key, Number(entry.valueTbm || 0));
          this.ensureImmediateLowPositionBackplateDisplay(entry.reel, entry.row, entry.valueTbm, { pulse: false });
        });
        this.refreshImmediateLowBackplateAreaHeat();
      },

    animateImmediateLowBonusPositionUpgrade(entry = {}, sprite = null, symbolId = null) {
        const resolvedSymbolId = this.getCollectableBonusSymbolId(
          symbolId ?? entry?.symbol ?? entry?.symbolId ?? sprite?.symbolKey
        );
        const reel = Number(entry?.reel);
        const row = Number(entry?.row);
        if (
          resolvedSymbolId === null ||
          !this.isBonusImmediateLowSymbol(resolvedSymbolId) ||
          !Number.isFinite(reel) ||
          !Number.isFinite(row)
        ) {
          if (sprite && !sprite.destroyed) {
            this.tweens.killTweensOf(sprite);
            sprite.destroy();
          }
          return Promise.resolve(false);
        }
    
        const cellSize = 70;
        const centerX = reel * cellSize + cellSize / 2 + GRID_OFFSET_X;
        const centerY = (clientConfig.area.height - 1 - row) * cellSize + cellSize / 2 + GRID_OFFSET_Y;
        let workingSprite = sprite;
        if (workingSprite && workingSprite.destroyed) {
          workingSprite = null;
        }
        if (!workingSprite) {
          workingSprite = this.reelSprites?.[reel]?.[row] || null;
          if (workingSprite?.destroyed) {
            workingSprite = null;
          }
        }
    
        if (!workingSprite) {
          workingSprite = this.add.image(centerX, centerY, String(resolvedSymbolId))
            .setOrigin(0.5)
            .setScale(getSymbolScale(resolvedSymbolId))
            .setDepth(DEPTH_HERO + 4);
        } else if (workingSprite?.reelSymbolImage) {
          this.destroySymbolBonusGridBaseTbmOverlay(workingSprite, reel, row);
          workingSprite = this.reelSprites?.[reel]?.[row] || workingSprite;
        }
    
        this.tweens.killTweensOf(workingSprite);
        this.destroyBananaBackplate(workingSprite);
        workingSprite.setPosition(centerX, centerY);
        workingSprite.setDepth(DEPTH_HERO + 4);
        workingSprite.symbolKey = resolvedSymbolId;
    
        if (this.reelSprites?.[reel]) {
          this.reelSprites[reel][row] = null;
        }
        this.addImmediateLowPositionBackplateValue(reel, row, resolvedSymbolId, {
          pulse: true,
          valueTbm: entry?.valueTbm
        });
    
        const labelText = this.getBonusImmediateLowUpgradeLabelText(resolvedSymbolId, entry?.valueTbm);
        const pulse = this.add.circle(centerX, centerY, 18, 0xCFF95C, 0.36)
          .setDepth(DEPTH_HERO + 4)
          .setBlendMode(Phaser.BlendModes.ADD);
        const label = this.add.text(centerX, centerY - 4, labelText, {
          fontSize: "22px",
          fontFamily: '"Cinzel", "Times New Roman", serif',
          fontStyle: "bold",
          color: "#E6FF9A",
          stroke: "#243103",
          strokeThickness: 5
        })
          .setOrigin(0.5)
          .setDepth(DEPTH_HERO + 6);
    
        const pulsePromise = new Promise((resolve) => {
          this.tweens.add({
            targets: pulse,
            scale: 2.3,
            alpha: 0,
            duration: 280,
            ease: "Quad.easeOut",
            onComplete: () => {
              pulse.destroy();
              resolve();
            }
          });
        });
    
        const spritePromise = new Promise((resolve) => {
          this.tweens.add({
            targets: workingSprite,
            alpha: 0,
            scale: Math.max(0.4, (workingSprite.scaleX || 0.66) * 1.15),
            duration: 220,
            ease: "Quad.easeOut",
            onComplete: () => {
              if (!workingSprite.destroyed) {
                workingSprite.destroy();
              }
              resolve();
            }
          });
        });
    
        const labelPromise = new Promise((resolve) => {
          this.tweens.add({
            targets: label,
            y: label.y - 24,
            alpha: 0,
            duration: 380,
            ease: "Quad.easeOut",
            onComplete: () => {
              label.destroy();
              resolve();
            }
          });
        });
    
        return Promise.all([pulsePromise, spritePromise, labelPromise]).then(() => true);
      },

    getActionBonusCollectionKey(entry = null) {
        const reel = Number(entry?.reel);
        const row = Number(entry?.row);
        const symbol = this.getCollectableBonusSymbolId(entry?.symbol ?? entry?.symbolId);
        if (!Number.isFinite(reel) || !Number.isFinite(row) || symbol === null) {
          return null;
        }
        return `${reel},${row},${symbol}`;
      },

    resetActionBonusCollectionAnimationState() {
        this._actionBonusCollectionKeys = new Set();
      },

    markActionBonusCollectionAnimated(entry = null) {
        const key = this.getActionBonusCollectionKey(entry);
        if (!key) return;
        if (!(this._actionBonusCollectionKeys instanceof Set)) {
          this._actionBonusCollectionKeys = new Set();
        }
        this._actionBonusCollectionKeys.add(key);
      },

    hasActionBonusCollectionAnimated(entry = null) {
        const key = this.getActionBonusCollectionKey(entry);
        if (!key) return false;
        return this._actionBonusCollectionKeys instanceof Set && this._actionBonusCollectionKeys.has(key);
      },

    isBonusFruitPileTokenSprite(displayObject = null) {
        if (!displayObject || displayObject.destroyed) return false;
        const tokens = Array.isArray(this.bonusFruitPileTokens) ? this.bonusFruitPileTokens : [];
        if (tokens.includes(displayObject)) return true;
        if (displayObject.parentContainer && tokens.includes(displayObject.parentContainer)) return true;
        return false;
      },

    clearReelSpriteReferencesForDisplayObject(displayObject = null) {
        if (!displayObject || !Array.isArray(this.reelSprites)) return;
    
        const candidates = new Set([displayObject]);
        const renderable = getReelSymbolRenderable(displayObject);
        if (renderable && !renderable.destroyed) {
          candidates.add(renderable);
        }
        if (displayObject.parentContainer && !displayObject.parentContainer.destroyed) {
          candidates.add(displayObject.parentContainer);
        }
        if (renderable?.parentContainer && !renderable.parentContainer.destroyed) {
          candidates.add(renderable.parentContainer);
        }
    
        for (let reel = 0; reel < this.reelSprites.length; reel++) {
          const column = this.reelSprites[reel];
          if (!Array.isArray(column)) continue;
          for (let row = 0; row < column.length; row++) {
            const cell = column[row];
            if (!cell || cell.destroyed) continue;
            const cellRenderable = getReelSymbolRenderable(cell);
            if (
              candidates.has(cell) ||
              candidates.has(cellRenderable) ||
              candidates.has(cell?.parentContainer) ||
              candidates.has(cellRenderable?.parentContainer)
            ) {
              this.reelSprites[reel][row] = null;
            }
          }
        }
      },

    resolveCollectableSymbolIdFromDisplayObject(displayObject = null) {
        if (!displayObject || displayObject.destroyed) return null;
    
        const direct = this.getCollectableBonusSymbolId(displayObject?.symbolKey);
        if (direct !== null) {
          return direct;
        }
    
        const renderable = getReelSymbolRenderable(displayObject);
        if (renderable && renderable !== displayObject) {
          const nested = this.getCollectableBonusSymbolId(renderable?.symbolKey);
          if (nested !== null) {
            return nested;
          }
        }
    
        const textureKey = renderable?.texture?.key ?? displayObject?.texture?.key;
        const parsedTextureSymbol = Number(textureKey);
        if (Number.isFinite(parsedTextureSymbol)) {
          return this.getCollectableBonusSymbolId(parsedTextureSymbol);
        }
    
        return null;
      },

    findCollectableBoardSpriteAtCell(reel, row, expectedSymbolId = null) {
        const parsedReel = Number(reel);
        const parsedRow = Number(row);
        if (!Number.isFinite(parsedReel) || !Number.isFinite(parsedRow)) return null;
    
        const tracked = this.reelSprites?.[parsedReel]?.[parsedRow];
        if (tracked && !tracked.destroyed) {
          const trackedSymbolId = this.resolveCollectableSymbolIdFromDisplayObject(tracked);
          if (expectedSymbolId === null || trackedSymbolId === expectedSymbolId) {
            return tracked;
          }
        }
    
        const sceneChildren = this.children?.list;
        if (!Array.isArray(sceneChildren) || sceneChildren.length === 0) {
          return null;
        }
    
        const cellSize = 70;
        const centerX = parsedReel * cellSize + cellSize / 2 + GRID_OFFSET_X;
        const centerY = (clientConfig.area.height - 1 - parsedRow) * cellSize + cellSize / 2 + GRID_OFFSET_Y;
        const tolerance = Math.max(8, Math.floor(cellSize * 0.34));
        let resolved = null;
    
        sceneChildren.forEach((child) => {
          if (!child || child.destroyed) return;
          if (this.isBonusFruitPileTokenSprite(child)) return;
          if (!Number.isFinite(child.x) || !Number.isFinite(child.y)) return;
          if (Math.abs(child.x - centerX) > tolerance) return;
          if (Math.abs(child.y - centerY) > tolerance) return;
    
          const symbolId = this.resolveCollectableSymbolIdFromDisplayObject(child);
          if (symbolId === null) return;
          if (expectedSymbolId !== null && symbolId !== expectedSymbolId) return;
          if (!resolved || Number(child.depth || 0) >= Number(resolved.depth || 0)) {
            resolved = child;
          }
        });
    
        return resolved;
      },

    destroyDuplicateCollectableSpritesAtCell(reel, row, expectedSymbolId = null, keepSprite = null) {
        const parsedReel = Number(reel);
        const parsedRow = Number(row);
        if (!Number.isFinite(parsedReel) || !Number.isFinite(parsedRow)) return;
    
        const sceneChildren = this.children?.list;
        if (!Array.isArray(sceneChildren) || sceneChildren.length === 0) {
          return;
        }
    
        const cellSize = 70;
        const centerX = parsedReel * cellSize + cellSize / 2 + GRID_OFFSET_X;
        const centerY = (clientConfig.area.height - 1 - parsedRow) * cellSize + cellSize / 2 + GRID_OFFSET_Y;
        const tolerance = Math.max(8, Math.floor(cellSize * 0.34));
    
        sceneChildren.forEach((child) => {
          if (!child || child === keepSprite || child.destroyed) return;
          if (this.isBonusFruitPileTokenSprite(child)) return;
          if (!Number.isFinite(child.x) || !Number.isFinite(child.y)) return;
          if (Math.abs(child.x - centerX) > tolerance) return;
          if (Math.abs(child.y - centerY) > tolerance) return;
    
          const symbolId = this.resolveCollectableSymbolIdFromDisplayObject(child);
          if (symbolId === null) return;
          if (expectedSymbolId !== null && symbolId !== expectedSymbolId) return;
    
          this.tweens.killTweensOf(child);
          this.destroyBananaBackplate(child);
          child.destroy();
        });
      },

    purgeUntrackedGridCollectableSprites() {
        const sceneChildren = this.children?.list;
        if (!Array.isArray(sceneChildren) || sceneChildren.length === 0) {
          return 0;
        }
    
        const trackedSprites = new Set();
        if (Array.isArray(this.reelSprites)) {
          this.reelSprites.forEach((column) => {
            if (!Array.isArray(column)) return;
            column.forEach((cell) => {
              if (!cell || cell.destroyed) return;
              trackedSprites.add(cell);
              const renderable = getReelSymbolRenderable(cell);
              if (renderable && !renderable.destroyed) {
                trackedSprites.add(renderable);
              }
            });
          });
        }
    
        const protectedSprites = new Set();
        (Array.isArray(this.bonusFruitPileTokens) ? this.bonusFruitPileTokens : []).forEach((token) => {
          if (token && !token.destroyed) {
            protectedSprites.add(token);
          }
        });
    
        const cellSize = 70;
        const minX = GRID_OFFSET_X - cellSize * 0.6;
        const maxX = GRID_OFFSET_X + clientConfig.area.width * cellSize + cellSize * 0.6;
        const minY = GRID_OFFSET_Y - cellSize * 0.6;
        const maxY = GRID_OFFSET_Y + clientConfig.area.height * cellSize + cellSize * 0.6;
        let removed = 0;
    
        sceneChildren.forEach((child) => {
          if (!child || child.destroyed) return;
          if (trackedSprites.has(child)) return;
          if (protectedSprites.has(child)) return;
          if (child.parentContainer && trackedSprites.has(child.parentContainer)) return;
    
          const symbolId = this.resolveCollectableSymbolIdFromDisplayObject(child);
          if (symbolId === null) return;
          if (!Number.isFinite(child.x) || !Number.isFinite(child.y)) return;
          if (child.x < minX || child.x > maxX || child.y < minY || child.y > maxY) return;
    
          this.tweens.killTweensOf(child);
          this.destroyBananaBackplate(child);
          child.destroy();
          removed += 1;
        });
    
        return removed;
      },

    spawnBonusFruitPileToken(symbolId, { animate = true, startX = null, startY = null, playGatherEffect = true } = {}) {
        const collectableSymbolId = this.getCollectableBonusSymbolId(symbolId);
        if (collectableSymbolId === null) return Promise.resolve(false);
        if (!this.isBonusCenterMachineCollectableSymbol(collectableSymbolId)) {
          return Promise.resolve(false);
        }
    
        this.ensureBonusFruitPileUi();
        const tokenLimit = 48;
        const landing = this.getBonusFruitPileLandingPosition();
        const target = this.getBonusFruitPileTarget();
        const originX = Number.isFinite(startX) ? startX : target.x;
        const originY = Number.isFinite(startY) ? startY : target.y - 18;
    
        if (this.bonusFruitPileTokens.length >= tokenLimit) {
          return Promise.resolve(true);
        }
    
        const token = this.add.image(originX, originY, this.getBonusAwareSymbolTextureKey(collectableSymbolId))
          .setOrigin(0.5)
          .setScale(Math.max(0.24, landing.scale))
          .setDepth(DEPTH_HERO + 5);
    
        if (!animate) {
          token.setPosition(landing.x, landing.y);
          token.setScale(landing.scale);
          this.finalizeBonusFruitPileToken(token, collectableSymbolId);
          return Promise.resolve(true);
        }
    
        const peakX = (originX + landing.x) / 2 + Phaser.Math.Between(-16, 16);
        const peakY = Math.min(originY, landing.y) - Phaser.Math.Between(28, 58);
        const liftDuration = Math.round(120 * COLLECT_FALL_SPEED_MULTIPLIER);
        const fallDuration = Math.round(220 * COLLECT_FALL_SPEED_MULTIPLIER);
    
        return new Promise((resolve) => {
          this.tweens.add({
            targets: token,
            x: peakX,
            y: peakY,
            duration: liftDuration,
            ease: "Quad.easeOut",
            onComplete: () => {
              this.tweens.add({
                targets: token,
                x: landing.x,
                y: landing.y,
                scaleX: landing.scale,
                scaleY: landing.scale,
                duration: fallDuration,
                ease: "Quad.easeIn",
                onComplete: () => {
                  this.finalizeBonusFruitPileToken(token, collectableSymbolId);
                  this.createCollectFallImpact(landing.x, landing.y, {
                    symbolId: collectableSymbolId,
                    radius: 20,
                    depth: DEPTH_HERO + 3,
                    durationMs: COLLECT_FALL_IMPACT_DURATION_MS
                  });
                  if (playGatherEffect === true) {
                    this.playCollectedMultiplierEnergyOutburst(collectableSymbolId).then(() => resolve(true));
                    return;
                  }
                  resolve(true);
                }
              });
            }
          });
        });
      },

    animateSpriteOutOfBonusCollection(sprite) {
        if (!sprite || sprite.destroyed) {
          return Promise.resolve(false);
        }
    
        this.tweens.killTweensOf(sprite);
        const renderable = getReelSymbolRenderable(sprite);
        if (renderable && renderable !== sprite) {
          this.tweens.killTweensOf(renderable);
        }
        this.clearReelSpriteReferencesForDisplayObject(sprite);
        if (sprite.reelSymbolImage) {
          this.destroySymbolBonusGridBaseTbmOverlay(sprite);
        }
        this.destroyBananaBackplate(sprite);
        sprite.isBeingDestroyed = true;
        sprite.setDepth(DEPTH_HERO + 3);
    
        return new Promise((resolve) => {
          this.tweens.add({
            targets: sprite,
            alpha: 0,
            scaleX: Math.max(0.16, (sprite.scaleX || normalScale) * 0.42),
            scaleY: Math.max(0.16, (sprite.scaleY || normalScale) * 0.42),
            angle: sprite.angle + Phaser.Math.Between(-28, 28),
            duration: 180,
            ease: "Quad.easeOut",
            onComplete: () => {
              if (!sprite.destroyed) {
                sprite.destroy();
              }
              resolve(true);
            }
          });
        });
      },

    animateSpriteIntoBonusFruitPile(sprite, symbolId = null) {
        const resolvedSymbolId = this.getCollectableBonusSymbolId(symbolId ?? sprite?.symbolKey);
        if (resolvedSymbolId === null) {
          if (sprite && !sprite.destroyed) {
            this.clearReelSpriteReferencesForDisplayObject(sprite);
            sprite.destroy();
          }
          return Promise.resolve(false);
        }
        if (!this.isBonusCenterMachineCollectableSymbol(resolvedSymbolId)) {
          return this.animateSpriteOutOfBonusCollection(sprite);
        }
    
        if (!sprite || sprite.destroyed) {
          this.incrementBonusFruitCount(resolvedSymbolId);
          return this.spawnBonusFruitPileToken(resolvedSymbolId, { animate: true });
        }
    
        this.tweens.killTweensOf(sprite);
        const pileGraphic = getReelSymbolRenderable(sprite);
        if (pileGraphic && pileGraphic !== sprite) {
          this.tweens.killTweensOf(pileGraphic);
        }
        this.clearReelSpriteReferencesForDisplayObject(sprite);
        if (sprite.reelSymbolImage) {
          this.destroySymbolBonusGridBaseTbmOverlay(sprite);
        }
        this.destroyBananaBackplate(sprite);
        if (pileGraphic) {
          this.setBonusAwareSymbolTexture(sprite, resolvedSymbolId);
        }
        sprite.symbolKey = resolvedSymbolId;
        if (sprite.reelSymbolImage) {
          sprite.setDepth(DEPTH_HERO + 5);
        } else if (pileGraphic) {
          pileGraphic.setDepth(DEPTH_HERO + 5);
        }
        this.incrementBonusFruitCount(resolvedSymbolId);
    
        this.ensureBonusFruitPileUi();
        const tokenLimit = 48;
        const target = this.getBonusFruitPileTarget();
        const landing = this.getBonusFruitPileLandingPosition();
        const peakX = (sprite.x + landing.x) / 2 + Phaser.Math.Between(-16, 16);
        const peakY = Math.min(sprite.y, landing.y) - Phaser.Math.Between(28, 58);
        const targetScale = this.bonusFruitPileTokens.length >= tokenLimit
          ? Math.max(0.16, landing.scale * 0.8)
          : landing.scale;
        const liftDuration = Math.round(110 * COLLECT_FALL_SPEED_MULTIPLIER);
        const fallDuration = Math.round(200 * COLLECT_FALL_SPEED_MULTIPLIER);
    
        return new Promise((resolve) => {
          this.tweens.add({
            targets: sprite,
            x: peakX,
            y: peakY,
            duration: liftDuration,
            ease: "Quad.easeOut",
            onComplete: () => {
              this.tweens.add({
                targets: sprite,
                x: this.bonusFruitPileTokens.length >= tokenLimit ? target.x : landing.x,
                y: this.bonusFruitPileTokens.length >= tokenLimit ? target.y : landing.y,
                scaleX: targetScale,
                scaleY: targetScale,
                angle: Phaser.Math.Between(-12, 12),
                duration: fallDuration,
                ease: "Quad.easeIn",
                onComplete: () => {
                  const landedX = Number.isFinite(sprite?.x) ? sprite.x : landing.x;
                  const landedY = Number.isFinite(sprite?.y) ? sprite.y : landing.y;
                  const landedScaleX = Number.isFinite(sprite?.scaleX) ? sprite.scaleX : targetScale;
                  const landedScaleY = Number.isFinite(sprite?.scaleY) ? sprite.scaleY : targetScale;
    
                  if (sprite && !sprite.destroyed) {
                    this.destroyBananaBackplate(sprite);
                    sprite.destroy();
                  }
    
                  if (BONUS_PILE_KEEP_TOKENS && this.bonusFruitPileTokens.length < tokenLimit) {
                    const token = this.add.image(landedX, landedY, this.getBonusAwareSymbolTextureKey(resolvedSymbolId))
                      .setOrigin(0.5)
                      .setScale(landedScaleX, landedScaleY)
                      .setDepth(DEPTH_HERO + 5);
                    this.finalizeBonusFruitPileToken(token, resolvedSymbolId);
                  }
                  this.createCollectFallImpact(landedX, landedY, {
                    symbolId: resolvedSymbolId,
                    radius: 20,
                    depth: DEPTH_HERO + 3,
                    durationMs: COLLECT_FALL_IMPACT_DURATION_MS
                  });
                  this.playCollectedMultiplierEnergyOutburst(resolvedSymbolId).then(() => resolve(true));
                }
              });
            }
          });
        });
      },

    syncBonusCollectedSymbolCounts(targetCounts = {}) {
        const normalizedTarget = this.getNormalizedBonusFruitCounts(targetCounts);
        const normalizedCurrent = this.getNormalizedBonusFruitCounts(this.bonusFruitPileCounts);
        const targetKeys = Object.keys(normalizedTarget);
        const currentKeys = Object.keys(normalizedCurrent);
        const needsRebuild =
          targetKeys.length < currentKeys.length ||
          currentKeys.some((key) => Number(normalizedCurrent[key] || 0) > Number(normalizedTarget[key] || 0));
    
        if (needsRebuild) {
          this.resetBonusFruitPile(normalizedTarget);
          return;
        }
    
        if (!BONUS_PILE_KEEP_TOKENS) {
          this.bonusFruitPileCounts = normalizedTarget;
          this.refreshBonusFruitPileTooltip();
          return;
        }
    
        Object.entries(normalizedTarget).forEach(([symbol, count]) => {
          const currentCount = Number(normalizedCurrent[symbol] || 0);
          const delta = Math.max(0, Number(count || 0) - currentCount);
          for (let i = 0; i < delta; i++) {
            this.spawnBonusFruitPileToken(Number(symbol), { animate: true });
          }
        });
        this.bonusFruitPileCounts = normalizedTarget;
        this.refreshBonusFruitPileTooltip();
      },

    async clearBoardForBonusEndPayout(options = {}) {
        const { preserveMachine = false } = options;
        const clearPromises = [];
        if (preserveMachine !== true) {
          this.cleanupMultiplierEffects();
        }
        this.purgeUntrackedGridCollectableSprites();
        if (preserveMachine !== true && this.houseSprite && !this.houseSprite.destroyed) {
          this.houseSprite.setVisible(false);
        }
        const heroSprite = this.heroSprite;
        if (heroSprite && !heroSprite.destroyed) {
          this.tweens.killTweensOf(heroSprite);
          clearPromises.push(new Promise((resolve) => {
            this.tweens.add({
              targets: heroSprite,
              y: heroSprite.y - 80,
              alpha: 0,
              duration: 220,
              ease: 'Cubic.easeIn',
              onComplete: () => {
                if (!heroSprite.destroyed) {
                  heroSprite.destroy();
                }
                resolve();
              }
            });
          }));
          this.heroSprite = null;
          this.clearMonkeyWildStrengthBadge();
          this.clearHeroWildActiveBadge();
        }
    
        if (Array.isArray(this.reelSprites)) {
          for (let reel = 0; reel < this.reelSprites.length; reel++) {
            const column = this.reelSprites[reel];
            if (!Array.isArray(column)) continue;
            for (let row = 0; row < column.length; row++) {
              const sprite = column[row];
              this.reelSprites[reel][row] = null;
              if (!sprite || sprite.destroyed) continue;
    
              this.tweens.killTweensOf(sprite);
              if (
                this.getDisplayObjectSymbolId(sprite) === LIGHTNING_BEE_FEATURE_SYMBOL_ID ||
                getReelSymbolRenderable(sprite)?._lightningBeeMultiplierLabel
              ) {
                this.clearLightningBeeFeaturePulseForDisplay(sprite, { resetScale: true });
              }
              this.destroyBananaBackplate(sprite);
              clearPromises.push(new Promise((resolve) => {
                this.tweens.add({
                  targets: sprite,
                  y: sprite.y - Phaser.Math.Between(70, 130),
                  alpha: 0,
                  angle: sprite.angle + Phaser.Math.Between(-20, 20),
                  duration: 240,
                  ease: 'Cubic.easeIn',
                  onComplete: () => {
                    if (!sprite.destroyed) {
                      sprite.destroy();
                    }
                    resolve();
                  }
                });
              }));
            }
          }
        }
    
        if (clearPromises.length > 0) {
          await Promise.all(clearPromises);
        }
      },

    clearBonusEndMachineDisplays() {
        this.cleanupMultiplierEffects();
        if (this.houseSprite && !this.houseSprite.destroyed) {
          this.houseSprite.setVisible(false);
        }
      },

    async playBonusFruitPileLaunchPrelude() {
        const tokens = (Array.isArray(this.bonusFruitPileTokens) ? this.bonusFruitPileTokens : [])
          .filter((token) => token && !token.destroyed);
        if (tokens.length === 0) {
          return false;
        }
    
        const pileTarget = this.getBonusFruitPileTarget();
        const center = this.getCenterCollectTarget();
        const launchCenterX = Number.isFinite(center.x) ? center.x : pileTarget.x;
        const launchCenterY = Number.isFinite(center.y) ? center.y + 8 : pileTarget.y;
        const depth = DEPTH_HERO + 24;
        const liftDuration = 620;
        const floatHoldMs = 420;
        const blastDuration = 520;
        const blastStaggerMs = Math.min(7, Math.max(2, Math.floor(170 / Math.max(1, tokens.length))));
    
        if (this.bonusFruitPileTooltip && !this.bonusFruitPileTooltip.destroyed) {
          this.bonusFruitPileTooltip.destroy();
        }
        this.bonusFruitPileTooltip = null;
        if (this.bonusFruitPileHitArea && !this.bonusFruitPileHitArea.destroyed) {
          this.bonusFruitPileHitArea.disableInteractive();
          this.bonusFruitPileHitArea.setVisible(false);
        }
    
        const beam = this.add.graphics()
          .setDepth(depth - 3)
          .setBlendMode(Phaser.BlendModes.ADD);
        const core = this.add.circle(launchCenterX, launchCenterY + 16, 22, 0xDFFF8B, 0.36)
          .setDepth(depth - 2)
          .setBlendMode(Phaser.BlendModes.ADD);
        const ring = this.add.ellipse(launchCenterX, launchCenterY + 24, 112, 34, 0x8DFFCA, 0)
          .setDepth(depth - 2)
          .setStrokeStyle(4, 0xEFFF9F, 0.62)
          .setBlendMode(Phaser.BlendModes.ADD);
    
        this.tweens.add({
          targets: core,
          scaleX: 1.65,
          scaleY: 1.28,
          alpha: 0.58,
          duration: 280,
          yoyo: true,
          repeat: 2,
          ease: "Sine.easeInOut"
        });
        this.tweens.add({
          targets: ring,
          scaleX: 1.2,
          scaleY: 1.45,
          alpha: 0.72,
          duration: 260,
          yoyo: true,
          repeat: 2,
          ease: "Sine.easeInOut"
        });
        this.tweens.addCounter({
          from: 0,
          to: 1,
          duration: liftDuration + floatHoldMs,
          ease: "Sine.easeInOut",
          onUpdate: (counter) => {
            const t = Number(counter.getValue?.() || 0);
            beam.clear();
            const beamTopY = launchCenterY - 124 - Math.sin(t * Math.PI) * 26;
            const beamWidth = 32 + Math.sin(t * Math.PI * 2) * 6;
            beam.fillStyle(0x72FFB1, 0.12 + Math.sin(t * Math.PI) * 0.12);
            beam.fillTriangle(
              launchCenterX - beamWidth,
              launchCenterY + 30,
              launchCenterX + beamWidth,
              launchCenterY + 30,
              launchCenterX,
              beamTopY
            );
            beam.lineStyle(2, 0xEFFF9F, 0.35 + Math.sin(t * Math.PI * 3) * 0.12);
            beam.beginPath();
            beam.moveTo(launchCenterX - beamWidth * 0.55, launchCenterY + 24);
            beam.lineTo(launchCenterX - 6, beamTopY + 12);
            beam.moveTo(launchCenterX + beamWidth * 0.55, launchCenterY + 24);
            beam.lineTo(launchCenterX + 7, beamTopY + 18);
            beam.strokePath();
          }
        });
    
        const tokenFloatTweens = tokens.map((token, index) => new Promise((resolve) => {
          const symbolId = this.getCollectableBonusSymbolId(token.symbolKey ?? token.texture?.key) ?? Number(token.symbolKey);
          const ringIndex = index % 16;
          const ringLayer = Math.floor(index / 16);
          const angle = (ringIndex / Math.max(1, Math.min(16, tokens.length))) * Math.PI * 2 + ringLayer * 0.42;
          const floatRadius = Math.min(112, 46 + ringLayer * 22 + (index % 3) * 8);
          const floatX = launchCenterX + Math.cos(angle) * floatRadius + Phaser.Math.Between(-7, 7);
          const floatY = launchCenterY - 104 + Math.sin(angle) * 26 - ringLayer * 8 + Phaser.Math.Between(-5, 6);
          const restoredScale = Math.max(0.46, Math.min(0.72, getSymbolScale(symbolId) * 0.86));
    
          this.tweens.killTweensOf(token);
          token.setVisible(true);
          token.setAlpha(1);
          token.setDepth(depth + index * 0.01);
    
          this.tweens.add({
            targets: token,
            x: floatX,
            y: floatY,
            scaleX: restoredScale,
            scaleY: restoredScale,
            angle: token.angle + Phaser.Math.Between(-34, 34),
            duration: liftDuration + Phaser.Math.Between(-70, 95),
            delay: Phaser.Math.Between(0, 90),
            ease: "Cubic.easeOut",
            onComplete: () => {
              if (!token.destroyed) {
                this.tweens.add({
                  targets: token,
                  y: token.y - Phaser.Math.Between(5, 11),
                  angle: token.angle + Phaser.Math.Between(-8, 8),
                  duration: 220 + Phaser.Math.Between(0, 130),
                  yoyo: true,
                  repeat: 1,
                  ease: "Sine.easeInOut",
                  onComplete: resolve
                });
                return;
              }
              resolve();
            }
          });
        }));
    
        await Promise.all(tokenFloatTweens);
        await this.waitForPresentation(floatHoldMs, { skippable: true });
    
        const blast = this.add.circle(launchCenterX, launchCenterY - 34, 20, 0xFFF6B0, 0.88)
          .setDepth(depth + 4)
          .setBlendMode(Phaser.BlendModes.ADD);
        this.tweens.add({
          targets: blast,
          radius: 118,
          alpha: 0,
          duration: 260,
          ease: "Quad.easeOut",
          onComplete: () => blast.destroy()
        });
        this.cameras?.main?.shake?.(130, 0.0035);
        this.playSfx?.("wins_highlight", { volume: 0.2 });
    
        const blastPromises = tokens.map((token, index) => new Promise((resolve) => {
          if (!token || token.destroyed) {
            resolve();
            return;
          }
          const exitX = launchCenterX + Phaser.Math.Between(-135, 135);
          const exitY = GRID_OFFSET_Y - 165 - Phaser.Math.Between(0, 130);
          this.tweens.killTweensOf(token);
          this.tweens.add({
            targets: token,
            x: exitX,
            y: exitY,
            alpha: 0,
            scaleX: Math.max(0.2, token.scaleX * 0.72),
            scaleY: Math.max(0.2, token.scaleY * 0.72),
            angle: token.angle + Phaser.Math.Between(-95, 95),
            delay: index * blastStaggerMs,
            duration: blastDuration + Phaser.Math.Between(-80, 140),
            ease: "Cubic.easeIn",
            onComplete: () => {
              if (!token.destroyed) {
                token.destroy();
              }
              resolve();
            }
          });
        }));
    
        await Promise.all(blastPromises);
        [beam, core, ring].forEach((object) => {
          if (object && !object.destroyed) {
            this.tweens.killTweensOf(object);
            object.destroy();
          }
        });
        this.bonusFruitPileTokens = [];
        return true;
      },

    formatBonusEndBoardValue(rawTbm = 0) {
        const rounded = Number(Number(rawTbm || 0).toFixed(2));
        return `${rounded}`;
      },

    interpolateBonusEndColor(fromColor, toColor, t = 0) {
        const amount = Phaser.Math.Clamp(Number(t) || 0, 0, 1);
        const from = Phaser.Display.Color.IntegerToColor(fromColor);
        const to = Phaser.Display.Color.IntegerToColor(toColor);
        return Phaser.Display.Color.GetColor(
          Math.round(Phaser.Math.Linear(from.red, to.red, amount)),
          Math.round(Phaser.Math.Linear(from.green, to.green, amount)),
          Math.round(Phaser.Math.Linear(from.blue, to.blue, amount))
        );
      },

    colorIntToCss(colorInt) {
        return `#${Number(colorInt || 0).toString(16).padStart(6, "0")}`;
      },

    getBonusEndBrightenedColor(colorInt, amount = 0) {
        const brightness = Phaser.Math.Clamp(Number(amount) || 0, 0, 1);
        return this.interpolateBonusEndColor(Number(colorInt || 0), 0xFFFFFF, brightness);
      },

    getBonusEndBoardHeatStyle(rawTbm = 0) {
        const clampedValue = Math.max(0, Number(rawTbm) || 0);
        // One shared cold-to-hot language for normal positions and merged areas.
        // Above 15 BM the hue stays in the red family; pulse intensity carries the extra tiers.
        const stops = [
          { atValue: 0, fill: 0x102B4F, stroke: 0x5EBFFF, glow: 0x309CFF, text: 0xE3F7FF },
          { atValue: 0.5, fill: 0x104A62, stroke: 0x65DFFF, glow: 0x36C2FF, text: 0xE9FDFF },
          { atValue: 1.0, fill: 0x1C6048, stroke: 0x78F0BB, glow: 0x4DD996, text: 0xF0FFF7 },
          { atValue: 1.5, fill: 0x627017, stroke: 0xE5F56E, glow: 0xCFEA43, text: 0xFCFFD9 },
          { atValue: 2.0, fill: 0x8B5912, stroke: 0xFFC46B, glow: 0xFFA534, text: 0xFFF1CC },
          { atValue: 3.5, fill: 0x9A3A12, stroke: 0xFF9660, glow: 0xFF6B34, text: 0xFFF0E8 },
          { atValue: 5.5, fill: 0x9E2414, stroke: 0xFF7E67, glow: 0xFF4F35, text: 0xFFF0EA },
          { atValue: 8.0, fill: 0x941511, stroke: 0xFF6868, glow: 0xFF392F, text: 0xFFF0EA },
          { atValue: 12.0, fill: 0x81100D, stroke: 0xFF5B5B, glow: 0xFF2E29, text: 0xFFF2F0 },
          { atValue: 15.0, fill: 0x7A0E0C, stroke: 0xFF5757, glow: 0xFF2929, text: 0xFFF2F2 },
          { atValue: 30.0, fill: 0x8F1110, stroke: 0xFF6760, glow: 0xFF352E, text: 0xFFF4F2 },
          { atValue: 45.0, fill: 0xA81412, stroke: 0xFF7668, glow: 0xFF4435, text: 0xFFF6F3 },
          { atValue: 60.0, fill: 0xBA1714, stroke: 0xFF8874, glow: 0xFF5540, text: 0xFFF8F4 },
          { atValue: 100.0, fill: 0xD21B18, stroke: 0xFFA08A, glow: 0xFF6B4A, text: 0xFFFFFF }
        ];
    
        let lowerIndex = 0;
        let upperIndex = stops.length - 1;
        for (let index = 0; index < stops.length - 1; index++) {
          const current = stops[index];
          const next = stops[index + 1];
          if (clampedValue >= current.atValue && clampedValue <= next.atValue) {
            lowerIndex = index;
            upperIndex = index + 1;
            break;
          }
          if (clampedValue < stops[0].atValue) {
            lowerIndex = 0;
            upperIndex = 0;
          } else if (clampedValue > stops[stops.length - 1].atValue) {
            lowerIndex = stops.length - 1;
            upperIndex = stops.length - 1;
          }
        }
    
        const lower = stops[lowerIndex];
        const upper = stops[upperIndex];
        const localT = lowerIndex === upperIndex
          ? 0
          : (clampedValue - lower.atValue) / Math.max(0.0001, upper.atValue - lower.atValue);
        const ratioLower = lowerIndex / Math.max(1, stops.length - 1);
        const ratioUpper = upperIndex / Math.max(1, stops.length - 1);
        const ratio = Phaser.Math.Clamp(Phaser.Math.Linear(ratioLower, ratioUpper, localT), 0, 1);
        return {
          ratio,
          fillColor: this.interpolateBonusEndColor(lower.fill, upper.fill, localT),
          strokeColor: this.interpolateBonusEndColor(lower.stroke, upper.stroke, localT),
          glowColor: this.interpolateBonusEndColor(lower.glow, upper.glow, localT),
          textColor: this.interpolateBonusEndColor(lower.text, upper.text, localT)
        };
      },

    getBonusEndBoardBackplateVisualStyle(rawTbm = 0) {
        const heatStyle = this.getBonusEndBoardHeatStyle(rawTbm);
        return {
          ...heatStyle,
          backplateAlpha: 0.78 + heatStyle.ratio * 0.14,
          glowAlpha: 0.2 + heatStyle.ratio * 0.22,
          glowScale: 1 + heatStyle.ratio * 0.45
        };
      },

    applyBonusEndBoardValueDisplayStyle(display = null, rawValueTbm = 0, { heatTbm = rawValueTbm } = {}) {
        const valueTbm = Math.max(0, Number(rawValueTbm) || 0);
        const heatValueTbm = Math.max(0, Number(heatTbm) || 0);
        const visualStyle = this.getBonusEndBoardBackplateVisualStyle(heatValueTbm);
        if (!display) return visualStyle;
    
        display.valueTbm = valueTbm;
        display.heatValueTbm = heatValueTbm;
        display.glowBaseAlpha = visualStyle.glowAlpha;
        display.glowBaseScale = visualStyle.glowScale;
        display.highValuePulseColors = {
          glowFillColor: visualStyle.glowColor,
          glowFillAlpha: visualStyle.glowAlpha,
          backplateFillColor: visualStyle.fillColor,
          backplateFillAlpha: visualStyle.backplateAlpha,
          backplateStrokeColor: visualStyle.strokeColor,
          backplateStrokeAlpha: 0,
          backplateStrokeWidth: 0
        };
    
        if (display.label && !display.label.destroyed) {
          display.label.setText(this.formatBonusEndBoardValue(valueTbm));
          display.label.setColor(this.colorIntToCss(visualStyle.textColor));
          display.label.setAlpha(1);
          display.label.setScale(1);
        }
        if (display.backplate && !display.backplate.destroyed) {
          display.backplate.setSize?.(70, 70);
          display.backplate.setFillStyle?.(visualStyle.fillColor, visualStyle.backplateAlpha);
          display.backplate.setStrokeStyle?.(0, visualStyle.strokeColor, 0);
          display.backplate.setAlpha?.(1);
          display.backplate.setScale?.(1);
        }
        if (display.glow && !display.glow.destroyed) {
          display.glow.setFillStyle?.(visualStyle.glowColor, visualStyle.glowAlpha);
          display.glow.setScale?.(visualStyle.glowScale);
          display.glow.setAlpha?.(visualStyle.glowAlpha);
        }
    
        return visualStyle;
      },

    getBonusEndHighValuePulseStyle(rawTbm = 0) {
        const valueTbm = Math.max(0, Number(rawTbm) || 0);
        let tier = 0;
        if (valueTbm >= 100) tier = 5;
        else if (valueTbm >= 60) tier = 4;
        else if (valueTbm >= 45) tier = 3;
        else if (valueTbm >= 30) tier = 2;
        else if (valueTbm > 15) tier = 1;
        if (tier <= 0) return null;
    
        const tierRatio = (tier - 1) / 4;
        return {
          tier,
          duration: Math.round(1580 - tierRatio * 360),
          glowScaleBoost: 0.04 + tierRatio * 0.11,
          brightnessBoost: 0.08 + tierRatio * 0.18,
          backplateScaleBoost: 0.008 + tierRatio * 0.026,
          areaBrightnessBoost: 0.06 + tierRatio * 0.14
        };
      },

    stopBonusEndHighValuePulse(display = null) {
        if (!display) return;
        if (Array.isArray(display.highValuePulseTweens)) {
          display.highValuePulseTweens.forEach((tween) => {
            if (tween && typeof tween.stop === "function") {
              tween.stop();
            }
          });
        }
        display.highValuePulseTweens = [];
        this.applyBonusEndHighValueBrightness(display, 0);
      },

    applyBonusEndHighValueBrightness(display = null, rawAmount = 0) {
        if (!display) return;
        const amount = Phaser.Math.Clamp(Number(rawAmount) || 0, 0, 1);
        const colors = display.highValuePulseColors || {};
    
        if (typeof display.redrawHighValuePulse === "function") {
          display.redrawHighValuePulse(amount);
        }
    
        const glow = display.glow;
        if (glow && !glow.destroyed) {
          const glowColor = this.getBonusEndBrightenedColor(
            colors.glowFillColor ?? glow.fillColor ?? 0xFFFFFF,
            amount
          );
          glow.setFillStyle?.(
            glowColor,
            Number(colors.glowFillAlpha ?? display.glowBaseAlpha ?? glow.fillAlpha ?? glow.alpha ?? 1)
          );
        }
    
        const backplate = display.backplate || display.labelBackplate;
        if (backplate && !backplate.destroyed) {
          const fillColor = this.getBonusEndBrightenedColor(
            colors.backplateFillColor ?? backplate.fillColor ?? 0xFFFFFF,
            amount
          );
          backplate.setFillStyle?.(
            fillColor,
            Number(colors.backplateFillAlpha ?? backplate.fillAlpha ?? 1)
          );
    
          const strokeWidth = Number(colors.backplateStrokeWidth ?? backplate.lineWidth ?? 0);
          if (strokeWidth > 0) {
            const strokeColor = this.getBonusEndBrightenedColor(
              colors.backplateStrokeColor ?? backplate.strokeColor ?? fillColor,
              amount
            );
            backplate.setStrokeStyle?.(
              strokeWidth,
              strokeColor,
              Number(colors.backplateStrokeAlpha ?? backplate.strokeAlpha ?? 1)
            );
          }
        }
      },

    applyBonusEndHighValuePulse(display = null, rawTbm = 0, { area = false } = {}) {
        if (!display) return null;
        this.stopBonusEndHighValuePulse(display);
    
        const style = this.getBonusEndHighValuePulseStyle(rawTbm);
        display.highValuePulseStyle = style;
        if (!style) return null;
    
        const tweens = [];
        const addLoopTween = (target, config = {}) => {
          if (!target || target.destroyed) return;
          tweens.push(this.tweens.add({
            targets: target,
            duration: style.duration,
            yoyo: true,
            repeat: -1,
            ease: "Sine.easeInOut",
            ...config
          }));
        };
    
        const colorState = { brightness: 0 };
        addLoopTween(colorState, {
          brightness: area === true ? style.areaBrightnessBoost : style.brightnessBoost,
          onUpdate: () => {
            this.applyBonusEndHighValueBrightness(display, colorState.brightness);
          },
          onComplete: () => {
            this.applyBonusEndHighValueBrightness(display, 0);
          }
        });
    
        const glow = display.glow;
        if (glow && !glow.destroyed) {
          const baseGlowAlpha = Math.max(0, Number(display.glowBaseAlpha ?? glow.alpha ?? 0.3));
          const baseGlowScale = Math.max(0.01, Number(display.glowBaseScale ?? glow.scaleX ?? 1));
          glow.setAlpha(baseGlowAlpha);
          glow.setScale(baseGlowScale);
          addLoopTween(glow, {
            scaleX: baseGlowScale * (1 + style.glowScaleBoost),
            scaleY: baseGlowScale * (1 + style.glowScaleBoost)
          });
        }
    
        const backplate = display.backplate || display.labelBackplate;
        if (backplate && !backplate.destroyed) {
          backplate.setAlpha(1);
          backplate.setScale(1);
          addLoopTween(backplate, {
            scaleX: 1 + style.backplateScaleBoost,
            scaleY: 1 + style.backplateScaleBoost
          });
        }
    
        display.highValuePulseTweens = tweens;
        return style;
      },

    createBonusEndLandingSplash(x, y, { isMultiplier = false, intensity = "medium" } = {}) {
        const splashColor = isMultiplier ? 0x7CFFB2 : 0xFFF0A6;
        const intensityBoost = intensity === "heavy" ? 1.5 : 1;
        const dropletCount = intensity === "heavy" ? 12 : 6;
        const ring = this.add.ellipse(x, y + 10, 16 * intensityBoost, 10 * intensityBoost, splashColor, 0.4)
          .setDepth(DEPTH_SYMBOLS + 1)
          .setBlendMode(Phaser.BlendModes.ADD);
        const burst = this.add.circle(x, y, 18 * intensityBoost, splashColor, 0.45)
          .setDepth(DEPTH_SYMBOLS + 2)
          .setBlendMode(Phaser.BlendModes.ADD);
    
        this.tweens.add({
          targets: ring,
          scaleX: 3.2 * intensityBoost,
          scaleY: 2.1 * intensityBoost,
          alpha: 0,
          duration: intensity === "heavy" ? 300 : 240,
          ease: "Quad.easeOut",
          onComplete: () => ring.destroy()
        });
    
        this.tweens.add({
          targets: burst,
          scale: 1.8 * intensityBoost,
          alpha: 0,
          duration: intensity === "heavy" ? 240 : 180,
          ease: "Quad.easeOut",
          onComplete: () => burst.destroy()
        });
    
        for (let index = 0; index < dropletCount; index++) {
          const droplet = this.add.circle(
            x + Phaser.Math.Between(-14, 14),
            y + Phaser.Math.Between(-10, 10),
            Phaser.Math.FloatBetween(2, intensity === "heavy" ? 5 : 4),
            splashColor,
            0.8
          ).setDepth(DEPTH_SYMBOLS + 2);
          const driftAngle = -Math.PI / 2 + Phaser.Math.FloatBetween(-0.9, 0.9);
          const driftDistance = Phaser.Math.Between(
            intensity === "heavy" ? 18 : 14,
            intensity === "heavy" ? 52 : 34
          );
    
          this.tweens.add({
            targets: droplet,
            x: droplet.x + Math.cos(driftAngle) * driftDistance,
            y: droplet.y + Math.sin(driftAngle) * driftDistance,
            alpha: 0,
            scale: 0.6,
            duration: (intensity === "heavy" ? 300 : 220) + Phaser.Math.Between(0, 100),
            ease: "Quad.easeOut",
            onComplete: () => droplet.destroy()
          });
        }
      },

    async playBonusEndPayout(bonusEndPayout = null, options = {}) {
        const phases = Array.isArray(bonusEndPayout?.phases) ? bonusEndPayout.phases : [];
        const fallbackLandings = phases.flatMap((phase) => Array.isArray(phase?.landings) ? phase.landings : []);
        const landings = Array.isArray(bonusEndPayout?.landings) ? bonusEndPayout.landings : fallbackLandings;
        const resolvedPhases = phases.length > 0
          ? phases
          : (landings.length > 0 ? [{ id: "phase_fallback", durationMs: 1000, splashIntensity: "medium", landings }] : []);
        const positionTotals = Array.isArray(bonusEndPayout?.positionTotals)
          ? bonusEndPayout.positionTotals
          : [];
        const mergedAreas = this.getNormalizedMergeGunAreas(bonusEndPayout?.mergedAreas || []);
        const totalTwa = Number(bonusEndPayout?.totalTwa || 0);
        const finalTwa = Math.max(0, Number.isFinite(Number(options?.finalTwa)) ? Number(options.finalTwa) : Number(this.currentDisplayedWin || 0));
        const baseTwa = Number.isFinite(Number(options?.baseTwa))
          ? Math.max(0, Math.min(Number(options.baseTwa), finalTwa))
          : Math.max(0, Math.min(Number(this.currentDisplayedWin || 0) - totalTwa, finalTwa));
        const winCapTbm = Math.max(0, Number(clientConfig?.wincap || 0));
        const betSize = Math.max(0.0001, Number(options?.betSize || clientConfig?.wallet?.betSize || 1) || 1);
        const winCapTwa = winCapTbm > 0 ? winCapTbm * betSize : 0;
        const isMaxWinPayout = winCapTbm > 0 && finalTwa >= winCapTwa - 0.0001;
        const releaseBalloonsAfterKapow = options?.releaseBalloonsAfterKapow === true;
        const allowFeatureBlockedBalloonLanding = options?.allowFeatureBlockedBalloonLanding === true;
        const balloonReleaseFeature = bonusEndPayout?.balloonPopFeature || options?.bonusMysteryFeatureReleaseThisAction || null;
    
        // The in-game yellow count-up stays hidden throughout bonus and only returns
        // when the final collect payout/count-up sequence begins.
        this.isInBonusMode = false;
        this.setMainGamePortalVisible?.(true);
        this.createOrUpdateSymbolSpawnCurtain?.();
        this.suppressCountUpUntilBonusEndPayout = false;
        this.updateCountUp(baseTwa);
        this.bonusFruitPileTooltipVisible = false;
        if (this.bonusFruitPileTooltip && !this.bonusFruitPileTooltip.destroyed) {
          this.bonusFruitPileTooltip.setVisible(false);
        }
        await this.clearBoardForBonusEndPayout({ preserveMachine: true });
        await this.playBonusFruitPileLaunchPrelude();
        this.resetBonusFruitPile({});
        this.clearBonusEndMachineDisplays();
        this.playSfx('wins_payout', { volume: 0.45 });
    
        const seededImmediateDisplays = this.immediateLowBackplateDisplays instanceof Map
          ? this.immediateLowBackplateDisplays
          : new Map();
        const valueDisplays = new Map();
        // Start merged bonus-end areas from their immediate-low base value so the
        // player sees the pre-multiplier total before later landings upgrade it.
        const immediateLowPositionTbmByKey = this.immediateLowPositionTbmByKey instanceof Map
          ? this.immediateLowPositionTbmByKey
          : new Map();
        const mergedAreaValueMap = new Map(
          mergedAreas.map((area) => {
            const baseAreaValue = Array.isArray(area?.positions)
              ? area.positions.reduce((sum, position) => (
                sum + Number(immediateLowPositionTbmByKey.get(`${position.reel},${position.row}`) || 0)
              ), 0)
              : 0;
            return [String(area.id), Number(baseAreaValue.toFixed(4))];
          })
        );
        const mergedAreaByCellKey = new Map();
        const mergedAreaById = new Map();
        mergedAreas.forEach((area) => {
          mergedAreaById.set(String(area.id), area);
          area.positions.forEach((position) => {
            mergedAreaByCellKey.set(`${position.reel},${position.row}`, area);
          });
        });
        const getLabelKey = (reel, row) => `${reel},${row}`;
        const visiblePositionValueTbmByKey = new Map();
        immediateLowPositionTbmByKey.forEach((valueTbm, key) => {
          if (mergedAreaByCellKey.has(String(key))) return;
          const parsedValue = Number(valueTbm || 0);
          if (parsedValue > 0) {
            visiblePositionValueTbmByKey.set(String(key), parsedValue);
          }
        });
        const getVisibleBoardLabelTbm = (positionMap = visiblePositionValueTbmByKey, areaMap = mergedAreaValueMap) => {
          let total = 0;
          positionMap.forEach((value) => {
            total += Number(value || 0);
          });
          areaMap.forEach((value) => {
            total += Number(value || 0);
          });
          return Number(total.toFixed(4));
        };
        const applyLandingToVisibleLabelState = (landing = null, positionMap = visiblePositionValueTbmByKey, areaMap = mergedAreaValueMap) => {
          const areaId = String(landing?.mergedAreaId || "");
          if (areaId) {
            areaMap.set(areaId, Number(landing?.mergedAreaResultValueTbm || 0));
            return getVisibleBoardLabelTbm(positionMap, areaMap);
          }
    
          const reel = Math.floor(Number(landing?.reel));
          const row = Math.floor(Number(landing?.row));
          if (Number.isFinite(reel) && Number.isFinite(row)) {
            const key = getLabelKey(reel, row);
            const valueTbm = Number(landing?.resultValueTbm || 0);
            if (valueTbm > 0) {
              positionMap.set(key, valueTbm);
            } else {
              positionMap.delete(key);
            }
          }
          return getVisibleBoardLabelTbm(positionMap, areaMap);
        };
        const applyBalloonEventToVisibleLabelState = (event = null, positionMap = visiblePositionValueTbmByKey, areaMap = mergedAreaValueMap) => {
          const areaId = String(event?.mergedAreaId || "");
          if (areaId) {
            areaMap.set(areaId, Number(event?.mergedAreaResultValueTbm ?? event?.afterResultValueTbm ?? 0));
            return getVisibleBoardLabelTbm(positionMap, areaMap);
          }
    
          const reel = Math.floor(Number(event?.reel));
          const row = Math.floor(Number(event?.row));
          if (Number.isFinite(reel) && Number.isFinite(row)) {
            const key = getLabelKey(reel, row);
            const valueTbm = Number(event?.afterResultValueTbm ?? event?.beforeResultValueTbm ?? 0);
            if (valueTbm > 0) {
              positionMap.set(key, valueTbm);
            } else {
              positionMap.delete(key);
            }
          }
          return getVisibleBoardLabelTbm(positionMap, areaMap);
        };
        const applyLightningBeeEventToVisibleLabelState = (event = null, positionMap = visiblePositionValueTbmByKey, areaMap = mergedAreaValueMap) => {
          const areaId = String(event?.mergedAreaId || "");
          if (areaId) {
            areaMap.set(areaId, Number(event?.mergedAreaResultValueTbm ?? event?.afterResultValueTbm ?? 0));
            return getVisibleBoardLabelTbm(positionMap, areaMap);
          }
    
          const reel = Math.floor(Number(event?.reel));
          const row = Math.floor(Number(event?.row));
          if (Number.isFinite(reel) && Number.isFinite(row)) {
            const key = getLabelKey(reel, row);
            const valueTbm = Number(event?.afterResultValueTbm ?? event?.beforeResultValueTbm ?? 0);
            if (valueTbm > 0) {
              positionMap.set(key, valueTbm);
            } else {
              positionMap.delete(key);
            }
          }
          return getVisibleBoardLabelTbm(positionMap, areaMap);
        };
        const firstPositiveNumber = (...values) => {
          for (const value of values) {
            const parsed = Number(value);
            if (Number.isFinite(parsed) && parsed > 0) {
              return parsed;
            }
          }
          return 0;
        };
        const resolveBonusEndLandingCoinValueTbm = (landing = null, {
          previousPositionValueTbm = 0,
          previousMergedAreaValueTbm = 0
        } = {}) => {
          const areaId = String(landing?.mergedAreaId || "");
          if (areaId) {
            return firstPositiveNumber(
              landing?.mergedAreaAddedTbm,
              Number(landing?.mergedAreaResultValueTbm || 0) - Number(previousMergedAreaValueTbm || 0),
              landing?.baseAddedTbm,
              landing?.emptyUpgradeAwardTbm,
              landing?.configBaseTbm,
              landing?.resultValueTbm,
              1
            );
          }
    
          return firstPositiveNumber(
            landing?.baseAddedTbm,
            landing?.emptyUpgradeAwardTbm,
            Number(landing?.resultValueTbm || 0) - Number(previousPositionValueTbm || 0),
            landing?.configBaseTbm,
            landing?.resultValueTbm,
            1
          );
        };
        seededImmediateDisplays.forEach((display, key) => {
          if (display?.glow?.destroyed || display?.backplate?.destroyed || display?.label?.destroyed) {
            this.stopBonusEndHighValuePulse(display);
            if (display?.glow && !display.glow.destroyed) display.glow.destroy();
            if (display?.backplate && !display.backplate.destroyed) display.backplate.destroy();
            if (display?.label && !display.label.destroyed) display.label.destroy();
            return;
          }
          if (mergedAreaByCellKey.has(String(key))) {
            this.stopBonusEndHighValuePulse(display);
            if (display?.glow && !display.glow.destroyed) display.glow.destroy();
            if (display?.backplate && !display.backplate.destroyed) display.backplate.destroy();
            if (display?.label && !display.label.destroyed) display.label.destroy();
            return;
          }
          const seededValueTbm = Number(immediateLowPositionTbmByKey.get(String(key)) ?? display.valueTbm ?? 0);
          this.stopBonusEndHighValuePulse(display);
          this.applyBonusEndBoardValueDisplayStyle(display, seededValueTbm);
          this.applyBonusEndHighValuePulse(display, display.heatValueTbm ?? display.valueTbm);
          valueDisplays.set(key, display);
        });
        this.immediateLowBackplateDisplays = new Map();
        const syncMergedAreaShapesOnly = () => {
          this.syncMergeGunAreas(mergedAreas, {
            isBonus: true,
            showValues: false,
            showAreaLabel: false,
            hideMergedAreaCells: true,
            refreshImmediateLowBackplates: false,
            depthBase: DEPTH_HERO + 5
          });
        };
        const syncMergedAreaValueDisplays = (pulseAreaIds = []) => {
          this.syncMergeGunAreas(mergedAreas, {
            isBonus: true,
            showValues: true,
            showAreaLabel: true,
            areaValueMap: mergedAreaValueMap,
            pulseAreaIds,
            refreshImmediateLowBackplates: false,
            depthBase: DEPTH_HERO + 5
          });
        };
        const resolveMergedAreaPayloadValueTbm = (payload = null) => {
          const candidates = [
            payload?.mergedAreaResultValueTbm,
            payload?.afterResultValueTbm,
            payload?.resultValueTbm
          ];
          for (const candidate of candidates) {
            const parsed = Number(candidate);
            if (Number.isFinite(parsed)) {
              return Math.max(0, parsed);
            }
          }
          return 0;
        };
        const setMergedAreaDisplayValue = (areaId, valueTbm = 0, { pulse = false } = {}) => {
          const resolvedAreaId = String(areaId || "");
          if (!resolvedAreaId) return 0;
          const visibleValue = Math.max(0, Number(valueTbm) || 0);
          mergedAreaValueMap.set(resolvedAreaId, Number(visibleValue.toFixed(4)));
          syncMergedAreaValueDisplays(pulse ? [resolvedAreaId] : []);
          return visibleValue;
        };
        const getMergedAreaLabelTarget = (areaId) => {
          const display = this.mergeGunAreaDisplays instanceof Map
            ? this.mergeGunAreaDisplays.get(String(areaId))
            : null;
          if (display?.label && !display.label.destroyed) {
            return { x: display.label.x, y: display.label.y };
          }
          const area = mergedAreaById.get(String(areaId));
          const layout = this.getMergeGunAreaLabelLayout(area, { paddingPx: 14 });
          if (layout) {
            return { x: layout.x, y: layout.y };
          }
          return null;
        };
        const animateMergedAreaValueTravel = (payload = null, previousValue = 0, nextValue = 0, { pulse = true } = {}) => new Promise((resolve) => {
          const areaId = String(payload?.mergedAreaId || "");
          const reel = Number(payload?.reel);
          const row = Number(payload?.row);
          const target = getMergedAreaLabelTarget(areaId);
          if (!areaId || !target || !Number.isFinite(reel) || !Number.isFinite(row)) {
            setMergedAreaDisplayValue(areaId, Math.max(previousValue, nextValue), { pulse });
            resolve();
            return;
          }
    
          const source = this.getGridCellCenter(reel, row);
          const addedValue = Math.max(
            0,
            Number(payload?.mergedAreaAddedTbm || 0) ||
            (Number(nextValue || 0) - Number(previousValue || 0))
          );
          const travelText = addedValue > 0
            ? `+${this.formatBonusEndBoardValue(addedValue)}`
            : this.formatBonusEndBoardValue(nextValue);
          const travelLabel = this.add.text(source.x, source.y + 4, travelText, {
            fontSize: "22px",
            fontFamily: '"Cinzel", "Times New Roman", serif',
            fontStyle: "bold",
            color: "#FFF4B8",
            stroke: "#2B1706",
            strokeThickness: 5
          })
            .setOrigin(0.5)
            .setDepth(DEPTH_HERO + 12)
            .setScale(0.8)
            .setAlpha(0.95);
    
          this.tweens.add({
            targets: travelLabel,
            x: target.x,
            y: target.y,
            scaleX: 0.62,
            scaleY: 0.62,
            alpha: 0.2,
            duration: 320,
            ease: "Cubic.easeInOut",
            onComplete: () => {
              if (!travelLabel.destroyed) {
                travelLabel.destroy();
              }
              setMergedAreaDisplayValue(areaId, Math.max(previousValue, nextValue), { pulse });
              resolve();
            }
          });
        });
        const updateMergedAreaValue = (payload = null, { pulse = true, animate = true } = {}) => {
          const areaId = String(payload?.mergedAreaId || "");
          if (!areaId) return Promise.resolve();
          const previousValue = Number(mergedAreaValueMap.get(areaId) || 0);
          const nextValue = resolveMergedAreaPayloadValueTbm(payload);
          if (!(nextValue > previousValue)) {
            setMergedAreaDisplayValue(areaId, Math.max(previousValue, nextValue), { pulse });
            return Promise.resolve();
          }
          if (animate !== true) {
            setMergedAreaDisplayValue(areaId, Math.max(previousValue, nextValue), { pulse });
            return Promise.resolve();
          }
          return animateMergedAreaValueTravel(payload, previousValue, nextValue, { pulse });
        };
        syncMergedAreaValueDisplays();
        const resetBonusEndValueDisplayScale = (display) => {
          if (!display) return;
          this.stopBonusEndHighValuePulse(display);
          if (display.glow && !display.glow.destroyed) {
            this.tweens.killTweensOf(display.glow);
            display.glow.setScale(Math.max(0.01, Number(display.glowBaseScale || 1)));
            display.glow.setAlpha(Math.max(0, Number(display.glowBaseAlpha ?? display.glow.alpha ?? 1)));
          }
          if (display.backplate && !display.backplate.destroyed) {
            this.tweens.killTweensOf(display.backplate);
            display.backplate.setScale(1);
            display.backplate.setAlpha(1);
          }
          if (display.label && !display.label.destroyed) {
            this.tweens.killTweensOf(display.label);
            display.label.setScale(1);
            display.label.setAlpha(1);
          }
        };
        const pulseBonusEndValueDisplay = (display, scale = 1.14, duration = 90) => {
          if (!display) return;
          resetBonusEndValueDisplayScale(display);
          this.tweens.add({
            targets: [display.glow, display.backplate, display.label],
            scale,
            duration,
            yoyo: true,
            ease: "Back.easeOut",
            onComplete: () => {
              resetBonusEndValueDisplayScale(display);
              this.applyBonusEndHighValuePulse(display, display.heatValueTbm ?? display.valueTbm);
            }
          });
        };
        const ensureValueLabel = (reel, row, centerX, centerY, valueTbm) => {
          const key = getLabelKey(reel, row);
          let display = valueDisplays.get(key);
          const previousVisibleValue = display && !display.label?.destroyed
            ? Number(display.valueTbm || 0)
            : 0;
          const visibleValue = Math.max(Number(valueTbm || 0), previousVisibleValue);
          if (visibleValue <= 0) {
            visiblePositionValueTbmByKey.delete(key);
            return null;
          }
    
          const heatStyle = this.getBonusEndBoardBackplateVisualStyle(visibleValue);
          const mergedArea = mergedAreaByCellKey.get(key) || null;
          if (mergedArea) {
            return null;
          }
          visiblePositionValueTbmByKey.set(key, visibleValue);
          if (!display || display.label?.destroyed) {
            const glow = this.add.circle(centerX, centerY + 6, 30, heatStyle.glowColor, 0.22)
              .setDepth(DEPTH_HERO + 2)
              .setBlendMode(Phaser.BlendModes.ADD);
            const backplate = this.add.rectangle(centerX, centerY + 6, 70, 70, heatStyle.fillColor, 0.78)
              .setDepth(DEPTH_HERO + 3)
              .setStrokeStyle(0, heatStyle.strokeColor, 0);
            const label = this.add.text(centerX, centerY + 6, this.formatBonusEndBoardValue(visibleValue), {
              fontSize: "24px",
              fontFamily: '"Cinzel", "Times New Roman", serif',
              fontStyle: "bold",
              color: this.colorIntToCss(heatStyle.textColor),
              stroke: "#2B1706",
              strokeThickness: 5
            })
              .setOrigin(0.5)
              .setDepth(DEPTH_HERO + 4);
    
            display = { glow, backplate, label };
            valueDisplays.set(key, display);
          } else {
            resetBonusEndValueDisplayScale(display);
            display.glow.setPosition(centerX, centerY + 6);
            display.backplate.setPosition(centerX, centerY + 6);
            display.label.setPosition(centerX, centerY + 6);
            display.label.setText(this.formatBonusEndBoardValue(visibleValue));
          }
    
          this.applyBonusEndBoardValueDisplayStyle(display, visibleValue);
          this.applyBonusEndHighValuePulse(display, display.heatValueTbm ?? display.valueTbm);
          return display;
        };
        const cleanupBonusEndPayoutDisplays = () => {
          valueDisplays.forEach((display) => {
            this.stopBonusEndHighValuePulse(display);
            if (display?.glow && !display.glow.destroyed) display.glow.destroy();
            if (display?.backplate && !display.backplate.destroyed) display.backplate.destroy();
            if (display?.label && !display.label.destroyed) display.label.destroy();
          });
          valueDisplays.clear();
          this.clearMergeGunAreas();
          this.clearImmediateLowPositionBackplates();
        };
        let maxWinLabelPromise = null;
        let maxWinLabelHoldCount = 0;
        let maxWinLabelReadyToFade = false;
        let maxWinLabelFadeStarted = false;
        let finishMaxWinCenterLabel = null;
        const holdMaxWinCenterLabelUntil = (holdUntil = null) => {
          if (!holdUntil || typeof holdUntil.then !== "function") {
            return false;
          }
    
          maxWinLabelHoldCount += 1;
          Promise.resolve(holdUntil)
            .catch(() => {})
            .finally(() => {
              maxWinLabelHoldCount = Math.max(0, maxWinLabelHoldCount - 1);
              if (maxWinLabelReadyToFade && maxWinLabelHoldCount <= 0 && typeof finishMaxWinCenterLabel === "function") {
                finishMaxWinCenterLabel();
              }
            });
          return true;
        };
        const playMaxWinCenterLabel = (labelOptions = {}) => {
          const hasExternalHold = holdMaxWinCenterLabelUntil(labelOptions?.holdUntil);
          if (maxWinLabelPromise) {
            return maxWinLabelPromise;
          }
          if (!hasExternalHold) {
            holdMaxWinCenterLabelUntil(this.waitForPresentation(
              Math.max(900, Math.floor(Number(labelOptions?.holdMs) || 2100)),
              { skippable: true }
            ));
          }
    
          this.updateCountUp(finalTwa);
          const cellSize = 70;
          const centerX = GRID_OFFSET_X + (clientConfig.area.width * cellSize) / 2;
          const centerY = GRID_OFFSET_Y + (clientConfig.area.height * cellSize) / 2 - 8;
          const depth = DEPTH_HERO + 42;
          const displayText = `MAXWIN ${finalTwa.toFixed(2)}`;
    
          const burst = this.add.circle(centerX, centerY + 6, 28, 0xFFF0A6, 0.52)
            .setDepth(depth - 3)
            .setBlendMode(Phaser.BlendModes.ADD);
          const ring = this.add.circle(centerX, centerY + 8, 42, 0xF7D35F, 0)
            .setDepth(depth - 2)
            .setStrokeStyle(5, 0xFFF0A6, 0.76)
            .setBlendMode(Phaser.BlendModes.ADD);
          const glow = this.add.text(centerX, centerY + 5, displayText, {
            fontSize: "58px",
            fontFamily: '"Cinzel", "Times New Roman", serif',
            fontStyle: "900",
            color: "#FFEFA8",
            stroke: "#7A3F04",
            strokeThickness: 14
          })
            .setOrigin(0.5)
            .setDepth(depth - 1)
            .setAlpha(0.42)
            .setScale(0.88)
            .setBlendMode(Phaser.BlendModes.ADD);
          const label = this.add.text(centerX, centerY, displayText, {
            fontSize: "52px",
            fontFamily: '"Cinzel", "Times New Roman", serif',
            fontStyle: "900",
            color: "#FFF7C6",
            stroke: "#211204",
            strokeThickness: 9,
            shadow: {
              offsetX: 0,
              offsetY: 4,
              color: "#000000",
              blur: 12,
              fill: true
            }
          })
            .setOrigin(0.5)
            .setDepth(depth)
            .setAlpha(0)
            .setScale(0.9);
          let maxWinBreathTween = null;
    
          this.playSfx?.("wins_highlight", { volume: 0.28, rate: 0.86 });
          this.tweens.add({
            targets: burst,
            radius: 138,
            alpha: 0,
            duration: 360,
            ease: "Quad.easeOut",
            onComplete: () => {
              if (!burst.destroyed) burst.destroy();
            }
          });
          this.tweens.add({
            targets: ring,
            radius: 130,
            alpha: 0,
            duration: 760,
            ease: "Cubic.easeOut",
            onComplete: () => {
              if (!ring.destroyed) ring.destroy();
            }
          });
          this.tweens.add({
            targets: glow,
            scaleX: 1.08,
            scaleY: 1.08,
            alpha: 0.18,
            duration: 420,
            yoyo: true,
            repeat: 1,
            ease: "Sine.easeInOut"
          });
    
          maxWinLabelPromise = new Promise((resolve) => {
            finishMaxWinCenterLabel = () => {
              if (maxWinLabelFadeStarted) return;
              maxWinLabelFadeStarted = true;
              if (maxWinBreathTween) {
                maxWinBreathTween.stop();
                maxWinBreathTween = null;
              }
              const fadeTargets = [label, glow].filter((target) => target && !target.destroyed);
              this.tweens.killTweensOf(fadeTargets);
              if (fadeTargets.length === 0) {
                resolve();
                return;
              }
              if (!label.destroyed) {
                label.setScale(label.scaleX || 1);
              }
              if (!glow.destroyed) {
                glow.setScale(glow.scaleX || 1);
              }
              this.tweens.add({
                targets: fadeTargets,
                y: "-=34",
                alpha: 0,
                duration: 720,
                ease: "Sine.easeInOut",
                onComplete: () => {
                  if (!label.destroyed) label.destroy();
                  if (!glow.destroyed) glow.destroy();
                  resolve();
                }
              });
            };
    
            this.tweens.add({
              targets: label,
              alpha: 1,
              scaleX: 1,
              scaleY: 1,
              duration: 300,
              ease: "Sine.easeOut",
              onComplete: () => {
                if (!glow.destroyed) {
                  this.tweens.killTweensOf(glow);
                  glow.setAlpha(0.28);
                  glow.setScale(1.02);
                }
                if (!label.destroyed) {
                  label.setScale(1);
                }
                maxWinBreathTween = this.tweens.add({
                  targets: [label, glow].filter((target) => target && !target.destroyed),
                  scaleX: 1.045,
                  scaleY: 1.045,
                  duration: 980,
                  yoyo: true,
                  repeat: -1,
                  ease: "Sine.easeInOut",
                });
                maxWinLabelReadyToFade = true;
                if (maxWinLabelHoldCount <= 0 && typeof finishMaxWinCenterLabel === "function") {
                  finishMaxWinCenterLabel();
                }
              }
            });
          });
    
          return maxWinLabelPromise;
        };
        const playBonusEndBalloonPopFeature = async (balloonFeature = null, balloonOptions = {}) => {
          const baseEvents = balloonFeature?.triggered === true && Array.isArray(balloonFeature?.events)
            ? balloonFeature.events
            : [];
          const fakeCelebrationCount = Math.max(0, Math.floor(Number(balloonOptions?.fakeCelebrationCount || 0)) || 0);
          const fakeTextureKeys = baseEvents
            .map((event) => String(event?.spriteKey || ""))
            .filter((key) => key.length > 0);
          const fakeCelebrationEvents = Array.from({ length: fakeCelebrationCount }, (_, index) => ({
            index: baseEvents.length + index,
            balloonId: `maxwin_celebration_${index}`,
            spriteKey: fakeTextureKeys.length > 0 ? fakeTextureKeys[index % fakeTextureKeys.length] : null,
            multiplier: 2,
            popped: false,
            celebrationOnly: true,
            hideMultiplierLabel: true,
            flight: {
              startXRatio: Number(((index + 0.5) / Math.max(1, fakeCelebrationCount)).toFixed(4)),
              driftXRatio: Number(Phaser.Math.FloatBetween(-0.28, 0.28).toFixed(4)),
              passOverTarget: false,
              randomSideBiasRatioAbs: Number(Phaser.Math.FloatBetween(0.08, 0.18).toFixed(4)),
              swayAmplitudeRatio: Number(Phaser.Math.FloatBetween(0.04, 0.1).toFixed(4)),
              swayCycles: Number(Phaser.Math.FloatBetween(1.5, 3.6).toFixed(3)),
              riseDurationMs: Phaser.Math.Between(1800, 2850),
              popAtProgress: 0.95
            }
          }));
          const events = [...baseEvents, ...fakeCelebrationEvents];
          if (events.length === 0) {
            return { maxWinTriggered: false };
          }
    
          const visualOnly = balloonOptions?.visualOnly === true;
          const fastRelease = balloonOptions?.fastRelease === true;
          const celebrationRelease = balloonOptions?.celebrationRelease === true;
          const forceFlyOff = balloonOptions?.forceFlyOff === true;
          const blockFeatureTargets = balloonOptions?.blockFeatureTargets !== false;
          const cellSize = 70;
          const boardWidth = clientConfig.area.width * cellSize;
          const boardHeight = clientConfig.area.height * cellSize;
          const boardLeft = GRID_OFFSET_X;
          const boardRight = boardLeft + boardWidth;
          const boardTop = GRID_OFFSET_Y;
          const boardBottom = boardTop + boardHeight;
          const minX = boardLeft + 20;
          const maxX = boardRight - 20;
          const BALLOON_SIZE_BOOST = 1.69;
          const BALLOON_SERIAL_STAGGER_MS = celebrationRelease ? 115 : (fastRelease ? 130 : 420);
          let balloonMaxWinTriggered = false;
    
          const resolveTextureKey = (rawTextureKey = null) => {
            const desired = String(rawTextureKey || "");
            if (desired && this.textures?.exists(desired)) {
              return desired;
            }
            if (this.textures?.exists(BONUS_END_BALLOON_TEXTURE_FALLBACK)) {
              return BONUS_END_BALLOON_TEXTURE_FALLBACK;
            }
            return String(BONUS_MYSTERY_FEATURE_SYMBOL_ID);
          };
          const parseFiniteNumber = (value, fallback = 0) => {
            const parsed = Number(value);
            return Number.isFinite(parsed) ? parsed : fallback;
          };
          const resolveBalloonHitColor = (event = null) => {
            const key = String(event?.spriteKey || event?.balloonId || "").toLowerCase();
            if (key.includes("blue")) return 0x6EC7FF;
            if (key.includes("green")) return 0x7FF5B5;
            if (key.includes("yellow")) return 0xFFE27A;
            if (key.includes("purple")) return 0xD2A4FF;
            if (key.includes("orange")) return 0xFFB46E;
            if (key.includes("red")) return 0xFF8A8A;
            return 0xFFE08F;
          };
          const resolveBalloonEventValueTbm = (event = null) => {
            const after = parseFiniteNumber(event?.afterResultValueTbm, NaN);
            if (Number.isFinite(after)) return after;
            return parseFiniteNumber(event?.beforeResultValueTbm, 0);
          };
          const resolveBalloonEventCoinValueTbm = (event = null) => firstPositiveNumber(
            event?.addedTbm,
            parseFiniteNumber(event?.afterResultValueTbm, 0) - parseFiniteNumber(event?.beforeResultValueTbm, 0),
            event?.afterResultValueTbm,
            1
          );
          const playBalloonTargetBlink = (x, y, hitColor = 0xFFE08F) => {
            const flashRect = this.add.rectangle(x, y + 6, 74, 74, 0xFFFFFF, 0.95)
              .setDepth(DEPTH_HERO + 10)
              .setBlendMode(Phaser.BlendModes.ADD);
            const hitRing = this.add.circle(x, y + 6, 30, hitColor, 0)
              .setDepth(DEPTH_HERO + 11)
              .setStrokeStyle(5, hitColor, 0.98);
            const hitCore = this.add.circle(x, y + 6, 16, hitColor, 0.7)
              .setDepth(DEPTH_HERO + 11)
              .setBlendMode(Phaser.BlendModes.ADD);
    
            this.tweens.add({
              targets: flashRect,
              alpha: 0,
              scaleX: 1.12,
              scaleY: 1.12,
              duration: 160,
              ease: "Quad.easeOut",
              onComplete: () => {
                if (!flashRect.destroyed) flashRect.destroy();
              }
            });
            this.tweens.add({
              targets: hitRing,
              radius: 54,
              alpha: 0,
              duration: 260,
              ease: "Quad.easeOut",
              onComplete: () => {
                if (!hitRing.destroyed) hitRing.destroy();
              }
            });
            this.tweens.add({
              targets: hitCore,
              alpha: 0,
              scale: 1.45,
              duration: 220,
              ease: "Quad.easeOut",
              onComplete: () => {
                if (!hitCore.destroyed) hitCore.destroy();
              }
            });
          };
          const latestPoppedTargets = new Map();
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
            if (isHeroFootprintCell(normalizedReel, normalizedRow)) {
              return true;
            }
            const symbolDisplay = this.reelSprites?.[normalizedReel]?.[normalizedRow];
            const symbolId = this.getDisplayObjectSymbolId(symbolDisplay);
            return isBlockingFeatureSymbolId(symbolId);
          };
          const waitForFeatureTargetClear = async (reel, row) => {
            if (blockFeatureTargets !== true) return;
            const maxWaitMs = celebrationRelease ? 260 : (fastRelease ? 680 : 1600);
            const pollMs = 55;
            let waitedMs = 0;
            while (waitedMs < maxWaitMs && isTargetBlockedByFeature(reel, row)) {
              await this.waitForPresentation(pollMs, { skippable: true });
              waitedMs += pollMs;
            }
          };
    
          const spawnBalloonFx = (event, index, { onLaunch = null } = {}) => new Promise((resolve) => {
            const flight = event?.flight || {};
            const startXRatio = Phaser.Math.Clamp(Number(flight?.startXRatio), 0.02, 0.98);
            const passOverTarget = flight?.passOverTarget === true;
            const driftXRatio = Phaser.Math.Clamp(Number(flight?.driftXRatio), -0.45, 0.45);
            const swayAmplitudeRatio = Phaser.Math.Clamp(Math.abs(Number(flight?.swayAmplitudeRatio) || 0.03), 0.02, 0.12);
            const swayCycles = Phaser.Math.Clamp(Number(flight?.swayCycles), 0.8, 4.5);
            const riseDurationMs = celebrationRelease
              ? Phaser.Math.Clamp(
                Math.floor((Number(flight?.riseDurationMs) || 2200) * 1.05),
                1550,
                3300
              )
              : fastRelease
              ? Phaser.Math.Clamp(
                Math.floor((Number(flight?.riseDurationMs) || 1800) * 0.58),
                680,
                1650
              )
              : Phaser.Math.Clamp(
                Math.floor((Number(flight?.riseDurationMs) || 1800) * 1.8),
                2400,
                6800
              );
            const popAtProgress = Phaser.Math.Clamp(Number(flight?.popAtProgress), 0.45, 0.98);
            const popped = event?.popped === true;
            const multiplier = Math.max(2, Math.floor(Number(event?.multiplier) || 2));
            const hideMultiplierLabel = event?.hideMultiplierLabel === true || balloonOptions?.hideMultiplierLabels === true;
            const reel = Number(event?.reel);
            const row = Number(event?.row);
            const targetReel = Number.isFinite(reel) ? Math.floor(reel) : null;
            const targetRow = Number.isFinite(row) ? Math.floor(row) : null;
            let targetCenter = Number.isFinite(targetReel) && Number.isFinite(targetRow)
              ? this.getGridCellCenter(targetReel, targetRow)
              : {
                  x: Phaser.Math.Between(minX, maxX),
                  y: Phaser.Math.Between(boardTop + 80, boardBottom - 60)
                };
            const laneRatioRaw = events.length <= 1 ? 0.5 : index / (events.length - 1);
            const laneRatio = Phaser.Math.Clamp(laneRatioRaw, 0.04, 0.96);
            const laneBlend = passOverTarget ? 0.58 : 0.7;
            const laneJitterAbs = passOverTarget ? 0.035 : 0.06;
            const laneJitter = Phaser.Math.FloatBetween(-laneJitterAbs, laneJitterAbs);
            const blendedStartXRatio = Phaser.Math.Clamp(
              (laneRatio * laneBlend) + (startXRatio * (1 - laneBlend)) + laneJitter,
              0.02,
              0.98
            );
            const mysteryMeterTarget = this.getBonusMysteryMeterTarget();
            const stagedCenterX = Number(this.bonusMysteryMeterIcon?.x ?? mysteryMeterTarget.x) + 8;
            const stagedCenterY = boardBottom + 34;
            const stagedSpread = Phaser.Math.Clamp((events.length - 1) * 34, 90, 260);
            const stagedLaneX = stagedCenterX +
              Phaser.Math.Linear(-stagedSpread / 2, stagedSpread / 2, laneRatio) +
              Phaser.Math.Between(-8, 8);
            const startX = celebrationRelease
              ? boardLeft + blendedStartXRatio * boardWidth
              : Phaser.Math.Clamp(stagedLaneX, minX, maxX);
            const startY = celebrationRelease
              ? boardBottom + 95 + Phaser.Math.Between(0, 35)
              : stagedCenterY + Phaser.Math.Between(-7, 9);
            const missGoal = popped !== true || forceFlyOff;
            const missOffsetX = missGoal ? Phaser.Math.Between(-Math.floor(cellSize * 2.1), Math.floor(cellSize * 2.1)) : 0;
            // Non-popped balloons should rise just above the game area, then disappear.
            const endY = boardTop - Phaser.Math.Between(28, 92);
            const randomSideBiasRatioAbs = Phaser.Math.Clamp(
              Math.abs(Number(flight?.randomSideBiasRatioAbs) || 0.12),
              0,
              0.25
            );
            const randomSideBiasRatio = randomSideBiasRatioAbs > 0
              ? Phaser.Math.FloatBetween(-randomSideBiasRatioAbs, randomSideBiasRatioAbs)
              : 0;
            let endX = Phaser.Math.Clamp(
              targetCenter.x + (driftXRatio + randomSideBiasRatio) * boardWidth + missOffsetX,
              minX,
              maxX
            );
            const swayAmplitude = Math.max(8, swayAmplitudeRatio * boardWidth);
            const phaseOffset = Phaser.Math.FloatBetween(0, Math.PI * 2);
            const balloonScaleMultiplier = 1.4;
            const scaleBase = (0.18 + Math.min(0.08, (multiplier - 2) * 0.008)) * balloonScaleMultiplier * BALLOON_SIZE_BOOST;
            const impactProgress = Phaser.Math.Clamp(popAtProgress, 0.35, 0.96);
            let balloon = null;
            const shouldUsePopFlight = () => (
              popped &&
              !forceFlyOff &&
              !(balloonMaxWinTriggered && !balloon?._bonusBalloonPopTriggered)
            );
            const resolveFlightPosition = (progress) => {
              const t = Phaser.Math.Clamp(Number(progress || 0), 0, 1);
              if (shouldUsePopFlight()) {
                const approachT = Phaser.Math.Clamp(t / Math.max(0.01, impactProgress), 0, 1);
                const easedApproach = Phaser.Math.SmoothStep(approachT, 0, 1);
                const targetSway = Math.sin((t * Math.PI * 2 * swayCycles) + phaseOffset) * swayAmplitude * 0.42 * (1 - easedApproach);
                return {
                  x: Phaser.Math.Linear(startX, targetCenter.x, easedApproach) + targetSway,
                  y: Phaser.Math.Linear(startY, targetCenter.y, easedApproach)
                };
              }
    
              const sway = Math.sin((t * Math.PI * 2 * swayCycles) + phaseOffset) * swayAmplitude * (1 - t * 0.7);
              return {
                x: Phaser.Math.Linear(startX, endX, t) + sway,
                y: Phaser.Math.Linear(startY, endY, t)
              };
            };
    
            balloon = this.add.image(startX, startY, resolveTextureKey(event?.spriteKey))
              .setOrigin(0.5)
              .setDepth(DEPTH_HERO + 8)
              .setScale(scaleBase)
              .setAlpha(0.97);
            const balloonMultLabel = hideMultiplierLabel
              ? null
              : this.add.text(startX, startY + 2, `x${multiplier}`, {
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
    
            const startDelay = Math.max(
              0,
              Math.floor(
                index * BALLOON_SERIAL_STAGGER_MS +
                Phaser.Math.Between(0, 50)
              )
            );
            this.time.delayedCall(startDelay, async () => {
              if (!balloon || balloon.destroyed) {
                if (balloonMultLabel && !balloonMultLabel.destroyed) {
                  balloonMultLabel.destroy();
                }
                resolve();
                return;
              }
              if (Number.isFinite(targetReel) && Number.isFinite(targetRow)) {
                await waitForFeatureTargetClear(targetReel, targetRow);
                if (!balloon || balloon.destroyed) {
                  if (balloonMultLabel && !balloonMultLabel.destroyed) {
                    balloonMultLabel.destroy();
                  }
                  resolve();
                  return;
                }
                targetCenter = this.getGridCellCenter(targetReel, targetRow);
                endX = Phaser.Math.Clamp(
                  targetCenter.x + (driftXRatio + randomSideBiasRatio) * boardWidth + missOffsetX,
                  minX,
                  maxX
                );
              }
              if (!celebrationRelease) {
                await this.waitForPresentation(120, { skippable: true });
              }
              if (!balloon || balloon.destroyed) {
                if (balloonMultLabel && !balloonMultLabel.destroyed) {
                  balloonMultLabel.destroy();
                }
                resolve();
                return;
              }
    
              if (
                event?.celebrationOnly !== true &&
                !balloon._bonusEndLaunchCounted &&
                typeof onLaunch === "function"
              ) {
                balloon._bonusEndLaunchCounted = true;
                onLaunch(event, index);
              }
    
              this.tweens.addCounter({
                from: 0,
                to: 1,
                duration: riseDurationMs,
                ease: "Linear",
                onUpdate: (counter) => {
                  if (!balloon || balloon.destroyed) return;
                  const t = Phaser.Math.Clamp(Number(counter?.getValue?.() || 0), 0, 1);
                  const flightPosition = resolveFlightPosition(t);
                  balloon.x = flightPosition.x;
                  balloon.y = flightPosition.y;
                  balloon.angle = Math.sin((t * Math.PI * 2 * 1.8) + phaseOffset) * 8;
                  balloon.setScale(scaleBase * (1 + (Math.sin((t * Math.PI * 2 * 1.2) + phaseOffset) * 0.06)));
                  if (balloonMultLabel && !balloonMultLabel.destroyed) {
                    balloonMultLabel.x = balloon.x;
                    balloonMultLabel.y = balloon.y + 2;
                    balloonMultLabel.setAlpha(balloon.alpha);
                  }
    
                  const reachedTarget = t >= impactProgress ||
                    Phaser.Math.Distance.Between(balloon.x, balloon.y, targetCenter.x, targetCenter.y) <= 10;
                  if (shouldUsePopFlight() && !balloon._bonusBalloonPopTriggered && reachedTarget) {
                    balloon._bonusBalloonPopTriggered = true;
                    balloon.setPosition(targetCenter.x, targetCenter.y);
                    if (balloonMultLabel && !balloonMultLabel.destroyed) {
                      balloonMultLabel.setPosition(targetCenter.x, targetCenter.y + 2);
                    }
    
                    const popX = targetCenter.x;
                    const popY = targetCenter.y;
                    const flash = this.add.circle(popX, popY, 12, 0xFFF3B0, 0.88)
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
                    this.createBonusEndLandingSplash(popX, popY, {
                      isMultiplier: true,
                      intensity: "medium"
                    });
                    if (!visualOnly) {
                      this.playBonusEndLandingCoinBurst(
                        popX,
                        popY + 6,
                        resolveBalloonEventCoinValueTbm(event),
                        { depth: DEPTH_HERO + 15 }
                      );
                    }
                    this.playSfx?.("wins_highlight", { volume: 0.22 });
    
                    if (!visualOnly && Number.isFinite(targetReel) && Number.isFinite(targetRow)) {
                      const hitColor = resolveBalloonHitColor(event);
                      playBalloonTargetBlink(targetCenter.x, targetCenter.y, hitColor);
                      const upgradedValueTbm = resolveBalloonEventValueTbm(event);
                      const targetKey = getLabelKey(targetReel, targetRow);
                      const valueDisplay = ensureValueLabel(
                        targetReel,
                        targetRow,
                        targetCenter.x,
                        targetCenter.y,
                        upgradedValueTbm
                      );
                      updateMergedAreaValue(event);
                      latestPoppedTargets.set(targetKey, {
                        reel: targetReel,
                        row: targetRow,
                        centerX: targetCenter.x,
                        centerY: targetCenter.y,
                        valueTbm: upgradedValueTbm
                      });
                      if (valueDisplay) {
                        pulseBonusEndValueDisplay(valueDisplay, 1.18, 130);
                      }
                      const boardLabelTbm = applyBalloonEventToVisibleLabelState(event);
                      if (
                        !balloonMaxWinTriggered &&
                        isMaxWinPayout &&
                        winCapTbm > 0 &&
                        boardLabelTbm >= winCapTbm - 0.0001
                      ) {
                        balloonMaxWinTriggered = true;
                        if (typeof balloonOptions?.onMaxWinTriggered === "function") {
                          balloonOptions.onMaxWinTriggered(event);
                        }
                      }
                      const multLabel = this.add.text(
                        targetCenter.x,
                        targetCenter.y - 30,
                        `x${multiplier}`,
                        {
                          fontSize: "24px",
                          fontFamily: '"Cinzel", "Times New Roman", serif',
                          fontStyle: "bold",
                          color: "#FFD37A",
                          stroke: "#492805",
                          strokeThickness: 5
                        }
                      )
                        .setOrigin(0.5)
                        .setDepth(DEPTH_HERO + 9);
                      this.tweens.add({
                        targets: multLabel,
                        y: multLabel.y - 16,
                        alpha: 0,
                        duration: 420,
                        ease: "Quad.easeOut",
                        onComplete: () => multLabel.destroy()
                      });
                    }
    
                    balloon.destroy();
                    if (balloonMultLabel && !balloonMultLabel.destroyed) {
                      this.tweens.add({
                        targets: balloonMultLabel,
                        y: visualOnly ? balloonMultLabel.y - 24 : balloonMultLabel.y,
                        alpha: 0,
                        scaleX: balloonMultLabel.scaleX * (visualOnly ? 1.15 : 1.12),
                        scaleY: balloonMultLabel.scaleY * (visualOnly ? 1.15 : 1.12),
                        duration: visualOnly ? 190 : 140,
                        ease: "Quad.easeOut",
                        onComplete: () => {
                          if (!balloonMultLabel.destroyed) {
                            balloonMultLabel.destroy();
                          }
                        }
                      });
                    }
                  }
                },
                onComplete: () => {
                  if (balloon && !balloon.destroyed) {
                    if (balloonMultLabel && !balloonMultLabel.destroyed) {
                      this.tweens.add({
                        targets: balloonMultLabel,
                        alpha: 0,
                        scaleX: balloonMultLabel.scaleX * 0.92,
                        scaleY: balloonMultLabel.scaleY * 0.92,
                        duration: 120,
                        ease: "Quad.easeOut",
                        onComplete: () => {
                          if (!balloonMultLabel.destroyed) {
                            balloonMultLabel.destroy();
                          }
                        }
                      });
                    }
                    this.tweens.add({
                      targets: balloon,
                      alpha: 0,
                      duration: 120,
                      ease: "Quad.easeOut",
                      onComplete: () => {
                        if (!balloon.destroyed) {
                          balloon.destroy();
                        }
                        if (balloonMultLabel && !balloonMultLabel.destroyed) {
                          balloonMultLabel.destroy();
                        }
                        resolve();
                      }
                    });
                  } else {
                    if (balloonMultLabel && !balloonMultLabel.destroyed) {
                      balloonMultLabel.destroy();
                    }
                    resolve();
                  }
                }
              });
            });
          });
    
          const balloonMeterState = options?.bonusMysteryFeature && typeof options.bonusMysteryFeature === "object"
            ? options.bonusMysteryFeature
            : this.bonusMysteryMeterState;
          const shouldSpendBalloonMeter = baseEvents.length > 0 && balloonOptions?.spendMeter !== false;
          const balloonMeterMax = Math.max(
            1,
            Math.floor(Number(balloonMeterState?.max ?? this.bonusMysteryMeterState?.max ?? 3) || 3)
          );
          let remainingBalloonMeter = Math.max(
            0,
            Math.min(
              balloonMeterMax,
              Math.floor(Number(balloonMeterState?.collected ?? this.bonusMysteryMeterState?.collected ?? 0) || 0)
            )
          );
          if (shouldSpendBalloonMeter && remainingBalloonMeter > 0) {
            this.updateBonusMysteryMeter({
              collected: remainingBalloonMeter,
              max: balloonMeterMax
            }, {
              isBonus: true,
              pulse: false
            });
          }
          const spendBalloonMeterCharge = () => {
            if (shouldSpendBalloonMeter !== true) return;
            if (remainingBalloonMeter <= 0) return;
            remainingBalloonMeter = Math.max(0, remainingBalloonMeter - 1);
            this.updateBonusMysteryMeter({
              collected: remainingBalloonMeter,
              max: balloonMeterMax
            }, {
              isBonus: true,
              pulse: true
            });
            this.playBonusMysteryMeterSpendFx({
              depleted: remainingBalloonMeter <= 0
            });
          };
          await Promise.all(events.map((event, index) =>
            spawnBalloonFx(event, index, {
              onLaunch: spendBalloonMeterCharge
            })
          ));
          if (shouldSpendBalloonMeter && remainingBalloonMeter > 0) {
            remainingBalloonMeter = 0;
            this.updateBonusMysteryMeter({
              collected: 0,
              max: balloonMeterMax
            }, {
              isBonus: true,
              pulse: true
            });
            this.playBonusMysteryMeterSpendFx({ depleted: true });
          }
          // Ensure each popped target keeps its final upgraded value/color after all balloon FX.
          latestPoppedTargets.forEach((entry) => {
            const finalDisplay = ensureValueLabel(
              entry.reel,
              entry.row,
              entry.centerX,
              entry.centerY,
              entry.valueTbm
            );
            if (finalDisplay) {
              pulseBonusEndValueDisplay(finalDisplay, 1.22, 150);
            }
          });
          await this.waitForPresentation(180, { skippable: true });
          return { maxWinTriggered: balloonMaxWinTriggered };
        };
        const playBonusEndLightningBeeFeature = async (beeFeature = null) => {
          const events = beeFeature?.triggered === true && Array.isArray(beeFeature?.events)
            ? beeFeature.events
            : [];
          if (events.length === 0) {
            return { maxWinTriggered: false };
          }
    
          const beeMeterState = options?.lightningBeeFeature && typeof options.lightningBeeFeature === "object"
            ? options.lightningBeeFeature
            : (this.lightningBeeMeterState || {});
          const beeMeterMax = Math.max(1, Math.floor(Number(beeMeterState?.max ?? 3) || 3));
          let remainingBeeMeter = Math.max(
            0,
            Math.min(beeMeterMax, Math.floor(Number(beeMeterState?.collected ?? events.length) || 0))
          );
          let remainingCollectedBees = Array.isArray(beeMeterState?.collectedBees)
            ? [...beeMeterState.collectedBees]
            : [];
          this.updateLightningBeeMeter({
            ...beeMeterState,
            boardBees: [],
            collected: remainingBeeMeter,
            max: beeMeterMax,
            collectedBees: remainingCollectedBees
          }, {
            isBonus: true,
            pulse: false
          });
    
          const boardLeft = GRID_OFFSET_X;
          const boardTop = GRID_OFFSET_Y;
          const boardWidth = clientConfig.area.width * 70;
          const boardHeight = clientConfig.area.height * 70;
          const boardRight = boardLeft + boardWidth;
          const boardBottom = boardTop + boardHeight;
          let beeMaxWinTriggered = false;
          const boardCellCenters = [];
          for (let cellReel = 0; cellReel < clientConfig.area.width; cellReel += 1) {
            for (let cellRow = 0; cellRow < clientConfig.area.height; cellRow += 1) {
              const center = this.getGridCellCenter(cellReel, cellRow);
              boardCellCenters.push({
                key: `${cellReel},${cellRow}`,
                x: center.x,
                y: center.y
              });
            }
          }
          const beeEndSceneCruisePixelsPerMs = 0.12;
          const beeEndSceneRoutePointSpacing = 260;
    
          const sampleBeeRoutePoint = (route, progress) => {
            if (!Array.isArray(route) || route.length === 0) {
              return { x: boardLeft + boardWidth * 0.5, y: boardTop + boardHeight * 0.5 };
            }
            if (route.length === 1) return route[0];
            const scaledProgress = Phaser.Math.Clamp(Number(progress) || 0, 0, 1) * (route.length - 1);
            const pointIndex = Math.min(route.length - 2, Math.floor(scaledProgress));
            const localProgress = Phaser.Math.SmoothStep(scaledProgress - pointIndex, 0, 1);
            const from = route[pointIndex];
            const to = route[pointIndex + 1];
            return {
              x: Phaser.Math.Linear(from.x, to.x, localProgress),
              y: Phaser.Math.Linear(from.y, to.y, localProgress)
            };
          };
    
          const buildBeeEndSceneRoamRoute = ({ startX, startY, target, flightDuration, pixelsPerMs = beeEndSceneCruisePixelsPerMs }) => {
            const route = [{ x: startX, y: startY }];
            const usedKeys = new Set();
            let previousPoint = route[0];
            const directDistance = Phaser.Math.Distance.Between(startX, startY, target.x, target.y);
            const cruiseDistance = Math.max(0, flightDuration * pixelsPerMs);
            const desiredRouteDistance = Math.max(directDistance * 1.12, cruiseDistance);
            const desiredRoamDistance = Math.max(0, desiredRouteDistance - directDistance);
            const desiredRoamPoints = Phaser.Math.Clamp(
              Math.max(1, Math.round(desiredRoamDistance / beeEndSceneRoutePointSpacing)),
              1,
              48
            );
            const distanceGateScale = Phaser.Math.Clamp(desiredRouteDistance / 1400, 0.38, 1);
            const idealSegmentDistance = Phaser.Math.Clamp(
              desiredRouteDistance / Math.max(1, desiredRoamPoints + 1),
              90,
              310
            );
            for (let pointIndex = 0; pointIndex < desiredRoamPoints; pointIndex += 1) {
              const targetDistanceFloor = (pointIndex < desiredRoamPoints - 1 ? 130 : 80) * distanceGateScale;
              const previousDistanceFloor = (pointIndex === 0 ? 120 : 150) * distanceGateScale;
              let candidates = boardCellCenters.filter((cell) =>
                !usedKeys.has(cell.key) &&
                Phaser.Math.Distance.Between(cell.x, cell.y, target.x, target.y) >= targetDistanceFloor &&
                Phaser.Math.Distance.Between(cell.x, cell.y, previousPoint.x, previousPoint.y) >= previousDistanceFloor
              );
              if (candidates.length === 0 && usedKeys.size > 0) {
                usedKeys.clear();
                candidates = boardCellCenters.filter((cell) =>
                  Phaser.Math.Distance.Between(cell.x, cell.y, target.x, target.y) >= targetDistanceFloor &&
                  Phaser.Math.Distance.Between(cell.x, cell.y, previousPoint.x, previousPoint.y) >= previousDistanceFloor
                );
              }
              const fallbackCandidates = candidates.length > 0
                ? candidates
                : boardCellCenters.filter((cell) =>
                    !usedKeys.has(cell.key) &&
                    Phaser.Math.Distance.Between(cell.x, cell.y, target.x, target.y) >= 60
                  );
              const availableCandidates = fallbackCandidates.length > 0
                ? fallbackCandidates
                : boardCellCenters.filter((cell) => !usedKeys.has(cell.key));
              if (availableCandidates.length === 0) break;
    
              const scoredCandidates = availableCandidates
                .map((cell) => {
                  const previousDistance = Phaser.Math.Distance.Between(cell.x, cell.y, previousPoint.x, previousPoint.y);
                  const targetDistance = Phaser.Math.Distance.Between(cell.x, cell.y, target.x, target.y);
                  const edgePull = Math.max(
                    Math.abs(cell.x - (boardLeft + boardWidth * 0.5)),
                    Math.abs(cell.y - (boardTop + boardHeight * 0.5))
                  );
                  return {
                    cell,
                    score:
                      -Math.abs(previousDistance - idealSegmentDistance) * 0.9 +
                      targetDistance * 0.2 +
                      edgePull * 0.12 +
                      Math.random() * 150
                  };
                })
                .sort((a, b) => b.score - a.score);
              const pickPoolSize = Math.min(5, scoredCandidates.length);
              const pickedCell = scoredCandidates[Phaser.Math.Between(0, pickPoolSize - 1)]?.cell;
              if (!pickedCell) break;
    
              usedKeys.add(pickedCell.key);
              const point = {
                x: Phaser.Math.Clamp(pickedCell.x + Phaser.Math.Between(-14, 14), boardLeft + 24, boardRight - 24),
                y: Phaser.Math.Clamp(pickedCell.y + Phaser.Math.Between(-14, 14), boardTop + 28, boardBottom - 28)
              };
              route.push(point);
              previousPoint = point;
            }
            if (route.length < 2) {
              route.push({
                x: Phaser.Math.Between(boardLeft + 30, boardRight - 30),
                y: Phaser.Math.Between(boardTop + 36, boardBottom - 36)
              });
            }
            return route;
          };
    
          const spendBeeCharge = (event = null) => {
            if (remainingBeeMeter <= 0) return;
            remainingBeeMeter = Math.max(0, remainingBeeMeter - 1);
            const eventBeeId = Math.floor(Number(event?.beeId ?? event?.id));
            if (Number.isFinite(eventBeeId)) {
              const removeIndex = remainingCollectedBees.findIndex((bee) =>
                Math.floor(Number(bee?.beeId ?? bee?.id)) === eventBeeId
              );
              if (removeIndex >= 0) {
                remainingCollectedBees.splice(removeIndex, 1);
              } else {
                remainingCollectedBees = remainingCollectedBees.slice(1);
              }
            } else {
              remainingCollectedBees = remainingCollectedBees.slice(1);
            }
            this.updateLightningBeeMeter({
              ...beeMeterState,
              boardBees: [],
              collected: remainingBeeMeter,
              max: beeMeterMax,
              collectedBees: remainingCollectedBees
            }, {
              isBonus: true,
              pulse: true
            });
            this.playLightningBeeMeterSpendFx({ depleted: remainingBeeMeter <= 0 });
          };
    
          const playBeeEvent = (event, index) => new Promise((resolve) => {
            const reel = Math.floor(Number(event?.reel));
            const row = Math.floor(Number(event?.row));
            const target = Number.isFinite(reel) && Number.isFinite(row)
              ? this.getGridCellCenter(reel, row)
              : {
                  x: Phaser.Math.Between(boardLeft + 40, boardRight - 40),
                  y: Phaser.Math.Between(boardTop + 70, boardBottom - 70)
                };
            const startTarget = this.getLightningBeeMeterTarget();
            const startX = Number(this.lightningBeeMeterIcon?.x ?? startTarget.x);
            const startY = Number(this.lightningBeeMeterIcon?.y ?? startTarget.y);
            const flightDuration = Phaser.Math.Clamp(Math.floor(Number(event?.flightDurationMs) || 4400), 1600, 180000);
            const multiplier = Math.max(1, Math.floor(Number(event?.baseMultiplier ?? event?.multiplier ?? 1) || 1));
            const finalMultiplier = Math.max(1, Math.floor(Number(event?.multiplier ?? multiplier) || multiplier));
            const startDelay = Math.min(index * 90, 180);
            const phase = Phaser.Math.FloatBetween(0, Math.PI * 2);
            const roamRoute = buildBeeEndSceneRoamRoute({
              startX,
              startY,
              target,
              flightDuration,
              pixelsPerMs: beeEndSceneCruisePixelsPerMs
            });
            const visualFlightDuration = flightDuration;
            const approachDurationMs = Phaser.Math.Clamp(Math.floor(visualFlightDuration * 0.12), 1100, 3000);
            const approachStartT = Phaser.Math.Clamp(1 - approachDurationMs / visualFlightDuration, 0.7, 0.94);
    
            this.time.delayedCall(startDelay, () => {
              spendBeeCharge(event);
              const bee = this.add.image(startX, startY, String(LIGHTNING_BEE_FEATURE_SYMBOL_ID))
                .setOrigin(0.5)
                .setScale(getSymbolScale(LIGHTNING_BEE_FEATURE_SYMBOL_ID) * 1.25)
                .setDepth(DEPTH_HERO + 14)
                .setAlpha(0.98);
              const label = this.add.text(startX, startY + 20, `x${multiplier}`, {
                fontSize: "24px",
                fontFamily: '"Cinzel", "Times New Roman", serif',
                fontStyle: "bold",
                color: "#FFF8D6",
                stroke: "#2A1400",
                strokeThickness: 6
              })
                .setOrigin(0.5)
                .setDepth(DEPTH_HERO + 15);
    
              const setBeeMultiplierLabel = (value, { playSound = true } = {}) => {
                if (!label || label.destroyed) return;
                label.setText(`x${Math.max(1, Math.floor(Number(value) || 1))}`);
                this.tweens.add({
                  targets: label,
                  scaleX: 1.24,
                  scaleY: 1.24,
                  duration: 120,
                  yoyo: true,
                  ease: "Back.easeOut"
                });
                if (playSound) {
                  this.playSfx?.("lightning_at_lvl_up", { volume: 0.18, rate: 1.18 });
                }
              };
    
              (Array.isArray(event?.upgradeTimeline) ? event.upgradeTimeline : []).forEach((upgrade) => {
                const atMs = Math.max(0, Math.floor(Number(upgrade?.atMs) || 0));
                if (atMs <= 0 || atMs >= flightDuration) return;
                const chargeLeadMs = Math.min(650, Math.max(260, atMs));
                const chargeDelayMs = Math.max(0, atMs - chargeLeadMs);
                const hitDelayMs = Math.max(0, atMs);
                this.time.delayedCall(chargeDelayMs, () => {
                  this.playLightningBeeMultiplierChargeFx(bee, {
                    depth: DEPTH_HERO + 17,
                    durationMs: chargeLeadMs,
                    finalMultiplier: upgrade?.multiplier,
                    scale: 1.05
                  });
                });
                this.time.delayedCall(hitDelayMs, () => {
                  this.playLightningBeeChargeHitFeedback(bee, {
                    multiplier: upgrade?.multiplier,
                    depth: DEPTH_HERO + 18
                  });
                  setBeeMultiplierLabel(upgrade?.multiplier, { playSound: false });
                });
              });
    
              this.playSfx?.("lightning_hammer", { volume: 0.18, rate: 1.12 });
              this.tweens.addCounter({
                from: 0,
                to: 1,
                duration: visualFlightDuration,
                ease: "Linear",
                onUpdate: (counter) => {
                  if (!bee || bee.destroyed) return;
                  const t = Phaser.Math.Clamp(Number(counter?.getValue?.() || 0), 0, 1);
                  const approachT = Phaser.Math.Clamp((t - approachStartT) / Math.max(0.001, 1 - approachStartT), 0, 1);
                  const roamT = Phaser.Math.Clamp(t / approachStartT, 0, 1);
                  const roamPoint = sampleBeeRoutePoint(roamRoute, roamT);
                  const roamWiggle = 1 - approachT * 0.72;
                  const elapsedSeconds = (t * visualFlightDuration) / 1000;
                  const roamX = roamPoint.x + Math.sin(elapsedSeconds * Math.PI * 2 * 0.72 + phase) * 28 * roamWiggle;
                  const roamY = roamPoint.y + Math.cos(elapsedSeconds * Math.PI * 2 * 0.56 + phase) * 20 * roamWiggle;
                  const easedApproach = Phaser.Math.SmoothStep(approachT, 0, 1);
                  bee.x = Phaser.Math.Linear(roamX, target.x, easedApproach);
                  bee.y = Phaser.Math.Linear(roamY, target.y, easedApproach) - Math.sin(Math.PI * easedApproach) * 18;
                  bee.angle = Math.sin(elapsedSeconds * Math.PI * 2 * 0.64 + phase) * 8;
                  const now = Number(this.time?.now) || Date.now();
                  if (!bee._lightningBeeTrailNextAt || now >= bee._lightningBeeTrailNextAt) {
                    bee._lightningBeeTrailNextAt = now + 90;
                    this.emitLightningBeeRadianceTrail(bee.x, bee.y + 5, {
                      depth: DEPTH_HERO + 13,
                      count: approachT > 0 ? 3 : 2,
                      spread: approachT > 0 ? 14 : 11,
                      drift: approachT > 0 ? 34 : 26,
                      scale: 1.05
                    });
                  }
                  if (label && !label.destroyed) {
                    label.setPosition(bee.x, bee.y + 20);
                    label.setAlpha(bee.alpha);
                  }
                },
                onComplete: () => {
                  if (bee && !bee.destroyed) {
                    bee.setPosition(target.x, target.y);
                    bee.setAngle(0);
                  }
                  if (label && !label.destroyed) {
                    label.setPosition(target.x, target.y + 20);
                    setBeeMultiplierLabel(finalMultiplier, { playSound: false });
                  }
    
                  const hitColor = 0xFFE86A;
                  const hitRing = this.add.circle(target.x, target.y + 6, 26, hitColor, 0)
                    .setDepth(DEPTH_HERO + 16)
                    .setStrokeStyle(6, hitColor, 0.95)
                    .setBlendMode(Phaser.BlendModes.ADD);
                  const hitCore = this.add.circle(target.x, target.y + 6, 18, 0xFFFFFF, 0.58)
                    .setDepth(DEPTH_HERO + 15)
                    .setBlendMode(Phaser.BlendModes.ADD);
                  this.playMonkeySymbolClearLightningBurst(target.x, target.y, {
                    depth: DEPTH_HERO + 17,
                    radius: 34,
                    boltCount: 5,
                    color: 0xFFE86A,
                    intensityScale: 0.92
                  });
                  this.playSfx?.("lightning_thor_impact", { volume: 0.2, rate: 1.12 });
                  this.tweens.add({
                    targets: hitRing,
                    radius: 62,
                    alpha: 0,
                    duration: 300,
                    ease: "Quad.easeOut",
                    onComplete: () => hitRing.destroy()
                  });
                  this.tweens.add({
                    targets: hitCore,
                    scale: 1.9,
                    alpha: 0,
                    duration: 250,
                    ease: "Quad.easeOut",
                    onComplete: () => hitCore.destroy()
                  });
    
                  const upgradedValueTbm = Number(event?.afterResultValueTbm ?? event?.mergedAreaResultValueTbm ?? 0);
                  const valueDisplay = ensureValueLabel(reel, row, target.x, target.y, upgradedValueTbm);
                  void updateMergedAreaValue(event);
                  if (valueDisplay) {
                    pulseBonusEndValueDisplay(valueDisplay, 1.2, 140);
                  }
                  const boardLabelTbm = applyLightningBeeEventToVisibleLabelState(event);
                  if (
                    !beeMaxWinTriggered &&
                    isMaxWinPayout &&
                    winCapTbm > 0 &&
                    boardLabelTbm >= winCapTbm - 0.0001
                  ) {
                    beeMaxWinTriggered = true;
                  }
    
                  this.tweens.add({
                    targets: [bee, label].filter((targetDisplay) => targetDisplay && !targetDisplay.destroyed),
                    y: "-=38",
                    alpha: 0,
                    duration: 360,
                    ease: "Sine.easeIn",
                    onComplete: () => {
                      if (bee && !bee.destroyed) bee.destroy();
                      if (label && !label.destroyed) label.destroy();
                      resolve();
                    }
                  });
                }
              });
            });
          });
    
          await Promise.all(events.map((event, index) => playBeeEvent(event, index)));
          if (remainingBeeMeter > 0) {
            this.updateLightningBeeMeter({
              ...beeMeterState,
              boardBees: [],
              collected: 0,
              max: beeMeterMax,
              collectedBees: []
            }, {
              isBonus: true,
              pulse: true
            });
            this.playLightningBeeMeterSpendFx({ depleted: true });
          }
          await this.waitForPresentation(180, { skippable: true });
          return { maxWinTriggered: beeMaxWinTriggered };
        };
        const getLandingStartPoint = (landingCenter) => {
          return {
            x: landingCenter.x + Phaser.Math.Between(-45, 45),
            y: -80 - Phaser.Math.Between(0, 140)
          };
        };
        const bonusEndBoardBounds = {
          left: GRID_OFFSET_X,
          right: GRID_OFFSET_X + clientConfig.area.width * 70,
          top: GRID_OFFSET_Y,
          width: clientConfig.area.width * 70
        };
        const bonusEndIncomingColors = [0xFFE86A, 0xC7FF67, 0xB66DFF, 0xFFFFFF];
        const createBonusEndIncomingArrow = (x, y, symbolId = 0) => {
          const startColor = bonusEndIncomingColors[Math.abs(Math.floor(Number(symbolId) || 0)) % bonusEndIncomingColors.length];
          const container = this.add.container(x, y)
            .setDepth(231)
            .setAlpha(0.95);
          const glow = this.add.circle(0, 0, 20, startColor, 0.2)
            .setBlendMode(Phaser.BlendModes.ADD);
          const ring = this.add.circle(0, 0, 17, startColor, 0)
            .setStrokeStyle(3, startColor, 0.62);
          const shaft = this.add.rectangle(0, -8, 7, 24, startColor, 0.82)
            .setOrigin(0.5);
          const head = this.add.triangle(0, 13, 0, 24, -15, -4, 15, -4, startColor, 0.92)
            .setOrigin(0.5);
          container.add([glow, ring, shaft, head]);
    
          let alive = true;
          let colorIndex = bonusEndIncomingColors.indexOf(startColor);
          const createdAtMs = Number(this.time?.now) || Date.now();
          const wind = {
            amplitude: Phaser.Math.FloatBetween(38, 56),
            periodMs: Phaser.Math.Between(1750, 2350),
            phase: Phaser.Math.FloatBetween(0, Math.PI * 2),
            lift: Phaser.Math.Between(34, 46),
            verticalDrift: Phaser.Math.FloatBetween(3, 7),
            lastFruitX: x,
            lastFruitY: y + 42,
            lastProgress: 0,
            displayX: x,
            displayY: y,
            displayAngle: 0,
            displayAlpha: 0.95
          };
          const colorTimer = this.time.addEvent({
            delay: 260,
            loop: true,
            callback: () => {
              if (!alive || container.destroyed) return;
              colorIndex = (colorIndex + 1) % bonusEndIncomingColors.length;
              const color = bonusEndIncomingColors[colorIndex];
              glow.setFillStyle(color, 0.16 + Phaser.Math.FloatBetween(0, 0.08));
              ring.setStrokeStyle(3, color, 0.52 + Phaser.Math.FloatBetween(0, 0.12));
              shaft.setFillStyle(color, 0.78);
              head.setFillStyle(color, 0.9);
            }
          });
    
          this.tweens.add({
            targets: container,
            scaleX: 1.08,
            scaleY: 1.08,
            duration: 520,
            yoyo: true,
            repeat: -1,
            ease: "Sine.easeInOut"
          });
          const idleDriftTimer = this.time.addEvent({
            delay: 60,
            loop: true,
            callback: () => {
              if (!alive || container.destroyed) return;
              applyArrowPosition(wind.lastFruitX, wind.lastFruitY, wind.lastProgress, { idle: true });
            }
          });
    
          const applyArrowPosition = (fruitX, fruitY, progress = 0, { idle = false } = {}) => {
            if (!alive || container.destroyed) return;
            const t = Phaser.Math.SmoothStep(Phaser.Math.Clamp(Number(progress) || 0, 0, 1), 0, 1);
            const nowMs = Number(this.time?.now) || Date.now();
            const cycle = ((nowMs - createdAtMs) / wind.periodMs) * Math.PI * 2 + wind.phase;
            const swoosh = Math.sin(cycle);
            const lingeredSwoosh = Math.sign(swoosh) * Math.pow(Math.abs(swoosh), 0.62);
            const slowBreath = Math.sin(cycle * 0.5 + wind.phase * 0.4);
            const sway = lingeredSwoosh * wind.amplitude;
            const drag = Math.sin(t * Math.PI) * (idle ? 5 : 9);
            const targetX = Phaser.Math.Clamp(
              fruitX + sway,
              bonusEndBoardBounds.left + 14,
              bonusEndBoardBounds.right - 14
            );
            const targetY = Math.max(bonusEndBoardBounds.top - 18, fruitY - wind.lift - drag + slowBreath * wind.verticalDrift);
            const targetAngle = Phaser.Math.Clamp(lingeredSwoosh * 15, -15, 15);
            const targetAlpha = Phaser.Math.Clamp(0.96 - Math.max(0, t - 0.82) * 2.2, 0.36, 0.96);
            const easeAmount = idle ? 0.1 : 0.18;
            wind.displayX = Phaser.Math.Linear(wind.displayX, targetX, easeAmount);
            wind.displayY = Phaser.Math.Linear(wind.displayY, targetY, easeAmount);
            wind.displayAngle = Phaser.Math.Linear(wind.displayAngle, targetAngle, easeAmount * 0.82);
            wind.displayAlpha = Phaser.Math.Linear(wind.displayAlpha, targetAlpha, easeAmount);
            container.setPosition(wind.displayX, wind.displayY);
            container.setAngle(wind.displayAngle);
            container.setAlpha(wind.displayAlpha);
          };
    
          return {
            update: (fruitX, fruitY, progress = 0) => {
              if (!alive || container.destroyed) return;
              wind.lastFruitX = Number.isFinite(Number(fruitX)) ? Number(fruitX) : wind.lastFruitX;
              wind.lastFruitY = Number.isFinite(Number(fruitY)) ? Number(fruitY) : wind.lastFruitY;
              wind.lastProgress = Phaser.Math.Clamp(Number(progress) || 0, 0, 1);
              applyArrowPosition(wind.lastFruitX, wind.lastFruitY, wind.lastProgress);
            },
            finish: () => {
              if (!alive || container.destroyed) return;
              alive = false;
              colorTimer.remove(false);
              idleDriftTimer.remove(false);
              this.tweens.killTweensOf(container);
              this.tweens.add({
                targets: container,
                y: container.y + 16,
                alpha: 0,
                scaleX: 0.72,
                scaleY: 0.72,
                duration: 140,
                ease: "Quad.easeOut",
                onComplete: () => {
                  if (!container.destroyed) {
                    container.destroy();
                  }
                }
              });
            }
          };
        };
        const createBonusEndFruitRemainingIndicator = (totalCount = 0) => {
          const total = Math.max(0, Math.floor(Number(totalCount) || 0));
          if (total <= 0) return null;
    
          const x = bonusEndBoardBounds.left + bonusEndBoardBounds.width - 58;
          const y = bonusEndBoardBounds.top - 36;
          const glow = this.add.circle(0, 0, 34, 0xFFE86A, 0.22)
            .setBlendMode(Phaser.BlendModes.ADD);
          const bg = this.add.rectangle(0, 0, 102, 44, 0x160F08, 0.84)
            .setStrokeStyle(2, 0xFFE86A, 0.78);
          const arrowShaft = this.add.rectangle(-30, 8, 7, 22, 0xC7FF67, 0.92)
            .setOrigin(0.5);
          const arrowHead = this.add.triangle(-30, -9, 0, -20, -13, 4, 13, 4, 0xC7FF67, 0.98)
            .setOrigin(0.5);
          const text = this.add.text(12, 1, String(total), {
            fontSize: "25px",
            fontFamily: '"Cinzel", "Times New Roman", serif',
            fontStyle: "bold",
            color: "#FFF6C6",
            stroke: "#251204",
            strokeThickness: 5
          }).setOrigin(0.5);
          const container = this.add.container(x, y, [glow, bg, arrowShaft, arrowHead, text])
            .setDepth(230)
            .setAlpha(0);
          const state = { remaining: total, done: false };
    
          this.tweens.add({
            targets: container,
            alpha: 1,
            y: y + 6,
            duration: 220,
            ease: "Back.easeOut"
          });
          this.tweens.add({
            targets: [arrowShaft, arrowHead],
            x: -30 + Phaser.Math.Between(-8, 8),
            duration: 120,
            yoyo: true,
            repeat: -1,
            ease: "Sine.easeInOut",
            onRepeat: () => {
              const color = bonusEndIncomingColors[Phaser.Math.Between(0, bonusEndIncomingColors.length - 1)];
              arrowShaft.setFillStyle(color, 0.9);
              arrowHead.setFillStyle(color, 0.98);
              glow.setFillStyle(color, 0.2);
            }
          });
    
          const pulse = () => {
            if (state.done || container.destroyed) return;
            this.tweens.add({
              targets: container,
              scaleX: 1.09,
              scaleY: 1.09,
              duration: 90,
              yoyo: true,
              ease: "Back.easeOut"
            });
          };
    
          return {
            setRemaining: (nextRemaining = 0, { shouldPulse = true } = {}) => {
              if (state.done || container.destroyed) return;
              state.remaining = Math.max(0, Math.floor(Number(nextRemaining) || 0));
              text.setText(String(state.remaining));
              if (shouldPulse) pulse();
              if (state.remaining <= 0) {
                state.done = true;
                this.tweens.killTweensOf([container, arrowShaft, arrowHead]);
                this.tweens.add({
                  targets: container,
                  alpha: 0,
                  y: container.y - 14,
                  duration: 210,
                  ease: "Quad.easeOut",
                  onComplete: () => {
                    if (!container.destroyed) {
                      container.destroy();
                    }
                  }
                });
              }
            },
            destroy: () => {
              if (container.destroyed) return;
              state.done = true;
              this.tweens.killTweensOf([container, arrowShaft, arrowHead]);
              container.destroy();
            }
          };
        };
        const resolvedPositionTotals = positionTotals.length > 0
          ? positionTotals
          : (() => {
              const fromLandings = Array.from(landings.reduce((acc, landing) => {
                const key = getLabelKey(Number(landing?.reel || 0), Number(landing?.row || 0));
                acc.set(key, {
                  reel: Number(landing?.reel || 0),
                  row: Number(landing?.row || 0),
                  resultValueTbm: Number(landing?.resultValueTbm || 0),
                  resultValueTwa: Number(landing?.resultValueTwa || 0)
                });
                return acc;
              }, new Map()).values()).filter((entry) => Number(entry.resultValueTbm || 0) > 0);
              if (fromLandings.length > 0) {
                return fromLandings;
              }
    
              const immediateMap = this.immediateLowPositionTbmByKey instanceof Map
                ? this.immediateLowPositionTbmByKey
                : new Map();
              const fromImmediateBackplates = [];
              immediateMap.forEach((valueTbm, key) => {
                const [rawReel, rawRow] = String(key).split(",");
                const reel = Number(rawReel);
                const row = Number(rawRow);
                const resolvedTbm = Number(valueTbm || 0);
                if (!Number.isFinite(reel) || !Number.isFinite(row) || !(resolvedTbm > 0)) {
                  return;
                }
                fromImmediateBackplates.push({
                  reel,
                  row,
                  resultValueTbm: resolvedTbm,
                  resultValueTwa: resolvedTbm
                });
              });
              return fromImmediateBackplates;
            })();
        const resolvedPositionTotalByKey = new Map();
        resolvedPositionTotals.forEach((entry) => {
          const reel = Math.floor(Number(entry?.reel));
          const row = Math.floor(Number(entry?.row));
          if (!Number.isFinite(reel) || !Number.isFinite(row)) return;
          resolvedPositionTotalByKey.set(getLabelKey(reel, row), entry);
        });
        const mergedAreaCollectionCellKeys = new Set();
        const mergedAreaCollectEntries = mergedAreas
          .map((area) => {
            const areaId = String(area?.id || "");
            const positions = Array.isArray(area?.positions)
              ? area.positions
                .map((position) => ({
                  reel: Math.floor(Number(position?.reel)),
                  row: Math.floor(Number(position?.row))
                }))
                .filter((position) => Number.isFinite(position.reel) && Number.isFinite(position.row))
              : [];
            if (!areaId || positions.length === 0) return null;
    
            let summedTbm = 0;
            let summedTwa = 0;
            positions.forEach((position) => {
              const key = getLabelKey(position.reel, position.row);
              mergedAreaCollectionCellKeys.add(key);
              const positionTotal = resolvedPositionTotalByKey.get(key);
              summedTbm += Number(positionTotal?.resultValueTbm || 0);
              summedTwa += Number(positionTotal?.resultValueTwa || 0);
            });
    
            const fallbackTbm = Number(area?.resultValueTbm ?? area?.totalTbm ?? 0);
            const fallbackTwa = Number(area?.resultValueTwa ?? area?.totalTwa ?? fallbackTbm);
            const resultValueTbm = Number((summedTbm > 0 ? summedTbm : fallbackTbm).toFixed(4));
            const resultValueTwa = Number((summedTwa > 0 ? summedTwa : fallbackTwa).toFixed(4));
            if (!(resultValueTbm > 0) && !(resultValueTwa > 0)) return null;
    
            return {
              id: areaId,
              positions,
              resultValueTbm,
              resultValueTwa
            };
          })
          .filter(Boolean);
        const buildPhaseStartDelays = (phaseLandings, phaseDurationMs) => {
          const count = Array.isArray(phaseLandings) ? phaseLandings.length : 0;
          if (count <= 0) return [];
          if (count === 1) return [0];
    
          const maxStartDelay = Math.max(0, Math.floor(Number(phaseDurationMs || 1000)) - 420);
          if (count === 2) return [0, maxStartDelay];
    
          const delayPool = [0, maxStartDelay];
          for (let index = 0; index < count - 2; index++) {
            delayPool.push(Phaser.Math.Between(0, maxStartDelay));
          }
    
          return delayPool.sort((a, b) => a - b);
        };
        const buildBonusEndLandingSetup = (landing) => {
          const symbolId = Number(landing?.symbol);
          const reel = Number(landing?.reel || 0);
          const row = Number(landing?.row || 0);
          const landingCenter = this.getGridCellCenter(reel, row);
          const startPoint = getLandingStartPoint(landingCenter);
          const incomingArrow = createBonusEndIncomingArrow(
            Phaser.Math.Clamp(startPoint.x, bonusEndBoardBounds.left + 20, bonusEndBoardBounds.right - 20),
            bonusEndBoardBounds.top - 13 + Phaser.Math.Between(-4, 5),
            symbolId
          );
          incomingArrow?.update?.(startPoint.x, Math.min(startPoint.y, bonusEndBoardBounds.top + 18), 0);
          return { startPoint, incomingArrow };
        };
        const animateLanding = (
          landing,
          startDelay,
          splashIntensity = "medium",
          landingSetup = null
        ) => new Promise((resolve) => {
          const symbolId = Number(landing?.symbol);
          const reel = Number(landing?.reel || 0);
          const row = Number(landing?.row || 0);
          const isMultiplier = landing?.isMultiplier === true;
          const landingCenter = this.getGridCellCenter(reel, row);
          const targetScale = Math.max(0.38, getSymbolScale(symbolId) * 0.88);
          const hasMergedArea = Boolean(landing?.mergedAreaId);
    
          this.time.delayedCall(startDelay, () => {
            const startPoint = landingSetup?.startPoint || getLandingStartPoint(landingCenter);
            const incomingArrow = landingSetup?.incomingArrow || createBonusEndIncomingArrow(
              Phaser.Math.Clamp(startPoint.x, bonusEndBoardBounds.left + 20, bonusEndBoardBounds.right - 20),
              bonusEndBoardBounds.top - 13,
              symbolId
            );
            const sprite = this.add.image(startPoint.x, startPoint.y, this.getBonusAwareSymbolTextureKey(symbolId))
              .setOrigin(0.5)
              .setScale(targetScale * Phaser.Math.FloatBetween(0.72, 0.84))
              .setDepth(DEPTH_HERO + 6)
              .setAngle(Phaser.Math.Between(-28, 28));
            sprite.symbolKey = symbolId;
            incomingArrow?.update?.(sprite.x, sprite.y, 0);
    
            const landingTargetX = landingCenter.x + Phaser.Math.Between(-5, 5);
            const landingTargetY = landingCenter.y + Phaser.Math.Between(-3, 3);
            const landingDuration = Math.round((220 + Phaser.Math.Between(0, 120)) * COLLECT_FALL_SPEED_MULTIPLIER);
            const showLandingImpact = (coinValueTbm = 0) => {
              this.createCollectFallImpact(landingCenter.x, landingCenter.y, {
                symbolId,
                radius: isMultiplier ? 30 : 24,
                depth: DEPTH_HERO + 4,
                durationMs: COLLECT_FALL_IMPACT_DURATION_MS
              });
              this.createBonusEndLandingSplash(landingCenter.x, landingCenter.y, {
                isMultiplier,
                intensity: splashIntensity || landing?.splashIntensity || "medium"
              });
              this.playBonusEndLandingCoinBurst(landingCenter.x, landingCenter.y + 6, coinValueTbm);
            };
            this.tweens.add({
              targets: sprite,
              x: landingTargetX,
              y: landingTargetY,
              scale: targetScale,
              angle: Phaser.Math.Between(-8, 8),
              duration: landingDuration,
              ease: "Quad.easeIn",
              onUpdate: (tween) => {
                incomingArrow?.update?.(sprite.x, sprite.y, Number(tween?.progress || 0));
              },
              onComplete: () => {
                incomingArrow?.finish?.();
                const positionKey = getLabelKey(reel, row);
                const previousPositionValueTbm = Number(
                  valueDisplays.get(positionKey)?.valueTbm ??
                  visiblePositionValueTbmByKey.get(positionKey) ??
                  0
                );
                const previousMergedAreaValueTbm = hasMergedArea
                  ? Number(mergedAreaValueMap.get(String(landing?.mergedAreaId || "")) || 0)
                  : 0;
                const landingCoinValueTbm = resolveBonusEndLandingCoinValueTbm(landing, {
                  previousPositionValueTbm,
                  previousMergedAreaValueTbm
                });
                if (!hasMergedArea) {
                  showLandingImpact(landingCoinValueTbm);
                }
    
                const valueDisplay = ensureValueLabel(reel, row, landingCenter.x, landingCenter.y, Number(landing?.resultValueTbm || 0));
                if (valueDisplay) {
                  pulseBonusEndValueDisplay(valueDisplay, 1.12, 90);
                }
    
                if (isMultiplier) {
                  const emptyUpgradeAwardTbm = Number(landing?.emptyUpgradeAwardTbm || 0);
                  const multiplierText = emptyUpgradeAwardTbm > 0
                    ? `+${Number(emptyUpgradeAwardTbm.toFixed(2)).toString().replace(/\.00$/, "")}`
                    : `x${Math.max(2, Math.floor(Number(landing?.multiplierApplied || 2) || 2))}`;
                  const multiplierLabel = this.add.text(
                    landingCenter.x,
                    landingCenter.y - 28,
                    multiplierText,
                    {
                      fontSize: "22px",
                      fontFamily: '"Cinzel", "Times New Roman", serif',
                      fontStyle: "bold",
                      color: "#9CFFC3",
                      stroke: "#12351F",
                      strokeThickness: 5
                    }
                  )
                    .setOrigin(0.5)
                    .setDepth(DEPTH_HERO + 5);
                  this.tweens.add({
                    targets: multiplierLabel,
                    y: multiplierLabel.y - 18,
                    alpha: 0,
                    duration: 360,
                    ease: "Quad.easeOut",
                    onComplete: () => multiplierLabel.destroy()
                  });
                }
    
                this.tweens.add({
                  targets: sprite,
                  alpha: 0,
                  scale: targetScale * 1.08,
                  angle: sprite.angle + Phaser.Math.Between(24, 48),
                  duration: 160,
                  ease: "Quad.easeOut",
                  onComplete: () => {
                    if (!sprite.destroyed) {
                      sprite.destroy();
                    }
                    const finishLanding = () => {
                      if (hasMergedArea) {
                        showLandingImpact(landingCoinValueTbm);
                      }
                      remainingBonusEndLandings = Math.max(0, remainingBonusEndLandings - 1);
                      fruitRemainingIndicator?.setRemaining?.(remainingBonusEndLandings, { shouldPulse: true });
                      resolve();
                    };
    
                    if (hasMergedArea) {
                      updateMergedAreaValue(landing).then(finishLanding);
                      return;
                    }
    
                    finishLanding();
                  }
                });
              }
            });
          });
        });
        const animateMaxWinSplashLanding = (
          entry,
          startDelay = 0
        ) => new Promise((resolve) => {
          const landing = entry?.landing || entry;
          const landingSetup = entry?.setup || null;
          const symbolId = Number(landing?.symbol);
          const reel = Number(landing?.reel || 0);
          const row = Number(landing?.row || 0);
          const isMultiplier = landing?.isMultiplier === true;
          const landingCenter = this.getGridCellCenter(reel, row);
          const targetScale = Math.max(0.34, getSymbolScale(symbolId) * 0.8);
    
          this.time.delayedCall(Math.max(0, Math.floor(Number(startDelay) || 0)), () => {
            const startPoint = landingSetup?.startPoint || getLandingStartPoint(landingCenter);
            const incomingArrow = landingSetup?.incomingArrow || createBonusEndIncomingArrow(
              Phaser.Math.Clamp(startPoint.x, bonusEndBoardBounds.left + 20, bonusEndBoardBounds.right - 20),
              bonusEndBoardBounds.top - 13,
              symbolId
            );
            const sprite = this.add.image(startPoint.x, startPoint.y, this.getBonusAwareSymbolTextureKey(symbolId))
              .setOrigin(0.5)
              .setScale(targetScale * Phaser.Math.FloatBetween(0.66, 0.78))
              .setDepth(DEPTH_HERO + 7)
              .setAngle(Phaser.Math.Between(-34, 34));
            sprite.symbolKey = symbolId;
            incomingArrow?.update?.(sprite.x, sprite.y, 0);
    
            const landingDuration = Phaser.Math.Between(160, 260);
            this.tweens.add({
              targets: sprite,
              x: landingCenter.x + Phaser.Math.Between(-7, 7),
              y: landingCenter.y + Phaser.Math.Between(-5, 5),
              scale: targetScale,
              angle: Phaser.Math.Between(-12, 12),
              duration: landingDuration,
              ease: "Cubic.easeIn",
              onUpdate: (tween) => {
                incomingArrow?.update?.(sprite.x, sprite.y, Number(tween?.progress || 0));
              },
              onComplete: () => {
                incomingArrow?.finish?.();
                const positionKey = getLabelKey(reel, row);
                const landingCoinValueTbm = resolveBonusEndLandingCoinValueTbm(landing, {
                  previousPositionValueTbm: Number(
                    valueDisplays.get(positionKey)?.valueTbm ??
                    visiblePositionValueTbmByKey.get(positionKey) ??
                    0
                  ),
                  previousMergedAreaValueTbm: Number(mergedAreaValueMap.get(String(landing?.mergedAreaId || "")) || 0)
                });
                this.createCollectFallImpact(landingCenter.x, landingCenter.y, {
                  symbolId,
                  radius: isMultiplier ? 32 : 26,
                  depth: DEPTH_HERO + 4,
                  durationMs: 420
                });
                this.createBonusEndLandingSplash(landingCenter.x, landingCenter.y, {
                  isMultiplier,
                  intensity: "heavy"
                });
                this.playBonusEndLandingCoinBurst(landingCenter.x, landingCenter.y + 6, landingCoinValueTbm, {
                  depth: DEPTH_HERO + 15
                });
                this.tweens.add({
                  targets: sprite,
                  alpha: 0,
                  scale: targetScale * 1.12,
                  angle: sprite.angle + Phaser.Math.Between(28, 58),
                  duration: 130,
                  ease: "Quad.easeOut",
                  onComplete: () => {
                    if (!sprite.destroyed) {
                      sprite.destroy();
                    }
                    remainingBonusEndLandings = Math.max(0, remainingBonusEndLandings - 1);
                    fruitRemainingIndicator?.setRemaining?.(remainingBonusEndLandings, { shouldPulse: true });
                    resolve();
                  }
                });
              }
            });
          });
        });
        const waitForSceneTime = (durationMs = 0) => new Promise((resolve) => {
          if (!(Number(durationMs) > 0)) {
            resolve();
            return;
          }
          this.time.delayedCall(Math.floor(Number(durationMs)), resolve);
        });
        const hasLoadedAudio = (soundKey) => {
          if (!soundKey) return false;
          const audioCache = this.cache?.audio;
          if (audioCache && typeof audioCache.exists === "function") {
            return audioCache.exists(soundKey);
          }
          return true;
        };
        const playBonusEndBmCollectSound = ({ volume = 0.36, rateMin = 0.94, rateMax = 1.1 } = {}) => {
          const coinSounds = ["coin1", "coin2", "coin3", "coin4", "coin5", "coin6"].filter(hasLoadedAudio);
          const fallbackSounds = ["orb_collect", "wins_highlight", "wheel_diamond_appear"].filter(hasLoadedAudio);
          const soundPool = coinSounds.length > 0 ? coinSounds : fallbackSounds;
          if (soundPool.length === 0) return;
          const soundKey = soundPool[Math.floor(Math.random() * soundPool.length)];
          this.playSfx(soundKey, {
            volume,
            rate: Phaser.Math.FloatBetween(rateMin, rateMax)
          });
        };
        const playBonusEndBmCollectSoundBurst = (count = 1, options = {}) => {
          const resolvedCount = Math.max(1, Math.min(5, Math.floor(Number(count) || 1)));
          const staggerMs = Math.max(0, Math.floor(Number(options.staggerMs ?? 55)));
          for (let index = 0; index < resolvedCount; index++) {
            const play = () => playBonusEndBmCollectSound({
              volume: Math.max(0.12, Number(options.volume ?? 0.34) - index * 0.025),
              rateMin: Number(options.rateMin ?? 0.94) + index * 0.012,
              rateMax: Number(options.rateMax ?? 1.12) + index * 0.014
            });
            if (index === 0 || staggerMs <= 0) {
              play();
            } else {
              this.time.delayedCall(index * staggerMs, play);
            }
          }
        };
        let bonusEndBananaFountainBurstIndex = 0;
        let bonusEndBananaFountainCollectedTwa = 0;
        const getBonusEndBananaFountainCount = (rawValueTbm = 0) => {
          const valueTbm = Math.max(0, Number(rawValueTbm) || 0);
          if (valueTbm >= 100) return 26;
          if (valueTbm >= 60) return 21;
          if (valueTbm >= 30) return 17;
          if (valueTbm >= 15) return 13;
          if (valueTbm >= 5) return 9;
          if (valueTbm >= 3) return 7;
          if (valueTbm >= 1) return 5;
          return 3;
        };
        const playBonusEndBananaFountain = (rawValueTbm = 0, {
          sourceX = null,
          progressRatio = null,
          superBurst = false
        } = {}) => {
          if (!this.countUpText || this.countUpText.destroyed) return;
    
          const valueTbm = Math.max(0, Number(rawValueTbm) || 0);
          const burstIndex = bonusEndBananaFountainBurstIndex++;
          const baseCount = getBonusEndBananaFountainCount(valueTbm);
          const fallbackProgressRatio = finalTwa > 0
            ? Phaser.Math.Clamp(bonusEndBananaFountainCollectedTwa / finalTwa, 0, 1)
            : 0;
          const resolvedProgressRatio = Phaser.Math.Clamp(
            Number.isFinite(Number(progressRatio)) ? Number(progressRatio) : fallbackProgressRatio,
            0,
            1
          );
          const escalationBonus = Math.min(superBurst ? 22 : 9, Math.floor(burstIndex / (superBurst ? 1 : 3)));
          const bananaCount = superBurst
            ? Math.max(62, Math.min(96, baseCount * 2 + 34 + escalationBonus))
            : Math.max(4, Math.min(38, baseCount + escalationBonus + Math.floor(resolvedProgressRatio * 8)));
          const textureKey = this.textures.exists("banana_transparent") ? "banana_transparent" : "11";
          const countUpX = Number(this.countUpText.x);
          const countUpY = Number(this.countUpText.y);
          if (!Number.isFinite(countUpX) || !Number.isFinite(countUpY)) return;
    
          const countUpDepth = Number(this.countUpText.depth || 200);
          const fountainDepth = countUpDepth - 6;
          const sourceBiasX = Number.isFinite(Number(sourceX))
            ? Phaser.Math.Clamp((Number(sourceX) - countUpX) * 0.12, -92, 92)
            : 0;
          const baseY = countUpY + 38;
          const finalWinTbm = Math.max(0, betSize > 0 ? finalTwa / betSize : totalTwa);
          const valueLift = Math.min(superBurst ? 230 : 150, Math.sqrt(Math.max(0, valueTbm)) * (superBurst ? 16 : 14));
          const progressLift = superBurst ? 210 : resolvedProgressRatio * 160;
          const winLift = Math.min(superBurst ? 170 : 95, Math.sqrt(finalWinTbm) * (superBurst ? 9 : 5));
          const spread = (superBurst ? 170 : 96) + Math.min(superBurst ? 255 : 132, bananaCount * (superBurst ? 4.5 : 5.2));
          const topTargetY = Math.max(22, GRID_OFFSET_Y - 42);
          const hasCoinTexture = this.textures?.exists?.(BONUS_END_COIN_ATLAS_KEY);
          const hasCoinSpinAnimation = hasCoinTexture && this.ensureBonusEndCoinSpinAnimation();
          const fountainCoinCount = hasCoinTexture
            ? Math.max(
              superBurst ? 8 : 2,
              Math.min(superBurst ? 18 : 7, Math.ceil(bananaCount * (superBurst ? 0.18 : 0.16)))
            )
            : 0;
    
          for (let index = 0; index < bananaCount; index++) {
            const launchX = countUpX + sourceBiasX + Phaser.Math.Between(superBurst ? -62 : -42, superBurst ? 62 : 42);
            const launchY = baseY + Phaser.Math.Between(8, superBurst ? 52 : 36);
            const endX = countUpX + sourceBiasX * 0.35 + Phaser.Math.Between(-spread, spread);
            const endY = baseY + Phaser.Math.Between(superBurst ? 94 : 70, superBurst ? 210 : 162);
            const peakX = (launchX + endX) * 0.5 + Phaser.Math.Between(superBurst ? -110 : -58, superBurst ? 110 : 58);
            const normalPeakY = countUpY - Phaser.Math.Between(210, 298) - valueLift - progressLift - winLift;
            const peakY = superBurst
              ? Phaser.Math.Between(topTargetY, Math.max(topTargetY + 56, GRID_OFFSET_Y + 52))
              : Math.max(topTargetY + 22, normalPeakY);
            const startScale = Phaser.Math.FloatBetween(superBurst ? 0.275 : 0.2, superBurst ? 0.425 : 0.32);
            const endScale = Phaser.Math.FloatBetween(superBurst ? 0.1625 : 0.13, superBurst ? 0.3 : 0.225);
            const spin = Phaser.Math.Between(superBurst ? -420 : -280, superBurst ? 420 : 280);
            const startAngle = Phaser.Math.Between(-24, 24);
            const delay = Math.floor(index * Math.max(superBurst ? 3 : 5, Math.min(superBurst ? 10 : 16, 150 / bananaCount)) + Phaser.Math.Between(0, superBurst ? 74 : 38));
            const duration = Phaser.Math.Between(superBurst ? 1180 : 920, superBurst ? 1740 : 1320) + Math.min(superBurst ? 420 : 320, bananaCount * (superBurst ? 6 : 8));
            const state = { t: 0 };
            const banana = this.add.image(launchX, launchY, textureKey)
              .setDepth(fountainDepth + index * 0.001)
              .setScale(startScale)
              .setAlpha(0.96)
              .setAngle(startAngle);
    
            banana.isTransientBananaFx = true;
            this.tweens.add({
              targets: state,
              t: 1,
              delay,
              duration,
              ease: "Cubic.easeOut",
              onUpdate: () => {
                if (!banana || banana.destroyed) return;
                const t = Phaser.Math.Clamp(Number(state.t || 0), 0, 1);
                const inv = 1 - t;
                const wobble = Math.sin(t * Math.PI * 3 + index) * (12 * (1 - t));
                banana.x = inv * inv * launchX + 2 * inv * t * peakX + t * t * endX + wobble;
                banana.y = inv * inv * launchY + 2 * inv * t * peakY + t * t * endY;
                banana.angle = startAngle + spin * t;
                banana.setScale(Phaser.Math.Linear(startScale, endScale, t) + Math.sin(Math.PI * t) * (superBurst ? 0.106 : 0.09));
                const fadeStart = superBurst ? 0.82 : 0.78;
                if (t > fadeStart) {
                  banana.setAlpha(Phaser.Math.Linear(0.96, 0, (t - fadeStart) / (1 - fadeStart)));
                }
              },
              onComplete: () => {
                if (banana && !banana.destroyed) {
                  banana.destroy();
                }
              }
            });
          }
    
          for (let index = 0; index < fountainCoinCount; index++) {
            const launchX = countUpX + sourceBiasX + Phaser.Math.Between(superBurst ? -54 : -36, superBurst ? 54 : 36);
            const launchY = baseY + Phaser.Math.Between(12, superBurst ? 50 : 32);
            const endX = countUpX + sourceBiasX * 0.35 + Phaser.Math.Between(-spread * 0.92, spread * 0.92);
            const endY = baseY + Phaser.Math.Between(superBurst ? 84 : 62, superBurst ? 190 : 142);
            const peakX = (launchX + endX) * 0.5 + Phaser.Math.Between(superBurst ? -92 : -48, superBurst ? 92 : 48);
            const normalPeakY = countUpY - Phaser.Math.Between(190, 274) - valueLift * 0.82 - progressLift * 0.88 - winLift;
            const peakY = superBurst
              ? Phaser.Math.Between(topTargetY + 4, Math.max(topTargetY + 60, GRID_OFFSET_Y + 62))
              : Math.max(topTargetY + 26, normalPeakY);
            const startScale = Phaser.Math.FloatBetween(superBurst ? 0.15 : 0.12, superBurst ? 0.22 : 0.17);
            const endScale = startScale * Phaser.Math.FloatBetween(0.7, 0.92);
            const spin = Phaser.Math.Between(superBurst ? -520 : -360, superBurst ? 520 : 360);
            const startAngle = Phaser.Math.Between(-22, 22);
            const delay = Math.floor(index * Math.max(superBurst ? 10 : 14, Math.min(superBurst ? 24 : 34, 260 / fountainCoinCount)) + Phaser.Math.Between(18, superBurst ? 130 : 82));
            const duration = Phaser.Math.Between(superBurst ? 1120 : 900, superBurst ? 1680 : 1300) + Math.min(superBurst ? 360 : 260, fountainCoinCount * (superBurst ? 14 : 20));
            const frameIndex = String(Phaser.Math.Between(0, BONUS_END_COIN_FRAME_COUNT - 1)).padStart(2, "0");
            const coin = this.add.sprite(launchX, launchY, BONUS_END_COIN_ATLAS_KEY, `coin_${frameIndex}.png`)
              .setDepth(fountainDepth + 0.4 + index * 0.001)
              .setScale(startScale)
              .setAlpha(0.98)
              .setAngle(startAngle);
            coin.isTransientBonusEndCoinFx = true;
            if (hasCoinSpinAnimation) {
              coin.play(BONUS_END_COIN_SPIN_ANIM_KEY);
              coin.anims?.setProgress?.(Phaser.Math.FloatBetween(0, 1));
            }
    
            const state = { t: 0 };
            this.tweens.add({
              targets: state,
              t: 1,
              delay,
              duration,
              ease: "Cubic.easeOut",
              onUpdate: () => {
                if (!coin || coin.destroyed) return;
                const t = Phaser.Math.Clamp(Number(state.t || 0), 0, 1);
                const inv = 1 - t;
                const shimmer = Math.sin(t * Math.PI * 4 + index * 0.7) * (7 * (1 - t));
                coin.x = inv * inv * launchX + 2 * inv * t * peakX + t * t * endX + shimmer;
                coin.y = inv * inv * launchY + 2 * inv * t * peakY + t * t * endY;
                coin.angle = startAngle + spin * t;
                coin.setScale(Phaser.Math.Linear(startScale, endScale, t) + Math.sin(Math.PI * t) * (superBurst ? 0.052 : 0.04));
                const fadeStart = superBurst ? 0.84 : 0.8;
                if (t > fadeStart) {
                  coin.setAlpha(Phaser.Math.Linear(0.98, 0, (t - fadeStart) / (1 - fadeStart)));
                }
              },
              onComplete: () => {
                if (coin && !coin.destroyed) {
                  coin.destroy();
                }
              }
            });
          }
        };
        const collectResolvedPositionEntry = async (entry, startDelayMs = 0) => {
          const entryTwa = Number(entry?.resultValueTwa || 0);
          if (startDelayMs > 0) {
            await waitForSceneTime(startDelayMs);
          }
    
          const key = getLabelKey(entry.reel, entry.row);
          const display = valueDisplays.get(key);
          const label = display?.label;
          if (!display || !label || label.destroyed) {
            return entryTwa;
          }
    
          playBonusEndBmCollectSound();
          this.playBonusEndLandingCoinBurst(label.x, label.y + 8, entry?.resultValueTbm, {
            depth: DEPTH_HERO + 12,
            maxCoins: 7,
            valueScale: 0.38,
            playSound: false
          });
          playBonusEndBananaFountain(entry?.resultValueTbm, {
            sourceX: label.x,
            progressRatio: finalTwa > 0 ? (bonusEndBananaFountainCollectedTwa + entryTwa) / finalTwa : 0
          });
          const collectGlow = this.add.circle(label.x, label.y, 20, 0xFFE07A, 0.3)
            .setDepth(DEPTH_HERO + 3)
            .setBlendMode(Phaser.BlendModes.ADD);
          this.tweens.add({
            targets: collectGlow,
            scale: 2,
            alpha: 0,
            duration: 220,
            ease: "Quad.easeOut",
            onComplete: () => collectGlow.destroy()
          });
    
          await new Promise((resolve) => {
            resetBonusEndValueDisplayScale(display);
            this.tweens.add({
              targets: [display.glow, display.backplate, label],
              scale: 1.18,
              duration: 100,
              yoyo: true,
              ease: "Back.easeOut",
              onComplete: () => {
                resetBonusEndValueDisplayScale(display);
                resolve();
              }
            });
          });
    
          const fadeTargetY = label.y - 16;
          await new Promise((resolve) => {
            this.tweens.add({
              targets: [display.glow, display.backplate, label],
              y: fadeTargetY,
              alpha: 0,
              duration: 180,
              ease: "Quad.easeOut",
              onComplete: () => {
                display.glow.destroy();
                display.backplate.destroy();
                label.destroy();
                resolve();
              }
            });
          });
          valueDisplays.delete(key);
          return entryTwa;
        };
        const collectMergedAreaEntry = async (entry, startDelayMs = 0) => {
          const entryTwa = Number(entry?.resultValueTwa || 0);
          if (startDelayMs > 0) {
            await waitForSceneTime(startDelayMs);
          }
    
          const display = this.mergeGunAreaDisplays instanceof Map
            ? this.mergeGunAreaDisplays.get(String(entry?.id || ""))
            : null;
          const label = display?.label;
          if (!display || !label || label.destroyed) {
            return entryTwa;
          }
    
          playBonusEndBmCollectSound();
          this.playBonusEndLandingCoinBurst(label.x, label.y + 8, entry?.resultValueTbm, {
            depth: DEPTH_HERO + 13,
            maxCoins: 8,
            valueScale: 0.38,
            playSound: false
          });
          playBonusEndBananaFountain(entry?.resultValueTbm, {
            sourceX: label.x,
            progressRatio: finalTwa > 0 ? (bonusEndBananaFountainCollectedTwa + entryTwa) / finalTwa : 0
          });
          const collectGlow = this.add.circle(label.x, label.y, 20, 0xFFE07A, 0.3)
            .setDepth(DEPTH_HERO + 8)
            .setBlendMode(Phaser.BlendModes.ADD);
          this.tweens.add({
            targets: collectGlow,
            scale: 2,
            alpha: 0,
            duration: 220,
            ease: "Quad.easeOut",
            onComplete: () => collectGlow.destroy()
          });
    
          this.stopBonusEndHighValuePulse(display);
          const pulseTargets = [display.labelBackplate, label]
            .filter((target) => target && !target.destroyed);
          await new Promise((resolve) => {
            this.tweens.add({
              targets: pulseTargets,
              scale: 1.18,
              duration: 100,
              yoyo: true,
              ease: "Back.easeOut",
              onComplete: () => {
                pulseTargets.forEach((target) => {
                  if (!target || target.destroyed) return;
                  target.setScale?.(1);
                });
                resolve();
              }
            });
          });
    
          const fadeTargets = [display.labelBackplate, label]
            .filter((target) => target && !target.destroyed);
          if (fadeTargets.length > 0) {
            const fadeTargetY = label.y - 16;
            await new Promise((resolve) => {
              this.tweens.add({
                targets: fadeTargets,
                y: fadeTargetY,
                alpha: 0,
                duration: 180,
                ease: "Quad.easeOut",
                onComplete: () => {
                  if (label && !label.destroyed) {
                    label.setText("");
                    label.destroy();
                  }
                  if (display.labelBackplate && !display.labelBackplate.destroyed) {
                    display.labelBackplate.destroy();
                  }
                  display.label = null;
                  display.labelBackplate = null;
                  resolve();
                }
              });
            });
          }
    
          return entryTwa;
        };
    
        const totalBonusEndLandings = resolvedPhases.reduce((sum, phase) => (
          sum + (Array.isArray(phase?.landings) ? phase.landings.length : 0)
        ), 0);
        let remainingBonusEndLandings = totalBonusEndLandings;
        const fruitRemainingIndicator = createBonusEndFruitRemainingIndicator(totalBonusEndLandings);
        const bonusEndLandingSetupsByPhase = resolvedPhases.map((phase) => {
          const phaseLandings = Array.isArray(phase?.landings) ? phase.landings : [];
          return phaseLandings.map((landing) => buildBonusEndLandingSetup(landing));
        });
        const bonusEndLandingEntries = resolvedPhases.flatMap((phase, phaseIndex) => {
          const phaseLandings = Array.isArray(phase?.landings) ? phase.landings : [];
          return phaseLandings.map((landing, landingIndex) => ({
            landing,
            phaseIndex,
            landingIndex,
            splashIntensity: phase?.splashIntensity || landing?.splashIntensity || "medium",
            setup: bonusEndLandingSetupsByPhase[phaseIndex]?.[landingIndex] || null
          }));
        });
        const resolveMaxWinLandingTrigger = () => {
          if (!isMaxWinPayout || winCapTbm <= 0) {
            return { triggered: false, initial: false, index: -1 };
          }
    
          const positionMap = new Map(visiblePositionValueTbmByKey);
          const areaMap = new Map(mergedAreaValueMap);
          if (getVisibleBoardLabelTbm(positionMap, areaMap) >= winCapTbm - 0.0001) {
            return { triggered: true, initial: true, index: -1 };
          }
    
          for (let index = 0; index < bonusEndLandingEntries.length; index++) {
            const visibleTbm = applyLandingToVisibleLabelState(
              bonusEndLandingEntries[index]?.landing,
              positionMap,
              areaMap
            );
            if (visibleTbm >= winCapTbm - 0.0001) {
              return { triggered: true, initial: false, index };
            }
          }
    
          return { triggered: false, initial: false, index: -1 };
        };
        const maxWinLandingTrigger = resolveMaxWinLandingTrigger();
        await this.waitForPresentation(1250, { skippable: true });
        let maxWinCelebrationBalloons = null;
        let balloonResult = null;
        if (releaseBalloonsAfterKapow) {
          balloonResult = await playBonusEndBalloonPopFeature(balloonReleaseFeature, {
            blockFeatureTargets: !allowFeatureBlockedBalloonLanding,
            onMaxWinTriggered: () => {
              playBonusEndBananaFountain(winCapTbm || (betSize > 0 ? finalTwa / betSize : totalTwa), {
                progressRatio: 1,
                superBurst: true
              });
              maxWinCelebrationBalloons = playBonusEndBalloonPopFeature(null, {
                visualOnly: true,
                celebrationRelease: true,
                forceFlyOff: true,
                fakeCelebrationCount: 30,
                spendMeter: false
              });
              void playMaxWinCenterLabel({ holdUntil: maxWinCelebrationBalloons });
            }
          });
        }
    
        if (maxWinLandingTrigger.triggered) {
          const triggerIndex = maxWinLandingTrigger.initial ? -1 : maxWinLandingTrigger.index;
          for (let index = 0; index <= triggerIndex; index++) {
            const entry = bonusEndLandingEntries[index];
            await animateLanding(
              entry.landing,
              0,
              entry.splashIntensity,
              entry.setup
            );
            applyLandingToVisibleLabelState(entry.landing);
            await this.waitForPresentation(55, { skippable: true });
          }
    
          await this.waitForPresentation(1000, { skippable: true });
          const remainingEntries = bonusEndLandingEntries.slice(Math.max(0, triggerIndex + 1));
          await Promise.all(remainingEntries.map((entry, index) =>
            animateMaxWinSplashLanding(
              entry,
              Math.min(520, index * 18 + Phaser.Math.Between(0, 50))
            )
          ));
          fruitRemainingIndicator?.setRemaining?.(0, { shouldPulse: false });
    
          const balloons = playBonusEndBalloonPopFeature(balloonReleaseFeature, {
            visualOnly: true,
            celebrationRelease: true,
            forceFlyOff: true,
            fakeCelebrationCount: 30,
            spendMeter: false
          });
          const maxWinLabel = playMaxWinCenterLabel({ holdUntil: balloons });
          playBonusEndBananaFountain(winCapTbm || (betSize > 0 ? finalTwa / betSize : totalTwa), {
            progressRatio: 1,
            superBurst: true
          });
          await Promise.all([maxWinLabel, balloons]);
          cleanupBonusEndPayoutDisplays();
          this.updateCountUp(finalTwa);
          return true;
        }
    
        for (let phaseIndex = 0; phaseIndex < resolvedPhases.length; phaseIndex++) {
          const phase = resolvedPhases[phaseIndex];
          const phaseLandings = Array.isArray(phase?.landings) ? phase.landings : [];
          if (phaseLandings.length === 0) continue;
    
          const phaseDurationMs = Math.max(
            Number(phase?.minDurationMs || 1000),
            Math.min(Number(phase?.durationMs || 1000), Number(phase?.maxDurationMs || phase?.durationMs || 1000))
          );
          const startDelays = buildPhaseStartDelays(phaseLandings, phaseDurationMs);
          const landingPromises = phaseLandings.map((landing, index) =>
            animateLanding(
              landing,
              startDelays[index] || 0,
              phase?.splashIntensity || landing?.splashIntensity || "medium",
              bonusEndLandingSetupsByPhase[phaseIndex]?.[index] || null
            )
          );
    
          await Promise.all(landingPromises);
          await this.waitForPresentation(180, { skippable: true });
        }
        fruitRemainingIndicator?.setRemaining?.(0, { shouldPulse: false });
    
        if (!balloonResult) {
          balloonResult = await playBonusEndBalloonPopFeature(balloonReleaseFeature, {
            blockFeatureTargets: !allowFeatureBlockedBalloonLanding,
            onMaxWinTriggered: () => {
              playBonusEndBananaFountain(winCapTbm || (betSize > 0 ? finalTwa / betSize : totalTwa), {
                progressRatio: 1,
                superBurst: true
              });
              maxWinCelebrationBalloons = playBonusEndBalloonPopFeature(null, {
                visualOnly: true,
                celebrationRelease: true,
                forceFlyOff: true,
                fakeCelebrationCount: 30,
                spendMeter: false
              });
              void playMaxWinCenterLabel({ holdUntil: maxWinCelebrationBalloons });
            }
          });
        }
        await this.waitForPresentation(260, { skippable: true });
        if (balloonResult?.maxWinTriggered) {
          await Promise.all([
            playMaxWinCenterLabel({ holdUntil: maxWinCelebrationBalloons }),
            maxWinCelebrationBalloons
          ].filter(Boolean));
          cleanupBonusEndPayoutDisplays();
          this.updateCountUp(finalTwa);
          return true;
        }
        const beeResult = await playBonusEndLightningBeeFeature(bonusEndPayout?.lightningBeeFeature);
        if (beeResult?.maxWinTriggered) {
          const maxWinBeeCelebrationBalloons = playBonusEndBalloonPopFeature(null, {
            visualOnly: true,
            celebrationRelease: true,
            forceFlyOff: true,
            fakeCelebrationCount: 30,
            spendMeter: false
          });
          playBonusEndBananaFountain(winCapTbm || (betSize > 0 ? finalTwa / betSize : totalTwa), {
            progressRatio: 1,
            superBurst: true
          });
          await Promise.all([
            playMaxWinCenterLabel({ holdUntil: maxWinBeeCelebrationBalloons }),
            maxWinBeeCelebrationBalloons
          ].filter(Boolean));
          cleanupBonusEndPayoutDisplays();
          this.updateCountUp(finalTwa);
          return true;
        }
        mergedAreas.forEach((area) => {
          mergedAreaValueMap.set(String(area.id), Number(area?.resultValueTbm || 0));
        });
        syncMergedAreaValueDisplays();
    
        let collectedTwa = 0;
        const applyCollectedTwa = (entryTwa) => {
          collectedTwa += Number(entryTwa || 0);
          bonusEndBananaFountainCollectedTwa = collectedTwa;
          this.updateCountUp(Math.min(finalTwa, baseTwa + collectedTwa));
        };
        const collectPlateEntry = async (plateEntry, startDelayMs = 0) => {
          if (plateEntry?.kind === "mergedArea") {
            return collectMergedAreaEntry(plateEntry.entry, startDelayMs);
          }
          return collectResolvedPositionEntry(plateEntry?.entry || plateEntry, startDelayMs);
        };
        const buildPlateCollectionRampDelays = (entries) => {
          const count = Array.isArray(entries) ? entries.length : 0;
          if (count <= 0) return [];
    
          const startGapMs = 280;
          const endGapMs = 26;
          const slowStartRatio = 0.16;
          const delays = [];
          let elapsedMs = 0;
    
          for (let index = 0; index < count; index++) {
            delays.push(Math.floor(elapsedMs));
            const t = count <= 1 ? 1 : index / Math.max(1, count - 1);
            const rampT = Phaser.Math.Clamp((t - slowStartRatio) / Math.max(0.01, 1 - slowStartRatio), 0, 1);
            const easedRamp = Math.pow(rampT, 1.65);
            const gapMs = Phaser.Math.Linear(startGapMs, endGapMs, easedRamp);
            elapsedMs += Math.max(endGapMs, gapMs);
          }
    
          return delays;
        };
        const collectPlateEntriesAsRamp = async (entries) => {
          if (!Array.isArray(entries) || entries.length === 0) {
            return;
          }
    
          const startDelays = buildPlateCollectionRampDelays(entries);
          await Promise.all(entries.map((entry, index) =>
            collectPlateEntry(entry, startDelays[index] || 0).then((entryTwa) => {
              applyCollectedTwa(entryTwa);
            })
          ));
          await this.waitForPresentation(90, { skippable: true });
        };
        const toPlateCollectEntry = (kind, entry, sourceIndex = 0) => {
          const positions = Array.isArray(entry?.positions) ? entry.positions : [];
          const firstPosition = positions[0] || entry || {};
          return {
            kind,
            entry,
            sourceIndex,
            valueTbm: Math.max(0, Number(entry?.resultValueTbm || 0)),
            valueTwa: Math.max(0, Number(entry?.resultValueTwa || 0)),
            sortRow: Number.isFinite(Number(firstPosition?.row)) ? Number(firstPosition.row) : 0,
            sortReel: Number.isFinite(Number(firstPosition?.reel)) ? Number(firstPosition.reel) : 0
          };
        };
        const comparePlateCollectionValueAsc = (left, right) => {
          if (left.valueTbm !== right.valueTbm) return left.valueTbm - right.valueTbm;
          if (left.valueTwa !== right.valueTwa) return left.valueTwa - right.valueTwa;
          if (left.sortRow !== right.sortRow) return left.sortRow - right.sortRow;
          if (left.sortReel !== right.sortReel) return left.sortReel - right.sortReel;
          return left.sourceIndex - right.sourceIndex;
        };
    
        const positionPlateEntries = resolvedPositionTotals
          .filter((entry) => {
            const reel = Math.floor(Number(entry?.reel));
            const row = Math.floor(Number(entry?.row));
            if (!Number.isFinite(reel) || !Number.isFinite(row)) return true;
            return !mergedAreaCollectionCellKeys.has(getLabelKey(reel, row));
          })
          .map((entry, index) => toPlateCollectEntry("position", entry, index));
        const mergedPlateEntries = mergedAreaCollectEntries
          .map((entry, index) => toPlateCollectEntry("mergedArea", entry, positionPlateEntries.length + index));
        const plateCollectEntries = [...positionPlateEntries, ...mergedPlateEntries]
          .filter((entry) => entry.valueTbm > 0 || entry.valueTwa > 0)
          .sort(comparePlateCollectionValueAsc);
    
        await collectPlateEntriesAsRamp(plateCollectEntries);
    
        cleanupBonusEndPayoutDisplays();
        this.updateCountUp(finalTwa);
        return true;
      }
  };
}
