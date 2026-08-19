const FULL_DROP_ACTIONS = new Set(["spin", "freespin"]);
const CASCADE_ACTIONS = new Set(["respin", "freerespin"]);

export function buildSegmentFlow({
  gameState,
  scene,
  waitCancellable,
  cancelActiveDelay,
}) {
  const action = gameState.executedAction;
  if (!FULL_DROP_ACTIONS.has(action) && !CASCADE_ACTIONS.has(action)) return [];
  const wins = scene.getWinPositions(gameState);
  const hasWins = wins.length > 0;
  const hasScatters = Array.isArray(gameState.scatterLandings) && gameState.scatterLandings.length > 0;
  const skipVisual = () => scene.requestFastForward?.();

  return [
    {
      checkpoint: false,
      enabled: FULL_DROP_ACTIONS.has(action),
      run: async () => {
        await scene.slideOutOldSymbols();
        await scene.dropSymbols(gameState.reels);
      },
      onSkipAction: skipVisual,
    },
    {
      checkpoint: false,
      enabled: CASCADE_ACTIONS.has(action),
      run: () => scene.applyGravityAnimation(
        gameState.reelsAfterDrop || gameState.reels,
        gameState.dropEvent || { movements: [], direction: "down" }
      ),
      onSkipAction: skipVisual,
    },
    {
      checkpoint: false,
      enabled: true,
      run: () => waitCancellable?.(120),
      onSkipAction: () => cancelActiveDelay?.(),
    },
    {
      checkpoint: false,
      enabled: hasScatters || !!gameState.angerMeter,
      run: () => scene.presentScatterLandings(gameState.scatterLandings || [], gameState.angerMeter),
      onSkipAction: skipVisual,
    },
    {
      checkpoint: true,
      enabled: true,
      run: async () => scene.emitOutcomeRevealed?.(),
    },
    {
      checkpoint: false,
      enabled: hasWins,
      run: () => scene.highlightWins(gameState),
      onSkipAction: () => scene.skipHighlightPhase?.(),
    },
    {
      checkpoint: false,
      enabled: hasWins,
      run: () => scene.explodeWins(gameState),
      onSkipAction: skipVisual,
    },
    {
      checkpoint: true,
      enabled: true,
      run: () => scene.updateCountUp(gameState.twa || 0),
    },
  ];
}
