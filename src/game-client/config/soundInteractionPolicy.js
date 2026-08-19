// Sound behavior policy for flow interaction states.
// Read by GameScene.playSfx(...).
// Controls which one-shot SFX are allowed during fast-forward / skip-heavy moments.
// Music/theme lifecycle is handled separately in dedicated GameScene methods.
const soundInteractionPolicy = {
  wins_highlight: {
    allowDuringFastForward: false
  },
  wins_explode: {
    allowDuringFastForward: false
  },
  wins_payout: {
    allowDuringFastForward: false
  },
  lightning_hammer: {
    allowDuringFastForward: false
  },
  divine_charge_windup: {
    allowDuringFastForward: false
  },
  divine_charge_impact: {
    allowDuringFastForward: false
  },
  divine_strike_impact: {
    allowDuringFastForward: false
  },
  divine_x_impact: {
    allowDuringFastForward: false
  },
  land1: {
    allowDuringFastForward: false
  },
  land2: {
    allowDuringFastForward: false
  },
  land3: {
    allowDuringFastForward: false
  },
  land4: {
    allowDuringFastForward: false
  },
  land5: {
    allowDuringFastForward: false
  }
};

export default soundInteractionPolicy;
