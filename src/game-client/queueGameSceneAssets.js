/**
 * Queue the compact Payways client asset set.
 * The optional deps argument remains for framework compatibility.
 */
export function queueGameSceneAssets(load, _deps = {}) {
  load.bitmapFont("uiBitmap", "assets/fonts/bitmap/gothic.png", "assets/fonts/bitmap/gothic.xml");
  for (let symbolId = 1; symbolId <= 8; symbolId += 1) {
    load.image(String(symbolId), `assets/helldive/symbols/${symbolId}.png`);
  }

  load.image("main_background", "assets/helldive/backgrounds/heaven_city.png");
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
