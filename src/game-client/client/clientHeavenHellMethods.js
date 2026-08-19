export function createClientHeavenHellMethods() {
  return {
    isHeavenHellEnabled(gameState = {}) {
      return gameState?.heavenHell && typeof gameState.heavenHell === "object";
    },

    hasPendingHeavenHellChests(gameState = {}) {
      if (!this.isHeavenHellEnabled(gameState)) {
        return false;
      }
      return (gameState?.heavenHell?.bonus?.pendingChests?.length || 0) > 0;
    },

    getHeavenHellAbilityUnlockEvents(gameState = {}) {
      if (!this.isHeavenHellEnabled(gameState) || gameState?.isBonus !== true) {
        return [];
      }
      const procs = Array.isArray(gameState?.heavenHell?.bonus?.abilityProcsThisAction)
        ? gameState.heavenHell.bonus.abilityProcsThisAction
        : [];
      return procs.filter((entry) =>
        entry &&
        (entry.type === "abilityUnlock" || entry.type === "abilityReward") &&
        typeof entry.ability === "string" &&
        entry.ability.length > 0
      );
    },

    getHeavenHellAbilityPresentationState(gameState = {}) {
      const unlockEvents = this.getHeavenHellAbilityUnlockEvents(gameState);
      if (unlockEvents.length === 0) {
        return gameState;
      }

      const presentationState = JSON.parse(JSON.stringify(gameState));
      const abilities = presentationState?.heavenHell?.bonus?.abilities;
      if (!abilities || typeof abilities !== "object") {
        return gameState;
      }

      unlockEvents.forEach((entry) => {
        const abilityKey = String(entry.ability || "");
        if (!abilityKey) return;
        abilities[abilityKey] = Math.max(0, Math.floor(Number(abilities[abilityKey] || 0)) - 1);
      });

      return presentationState;
    },

    getHeavenHellPentagramPresentationState(gameState = {}) {
      if (
        !this.isHeavenHellEnabled(gameState) ||
        gameState?.isBonus !== true ||
        gameState?.heavenHell?.bonus?.pentagram?.enabled !== true
      ) {
        return gameState;
      }

      const activations = Array.isArray(gameState?.heavenHell?.bonus?.pentagram?.activationsThisAction)
        ? gameState.heavenHell.bonus.pentagram.activationsThisAction
        : [];
      const completionEvent = gameState?.heavenHell?.bonus?.pentagram?.completionEventThisAction || null;
      const hasFreshActivation = activations.some((entry) => entry?.activated === true);
      if (!hasFreshActivation && !completionEvent) {
        return gameState;
      }

      const presentationState = JSON.parse(JSON.stringify(gameState));
      const bonus = presentationState?.heavenHell?.bonus;
      const pentagram = bonus?.pentagram;
      if (!bonus || !pentagram || typeof pentagram !== "object") {
        return gameState;
      }
      const pointIdsLitAtActionStart = Array.isArray(pentagram?.pointIdsLitAtActionStart)
        ? pentagram.pointIdsLitAtActionStart
        : (Array.isArray(completionEvent?.pointIdsLitAtActionStart) ? completionEvent.pointIdsLitAtActionStart : []);
      if (pentagram?.pointStates && typeof pentagram.pointStates === "object") {
        Object.keys(pentagram.pointStates).forEach((pointId) => {
          pentagram.pointStates[pointId] = pointIdsLitAtActionStart.includes(pointId);
        });
      }

      pentagram.litPointCount = Object.values(pentagram?.pointStates || {}).reduce(
        (sum, value) => sum + (value === true ? 1 : 0),
        0
      );
      pentagram.completed = Object.values(pentagram?.pointStates || {}).length > 0
        ? Object.values(pentagram.pointStates).every(Boolean)
        : false;
      pentagram.completionEventThisAction = null;

      if (completionEvent && Number.isFinite(Number(completionEvent?.beforeMultiplier))) {
        const beforeMultiplier = Math.max(1, Math.floor(Number(completionEvent.beforeMultiplier) || 1));
        presentationState.multiplier = beforeMultiplier;
        bonus.globalMultiplier = beforeMultiplier;
      }

      return presentationState;
    },

    syncHeavenHellPentagram(gameState = {}, { usePresentationState = false } = {}) {
      const stateForScene = usePresentationState
        ? (this.getHeavenHellPentagramPresentationState?.(gameState) || gameState)
        : gameState;
      this.scene.syncHeavenHellPentagram?.(stateForScene);
    },

    renderHeavenHellBonusLootGround(gameState = {}, { layer = null } = {}) {
      if (!this.isHeavenHellEnabled(gameState) || gameState?.isBonus !== true) {
        return;
      }

      this.scene.renderHeavenHellLootGround?.(
        gameState?.heavenHell?.bonus?.lootGround || [],
        { layer }
      );
    },

    async syncHeavenHellAbilityUi(gameState = {}, { allowRewardFx = true } = {}) {
      if (!this.isHeavenHellEnabled(gameState)) {
        return false;
      }

      await this.scene.waitForHeavenHellPendingMeterSoulTrails?.();

      const playedUnlockSequence = await this.scene.playHeavenHellAbilityUnlockSequence?.(gameState, {
        allowRewardFx
      });
      if (playedUnlockSequence) {
        return true;
      }

      this.scene.updateHeavenHellAbilityText?.(gameState, { allowRewardFx });
      return false;
    },

    async playHeavenHellCollectPhaseIfNeeded(gameState = {}) {
      if (!this.isHeavenHellEnabled(gameState) || gameState?.nextAction !== "spin") return;
      if (this.hasPendingHeavenHellChests(gameState)) return false;
      const settledDrops = Array.isArray(gameState?.heavenHell?.bonus?.lootGroundSettled)
        ? gameState.heavenHell.bonus.lootGroundSettled
        : [];
      if (settledDrops.length === 0) return false;
      await this.scene.playHeavenHellCollectPhase?.(gameState);
      return true;
    }
  };
}
