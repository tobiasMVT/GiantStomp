export function createClientMergeGunMethods() {
  return {
    buildMergeGunAreasFromPositions(rawPositions = []) {
      const positionsByKey = new Map();
      (Array.isArray(rawPositions) ? rawPositions : []).forEach((entry) => {
        const reel = Math.floor(Number(entry?.reel));
        const row = Math.floor(Number(entry?.row));
        if (!Number.isFinite(reel) || !Number.isFinite(row)) return;
        if (reel < 0 || row < 0) return;
        positionsByKey.set(`${reel},${row}`, { reel, row });
      });

      const remainingKeys = new Set(positionsByKey.keys());
      const areas = [];
      while (remainingKeys.size > 0) {
        const seedKey = remainingKeys.values().next().value;
        const queue = [seedKey];
        const areaPositions = [];
        remainingKeys.delete(seedKey);

        while (queue.length > 0) {
          const key = queue.shift();
          const position = positionsByKey.get(key);
          if (!position) continue;
          areaPositions.push(position);

          const neighbors = [
            `${position.reel - 1},${position.row}`,
            `${position.reel + 1},${position.row}`,
            `${position.reel},${position.row - 1}`,
            `${position.reel},${position.row + 1}`
          ];
          neighbors.forEach((neighborKey) => {
            if (!remainingKeys.has(neighborKey)) return;
            remainingKeys.delete(neighborKey);
            queue.push(neighborKey);
          });
        }

        areaPositions.sort((a, b) => (a.reel - b.reel) || (a.row - b.row));
        const id = `glue:${areaPositions.map((position) => `${position.reel},${position.row}`).join("|")}`;
        areas.push({
          id,
          positions: areaPositions
        });
      }

      return areas;
    },

    getMergeGunAreaSignature(rawAreas = []) {
      return this.buildMergeGunAreasFromPositions(
        (Array.isArray(rawAreas) ? rawAreas : []).flatMap((area) => area?.positions || [])
      )
        .map((area) => area.positions.map((position) => `${position.reel},${position.row}`).join("|"))
        .sort()
        .join("::");
    },

    getMergeGunAreasForDisplay(gameState = {}) {
      const featureState = gameState?.mergeGunFeature || {};
      const topLevelPersistentState =
        gameState?.mergeGunPersistentState && typeof gameState.mergeGunPersistentState === "object"
          ? gameState.mergeGunPersistentState
          : {};
      const explicitAreas = Array.isArray(featureState?.areas) && featureState.areas.length > 0
        ? featureState.areas
        : (
          Array.isArray(featureState?.persistentAreas) && featureState.persistentAreas.length > 0
            ? featureState.persistentAreas
            : (
              Array.isArray(topLevelPersistentState?.areas)
                ? topLevelPersistentState.areas
                : []
            )
        );
      const persistentPositions = Array.isArray(featureState?.persistentHighlightedPositions) && featureState.persistentHighlightedPositions.length > 0
        ? featureState.persistentHighlightedPositions
        : (
          Array.isArray(featureState?.highlightedPositions) && featureState.highlightedPositions.length > 0
            ? featureState.highlightedPositions
            : (
              Array.isArray(topLevelPersistentState?.highlightedPositions)
                ? topLevelPersistentState.highlightedPositions
                : []
            )
        );
      const fallbackAreas = this.buildMergeGunAreasFromPositions(persistentPositions);
      const explicitAreaCellCount = explicitAreas.reduce((sum, area) => (
        sum + (Array.isArray(area?.positions) ? area.positions.length : 0)
      ), 0);
      const fallbackAreaCellCount = fallbackAreas.reduce((sum, area) => sum + area.positions.length, 0);
      const explicitAreaSignature = this.getMergeGunAreaSignature(explicitAreas);
      const fallbackAreaSignature = this.getMergeGunAreaSignature(fallbackAreas);

      if (
        fallbackAreaCellCount > explicitAreaCellCount ||
        (
          fallbackAreas.length > 0 &&
          explicitAreas.length > 0 &&
          fallbackAreaSignature !== explicitAreaSignature
        )
      ) {
        return fallbackAreas;
      }
      return explicitAreas.length > 0 ? explicitAreas : fallbackAreas;
    },

    hasMergeGunActivations(gameState = {}) {
      const actionState = gameState?.mergeGunFeatureThisAction || {};
      const activations = Array.isArray(actionState?.activations)
        ? actionState.activations
        : (
          Array.isArray(gameState?.mergeGunActivationsThisAction)
            ? gameState.mergeGunActivationsThisAction
            : []
        );
      return activations.length > 0;
    },

    async syncMergeGunFeatureUi(gameState = {}, { playActivation = false, suppressPreviewWhenActivationsPending = false } = {}) {
      const areas = this.getMergeGunAreasForDisplay(gameState);
      const mergeGunActionState = gameState?.mergeGunFeatureThisAction || {};
      const featureState = gameState?.mergeGunFeature || {};
      const collected = Math.max(0, Math.floor(Number(featureState?.collected || 0) || 0));
      const max = Math.max(0, Math.floor(Number(featureState?.max || 0) || 0));
      if (max > 0 && collected >= max) {
        this.scene.clearVisibleMergeGunFeatureSymbols?.();
      }
      const activations = Array.isArray(mergeGunActionState?.activations)
        ? mergeGunActionState.activations
        : (
          Array.isArray(gameState?.mergeGunActivationsThisAction)
            ? gameState.mergeGunActivationsThisAction
            : []
        );
      if (!playActivation && suppressPreviewWhenActivationsPending === true && activations.length > 0) {
        return;
      }
      if (playActivation && typeof this.scene?.playMergeGunActivations === "function") {
        await this.scene.playMergeGunActivations(
          activations,
          areas
        );
        return;
      }

      this.scene.syncMergeGunAreas?.(areas, {
        isBonus: gameState?.isBonus === true,
        showValues: false,
        preserveExistingOnEmpty: true
      });
    }
  };
}
