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
  },
  giant_stomp: {
    allowDuringFastForward: false
  },
  construction_1: {
    allowDuringFastForward: false
  },
  construction_2: {
    allowDuringFastForward: false
  },
  construction_3: {
    allowDuringFastForward: false
  },
  animal_crush_splatter: {
    allowDuringFastForward: false
  },
  animal_crush_gore: {
    allowDuringFastForward: false
  },
  giant_laugh: {
    allowDuringFastForward: false
  },
  ouch_stomp1: {
    allowDuringFastForward: false
  },
  ouch_stomp2: {
    allowDuringFastForward: false
  },
  giant_pain_scream: {
    allowDuringFastForward: false
  },
  giant_pain_scream2: {
    allowDuringFastForward: false
  },
  ouch_celebration_cheer: {
    allowDuringFastForward: false
  },
  party_scratch: {
    allowDuringFastForward: false
  },
  ouch_damage_confirm: {
    allowDuringFastForward: false
  },
  golf_swing: {
    allowDuringFastForward: false
  },
  golf_miss: {
    allowDuringFastForward: false
  },
  unicorn_appear: {
    allowDuringFastForward: false
  },
  anger_meter: {
    allowDuringFastForward: false
  },
  bonus_confirm: {
    allowDuringFastForward: false
  }
};

export default soundInteractionPolicy;
