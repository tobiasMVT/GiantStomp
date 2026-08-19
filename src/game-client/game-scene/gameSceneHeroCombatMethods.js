export function createGameSceneHeroCombatMethods(deps = {}) {
  const {
    BANANA_SYMBOL_IDS,
    BANANA_TRAIL_TINT,
    BONUS_MYSTERY_FEATURE_SYMBOL_ID,
    DEPTH_HERO,
    DEPTH_SYMBOLS,
    GRID_OFFSET_X,
    GRID_OFFSET_Y,
    HERO_LIGHTNING_SHEET_TEXTURE_KEY,
    HERO_STAGE_TEXTURE_KEYS,
    LIGHTNING_BEE_FEATURE_SYMBOL_ID,
    MERGE_GUN_FEATURE_SYMBOL_ID,
    MONKEY_PICTURE_LEVEL_UP_THRESHOLDS,
    Phaser,
    SHAKE_MYSTERY_REVEAL_DURATION,
    SHAKE_MYSTERY_REVEAL_INTENSITY,
    clientConfig,
    getHeroScaleForFootprint,
    getHeroTexture,
    getSymbolScale,
    isBanana,
    normalScale,
    normalizeSymbolKey
  } = deps;

  return {
    async createAttackStorm(centerX, centerY, heroPath, weapon) {
        const cellSize = 70;
        const stormFootprintSize = Math.max(
          1,
          Math.floor(Number(heroPath?.[0]?.footprintSize || this.currentHeroFootprintSize || 1))
        );
        const heroTexture = getHeroTexture(weapon, {
          footprintSize: stormFootprintSize,
          rushActive: true,
          bonusStage: this.currentBonusStage
        });
        const heroFlashScale = getHeroScaleForFootprint(stormFootprintSize, heroTexture);
        const stormDuration = 600; // Total storm duration
        
        // Get all 9 troll banana positions
        const trollBananaSteps = heroPath.filter(step => step.banana);
        
        // 2-3 rapid slashes hitting different banana positions
        const slashCount = 2 + Math.floor(Math.random() * 2); // Random 2-3 slashes
        const slashInterval = 200; // Spacing between slashes
        
        for (let i = 0; i < slashCount; i++) {
          setTimeout(() => {
            // Pick a random banana position from the 9 troll positions
            const targetPos = trollBananaSteps[Math.floor(Math.random() * trollBananaSteps.length)];
            const slashX = targetPos.reel * cellSize + cellSize / 2 + GRID_OFFSET_X;
            const slashY = (clientConfig.area.height - 1 - targetPos.row) * cellSize + cellSize / 2 + GRID_OFFSET_Y;
            
            // Random slash angle for more chaotic feel
            const slashAngle = Math.random() * 180 - 90; // Random angle between -90 and 90
            
            // Hero flash at this banana position
            const heroFlash = this.add.image(slashX, slashY, heroTexture)
              .setOrigin(0.5)
              .setScale(heroFlashScale * 1.2)
              .setDepth(DEPTH_HERO + 2)
              .setAlpha(0.7);
            
            this.tweens.add({
              targets: heroFlash,
              alpha: 0,
              scale: normalScale * 0.9,
              duration: 80,
              ease: 'Power2.easeOut',
              onComplete: () => heroFlash.destroy()
            });
            
            // Long thin slash mark - random angles and lengths
            const slashLength = 140 + Math.random() * 30; // 140-170px long
            const slash = this.add.rectangle(slashX, slashY, slashLength, 1.5, 0xFFFFFF)
              .setOrigin(0.5)
              .setDepth(DEPTH_HERO + 3)
              .setAlpha(0)
              .setAngle(slashAngle)
              .setBlendMode(Phaser.BlendModes.ADD);
            
            this.tweens.add({
              targets: slash,
              alpha: 1,
              scaleX: 1.5,
              duration: 40,
              ease: 'Power3.easeOut',
              onComplete: () => {
                this.tweens.add({
                  targets: slash,
                  alpha: 0,
                  duration: 100,
                  ease: 'Power2.easeIn',
                  onComplete: () => slash.destroy()
                });
              }
            });
            
            // Impact burst particles
            for (let p = 0; p < 6; p++) {
              const particleAngle = (p / 6) * Math.PI * 2;
              const particle = this.add.circle(
                slashX,
                slashY,
                Math.random() * 2 + 1,
                0xFFFFFF
              ).setDepth(DEPTH_HERO + 4).setAlpha(1).setBlendMode(Phaser.BlendModes.ADD);
              
              this.tweens.add({
                targets: particle,
                x: particle.x + Math.cos(particleAngle) * 35,
                y: particle.y + Math.sin(particleAngle) * 35,
                alpha: 0,
                duration: 120,
                ease: 'Power2.easeOut',
                onComplete: () => particle.destroy()
              });
            }
            
            // Brief screen flash for impact
            const screenFlash = this.add.rectangle(
              this.cameras.main.centerX,
              this.cameras.main.centerY,
              this.cameras.main.width,
              this.cameras.main.height,
              0xFFFFFF
            ).setDepth(DEPTH_HERO + 5).setAlpha(0).setScrollFactor(0);
            
            this.tweens.add({
              targets: screenFlash,
              alpha: 0.15,
              duration: 30,
              yoyo: true,
              ease: 'Power2.easeOut',
              onComplete: () => screenFlash.destroy()
            });
            
          }, i * slashInterval);
        }
        
        // Camera shake during storm
        this.cameras.main.shake(stormDuration, 0.015);
        
        // Wait for storm to complete
        await new Promise(resolve => setTimeout(resolve, stormDuration));
      },

    async animateHeroHunt(
        heroPath,
        affectedPositions,
        orbDrops = [],
        multiplier = 1,
        totalDemonsKilledInSequence = 0,
        stepType = "destroy",
        weapon = "staff",
        bonusInfo = null,
        bananaMeterLevel = 0,
        postHuntWinSlowMode = false,
        meterProgress = null,
        huntBehavior = null
      ) {
        // Store weapon for this hunt (used for hero texture)
        this.currentHeroWeapon = weapon;
        const cellSize = 70;
        const isHuntFeatureSymbolId = (symbolId) => {
          const normalizedSymbol = Math.floor(Number(symbolId));
          if (!Number.isFinite(normalizedSymbol)) return false;
          return normalizedSymbol === Math.floor(MERGE_GUN_FEATURE_SYMBOL_ID) ||
            normalizedSymbol === Math.floor(BONUS_MYSTERY_FEATURE_SYMBOL_ID) ||
            normalizedSymbol === Math.floor(LIGHTNING_BEE_FEATURE_SYMBOL_ID);
        };
        const huntSpeedFactor = postHuntWinSlowMode ? 1.4 : 1;
        let rushActive =
          Array.isArray(heroPath) && heroPath.length > 0 && typeof heroPath[0]?.rushActive === "boolean"
            ? heroPath[0].rushActive === true
            : huntBehavior?.rushActive === true;
        let visualBonusStage = Math.max(0, Math.floor(Number(huntBehavior?.bonusStage) || 0));
        const finalBonusStage = Math.max(
          visualBonusStage,
          Math.floor(Number(huntBehavior?.finalBonusStage ?? visualBonusStage) || visualBonusStage)
        );
        this.currentBonusStage = visualBonusStage;
        const mergeGunActivations = Array.isArray(huntBehavior?.mergeGunActivations)
          ? huntBehavior.mergeGunActivations
          : [];
        const mergeGunFeatureCollections = Array.isArray(huntBehavior?.mergeGunFeatureCollections)
          ? huntBehavior.mergeGunFeatureCollections
          : [];
        const mergeGunAreas = Array.isArray(huntBehavior?.mergeGunAreas)
          ? huntBehavior.mergeGunAreas
          : [];
        const bonusMysteryFeatureCollections = Array.isArray(huntBehavior?.bonusMysteryFeatureCollections)
          ? huntBehavior.bonusMysteryFeatureCollections
          : [];
        const lightningBeeFeatureCollections = Array.isArray(huntBehavior?.lightningBeeFeatureCollections)
          ? huntBehavior.lightningBeeFeatureCollections
          : [];
        const heavenHellGameState = huntBehavior?.heavenHellGameState || null;
        const firstHeavenHellBonusEntryAttack = huntBehavior?.firstHeavenHellBonusEntryAttack === true;
        if (heavenHellGameState?.heavenHell?.bonus && heavenHellGameState?.isBonus === true) {
          this.prepareHeavenHellMultiplierOrbPlan?.(heavenHellGameState);
          this.prepareHeavenHellKillMeterForAction(heavenHellGameState);
        } else {
          this._heavenHellMultiplierOrbPlan = null;
        }
        let heroFootprintSize = Math.max(
          1,
          Math.floor(Number(heroPath?.[0]?.footprintSize || huntBehavior?.heroFootprintSize) || (huntBehavior?.giantMonkeyActive ? 2 : 1))
        );
        this.currentHeroFootprintSize = heroFootprintSize;
        let giantMonkeyActive = huntBehavior?.giantMonkeyActive === true || heroFootprintSize > 1 || visualBonusStage >= 5;
        let heroTexture = getHeroTexture(weapon, { footprintSize: heroFootprintSize, rushActive, bonusStage: visualBonusStage });
        let heroBaseScale = getHeroScaleForFootprint(heroFootprintSize, heroTexture);
        this.currentHeroRushActive = rushActive;
        this.currentHeroTextureKey = heroTexture;
        const syncHeroRuntimeForm = (footprintSize, heroAnchor = null) => {
          heroFootprintSize = Math.max(1, Math.floor(Number(footprintSize) || 1));
          this.currentHeroFootprintSize = heroFootprintSize;
          giantMonkeyActive = giantMonkeyActive || heroFootprintSize > 1;
          this.currentHeroRushActive = rushActive;
          heroTexture = getHeroTexture(weapon, { footprintSize: heroFootprintSize, rushActive, bonusStage: visualBonusStage });
          heroBaseScale = getHeroScaleForFootprint(heroFootprintSize, heroTexture);
          this.currentHeroTextureKey = heroTexture;
          if (this.heroSprite && !this.heroSprite.destroyed) {
            this.heroSprite.setTexture(heroTexture);
            this.heroSprite.setScale(heroBaseScale);
          }
          if (heroAnchor && Number.isFinite(heroAnchor.reel) && Number.isFinite(heroAnchor.row)) {
            this.currentHeroAnchor = {
              reel: Number(heroAnchor.reel),
              row: Number(heroAnchor.row)
            };
          }
        };
        const baseRushDuration = 60 * huntSpeedFactor;
        const minRushDuration = 22 * huntSpeedFactor;
        const rushAccelerationRate = 0.66;
        const approachDuration = 42 * huntSpeedFactor;
        const attackDuration = 110 * huntSpeedFactor;
        const HUNT_MOMENTUM_GAIN = 0.24;
        const HUNT_MOMENTUM_MAX = 3.2;
        const HUNT_MOMENTUM_IMPACT_DECAY = 0.24;
        const DIVINE_STRIKE_SLOWMO_REAL_MS = 850;
        const DIVINE_STRIKE_SLOWMO_FACTOR = 0.18;
        let huntMomentum = 1.0;
        const applyMomentumToDuration = (duration) => Math.max(
          minRushDuration,
          Math.floor(Number(duration) / Math.min(HUNT_MOMENTUM_MAX, huntMomentum))
        );
        const isHeavenHellBonusHunt = Boolean(heavenHellGameState?.heavenHell?.bonus && heavenHellGameState?.isBonus === true);
        const isMainGameAngelHunt = !isHeavenHellBonusHunt;
        const shouldUseHellDiveStartDeathFx = () => (
          this.textures?.exists?.("helldive_demon_death_spatter") &&
          typeof this.playHeavenHellDemonDeathFx === "function" &&
          (
            (isHeavenHellBonusHunt && firstHeavenHellBonusEntryAttack) ||
            this.shouldPlayHeavenHellSoulCollectionFx?.()
          )
        );
        const syncAngelMultiplierDisplay = (rawValue, options = {}) => {
          if (!isMainGameAngelHunt) return null;
          return this.setHeroAngelMultiplierDisplay?.(rawValue, options);
        };
        const playStepGargoyleEscapes = async (pathStep, options = {}) => {
          if (!isHeavenHellBonusHunt) return;
          const escapes = Array.isArray(pathStep?.gargoyleEscapesAfterStep)
            ? pathStep.gargoyleEscapesAfterStep
            : [];
          if (escapes.length === 0) return;
          await this.playHeavenHellQueuedGargoyleEscapes?.(
            escapes,
            heavenHellGameState,
            options
          );
        };
        const bloodSlowMoDuration = 900; // Extended slow-motion blood splatter
        
        // Orb animation settings
        const orbSize = 12; // Bigger energy orbs with neon glow
        const orbColors = [0x00D1CE, 0x1EFF90, 0x41E169, 0x00D1CE]; // Turquoise green, emerald green, spring green, turquoise green
        const orbFallDuration = 150; // Fast burst outward
        const orbSuckDuration = 600; // Time to get sucked into house
        
        // Bonus mode banana counter tracking
        let bonusBananasKilled = bonusInfo?.baseKillCount || 0;
        let bananasEncountered = 0;
        const isBonus = bonusInfo?.isBonus || false;
        const bananasPerChest = bonusInfo?.bananasPerChest || 10;
        const resolvedBananaMeterLevel = Math.max(0, Math.floor(Number(bananaMeterLevel) || 0));
        const useMainGameWildOverride = this.currentAction === "bananaHunt";
        const resolveWildStrengthFromMeterCount = (rawCount) => {
          const meterInfo = this.getBananaMeterInfo(rawCount);
          const meterLevel = meterInfo.level ?? 0;
          return this.getMonkeyWildStrengthByMeterLevel(meterLevel, { useMainGameOverride: useMainGameWildOverride });
        };
        const fallbackWildStrength = this.getMonkeyWildStrengthByMeterLevel(resolvedBananaMeterLevel, {
          useMainGameOverride: useMainGameWildOverride
        });
        const progressStart = Number(meterProgress?.startCount);
        const progressFinal = Number(meterProgress?.finalCount);
        const rawBaseCountUpValue = Number(meterProgress?.baseCountUpValue);
        const hasMeterProgress =
          Number.isFinite(progressFinal) &&
          Number.isFinite(progressStart) &&
          progressFinal >= 0 &&
          progressStart >= 0;
        const baseCountUpValue = Number.isFinite(rawBaseCountUpValue)
          ? rawBaseCountUpValue
          : Math.max(0, Number(this.currentDisplayedWin) || 0);
        let liveMeterCount = hasMeterProgress ? Math.min(Math.floor(progressStart), Math.floor(progressFinal)) : null;
        let fallbackMeterFxCount = Math.max(0, Math.min(30, Math.floor(Number(this.currentBananaMeterCount) || 0)));
        let committedMeterCount = hasMeterProgress && liveMeterCount !== null
          ? liveMeterCount
          : fallbackMeterFxCount;
        const getHighestMonkeyPictureLevelUpThreshold = (rawCount = 0) => {
          const count = Math.max(0, Math.min(30, Math.floor(Number(rawCount) || 0)));
          return MONKEY_PICTURE_LEVEL_UP_THRESHOLDS.reduce((highest, threshold) => (
            count >= threshold ? threshold : highest
          ), 0);
        };
        let observedMonkeyPictureLevelUpThreshold = getHighestMonkeyPictureLevelUpThreshold(committedMeterCount);
        const playBonusStageLevelUpBurst = async (pathStep, { growthHandled = false } = {}) => {
          const nextThreshold = getHighestMonkeyPictureLevelUpThreshold(pathStep?.bananaMeterCount);
          if (nextThreshold <= observedMonkeyPictureLevelUpThreshold) {
            return;
          }
    
          observedMonkeyPictureLevelUpThreshold = nextThreshold;
          const stepBonusStage = Math.max(0, Math.floor(Number(pathStep?.bonusStage) || 0));
          if (stepBonusStage > visualBonusStage) {
            visualBonusStage = stepBonusStage;
            this.currentBonusStage = visualBonusStage;
          }
          if (pathStep?.rushActivated === true || visualBonusStage >= 3) {
            rushActive = true;
            this.currentHeroRushActive = true;
          }
          syncHeroRuntimeForm(heroFootprintSize, this.currentHeroAnchor);
          if (growthHandled) {
            return;
          }
        };
        const retriggerThresholds = [10, 15, 20, 25, 30];
        const handleBonusRetriggerFromMeterProgress = (fromCount, toCount) => {
          if (this.currentAction !== "freespinbananaHunt") return;
          const from = Math.max(0, Math.min(30, Math.floor(Number(fromCount) || 0)));
          const to = Math.max(0, Math.min(30, Math.floor(Number(toCount) || 0)));
          if (to <= from) return;
    
          const crossed = retriggerThresholds.reduce((sum, threshold) => (
            from < threshold && to >= threshold ? sum + 1 : sum
          ), 0);
          if (crossed <= 0) return;
    
          const awarded = crossed * 2;
          this.incrementFreespinCounter(awarded);
          this.showFreespinAwardPopup(awarded);
        };
        const pushLiveMeterTick = () => {
          if (!hasMeterProgress || liveMeterCount === null) return null;
          const next = Math.min(Math.floor(progressFinal), liveMeterCount + 1);
          if (next !== liveMeterCount) {
            liveMeterCount = next;
          }
          return liveMeterCount;
        };
        const refreshMonkeyStrengthBadge = () => {
          if (hasMeterProgress && liveMeterCount !== null) {
            this.updateMonkeyWildStrengthBadge(resolveWildStrengthFromMeterCount(liveMeterCount));
          } else {
            this.updateMonkeyWildStrengthBadge(fallbackWildStrength);
          }
        };
        const applyImpactWinCountUp = (pathStep) => {
          const cumulativeImpactWin = Number(pathStep?.impactWinCumulativeTwa);
          if (!Number.isFinite(cumulativeImpactWin) || cumulativeImpactWin <= 0) return;
          this.updateCountUp(baseCountUpValue + cumulativeImpactWin);
        };
        const registerBananaEncounter = (sourceX = null, sourceY = null) => {
          bananasEncountered++;
          const meterAlreadyMaxed = hasMeterProgress && liveMeterCount !== null
            ? liveMeterCount >= 30
            : fallbackMeterFxCount >= 30 || Number(this.currentBananaMeterCount || 0) >= 30;
          let meterCountForFx = null;
          if (hasMeterProgress && liveMeterCount !== null) {
            meterCountForFx = pushLiveMeterTick();
          } else {
            fallbackMeterFxCount = Math.min(30, fallbackMeterFxCount + 1);
            meterCountForFx = fallbackMeterFxCount;
          }
    
          const commitMeterTick = (resolvedCount = null) => {
            const fallbackCount = Number(this.currentBananaMeterCount) || 0;
            const targetCount = Math.max(
              0,
              Math.min(30, Math.floor(Number(resolvedCount) || Math.floor(Number(meterCountForFx) || fallbackCount)))
            );
            const previousCount = committedMeterCount;
            const displayCount = Math.max(fallbackCount, targetCount);
            this.updateBananaMeter(displayCount);
            committedMeterCount = Math.max(previousCount, displayCount);
            fallbackMeterFxCount = Math.max(fallbackMeterFxCount, committedMeterCount);
            if (hasMeterProgress && liveMeterCount !== null) {
              liveMeterCount = Math.max(liveMeterCount, committedMeterCount);
            }
    
            if (hasMeterProgress) {
              this.updateMonkeyWildStrengthBadge(resolveWildStrengthFromMeterCount(displayCount));
            } else {
              this.updateMonkeyWildStrengthBadge(fallbackWildStrength);
            }
    
            handleBonusRetriggerFromMeterProgress(previousCount, committedMeterCount);
          };
    
          let meterArrivalPromise = Promise.resolve(false);
          if (meterAlreadyMaxed) {
            commitMeterTick(meterCountForFx);
          } else if (Number.isFinite(sourceX) && Number.isFinite(sourceY)) {
            meterArrivalPromise = this.animateBananaCollectToMeter(sourceX, sourceY, meterCountForFx, {
              onArrive: (resolvedCount) => commitMeterTick(resolvedCount)
            }) || Promise.resolve(false);
          } else {
            commitMeterTick(meterCountForFx);
          }
          if (isBonus) {
            bonusBananasKilled++;
            this.updateBananaKillCounter(bonusBananasKilled, bananasPerChest);
          }
          return meterArrivalPromise;
        };
        const syncMeterFromStepState = (pathStep = null) => {
          const rawStepCount = Number(pathStep?.bananaMeterCount);
          if (!Number.isFinite(rawStepCount)) return;
    
          const stepMeterCount = Math.max(0, Math.min(30, Math.floor(rawStepCount)));
          if (stepMeterCount <= committedMeterCount) return;
    
          const previousCount = committedMeterCount;
          committedMeterCount = stepMeterCount;
          fallbackMeterFxCount = Math.max(fallbackMeterFxCount, committedMeterCount);
          if (hasMeterProgress && liveMeterCount !== null) {
            liveMeterCount = Math.max(liveMeterCount, committedMeterCount);
          }
          this.updateBananaMeter(committedMeterCount);
    
          if (hasMeterProgress) {
            this.updateMonkeyWildStrengthBadge(resolveWildStrengthFromMeterCount(committedMeterCount));
          } else {
            this.updateMonkeyWildStrengthBadge(fallbackWildStrength);
          }
    
          handleBonusRetriggerFromMeterProgress(previousCount, committedMeterCount);
        };
        const registerGrowthBananasToMeter = (pathStep = null) => {
          const growthConsumedCells = Array.isArray(pathStep?.growthConsumedCells)
            ? pathStep.growthConsumedCells
            : [];
          const meterArrivalPromises = [];
          growthConsumedCells.forEach((cell) => {
            if (cell?.banana !== true) return;
            if (!Number.isFinite(cell?.reel) || !Number.isFinite(cell?.row)) return;
            const center = getCellCenter(cell.reel, cell.row);
            meterArrivalPromises.push(registerBananaEncounter(center.x, center.y));
          });
          return meterArrivalPromises;
        };
        const pendingBananaMeterArrivalPromises = new Set();
        const trackBananaMeterArrival = (promise, targetList = []) => {
          if (!promise || typeof promise.then !== "function") return;
          const trackedPromise = promise.catch(() => false);
          pendingBananaMeterArrivalPromises.add(trackedPromise);
          trackedPromise.finally(() => pendingBananaMeterArrivalPromises.delete(trackedPromise));
          targetList.push(trackedPromise);
        };
        const waitForBananaMeterArrivals = async (promises = []) => {
          const waitable = promises.filter((promise) => promise && typeof promise.then === "function");
          if (waitable.length === 0) return;
          await Promise.allSettled(waitable);
        };
        const bananaUpgradeThresholds = [5, 10, 15, 20, 25, 30];
        const doesStepTriggerBananaUpgrade = (pathStep = null) => {
          if (!pathStep) return false;
          if (pathStep.rushActivated === true || pathStep.giantMonkeyActivated === true) return true;
          const rawStepCount = Number(pathStep?.bananaMeterCount);
          if (!Number.isFinite(rawStepCount)) return false;
          const previousCount = Math.max(0, Math.min(30, Math.floor(Number(committedMeterCount) || 0)));
          const nextCount = Math.max(0, Math.min(30, Math.floor(rawStepCount)));
          return bananaUpgradeThresholds.some((threshold) => previousCount < threshold && nextCount >= threshold);
        };
        const bananaTextureKeys = new Set([
          "banana",
          "banana_transparent",
          "13_fromleft",
          ...BANANA_SYMBOL_IDS.map((id) => String(id))
        ]);
        const isBananaVisualSprite = (sprite) => {
          if (!sprite || sprite.destroyed || sprite.isTransientBananaFx) return false;
          if (isBanana(normalizeSymbolKey(sprite.symbolKey))) return true;
          const textureKey = sprite.texture?.key;
          return textureKey ? bananaTextureKeys.has(String(textureKey)) : false;
        };
        const getCellCenter = (reel, row) => ({
          x: reel * cellSize + cellSize / 2 + GRID_OFFSET_X,
          y: (clientConfig.area.height - 1 - row) * cellSize + cellSize / 2 + GRID_OFFSET_Y
        });
        const getHeroAnchorCenter = (reel, row, footprintSize = 1) => {
          const size = Math.max(1, Math.floor(Number(footprintSize) || 1));
          if (size <= 1) {
            return getCellCenter(reel, row);
          }
    
          let totalX = 0;
          let totalY = 0;
          let count = 0;
          for (let reelOffset = 0; reelOffset < size; reelOffset++) {
            for (let rowOffset = 0; rowOffset < size; rowOffset++) {
              const center = getCellCenter(reel + reelOffset, row + rowOffset);
              totalX += center.x;
              totalY += center.y;
              count++;
            }
          }
          return {
            x: totalX / count,
            y: totalY / count
          };
        };
        const getRushingMonkeyTrailCells = (pathStep = null, coveredCells = []) => {
          const rawFootprintSize = Number(pathStep?.footprintSize ?? heroFootprintSize);
          const footprintSize = Math.max(1, Math.floor(rawFootprintSize || 1));
          const sourceCells = Array.isArray(coveredCells) && coveredCells.length > 0
            ? coveredCells
            : [];
          const cells = [];
    
          sourceCells.forEach((cell) => {
            const reel = Math.floor(Number(cell?.reel));
            const row = Math.floor(Number(cell?.row));
            if (!Number.isFinite(reel) || !Number.isFinite(row)) return;
            cells.push({ reel, row });
          });
    
          if (footprintSize > 1 && cells.length <= 1) {
            const anchorReel = Math.floor(Number(pathStep?.reel));
            const anchorRow = Math.floor(Number(pathStep?.row));
            if (Number.isFinite(anchorReel) && Number.isFinite(anchorRow)) {
              cells.length = 0;
              for (let reelOffset = 0; reelOffset < footprintSize; reelOffset++) {
                for (let rowOffset = 0; rowOffset < footprintSize; rowOffset++) {
                  cells.push({
                    reel: anchorReel + reelOffset,
                    row: anchorRow + rowOffset
                  });
                }
              }
            }
          }
    
          const uniqueCells = [];
          const seenKeys = new Set();
          cells.forEach((cell) => {
            if (
              cell.reel < 0 ||
              cell.reel >= clientConfig.area.width ||
              cell.row < 0 ||
              cell.row >= clientConfig.area.height
            ) {
              return;
            }
            const key = `${cell.reel},${cell.row}`;
            if (seenKeys.has(key)) return;
            seenKeys.add(key);
            uniqueCells.push(cell);
          });
          return uniqueCells;
        };
        const emitRushingMonkeyStepTrail = (pathStep = null, coveredCells = []) => {
          const rawStage = Number(pathStep?.bonusStage);
          const stepStage = Number.isFinite(rawStage)
            ? Math.max(0, Math.floor(rawStage))
            : visualBonusStage;
          const rawFootprintSize = Number(pathStep?.footprintSize ?? heroFootprintSize);
          const footprintSize = Math.max(1, Math.floor(rawFootprintSize || 1));
          const hasExplicitRushState = typeof pathStep?.rushActive === "boolean";
          const stepRushActive = hasExplicitRushState
            ? pathStep.rushActive === true
            : (rushActive === true || stepStage >= 3);
          if (!stepRushActive || is3x3Troll) return;
    
          const cells = getRushingMonkeyTrailCells(pathStep, coveredCells);
          if (cells.length === 0) return;
    
          const visualStage = pathStep?.giantMonkeyActivated === true
            ? Math.max(3, stepStage - 1)
            : stepStage;
          const intensity = (visualStage >= 5 || footprintSize >= 3) ? 3 : ((visualStage >= 4 || footprintSize >= 2) ? 2 : 1);
          const sparksPerCell = intensity >= 3 ? 3 : (intensity >= 2 ? 2 : 1);
          const colors = [0xFFF7B8, 0xFFD84A, 0xFFFFFF, 0xFFB72A];
          cells.forEach((cell, cellIndex) => {
            const center = getCellCenter(cell.reel, cell.row);
            for (let sparkIndex = 0; sparkIndex < sparksPerCell; sparkIndex++) {
              const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
              const startRadius = Phaser.Math.FloatBetween(4, 18);
              const drift = Phaser.Math.FloatBetween(12, 30 + intensity * 5);
              const spark = this.add.circle(
                center.x + Math.cos(angle) * startRadius,
                center.y + Math.sin(angle) * startRadius,
                Phaser.Math.FloatBetween(1.1, 2.2 + intensity * 0.25),
                colors[(cellIndex + sparkIndex) % colors.length],
                0.78
              )
                .setDepth(DEPTH_HERO - 2)
                .setBlendMode(Phaser.BlendModes.ADD);
    
              this.tweens.add({
                targets: spark,
                x: spark.x + Math.cos(angle) * drift,
                y: spark.y + Math.sin(angle) * drift - Phaser.Math.FloatBetween(4, 16),
                alpha: 0,
                scale: 0.2,
                delay: sparkIndex * 18,
                duration: Phaser.Math.Between(220, 380),
                ease: 'Quad.easeOut',
                onComplete: () => {
                  if (!spark.destroyed) spark.destroy();
                }
              });
            }
          });
        };
        const getCenterCollectTarget = () => ({
          x: this.multiplierText?.x ?? this.houseSprite?.x ?? (GRID_OFFSET_X + (clientConfig.area.width * cellSize) / 2),
          y: this.multiplierText?.y ?? this.houseSprite?.y ?? (GRID_OFFSET_Y + (clientConfig.area.height * cellSize) / 2)
        });
        const collectTrailSpriteToCenter = (sprite, collectionMeta = null) => {
          if (!sprite || sprite.destroyed) return;
          const reel = Number(collectionMeta?.reel);
          const row = Number(collectionMeta?.row);
          const hasBoardPosition = Number.isFinite(reel) && Number.isFinite(row);
          const spriteSymbolId = this.getDisplayObjectSymbolId(sprite);
          if (isHuntFeatureSymbolId(spriteSymbolId) || isHuntFeatureSymbolId(sprite.symbolKey)) {
            if (hasBoardPosition) {
              if (!this.reelSprites[reel]) {
                this.reelSprites[reel] = [];
              }
              this.reelSprites[reel][row] = sprite;
            }
            return;
          }
          const collectTarget = getCenterCollectTarget();
          const collectableSymbolId = this.getCollectableBonusSymbolId(sprite.symbolKey);
          if (hasBoardPosition && this.reelSprites?.[reel]) {
            this.reelSprites[reel][row] = null;
          }
          if (this.currentAction === "freespinbananaHunt" && collectableSymbolId !== null && hasBoardPosition) {
            if (this.hasActionBonusCollectionAnimated({
              reel,
              row,
              symbol: collectableSymbolId
            })) {
              this.tweens.killTweensOf(sprite);
              this.clearReelSpriteReferencesForDisplayObject(sprite);
              this.destroyBananaBackplate(sprite);
              if (!sprite.destroyed) {
                sprite.destroy();
              }
              return;
            }
          }
          this.tweens.killTweensOf(sprite);
          this.clearReelSpriteReferencesForDisplayObject(sprite);
          sprite.isBeingDestroyed = true;
          this.destroyBananaBackplate(sprite);
          sprite.setDepth(DEPTH_HERO - 2);
          if (this.currentAction === "freespinbananaHunt" && collectableSymbolId !== null) {
            this.markActionBonusCollectionAnimated({
              reel,
              row,
              symbol: collectableSymbolId
            });
            if (hasBoardPosition && this.isBonusImmediateLowSymbol(collectableSymbolId)) {
              this.animateImmediateLowBonusPositionUpgrade(
                {
                  reel,
                  row,
                  symbol: collectableSymbolId,
                  immediatePositionUpgrade: true
                },
                sprite,
                collectableSymbolId
              );
              return;
            }
            if (!this.isBonusCenterMachineCollectableSymbol(collectableSymbolId)) {
              this.animateSpriteOutOfBonusCollection(sprite);
              return;
            }
            this.animateSpriteIntoBonusFruitPile(sprite, collectableSymbolId);
            return;
          }
          if (collectableSymbolId !== null && !this.isBonusCenterMachineCollectableSymbol(collectableSymbolId)) {
            this.animateSpriteOutOfBonusCollection(sprite);
            return;
          }
    
          this.tweens.add({
            targets: sprite,
            x: collectTarget.x,
            y: collectTarget.y,
            scale: Math.max(0.16, sprite.scaleX * 0.35),
            alpha: 0,
            angle: sprite.angle + Phaser.Math.Between(-80, 80),
            duration: 180,
            ease: 'Cubic.easeIn',
            onComplete: () => {
              if (!sprite.destroyed) {
                sprite.destroy();
              }
            }
          });
        };
        const resolveCollectTrailSpriteAtCell = (cell) => {
          if (!cell) return null;
          const reel = Number(cell.reel);
          const row = Number(cell.row);
          if (!Number.isFinite(reel) || !Number.isFinite(row)) return null;
    
          let sprite = this.reelSprites?.[reel]?.[row];
          if (sprite && sprite.destroyed) {
            sprite = null;
          }
          if (sprite) {
            if (isHuntFeatureSymbolId(this.getDisplayObjectSymbolId(sprite)) || isHuntFeatureSymbolId(sprite.symbolKey)) {
              return null;
            }
            return sprite;
          }
    
          const symbolId = this.getCollectableBonusSymbolId(cell?.wasSymbol);
          if (symbolId === null) {
            return null;
          }
    
          const { x, y } = getCellCenter(reel, row);
          const trailSprite = this.add.image(x, y, this.getBonusAwareSymbolTextureKey(symbolId))
            .setOrigin(0.5)
            .setScale(getSymbolScale(symbolId))
            .setDepth(DEPTH_SYMBOLS);
          trailSprite.symbolKey = symbolId;
          return trailSprite;
        };
        const resolveBananaSpriteAtCell = (reel, row) => {
          const numericReel = Number(reel);
          const numericRow = Number(row);
          if (!Number.isFinite(numericReel) || !Number.isFinite(numericRow)) return null;
    
          const tracked = this.reelSprites?.[numericReel]?.[numericRow];
          if (isBananaVisualSprite(tracked)) {
            return tracked;
          }
    
          const sceneChildren = this.children?.list;
          if (!Array.isArray(sceneChildren) || sceneChildren.length === 0) {
            return null;
          }
    
          const { x, y } = getCellCenter(numericReel, numericRow);
          const positionTolerance = Math.max(8, Math.floor(cellSize * 0.45));
          let resolved = null;
    
          sceneChildren.forEach((child) => {
            if (!isBananaVisualSprite(child)) return;
            if (!Number.isFinite(child.x) || !Number.isFinite(child.y)) return;
            if (Math.abs(child.x - x) > positionTolerance) return;
            if (Math.abs(child.y - y) > positionTolerance) return;
            if (!resolved || (child.depth ?? 0) >= (resolved.depth ?? 0)) {
              resolved = child;
            }
          });
    
          if (resolved) {
            if (!this.reelSprites[numericReel]) {
              this.reelSprites[numericReel] = [];
            }
            this.reelSprites[numericReel][numericRow] = resolved;
          }
    
          return resolved;
        };
    
        const cleanupLingeringProcessedBananas = () => {
          if (!Array.isArray(heroPath) || heroPath.length === 0) return;
    
          const mysteryId = clientConfig.symbolsMapping?.mystery || 14;
          const processedBananaCells = [];
    
          heroPath.forEach((pathStep) => {
            if (!pathStep?.banana) return;
            const reel = Number(pathStep.reel);
            const row = Number(pathStep.row);
            if (!Number.isFinite(reel) || !Number.isFinite(row)) return;
            const { x, y } = getCellCenter(reel, row);
            processedBananaCells.push({ reel, row, x, y });
          });
    
          processedBananaCells.forEach(({ reel, row }) => {
            const sprite = resolveBananaSpriteAtCell(reel, row);
            if (!isBananaVisualSprite(sprite)) return;
    
            const affected = affectedPositions.find((pos) => pos.reel === reel && pos.row === row);
            const shouldBecomeMystery =
              affected &&
              (affected.stepType === "mystery" || affected.stepType === "mysteryWild");
    
            if (shouldBecomeMystery) {
              const mysteryTexture = this.getMysteryTexture(affected.stepType);
              this.tweens.killTweensOf(sprite);
              this.destroyBananaBackplate(sprite);
              sprite.isBeingDestroyed = false;
              sprite.setTexture(mysteryTexture);
              sprite.symbolKey = mysteryId;
              sprite.setScale(normalScale);
              sprite.setDepth(DEPTH_SYMBOLS);
              sprite.setAlpha(1);
              sprite.setVisible(true);
              return;
            }
    
            this.tweens.killTweensOf(sprite);
            this.destroyBananaBackplate(sprite);
            sprite.destroy();
            if (this.reelSprites?.[reel]) {
              this.reelSprites[reel][row] = null;
            }
          });
    
          const sceneChildren = this.children?.list;
          if (!Array.isArray(sceneChildren) || sceneChildren.length === 0) return;
    
          const positionTolerance = Math.max(3, Math.floor(cellSize * 0.12));
          processedBananaCells.forEach((cell) => {
            const keeper = this.reelSprites?.[cell.reel]?.[cell.row];
            sceneChildren.forEach((child) => {
              if (child === keeper) return;
              if (!isBananaVisualSprite(child)) return;
              if (!Number.isFinite(child.x) || !Number.isFinite(child.y)) return;
              if (Math.abs(child.x - cell.x) > positionTolerance) return;
              if (Math.abs(child.y - cell.y) > positionTolerance) return;
    
              this.tweens.killTweensOf(child);
              this.destroyBananaBackplate(child);
              child.destroy();
            });
          });
        };
    
        if (!heroPath || heroPath.length === 0) return;
    
        const heroAlreadyPresent = this.heroSprite && !this.heroSprite.destroyed;
        const heroHasBoardAnchor =
          heroAlreadyPresent &&
          this.currentHeroAnchor &&
          Number.isFinite(Number(this.currentHeroAnchor.reel)) &&
          Number.isFinite(Number(this.currentHeroAnchor.row));
        const heroNeedsFreshEntrance = !heroHasBoardAnchor;
        const firstBananaIndex = heroPath.findIndex((step) => step?.banana);
        const pathStartIndex = (heroNeedsFreshEntrance && firstBananaIndex >= 0) ? firstBananaIndex : 0;
        const startStep = heroPath[pathStartIndex] || heroPath[0];
        if (heroAlreadyPresent) {
          this.heroSprite.setTexture(heroTexture);
          this.heroSprite.setScale(heroBaseScale);
        }
        
        // Find all banana positions in path for acceleration reset points
        const bananaIndices = heroPath.map((step, index) => step.banana ? index : -1).filter(i => i !== -1);
        
        // Count total bananas in path to identify the last one
        const totalBananas = heroPath.filter(step => step.banana).length;
        const mergeGunActivationsByPathIndex = new Map();
        const mergeGunCollectionKeysByPathIndex = new Map();
        const mergeGunActivationPickupKeysByPathIndex = new Map();
        const mergeGunCollectionsByPathIndex = new Map();
        const addCellKeyToPathIndexMap = (map, pathIndex, reel, row) => {
          const normalizedPathIndex = Math.floor(Number(pathIndex));
          const normalizedReel = Math.floor(Number(reel));
          const normalizedRow = Math.floor(Number(row));
          if (
            !Number.isFinite(normalizedPathIndex) ||
            !Number.isFinite(normalizedReel) ||
            !Number.isFinite(normalizedRow)
          ) {
            return;
          }
          if (!map.has(normalizedPathIndex)) {
            map.set(normalizedPathIndex, new Set());
          }
          map.get(normalizedPathIndex).add(`${normalizedReel},${normalizedRow}`);
        };
        mergeGunFeatureCollections.forEach((entry, index) => {
          const pathIndex = Math.floor(Number(entry?.pathIndex));
          if (!Number.isFinite(pathIndex)) return;
          if (!mergeGunCollectionsByPathIndex.has(pathIndex)) {
            mergeGunCollectionsByPathIndex.set(pathIndex, []);
          }
          mergeGunCollectionsByPathIndex.get(pathIndex).push({
            ...entry,
            _collectionIndex: index
          });
          addCellKeyToPathIndexMap(mergeGunCollectionKeysByPathIndex, pathIndex, entry?.reel, entry?.row);
        });
        mergeGunActivations.forEach((activation, index) => {
          const pathIndex = Math.floor(Number(activation?.pathIndex));
          if (!Number.isFinite(pathIndex)) return;
          if (!mergeGunActivationsByPathIndex.has(pathIndex)) {
            mergeGunActivationsByPathIndex.set(pathIndex, []);
          }
          mergeGunActivationsByPathIndex.get(pathIndex).push({
            ...activation,
            _activationIndex: index
          });
          const pickupReel = Math.floor(Number(activation?.pickupReel ?? activation?.sourceReel));
          const pickupRow = Math.floor(Number(activation?.pickupRow ?? activation?.sourceRow));
          if (Number.isFinite(pickupReel) && Number.isFinite(pickupRow)) {
            addCellKeyToPathIndexMap(mergeGunCollectionKeysByPathIndex, pathIndex, pickupReel, pickupRow);
            addCellKeyToPathIndexMap(mergeGunActivationPickupKeysByPathIndex, pathIndex, pickupReel, pickupRow);
          }
        });
        const bonusMysteryCollectionsByPathIndex = new Map();
        const bonusMysteryCollectionKeysByPathIndex = new Map();
        bonusMysteryFeatureCollections.forEach((entry, index) => {
          const pathIndex = Math.floor(Number(entry?.pathIndex));
          if (!Number.isFinite(pathIndex)) return;
          if (!bonusMysteryCollectionsByPathIndex.has(pathIndex)) {
            bonusMysteryCollectionsByPathIndex.set(pathIndex, []);
          }
          bonusMysteryCollectionsByPathIndex.get(pathIndex).push({
            ...entry,
            _collectionIndex: index
          });
          const reel = Math.floor(Number(entry?.reel));
          const row = Math.floor(Number(entry?.row));
          if (Number.isFinite(reel) && Number.isFinite(row)) {
            if (!bonusMysteryCollectionKeysByPathIndex.has(pathIndex)) {
              bonusMysteryCollectionKeysByPathIndex.set(pathIndex, new Set());
            }
            bonusMysteryCollectionKeysByPathIndex.get(pathIndex).add(`${reel},${row}`);
          }
        });
        const lightningBeeCollectionsByPathIndex = new Map();
        const lightningBeeCollectionKeysByPathIndex = new Map();
        lightningBeeFeatureCollections.forEach((entry, index) => {
          const pathIndex = Math.floor(Number(entry?.pathIndex));
          if (!Number.isFinite(pathIndex)) return;
          if (!lightningBeeCollectionsByPathIndex.has(pathIndex)) {
            lightningBeeCollectionsByPathIndex.set(pathIndex, []);
          }
          lightningBeeCollectionsByPathIndex.get(pathIndex).push({
            ...entry,
            _collectionIndex: index
          });
          const reel = Math.floor(Number(entry?.reel));
          const row = Math.floor(Number(entry?.row));
          if (Number.isFinite(reel) && Number.isFinite(row)) {
            if (!lightningBeeCollectionKeysByPathIndex.has(pathIndex)) {
              lightningBeeCollectionKeysByPathIndex.set(pathIndex, new Set());
            }
            lightningBeeCollectionKeysByPathIndex.get(pathIndex).add(`${reel},${row}`);
          }
        });
        const getFeatureCollectionKeysForPathIndex = (pathIndex) => {
          const keySet = new Set();
          const mergeKeys = mergeGunCollectionKeysByPathIndex.get(Math.floor(Number(pathIndex)));
          const mysteryKeys = bonusMysteryCollectionKeysByPathIndex.get(Math.floor(Number(pathIndex)));
          const beeKeys = lightningBeeCollectionKeysByPathIndex.get(Math.floor(Number(pathIndex)));
          mergeKeys?.forEach?.((key) => keySet.add(key));
          mysteryKeys?.forEach?.((key) => keySet.add(key));
          beeKeys?.forEach?.((key) => keySet.add(key));
          return keySet;
        };
        const allFeatureCollectionKeys = new Set();
        mergeGunCollectionKeysByPathIndex.forEach((keys) => {
          keys?.forEach?.((key) => allFeatureCollectionKeys.add(key));
        });
        bonusMysteryCollectionKeysByPathIndex.forEach((keys) => {
          keys?.forEach?.((key) => allFeatureCollectionKeys.add(key));
        });
        lightningBeeCollectionKeysByPathIndex.forEach((keys) => {
          keys?.forEach?.((key) => allFeatureCollectionKeys.add(key));
        });
        const shouldPreserveHuntFeatureCell = (cell = null) => {
          const reel = Math.floor(Number(cell?.reel));
          const row = Math.floor(Number(cell?.row));
          if (!Number.isFinite(reel) || !Number.isFinite(row)) return false;
    
          const key = `${reel},${row}`;
          if (allFeatureCollectionKeys.has(key)) {
            return true;
          }
    
          const tracked = this.reelSprites?.[reel]?.[row];
          return isHuntFeatureSymbolId(cell?.wasSymbol) ||
            isHuntFeatureSymbolId(this.getDisplayObjectSymbolId(tracked)) ||
            isHuntFeatureSymbolId(tracked?.symbolKey);
        };
        const hasFeatureActivationForPathIndex = (pathIndex) => {
          const normalizedPathIndex = Math.floor(Number(pathIndex));
          if (!Number.isFinite(normalizedPathIndex)) return false;
          return mergeGunActivationsByPathIndex.has(normalizedPathIndex) ||
            bonusMysteryCollectionsByPathIndex.has(normalizedPathIndex) ||
            lightningBeeCollectionsByPathIndex.has(normalizedPathIndex);
        };
    
        // Detect if fighting a 3x3 troll (9 bananas with symbol id 13)
        const is3x3Troll = totalBananas === 9 && heroPath.filter(step => step.banana).every((step) => {
          const sprite = this.reelSprites[step.reel]?.[step.row];
          // Check if sprite has symbol id 13 (troll) or has the isTroll3x3 flag
          return sprite && (sprite.symbolKey === 13 || sprite.isTroll3x3);
        });
        
        // Speed multiplier for troll attacks (much faster)
        const trollAttackSpeedMultiplier = 0.3; // 70% faster
        
        // Troll combat - create attack storm before final blow
        if (is3x3Troll && totalBananas > 0) {
          // HERO REAPPEARS for the attack!
          if (this.heroSprite) {
            this.heroSprite.setAlpha(1);
            this.heroSprite.setScale(heroBaseScale);
          }
          
          // Get first banana position for attack storm center
          const firstBananaStep = heroPath.find(step => step.banana);
          if (firstBananaStep) {
            const trollCenterX = firstBananaStep.reel * cellSize + cellSize / 2 + GRID_OFFSET_X;
            const trollCenterY = (clientConfig.area.height - 1 - firstBananaStep.row) * cellSize + cellSize / 2 + GRID_OFFSET_Y;
            
            // Play swing sounds during storm
            const swingSound = weapon === 'axe' ? 'attack_swing_axe' : 'attack_swing';
            for (let s = 0; s < 3; s++) {
              setTimeout(() => {
                this.playSfx(swingSound, { volume: 0.25 });
              }, s * 200);
            }
            
            // Create attack storm effect - rapid slashes and hero blur
            const stormPromise = this.createAttackStorm(trollCenterX, trollCenterY, heroPath, weapon);
            
            // Drop gold piles and multiplier orbs DURING the storm
            const trollBananaSteps = heroPath.filter(step => step.banana);
            
            // Green colors for multiplier orbs (matching regular orbs)
            const multiplierOrbColors = [0x00D1CE, 0x1EFF90]; // Turquoise Green, Emerald Green
            const orbSize = 8;
            const orbFallDuration = 400;
            const orbSuckDuration = 600;
            
            // Drop all orbs from all troll bananas during storm (blue/white multiplier orbs)
            trollBananaSteps.forEach((bananaStep, idx) => {
              if (bananaStep.orbs && bananaStep.orbs > 0) {
                setTimeout(() => {
                  const zx = bananaStep.reel * cellSize + cellSize / 2 + GRID_OFFSET_X;
                  const zy = (clientConfig.area.height - 1 - bananaStep.row) * cellSize + cellSize / 2 + GRID_OFFSET_Y;
                  this.dropEnergyOrbs(zx, zy, bananaStep.orbs, orbSize, multiplierOrbColors, orbFallDuration, orbSuckDuration);
                }, idx * 100);
              }
            });
            
            // Drop all gold piles from all troll bananas during storm
            trollBananaSteps.forEach((bananaStep, idx) => {
              if (bananaStep.goldpile && bananaStep.goldpile.value > 0) {
                setTimeout(() => {
                  const zx = bananaStep.reel * cellSize + cellSize / 2 + GRID_OFFSET_X;
                  const zy = (clientConfig.area.height - 1 - bananaStep.row) * cellSize + cellSize / 2 + GRID_OFFSET_Y;
                  this.dropGoldPile(zx, zy, bananaStep.goldpile.value, bananaStep.goldpile.tier);
                }, idx * 120 + 200);
              }
            });
            
            // Wait for storm to complete
            await stormPromise;
            
            // NOW play finisher sound for the final blow
            if (weapon === 'axe') {
              this.playSfx('finisher_axe', { volume: 0.56 });
            } else if (weapon === 'sword') {
              this.playSfx('finisher_sword', { volume: 0.56 });
            } else if (weapon === 'staff') {
              this.playSfx('finisher_staff', { volume: 0.56 });
            }
          }
        }
        
        const getHuntSpeedMultiplier = (pathStep = null, { afterStep = false } = {}) => {
          const rawStepStage = Number(pathStep?.bonusStage);
          const stepStage = Number.isFinite(rawStepStage)
            ? Math.max(0, Math.floor(rawStepStage))
            : visualBonusStage;
          const stepFootprintSize = Math.max(
            1,
            Math.floor(Number(pathStep?.footprintSizeAfterGrowth ?? pathStep?.footprintSize ?? heroFootprintSize) || 1)
          );
          const hasExplicitRushState = typeof pathStep?.rushActive === "boolean";
          const stepRushActive = hasExplicitRushState
            ? pathStep.rushActive === true
            : (rushActive === true || stepStage >= 3);
          const effectiveRushActive = stepRushActive
            || (afterStep && (pathStep?.rushActivated === true || stepStage >= 3));
    
          if (!effectiveRushActive) return 1;
          if (stepStage >= 5 || stepFootprintSize >= 3) return 0.82;
          if (stepStage >= 4 || stepFootprintSize >= 2) return 0.84;
          return 0.88;
        };
        
        const getMainGameRoundStartCenter = () => ({
          x: GRID_OFFSET_X + (clientConfig.area.width * cellSize) / 2,
          y: GRID_OFFSET_Y + (clientConfig.area.height * cellSize) / 2
        });

        // Entry start position is first banana on fresh hunts, otherwise regular path start.
        const startPos = startStep;
        this.currentHeroAnchor = {
          reel: Number(startPos?.reel || 0),
          row: Number(startPos?.row || 0)
        };
        const startCenter = getHeroAnchorCenter(startPos.reel, startPos.row, heroFootprintSize);
        const startX = startCenter.x;
        const startY = startCenter.y;
        const startBananaTargets = Array.isArray(startStep?.eatenBananas) && startStep.eatenBananas.length > 0
          ? startStep.eatenBananas
          : (startStep?.banana ? [{ reel: startStep.reel, row: startStep.row, orbs: Number(startStep?.orbs || 0) }] : []);
        const startHasBanana = startBananaTargets.length > 0;
        const startOrbs = startBananaTargets.reduce((sum, banana) => sum + Number(banana?.orbs || 0), 0);
        let startBananaVisualResolved = false;
        let startBananaOrbsDropped = false;
        const startFeatureCollectionKeys = getFeatureCollectionKeysForPathIndex(pathStartIndex);
        const startCellKey = `${Math.floor(Number(startPos?.reel))},${Math.floor(Number(startPos?.row))}`;
        const startBananaMeterArrivalPromises = [];
        const startWaitsForBananaUpgrade = startHasBanana && doesStepTriggerBananaUpgrade(startStep);
        const startHasFeatureActivation = hasFeatureActivationForPathIndex(pathStartIndex);
        const startSkipsImpactSlowMo = startWaitsForBananaUpgrade || startHasFeatureActivation;

        const playEntryImpactFx = async (x, y, { heavenHellEntry = false } = {}) => {
          if (heavenHellEntry) {
            this.playSfx?.("lightning_at_lvl_up", { volume: 0.52 });
            this.playSfx?.("wins_explode", { volume: 0.4 });
            this.cameras?.main?.shake?.(300, 0.013);
    
            const shockFlash = this.add.circle(x, y, 42, 0xFFF0B5, 0.9)
              .setDepth(DEPTH_HERO + 6)
              .setBlendMode(Phaser.BlendModes.ADD)
              .setScale(0.4);
            const shockRing = this.add.circle(x, y, 56, 0xFFB84A, 0.22)
              .setDepth(DEPTH_HERO + 5)
              .setStrokeStyle(12, 0xFFE29A, 0.82)
              .setBlendMode(Phaser.BlendModes.ADD)
              .setScale(0.35);
    
            this.tweens.add({
              targets: shockFlash,
              scale: 3.6,
              alpha: 0,
              duration: 260,
              ease: "Cubic.easeOut",
              onComplete: () => shockFlash.destroy()
            });
            this.tweens.add({
              targets: shockRing,
              scale: 2.9,
              alpha: 0,
              duration: 420,
              ease: "Cubic.easeOut",
              onComplete: () => shockRing.destroy()
            });
    
            void this.playMonkeyLevelUpRingBurst(null, {
              heroFootprintSize,
              intensity: "major",
              preferHeroSprite: true,
              durationMs: 760,
              radialScale: 1.08
            }).catch(() => {});
          }
    
          const entryFlash = this.add.circle(x, y, 50, 0xFFFFFF)
            .setAlpha(0.35)
            .setDepth(DEPTH_HERO - 1);
          this.tweens.add({
            targets: entryFlash,
            alpha: 0,
            scale: 2.4,
            duration: 320,
            ease: 'Power2.easeOut',
            onComplete: () => entryFlash.destroy()
          });
    
          for (let i = 0; i < 10; i++) {
            const angle = (i / 10) * Math.PI * 2;
            const dust = this.add.circle(
              x + Math.cos(angle) * 8,
              y + Math.sin(angle) * 8,
              Math.random() * 3 + 1.5,
              0x888888
            ).setAlpha(0.45).setDepth(DEPTH_HERO - 1);
            this.tweens.add({
              targets: dust,
              x: dust.x + Math.cos(angle) * 34,
              y: dust.y + Math.sin(angle) * 34,
              alpha: 0,
              duration: 360,
              ease: 'Power2.easeOut',
              onComplete: () => dust.destroy()
            });
          }
    
          await new Promise((resolve) => {
            this.tweens.add({
              targets: this.heroSprite,
              scale: heroBaseScale * 1.16,
              duration: 120,
              yoyo: true,
              ease: 'Back.easeOut',
              onComplete: resolve
            });
          });
        };
    
        const runLinearFlightEntrance = async () => {
          const isMainGameFreshHunt = !isHeavenHellBonusHunt;
          const roundStartCenter = getMainGameRoundStartCenter();
          let entryX = isMainGameFreshHunt ? roundStartCenter.x : -110;
          let entryY = isMainGameFreshHunt ? roundStartCenter.y : startY + Phaser.Math.Between(-40, 40);
          let duration = isMainGameFreshHunt ? 260 : 430;
          let ease = isMainGameFreshHunt ? 'Cubic.easeInOut' : 'Cubic.easeOut';
          let entryScale = heroBaseScale;
          let entryTexture = heroTexture;

          if (isHeavenHellBonusHunt && firstHeavenHellBonusEntryAttack) {
            entryX = startX + Phaser.Math.Between(-14, 14);
            entryY = -170;
            duration = 250;
            ease = 'Cubic.easeIn';
            entryScale = heroBaseScale * 0.7;
            entryTexture = getHeroTexture(weapon, {
              footprintSize: heroFootprintSize,
              rushActive: true,
              bonusStage: visualBonusStage
            });
          } else if (!isMainGameFreshHunt) {
            const width = this.scale?.width || 600;
            const sideRoll = Math.random();
            if (sideRoll >= 0.4 && sideRoll < 0.8) {
              entryX = width + 110;
              entryY = startY + Phaser.Math.Between(-40, 40);
            } else if (sideRoll >= 0.8) {
              entryX = startX + Phaser.Math.Between(-90, 90);
              entryY = -110;
            }
          }

          if (this.heroSprite && !this.heroSprite.destroyed) {
            this.tweens.killTweensOf(this.heroSprite);
            this.heroSprite
              .setTexture(entryTexture)
              .setOrigin(0.5)
              .setScale(entryScale)
              .setDepth(DEPTH_HERO)
              .setAlpha(1)
              .setVisible(true)
              .setPosition(entryX, entryY);
          } else {
            this.heroSprite = this.add.image(entryX, entryY, entryTexture)
              .setOrigin(0.5)
              .setScale(entryScale)
              .setDepth(DEPTH_HERO)
              .setAlpha(1);
          }
    
          if (isHeavenHellBonusHunt && firstHeavenHellBonusEntryAttack) {
            this.startAngelMovementLightEmitter({ tint: 0xFFE39C, intervalMs: 12, burstScale: 1.12 });
            this.spawnHeavenHellChargeLaunchTrails(entryX, entryY, startX, startY, {
              heroScale: entryScale
            });
          }
    
          await new Promise((resolve) => {
            this.tweens.add({
              targets: this.heroSprite,
              x: startX,
              y: startY,
              duration,
              ease,
              onComplete: resolve
            });
          });
          if (isHeavenHellBonusHunt && firstHeavenHellBonusEntryAttack) {
            this.stopAngelMovementLightEmitter();
            this.heroSprite.setTexture(heroTexture);
            this.heroSprite.setScale(heroBaseScale);
          }
          this.currentHeroAnchor = {
            reel: Number(startPos?.reel || 0),
            row: Number(startPos?.row || 0)
          };
          this.heroSprite.setPosition(startX, startY);
          await playEntryImpactFx(startX, startY, {
            heavenHellEntry: isHeavenHellBonusHunt && firstHeavenHellBonusEntryAttack
          });
        };
    
        const getDirectFlightDuration = (fromX, fromY, targetX, targetY, quickStop = false, { chargeLaunch = false } = {}) => {
          if (quickStop) return 1;
          if (chargeLaunch) {
            const distance = Phaser.Math.Distance.Between(fromX, fromY, targetX, targetY);
            return Math.max(28 * huntSpeedFactor, Math.min(88 * huntSpeedFactor, 24 * huntSpeedFactor + distance * 0.16));
          }
          const distance = Phaser.Math.Distance.Between(fromX, fromY, targetX, targetY);
          const base = Math.max(
            95 * huntSpeedFactor,
            Math.min(220 * huntSpeedFactor, 82 * huntSpeedFactor + distance * 0.55)
          );
          return applyMomentumToDuration(base);
        };
    
        const moveHeroLinearlyToTarget = async (targetX, targetY, duration, ease = 'Power3.easeIn', { featureApproach = false } = {}) => {
          if (!this.heroSprite || this.heroSprite.destroyed) return;
          this.syncHeavenHellLootSpriteDepths(isHeavenHellBonusHunt ? "behindDemons" : false);
          this.heroSprite.setDepth?.(DEPTH_HERO);
          const safeDuration = Math.max(1, Number(duration) || 1);
          const shouldUseFeatureApproach = featureApproach && safeDuration > 90;
          const shouldEmitLightTrail = safeDuration > 30;
          if (shouldEmitLightTrail) {
            this.startAngelMovementLightEmitter({
              tint: ease === 'Cubic.easeIn' ? 0xFFF3B2 : 0xFFD85C,
              intervalMs: safeDuration <= 70 ? 12 : 18,
              burstScale: safeDuration <= 70 ? 1.15 : 0.95
            });
          }
    
          try {
            if (!shouldUseFeatureApproach) {
              await new Promise((resolve) => {
                this.tweens.add({
                  targets: this.heroSprite,
                  x: targetX,
                  y: targetY,
                  duration: safeDuration,
                  ease,
                  onComplete: resolve
                });
              });
              return;
            }
    
            const startMoveX = this.heroSprite.x;
            const startMoveY = this.heroSprite.y;
            const anticipationRatio = 0.92;
            const cueX = startMoveX + (targetX - startMoveX) * anticipationRatio;
            const cueY = startMoveY + (targetY - startMoveY) * anticipationRatio;
            const rushDuration = Math.max(1, safeDuration * anticipationRatio);
            const anticipationDuration = Math.min(58, Math.max(18, safeDuration * 0.1));
    
            await new Promise((resolve) => {
              this.tweens.add({
                targets: this.heroSprite,
                x: cueX,
                y: cueY,
                duration: rushDuration,
                ease,
                onComplete: resolve
              });
            });
    
            await new Promise((resolve) => {
              this.tweens.add({
                targets: this.heroSprite,
                x: targetX,
                y: targetY,
                duration: anticipationDuration,
                ease: 'Sine.easeInOut',
                onComplete: resolve
              });
            });
          } finally {
            if (shouldEmitLightTrail) {
              this.stopAngelMovementLightEmitter();
            }
          }
        };

        const buildDivineStrikeApproachPlan = (fromX, fromY, targetX, targetY, totalDuration, { chargeLaunch = false } = {}) => {
          const totalDistance = Phaser.Math.Distance.Between(fromX, fromY, targetX, targetY);
          if (!Number.isFinite(totalDistance) || totalDistance <= 1) {
            return null;
          }

          let releaseDistance = Phaser.Math.Clamp(
            totalDistance * (chargeLaunch ? 0.12 : 0.09),
            chargeLaunch ? 14 : 10,
            chargeLaunch ? 32 : 24
          );
          let slowDistance = Phaser.Math.Clamp(
            totalDistance * (chargeLaunch ? 0.38 : 0.3),
            chargeLaunch ? 28 : 20,
            chargeLaunch ? 120 : 86
          );
          const maxReservedDistance = Math.max(0, totalDistance - 2);

          if (slowDistance + releaseDistance > maxReservedDistance) {
            const scale = maxReservedDistance / Math.max(1, slowDistance + releaseDistance);
            slowDistance *= scale;
            releaseDistance *= scale;
          }

          const preSlowDistance = Math.max(0, totalDistance - slowDistance - releaseDistance);
          const unitX = (targetX - fromX) / totalDistance;
          const unitY = (targetY - fromY) / totalDistance;
          const slowStart = {
            x: fromX + unitX * preSlowDistance,
            y: fromY + unitY * preSlowDistance
          };
          const releaseStart = {
            x: targetX - unitX * releaseDistance,
            y: targetY - unitY * releaseDistance
          };
          const safeTotalDuration = Math.max(1, Number(totalDuration) || 1);
          const preSlowDuration = preSlowDistance > 1
            ? Math.max(1, safeTotalDuration * (preSlowDistance / totalDistance))
            : 0;
          const releaseDuration = releaseDistance > 1
            ? Math.max(
                18 * huntSpeedFactor,
                Math.min(
                  (chargeLaunch ? 68 : 56) * huntSpeedFactor,
                  (chargeLaunch ? 12 : 10) * huntSpeedFactor + releaseDistance * (chargeLaunch ? 0.34 : 0.28)
                )
              )
            : 0;

          return {
            slowStart,
            releaseStart,
            preSlowDuration,
            slowSegmentSceneDuration: Math.max(1, DIVINE_STRIKE_SLOWMO_REAL_MS * DIVINE_STRIKE_SLOWMO_FACTOR),
            releaseDuration
          };
        };

        const moveHeroThroughDivineStrikeSlowMo = async (
          step,
          targetX,
          targetY,
          totalDuration,
          {
            chargeLaunch = false,
            featureApproach = false
          } = {}
        ) => {
          if (!this.heroSprite || this.heroSprite.destroyed) return;

          const fromX = Number(this.heroSprite.x || targetX);
          const fromY = Number(this.heroSprite.y || targetY);
          const plan = buildDivineStrikeApproachPlan(fromX, fromY, targetX, targetY, totalDuration, { chargeLaunch });

          if (!plan) {
            await this.playHeavenHellDivineStrikeAnticipation?.(
              step,
              { x: targetX, y: targetY },
              {
                stepQuickStop: false,
                durationMs: DIVINE_STRIKE_SLOWMO_REAL_MS,
                impactLeadMs: DIVINE_STRIKE_SLOWMO_REAL_MS,
                slowMoFactor: DIVINE_STRIKE_SLOWMO_FACTOR
              }
            );
            this.heroSprite.setPosition(targetX, targetY);
            return;
          }

          if (plan.preSlowDuration > 0) {
            await moveHeroLinearlyToTarget(
              plan.slowStart.x,
              plan.slowStart.y,
              plan.preSlowDuration,
              chargeLaunch ? 'Cubic.easeIn' : 'Power2.easeIn',
              { featureApproach }
            );
          }

          const slowApproachPromise = moveHeroLinearlyToTarget(
            plan.releaseStart.x,
            plan.releaseStart.y,
            plan.slowSegmentSceneDuration,
            chargeLaunch ? 'Cubic.easeIn' : 'Sine.easeInOut'
          );

          await this.playHeavenHellDivineStrikeAnticipation?.(
            step,
            { x: targetX, y: targetY },
            {
              stepQuickStop: false,
              durationMs: DIVINE_STRIKE_SLOWMO_REAL_MS,
              impactLeadMs: DIVINE_STRIKE_SLOWMO_REAL_MS + plan.releaseDuration,
              slowMoFactor: DIVINE_STRIKE_SLOWMO_FACTOR
            }
          );
          await slowApproachPromise;

          if (plan.releaseDuration > 0) {
            await moveHeroLinearlyToTarget(
              targetX,
              targetY,
              plan.releaseDuration,
              chargeLaunch ? 'Cubic.easeIn' : 'Power2.easeIn'
            );
            return;
          }

          this.heroSprite.setPosition(targetX, targetY);
        };

        const applySkippedTrailState = (endExclusive) => {
          if (!Number.isFinite(endExclusive) || endExclusive <= 0) return;
          if (is3x3Troll) return;
    
          for (let idx = 0; idx < endExclusive; idx++) {
            const skippedStep = heroPath[idx];
            if (!skippedStep) continue;
            const skippedAffected = affectedPositions.find(
              (pos) => pos.reel === skippedStep.reel && pos.row === skippedStep.row
            );
            if (!skippedAffected) continue;
    
            const reel = skippedStep.reel;
            const row = skippedStep.row;
            const skippedFeatureCollectionKeys = getFeatureCollectionKeysForPathIndex(idx);
            if (skippedFeatureCollectionKeys.has(`${reel},${row}`)) {
              continue;
            }
            if (shouldPreserveHuntFeatureCell(skippedAffected)) {
              continue;
            }
            const x = reel * cellSize + cellSize / 2 + GRID_OFFSET_X;
            const y = (clientConfig.area.height - 1 - row) * cellSize + cellSize / 2 + GRID_OFFSET_Y;
            let skippedSprite = resolveBananaSpriteAtCell(reel, row) || resolveCollectTrailSpriteAtCell(skippedAffected) || this.reelSprites?.[reel]?.[row];
    
            if (skippedAffected.stepType === "mystery" || skippedAffected.stepType === "mysteryWild") {
              const mysteryId = clientConfig.symbolsMapping?.mystery || 14;
              const mysteryTexture = this.getMysteryTexture(skippedAffected.stepType);
              if (!skippedSprite || skippedSprite.destroyed) {
                skippedSprite = this.add.image(x, y, mysteryTexture)
                  .setOrigin(0.5)
                  .setScale(normalScale)
                  .setDepth(DEPTH_SYMBOLS);
                skippedSprite.symbolKey = mysteryId;
                if (!this.reelSprites[reel]) this.reelSprites[reel] = [];
                this.reelSprites[reel][row] = skippedSprite;
              } else {
                skippedSprite.setTexture(mysteryTexture);
                skippedSprite.symbolKey = mysteryId;
                skippedSprite.setScale(normalScale);
                skippedSprite.setDepth(DEPTH_SYMBOLS);
                skippedSprite.setPosition(x, y);
                skippedSprite.setAlpha(1);
              }
              continue;
            }
    
            if (rushActive && skippedSprite && !skippedSprite.destroyed) {
              this.reelSprites[reel][row] = null;
              collectTrailSpriteToCenter(skippedSprite, skippedAffected);
              continue;
            }
    
            if (skippedSprite && !skippedSprite.destroyed) {
              this.tweens.killTweensOf(skippedSprite);
              this.destroyBananaBackplate(skippedSprite);
              skippedSprite.destroy();
            }
            if (this.reelSprites[reel]) {
              this.reelSprites[reel][row] = null;
            }
          }
        };
        const playInlineMergeGunActivations = async (pathIndex) => {
          const activationsForStep = mergeGunActivationsByPathIndex.get(Math.floor(Number(pathIndex)));
          if (!Array.isArray(activationsForStep) || activationsForStep.length === 0) {
            return;
          }
    
          if (this.heroSprite && !this.heroSprite.destroyed) {
            this.tweens.killTweensOf(this.heroSprite);
            this.heroSprite.setScale(heroBaseScale * 1.06);
            await this.waitForPresentation(70, { skippable: true });
            this.heroSprite.setScale(heroBaseScale);
          }
    
          await this.playMergeGunActivations(activationsForStep, mergeGunAreas);
          mergeGunActivationsByPathIndex.delete(Math.floor(Number(pathIndex)));
        };
        const playInlineMergeGunCollections = async (pathIndex) => {
          const normalizedPathIndex = Math.floor(Number(pathIndex));
          const entriesForStep = mergeGunCollectionsByPathIndex.get(normalizedPathIndex);
          if (!Array.isArray(entriesForStep) || entriesForStep.length === 0) {
            return;
          }
    
          const activationPickupKeys = mergeGunActivationPickupKeysByPathIndex.get(normalizedPathIndex) || new Set();
          const sortedEntries = [...entriesForStep].sort((left, right) => (
            Number(left?._collectionIndex || 0) - Number(right?._collectionIndex || 0)
          ));
          for (const entry of sortedEntries) {
            const reel = Math.floor(Number(entry?.reel));
            const row = Math.floor(Number(entry?.row));
            if (!Number.isFinite(reel) || !Number.isFinite(row)) continue;
            if (activationPickupKeys.has(`${reel},${row}`)) continue;
    
            const source = this.getGridCellCenter(reel, row);
            const heldGun = await this.moveMergeGunIntoHeroHands({
              pickupReel: reel,
              pickupRow: row,
              sourceReel: entry?.sourceReel ?? reel,
              sourceRow: entry?.sourceRow ?? row
            }, source);
            if (heldGun && !heldGun.destroyed) {
              await this.waitForPresentation(80, { skippable: true });
              await this.dismissHeldMergeGun(heldGun);
            } else {
              this.removeMergeGunFeatureSymbolAt(reel, row);
            }
          }
    
          mergeGunCollectionsByPathIndex.delete(normalizedPathIndex);
        };
        const playInlineBonusMysteryCollections = async (pathIndex) => {
          const entriesForStep = bonusMysteryCollectionsByPathIndex.get(Math.floor(Number(pathIndex)));
          if (!Array.isArray(entriesForStep) || entriesForStep.length === 0) {
            return;
          }
    
          const sortedEntries = [...entriesForStep].sort((left, right) => (
            Number(left?._collectionIndex || 0) - Number(right?._collectionIndex || 0)
          ));
          for (const entry of sortedEntries) {
            await this.playBonusMysteryFeatureCollection(entry);
          }
          bonusMysteryCollectionsByPathIndex.delete(Math.floor(Number(pathIndex)));
        };
        const playInlineLightningBeeCollections = async (pathIndex) => {
          const entriesForStep = lightningBeeCollectionsByPathIndex.get(Math.floor(Number(pathIndex)));
          if (!Array.isArray(entriesForStep) || entriesForStep.length === 0) {
            return;
          }
    
          const sortedEntries = [...entriesForStep].sort((left, right) => (
            Number(left?._collectionIndex || 0) - Number(right?._collectionIndex || 0)
          ));
          for (const entry of sortedEntries) {
            await this.playLightningBeeFeatureCollection(entry);
          }
          lightningBeeCollectionsByPathIndex.delete(Math.floor(Number(pathIndex)));
        };
        const playSkippedInlineFeatureCollections = async (endExclusive) => {
          if (!Number.isFinite(endExclusive) || endExclusive <= 0) return;
          for (let idx = 0; idx < endExclusive; idx++) {
            await playInlineMergeGunActivations(idx);
            await playInlineMergeGunCollections(idx);
            await playInlineBonusMysteryCollections(idx);
            await playInlineLightningBeeCollections(idx);
          }
        };
    
        if (heroNeedsFreshEntrance) {
          // FRESH ENTRANCE - direct linear flight into the board.
          if (this.heroSprite && this.heroSprite.destroyed) {
            this.heroSprite = null;
          }
          await runLinearFlightEntrance();
    
          // If we started directly on first banana, apply prior trail state instantly.
          if (pathStartIndex > 0) {
            applySkippedTrailState(pathStartIndex);
            await playSkippedInlineFeatureCollections(pathStartIndex);
          }
    
          // Handle starting position symbol (right after hero lands)
          const startAffected = affectedPositions.find(pos => pos.reel === startPos.reel && pos.row === startPos.row);
          
          // Increment bananas encountered if starting position is a banana
          if (startHasBanana) {
            trackBananaMeterArrival(registerBananaEncounter(startX, startY), startBananaMeterArrivalPromises);
          }
          
          if (
            startAffected &&
            !is3x3Troll &&
            !startFeatureCollectionKeys.has(startCellKey) &&
            !shouldPreserveHuntFeatureCell(startAffected)
          ) {
            let startSprite = startHasBanana
              ? resolveBananaSpriteAtCell(startPos.reel, startPos.row)
              : this.reelSprites[startPos.reel]?.[startPos.row];
            
            if (startAffected.stepType === "mystery" || startAffected.stepType === "mysteryWild") {
              // MYSTERY/MYSTERYWILD STEP - Ensure a mystery sprite exists at starting position
              const mysteryId = clientConfig.symbolsMapping?.mystery || 14;
              const mysteryTexture = this.getMysteryTexture(startAffected.stepType);
              
              // If no sprite exists (hero starting position), CREATE one
              if (!startSprite || startSprite.destroyed) {
                startSprite = this.add.image(startX, startY, mysteryTexture)
                  .setOrigin(0.5)
                  .setScale(normalScale)
                  .setDepth(DEPTH_SYMBOLS);
                startSprite.symbolKey = mysteryId;
                
                // Initialize reelSprites row if needed
                if (!this.reelSprites[startPos.reel]) {
                  this.reelSprites[startPos.reel] = [];
                }
                this.reelSprites[startPos.reel][startPos.row] = startSprite;
              }
              // If sprite exists, leave it for now - transformation happens in movement loop
              
              // Drop orbs if starting position was a banana with orbs
              if (startHasBanana && startOrbs > 0) {
                // Blood splash for banana (temporary particles)
                this.createBloodSplash(startX, startY);
                // Persistent blood splatter that stays on scene
                this.createBloodSplatter(startX, startY);
                 
                // Drop orbs
                this.dropEnergyOrbs(startX, startY, startOrbs, orbSize, orbColors, orbFallDuration, orbSuckDuration);
                startBananaOrbsDropped = true;
              }
              if (startHasBanana) {
                startBananaVisualResolved = true;
              }
            } else {
              // DESTROY STEP - Destroy starting position
              if (startSprite && !startSprite.destroyed) {
                if (startHasBanana) {
                  // Banana at starting position - remove immediately on contact.
                  if (shouldUseHellDiveStartDeathFx()) {
                    const divineXKillWeight = startStep?.divineXProc === true
                      ? Math.max(1, Number(this.getHeavenHellKillWeightForCell?.(startPos.reel, startPos.row, heavenHellGameState) || 1)) * 2
                      : null;
                    this.playHeavenHellDemonDeathFx(startPos.reel, startPos.row, {
                      center: { x: startX, y: startY },
                      intensity: firstHeavenHellBonusEntryAttack ? 1.65 : 1.05,
                      destroySprite: true,
                      gameState: heavenHellGameState,
                      killWeight: divineXKillWeight,
                      divineXDoubleKill: startStep?.divineXProc === true
                    });
                  } else {
                    this.createBloodSplash(startX, startY);
                    // Persistent blood splatter that stays on scene
                    this.createBloodSplatter(startX, startY);

                    this.tweens.killTweensOf(startSprite);
                    this.destroyBananaBackplate(startSprite);
                    startSprite.destroy();
                    this.reelSprites[startPos.reel][startPos.row] = null;
                  }
                  
                  // Drop orbs if this starting banana has orbs
                  if (startOrbs > 0) {
                    this.dropEnergyOrbs(startX, startY, startOrbs, orbSize, orbColors, orbFallDuration, orbSuckDuration);
                    startBananaOrbsDropped = true;
                  }
                  startBananaVisualResolved = true;
                } else {
                  // Regular symbol at starting position
                  this.tweens.killTweensOf(startSprite);
                  startSprite.destroy();
                  this.reelSprites[startPos.reel][startPos.row] = null;
                  
                  // Debris from starting position
                  for (let i = 0; i < 6; i++) {
                    const particle = this.add.circle(
                      startX + (Math.random() - 0.5) * 15,
                      startY + (Math.random() - 0.5) * 15,
                      Math.random() * 3 + 1,
                      0x555555
                    ).setAlpha(0.5).setDepth(DEPTH_SYMBOLS + 1);
                    
                    this.tweens.add({
                      targets: particle,
                      x: particle.x + (Math.random() - 0.5) * 40,
                      y: particle.y + (Math.random() - 0.5) * 40,
                      alpha: 0,
                      duration: 350,
                      ease: 'Power2.easeOut',
                      onComplete: () => particle.destroy()
                    });
                  }
                }
              }
            }
          }
        } else {
          // CONTINUING HUNT - Hero already on board, just reposition if needed
          if (this.heroSprite && !this.heroSprite.destroyed) {
            this.currentHeroAnchor = {
              reel: Number(startPos?.reel || 0),
              row: Number(startPos?.row || 0)
            };
            if (Phaser.Math.Distance.Between(this.heroSprite.x, this.heroSprite.y, startX, startY) > 4) {
              this.heroSprite.setPosition(startX, startY);
            }
          }

          // Quick ready stance before next hunt
          await new Promise(resolve => {
            this.tweens.add({
              targets: this.heroSprite,
              scaleX: heroBaseScale * 1.15,
              scaleY: heroBaseScale * 1.15,
              duration: 100,
              yoyo: true,
              ease: 'Power2',
              onComplete: resolve
            });
          });
          
          // Handle starting position for continuing hunt (respin)
          const startAffected = affectedPositions.find(pos => pos.reel === startPos.reel && pos.row === startPos.row);
          
          if (startHasBanana) {
            trackBananaMeterArrival(registerBananaEncounter(startX, startY), startBananaMeterArrivalPromises);
          }
          
          if (startAffected && (startAffected.stepType === "mystery" || startAffected.stepType === "mysteryWild") && !is3x3Troll) {
            // MYSTERY/MYSTERYWILD STEP - Ensure a mystery sprite exists at starting position
            const mysteryId = clientConfig.symbolsMapping?.mystery || 14;
            const mysteryTexture = this.getMysteryTexture(startAffected.stepType);
            let startSprite = startHasBanana
              ? resolveBananaSpriteAtCell(startPos.reel, startPos.row)
              : this.reelSprites[startPos.reel]?.[startPos.row];
            
            // If no sprite exists, CREATE one
            if (!startSprite || startSprite.destroyed) {
              startSprite = this.add.image(startX, startY, mysteryTexture)
                .setOrigin(0.5)
                .setScale(normalScale)
                .setDepth(DEPTH_SYMBOLS);
              startSprite.symbolKey = mysteryId;
              
              if (!this.reelSprites[startPos.reel]) {
                this.reelSprites[startPos.reel] = [];
              }
              this.reelSprites[startPos.reel][startPos.row] = startSprite;
            }
            
            // Drop orbs if starting position was a banana with orbs
            if (startHasBanana && startOrbs > 0) {
              if (shouldUseHellDiveStartDeathFx()) {
                const divineXKillWeight = startStep?.divineXProc === true
                  ? Math.max(1, Number(this.getHeavenHellKillWeightForCell?.(startPos.reel, startPos.row, heavenHellGameState) || 1)) * 2
                  : null;
                this.playHeavenHellDemonDeathFx(startPos.reel, startPos.row, {
                  center: { x: startX, y: startY },
                  intensity: firstHeavenHellBonusEntryAttack ? 1.65 : 1.05,
                  destroySprite: true,
                  gameState: heavenHellGameState,
                  killWeight: divineXKillWeight,
                  divineXDoubleKill: startStep?.divineXProc === true
                });
              } else {
                this.createBloodSplash(startX, startY);
                this.createBloodSplatter(startX, startY); // Persistent blood stain
              }
              this.dropEnergyOrbs(startX, startY, startOrbs, orbSize, orbColors, orbFallDuration, orbSuckDuration);
              startBananaOrbsDropped = true;
            }
            if (startHasBanana) {
              startBananaVisualResolved = true;
            }
          } else if (
            startAffected &&
            startAffected.stepType === "destroy" &&
            !is3x3Troll &&
            !startFeatureCollectionKeys.has(startCellKey) &&
            !shouldPreserveHuntFeatureCell(startAffected)
          ) {
            // Continuing hunt on a banana/symbol start cell: resolve immediately.
            const startSprite = startHasBanana
              ? resolveBananaSpriteAtCell(startPos.reel, startPos.row)
              : this.reelSprites[startPos.reel]?.[startPos.row];
            const useStartHellDiveDeathFx = startHasBanana && shouldUseHellDiveStartDeathFx();
            if (startSprite && !startSprite.destroyed && !useStartHellDiveDeathFx) {
              this.tweens.killTweensOf(startSprite);
              this.destroyBananaBackplate(startSprite);
              startSprite.destroy();
            }
            if (this.reelSprites[startPos.reel] && !useStartHellDiveDeathFx) {
              this.reelSprites[startPos.reel][startPos.row] = null;
            }

            if (startHasBanana) {
              if (useStartHellDiveDeathFx) {
                const divineXKillWeight = startStep?.divineXProc === true
                  ? Math.max(1, Number(this.getHeavenHellKillWeightForCell?.(startPos.reel, startPos.row, heavenHellGameState) || 1)) * 2
                  : null;
                this.playHeavenHellDemonDeathFx(startPos.reel, startPos.row, {
                  center: { x: startX, y: startY },
                  intensity: firstHeavenHellBonusEntryAttack ? 1.65 : 1.05,
                  destroySprite: true,
                  gameState: heavenHellGameState,
                  killWeight: divineXKillWeight,
                  divineXDoubleKill: startStep?.divineXProc === true
                });
              } else {
                this.createBloodSplash(startX, startY);
                this.createBloodSplatter(startX, startY);
              }
              startBananaVisualResolved = true;
              if (startOrbs > 0) {
                this.dropEnergyOrbs(startX, startY, startOrbs, orbSize, orbColors, orbFallDuration, orbSuckDuration);
                startBananaOrbsDropped = true;
              }
              if (isHeavenHellBonusHunt) {
                this.trackHeavenHellKillGroundDrops?.(
                  startStep,
                  [{ reel: startPos.reel, row: startPos.row }],
                  heavenHellGameState,
                  { stepQuickStop: false }
                );
              }
            }
          }
        }
    
        let startChargeLaunch = false;
        if (startHasBanana && isHeavenHellBonusHunt && startStep?.divineChargeProc === true) {
          const chargeRushTexture = getHeroTexture(weapon, {
            footprintSize: heroFootprintSize,
            rushActive: true,
            bonusStage: visualBonusStage
          });
          if (this.heroSprite && !this.heroSprite.destroyed) {
            this.heroSprite.setTexture(chargeRushTexture);
          }
          await this.playHeavenHellDivineChargeWindup(startStep, { stepQuickStop: false });
          startChargeLaunch = true;
          huntMomentum = HUNT_MOMENTUM_MAX;
        }

        if (startHasBanana && isHeavenHellBonusHunt && startStep?.divineStrikeProc === true) {
          await this.playHeavenHellDivineStrikeAnticipation?.(
            startStep,
            { x: startX, y: startY },
            {
              stepQuickStop: false,
              durationMs: DIVINE_STRIKE_SLOWMO_REAL_MS,
              slowMoFactor: DIVINE_STRIKE_SLOWMO_FACTOR
            }
          );
        }
    
        if (startHasBanana && !is3x3Troll) {
          syncAngelMultiplierDisplay(startStep?.angelMultiplier, { showBadge: true, pulse: true });
          if (rushActive) {
            startStep.footprintCells
              ?.filter?.((cell) => cell?.banana !== true)
              ?.forEach?.((cell) => {
                if (startFeatureCollectionKeys.has(`${cell.reel},${cell.row}`)) {
                  return;
                }
                if (shouldPreserveHuntFeatureCell(cell)) {
                  return;
                }
                const trailSprite = resolveCollectTrailSpriteAtCell(cell) || this.reelSprites?.[cell.reel]?.[cell.row];
                if (!trailSprite || trailSprite.destroyed) return;
                this.reelSprites[cell.reel][cell.row] = null;
                collectTrailSpriteToCenter(trailSprite, cell);
              });
          }
    
          if (!startBananaVisualResolved) {
            const lingeringStartBanana = resolveBananaSpriteAtCell(startPos.reel, startPos.row);
            if (lingeringStartBanana && !lingeringStartBanana.destroyed) {
              this.tweens.killTweensOf(lingeringStartBanana);
              this.destroyBananaBackplate(lingeringStartBanana);
              lingeringStartBanana.destroy();
            }
            if (this.reelSprites[startPos.reel]) {
              this.reelSprites[startPos.reel][startPos.row] = null;
            }
            this.createBloodSplash(startX, startY);
            this.createBloodSplatter(startX, startY);
            startBananaVisualResolved = true;
          }
    
          if (startOrbs > 0 && !startBananaOrbsDropped) {
            this.dropEnergyOrbs(startX, startY, startOrbs, orbSize, orbColors, orbFallDuration, orbSuckDuration);
            startBananaOrbsDropped = true;
          }
        }
    
        let startDivineXImpactPromise = null;
        if (startHasBanana) {
          const startWildPositions = Array.isArray(startStep?.footprintCells) && startStep.footprintCells.length > 0
            ? startStep.footprintCells
            : [{ reel: startPos.reel, row: startPos.row }];
          applyImpactWinCountUp(startStep);
          if (isHeavenHellBonusHunt && startStep?.divineXProc === true && startStep?.divineStrikeProc !== true) {
            startDivineXImpactPromise = this.playHeavenHellDivineXAtStep?.(startStep, heavenHellGameState, {
              stepQuickStop: false,
              origin: { x: startX, y: startY },
              strikeAtTargets: true,
              waitForLootDrop: false
            });
          }
          if (isHeavenHellBonusHunt && startChargeLaunch) {
            await this.playHeavenHellDivineChargeImpact(
              startStep,
              heavenHellGameState,
              { x: startX, y: startY },
              { waitForLootDrop: false }
            );
            this.playHeavenHellAbilityComboPopup?.(startStep, { x: startX, y: startY }, { stepQuickStop: false });
          } else if (isHeavenHellBonusHunt && startStep?.divineStrikeProc === true) {
            this.playHeavenHellAbilityComboPopup?.(startStep, { x: startX, y: startY }, { stepQuickStop: false });
          } else if (isHeavenHellBonusHunt && startDivineXImpactPromise) {
            this.playHeavenHellAbilityComboPopup?.(startStep, { x: startX, y: startY }, { stepQuickStop: false });
          }
          if (isHeavenHellBonusHunt && startStep?.divineStrikeProc === true) {
            await this.playHeavenHellDivineStrikeAtStep?.(startStep, heavenHellGameState, {
              stepQuickStop: false,
              origin: { x: startX, y: startY },
              waitForLootDrop: false
            });
          }
          if (startDivineXImpactPromise) {
            await startDivineXImpactPromise;
          }
          if (isHeavenHellBonusHunt) {
            await this.playHeavenHellPentagramStepEffects?.(heavenHellGameState, pathStartIndex, {
              stepQuickStop: false
            });
          }
          await this.resolveBananaImpactClusters(
            { reel: startPos.reel, row: startPos.row },
            resolvedBananaMeterLevel,
            {
              precomputedClusters: Array.isArray(startStep?.impactClusters) ? startStep.impactClusters : [],
              activeWildPositions: startWildPositions,
              waitForFastForward: false,
              fallbackAutoExplodeMs: 0,
              noClusterSlowMoMs: startSkipsImpactSlowMo ? 0 : 80,
              clusterSlowMoMs: startSkipsImpactSlowMo ? 0 : 140
            }
          );
          if (startWaitsForBananaUpgrade) {
            await waitForBananaMeterArrivals([
              ...pendingBananaMeterArrivalPromises,
              ...startBananaMeterArrivalPromises
            ]);
          }
          const startGrowthHandled = startStep?.giantMonkeyActivated === true;
          if (startGrowthHandled) {
            registerGrowthBananasToMeter(startStep).forEach((promise) => {
              trackBananaMeterArrival(promise, startBananaMeterArrivalPromises);
            });
            const growthEvent = {
              heroPosition: startStep?.heroPositionAfterGrowth || { reel: startPos.reel, row: startPos.row },
              heroFootprintSize: Number(startStep?.footprintSizeAfterGrowth || startStep?.footprintSize || heroFootprintSize),
              growthConsumedCells: Array.isArray(startStep?.growthConsumedCells) ? startStep.growthConsumedCells : [],
              growthCollectedSymbols: Array.isArray(startStep?.growthCollectedSymbols) ? startStep.growthCollectedSymbols : [],
              featureCollectionKeys: Array.from(getFeatureCollectionKeysForPathIndex(pathStartIndex))
            };
            await this.animateHeroGrowthExpansion(growthEvent);
            syncHeroRuntimeForm(growthEvent.heroFootprintSize, growthEvent.heroPosition);
            refreshMonkeyStrengthBadge();
          }
          await playBonusStageLevelUpBurst(startStep, { growthHandled: startGrowthHandled });
          if (!isBonus || startWaitsForBananaUpgrade || startBananaMeterArrivalPromises.length === 0) {
            syncMeterFromStepState(startStep);
          }
        } else if (!this.isHeroAtStartingPosition?.(startPos)) {
          const startWildPositions = Array.isArray(startStep?.footprintCells) && startStep.footprintCells.length > 0
            ? startStep.footprintCells
            : [{ reel: startPos.reel, row: startPos.row }];
          if (Array.isArray(startStep?.impactClusters) && startStep.impactClusters.length > 0) {
            applyImpactWinCountUp(startStep);
            await this.resolveBananaImpactClusters(
              { reel: startPos.reel, row: startPos.row },
              resolvedBananaMeterLevel,
              {
                precomputedClusters: startStep.impactClusters,
                activeWildPositions: startWildPositions,
                waitForFastForward: false,
                fallbackAutoExplodeMs: 0,
                noClusterSlowMoMs: 80,
                clusterSlowMoMs: 140
              }
            );
          }
        }
        emitRushingMonkeyStepTrail(startStep, Array.isArray(startStep?.footprintCells) ? startStep.footprintCells : []);
        await playInlineMergeGunActivations(pathStartIndex);
        await playInlineMergeGunCollections(pathStartIndex);
        await playInlineBonusMysteryCollections(pathStartIndex);
        await playInlineLightningBeeCollections(pathStartIndex);
        await playStepGargoyleEscapes(startStep, { stepQuickStop: false });
    
        refreshMonkeyStrengthBadge();
        
        // Main-game angel wild is active on any off-center board cell.
    
        // Track current acceleration segment. Momentum chain builds speed across consecutive kills.
        const initialSpeedMultiplier = getHuntSpeedMultiplier(startStep);
        let currentSegmentSpeed = applyMomentumToDuration(baseRushDuration * initialSpeedMultiplier);
        let lastBananaIndex = 0;
        
        // Move along path with accelerating rush and impact checks.
        try {
          for (let i = pathStartIndex + 1; i < heroPath.length; i++) {
          let stepQuickStop = this.consumeQuickStop();
          const step = heroPath[i];
          if (step?.abilityPreKilled === true) {
            continue;
          }
          let stepChargeLaunch = false;
          let heroFormNeedsSync = false;
          if (typeof step?.rushActive === "boolean") {
            rushActive = step.rushActive === true;
            heroFormNeedsSync = true;
          }
          if (Number.isFinite(Number(step?.footprintSize))) {
            syncHeroRuntimeForm(Number(step.footprintSize), { reel: Number(step?.reel || 0), row: Number(step?.row || 0) });
            heroFormNeedsSync = false;
          } else if (heroFormNeedsSync) {
            syncHeroRuntimeForm(heroFootprintSize, { reel: Number(step?.reel || 0), row: Number(step?.row || 0) });
          }
          this.currentHeroAnchor = {
            reel: Number(step?.reel || 0),
            row: Number(step?.row || 0)
          };
          const targetCenter = getHeroAnchorCenter(step.reel, step.row, Number(step?.footprintSize || heroFootprintSize));
          const targetX = targetCenter.x;
          const targetY = targetCenter.y;
          
          // Check if this is a banana position (attack incoming)
          const isBananaStep = step.banana;
          const stepAffectedCells = Array.isArray(step?.footprintCells) && step.footprintCells.length > 0
            ? step.footprintCells
            : [{ reel: step.reel, row: step.row, banana: isBananaStep, bananaId: step?.bananaId ?? null }];
          const bananaTargets = Array.isArray(step?.eatenBananas) && step.eatenBananas.length > 0
            ? step.eatenBananas
            : (isBananaStep ? [{ reel: step.reel, row: step.row, bananaId: step?.bananaId ?? null, orbs: step?.orbs || 0 }] : []);
          const nonBananaStepCells = stepAffectedCells.filter((cell) => !cell?.banana);
          const stepWaitsForBananaUpgrade = isBananaStep && doesStepTriggerBananaUpgrade(step);
          const stepHasFeatureActivation = hasFeatureActivationForPathIndex(i);
          const stepSkipsImpactSlowMo = stepWaitsForBananaUpgrade || stepHasFeatureActivation;
          const useFeatureApproachCue = stepHasFeatureActivation && !stepQuickStop;
          const useDivineStrikeSlowApproach =
            isBananaStep &&
            isHeavenHellBonusHunt &&
            step?.divineStrikeProc === true &&
            !stepQuickStop;
          const stepBananaMeterArrivalPromises = [];
          if (isBananaStep) {
            syncAngelMultiplierDisplay(step?.angelMultiplier, { showBadge: true, pulse: true });
          }

          if (isBananaStep && isHeavenHellBonusHunt && step?.divineChargeProc === true && !stepQuickStop) {
            const chargeRushTexture = getHeroTexture(weapon, {
              footprintSize: heroFootprintSize,
              rushActive: true,
              bonusStage: visualBonusStage
            });
            if (this.heroSprite && !this.heroSprite.destroyed) {
              this.heroSprite.setTexture(chargeRushTexture);
            }
            await this.playHeavenHellDivineChargeWindup(step, { stepQuickStop });
            stepChargeLaunch = true;
            huntMomentum = HUNT_MOMENTUM_MAX;
          }
          
          // BEFORE MOVING: Transform previous position to mystery if mystery step
          // This happens at the START of each movement, so mystery appears under hero before he leaves
          // Skip for 3x3 trolls since transformations are handled after the attack storm
          const prevStep = heroPath[i - 1];
          const previousFootprintSize = Math.max(
            1,
            Math.floor(Number(prevStep?.footprintSizeAfterGrowth ?? prevStep?.footprintSize ?? heroFootprintSize) || 1)
          );
          const currentStepFootprintSize = Math.max(
            1,
            Math.floor(Number(step?.footprintSize ?? heroFootprintSize) || 1)
          );
          const prevAffectedPos = affectedPositions.find(pos => pos.reel === prevStep.reel && pos.row === prevStep.row);
          
          if (prevAffectedPos && (prevAffectedPos.stepType === "mystery" || prevAffectedPos.stepType === "mysteryWild") && !is3x3Troll) {
            const prevSprite = this.reelSprites[prevStep.reel]?.[prevStep.row];
            if (prevSprite && !prevSprite.destroyed) {
              const mysteryId = clientConfig.symbolsMapping?.mystery || 14;
              const mysteryTexture = this.getMysteryTexture(prevAffectedPos.stepType);
              const prevX = prevStep.reel * cellSize + cellSize / 2 + GRID_OFFSET_X;
              const prevY = (clientConfig.area.height - 1 - prevStep.row) * cellSize + cellSize / 2 + GRID_OFFSET_Y;
              
              // Quick mystery transformation (hero is still visually on top with higher Z-index)
              const flash = this.add.circle(prevX, prevY, 30, 0x9966FF).setAlpha(0).setDepth(DEPTH_SYMBOLS + 2);
              this.tweens.add({
                targets: flash,
                alpha: 0.6,
                scale: 1.3,
                duration: 100,
                yoyo: true,
                ease: 'Sine.easeInOut',
                onComplete: () => flash.destroy()
              });
              
              // Transform sprite (hero sprite is at DEPTH_HERO = 30, so this is below at DEPTH_SYMBOLS = 10)
              prevSprite.setTexture(mysteryTexture);
              prevSprite.symbolKey = mysteryId;
              prevSprite.setScale(normalScale);
              
              // Quick sparkles
              for (let j = 0; j < 4; j++) {
                const sparkle = this.add.circle(
                  prevX + (Math.random() - 0.5) * 30,
                  prevY + (Math.random() - 0.5) * 30,
                  Math.random() * 2 + 1,
                  0x9966FF
                ).setAlpha(0.8).setDepth(DEPTH_SYMBOLS + 1);
                
                this.tweens.add({
                  targets: sparkle,
                  y: sparkle.y - 20,
                  alpha: 0,
                  duration: 300,
                  ease: 'Power2.easeOut',
                  onComplete: () => sparkle.destroy()
                });
              }
              
              // Add looping stars to indicate mystery (all mystery types)
              const isMysteryWild = stepType === "mysteryWild";
              const starColors = isMysteryWild ? 
                [0x9966FF, 0xBB88FF] :  // Purple for mysteryWild
                [0x00BFFF, 0x4DD2FF];   // Blue for mystery
              
              // Create looping star animation
              const createStarLoop = () => {
                if (!prevSprite || prevSprite.destroyed) return;
                
                const starCount = isMysteryWild ? 6 : 4;  // More stars for mysteryWild
                
                for (let s = 0; s < starCount; s++) {
                  setTimeout(() => {
                    if (!prevSprite || prevSprite.destroyed) return;
                    
                    const angle = (s / starCount) * Math.PI * 2 + (Math.random() * 0.2);
                    const startDist = 20;
                    const starColor = starColors[Math.floor(Math.random() * starColors.length)];
                    
                    const star = this.add.circle(
                      prevX + Math.cos(angle) * startDist,
                      prevY + Math.sin(angle) * startDist,
                      1,  // Smaller dots!
                      starColor
                    ).setAlpha(0).setDepth(DEPTH_SYMBOLS + 3).setBlendMode(Phaser.BlendModes.ADD);
                    
                    // Star rises and twinkles
                    this.tweens.add({
                      targets: star,
                      alpha: 1,
                      y: star.y - 35,
                      duration: 800,
                      ease: 'Power2.easeOut',
                      onComplete: () => {
                        this.tweens.add({
                          targets: star,
                          alpha: 0,
                          duration: 150,
                          onComplete: () => star.destroy()
                        });
                      }
                    });
                    
                    // Gentle twinkle
                    this.tweens.add({
                      targets: star,
                      scale: 1.8,
                      duration: 400,
                      yoyo: true,
                      ease: 'Sine.easeInOut'
                    });
                  }, s * 100);
                }
                
                // Loop the star creation
                if (prevSprite && !prevSprite.destroyed) {
                  const loopTimer = setTimeout(createStarLoop, 1000);
                  if (!prevSprite.starLoopTimers) prevSprite.starLoopTimers = [];
                  prevSprite.starLoopTimers.push(loopTimer);
                }
              };
              
              // Start the loop
              createStarLoop();
            }
          }
          
          // Calculate movement duration based on acceleration
          let currentDuration;
          
          if (isBananaStep) {
            if (stepChargeLaunch) {
              currentDuration = getDirectFlightDuration(
                this.heroSprite?.x ?? targetX,
                this.heroSprite?.y ?? targetY,
                targetX,
                targetY,
                stepQuickStop,
                { chargeLaunch: true }
              );
            } else if (!rushActive && !is3x3Troll) {
              currentDuration = getDirectFlightDuration(
                this.heroSprite?.x ?? targetX,
                this.heroSprite?.y ?? targetY,
                targetX,
                targetY,
                stepQuickStop
              );
            } else {
              const speedMultiplier = getHuntSpeedMultiplier(step);
              currentDuration = applyMomentumToDuration(approachDuration * speedMultiplier);
              if (is3x3Troll) {
                currentDuration *= trollAttackSpeedMultiplier;
              }
            }
          } else {
            const speedMultiplier = getHuntSpeedMultiplier(step);
            const adjustedMinSpeed = minRushDuration * speedMultiplier;
            huntMomentum = Math.min(HUNT_MOMENTUM_MAX, huntMomentum + HUNT_MOMENTUM_GAIN);
            currentSegmentSpeed = rushActive
              ? Math.max(adjustedMinSpeed, currentSegmentSpeed * rushAccelerationRate)
              : applyMomentumToDuration(baseRushDuration * speedMultiplier);
            currentDuration = currentSegmentSpeed;
          }
          
          // Create motion blur trail effect during rush (more trails when faster)
          const startX = this.heroSprite.x;
          const startY = this.heroSprite.y;
          
          // More trails = faster movement (visual feedback)
          const trailCount = Math.ceil((baseRushDuration / currentDuration) * 2);
          
          // Spawn trail images — angel trail asset during rush / charge launch
          if ((rushActive || stepChargeLaunch || huntMomentum >= 1.5) && !stepQuickStop) {
            const trailLimit = stepChargeLaunch ? 8 : Math.min(trailCount, 6);
            for (let t = 0; t < trailLimit; t++) {
              setTimeout(() => {
                if (!this.heroSprite || this.heroSprite.destroyed) return;
                const useAngelTrail = this.textures?.exists?.("helldive_angel_trail") && (stepChargeLaunch || huntMomentum >= 1.8);
                const trail = useAngelTrail
                  ? this.add.image(this.heroSprite.x, this.heroSprite.y, "helldive_angel_trail")
                      .setOrigin(0.5)
                      .setScale(heroBaseScale * 0.72)
                      .setDepth(DEPTH_HERO - 1)
                      .setAlpha(0.42)
                      .setBlendMode(Phaser.BlendModes.ADD)
                  : this.add.image(this.heroSprite.x, this.heroSprite.y, heroTexture)
                      .setOrigin(0.5)
                      .setScale(heroBaseScale)
                      .setDepth(DEPTH_HERO - 1)
                      .setAlpha(0.35)
                      .setTint(BANANA_TRAIL_TINT);
                this.tweens.add({
                  targets: trail,
                  alpha: 0,
                  scale: (trail.scaleX || heroBaseScale) * 0.78,
                  duration: stepChargeLaunch ? 120 : 150,
                  ease: 'Power2.easeOut',
                  onComplete: () => trail.destroy()
                });
              }, t * (stepChargeLaunch ? 10 : 15));
            }
            if (stepChargeLaunch) {
              this.spawnHeavenHellChargeLaunchTrails(startX, startY, targetX, targetY, { heroScale: heroBaseScale });
            }
          }
          
          // Add speed lines when moving at max speed
          if (rushActive && !stepQuickStop && currentDuration <= minRushDuration * 1.2) {
            // Create horizontal speed lines
            for (let s = 0; s < 3; s++) {
              setTimeout(() => {
                const speedLine = this.add.rectangle(
                  this.heroSprite.x - 30,
                  this.heroSprite.y + (Math.random() - 0.5) * 30,
                  40,
                  2,
                  0xFFFFFF
                ).setAlpha(0.6).setDepth(DEPTH_HERO - 1);
                
                this.tweens.add({
                  targets: speedLine,
                  x: speedLine.x - 80,
                  alpha: 0,
                  duration: 150,
                  ease: 'Power2.easeOut',
                  onComplete: () => speedLine.destroy()
                });
              }, s * 20);
            }
          }
          
          // Check if this step is approaching a banana
          if (isBananaStep) {
            const bananaStrikeFrom = this.heroSprite && !this.heroSprite.destroyed
              ? { x: Number(this.heroSprite.x || targetX), y: Number(this.heroSprite.y || targetY) }
              : { x: targetX, y: targetY };
            if (!rushActive && !is3x3Troll) {
              if (!stepQuickStop) {
                const swingSound = weapon === 'axe' ? 'attack_swing_axe' : 'attack_swing';
                this.playSfx(swingSound, { volume: 0.35 });
              }
    
              if (stepQuickStop) {
                this.tweens.killTweensOf(this.heroSprite);
                this.heroSprite.setPosition(targetX, targetY);
              } else if (useDivineStrikeSlowApproach) {
                await moveHeroThroughDivineStrikeSlowMo(
                  step,
                  targetX,
                  targetY,
                  currentDuration,
                  {
                    chargeLaunch: stepChargeLaunch,
                    featureApproach: useFeatureApproachCue
                  }
                );
              } else {
                await moveHeroLinearlyToTarget(
                  targetX,
                  targetY,
                  currentDuration,
                  stepChargeLaunch ? 'Cubic.easeIn' : 'Power2.easeIn',
                  { featureApproach: useFeatureApproachCue }
                );
              }
    
              if (!stepQuickStop) {
                const bananaHitSound = `banana_hit_${Math.floor(Math.random() * 4) + 1}`;
                this.playSfx(bananaHitSound, { volume: stepChargeLaunch ? 0.5 : 0.42 });
    
                const landingPunchDuration = Math.max(42, Math.min(78, currentDuration * 0.2));
                await new Promise((resolve) => {
                  this.tweens.add({
                    targets: this.heroSprite,
                    scaleX: heroBaseScale * 1.22,
                    scaleY: heroBaseScale * 0.9,
                    duration: landingPunchDuration,
                    yoyo: true,
                    ease: 'Quad.easeOut',
                    onComplete: resolve
                  });
                });
              }
    
              const impactFlash = this.add.circle(targetX, targetY, 22, 0xFFFFFF)
                .setAlpha(0.7)
                .setDepth(DEPTH_HERO + 1);

              this.playHeavenHellAngelStrikeSlash?.(bananaStrikeFrom, { x: targetX, y: targetY }, {
                scale: stepChargeLaunch ? 1.04 : 0.88,
                palette: stepChargeLaunch ? "charge" : "gold",
                gifEffect: stepChargeLaunch ? "attack2" : null
              });
    
              this.tweens.add({
                targets: impactFlash,
                scale: 3.2,
                alpha: 0,
                duration: 110,
                ease: 'Power2.easeOut',
                onComplete: () => impactFlash.destroy()
              });
            } else {
              // === QUICK ATTACK - Rush THROUGH banana without stopping ===
              // Hero doesn't lose momentum - effects happen as hero passes through
              
              // // Play attack swing sound (skip for troll swarms since finisher plays at start)
              if (!is3x3Troll && !stepQuickStop) {
                const swingSound = weapon === 'axe' ? 'attack_swing_axe' : 'attack_swing';
                this.playSfx(swingSound, { volume: 0.35 });
              }
              
              // Calculate attack duration (faster for trolls)
              const attackAnimDuration = stepQuickStop ? 1 : (is3x3Troll ? currentDuration * 0.5 : currentDuration * 0.8);
              
              // Rush to banana position; feature pickups get a small readable arrival cue.
              if (stepQuickStop) {
                this.tweens.killTweensOf(this.heroSprite);
                this.heroSprite.setPosition(targetX, targetY);
              } else if (useDivineStrikeSlowApproach) {
                await moveHeroThroughDivineStrikeSlowMo(
                  step,
                  targetX,
                  targetY,
                  attackAnimDuration,
                  {
                    chargeLaunch: stepChargeLaunch,
                    featureApproach: useFeatureApproachCue
                  }
                );
                if (this.heroSprite && !this.heroSprite.destroyed) {
                  this.tweens.add({
                    targets: this.heroSprite,
                    scaleX: heroBaseScale * 1.3,
                    scaleY: heroBaseScale * 1.3,
                    duration: 40,
                    yoyo: true,
                    ease: 'Power2.easeOut'
                  });
                }
              } else {
                await moveHeroLinearlyToTarget(
                  targetX,
                  targetY,
                  attackAnimDuration,
                  stepChargeLaunch ? 'Cubic.easeIn' : 'Power2.easeIn',
                  { featureApproach: useFeatureApproachCue }
                );
                if (this.heroSprite && !this.heroSprite.destroyed) {
                  this.tweens.add({
                    targets: this.heroSprite,
                    scaleX: heroBaseScale * 1.3,
                    scaleY: heroBaseScale * 1.3,
                    duration: 40,
                    yoyo: true,
                    ease: 'Power2.easeOut'
                  });
                }
              }
              
              // Play random banana hit sound on impact (skip for troll swarms since finisher plays at start)
              if (!is3x3Troll && !stepQuickStop) {
                const bananaHitSound = `banana_hit_${Math.floor(Math.random() * 4) + 1}`;
                this.playSfx(bananaHitSound, { volume: 0.42 });
              }
              
              // Quick impact flash
              const quickFlash = this.add.circle(targetX, targetY, 18, 0xFFFFFF)
                .setAlpha(0.6)
                .setDepth(DEPTH_HERO + 1);

              this.playHeavenHellAngelStrikeSlash?.(bananaStrikeFrom, { x: targetX, y: targetY }, {
                scale: stepChargeLaunch ? 1.02 : 0.82,
                palette: stepChargeLaunch ? "charge" : "gold",
                gifEffect: rushActive || stepChargeLaunch ? "attack2" : "attack"
              });
              
              this.tweens.add({
                targets: quickFlash,
                scale: 2.5,
                alpha: 0,
                duration: 60,
                ease: 'Power2.easeOut',
                onComplete: () => quickFlash.destroy()
              });
              
              // Impact effects trigger once the hero reaches the banana.
            }
          } else {
            // Normal movement for non-banana steps
            if (stepQuickStop) {
              this.tweens.killTweensOf(this.heroSprite);
              this.heroSprite.setPosition(targetX, targetY);
            } else {
              await moveHeroLinearlyToTarget(
                targetX,
                targetY,
                currentDuration,
                stepChargeLaunch ? 'Cubic.easeIn' : 'Power3.easeIn',
                { featureApproach: useFeatureApproachCue }
              );
            }
          }
          if (!stepQuickStop) {
            emitRushingMonkeyStepTrail(step, stepAffectedCells);
          }
          if (isBananaStep && !stepQuickStop) {
            huntMomentum = Math.max(1.0, huntMomentum - HUNT_MOMENTUM_IMPACT_DECAY);
          }
          
          // Handle destroy step AFTER hero arrives at position
          // (Mystery transformation happens BEFORE hero leaves, see above)
          const destroyStepMode = stepAffectedCells.some((cell) => {
            const affectedCell = affectedPositions.find((pos) => pos.reel === cell.reel && pos.row === cell.row);
            return affectedCell?.stepType === "destroy";
          });
          if (destroyStepMode && nonBananaStepCells.length > 0) {
            const featureCollectionKeysForStep = getFeatureCollectionKeysForPathIndex(i);
            nonBananaStepCells.forEach((cell) => {
              if (featureCollectionKeysForStep.has(`${cell.reel},${cell.row}`)) {
                return;
              }
              if (shouldPreserveHuntFeatureCell(cell)) {
                return;
              }
              const sprite = resolveCollectTrailSpriteAtCell(cell) || this.reelSprites[cell.reel]?.[cell.row];
              if (!sprite || sprite.destroyed) return;
    
              this.reelSprites[cell.reel][cell.row] = null;
    
              if (rushActive) {
                collectTrailSpriteToCenter(sprite, cell);
                return;
              }
    
              sprite.isBeingDestroyed = true;
              this.tweens.killTweensOf(sprite);
              sprite.setDepth(-1000);
              this.destroyBananaBackplate(sprite);
    
              this.tweens.add({
                targets: sprite,
                alpha: 0,
                scale: 0.3,
                angle: 45,
                duration: 200,
                ease: 'Power3.easeIn',
                onComplete: () => {
                  if (!sprite.destroyed) {
                    sprite.destroy();
                  }
                }
              });
    
              const cellCenter = getCellCenter(cell.reel, cell.row);
              this.playMonkeySymbolClearLightningBurst(cellCenter.x, cellCenter.y, {
                depth: DEPTH_HERO + 2,
                radius: 32,
                boltCount: 3,
                color: 0xFFE778,
                intensityScale: 0.72
              });
              for (let j = 0; j < 6; j++) {
                const particle = this.add.circle(
                  cellCenter.x + (Math.random() - 0.5) * 15,
                  cellCenter.y + (Math.random() - 0.5) * 15,
                  Math.random() * 3 + 1,
                  0x555555
                ).setAlpha(0.5).setDepth(DEPTH_SYMBOLS + 1);
    
                this.tweens.add({
                  targets: particle,
                  x: particle.x + (Math.random() - 0.5) * 40,
                  y: particle.y + (Math.random() - 0.5) * 40,
                  alpha: 0,
                  duration: 350,
                  ease: 'Power2.easeOut',
                  onComplete: () => particle.destroy()
                });
              }
            });
          }
          if (!isBananaStep) {
            await playInlineMergeGunActivations(i);
            await playInlineMergeGunCollections(i);
            await playInlineBonusMysteryCollections(i);
            await playInlineLightningBeeCollections(i);
          }
          
          // Blood splatter and banana handling (only if banana step)
          let stepDivineXImpactPromise = null;
          if (isBananaStep) {
            const isLastBananaBlood = (bananasEncountered + bananaTargets.length) === totalBananas;
    
            if (is3x3Troll && !isLastBananaBlood) {
              bananaTargets.forEach(() => {
                trackBananaMeterArrival(registerBananaEncounter(targetX, targetY), stepBananaMeterArrivalPromises);
              });
              continue;
            }
    
            bananaTargets.forEach((bananaTarget) => {
              const bananaSprite = resolveBananaSpriteAtCell(bananaTarget.reel, bananaTarget.row);
              const bananaCellCenter = getCellCenter(bananaTarget.reel, bananaTarget.row);
              const bananaAffectedPos = affectedPositions.find((pos) => pos.reel === bananaTarget.reel && pos.row === bananaTarget.row);
              const multiplierDemonId = Number(clientConfig?.symbolsMapping?.banana2 || 12);
              const targetSymbolId = Number(
                bananaTarget?.bananaId ??
                bananaSprite?.symbolKey ??
                this.reelSprites?.[bananaTarget.reel]?.[bananaTarget.row]?.symbolKey
              );
    
              if (bananaAffectedPos && (bananaAffectedPos.stepType === "mystery" || bananaAffectedPos.stepType === "mysteryWild")) {
                const mysteryId = clientConfig.symbolsMapping?.mystery || 14;
                const mysteryTexture = this.getMysteryTexture(bananaAffectedPos.stepType);
    
                trackBananaMeterArrival(
                  registerBananaEncounter(bananaCellCenter.x, bananaCellCenter.y),
                  stepBananaMeterArrivalPromises
                );
    
                if (bananaSprite && !bananaSprite.destroyed) {
                  this.tweens.killTweensOf(bananaSprite);
                  this.destroyBananaBackplate(bananaSprite);
                  bananaSprite.setTexture(mysteryTexture);
                  bananaSprite.symbolKey = mysteryId;
                  bananaSprite.setScale(normalScale);
                  bananaSprite.setAngle(0);
                  bananaSprite.setAlpha(1);
                  bananaSprite.setDepth(DEPTH_SYMBOLS);
                }
              } else {
                trackBananaMeterArrival(
                  registerBananaEncounter(bananaCellCenter.x, bananaCellCenter.y),
                  stepBananaMeterArrivalPromises
                );
                const useHellDiveDemonDeathFx =
                  this.textures?.exists?.("helldive_demon_death_spatter") &&
                  typeof this.playHeavenHellDemonDeathFx === "function";
                const shouldPlayDemonDeathFx = !is3x3Troll || isLastBananaBlood;
    
                if (shouldPlayDemonDeathFx) {
                  if (useHellDiveDemonDeathFx) {
                    const strikeFrom = this.heroSprite && !this.heroSprite.destroyed
                      ? { x: this.heroSprite.x, y: this.heroSprite.y }
                      : { x: targetX, y: targetY };
                    this.playHeavenHellAngelStrikeSlash?.(strikeFrom, bananaCellCenter, {
                      scale: rushActive ? 0.9 : 0.72,
                      palette: stepChargeLaunch ? "charge" : "gold",
                      gifEffect: stepChargeLaunch ? "attack2" : null
                    });
                    if (
                      !stepDivineXImpactPromise &&
                      isHeavenHellBonusHunt &&
                      step?.divineXProc === true &&
                      step?.divineStrikeProc !== true &&
                      !stepQuickStop
                    ) {
                      stepDivineXImpactPromise = this.playHeavenHellDivineXAtStep?.(step, heavenHellGameState, {
                        stepQuickStop,
                        origin: strikeFrom,
                        strikeAtTargets: true,
                        waitForLootDrop: false
                      });
                    }
                    const divineXKillWeight = isHeavenHellBonusHunt && step?.divineXProc === true
                      ? Math.max(1, Number(this.getHeavenHellKillWeightForCell?.(bananaTarget.reel, bananaTarget.row, heavenHellGameState) || 1)) * 2
                      : null;
                    this.playHeavenHellDemonDeathFx?.(bananaTarget.reel, bananaTarget.row, {
                      center: bananaCellCenter,
                      intensity: rushActive ? 1.18 : 0.92,
                      destroySprite: true,
                      gameState: heavenHellGameState,
                      killWeight: divineXKillWeight,
                      divineXDoubleKill: isHeavenHellBonusHunt && step?.divineXProc === true
                    });
                  } else {
                    this.createBloodSplatter(bananaCellCenter.x, bananaCellCenter.y);
                  }
                }
    
                if (bananaSprite && !bananaSprite.destroyed) {
                  if (useHellDiveDemonDeathFx && shouldPlayDemonDeathFx) {
                    bananaSprite.isBeingDestroyed = true;
                    this.destroyBananaBackplate(bananaSprite);
                  } else {
                    this.reelSprites[bananaTarget.reel][bananaTarget.row] = null;
                    bananaSprite.isBeingDestroyed = true;
                    this.tweens.killTweensOf(bananaSprite);
                    this.destroyBananaBackplate(bananaSprite);
                    bananaSprite.destroy();
                  }
                }
              }
            });

            if (isHeavenHellBonusHunt && isBananaStep) {
              this.trackHeavenHellKillGroundDrops?.(
                step,
                bananaTargets,
                heavenHellGameState,
                { stepQuickStop }
              );
            }

            if (isHeavenHellBonusHunt && stepChargeLaunch) {
              await this.playHeavenHellDivineChargeImpact(
                step,
                heavenHellGameState,
                { x: targetX, y: targetY },
                { waitForLootDrop: false }
              );
              this.playHeavenHellAbilityComboPopup?.(step, { x: targetX, y: targetY }, { stepQuickStop });
            } else if (isHeavenHellBonusHunt && step?.divineStrikeProc === true) {
              this.playHeavenHellAbilityComboPopup?.(step, { x: targetX, y: targetY }, { stepQuickStop });
            } else if (isHeavenHellBonusHunt && stepDivineXImpactPromise) {
              this.playHeavenHellAbilityComboPopup?.(step, { x: targetX, y: targetY }, { stepQuickStop });
            }
            if (isHeavenHellBonusHunt && step?.divineStrikeProc === true) {
              await this.playHeavenHellDivineStrikeAtStep?.(step, heavenHellGameState, {
                stepQuickStop,
                origin: { x: targetX, y: targetY },
                waitForLootDrop: false
              });
            }
            if (stepDivineXImpactPromise) {
              await stepDivineXImpactPromise;
            }
            if (isHeavenHellBonusHunt) {
              await this.playHeavenHellPentagramStepEffects?.(heavenHellGameState, i, {
                stepQuickStop
              });
            }

            bananaTargets.forEach((bananaTarget) => {
              const bananaSprite = resolveBananaSpriteAtCell(bananaTarget.reel, bananaTarget.row);
              const multiplierDemonId = Number(clientConfig?.symbolsMapping?.banana2 || 12);
              const targetSymbolId = Number(
                bananaTarget?.bananaId ??
                bananaSprite?.symbolKey ??
                this.reelSprites?.[bananaTarget.reel]?.[bananaTarget.row]?.symbolKey
              );
              const bananaCellCenter = getCellCenter(bananaTarget.reel, bananaTarget.row);
              const configuredOrbs = Math.max(0, Number(bananaTarget?.orbs || 0));
              const guaranteedMultiplierOrb = isHeavenHellBonusHunt ? 0 : (targetSymbolId === multiplierDemonId ? 1 : 0);
              const totalOrbsToSpawn = Math.max(configuredOrbs, guaranteedMultiplierOrb);
              if (totalOrbsToSpawn > 0 && !is3x3Troll) {
                this.dropEnergyOrbs(
                  bananaCellCenter.x,
                  bananaCellCenter.y,
                  totalOrbsToSpawn,
                  orbSize,
                  orbColors,
                  orbFallDuration,
                  orbSuckDuration
                );
              }
            });

            if (step.goldpile && step.goldpile.value > 0 && !is3x3Troll) {
              this.dropGoldPile(targetX, targetY, step.goldpile.value, step.goldpile.tier);
            }
            
            // Bonus hunt keeps ordinary banana hits fluid; upgrade hits still wait for the banana meter arrival.
            if (stepQuickStop) {
              await this.resolveBananaImpactClusters(
                { reel: step.reel, row: step.row },
                resolvedBananaMeterLevel,
                {
                  precomputedClusters: Array.isArray(step?.impactClusters) ? step.impactClusters : [],
                  activeWildPositions: stepAffectedCells,
                  waitForFastForward: false,
                  fallbackAutoExplodeMs: 0,
                  noClusterSlowMoMs: stepSkipsImpactSlowMo ? 0 : 80,
                  clusterSlowMoMs: stepSkipsImpactSlowMo ? 0 : 140
                }
              );
            } else if (!is3x3Troll && isBonus) {
              await this.resolveBananaImpactClusters(
                { reel: step.reel, row: step.row },
                resolvedBananaMeterLevel,
                {
                  precomputedClusters: Array.isArray(step?.impactClusters) ? step.impactClusters : [],
                  activeWildPositions: stepAffectedCells,
                  waitForFastForward: false,
                  fallbackAutoExplodeMs: 0,
                  noClusterSlowMoMs: stepSkipsImpactSlowMo ? 0 : 70,
                  clusterSlowMoMs: stepSkipsImpactSlowMo ? 0 : 150
                }
              );
            } else if (!is3x3Troll || (bananasEncountered + 1) === totalBananas) {
              await this.resolveBananaImpactClusters(
                { reel: step.reel, row: step.row },
                resolvedBananaMeterLevel,
                {
                  precomputedClusters: Array.isArray(step?.impactClusters) ? step.impactClusters : [],
                  activeWildPositions: stepAffectedCells,
                  waitForFastForward: true,
                  fallbackAutoExplodeMs: 1400
                }
              );
            } else {
              await this.waitForPresentation(50, { skippable: true });
              await this.resolveBananaImpactClusters(
                { reel: step.reel, row: step.row },
                resolvedBananaMeterLevel,
                {
                  precomputedClusters: Array.isArray(step?.impactClusters) ? step.impactClusters : [],
                  activeWildPositions: stepAffectedCells,
                  waitForFastForward: false,
                  fallbackAutoExplodeMs: 0
                }
              );
            }
            if (stepWaitsForBananaUpgrade) {
              await waitForBananaMeterArrivals([
                ...pendingBananaMeterArrivalPromises,
                ...stepBananaMeterArrivalPromises
              ]);
            }
            applyImpactWinCountUp(step);
            const growthHandled = step?.giantMonkeyActivated === true;
            if (growthHandled) {
              registerGrowthBananasToMeter(step).forEach((promise) => {
                trackBananaMeterArrival(promise, stepBananaMeterArrivalPromises);
              });
              const growthEvent = {
                heroPosition: step?.heroPositionAfterGrowth || { reel: step.reel, row: step.row },
                heroFootprintSize: Number(step?.footprintSizeAfterGrowth || step?.footprintSize || heroFootprintSize),
                growthConsumedCells: Array.isArray(step?.growthConsumedCells) ? step.growthConsumedCells : [],
                growthCollectedSymbols: Array.isArray(step?.growthCollectedSymbols) ? step.growthCollectedSymbols : [],
                featureCollectionKeys: Array.from(getFeatureCollectionKeysForPathIndex(i))
              };
              await this.animateHeroGrowthExpansion(growthEvent);
              syncHeroRuntimeForm(growthEvent.heroFootprintSize, growthEvent.heroPosition);
              refreshMonkeyStrengthBadge();
            }
            await playBonusStageLevelUpBurst(step, { growthHandled });
            if (!isBonus || stepWaitsForBananaUpgrade || stepBananaMeterArrivalPromises.length === 0) {
              syncMeterFromStepState(step);
            }
            await playInlineMergeGunActivations(i);
            await playInlineMergeGunCollections(i);
            await playInlineBonusMysteryCollections(i);
            await playInlineLightningBeeCollections(i);
            await playStepGargoyleEscapes(step, { stepQuickStop });
    
            const speedMultiplier = getHuntSpeedMultiplier(step, { afterStep: true });
            currentSegmentSpeed = Math.max(
              minRushDuration * speedMultiplier,
              Math.floor(currentDuration * (stepChargeLaunch ? 0.78 : 0.84))
            );
          }
          }
          await waitForBananaMeterArrivals([...pendingBananaMeterArrivalPromises]);
        } finally {
          this.stopAngelMovementLightEmitter();
          cleanupLingeringProcessedBananas();
        }
        if (finalBonusStage > visualBonusStage) {
          visualBonusStage = finalBonusStage;
          this.currentBonusStage = visualBonusStage;
          if (visualBonusStage >= 3) {
            rushActive = true;
            this.currentHeroRushActive = true;
          }
          syncHeroRuntimeForm(heroFootprintSize, this.currentHeroAnchor);
        }
        this.syncMergeGunAreas(mergeGunAreas, {
          isBonus: this.isInBonusMode === true,
          showValues: false
        });
        
        // Note: Starting position destroyed right after hero entrance
        // Note: Trail symbols are destroyed DURING the rush (see loop above)
        
        // MASSIVE FINALE for 3x3 troll combat - coins and blood explosion
        if (is3x3Troll) {
          // Play troll death sound
          this.playSfx('troll_dies', { volume: 0.7 });
          
          // Clean up any remaining troll sprites
          const trollSteps = heroPath.filter(s => s.banana);
          
          // Calculate the actual center of all 9 troll positions for blood explosion
          const avgReel = trollSteps.reduce((sum, step) => sum + step.reel, 0) / trollSteps.length;
          const avgRow = trollSteps.reduce((sum, step) => sum + step.row, 0) / trollSteps.length;
          const trollCenterX = avgReel * cellSize + cellSize / 2 + GRID_OFFSET_X;
          const trollCenterY = (clientConfig.area.height - 1 - avgRow) * cellSize + cellSize / 2 + GRID_OFFSET_Y;
          const mainTrollSprite = trollSteps.length > 0 ? this.reelSprites[trollSteps[0].reel]?.[trollSteps[0].row] : null;
          
          if (mainTrollSprite) {
            // Destroy main troll sprite and clear all references
            for (const step of trollSteps) {
              if (this.reelSprites[step.reel]?.[step.row] === mainTrollSprite) {
                this.destroyBananaBackplate(step.reel, step.row);
                this.reelSprites[step.reel][step.row] = null;
              }
            }
            mainTrollSprite.destroy();
          }
          
          // Create mystery symbols for all troll positions if hero has mystery step ability
          // SKIP mystery transformations for troll rush - no mystery during troll combat
          // Detect troll rush: stepType is mystery but server forced all positions to destroy mode
          const isTrollRush = is3x3Troll && (stepType === "mystery" || stepType === "mysteryWild") && affectedPositions.every(pos => pos.stepType === "destroy");
          
          if ((stepType === "mystery" || stepType === "mysteryWild") && !isTrollRush) {
            const mysteryId = clientConfig.symbolsMapping?.mystery || 14;
            const mysteryTexture = this.getMysteryTexture(stepType);
            const isMysteryWild = stepType === "mysteryWild";
            const starColors = isMysteryWild ? [0x9966FF, 0xBB88FF] : [0x00BFFF, 0x4DD2FF];
            
            // Check all positions in the hero path (including starting position)
            heroPath.forEach((pathStep, idx) => {
              const affectedPos = affectedPositions.find(pos => pos.reel === pathStep.reel && pos.row === pathStep.row);
              if (affectedPos && (affectedPos.stepType === "mystery" || affectedPos.stepType === "mysteryWild")) {
                setTimeout(() => {
                  const zx = pathStep.reel * cellSize + cellSize / 2 + GRID_OFFSET_X;
                  const zy = (clientConfig.area.height - 1 - pathStep.row) * cellSize + cellSize / 2 + GRID_OFFSET_Y;
                  
                  // Destroy existing sprite if it exists (important for starting position)
                  const existingSprite = this.reelSprites[pathStep.reel]?.[pathStep.row];
                  if (existingSprite && !existingSprite.destroyed) {
                    this.destroyBananaBackplate(pathStep.reel, pathStep.row);
                    existingSprite.destroy();
                  }
                  
                  // Create new mystery sprite
                  const mysterySprite = this.add.image(zx, zy, mysteryTexture)
                    .setOrigin(0.5)
                    .setScale(normalScale)
                    .setDepth(DEPTH_SYMBOLS)
                    .setAlpha(0);
                  
                  mysterySprite.symbolKey = mysteryId;
                  
                  // Store in reelSprites
                  if (!this.reelSprites[pathStep.reel]) {
                    this.reelSprites[pathStep.reel] = [];
                  }
                  this.reelSprites[pathStep.reel][pathStep.row] = mysterySprite;
                  
                  // Mystery transformation flash
                  const flash = this.add.circle(zx, zy, 30, 0x9966FF).setAlpha(0).setDepth(DEPTH_SYMBOLS + 2);
                  this.tweens.add({
                    targets: flash,
                    alpha: 0.6,
                    scale: 1.3,
                    duration: 100,
                    yoyo: true,
                    ease: 'Sine.easeInOut',
                    onComplete: () => flash.destroy()
                  });
                  
                  // Fade in mystery sprite
                  this.tweens.add({
                    targets: mysterySprite,
                    alpha: 1,
                    duration: 200,
                    ease: 'Power2.easeOut'
                  });
                  
                  // Mystery sparkles
                  for (let s = 0; s < 4; s++) {
                    const angle = (s / 4) * Math.PI * 2;
                    const star = this.add.circle(
                      zx + Math.cos(angle) * 20,
                      zy + Math.sin(angle) * 20,
                      1,
                      starColors[Math.floor(Math.random() * starColors.length)]
                    ).setAlpha(0).setDepth(DEPTH_SYMBOLS + 3).setBlendMode(Phaser.BlendModes.ADD);
                    
                    this.tweens.add({
                      targets: star,
                      alpha: 1,
                      y: star.y - 35,
                      duration: 800,
                      ease: 'Power2.easeOut',
                      onComplete: () => {
                        this.tweens.add({
                          targets: star,
                          alpha: 0,
                          duration: 150,
                          onComplete: () => star.destroy()
                        });
                      }
                    });
                  }
                }, idx * 80 + 600); // Delay slightly after blood explosion starts
              }
            });
          }
          
          // MASSIVE BLOOD EXPLOSION
          for (let b = 0; b < 50; b++) {
            setTimeout(() => {
              const bloodAngle = Math.random() * Math.PI * 2;
              const bloodDist = 30 + Math.random() * 90;
              const bloodX = trollCenterX + Math.cos(bloodAngle) * bloodDist;
              const bloodY = trollCenterY + Math.sin(bloodAngle) * bloodDist;
              this.createBloodSplash(bloodX, bloodY);
              
              // Extra blood splatters
              if (b % 3 === 0) {
                this.createBloodSplatter(bloodX, bloodY);
              }
            }, b * 25);
          }
          
          // Play coin collection sounds for finale
          const goldPileSteps = trollSteps.filter(step => step.goldpile && step.goldpile.value > 0);
          const totalGoldFromTroll = goldPileSteps.reduce((sum, step) => sum + (step.goldpile.value || 0), 0);
          
          if (totalGoldFromTroll > 0) {
            // Play multiple coin collection sounds
            this.playSfx(`coin${Math.floor(Math.random() * 6) + 1}`, { volume: 0.6 });
            setTimeout(() => this.playSfx(`coin${Math.floor(Math.random() * 6) + 1}`, { volume: 0.5 }), 300);
            setTimeout(() => this.playSfx(`coin${Math.floor(Math.random() * 6) + 1}`, { volume: 0.4 }), 600);
          }
          
          // Wait for finale to complete
          await new Promise(resolve => setTimeout(resolve, 1400));
        }
        
        // Final pause
        await this.waitForPresentation(300, { skippable: true });
        
        // Thunderkong rule: banana collection does not change multiplier.
      },

    async revealMysterySymbols(mysteryReveals, stepType = "mystery") {
        if (!mysteryReveals || mysteryReveals.length === 0) return;
        
        const cellSize = 70;
        
        // Stop all looping star animations on mystery symbols
        for (const reveal of mysteryReveals) {
          const sprite = this.reelSprites[reveal.reel]?.[reveal.row];
          if (sprite && sprite.starLoopTimers) {
            sprite.starLoopTimers.forEach(timer => clearTimeout(timer));
            sprite.starLoopTimers = [];
          }
        }
        
        // Calculate center for wave effect (with offset)
        const centerX = (clientConfig.area.width * cellSize) / 2 + GRID_OFFSET_X;
        const centerY = (clientConfig.area.height * cellSize) / 2 + GRID_OFFSET_Y;
        
        // Camera shake for impact
        this.cameras.main.shake(SHAKE_MYSTERY_REVEAL_DURATION, SHAKE_MYSTERY_REVEAL_INTENSITY);
        
        // Play mystery reveal sound
        this.playSfx('mystery_reveal', { volume: 0.5 });
        
        // Sort reveals by distance from center for wave effect
        const revealsWithDistance = mysteryReveals.map(reveal => {
          const x = reveal.reel * cellSize + cellSize / 2 + GRID_OFFSET_X;
          const y = (clientConfig.area.height - 1 - reveal.row) * cellSize + cellSize / 2 + GRID_OFFSET_Y;
          const distance = Math.sqrt(Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2));
          return { ...reveal, x, y, distance };
        });
        
        revealsWithDistance.sort((a, b) => a.distance - b.distance);
        
        // Reveal in wave pattern from center outward
        const revealPromises = [];
        
        for (let i = 0; i < revealsWithDistance.length; i++) {
          const reveal = revealsWithDistance[i];
          const { reel, row, revealTo, x, y, distance } = reveal;
          
          const sprite = this.reelSprites[reel]?.[row];
          if (!sprite || sprite.destroyed) continue;
          
          // Wave delay based on distance from center
          const waveDelay = (distance / 70) * 40; // 40ms per cell distance
          
          const revealPromise = new Promise(resolve => {
            setTimeout(() => {
              // Play succession sound for each reveal (cap at 5 to avoid too many sounds)
              if (i < 5) {
                this.playSfx('mystery_reveal_succession', { volume: 0.3 });
              }
              
              // Dark mystical energy wave hits the symbol (small and dark)
              const energyWave = this.add.circle(x, y, 30, 0x008B7A)
                .setAlpha(0)
                .setDepth(DEPTH_SYMBOLS + 3)
                .setBlendMode(Phaser.BlendModes.ADD);
              
              this.tweens.add({
                targets: energyWave,
                alpha: 0.6,
                scale: 1.3,
                duration: 250,
                ease: 'Power2.easeOut',
                onComplete: () => {
                  // Fade energy wave out
                  this.tweens.add({
                    targets: energyWave,
                    alpha: 0,
                    duration: 300,
                    ease: 'Power2.easeIn',
                    onComplete: () => energyWave.destroy()
                  });
                }
              });
              
              // Clean fade transformation - mystery fades out
              this.tweens.add({
                targets: sprite,
                alpha: 0,
                duration: 200,
                ease: 'Power2.easeIn',
                onComplete: () => {
                  // Change to revealed symbol while invisible
                  this.setBonusAwareSymbolTexture(sprite, revealTo);
                  sprite.symbolKey = revealTo;
                  
                  // Use appropriate scale for revealed symbol
                  const trollId = clientConfig.symbolsMapping?.banana3 || 13;
                  const isTroll = revealTo === trollId;
                  const finalScale = getSymbolScale(revealTo);
                  sprite.setScale(finalScale);
                  
                  // Mark troll sprites as 3x3 troll
                  if (isTroll) {
                    sprite.isTroll3x3 = true;
                  }
                  
                  // Fade in the revealed symbol
                  this.tweens.add({
                    targets: sprite,
                    alpha: 1,
                    duration: 300,
                    ease: 'Power2.easeOut',
                    onComplete: resolve
                  });
                }
              });
              
              // Mystical energy particles radiate outward (fewer, more deliberate)
              for (let j = 0; j < 8; j++) {
                const angle = (j / 8) * Math.PI * 2;
                const startDist = 15;
                const endDist = 60;
                
                const particle = this.add.circle(
                  x + Math.cos(angle) * startDist,
                  y + Math.sin(angle) * startDist,
                  4,
                  0x33FFE6
                ).setAlpha(0.8).setDepth(DEPTH_SYMBOLS + 2).setBlendMode(Phaser.BlendModes.ADD);
                
                this.tweens.add({
                  targets: particle,
                  x: x + Math.cos(angle) * endDist,
                  y: y + Math.sin(angle) * endDist,
                  alpha: 0,
                  scale: 0.2,
                  duration: 500,
                  ease: 'Power2.easeOut',
                  onComplete: () => particle.destroy()
                });
              }
              
              // Single powerful energy pulse
              const pulse = this.add.circle(x, y, 40, 0x00B89D)
                .setAlpha(0.4)
                .setDepth(DEPTH_SYMBOLS + 1)
                .setBlendMode(Phaser.BlendModes.ADD);
              
              this.tweens.add({
                targets: pulse,
                scale: 2,
                alpha: 0,
                duration: 600,
                ease: 'Power2.easeOut',
                onComplete: () => pulse.destroy()
              });
              
              // Small glitter sparks (teal and white)
              for (let j = 0; j < 15; j++) {
                setTimeout(() => {
                  const sparkColor = Math.random() > 0.5 ? 0xFFFFFF : 0x33FFE6; // White or light teal
                  const sparkX = x + (Math.random() - 0.5) * 50;
                  const sparkY = y + (Math.random() - 0.5) * 50;
                  
                  const spark = this.add.circle(sparkX, sparkY, Math.random() * 1.5 + 0.5, sparkColor)
                    .setAlpha(1)
                    .setDepth(DEPTH_SYMBOLS + 4)
                    .setBlendMode(Phaser.BlendModes.ADD);
                  
                  // Twinkle effect
                  this.tweens.add({
                    targets: spark,
                    alpha: 0,
                    y: sparkY + (Math.random() - 0.5) * 20,
                    x: sparkX + (Math.random() - 0.5) * 20,
                    duration: Math.random() * 400 + 300,
                    ease: 'Power2.easeOut',
                    onComplete: () => spark.destroy()
                  });
                }, Math.random() * 400);
              }
              
              // No additional stars during reveal - the looping stars are enough!
            }, waveDelay);
          });
          
          revealPromises.push(revealPromise);
        }
        
        // Wait for all reveals to complete
        await Promise.all(revealPromises);
        
        // Final dramatic pause
        await new Promise(resolve => setTimeout(resolve, 300));
      },

    resetForNewSpin() {
        // Reset multiplier
        this.currentMultiplier = 1;
        
        // Remove multiplier effects
        this.cleanupMultiplierEffects();
        
        // Cleanup any remaining time symbol power effects
        this.cleanupTimeSymbolPowerEffects();
        
        // Reset bonus visibility and golden effects
        this.bonusPermanentlyVisible = false;
        this.stormLightningGolden = false;
        this.isInBonusMode = false; // Reset bonus mode flag
        this.setMainGamePortalVisible?.(true);
        this.createOrUpdateSymbolSpawnCurtain?.();
        
        // Stop ambient lightning loops
        this.stopAmbientLightning();
        
        // Stop bonus theme and resume main theme
        this.stopBonusTheme();
        this.stopBonusWonCenterEnergy({ fade: false });
        this.clearBonusFreespinRings({ fade: false });
        this.clearBonusMultiplierFruits();
        
        if (this.bonusSilhouette && !this.bonusSilhouette.destroyed) {
          this.bonusSilhouette.setAlpha(0);
          this.bonusSilhouette.setTint(0xFFFFFF); // Reset tint
          this.bonusSilhouette.setDepth(2.3); // Back behind clouds
        }
        if (this.bonusParticleTimer) {
          this.bonusParticleTimer.destroy();
          this.bonusParticleTimer = null;
        }
        if (this.bonusTextSparkleTimer) {
          this.bonusTextSparkleTimer.destroy();
          this.bonusTextSparkleTimer = null;
        }
        
        // Cleanup bonus chest and its sparkles
        if (this.bonusChestSparkleTimer) {
          this.bonusChestSparkleTimer.destroy();
          this.bonusChestSparkleTimer = null;
        }
        if (this.bonusChest && !this.bonusChest.destroyed) {
          this.tweens.killTweensOf(this.bonusChest);
          this.bonusChest.destroy();
          this.bonusChest = null;
        }
        
        // Reset count-up display
        this.suppressCountUpUntilBonusEndPayout = false;
        this.currentDisplayedWin = 0;
        if (this.countUpText && !this.countUpText.destroyed) {
          this.countUpText.setVisible(false);
        }
        this.bonusMysteryMeterState = { collected: 0, max: 3 };
        this.updateBonusMysteryMeter(this.bonusMysteryMeterState, { isBonus: false, pulse: false });
        this.lightningBeeMeterState = {
          collected: 0,
          max: 3,
          multiplier: 1,
          multiplierStep: 0,
          boardBees: [],
          collectedBees: [],
          nextBeeId: 1
        };
        this.updateLightningBeeMeter(this.lightningBeeMeterState, { isBonus: false, pulse: false });
        this.clearMergeGunAreas();
        
        // Fade out total win text
        if (this.totalWinText && !this.totalWinText.destroyed) {
          this.tweens.add({
            targets: this.totalWinText,
            duration: 100,
            alpha: 0,
            repeat: 0,
            ease: 'Sine.easeInOut'
          });
        }
        
        this.clearMonkeyWildStrengthBadge();
        this.currentHeroAngelMultiplierDisplay = null;
        this.clearHeroWildActiveBadge({ force: true });
        this.currentHeroFootprintSize = 1;
        this.currentHeroRushActive = false;
        this.currentBonusStage = 0;
        this.currentHeroTextureKey = HERO_STAGE_TEXTURE_KEYS.base;
        this.heavenHellBonusEntryAngelArrivalPlayed = false;
        this.resetBonusFruitPile();
        // Keep the current sprite position here. Main-game spin transition owns the
        // visual return-to-center so the angel can fly back instead of snapping.

        // Clean up ALL banana backplates from current sprites
        if (this.reelSprites) {
          for (let reel = 0; reel < this.reelSprites.length; reel++) {
            const column = this.reelSprites[reel];
            if (!column) continue;
            for (let row = 0; row < column.length; row++) {
              const sprite = column[row];
              if (sprite && sprite.bananaBackplate) {
                this.destroyBananaBackplate(sprite);
              }
              if (sprite) {
                this.destroySymbolBonusGridBaseTbmOverlay(sprite, reel, row);
              }
            }
          }
        }
        
        // Clear necromancer banana sprites reference
        this.necromancerBananaSprites = [];
      },

    updateHeroWeapon(weapon = "staff") {
        if (!this.heroSprite || this.heroSprite.destroyed) {
          return; // No hero to update
        }
        
        const footprintSize = Math.max(1, Math.floor(Number(this.currentHeroFootprintSize) || 1));
        const heroTexture = getHeroTexture(weapon, {
          footprintSize,
          rushActive: this.currentHeroRushActive === true,
          bonusStage: this.currentBonusStage
        });
        this.currentHeroWeapon = weapon;
        this.currentHeroTextureKey = heroTexture;
        this.heroSprite.setTexture(heroTexture);
        this.heroSprite.setScale(getHeroScaleForFootprint(footprintSize, heroTexture));
      },

    installHeroPreviewConsoleCommands() {
        if (typeof window === "undefined") return;
    
        this.uninstallHeroPreviewConsoleCommands();
        const previewCommand = (stageOrTexture = 1, options = {}) => this.previewHeroModel(stageOrTexture, options);
        const helpCommand = () => ({
          commands: [
            "tkMonkey(1)",
            "tkMonkey(4)",
            "tkMonkey(5)",
            "tkMonkey(6)",
            "tkMonkey(4, 1.1)",
            "tkMonkey('tk_stage4', { scale: 1.05, reel: 4, row: 2 })"
          ],
          stages: {
            "1,2,3": HERO_STAGE_TEXTURE_KEYS.base,
            4: HERO_STAGE_TEXTURE_KEYS.rush,
            5: HERO_STAGE_TEXTURE_KEYS.giant2,
            6: HERO_STAGE_TEXTURE_KEYS.giant3
          },
          options: {
            scale: "Multiplier on top of the normal in-game scale.",
            scaleMultiplier: "Same as scale.",
            footprint: "Override footprint size, for example 1, 2, or 3.",
            reel: "Board reel to place the monkey on.",
            row: "Board row to place the monkey on.",
            x: "Pixel x position override.",
            y: "Pixel y position override."
          }
        });
    
        window.tkMonkey = previewCommand;
        window.thunderkongMonkey = previewCommand;
        window.tkMonkeyHelp = helpCommand;
        this._heroPreviewConsoleCommand = previewCommand;
        this._heroPreviewHelpCommand = helpCommand;
      },

    uninstallHeroPreviewConsoleCommands() {
        if (typeof window === "undefined") return;
    
        if (this._heroPreviewConsoleCommand) {
          if (window.tkMonkey === this._heroPreviewConsoleCommand) {
            delete window.tkMonkey;
          }
          if (window.thunderkongMonkey === this._heroPreviewConsoleCommand) {
            delete window.thunderkongMonkey;
          }
        }
        if (this._heroPreviewHelpCommand && window.tkMonkeyHelp === this._heroPreviewHelpCommand) {
          delete window.tkMonkeyHelp;
        }
        this._heroPreviewConsoleCommand = null;
        this._heroPreviewHelpCommand = null;
      },

    resolveHeroPreviewModel(stageOrTexture = 1) {
        const rawInput = String(stageOrTexture ?? "").trim();
        const normalizedInput = rawInput.toLowerCase().replace(/\s+/g, "");
        const stageNumber = Math.floor(Number(stageOrTexture));
        const stageModels = {
          1: { stage: 1, textureKey: HERO_STAGE_TEXTURE_KEYS.base, footprintSize: 1 },
          2: { stage: 2, textureKey: HERO_STAGE_TEXTURE_KEYS.base, footprintSize: 1 },
          3: { stage: 3, textureKey: HERO_STAGE_TEXTURE_KEYS.base, footprintSize: 1 },
          4: { stage: 4, textureKey: HERO_STAGE_TEXTURE_KEYS.rush, footprintSize: 1 },
          5: { stage: 5, textureKey: HERO_STAGE_TEXTURE_KEYS.giant2, footprintSize: 2 },
          6: { stage: 6, textureKey: HERO_STAGE_TEXTURE_KEYS.giant3, footprintSize: 3 }
        };
    
        if (stageModels[stageNumber]) {
          return stageModels[stageNumber];
        }
    
        const aliases = {
          base: stageModels[1],
          normal: stageModels[1],
          stage1: stageModels[1],
          stage2: stageModels[2],
          stage3: stageModels[3],
          "stage1-3": stageModels[1],
          stage13: stageModels[1],
          tk_stage1_3: stageModels[1],
          tk_stage13: stageModels[1],
          rush: stageModels[4],
          stage4: stageModels[4],
          tk_stage4: stageModels[4],
          giant2: stageModels[5],
          "2x2": stageModels[5],
          stage5: stageModels[5],
          tk_stage5: stageModels[5],
          giant3: stageModels[6],
          "3x3": stageModels[6],
          stage6: stageModels[6],
          tk_stage6: stageModels[6]
        };
    
        if (aliases[normalizedInput]) {
          return aliases[normalizedInput];
        }
    
        if (rawInput && this.textures?.exists?.(rawInput)) {
          return {
            stage: rawInput,
            textureKey: rawInput,
            footprintSize: Math.max(1, Math.floor(Number(this.currentHeroFootprintSize) || 1))
          };
        }
    
        return null;
      },

    previewHeroModel(stageOrTexture = 1, options = {}) {
        const normalizedOptions = typeof options === "number"
          ? { scale: options }
          : (options && typeof options === "object" ? options : {});
        const model = this.resolveHeroPreviewModel(stageOrTexture);
        if (!model) {
          return {
            ok: false,
            error: `Unknown monkey model: ${stageOrTexture}`,
            help: "Try tkMonkeyHelp()"
          };
        }
    
        const textureKey = model.textureKey;
        if (!this.textures?.exists?.(textureKey)) {
          return {
            ok: false,
            error: `Texture is not loaded: ${textureKey}`
          };
        }
    
        const footprintSize = Math.max(
          1,
          Math.floor(Number(normalizedOptions.footprint ?? normalizedOptions.footprintSize ?? model.footprintSize) || 1)
        );
        const heroStartPos = clientConfig.heroStartingPosition || { reel: 4, row: 2 };
        const useGridPosition =
          Number.isFinite(Number(normalizedOptions.reel)) &&
          Number.isFinite(Number(normalizedOptions.row));
        const gridPosition = useGridPosition
          ? { reel: Number(normalizedOptions.reel), row: Number(normalizedOptions.row) }
          : (
            this.currentHeroAnchor &&
            Number.isFinite(Number(this.currentHeroAnchor.reel)) &&
            Number.isFinite(Number(this.currentHeroAnchor.row))
              ? this.currentHeroAnchor
              : heroStartPos
          );
        const anchorCenter = this.getHeroAnchorCenter(gridPosition.reel, gridPosition.row, footprintSize);
        const x = Number.isFinite(Number(normalizedOptions.x))
          ? Number(normalizedOptions.x)
          : (this.heroSprite && !this.heroSprite.destroyed ? this.heroSprite.x : anchorCenter.x);
        const y = Number.isFinite(Number(normalizedOptions.y))
          ? Number(normalizedOptions.y)
          : (this.heroSprite && !this.heroSprite.destroyed ? this.heroSprite.y : anchorCenter.y);
        const scaleMultiplier = Math.max(
          0.05,
          Number(normalizedOptions.scaleMultiplier ?? normalizedOptions.scale ?? 1) || 1
        );
        const baseScale = getHeroScaleForFootprint(footprintSize, textureKey);
        const finalScale = baseScale * scaleMultiplier;
    
        if (!this.heroSprite || this.heroSprite.destroyed) {
          this.heroSprite = this.add.image(x, y, textureKey)
            .setOrigin(0.5)
            .setDepth(DEPTH_HERO)
            .setAlpha(1);
        } else {
          this.tweens.killTweensOf(this.heroSprite);
          this.heroSprite
            .setVisible(true)
            .setAlpha(1)
            .setPosition(x, y);
        }
    
        this.heroSprite
          .setTexture(textureKey)
          .setScale(finalScale);
        this.currentHeroFootprintSize = footprintSize;
        this.currentHeroRushActive = textureKey === HERO_STAGE_TEXTURE_KEYS.rush;
        this.currentHeroTextureKey = textureKey;
        this.currentHeroAnchor = {
          reel: Number(gridPosition.reel),
          row: Number(gridPosition.row)
        };
    
        return {
          ok: true,
          stage: model.stage,
          textureKey,
          footprintSize,
          baseScale,
          scaleMultiplier,
          finalScale,
          displayWidth: this.heroSprite.displayWidth,
          displayHeight: this.heroSprite.displayHeight,
          position: { x, y }
        };
      },

    getGridCellCenter(reel, row) {
        const cellSize = 70;
        return {
          x: reel * cellSize + cellSize / 2 + GRID_OFFSET_X,
          y: (clientConfig.area.height - 1 - row) * cellSize + cellSize / 2 + GRID_OFFSET_Y
        };
      },

    getHeroAnchorCenter(reel, row, heroFootprintSize = 1) {
        const footprintSize = Math.max(1, Math.floor(Number(heroFootprintSize) || 1));
        if (footprintSize <= 1) {
          return this.getGridCellCenter(reel, row);
        }
    
        let totalX = 0;
        let totalY = 0;
        let count = 0;
        for (let reelOffset = 0; reelOffset < footprintSize; reelOffset++) {
          for (let rowOffset = 0; rowOffset < footprintSize; rowOffset++) {
            const center = this.getGridCellCenter(reel + reelOffset, row + rowOffset);
            totalX += center.x;
            totalY += center.y;
            count++;
          }
        }
    
        return {
          x: totalX / count,
          y: totalY / count
        };
      },

    getMonkeyLevelUpBurstCenter(heroPosition = null, heroFootprintSize = null, { preferHeroSprite = true } = {}) {
        if (preferHeroSprite && this.heroSprite && !this.heroSprite.destroyed) {
          return { x: this.heroSprite.x, y: this.heroSprite.y };
        }
    
        const position = heroPosition && typeof heroPosition === "object"
          ? heroPosition.heroPosition || heroPosition.position || heroPosition
          : null;
        if (position && Number.isFinite(Number(position.x)) && Number.isFinite(Number(position.y))) {
          return {
            x: Number(position.x),
            y: Number(position.y)
          };
        }
    
        const footprintSize = Math.max(
          1,
          Math.floor(Number(heroFootprintSize ?? heroPosition?.heroFootprintSize ?? this.currentHeroFootprintSize) || 1)
        );
    
        if (position && Number.isFinite(Number(position.reel)) && Number.isFinite(Number(position.row))) {
          return this.getHeroAnchorCenter(Number(position.reel), Number(position.row), footprintSize);
        }
    
        if (
          this.currentHeroAnchor &&
          Number.isFinite(Number(this.currentHeroAnchor.reel)) &&
          Number.isFinite(Number(this.currentHeroAnchor.row))
        ) {
          return this.getHeroAnchorCenter(this.currentHeroAnchor.reel, this.currentHeroAnchor.row, footprintSize);
        }
    
        if (this.heroSprite && !this.heroSprite.destroyed) {
          return { x: this.heroSprite.x, y: this.heroSprite.y };
        }
    
        return null;
      },

    playMonkeyLevelUpSlowMotionCue(intensity = "medium") {
        const isMajor = intensity !== "medium";
        this.beginBriefSlowMo?.(isMajor ? 0.48 : 0.58, isMajor ? 360 : 260, {
          affectTimers: false
        });
      },

    async playHeroGrowthPowerBuildUp(heroFootprintSize = 1, heroPosition = null) {
        const footprintSize = Math.max(1, Math.floor(Number(heroFootprintSize) || 1));
        if (footprintSize <= 1) return;
    
        const isHuge = footprintSize >= 3;
        const duration = isHuge ? 660 : 480;
        const center = this.getMonkeyLevelUpBurstCenter({ heroPosition, heroFootprintSize: footprintSize }, footprintSize, {
          preferHeroSprite: true
        });
    
        this.beginBriefSlowMo?.(isHuge ? 0.42 : 0.5, duration + 140, {
          affectTimers: false
        });
        this.cameras?.main?.shake(Math.round(duration * 0.5), isHuge ? 0.008 : 0.005);
        this.time.delayedCall(Math.round(duration * 0.46), () => {
          this.cameras?.main?.shake(Math.round(duration * 0.58), isHuge ? 0.019 : 0.012);
        });
    
        if (center) {
          const depth = DEPTH_HERO + 21;
          const core = this.add.circle(center.x, center.y, isHuge ? 44 : 34, 0xFFF6A8, isHuge ? 0.34 : 0.25)
            .setDepth(depth)
            .setBlendMode(Phaser.BlendModes.ADD)
            .setScale(0.42);
          const ring = this.add.circle(center.x, center.y, isHuge ? 74 : 58, 0xFFD84A, 0)
            .setDepth(depth - 1)
            .setStrokeStyle(isHuge ? 8 : 6, 0xFFF0A6, isHuge ? 0.92 : 0.78)
            .setBlendMode(Phaser.BlendModes.ADD)
            .setScale(0.32);
    
          this.tweens.add({
            targets: core,
            scale: isHuge ? 3.15 : 2.3,
            alpha: 0,
            duration,
            ease: "Cubic.easeOut",
            onComplete: () => {
              if (!core.destroyed) core.destroy();
            }
          });
          this.tweens.add({
            targets: ring,
            scale: isHuge ? 3.45 : 2.55,
            alpha: 0,
            duration: duration + 160,
            ease: "Cubic.easeOut",
            onComplete: () => {
              if (!ring.destroyed) ring.destroy();
            }
          });
          this.playHeroLightningLevelUpBurst({ x: center.x, y: center.y, heroFootprintSize: footprintSize }, {
            heroFootprintSize: footprintSize,
            intensity: "major",
            preferHeroSprite: true,
            boltCount: isHuge ? 11 : 8,
            durationMs: duration + 120,
            depth: depth + 2,
            boltLengthScale: isHuge ? 2.05 : 1.55,
            boltSizeScale: isHuge ? 1.48 : 1.22,
            flashScale: isHuge ? 1.8 : 1.35,
            flashAlphaScale: isHuge ? 1.42 : 1.18
          });
        }
    
        await this.waitForPresentation(duration, { skippable: true });
      },

    playHeroLightningLevelUpBurst(heroPosition = null, {
        heroFootprintSize = null,
        intensity = "major",
        preferHeroSprite = true,
        boltCount = null,
        durationMs = null,
        depth = null,
        boltLengthScale = 1,
        boltSizeScale = 1,
        flashScale = 1,
        flashAlphaScale = 1
      } = {}) {
        const frameKeys = this.ensureHeroLightningAuraFrames();
        if (!frameKeys.length) return;
    
        const center = this.getMonkeyLevelUpBurstCenter(heroPosition, heroFootprintSize, { preferHeroSprite });
        if (!center) return;
    
        const footprintSize = Math.max(
          1,
          Math.floor(Number(heroFootprintSize ?? heroPosition?.heroFootprintSize ?? this.currentHeroFootprintSize) || 1)
        );
        const hero = preferHeroSprite && this.heroSprite && !this.heroSprite.destroyed
          ? this.heroSprite
          : null;
        const heroHeight = Math.max(110, Number(hero?.displayHeight) || (116 + footprintSize * 34));
        const isMajor = intensity !== "medium";
        const resolvedBoltCount = Math.max(3, Math.floor(Number(boltCount) || (isMajor ? 12 : 8)));
        const baseRadius = Math.max(24, 18 + footprintSize * 15);
        const resolvedDuration = Math.max(260, Math.floor(Number(durationMs) || (isMajor ? 620 : 460)));
        const resolvedDepth = Number.isFinite(Number(depth)) ? Number(depth) : DEPTH_HERO + 22;
        const resolvedBoltLengthScale = Math.max(0.2, Number(boltLengthScale) || 1);
        const resolvedBoltSizeScale = Math.max(0.2, Number(boltSizeScale) || 1);
        const resolvedFlashScale = Math.max(0.2, Number(flashScale) || 1);
        const resolvedFlashAlphaScale = Math.max(0.2, Number(flashAlphaScale) || 1);
        const flashAlpha = Phaser.Math.Clamp((isMajor ? 0.56 : 0.42) * resolvedFlashAlphaScale, 0, 1);
    
        const centerFlash = this.add.circle(center.x, center.y, baseRadius * (isMajor ? 1.35 : 1.08), 0xFFF4A6, flashAlpha)
          .setDepth(resolvedDepth - 1)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setScale(0.3);
    
        this.tweens.add({
          targets: centerFlash,
          scale: (isMajor ? 2.25 : 1.75) * resolvedFlashScale,
          alpha: 0,
          duration: Math.round(resolvedDuration * 0.55),
          ease: "Cubic.easeOut",
          onComplete: () => centerFlash.destroy()
        });
    
        for (let index = 0; index < resolvedBoltCount; index++) {
          const frameKey = frameKeys[Phaser.Math.Between(0, frameKeys.length - 1)];
          const angle = (index / resolvedBoltCount) * Math.PI * 2 + Phaser.Math.FloatBetween(-0.16, 0.16);
          const anchorDistance = baseRadius * Phaser.Math.FloatBetween(0.24, 0.54);
          const anchorX = center.x + Math.cos(angle) * anchorDistance;
          const anchorY = center.y + Math.sin(angle) * anchorDistance;
          const boltAngle = angle * 180 / Math.PI + 270 + Phaser.Math.Between(-9, 9);
          const rawBaseScale = (heroHeight / 500) * Phaser.Math.FloatBetween(isMajor ? 0.78 : 0.62, isMajor ? 1.08 : 0.86);
          const baseScale = rawBaseScale * resolvedBoltSizeScale;
          const targetScaleY = rawBaseScale * Phaser.Math.FloatBetween(isMajor ? 0.46 : 0.34, isMajor ? 0.68 : 0.5) * resolvedBoltLengthScale;
          const delay = Phaser.Math.Between(0, isMajor ? 120 : 80);
          const duration = Phaser.Math.Between(
            Math.round(resolvedDuration * 0.42),
            Math.round(resolvedDuration * 0.72)
          );
          const sparkTint = index % 3 === 0 ? 0xFFFFFF : (isMajor ? 0xFFF8B8 : 0xFFE778);
          const sparkAlpha = isMajor ? 1 : 0.94;
          const glowAlpha = isMajor ? 0.7 : 0.54;
    
          this.time.delayedCall(delay, () => {
            const glow = this.add.image(anchorX, anchorY, HERO_LIGHTNING_SHEET_TEXTURE_KEY, frameKey)
              .setOrigin(0.5, 1)
              .setScale(baseScale * 1.45, 0.02)
              .setAngle(boltAngle)
              .setDepth(resolvedDepth - 0.01)
              .setAlpha(0)
              .setTint(0xFFB72A)
              .setBlendMode(Phaser.BlendModes.ADD);
            const spark = this.add.image(anchorX, anchorY, HERO_LIGHTNING_SHEET_TEXTURE_KEY, frameKey)
              .setOrigin(0.5, 1)
              .setScale(baseScale, 0.02)
              .setAngle(boltAngle)
              .setDepth(resolvedDepth)
              .setAlpha(0)
              .setTint(sparkTint)
              .setBlendMode(Phaser.BlendModes.ADD);
    
            this.heroLightningAuraSparks.push(glow, spark);
            this.tweens.add({
              targets: { progress: 0 },
              progress: 1,
              duration,
              ease: "Cubic.easeOut",
              onUpdate: (tween) => {
                if (spark.destroyed || glow.destroyed) return;
                const progress = Phaser.Math.Clamp(Number(tween?.getValue?.() || 0), 0, 1);
                const reveal = progress < 0.28
                  ? Phaser.Math.Easing.Cubic.Out(progress / 0.28)
                  : 1;
                const fade = progress < 0.46
                  ? progress / 0.46
                  : 1 - ((progress - 0.46) / 0.54);
                const easedFade = Phaser.Math.Clamp(fade, 0, 1);
                spark.setScale(baseScale, Math.max(0.02, targetScaleY * reveal));
                glow.setScale(baseScale * 1.45, Math.max(0.02, targetScaleY * 1.08 * reveal));
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
        }
      },

    playMonkeyLevelUpRingBurst(heroPosition = null, {
        heroFootprintSize = null,
        intensity = "major",
        preferHeroSprite = true,
        durationMs = null,
        radialScale = 1
      } = {}) {
        const center = this.getMonkeyLevelUpBurstCenter(heroPosition, heroFootprintSize, { preferHeroSprite });
        if (!center) {
          return Promise.resolve();
        }
    
        const footprintSize = Math.max(
          1,
          Math.floor(Number(heroFootprintSize ?? heroPosition?.heroFootprintSize ?? this.currentHeroFootprintSize) || 1)
        );
        const isMajor = intensity !== "medium";
        const baseDuration = isMajor ? 720 : 500;
        const resolvedDuration = Math.max(260, Math.floor(Number(durationMs) || baseDuration));
        const durationScale = resolvedDuration / baseDuration;
        const resolvedRadialScale = Phaser.Math.Clamp(Number(radialScale) || 1, 0.45, 1.2);
        const baseRadius = Math.max(26, 24 + footprintSize * 16) * resolvedRadialScale;
        const maxScale = (isMajor ? 4.35 : 3.35) * resolvedRadialScale;
        const depth = DEPTH_HERO + 18;
        const colors = [0xFFF45C, 0xFFD24A, 0xFFEFA8, 0xFFFFFF];
    
        this.playSfx?.("wins_explode", { volume: (isMajor ? 0.34 : 0.22) * resolvedRadialScale });
        this.playSfx?.("wins_highlight", { volume: (isMajor ? 0.32 : 0.22) * resolvedRadialScale });
        this.playSfx?.("lightning_at_lvl_up", { volume: (isMajor ? 0.58 : 0.46) * resolvedRadialScale });
        this.cameras?.main?.shake(
          isMajor ? 260 : 180,
          (isMajor ? 0.011 : 0.007) * resolvedRadialScale
        );
        const growthPower = Math.max(0, Math.min(2, footprintSize - 1));
        this.playHeroLightningLevelUpBurst(heroPosition, {
          heroFootprintSize: footprintSize,
          intensity,
          preferHeroSprite,
          durationMs: resolvedDuration,
          depth: depth + 4,
          boltCount: Math.max(4, Math.floor((isMajor ? 12 + growthPower * 5 : 8 + growthPower * 3) * resolvedRadialScale)),
          boltLengthScale: (1 + growthPower * 0.68) * resolvedRadialScale,
          boltSizeScale: (1 + growthPower * 0.32) * resolvedRadialScale,
          flashScale: (1 + growthPower * 0.42) * resolvedRadialScale,
          flashAlphaScale: (1 + growthPower * 0.22) * resolvedRadialScale
        });
    
        const flash = this.add.circle(center.x, center.y, baseRadius * 0.78, 0xFFF45C, isMajor ? 0.58 : 0.42)
          .setDepth(depth + 1)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setScale(0.45);
        this.tweens.add({
          targets: flash,
          scale: isMajor ? 2.5 : 1.85,
          alpha: 0,
          duration: Math.round((isMajor ? 310 : 240) * durationScale),
          ease: "Cubic.easeOut",
          onComplete: () => flash.destroy()
        });
    
        const ringSpecs = [
          { delay: 0, color: 0xFFF45C, width: isMajor ? 9 : 7, scale: maxScale, alpha: 0.95 },
          { delay: 70, color: 0xFFD24A, width: isMajor ? 7 : 5, scale: maxScale * 0.88, alpha: 0.78 },
          { delay: 130, color: 0xFFEFA8, width: isMajor ? 6 : 4, scale: maxScale * 1.04, alpha: 0.72 }
        ];
    
        ringSpecs.forEach((spec, index) => {
          const ring = this.add.circle(center.x, center.y, baseRadius, spec.color, 0)
            .setDepth(depth - index)
            .setStrokeStyle(spec.width, spec.color, spec.alpha)
            .setBlendMode(Phaser.BlendModes.ADD)
            .setScale(0.45);
    
          this.tweens.add({
            targets: ring,
            scale: spec.scale,
            alpha: 0,
            delay: Math.round(spec.delay * durationScale),
            duration: Math.round((isMajor ? 560 : 430) * durationScale),
            ease: "Cubic.easeOut",
            onComplete: () => ring.destroy()
          });
        });
    
        const beamCount = Math.max(8, Math.floor((isMajor ? 28 : 18) * resolvedRadialScale));
        for (let i = 0; i < beamCount; i++) {
          const angle = (i / beamCount) * Math.PI * 2 + Phaser.Math.FloatBetween(-0.08, 0.08);
          const color = colors[i % colors.length];
          const length = Phaser.Math.Between(isMajor ? 74 : 46, isMajor ? 142 : 94);
          const width = Phaser.Math.FloatBetween(isMajor ? 4 : 3, isMajor ? 8 : 5);
          const startOffset = baseRadius * Phaser.Math.FloatBetween(0.24, 0.42);
          const beam = this.add.rectangle(
            center.x + Math.cos(angle) * startOffset,
            center.y + Math.sin(angle) * startOffset,
            length,
            width,
            color,
            0.78
          )
            .setOrigin(0, 0.5)
            .setRotation(angle)
            .setDepth(depth - 2)
            .setBlendMode(Phaser.BlendModes.ADD)
            .setScale(0.08, 1);
    
          this.tweens.add({
            targets: beam,
            x: beam.x + Math.cos(angle) * Phaser.Math.Between(22, isMajor ? 66 : 42),
            y: beam.y + Math.sin(angle) * Phaser.Math.Between(22, isMajor ? 66 : 42),
            scaleX: 1,
            alpha: 0,
            delay: Phaser.Math.Between(0, Math.round((isMajor ? 110 : 70) * durationScale)),
            duration: Phaser.Math.Between(
              Math.round((isMajor ? 330 : 240) * durationScale),
              Math.round((isMajor ? 560 : 410) * durationScale)
            ),
            ease: "Cubic.easeOut",
            onComplete: () => beam.destroy()
          });
        }
    
        const sparkCount = Math.max(12, Math.floor((isMajor ? 42 : 24) * resolvedRadialScale));
        for (let i = 0; i < sparkCount; i++) {
          const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
          const distance = Phaser.Math.Between(baseRadius, isMajor ? 210 : 150);
          const color = colors[Phaser.Math.Between(0, colors.length - 1)];
          const spark = this.add.circle(
            center.x + Phaser.Math.Between(-8, 8),
            center.y + Phaser.Math.Between(-8, 8),
            Phaser.Math.FloatBetween(2.2, isMajor ? 5.4 : 4.2),
            color,
            0.9
          )
            .setDepth(depth + 2)
            .setBlendMode(Phaser.BlendModes.ADD);
    
          this.tweens.add({
            targets: spark,
            x: center.x + Math.cos(angle) * distance,
            y: center.y + Math.sin(angle) * distance,
            scale: 0.15,
            alpha: 0,
            delay: Phaser.Math.Between(0, Math.round((isMajor ? 120 : 80) * durationScale)),
            duration: Phaser.Math.Between(
              Math.round((isMajor ? 360 : 260) * durationScale),
              Math.round((isMajor ? 680 : 470) * durationScale)
            ),
            ease: "Quart.easeOut",
            onComplete: () => spark.destroy()
          });
        }
    
        return this.waitForPresentation(resolvedDuration, { skippable: true });
      },

    playBonusWonFloatingLabel(text = "BONUS WON", options = {}) {
        const displayText = String(text || "BONUS WON").toUpperCase();
        const fontSize = options.fontSize || "54px";
        const glowFontSize = options.glowFontSize || "58px";
        const cellSize = 70;
        const centerX = GRID_OFFSET_X + (clientConfig.area.width * cellSize) / 2;
        const centerY = GRID_OFFSET_Y + (clientConfig.area.height * cellSize) / 2 - 12;
        const depth = DEPTH_HERO + 28;
        const freespinAwardMatch = displayText.match(/^(\d+)\s+FREESPINS?\s+WON$/);
        if (freespinAwardMatch) {
          this.showBonusFreespinRingAward(Number(freespinAwardMatch[1]));
        }
        if (options.lightningBurst !== false) {
          this.playHeroLightningLevelUpBurst({ x: centerX, y: centerY + 22 }, {
            heroFootprintSize: options.heroFootprintSize ?? Math.max(1, Number(this.currentHeroFootprintSize) || 1),
            intensity: options.lightningIntensity || "major",
            preferHeroSprite: options.preferHeroLightningSprite !== false,
            boltCount: options.lightningBoltCount ?? Phaser.Math.Between(9, 13),
            durationMs: options.lightningDurationMs ?? 980,
            depth: depth - 3,
            boltLengthScale: options.lightningBoltLengthScale ?? 3.1,
            boltSizeScale: options.lightningBoltSizeScale ?? 1.58,
            flashScale: options.lightningFlashScale ?? 2.15,
            flashAlphaScale: options.lightningFlashAlphaScale ?? 1.65
          });
        }
        if (options.cracklingLightning !== false) {
          const collectTarget = this.getCenterCollectTarget();
          this.startBonusWonCenterEnergy(collectTarget.x, collectTarget.y, {
            depth: depth - 2,
            scale: options.cracklingLightningScale ?? 1.08,
            tint: options.cracklingLightningTint ?? 0x55FF88
          });
        }
    
        const glow = this.add.text(centerX, centerY + 4, displayText, {
          fontSize: glowFontSize,
          fontFamily: '"Cinzel", "Times New Roman", serif',
          fontStyle: "900",
          color: "#FFEFA8",
          stroke: "#5A2F00",
          strokeThickness: 12
        })
          .setOrigin(0.5)
          .setDepth(depth - 1)
          .setAlpha(0.38)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setScale(0.72);
    
        const label = this.add.text(centerX, centerY, displayText, {
          fontSize,
          fontFamily: '"Cinzel", "Times New Roman", serif',
          fontStyle: "900",
          color: "#FFF7C2",
          stroke: "#1F1605",
          strokeThickness: 8,
          shadow: {
            offsetX: 0,
            offsetY: 4,
            color: "#000000",
            blur: 10,
            fill: true
          }
        })
          .setOrigin(0.5)
          .setDepth(depth)
          .setAlpha(0)
          .setScale(0.96);
    
        this.tweens.add({
          targets: glow,
          y: centerY - 178,
          scale: 1.08,
          alpha: 0,
          duration: 2300,
          ease: "Sine.easeOut",
          onComplete: () => glow.destroy()
        });
    
        return new Promise((resolve) => {
          this.tweens.add({
            targets: label,
            alpha: 1,
            duration: 360,
            ease: "Sine.easeOut",
            onComplete: () => {
              this.tweens.add({
                targets: label,
                y: centerY - 190,
                alpha: 0,
                scale: 1.02,
                duration: 2050,
                ease: "Sine.easeInOut",
                onComplete: () => {
                  if (!label.destroyed) {
                    label.destroy();
                  }
                  resolve();
                }
              });
            }
          });
        });
      },

    getCurrentHeroFootprintCellKeys() {
        const footprintSize = Math.max(1, Math.floor(Number(this.currentHeroFootprintSize) || 1));
        const heroAnchor = this.currentHeroAnchor;
        if (!heroAnchor || !Number.isFinite(heroAnchor.reel) || !Number.isFinite(heroAnchor.row)) {
          return new Set();
        }
    
        const keys = new Set();
        for (let reelOffset = 0; reelOffset < footprintSize; reelOffset++) {
          for (let rowOffset = 0; rowOffset < footprintSize; rowOffset++) {
            keys.add(`${heroAnchor.reel + reelOffset},${heroAnchor.row + rowOffset}`);
          }
        }
        return keys;
      },

    syncHeroBonusForm(heroFootprintSize = 1, animate = false, heroPosition = null) {
        if (!this.heroSprite || this.heroSprite.destroyed) return;
        const footprintSize = Math.max(1, Math.floor(Number(heroFootprintSize) || 1));
        this.currentHeroFootprintSize = footprintSize;
        if (heroPosition && Number.isFinite(heroPosition.reel) && Number.isFinite(heroPosition.row)) {
          this.currentHeroAnchor = {
            reel: Number(heroPosition.reel),
            row: Number(heroPosition.row)
          };
        }
        const heroTexture = getHeroTexture(this.currentHeroWeapon || "staff", {
          footprintSize,
          rushActive: this.currentHeroRushActive === true,
          bonusStage: this.currentBonusStage
        });
        const targetScale = getHeroScaleForFootprint(footprintSize, heroTexture);
        this.currentHeroTextureKey = heroTexture;
        this.heroSprite.setTexture(heroTexture);
        const hasHeroPosition =
          heroPosition &&
          Number.isFinite(heroPosition.reel) &&
          Number.isFinite(heroPosition.row);
        const targetCenter = hasHeroPosition
          ? this.getHeroAnchorCenter(heroPosition.reel, heroPosition.row, footprintSize)
          : null;
    
        if (animate) {
          this.tweens.killTweensOf(this.heroSprite);
          return new Promise((resolve) => {
            this.tweens.add({
              targets: this.heroSprite,
              x: targetCenter?.x ?? this.heroSprite.x,
              y: targetCenter?.y ?? this.heroSprite.y,
              scaleX: targetScale,
              scaleY: targetScale,
              duration: 220,
              ease: 'Back.easeOut',
              onComplete: resolve
            });
          });
        }
    
        if (targetCenter) {
          this.heroSprite.setPosition(targetCenter.x, targetCenter.y);
        }
        this.heroSprite.setScale(targetScale);
        return Promise.resolve();
      },

    async animateHeroGrowthExpansion(bonusStageEvent = null) {
        if (!bonusStageEvent || !this.heroSprite || this.heroSprite.destroyed) {
          return;
        }
    
        const consumedCells = Array.isArray(bonusStageEvent.growthConsumedCells)
          ? bonusStageEvent.growthConsumedCells
          : [];
        const growthCollectedSymbols = Array.isArray(bonusStageEvent.growthCollectedSymbols)
          ? bonusStageEvent.growthCollectedSymbols
          : [];
        const growthCollectedByKey = new Map(
          growthCollectedSymbols.map((entry) => [`${entry.reel},${entry.row}`, entry])
        );
        const featureCollectionKeys = new Set(
          (Array.isArray(bonusStageEvent.featureCollectionKeys) ? bonusStageEvent.featureCollectionKeys : [])
            .map((key) => String(key))
        );
        const heroPosition = bonusStageEvent.heroPosition || null;
        const heroFootprintSize = Math.max(1, Math.floor(Number(bonusStageEvent.heroFootprintSize) || 1));
        this.currentHeroFootprintSize = heroFootprintSize;
        const growthFxPromises = [];
    
        consumedCells.forEach((cell) => {
          if (!Number.isFinite(cell?.reel) || !Number.isFinite(cell?.row)) return;
          const cellCenter = this.getGridCellCenter(cell.reel, cell.row);
          const sprite = this.reelSprites?.[cell.reel]?.[cell.row];
          const cellKey = `${cell.reel},${cell.row}`;
          const collectedEntry = growthCollectedByKey.get(`${cell.reel},${cell.row}`);
          const wasFeatureSymbol =
            Number(cell?.wasSymbol) === MERGE_GUN_FEATURE_SYMBOL_ID ||
            Number(cell?.wasSymbol) === BONUS_MYSTERY_FEATURE_SYMBOL_ID ||
            Number(cell?.wasSymbol) === LIGHTNING_BEE_FEATURE_SYMBOL_ID ||
            this.getDisplayObjectSymbolId(sprite) === MERGE_GUN_FEATURE_SYMBOL_ID ||
            this.getDisplayObjectSymbolId(sprite) === BONUS_MYSTERY_FEATURE_SYMBOL_ID ||
            this.getDisplayObjectSymbolId(sprite) === LIGHTNING_BEE_FEATURE_SYMBOL_ID;
          const preserveForFeaturePickup = featureCollectionKeys.has(cellKey) && wasFeatureSymbol;
    
          if (collectedEntry) {
            let collectedSprite = sprite;
            if (collectedSprite && !collectedSprite.destroyed) {
              this.reelSprites[cell.reel][cell.row] = null;
              this.tweens.killTweensOf(collectedSprite);
              this.destroyBananaBackplate(collectedSprite);
            } else {
              collectedSprite = this.add.image(cellCenter.x, cellCenter.y, this.getBonusAwareSymbolTextureKey(collectedEntry.symbol))
                .setOrigin(0.5)
                .setScale(getSymbolScale(collectedEntry.symbol))
                .setDepth(DEPTH_SYMBOLS);
              collectedSprite.symbolKey = normalizeSymbolKey(collectedEntry.symbol);
            }
    
            if (this.currentAction === "freespinbananaHunt") {
              this.markActionBonusCollectionAnimated(collectedEntry);
              if (this.isBonusImmediateLowSymbol(collectedEntry.symbol)) {
                growthFxPromises.push(this.animateImmediateLowBonusPositionUpgrade(
                  {
                    reel: collectedEntry.reel,
                    row: collectedEntry.row,
                    symbol: collectedEntry.symbol,
                    immediatePositionUpgrade: true,
                    valueTbm: collectedEntry.valueTbm
                  },
                  collectedSprite,
                  collectedEntry.symbol
                ));
              } else {
                growthFxPromises.push(this.animateSpriteIntoBonusFruitPile(collectedSprite, collectedEntry.symbol));
              }
            } else {
              growthFxPromises.push(this.animateSpriteIntoCenterCollector(collectedSprite, collectedEntry.symbol));
            }
          } else if (sprite && !sprite.destroyed && !preserveForFeaturePickup) {
            this.reelSprites[cell.reel][cell.row] = null;
            this.tweens.killTweensOf(sprite);
            this.destroyBananaBackplate(sprite);
            sprite.isBeingDestroyed = true;
            growthFxPromises.push(new Promise((resolve) => {
              this.tweens.add({
                targets: sprite,
                alpha: 0,
                scale: Math.max(0.2, (sprite.scaleX || normalScale) * 0.35),
                angle: sprite.angle + Phaser.Math.Between(-25, 25),
                duration: 180,
                ease: 'Back.easeIn',
                onComplete: () => {
                  if (!sprite.destroyed) {
                    sprite.destroy();
                  }
                  resolve();
                }
              });
            }));
          }
    
          const burstColor = cell?.banana ? 0xFFE066 : 0xF2F2F2;
          this.playMonkeySymbolClearLightningBurst(cellCenter.x, cellCenter.y, {
            depth: DEPTH_HERO + 2,
            radius: cell?.banana ? 36 : 30,
            boltCount: cell?.banana ? 4 : 3,
            color: cell?.banana ? 0xFFE778 : 0xF8F8FF,
            intensityScale: 0.68
          });
          for (let i = 0; i < 7; i++) {
            const particle = this.add.circle(
              cellCenter.x + Phaser.Math.Between(-10, 10),
              cellCenter.y + Phaser.Math.Between(-10, 10),
              Phaser.Math.FloatBetween(1.5, 3.5),
              burstColor
            ).setAlpha(0.8).setDepth(DEPTH_HERO - 1);
    
            this.tweens.add({
              targets: particle,
              x: particle.x + Phaser.Math.Between(-34, 34),
              y: particle.y + Phaser.Math.Between(-34, 34),
              alpha: 0,
              scale: 0.5,
              duration: 260,
              ease: 'Power2.easeOut',
              onComplete: () => particle.destroy()
            });
          }
        });
    
        await this.playHeroGrowthPowerBuildUp(heroFootprintSize, heroPosition);
        this.playMonkeyLevelUpSlowMotionCue("major");
        const levelUpBurst = this.playMonkeyLevelUpRingBurst({ heroPosition, heroFootprintSize }, {
          heroFootprintSize,
          intensity: "major",
          durationMs: 1500
        });
        void levelUpBurst.catch(() => {});
        const heroTween = this.syncHeroBonusForm(heroFootprintSize, true, heroPosition);
        await Promise.all([heroTween, ...growthFxPromises]);
      },

    placeHeroAtStart(weapon = "staff") {
        const heroStartPos = clientConfig.heroStartingPosition || { reel: 4, row: 2 };
        const cellSize = 70;
        
        const heroX = heroStartPos.reel * cellSize + cellSize / 2 + GRID_OFFSET_X;
        const heroY = (clientConfig.area.height - 1 - heroStartPos.row) * cellSize + cellSize / 2 + GRID_OFFSET_Y;
        
        // Remove ALL symbols on the board
        if (this.reelSprites) {
          for (let reel = 0; reel < this.reelSprites.length; reel++) {
            const column = this.reelSprites[reel];
            if (!column) continue;
            for (let row = 0; row < column.length; row++) {
              const sprite = column[row];
              if (sprite && !sprite.destroyed) {
                sprite.destroy();
              }
              column[row] = null;
            }
          }
        }
        
        this.currentHeroFootprintSize = 1;
        this.currentHeroRushActive = false;
        this.currentBonusStage = 0;
        const heroTexture = getHeroTexture(weapon, { footprintSize: 1 });
        const heroScale = getHeroScaleForFootprint(1, heroTexture);
        this.currentHeroWeapon = weapon;
        this.currentHeroTextureKey = heroTexture;
        
        // Destroy existing hero if present
        if (this.heroSprite && !this.heroSprite.destroyed) {
          this.heroSprite.destroy();
          this.clearMonkeyWildStrengthBadge();
          this.clearHeroWildActiveBadge();
        }
        this.clearMonkeyWildStrengthBadge();
        this.clearHeroWildActiveBadge();
        
        // Create hero at starting position (same scale as symbols)
        this.heroSprite = this.add.image(heroX, heroY, heroTexture)
          .setOrigin(0.5)
          .setScale(heroScale)
          .setDepth(DEPTH_HERO)
          .setAlpha(0);
        
        // Fade in hero
        this.tweens.add({
          targets: this.heroSprite,
          alpha: 1,
          scale: heroScale * 1.1,
          duration: 400,
          ease: 'Power2',
          onComplete: () => {
            // Settle to normal size
            this.tweens.add({
              targets: this.heroSprite,
              scale: heroScale,
              duration: 200,
              ease: 'Sine.easeOut'
            });
          }
        });
        
      },

    syncMainGameHeroWildState(gameState = {}) {
        const heroPosition = gameState?.heroPosition || null;
        if (this.isHeroAtStartingPosition?.(heroPosition)) {
          return false;
        }

        const footprintSize = Math.max(1, Math.floor(Number(gameState?.heroFootprintSize) || 1));
        this.applyHeroModel?.({
          weapon: this.currentHeroWeapon || "staff",
          reel: Number(heroPosition.reel),
          row: Number(heroPosition.row),
          footprintSize
        });
        return true;
      },

    showMainGameHeroAtCenter(weapon = "staff", options = {}) {
        const heroX = GRID_OFFSET_X + (clientConfig.area.width * 70) / 2;
        const heroY = GRID_OFFSET_Y + (clientConfig.area.height * 70) / 2;
        const heroTexture = getHeroTexture(weapon, { footprintSize: 1, rushActive: false, bonusStage: 0 });
        const heroScale = getHeroScaleForFootprint(1, heroTexture);
        const animateFromCurrentPosition = options?.animateFromCurrentPosition === true;
        const moveSpeedPixelsPerSecond = Math.max(180, Number(options?.moveSpeedPixelsPerSecond) || 420);
        const minimumMoveDurationMs = Math.max(140, Number(options?.minimumMoveDurationMs) || 260);
        const maximumMoveDurationMs = Math.max(minimumMoveDurationMs, Number(options?.maximumMoveDurationMs) || 900);

        this.currentHeroWeapon = weapon;
        this.currentHeroFootprintSize = 1;
        this.currentHeroRushActive = false;
        this.currentBonusStage = 0;
        this.currentHeroTextureKey = heroTexture;
        this.currentHeroAnchor = null;

        this.clearMonkeyWildStrengthBadge();
        this.currentHeroAngelMultiplierDisplay = null;
        this.clearHeroWildActiveBadge({ force: true });

        if (!this.heroSprite || this.heroSprite.destroyed) {
          this.heroSprite = this.add.image(heroX, heroY, heroTexture)
            .setOrigin(0.5)
            .setDepth(DEPTH_HERO)
            .setAlpha(1);
        } else {
          const startX = Number(this.heroSprite.x || heroX);
          const startY = Number(this.heroSprite.y || heroY);
          const distanceToCenter = Phaser.Math.Distance.Between(startX, startY, heroX, heroY);
          const shouldAnimate = animateFromCurrentPosition && distanceToCenter > 6;
          this.tweens.killTweensOf(this.heroSprite);
          this.heroSprite
            .setVisible(true)
            .setAlpha(1);

          if (shouldAnimate) {
            const moveDuration = Phaser.Math.Clamp(
              Math.round((distanceToCenter / moveSpeedPixelsPerSecond) * 1000),
              minimumMoveDurationMs,
              maximumMoveDurationMs
            );
            this.heroSprite.setPosition(startX, startY);
            this.tweens.add({
              targets: this.heroSprite,
              x: heroX,
              y: heroY,
              duration: moveDuration,
              ease: "Sine.easeInOut"
            });
          } else {
            this.heroSprite.setPosition(heroX, heroY);
          }
        }

        this.heroSprite
          .setTexture(heroTexture)
          .setScale(heroScale)
          .setDepth(DEPTH_HERO);
      }
  };
}
