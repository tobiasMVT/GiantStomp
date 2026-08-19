export function createClientBonusMysteryMethods() {
  return {
    getBonusCollectedCountsBeforeAction(gameState = {}) {
      const normalizeCounts = (rawCounts = null) => {
        if (typeof this.scene?.getNormalizedBonusFruitCounts === "function") {
          return this.scene.getNormalizedBonusFruitCounts(rawCounts);
        }

        const normalized = {};
        Object.entries(rawCounts || {}).forEach(([symbol, rawCount]) => {
          const parsedSymbol = Number(symbol);
          const count = Math.max(0, Math.floor(Number(rawCount || 0) || 0));
          if (Number.isFinite(parsedSymbol) && count > 0) {
            normalized[String(parsedSymbol)] = count;
          }
        });
        return normalized;
      };

      const resolveSymbolId = (entry = null) => {
        if (typeof this.scene?.getCollectableBonusSymbolId === "function") {
          return this.scene.getCollectableBonusSymbolId(entry?.symbol ?? entry?.symbolId);
        }
        const parsed = Number(entry?.symbol ?? entry?.symbolId);
        return Number.isFinite(parsed) ? parsed : null;
      };

      const beforeActionCounts = normalizeCounts(gameState?.bonusCollectedSymbols || {});
      (Array.isArray(gameState?.bonusCollectedThisAction) ? gameState.bonusCollectedThisAction : []).forEach((entry) => {
        const symbolId = resolveSymbolId(entry);
        if (symbolId === null) return;
        const centerMachineCollect =
          entry?.centerMachineCollect !== false &&
          (typeof this.scene?.isBonusCenterMachineCollectableSymbol !== "function" ||
            this.scene.isBonusCenterMachineCollectableSymbol(symbolId));
        if (!centerMachineCollect) return;

        const key = String(symbolId);
        const nextValue = Math.max(0, Number(beforeActionCounts[key] || 0) - 1);
        if (nextValue > 0) {
          beforeActionCounts[key] = nextValue;
        } else {
          delete beforeActionCounts[key];
        }
      });

      return beforeActionCounts;
    },

    syncBonusMysteryFeatureUi(gameState = {}, { consume = false } = {}) {
      const entries = Array.isArray(gameState?.bonusMysteryFeatureCollectedThisAction)
        ? gameState.bonusMysteryFeatureCollectedThisAction
        : [];
      let consumed = 0;
      if (consume && typeof this.scene?.consumeBonusMysteryFeatureCollections === "function") {
        consumed = this.scene.consumeBonusMysteryFeatureCollections(entries) || 0;
      }
      const pulse = consume && (entries.some((entry) => entry?.applied === true) || consumed > 0);
      const featureState = gameState?.bonusMysteryFeature || null;
      const displayState = !consume && featureState
        ? {
            ...featureState,
            collected: Math.max(
              0,
              Math.floor(Number(featureState.collected || 0)) -
                entries.filter((entry) => entry?.applied === true).length
            )
          }
        : featureState;
      this.scene.updateBonusMysteryMeter?.(displayState, {
        isBonus: gameState?.isBonus === true,
        pulse
      });
    },

    async playBonusMysteryFeatureCollectionsForAction(gameState = {}) {
      const entries = Array.isArray(gameState?.bonusMysteryFeatureCollectedThisAction)
        ? gameState.bonusMysteryFeatureCollectedThisAction
        : [];
      if (entries.length === 0 || typeof this.scene?.playBonusMysteryFeatureCollection !== "function") {
        this.syncBonusMysteryFeatureUi(gameState, { consume: true });
        return;
      }

      for (const entry of entries) {
        await this.scene.playBonusMysteryFeatureCollection(entry);
      }
      this.scene.updateBonusMysteryMeter?.(gameState?.bonusMysteryFeature || null, {
        isBonus: gameState?.isBonus === true,
        pulse: true
      });
    }
  };
}
