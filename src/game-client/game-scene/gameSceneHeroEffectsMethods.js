export function createGameSceneHeroEffectsMethods(deps = {}) {
  const {
    BANANA_IMPACT_COLORS,
    BONUS_COUNTER_GLOW_COLOR,
    BONUS_WON_CRACKLING_ATLAS_TEXT_KEY,
    BONUS_WON_CRACKLING_SHEET_TEXTURE_KEY,
    COLLECT_FALL_IMPACT_DURATION_MS,
    COLLECT_FALL_SPEED_MULTIPLIER,
    DEPTH_BOARD_BACKDROP,
    DEPTH_HERO,
    DEPTH_SYMBOLS,
    GRID_OFFSET_X,
    GRID_OFFSET_Y,
    HERO_AURA_CRACKLE_FRAME_KEY_PREFIX,
    HERO_LIGHTNING_ATLAS_TEXT_KEY,
    HERO_LIGHTNING_AURA_FALLBACK_FRAMES,
    HERO_LIGHTNING_AURA_FRAME_KEYS,
    HERO_LIGHTNING_SHEET_TEXTURE_KEY,
    HERO_STAGE_TEXTURE_KEYS,
    Phaser,
    SYMBOL_POP_PARTICLE_ANIM_KEY,
    SYMBOL_POP_PARTICLE_FRAME_KEY_PREFIX,
    clientConfig,
    gameClientConfig,
    getHeroScaleForFootprint,
    getHeroTexture,
    getReelSymbolRenderable,
    normalScale,
    parseHeroLightningAtlasFrames,
    parseSpineAtlasFrames
  } = deps;

  return {
    animateSpriteIntoCenterCollector(sprite, symbolId = null) {
        if (!sprite || sprite.destroyed) {
          return Promise.resolve(false);
        }
    
        const resolvedSymbolId = this.getCollectableBonusSymbolId(symbolId ?? sprite?.symbolKey);
        if (resolvedSymbolId !== null) {
          if (!this.isBonusCenterMachineCollectableSymbol(resolvedSymbolId)) {
            return this.animateSpriteOutOfBonusCollection(sprite);
          }
          this.setBonusAwareSymbolTexture(sprite, resolvedSymbolId);
        }
    
        const target = this.getCenterCollectTarget();
        this.tweens.killTweensOf(sprite);
        this.destroyBananaBackplate(sprite);
        sprite.isBeingDestroyed = true;
        sprite.setDepth(DEPTH_HERO - 2);
    
        return new Promise((resolve) => {
          this.tweens.add({
            targets: sprite,
            x: target.x,
            y: target.y,
            scaleX: Math.max(0.16, (sprite.scaleX || normalScale) * 0.35),
            scaleY: Math.max(0.16, (sprite.scaleY || normalScale) * 0.35),
            angle: sprite.angle + Phaser.Math.Between(-80, 80),
            alpha: 0,
            duration: 180,
            ease: "Cubic.easeIn",
            onComplete: () => {
              if (!sprite.destroyed) {
                sprite.destroy();
              }
              this.playCollectedMultiplierEnergyOutburst(resolvedSymbolId).then(() => resolve(true));
            }
          });
        });
      },

    getBananaMeterInfo(rawCount = 0) {
        const count = Math.max(0, Math.min(30, Math.floor(Number(rawCount) || 0)));
        if (count >= 30) return { count, level: 5, rangeLabel: "30", mode: "BONUS" };
        if (count >= 25) return { count, level: 4, rangeLabel: "25-29", mode: "BONUS" };
        if (count >= 20) return { count, level: 3, rangeLabel: "20-24", mode: "BONUS" };
        if (count >= 15) return { count, level: 2, rangeLabel: "15-19", mode: "BONUS" };
        if (count >= 10) return { count, level: 1, rangeLabel: "10-14", mode: "BONUS" };
        if (count >= 5) return { count, level: 0, rangeLabel: "5-9", mode: "BONUS" };
        return { count, level: null, rangeLabel: "0-4", mode: "MAIN" };
      },

    getBananaMeterSegments() {
        const milestoneSegments = new Map([
          [5, { type: "BONUS", shortLabel: "B", fullLabel: "Bonus" }],
          [10, { type: "WILD2", shortLabel: "+1W", fullLabel: "+1 Wild" }],
          [15, { type: "WILD2", shortLabel: "+1W", fullLabel: "+1 Wild" }],
          [20, { type: "BONUS", shortLabel: "T", fullLabel: "T" }],
          [25, { type: "BONUS", shortLabel: "TK", fullLabel: "TK" }],
          [30, { type: "BONUS", shortLabel: "TK+", fullLabel: "TK+" }]
        ]);
    
        return Array.from({ length: 30 }, (_, index) => {
          const value = index + 1;
          const milestone = milestoneSegments.get(value);
          if (milestone) {
            return {
              min: value,
              max: value,
              type: milestone.type,
              shortLabel: milestone.shortLabel,
              fullLabel: `${milestone.fullLabel} ${value}`
            };
          }
          return {
            min: value,
            max: value,
            type: "SEG",
            shortLabel: "SEG",
            fullLabel: `SEG ${value}`
          };
        });
      },

    getBananaMeterSegmentIndexes(rawCount = 0) {
        const count = Math.max(0, Math.min(30, Math.floor(Number(rawCount) || 0)));
        const segments = this.getBananaMeterSegments();
    
        let currentIndex = -1;
        for (let i = 0; i < segments.length; i++) {
          const seg = segments[i];
          if (count >= seg.min && count <= seg.max) {
            currentIndex = i;
            break;
          }
        }
    
        let nextIndex = -1;
        for (let i = 0; i < segments.length; i++) {
          if (count < segments[i].min) {
            nextIndex = i;
            break;
          }
        }
    
        return { currentIndex, nextIndex };
      },

    updateBananaMeter(meter = 0) {
        const meterCount = typeof meter === "object" ? (meter?.count ?? 0) : meter;
        this.currentBananaMeterCount = Math.max(0, Math.min(30, Math.floor(Number(meterCount) || 0)));
        this.hideBananaMeter();
      },

    animateBananaCollectToMeter(fromX, fromY, meterCount = null, options = null) {
        const onArrive = typeof options?.onArrive === "function" ? options.onArrive : null;
        if (!Number.isFinite(fromX) || !Number.isFinite(fromY)) return Promise.resolve(false);
    
        const fallbackCount = Number(this.currentBananaMeterCount) || 0;
        const resolvedCount = Math.max(
          1,
          Math.min(30, Math.floor(Number(meterCount) || fallbackCount || 1))
        );
        const { currentIndex } = this.getBananaMeterSegmentIndexes(resolvedCount);
        if (currentIndex < 0) return Promise.resolve(false);
    
        let targetX = null;
        let targetY = null;
        const targetRect = this.bananaMeterSegments?.[currentIndex];
        if (targetRect && !targetRect.destroyed) {
          targetX = targetRect.x + targetRect.displayWidth / 2;
          targetY = targetRect.y;
        } else {
          const layout = this._bananaMeterLayout;
          if (!layout) return Promise.resolve(false);
          targetX = layout.x + currentIndex * (layout.segmentWidth + layout.segmentGap) + layout.segmentWidth / 2;
          targetY = layout.barY;
        }
    
        const distance = Phaser.Math.Distance.Between(fromX, fromY, targetX, targetY);
        const baseRotation = Phaser.Math.Angle.Between(fromX, fromY, targetX, targetY);
        const textureKey = this.textures.exists("banana_transparent") ? "banana_transparent" : "11";
        const visualBananaCount = Math.max(1, Math.min(8, Math.floor(Number(options?.visualBananaCount) || 5)));
        const flightDuration = 300 + Math.min(220, distance * 0.28);
        const createArrivalImpact = (arrivalIndex = 0) => {
          const impact = this.add.circle(
            targetX + Phaser.Math.Between(-4, 4),
            targetY + Phaser.Math.Between(-3, 3),
            arrivalIndex === visualBananaCount - 1 ? 11 : 8,
            0xFFE082
          )
            .setDepth(213)
            .setAlpha(arrivalIndex === visualBananaCount - 1 ? 0.95 : 0.72)
            .setBlendMode(Phaser.BlendModes.ADD);
          this.tweens.add({
            targets: impact,
            radius: arrivalIndex === visualBananaCount - 1 ? 26 : 18,
            alpha: 0,
            duration: arrivalIndex === visualBananaCount - 1 ? 190 : 130,
            ease: "Quad.easeOut",
            onComplete: () => impact.destroy()
          });
        };
        const pulseMeterTarget = () => {
          const pulseRect = this.bananaMeterSegments?.[currentIndex];
          const pulseLabel = this.bananaMeterSegmentLabels?.[currentIndex];
          if (pulseRect && !pulseRect.destroyed) {
            this.tweens.add({
              targets: pulseRect,
              scaleX: 1.16,
              scaleY: 1.16,
              duration: 115,
              yoyo: true,
              ease: "Sine.easeOut"
            });
          }
          if (pulseLabel && !pulseLabel.destroyed) {
            this.tweens.add({
              targets: pulseLabel,
              scaleX: 1.18,
              scaleY: 1.18,
              duration: 115,
              yoyo: true,
              ease: "Sine.easeOut"
            });
          }
          const pulseMilestone = this.bananaMeterMilestoneLabels?.[currentIndex];
          if (pulseMilestone && !pulseMilestone.destroyed) {
            this.tweens.add({
              targets: pulseMilestone,
              scaleX: 1.18,
              scaleY: 1.18,
              duration: 115,
              yoyo: true,
              ease: "Sine.easeOut"
            });
          }
        };
    
        const flightPromises = Array.from({ length: visualBananaCount }, (_, index) => new Promise((resolve) => {
          const spreadRatio = index - (visualBananaCount - 1) / 2;
          const sourceX = fromX + spreadRatio * 6 + Phaser.Math.Between(-7, 7);
          const sourceY = fromY + Phaser.Math.Between(-8, 7);
          const landingX = targetX + spreadRatio * 2 + Phaser.Math.Between(-3, 3);
          const landingY = targetY + Phaser.Math.Between(-2, 3);
          const arcHeight = Math.max(66, Math.min(205, distance * (0.24 + index * 0.018))) + Math.abs(spreadRatio) * 10;
          const delay = index * 24;
          const flightState = { t: 0 };
          const startScale = 0.32 + index * 0.012 + Math.abs(spreadRatio) * 0.01;
          const endScale = 0.12 + index * 0.003;
          const bananaFx = this.add.image(sourceX, sourceY, textureKey)
            .setDepth(214 + index * 0.01)
            .setScale(startScale)
            .setAlpha(0.92)
            .setRotation(Phaser.Math.FloatBetween(-0.32, 0.32));
          bananaFx.isTransientBananaFx = true;
    
          this.tweens.add({
            targets: flightState,
            t: 1,
            delay,
            duration: flightDuration + Phaser.Math.Between(-25, 45),
            ease: "Cubic.easeInOut",
            onUpdate: () => {
              if (!bananaFx || bananaFx.destroyed) return;
              const t = flightState.t;
              const wiggle = Math.sin(t * Math.PI * 2 + index) * (8 - Math.min(5, index));
              bananaFx.x = Phaser.Math.Linear(sourceX, landingX, t) + wiggle * (1 - t);
              bananaFx.y = Phaser.Math.Linear(sourceY, landingY, t) - Math.sin(Math.PI * t) * arcHeight;
              bananaFx.rotation = baseRotation + (1 - t) * (0.42 + index * 0.05);
              bananaFx.setScale(Phaser.Math.Linear(startScale, endScale, Phaser.Math.SmoothStep(t, 0, 1)));
              bananaFx.setAlpha(0.92 - Math.max(0, t - 0.84) * 4.8);
            },
            onComplete: () => {
              if (bananaFx && !bananaFx.destroyed) bananaFx.destroy();
              this.playSfx?.("bananacollect", {
                volume: index === visualBananaCount - 1 ? 0.24 : 0.16,
                rate: Phaser.Math.FloatBetween(0.96, 1.05)
              });
              createArrivalImpact(index);
              resolve(index);
            }
          });
        }));
    
        return Promise.all(flightPromises).then(() => {
          onArrive?.(resolvedCount);
          pulseMeterTarget();
          return true;
        });
      },

    hideBananaMeter() {
        this._bananaMeterLayout = null;
        if (this.bananaMeterText && !this.bananaMeterText.destroyed) {
          this.bananaMeterText.destroy();
          this.bananaMeterText = null;
        }
        if (this.bananaMeterLabel && !this.bananaMeterLabel.destroyed) {
          this.bananaMeterLabel.destroy();
          this.bananaMeterLabel = null;
        }
        if (Array.isArray(this.bananaMeterSegments)) {
          this.bananaMeterSegments.forEach((obj) => obj?.destroy?.());
          this.bananaMeterSegments = null;
        }
        if (Array.isArray(this.bananaMeterSegmentLabels)) {
          this.bananaMeterSegmentLabels.forEach((obj) => obj?.destroy?.());
          this.bananaMeterSegmentLabels = null;
        }
        if (Array.isArray(this.bananaMeterMilestoneLabels)) {
          this.bananaMeterMilestoneLabels.forEach((obj) => obj?.destroy?.());
          this.bananaMeterMilestoneLabels = null;
        }
      },

    updateHeroAbilitiesUI(hero) {
        if (!hero) return;
        
        const cellSize = 70;
        const gridWidth = clientConfig.area.width * cellSize;
        const gridHeight = clientConfig.area.height * cellSize;
        
        // Position on left side below Thor rewards area
        const baseX = GRID_OFFSET_X + 110; // Left side, slightly right of Thor rewards
        const baseY = GRID_OFFSET_Y + gridHeight + 105; // Below game area (moved down by 20px)
        
        const iconScale = 0.32;
        const iconSpacing = 45; // Horizontal spacing between icons
        
        // Map abilities to levels
        const stepMap = { "destroy": 0, "mystery": 1, "mysteryWild": 2 };
        const weaponMap = { "staff": 0, "sword": 1, "axe": 2 };
        
        const stepLevel = stepMap[hero.step] || 0;
        const weaponLevel = weaponMap[hero.weapon] || 0;
        const necromancerLevel = hero.necromancer || 0;
        
        // Define abilities: [name, level, isActive, xOffset, color]
        const abilities = [
          { name: 'necromancer', image: 'lvl_necromancer', level: necromancerLevel, isActive: necromancerLevel > 0, xOffset: -iconSpacing * 2, color: '#32CD32' }, // green
          { name: 'weapon', image: 'lvl_weapon', level: weaponLevel, isActive: weaponLevel > 0, xOffset: -iconSpacing, color: '#DC143C' }, // red
          { name: 'step', image: 'lvl_steps', level: stepLevel, isActive: stepLevel > 0, xOffset: 0, color: '#4169E1' } // blue
        ];
        
        // If all abilities are inactive, hide the UI
        const allInactive = abilities.every(ability => !ability.isActive);
        if (allInactive) {
          this.hideHeroAbilitiesUI();
          return;
        }
        
        // Create or update ability icons
        if (!this.heroAbilityIcons) {
          this.heroAbilityIcons = {};
        }
        
        abilities.forEach(ability => {
          const x = baseX + ability.xOffset;
          const y = baseY;
          
          // Create icon if it doesn't exist
          if (!this.heroAbilityIcons[ability.name] || this.heroAbilityIcons[ability.name].destroyed) {
            const icon = this.add.image(x, y, ability.image)
              .setOrigin(0.5, 0.5)
              .setDepth(201)
              .setScale(iconScale);
            
            // Create circular background for number (below icon)
            const levelBg = this.add.circle(x, y + 22, 14, parseInt(ability.color.replace('#', '0x')), 1)
              .setDepth(202)
              .setStrokeStyle(2, 0x000000);
            
            const levelText = this.add.text(x, y + 22, '', {
              fontSize: '24px',
              fontFamily: '"Cinzel", serif',
              fontStyle: 'bold',
              color: '#FFFFFF',
              stroke: '#000000',
              strokeThickness: 3
            })
              .setOrigin(0.5, 0.5)
              .setDepth(203);
            
            this.heroAbilityIcons[ability.name] = { icon, levelBg, levelText, previousLevel: 0 };
          }
          
          const abilityIcon = this.heroAbilityIcons[ability.name];
          const { icon, levelBg, levelText } = abilityIcon;
          
          // Check if level increased
          const levelIncreased = ability.isActive && ability.level > (abilityIcon.previousLevel || 0);
          
          // Update appearance based on active state
          if (ability.isActive) {
            icon.clearTint();
            icon.setAlpha(1);
            levelBg.setVisible(true);
            levelText.setText(ability.level.toString());
            levelText.setVisible(true);
            
            // Play upgrade animation if level increased
            if (levelIncreased) {
              // Pulse the badge and text
              this.tweens.add({
                targets: [levelBg, levelText],
                scale: { from: 1.8, to: 1 },
                alpha: { from: 1, to: 1 },
                duration: 500,
                ease: 'Back.easeOut'
              });
              
              // Flash the icon
              this.tweens.add({
                targets: icon,
                scale: { from: iconScale * 1.3, to: iconScale },
                duration: 400,
                ease: 'Back.easeOut'
              });
              
              // Add a colored glow effect around the badge
              const glowRing = this.add.circle(levelBg.x, levelBg.y, 20, parseInt(ability.color.replace('#', '0x')), 0.6)
                .setDepth(201);
              
              this.tweens.add({
                targets: glowRing,
                scale: { from: 0.5, to: 2 },
                alpha: { from: 0.8, to: 0 },
                duration: 600,
                ease: 'Power2',
                onComplete: () => {
                  glowRing.destroy();
                }
              });
            }
            
            // Update previous level
            abilityIcon.previousLevel = ability.level;
          } else {
            // Grey out inactive abilities
            icon.setTint(0x666666);
            icon.setAlpha(0.5);
            levelBg.setVisible(false);
            levelText.setVisible(false);
            
            // Reset previous level
            abilityIcon.previousLevel = 0;
          }
        });
      },

    hideHeroAbilitiesUI() {
        if (this.heroAbilityIcons) {
          Object.values(this.heroAbilityIcons).forEach(({ icon, levelBg, levelText }) => {
            if (icon && !icon.destroyed) icon.destroy();
            if (levelBg && !levelBg.destroyed) levelBg.destroy();
            if (levelText && !levelText.destroyed) levelText.destroy();
          });
          this.heroAbilityIcons = null;
        }
      },

    updateBananaKillCounter(killed, threshold = 10) {
        const cellSize = 70;
        const gridWidth = clientConfig.area.width * cellSize;
        const gridHeight = clientConfig.area.height * cellSize;
        
        // Position in bottom left corner (opposite of freespin counter)
        const x = GRID_OFFSET_X + 5;
        const y = GRID_OFFSET_Y + gridHeight + 55; // Moved down by 20px
        
        if (killed < 0) {
          // Hide counter
          this.hideBananaKillCounter();
          return;
        }
        
        // Create counter if it doesn't exist
        if (!this.bananaKillCounter || this.bananaKillCounter.destroyed) {
          // Small chest icon using actual chest image
          this.bananaKillIcon = this.add.image(x + 15, y, 'bonus_chest')
            .setOrigin(0.5, 0.5)
            .setDepth(201)
            .setScale(0.32); // Small version of the chest
          
          // Counter text
          this.bananaKillCounter = this.add.text(x + 35, y, '', {
            fontSize: '28px',
            fontFamily: '"Cinzel", "Times New Roman", serif',
            fontStyle: 'bold',
            color: '#FFD54F',
            stroke: '#5D4037',
            strokeThickness: 4,
            shadow: {
              offsetX: 0,
              offsetY: 0,
              color: '#C38B00',
              blur: 10,
              fill: true
            }
          })
            .setOrigin(0, 0.5) // Left-aligned
            .setDepth(201);
          
          // Label above counter
          this.bananaKillLabel = this.add.text(x + 35, y - 22, "Thor's Reward", {
            fontSize: '14px',
            fontFamily: '"Cinzel", sans-serif',
            fontStyle: 'bold',
            color: '#FFE082',
            stroke: '#4E342E',
            strokeThickness: 2
          })
            .setOrigin(0, 0.5)
            .setDepth(201);
          
          // Initialize tracking variable for chest sparkles
          this.lastBananaKillCount = 0;
        }
        
        // Calculate display: show kills toward NEXT threshold
        // e.g., if killed=13, threshold=10, chestsEarned=1, so display 13 toward next 20
        const chestsEarned = Math.floor(killed / threshold);
        const nextThreshold = (chestsEarned + 1) * threshold;
        
        // Check if we just crossed a chest threshold
        const previousChestsEarned = Math.floor((this.lastBananaKillCount || 0) / threshold);
        const justEarnedChest = chestsEarned > previousChestsEarned;
        
        // Check if banana count increased (new banana killed)
        const bananaKilled = killed > (this.lastBananaKillCount || 0);
        
        // Update tracking
        this.lastBananaKillCount = killed;
        
        // If we just earned a chest, add sparkle effect to chest icon
        if (justEarnedChest && this.bananaKillIcon && !this.bananaKillIcon.destroyed) {
          this.addChestSparkleEffect();
          
          // Red highlight flash when threshold is reached
          const counterX = this.bananaKillCounter.x + this.bananaKillCounter.width / 2;
          const counterY = this.bananaKillCounter.y;
          
          // Create milestone glow behind counter
          const redGlow = this.add.circle(counterX, counterY, 50, BONUS_COUNTER_GLOW_COLOR)
            .setDepth(200)
            .setBlendMode(Phaser.BlendModes.ADD)
            .setAlpha(0);
          
          // Flash in and out
          this.tweens.add({
            targets: redGlow,
            alpha: { from: 0, to: 0.8 },
            scale: { from: 0.5, to: 1.5 },
            duration: 200,
            ease: 'Power2.easeOut',
            onComplete: () => {
              this.tweens.add({
                targets: redGlow,
                alpha: 0,
                scale: 2,
                duration: 300,
                ease: 'Power2.easeIn',
                onComplete: () => redGlow.destroy()
              });
            }
          });
          
          // Briefly change counter text color to bright gold
          const originalColor = this.bananaKillCounter.style.color;
          this.bananaKillCounter.setColor('#FFF3B0');
          
          // Flash the counter text brighter
          this.tweens.add({
            targets: this.bananaKillCounter,
            scale: { from: 1.5, to: 1 },
            duration: 400,
            ease: 'Back.easeOut',
            onComplete: () => {
              // Restore original color after flash
              setTimeout(() => {
                this.bananaKillCounter.setColor(originalColor);
              }, 200);
            }
          });
        }
        
        // Update text (show total killed / next threshold)
        this.bananaKillCounter.setText(`${killed}/${nextThreshold}`);
        
        // Bounce animation when a banana is killed
        if (bananaKilled) {
          // Bounce the counter text and icon
          this.tweens.add({
            targets: this.bananaKillCounter,
            scale: { from: 1.3, to: 1 },
            duration: 300,
            ease: 'Back.easeOut'
          });
          
          this.tweens.add({
            targets: this.bananaKillIcon,
            scale: { from: 0.32 * 1.3, to: 0.32 },
            duration: 300,
            ease: 'Back.easeOut'
          });
        }
      },

    hideBananaKillCounter() {
        // Stop sparkle effect
        this.stopChestSparkleEffect();
        
        if (this.bananaKillCounter && !this.bananaKillCounter.destroyed) {
          this.bananaKillCounter.destroy();
          this.bananaKillCounter = null;
        }
        if (this.bananaKillLabel && !this.bananaKillLabel.destroyed) {
          this.bananaKillLabel.destroy();
          this.bananaKillLabel = null;
        }
        if (this.bananaKillIcon && !this.bananaKillIcon.destroyed) {
          this.bananaKillIcon.destroy();
          this.bananaKillIcon = null;
        }
        // Reset tracking
        this.lastBananaKillCount = 0;
      },

    addChestSparkleEffect() {
        if (!this.bananaKillIcon || this.bananaKillIcon.destroyed) return;
        
        // Stop any existing sparkle timer
        if (this.bananaKillChestSparkleTimer) {
          this.bananaKillChestSparkleTimer.destroy();
        }
        
        // Pulse animation on the chest icon
        this.tweens.add({
          targets: this.bananaKillIcon,
          scale: 0.38,
          duration: 150,
          yoyo: true,
          repeat: 1,
          ease: 'Sine.easeInOut'
        });
        
        // Start continuous sparkle loop (mini version of bonus chest sparkles)
        this.bananaKillChestSparkleTimer = this.time.addEvent({
          delay: 90, // Slightly slower than main chest (80ms)
          callback: () => {
            if (!this.bananaKillIcon || this.bananaKillIcon.destroyed) {
              if (this.bananaKillChestSparkleTimer) {
                this.bananaKillChestSparkleTimer.destroy();
              }
              return;
            }
            
            // Get chest's current position
            const chestX = this.bananaKillIcon.x;
            const chestY = this.bananaKillIcon.y;
            
            // Random position around small chest (smaller area)
            const angle = Math.random() * Math.PI * 2;
            const distance = 8 + Math.random() * 12; // Smaller radius for mini chest
            const x = chestX + Math.cos(angle) * distance;
            const y = chestY + Math.sin(angle) * distance;
            
            const colors = [0xFFDD44, 0xFFAA00, 0xFFFFAA, 0xFFFFFF];
            const sparkle = this.add.circle(x, y, 0.7 + Math.random() * 1, colors[Math.floor(Math.random() * colors.length)])
              .setDepth(202) // Above chest icon
              .setAlpha(0.9)
              .setBlendMode(Phaser.BlendModes.ADD);
            
            // Twinkle and float upward
            this.tweens.add({
              targets: sparkle,
              alpha: 0,
              scale: 0.1,
              y: y - 10 - Math.random() * 10,
              x: x + (Math.random() - 0.5) * 5,
              duration: 300 + Math.random() * 200,
              ease: 'Quad.easeOut',
              onComplete: () => sparkle.destroy()
            });
          },
          loop: true
        });
      },

    stopChestSparkleEffect() {
        if (this.bananaKillChestSparkleTimer) {
          this.bananaKillChestSparkleTimer.destroy();
          this.bananaKillChestSparkleTimer = null;
        }
      },

    flashMultiplierUpgrade() {
        if (!this.multiplierText || this.multiplierText.destroyed) return;
        
        const centerX = this.multiplierText.x;
        const centerY = this.multiplierText.y;
        const particleCount = 0;
        const colors = [0x88FFDD, 0x66FFAA, 0xAAFFEE, 0x44DD99, 0xFFFFFF];
        
        for (let i = 0; i < particleCount; i++) {
          // Random angle for firework spread
          const angle = Math.random() * Math.PI * 2;
          const distance = 45 + Math.random() * 40;
          const size = 1.5 + Math.random() * 2;
          const duration = 350 + Math.random() * 200;
          
          // Swirl direction (clockwise or counter-clockwise)
          const swirlDirection = Math.random() > 0.5 ? 1 : -1;
          const swirlAmount = 0.8 + Math.random() * 0.6; // How much it curves
          
          const particle = this.add.circle(centerX, centerY, size, colors[Math.floor(Math.random() * colors.length)])
            .setDepth(103)
            .setAlpha(0.9)
            .setBlendMode(Phaser.BlendModes.ADD);
          
          // Animate with swirl using onUpdate for curved path
          let progress = 0;
          this.tweens.add({
            targets: particle,
            alpha: 0,
            scale: 0.2,
            duration: duration,
            ease: 'Quad.easeOut',
            onUpdate: (tween) => {
              progress = tween.progress;
              // Swirl: angle changes as particle moves outward
              const currentAngle = angle + (progress * swirlAmount * swirlDirection * Math.PI);
              const currentDistance = progress * distance;
              particle.x = centerX + Math.cos(currentAngle) * currentDistance;
              particle.y = centerY + Math.sin(currentAngle) * currentDistance;
            },
            onComplete: () => particle.destroy()
          });
        }
      },

    ensureHeroLightningAuraFrames() {
        if (this._heroLightningAuraFramesReady) {
          return this._heroLightningAuraFrameKeys || [];
        }
        if (!this.textures?.exists?.(HERO_LIGHTNING_SHEET_TEXTURE_KEY)) {
          return [];
        }
    
        const texture = this.textures.get(HERO_LIGHTNING_SHEET_TEXTURE_KEY);
        const atlasText = this.cache?.text?.get?.(HERO_LIGHTNING_ATLAS_TEXT_KEY) || "";
        const parsedFrames = parseHeroLightningAtlasFrames(atlasText)
          .filter((frame) => frame?.bounds && frame.rotated !== true)
          .map((frame) => frame.bounds);
        const sourceFrames = parsedFrames.length > 0
          ? parsedFrames.slice(0, HERO_LIGHTNING_AURA_FRAME_KEYS.length)
          : HERO_LIGHTNING_AURA_FALLBACK_FRAMES;
        const frameKeys = [];
    
        sourceFrames.forEach((frame, index) => {
          const frameKey = HERO_LIGHTNING_AURA_FRAME_KEYS[index];
          if (!frameKey || !frame) return;
          if (!texture.has(frameKey)) {
            texture.add(frameKey, 0, frame.x, frame.y, frame.width, frame.height);
          }
          frameKeys.push(frameKey);
        });
    
        this._heroLightningAuraFramesReady = true;
        this._heroLightningAuraFrameKeys = frameKeys;
        return frameKeys;
      },

    ensureHeroAuraCrackleSparkFrames() {
        if (this._heroAuraCrackleFramesReady) {
          return this._heroAuraCrackleFrameKeys || [];
        }
        if (!this.textures?.exists?.(BONUS_WON_CRACKLING_SHEET_TEXTURE_KEY)) {
          return [];
        }
    
        const texture = this.textures.get(BONUS_WON_CRACKLING_SHEET_TEXTURE_KEY);
        const atlasText = this.cache?.text?.get?.(BONUS_WON_CRACKLING_ATLAS_TEXT_KEY) || "";
        const frames = parseSpineAtlasFrames(atlasText, {
          prefix: "add/cracklingLightning_",
          pageName: "frameAndBackground.webp"
        }).filter((frame) => (
          !frame.rotated &&
          frame?.bounds &&
          frame.bounds.width >= 24 &&
          frame.bounds.height >= 48 &&
          frame.bounds.width <= 110 &&
          frame.bounds.height <= 130
        ));
    
        const frameKeys = frames.map((frame, index) => {
          const frameKey = `${HERO_AURA_CRACKLE_FRAME_KEY_PREFIX}${String(index).padStart(2, "0")}`;
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
    
        this._heroAuraCrackleFramesReady = true;
        this._heroAuraCrackleFrameKeys = frameKeys;
        return frameKeys;
      },

    ensureSymbolPopParticleFrames() {
        if (this._symbolPopParticleFramesReady) {
          return this._symbolPopParticleFrameKeys || [];
        }
        this._symbolPopParticleFramesReady = true;
        if (!this.textures?.exists?.(BONUS_WON_CRACKLING_SHEET_TEXTURE_KEY)) {
          return [];
        }
    
        const texture = this.textures.get(BONUS_WON_CRACKLING_SHEET_TEXTURE_KEY);
        const atlasText = this.cache?.text?.get?.(BONUS_WON_CRACKLING_ATLAS_TEXT_KEY) || "";
        const getStrikeIndex = (frame) => {
          const match = String(frame?.name || "").match(/strikeParticles(\d+)$/);
          return match ? Number(match[1]) : 0;
        };
        const frames = parseSpineAtlasFrames(atlasText, {
          prefix: "add/strikeParticles",
          pageName: "frameAndBackground.webp"
        })
          .filter((frame) => (
            frame?.bounds &&
            frame.rotated !== true &&
            frame.bounds.width >= 80 &&
            frame.bounds.height >= 80
          ))
          .sort((left, right) => getStrikeIndex(left) - getStrikeIndex(right));
    
        const frameKeys = frames.map((frame) => {
          const frameIndex = getStrikeIndex(frame);
          const frameKey = `${SYMBOL_POP_PARTICLE_FRAME_KEY_PREFIX}${String(frameIndex).padStart(2, "0")}`;
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
    
        if (frameKeys.length > 0 && this.anims && !this.anims.exists(SYMBOL_POP_PARTICLE_ANIM_KEY)) {
          this.anims.create({
            key: SYMBOL_POP_PARTICLE_ANIM_KEY,
            frames: frameKeys.map((frameKey) => ({
              key: BONUS_WON_CRACKLING_SHEET_TEXTURE_KEY,
              frame: frameKey
            })),
            frameRate: 44,
            repeat: 0
          });
        }
    
        this._symbolPopParticleFrameKeys = frameKeys;
        return frameKeys;
      },

    playSymbolPopParticleBurst(x, y, {
        depth = DEPTH_SYMBOLS + 4,
        scale = 1,
        intensity = 1
      } = {}) {
        const centerX = Number(x);
        const centerY = Number(y);
        if (!Number.isFinite(centerX) || !Number.isFinite(centerY)) return false;
    
        const frameKeys = this.ensureSymbolPopParticleFrames();
        if (frameKeys.length === 0) return false;
    
        const burstCount = Math.max(1, Math.min(2, Math.ceil(Number(intensity) || 1)));
        for (let index = 0; index < burstCount; index++) {
          const frameKey = frameKeys[Phaser.Math.Between(0, Math.max(0, Math.min(frameKeys.length - 1, 5)))];
          const burstScale = Phaser.Math.FloatBetween(0.24, 0.32) * Math.max(0.2, Number(scale) || 1);
          const pop = this.add.sprite(
            centerX + Phaser.Math.Between(-8, 8),
            centerY + Phaser.Math.Between(-7, 7),
            BONUS_WON_CRACKLING_SHEET_TEXTURE_KEY,
            frameKey
          )
            .setOrigin(0.5)
            .setDepth(depth + index * 0.01)
            .setScale(burstScale)
            .setAlpha(0.92)
            .setAngle(Phaser.Math.Between(-18, 18))
            .setTint(0xFFF1A8)
            .setBlendMode(Phaser.BlendModes.ADD);
          pop.isTransientSymbolPopParticleFx = true;
    
          if (this.anims?.exists?.(SYMBOL_POP_PARTICLE_ANIM_KEY)) {
            pop.play(SYMBOL_POP_PARTICLE_ANIM_KEY);
            pop.anims?.setProgress?.(Phaser.Math.FloatBetween(0, 0.12));
          }
    
          this.tweens.add({
            targets: pop,
            alpha: 0,
            scaleX: burstScale * Phaser.Math.FloatBetween(1.08, 1.22),
            scaleY: burstScale * Phaser.Math.FloatBetween(1.04, 1.18),
            duration: Phaser.Math.Between(360, 470),
            delay: index * Phaser.Math.Between(12, 34),
            ease: "Quad.easeOut",
            onComplete: () => {
              if (!pop.destroyed) {
                pop.destroy();
              }
            }
          });
        }
    
        return true;
      },

    getHeroLightningAuraLevel() {
        const bonusStage = Math.max(0, Math.floor(Number(this.currentBonusStage) || 0));
        const footprintSize = Math.max(1, Math.floor(Number(this.currentHeroFootprintSize) || 1));
        const wildStrength = Math.max(1, Math.floor(Number(this.currentMonkeyWildStrength) || 1));
        const rushLevel = this.currentHeroRushActive === true ? 3 : 0;
        const stormChargeLevel = Math.min(5, Math.floor(Math.max(0, Number(this.lightningCount) || 0) / 20));
        const textureLevel = this.currentHeroTextureKey === HERO_STAGE_TEXTURE_KEYS.giant3
          ? 6
          : this.currentHeroTextureKey === HERO_STAGE_TEXTURE_KEYS.giant2
            ? 4
            : this.currentHeroTextureKey === HERO_STAGE_TEXTURE_KEYS.rush
              ? 3
              : 1;
    
        return Phaser.Math.Clamp(
          Math.max(
            1,
            bonusStage,
            (footprintSize - 1) * 2 + 1,
            wildStrength,
            rushLevel,
            stormChargeLevel,
            textureLevel
          ),
          1,
          6
        );
      },

    shouldShowHeroAuraCrackleSparks() {
        const centerEnergyObjects = this.bonusWonCenterEnergyFx?.objects || [];
        const centerEnergyActive = Array.isArray(centerEnergyObjects) &&
          centerEnergyObjects.some((object) => object && !object.destroyed);
        return this.isInBonusMode === true ||
          this.bonusPermanentlyVisible === true ||
          centerEnergyActive;
      },

    createHeroLightningAura() {
        const hero = this.heroSprite;
        if (!hero || hero.destroyed) return null;
    
        const frameKeys = this.ensureHeroLightningAuraFrames();
        this.heroLightningAura = {
          container: null,
          outerGlow: null,
          innerGlow: null,
          bolts: [],
          frameKeys
        };
        return this.heroLightningAura;
      },

    updateHeroLightningAura() {
        const hero = this.heroSprite;
        if (!hero || hero.destroyed || !hero.scene) {
          this.clearHeroLightningAura();
          return;
        }
    
        const existingAura = this.heroLightningAura;
        const aura = existingAura && (!existingAura.container || !existingAura.container.destroyed)
          ? this.heroLightningAura
          : this.createHeroLightningAura();
        if (!aura) return;
    
        const level = this.getHeroLightningAuraLevel();
        const heroAlpha = Phaser.Math.Clamp(Number(hero.alpha ?? 1), 0, 1);
        if (hero.visible === false || heroAlpha <= 0.02) return;
    
        const heroWidth = Math.max(70, Number(hero.displayWidth) || 110);
        const heroHeight = Math.max(96, Number(hero.displayHeight) || 140);
        const strength = level / 6;
        const footprintSize = Math.max(1, Math.floor(Number(this.currentHeroFootprintSize) || 1));
        const footprintBoost = Math.max(0, Math.min(2, footprintSize - 1));
    
        if (aura.outerGlow && !aura.outerGlow.destroyed) {
          aura.outerGlow.destroy();
          aura.outerGlow = null;
        }
        if (aura.innerGlow && !aura.innerGlow.destroyed) {
          aura.innerGlow.destroy();
          aura.innerGlow = null;
        }
    
        this.maybeSpawnHeroLightningAuraSpark({ hero, level, strength, heroWidth, heroHeight, footprintSize, footprintBoost });
      },

    maybeSpawnHeroLightningAuraSpark({ hero, level, strength, heroWidth, heroHeight, footprintSize = 1, footprintBoost = 0 } = {}) {
        if (!hero || hero.destroyed || hero.visible === false) return;
    
        const now = Number(this.time?.now) || 0;
        if (now < Number(this._heroLightningAuraNextSparkAt || 0)) return;
    
        const sparkCount = 1 +
          (level >= 4 ? 1 : 0) +
          (footprintSize >= 2 ? 1 : 0) +
          (footprintSize >= 3 ? 1 : 0);
        for (let index = 0; index < sparkCount; index++) {
          this.spawnHeroLightningAuraSpark({
            hero,
            level,
            strength,
            heroWidth,
            heroHeight,
            footprintSize,
            footprintBoost,
            delay: index * 70
          });
        }
    
        const delayBoost = 1 - footprintBoost * 0.18;
        const minDelay = Phaser.Math.Linear(520, 220, strength) * delayBoost;
        const maxDelay = Phaser.Math.Linear(820, 360, strength) * delayBoost;
        this._heroLightningAuraNextSparkAt = now + Phaser.Math.Between(
          Math.floor(minDelay),
          Math.floor(maxDelay)
        );
      },

    spawnHeroLightningAuraSpark({ hero, level = 1, strength = 0.2, heroWidth = 110, heroHeight = 140, footprintSize = 1, footprintBoost = 0, delay = 0 } = {}) {
        const frameKeys = this.ensureHeroLightningAuraFrames();
        const crackleFrameKeys = this.shouldShowHeroAuraCrackleSparks()
          ? this.ensureHeroAuraCrackleSparkFrames()
          : [];
        if (!hero || hero.destroyed || frameKeys.length === 0) return;
    
        const frameKey = frameKeys[Phaser.Math.Between(0, frameKeys.length - 1)];
        const angle = Phaser.Math.FloatBetween(-Math.PI, Math.PI);
        const anchorRadiusX = heroWidth * Phaser.Math.FloatBetween(0.22, 0.38) * (1 + footprintBoost * 0.3);
        const anchorRadiusY = heroHeight * Phaser.Math.FloatBetween(0.12, 0.26) * (1 + footprintBoost * 0.3);
        const anchorX = hero.x + Math.cos(angle) * anchorRadiusX;
        const anchorY = hero.y + Math.sin(angle) * anchorRadiusY;
        const boltAngle = angle * 180 / Math.PI + 270 + Phaser.Math.Between(-10, 10);
        const baseScale = (heroHeight / 500) * Phaser.Math.FloatBetween(0.56, 0.78) * (1 + strength * 0.38) * (1 + footprintBoost * 0.34);
        const targetScaleY = baseScale * Phaser.Math.FloatBetween(0.22, 0.36) * (1 + footprintBoost * 0.52);
        const duration = Phaser.Math.Between(180, 280);
        const sparkAlpha = Phaser.Math.Clamp(0.92 + strength * 0.18 + footprintBoost * 0.05, 0.92, 1);
        const glowAlpha = Phaser.Math.Clamp(0.48 + strength * 0.22 + footprintBoost * 0.12, 0.48, 0.92);
        const sparkTint = footprintSize >= 3 ? 0xFFFFFF : (level >= 4 ? 0xFFF7B2 : 0xFFE778);
    
        this.time.delayedCall(delay, () => {
          if (!hero || hero.destroyed) return;
          const sparkDepth = (Number(hero.depth) || DEPTH_HERO) - 0.12;
          const glow = this.add.image(anchorX, anchorY, HERO_LIGHTNING_SHEET_TEXTURE_KEY, frameKey)
            .setOrigin(0.5, 1)
            .setScale(baseScale * 1.34, 0.02)
            .setAngle(boltAngle)
            .setDepth(sparkDepth - 0.01)
            .setAlpha(0)
            .setTint(0xFFB72A)
            .setBlendMode(Phaser.BlendModes.ADD);
          const spark = this.add.image(anchorX, anchorY, HERO_LIGHTNING_SHEET_TEXTURE_KEY, frameKey)
            .setOrigin(0.5, 1)
            .setScale(baseScale, 0.02)
            .setAngle(boltAngle)
            .setDepth(sparkDepth)
            .setAlpha(0)
            .setTint(sparkTint)
            .setBlendMode(Phaser.BlendModes.ADD);
          this.heroLightningAuraSparks.push(glow, spark);
    
          if (crackleFrameKeys.length > 0) {
            const crackleFrameKey = crackleFrameKeys[Phaser.Math.Between(0, crackleFrameKeys.length - 1)];
            const crackleScale = (heroHeight / 150) *
              Phaser.Math.FloatBetween(0.13, 0.2) *
              (1 + strength * 0.22) *
              (1 + footprintBoost * 0.2);
            const crackle = this.add.image(
              anchorX + Phaser.Math.Between(-12, 12),
              anchorY + Phaser.Math.Between(-10, 10),
              BONUS_WON_CRACKLING_SHEET_TEXTURE_KEY,
              crackleFrameKey
            )
              .setOrigin(0.5)
              .setScale(crackleScale)
              .setAngle(boltAngle + Phaser.Math.Between(-58, 58))
              .setDepth(sparkDepth + 0.02)
              .setAlpha(0)
              .setTint(footprintSize >= 3 ? 0xFFFFFF : 0xFFE66D)
              .setBlendMode(Phaser.BlendModes.ADD);
            this.heroLightningAuraSparks.push(crackle);
    
            this.tweens.add({
              targets: crackle,
              alpha: Phaser.Math.Clamp(0.74 + strength * 0.26, 0.74, 1),
              scaleX: crackleScale * 1.08,
              scaleY: crackleScale * 1.08,
              duration: Phaser.Math.Between(42, 70),
              hold: Phaser.Math.Between(28, 70),
              yoyo: true,
              ease: "Linear",
              onComplete: () => {
                this.heroLightningAuraSparks = this.heroLightningAuraSparks.filter((entry) => entry !== crackle);
                if (!crackle.destroyed) crackle.destroy();
              }
            });
          }
    
          this.tweens.add({
            targets: { progress: 0 },
            progress: 1,
            duration,
            ease: "Cubic.easeOut",
            onUpdate: (tween) => {
              if (spark.destroyed || glow.destroyed) return;
              const progress = Phaser.Math.Clamp(Number(tween?.getValue?.() || 0), 0, 1);
              const reveal = progress < 0.34
                ? Phaser.Math.Easing.Cubic.Out(progress / 0.34)
                : 1;
              const fade = progress < 0.5
                ? progress / 0.5
                : 1 - ((progress - 0.5) / 0.5);
              const easedFade = Phaser.Math.Clamp(fade, 0, 1);
              spark.setScale(baseScale, Math.max(0.02, targetScaleY * reveal));
              glow.setScale(baseScale * 1.34, Math.max(0.02, targetScaleY * 1.06 * reveal));
              spark.setAlpha(sparkAlpha * easedFade);
              glow.setAlpha(glowAlpha * easedFade);
            },
            onComplete: () => {
              this.heroLightningAuraSparks = this.heroLightningAuraSparks.filter((entry) => entry !== spark && entry !== glow);
              if (!glow.destroyed) glow.destroy();
              if (!spark.destroyed) spark.destroy();
            }
          });
        });
      },

    clearHeroLightningAura() {
        const aura = this.heroLightningAura;
        if (Array.isArray(this.heroLightningAuraSparks)) {
          this.heroLightningAuraSparks.forEach((spark) => {
            if (spark && !spark.destroyed) {
              this.tweens.killTweensOf(spark);
              spark.destroy();
            }
          });
          this.heroLightningAuraSparks = [];
        }
        if (!aura) return;
        const elements = [
          aura.outerGlow,
          aura.innerGlow,
          ...(Array.isArray(aura.bolts) ? aura.bolts : [])
        ];
        elements.forEach((element) => {
          if (element && !element.destroyed) {
            element.destroy();
          }
        });
        if (aura.container && !aura.container.destroyed) {
          aura.container.destroy();
        }
        this.heroLightningAura = null;
      },

    spawnOrbCollectLightningSpark({
        x,
        y,
        targetX,
        targetY,
        color = 0x1EFF90,
        orbSize = 10,
        progress = 0,
        depth = 105,
        lengthScale = 1,
        widthScale = 1,
        alphaScale = 1,
        angleJitter = 18
      } = {}) {
        const frameKeys = this.ensureHeroLightningAuraFrames();
        if (frameKeys.length === 0) return;
    
        const numericColor = Number(color);
        const resolvedColor = Number.isFinite(numericColor) ? numericColor : 0x1EFF90;
        const resolvedOrbSize = Math.max(10, Number(orbSize) || 10);
        const resolvedProgress = Phaser.Math.Clamp(Number(progress) || 0, 0, 1);
        const resolvedLengthScale = Math.max(0.25, Number(lengthScale) || 1);
        const resolvedWidthScale = Math.max(0.25, Number(widthScale) || 1);
        const resolvedAlphaScale = Math.max(0.2, Number(alphaScale) || 1);
        const resolvedAngleJitter = Math.max(0, Number(angleJitter) || 0);
        const travelAngle = Phaser.Math.Angle.Between(x, y, targetX, targetY);
        const sideAngle = travelAngle + Math.PI / 2;
        const leadDistance = Phaser.Math.FloatBetween(-resolvedOrbSize * 0.35, resolvedOrbSize * 0.85);
        const sideDistance = Phaser.Math.FloatBetween(-resolvedOrbSize * 1.25, resolvedOrbSize * 1.25);
        const anchorX = x + Math.cos(travelAngle) * leadDistance + Math.cos(sideAngle) * sideDistance;
        const anchorY = y + Math.sin(travelAngle) * leadDistance + Math.sin(sideAngle) * sideDistance;
        const frameKey = frameKeys[Phaser.Math.Between(0, frameKeys.length - 1)];
        const boltAngle = travelAngle * 180 / Math.PI + 270 + Phaser.Math.Between(-resolvedAngleJitter, resolvedAngleJitter);
        const scaleBoost = 1 + resolvedProgress * 0.48;
        const rawBaseScale = (resolvedOrbSize / 95) * Phaser.Math.FloatBetween(0.92, 1.18) * scaleBoost * resolvedWidthScale;
        const maxBaseScale = Math.max(0.11, 0.34 * resolvedWidthScale);
        const baseScale = Phaser.Math.Clamp(rawBaseScale, 0.11, maxBaseScale);
        const targetScaleY = Phaser.Math.Clamp(
          baseScale * Phaser.Math.FloatBetween(1.18, 1.86) * resolvedLengthScale * scaleBoost,
          0.12,
          0.62 * resolvedLengthScale
        );
        const duration = Phaser.Math.Between(170, 285);
        const sparkTintChoices = [0x1EFF90, 0x41E169, 0x78FFD2, 0xC8FFE8, resolvedColor];
        const sparkTint = sparkTintChoices[Phaser.Math.Between(0, sparkTintChoices.length - 1)];
        const glowTint = resolvedProgress > 0.6 ? 0x78FFD2 : resolvedColor;
        const sparkAlpha = Phaser.Math.Clamp((0.88 + resolvedProgress * 0.16) * resolvedAlphaScale, 0, 1);
        const glowAlpha = Phaser.Math.Clamp((0.52 + resolvedProgress * 0.2) * resolvedAlphaScale, 0, 0.92);
    
        const glow = this.add.image(anchorX, anchorY, HERO_LIGHTNING_SHEET_TEXTURE_KEY, frameKey)
          .setOrigin(0.5, 1)
          .setScale(baseScale * 1.85, 0.02)
          .setAngle(boltAngle)
          .setDepth(depth - 0.01)
          .setAlpha(0)
          .setTint(glowTint)
          .setBlendMode(Phaser.BlendModes.ADD);
        const spark = this.add.image(anchorX, anchorY, HERO_LIGHTNING_SHEET_TEXTURE_KEY, frameKey)
          .setOrigin(0.5, 1)
          .setScale(baseScale, 0.02)
          .setAngle(boltAngle)
          .setDepth(depth)
          .setAlpha(0)
          .setTint(sparkTint)
          .setBlendMode(Phaser.BlendModes.ADD);
    
        this.tweens.add({
          targets: { progress: 0 },
          progress: 1,
          duration,
          ease: "Cubic.easeOut",
          onUpdate: (tween) => {
            if (spark.destroyed || glow.destroyed) return;
            const rawProgress = typeof tween?.getValue === "function" ? tween.getValue() : tween?.progress;
            const sparkProgress = Phaser.Math.Clamp(Number(rawProgress) || 0, 0, 1);
            const reveal = sparkProgress < 0.28
              ? Phaser.Math.Easing.Cubic.Out(sparkProgress / 0.28)
              : 1;
            const fade = sparkProgress < 0.42
              ? sparkProgress / 0.42
              : 1 - ((sparkProgress - 0.42) / 0.58);
            const easedFade = Phaser.Math.Clamp(fade, 0, 1);
            spark.setScale(baseScale, Math.max(0.02, targetScaleY * reveal));
            glow.setScale(baseScale * 1.85, Math.max(0.02, targetScaleY * 1.12 * reveal));
            spark.setAlpha(sparkAlpha * easedFade);
            glow.setAlpha(glowAlpha * easedFade);
          },
          onComplete: () => {
            if (!glow.destroyed) glow.destroy();
            if (!spark.destroyed) spark.destroy();
          }
        });
      },

    playMonkeySymbolClearLightningBurst(x, y, {
        depth = DEPTH_HERO + 7,
        radius = 42,
        boltCount = 4,
        color = 0xFFF4A6,
        intensityScale = 1
      } = {}) {
        const centerX = Number(x);
        const centerY = Number(y);
        if (!Number.isFinite(centerX) || !Number.isFinite(centerY)) return;
    
        const resolvedIntensity = Phaser.Math.Clamp(Number(intensityScale) || 1, 0.3, 1.35);
        const resolvedRadius = Math.max(16, Number(radius) || 42);
        const resolvedBoltCount = Math.max(2, Math.floor(Number(boltCount) || 4));
        const resolvedColor = Number.isFinite(Number(color)) ? Number(color) : 0xFFF4A6;
    
        const flash = this.add.circle(centerX, centerY, 16, resolvedColor, 0.22 * resolvedIntensity)
          .setDepth(depth - 0.2)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setScale(0.35);
        this.tweens.add({
          targets: flash,
          scale: 1.8,
          alpha: 0,
          duration: 190,
          ease: "Cubic.easeOut",
          onComplete: () => {
            if (!flash.destroyed) flash.destroy();
          }
        });
    
        for (let index = 0; index < resolvedBoltCount; index++) {
          const angle = (index / resolvedBoltCount) * Math.PI * 2 + Phaser.Math.FloatBetween(-0.34, 0.34);
          const startRadius = Phaser.Math.FloatBetween(2, 8);
          const endRadius = resolvedRadius * Phaser.Math.FloatBetween(0.45, 0.86);
          this.spawnOrbCollectLightningSpark({
            x: centerX + Math.cos(angle) * startRadius,
            y: centerY + Math.sin(angle) * startRadius,
            targetX: centerX + Math.cos(angle) * endRadius,
            targetY: centerY + Math.sin(angle) * endRadius,
            color: resolvedColor,
            orbSize: 13,
            progress: 0.78,
            depth,
            lengthScale: 0.42,
            widthScale: 0.55 * Math.sqrt(resolvedIntensity),
            alphaScale: 0.68 * resolvedIntensity,
            angleJitter: 16
          });
        }
      },

    spawnCenterCollectGreenLightningBurst({
        x,
        y,
        boltCount = 4,
        radius = 48,
        color = 0x1EFF90,
        orbSize = 18,
        depth = 108,
        intensityScale = 1,
        lightningLengthScale = 1
      } = {}) {
        const centerX = Number(x);
        const centerY = Number(y);
        if (!Number.isFinite(centerX) || !Number.isFinite(centerY)) return;
    
        const numericIntensityScale = Number(intensityScale);
        const resolvedIntensityScale = Phaser.Math.Clamp(
          Number.isFinite(numericIntensityScale) ? numericIntensityScale : 1,
          0.25,
          1.5
        );
        const numericLengthScale = Number(lightningLengthScale);
        const resolvedLengthScale = Phaser.Math.Clamp(
          Number.isFinite(numericLengthScale) ? numericLengthScale : 1,
          0.35,
          1.2
        );
        const resolvedBoltCount = Math.max(1, Math.floor(Number(boltCount) || 4));
        const resolvedRadius = Math.max(24, Number(radius) || 92);
        const numericColor = Number(color);
        const resolvedColor = Number.isFinite(numericColor) ? numericColor : 0x1EFF90;
        const flash = this.add.circle(centerX, centerY, Math.max(12, Number(orbSize) || 18), resolvedColor, 0.3 * resolvedIntensityScale)
          .setDepth(depth - 0.5)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setScale(0.38);
        const ring = this.add.circle(centerX, centerY, Math.max(24, resolvedRadius * 0.34), 0x78FFD2, 0)
          .setDepth(depth - 0.4)
          .setStrokeStyle(3 * Math.sqrt(resolvedIntensityScale), 0x78FFD2, 0.78 * resolvedIntensityScale)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setScale(0.35);
    
        this.tweens.add({
          targets: flash,
          scale: 1.35,
          alpha: 0,
          duration: 260,
          ease: "Cubic.easeOut",
          onComplete: () => {
            if (!flash.destroyed) flash.destroy();
          }
        });
        this.tweens.add({
          targets: ring,
          scale: 1.32,
          alpha: 0,
          duration: 340,
          ease: "Cubic.easeOut",
          onComplete: () => {
            if (!ring.destroyed) ring.destroy();
          }
        });
    
        for (let index = 0; index < resolvedBoltCount; index++) {
          const angle = (index / resolvedBoltCount) * Math.PI * 2 + Phaser.Math.FloatBetween(-0.26, 0.26);
          const startRadius = Phaser.Math.FloatBetween(1, 8);
          const endRadius = resolvedRadius * resolvedLengthScale * Phaser.Math.FloatBetween(0.52, 0.9);
          this.spawnOrbCollectLightningSpark({
            x: centerX + Math.cos(angle) * startRadius,
            y: centerY + Math.sin(angle) * startRadius,
            targetX: centerX + Math.cos(angle) * endRadius,
            targetY: centerY + Math.sin(angle) * endRadius,
            color: resolvedColor,
            orbSize,
            progress: 1,
            depth,
            lengthScale: 0.72 * resolvedLengthScale,
            widthScale: 0.82 * Math.sqrt(resolvedIntensityScale),
            alphaScale: 1.12 * resolvedIntensityScale,
            angleJitter: 9
          });
        }
      },

    createOrUpdateHero(reels) {
        const cellSize = 70;
        const heroId = clientConfig.symbolsMapping?.hero || 10;
        
        // Find hero position in reels
        if (!reels) return;
        
        // Check if hero exists
        let heroFound = false;
        let heroReel, heroRow;
        
        for (let reel = 0; reel < clientConfig.area.width; reel++) {
          const column = reels[reel];
          if (!column) continue;
          
          for (let row = 0; row < clientConfig.area.height; row++) {
            if (column[row] === heroId) {
              heroFound = true;
              heroReel = reel;
              heroRow = row;
              break;
            }
          }
          if (heroFound) break;
        }
        
        if (heroFound) {
          const footprintSize = Math.max(1, Math.floor(Number(this.currentHeroFootprintSize) || 1));
          this.currentHeroAnchor = { reel: heroReel, row: heroRow };
          const heroCenter = this.getHeroAnchorCenter(heroReel, heroRow, footprintSize);
          const heroX = heroCenter.x;
          const heroY = heroCenter.y;
          
          const heroTexture = getHeroTexture(this.currentHeroWeapon || "staff", {
            footprintSize,
            rushActive: this.currentHeroRushActive === true,
            bonusStage: this.currentBonusStage
          });
          const heroScale = getHeroScaleForFootprint(footprintSize, heroTexture);
          this.currentHeroTextureKey = heroTexture;
          
          if (this.heroSprite && !this.heroSprite.destroyed) {
            // Update existing hero position and texture
            this.heroSprite.setPosition(heroX, heroY);
            this.heroSprite.setTexture(heroTexture);
            this.heroSprite.setScale(heroScale);
          } else {
            // Create new hero sprite with correct weapon texture
            this.heroSprite = this.add.image(heroX, heroY, heroTexture)
              .setOrigin(0.5)
              .setScale(heroScale)
              .setDepth(DEPTH_HERO); // Above symbols, bananas, AND house
          }
        }
        // DON'T destroy hero here if not found - it should persist during respins
        // Hero is only destroyed on executedAction === 'spin' in dropSymbols()
      },

    createBloodSplatter(x, y) {
        // Initialize blood array if not exists
        if (!this.bloodSplatters) {
          this.bloodSplatters = [];
        }
        
        // Deep dark blood reds from the legacy draugr/zombie pass.
        const bloodColors = [0x3D0000, 0x4A0000, 0x2D0000, 0x380000, 0x420000];
        
        // Create fewer splatter particles (subtle)
        const splatterCount = 3 + Math.floor(Math.random() * 3); // 3-5 splatters
        
        for (let i = 0; i < splatterCount; i++) {
          // Random offset from kill position
          const offsetX = (Math.random() - 0.5) * 60;
          const offsetY = (Math.random() - 0.5) * 60;
          
          // Smaller size for subtlety
          const size = 6 + Math.random() * 12;
          
          // Random color from blood palette
          const color = bloodColors[Math.floor(Math.random() * bloodColors.length)];
          
          // Create irregular blood shape using ellipse with random stretch
          const stretchX = 0.5 + Math.random() * 1.2;
          const stretchY = 0.5 + Math.random() * 1.2;
          
          const blood = this.add.ellipse(
            x + offsetX, 
            y + offsetY, 
            size * stretchX, 
            size * stretchY, 
            color
          )
            .setAlpha(0.2 + Math.random() * 0.15) // 0.2-0.35 alpha (much more subtle)
            .setDepth(5) // Behind symbols
            .setRotation(Math.random() * Math.PI * 2);
          
          // Subtle animation
          this.tweens.add({
            targets: blood,
            scaleX: 1.1,
            scaleY: 1.1,
            alpha: blood.alpha * 0.9,
            duration: 150,
            ease: 'Power2.easeOut'
          });
          
          this.bloodSplatters.push(blood);
        }
        
        // One slightly larger central splatter (still subtle)
        const mainSplatter = this.add.ellipse(
          x + (Math.random() - 0.5) * 15,
          y + (Math.random() - 0.5) * 15,
          15 + Math.random() * 10,
          12 + Math.random() * 10,
          0x3D0000
        )
          .setAlpha(0.25)
          .setDepth(5)
          .setRotation(Math.random() * Math.PI * 2);
        
        this.tweens.add({
          targets: mainSplatter,
          scaleX: 1.15,
          scaleY: 1.15,
          alpha: 0.2,
          duration: 200,
          ease: 'Power2.easeOut'
        });
        
        this.bloodSplatters.push(mainSplatter);
      },

    clearBloodSplatters() {
        if (!this.bloodSplatters || this.bloodSplatters.length === 0) return;
        
        // Fade out all blood splatters
        this.bloodSplatters.forEach(blood => {
          if (blood && !blood.destroyed) {
            this.tweens.add({
              targets: blood,
              alpha: 0,
              duration: 500,
              ease: 'Power2.easeOut',
              onComplete: () => {
                if (blood && !blood.destroyed) {
                  blood.destroy();
                }
              }
            });
          }
        });
        
        // Clear the array
        this.bloodSplatters = [];
      },

    getCollectFallImpactColor(symbolId = null, fallbackColor = 0xFFE082) {
        const parsed = Number(symbolId);
        if (!Number.isFinite(parsed)) {
          return fallbackColor;
        }
    
        const palette = {
          1: 0xFFD86B,
          2: 0xDDE6F3,
          3: 0xD99652,
          4: 0x9CFFC3,
          5: 0x7AD7FF,
          6: 0xC49BFF,
          7: 0xFFB06A
        };
        return palette[parsed] || fallbackColor;
      },

    createCollectFallImpact(x, y, {
        symbolId = null,
        color = null,
        radius = 22,
        depth = DEPTH_HERO + 4,
        durationMs = COLLECT_FALL_IMPACT_DURATION_MS
      } = {}) {
        if (!Number.isFinite(Number(x)) || !Number.isFinite(Number(y))) return;
    
        const impactColor = color !== null && color !== undefined && Number.isFinite(Number(color))
          ? Number(color)
          : this.getCollectFallImpactColor(symbolId);
        const resolvedRadius = Math.max(8, Number(radius) || 22);
        const resolvedDuration = Math.max(350, Math.floor(Number(durationMs) || COLLECT_FALL_IMPACT_DURATION_MS));
    
        const stain = this.add.ellipse(x, y + 3, resolvedRadius * 2.1, resolvedRadius * 0.82, impactColor, 0.2)
          .setDepth(depth - 0.2);
        const glow = this.add.circle(x, y, resolvedRadius * 0.72, impactColor, 0.24)
          .setDepth(depth)
          .setBlendMode(Phaser.BlendModes.ADD);
        const ring = this.add.circle(x, y, resolvedRadius * 0.55, impactColor, 0)
          .setStrokeStyle(3, impactColor, 0.62)
          .setDepth(depth + 0.1)
          .setBlendMode(Phaser.BlendModes.ADD);
    
        this.tweens.add({
          targets: stain,
          scaleX: 1.35,
          scaleY: 1.15,
          alpha: 0,
          duration: resolvedDuration,
          ease: "Sine.easeOut",
          onComplete: () => stain.destroy()
        });
        this.tweens.add({
          targets: glow,
          scale: 1.75,
          alpha: 0,
          duration: resolvedDuration,
          ease: "Cubic.easeOut",
          onComplete: () => glow.destroy()
        });
        this.tweens.add({
          targets: ring,
          scale: 2.15,
          alpha: 0,
          duration: resolvedDuration,
          ease: "Cubic.easeOut",
          onComplete: () => ring.destroy()
        });
      },

    spawnCenterOrbVortexPulse(x, y, color = 0x7CFFB2) {
        if (!Number.isFinite(Number(x)) || !Number.isFinite(Number(y))) return;
    
        const outer = this.add.circle(x, y, 12, color, 0)
          .setStrokeStyle(3, color, 0.75)
          .setDepth(110)
          .setBlendMode(Phaser.BlendModes.ADD);
        const inner = this.add.circle(x, y, 6, 0xFFFFFF, 0.25)
          .setDepth(111)
          .setBlendMode(Phaser.BlendModes.ADD);
    
        this.tweens.add({
          targets: outer,
          radius: 40,
          alpha: 0,
          angle: 240,
          duration: 240,
          ease: "Cubic.easeOut",
          onComplete: () => outer.destroy()
        });
        this.tweens.add({
          targets: inner,
          scale: 2.2,
          alpha: 0,
          duration: 220,
          ease: "Cubic.easeOut",
          onComplete: () => inner.destroy()
        });
    
        for (let i = 0; i < 6; i++) {
          const angle = (Math.PI * 2 * i) / 6;
          const spark = this.add.circle(x, y, 1.8, color, 0.85)
            .setDepth(112)
            .setBlendMode(Phaser.BlendModes.ADD);
          this.tweens.add({
            targets: spark,
            x: x + Math.cos(angle + Math.PI * 0.9) * Phaser.Math.Between(14, 28),
            y: y + Math.sin(angle + Math.PI * 0.9) * Phaser.Math.Between(14, 28),
            alpha: 0,
            scale: 0.25,
            duration: Phaser.Math.Between(170, 260),
            ease: "Sine.easeOut",
            onComplete: () => spark.destroy()
          });
        }
      },

    showCenterLootPayLabel(value, x, y) {
        const numericValue = Number(value);
        if (!Number.isFinite(numericValue) || numericValue <= 0) return;
        const label = `+${Number(numericValue.toFixed(2)).toString().replace(/\.00$/, "")}`;
        const popup = this.add.text(x, y - 10, label, {
          fontFamily: "Arial",
          fontSize: "26px",
          fontStyle: "bold",
          color: "#FFE082",
          stroke: "#2A1400",
          strokeThickness: 5
        })
          .setOrigin(0.5)
          .setDepth(210)
          .setAlpha(0.95);
    
        this.tweens.add({
          targets: popup,
          y: popup.y - 48,
          alpha: 0,
          scale: 1.12,
          duration: 560,
          ease: "Cubic.easeOut",
          onComplete: () => popup.destroy()
        });
      },

    dropEnergyOrbs(x, y, count, orbSize, orbColors, fallDuration, suckDuration) {
        // Calculate house center position (with offset)
        const houseX = 3.5 * 70 + 70 / 2 + GRID_OFFSET_X; // Center of reels 3-4
        const houseY = (clientConfig.area.height - 1 - 3.5) * 70 + 70 / 2 + GRID_OFFSET_Y; // Center of rows 3-4
        
        const orbSpacing = 20; // Space between orbs when lined up
        const pauseDuration = 50; // Very short pause before moving to house
        const slowedFallDuration = Math.round(Math.max(1, Number(fallDuration) || 1) * COLLECT_FALL_SPEED_MULTIPLIER);
        
        const orbs = [];
        const glows = [];
        
        // Capture the current action when orbs are created
        const actionWhenCreated = this.currentAction;
        
        // Create all orbs at once
        for (let i = 0; i < count; i++) {
          const color = orbColors[Math.floor(Math.random() * orbColors.length)];
          
          // Create neon glow layers (multiple layers for intense glow)
          // Outer glow (largest)
          const outerGlow = this.add.circle(x, y, orbSize * 3, color)
            .setAlpha(0.15)
            .setDepth(101) // Above house (house is 100)
            .setBlendMode(Phaser.BlendModes.ADD);
          
          // Middle glow
          const middleGlow = this.add.circle(x, y, orbSize * 2, color)
            .setAlpha(0.4)
            .setDepth(102)
            .setBlendMode(Phaser.BlendModes.ADD);
          
          // Inner glow
          const innerGlow = this.add.circle(x, y, orbSize * 1.3, color)
            .setAlpha(0.6)
            .setDepth(103);
          
          // Core orb (brightest)
          const orb = this.add.circle(x, y, orbSize, color)
            .setAlpha(1)
            .setDepth(104);
          
          orbs.push(orb);
          glows.push({ outer: outerGlow, middle: middleGlow, inner: innerGlow });
          
          const glowLayers = glows[i];
          const allTargets = [orb, glowLayers.outer, glowLayers.middle, glowLayers.inner];
          
          // Set distinct directions for each orb count with some randomness
          let angle;
          const randomVariation = (Math.random() - 0.5) * 0.4; // ±0.2 radians (~11°) variation
          
          if (count === 1) {
            // 1 orb: shoot up
            angle = -Math.PI / 2 + randomVariation; // Up
          } else if (count === 2) {
            // 2 orbs: right-up and left-up
            if (i === 0) {
              angle = -Math.PI / 4 + randomVariation; // Right-up (45°)
            } else {
              angle = -3 * Math.PI / 4 + randomVariation; // Left-up (135°)
            }
          } else if (count === 3) {
            // 3 orbs: right-up, left-up, down
            if (i === 0) {
              angle = -Math.PI / 4 + randomVariation; // Right-up (45°)
            } else if (i === 1) {
              angle = -3 * Math.PI / 4 + randomVariation; // Left-up (135°)
            } else {
              angle = Math.PI / 2 + randomVariation; // Down (90°)
            }
          } else {
            // For any other count, divide evenly
            const sectionAngle = (Math.PI * 2) / count;
            angle = (i * sectionAngle) - Math.PI / 2 + randomVariation;
          }
          
          const floatDistance = 50 + Math.random() * 15; // 50-65px with variation
          const floatX = x + Math.cos(angle) * floatDistance;
          const floatY = y + Math.sin(angle) * floatDistance;
          
          // Phase 1: Float/drift in random direction
          this.tweens.add({
            targets: allTargets,
            x: floatX,
            y: floatY,
            duration: slowedFallDuration, // Slightly slower so landing positions read.
            ease: 'Sine.easeOut', // Smooth floating motion
            onComplete: () => {
              this.createCollectFallImpact(orb.x, orb.y, {
                color,
                radius: Math.max(14, orbSize * 2.2),
                depth: 99,
                durationMs: COLLECT_FALL_IMPACT_DURATION_MS
              });
              // Phase 2: Wait a bit while floating, then move to house
              setTimeout(() => {
                // Stagger arrival at house slightly for readability
                const arrivalDelay = i * 80; // Each orb arrives 80ms after the previous
                let nextLightningAt = 0;
                const emitCollectLightning = (collectProgress = 0, immediate = false) => {
                  if (!orb || orb.destroyed || !orb.scene) return;
                  const now = Number(this.time?.now) || 0;
                  if (!immediate && now < nextLightningAt) return;
                  this.spawnOrbCollectLightningSpark({
                    x: orb.x,
                    y: orb.y,
                    targetX: houseX,
                    targetY: houseY,
                    color,
                    orbSize,
                    progress: collectProgress,
                    depth: 106
                  });
                  nextLightningAt = now + Phaser.Math.Between(52, 88);
                };
                
                this.tweens.add({
                  targets: allTargets,
                  x: houseX,
                  y: houseY,
                  scaleX: 0.3,
                  scaleY: 0.3,
                  alpha: 0,
                  duration: suckDuration + arrivalDelay,
                  ease: 'Power3.easeIn', // Accelerating for power feel
                  onStart: () => {
                    emitCollectLightning(0, true);
                  },
                  onUpdate: (tween) => {
                    const collectProgress = Phaser.Math.Clamp(Number(tween?.progress) || 0, 0, 1);
                    emitCollectLightning(collectProgress);
                  },
                  onComplete: () => {
                    // Check if we're still in the same action sequence
                    // If action changed to 'spin' or 'freespin', this is a stale orb - ignore it
                    const isStaleOrb = (this.currentAction === 'spin' || this.currentAction === 'freespin') 
                                       && this.currentAction !== actionWhenCreated;
                    
                    if (!isStaleOrb) {
                      // Play orb collect sound
                      this.playSfx('orb_collect', { volume: 2.0 });
                      this.currentMultiplier = (this.currentMultiplier || 1) + 1;
                      this.createOrUpdateHouse(this.currentMultiplier);
                      this.flashMultiplierUpgrade();
                      this.spawnCenterOrbVortexPulse(houseX, houseY, color);
                      this.spawnCenterCollectGreenLightningBurst({
                        x: houseX,
                        y: houseY,
                        boltCount: Phaser.Math.Between(2, 3),
                        radius: Phaser.Math.Between(30, 46),
                        color,
                        orbSize: Math.max(14, orbSize * 1.15),
                        depth: 108,
                        intensityScale: 0.6,
                        lightningLengthScale: 0.58
                      });
                    }
                    
                    // Always destroy the orb sprite (even if stale)
                    orb.destroy();
                    glowLayers.outer.destroy();
                    glowLayers.middle.destroy();
                    glowLayers.inner.destroy();
                  }
                });
              }, pauseDuration);
            }
          });
          
          // Add gentle bobbing motion while floating (weightless effect)
          this.tweens.add({
            targets: allTargets,
            y: `+=${8}`, // Gentle up/down bob
            duration: 800 + Math.random() * 400, // Slightly different timing for each orb
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
          });
          
          // Pulsing neon glow effect - all layers pulse together
          this.tweens.add({
            targets: [glowLayers.outer, glowLayers.middle],
            scale: 1.3,
            alpha: { from: 0.15, to: 0.4 },
            duration: 400,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
          });
        }
      },

    dropGoldPile(x, y, value, tier = 'id1') {
        // Play gold drop sound
        this.playSfx('gold_drop', { volume: 0.4 });
        
        // Add some randomness to landing position
        const randomOffsetX = (Math.random() - 0.5) * 40; // ±20px
        const randomOffsetY = (Math.random() - 0.5) * 40; // ±20px
        const landX = x + randomOffsetX;
        const landY = y + randomOffsetY + 30; // Below kill position
        
        // Launch position - just slightly above kill position (minimal upward movement)
        const startX = x + (Math.random() - 0.5) * 15;
        const startY = y - 10; // Just 10px above, almost straight fall
        
        // Configure visuals based on tier
        let sparkleCount, goldColors, diamondChance, glowIntensity, sparkleSize;
        
        switch(tier) {
          case 'id4': // Legendary (10x) - DIAMONDS AND GOLD!
            sparkleCount = 40; // More sparkles for a bigger pile
            goldColors = [
              0xFFD700, // Bright gold
              0xFFE55C, // Light gold
              0xFFF700, // Yellow gold
              0xF0E68C  // Khaki gold
            ];
            diamondChance = 0.80; // 80% of sparkles are jewels (~32 jewels, ~8 gold coins)
            glowIntensity = 0.15;
            sparkleSize = { min: 3.5, max: 6 }; // Slightly bigger jewels
            break;
            
          case 'id3': // Great (1x) - Very luxurious
            sparkleCount = 35;
            goldColors = [
              0xFFD700, // Gold
              0xF4C430, // Saffron
              0xDAA520, // Goldenrod
              0xEEC900  // Deep yellow
            ];
            diamondChance = 0.50; // 50% diamonds (~17-18 jewels, ~17-18 gold coins)
            glowIntensity = 0.12;
            sparkleSize = { min: 2.5, max: 4.5 };
            break;
            
          case 'id2': // Good (0.5x) - More luxurious
            sparkleCount = 25;
            goldColors = [
              0xD4AF37, // Gold
              0xDAA520, // Goldenrod
              0xB8860B, // Dark goldenrod
              0xD4A017  // Orange gold
            ];
            diamondChance = 0.05; // 5% diamonds
            glowIntensity = 0.10;
            sparkleSize = { min: 2.5, max: 4 };
            break;
            
          case 'id1': // Basic (0.1-0.2x) - Similar to id2 but no jewels
          default:
            sparkleCount = 24; // Same as id2
            goldColors = [
              0xD4AF37, // Gold (same as id2)
              0xDAA520, // Goldenrod (same as id2)
              0xB8860B, // Dark goldenrod (same as id2)
              0xD4A017  // Orange gold (same as id2)
            ];
            diamondChance = 0; // No jewels
            glowIntensity = 0.10; // Same as id2
            sparkleSize = { min: 2.5, max: 4 }; // Same as id2
            break;
        }
        
        const goldSparkles = [];
        const goldGlows = [];
        // Keep legacy draugr feel: short, heavy pile landing before vortex collection.
        const goldDropDuration = 220;
        const goldLandingFxDelay = 280;
        
        // Track if grail has been used (only one per pile for id4)
        let grailUsed = false;
        
        // Track jewel count for id3 (multiple jewels allowed)
        let id3_jewelCount = 0;
        
        // Track jewel used for id2 (one green)
        let id2_greenUsed = false;
        
        // Create sparkle pile - MUCH FLATTER spread
        for (let i = 0; i < sparkleCount; i++) {
          const size = sparkleSize.min + Math.random() * (sparkleSize.max - sparkleSize.min);
          
          // Decide if this sparkle is a diamond (only for higher tiers)
          const isDiamond = Math.random() < diamondChance;
          
          // Random offset for pile spread - higher tiers are taller/more stacked
          const spreadX = (Math.random() - 0.5) * 70; // Much wider spread
          
          // Pile height increases with tier value
          let pileHeight;
          switch(tier) {
            case 'id4': pileHeight = 30; break; // Legendary: Extra tall treasure mountain
            case 'id3': pileHeight = 14; break; // Great: Tall
            case 'id2': pileHeight = 10; break; // Good: Medium
            case 'id1': 
            default:    pileHeight = 6;  break; // Basic: Flat
          }
          const spreadY = (Math.random() - 0.5) * pileHeight;
          
          const posX = startX + spreadX;
          const posY = startY + spreadY;
          
          let sparkle, glow;
          
          // Use jewel images for legendary (id4) diamonds
          if (isDiamond && tier === 'id4') {
            let jewelType;
            
            // GUARANTEED GRAIL: First diamond is always the grail
            if (!grailUsed) {
              jewelType = 'jewel_grail';
              grailUsed = true;
            } else {
              // After grail, pick random jewel (no grail in pool)
              const availableJewels = ['jewel_red', 'jewel_green', 'jewel_blue', 'jewel_yellow'];
              jewelType = availableJewels[Math.floor(Math.random() * availableJewels.length)];
            }
            
            // Create jewel sprite (20% smaller: 0.08 * 0.8 = 0.064)
            sparkle = this.add.sprite(posX, posY, jewelType)
              .setAlpha(0)
              .setDepth(108) // Diamonds on top
              .setScale(0.064); // 20% smaller than before
            
            // Random rotation for variety (grail can tilt slightly)
            if (jewelType === 'jewel_grail') {
              sparkle.setAngle((Math.random() - 0.5) * 15); // ±7.5 degrees
            } else {
              sparkle.setAngle(Math.random() * 360); // Full rotation for other jewels
            }
            
            // Glow behind jewel (matching color)
            const glowColors = {
              'jewel_red': 0xFF4477,
              'jewel_green': 0x44FFAA,
              'jewel_blue': 0x44CCFF,
              'jewel_yellow': 0xFFFF88,
              'jewel_grail': 0xFFDD88
            };
            const glowColor = glowColors[jewelType] || 0xFFFFFF;
            
            glow = this.add.circle(posX, posY, 8, glowColor)
              .setAlpha(0)
              .setDepth(107)
              .setBlendMode(Phaser.BlendModes.ADD);
              
          } else if (isDiamond && tier === 'id3') {
            // id3: Multiple jewels (green, blue, red, yellow)
            id3_jewelCount++;
            
            // Pick random jewel type from available jewels (no grail)
            const availableJewels = ['jewel_green', 'jewel_blue', 'jewel_red', 'jewel_yellow'];
            const jewelType = availableJewels[Math.floor(Math.random() * availableJewels.length)];
            
            // Create jewel sprite
            sparkle = this.add.sprite(posX, posY, jewelType)
              .setAlpha(0)
              .setDepth(108)
              .setScale(0.064);
            
            sparkle.setAngle(Math.random() * 360); // Random rotation
            
            // Glow behind jewel (matching color)
            const glowColors = {
              'jewel_red': 0xFF4477,
              'jewel_green': 0x44FFAA,
              'jewel_blue': 0x44CCFF,
              'jewel_yellow': 0xFFFF88
            };
            const glowColor = glowColors[jewelType] || 0xFFFFFF;
            
            glow = this.add.circle(posX, posY, 8, glowColor)
              .setAlpha(0)
              .setDepth(107)
              .setBlendMode(Phaser.BlendModes.ADD);
              
          } else if (isDiamond && tier === 'id2') {
            // id2: One green jewel only
            if (!id2_greenUsed) {
              const jewelType = 'jewel_green';
              id2_greenUsed = true;
              
              // Create jewel sprite
              sparkle = this.add.sprite(posX, posY, jewelType)
                .setAlpha(0)
                .setDepth(108)
                .setScale(0.064);
              
              sparkle.setAngle(Math.random() * 360); // Random rotation
              
              // Glow behind jewel
              glow = this.add.circle(posX, posY, 8, 0x44FFAA)
                .setAlpha(0)
                .setDepth(107)
                .setBlendMode(Phaser.BlendModes.ADD);
            } else {
              // Green already used, skip this diamond
              continue;
            }
              
          } else {
            // Regular gold coin (circle)
            const color = goldColors[Math.floor(Math.random() * goldColors.length)];
            const glowColor = 0xD4A574;
            
            glow = this.add.circle(posX, posY, size * 1.8, glowColor)
              .setAlpha(0)
              .setDepth(105)
              .setBlendMode(Phaser.BlendModes.ADD);
            
            sparkle = this.add.circle(posX, posY, size, color)
              .setAlpha(0)
              .setDepth(106);
          }
          
          // Store original scale for collection animation (jewels have different scale than circles)
          sparkle.originalScale = sparkle.scale;
          
          goldSparkles.push(sparkle);
          goldGlows.push(glow);
        }
        
        // Quick fade in (glow intensity based on tier)
        // Diamonds fade to full opacity for maximum sparkle
        const targetAlpha = tier === 'id4' ? 1.0 : 0.85;
        this.tweens.add({
          targets: goldSparkles,
          alpha: targetAlpha,
          duration: 80,
          ease: 'Power2'
        });
        this.tweens.add({
          targets: goldGlows,
          alpha: glowIntensity, // Glow intensity varies by tier
          duration: 80,
          ease: 'Power2'
        });
        
        // HEAVY GRAVITY DROP - fast and weighty!
        goldSparkles.forEach((sparkle, i) => {
          const glow = goldGlows[i];
          // Random offset for pile spread - MUCH flatter pile (much wider, very short)
          const spreadX = (Math.random() - 0.5) * 60; // Much wider spread
          const spreadY = (Math.random() - 0.5) * 8;   // Very short height
          const finalX = landX + spreadX;
          const finalY = landY + spreadY;
          
          // Fast heavy drop with slight stagger
          const dropDelay = Math.random() * 40;
          
          setTimeout(() => {
            this.tweens.add({
              targets: [sparkle, glow],
              x: finalX,
              y: finalY,
              duration: goldDropDuration,
              ease: 'Cubic.easeIn', // Heavy acceleration
              onComplete: () => {
                // Small bounce on impact
                this.tweens.add({
                  targets: [sparkle, glow],
                  y: finalY - 4,
                  duration: 50,
                  yoyo: true,
                  ease: 'Bounce.easeOut'
                });
              }
            });
          }, dropDelay);
        });
        
        // After landing, create pulsing glow effect (intensity varies by tier)
        setTimeout(() => {
          const goldImpactColor = tier === 'id4'
            ? 0xFFF2A6
            : (tier === 'id3' ? 0x7AD7FF : 0xFFD36A);
          this.createCollectFallImpact(landX, landY, {
            color: goldImpactColor,
            radius: tier === 'id4' ? 34 : 26,
            depth: 106,
            durationMs: COLLECT_FALL_IMPACT_DURATION_MS
          });
    
          // LEGENDARY id4: Rainbow flash starburst effect!
          if (tier === 'id4') {
            // Rainbow colors (vibrant and saturated)
            const rainbowColors = [
              0xFF0044, // Red
              0xFF8800, // Orange
              0xFFDD00, // Yellow
              0x00FF88, // Green
              0x00DDFF, // Cyan
              0x4488FF, // Blue
              0xAA44FF, // Purple
              0xFF44AA  // Pink
            ];
            const rayCount = 8; // 8 rays for full rainbow
            
            for (let i = 0; i < rayCount; i++) {
              const angle = (i / rayCount) * Math.PI * 2;
              const rayLength = 50;
              const rayEndX = landX + Math.cos(angle) * rayLength;
              const rayEndY = landY + Math.sin(angle) * rayLength;
              const rayColor = rainbowColors[i % rainbowColors.length];
              
              // Create ray as a stretched circle (line effect)
              const ray = this.add.graphics()
                .setDepth(109)
                .setBlendMode(Phaser.BlendModes.ADD)
                .setAlpha(0);
              
              // Draw a thin vibrant ray (2px wide for more visibility)
              ray.fillStyle(rayColor, 0.9);
              ray.fillRect(0, -1, rayLength, 2);
              ray.setPosition(landX, landY);
              ray.setRotation(angle);
              
              // Quick blink animation: fade in and out rapidly
              this.tweens.add({
                targets: ray,
                alpha: { from: 0, to: 0.85 },
                scaleX: { from: 0, to: 1 },
                duration: 150,
                ease: 'Power2.easeOut',
                onComplete: () => {
                  this.tweens.add({
                    targets: ray,
                    alpha: 0,
                    scaleX: 1.2,
                    duration: 200,
                    ease: 'Power2.easeIn',
                    onComplete: () => ray.destroy()
                  });
                }
              });
            }
            
            // Add colorful center burst (cycles through rainbow colors)
            const centerColors = [0xFF0044, 0xFFDD00, 0x00FF88, 0x4488FF];
            centerColors.forEach((color, idx) => {
              const centerGlow = this.add.circle(landX, landY, 20 + idx * 5, color)
                .setDepth(108 + idx)
                .setBlendMode(Phaser.BlendModes.ADD)
                .setAlpha(0);
              
              const delay = idx * 30; // Slight stagger for color wave effect
              
              setTimeout(() => {
                this.tweens.add({
                  targets: centerGlow,
                  alpha: { from: 0, to: 0.4 },
                  scale: { from: 0.5, to: 1.3 },
                  duration: 150,
                  ease: 'Power2.easeOut',
                  onComplete: () => {
                    this.tweens.add({
                      targets: centerGlow,
                      alpha: 0,
                      scale: 1.8,
                      duration: 180,
                      ease: 'Power2.easeIn',
                      onComplete: () => centerGlow.destroy()
                    });
                  }
                });
              }, delay);
            });
          }
          
          // Pulsing glow - intensity based on tier
          this.tweens.add({
            targets: goldGlows,
            alpha: { from: glowIntensity, to: glowIntensity * 0.5 },
            scale: { from: 1, to: 1.1 },
            duration: 500,
            yoyo: true,
            repeat: 2,
            ease: 'Sine.easeInOut'
          });
          
          // Small burst sparkles outward on landing (more for legendary)
          const burstCount = tier === 'id4' ? 12 : 8;
          for (let i = 0; i < burstCount; i++) {
            const burstAngle = (i / burstCount) * Math.PI * 2;
            const burstDistance = 20 + Math.random() * 15;
            const burstX = landX + Math.cos(burstAngle) * burstDistance;
            const burstY = landY + Math.sin(burstAngle) * burstDistance;
            
            // Tier-specific burst colors
            let burstColor, burstAlpha;
            if (tier === 'id4' && Math.random() < 0.30) {
              // Legendary: Colorful jewel bursts
              const diamondColors = [0xFF0040, 0x00FF88, 0x00BFFF, 0x00FFFF, 0xFF10F0, 0x8B00FF, 0xFF6600]; // Red, green, blue, cyan, pink, purple, orange
              burstColor = diamondColors[Math.floor(Math.random() * diamondColors.length)];
              burstAlpha = 0.8;
            } else if (tier === 'id3' && Math.random() < 0.20) {
              // id3: Blue/Green bursts (matches blue/green jewels)
              burstColor = Math.random() > 0.5 ? 0x0088FF : 0x00FF88;
              burstAlpha = 0.75;
            } else if (tier === 'id2' && Math.random() < 0.10) {
              // id2: Green bursts (matches green jewel)
              burstColor = 0x00FF88;
              burstAlpha = 0.7;
            } else {
              // Default: Gold bursts
              burstColor = 0xFFFFAA;
              burstAlpha = 0.6;
            }
            
            const burstSparkle = this.add.circle(landX, landY, 1.5 + Math.random() * 2, burstColor)
              .setDepth(110)
              .setBlendMode(Phaser.BlendModes.ADD)
              .setAlpha(burstAlpha);
            
            this.tweens.add({
              targets: burstSparkle,
              x: burstX,
              y: burstY,
              alpha: 0,
              scale: 0.1,
              duration: 350 + Math.random() * 150,
              ease: 'Power2',
              onComplete: () => burstSparkle.destroy()
            });
          }
        }, goldLandingFxDelay);
        
        // Store gold pile visuals for later collection
        if (!this.goldPileVisuals) {
          this.goldPileVisuals = [];
        }
        
        // Add continuous sparkle effect on top of pile
        // Legendary piles spawn 2x as many sparkles (100% increase)
        const sparklesPerTick = tier === 'id4' ? 2 : 1;
        
        const sparkleTimer = this.time.addEvent({
          delay: 100,
          callback: () => {
            // Spawn multiple sparkles per tick for legendary piles
            for (let s = 0; s < sparklesPerTick; s++) {
              // Random position around pile top
              const angle = Math.random() * Math.PI * 2;
              const distance = 5 + Math.random() * 25; // Wide area for flat pile
              const x = landX + Math.cos(angle) * distance;
              const y = landY - 10 + Math.random() * 8; // Above pile
              
              // Tier-specific twinkle colors
              let colors, sparkleAlpha;
              if (tier === 'id4' && Math.random() < 0.30) {
                // Legendary: Colorful jewel twinkles (30% chance)
                colors = [0xFF0040, 0x00FF88, 0x00BFFF, 0x00FFFF, 0xFF10F0, 0x8B00FF, 0xFF6600]; // Red, green, blue, cyan, pink, purple, orange
                sparkleAlpha = 1.0; // Full brightness
              } else if (tier === 'id3' && Math.random() < 0.20) {
                // id3: Blue/Green twinkles (matches jewels)
                colors = [0x0088FF, 0x00FF88]; // Blue or Green
                sparkleAlpha = 1.0;
              } else if (tier === 'id2' && Math.random() < 0.10) {
                // id2: Green twinkles (matches green jewel)
                colors = [0x00FF88]; // Green only
                sparkleAlpha = 1.0;
              } else {
                // Default: Gold sparkles
                colors = [0xFFDD44, 0xFFAA00, 0xFFFFAA, 0xFFD700];
                sparkleAlpha = 0.9;
              }
              
              const sparkle = this.add.circle(x, y, 1 + Math.random() * 1.5, colors[Math.floor(Math.random() * colors.length)])
                .setDepth(107)
                .setAlpha(sparkleAlpha)
                .setBlendMode(Phaser.BlendModes.ADD);
              
              // Twinkle and float upward
              this.tweens.add({
                targets: sparkle,
                alpha: 0,
                scale: 0.1,
                y: y - 15 - Math.random() * 10,
                x: x + (Math.random() - 0.5) * 8,
                duration: 400 + Math.random() * 200,
                ease: 'Quad.easeOut',
                onComplete: () => sparkle.destroy()
              });
            }
          },
          loop: true
        });
        
        this.goldPileVisuals.push({
          sparkles: goldSparkles,
          glows: goldGlows,
          centerX: landX,
          centerY: landY,
          value: value,
          sparkleTimer: sparkleTimer
        });
        
        // Don't fade out - coins stay until collected
      },

    async collectAllGoldPiles(collectedGoldPiles) {
        if (!this.goldPileVisuals || this.goldPileVisuals.length === 0) return;
        if (!collectedGoldPiles) return;
        
        const cellSize = 70;
        
        // Determine target position based on config
        let targetX, targetY;
        if (clientConfig.goldPilesToCountup) {
          // Fly to countup display
          const gridHeight = clientConfig.area.height * cellSize;
          targetX = (clientConfig.area.width * cellSize) / 2 + GRID_OFFSET_X;
          targetY = gridHeight + 40 + GRID_OFFSET_Y;
        } else {
          // Fly to house (center of board) - makes multiplier effect more visible
          // Target 15 pixels upward to hit center of multiplier circles
          targetX = (clientConfig.area.width * cellSize) / 2 + GRID_OFFSET_X;
          targetY = (clientConfig.area.height * cellSize) / 2 + GRID_OFFSET_Y - 15;
        }
        
        // Get start and end values for smooth countup
        const startValue = collectedGoldPiles.startValue || 0;
        const endValue = collectedGoldPiles.endValue || 0;
        
        // Track if countup has started (starts when first coin arrives)
        let countupStarted = false;
        let collectDisplayRevealed = false;
        const collectionStartTime = Date.now();
        const totalCollectionDuration = 1000; // Total collection time in ms (reduced by 200ms)
        let goldAccumulationCircle = null; // Growing golden circle effect
        
        // Calculate total TBM from all gold piles to determine max circle size
        const totalTBM = collectedGoldPiles.prevGoldPiles 
          ? collectedGoldPiles.prevGoldPiles.reduce((sum, pile) => sum + (pile.tbm || 0), 0) 
          : 0;
        
        // Determine max radius based on total TBM won (reduced by ~30%)
        let maxRadius;
        if (totalTBM < 3) {
          maxRadius = 42; // Small win
        } else if (totalTBM < 5) {
          maxRadius = 52; // Medium-small win
        } else if (totalTBM < 8) {
          maxRadius = 63; // Medium win
        } else if (totalTBM < 11) {
          maxRadius = 73; // Good win
        } else if (totalTBM < 14) {
          maxRadius = 84; // Great win
        } else {
          maxRadius = 98; // Massive win!
        }
        
        // Calculate total coins for growth tracking
        const totalCoins = this.goldPileVisuals.reduce((sum, pile) => sum + pile.sparkles.length, 0);
        let coinsArrived = 0;
        
        // TORNADO EFFECT - Animate each coin individually with spiral motion
        const allPilePromises = this.goldPileVisuals.map(pile => {
          const { sparkles, glows, centerX, centerY, sparkleTimer, value } = pile;
          
          // Stop the sparkle effect timer
          if (sparkleTimer) {
            sparkleTimer.destroy();
          }
          
          // Calculate base distance for this pile
          const distance = Math.sqrt(Math.pow(targetX - centerX, 2) + Math.pow(targetY - centerY, 2));
          const baseDuration = 350; // Duration for coin flight (reduced by 200ms)
          
          // Track coin sounds for this pile - play at least 5 sounds
          const numCoins = sparkles.length;
          const soundInterval = Math.max(1, Math.floor(numCoins / 5)); // Play every Nth coin (at least 5 sounds)
          let coinsCollected = 0;
          
          // Define the "gravity pull" curve for THIS PILE - all coins follow same path
          const pileCurveAmount = 0.25 + Math.random() * 0.15; // Quarter turn arc for this pile
          const pileCurveRadius = Math.min(80, distance * 0.4); // Gentle curve radius
          const pileCurveDirection = Math.random() > 0.5 ? 1 : -1; // Pull left or right
          
          // Animate each coin individually with staggered timing
          const coinPromises = sparkles.map((sparkle, i) => {
            const glow = glows[i];
            
            return new Promise(resolve => {
              // Stagger start time for flowing effect (slower spread for visibility)
              const staggerDelay = i * 16; // 16ms between each coin start (50 coins = 800ms spread)
              
              setTimeout(() => {
                // Calculate path parameters for this coin
                const startX = sparkle.x;
                const startY = sparkle.y;
                const dx = targetX - startX;
                const dy = targetY - startY;
                const coinDistance = Math.sqrt(dx * dx + dy * dy);
                
                // Duration varies slightly per coin (keep visible longer)
                const duration = baseDuration + Math.random() * 150;
                
                // Each coin follows the pile's curve with slight individual variation
                const curveAmount = pileCurveAmount + (Math.random() - 0.5) * 0.05; // ±2.5% variation
                const curveRadius = pileCurveRadius * (0.95 + Math.random() * 0.1); // ±5% size variation
                const curveDirection = pileCurveDirection; // Same direction as pile
                
                // Starting angle for this coin
                const startAngle = Math.atan2(dy, dx);
                
                // Ensure coins are visible and at proper depth for flight
                sparkle.setAlpha(0.85);
                sparkle.setDepth(200); // Higher depth so they fly over everything
                glow.setAlpha(0.08);
                glow.setDepth(199);
                
                // Create animation object to track progress
                const animData = { progress: 0 };
                
                // Main suction tween with spiral motion
                this.tweens.add({
                  targets: animData,
                  progress: 1, // Animate from 0 to 1
                  duration: duration,
                  ease: 'Cubic.easeIn', // Starts SLOW then accelerates dramatically (tornado suction!)
                  onUpdate: (tween) => {
                    const progress = animData.progress;
                    
                    // Linear interpolation toward target
                    const baseX = startX + dx * progress;
                    const baseY = startY + dy * progress;
                    
                    // Add gentle curved offset - creates one smooth arc
                    // The curve is strongest in the middle (0.5) and reduces at start/end
                    const curveFactor = Math.sin(progress * Math.PI); // 0 -> 1 -> 0 (smooth bell curve)
                    const currentRadius = curveRadius * curveFactor;
                    const angle = startAngle + (Math.PI / 2) + (curveDirection * curveAmount * Math.PI * 2 * progress);
                    const offsetX = Math.cos(angle) * currentRadius;
                    const offsetY = Math.sin(angle) * currentRadius;
                    
                    // Apply position with gentle curve
                    sparkle.x = baseX + offsetX;
                    sparkle.y = baseY + offsetY;
                    glow.x = baseX + offsetX;
                    glow.y = baseY + offsetY;
                    
                    // Fade out and scale down as it reaches target (start later for visibility)
                    const fadeStart = 0.8; // Keep visible longer
                    if (progress > fadeStart) {
                      const fadeProgress = (progress - fadeStart) / (1 - fadeStart);
                      sparkle.setAlpha(0.85 * (1 - fadeProgress));
                      glow.setAlpha(0.08 * (1 - fadeProgress));
                      // Scale relative to original size (jewels start at 0.064, circles at 1)
                      const originalScale = sparkle.originalScale || 1;
                      sparkle.setScale(originalScale * (1 - fadeProgress * 0.8));
                      glow.setScale(1 - fadeProgress * 0.8);
                    } else {
                      // Keep fully visible during flight at original scale
                      sparkle.setAlpha(0.85);
                      glow.setAlpha(0.08);
                    }
                  },
                  onComplete: () => {
                    sparkle.destroy();
                    glow.destroy();
                    
                    // Start countup and golden accumulation effect when first coin arrives
                    if (!countupStarted) {
                      countupStarted = true;
                      
                      // Calculate remaining duration (how much time is left for collection)
                      const elapsedTime = Date.now() - collectionStartTime;
                      const remainingDuration = Math.max(100, totalCollectionDuration - elapsedTime);
                      
                      // Start smooth countup tween
                      const countupData = { value: startValue };
                      this.tweens.add({
                        targets: countupData,
                        value: endValue,
                        duration: remainingDuration,
                        ease: 'Linear',
                        onUpdate: () => {
                          this.updateCountUp(countupData.value);
                        }
                      });
                      
                      // TRANSITION MULTIPLIER TEXT TO GOLDEN/YELLOW during coin collection
                      if (this.multiplierText && !this.multiplierText.destroyed) {
                        this.tweens.add({
                          targets: this.multiplierText,
                          duration: 400,
                          ease: 'Power2.easeInOut',
                          onUpdate: (tween) => {
                            const progress = tween.progress;
                            // Transition from steel green (#A8F0C0) to golden (#FFD700)
                            const r = Math.floor(168 + (255 - 168) * progress);
                            const g = Math.floor(240 + (215 - 240) * progress);
                            const b = Math.floor(192 + (0 - 192) * progress);
                            const color = '#' + r.toString(16).padStart(2, '0') + 
                                                g.toString(16).padStart(2, '0') + 
                                                b.toString(16).padStart(2, '0');
                            this.multiplierText.setColor(color);
                            
                            // Also update stroke to dark gold
                            const sr = Math.floor(26 + (139 - 26) * progress);
                            const sg = Math.floor(92 + (90 - 92) * progress);
                            const sb = Math.floor(58 + (0 - 58) * progress);
                            const strokeColor = '#' + sr.toString(16).padStart(2, '0') + 
                                                       sg.toString(16).padStart(2, '0') + 
                                                       sb.toString(16).padStart(2, '0');
                            this.multiplierText.setStroke(strokeColor, 7);
                            
                            // Update shadow to golden glow
                            this.multiplierText.setShadow(0, 0, '#FFAA00', 15 + 10 * progress, true, true);
                          }
                        });
                      }
                      
                      // Transition highlight layer to bright gold
                      if (this.multiplierHighlight && !this.multiplierHighlight.destroyed) {
                        this.tweens.add({
                          targets: this.multiplierHighlight,
                          duration: 400,
                          ease: 'Power2.easeInOut',
                          onUpdate: (tween) => {
                            const progress = tween.progress;
                            // Transition from white (#FFFFFF) to bright gold (#FFFFCC)
                            const r = 255;
                            const g = 255;
                            const b = Math.floor(255 + (204 - 255) * progress);
                            const color = '#' + r.toString(16).padStart(2, '0') + 
                                                g.toString(16).padStart(2, '0') + 
                                                b.toString(16).padStart(2, '0');
                            this.multiplierHighlight.setColor(color);
                          }
                        });
                      }
                      
                      // TRANSITION GLOW CIRCLES TO YELLOW/GOLD
                      // Outer glow: green (0x22FF88) -> golden orange (0xFFAA00)
                      if (this.multiplierGlowOuter && !this.multiplierGlowOuter.destroyed) {
                        this.tweens.add({
                          targets: this.multiplierGlowOuter,
                          duration: 400,
                          ease: 'Power2.easeInOut',
                          onUpdate: (tween) => {
                            const progress = tween.progress;
                            // Green 0x22FF88 (34, 255, 136) -> Golden 0xFFAA00 (255, 170, 0)
                            const r = Math.floor(34 + (255 - 34) * progress);
                            const g = Math.floor(255 + (170 - 255) * progress);
                            const b = Math.floor(136 + (0 - 136) * progress);
                            const color = (r << 16) | (g << 8) | b;
                            this.multiplierGlowOuter.fillColor = color;
                          }
                        });
                      }
                      
                      // Inner glow: light green (0x66FFAA) -> bright yellow (0xFFD700)
                      if (this.multiplierGlowInner && !this.multiplierGlowInner.destroyed) {
                        this.tweens.add({
                          targets: this.multiplierGlowInner,
                          duration: 400,
                          ease: 'Power2.easeInOut',
                          onUpdate: (tween) => {
                            const progress = tween.progress;
                            // Light green 0x66FFAA (102, 255, 170) -> Golden 0xFFD700 (255, 215, 0)
                            const r = Math.floor(102 + (255 - 102) * progress);
                            const g = Math.floor(255 + (215 - 255) * progress);
                            const b = Math.floor(170 + (0 - 170) * progress);
                            const color = (r << 16) | (g << 8) | b;
                            this.multiplierGlowInner.fillColor = color;
                          }
                        });
                      }
                      
                      // Create radiant golden accumulation effect with multiple layers (smaller initial size)
                      const layers = [];
                      
                      // Layer 1: Outermost glow (largest, most subtle)
                      layers[0] = this.add.circle(targetX, targetY, 30, 0xFFAA00)
                        .setDepth(96)
                        .setAlpha(0.15)
                        .setBlendMode(Phaser.BlendModes.ADD);
                      
                      // Layer 2: Mid-outer glow
                      layers[1] = this.add.circle(targetX, targetY, 24, 0xFFCC00)
                        .setDepth(97)
                        .setAlpha(0.25)
                        .setBlendMode(Phaser.BlendModes.ADD);
                      
                      // Layer 3: Mid-inner glow
                      layers[2] = this.add.circle(targetX, targetY, 19, 0xFFD700)
                        .setDepth(98)
                        .setAlpha(0.4)
                        .setBlendMode(Phaser.BlendModes.ADD);
                      
                      // Layer 4: Core bright center
                      goldAccumulationCircle = this.add.circle(targetX, targetY, 15, 0xFFEE88)
                        .setDepth(99)
                        .setAlpha(0.6)
                        .setBlendMode(Phaser.BlendModes.ADD);
                      
                      // Store all layers
                      goldAccumulationCircle.layers = layers;
                      
                      // Add subtle pulsing shimmer effect to all layers
                      [...layers, goldAccumulationCircle].forEach((layer, index) => {
                        this.tweens.add({
                          targets: layer,
                          alpha: layer.alpha + 0.1,
                          scale: 1.05,
                          duration: 800 + index * 100, // Stagger the pulse slightly
                          ease: 'Sine.easeInOut',
                          yoyo: true,
                          repeat: -1
                        });
                      });
                    }
                    
                    // Grow the radiant golden layers as each coin arrives
                    if (goldAccumulationCircle && !goldAccumulationCircle.destroyed) {
                      coinsArrived++;
                      const progress = coinsArrived / totalCoins;
                      // maxRadius is determined by total TBM won (calculated above)
                      
                      // Core circle (brightest, smallest) - grows from 15 to 60% of maxRadius
                      const coreRadius = 15 + (maxRadius * 0.6 - 15) * progress;
                      const coreAlpha = 0.6 + 0.2 * progress; // From 0.6 to 0.8
                      
                      this.tweens.add({
                        targets: goldAccumulationCircle,
                        radius: coreRadius,
                        duration: 150,
                        ease: 'Quad.easeOut'
                      });
                      
                      // Grow all layers proportionally
                      if (goldAccumulationCircle.layers) {
                        goldAccumulationCircle.layers.forEach((layer, index) => {
                          if (!layer.destroyed) {
                            // Each layer is progressively larger
                            const layerMultiplier = 1.3 + index * 0.2; // 1.3, 1.5, 1.7, 1.9
                            const layerRadius = coreRadius * layerMultiplier;
                            
                            this.tweens.add({
                              targets: layer,
                              radius: layerRadius,
                              duration: 150 + index * 20, // Slightly staggered
                              ease: 'Quad.easeOut'
                            });
                          }
                        });
                      }
                    }
                    
                    // Track coins collected and play sound at intervals
                    coinsCollected++;
                    
                    // Play coin sound periodically (at least 5 times per pile)
                    if (coinsCollected % soundInterval === 0 || coinsCollected === 1 || coinsCollected === numCoins) {
                      const coins = ['coin1', 'coin2', 'coin3', 'coin5', 'coin6'];
                      const randomCoin = coins[Math.floor(Math.random() * coins.length)];
                      this.playSfx(randomCoin, { volume: 0.5 });
                    }
                    
                    // Small flash effect as each coin arrives
                    if (clientConfig.goldPilesToCountup && this.countUpText) {
                      // Subtle pulse on countup text
                      this.countUpText.setColor('#FFFF00');
                      this.tweens.add({
                        targets: this.countUpText,
                        duration: 80,
                        onUpdate: (tween) => {
                          const progress = tween.progress;
                          const r = 255;
                          const g = Math.floor(255 - progress * 40);
                          const b = Math.floor(progress * 7);
                          const color = '#' + r.toString(16).padStart(2, '0') + 
                                              g.toString(16).padStart(2, '0') + 
                                              b.toString(16).padStart(2, '0');
                          this.countUpText.setColor(color);
                        }
                      });
                    } else if (!clientConfig.goldPilesToCountup) {
                      // Subtle flash on house as coins arrive
                      if (this.houseSprite && Math.random() < 0.2) { // Only 20% of coins flash house
                        this.tweens.add({
                          targets: this.houseSprite,
                          scale: { from: this.houseSprite.scale + 0.02, to: this.houseSprite.scale },
                          duration: 100,
                          ease: 'Back.easeOut'
                        });
                      }
                    }
                    
                    // Create small impact sparkle at target
                    const spark = this.add.circle(targetX, targetY, 2, 0xFFD700)
                      .setDepth(201)
                      .setBlendMode(Phaser.BlendModes.ADD)
                      .setAlpha(0.8);
                    
                    const angle = Math.random() * Math.PI * 2;
                    const burstDist = 15 + Math.random() * 10;
                    const burstX = targetX + Math.cos(angle) * burstDist;
                    const burstY = targetY + Math.sin(angle) * burstDist;
                    
                    this.tweens.add({
                      targets: spark,
                      x: burstX,
                      y: burstY,
                      alpha: 0,
                      scale: 0.3,
                      duration: 150,
                      ease: 'Power2',
                      onComplete: () => spark.destroy()
                    });
                    
                    resolve();
                  }
                });
              }, staggerDelay);
            });
          });
          
          // Return promise that resolves when last coin from this pile arrives
          return Promise.all(coinPromises).then(() => {
            if (!collectDisplayRevealed) {
              collectDisplayRevealed = true;
              this.revealBonusEndCollectDisplay();
              this.updateCountUp(this.currentDisplayedWin || startValue);
            }
            this.showCenterLootPayLabel(value, targetX, targetY);
    
            // Big flash effect when entire pile is collected
            if (clientConfig.goldPilesToCountup && this.countUpText) {
              // Big flash on countup text when pile completes
              this.countUpText.setScale(1.15);
              this.tweens.add({
                targets: this.countUpText,
                scale: 1,
                duration: 200,
                ease: 'Back.easeOut'
              });
            } else if (!clientConfig.goldPilesToCountup) {
              // Flash house when pile finishes
              if (this.houseSprite) {
                this.tweens.add({
                  targets: this.houseSprite,
                  scale: { from: this.houseSprite.scale + 0.05, to: this.houseSprite.scale },
                  duration: 150,
                  ease: 'Back.easeOut'
                });
              }
              
              // Flash multiplier when pile completes
              if (this.multiplierText && !this.multiplierText.destroyed) {
                this.multiplierText.setColor('#FFFFFF');
                this.multiplierText.setScale(1.15);
                
                // Pulse glow rings
                if (this.multiplierGlowOuter && !this.multiplierGlowOuter.destroyed) {
                  this.tweens.add({
                    targets: this.multiplierGlowOuter,
                    scale: 1.5,
                    alpha: 0.4,
                    duration: 150,
                    yoyo: true,
                    ease: 'Power2'
                  });
                }
                
                if (this.multiplierGlowInner && !this.multiplierGlowInner.destroyed) {
                  this.tweens.add({
                    targets: this.multiplierGlowInner,
                    scale: 1.4,
                    alpha: 0.5,
                    duration: 150,
                    yoyo: true,
                    ease: 'Power2'
                  });
                }
                
                // Fade back to normal color
                this.tweens.add({
                  targets: this.multiplierText,
                  scale: 1,
                  duration: 200,
                  ease: 'Back.easeOut'
                });
                
                this.tweens.add({
                  targets: this.multiplierText,
                  duration: 200,
                  onUpdate: (tween) => {
                    const progress = tween.progress;
                    const r = Math.floor(255 - progress * (255 - 168));
                    const g = Math.floor(255 - progress * (255 - 212));
                    const b = Math.floor(255 - progress * (255 - 240));
                    const color = '#' + r.toString(16).padStart(2, '0') + 
                                        g.toString(16).padStart(2, '0') + 
                                        b.toString(16).padStart(2, '0');
                    this.multiplierText.setColor(color);
                  }
                });
              }
            }
            
            // Create bigger burst when pile finishes
            for (let i = 0; i < 8; i++) {
              const angle = (i / 8) * Math.PI * 2;
              const burstDist = 30 + Math.random() * 20;
              const burstX = targetX + Math.cos(angle) * burstDist;
              const burstY = targetY + Math.sin(angle) * burstDist;
              
              const spark = this.add.circle(targetX, targetY, 3, 0xFFD700)
                .setDepth(201)
                .setBlendMode(Phaser.BlendModes.ADD)
                .setAlpha(0.8);
              
              this.tweens.add({
                targets: spark,
                x: burstX,
                y: burstY,
                alpha: 0,
                scale: 0.3,
                duration: 250,
                ease: 'Power2',
                onComplete: () => spark.destroy()
              });
            }
          });
        });
        
        // Wait for ALL piles to be collected
        await Promise.all(allPilePromises);
        
        // Ensure countup shows exact final value
        this.updateCountUp(endValue);
        
        // Fade out and destroy the radiant golden accumulation effect
        if (goldAccumulationCircle && !goldAccumulationCircle.destroyed) {
          await new Promise(resolve => {
            // Collect all layers to fade
            const circlesToFade = [goldAccumulationCircle];
            if (goldAccumulationCircle.layers) {
              goldAccumulationCircle.layers.forEach(layer => {
                if (!layer.destroyed) circlesToFade.push(layer);
              });
            }
            
            // Fade all circles with a nice burst effect
            this.tweens.add({
              targets: circlesToFade,
              alpha: 0,
              scale: 1.4,
              duration: 500,
              ease: 'Quad.easeOut',
              onComplete: () => {
                circlesToFade.forEach(circle => {
                  if (!circle.destroyed) circle.destroy();
                });
                resolve();
              }
            });
            
            // TRANSITION MULTIPLIER TEXT BACK TO NORMAL GREEN/WHITE color
            if (this.multiplierText && !this.multiplierText.destroyed) {
              this.tweens.add({
                targets: this.multiplierText,
                duration: 500,
                ease: 'Power2.easeInOut',
                onUpdate: (tween) => {
                  const progress = tween.progress;
                  // Transition from golden (#FFD700) back to steel green (#A8F0C0)
                  const r = Math.floor(255 + (168 - 255) * progress);
                  const g = Math.floor(215 + (240 - 215) * progress);
                  const b = Math.floor(0 + (192 - 0) * progress);
                  const color = '#' + r.toString(16).padStart(2, '0') + 
                                      g.toString(16).padStart(2, '0') + 
                                      b.toString(16).padStart(2, '0');
                  this.multiplierText.setColor(color);
                  
                  // Also restore stroke to dark green
                  const sr = Math.floor(139 + (26 - 139) * progress);
                  const sg = Math.floor(90 + (92 - 90) * progress);
                  const sb = Math.floor(0 + (58 - 0) * progress);
                  const strokeColor = '#' + sr.toString(16).padStart(2, '0') + 
                                             sg.toString(16).padStart(2, '0') + 
                                             sb.toString(16).padStart(2, '0');
                  this.multiplierText.setStroke(strokeColor, 7);
                  
                  // Restore shadow to green glow
                  const sr2 = Math.floor(255 + (68 - 255) * progress);
                  const sg2 = Math.floor(170 + (221 - 170) * progress);
                  const sb2 = Math.floor(0 + (153 - 0) * progress);
                  const shadowColor = '#' + sr2.toString(16).padStart(2, '0') + 
                                             sg2.toString(16).padStart(2, '0') + 
                                             sb2.toString(16).padStart(2, '0');
                  this.multiplierText.setShadow(0, 0, shadowColor, 15, true, true);
                }
              });
            }
            
            // Transition highlight layer back to white
            if (this.multiplierHighlight && !this.multiplierHighlight.destroyed) {
              this.tweens.add({
                targets: this.multiplierHighlight,
                duration: 500,
                ease: 'Power2.easeInOut',
                onUpdate: (tween) => {
                  const progress = tween.progress;
                  // Transition from bright gold (#FFFFCC) back to white (#FFFFFF)
                  const r = 255;
                  const g = 255;
                  const b = Math.floor(204 + (255 - 204) * progress);
                  const color = '#' + r.toString(16).padStart(2, '0') + 
                                      g.toString(16).padStart(2, '0') + 
                                      b.toString(16).padStart(2, '0');
                  this.multiplierHighlight.setColor(color);
                }
              });
            }
            
            // TRANSITION GLOW CIRCLES BACK TO GREEN
            // Outer glow: golden orange (0xFFAA00) -> green (0x22FF88)
            if (this.multiplierGlowOuter && !this.multiplierGlowOuter.destroyed) {
              this.tweens.add({
                targets: this.multiplierGlowOuter,
                duration: 500,
                ease: 'Power2.easeInOut',
                onUpdate: (tween) => {
                  const progress = tween.progress;
                  // Golden 0xFFAA00 (255, 170, 0) -> Green 0x22FF88 (34, 255, 136)
                  const r = Math.floor(255 + (34 - 255) * progress);
                  const g = Math.floor(170 + (255 - 170) * progress);
                  const b = Math.floor(0 + (136 - 0) * progress);
                  const color = (r << 16) | (g << 8) | b;
                  this.multiplierGlowOuter.fillColor = color;
                }
              });
            }
            
            // Inner glow: bright yellow (0xFFD700) -> light green (0x66FFAA)
            if (this.multiplierGlowInner && !this.multiplierGlowInner.destroyed) {
              this.tweens.add({
                targets: this.multiplierGlowInner,
                duration: 500,
                ease: 'Power2.easeInOut',
                onUpdate: (tween) => {
                  const progress = tween.progress;
                  // Golden 0xFFD700 (255, 215, 0) -> Light green 0x66FFAA (102, 255, 170)
                  const r = Math.floor(255 + (102 - 255) * progress);
                  const g = Math.floor(215 + (255 - 215) * progress);
                  const b = Math.floor(0 + (170 - 0) * progress);
                  const color = (r << 16) | (g << 8) | b;
                  this.multiplierGlowInner.fillColor = color;
                }
              });
            }
          });
        }
        
        // Clear the array
        this.goldPileVisuals = [];
        
        // Wait 200ms for user to see the final win
        await new Promise(resolve => setTimeout(resolve, 200));
      },

    getSymbolBackplateTexture(_symbolKey) {
        return null;
      },

    ensureSymbolBackdrop(sprite) {
        if (!sprite || sprite.destroyed) return null;
    
        const backplateTexture = this.getSymbolBackplateTexture(sprite.symbolKey);
        if (!backplateTexture) {
          if (sprite.symbolBackdrop && !sprite.symbolBackdrop.destroyed) {
            sprite.symbolBackdrop.destroy();
          }
          sprite.symbolBackdrop = null;
          return null;
        }
    
        const needsNewBackdrop =
          !sprite.symbolBackdrop ||
          sprite.symbolBackdrop.destroyed ||
          sprite.symbolBackdrop.texture?.key !== backplateTexture;
    
        if (needsNewBackdrop) {
          if (sprite.symbolBackdrop && !sprite.symbolBackdrop.destroyed) {
            sprite.symbolBackdrop.destroy();
          }
    
          const backdrop = this.add.image(sprite.x, sprite.y, backplateTexture)
            .setOrigin(0.5)
            .setDepth((sprite.depth || DEPTH_SYMBOLS) - 0.1)
            .setAlpha(sprite.alpha ?? 1);
          backdrop.isSymbolBackplate = true;
          sprite.symbolBackdrop = backdrop;
    
          sprite.once("destroy", () => {
            if (backdrop && !backdrop.destroyed) {
              backdrop.destroy();
            }
          });
        }
    
        const backdropScale = Math.max(0.1, Number(sprite.scaleX) || normalScale);
        sprite.symbolBackdrop
          .setPosition(sprite.x, sprite.y)
          .setScale(backdropScale)
          .setDepth((sprite.depth || DEPTH_SYMBOLS) - 0.1)
          .setAlpha(sprite.alpha ?? 1)
          .setVisible(sprite.visible !== false);
    
        return sprite.symbolBackdrop;
      },

    createOrUpdateBoardShadowOverlay() {
        if (Array.isArray(this.boardShadowRects)) {
          this.boardShadowRects.forEach((rect) => {
            if (rect && !rect.destroyed) {
              rect.destroy();
            }
          });
          this.boardShadowRects = null;
        }

        const boardShadowEnabled = gameClientConfig?.layout?.boardShadowBackplates?.enabled === true;
        if (!boardShadowEnabled) {
          if (this.boardShadowOverlay && !this.boardShadowOverlay.destroyed) {
            this.boardShadowOverlay.destroy();
          }
          this.boardShadowOverlay = null;
          return null;
        }
    
        const cellSize = 70;
        const boardLeft = GRID_OFFSET_X;
        const boardTop = GRID_OFFSET_Y;
        const boardWidth = clientConfig.area.width * cellSize;
        const boardHeight = clientConfig.area.height * cellSize;
        const padding = 6;
        const radius = 10;
        const openingReelStart = Math.max(0, Math.floor(clientConfig.area.width / 2) - 1);
        const openingRowStart = Math.max(0, Math.floor(clientConfig.area.height / 2) - 1);
        const openingLeft = boardLeft + openingReelStart * cellSize;
        const openingTop = boardTop + openingRowStart * cellSize;
        const openingSize = cellSize * 2;
        const openingRight = openingLeft + openingSize;
        const openingBottom = openingTop + openingSize;
        const openingCenterX = openingLeft + openingSize / 2;
        const openingCenterY = openingTop + openingSize / 2;
        const softInnerRadius = openingSize * 0.56;
        const softOuterRadius = openingSize * 1.85;
        const smoothstep = (value) => {
          const t = Phaser.Math.Clamp(Number(value) || 0, 0, 1);
          return t * t * (3 - 2 * t);
        };
    
        if (!this.boardShadowOverlay || this.boardShadowOverlay.destroyed) {
          this.boardShadowOverlay = this.add.graphics();
        }
    
        const overlay = this.boardShadowOverlay;
        overlay.clear();
        overlay.setDepth(DEPTH_BOARD_BACKDROP);
        overlay.setVisible(true);
    
        for (let reel = 0; reel < clientConfig.area.width; reel++) {
          for (let row = 0; row < clientConfig.area.height; row++) {
            const isCenterOpening =
              reel >= openingReelStart &&
              reel < openingReelStart + 2 &&
                row >= openingRowStart &&
              row < openingRowStart + 2;
            if (isCenterOpening) continue;
    
            const cellCenterX = boardLeft + reel * cellSize + cellSize / 2;
            const cellCenterY = boardTop + row * cellSize + cellSize / 2;
            const centerDistance = Math.hypot(cellCenterX - openingCenterX, cellCenterY - openingCenterY);
            const falloff = smoothstep((centerDistance - softInnerRadius) / Math.max(1, softOuterRadius - softInnerRadius));
            const panelAlpha = Phaser.Math.Linear(0.04, 0.52, falloff);
            const cellAlpha = Phaser.Math.Linear(0.03, 0.16, falloff);
    
            overlay.fillStyle(0x061009, panelAlpha);
            overlay.fillRoundedRect(
              boardLeft + reel * cellSize + 1.5,
              boardTop + row * cellSize + 1.5,
              cellSize - 3,
              cellSize - 3,
              8
            );
            overlay.fillStyle(0x000000, cellAlpha);
            overlay.fillRoundedRect(
              boardLeft + reel * cellSize + 5,
              boardTop + row * cellSize + 5,
              cellSize - 10,
              cellSize - 10,
              6
            );
          }
        }
    
        overlay.lineStyle(18, 0x061009, 0.08);
        overlay.strokeCircle(openingCenterX, openingCenterY, openingSize * 0.72);
        overlay.lineStyle(12, 0xC8FF7A, 0.05);
        overlay.strokeCircle(openingCenterX, openingCenterY, openingSize * 0.82);
        overlay.lineStyle(3, 0xE8FFD2, 0.11);
        overlay.strokeCircle(openingCenterX, openingCenterY, openingSize * 0.66);
    
        overlay.lineStyle(2, 0xD8C27A, 0.22);
        overlay.strokeRoundedRect(
          boardLeft - padding,
          boardTop - padding,
          boardWidth + padding * 2,
          boardHeight + padding * 2,
          radius
        );
    
        overlay.lineStyle(1, 0xFFF2C2, 0.08);
        overlay.beginPath();
        for (let reel = 1; reel < clientConfig.area.width; reel++) {
          const x = boardLeft + reel * cellSize;
          if (x >= openingLeft && x <= openingRight) {
            overlay.moveTo(x, boardTop);
            overlay.lineTo(x, openingTop);
            overlay.moveTo(x, openingBottom);
            overlay.lineTo(x, boardTop + boardHeight);
          } else {
            overlay.moveTo(x, boardTop);
            overlay.lineTo(x, boardTop + boardHeight);
          }
        }
        for (let row = 1; row < clientConfig.area.height; row++) {
          const y = boardTop + row * cellSize;
          if (y >= openingTop && y <= openingBottom) {
            overlay.moveTo(boardLeft, y);
            overlay.lineTo(openingLeft, y);
            overlay.moveTo(openingRight, y);
            overlay.lineTo(boardLeft + boardWidth, y);
          } else {
            overlay.moveTo(boardLeft, y);
            overlay.lineTo(boardLeft + boardWidth, y);
          }
        }
        overlay.strokePath();
    
        return overlay;
      },

    fadeBoardShadowOverlayForBonusEntry(duration = 1100) {
        if (gameClientConfig?.layout?.boardShadowBackplates?.enabled !== true) {
          return Promise.resolve(false);
        }

        const overlay = this.boardShadowOverlay;
        if (!overlay || overlay.destroyed || overlay.visible !== true || overlay.alpha <= 0.01) {
          return Promise.resolve(false);
        }

        this.tweens.killTweensOf(overlay);
        return new Promise((resolve) => {
          this.tweens.add({
            targets: overlay,
            alpha: 0,
            duration,
            ease: "Sine.easeInOut",
            onComplete: () => {
              if (overlay && !overlay.destroyed) {
                overlay.setVisible(false);
              }
              resolve(true);
            }
          });
        });
      },

    syncSymbolBackdrops() {
        this.createOrUpdateBoardShadowOverlay();
    
        if (!this.reelSprites) return;
    
        const visited = new Set();
        for (let reel = 0; reel < this.reelSprites.length; reel++) {
          const column = this.reelSprites[reel];
          if (!column) continue;
          for (let row = 0; row < column.length; row++) {
            const sprite = column[row];
            if (!sprite || visited.has(sprite)) continue;
            visited.add(sprite);
            this.ensureSymbolBackdrop(sprite);
          }
        }
      },

    cleanupSymbolBackdrops() {
        if (Array.isArray(this.boardShadowRects)) {
          this.boardShadowRects.forEach((rect) => {
            if (rect && !rect.destroyed) {
              rect.destroy();
            }
          });
          this.boardShadowRects = null;
        }
        if (this.boardShadowOverlay && !this.boardShadowOverlay.destroyed) {
          this.boardShadowOverlay.destroy();
        }
        this.boardShadowOverlay = null;
    
        if (!this.reelSprites) return;
    
        const visited = new Set();
        for (let reel = 0; reel < this.reelSprites.length; reel++) {
          const column = this.reelSprites[reel];
          if (!column) continue;
          for (let row = 0; row < column.length; row++) {
            const sprite = column[row];
            if (!sprite || visited.has(sprite)) continue;
            visited.add(sprite);
            if (sprite.symbolBackdrop && !sprite.symbolBackdrop.destroyed) {
              sprite.symbolBackdrop.destroy();
            }
            sprite.symbolBackdrop = null;
          }
        }
      },

    createBananaBackplate(sprite, x, y) {
        // Thunderkong: bananas should render without aura/particle effects.
        if (sprite?.bananaBackplate) {
          this.destroyBananaBackplate(sprite);
        }
        return null;
      },

    updateBananaBackplate(sprite) {
        // Flames are spawned relative to sprite.x/y, so they auto-follow
      },

    destroyBananaBackplate(sprite) {
        const target = getReelSymbolRenderable(sprite) || sprite;
        if (target?.bananaBackplate) {
          target.bananaBackplate.stop();
          target.bananaBackplate = null;
        }
        if (sprite?.symbolBackdrop && !sprite.symbolBackdrop.destroyed) {
          sprite.symbolBackdrop.destroy();
          sprite.symbolBackdrop = null;
        }
      },

    cleanupAllBackplates() {
        if (!this.reelSprites) return;
        
        for (let reel = 0; reel < this.reelSprites.length; reel++) {
          const column = this.reelSprites[reel];
          if (!column) continue;
          for (let row = 0; row < column.length; row++) {
            const sprite = column[row];
            if (sprite && sprite.bananaBackplate) {
              this.destroyBananaBackplate(sprite);
            }
          }
        }
      },

    refreshAllBananaBackplates() {
        const banana2Id = clientConfig.symbolsMapping?.banana2 || 12;
        
        const isBananaWithBackplate = (symbol) => {
          // banana2 doesn't get backplates (necromancer spawns have special look)
          if (Number(symbol) === banana2Id) return false;
          
          const bananaIds = [
            clientConfig.symbolsMapping?.banana || 11,
            clientConfig.symbolsMapping?.banana3 || 13,
            clientConfig.symbolsMapping?.gargoyleDemon || 21
          ];
          return bananaIds.includes(Number(symbol));
        };
        
        // Clean up and recreate backplates for all banana sprites (except banana2)
        for (let reel = 0; reel < clientConfig.area.width; reel++) {
          for (let row = 0; row < clientConfig.area.height; row++) {
            const sprite = this.reelSprites[reel]?.[row];
            if (!sprite || sprite.destroyed) continue;
            const renderable = getReelSymbolRenderable(sprite);
            if (!renderable || renderable.destroyed) continue;
            
            if (isBananaWithBackplate(sprite.symbolKey)) {
              // Has banana but no backplate? Create one
              if (!renderable.bananaBackplate) {
                this.createBananaBackplate(sprite, sprite.x, sprite.y);
              } else {
                // Sync backplate position
                this.updateBananaBackplate(sprite);
              }
            } else {
              // Not a banana (or is banana2) but has backplate? Remove it
              if (renderable.bananaBackplate) {
                this.destroyBananaBackplate(sprite);
              }
            }
          }
        }
      },

    createBloodSplash(x, y) {
        // Thunderkong: disable banana splash particles.
        return;
    
        const bloodColors = BANANA_IMPACT_COLORS;
        const easeTypes = ['Power2.easeOut', 'Power3.easeOut', 'Quad.easeOut', 'Cubic.easeOut'];
        
        // Pick 2-3 random "spray directions" for more organic look
        const sprayAngles = [
          Math.random() * Math.PI * 2,
          Math.random() * Math.PI * 2,
          Math.random() * Math.PI * 2
        ];
        
        // Chaotic tiny droplets
        for (let i = 0; i < 45; i++) {
          const color = bloodColors[Math.floor(Math.random() * bloodColors.length)];
          const size = Math.random() * 3 + 1;
          
          // Start slightly offset for more organic origin
          const startOffsetX = (Math.random() - 0.5) * 10;
          const startOffsetY = (Math.random() - 0.5) * 10;
          
          const particle = this.add.circle(x + startOffsetX, y + startOffsetY, size, color)
            .setAlpha(0.9)
            .setDepth(DEPTH_HERO + 1);
          
          // Mix of random angles and spray direction bias
          let angle;
          if (Math.random() < 0.4) {
            // Follow a spray direction with some variance
            angle = sprayAngles[Math.floor(Math.random() * sprayAngles.length)] + (Math.random() - 0.5) * 0.8;
          } else {
            // Fully random
            angle = Math.random() * Math.PI * 2;
          }
          
          // Highly varied speeds
          const speed = Math.random() * Math.random() * 150 + 20; // Squared random = more variation
          const targetX = x + startOffsetX + Math.cos(angle) * speed;
          const targetY = y + startOffsetY + Math.sin(angle) * speed;
          
          this.tweens.add({
            targets: particle,
            x: targetX,
            y: targetY,
            alpha: 0,
            scaleX: 0.3 + Math.random() * 0.4,
            scaleY: Math.random() * 2 + 0.5,
            duration: Math.random() * 500 + 300,
            delay: Math.random() * 50, // Staggered starts
            ease: easeTypes[Math.floor(Math.random() * easeTypes.length)],
            onComplete: () => particle.destroy()
          });
        }
        
        // Medium droplets with chaotic movement
        for (let i = 0; i < 15; i++) {
          const color = bloodColors[Math.floor(Math.random() * bloodColors.length)];
          const size = Math.random() * 4 + 3;
          
          const startOffsetX = (Math.random() - 0.5) * 15;
          const startOffsetY = (Math.random() - 0.5) * 15;
          
          const particle = this.add.circle(x + startOffsetX, y + startOffsetY, size, color)
            .setAlpha(0.85)
            .setDepth(DEPTH_HERO + 1);
          
          // Bias toward spray directions
          const angle = sprayAngles[Math.floor(Math.random() * sprayAngles.length)] + (Math.random() - 0.5) * 1.2;
          const speed = Math.random() * Math.random() * 100 + 25;
          const targetX = x + startOffsetX + Math.cos(angle) * speed;
          const targetY = y + startOffsetY + Math.sin(angle) * speed;
          
          this.tweens.add({
            targets: particle,
            x: targetX,
            y: targetY,
            alpha: 0,
            scaleX: 0.3 + Math.random() * 0.3,
            scaleY: Math.random() * 2.5 + 0.8,
            duration: Math.random() * 400 + 300,
            delay: Math.random() * 30,
            ease: easeTypes[Math.floor(Math.random() * easeTypes.length)],
            onComplete: () => particle.destroy()
          });
        }
        
        // Drips with varied positions
        for (let i = 0; i < 18; i++) {
          const drip = this.add.circle(
            x + (Math.random() - 0.5) * 60, 
            y + (Math.random() - 0.5) * 20, 
            Math.random() * 2.5 + 1,
            bloodColors[Math.floor(Math.random() * bloodColors.length)]
          )
            .setAlpha(0.85)
            .setDepth(DEPTH_HERO + 1);
          
          // Some drips go sideways too
          const dripAngle = Math.PI / 2 + (Math.random() - 0.5) * 0.6; // Mostly down, some angle
          const dripDist = Math.random() * 70 + 25;
          
          this.tweens.add({
            targets: drip,
            x: drip.x + Math.cos(dripAngle) * dripDist * 0.3,
            y: drip.y + Math.sin(dripAngle) * dripDist,
            alpha: 0,
            duration: Math.random() * 450 + 250,
            delay: Math.random() * 80,
            ease: 'Quad.easeIn',
            onComplete: () => drip.destroy()
          });
        }
        
        // Quick scattered impact flashes (smaller, more organic)
        for (let f = 0; f < 5; f++) {
          const flashX = x + (Math.random() - 0.5) * 30;
          const flashY = y + (Math.random() - 0.5) * 30;
          const flash = this.add.circle(flashX, flashY, Math.random() * 8 + 4, BONUS_COUNTER_GLOW_COLOR)
            .setAlpha(0.4)
            .setDepth(DEPTH_HERO)
            .setBlendMode(Phaser.BlendModes.ADD);
          
          this.tweens.add({
            targets: flash,
            alpha: 0,
            scale: 2 + Math.random(),
            duration: 150 + Math.random() * 100,
            delay: Math.random() * 30,
            ease: 'Power2.easeOut',
            onComplete: () => flash.destroy()
          });
        }
      }
  };
}
