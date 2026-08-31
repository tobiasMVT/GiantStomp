import flowInteractionPolicy from "./config/flowInteractionPolicy.js";

const FULL_DROP_ACTIONS = new Set(["spin", "freespin"]);
const CASCADE_ACTIONS = new Set(["respin", "freerespin"]);

function isSignificantWin(winAmount, betSize) {
  const bet = Math.max(0, Number(betSize) || 0);
  const win = Math.max(0, Number(winAmount) || 0);
  return bet > 0 && win >= bet;
}

function resolveMainWinHoldMs(gameState, policy, winAmount = 0) {
  const significant = isSignificantWin(winAmount, gameState.betSize);
  const base = significant
    ? (policy.significantWinHoldAfterCountUpMs ?? 900)
    : (policy.mainWinHoldAfterCountUpMs ?? 0);
  const featureHolds = significant
    ? (policy.significantFeatureWinHoldAfterCountUpMs || {})
    : (policy.featureWinHoldAfterCountUpMs || {});
  if (gameState.golfswingEvent?.triggered) {
    return Math.max(base, featureHolds.golfswing ?? base);
  }
  if (gameState.stompEvent?.triggered) {
    return Math.max(base, featureHolds.stomp ?? base);
  }
  if (gameState.crushEvent?.triggered) {
    return Math.max(base, featureHolds.crush ?? base);
  }
  if (gameState.partyEvent?.triggered) {
    return Math.max(base, featureHolds.party ?? base);
  }
  return base;
}

function resolveGolfJackpotWinHoldMs(gameState, policy, winAmount = 0) {
  const significant = isSignificantWin(winAmount, gameState.betSize);
  if (significant) {
    return policy.significantGolfJackpotWinHoldAfterCountUpMs
      ?? policy.significantWinHoldAfterCountUpMs
      ?? 900;
  }
  return policy.golfJackpotWinHoldAfterCountUpMs
    ?? policy.mainWinHoldAfterCountUpMs
    ?? 0;
}

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
  const hasParty = !!gameState.partyEvent?.triggered;
  const hasGolfswing = !!gameState.golfswingEvent?.triggered;
  const golfJackpotWin = hasGolfswing
    ? Math.max(0, Number(gameState.golfswingEvent?.jackpotWin || 0))
    : 0;
  const mainTwa = Math.max(0, (gameState.twa || 0) - golfJackpotWin);
  const isBonusCashSpin = action === "freespin" && gameState.isBonus;
  const hasBonusLandings = isBonusCashSpin
    && Array.isArray(gameState.bonusLandings)
    && gameState.bonusLandings.length > 0;
  const isBonusDeadSpin = isBonusCashSpin && !hasBonusLandings;
  const dropReels = gameState.stompEvent?.reelsBeforeStomp
    || gameState.crushEvent?.reelsBeforeCrush
    || gameState.reels;
  const skipVisual = () => scene.requestFastForward?.();
  const syncBonusUi = () => scene.syncBonusUiFromState?.({
    bonusState: gameState.bonusState,
    trapMeter: gameState.trapMeter,
    damageWheel: gameState.damageWheel,
  });
  const skipBonusVisual = () => {
    skipVisual();
    syncBonusUi();
  };
  const mainWinHoldMs = resolveMainWinHoldMs(gameState, flowInteractionPolicy, mainTwa);
  const partyPostHoldMs = hasParty && !isBonusCashSpin
    ? (flowInteractionPolicy.partyPostHoldMs ?? 0)
    : 0;
  const effectiveMainWinHoldMs = partyPostHoldMs > 0
    ? Math.max(mainWinHoldMs, partyPostHoldMs)
    : mainWinHoldMs;
  const shouldHoldMainWin = !isBonusCashSpin
    && effectiveMainWinHoldMs > 0
    && (mainTwa > 0 || hasParty);
  const golfJackpotHoldMs = resolveGolfJackpotWinHoldMs(
    gameState,
    flowInteractionPolicy,
    gameState.twa || 0
  );
  const shouldHoldGolfJackpotWin = hasGolfswing
    && golfJackpotWin > 0
    && golfJackpotHoldMs > 0;

  return [
    {
      checkpoint: false,
      enabled: FULL_DROP_ACTIONS.has(action),
      run: async () => {
        if (isBonusCashSpin) {
          await scene.spinBonusReels?.(dropReels);
          return;
        }
        if (!hasParty) {
          scene.clearPartyPresentation?.({ immediate: true });
        }
        await scene.slideOutOldSymbols();
        if (hasParty) {
          scene.startPartyCelebration?.();
          const holdMs = Math.max(0, Number(gameState.partyEvent?.preDropMs) || 1400);
          await waitCancellable?.(holdMs);
          scene.animalEmotion = "celebrating";
        }
        await scene.dropSymbols(dropReels, {
          reelByReel: hasParty,
          reelGapMs: 240,
        });
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
      run: () => waitCancellable?.(flowInteractionPolicy.postDropSettleMs ?? 50),
      onSkipAction: () => cancelActiveDelay?.(),
    },
    {
      checkpoint: hasStomp,
      enabled: hasStomp,
      run: () => scene.presentStompFeature?.(gameState.stompEvent, { roundTwa: gameState.twa || 0 }),
      onSkipAction: skipVisual,
    },
    {
      checkpoint: hasCrush,
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
      enabled: isBonusCashSpin && hasBonusLandings,
      run: () => scene.presentBonusCashLandings?.(
        gameState.bonusLandings,
        gameState.trapMeter,
        gameState.bonusState,
        gameState.damageWheel
      ),
      onSkipAction: skipBonusVisual,
    },
    {
      checkpoint: isBonusDeadSpin,
      enabled: isBonusDeadSpin,
      run: () => scene.presentBonusDeadSpinHold?.(
        gameState.bonusState,
        gameState.trapMeter,
        gameState.damageWheel
      ),
      onSkipAction: skipVisual,
    },
    {
      checkpoint: isBonusCashSpin && hasBonusLandings,
      enabled: isBonusCashSpin && hasBonusLandings,
      run: () => syncBonusUi(),
    },
    {
      checkpoint: true,
      enabled: true,
      run: async () => scene.emitOutcomeRevealed?.(),
    },
    {
      checkpoint: true,
      enabled: !isBonusCashSpin,
      run: async () => {
        const countUpPromise = scene.updateCountUp(mainTwa, {
          fast: true,
          duration: scene.getMainCountUpDuration?.(mainTwa) ?? 100,
        });
        if (hasWins) {
          await Promise.all([
            scene.highlightWins(gameState),
            countUpPromise,
          ]);
          return;
        }
        await countUpPromise;
      },
      onSkipAction: () => scene.skipHighlightPhase?.(),
    },
    {
      checkpoint: false,
      enabled: shouldHoldMainWin,
      run: () => waitCancellable?.(effectiveMainWinHoldMs),
      onSkipAction: () => cancelActiveDelay?.(),
    },
    {
      checkpoint: hasGolfswing,
      enabled: hasGolfswing,
      run: () => scene.presentGolfswingFeature?.(gameState.golfswingEvent),
      onSkipAction: skipVisual,
    },
    {
      checkpoint: hasGolfswing && golfJackpotWin > 0,
      enabled: hasGolfswing && golfJackpotWin > 0,
      run: () => scene.updateCountUp(gameState.twa || 0, {
        fast: true,
        duration: scene.getMainCountUpDuration?.(gameState.twa || 0, mainTwa) ?? 140,
        skipStompCoinCollect: true,
      }),
    },
    {
      checkpoint: false,
      enabled: shouldHoldGolfJackpotWin,
      run: () => waitCancellable?.(golfJackpotHoldMs),
      onSkipAction: () => cancelActiveDelay?.(),
    },
  ];
}
