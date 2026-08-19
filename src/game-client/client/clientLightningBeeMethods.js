export function createClientLightningBeeMethods() {
  return {
    syncLightningBeeFeatureUi(gameState = {}, { consume = false } = {}) {
      const entries = Array.isArray(gameState?.lightningBeeFeatureCollectedThisAction)
        ? gameState.lightningBeeFeatureCollectedThisAction
        : [];
      let consumed = 0;
      if (consume && typeof this.scene?.consumeLightningBeeFeatureCollections === "function") {
        consumed = this.scene.consumeLightningBeeFeatureCollections(entries) || 0;
      }
      const pulse = consume && (entries.some((entry) => entry?.applied === true) || consumed > 0);
      const featureState = gameState?.lightningBeeFeature || null;
      const movementEntries = Array.isArray(gameState?.lightningBeeMovementsThisAction)
        ? gameState.lightningBeeMovementsThisAction
        : [];
      const collectedBeeIdsThisAction = new Set(
        entries
          .filter((entry) => entry?.applied === true)
          .map((entry) => Math.floor(Number(entry?.beeId ?? entry?.id)))
          .filter((id) => Number.isFinite(id))
      );
      const normalizeBoardBeeForDisplay = (entry = null, { useFromPosition = false } = {}) => {
        const reel = Math.floor(Number(useFromPosition ? entry?.fromReel : entry?.reel));
        const row = Math.floor(Number(useFromPosition ? entry?.fromRow : entry?.row));
        if (!Number.isFinite(reel) || !Number.isFinite(row)) return null;
        const beeId = Math.max(1, Math.floor(Number(entry?.beeId ?? entry?.id ?? 1)) || 1);
        return {
          id: beeId,
          beeId,
          reel,
          row,
          multiplierStep: Math.max(0, Math.floor(Number(entry?.fromMultiplierStep ?? entry?.multiplierStep ?? 0)) || 0),
          multiplier: Math.max(1, Math.floor(Number(entry?.fromMultiplier ?? entry?.multiplier ?? 1)) || 1)
        };
      };
      const mergeBoardBeeDisplayEntries = (...groups) => {
        const merged = [];
        const seen = new Set();
        groups.flat().forEach((entry) => {
          if (!entry) return;
          const id = Math.floor(Number(entry?.beeId ?? entry?.id));
          const key = Number.isFinite(id) ? `id:${id}` : `${entry.reel},${entry.row}`;
          if (seen.has(key)) return;
          seen.add(key);
          merged.push(entry);
        });
        return merged;
      };
      const movementBoardBees = movementEntries
        .map((entry) => normalizeBoardBeeForDisplay(entry, { useFromPosition: true }))
        .filter(Boolean);
      const collectedBoardBees = entries
        .map((entry) => normalizeBoardBeeForDisplay(entry))
        .filter(Boolean);
      const featureBoardBees = Array.isArray(featureState?.boardBees) ? featureState.boardBees : [];
      const boardBeesForDisplay = movementEntries.length > 0
        ? mergeBoardBeeDisplayEntries(movementBoardBees, collectedBoardBees)
        : mergeBoardBeeDisplayEntries(featureBoardBees, collectedBoardBees);
      const displayState = !consume && featureState
        ? {
            ...featureState,
            collectedBees: Array.isArray(featureState.collectedBees)
              ? featureState.collectedBees.filter((entry) => {
                  const id = Math.floor(Number(entry?.beeId ?? entry?.id));
                  return !Number.isFinite(id) || !collectedBeeIdsThisAction.has(id);
                })
              : featureState.collectedBees,
            boardBees: boardBeesForDisplay,
            collected: Math.max(
              0,
              Math.floor(Number(featureState.collected || 0)) -
                entries.filter((entry) => entry?.applied === true).length
            )
          }
        : featureState;
      this.scene.updateLightningBeeMeter?.(displayState, {
        isBonus: gameState?.isBonus === true,
        pulse
      });
    },

    async playLightningBeeFeatureCollectionsForAction(gameState = {}) {
      const allEntries = Array.isArray(gameState?.lightningBeeFeatureCollectedThisAction)
        ? gameState.lightningBeeFeatureCollectedThisAction
        : [];
      if (allEntries.length === 0 || typeof this.scene?.playLightningBeeFeatureCollection !== "function") {
        this.syncLightningBeeFeatureUi(gameState, { consume: true });
        return;
      }

      const entries = allEntries.filter((entry) => entry?.handledByLightningBeeMovement !== true);
      if (entries.length === 0) {
        this.scene.updateLightningBeeMeter?.(gameState?.lightningBeeFeature || null, {
          isBonus: gameState?.isBonus === true,
          pulse: allEntries.some((entry) => entry?.applied === true)
        });
        return;
      }

      for (const entry of entries) {
        await this.scene.playLightningBeeFeatureCollection(entry);
      }
      this.scene.updateLightningBeeMeter?.(gameState?.lightningBeeFeature || null, {
        isBonus: gameState?.isBonus === true,
        pulse: true
      });
    }
  };
}
