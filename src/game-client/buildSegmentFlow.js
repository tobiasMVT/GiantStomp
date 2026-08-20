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
  const hasStomp = !!gameState.stompEvent?.triggered;
  const hasCrush = !!gameState.crushEvent?.triggered;
  const isBonusCashSpin = action === "freespin" && gameState.isBonus;
  const hasBonusLandings = isBonusCashSpin
    && Array.isArray(gameState.bonusLandings)
    && gameState.bonusLandings.length > 0;
  const dropReels = gameState.stompEvent?.reelsBeforeStomp
    || gameState.crushEvent?.reelsBeforeCrush
    || gameState.reels;
  const skipVisual = () => scene.requestFastForward?.();

  return [
    {
      checkpoint: false,
      enabled: FULL_DROP_ACTIONS.has(action),
      run: async () => {
        if (isBonusCashSpin) {
          await scene.spinBonusReels?.(dropReels);
          return;
        }
        await scene.slideOutOldSymbols();
        await scene.dropSymbols(dropReels);
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
      enabled: hasStomp,
      run: () => scene.presentStompFeature?.(gameState.stompEvent),
      onSkipAction: skipVisual,
    },
    {
      checkpoint: false,
      enabled: hasCrush,
      run: () => scene.presentCrushFeature?.(gameState.crushEvent),
      onSkipAction: skipVisual,
    },
    {
      checkpoint: false,
      enabled: hasScatters,
      run: () => scene.presentScatterLandings(gameState.scatterLandings || []),
      onSkipAction: skipVisual,
    },
    {
      checkpoint: false,
      enabled: isBonusCashSpin,
      run: () => scene.presentBonusCashLandings?.(
        hasBonusLandings ? gameState.bonusLandings : [],
        gameState.trapMeter,
        gameState.bonusState,
        gameState.damageWheel
      ),
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
      enabled: !isBonusCashSpin,
      run: () => scene.updateCountUp(gameState.twa || 0),
    },
  ];
}
