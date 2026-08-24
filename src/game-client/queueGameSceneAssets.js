/**
 * Queue the compact Payways client asset set.
 * The optional deps argument remains for framework compatibility.
 */
export function queueGameSceneAssets(load, _deps = {}) {
  load.bitmapFont("uiBitmap", "assets/fonts/bitmap/gothic.png", "assets/fonts/bitmap/gothic.xml");
  const giantStompSymbols = {
    1: "assets/giantstomp/1_kanin.png",
    2: "assets/giantstomp/2_ekorre.png",
    3: "assets/giantstomp/3_bird.png",
    4: "assets/giantstomp/4_igelkott.png",
    5: "assets/giantstomp/5_mullvad.png",
    6: "assets/giantstomp/6_A.png",
    7: "assets/giantstomp/7_K.png",
    8: "assets/giantstomp/8_Q.png",
    9: "assets/giantstomp/9_J.png",
    10: "assets/giantstomp/10_10.png",
    13: "assets/helldive/symbols/8.png",
  };
  for (const symbolId of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 13]) {
    const path = giantStompSymbols[symbolId] || `assets/helldive/symbols/${symbolId}.png`;
    load.image(String(symbolId), path);
  }
  const animalDollSymbols = {
    1: "1_kanin_doll.png",
    2: "2_ekorre_doll.png",
    3: "3_bird_doll.png",
    4: "4_igelkott_doll.png",
    5: "5_mullvad_doll.png",
  };
  Object.entries(animalDollSymbols).forEach(([symbolId, filename]) => {
    load.image(`${symbolId}_doll`, `assets/giantstomp/bonus symbol/${filename}`);
  });
  const bonusSymbols = {
    111: "111_wood.png",
    222: "222_rope.png",
    333: "333_metal.png",
    444: "444_spikes.png",
    555: "555_gear.png",
    666: "666_trap_tier1.png",
    777: "777_trap_tier2.png",
    888: "888_trap_tier3.png",
    999: "999_trap_tier4.png",
    1000: "1000_damage.png",
  };
  Object.entries(bonusSymbols).forEach(([symbolId, filename]) => {
    load.image(String(symbolId), `assets/giantstomp/bonus symbol/${filename}`);
  });
  for (let lives = 1; lives <= 3; lives += 1) {
    load.image(`bonus_life_${lives}`, `assets/giantstomp/bonus symbol/life${lives}.png`);
  }
  load.image("bonus_intro", "assets/giantstomp/bonus symbol/bonus_intro.png");

  load.image("giantfoot", "assets/giantstomp/giantfoot.png");
  load.image("open_hand", "assets/giantstomp/open_hand.png");
  load.image("snapped_hand", "assets/giantstomp/snapped_hand.png");
  load.multiatlas(
    "yellow_coin",
    "assets/giantstomp/yellow_coin/yellow_coin.json",
    "assets/giantstomp/yellow_coin/"
  );

  load.image("main_background", "assets/giantstomp/stompy_background.png");
  load.image("crush_giant_bg", "assets/giantstomp/giant_in_bg.png");
  load.image("reel_frame", "assets/giantstomp/reel_frame.png");
  load.image("bonus_background", "assets/giantstomp/background_bonus.png");
  load.image("bonus_torch_height", "assets/giantstomp/bonus_torch_effect/background_bonus_height.png");
  load.image("bonus_torch_normal", "assets/giantstomp/bonus_torch_effect/background_bonus_normal_opengl.png");
  load.image("ouch_background", "assets/giantstomp/ouch_background.png");
  load.image("total_win_background", "assets/giantstomp/stompy_background_totalwin.png");
  load.glsl("bonus_hole_light", "assets/shaders/bonus_hole_light.glsl");

  load.audio("action_spin_click", "assets/sounds/action_spin_click.opus");
  load.audio("wins_highlight", "assets/sounds/wins_highlight.opus");
  load.audio("wins_explode", "assets/sounds/wins_explode.opus");
  load.audio("wins_payout", "assets/sounds/wins_payout.opus");
  for (let reel = 1; reel <= 5; reel += 1) {
    load.audio(`land${reel}`, `assets/sounds/land${reel}.opus`);
  }
  load.audio("theme_main", "assets/giantstomp/sounds/main-game-background-music.mp3");
  load.audio("theme_bonus", "assets/giantstomp/sounds/bonus-background-music.mp3");
  load.audio("giant_stomp", "assets/giantstomp/sounds/giant-stomping-sfx.mp3");
  load.audio("construction_1", "assets/giantstomp/sounds/game-construction-sound-1.mp3");
  load.audio("construction_2", "assets/giantstomp/sounds/game-construction-sound-2.mp3");
  load.audio("construction_3", "assets/giantstomp/sounds/game-construction-sound-3.mp3");
  load.audio(
    "animal_crush_splatter",
    "assets/giantstomp/sounds/splatter-body-falling-apart-messy-splatter-blood-gore-aegersum.mp3"
  );
  load.audio(
    "animal_crush_gore",
    "assets/giantstomp/sounds/very-loud-eviscerating-bleeding-eviscerating-guts-blood-gore-deleted-user.mp3"
  );
  load.audio("giant_laugh", "assets/giantstomp/sounds/laugh.mp3");
  load.audio("ouch_stomp1", "assets/giantstomp/sounds/ouch_stomp1.mp3");
  load.audio("ouch_stomp2", "assets/giantstomp/sounds/ouch_stomp2.mp3");
  load.audio("ouch_background-music", "assets/giantstomp/sounds/ouch_background-music.mp3");
  load.audio("giant_pain_scream", "assets/giantstomp/sounds/giant_pain_scream.mp3");
  load.audio("giant_pain_scream2", "assets/giantstomp/sounds/giant_pain_scream2.mp3");
  load.audio(
    "ouch_celebration_cheer",
    "assets/giantstomp/sounds/happy-animals-crowds-groups-sound-like-trumpeting-cheering-and-celebrating.mp3"
  );
}
