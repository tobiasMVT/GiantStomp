export function createClientActionMethods(deps = {}) {
  const {
    ACTION_BANANA_HUNT,
    ACTION_FREESPIN_BANANA_HUNT,
    LEGACY_ACTION_BANANA_HUNT,
    LEGACY_ACTION_FREESPIN_BANANA_HUNT
  } = deps;

  return {
    async handleSpinAction(gameState) {
      this.scene.setCurrentAction?.("spin");
      this.scene.playSpinClickSound();
      this.scene.startMainTheme();

      const comingFromBonus = gameState.pastAction === "freespin" ||
        gameState.pastAction === "freerespin" ||
        gameState.pastAction === ACTION_FREESPIN_BANANA_HUNT ||
        gameState.pastAction === LEGACY_ACTION_FREESPIN_BANANA_HUNT;

      if (comingFromBonus) {
        await this.waitForPresentation(2000);
      }

      this.scene.setHeroAngelMultiplierDisplay?.(null, { clearBadge: true });
      this.scene.resetForNewSpin();
      this.scene.resetBonusFruitPile?.();
      this.scene.hideFreespinCounter();
      this.scene.createOrUpdateHouse(gameState.multiplier || 1);
      this.scene.clearHeavenHellLootGround?.();
      this.scene.syncHeavenHellPentagram?.(gameState);
      this.scene.updateHeavenHellAbilityText?.(gameState);

      await this.runSegmentFlow(gameState);
    },

    handleTrollTeaseAction(gameState) {
      this.scene.updateCountUp(gameState.twa || 0);
    },

    handleTrollRushAction(gameState) {
      this.scene.updateCountUp(gameState.twa || 0);
    },

    async handleRespinAction(gameState) {
      this.scene.setCurrentAction?.("respin");
      this.scene.syncMainGameHeroWildState?.(gameState);

      if (!gameState.reelsAfterDrop || !gameState.dropEvent) {
        this.scene.emitOutcomeRevealed?.();
        if (gameState.nextAction === "spin") {
          this.scene.emitRoundEnded?.();
        }
        return;
      }

      await this.runSegmentFlow(gameState);
    },

    async handleBananaHuntAction(gameState) {
      this.scene.setCurrentAction?.(ACTION_BANANA_HUNT);
      this.scene.syncMainGameHeroWildState?.(gameState);
      this.scene.setHeroAngelMultiplierDisplay?.(gameState?.heroAngelStartMultiplier ?? null, {
        showBadge: Number.isFinite(Number(gameState?.heroAngelStartMultiplier)),
        clearBadge: !Number.isFinite(Number(gameState?.heroAngelStartMultiplier))
      });

      if (gameState.heroPath && gameState.heroPath.length > 0) {
        const stepType = "destroy";
        const weapon = "staff";
        const bananaMeterLevel = gameState?.bananaMeter?.level ?? gameState?.bananaMeterLevel ?? 0;
        const finalMeterCount = Number(gameState?.bananaMeter?.count ?? gameState?.bananaMeterCount ?? 0);
        const sceneMeterCount = Number(this.scene?.currentBananaMeterCount);
        let meterStartCount = Number.isFinite(sceneMeterCount) ? sceneMeterCount : finalMeterCount;
        if (!Number.isFinite(sceneMeterCount)) {
          const demonsKilledThisAction = Math.max(0, Number(gameState?.demonsKilledThisAction ?? 0) || 0);
          meterStartCount = Math.max(0, finalMeterCount - demonsKilledThisAction);
        }
        meterStartCount = Math.min(meterStartCount, finalMeterCount);
        await this.scene.animateHeroHunt(
          gameState.heroPath,
          gameState.affectedPositions,
          gameState.orbDrops || [],
          gameState.multiplier || 1,
          gameState.totalDemonsCollectedInSequence ?? gameState.totalDemonsKilledInSequence ?? 0,
          stepType,
          weapon,
          null,
          bananaMeterLevel,
          false,
          {
            startCount: meterStartCount,
            finalCount: finalMeterCount,
            baseCountUpValue: Number(gameState?.prevTwa || 0)
          },
          {
            rushActive: gameState?.rushActive === true,
            bonusStage: Number(gameState?.bonusStage || 0),
            heroFootprintSize: Number(gameState?.heroFootprintSize || 1),
            giantMonkeyActive: gameState?.giantMonkeyActive === true,
            bonusEntryFreespins: gameState?.bonusWon?.enterBonusWith?.freespins || gameState?.bonusState?.finalFreespins || 5,
            mergeGunFeatureCollections: gameState?.mergeGunFeatureThisAction?.collected || gameState?.mergeGunFeatureCollectedThisAction || [],
            mergeGunActivations: gameState?.mergeGunFeatureThisAction?.activations || gameState?.mergeGunActivationsThisAction || [],
            mergeGunAreas: this.getMergeGunAreasForDisplay(gameState),
            bonusMysteryFeatureCollections: gameState?.bonusMysteryFeatureCollectedThisAction || [],
            lightningBeeFeatureCollections: gameState?.lightningBeeFeatureCollectedThisAction || [],
            heavenHellGameState: this.isHeavenHellEnabled(gameState) && gameState?.isBonus ? gameState : null
          }
        );
        this.scene.syncHeroBonusForm?.(gameState?.heroFootprintSize || 1, false, gameState?.heroPosition || null);
      }
      this.scene.setHeroAngelMultiplierDisplay?.(gameState?.heroAngelMultiplier ?? null, {
        showBadge: Number.isFinite(Number(gameState?.heroAngelMultiplier)),
        clearBadge: !Number.isFinite(Number(gameState?.heroAngelMultiplier))
      });
      await this.syncMergeGunFeatureUi(gameState, { playActivation: false });
      this.syncLightningBeeFeatureUi(gameState, { consume: true });

      if (gameState.mysteryReveals && gameState.mysteryReveals.length > 0) {
        const stepType = gameState.hero?.step || "destroy";
        await this.scene.revealMysterySymbols(gameState.mysteryReveals, stepType);
      }

      this.scene.cleanupAllBackplates();
      this.scene.updateCountUp(gameState.twa || 0);
    },

    async handleBonusTransitionAction(gameState) {
      this.scene.setHeroAngelMultiplierDisplay?.(null, { clearBadge: true });
      this.scene.setLightningCount?.(100);
      if (this.isHeavenHellEnabled(gameState)) {
        this.scene.clearMainGameSymbolsForHeavenHellBonus?.();
        await this.scene.playHeavenHellBonusEntryPortalTransition?.();
        this.scene.updateHellDiveBackground?.(gameState);
      }
      this.scene.startBonusMode();
      this.scene.syncBonusMultiplierFruits?.(gameState, { refreshVisuals: true });
      this.scene.resetBonusFruitPile?.(gameState?.bonusCollectedSymbols || {});
      this.scene.syncImmediateLowPositionBackplates?.(gameState?.bonusState?.immediateLowPositionLandings || []);

      const initialSpins = gameState.bonusState?.finalFreespins || gameState.bonusWon?.enterBonusWith?.freespins || 5;
      this.scene.updateFreespinCounter(initialSpins);
      this.syncBonusMysteryFeatureUi(gameState, { consume: false });
      this.syncLightningBeeFeatureUi(gameState, { consume: false });
      await this.syncMergeGunFeatureUi(gameState, { playActivation: false });
      if (this.isHeavenHellEnabled(gameState)) {
        this.scene.showHeavenHellPortalAura?.(gameState);
        this.syncHeavenHellPentagram?.(gameState);
        this.renderHeavenHellBonusLootGround?.(gameState);
        this.scene.updateHeavenHellAbilityText?.(gameState);
      }
    },

    async handleFreespinAction(gameState) {
      this.syncHeavenHellLootBehindDemons?.(gameState);
      if (this.isHeavenHellEnabled(gameState) && gameState?.dropEvent?.direction === "ripple") {
        this.scene.setCurrentAction?.("freespin");
        this.scene.startBonusTheme?.();
        this.scene.updateFreespinCounter(gameState?.bonusState?.finalFreespins || 0, { deferRingConsume: true });
        this.scene.createOrUpdateHouse(gameState?.multiplier || 1);
        this.syncHeavenHellPentagram?.(gameState);
        await this.scene.playHeavenHellRippleSpawn?.(gameState);
        this.scene.hideNonHeavenHellBonusSymbols?.(gameState);
        const playedCollectPhase = await this.playHeavenHellCollectPhaseIfNeeded(gameState);
        this.renderHeavenHellBonusLootGround?.(gameState);
        await this.syncHeavenHellAbilityUi?.(gameState, { allowRewardFx: false });
        if (!playedCollectPhase) {
          this.scene.updateCountUp(gameState.twa || 0);
        }
        if (gameState.nextAction === "spin") {
          this.scene.resetLightningCount?.();
          this.scene.stopBonusTheme?.();
        }
        this.scene.emitOutcomeRevealed?.();
        if (gameState.nextAction === "spin") {
          this.scene.emitRoundEnded?.();
        }
        this.scene.updateHellDiveBackground?.(gameState);
        return;
      }

      this.scene.setCurrentAction?.("freespin");
      this.scene.setCurrentHeroFootprintSize?.(this.getHeroFootprintSizeBeforeStageEvent(gameState));
      this.scene.startBonusTheme?.();

      const isFirstFreespin = gameState.pastAction === "bonustransition";
      if (isFirstFreespin && gameState.isBonus) {
        this.scene.startBonusMode();
      }
      this.scene.syncBonusMultiplierFruits?.(gameState, { refreshVisuals: false });
      this.scene.createOrUpdateHouse(gameState.multiplier || 1);
      this.scene.syncBonusCollectedSymbolCounts?.(this.getBonusCollectedCountsBeforeAction(gameState));

      const remaining = gameState.bonusState?.finalFreespins || 0;
      this.scene.updateFreespinCounter(remaining, { deferRingConsume: true });

      const smashedOldSymbols = await this.playFreespinSmashSymbolClear(gameState);
      if (!smashedOldSymbols) {
        await this.scene.slideOutOldSymbols();
      }
      await this.scene.playBonusMysteryFeatureReleaseAfterKapow?.(
        gameState?.bonusMysteryFeatureReleaseThisAction || null,
        {
          allowFeatureBlockedLanding: false,
          bonusMysteryFeatureState: gameState?.bonusMysteryFeature || null
        }
      );
      await this.scene.playLightningBeeMovements?.(
        gameState?.lightningBeeMovementsThisAction || [],
        gameState?.lightningBeeFeature || null
      );

      await this.scene.dropSymbols(gameState.reels, gameState.executedAction, "staff", [], null);
      if (this.isHeavenHellEnabled(gameState)) {
        this.scene.hideNonHeavenHellBonusSymbols?.(gameState);
      }
      await this.playBonusMysteryFeatureCollectionsForAction(gameState);
      await this.playLightningBeeFeatureCollectionsForAction(gameState);
      if (this.hasMergeGunActivations(gameState)) {
        await this.syncMergeGunFeatureUi(gameState, { playActivation: true });
      }
      await this.syncMergeGunFeatureUi(gameState, { playActivation: false });

      if (Array.isArray(gameState.barrelBursts) && gameState.barrelBursts.length > 0) {
        await this.scene.playBarrelBurstAnimation?.(gameState.barrelBursts);
      }

      if (!this.isHeavenHellEnabled(gameState)) {
        await this.scene.collectBonusSymbolsThisAction?.(
          gameState?.bonusCollectedThisAction || [],
          gameState?.bonusCollectedSymbols || {},
          {
            playHighlight: Array.isArray(gameState?.clusters) && gameState.clusters.length > 0,
            clusters: gameState?.clusters || [],
            immediateLowPositionLandings: gameState?.bonusState?.immediateLowPositionLandings || []
          }
        );
      }
      const bonusEndPayout = gameState?.bonusEndPayout;
      const hasRainPayoutData =
        (bonusEndPayout?.landings?.length ?? 0) > 0 ||
        (bonusEndPayout?.phases?.length ?? 0) > 0 ||
        (bonusEndPayout?.lightningBeeFeature?.events?.length ?? 0) > 0;
      const immediateLowBackplateLandings = Array.isArray(gameState?.bonusState?.immediateLowPositionLandings)
        ? gameState.bonusState.immediateLowPositionLandings
        : [];
      const shouldCollectBackplatesOnly =
        gameState?.nextAction === "spin" &&
        !hasRainPayoutData &&
        immediateLowBackplateLandings.length > 0;
      if (hasRainPayoutData || shouldCollectBackplatesOnly) {
        const finalTwa = Number(gameState?.twa || 0);
        let payoutTotalTwa = Number(bonusEndPayout?.totalTwa || 0);
        if (!(payoutTotalTwa > 0) && shouldCollectBackplatesOnly) {
          payoutTotalTwa = immediateLowBackplateLandings.reduce((sum, entry) => {
            const increment = Number(
              this.scene?.getImmediateLowSymbolValueTbm?.(entry?.symbol ?? entry?.symbolId) || 0
            );
            return sum + (Number.isFinite(increment) ? increment : 0);
          }, 0);
        }
        const baseTwa = Math.max(0, finalTwa - Math.max(0, payoutTotalTwa));
        await this.scene.playBonusEndPayout?.(bonusEndPayout, {
          baseTwa,
          finalTwa,
          betSize: gameState?.betSize,
          releaseBalloonsAfterKapow: false,
          allowFeatureBlockedBalloonLanding: false,
          bonusMysteryFeature: gameState?.bonusMysteryFeature,
          lightningBeeFeature: gameState?.lightningBeeFeature
        });
      } else {
        this.scene.updateCountUp(gameState.twa || 0);
      }
      await this.playHeavenHellCollectPhaseIfNeeded(gameState);

      if (gameState.nextAction === "spin") {
        this.scene.resetLightningCount();
        this.scene.stopBonusTheme();
      }
    },

    async handleFreerespinAction(gameState) {
      this.syncHeavenHellLootBehindDemons?.(gameState);
      if (this.isHeavenHellEnabled(gameState) && gameState?.dropEvent?.direction === "ripple") {
        this.scene.setCurrentAction?.("freerespin");
        this.scene.syncBonusMultiplierFruits?.(gameState, { refreshVisuals: false });
        this.syncHeavenHellPentagram?.(gameState);
        await this.scene.playHeavenHellRippleSpawn?.(gameState);
        this.scene.hideNonHeavenHellBonusSymbols?.(gameState);
        const playedCollectPhase = await this.playHeavenHellCollectPhaseIfNeeded(gameState);
        this.renderHeavenHellBonusLootGround?.(gameState);
        await this.syncHeavenHellAbilityUi?.(gameState, { allowRewardFx: false });
        if (!playedCollectPhase) {
          this.scene.updateCountUp(gameState.twa || 0);
        }
        if (gameState.nextAction === "spin") {
          this.scene.resetLightningCount?.();
          this.scene.stopBonusTheme?.();
        }
        this.scene.emitOutcomeRevealed?.();
        if (gameState.nextAction === "spin") {
          this.scene.emitRoundEnded?.();
        }
        this.scene.updateHellDiveBackground?.(gameState);
        return;
      }

      this.scene.setCurrentAction?.("freerespin");
      this.scene.setCurrentHeroFootprintSize?.(this.getHeroFootprintSizeBeforeStageEvent(gameState));
      this.scene.syncBonusMultiplierFruits?.(gameState, { refreshVisuals: false });

      if (!gameState.reelsAfterDrop || !gameState.dropEvent) {
        this.scene.emitOutcomeRevealed?.();
        if (gameState.nextAction === "spin") {
          this.scene.emitRoundEnded?.();
        }
        return;
      }

      await this.scene.applyGravityAnimation(gameState.reelsAfterDrop, gameState.dropEvent, gameState.timeSymbols);
      if (this.isHeavenHellEnabled(gameState)) {
        this.scene.hideNonHeavenHellBonusSymbols?.(gameState);
      }
      await this.playBonusMysteryFeatureCollectionsForAction(gameState);
      await this.playLightningBeeFeatureCollectionsForAction(gameState);
      if (this.hasMergeGunActivations(gameState)) {
        await this.syncMergeGunFeatureUi(gameState, { playActivation: true });
      }
      await this.syncMergeGunFeatureUi(gameState, { playActivation: false });

      if (Array.isArray(gameState.barrelBursts) && gameState.barrelBursts.length > 0) {
        await this.scene.playBarrelBurstAnimation?.(gameState.barrelBursts);
      }

      if (!this.isHeavenHellEnabled(gameState)) {
        await this.scene.collectBonusSymbolsThisAction?.(
          gameState?.bonusCollectedThisAction || [],
          gameState?.bonusCollectedSymbols || {},
          {
            playHighlight: Array.isArray(gameState?.clusters) && gameState.clusters.length > 0,
            clusters: gameState?.clusters || [],
            immediateLowPositionLandings: gameState?.bonusState?.immediateLowPositionLandings || []
          }
        );
      }
      const bonusEndPayout = gameState?.bonusEndPayout;
      const hasRainPayoutData =
        (bonusEndPayout?.landings?.length ?? 0) > 0 ||
        (bonusEndPayout?.phases?.length ?? 0) > 0 ||
        (bonusEndPayout?.lightningBeeFeature?.events?.length ?? 0) > 0;
      const immediateLowBackplateLandings = Array.isArray(gameState?.bonusState?.immediateLowPositionLandings)
        ? gameState.bonusState.immediateLowPositionLandings
        : [];
      const shouldCollectBackplatesOnly =
        gameState?.nextAction === "spin" &&
        !hasRainPayoutData &&
        immediateLowBackplateLandings.length > 0;
      if (hasRainPayoutData || shouldCollectBackplatesOnly) {
        const finalTwa = Number(gameState?.twa || 0);
        let payoutTotalTwa = Number(bonusEndPayout?.totalTwa || 0);
        if (!(payoutTotalTwa > 0) && shouldCollectBackplatesOnly) {
          payoutTotalTwa = immediateLowBackplateLandings.reduce((sum, entry) => {
            const increment = Number(
              this.scene?.getImmediateLowSymbolValueTbm?.(entry?.symbol ?? entry?.symbolId) || 0
            );
            return sum + (Number.isFinite(increment) ? increment : 0);
          }, 0);
        }
        const baseTwa = Math.max(0, finalTwa - Math.max(0, payoutTotalTwa));
        await this.scene.playBonusEndPayout?.(bonusEndPayout, {
          baseTwa,
          finalTwa,
          betSize: gameState?.betSize,
          releaseBalloonsAfterKapow: false,
          allowFeatureBlockedBalloonLanding: true,
          bonusMysteryFeature: gameState?.bonusMysteryFeature,
          lightningBeeFeature: gameState?.lightningBeeFeature
        });
      } else {
        this.scene.updateCountUp(gameState.twa || 0);
      }
      await this.playHeavenHellCollectPhaseIfNeeded(gameState);

      if (gameState.nextAction === "spin") {
        this.scene.resetLightningCount();
        this.scene.stopBonusTheme();
      }
    },

    async handleFreespinBananaHuntAction(gameState) {
      this.scene.setCurrentAction?.(ACTION_FREESPIN_BANANA_HUNT);
      this.scene.syncBonusMultiplierFruits?.(gameState, { refreshVisuals: false });
      if (this.isHeavenHellEnabled(gameState)) {
        this.syncHeavenHellPentagram?.(gameState, { usePresentationState: true });
      }

      if (gameState.heroPath && gameState.heroPath.length > 0) {
        const stepType = "destroy";
        const weapon = "staff";
        const bananaMeterLevel = gameState?.bananaMeter?.level ?? gameState?.bananaMeterLevel ?? 0;
        const finalMeterCount = Number(gameState?.bananaMeter?.count ?? gameState?.bananaMeterCount ?? 0);
        const bonusStageEvent = gameState?.bonusStageEvent;
        const currentHeroFootprintSize = Number(gameState?.heroFootprintSize || 1);
        const huntHeroFootprintSize = bonusStageEvent?.giantMonkeyActivated
          ? Number(bonusStageEvent?.previousHeroFootprintSize || 1)
          : currentHeroFootprintSize;
        const huntBonusStage = Number.isFinite(Number(bonusStageEvent?.previousStage))
          ? Number(bonusStageEvent.previousStage)
          : Number(gameState?.bonusStage || 0);
        const sceneMeterCount = Number(this.scene?.currentBananaMeterCount);
        let meterStartCount = Number.isFinite(sceneMeterCount) ? sceneMeterCount : finalMeterCount;
        if (!Number.isFinite(sceneMeterCount)) {
          const demonsKilledThisAction = Math.max(0, Number(gameState?.demonsKilledThisAction ?? 0) || 0);
          meterStartCount = Math.max(0, finalMeterCount - demonsKilledThisAction);
        }
        meterStartCount = Math.min(meterStartCount, finalMeterCount);

        await this.scene.animateHeroHunt(
          gameState.heroPath,
          gameState.affectedPositions,
          gameState.orbDrops || [],
          gameState.multiplier || 1,
          gameState.totalDemonsCollectedInSequence ?? gameState.totalDemonsKilledInSequence ?? 0,
          stepType,
          weapon,
          null,
          bananaMeterLevel,
          false,
          {
            startCount: meterStartCount,
            finalCount: finalMeterCount,
            baseCountUpValue: Number(gameState?.prevTwa || 0)
          },
          {
            rushActive: gameState?.rushActive === true,
            bonusStage: huntBonusStage,
            finalBonusStage: Number(gameState?.bonusStage || huntBonusStage || 0),
            heroFootprintSize: huntHeroFootprintSize,
            giantMonkeyActive: huntHeroFootprintSize > 1,
            firstHeavenHellBonusEntryAttack:
              this.isHeavenHellEnabled(gameState) &&
              Math.max(0, Math.floor(Number(gameState?.heavenHell?.bonus?.actionCount || 0))) === 1,
            mergeGunFeatureCollections: gameState?.mergeGunFeatureThisAction?.collected || gameState?.mergeGunFeatureCollectedThisAction || [],
            mergeGunActivations: gameState?.mergeGunFeatureThisAction?.activations || gameState?.mergeGunActivationsThisAction || [],
            mergeGunAreas: this.getMergeGunAreasForDisplay(gameState),
            bonusMysteryFeatureCollections: gameState?.bonusMysteryFeatureCollectedThisAction || [],
            lightningBeeFeatureCollections: gameState?.lightningBeeFeatureCollectedThisAction || [],
            heavenHellGameState: this.isHeavenHellEnabled(gameState) ? gameState : null
          }
        );
        if (bonusStageEvent?.giantMonkeyActivated) {
          await this.scene.animateHeroGrowthExpansion?.(bonusStageEvent);
        } else {
          this.scene.syncHeroBonusForm?.(currentHeroFootprintSize, false, gameState?.heroPosition || null);
        }
      }
      await this.syncMergeGunFeatureUi(gameState, { playActivation: false });
      this.syncBonusMysteryFeatureUi(gameState, { consume: true });
      this.syncLightningBeeFeatureUi(gameState, { consume: true });
      if (!this.isHeavenHellEnabled(gameState)) {
        await this.scene.collectBonusSymbolsThisAction?.(
          gameState?.bonusCollectedThisAction || [],
          gameState?.bonusCollectedSymbols || {},
          {
            immediateLowPositionLandings: gameState?.bonusState?.immediateLowPositionLandings || []
          }
        );
      }

      if (gameState.mysteryReveals && gameState.mysteryReveals.length > 0) {
        const stepType = gameState.hero?.step || "destroy";
        await this.scene.revealMysterySymbols(gameState.mysteryReveals, stepType);
      }

      const bonusStageEvent = gameState?.bonusStageEvent;
      if (bonusStageEvent && Number(bonusStageEvent.freespinsAwarded || 0) > 0) {
        this.scene.updateFreespinCounter(gameState.bonusState?.finalFreespins || 0);
      }
      if (bonusStageEvent?.giantMonkeyActivated && (!gameState.heroPath || gameState.heroPath.length === 0)) {
        await this.scene.animateHeroGrowthExpansion?.(bonusStageEvent);
      }

      this.scene.cleanupAllBackplates();

      if (this.isHeavenHellEnabled(gameState)) {
        await this.scene.ensureHeavenHellQueuedChestDrops?.(gameState, { animateMissing: false });
      }

      const playedCollectPhase = await this.playHeavenHellCollectPhaseIfNeeded(gameState);
      if (!playedCollectPhase) {
        this.scene.updateCountUp(gameState.twa || 0);
      }
      if (this.isHeavenHellEnabled(gameState)) {
        this.scene.syncSpritesToReelState?.(gameState?.reels || {});
        this.scene.hideNonHeavenHellBonusSymbols?.(gameState);
        this.scene.createOrUpdateHouse?.(gameState?.multiplier || 1);
        this.syncHeavenHellPentagram?.(gameState);
        this.renderHeavenHellBonusLootGround?.(gameState);
        await this.syncHeavenHellAbilityUi?.(gameState, { allowRewardFx: true });
      }

      if (gameState.nextAction === "spin") {
        this.scene.resetLightningCount();
        this.scene.stopBonusTheme();
      }
    },

    async handleChestRewardAction(gameState) {
      if (!this.isHeavenHellEnabled(gameState)) {
        return;
      }

      this.scene.setCurrentAction?.("chestreward");
      this.scene.startBonusTheme?.();

      await this.scene.playHeavenHellChestRewardSequence?.(gameState);

      const playedCollectPhase = await this.playHeavenHellCollectPhaseIfNeeded(gameState);
      this.syncHeavenHellPentagram?.(gameState);
      this.renderHeavenHellBonusLootGround?.(gameState);
      this.scene.updateHeavenHellAbilityText?.(gameState, { allowRewardFx: false });

      if (!playedCollectPhase) {
        this.scene.updateCountUp(gameState.twa || 0);
      }

      if (gameState.nextAction === "spin") {
        this.scene.resetLightningCount?.();
        this.scene.stopBonusTheme?.();
      }
    },

    async playFreespinSmashSymbolClear(gameState = {}) {
      if (typeof this.scene?.playFreespinSmashSymbolClear !== "function") {
        return false;
      }

      return this.scene.playFreespinSmashSymbolClear({
        heroPosition: gameState?.heroPosition || gameState?.bonusStageEvent?.heroPosition || null,
        heroFootprintSize: this.getHeroFootprintSizeBeforeStageEvent(gameState),
        weapon: gameState?.hero?.weapon || "staff"
      });
    },

    getHeroFootprintSizeBeforeStageEvent(gameState = {}) {
      const stageEvent = gameState?.bonusStageEvent;
      if (stageEvent?.giantMonkeyActivated === true) {
        const previousFootprintSize = Math.max(
          1,
          Math.floor(Number(stageEvent?.previousHeroFootprintSize || 1))
        );
        if (Number.isFinite(previousFootprintSize)) {
          return previousFootprintSize;
        }
      }

      return Math.max(1, Math.floor(Number(gameState?.heroFootprintSize || 1)));
    },

    syncHeavenHellLootBehindDemons(gameState = {}) {
      if (!this.isHeavenHellEnabled(gameState)) {
        return;
      }

      this.scene.setHeavenHellLootLayerLock?.(null);
      this.renderHeavenHellBonusLootGround?.(gameState, { layer: "behindDemons" });
    }
  };
}
