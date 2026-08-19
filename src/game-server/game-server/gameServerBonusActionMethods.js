export function createGameServerBonusActionMethods(deps = {}) {
  const {
    ACTION_BANANA_HUNT,
    ACTION_FREESPIN_BANANA_HUNT,
    ACTION_TROLL_RUSH,
    ACTION_TROLL_TEASE,
    BASE_MONKEY_STATE,
    LEGACY_ACTION_FREESPIN_BANANA_HUNT,
    resolveChestSequence,
    resolveNextBonusRetriggerThreshold,
    serverConfig
  } = deps;

  return {
    handleFreespinAction(gameState, betSize, { heavenHellEnabled } = {}) {
      if (heavenHellEnabled && this.executeHeavenHellBonusSpawnAction(gameState, betSize)) {
        return true;
      }

      gameState.bonusState.finalFreespins = gameState.bonusState.finalFreespins - 1;
      gameState.skipWheel = false;
      gameState.multiplier = 1;
      gameState.bonusMysteryFeatureReleaseThisAction = this.buildBonusMysteryFeatureReleaseForFreespin(
        gameState,
        betSize
      );
      if (
        gameState?.bonusMysteryFeatureReleaseThisAction?.triggered === true &&
        Number(gameState?.bonusMysteryFeatureReleaseThisAction?.balloonCount || 0) > 0
      ) {
        const featureState = this.normalizeBonusMysteryFeatureState(gameState);
        gameState.bonusMysteryFeature = {
          ...featureState,
          collected: 0
        };
      }
      const freespinBalloonReleaseAddedTbm = Number(
        gameState?.bonusMysteryFeatureReleaseThisAction?.totalAddedTbm || 0
      );
      if (freespinBalloonReleaseAddedTbm > 0) {
        const freespinBalloonReleaseAddedTwa = Number(
          gameState?.bonusMysteryFeatureReleaseThisAction?.totalAddedTwa ||
          (freespinBalloonReleaseAddedTbm * Number(betSize || 0))
        );
        gameState.tbm = Number(gameState.tbm || 0) + freespinBalloonReleaseAddedTbm;
        gameState.twa = Number(gameState.twa || 0) + freespinBalloonReleaseAddedTwa;
        if (!gameState.rtpData || typeof gameState.rtpData !== "object") {
          gameState.rtpData = {};
        }
        gameState.rtpData.bonusEndBalloonPopTBM = Number(gameState.rtpData.bonusEndBalloonPopTBM || 0) + freespinBalloonReleaseAddedTbm;
      }

      const kapowHeroFootprintState = this.buildHeroFootprintState(
        gameState.heroPosition || serverConfig.heroStartingPosition || { reel: 4, row: 2 },
        gameState.heroFootprintSize || 1
      );
      this.moveLightningBeeFeaturesForKapow(gameState, gameState.reels, kapowHeroFootprintState);
      const persistentBonusFeatureSymbols = this.collectPersistentBonusFeatureSymbols(gameState.reels);

      gameState.reels = this.generateReels(
        this.serverConfig.symbolWeightsMain,
        serverConfig.area.width,
        serverConfig.area.height,
        { isBonus: true }
      );

      const heroPos = gameState.heroPosition || serverConfig.heroStartingPosition || { reel: 4, row: 2 };
      const heroFootprintState = this.buildHeroFootprintState(heroPos, gameState.heroFootprintSize || 1);
      this.stampHeroFootprintOnReels(gameState.reels, heroPos, gameState.heroFootprintSize || 1);

      const necromancerLevel = gameState.hero?.necromancer || 0;
      const necromancerSpawns = this.spawnNecromancerDemons(
        necromancerLevel,
        heroPos,
        gameState.heroFootprintSize || 1
      );
      gameState.necromancerSpawns = necromancerSpawns;
      gameState.reels = this.placeNecromancerDemons(gameState.reels, necromancerSpawns);

      const freespinConfig = serverConfig.freespinConfig || {};
      const demonSpawnConfig = freespinConfig.bananaSpawn || serverConfig.bananaSpawn;
      const isFirstFreespin = gameState.bonusState.initialFreespins === (gameState.bonusState.finalFreespins + 1);
      const guaranteedDemon = isFirstFreespin && freespinConfig.firstFreespinGuaranteedBanana;

      const currentKills = gameState.bonusState.finalDemonsCollected ?? gameState.bonusState.finalDemonsKilled ?? 0;
      const nextRetriggerThreshold = resolveNextBonusRetriggerThreshold(currentKills);
      const demonsAwayFromNextStage = nextRetriggerThreshold === null
        ? null
        : Math.max(0, nextRetriggerThreshold - currentKills);

      gameState.reels = this.addDemons(gameState.reels, demonSpawnConfig, {
        guaranteedDemon,
        gameState,
        demonsAwayFromBonusStage: demonsAwayFromNextStage,
        remainingFreespins: gameState.bonusState.finalFreespins,
        hero: gameState.hero,
        heroPosition: heroPos,
        heroFootprintSize: gameState.heroFootprintSize || 1,
        bananaMeterLevel: gameState.bananaMeter?.level ?? 0
      });

      const timeSymbolConfig = this.resolveExplodingBarrelConfig(gameState) || {};
      const parsedBonusFreespinTimeChance = Number(timeSymbolConfig.chancePerFreespin);
      const fallbackSpinTimeChance = Number(timeSymbolConfig.chancePerSpin);
      const bonusFreespinTimeChance = Number.isFinite(parsedBonusFreespinTimeChance)
        ? Math.max(0, parsedBonusFreespinTimeChance)
        : (Number.isFinite(fallbackSpinTimeChance) ? Math.max(0, fallbackSpinTimeChance) : 0);
      const bonusTimeResult = this.injectTimeSymbols(
        gameState.reels,
        false,
        null,
        gameState,
        {
          chancePerSpin: bonusFreespinTimeChance,
          ignoreBonusLock: true
        }
      );
      gameState.reels = bonusTimeResult.reels;
      this.restorePersistentBonusFeatureSymbols(gameState.reels, persistentBonusFeatureSymbols, heroFootprintState);

      const bonusMysteryConfig = this.getBonusMysteryFeatureConfig();
      this.injectBonusMysteryFeatureSymbols(
        gameState,
        gameState.reels,
        {
          chancePerAction: bonusMysteryConfig.chancePerFreespin,
          chancePerPosition: 1,
          maxPerAction: bonusMysteryConfig.maxPerAction,
          heroState: heroFootprintState
        }
      );
      const mergeGunConfig = this.getMergeGunFeatureConfig();
      this.injectMergeGunFeatureSymbols(
        gameState,
        gameState.reels,
        {
          chancePerAction: mergeGunConfig.chancePerFreespin,
          chancePerPosition: 1,
          maxPerAction: mergeGunConfig.maxPerAction,
          heroState: heroFootprintState
        }
      );
      const lightningBeeConfig = this.getLightningBeeFeatureConfig();
      this.injectLightningBeeFeatureSymbols(
        gameState,
        gameState.reels,
        {
          chancePerAction: lightningBeeConfig.chancePerFreespin,
          chancePerPosition: 1,
          maxPerAction: lightningBeeConfig.maxPerAction,
          heroState: heroFootprintState
        }
      );
      this.collectSettledHeroFeatureAdjacency(
        gameState,
        gameState.reels,
        gameState.heroPosition,
        gameState.heroFootprintSize || 1
      );

      gameState.gravity = this.decideGravity(gameState.reels);
      let result = this.processClusters(
        gameState.reels,
        betSize,
        serverConfig.minClusterSize || 4,
        gameState.multiplier || 1,
        gameState.bananaMeter?.level,
        this.buildHeroFootprintState(gameState.heroPosition, gameState.heroFootprintSize || 1)
      );
      if (!result.hasWins) {
        const fullBoardResult = this.resolveFullBoardClusterResult(
          gameState.reels,
          betSize,
          serverConfig.minClusterSize || 4,
          gameState.multiplier || 1,
          gameState.bananaMeter?.level,
          this.buildHeroFootprintState(gameState.heroPosition, gameState.heroFootprintSize || 1)
        );
        if (fullBoardResult?.hasWins) {
          result = fullBoardResult;
        }
      }
      let pendingBarrelDropReels = null;

      if (!result.hasWins) {
        const barrelsOnBoard = this.getBarrelSymbolsOnBoard(gameState.reels);
        if (barrelsOnBoard.length > 0) {
          const barrelResult = this.triggerBarrelDemonBursts(gameState.reels, barrelsOnBoard, gameState);
          if (barrelResult.barrelBursts.length > 0) {
            pendingBarrelDropReels = barrelResult.reels;
          }
        }
      }

      if (result.hasWins) {
        this.addBonusCollectedSymbols(gameState, this.collectBonusSymbolsFromClusters(gameState.reels, result.clusters));
        gameState.clusters = result.clusters;
        gameState.winAmount = 0;
        gameState.reelsBeforeDrop = result.updatedReels;
        gameState.nextAction = "freerespin";
      } else if (pendingBarrelDropReels) {
        gameState.clusters = [];
        gameState.winAmount = 0;
        gameState.reelsBeforeDrop = pendingBarrelDropReels;
        gameState.reelsAfterDrop = null;
        gameState.nextAction = "freerespin";
      } else if (Object.values(gameState.reels).some((row) => row.some((sym) => this.isDemon(sym)))) {
        gameState.clusters = [];
        gameState.reels = gameState.reels;
        gameState.reelsBeforeDrop = null;
        gameState.nextAction = ACTION_FREESPIN_BANANA_HUNT;
      } else {
        gameState.clusters = [];

        if (gameState.bonusState.finalFreespins > 0) {
          gameState.nextAction = "freespin";
        } else {
          this.applyBonusEndPayout(gameState, betSize);
          gameState.nextAction = "spin";
        }
      }

      return false;
    },

    handleFreerespinAction(gameState, betSize, { heavenHellEnabled } = {}) {
      if (heavenHellEnabled && this.executeHeavenHellBonusSpawnAction(gameState, betSize)) {
        return true;
      }

      gameState.gravity = this.decideGravity(gameState.reelsBeforeDrop);

      const allowDemons = true;
      const resolvedFreespinDemonConfig = this.resolveDemonSpawnConfig(
        serverConfig.freespinConfig?.bananaSpawn || {},
        gameState
      );

      const abilityReduction = resolvedFreespinDemonConfig?.abilityReduction || {};
      let demonChanceMultiplier = 1.0;
      if (Object.keys(abilityReduction).length > 0) {
        const meterLevel = Math.max(0, Math.floor(Number(gameState.bananaMeter?.level) || 0));
        demonChanceMultiplier = abilityReduction[meterLevel] ?? abilityReduction[String(meterLevel)] ?? 1.0;
      }
      const currentKills = gameState.bonusState.finalDemonsCollected ?? gameState.bonusState.finalDemonsKilled ?? 0;
      const nextRetriggerThreshold = resolveNextBonusRetriggerThreshold(currentKills);
      const demonsAwayFromNextStage = nextRetriggerThreshold === null
        ? null
        : Math.max(0, nextRetriggerThreshold - currentKills);
      demonChanceMultiplier *= this.getBonusStageSuspenseChanceMultiplier(
        demonsAwayFromNextStage,
        gameState.bonusState.finalFreespins
      );
      const timeSymbolConfig = this.resolveExplodingBarrelConfig(gameState) || {};
      const parsedBonusRespinTimeChance = Number(timeSymbolConfig.chancePerNewSymbolOnFreerespin);
      const fallbackRespinTimeChance = Number(timeSymbolConfig.chancePerNewSymbolOnRespin);
      const timeSymbolChance = Number.isFinite(parsedBonusRespinTimeChance)
        ? Math.max(0, parsedBonusRespinTimeChance)
        : (Number.isFinite(fallbackRespinTimeChance) ? Math.max(0, fallbackRespinTimeChance) : 0);

      const gravityResult = this.applyGravity(
        gameState.reelsBeforeDrop,
        this.serverConfig.symbolWeightsMain,
        gameState.gravity || "down",
        allowDemons,
        timeSymbolChance,
        demonChanceMultiplier,
        resolvedFreespinDemonConfig?.respinChance,
        this.buildHeroFootprintState(gameState.heroPosition, gameState.heroFootprintSize || 1),
        { isBonus: true }
      );

      gameState.reelsAfterDrop = gravityResult.reels;
      gameState.dropEvent = gravityResult.dropEvent;
      gameState.reels = gravityResult.reels;

      const newSymbolPositions = new Set();
      const direction = gravityResult.dropEvent.direction || "down";

      gravityResult.dropEvent.movements.forEach((movement) => {
        let isNewSymbol = false;

        if (direction === "down" || direction === "up") {
          isNewSymbol = movement.from >= this.height || movement.from < 0;
        } else if (direction === "left" || direction === "right") {
          isNewSymbol = movement.fromReel < 0 || movement.fromReel >= this.width;
        }

        if (isNewSymbol) {
          const targetReel = movement.toReel !== undefined ? movement.toReel : movement.reel;
          newSymbolPositions.add(`${targetReel},${movement.to}`);
        }
      });

      const bonusMysteryConfig = this.getBonusMysteryFeatureConfig();
      const mysteryCandidatePositions = Array.from(newSymbolPositions).map((key) => {
        const [rawReel, rawRow] = key.split(",");
        return {
          reel: Number(rawReel),
          row: Number(rawRow)
        };
      });
      this.injectBonusMysteryFeatureSymbols(
        gameState,
        gameState.reels,
        {
          candidatePositions: mysteryCandidatePositions,
          chancePerPosition: bonusMysteryConfig.chancePerNewSymbolOnFreerespin,
          maxPerAction: bonusMysteryConfig.maxPerAction,
          heroState: this.buildHeroFootprintState(gameState.heroPosition, gameState.heroFootprintSize || 1)
        }
      );
      const mergeGunConfig = this.getMergeGunFeatureConfig();
      this.injectMergeGunFeatureSymbols(
        gameState,
        gameState.reels,
        {
          candidatePositions: mysteryCandidatePositions,
          chancePerPosition: mergeGunConfig.chancePerNewSymbolOnFreerespin,
          maxPerAction: mergeGunConfig.maxPerAction,
          heroState: this.buildHeroFootprintState(gameState.heroPosition, gameState.heroFootprintSize || 1)
        }
      );
      const lightningBeeConfig = this.getLightningBeeFeatureConfig();
      this.injectLightningBeeFeatureSymbols(
        gameState,
        gameState.reels,
        {
          candidatePositions: mysteryCandidatePositions,
          chancePerPosition: lightningBeeConfig.chancePerNewSymbolOnFreerespin,
          maxPerAction: lightningBeeConfig.maxPerAction,
          heroState: this.buildHeroFootprintState(gameState.heroPosition, gameState.heroFootprintSize || 1)
        }
      );
      this.syncDropEventSymbols(gameState.dropEvent, gameState.reels);
      gameState.reelsAfterDrop = JSON.parse(JSON.stringify(gameState.reels));
      this.collectSettledHeroFeatureAdjacency(
        gameState,
        gameState.reels,
        gameState.heroPosition,
        gameState.heroFootprintSize || 1
      );

      const multiplier = gameState.multiplier || 1;
      let result = this.processClusters(
        gameState.reels,
        betSize,
        serverConfig.minClusterSize || 4,
        multiplier,
        gameState.bananaMeter?.level,
        this.buildHeroFootprintState(gameState.heroPosition, gameState.heroFootprintSize || 1)
      );
      if (!result.hasWins) {
        const fullBoardResult = this.resolveFullBoardClusterResult(
          gameState.reels,
          betSize,
          serverConfig.minClusterSize || 4,
          multiplier,
          gameState.bananaMeter?.level,
          this.buildHeroFootprintState(gameState.heroPosition, gameState.heroFootprintSize || 1)
        );
        if (fullBoardResult?.hasWins) {
          result = fullBoardResult;
        }
      }

      const boostConfig = serverConfig.normalWinBoost || {};
      if (boostConfig.enabled && !result.hasWins && gameState.hero.step === "destroy") {
        if (Math.random() * 100 < (boostConfig.rerollChance || 50)) {
          const rerollResult = this.attemptNormalWinBoost(
            gameState.reels,
            newSymbolPositions,
            betSize,
            multiplier,
            boostConfig
          );

          if (rerollResult.hasWins) {
            result = rerollResult.result;
            gameState.reels = rerollResult.reels;
            gameState.reelsAfterDrop = rerollResult.reels;

            gameState.dropEvent.movements.forEach((movement) => {
              const targetReel = movement.toReel !== undefined ? movement.toReel : movement.reel;
              const targetRow = movement.to;
              if (rerollResult.reels[targetReel] && rerollResult.reels[targetReel][targetRow] !== undefined) {
                movement.symbol = rerollResult.reels[targetReel][targetRow];
              }
            });
          }
        }
      }
      if (!result.hasWins) {
        const fullBoardResult = this.resolveFullBoardClusterResult(
          gameState.reels,
          betSize,
          serverConfig.minClusterSize || 4,
          multiplier,
          gameState.bananaMeter?.level,
          this.buildHeroFootprintState(gameState.heroPosition, gameState.heroFootprintSize || 1)
        );
        if (fullBoardResult?.hasWins) {
          result = fullBoardResult;
        }
      }
      let pendingBarrelDropReels = null;

      if (!result.hasWins) {
        const barrelsOnBoard = this.getBarrelSymbolsOnBoard(gameState.reels);
        if (barrelsOnBoard.length > 0) {
          const barrelResult = this.triggerBarrelDemonBursts(gameState.reels, barrelsOnBoard, gameState);
          if (barrelResult.barrelBursts.length > 0) {
            pendingBarrelDropReels = barrelResult.reels;
          }
        }
      }

      if (result.hasWins) {
        this.addBonusCollectedSymbols(gameState, this.collectBonusSymbolsFromClusters(gameState.reels, result.clusters));
        gameState.clusters = result.clusters;
        gameState.winAmount = 0;
        gameState.reelsBeforeDrop = result.updatedReels;
        gameState.nextAction = "freerespin";
      } else if (pendingBarrelDropReels) {
        gameState.clusters = [];
        gameState.winAmount = 0;
        gameState.reelsAfterDrop = gameState.reelsAfterDrop || gameState.reels;
        gameState.reelsBeforeDrop = pendingBarrelDropReels;

        if (gameState.rtpData) {
          gameState.rtpData.mysteryPositionRTP = [];
        }

        gameState.nextAction = "freerespin";
      } else if (Object.values(gameState.reels).some((row) => row.some((sym) => this.isDemon(sym)))) {
        gameState.clusters = [];
        gameState.winAmount = 0;
        gameState.reelsBeforeDrop = null;

        if (gameState.rtpData) {
          gameState.rtpData.mysteryPositionRTP = [];
        }

        gameState.nextAction = ACTION_FREESPIN_BANANA_HUNT;
      } else if (gameState.bonusState.finalFreespins <= 0) {
        gameState.clusters = [];
        gameState.reelsBeforeDrop = null;

        if (gameState.rtpData) {
          gameState.rtpData.mysteryPositionRTP = [];
        }
        this.applyBonusEndPayout(gameState, betSize);
        gameState.nextAction = "spin";
      } else {
        gameState.clusters = [];
        gameState.winAmount = 0;
        gameState.reelsBeforeDrop = null;

        if (gameState.rtpData) {
          gameState.rtpData.mysteryPositionRTP = [];
        }

        gameState.nextAction = "freespin";
      }

      return false;
    },

    handleFreespinDemonHuntAction(gameState, betSize, { heavenHellEnabled } = {}) {
      const stepType = "destroy";
      const weaponId = BASE_MONKEY_STATE.weapon;
      const heroPosition = gameState.heroPosition || null;
      let heavenHellOverrideNextAction = null;

      const isTrollRush = gameState.trollRush && gameState.trollRush.isTrollRush;
      const reelsToHunt = isTrollRush ? gameState.reelsBeforeDrop : gameState.reels;

      const preHuntReels = JSON.parse(JSON.stringify(reelsToHunt || {}));
      const huntResult = this.executeDemonHunt(reelsToHunt, stepType, weaponId, heroPosition, gameState);

      if (!gameState.rtpData) {
        gameState.rtpData = {};
      }
      gameState.rtpData.heroAbilitiesApplied = false;

      gameState.reels = huntResult.reels;
      gameState.heroPath = huntResult.heroPath;
      gameState.affectedPositions = huntResult.affectedPositions;
      const demonsKilledThisAction = Number(huntResult.demonsKilled || 0);
      gameState.demonsKilledThisAction = demonsKilledThisAction;
      gameState.demonsKilled = Number(gameState.demonsKilled || 0) + demonsKilledThisAction;
      gameState.demonsCollected = Number(huntResult.demonsCollected || demonsKilledThisAction);
      gameState.orbDrops = huntResult.orbDrops;
      gameState.mysteryReveals = huntResult.mysteryReveals || [];
      gameState.heroPosition = huntResult.heroFinalPosition;
      gameState.bananaImpactWins = huntResult.heroPath?.filter((step) => Number(step?.impactWinTwa || 0) > 0) || [];
      if (!heavenHellEnabled) {
        const mergeGunCollections = this.collectMergeGunFeaturesFromHeroPath(gameState, gameState.reels, gameState.heroPath || []);
        this.triggerMergeGunActivations(
          gameState,
          mergeGunCollections,
          huntResult.heroFinalPosition,
          huntResult.heroFinalFootprintSize || gameState.heroFootprintSize || 1
        );
        this.collectBonusMysteryFeaturesFromHeroPath(gameState, gameState.reels, gameState.heroPath || []);
        this.collectLightningBeeFeaturesFromHeroPath(gameState, gameState.reels, gameState.heroPath || []);
      }
      const heavenHellPostHunt = heavenHellEnabled
        ? this.processHeavenHellPostHunt(gameState, huntResult, preHuntReels, { isBonus: true })
        : { totalKills: 0, weightedKills: 0, lootDrops: [] };
      if (heavenHellEnabled) {
        const bonusState = this.ensureHeavenHellState(gameState)?.bonus;
        gameState.reels = huntResult.reels;
        gameState.heroPath = huntResult.heroPath;
        gameState.heroPosition = huntResult.heroFinalPosition || gameState.heroPosition;
        gameState.orbDrops = huntResult.orbDrops;
        if (bonusState) {
          bonusState.chestEventsThisAction = Array.isArray(heavenHellPostHunt?.chestDrops)
            ? heavenHellPostHunt.chestDrops.map((entry) => ({
                type: "dropQueued",
                ...entry
              }))
            : [];
        }
        const correctedKillCount = Math.max(0, Math.floor(Number(heavenHellPostHunt?.totalKills) || 0));
        if (correctedKillCount !== demonsKilledThisAction) {
          gameState.demonsKilled = Math.max(
            0,
            Number(gameState.demonsKilled || 0) - demonsKilledThisAction + correctedKillCount
          );
          gameState.demonsKilledThisAction = correctedKillCount;
          gameState.demonsCollected = correctedKillCount;
        }
      }

      if (gameState.mysteryReveals.length > 0) {
        if (!gameState.rtpData) {
          gameState.rtpData = {};
        }
        gameState.rtpData.mysteryPositionRTP = gameState.mysteryReveals.map((reveal) => ({
          reel: reveal.reel,
          row: reveal.row,
          stepType
        }));
      }

      gameState.totalDemonsKilledInSequence = (gameState.totalDemonsKilledInSequence || 0) + (gameState.demonsKilledThisAction || 0);
      gameState.totalDemonsCollectedInSequence = (gameState.totalDemonsCollectedInSequence || 0) + gameState.demonsCollected;
      if (!heavenHellEnabled) {
        this.addDemonMeterProgress(gameState, gameState.demonsCollected);
        this.normalizeBonusStageState(gameState, { awardFreespins: true });
      }
      if (huntResult.growthAppliedDuringHunt === true) {
        gameState.heroFootprintSize = Math.max(
          1,
          Math.floor(Number(huntResult.heroFinalFootprintSize || gameState.heroFootprintSize || 1))
        );
        gameState.giantMonkeyActive = gameState.heroFootprintSize > 1;
        gameState.heroPosition = huntResult.heroFinalPosition || gameState.heroPosition;
        if (gameState.bonusStageEvent && typeof gameState.bonusStageEvent === "object") {
          gameState.bonusStageEvent.giantMonkeyActivated = false;
          gameState.bonusStageEvent.heroFootprintSize = gameState.heroFootprintSize;
          gameState.bonusStageEvent.heroPosition = gameState.heroPosition;
          gameState.bonusStageEvent.growthConsumedCells = [];
        }
      } else {
        this.applyPendingGiantMonkeyGrowth(gameState, gameState.reels, weaponId);
      }
      this.addBonusCollectedSymbols(gameState, huntResult.collectedSymbolDetails || []);
      gameState.winAmount = 0;
      if (gameState.bonusState) {
        gameState.bonusState.finalDemonsKilled = gameState.bananaMeter.count;
        gameState.bonusState.finalDemonsCollected = gameState.bananaMeter.count;
      }
      if (heavenHellEnabled) {
        const heavenHell = this.ensureHeavenHellState(gameState);
        const bonusState = heavenHell?.bonus;
        const remainingDemons = this.countHeavenHellDemons(gameState.reels);
        if (remainingDemons === 0) {
          this.settleHeavenHellKillMeterUnlocks(gameState);
        }
        if (remainingDemons > 0) {
          heavenHellOverrideNextAction = ACTION_FREESPIN_BANANA_HUNT;
          gameState.nextAction = heavenHellOverrideNextAction;
        } else if ((bonusState?.pendingChests?.length || 0) > 0) {
          bonusState.chestRewardResumeAction = gameState.bonusState.finalFreespins > 0 ? "freerespin" : "spin";
          heavenHellOverrideNextAction = "chestreward";
          gameState.nextAction = heavenHellOverrideNextAction;
        } else if (gameState.bonusState.finalFreespins > 0) {
          heavenHell.bonus.freerespinChain = Math.max(
            0,
            Math.floor(Number(heavenHell.bonus.freerespinChain || 0) + 1)
          );
          heavenHellOverrideNextAction = "freerespin";
          gameState.nextAction = heavenHellOverrideNextAction;
        } else {
          this.settleHeavenHellBonus(gameState, betSize);
          heavenHell.bonus.freerespinChain = 0;
          gameState.isBonus = false;
          heavenHellOverrideNextAction = "spin";
          gameState.nextAction = heavenHellOverrideNextAction;
        }
      }

      if (isTrollRush && gameState.trollRush.trollPosition) {
        const reelsWithTrollsCleared = JSON.parse(JSON.stringify(gameState.reels));

        gameState.trollRush.trollPosition.forEach((pos) => {
          const isHeroPosition = (pos.reel === gameState.heroPosition.reel && pos.row === gameState.heroPosition.row);
          if (!isHeroPosition) {
            reelsWithTrollsCleared[pos.reel][pos.row] = 0;
          }
        });

        gameState.reelsBeforeDrop = reelsWithTrollsCleared;
        gameState.clusters = [];
        gameState.nextAction = "freerespin";
        gameState.trollRush.isTrollRush = false;
      } else {
        let reelsAfterHuntStep = gameState.reels;
        if ((stepType === "mystery" || stepType === "mysteryWild") && gameState.mysteryReveals.length > 0) {
          reelsAfterHuntStep = JSON.parse(JSON.stringify(gameState.reels));
          gameState.mysteryReveals.forEach((reveal) => {
            reelsAfterHuntStep[reveal.reel][reveal.row] = reveal.revealTo;
          });
        }
        gameState.reels = reelsAfterHuntStep;
        gameState.reelsBeforeDrop = reelsAfterHuntStep;
        gameState.clusters = [];
        gameState.nextAction = "freerespin";
      }
      if (heavenHellEnabled && heavenHellOverrideNextAction) {
        gameState.nextAction = heavenHellOverrideNextAction;
      }
    },

    handleChestRewardAction(gameState) {
      const heavenHell = this.ensureHeavenHellState(gameState);
      const bonusState = heavenHell?.bonus;
      if (!bonusState) {
        gameState.nextAction = "spin";
        return;
      }

      const pendingChests = Array.isArray(bonusState.pendingChests) ? bonusState.pendingChests.slice() : [];
      const resumeActionBeforeRewards = bonusState.chestRewardResumeAction === "freerespin"
        ? "freerespin"
        : "spin";

      if (pendingChests.length === 0) {
        if (resumeActionBeforeRewards === "freerespin" || Number(gameState.bonusState?.finalFreespins || 0) > 0) {
          bonusState.chestRewardResumeAction = null;
          gameState.nextAction = "freerespin";
          return;
        }
        this.settleHeavenHellBonus(gameState, gameState.betSize);
        gameState.isBonus = false;
        gameState.nextAction = "spin";
        return;
      }

      const chestResult = resolveChestSequence({
        gameState,
        pendingChests,
        chestConfig: this.getHeavenHellChestConfig(),
        chestTypes: this.getHeavenHellChestTypes()
      });

      bonusState.pendingChests = [];
      bonusState.chestsRewarded = Math.max(
        0,
        Math.floor(Number(bonusState.chestsRewarded || 0) + Number(chestResult?.summary?.totalChestsOpened || 0))
      );
      bonusState.chestEventsThisAction = chestResult?.chests || [];

      const continueBonus = resumeActionBeforeRewards === "freerespin" || Number(gameState.bonusState?.finalFreespins || 0) > 0;
      const resumeActionAfterRewards = continueBonus ? "freerespin" : "spin";
      bonusState.chestActionSummary = {
        ...(chestResult?.summary || {}),
        resumeActionBeforeRewards,
        resumeActionAfterRewards
      };
      const finalChestHeroPosition = chestResult?.summary?.finalHeroPosition;
      if (
        finalChestHeroPosition &&
        Number.isFinite(Number(finalChestHeroPosition.reel)) &&
        Number.isFinite(Number(finalChestHeroPosition.row))
      ) {
        const normalizedChestHeroPosition = this.normalizeHeroAnchorForSize(
          finalChestHeroPosition,
          gameState.heroFootprintSize || 1
        );
        if (normalizedChestHeroPosition) {
          gameState.heroPosition = normalizedChestHeroPosition;
          if (gameState.bonusStageEvent && typeof gameState.bonusStageEvent === "object") {
            gameState.bonusStageEvent.heroPosition = normalizedChestHeroPosition;
          }
        }
      }
      bonusState.chestRewardResumeAction = null;
      gameState.multiplier = Math.max(1, Math.floor(Number(bonusState.globalMultiplier || 1)));
      this.syncHeavenHellChestCounters(gameState);

      if (continueBonus) {
        if (resumeActionAfterRewards === "freerespin") {
          bonusState.freerespinChain = Math.max(
            0,
            Math.floor(Number(bonusState.freerespinChain || 0) + 1)
          );
        }
        gameState.nextAction = resumeActionAfterRewards;
        return;
      }

      this.settleHeavenHellBonus(gameState, gameState.betSize);
      bonusState.freerespinChain = 0;
      gameState.isBonus = false;
      gameState.nextAction = "spin";
    },

    handleTrollTeaseAction(gameState) {
      const heroPosition = gameState.heroPosition;

      let teaseDirection = null;
      let centerReel;
      let centerRow;

      if (heroPosition && heroPosition.reel !== undefined && heroPosition.row !== undefined) {
        if (heroPosition.reel < 3) {
          teaseDirection = "fromright";
          centerReel = 5;
          centerRow = heroPosition.row;
        } else if (heroPosition.reel > 4) {
          teaseDirection = "fromleft";
          centerReel = 2;
          centerRow = heroPosition.row;
        } else if (heroPosition.row < 3) {
          teaseDirection = "fromdown";
          centerReel = heroPosition.reel;
          centerRow = 5;
        } else if (heroPosition.row > 4) {
          teaseDirection = "fromtop";
          centerReel = heroPosition.reel;
          centerRow = 2;
        } else if (heroPosition.reel <= 3) {
          teaseDirection = "fromright";
          centerReel = 5;
          centerRow = heroPosition.row;
        } else {
          teaseDirection = "fromleft";
          centerReel = 2;
          centerRow = heroPosition.row;
        }
      } else {
        const directions = ["fromleft", "fromright", "fromtop", "fromdown"];
        teaseDirection = directions[Math.floor(Math.random() * directions.length)];
        centerReel = 4;
        centerRow = 4;
      }

      if (!gameState.rtpData) {
        gameState.rtpData = {};
      }
      const isBonus = gameState.isBonus || false;

      if (!gameState.rtpData.trollRushTotal) gameState.rtpData.trollRushTotal = 0;
      if (!gameState.rtpData.trollRushTeases) gameState.rtpData.trollRushTeases = 0;
      if (!gameState.rtpData.trollRushTotalMain) gameState.rtpData.trollRushTotalMain = 0;
      if (!gameState.rtpData.trollRushTotalBonus) gameState.rtpData.trollRushTotalBonus = 0;
      if (!gameState.rtpData.trollRushTeasesMain) gameState.rtpData.trollRushTeasesMain = 0;
      if (!gameState.rtpData.trollRushTeasesBonus) gameState.rtpData.trollRushTeasesBonus = 0;

      gameState.rtpData.trollRushTotal++;
      gameState.rtpData.trollRushTeases++;
      if (isBonus) {
        gameState.rtpData.trollRushTotalBonus++;
        gameState.rtpData.trollRushTeasesBonus++;
      } else {
        gameState.rtpData.trollRushTotalMain++;
        gameState.rtpData.trollRushTeasesMain++;
      }

      gameState.trollRush = {
        direction: teaseDirection,
        centerPosition: { reel: centerReel, row: centerRow },
        isTease: true
      };

      gameState.nextAction = gameState.isBonus ? "freespin" : "spin";
    },

    handleTrollRushAction(gameState) {
      const heroPosition = gameState.heroPosition;
      const trollResult = this.executeTrollRush(gameState.reels, heroPosition, gameState);

      if (!gameState.rtpData) {
        gameState.rtpData = {};
      }
      const isBonus = gameState.isBonus || false;

      if (!gameState.rtpData.trollRushTotal) gameState.rtpData.trollRushTotal = 0;
      if (!gameState.rtpData.trollRushReal) gameState.rtpData.trollRushReal = 0;
      if (!gameState.rtpData.trollRushTotalMain) gameState.rtpData.trollRushTotalMain = 0;
      if (!gameState.rtpData.trollRushTotalBonus) gameState.rtpData.trollRushTotalBonus = 0;
      if (!gameState.rtpData.trollRushRealMain) gameState.rtpData.trollRushRealMain = 0;
      if (!gameState.rtpData.trollRushRealBonus) gameState.rtpData.trollRushRealBonus = 0;

      gameState.rtpData.trollRushTotal++;
      gameState.rtpData.trollRushReal++;
      if (isBonus) {
        gameState.rtpData.trollRushTotalBonus++;
        gameState.rtpData.trollRushRealBonus++;
      } else {
        gameState.rtpData.trollRushTotalMain++;
        gameState.rtpData.trollRushRealMain++;
      }

      gameState.reelsBeforeDrop = trollResult.reels;
      gameState.trollRush = {
        trollPosition: trollResult.trollPosition,
        affectedPositions: trollResult.affectedPositions,
        direction: trollResult.direction,
        centerPosition: trollResult.centerPosition,
        isTrollRush: true,
        isTease: false
      };

      gameState.nextAction = gameState.isBonus ? ACTION_FREESPIN_BANANA_HUNT : ACTION_BANANA_HUNT;
    }
  };
}


