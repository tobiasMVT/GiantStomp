export function createGameSceneBonusPresentationMethods(deps = {}) {
  const {
    BANANA_TRAIL_TINT,
    DEPTH_BANANAS,
    DEPTH_HERO,
    DEPTH_SYMBOLS,
    GRID_OFFSET_X,
    GRID_OFFSET_Y,
    NECROMANCER_GROUND_GLOW,
    NECROMANCER_ORB_COLORS,
    Phaser,
    SHAKE_BARREL_BURST_DURATION,
    SHAKE_BARREL_BURST_INTENSITY,
    bananaScale,
    clientConfig,
    getBoardSymbolDepth,
    getReelSymbolRenderable,
    getSymbolScale,
    getTrollTexture,
    normalScale,
    normalizeSymbolKey,
    trollScale
  } = deps;

  return {
    cleanupBonusVisuals() {
        // Remove chest and its sparkles
        if (this.bonusChestSparkleTimer) {
          this.bonusChestSparkleTimer.destroy();
          this.bonusChestSparkleTimer = null;
        }
        if (this.bonusChest && !this.bonusChest.destroyed) {
          this.tweens.killTweensOf(this.bonusChest);
          this.bonusChest.destroy();
          this.bonusChest = null;
        }
        
        // Hide bonus text in sky (but keep lightning/particles)
        if (this.bonusSilhouette && !this.bonusSilhouette.destroyed) {
          this.tweens.killTweensOf(this.bonusSilhouette);
          this.bonusSilhouette.setAlpha(0);
        }
        
        // Remove bonus text sparkles
        if (this.bonusTextSparkleTimer) {
          this.bonusTextSparkleTimer.destroy();
          this.bonusTextSparkleTimer = null;
        }
        
      },

    startAmbientLightning() {
        // Prevent multiple starts - if already playing, don't restart
        if (this.ambientLightning1 && this.ambientLightning1.isPlaying) {
          return; // Already playing
        }
        
        // Stop any existing ambient lightning first
        this.stopAmbientLightning();
        
        // Small delay to ensure clean restart after previous sounds are destroyed
        this.time.delayedCall(50, () => {
          // Start looping the 3 ambient lightning sounds
          this.ambientLightning1 = this.startLoopingSfx('lightning_amb1', { volume: 0.3 });
          this.ambientLightning2 = this.startLoopingSfx('lightning_amb2', { volume: 0.3 });
          this.ambientLightning3 = this.startLoopingSfx('lightning_amb3', { volume: 0.3 });
        });
      },

    stopAmbientLightning() {
        if (this.ambientLightning1) {
          this.ambientLightning1.stop();
          this.ambientLightning1.destroy();
          this.ambientLightning1 = null;
        }
        if (this.ambientLightning2) {
          this.ambientLightning2.stop();
          this.ambientLightning2.destroy();
          this.ambientLightning2 = null;
        }
        if (this.ambientLightning3) {
          this.ambientLightning3.stop();
          this.ambientLightning3.destroy();
          this.ambientLightning3 = null;
        }
        
        // Stop intensity check timer
        if (this.ambientIntensityTimer) {
          this.ambientIntensityTimer.destroy();
          this.ambientIntensityTimer = null;
        }
      },

    startAmbientLightningIntensityCheck() {
        // Stop any existing timer
        if (this.ambientIntensityTimer) {
          this.ambientIntensityTimer.destroy();
        }
        
        // Check every 2 seconds
        this.ambientIntensityTimer = this.time.addEvent({
          delay: 2000,
          callback: () => {
            const intensity = this.lightningCount || 0;
            
            // Calculate silence parameters based on intensity
            // intensity 5: 50% silence for 5s
            // intensity 6: 40% silence for 4s
            // intensity 7: 30% silence for 3s
            // intensity 8: 20% silence for 2s
            // intensity 9: 10% silence for 1s
            // intensity 10+: 0% silence (always active)
            
            let silenceChance = 0;
            let silenceDuration = 0;
            
            if (intensity <= 5) {
              silenceChance = 50;
              silenceDuration = 5000;
            } else if (intensity === 6) {
              silenceChance = 40;
              silenceDuration = 4000;
            } else if (intensity === 7) {
              silenceChance = 30;
              silenceDuration = 3000;
            } else if (intensity === 8) {
              silenceChance = 20;
              silenceDuration = 2000;
            } else if (intensity === 9) {
              silenceChance = 10;
              silenceDuration = 1000;
            }
            // intensity >= 10: no silence
            
            // Roll for silence
            if (Math.random() * 100 < silenceChance) {
              // Mute ambient tracks
              if (this.ambientLightning1) this.ambientLightning1.setVolume(0);
              if (this.ambientLightning2) this.ambientLightning2.setVolume(0);
              if (this.ambientLightning3) this.ambientLightning3.setVolume(0);
              
              // Restore volume after silence duration
              this.time.delayedCall(silenceDuration, () => {
                if (this.ambientLightning1) this.ambientLightning1.setVolume(this.getAdjustedSoundVolume('lightning_amb1', 0.3));
                if (this.ambientLightning2) this.ambientLightning2.setVolume(this.getAdjustedSoundVolume('lightning_amb2', 0.3));
                if (this.ambientLightning3) this.ambientLightning3.setVolume(this.getAdjustedSoundVolume('lightning_amb3', 0.3));
              });
            }
          },
          loop: true
        });
      },

    startBonusMode() {
        this.isInBonusMode = true;
        this.setMainGamePortalVisible?.(false);
        this.createOrUpdateSymbolSpawnCurtain?.();
        if (typeof this.resetHeavenHellSoulPortalState === "function") {
          this.resetHeavenHellSoulPortalState();
        }
        const collectTarget = this.getCenterCollectTarget();
        const isHellDiveBonusStart = this.mainBackground?.texture?.key === "helldive_hell_bonus_bg";
        if (!isHellDiveBonusStart) {
          this.startBonusWonCenterEnergy(collectTarget.x, collectTarget.y, {
            depth: DEPTH_HERO + 26,
            scale: 1.08,
            tint: 0x55FF88
          });
        }
        
        // Ensure ambient lightning is running (should already be at intensity 10+, but ensure it)
        if (!this.ambientLightning1 || !this.ambientLightning1.isPlaying) {
          this.startAmbientLightning();
          this.startAmbientLightningIntensityCheck();
        }
        
        // Fade out the BONUS text in the sky
        if (this.bonusSilhouette && !this.bonusSilhouette.destroyed) {
          this.tweens.killTweensOf(this.bonusSilhouette);
          this.tweens.add({
            targets: this.bonusSilhouette,
            alpha: 0,
            duration: 800,
            ease: 'Sine.easeOut',
            onComplete: () => {
              // Reset to behind clouds position
              if (this.bonusSilhouette && !this.bonusSilhouette.destroyed) {
                this.bonusSilhouette.setDepth(2.3);
                this.bonusSilhouette.setTint(0xFFFFFF);
              }
            }
          });
        }
        
        // Also clear bonus text sparkles
        if (this.bonusTextSparkleTimer) {
          this.bonusTextSparkleTimer.destroy();
          this.bonusTextSparkleTimer = null;
        }
        
        // Reset permanent visibility flag
        this.bonusPermanentlyVisible = false;
        
      },

    async animateNecromancerSpawns(spawns) {
        if (!spawns || spawns.length === 0) return;
        
        // Play spawn time sound at start of sequence
        this.playSfx('banana_spawn_time', { volume: 0.5 });
        
        const cellSize = 70;
        const spawnPromises = [];
        // Jungle mystic palette (no red).
        const orbColors = NECROMANCER_ORB_COLORS;
        
        // Store spawned banana sprites so dropSymbols knows they exist
        this.necromancerBananaSprites = [];
        
        // Spawn each banana with mystical spiral effect
        spawns.forEach((spawn, index) => {
          const x = spawn.reel * cellSize + cellSize / 2 + GRID_OFFSET_X;
          const y = (clientConfig.area.height - 1 - spawn.row) * cellSize + cellSize / 2 + GRID_OFFSET_Y;
          
          const spawnPromise = new Promise(resolve => {
            setTimeout(() => {
              const orbCount = 16; // More orbs for fuller spiral
              const spiralHeight = 70;
              const spiralRadius = 28;
              const rotations = 2; // More rotations for mystical feel
              const animDuration = 800;
              
              // Subtle ground glow that pulses
              const groundGlow = this.add.ellipse(x, y + 5, 50, 20, NECROMANCER_GROUND_GLOW)
                .setAlpha(0)
                .setDepth(DEPTH_SYMBOLS - 1)
                .setBlendMode(Phaser.BlendModes.ADD);
              
              this.tweens.add({
                targets: groundGlow,
                alpha: 0.4,
                scaleX: 1.2,
                duration: 300,
                ease: 'Sine.easeOut'
              });
              
              // Pulsing glow effect
              this.tweens.add({
                targets: groundGlow,
                alpha: 0.2,
                scaleX: 0.9,
                duration: 400,
                yoyo: true,
                repeat: 2,
                ease: 'Sine.easeInOut'
              });
              
              // Create orbs in spiral staircase pattern
              for (let i = 0; i < orbCount; i++) {
                const progress = i / orbCount;
                const angle = progress * Math.PI * 2 * rotations;
                const heightOffset = progress * spiralHeight;
                
                const startX = x + Math.cos(angle) * spiralRadius;
                const startY = y + 45 - heightOffset * 0.2;
                
                const orbSize = 2.5 + Math.random() * 2;
                const orbColor = orbColors[Math.floor(Math.random() * orbColors.length)];
                
                // Main orb
                const orb = this.add.circle(startX, startY, orbSize, orbColor)
                  .setAlpha(0)
                  .setDepth(DEPTH_BANANAS + 1)
                  .setBlendMode(Phaser.BlendModes.ADD);
                
                // Trailing glow (larger, dimmer)
                const trail = this.add.circle(startX, startY, orbSize * 2, orbColor)
                  .setAlpha(0)
                  .setDepth(DEPTH_BANANAS)
                  .setBlendMode(Phaser.BlendModes.ADD);
                
                const orbDelay = i * 35;
                
                this.time.delayedCall(orbDelay, () => {
                  // Fade in with flicker
                  this.tweens.add({
                    targets: orb,
                    alpha: 0.85,
                    duration: 80,
                    ease: 'Power2'
                  });
                  
                  this.tweens.add({
                    targets: trail,
                    alpha: 0.25,
                    duration: 80,
                    ease: 'Power2'
                  });
                  
                  // Mystical flicker effect on orb
                  this.tweens.add({
                    targets: orb,
                    alpha: 0.5,
                    duration: 80 + Math.random() * 60,
                    yoyo: true,
                    repeat: -1,
                    ease: 'Sine.easeInOut'
                  });
                  
                  // Spiral upward - orbs rise while orbiting inward
                  this.tweens.add({
                    targets: { progress: 0 },
                    progress: 1,
                    duration: animDuration - orbDelay,
                    ease: 'Quad.easeIn',
                    onUpdate: (tween) => {
                      const t = tween.targets[0].progress;
                      const currentAngle = angle + t * Math.PI * 2.5; // Extra rotation
                      const currentRadius = spiralRadius * (1 - t * 0.85);
                      const currentY = startY - spiralHeight * t;
                      
                      const newX = x + Math.cos(currentAngle) * currentRadius;
                      const newY = currentY;
                      
                      orb.x = newX;
                      orb.y = newY;
                      orb.setScale(1 - t * 0.4);
                      
                      // Trail follows slightly behind
                      trail.x = newX;
                      trail.y = newY + 3;
                      trail.setScale((1 - t * 0.6) * 1.5);
                      trail.setAlpha(0.2 * (1 - t));
                    },
                    onComplete: () => {
                      // Orbs implode to center
                      this.tweens.add({
                        targets: [orb, trail],
                        x: x,
                        y: y,
                        alpha: 0,
                        scale: 0,
                        duration: 100,
                        ease: 'Power3.easeIn',
                        onComplete: () => {
                          orb.destroy();
                          trail.destroy();
                        }
                      });
                    }
                  });
                });
              }
              
              // Rising wisps of dark energy
              for (let w = 0; w < 6; w++) {
                this.time.delayedCall(100 + w * 80, () => {
                  const wispX = x + (Math.random() - 0.5) * 30;
                  const wisp = this.add.ellipse(wispX, y + 30, 3, 12, orbColors[Math.floor(Math.random() * orbColors.length)])
                    .setAlpha(0.5)
                    .setDepth(DEPTH_BANANAS)
                    .setBlendMode(Phaser.BlendModes.ADD);
                  
                  this.tweens.add({
                    targets: wisp,
                    y: y - 30,
                    scaleY: 2,
                    alpha: 0,
                    duration: 500,
                    ease: 'Sine.easeOut',
                    onComplete: () => wisp.destroy()
                  });
                });
              }
              
              // Create banana as orbs converge
              this.time.delayedCall(animDuration * 0.5, () => {
                const bananaSprite = this.add.image(x, y + 15, spawn.bananaId)
                  .setOrigin(0.5)
                  .setScale(0.15)
                  .setAlpha(0)
                  .setDepth(DEPTH_BANANAS);
                // No tint - banana appears in natural colors
                
                bananaSprite.symbolKey = spawn.bananaId;
                
                this.necromancerBananaSprites.push({
                  sprite: bananaSprite,
                  reel: spawn.reel,
                  row: spawn.row
                });
                
                // Play individual banana spawn sound
                this.playSfx('banana_spawn', { volume: 0.4 });
                
                // Banana materializes - emerges from the dark energy
                this.tweens.add({
                  targets: bananaSprite,
                  y: y,
                  scale: bananaScale,
                  alpha: 1,
                  duration: 400,
                  ease: 'Back.easeOut',
                  onComplete: () => {
                    
                    // Dark energy absorption burst
                    for (let b = 0; b < 10; b++) {
                      const burstAngle = (b / 10) * Math.PI * 2;
                      const startDist = 25 + Math.random() * 10;
                      const burst = this.add.circle(
                        x + Math.cos(burstAngle) * startDist,
                        y + Math.sin(burstAngle) * startDist,
                        2 + Math.random(), 
                        orbColors[Math.floor(Math.random() * orbColors.length)]
                      )
                        .setAlpha(0.7)
                        .setDepth(DEPTH_BANANAS + 1)
                        .setBlendMode(Phaser.BlendModes.ADD);
                      
                      // Absorb into banana
                      this.tweens.add({
                        targets: burst,
                        x: x,
                        y: y,
                        alpha: 0,
                        scale: 0.2,
                        duration: 180 + Math.random() * 80,
                        ease: 'Power3.easeIn',
                        onComplete: () => burst.destroy()
                      });
                    }
                    
                    // Fade out ground glow
                    this.tweens.add({
                      targets: groundGlow,
                      alpha: 0,
                      scale: 0.5,
                      duration: 300,
                      ease: 'Power2',
                      onComplete: () => {
                        groundGlow.destroy();
                        resolve();
                      }
                    });
                  }
                });
              });
              
            }, index * 300); // Stagger spawns
          });
          
          spawnPromises.push(spawnPromise);
        });
        
        await Promise.all(spawnPromises);
        
        await this.waitForPresentation(100, { skippable: true });
      },

    async animateTrollTease(direction, centerPosition) {
        const cellSize = 70;
        
        // Play troll howl from the forest
        this.playSfx('troll_before_entrance', { volume: 0.7 });
        
        // VISUAL WARNING SEQUENCE (3 seconds) - same as real attack
        // Create dark overlay that fades in (behind debris)
        const overlayGraphics = this.add.graphics().setDepth(DEPTH_SYMBOLS + 5);
        overlayGraphics.fillStyle(0x000000, 0.6);
        overlayGraphics.fillRect(0, 0, this.cameras.main.width, this.cameras.main.height);
        overlayGraphics.setAlpha(0);
        
        // Fade in dark overlay
        this.tweens.add({
          targets: overlayGraphics,
          alpha: 1,
          duration: 800,
          ease: 'Power2.easeIn'
        });
        
        // Determine entry edge position using actual grid positions
        let entryReel, entryRow;
        
        switch (direction) {
          case 'fromleft':
            entryReel = 0;
            entryRow = centerPosition.row;
            break;
          case 'fromright':
            entryReel = 7;
            entryRow = centerPosition.row;
            break;
          case 'fromtop':
            entryReel = centerPosition.reel;
            entryRow = 0;
            break;
          case 'fromdown':
            entryReel = centerPosition.reel;
            entryRow = 7;
            break;
        }
        
        // Convert grid position to screen coordinates
        const entryEdgeX = entryReel * cellSize + cellSize / 2 + GRID_OFFSET_X;
        const entryEdgeY = (clientConfig.area.height - 1 - entryRow) * cellSize + cellSize / 2 + GRID_OFFSET_Y;
        
        // Play tree/debris cracking sound
        this.playSfx('troll_trees_crack', { volume: 0.6 });
        
        // Calculate the 3 edge positions
        const trollEdgePositions = [];
        
        switch (direction) {
          case 'fromleft':
          case 'fromright':
            for (let offset = -1; offset <= 1; offset++) {
              const row = centerPosition.row + offset;
              const y = (clientConfig.area.height - 1 - row) * cellSize + cellSize / 2 + GRID_OFFSET_Y;
              trollEdgePositions.push({ x: entryEdgeX, y: y });
            }
            break;
          case 'fromtop':
          case 'fromdown':
            for (let offset = -1; offset <= 1; offset++) {
              const reel = centerPosition.reel + offset;
              const x = reel * cellSize + cellSize / 2 + GRID_OFFSET_X;
              trollEdgePositions.push({ x: x, y: entryEdgeY });
            }
            break;
        }
        
        // Falling debris (same as real attack)
        const debrisAssets = ['7', '4', '5', '6', '7', '4', '5', '6'];
        const numDebris = 12;
        const fallingDebris = [];
        const distanceMultipliers = [1.0, 1.0, 0.5, 0.33, 1.0, 0.5, 0.33, 1.0, 0.5, 0.33, 1.0, 0.5];
        
        for (let i = 0; i < numDebris; i++) {
          setTimeout(() => {
            const debrisTexture = debrisAssets[i % debrisAssets.length];
            const distMult = distanceMultipliers[i];
            const edgePos = trollEdgePositions[i % 3];
            const debrisX = edgePos.x;
            const debrisY = edgePos.y;
            
            let targetX, targetY;
            
            switch (direction) {
              case 'fromleft':
                targetX = debrisX + (Math.random() * 120 + 80) * distMult;
                targetY = debrisY + (Math.random() - 0.5) * 100;
                break;
              case 'fromright':
                targetX = debrisX - (Math.random() * 120 + 80) * distMult;
                targetY = debrisY + (Math.random() - 0.5) * 100;
                break;
              case 'fromtop':
                targetX = debrisX + (Math.random() - 0.5) * 100;
                targetY = debrisY - (Math.random() * 120 + 80) * distMult;
                break;
              case 'fromdown':
                targetX = debrisX + (Math.random() - 0.5) * 100;
                targetY = debrisY + (Math.random() * 120 + 80) * distMult;
                break;
            }
            
            const debris = this.add.image(debrisX, debrisY, debrisTexture)
              .setOrigin(0.5)
              .setScale(normalScale)
              .setDepth(DEPTH_SYMBOLS + 15)
              .setAlpha(1);
            
            fallingDebris.push(debris);
            
            // Phase 1: Toss debris - stays visible until it hits the ground
            this.tweens.add({
              targets: debris,
              x: targetX,
              y: targetY,
              rotation: (Math.random() - 0.5) * 6,
              scale: normalScale * 0.8,
              alpha: 0.95, // Stay almost fully visible during flight
              duration: 350 + i * 50,
              ease: 'Power2.easeOut',
              onComplete: () => {
                // Phase 2: Fade out after hitting the ground
                this.tweens.add({
                  targets: debris,
                  alpha: 0,
                  duration: 300, // Quick fade out
                  ease: 'Power2.easeIn'
                });
              }
            });
          }, i * 120);
        }
        
        // Escalating screen shake
        setTimeout(() => this.cameras.main.shake(200, 0.003), 500);
        setTimeout(() => this.cameras.main.shake(200, 0.006), 1200);
        setTimeout(() => this.cameras.main.shake(300, 0.01), 2000);
        
        // Dust particles
        const dustParticles = [];
        const dustInterval = setInterval(() => {
          const edgePos = trollEdgePositions[Math.floor(Math.random() * 3)];
          let dustX, dustY, driftX, driftY;
          
          switch (direction) {
            case 'fromleft':
              dustX = edgePos.x + (Math.random() - 0.5) * 40;
              dustY = edgePos.y + (Math.random() - 0.5) * 50;
              driftX = Math.random() * 50 + 30;
              driftY = (Math.random() - 0.5) * 40;
              break;
            case 'fromright':
              dustX = edgePos.x + (Math.random() - 0.5) * 40;
              dustY = edgePos.y + (Math.random() - 0.5) * 50;
              driftX = -(Math.random() * 50 + 30);
              driftY = (Math.random() - 0.5) * 40;
              break;
            case 'fromtop':
              dustX = edgePos.x + (Math.random() - 0.5) * 50;
              dustY = edgePos.y + (Math.random() - 0.5) * 40;
              driftX = (Math.random() - 0.5) * 40;
              driftY = -(Math.random() * 50 + 30);
              break;
            case 'fromdown':
              dustX = edgePos.x + (Math.random() - 0.5) * 50;
              dustY = edgePos.y + (Math.random() - 0.5) * 40;
              driftX = (Math.random() - 0.5) * 40;
              driftY = Math.random() * 50 + 30;
              break;
          }
          
          const dust = this.add.circle(dustX, dustY, 3 + Math.random() * 4, 0x8B7355)
            .setAlpha(0.6)
            .setDepth(DEPTH_SYMBOLS + 14);
          
          dustParticles.push(dust);
          
          this.tweens.add({
            targets: dust,
            x: dustX + driftX,
            y: dustY + driftY,
            alpha: 0,
            duration: 800 + Math.random() * 400,
            ease: 'Power2.easeOut',
            onComplete: () => dust.destroy()
          });
        }, 120);
        
        // Wait for the warning sequence (~3 seconds)
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Clean up visual effects
        clearInterval(dustInterval);
        
        // Fade out overlay quickly (false alarm!)
        this.tweens.add({
          targets: overlayGraphics,
          alpha: 0,
          duration: 600,
          ease: 'Power2.easeOut',
          onComplete: () => overlayGraphics.destroy()
        });
        
        fallingDebris.forEach(debris => { if (!debris.destroyed) debris.destroy(); });
        dustParticles.forEach(dust => { if (!dust.destroyed) dust.destroy(); });
        
        // Brief pause before continuing
        await new Promise(resolve => setTimeout(resolve, 400));
      },

    async animateTrollRush(reelsWithTroll, trollPosition, affectedPositions, direction, centerPosition, heroPosition) {
        const cellSize = 70;
        const trollId = clientConfig.symbolsMapping?.banana3 || 13;
        
        // Play troll howl from the forest before entrance
        this.playSfx('troll_before_entrance', { volume: 0.7 });
        
        // VISUAL WARNING SEQUENCE (3 seconds)
        // Create dark overlay that fades in (behind debris)
        const overlayGraphics = this.add.graphics().setDepth(DEPTH_SYMBOLS + 5);
        overlayGraphics.fillStyle(0x000000, 0.6);
        overlayGraphics.fillRect(0, 0, this.cameras.main.width, this.cameras.main.height);
        overlayGraphics.setAlpha(0);
        
        // Fade in dark overlay
        this.tweens.add({
          targets: overlayGraphics,
          alpha: 1,
          duration: 800,
          ease: 'Power2.easeIn'
        });
        
        // Determine entry edge position using actual grid positions
        let entryReel, entryRow;
        
        switch (direction) {
          case 'fromleft':
            // Troll enters from LEFT edge (reel 0)
            entryReel = 0;
            entryRow = centerPosition.row;
            break;
          case 'fromright':
            // Troll enters from RIGHT edge (reel 7)
            entryReel = 7;
            entryRow = centerPosition.row;
            break;
          case 'fromtop':
            // Troll enters from TOP edge (row 0 in grid = bottom in screen coords, so use row 0)
            // Note: Screen Y increases downward, but grid rows increase upward
            entryReel = centerPosition.reel;
            entryRow = 0;
            break;
          case 'fromdown':
            // Troll enters from BOTTOM edge (row 7 in grid = top in screen coords, so use row 7)
            entryReel = centerPosition.reel;
            entryRow = 7;
            break;
        }
        
        // Convert grid position to screen coordinates
        const entryEdgeX = entryReel * cellSize + cellSize / 2 + GRID_OFFSET_X;
        const entryEdgeY = (clientConfig.area.height - 1 - entryRow) * cellSize + cellSize / 2 + GRID_OFFSET_Y;
        
        // Play tree/debris cracking sound
        this.playSfx('troll_trees_crack', { volume: 0.6 });
        
        // Calculate the 3 edge positions where the troll's 3x3 grid touches the edge
        // Troll is 3x3 centered on centerPosition, so it occupies -1, 0, +1 offsets
        const trollEdgePositions = [];
        
        switch (direction) {
          case 'fromleft':
          case 'fromright':
            // Vertical spread: 3 rows (centerRow-1, centerRow, centerRow+1)
            for (let offset = -1; offset <= 1; offset++) {
              const row = centerPosition.row + offset;
              const y = (clientConfig.area.height - 1 - row) * cellSize + cellSize / 2 + GRID_OFFSET_Y;
              trollEdgePositions.push({ x: entryEdgeX, y: y });
            }
            break;
          case 'fromtop':
          case 'fromdown':
            // Horizontal spread: 3 reels (centerReel-1, centerReel, centerReel+1)
            for (let offset = -1; offset <= 1; offset++) {
              const reel = centerPosition.reel + offset;
              const x = reel * cellSize + cellSize / 2 + GRID_OFFSET_X;
              trollEdgePositions.push({ x: x, y: entryEdgeY });
            }
            break;
        }
        
        // Falling/tumbling debris (trees, stumps, bushes, rocks) from the 3 troll edge positions
        const debrisAssets = ['7', '4', '5', '6', '7', '4', '5', '6']; // tree, stump, bush, rock (repeat for variety)
        const numDebris = 12; // More debris!
        const fallingDebris = [];
        
        // Variable distances: full, half, 1/3
        const distanceMultipliers = [1.0, 1.0, 0.5, 0.33, 1.0, 0.5, 0.33, 1.0, 0.5, 0.33, 1.0, 0.5];
        
        for (let i = 0; i < numDebris; i++) {
          // Create and animate debris in sequence - each spawns only when it starts moving
          setTimeout(() => {
            const debrisTexture = debrisAssets[i % debrisAssets.length];
            const distMult = distanceMultipliers[i];
            
            // Pick one of the 3 edge positions (cycle through them)
            const edgePos = trollEdgePositions[i % 3];
            const debrisX = edgePos.x;
            const debrisY = edgePos.y;
            
            let targetX, targetY;
            
            // Calculate target position based on direction
            switch (direction) {
              case 'fromleft':
                // Target spreads into the grid from left
                targetX = debrisX + (Math.random() * 120 + 80) * distMult;
                targetY = debrisY + (Math.random() - 0.5) * 100;
                break;
              case 'fromright':
                // Target spreads into the grid from right
                targetX = debrisX - (Math.random() * 120 + 80) * distMult;
                targetY = debrisY + (Math.random() - 0.5) * 100;
                break;
              case 'fromtop':
                // Target spreads into the grid from top (row 0 = bottom of screen, toss upward)
                targetX = debrisX + (Math.random() - 0.5) * 100;
                targetY = debrisY - (Math.random() * 120 + 80) * distMult;
                break;
              case 'fromdown':
                // Target spreads into the grid from bottom (row 7 = top of screen, toss downward)
                targetX = debrisX + (Math.random() - 0.5) * 100;
                targetY = debrisY + (Math.random() * 120 + 80) * distMult;
                break;
            }
            
            // Create debris sprite
            const debris = this.add.image(debrisX, debrisY, debrisTexture)
              .setOrigin(0.5)
              .setScale(normalScale) // Normal symbol size
              .setDepth(DEPTH_SYMBOLS + 15) // Above darkness
              .setAlpha(1); // Fully visible
            
            fallingDebris.push(debris);
            
            // Immediately start tween (debris created in motion)
            // Phase 1: Toss debris - stays visible until it hits the ground
            this.tweens.add({
              targets: debris,
              x: targetX,
              y: targetY,
              rotation: (Math.random() - 0.5) * 6, // More rotation
              scale: normalScale * 0.8,
              alpha: 0.95, // Stay almost fully visible during flight
              duration: 350 + i * 50, // Very fast (350-900ms)
              ease: 'Power2.easeOut',
              onComplete: () => {
                // Phase 2: Fade out after hitting the ground
                this.tweens.add({
                  targets: debris,
                  alpha: 0,
                  duration: 300, // Quick fade out
                  ease: 'Power2.easeIn'
                });
              }
            });
          }, i * 120); // Stagger spawn timing
        }
        
        // Escalating screen shake (building tension)
        setTimeout(() => {
          this.cameras.main.shake(200, 0.003); // Small tremor
        }, 500);
        
        setTimeout(() => {
          this.cameras.main.shake(200, 0.006); // Medium tremor
        }, 1200);
        
        setTimeout(() => {
          this.cameras.main.shake(300, 0.01); // Stronger tremor
        }, 2000);
        
        // Dust/debris particles from the 3 troll edge positions
        const dustParticles = [];
        const dustInterval = setInterval(() => {
          // Pick a random one of the 3 edge positions
          const edgePos = trollEdgePositions[Math.floor(Math.random() * 3)];
          let dustX, dustY, driftX, driftY;
          
          switch (direction) {
            case 'fromleft':
              dustX = edgePos.x + (Math.random() - 0.5) * 40;
              dustY = edgePos.y + (Math.random() - 0.5) * 50;
              driftX = Math.random() * 50 + 30;
              driftY = (Math.random() - 0.5) * 40;
              break;
            case 'fromright':
              dustX = edgePos.x + (Math.random() - 0.5) * 40;
              dustY = edgePos.y + (Math.random() - 0.5) * 50;
              driftX = -(Math.random() * 50 + 30);
              driftY = (Math.random() - 0.5) * 40;
              break;
            case 'fromtop':
              dustX = edgePos.x + (Math.random() - 0.5) * 50;
              dustY = edgePos.y + (Math.random() - 0.5) * 40;
              driftX = (Math.random() - 0.5) * 40;
              driftY = -(Math.random() * 50 + 30); // Drift upward into grid
              break;
            case 'fromdown':
              dustX = edgePos.x + (Math.random() - 0.5) * 50;
              dustY = edgePos.y + (Math.random() - 0.5) * 40;
              driftX = (Math.random() - 0.5) * 40;
              driftY = Math.random() * 50 + 30; // Drift downward into grid
              break;
          }
          
          const dust = this.add.circle(dustX, dustY, 3 + Math.random() * 4, 0x8B7355)
            .setAlpha(0.6)
            .setDepth(DEPTH_SYMBOLS + 14); // Above darkness
          
          dustParticles.push(dust);
          
          this.tweens.add({
            targets: dust,
            x: dustX + driftX,
            y: dustY + driftY,
            alpha: 0,
            duration: 800 + Math.random() * 400,
            ease: 'Power2.easeOut',
            onComplete: () => dust.destroy()
          });
        }, 120);
        
        // Play rushing growl 500ms before the charge
        setTimeout(() => {
          this.playSfx('troll_rushing_growl', { volume: 0.8 });
        }, 2500);
        
        // Wait for howl to complete (~3 seconds)
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Clean up visual effects
        clearInterval(dustInterval);
        overlayGraphics.destroy();
        fallingDebris.forEach(debris => debris.destroy());
        dustParticles.forEach(dust => { if (!dust.destroyed) dust.destroy(); });
        
        // Camera shake for impact
        this.cameras.main.shake(500, 0.015);
        
        // Calculate troll center screen position
        const trollCenterX = centerPosition.reel * cellSize + cellSize / 2 + GRID_OFFSET_X;
        const trollCenterY = (clientConfig.area.height - 1 - centerPosition.row) * cellSize + cellSize / 2 + GRID_OFFSET_Y;
        
        // Calculate troll start position from grid edge (same as debris)
        let trollStartX = entryEdgeX;
        let trollStartY = entryEdgeY;
        
        // Create the big troll sprite off-screen (reduced by 90%)
        const trollTexture = getTrollTexture(direction);
        const trollSprite = this.add.image(trollStartX, trollStartY, trollTexture)
          .setOrigin(0.5)
          .setScale(normalScale * 0.3) // 90% smaller (10% of original 3x scale)
          .setDepth(DEPTH_BANANAS + 5); // Above everything during rush
        
        // Animate symbols being destroyed
        const symbolDestroyPromises = affectedPositions.map((affected, index) => {
          return new Promise(resolve => {
            setTimeout(() => {
              const symbolX = affected.reel * cellSize + cellSize / 2 + GRID_OFFSET_X;
              const symbolY = (clientConfig.area.height - 1 - affected.row) * cellSize + cellSize / 2 + GRID_OFFSET_Y;
              
              // Get existing sprite if it exists
              const existingSprite = this.reelSprites[affected.reel]?.[affected.row];
              
              if (existingSprite && !existingSprite.destroyed && affected.newSymbol === trollId) {
                // Symbol replaced by troll - toss it away
                const tossAngle = Math.atan2(symbolY - trollCenterY, symbolX - trollCenterX);
                const tossDist = 100 + Math.random() * 50;
                
                // Clear sprite reference immediately
                if (this.reelSprites[affected.reel]) {
                  this.reelSprites[affected.reel][affected.row] = null;
                }
                
                // Mark sprite as being destroyed to prevent other systems from interacting with it
                existingSprite.isBeingDestroyed = true;
                
                // Kill any existing tweens on this sprite to prevent conflicts
                this.tweens.killTweensOf(existingSprite);
                
                // Move to a disposal layer (behind everything) immediately
                existingSprite.setDepth(-1000);
                
                // Clean up banana backplate immediately if it has one
                this.destroyBananaBackplate(existingSprite);
                
                this.tweens.add({
                  targets: existingSprite,
                  x: symbolX + Math.cos(tossAngle) * tossDist,
                  y: symbolY + Math.sin(tossAngle) * tossDist,
                  rotation: (Math.random() - 0.5) * 4,
                  scale: existingSprite.scale * 0.5,
                  alpha: 0,
                  duration: 400,
                  ease: 'Power2.easeOut',
                  onComplete: () => {
                    if (!existingSprite.destroyed) {
                      existingSprite.destroy();
                    }
                    resolve();
                  }
                });
                
                // Impact flash
                const flash = this.add.circle(symbolX, symbolY, 20, 0xFFFFFF)
                  .setAlpha(0.6)
                  .setDepth(DEPTH_BANANAS + 4);
                
                this.tweens.add({
                  targets: flash,
                  alpha: 0,
                  scale: 2,
                  duration: 300,
                  onComplete: () => flash.destroy()
                });
                
              } else if (existingSprite && !existingSprite.destroyed && affected.newSymbol === 0) {
                // Symbol destroyed in troll's path (set to 0) - TOSS it away violently
                const tossAngle = Math.atan2(symbolY - trollCenterY, symbolX - trollCenterX);
                const tossDist = 120 + Math.random() * 80; // Further toss for destroyed symbols
                
                // Clear sprite reference immediately
                if (this.reelSprites[affected.reel]) {
                  this.reelSprites[affected.reel][affected.row] = null;
                }
                
                // Mark sprite as being destroyed to prevent other systems from interacting with it
                existingSprite.isBeingDestroyed = true;
                
                // Kill any existing tweens on this sprite to prevent conflicts
                this.tweens.killTweensOf(existingSprite);
                
                // Move to a disposal layer (behind everything) immediately
                existingSprite.setDepth(-1000);
                
                // Clean up banana backplate immediately if it has one
                this.destroyBananaBackplate(existingSprite);
                
                this.tweens.add({
                  targets: existingSprite,
                  x: symbolX + Math.cos(tossAngle) * tossDist,
                  y: symbolY + Math.sin(tossAngle) * tossDist,
                  rotation: (Math.random() - 0.5) * 6, // More spinning
                  scale: existingSprite.scale * 0.3,
                  alpha: 0,
                  duration: 500,
                  ease: 'Power2.easeOut',
                  onComplete: () => {
                    if (!existingSprite.destroyed) {
                      existingSprite.destroy();
                    }
                    resolve();
                  }
                });
                
                // Impact flash
                const flash = this.add.circle(symbolX, symbolY, 15, 0xFFAA00)
                  .setAlpha(0.7)
                  .setDepth(DEPTH_BANANAS + 4);
                
                this.tweens.add({
                  targets: flash,
                  alpha: 0,
                  scale: 2.5,
                  duration: 350,
                  onComplete: () => flash.destroy()
                });
                
                // Debris particles
                for (let p = 0; p < 8; p++) {
                  const particle = this.add.circle(
                    symbolX,
                    symbolY,
                    2 + Math.random() * 3,
                    0xAAAAAA
                  )
                    .setDepth(DEPTH_BANANAS + 3)
                    .setAlpha(0.8);
                  
                  const particleAngle = Math.random() * Math.PI * 2;
                  const particleDist = 40 + Math.random() * 50;
                  
                  this.tweens.add({
                    targets: particle,
                    x: symbolX + Math.cos(particleAngle) * particleDist,
                    y: symbolY + Math.sin(particleAngle) * particleDist,
                    alpha: 0,
                    duration: 500 + Math.random() * 200,
                    ease: 'Power2.easeOut',
                    onComplete: () => particle.destroy()
                  });
                }
              } else {
                resolve();
              }
            }, index * 8); // Stagger destruction - much faster to stay with troll movement
          });
        });
        
        // Troll rushes in - VERY FAST with rush trails (like hero)
        const trollRushDuration = 250; // Very fast rush
        
        // Create rush trail effect during rush - actual troll images fading behind
        const blurTrailInterval = setInterval(() => {
          const trail = this.add.image(trollSprite.x, trollSprite.y, trollTexture)
            .setOrigin(0.5)
            .setScale(trollScale)
            .setDepth(DEPTH_BANANAS - 1)
            .setAlpha(0.5) // More visible than before
            .setTint(BANANA_TRAIL_TINT);
          
          this.tweens.add({
            targets: trail,
            alpha: 0,
            scale: trollScale * 0.85,
            duration: 200,
            ease: 'Power2.easeOut',
            onComplete: () => trail.destroy()
          });
        }, 25); // Create trail every 25ms for dense effect
        
        await new Promise(resolve => {
          this.tweens.add({
            targets: trollSprite,
            x: trollCenterX,
            y: trollCenterY,
            duration: trollRushDuration,
            ease: 'Power3.easeOut',
            onComplete: () => {
              clearInterval(blurTrailInterval); // Stop creating blur trails
              resolve();
            }
          });
        });
        
        // Troll lands with impact
        this.cameras.main.shake(200, 0.025);
        
        // HERO DISAPPEARS (ninja/matrix dodge) when troll lands!
        if (heroPosition && heroPosition.reel !== undefined && heroPosition.row !== undefined && this.heroSprite) {
          // Create afterimages as hero disappears
          for (let i = 0; i < 3; i++) {
            setTimeout(() => {
              const afterimage = this.add.image(this.heroSprite.x, this.heroSprite.y, this.heroSprite.texture.key)
                .setOrigin(0.5)
                .setScale(this.heroSprite.scale)
                .setDepth(DEPTH_HERO - 1)
                .setAlpha(0.5 - i * 0.15)
                .setTint(0x00FFFF); // Cyan tint for matrix effect
              
              this.tweens.add({
                targets: afterimage,
                alpha: 0,
                scale: this.heroSprite.scale * 1.3,
                duration: 300,
                ease: 'Power2.easeOut',
                onComplete: () => afterimage.destroy()
              });
            }, i * 50);
          }
          
          // Hero sprite fades out instantly
          this.tweens.add({
            targets: this.heroSprite,
            alpha: 0,
            scale: 0.5,
            duration: 150,
            ease: 'Power3.easeIn'
          });
          
          // Speed lines for quick dodge
          for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI * 2;
            const speedLine = this.add.rectangle(
              this.heroSprite.x,
              this.heroSprite.y,
              30,
              2,
              0x00FFFF,
              0.6
            )
              .setOrigin(0, 0.5)
              .setDepth(DEPTH_HERO + 1)
              .setRotation(angle);
            
            this.tweens.add({
              targets: speedLine,
              x: this.heroSprite.x + Math.cos(angle) * 80,
              y: this.heroSprite.y + Math.sin(angle) * 80,
              alpha: 0,
              duration: 200,
              ease: 'Power2.easeOut',
              onComplete: () => speedLine.destroy()
            });
          }
        }
        
        // Wait a moment for hero disappear effect
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // Lower troll depth to match other bananas
        trollSprite.setDepth(DEPTH_BANANAS);
        
        // Store troll sprite in all 9 positions
        for (const pos of trollPosition) {
          if (!this.reelSprites[pos.reel]) {
            this.reelSprites[pos.reel] = [];
          }
          
          // Safety: If there's still a sprite at this position, destroy it
          const existingSprite = this.reelSprites[pos.reel][pos.row];
          if (existingSprite && !existingSprite.destroyed && !existingSprite.isBeingDestroyed && existingSprite !== trollSprite) {
            // Kill any tweens first
            this.tweens.killTweensOf(existingSprite);
            existingSprite.destroy();
          } else if (existingSprite && existingSprite.isBeingDestroyed) {
            // Just clear the reference if it's already being destroyed
            this.reelSprites[pos.reel][pos.row] = null;
          }
          
          this.reelSprites[pos.reel][pos.row] = trollSprite;
        }
        
        // Mark as 3x3 troll
        trollSprite.symbolKey = trollId;
        trollSprite.isTroll3x3 = true;
        trollSprite.trollDirection = direction; // Store direction for reference
        
        // Wait for all symbol destruction animations to complete
        await Promise.all(symbolDestroyPromises);
        
        // Failsafe: Ensure all affected positions have cleared sprite references
        affectedPositions.forEach(affected => {
          if (this.reelSprites[affected.reel]) {
            const sprite = this.reelSprites[affected.reel][affected.row];
            // If sprite is destroyed or being destroyed, clear the reference
            if (sprite && (sprite.destroyed || sprite.isBeingDestroyed)) {
              this.reelSprites[affected.reel][affected.row] = null;
            }
          }
        });
        
        // Brief pause to show the troll
        await this.waitForPresentation(300, { skippable: true });
      },

    async dropSymbols(reels, executedAction, weapon = "staff", necromancerSpawns = [], timeSymbols = []) {
        // Store weapon for hero texture
        this.currentHeroWeapon = weapon;
        
        // Track depleted time symbols (survives respins, cleared on new spin)
        if (!this.depletedTimeSymbols) {
          this.depletedTimeSymbols = new Set();
        }
        
        // If no necromancer spawns, do the reset here (otherwise Client already did it)
        const hasNecroSpawns = necromancerSpawns && necromancerSpawns.length > 0;
        
        if (executedAction === 'spin' && !hasNecroSpawns) {
          // Clear depleted time symbols on new spin
          this.depletedTimeSymbols.clear();
          // Reset multiplier on new spin
          this.currentMultiplier = 1;
          
          // Clear blood splatters from previous round
          this.clearBloodSplatters();
          
          // Remove multiplier effects on new spin
          this.cleanupMultiplierEffects();
          
          // Reset count-up display on new spin (instant, no animation)
          this.currentDisplayedWin = 0;
          if (this.countUpText && !this.countUpText.destroyed) {
            this.countUpText.setVisible(false); // Hide when 0
          }
          
          if (this.totalWinText) {
            this.tweens.add({
              targets: this.totalWinText,
              duration: 100,
              alpha: 0,
              repeat: 0,
              ease: 'Sine.easeInOut'
            });
          }
          
          this.clearMonkeyWildStrengthBadge();
          this.clearHeroWildActiveBadge();
          this.showMainGameHeroAtCenter?.(weapon || this.currentHeroWeapon || "staff", {
            animateFromCurrentPosition: true
          });
          
          // Slide out old symbols - WAIT for them to finish before creating new ones
          await this.slideOutOldSymbols();
        }
    
        const cellSize = 70;
        const dropDuration = 500;
        const dropDelayPerSymbol = 20;
        const promises = [];
        const preservedFeatureSprites = new Map();
        if (executedAction === 'freespin' && Array.isArray(this.reelSprites)) {
          this.reelSprites.forEach((column, reel) => {
            if (!Array.isArray(column)) return;
            column.forEach((sprite, row) => {
              if (!sprite || sprite.destroyed) return;
              const symbolId = this.getDisplayObjectSymbolId(sprite);
              if (!this.isPersistentBonusFeatureSymbol(symbolId)) return;
              preservedFeatureSprites.set(`${reel},${row}`, sprite);
            });
          });
        }
        const reusedFeatureSprites = new Set();
    
        this.reelSprites = []; // 🔄 Reset all reels
        
        // Build set of necromancer spawn positions for quick lookup
        const necroSpawnSet = new Set();
        if (necromancerSpawns && necromancerSpawns.length > 0) {
          necromancerSpawns.forEach(s => necroSpawnSet.add(`${s.reel},${s.row}`));
        }
    
        Object.entries(reels).forEach(([reelIndexStr, symbols]) => {
          const reelIndex = parseInt(reelIndexStr); // Don't subtract 1 - already 0-indexed
          const x = reelIndex * cellSize + cellSize / 2 + GRID_OFFSET_X;
    
          this.reelSprites[reelIndex] = []; // ✅ Initialize this reel once here
    
          for (let row = 0; row < clientConfig.area.height; row++) {
            const symbolKey = symbols[row];
            const yTarget = (clientConfig.area.height - 1 - row) * cellSize + cellSize / 2 + GRID_OFFSET_Y;
    
            // Skip creating sprite for special symbols (HOUSE, HERO) - they have their own sprites
            // But bananas drop like regular symbols!
            const houseId = clientConfig.symbolsMapping?.house || 'HOUSE';
            const heroId = clientConfig.symbolsMapping?.hero || 10;
            
            if (symbolKey === houseId || symbolKey === heroId) {
              this.reelSprites[reelIndex][row] = null;
              continue;
            }
            
            // Check if this position has a necromancer-spawned banana (already animated)
            const isNecroSpawn = necroSpawnSet.has(`${reelIndex},${row}`);
            if (isNecroSpawn && this.necromancerBananaSprites) {
              // Find the already-spawned banana sprite and register it
              const existingSpawn = this.necromancerBananaSprites.find(
                ns => ns.reel === reelIndex && ns.row === row
              );
              if (existingSpawn) {
                this.reelSprites[reelIndex][row] = existingSpawn.sprite;
                this.ensureSymbolBonusGridBaseTbmOverlay(existingSpawn.sprite, reelIndex, row);
                continue; // Don't create new sprite or animate drop
              }
            }
    
            // Check if this position had a depleted time symbol - use depleted texture directly
            const timeSymbolId = clientConfig.symbolsMapping?.time || 16;
            const depletedSymbolId = clientConfig.symbolsMapping?.time_depleted || 17;
            const posKey = `${reelIndex},${row}`;
            const wasDepletedHere = this.depletedTimeSymbols?.has(posKey);
            
            // Use depleted texture if this was a depleted time symbol
            let textureKey = this.getBonusAwareSymbolTextureKey(symbolKey);
            let isDepleted = false;
            if (wasDepletedHere && String(symbolKey) === String(timeSymbolId)) {
              textureKey = String(depletedSymbolId);
              isDepleted = true;
            }
    
            // Use appropriate scale and depth based on symbol type
            const trollId = clientConfig.symbolsMapping?.banana3 || 13;
            const scale = getSymbolScale(symbolKey);
            const depth = getBoardSymbolDepth(symbolKey);
            const preservedFeatureSprite = this.isPersistentBonusFeatureSymbol(symbolKey)
              ? preservedFeatureSprites.get(posKey)
              : null;
            if (preservedFeatureSprite && !preservedFeatureSprite.destroyed) {
              this.tweens.killTweensOf(preservedFeatureSprite);
              preservedFeatureSprite.isBeingDestroyed = false;
              preservedFeatureSprite.isDepleted = false;
              preservedFeatureSprite.symbolKey = normalizeSymbolKey(symbolKey);
              preservedFeatureSprite.setPosition?.(x, yTarget);
              preservedFeatureSprite.setVisible?.(true);
              preservedFeatureSprite.setAlpha?.(1);
              const renderable = getReelSymbolRenderable(preservedFeatureSprite);
              if (renderable && !renderable.destroyed) {
                renderable.setTexture?.(String(symbolKey));
                renderable.setScale?.(scale);
                renderable.setVisible?.(true);
                renderable.setAlpha?.(1);
              }
              this.setReelCellGraphicDepth(preservedFeatureSprite, depth);
              this.primeFeatureSymbolFloatingTilt(preservedFeatureSprite, symbolKey);
              this.reelSprites[reelIndex][row] = preservedFeatureSprite;
              reusedFeatureSprites.add(preservedFeatureSprite);
              this.ensureSymbolBonusGridBaseTbmOverlay(preservedFeatureSprite, reelIndex, row);
              continue;
            }
            
            // Start just above visible grid (row 8 = 1 cell above top)
            const startY = this.getVisibleStartPosition(clientConfig.area.height + 1, 'down', cellSize);
            const sprite = this.add.image(x, startY, textureKey)
              .setOrigin(0.5)
              .setScale(scale)
              .setDepth(depth);
            sprite.symbolKey = isDepleted ? normalizeSymbolKey(depletedSymbolId) : normalizeSymbolKey(symbolKey);
            sprite.isDepleted = isDepleted;
            this.primeFeatureSymbolFloatingTilt(sprite, symbolKey);
            
            // Mark troll sprites as 3x3 troll
            if (Number(symbolKey) === Number(trollId)) {
              sprite.isTroll3x3 = true;
            }
    
            this.reelSprites[reelIndex][row] = sprite;
            this.ensureSymbolBonusGridBaseTbmOverlay(sprite, reelIndex, row);
            const dropTweenRoot = this.reelSprites[reelIndex][row];
    
            const dropTween = new Promise(resolve => {
              this.tweens.add({
                targets: dropTweenRoot,
                y: yTarget,
                ease: 'Expo.easeIn',
                duration: dropDuration - reelIndex * 10,
                delay: row * dropDelayPerSymbol + reelIndex * 50,
                onComplete: () => {
                  // Play landing sound when last symbol in reel lands
                  if (row === clientConfig.area.height - 1) {
                    const landSound = this.getLandingSoundByReel(reelIndex);
                    this.playLandingSoundIfNotPlaying(landSound, 0.3);
                  }
                  resolve();
                }
              });
            });
    
            promises.push(dropTween);
          }
        });
        preservedFeatureSprites.forEach((sprite) => {
          if (!sprite || sprite.destroyed || reusedFeatureSprites.has(sprite)) return;
          this.tweens.killTweensOf(sprite);
          this.destroyBananaBackplate(sprite);
          sprite.destroy();
        });
    
        await Promise.all(promises);
    
        this.refreshAllBonusGridSymbolBaseTbmOverlays();
        this.refreshBonusMultiplierFruitOrbVisuals();
    
        // Create/update house and hero visuals on top
        // Note: Bananas are now regular animated sprites, not special sprites
        this.createOrUpdateHouse(this.currentMultiplier || 1);
        this.createOrUpdateHero(reels);

        // Refresh all banana backplates after drop
        this.refreshAllBananaBackplates();
        
        // Re-apply depleted state to any time symbols that were already depleted (from previous respins)
        // Swap texture to depleted version (symbol 17) instead of using alpha/tint
        const timeSymbolId = clientConfig.symbolsMapping?.time || 16;
        const depletedSymbolId = clientConfig.symbolsMapping?.time_depleted || 17;
        
        if (this.depletedTimeSymbols) {
          this.depletedTimeSymbols.forEach(posKey => {
            const [reelStr, rowStr] = posKey.split(',');
            const reel = parseInt(reelStr);
            const row = parseInt(rowStr);
            const sprite = this.reelSprites[reel]?.[row];
            
            // Check if it's a time symbol OR already depleted (by symbolKey)
            if (sprite && (String(sprite.symbolKey) === String(timeSymbolId) || String(sprite.symbolKey) === String(depletedSymbolId))) {
              const g = getReelSymbolRenderable(sprite);
              if (g) g.setTexture(String(depletedSymbolId));
              sprite.symbolKey = depletedSymbolId;
              sprite.isDepleted = true;
            }
          });
        }
        
        // Play time symbol beam effect (energy transfers to sky)
        if (timeSymbols && timeSymbols.length > 0) {
          await this.playTimeSymbolBeamEffect(timeSymbols);
        }
        this.syncBonusMysteryFeatureSpinState();
        this.refreshBonusMultiplierFruitOrbVisuals();
      },

    async playBarrelBurstAnimation(barrelBursts = []) {
        if (!Array.isArray(barrelBursts) || barrelBursts.length === 0) return;
    
        const cellSize = 70;
        const burstDelay = 260;
        const burstLifetime = 280;
        const anticipationDuration = 760;
        const bananaTexture = this.textures.exists('banana_transparent') ? 'banana_transparent' : '11';
        const ringColor = 0xF4C542;
        const sparkColors = [0xFFE082, 0xDCE775, 0xFFCA28];
        const normalizeBurstSymbol = (symbol) => {
          const parsed = Number(symbol);
          return Number.isFinite(parsed) ? parsed : symbol;
        };
        const applySpriteSymbolVisual = (sprite, symbol) => {
          if (!sprite || sprite.destroyed) return;
          if (symbol === undefined || symbol === null || symbol === '') return;
          this.tweens.killTweensOf(sprite);
          sprite.isBeingDestroyed = false;
          const normalizedSymbol = normalizeBurstSymbol(symbol);
          const depth = getBoardSymbolDepth(normalizedSymbol);
          const g = getReelSymbolRenderable(sprite);
          if (g) {
            g.setTexture(this.getBonusAwareSymbolTextureKey(normalizedSymbol));
            g.setScale(getSymbolScale(normalizedSymbol));
          }
          sprite.symbolKey = normalizedSymbol;
          this.setReelCellGraphicDepth(sprite, depth);
          sprite.setVisible(true);
          sprite.setAlpha(1);
        };
    
        // Keep original symbols visible until the burst resolves.
        barrelBursts.forEach((burst) => {
          const restoreOldSymbols = (positions = []) => {
            positions.forEach((pos) => {
              const reel = Number(pos?.reel);
              const row = Number(pos?.row);
              if (!Number.isFinite(reel) || !Number.isFinite(row)) return;
              const targetSprite = this.reelSprites?.[reel]?.[row];
              if (!targetSprite || targetSprite.destroyed) return;
              applySpriteSymbolVisual(targetSprite, pos?.oldSymbol);
            });
          };
          restoreOldSymbols(Array.isArray(burst?.positions) ? burst.positions : []);
          restoreOldSymbols(Array.isArray(burst?.bananaPositions) ? burst.bananaPositions : []);
        });
    
        const burstPromises = barrelBursts.map((burst, index) => new Promise((resolve) => {
          this.time.delayedCall(index * burstDelay, () => {
            const runBurst = async () => {
              const sourceReel = Number(burst?.reel);
              const sourceRow = Number(burst?.row);
              const sourceX = sourceReel * cellSize + cellSize / 2 + GRID_OFFSET_X;
              const sourceY = (clientConfig.area.height - 1 - sourceRow) * cellSize + cellSize / 2 + GRID_OFFSET_Y;
    
              if (!Number.isFinite(sourceX) || !Number.isFinite(sourceY)) {
                return;
              }
    
              const sourceCellSprite = this.reelSprites?.[sourceReel]?.[sourceRow];
              const sourceScale = sourceCellSprite && !sourceCellSprite.destroyed
                ? Math.max(0.2, Number(sourceCellSprite.scaleX) || normalScale)
                : normalScale;
              const sourceDepth = sourceCellSprite && !sourceCellSprite.destroyed
                ? (Number(sourceCellSprite.depth) || DEPTH_BANANAS) + 2
                : DEPTH_BANANAS + 2;
              const originalSourceAlpha = sourceCellSprite && !sourceCellSprite.destroyed
                ? Number(sourceCellSprite.alpha)
                : null;
    
              if (sourceCellSprite && !sourceCellSprite.destroyed) {
                sourceCellSprite.setAlpha(Math.min(originalSourceAlpha ?? 1, 0.45));
              }
    
              const anticipationSprite = this.add.image(sourceX, sourceY, '16')
                .setDepth(sourceDepth)
                .setScale(sourceScale)
                .setAlpha(1);
    
              await new Promise((anticipationResolve) => {
                const wiggleTween = this.tweens.add({
                  targets: anticipationSprite,
                  x: {
                    from: sourceX - 6,
                    to: sourceX + 6
                  },
                  angle: {
                    from: -7,
                    to: 7
                  },
                  duration: 70,
                  yoyo: true,
                  repeat: 5,
                  ease: 'Sine.easeInOut',
                  onComplete: () => {
                    anticipationSprite.setX(sourceX);
                    anticipationSprite.setAngle(0);
                  }
                });
    
                this.tweens.add({
                  targets: anticipationSprite,
                  scaleX: sourceScale * 1.14,
                  scaleY: sourceScale * 0.9,
                  duration: anticipationDuration / 2,
                  yoyo: true,
                  ease: 'Quad.easeInOut'
                });
    
                this.tweens.add({
                  targets: anticipationSprite,
                  alpha: 0.68,
                  duration: 120,
                  yoyo: true,
                  repeat: 4,
                  ease: 'Sine.easeInOut'
                });
    
                this.time.delayedCall(anticipationDuration, () => {
                  if (wiggleTween?.isPlaying()) {
                    wiggleTween.stop();
                  }
                  if (anticipationSprite && !anticipationSprite.destroyed) {
                    anticipationSprite.destroy();
                  }
                  if (sourceCellSprite && !sourceCellSprite.destroyed && originalSourceAlpha !== null) {
                    sourceCellSprite.setAlpha(originalSourceAlpha);
                  }
                  anticipationResolve();
                });
              });
    
              this.playSfx?.('wins_explode', { volume: 0.25 });
              if (this.cameras?.main) {
                this.cameras.main.shake(SHAKE_BARREL_BURST_DURATION, SHAKE_BARREL_BURST_INTENSITY);
              }
    
              const core = this.add.circle(sourceX, sourceY, 14, 0xFFF3B0)
                .setAlpha(0.85)
                .setDepth(DEPTH_BANANAS + 4)
                .setBlendMode(Phaser.BlendModes.ADD);
              this.tweens.add({
                targets: core,
                radius: 54,
                alpha: 0,
                duration: burstLifetime,
                ease: 'Cubic.easeOut',
                onComplete: () => core.destroy()
              });
    
              const ring = this.add.circle(sourceX, sourceY, 26, ringColor)
                .setStrokeStyle(4, ringColor, 0.9)
                .setFillStyle(ringColor, 0)
                .setDepth(DEPTH_BANANAS + 3)
                .setBlendMode(Phaser.BlendModes.ADD);
              this.tweens.add({
                targets: ring,
                radius: 92,
                alpha: 0,
                duration: burstLifetime,
                ease: 'Quad.easeOut',
                onComplete: () => ring.destroy()
              });
    
              for (let i = 0; i < 12; i++) {
                const angle = (Math.PI * 2 * i) / 12 + Math.random() * 0.25;
                const distance = 30 + Math.random() * 50;
                const spark = this.add.circle(
                  sourceX,
                  sourceY,
                  2 + Math.random() * 2,
                  sparkColors[Math.floor(Math.random() * sparkColors.length)]
                )
                  .setDepth(DEPTH_BANANAS + 5)
                  .setBlendMode(Phaser.BlendModes.ADD);
    
                this.tweens.add({
                  targets: spark,
                  x: sourceX + Math.cos(angle) * distance,
                  y: sourceY + Math.sin(angle) * distance,
                  alpha: 0,
                  duration: 160 + Math.random() * 120,
                  ease: 'Cubic.easeOut',
                  onComplete: () => spark.destroy()
                });
              }
    
              const replacedPositions = Array.isArray(burst?.positions) ? burst.positions : [];
              const destroyPromises = replacedPositions.map((pos) => new Promise((destroyResolve) => {
                const reel = Number(pos?.reel);
                const row = Number(pos?.row);
                if (!Number.isFinite(reel) || !Number.isFinite(row)) {
                  destroyResolve();
                  return;
                }
    
                const targetX = reel * cellSize + cellSize / 2 + GRID_OFFSET_X;
                const targetY = (clientConfig.area.height - 1 - row) * cellSize + cellSize / 2 + GRID_OFFSET_Y;
                if (!Number.isFinite(targetX) || !Number.isFinite(targetY)) {
                  destroyResolve();
                  return;
                }
                const manhattanDistance = Math.abs(reel - sourceReel) + Math.abs(row - sourceRow);
                const shockDelay = manhattanDistance * 85;
                this.time.delayedCall(shockDelay, () => {
                  const targetSprite = this.reelSprites?.[reel]?.[row];
                  const destroySprite = () => {
                    if (!targetSprite || targetSprite.destroyed) {
                      if (this.reelSprites?.[reel]) {
                        this.reelSprites[reel][row] = null;
                      }
                      destroyResolve();
                      return;
                    }
    
                    this.tweens.killTweensOf(targetSprite);
                    this.destroyBananaBackplate(targetSprite);
                    this.tweens.add({
                      targets: targetSprite,
                      alpha: 0,
                      scaleX: targetSprite.scaleX * 0.15,
                      scaleY: targetSprite.scaleY * 0.15,
                      angle: targetSprite.angle + Phaser.Math.Between(-35, 35),
                      duration: 140,
                      ease: 'Back.easeIn',
                      onComplete: () => {
                        if (!targetSprite.destroyed) {
                          targetSprite.destroy();
                        }
                        if (this.reelSprites?.[reel]) {
                          this.reelSprites[reel][row] = null;
                        }
                        destroyResolve();
                      }
                    });
                  };
    
                  const impactFlash = this.add.circle(targetX, targetY, 10, 0xFFE082)
                    .setDepth(DEPTH_BANANAS + 6)
                    .setAlpha(0.9)
                    .setBlendMode(Phaser.BlendModes.ADD);
                  this.tweens.add({
                    targets: impactFlash,
                    radius: 28,
                    alpha: 0,
                    duration: 180,
                    ease: 'Quad.easeOut',
                    onComplete: () => impactFlash.destroy()
                  });
    
                  if (targetSprite && !targetSprite.destroyed) {
                    applySpriteSymbolVisual(targetSprite, pos?.oldSymbol);
                    destroySprite();
                  } else {
                    destroyResolve();
                  }
                });
              }));
    
              const bananaPositions = Array.isArray(burst?.bananaPositions) ? burst.bananaPositions : [];
              const bananaSpawnPromises = bananaPositions.map((pos, flightIndex) => new Promise((bananaResolve) => {
                const reel = Number(pos?.reel);
                const row = Number(pos?.row);
                if (!Number.isFinite(reel) || !Number.isFinite(row)) {
                  bananaResolve();
                  return;
                }
    
                const targetX = reel * cellSize + cellSize / 2 + GRID_OFFSET_X;
                const targetY = (clientConfig.area.height - 1 - row) * cellSize + cellSize / 2 + GRID_OFFSET_Y;
                const landingSymbol = (pos?.newSymbol !== undefined && pos?.newSymbol !== null)
                  ? pos.newSymbol
                  : null;
                if (!Number.isFinite(targetX) || !Number.isFinite(targetY) || landingSymbol === null) {
                  bananaResolve();
                  return;
                }
    
                this.time.delayedCall(120 + flightIndex * 45, () => {
                  const bananaFx = this.add.image(sourceX, sourceY, bananaTexture)
                    .setDepth(DEPTH_BANANAS + 7)
                    .setScale(0.22)
                    .setAlpha(0.95)
                    .setRotation(Phaser.Math.FloatBetween(-0.35, 0.35));
                  bananaFx.isTransientBananaFx = true;
    
                  const distance = Phaser.Math.Distance.Between(sourceX, sourceY, targetX, targetY);
                  const arcHeight = Math.min(145, 45 + distance * 0.24);
                  const flightDuration = 240 + distance * 0.8 + Math.random() * 90;
                  const flightState = { t: 0 };
                  const travelAngle = Phaser.Math.Angle.Between(sourceX, sourceY, targetX, targetY);
    
                  this.tweens.add({
                    targets: flightState,
                    t: 1,
                    duration: flightDuration,
                    ease: 'Cubic.easeInOut',
                    onUpdate: () => {
                      const t = flightState.t;
                      bananaFx.x = Phaser.Math.Linear(sourceX, targetX, t);
                      bananaFx.y = Phaser.Math.Linear(sourceY, targetY, t) - Math.sin(Math.PI * t) * arcHeight;
                      bananaFx.rotation = travelAngle + (1 - t) * 0.7;
                      bananaFx.setScale(0.22 + t * 0.18);
                      bananaFx.setAlpha(0.95 - Math.max(0, t - 0.85) * 4);
                    },
                    onComplete: () => {
                      bananaFx.destroy();
    
                      let targetSprite = this.reelSprites?.[reel]?.[row];
                      if (targetSprite && !targetSprite.destroyed) {
                        applySpriteSymbolVisual(targetSprite, landingSymbol);
                      } else {
                        const normalizedSymbol = normalizeBurstSymbol(landingSymbol);
                        const depth = getBoardSymbolDepth(normalizedSymbol);
                        const created = this.add.image(targetX, targetY, this.getBonusAwareSymbolTextureKey(normalizedSymbol))
                          .setOrigin(0.5)
                          .setScale(getSymbolScale(normalizedSymbol))
                          .setDepth(depth)
                          .setAlpha(1);
                        created.symbolKey = normalizedSymbol;
                        created.isBeingDestroyed = false;
                        if (!this.reelSprites[reel]) this.reelSprites[reel] = [];
                        this.reelSprites[reel][row] = created;
                        targetSprite = created;
                      }
    
                      const landingFlash = this.add.circle(targetX, targetY, 10, 0xFFE082)
                        .setDepth(DEPTH_BANANAS + 6)
                        .setAlpha(0.95)
                        .setBlendMode(Phaser.BlendModes.ADD);
                      this.tweens.add({
                        targets: landingFlash,
                        radius: 26,
                        alpha: 0,
                        duration: 180,
                        ease: 'Quad.easeOut',
                        onComplete: () => landingFlash.destroy()
                      });
    
                      if (targetSprite && !targetSprite.destroyed) {
                        const startScaleX = targetSprite.scaleX;
                        const startScaleY = targetSprite.scaleY;
                        this.tweens.add({
                          targets: targetSprite,
                          scaleX: startScaleX * 1.14,
                          scaleY: startScaleY * 1.14,
                          duration: 90,
                          yoyo: true,
                          ease: 'Sine.easeOut'
                        });
                      }
                      bananaResolve();
                    }
                  });
                });
              }));
    
              const phasePromises = [...destroyPromises, ...bananaSpawnPromises];
              if (phasePromises.length > 0) {
                await Promise.all(phasePromises);
              } else {
                await this.waitForPresentation(120, { skippable: true });
              }
            };
    
            runBurst()
              .then(() => resolve())
              .catch(() => resolve());
          });
        }));
    
        await Promise.all(burstPromises);
        await this.waitForPresentation(100, { skippable: true });
      },

    playTimeSymbolLandingEffect(x, y) {
        const GLOW_COLOR = 0x4488FF;       // Blue glow
        const SPARK_COLOR = 0x88CCFF;      // Light blue sparks
        const LIGHTNING_COLOR = 0xAADDFF;  // Lightning blue
        
        // Play hammer lightning sound
        this.playSfx('lightning_hammer', { volume: 0.4 });
        
        // === LIGHTNING BOLT TO SKY ===
        const startY = y;
        const endY = 0; // Top of screen
        
        // Create jagged lightning path
        const points = [];
        const segments = 12; // More segments for jagged look
        const segmentHeight = (startY - endY) / segments;
        let currentX = x;
        
        points.push({ x: currentX, y: startY });
        for (let s = 1; s < segments; s++) {
          currentX += (Math.random() - 0.5) * 50; // Increased jitter (25 * 2 = 50)
          points.push({ x: currentX, y: startY - s * segmentHeight });
        }
        points.push({ x: currentX, y: endY });
        
        // Draw lightning bolt
        const bolt = this.add.graphics().setDepth(1001);
        
        // Outer glow
        bolt.lineStyle(8, LIGHTNING_COLOR, 0.5);
        bolt.beginPath();
        bolt.moveTo(points[0].x, points[0].y);
        points.forEach(p => bolt.lineTo(p.x, p.y));
        bolt.strokePath();
        
        // Core
        bolt.lineStyle(3, 0xFFFFFF, 0.9);
        bolt.beginPath();
        bolt.moveTo(points[0].x, points[0].y);
        points.forEach(p => bolt.lineTo(p.x, p.y));
        bolt.strokePath();
        
        // Fade out bolt
        this.tweens.add({
          targets: bolt,
          alpha: 0,
          duration: 400,
          ease: 'Quad.easeIn',
          onComplete: () => bolt.destroy()
        });
        
        // Impact flash at hammer
        const flash = this.add.circle(x, y, 25, 0xCCEEFF)
          .setDepth(DEPTH_SYMBOLS + 5)
          .setAlpha(0.8)
          .setBlendMode(Phaser.BlendModes.ADD);
        
        this.tweens.add({
          targets: flash,
          scale: 2,
          alpha: 0,
          duration: 300,
          ease: 'Quad.easeOut',
          onComplete: () => flash.destroy()
        });
        
        // Initialize storage for persistent effects
        if (!this.timeSymbolPowerEffects) {
          this.timeSymbolPowerEffects = new Map();
        }
        
        const posKey = `${Math.round(x)},${Math.round(y)}`;
        const effectElements = [];
        
        // === PERSISTENT GLOW - Pulsing aura behind symbol ===
        const glow = this.add.circle(x, y, 38, GLOW_COLOR)
          .setAlpha(0.4)
          .setDepth(DEPTH_SYMBOLS - 1)
          .setBlendMode(Phaser.BlendModes.ADD);
        effectElements.push(glow);
        
        // Pulsing animation
        this.tweens.add({
          targets: glow,
          alpha: 0.6,
          scale: 1.1,
          duration: 800,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut'
        });
        
        // === ORBITING SPARKS - Particles circling the symbol ===
        const ORBIT_COUNT = 4;
        for (let i = 0; i < ORBIT_COUNT; i++) {
          const spark = this.add.circle(x, y, 2.5, SPARK_COLOR)
            .setAlpha(0.9)
            .setDepth(DEPTH_SYMBOLS + 5)
            .setBlendMode(Phaser.BlendModes.ADD);
          effectElements.push(spark);
          
          const orbitRadius = 28 + Math.random() * 8;
          const startAngle = (i / ORBIT_COUNT) * Math.PI * 2;
          const orbitSpeed = 2000 + Math.random() * 500;
          
          // Orbit animation using timeline
          this.tweens.add({
            targets: spark,
            angle: 360,
            duration: orbitSpeed,
            repeat: -1,
            ease: 'Linear',
            onUpdate: (tween) => {
              const angle = startAngle + (tween.progress * Math.PI * 2);
              spark.x = x + Math.cos(angle) * orbitRadius;
              spark.y = y + Math.sin(angle) * orbitRadius;
            }
          });
          
          // Twinkle effect
          this.tweens.add({
            targets: spark,
            alpha: 0.4,
            scale: 0.6,
            duration: 300 + Math.random() * 200,
            yoyo: true,
            repeat: -1,
            delay: i * 150
          });
        }
        
        // === FLOATING DUST - Gentle upward particles ===
        const createDust = () => {
          if (!this.timeSymbolPowerEffects?.has(posKey)) return; // Stop if power transferred
          
          const offsetX = (Math.random() - 0.5) * 50;
          const dust = this.add.circle(x + offsetX, y + 20, 1.5, SPARK_COLOR)
            .setAlpha(0.7)
            .setDepth(DEPTH_SYMBOLS + 4)
            .setBlendMode(Phaser.BlendModes.ADD);
          
          this.tweens.add({
            targets: dust,
            y: y - 25,
            alpha: 0,
            duration: 600,
            ease: 'Quad.easeOut',
            onComplete: () => dust.destroy()
          });
        };
        
        // Spawn dust periodically
        const dustTimer = this.time.addEvent({
          delay: 200,
          callback: createDust,
          loop: true
        });
        
        // Store all effects for this position
        this.timeSymbolPowerEffects.set(posKey, {
          elements: effectElements,
          dustTimer: dustTimer,
          x: x,
          y: y
        });
      },

    fadeOutTimeSymbolPowerEffect(x, y) {
        if (!this.timeSymbolPowerEffects) return;
        
        const posKey = `${Math.round(x)},${Math.round(y)}`;
        const effects = this.timeSymbolPowerEffects.get(posKey);
        
        if (!effects) return;
        
        // Stop dust spawning
        if (effects.dustTimer) {
          effects.dustTimer.destroy();
        }
        
        // Fade out all elements with lingering effect
        effects.elements.forEach(element => {
          if (element && !element.destroyed) {
            this.tweens.killTweensOf(element); // Stop looping animations
            this.tweens.add({
              targets: element,
              alpha: 0,
              scale: 0.5,
              duration: 500,
              delay: 100, // Linger briefly before fading
              ease: 'Quad.easeOut',
              onComplete: () => element.destroy()
            });
          }
        });
        
        // Remove from map
        this.timeSymbolPowerEffects.delete(posKey);
      },

    cleanupTimeSymbolPowerEffects() {
        if (!this.timeSymbolPowerEffects) return;
        
        this.timeSymbolPowerEffects.forEach((effects, posKey) => {
          if (effects.dustTimer) {
            effects.dustTimer.destroy();
          }
          effects.elements.forEach(element => {
            if (element && !element.destroyed) {
              this.tweens.killTweensOf(element);
              element.destroy();
            }
          });
        });
        
        this.timeSymbolPowerEffects.clear();
      },

    async playTimeSymbolBeamEffect(timeSymbols) {
        const cellSize = 70;
        const timeSymbolId = clientConfig.symbolsMapping?.time || 16;
        const beamPromises = [];
        
        // Track sprites that need depleting after suspense
        const spritesToDeplete = [];
        
        // ========== LIGHTNING BOLT CONFIG (tweak these!) ==========
        const EFFECT_DELAY_PER_SYMBOL = 150;   // Stagger between symbols
        const LIGHTNING_SEGMENTS = 12;         // How jagged the lightning is
        const LIGHTNING_WIDTH = 2.5;           // Main bolt thickness (thinner!)
        const LIGHTNING_JITTER = 25;           // How much it zigzags
        const LIGHTNING_DURATION = 400;        // How long bolt is visible
        const LIGHTNING_BRANCHES = 3;          // Number of smaller branches
        const depletedSymbolId = clientConfig.symbolsMapping?.time_depleted || 17;
        
        // Lightning colors (more blue!)
        const LIGHTNING_GLOW = 0x2266DD;       // Outer glow - deep blue
        const LIGHTNING_CORE = 0x88CCFF;       // Core - light blue
        const LIGHTNING_FLASH = 0x66AAFF;      // Impact flash - blue
        
        for (let i = 0; i < timeSymbols.length; i++) {
          const { reel, row } = timeSymbols[i];
          const sprite = this.reelSprites[reel]?.[row];
          
          
          // Compare as strings to handle both number and string symbolKeys
          if (!sprite || String(sprite.symbolKey) !== String(timeSymbolId)) continue;
          
          
          const x = reel * cellSize + cellSize / 2 + GRID_OFFSET_X;
          const y = (clientConfig.area.height - 1 - row) * cellSize + cellSize / 2 + GRID_OFFSET_Y;
          
          const delay = i * EFFECT_DELAY_PER_SYMBOL;
          
          // Store sprite for depletion later (after suspense)
          spritesToDeplete.push(sprite);
          
          beamPromises.push(new Promise(resolve => {
            this.time.delayedCall(delay, () => {
              
              // Play hammer lightning sound
              this.playSfx('lightning_hammer', { volume: 0.4 });
              
              // === FADE OUT POWER EFFECTS - Lightning transfers the energy ===
              this.fadeOutTimeSymbolPowerEffect(x, y);
              
              // === IMPACT FLASH - Blue burst at origin ===
              const flash = this.add.circle(x, y, 40, LIGHTNING_FLASH)
                .setAlpha(0.9)
                .setDepth(DEPTH_HERO + 10);
              
              this.tweens.add({
                targets: flash,
                alpha: 0,
                scale: 2,
                duration: 200,
                ease: 'Quad.easeOut',
                onComplete: () => flash.destroy()
              });
              
              // === LIGHTNING BOLT - Jagged path shooting to the heavens ===
              const createLightningPath = (startX, startY, endY, jitter, segments) => {
                const points = [];
                const segmentHeight = (startY - endY) / segments;
                let currentX = startX;
                
                points.push({ x: currentX, y: startY });
                
                for (let s = 1; s < segments; s++) {
                  currentX += (Math.random() - 0.5) * jitter * 2;
                  points.push({ x: currentX, y: startY - s * segmentHeight });
                }
                
                points.push({ x: currentX + (Math.random() - 0.5) * jitter, y: endY });
                return points;
              };
              
              // Main lightning bolt
              const mainBolt = this.add.graphics().setDepth(DEPTH_HERO + 8);
              const mainPath = createLightningPath(x, y - 20, -50, LIGHTNING_JITTER, LIGHTNING_SEGMENTS);
              
              // Draw glow layer (thicker, semi-transparent blue)
              mainBolt.lineStyle(LIGHTNING_WIDTH * 3, LIGHTNING_GLOW, 0.5);
              mainBolt.beginPath();
              mainBolt.moveTo(mainPath[0].x, mainPath[0].y);
              for (let p = 1; p < mainPath.length; p++) {
                mainBolt.lineTo(mainPath[p].x, mainPath[p].y);
              }
              mainBolt.strokePath();
              
              // Draw core (light blue)
              mainBolt.lineStyle(LIGHTNING_WIDTH, LIGHTNING_CORE, 1);
              mainBolt.beginPath();
              mainBolt.moveTo(mainPath[0].x, mainPath[0].y);
              for (let p = 1; p < mainPath.length; p++) {
                mainBolt.lineTo(mainPath[p].x, mainPath[p].y);
              }
              mainBolt.strokePath();
              
              // === LIGHTNING BRANCHES - Smaller bolts branching off ===
              for (let b = 0; b < LIGHTNING_BRANCHES; b++) {
                const branchStart = Math.floor(2 + Math.random() * (mainPath.length - 4));
                const branchPoint = mainPath[branchStart];
                const branchLength = 40 + Math.random() * 60;
                const branchDir = Math.random() > 0.5 ? 1 : -1;
                
                const branchPath = [
                  { x: branchPoint.x, y: branchPoint.y },
                  { x: branchPoint.x + branchDir * (15 + Math.random() * 20), y: branchPoint.y - branchLength * 0.4 },
                  { x: branchPoint.x + branchDir * (25 + Math.random() * 25), y: branchPoint.y - branchLength }
                ];
                
                // Branch glow
                mainBolt.lineStyle(LIGHTNING_WIDTH * 1.5, LIGHTNING_GLOW, 0.4);
                mainBolt.beginPath();
                mainBolt.moveTo(branchPath[0].x, branchPath[0].y);
                for (let p = 1; p < branchPath.length; p++) {
                  mainBolt.lineTo(branchPath[p].x, branchPath[p].y);
                }
                mainBolt.strokePath();
                
                // Branch core
                mainBolt.lineStyle(LIGHTNING_WIDTH * 0.6, LIGHTNING_CORE, 0.8);
                mainBolt.beginPath();
                mainBolt.moveTo(branchPath[0].x, branchPath[0].y);
                for (let p = 1; p < branchPath.length; p++) {
                  mainBolt.lineTo(branchPath[p].x, branchPath[p].y);
                }
                mainBolt.strokePath();
              }
              
              // === SCREEN FLASH - Brief blue overlay ===
              const screenFlash = this.add.rectangle(
                this.cameras.main.centerX, 
                this.cameras.main.centerY, 
                this.cameras.main.width, 
                this.cameras.main.height, 
                LIGHTNING_FLASH
              ).setAlpha(0.12).setDepth(DEPTH_HERO + 20);
              
              this.tweens.add({
                targets: screenFlash,
                alpha: 0,
                duration: 150,
                ease: 'Quad.easeOut',
                onComplete: () => screenFlash.destroy()
              });
              
              // === LIGHTNING FADE OUT ===
              this.tweens.add({
                targets: mainBolt,
                alpha: 0,
                duration: LIGHTNING_DURATION,
                delay: 100,
                ease: 'Quad.easeIn',
                onComplete: () => mainBolt.destroy()
              });
              
              // === Camera shake for impact (subtle) ===
              this.cameras.main.shake(100, 0.004);
              
              // === Track lightning for Thor's blessing ===
              this.lightningCount++;
              
              // Update storm visuals immediately
              this.updateStormVisuals();
              
              // Resolve promise after lightning animation (depletion happens later)
              this.time.delayedCall(LIGHTNING_DURATION + 100, () => {
                resolve();
              });
            });
          }));
        }
        
        await Promise.all(beamPromises);
        
        // Play ambient lightning rumble during suspense (waiting for Thor's answer)
        const randomAmbient = `lightning_amb${Math.floor(Math.random() * 3) + 1}`;
        const ambientBaseVolume = 1.0;
        const ambientSound = this.sound.add(randomAmbient, this.applySoundVolumeConfig(randomAmbient, {
          volume: ambientBaseVolume
        }, {
          kind: "sfx",
          originalVolume: ambientBaseVolume
        }));
        this.trackSoundVolumeInstance(ambientSound, randomAmbient, ambientBaseVolume, "sfx");
        ambientSound.play();
        
        // Fade out ambient sound slowly over 2500ms (starts fading after 1500ms)
        setTimeout(() => {
          if (ambientSound && ambientSound.isPlaying) {
            this.tweens.add({
              targets: ambientSound,
              volume: 0,
              duration: 2500,
              ease: 'Linear',
              onComplete: () => {
                ambientSound.stop();
                ambientSound.destroy();
              }
            });
          }
        }, 1500);
        
        // Always wait for suspense after hammer lightning (waiting for Thor's answer)
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        // Check if any time symbol triggered bonus
        const bonusSymbol = timeSymbols.find(ts => ts.bonus);
        if (bonusSymbol) {
          // In main game: reduce additional wait to keep total timing reasonable (1500ms suspense + 250ms = 1750ms total)
          // In bonus mode: keep full timing for dramatic effect (1500ms suspense + 1000ms = 2500ms total)
          const additionalWait = this.isInBonusMode ? 1000 : 250;
          
          await new Promise(resolve => setTimeout(resolve, additionalWait));
          
          await this.playBonusLightningStrike();
          
          // Deplete hammers immediately after bonus lightning (no delay)
          spritesToDeplete.forEach(sprite => {
            if (sprite && !sprite.destroyed) {
              const gDep = getReelSymbolRenderable(sprite);
              if (gDep) gDep.setTexture(String(depletedSymbolId));
              sprite.symbolKey = depletedSymbolId;
              sprite.isDepleted = true;
            }
          });
        } else {
          // No bonus: wait 250ms then deplete
          await new Promise(resolve => setTimeout(resolve, 250));
          
          spritesToDeplete.forEach(sprite => {
            if (sprite && !sprite.destroyed) {
              const gDep2 = getReelSymbolRenderable(sprite);
              if (gDep2) gDep2.setTexture(String(depletedSymbolId));
              sprite.symbolKey = depletedSymbolId;
              sprite.isDepleted = true;
            }
          });
        }
      },

    async playBonusLightningStrike(freespinsAwarded = 0) {
        // Clear multiplier display during bonus lightning (it covers the impact area)
        if (this.isInBonusMode) {
          this.createOrUpdateHouse(1); // Reset to 1x (clears the multiplier text)
        }
        
        // Stop mini chest sparkle effect when Thor arrives
        this.stopChestSparkleEffect();
        
        // Play Thor's lightning sound
        this.playSfx('lightning_thor', { volume: 0.6 });
        
        const skyWidth = clientConfig.area.width * 70;
        const gridHeight = clientConfig.area.height * 70;
        const centerX = GRID_OFFSET_X + skyWidth / 2;
        const startY = 0;
        const endY = GRID_OFFSET_Y + gridHeight / 2; // Strike to center of grid
        
        // === IMPACT POSITION OFFSET (adjust where chest/lightning lands) ===
        const impactX = centerX //- 70; // 70px left
        const impactY = endY //+ 70;    // 70px down
        const chestScale = 0.8;         // Chest scale (adjust as needed)
        
        // === YELLOW LIGHTNING COLORS ===
        const GOLD_GLOW = 0xFFAA00;
        const GOLD_CORE = 0xFFDD44;
        const GOLD_FLASH = 0xFFFF88;
        
        // === CREATE JAGGED PATH ===
        const points = [];
        const segments = 8;
        const segmentHeight = (endY - startY) / segments;
        let currentX = centerX;
        
        points.push({ x: currentX, y: startY });
        for (let s = 1; s < segments; s++) {
          currentX += (Math.random() - 0.5) * 40;
          points.push({ x: currentX, y: startY + s * segmentHeight });
        }
        points.push({ x: impactX, y: impactY }); // End at impact position
        
        // === BIG FLASH (above everything - covers entire screen!) ===
        const screenCenterX = this.cameras.main.centerX;
        const screenCenterY = this.cameras.main.centerY;
        const screenWidth = this.cameras.main.width;
        const screenHeight = this.cameras.main.height;
        
        const flash = this.add.rectangle(screenCenterX, screenCenterY, screenWidth, screenHeight, GOLD_FLASH)
          .setDepth(1000)
          .setAlpha(0.8)
          .setBlendMode(Phaser.BlendModes.ADD);
        
        this.tweens.add({
          targets: flash,
          alpha: 0,
          duration: 300,
          ease: 'Quad.easeIn',
          onComplete: () => flash.destroy()
        });
        
        // === DRAW LIGHTNING BOLT (above everything!) ===
        const bolt = this.add.graphics().setDepth(1001);
        
        // Outer glow
        bolt.lineStyle(12, GOLD_GLOW, 0.6);
        bolt.beginPath();
        bolt.moveTo(points[0].x, points[0].y);
        points.forEach(p => bolt.lineTo(p.x, p.y));
        bolt.strokePath();
        
        // Core
        bolt.lineStyle(4, GOLD_CORE, 1);
        bolt.beginPath();
        bolt.moveTo(points[0].x, points[0].y);
        points.forEach(p => bolt.lineTo(p.x, p.y));
        bolt.strokePath();
        
        // Inner bright
        bolt.lineStyle(2, 0xFFFFFF, 1);
        bolt.beginPath();
        bolt.moveTo(points[0].x, points[0].y);
        points.forEach(p => bolt.lineTo(p.x, p.y));
        bolt.strokePath();
        
        // Camera shake
        this.cameras.main.shake(300, 0.015);
        
        // Play impact sound with slight delay
        this.time.delayedCall(100, () => {
          this.playSfx('lightning_thor_impact', { volume: 0.5 });
        });
        
        // === IMPACT EFFECTS ===
        
        // 1. Bright impact flash at strike point
        const impactFlash = this.add.circle(impactX, impactY, 40, 0xFFFF88)
          .setDepth(1002)
          .setAlpha(1)
          .setBlendMode(Phaser.BlendModes.ADD);
        
        this.tweens.add({
          targets: impactFlash,
          scale: 2,
          alpha: 0,
          duration: 200,
          ease: 'Quad.easeOut',
          onComplete: () => impactFlash.destroy()
        });
        
        // 2. Shockwave ring expanding outward
        const shockwave = this.add.circle(impactX, impactY, 20, 0xFFAA00)
          .setDepth(1002)
          .setAlpha(0.8)
          .setStrokeStyle(4, 0xFFDD44)
          .setFillStyle(0x000000, 0); // Hollow ring
        
        this.tweens.add({
          targets: shockwave,
          scale: 6,
          alpha: 0,
          duration: 400,
          ease: 'Quad.easeOut',
          onComplete: () => shockwave.destroy()
        });
        
        // 3. Spark burst - particles flying outward
        const sparkCount = 16;
        for (let i = 0; i < sparkCount; i++) {
          const angle = (i / sparkCount) * Math.PI * 2 + Math.random() * 0.3;
          const speed = 80 + Math.random() * 60;
          const size = 2 + Math.random() * 3;
          
          const spark = this.add.circle(impactX, impactY, size, 0xFFDD44)
            .setDepth(1002)
            .setAlpha(1)
            .setBlendMode(Phaser.BlendModes.ADD);
          
          this.tweens.add({
            targets: spark,
            x: impactX + Math.cos(angle) * speed,
            y: impactY + Math.sin(angle) * speed,
            alpha: 0,
            scale: 0.3,
            duration: 300 + Math.random() * 200,
            ease: 'Quad.easeOut',
            onComplete: () => spark.destroy()
          });
        }
        
        // 4. Electric arcs crackling at impact
        for (let i = 0; i < 4; i++) {
          this.time.delayedCall(i * 50, () => {
            const arcLength = 30 + Math.random() * 20;
            const arcAngle = Math.random() * Math.PI * 2;
            
            const arc = this.add.graphics().setDepth(1002);
            arc.lineStyle(2, 0xFFFFAA, 0.8);
            arc.beginPath();
            arc.moveTo(impactX, impactY);
            
            // Jagged arc
            let ax = impactX, ay = impactY;
            for (let j = 0; j < 3; j++) {
              ax += Math.cos(arcAngle + (Math.random() - 0.5)) * (arcLength / 3);
              ay += Math.sin(arcAngle + (Math.random() - 0.5)) * (arcLength / 3);
              arc.lineTo(ax, ay);
            }
            arc.strokePath();
            
            this.tweens.add({
              targets: arc,
              alpha: 0,
              duration: 150,
              ease: 'Quad.easeIn',
              onComplete: () => arc.destroy()
            });
          });
        }
        
        // Fade out bolt
        this.tweens.add({
          targets: bolt,
          alpha: 0,
          duration: 500,
          delay: 200,
          ease: 'Quad.easeIn',
          onComplete: () => bolt.destroy()
        });
        
        // === GOLDEN CHEST APPEARS ===
        // Create chest at impact point (behind multiplier which is depth 99-101)
        this.bonusChest = this.add.image(impactX, impactY, 'bonus_chest')
          .setDepth(98)
          .setScale(0)
          .setAlpha(0)
          .setOrigin(0.5);
        
        // Dramatic reveal animation
        this.tweens.add({
          targets: this.bonusChest,
          scale: chestScale,
          alpha: 1,
          duration: 400,
          ease: 'Back.easeOut',
          delay: 150 // Slight delay after impact
        });
        
        // Add gentle floating animation
        this.tweens.add({
          targets: this.bonusChest,
          y: impactY - 5,
          duration: 1500,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
          delay: 600
        });
        
        // Start chest sparkle effects
        this.startBonusChestSparkles(impactX, impactY);
        
        // === SHOW TEXT: BONUS or +X FREESPINS ===
        if (this.isInBonusMode && freespinsAwarded > 0) {
          // Already in bonus mode - show +X FREESPINS text
          const freespinText = this.add.text(impactX, impactY - 120, `+${freespinsAwarded} FREESPINS`, {
            fontSize: '48px',
            fontFamily: '"Cinzel", "Times New Roman", serif',
            fontStyle: 'bold',
            color: '#FFD700',
            stroke: '#8B4513',
            strokeThickness: 8,
            shadow: {
              offsetX: 0,
              offsetY: 0,
              color: '#FFD700',
              blur: 20,
              fill: true
            }
          })
            .setOrigin(0.5)
            .setDepth(1003)
            .setAlpha(0)
            .setScale(0.5);
          
          // Dramatic reveal
          this.tweens.add({
            targets: freespinText,
            alpha: 1,
            scale: 1,
            duration: 400,
            ease: 'Back.easeOut'
          });
          
          // Float upward and fade out after showing
          this.time.delayedCall(1500, () => {
            this.tweens.add({
              targets: freespinText,
              y: freespinText.y - 60,
              alpha: 0,
              duration: 800,
              ease: 'Quad.easeIn',
              onComplete: () => freespinText.destroy()
            });
          });
          
        } else if (!this.isInBonusMode) {
          // Main game - show BONUS text permanently
          if (this.bonusSilhouette && !this.bonusSilhouette.destroyed) {
            // Move to front and make fully visible when bonus is won
            this.bonusSilhouette.setDepth(6); // In front of forest now
            this.bonusSilhouette.setAlpha(1); // Fully visible
            this.bonusSilhouette.setTint(0xFFDD66); // Golden tint
            this.bonusPermanentlyVisible = true;
            const collectTarget = this.getCenterCollectTarget();
            this.startBonusWonCenterEnergy(collectTarget.x, collectTarget.y, {
              depth: DEPTH_HERO + 26,
              scale: 1.08,
              tint: 0x55FF88
            });
            
            // Flag to make storm lightning golden
            this.stormLightningGolden = true;
            
            // Set lightning to max intensity - "The gods have awakened!"
            this.lightningCount = 10;
            this.updateStormVisuals();
            
            // Start golden particles across the whole sky/mountain line
            this.startBonusSkyParticles();
            
            // Start sparkles in front of the bonus text
            const bonusX = this.bonusSilhouette.x;
            const bonusY = this.bonusSilhouette.y;
            this.startBonusTextSparkles(bonusX, bonusY);
          }
        }
        
        // Wait for effect to complete
        await new Promise(resolve => setTimeout(resolve, 600));
      },

    startBonusTextSparkles(centerX, centerY) {
        if (this.bonusTextSparkleTimer) {
          this.bonusTextSparkleTimer.destroy();
        }
        
        this.bonusTextSparkleTimer = this.time.addEvent({
          delay: 100,
          callback: () => {
            if (!this.bonusPermanentlyVisible) {
              this.bonusTextSparkleTimer.destroy();
              return;
            }
            
            // Random position around bonus text
            const x = centerX + (Math.random() - 0.5) * 120;
            const y = centerY + (Math.random() - 0.5) * 40;
            
            const colors = [0xFFDD44, 0xFFAA00, 0xFFFFAA, 0xFFFFFF];
            const sparkle = this.add.circle(x, y, 1.5 + Math.random() * 2.5, colors[Math.floor(Math.random() * colors.length)])
              .setDepth(7) // In front of bonus text (depth 6)
              .setAlpha(0.9)
              .setBlendMode(Phaser.BlendModes.ADD);
            
            // Twinkle and fade
            this.tweens.add({
              targets: sparkle,
              alpha: 0,
              scale: 0.1,
              y: y - 10 - Math.random() * 15,
              duration: 400 + Math.random() * 300,
              ease: 'Quad.easeOut',
              onComplete: () => sparkle.destroy()
            });
          },
          loop: true
        });
      },

    startBonusChestSparkles(centerX, centerY) {
        if (this.bonusChestSparkleTimer) {
          this.bonusChestSparkleTimer.destroy();
        }
        
        this.bonusChestSparkleTimer = this.time.addEvent({
          delay: 80, // Slightly faster spawn
          callback: () => {
            if (!this.bonusChest || this.bonusChest.destroyed) {
              if (this.bonusChestSparkleTimer) {
                this.bonusChestSparkleTimer.destroy();
              }
              return;
            }
            
            // Get chest's current position (in case it's floating)
            const chestX = this.bonusChest.x;
            const chestY = this.bonusChest.y;
            
            // Random position around chest (smaller area than bonus text)
            const angle = Math.random() * Math.PI * 2;
            const distance = 20 + Math.random() * 25;
            const x = chestX + Math.cos(angle) * distance;
            const y = chestY + Math.sin(angle) * distance;
            
            const colors = [0xFFDD44, 0xFFAA00, 0xFFFFAA, 0xFFFFFF];
            const sparkle = this.add.circle(x, y, 1 + Math.random() * 1.5, colors[Math.floor(Math.random() * colors.length)])
              .setDepth(98) // Same as chest, behind multiplier (99-101)
              .setAlpha(0.9)
              .setBlendMode(Phaser.BlendModes.ADD);
            
            // Twinkle and float upward
            this.tweens.add({
              targets: sparkle,
              alpha: 0,
              scale: 0.1,
              y: y - 15 - Math.random() * 20,
              x: x + (Math.random() - 0.5) * 10,
              duration: 350 + Math.random() * 250,
              ease: 'Quad.easeOut',
              onComplete: () => sparkle.destroy()
            });
          },
          loop: true
        });
      },

    startBonusSkyParticles() {
        // Clean up any existing particles
        if (this.bonusParticleTimer) {
          this.bonusParticleTimer.destroy();
        }
        
        const skyWidth = clientConfig.area.width * 70;
        const skyStartX = GRID_OFFSET_X;
        const skyY = GRID_OFFSET_Y - 40; // Higher up to clear mountain peaks
        
        // Spawn particles across the whole sky width
        this.bonusParticleTimer = this.time.addEvent({
          delay: 50, // Fast spawn for full coverage
          callback: () => {
            if (!this.bonusPermanentlyVisible) {
              this.bonusParticleTimer.destroy();
              return;
            }
            
            // Random position across the full sky width
            const x = skyStartX + Math.random() * skyWidth;
            const y = skyY + Math.random() * 50; // Spread vertically in sky area
            
            const colors = [0xFFDD44, 0xFFAA00, 0xFFCC22, 0xFFFFAA, 0xFFFF66];
            const particle = this.add.circle(x, y, 1 + Math.random() * 2, colors[Math.floor(Math.random() * colors.length)])
              .setDepth(4.5) // Behind forest (depth 5), above mist
              .setAlpha(0.7 + Math.random() * 0.3)
              .setBlendMode(Phaser.BlendModes.ADD);
            
            // Float upward further and fade
            this.tweens.add({
              targets: particle,
              y: y - 30 - Math.random() * 40, // Travel further up
              alpha: 0,
              scale: 0.2,
              duration: 600 + Math.random() * 600,
              ease: 'Quad.easeOut',
              onComplete: () => particle.destroy()
            });
          },
          loop: true
        });
      },

    async playBonusTransition(bonusWon, heroWeapon = "staff") {
        const screenWidth = this.cameras.main.width;
        const screenHeight = this.cameras.main.height;
        const centerX = screenWidth / 2;
        const centerY = screenHeight / 2;
        
        // Calculate diamond positions based on upgrades per ability
        const abilities = bonusWon?.enterBonusWith || {};
        const upgrades = abilities.upgrades || { step: 0, weapon: 0, necromancer: 0 };
        
        // Fixed diamond area angles on the wheel (in radians)
        // Area 1 = 225°, Area 2 = 0°, Area 3 = 90°
        const areaAngles = {
          1: 5 * Math.PI / 4,      // 225°
          2: 0,                     // 0°
          3: Math.PI / 2            // 90°
        };
        
        // Determine which abilities are at MAX level BEFORE this upgrade
        // Max levels: weapon "axe" (2), step "mysteryWild" (2), necromancer 2
        const stepMap = { "destroy": 0, "mystery": 1, "mysteryWild": 2 };
        const weaponMap = { "staff": 0, "sword": 1, "axe": 2 };
        
        const currentStepLevel = stepMap[abilities.step?.from || "destroy"] || 0;
        const currentWeaponLevel = weaponMap[abilities.weapon?.from || "staff"] || 0;
        const currentNecromancerLevel = abilities.necromancer?.from || 0;
        
        const isStepMaxed = currentStepLevel >= 2;
        const isWeaponMaxed = currentWeaponLevel >= 2;
        const isNecromancerMaxed = currentNecromancerLevel >= 2;
        
        // Determine which abilities can still be upgraded
        const abilitiesNotMaxed = [];
        if (!isStepMaxed) abilitiesNotMaxed.push('step');
        if (!isWeaponMaxed) abilitiesNotMaxed.push('weapon');
        if (!isNecromancerMaxed) abilitiesNotMaxed.push('necromancer');
        
        // Select wheel image based on which abilities are NOT maxed
        let wheelImage;
        let abilityToArea = { step: 1, weapon: 2, necromancer: 3 }; // default
        
        if (abilitiesNotMaxed.length === 3) {
          // All 3 abilities can be upgraded - use 3-segment wheels
          const wheelPictures = ['wheel_N1_S2_W3', 'wheel_S1_W2_N3', 'wheel_W1_N2_S3'];
          wheelImage = wheelPictures[Math.floor(Math.random() * wheelPictures.length)];
          
          if (wheelImage.includes('N1_S2_W3')) {
            abilityToArea = { necromancer: 1, step: 2, weapon: 3 };
          } else if (wheelImage.includes('S1_W2_N3')) {
            abilityToArea = { step: 1, weapon: 2, necromancer: 3 };
          } else if (wheelImage.includes('W1_N2_S3')) {
            abilityToArea = { weapon: 1, necromancer: 2, step: 3 };
          }
          
        } else if (abilitiesNotMaxed.length === 2) {
          // 2 abilities can be upgraded - use 2-segment wheels
          // W1_S2 = weapon and step (necromancer maxed)
          // S1_N2 = step and necromancer (weapon maxed)
          // N1_W2 = necromancer and weapon (step maxed)
          
          if (isNecromancerMaxed) {
            wheelImage = 'wheel_W1_S2';
            abilityToArea = { weapon: 1, step: 2 };
          } else if (isWeaponMaxed) {
            wheelImage = 'wheel_S1_N2';
            abilityToArea = { step: 1, necromancer: 2 };
          } else if (isStepMaxed) {
            wheelImage = 'wheel_N1_W2';
            abilityToArea = { necromancer: 1, weapon: 2 };
          }
          
        } else if (abilitiesNotMaxed.length === 1) {
          // Only 1 ability can be upgraded - use 1-segment wheels
          // W1_W2_W3 = only weapon (step and necromancer maxed)
          // S1_S2_S3 = only step (weapon and necromancer maxed)
          // N1_N2_N3 = only necromancer (weapon and step maxed)
          
          if (abilitiesNotMaxed[0] === 'weapon') {
            wheelImage = 'wheel_W1_W2_W3';
            abilityToArea = { weapon: 1 };
          } else if (abilitiesNotMaxed[0] === 'step') {
            wheelImage = 'wheel_S1_S2_S3';
            abilityToArea = { step: 1 };
          } else if (abilitiesNotMaxed[0] === 'necromancer') {
            wheelImage = 'wheel_N1_N2_N3';
            abilityToArea = { necromancer: 1 };
          }
        } else {
          // All abilities maxed (shouldn't happen, but fallback to default)
          wheelImage = 'wheel_W1_N2_S3';
          abilityToArea = { weapon: 1, necromancer: 2, step: 3 };
        }
        
        this.selectedWheelImage = wheelImage;
        
        // Now get the angle for each ability based on which area it's at
        const abilityAngles = {
          step: abilityToArea.step !== undefined ? areaAngles[abilityToArea.step] : null,
          weapon: abilityToArea.weapon !== undefined ? areaAngles[abilityToArea.weapon] : null,
          necromancer: abilityToArea.necromancer !== undefined ? areaAngles[abilityToArea.necromancer] : null
        };
        
        // Offset between sub-positions (in radians, ~8°)
        const subPositionOffset = Math.PI / 22;
        
        // Build array of all diamond target angles
        const diamondPositions = [];
        
        // Special handling for 1-segment wheels (only one ability can be upgraded)
        if (abilitiesNotMaxed.length === 1) {
          const ability = abilitiesNotMaxed[0];
          const count = upgrades[ability] || 0;
          
          // Place diamonds across all 3 areas based on upgrade count
          if (count === 1) {
            // Place 1 diamond at area 1
            diamondPositions.push({ angle: areaAngles[1], ability, subIndex: 0, area: 1 });
          } else if (count === 2) {
            // Place 2 diamonds at areas 1 and 2
            diamondPositions.push({ angle: areaAngles[1], ability, subIndex: 0, area: 1 });
            diamondPositions.push({ angle: areaAngles[2], ability, subIndex: 0, area: 2 });
          } else if (count >= 3) {
            // Place 3 diamonds at areas 1, 2, and 3
            diamondPositions.push({ angle: areaAngles[1], ability, subIndex: 0, area: 1 });
            diamondPositions.push({ angle: areaAngles[2], ability, subIndex: 0, area: 2 });
            diamondPositions.push({ angle: areaAngles[3], ability, subIndex: 0, area: 3 });
          }
        } else {
          // Normal handling for 2-segment and 3-segment wheels
          ['step', 'weapon', 'necromancer'].forEach(ability => {
            const count = upgrades[ability] || 0;
            const baseAngle = abilityAngles[ability];
            const area = abilityToArea[ability];
            
            // Only place diamonds if this ability:
            // 1. Has an angle (not maxed, exists on the wheel)
            // 2. Actually received upgrades
            if (baseAngle !== null && baseAngle !== undefined && count > 0) {
              if (count === 1) {
                diamondPositions.push({ angle: baseAngle, ability, subIndex: 0, area });
              } else if (count === 2) {
                diamondPositions.push({ angle: baseAngle - subPositionOffset, ability, subIndex: -1, area });
                diamondPositions.push({ angle: baseAngle + subPositionOffset, ability, subIndex: 1, area });
              } else if (count >= 3) {
                diamondPositions.push({ angle: baseAngle - subPositionOffset, ability, subIndex: -1, area });
                diamondPositions.push({ angle: baseAngle, ability, subIndex: 0, area });
                diamondPositions.push({ angle: baseAngle + subPositionOffset, ability, subIndex: 1, area });
              }
            }
          });
        }
        
        
        // Total diamonds
        const daggerCount = Math.max(1, diamondPositions.length);
        
        
        // === 1. FADE TO BLACK ===
        const blackOverlay = this.add.rectangle(centerX, centerY, screenWidth, screenHeight, 0x000000)
          .setDepth(2000)
          .setAlpha(0);
        
        await new Promise(resolve => {
          this.tweens.add({
            targets: blackOverlay,
            alpha: 1,
            duration: 800,
            ease: 'Quad.easeInOut',
            onComplete: resolve
          });
        });
        
        // Screen is now fully black - safe to clear symbols and place hero (if weapon provided)
        // For bonustransition, we clear symbols; for chestreward, symbols already cleared
        if (heroWeapon && heroWeapon !== "none") {
          this.placeHeroAtStart(heroWeapon);
        }
        
        // === 2. SHOW HERO OPENING CHEST ===
        // Start bonus theme music when chest scene appears
        this.startBonusTheme();
        
        const transitionImage = this.add.image(centerX, centerY, 'bonus_transition')
          .setDepth(2001)
          .setAlpha(0)
          .setOrigin(0.5);
        
        // Scale to fill entire screen and slightly bigger
        const maxWidth = screenWidth * 1.1; // 110% to ensure full coverage
        const maxHeight = screenHeight * 1.1;
        const scaleX = maxWidth / transitionImage.width;
        const scaleY = maxHeight / transitionImage.height;
        const imageScale = Math.max(scaleX, scaleY); // Use Math.max to ensure it covers everything
        transitionImage.setScale(imageScale);
        
        // Fade in the transition image
        await new Promise(resolve => {
          this.tweens.add({
            targets: transitionImage,
            alpha: 1,
            duration: 500,
            ease: 'Quad.easeOut',
            onComplete: resolve
          });
        });
        
        // Wait a moment before daggers
        await new Promise(resolve => setTimeout(resolve, 800));
        
        // === 3. LAUNCH SWIRLING DIAMONDS ===
        const chestX = centerX;
        const chestY = centerY + (transitionImage.displayHeight * 0.15);
        const wheelRadius = 250; // Final circle radius where diamonds settle (moved inward)
        const wheelCenterY = centerY - 50; // Wheel center above chest
        
        // Get target angles from calculated positions
        const targetAngles = diamondPositions.map(p => p.angle);
        
        // Fallback if no positions (shouldn't happen)
        if (targetAngles.length === 0) {
          targetAngles.push(5 * Math.PI / 4); // Default to step position
        }
        
        const daggers = [];
        const daggerTrailTimers = [];
        const daggerOrbitTimers = [];
        const daggerSettled = []; // Track which diamonds have snapped into place
        
        // Launch each diamond with delay, all spin while waiting for others
        for (let i = 0; i < daggerCount; i++) {
          // Create magical sparkle buildup from chest (anticipation)
          const sparkles = [];
          const buildupDuration = 1000;
          const buildupStartTime = Date.now();
          
          const sparkleInterval = setInterval(() => {
            const elapsed = Date.now() - buildupStartTime;
            const progress = Math.min(elapsed / buildupDuration, 1); // 0 to 1
            
            // Intensity increases over time
            const sizeMultiplier = 0.5 + progress * 1.5; // 0.5x to 2x
            const spawnRate = 1 + progress * 2; // More sparkles as intensity builds
            
            // Spawn multiple sparkles based on intensity
            for (let s = 0; s < Math.ceil(spawnRate); s++) {
              if (Math.random() > 1 / spawnRate) continue; // Probability control
              
              // Create sparkle at chest position with random offset (bigger area)
              const offsetX = (Math.random() - 0.5) * 80;
              const offsetY = (Math.random() - 0.5) * 80;
              const sparkle = this.add.circle(
                chestX + offsetX,
                chestY + offsetY,
                (Math.random() * 2 + 0.5) * sizeMultiplier, // Size grows with intensity
                Math.random() > 0.5 ? 0xFFD700 : 0xFFAA00 // Gold variations
              )
                .setDepth(2002)
                .setAlpha(0)
                .setBlendMode(Phaser.BlendModes.ADD);
              
              sparkles.push(sparkle);
              
              // Sparkle rises and fades
              this.tweens.add({
                targets: sparkle,
                y: sparkle.y - 30 - Math.random() * 20,
                alpha: 0.6 + progress * 0.3, // Brighter as intensity builds
                duration: 400,
                ease: 'Quad.easeOut',
                onComplete: () => {
                  this.tweens.add({
                    targets: sparkle,
                    alpha: 0,
                    duration: 200,
                    onComplete: () => sparkle.destroy()
                  });
                }
              });
            }
            
            // Subtle screen shake with increasing intensity
            const shakeIntensity = 0.0005 + progress * 0.002; // 0.0005 to 0.0025
            this.cameras.main.shake(50, shakeIntensity);
          }, 80); // Spawn sparkle every 80ms
          
          // Delay between diamonds for "near win" tension
          await new Promise(resolve => setTimeout(resolve, buildupDuration));
          
          // Stop spawning sparkles and create burst
          clearInterval(sparkleInterval);
          
          // Quick burst when diamond pops
          for (let b = 0; b < 12; b++) {
            const angle = (b / 12) * Math.PI * 2;
            const distance = 30 + Math.random() * 20;
            const burstSparkle = this.add.circle(
              chestX,
              chestY,
              Math.random() * 4 + 2,
              0xFFD700
            )
              .setDepth(2002)
              .setAlpha(0.9)
              .setBlendMode(Phaser.BlendModes.ADD);
            
            this.tweens.add({
              targets: burstSparkle,
              x: chestX + Math.cos(angle) * distance,
              y: chestY + Math.sin(angle) * distance,
              alpha: 0,
              duration: 300,
              ease: 'Power2.easeOut',
              onComplete: () => burstSparkle.destroy()
            });
          }
          
          // Create diamond at chest position
          const dagger = this.createNordicDagger(chestX, chestY);
          daggers.push(dagger);
          daggerSettled.push(false);
          
          // Play diamond appear sound
          this.playSfx('wheel_diamond_appear', { volume: 0.4 });
          
          // Launch burst effect
          this.createDaggerLaunchBurst(chestX, chestY);
          
          // After arrow pops, ALWAYS build magical sparkles for suspense (will another arrow come?)
          const isLastArrow = (i === daggerCount - 1);
          const suspenseDuration = isLastArrow ? 1000 : 700;
          const suspenseStartTime = Date.now();
          
          const postSparkleInterval = setInterval(() => {
            const elapsed = Date.now() - suspenseStartTime;
            const progress = Math.min(elapsed / suspenseDuration, 1); // 0 to 1
            
            // Intensity increases over time
            const sizeMultiplier = 0.5 + progress * 1.5; // 0.5x to 2x
            const spawnRate = 1 + progress * 2; // More sparkles as intensity builds
            
            // Spawn multiple sparkles based on intensity
            for (let s = 0; s < Math.ceil(spawnRate); s++) {
              if (Math.random() > 1 / spawnRate) continue; // Probability control
              
              // Create suspense sparkles at chest position (bigger area)
              const offsetX = (Math.random() - 0.5) * 80;
              const offsetY = (Math.random() - 0.5) * 80;
              const sparkle = this.add.circle(
                chestX + offsetX,
                chestY + offsetY,
                (Math.random() * 2 + 0.5) * sizeMultiplier, // Size grows with intensity
                Math.random() > 0.5 ? 0xFFD700 : 0xFFAA00
              )
                .setDepth(2002)
                .setAlpha(0)
                .setBlendMode(Phaser.BlendModes.ADD);
              
              // Sparkle rises and fades
              this.tweens.add({
                targets: sparkle,
                y: sparkle.y - 30 - Math.random() * 20,
                alpha: 0.6 + progress * 0.3, // Brighter as intensity builds
                duration: 400,
                ease: 'Quad.easeOut',
                onComplete: () => {
                  this.tweens.add({
                    targets: sparkle,
                    alpha: 0,
                    duration: 200,
                    onComplete: () => sparkle.destroy()
                  });
                }
              });
            }
            
            // Subtle screen shake with increasing intensity
            const shakeIntensity = 0.0005 + progress * 0.002; // 0.0005 to 0.0025
            this.cameras.main.shake(50, shakeIntensity);
          }, 80);
          
          // After suspense period, stop sparkles
          setTimeout(() => {
            clearInterval(postSparkleInterval);
            
            // If this was the last arrow, let sparkles fade naturally
            // If more coming, they'll be interrupted by next arrow's burst
          }, suspenseDuration);
          
          // Start glitter trail
          const trailTimer = this.startDaggerGlitterTrail(dagger);
          daggerTrailTimers.push(trailTimer);
          
          // Spiral out from chest then orbit continuously
          const startTime = Date.now();
          const spiralDuration = 600; // Time to reach orbit radius (faster)
          const orbitSpeed = 0.008; // Radians per millisecond (faster spin!)
          let currentAngle = -Math.PI / 2; // Start pointing up
          
          const orbitTimer = this.time.addEvent({
            delay: 16, // ~60fps
            callback: () => {
              if (!dagger || dagger.destroyed || daggerSettled[i]) return;
              
              const elapsed = Date.now() - startTime;
              
              // Spiral out phase
              const spiralProgress = Math.min(elapsed / spiralDuration, 1);
              const easedRadius = Phaser.Math.Easing.Cubic.Out(spiralProgress) * wheelRadius;
              
              // Continuous orbit rotation (fast!)
              currentAngle += orbitSpeed * 16;
              
              // Normalize angle to 0-2PI range
              const normalizedAngle = ((currentAngle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
              
              // Update position
              dagger.x = centerX + Math.cos(currentAngle) * easedRadius;
              dagger.y = wheelCenterY + Math.sin(currentAngle) * easedRadius;
              
              // Rotate diamond so top point faces inward
              dagger.rotation = currentAngle - Math.PI / 2;
              
              // Store current angle
              dagger.currentOrbitAngle = normalizedAngle;
            },
            loop: true
          });
          
          daggerOrbitTimers.push(orbitTimer);
        }
        
        // Wait a moment for all to be orbiting, then start snapping
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // === 4. DIAMONDS SNAP INTO PLACE when passing their target ===
        await new Promise(resolve => {
          const snapChecker = this.time.addEvent({
            delay: 16,
            callback: () => {
              let allSettled = true;
              
              daggers.forEach((dagger, i) => {
                if (daggerSettled[i]) return; // Already settled
                allSettled = false;
                
                const targetAngle = targetAngles[i];
                const currentAngle = dagger.currentOrbitAngle || 0;
                
                // Check if passing through target angle (within threshold)
                const threshold = 0.15; // Radians (~8 degrees)
                const angleDiff = Math.abs(currentAngle - targetAngle);
                const normalizedDiff = Math.min(angleDiff, Math.PI * 2 - angleDiff);
                
                if (normalizedDiff < threshold) {
                  // SNAP! Stop orbiting and lock into position
                  daggerSettled[i] = true;
                  
                  // Play confirmation sound when diamond attaches to circle
                  this.playSfx('wheel_diamond_confirms', { volume: 0.4 });
                  
                  // Stop this diamond's orbit timer
                  if (daggerOrbitTimers[i]) {
                    daggerOrbitTimers[i].destroy();
                  }
                  
                  // Stop glitter trail
                  if (daggerTrailTimers[i]) {
                    daggerTrailTimers[i].destroy();
                  }
                  
                  // Snap to exact position
                  const finalX = centerX + Math.cos(targetAngle) * wheelRadius;
                  const finalY = wheelCenterY + Math.sin(targetAngle) * wheelRadius;
                  
                  dagger.x = finalX;
                  dagger.y = finalY;
                  dagger.rotation = targetAngle - Math.PI / 2;
                  
                  // Flash effect on snap
                  this.createDaggerLaunchBurst(finalX, finalY);
                  
                  // Store position for golden burst (after wheel stops)
                  dagger.finalX = finalX;
                  dagger.finalY = finalY;
                }
              });
              
              if (allSettled) {
                snapChecker.destroy();
                resolve();
              }
            },
            loop: true
          });
        });
        
        // Small pause for dramatic effect
        await new Promise(resolve => setTimeout(resolve, 400));
        
        // === 5. FADE IN SPINNING WHEEL WITH THOR EFFECTS ===
        // Calculate wheel rotation offset based on which abilities were upgraded
        // Wheel picture is now selected randomly earlier (when building diamond positions)
        // Diamonds are placed to match where each ability is on that wheel picture
        
        // === TRANSITION TO SKY/VALHALLA BACKGROUND ===
        // Create sky background ABOVE the chest scene (2001) but BELOW the wheel (2002)
        const skyBackground = this.add.image(centerX, centerY, 'bonus_transition_wheel_spinning')
          .setDepth(2001.5) // Above chest scene, below wheel
          .setAlpha(0)
          .setOrigin(0.5);
        
        // Scale to fill screen
        const skyScaleX = screenWidth / skyBackground.width;
        const skyScaleY = screenHeight / skyBackground.height;
        const skyScale = Math.max(skyScaleX, skyScaleY);
        skyBackground.setScale(skyScale);
        
        // Fade in sky on top of chest scene - covers the man opening chest
        this.tweens.add({
          targets: skyBackground,
          alpha: 1,
          duration: 800,
          ease: 'Quad.easeInOut'
        });
        
        // Store for cleanup later
        this.bonusTransitionSky = skyBackground;
        
        // Start with spinning texture but use same rendering approach as non-spinning
        const spinningWheelImage = wheelImage + '_spinning';
        
        // Force pixel-perfect positioning (same as non-spinning image)
        const wheelX = Math.round(centerX);
        const wheelY = Math.round(wheelCenterY);
        
        const featureWheel = this.add.image(wheelX, wheelY, spinningWheelImage)
          .setDepth(2002) // Above the sky background
          .setAlpha(0)
          .setOrigin(0.5, 0.5); // Same as non-spinning
        
        // Scale wheel to fit the dagger circle (same calculation as non-spinning)
        const wheelScale = (wheelRadius * 2.0) / Math.max(featureWheel.width, featureWheel.height);
        
        // Use exact same scale approach as non-spinning image
        const roundedScale = Math.round(wheelScale * 1000) / 1000;
        featureWheel.setScale(roundedScale);
        
        // Force position update (same as non-spinning)
        featureWheel.x = wheelX;
        featureWheel.y = wheelY;
        
        // Calculate visual radius for effects
        const wheelVisualRadius = (wheelRadius * 2.0 * 0.95) / 2;
        
        // Sun glow removed - keeping dummy references for compatibility
        const electricGlow = { alpha: 0, destroyed: true };
        const innerGlow = { alpha: 0, destroyed: true };
        
        // Subtle inner border glow - DISABLED to remove circular border
        const innerBorderGlow = this.add.graphics()
          .setDepth(2002.2)
          .setAlpha(0)
          .setBlendMode(Phaser.BlendModes.ADD);
        // Ring drawing disabled - stays invisible
        
        // Glitter effect around wheel border (spawning particles like bonus chest sparkles)
        const glitterOrbitRadius = wheelVisualRadius + 15;
        
        // Bring daggers to front of wheel
        daggers.forEach(d => d.setDepth(2004));
        
        // Hide multiplier text and effects so user doesn't see old multiplier when fading back to game
        if (this.multiplierText && !this.multiplierText.destroyed) {
          this.multiplierText.setVisible(false);
        }
        if (this.multiplierHighlight && !this.multiplierHighlight.destroyed) {
          this.multiplierHighlight.setVisible(false);
        }
        if (this.multiplierGlowOuter && !this.multiplierGlowOuter.destroyed) {
          this.multiplierGlowOuter.setVisible(false);
        }
        if (this.multiplierGlowInner && !this.multiplierGlowInner.destroyed) {
          this.multiplierGlowInner.setVisible(false);
        }
        
        // Hide house sprite (multiplier container with orbs/rings)
        if (this.houseSprite && !this.houseSprite.destroyed) {
          this.houseSprite.setVisible(false);
        }
        
        // Start rotation immediately during fade-in (same speed as full spin: 8 rotations in 3 seconds)
        // This creates a smooth continuous spin with no speed change
        this.wheelRotationTween = this.tweens.add({
          targets: featureWheel,
          rotation: Math.PI * 16, // 8 full rotations
          duration: 3000,
          ease: 'Linear',
          repeat: -1
        });
        
        // FADE IN everything together with dramatic entrance
        await new Promise(resolve => {
          // Wheel fades in smoothly (no scale animation to avoid wobble)
          this.tweens.add({
            targets: featureWheel,
            alpha: 1,
            duration: 500,
            ease: 'Quad.easeOut'
          });
          
          // Sun glow removed
          
          this.time.delayedCall(500, resolve);
        });
        
        // Sun glow animation removed
        
        // Subtle pulse on inner border glow - DISABLED
        
        // === WHEEL SEGMENTS (3 segments of 120° each) ===
        // Segment positions (in radians, 0 = right, clockwise):
        // segment 1 = 0° to 120° (right side, curving down to lower-left)
        
        // GLITTER EFFECT - sparkles on the BORDER of the wheel only
        this.wheelSparkleTimer = this.time.addEvent({
          delay: 20, // Frequent spawning
          loop: true,
          callback: () => {
            const colors = [0xFFDD44, 0xFFAA00, 0xFFFFAA, 0xFFFFFF, 0xFFCC22];
            
            // Spawn 2-3 glitter particles per tick for density
            const spawnCount = 2 + Math.floor(Math.random() * 2);
            
            for (let i = 0; i < spawnCount; i++) {
              const angle = Math.random() * Math.PI * 2;
              
              // Spawn on border with slight variation (just inside to just outside)
              const borderVariation = (Math.random() - 0.5) * 25; // -12.5 to +12.5
              const distance = glitterOrbitRadius + borderVariation;
              const x = centerX + Math.cos(angle) * distance;
              const y = wheelCenterY + Math.sin(angle) * distance;
              
              // Fly outward from the border
              const targetX = x + Math.cos(angle) * (20 + Math.random() * 30);
              const targetY = y + Math.sin(angle) * (20 + Math.random() * 30);
              
              const glitter = this.add.circle(
                x, y, 
                1 + Math.random() * 3, 
                colors[Math.floor(Math.random() * colors.length)]
              )
                .setDepth(2010)
                .setAlpha(0.8 + Math.random() * 0.2)
                .setBlendMode(Phaser.BlendModes.ADD);
              
              // Twinkle outward and fade
              this.tweens.add({
                targets: glitter,
                x: targetX,
                y: targetY,
                alpha: 0,
                scale: 0.1 + Math.random() * 0.3,
                duration: 250 + Math.random() * 350,
                ease: 'Quad.easeOut',
                onComplete: () => glitter.destroy()
              });
            }
          }
        });
        
        // INTENSE GOLDEN electric arcs - MORE FREQUENT, THICKER, BRIGHTER
        this.wheelArcTimer = this.time.addEvent({
          delay: 80, // More frequent!
          loop: true,
          callback: () => {
            // Random position on wheel border
            const angle = Math.random() * Math.PI * 2;
            const startX = centerX + Math.cos(angle) * wheelVisualRadius;
            const startY = wheelCenterY + Math.sin(angle) * wheelVisualRadius;
            
            // Create POWERFUL GOLDEN lightning arc
            const arc = this.add.graphics().setDepth(2003);
            arc.lineStyle(3 + Math.random() * 2, 0xFFDD44, 1); // Golden lightning
            arc.beginPath();
            arc.moveTo(startX, startY);
            
            // Jagged lightning path outward - LONGER
            let x = startX, y = startY;
            const segments = 4 + Math.floor(Math.random() * 4);
            for (let j = 0; j < segments; j++) {
              const outward = 12 + Math.random() * 25; // Longer reach
              const tangent = (Math.random() - 0.5) * 30;
              x += Math.cos(angle) * outward + Math.cos(angle + Math.PI/2) * tangent;
              y += Math.sin(angle) * outward + Math.sin(angle + Math.PI/2) * tangent;
              arc.lineTo(x, y);
            }
            arc.strokePath();
            
            // Add golden glow effect with second thicker line
            const glowArc = this.add.graphics().setDepth(2004); // In front of wheel
            glowArc.lineStyle(8, 0xFFAA00, 0.5); // Orange-gold glow
            glowArc.beginPath();
            glowArc.moveTo(startX, startY);
            x = startX; y = startY;
            for (let j = 0; j < segments; j++) {
              const outward = 12 + Math.random() * 25;
              const tangent = (Math.random() - 0.5) * 30;
              x += Math.cos(angle) * outward + Math.cos(angle + Math.PI/2) * tangent;
              y += Math.sin(angle) * outward + Math.sin(angle + Math.PI/2) * tangent;
              glowArc.lineTo(x, y);
            }
            glowArc.strokePath();
            
            // Quick flash and fade
            this.tweens.add({
              targets: [arc, glowArc],
              alpha: 0,
              duration: 150,
              ease: 'Power2',
              onComplete: () => { arc.destroy(); glowArc.destroy(); }
            });
          }
        });
        
        // Store inner glow for cleanup
        this.bonusTransitionInnerGlow = innerGlow;
        this.bonusTransitionInnerBorderGlow = innerBorderGlow;
        
        // Store references for cleanup
        this.bonusTransitionOverlay = blackOverlay;
        this.bonusTransitionImage = transitionImage;
        this.bonusTransitionDaggers = daggers;
        this.bonusTransitionWheel = featureWheel;
        this.bonusTransitionEffects = { electricGlow }; // Glitter sparkles are self-cleaning
        this.wheelScale = wheelScale;
        this.wheelCenterX = centerX;
        this.wheelCenterY = wheelCenterY;
        
      },

    async startFeatureWheelSpin() {
        if (!this.bonusTransitionWheel) return;
        
        const wheel = this.bonusTransitionWheel;
        const wheelScale = this.wheelScale;
        
        // Create overlay wheel - use spinning image with same setup as main wheel
        const spinningWheelImage = this.selectedWheelImage + '_spinning';
        
        // Use same pixel-perfect positioning as main wheel
        const wheelX = Math.round(this.wheelCenterX);
        const wheelY = Math.round(this.wheelCenterY);
        
        const overlayWheel = this.add.image(wheelX, wheelY, spinningWheelImage)
          .setDepth(2002.5) // Above main wheel
          .setAlpha(0)
          .setScale(wheelScale)
          .setRotation(wheel.rotation)
          .setOrigin(0.5, 0.5); // Same explicit origin as main wheel
        
        // Sync overlay with main wheel's rotation tween
        if (this.wheelRotationTween) {
          this.wheelRotationTween.targets.push(overlayWheel);
        }
        
        // Use the selected wheel image based on upgrades (set in playBonusTransition)
        // Start deceleration directly with the correct image - no intermediate blur
        const finalWheelImage = this.selectedWheelImage || 'feature_wheel';
        
        const slowDownPhases = [
          { texture: finalWheelImage, duration: 150 }
        ];
        
        // Smooth cross-fade: new texture fades IN on top, old stays solid underneath
        const crossFadeToTexture = (textureKey, duration) => {
          return new Promise(resolve => {
            // Sync overlay rotation with main wheel
            overlayWheel.setRotation(wheel.rotation);
            // Set overlay to new texture, start invisible
            overlayWheel.setTexture(textureKey);
            overlayWheel.setAlpha(0);
            
            // Fade overlay in on top of solid base
            this.tweens.add({
              targets: overlayWheel,
              alpha: 1,
              duration: duration,
              ease: 'Linear',
              onComplete: () => {
                // Once fully visible, update base wheel to match
                wheel.setTexture(textureKey);
                wheel.setRotation(overlayWheel.rotation);
                // Hide overlay, ready for next transition
                overlayWheel.setAlpha(0);
                resolve();
              }
            });
          });
        };
        
        // === WHEEL CONTINUES SPINNING AT SAME SPEED - no jarring speed change ===
        const spinDuration = 3000;
        
        // Just wait for the spin duration - wheel is already spinning from fade-in
        await new Promise(resolve => {
          this.time.delayedCall(spinDuration, resolve);
        });
        
        // === PHASE 3: SLOW DOWN ===
        
        // Stop the continuous spin tween
        if (this.wheelRotationTween) {
          this.wheelRotationTween.stop();
        }
        
        // Slower rotation during slowdown - smooth deceleration (extra long for nearwin tension!)
        const slowdownRotation = wheel.rotation + Math.PI * 0.7; // More rotation for longer slowdown
        const slowdownTween = this.tweens.add({
          targets: [wheel, overlayWheel],
          rotation: slowdownRotation,
          duration: 3000, // 1.5 seconds longer for maximum nearwin feel
          ease: 'Cubic.easeOut'
        });
        
        // Cross-fade textures during slowdown (runs in parallel)
        for (const phase of slowDownPhases) {
          await crossFadeToTexture(phase.texture, phase.duration);
        }
        
        // WAIT for slowdown tween to complete before final snap
        await new Promise(resolve => {
          slowdownTween.on('complete', resolve);
          // If already complete, resolve immediately
          if (!slowdownTween.isPlaying()) resolve();
        });
        
        // Final snap to nearest segment alignment
        await new Promise(resolve => {
          this.tweens.add({
            targets: [wheel, overlayWheel],
            rotation: Math.round(wheel.rotation / (Math.PI / 4)) * (Math.PI / 4),
            duration: 300,
            ease: 'Back.easeOut',
            onComplete: resolve
          });
        });
        
        // Cleanup overlay wheel
        overlayWheel.destroy();
        
        
        // Trigger golden burst on all diamonds now that wheel has stopped
        if (this.bonusTransitionDaggers) {
          const centerX = this.cameras.main.width / 2;
          const wheelCenterY = (this.cameras.main.height / 2) - 50;
          
          this.bonusTransitionDaggers.forEach((dagger, i) => {
            if (dagger && !dagger.destroyed && dagger.finalX && dagger.finalY) {
              // Small delay between each burst for dramatic effect
              this.time.delayedCall(i * 150, () => {
                this.triggerDiamondColorBurst(dagger, dagger.finalX, dagger.finalY, centerX, wheelCenterY);
                
                // Play diamond confirmation sound
                this.playSfx('wheel_diamond_confirms', { volume: 0.4 });
              });
            }
          });
        }
        
        return wheel.rotation;
      },

    triggerDiamondColorBurst(diamond, x, y, centerX, centerY) {
        if (!this.diamondRadiateTimers) {
          this.diamondRadiateTimers = [];
        }
        
        // Natural golden/white colors
        const colors = { 
          inner: 0xFFDD88,   // Warm gold
          outer: 0xFFAA44,   // Orange gold
          bright: 0xFFFFCC   // Bright white-gold
        };
        
        
        // Calculate tip position (diamond points inward toward center)
        const angleToCenter = Math.atan2(centerY - y, centerX - x);
        const tipOffset = 20;
        const tipX = x + Math.cos(angleToCenter) * tipOffset;
        const tipY = y + Math.sin(angleToCenter) * tipOffset;
        
        // === BURST EFFECT - Big flash that expands and fades ===
        
        // Central bright flash
        const burstFlash = this.add.circle(x, y, 15, colors.bright, 1)
          .setDepth(2010)
          .setBlendMode(Phaser.BlendModes.ADD);
        
        this.tweens.add({
          targets: burstFlash,
          scale: { from: 0.5, to: 3 },
          alpha: { from: 1, to: 0 },
          duration: 400,
          ease: 'Power2',
          onComplete: () => burstFlash.destroy()
        });
        
        // Expanding ring burst
        const burstRing = this.add.circle(x, y, 25, colors.outer, 0)
          .setDepth(2009)
          .setStrokeStyle(4, colors.inner, 1);
        
        this.tweens.add({
          targets: burstRing,
          scale: { from: 0.3, to: 2.5 },
          alpha: { from: 1, to: 0 },
          duration: 500,
          ease: 'Power2',
          onComplete: () => burstRing.destroy()
        });
        
        // Color particles bursting outward
        for (let i = 0; i < 8; i++) {
          const angle = (i / 8) * Math.PI * 2;
          const particle = this.add.circle(x, y, 4, colors.inner, 0.9)
            .setDepth(2008)
            .setBlendMode(Phaser.BlendModes.ADD);
          
          const distance = 40 + Math.random() * 30;
          
          this.tweens.add({
            targets: particle,
            x: x + Math.cos(angle) * distance,
            y: y + Math.sin(angle) * distance,
            scale: { from: 1, to: 0.3 },
            alpha: { from: 0.9, to: 0 },
            duration: 350 + Math.random() * 150,
            ease: 'Power2',
            onComplete: () => particle.destroy()
          });
        }
        
        // === After burst, start subtle pulsing glow ===
        this.time.delayedCall(300, () => {
          // Gentle breathing pulse on the diamond
          const glowPulse = this.tweens.add({
            targets: diamond,
            scaleX: { from: 1, to: 1.06 },
            scaleY: { from: 1, to: 1.06 },
            duration: 600,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
          });
          
          // Subtle pulsating glow at the tip
          const tipGlow = this.add.circle(tipX, tipY, 8, colors.inner, 0.5)
            .setDepth(2003)
            .setBlendMode(Phaser.BlendModes.ADD);
          
          this.tweens.add({
            targets: tipGlow,
            alpha: { from: 0.3, to: 0.6 },
            scale: { from: 0.9, to: 1.3 },
            duration: 600,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
          });
          
          // Secondary subtle glow behind the tip
          const tipGlowOuter = this.add.circle(tipX, tipY, 14, colors.outer, 0.3)
            .setDepth(2004) // Same as daggers
            .setBlendMode(Phaser.BlendModes.ADD);
          
          this.tweens.add({
            targets: tipGlowOuter,
            alpha: { from: 0.15, to: 0.35 },
            scale: { from: 0.85, to: 1.2 },
            duration: 800,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
          });
          
          // Store for cleanup
          this.diamondRadiateTimers.push({ 
            glowPulse, 
            beamTimer: null, 
            glowRing: tipGlow,
            tipGlowOuter 
          });
        });
      },

    createNordicDagger(x, y) {
        const container = this.add.container(x, y).setDepth(2004); // In front of wheel
        
        const graphics = this.add.graphics();
        
        // Diamond dimensions - smaller and more elegant
        const height = 60;  // Total height (tip to tip)
        const width = 36;   // Total width at widest point
        
        // Outer glow
        graphics.lineStyle(12, 0xFFAA00, 0.3);
        graphics.beginPath();
        graphics.moveTo(0, -height / 2);      // Top point
        graphics.lineTo(width / 2, 0);         // Right point
        graphics.lineTo(0, height / 2);        // Bottom point
        graphics.lineTo(-width / 2, 0);        // Left point
        graphics.closePath();
        graphics.strokePath();
        
        // Main diamond fill - golden gradient effect
        graphics.fillStyle(0xFFDD44, 1);
        graphics.beginPath();
        graphics.moveTo(0, -height / 2);      // Top point (will point inward)
        graphics.lineTo(width / 2, 0);         // Right point
        graphics.lineTo(0, height / 2);        // Bottom point
        graphics.lineTo(-width / 2, 0);        // Left point
        graphics.closePath();
        graphics.fillPath();
        
        // Inner diamond for depth effect
        const innerScale = 0.6;
        graphics.fillStyle(0xFFAA00, 1);
        graphics.beginPath();
        graphics.moveTo(0, -height / 2 * innerScale);
        graphics.lineTo(width / 2 * innerScale, 0);
        graphics.lineTo(0, height / 2 * innerScale);
        graphics.lineTo(-width / 2 * innerScale, 0);
        graphics.closePath();
        graphics.fillPath();
        
        // Bright center highlight
        const highlightScale = 0.25;
        graphics.fillStyle(0xFFFFAA, 0.8);
        graphics.beginPath();
        graphics.moveTo(0, -height / 2 * highlightScale);
        graphics.lineTo(width / 2 * highlightScale, 0);
        graphics.lineTo(0, height / 2 * highlightScale);
        graphics.lineTo(-width / 2 * highlightScale, 0);
        graphics.closePath();
        graphics.fillPath();
        
        // Edge highlights for 3D effect
        graphics.lineStyle(2, 0xFFFFDD, 0.6);
        graphics.beginPath();
        graphics.moveTo(0, -height / 2);
        graphics.lineTo(-width / 2, 0);
        graphics.strokePath();
        
        graphics.lineStyle(1, 0xFFFFFF, 0.4);
        graphics.beginPath();
        graphics.moveTo(0, -height / 2);
        graphics.lineTo(width / 2, 0);
        graphics.strokePath();
        
        container.add(graphics);
        
        return container;
      },

    createDaggerLaunchBurst(x, y) {
        const colors = [0xFFDD44, 0xFFAA00, 0xFFFFAA, 0xFFFFFF];
        const sparkleCount = 16;
        
        // Central flash
        const flash = this.add.circle(x, y, 25, 0xFFDD44)
          .setDepth(2003)
          .setAlpha(0.9)
          .setBlendMode(Phaser.BlendModes.ADD);
        
        this.tweens.add({
          targets: flash,
          scale: 2,
          alpha: 0,
          duration: 250,
          ease: 'Quad.easeOut',
          onComplete: () => flash.destroy()
        });
        
        // Sparkle burst
        for (let i = 0; i < sparkleCount; i++) {
          const angle = (i / sparkleCount) * Math.PI * 2;
          const speed = 40 + Math.random() * 50;
          const size = 2 + Math.random() * 3;
          
          const sparkle = this.add.circle(x, y, size, colors[Math.floor(Math.random() * colors.length)])
            .setDepth(2003)
            .setAlpha(1)
            .setBlendMode(Phaser.BlendModes.ADD);
          
          this.tweens.add({
            targets: sparkle,
            x: x + Math.cos(angle) * speed,
            y: y + Math.sin(angle) * speed,
            alpha: 0,
            scale: 0.2,
            duration: 350 + Math.random() * 200,
            ease: 'Quad.easeOut',
            onComplete: () => sparkle.destroy()
          });
        }
      },

    startDaggerGlitterTrail(dagger) {
        const colors = [0xFFDD44, 0xFFAA00, 0xFFFFAA, 0xFFCC66];
        
        return this.time.addEvent({
          delay: 30, // Spawn rate
          callback: () => {
            if (!dagger || dagger.destroyed) return;
            
            const x = dagger.x + (Math.random() - 0.5) * 10;
            const y = dagger.y + (Math.random() - 0.5) * 10;
            
            const glitter = this.add.circle(x, y, 1.5 + Math.random() * 2, colors[Math.floor(Math.random() * colors.length)])
              .setDepth(2003) // Above wheel and sky
              .setAlpha(0.9)
              .setBlendMode(Phaser.BlendModes.ADD);
            
            this.tweens.add({
              targets: glitter,
              alpha: 0,
              scale: 0.1,
              duration: 400 + Math.random() * 200,
              ease: 'Quad.easeOut',
              onComplete: () => glitter.destroy()
            });
          },
          loop: true
        });
      },

    async fadeOutBonusTransition() {
        // Stop diamond radiate effects (timers only, keep visuals for fade)
        if (this.diamondRadiateTimers) {
          this.diamondRadiateTimers.forEach(effect => {
            if (effect.glowPulse) effect.glowPulse.stop();
            if (effect.beamTimer) effect.beamTimer.destroy();
          });
        }
        
        // Stop sparkle/arc timers
        if (this.wheelSparkleTimer) {
          this.wheelSparkleTimer.destroy();
          this.wheelSparkleTimer = null;
        }
        if (this.wheelArcTimer) {
          this.wheelArcTimer.destroy();
          this.wheelArcTimer = null;
        }
        
        // Collect all elements to fade out together
        const elementsToFade = [];
        
        // Diamonds and their glow effects
        if (this.bonusTransitionDaggers) {
          this.bonusTransitionDaggers.forEach(d => {
            if (d && !d.destroyed) elementsToFade.push(d);
          });
        }
        if (this.diamondRadiateTimers) {
          this.diamondRadiateTimers.forEach(effect => {
            if (effect.glowRing && !effect.glowRing.destroyed) elementsToFade.push(effect.glowRing);
            if (effect.tipGlowOuter && !effect.tipGlowOuter.destroyed) elementsToFade.push(effect.tipGlowOuter);
          });
        }
        
        // Wheel and transition images
        if (this.bonusTransitionWheel && !this.bonusTransitionWheel.destroyed) {
          elementsToFade.push(this.bonusTransitionWheel);
        }
        if (this.bonusTransitionImage && !this.bonusTransitionImage.destroyed) {
          elementsToFade.push(this.bonusTransitionImage);
        }
        if (this.bonusTransitionSky && !this.bonusTransitionSky.destroyed) {
          elementsToFade.push(this.bonusTransitionSky);
        }
        
        // Inner glows
        if (this.bonusTransitionInnerGlow && !this.bonusTransitionInnerGlow.destroyed) {
          elementsToFade.push(this.bonusTransitionInnerGlow);
        }
        if (this.bonusTransitionInnerBorderGlow && !this.bonusTransitionInnerBorderGlow.destroyed) {
          elementsToFade.push(this.bonusTransitionInnerBorderGlow);
        }
        
        // Segment lines and labels (if any)
        if (this.wheelSegmentLines && !this.wheelSegmentLines.destroyed) {
          elementsToFade.push(this.wheelSegmentLines);
        }
        if (this.wheelSegmentLabels) {
          this.wheelSegmentLabels.forEach(label => {
            if (label && !label.destroyed) elementsToFade.push(label);
          });
        }
        
        // Electric glow effect
        if (this.bonusTransitionEffects?.electricGlow && !this.bonusTransitionEffects.electricGlow.destroyed) {
          elementsToFade.push(this.bonusTransitionEffects.electricGlow);
        }
        
        // Fade out all wheel elements together
        if (elementsToFade.length > 0) {
          await new Promise(resolve => {
            this.tweens.add({
              targets: elementsToFade,
              alpha: 0,
              duration: 600,
              ease: 'Quad.easeOut',
              onComplete: () => {
                // Now destroy all faded elements
                elementsToFade.forEach(el => {
                  if (el && typeof el.destroy === 'function' && !el.destroyed) {
                    el.destroy();
                  }
                });
                resolve();
              }
            });
          });
        }
        
        // Cleanup references
        this.bonusTransitionDaggers = null;
        this.bonusTransitionWheel = null;
        this.bonusTransitionImage = null;
        this.bonusTransitionSky = null;
        this.bonusTransitionInnerGlow = null;
        this.bonusTransitionInnerBorderGlow = null;
        this.wheelSegmentLines = null;
        this.wheelSegmentLabels = null;
        this.bonusTransitionEffects = null;
        this.diamondRadiateTimers = null;
        
        // Short pause before revealing game
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // Fade out the black overlay to reveal game area
        if (this.bonusTransitionOverlay && !this.bonusTransitionOverlay.destroyed) {
          await new Promise(resolve => {
            this.tweens.add({
              targets: this.bonusTransitionOverlay,
              alpha: 0,
              duration: 800,
              ease: 'Quad.easeInOut',
              onComplete: () => {
                this.bonusTransitionOverlay.destroy();
                this.bonusTransitionOverlay = null;
                resolve();
              }
            });
          });
        }
        
      },

    cleanupBonusTransition() {
        if (this.bonusTransitionOverlay && !this.bonusTransitionOverlay.destroyed) {
          this.bonusTransitionOverlay.destroy();
          this.bonusTransitionOverlay = null;
        }
        if (this.bonusTransitionImage && !this.bonusTransitionImage.destroyed) {
          this.bonusTransitionImage.destroy();
          this.bonusTransitionImage = null;
        }
        if (this.diamondRadiateTimers) {
          this.diamondRadiateTimers.forEach(effect => {
            if (effect.glowPulse) effect.glowPulse.stop();
            if (effect.beamTimer) effect.beamTimer.destroy();
            if (effect.glowRing && !effect.glowRing.destroyed) effect.glowRing.destroy();
            if (effect.tipGlowOuter && !effect.tipGlowOuter.destroyed) effect.tipGlowOuter.destroy();
          });
          this.diamondRadiateTimers = null;
        }
        if (this.bonusTransitionDaggers) {
          this.bonusTransitionDaggers.forEach(d => {
            if (d && !d.destroyed) d.destroy();
          });
          this.bonusTransitionDaggers = null;
        }
        if (this.bonusTransitionWheel && !this.bonusTransitionWheel.destroyed) {
          this.bonusTransitionWheel.destroy();
          this.bonusTransitionWheel = null;
        }
        // Cleanup Thor effects
        if (this.wheelSparkleTimer) {
          this.wheelSparkleTimer.destroy();
          this.wheelSparkleTimer = null;
        }
        if (this.wheelArcTimer) {
          this.wheelArcTimer.destroy();
          this.wheelArcTimer = null;
        }
        if (this.bonusTransitionInnerGlow && !this.bonusTransitionInnerGlow.destroyed) {
          this.bonusTransitionInnerGlow.destroy();
          this.bonusTransitionInnerGlow = null;
        }
        if (this.bonusTransitionInnerBorderGlow && !this.bonusTransitionInnerBorderGlow.destroyed) {
          this.bonusTransitionInnerBorderGlow.destroy();
          this.bonusTransitionInnerBorderGlow = null;
        }
        if (this.wheelSegmentLines && !this.wheelSegmentLines.destroyed) {
          this.wheelSegmentLines.destroy();
          this.wheelSegmentLines = null;
        }
        if (this.wheelSegmentLabels) {
          this.wheelSegmentLabels.forEach(label => {
            if (label && !label.destroyed) label.destroy();
          });
          this.wheelSegmentLabels = null;
        }
        if (this.bonusTransitionEffects) {
          if (this.bonusTransitionEffects.electricGlow && !this.bonusTransitionEffects.electricGlow.destroyed) {
            this.bonusTransitionEffects.electricGlow.destroy();
          }
          this.bonusTransitionEffects = null;
        }
      }
  };
}
