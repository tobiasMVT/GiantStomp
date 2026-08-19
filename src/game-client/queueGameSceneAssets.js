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
  load.image("bonus_background", "assets/helldive/backgrounds/hell_bonus_floor.png");

  load.audio("action_spin_click", "assets/sounds/action_spin_click.opus");
  load.audio("wins_highlight", "assets/sounds/wins_highlight.opus");
  load.audio("wins_explode", "assets/sounds/wins_explode.opus");
  load.audio("wins_payout", "assets/sounds/wins_payout.opus");
  for (let reel = 1; reel <= 5; reel += 1) {
    load.audio(`land${reel}`, `assets/sounds/land${reel}.opus`);
  }
  load.audio("theme_main", "assets/sounds/helldive/maingame.mp3");
  load.audio("theme_bonus", "assets/sounds/helldive/bonusgame.mp3");
}
