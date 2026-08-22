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

  // Hold after main-game win countup finishes before round can end (ms).
  mainWinHoldAfterCountUpMs: 500,

  // Action names that should STOP auto-continuation inside one spin round.
  // Pause once before the first freespin so the transition can settle.
  // If nextAction is not listed here, controller continues automatically.
  stopContinuedActions: ["freespin"]
};

export default flowInteractionPolicy;
