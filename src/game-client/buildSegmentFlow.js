/**
 * Flow builder for the current game.
 * - Converts a server response state into a list of generic segments.
 * - Segments are declarative: { checkpoint, enabled, run, onSkipAction }.
 * - Keep game-specific phase mapping here; keep runner generic.
 */
export function buildSegmentFlow({ gameState, scene, timing, waitCancellable, cancelActiveDelay }) {
  const hasClusters = !!(gameState.clusters && gameState.clusters.length > 0);
  const hasDropData = !!(gameState.reelsAfterDrop && gameState.dropEvent);
  const hasGoldPiles = !!gameState.collectedGoldPiles;
  const hasBarrelBursts = !!(gameState.barrelBursts && gameState.barrelBursts.length > 0);
  const { breathDelay = 0 } = timing || {};
  const weapon = gameState.hero?.weapon || "staff";
  const necromancerSpawns = gameState.necromancerSpawns || [];

  if (gameState.executedAction === "spin") {
    // Spin flow: drop -> breath -> reveal -> highlight -> explode -> finalize
    return [
      {
        checkpoint: false,
        enabled: true,
        run: async () => {
          await scene.slideOutOldSymbols();
          if (necromancerSpawns.length > 0) {
            await scene.animateNecromancerSpawns(necromancerSpawns);
          }
          await scene.dropSymbols(
            gameState.reels,
            gameState.executedAction,
            weapon,
            necromancerSpawns,
            gameState.timeSymbols
          );
        },
        onSkipAction: () => scene.requestFastForward?.()
      },
      {
        checkpoint: false,
        enabled: hasBarrelBursts,
        run: async () => {
          await scene.playBarrelBurstAnimation?.(gameState.barrelBursts);
        },
        onSkipAction: () => scene.requestFastForward?.()
      },
      {
        checkpoint: false,
        enabled: true,
        run: async () => {
          await waitCancellable(breathDelay);
        },
        onSkipAction: () => cancelActiveDelay?.()
      },
      {
        checkpoint: true,
        enabled: true,
        run: async () => {
          scene.emitOutcomeRevealed?.();
        }
      },
      {
        checkpoint: false,
        enabled: hasClusters,
        run: async () => {
          await scene.highlightClusters(gameState.clusters, 900, {
            activeWildPositions: scene.getMainGameActiveWildPositions?.(gameState) || null
          });
        },
        onSkipAction: () => {
          if (typeof scene.skipHighlightPhase === "function") {
            scene.skipHighlightPhase();
            return;
          }
          scene.requestFastForward?.();
        }
      },
      {
        checkpoint: false,
        enabled: hasClusters,
        run: async () => {
          await scene.explodeSymbols(gameState.clusters);
        },
        onSkipAction: () => scene.requestFastForward?.()
      },
      {
        checkpoint: true,
        enabled: true,
        run: async () => {
          scene.updateCountUp(gameState.twa || 0);
        }
      }
    ];
  }

  if (gameState.executedAction === "respin") {
    // Respin flow: gravity -> collect -> reveal -> highlight -> explode -> finalize
    return [
      {
        checkpoint: false,
        enabled: hasDropData,
        run: async () => {
          await scene.applyGravityAnimation(gameState.reelsAfterDrop, gameState.dropEvent, gameState.timeSymbols);
        },
        onSkipAction: () => scene.requestFastForward?.()
      },
      {
        checkpoint: false,
        enabled: hasBarrelBursts,
        run: async () => {
          await scene.playBarrelBurstAnimation?.(gameState.barrelBursts);
        },
        onSkipAction: () => scene.requestFastForward?.()
      },
      {
        checkpoint: true,
        enabled: true,
        run: async () => {
          scene.emitOutcomeRevealed?.();
        }
      },
      {
        checkpoint: false,
        enabled: hasGoldPiles,
        run: async () => {
          await scene.collectAllGoldPiles(gameState.collectedGoldPiles);
        },
        onSkipAction: () => scene.requestFastForward?.()
      },
      {
        checkpoint: false,
        enabled: hasClusters,
        run: async () => {
          await scene.highlightClusters(gameState.clusters, 900, {
            activeWildPositions: scene.getMainGameActiveWildPositions?.(gameState) || null
          });
        },
        onSkipAction: () => {
          if (typeof scene.skipHighlightPhase === "function") {
            scene.skipHighlightPhase();
            return;
          }
          scene.requestFastForward?.();
        }
      },
      {
        checkpoint: false,
        enabled: hasClusters,
        run: async () => {
          await scene.explodeSymbols(gameState.clusters);
        },
        onSkipAction: () => scene.requestFastForward?.()
      },
      {
        checkpoint: true,
        enabled: true,
        run: async () => {
          scene.updateCountUp(gameState.twa || 0);
        }
      }
    ];
  }

  return [];
}
