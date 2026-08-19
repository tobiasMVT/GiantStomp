export function createClientFlowMethods(deps = {}) {
  const {
    ACTION_BANANA_HUNT,
    ACTION_FREESPIN_BANANA_HUNT,
    LEGACY_ACTION_BANANA_HUNT,
    LEGACY_ACTION_FREESPIN_BANANA_HUNT,
    DEFAULT_FLOW_TIMING,
    buildSegmentFlow
  } = deps;

  return {
    async reactOnResponse(gameState, clientState) {
      if (!this.scene) {
        console.warn("❌ Client.scene is undefined!");
        return;
      }

      this.scene.clearPendingFastForward?.();
      this.scene.resetActionBonusCollectionAnimationState?.();
      this.cancelActiveDelay();
      this.segmentFlowRunner.reset();
      this.syncBonusMysteryFeatureUi(gameState, { consume: false });
      this.syncLightningBeeFeatureUi(gameState, { consume: false });
      await this.syncMergeGunFeatureUi(gameState, {
        playActivation: false,
        suppressPreviewWhenActivationsPending: true
      });
      const heavenHellAbilityPresentationState = this.getHeavenHellAbilityPresentationState?.(gameState) || gameState;
      this.scene.updateHeavenHellAbilityText?.(heavenHellAbilityPresentationState, { allowRewardFx: false });

      if (gameState.executedAction === "spin" || gameState.executedAction === "freespin") {
        this.scene.emitRoundStarted?.();
      }

      if (gameState.executedAction === "spin") {
        await this.handleSpinAction(gameState, clientState);
      } else if (gameState.executedAction === "trolltease") {
        this.handleTrollTeaseAction(gameState, clientState);
      } else if (gameState.executedAction === "trollrush") {
        this.handleTrollRushAction(gameState, clientState);
      } else if (gameState.executedAction === "respin") {
        await this.handleRespinAction(gameState, clientState);
      } else if (gameState.executedAction === ACTION_BANANA_HUNT || gameState.executedAction === LEGACY_ACTION_BANANA_HUNT) {
        await this.handleBananaHuntAction(gameState, clientState);
      } else if (gameState.executedAction === "bonustransition") {
        await this.handleBonusTransitionAction(gameState, clientState);
      } else if (gameState.executedAction === "freespin") {
        await this.handleFreespinAction(gameState, clientState);
      } else if (gameState.executedAction === "freerespin") {
        await this.handleFreerespinAction(gameState, clientState);
      } else if (gameState.executedAction === ACTION_FREESPIN_BANANA_HUNT || gameState.executedAction === LEGACY_ACTION_FREESPIN_BANANA_HUNT) {
        await this.handleFreespinBananaHuntAction(gameState, clientState);
      } else if (gameState.executedAction === "chestreward") {
        await this.handleChestRewardAction(gameState, clientState);
      }

      if (gameState.executedAction === "freespin" || gameState.executedAction === "freerespin") {
        this.scene.emitOutcomeRevealed?.();
      }

      if (gameState.nextAction === "spin") {
        this.scene.emitRoundEnded?.();
      }

      this.scene.updateHellDiveBackground?.(gameState);
    },

    async runSegmentFlow(gameState, timing = DEFAULT_FLOW_TIMING) {
      const segments = buildSegmentFlow({
        gameState,
        scene: this.scene,
        timing,
        waitCancellable: (ms) => this.waitCancellable(ms),
        cancelActiveDelay: () => this.cancelActiveDelay()
      });

      if (!segments.length) {
        return false;
      }

      this.scene.clearPendingFastForward?.();
      this.segmentFlowRunner.setSegments(segments);

      try {
        await this.segmentFlowRunner.run();
      } finally {
        this.segmentFlowRunner.reset();
        this.cancelActiveDelay();
        this.scene.clearPendingFastForward?.();
      }

      return true;
    },

    waitCancellable(ms) {
      return this.waitForPresentation(ms);
    },

    cancelActiveDelay() {
      this.scene?.cancelSkippablePresentationWaits?.();
    },

    waitForPresentation(ms, options = {}) {
      if (this.scene?.waitForPresentation) {
        return this.scene.waitForPresentation(ms, {
          skippable: true,
          ...options
        });
      }

      return wait(ms);
    },

    requestFastForward() {
      this.segmentFlowRunner.requestSkip({
        fallbackSkipAction: () => {
          this.cancelActiveDelay();
          this.scene?.requestFastForward?.();
        }
      });
    }
  };
}

async function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
