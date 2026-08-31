// Flow interaction policy knobs.
// Keep this separate from math config so behavior can be documented and tuned safely.
const flowInteractionPolicy = {
  // Whether user can skip in later reveal/resolve phases.
  skipAllowed: true,

  // Delay after round start before fast-forward input is accepted (ms).
  // Use 0 for immediate dev behavior.
  fastForwardArmingDelayMs: 0,

  // Cooldown after a successful fast-forward request (ms).
  // Use 0 if checkpoint clearing is enough for your current UX.
  fastForwardCooldownMs: 0,

  // Brief beat after small wins (below one bet) before round can end (ms).
  mainWinHoldAfterCountUpMs: 160,

  // Hold when win >= betSize so the payout can be read (ms).
  significantWinHoldAfterCountUpMs: 900,

  // Minimum beat after party resolves, even on zero or sub-bet wins (ms).
  partyPostHoldMs: 420,

  // Feature bumps on small wins (ms).
  featureWinHoldAfterCountUpMs: {
    stomp: 220,
    crush: 200,
    party: 200,
    golfswing: 260,
  },

  // Feature bumps when win >= betSize (ms).
  significantFeatureWinHoldAfterCountUpMs: {
    stomp: 1100,
    crush: 1000,
    party: 950,
    golfswing: 1200,
  },

  // Hold after golf jackpot is added to the win counter (ms).
  golfJackpotWinHoldAfterCountUpMs: 220,
  significantGolfJackpotWinHoldAfterCountUpMs: 1100,

  // Keep the previous win amount visible this long into the next spin before clearing (ms).
  winDisplayClearAtMidSpinMs: 480,

  // Short settle after reels land before feature / win presentation (ms).
  postDropSettleMs: 50,

  // Pause on bonus dead spins so the empty board reads before the next freespin (ms).
  bonusDeadSpinHoldMs: 550,

  // Action names that should STOP auto-continuation inside one spin round.
  // Pause once before the first freespin so the transition can settle.
  // If nextAction is not listed here, controller continues automatically.
  stopContinuedActions: ["freespin"]
};

export default flowInteractionPolicy;
