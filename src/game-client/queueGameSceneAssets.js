/**
 * Queues all GameScene assets on a Phaser LoaderPlugin.
 * Used by LoadingScene after the splash background is visible.
 */
export function queueGameSceneAssets(load, deps = {}) {
  const {
    BACKGROUND_CLOUD_SHEET_TEXTURE_KEY,
    BONUS_END_COIN_ATLAS_KEY,
    BONUS_FREESPIN_POWER_CIRCLE_TEXTURE_KEY,
    BONUS_FREESPIN_RING_SHEET_TEXTURE_KEY,
    BONUS_MYSTERY_FEATURE_ATLAS_KEY,
    BONUS_MYSTERY_FEATURE_INTENSE_TEXTURE_KEY,
    BONUS_MYSTERY_FEATURE_SYMBOL_ID,
    BONUS_MYSTERY_FEATURE_USE_ATLAS_ANIMATION,
    BONUS_WON_CRACKLING_ATLAS_TEXT_KEY,
    BONUS_WON_CRACKLING_SHEET_TEXTURE_KEY,
    HERO_LIGHTNING_ATLAS_TEXT_KEY,
    HERO_LIGHTNING_SHEET_TEXTURE_KEY,
    HERO_STAGE_INTENSITY_TEXTURE_KEYS,
    HERO_STAGE_TEXTURE_KEYS,
    LIGHTNING_BEE_FEATURE_SYMBOL_ID,
    MERGE_GUN_FEATURE_INTENSE_TEXTURE_KEY,
    MERGE_GUN_FEATURE_SYMBOL_ID,
    SCENE_BEHIND_SKY_TEXTURE_KEY,
    SCENE_SKY_TEXTURE_KEY,
    WIN_HIGHLIGHT_INTENSITY_TEXTURE_KEYS
  } = deps;

  load.bitmapFont("uiBitmap", "assets/fonts/bitmap/gothic.png", "assets/fonts/bitmap/gothic.xml");
  load.image("1", "assets/helldive/symbols/1.png");
  load.image("2", "assets/helldive/symbols/2.png");
  load.image("3", "assets/helldive/symbols/3.png");
  load.image("4", "assets/helldive/symbols/4.png");
  load.image("5", "assets/helldive/symbols/5.png");
  load.image("6", "assets/helldive/symbols/6.png");
  load.image("7", "assets/helldive/symbols/7.png");
  for (let symbolId = 1; symbolId <= 7; symbolId++) {
    load.image(`${symbolId}_orb`, `assets/helldive/symbols/${symbolId}_orb.png`);
    const orbIntensityFileName = symbolId === 5
      ? "5_orbintensity.png"
      : `${symbolId}_orb_intensity.png`;
    load.image(`${symbolId}_orb_intensity`, `assets/helldive/symbols/${orbIntensityFileName}`);
  }
  Object.entries(WIN_HIGHLIGHT_INTENSITY_TEXTURE_KEYS).forEach(([symbolId, textureKey]) => {
    load.image(textureKey, `assets/helldive/symbols/${symbolId}_intensity.png`);
  });
  load.image("8", "assets/helldive/symbols/8.png");
  load.image("11", "assets/helldive/characters/demon_imp.png");
  load.image("12", "assets/helldive/characters/demon_brute.png");
  load.image("13", "assets/helldive/characters/demon_boss_3x3.png");
  load.image("21", "assets/helldive/characters/demon_gargyole.png");
  load.image(String(BONUS_MYSTERY_FEATURE_SYMBOL_ID), "assets/symbols/mystery.png");
  load.image(String(MERGE_GUN_FEATURE_SYMBOL_ID), "assets/symbols/gun.png");
  load.image(String(LIGHTNING_BEE_FEATURE_SYMBOL_ID), "assets/symbols/bumblebee.png");
  load.image(BONUS_MYSTERY_FEATURE_INTENSE_TEXTURE_KEY, "assets/symbols/mystery_intense.png");
  load.image(MERGE_GUN_FEATURE_INTENSE_TEXTURE_KEY, "assets/symbols/gun_intense.png");
  if (BONUS_MYSTERY_FEATURE_USE_ATLAS_ANIMATION) {
    load.atlas(
      BONUS_MYSTERY_FEATURE_ATLAS_KEY,
      "assets/symbols/mystery_feature/minor.png",
      "assets/symbols/mystery_feature/minor.json"
    );
  }
  load.atlas(
    BONUS_END_COIN_ATLAS_KEY,
    "assets/12bolts/coin.webp",
    "assets/12bolts/coin.json"
  );
  load.image(BONUS_WON_CRACKLING_SHEET_TEXTURE_KEY, "assets/12bolts/frameAndBackground.webp");
  load.text(BONUS_WON_CRACKLING_ATLAS_TEXT_KEY, "assets/12bolts/frameAndBackground.atlas");
  load.image(BACKGROUND_CLOUD_SHEET_TEXTURE_KEY, "assets/12bolts/frameAndBackground_3.webp");
  load.image(BONUS_FREESPIN_RING_SHEET_TEXTURE_KEY, "assets/12bolts/frameAndBackground_4.webp");
  load.image(BONUS_FREESPIN_POWER_CIRCLE_TEXTURE_KEY, "assets/powercircle.png");
  load.image("blue_ballon", "assets/symbols/mystery_feature/ballons/blue_ballon.png");
  load.image("green_ballon", "assets/symbols/mystery_feature/ballons/green_ballon.png");
  load.image("yellow_ballon", "assets/symbols/mystery_feature/ballons/yellow_ballon.png");
  load.image("purple_ballon", "assets/symbols/mystery_feature/ballons/purple_ballon.png");
  load.image("orange_ballon", "assets/symbols/mystery_feature/ballons/orange_ballon.png");
  load.image("red_ballon", "assets/symbols/mystery_feature/ballons/red_ballon.png");
  load.image("banana_empty", "assets/symbols/empty_banana.png");
  load.image("banana_filled", "assets/symbols/filled_banana.png");
  load.image("banana_transparent", "assets/symbols/banana_transparent.png");
  load.image("16", "assets/symbols/barrel_tnt_heavy.png");
  load.image("17", "assets/time.png");

  load.image("mist", "assets/mist2.png");
  load.image(SCENE_BEHIND_SKY_TEXTURE_KEY, "assets/behind_sky.png");
  load.image(SCENE_SKY_TEXTURE_KEY, "assets/sky.png");
  load.image("main_background", "assets/helldive/backgrounds/heaven_city.png");
  load.image("helldive_heaven_bg", "assets/helldive/backgrounds/heaven_city.png");
  load.image("helldive_hell_bonus_bg", "assets/helldive/backgrounds/hell_bonus_floor.png");
  load.image("helldive_main_portal_bg", "assets/helldive/backgrounds/portal.gif");
  for (let frameIndex = 1; frameIndex <= 23; frameIndex += 1) {
    load.image(
      `helldive_red_portal_${String(frameIndex).padStart(2, "0")}`,
      `assets/helldive/backgrounds/redportal/Lager ${frameIndex}.png`
    );
  }
  load.image("helldive_hell_wave_tile", "assets/helldive/effects/hell_wave_tile.png");
  load.image("helldive_divine_wave_tile", "assets/helldive/effects/divine_wave_tile.png");
  load.image("helldive_divine_ground", "assets/helldive/effects/divine_ground.png");
  load.image("helldive_divine_wrath_beam", "assets/helldive/effects/divine_wrath_beam.png");
  load.image("helldive_demon_death_spatter", "assets/helldive/effects/demon_death_spatter.png");
  load.image("helldive_divine_strike_slash", "assets/helldive/effects/divine_strike_slash.png");
  load.image("helldive_attack_gif_preload", "assets/helldive/effects/attack.gif");
  load.image("helldive_attack2_gif_preload", "assets/helldive/effects/attack2.gif");
  load.image("helldive_loot_land_glow", "assets/helldive/effects/loot_land_glow.png");
  load.image("helldive_portal_red", "assets/helldive/effects/portal_red.png");
  load.image("helldive_angel_trail", "assets/helldive/effects/angel_trail.png");
  load.image("helldive_demon_splash", "assets/helldive/effects/demon_splash.png");
  load.image("helldive_loot_coin", "assets/helldive/loot/coin.png");
  load.image("helldive_loot_ruby", "assets/helldive/loot/ruby.png");
  load.image("helldive_loot_sapphire", "assets/helldive/loot/sapphire.png");
  load.image("helldive_loot_emerald", "assets/helldive/loot/emerald.png");
  load.image("helldive_loot_diamond", "assets/helldive/loot/diamond.png");
  load.image("helldive_loot_amethyst", "assets/helldive/loot/amethyst.png");
  load.image("helldive_ui_chest", "assets/helldive/ui/chest.png");
  load.image("bonus_silhouette", "assets/bonus.png");
  load.image("bonus_chest", "assets/chest.png");
  load.image("helldive_chest_wooden", "assets/chest_wooden.png");
  load.image("helldive_chest_divine", "assets/chest_divine.png");

  load.audio("banana_hit_1", "assets/sounds/banana_attacked1.mp3");
  load.audio("banana_hit_2", "assets/sounds/banana_attacked2.mp3");
  load.audio("banana_hit_3", "assets/sounds/banana_attacked3.mp3");
  load.audio("banana_hit_4", "assets/sounds/banana_attacked4.mp3");
  load.audio("attack_swing", "assets/sounds/attack_swing_any.mp3");
  load.audio("attack_swing_axe", "assets/sounds/attack_swing_axe.mp3");
  load.audio("finisher_axe", "assets/sounds/finisher_axe.mp3");
  load.audio("finisher_sword", "assets/sounds/finisher_sword.mp3");
  load.audio("finisher_staff", "assets/sounds/finisher_staff.mp3");
  load.audio("lightning_thor", "assets/sounds/lightning_thor.mp3");
  load.audio("lightning_thor_impact", "assets/sounds/lightning_thor_impact.mp3");
  load.audio("lightning_hammer", "assets/sounds/lightning_hammer.mp3");
  load.audio("lightning_amb1", "assets/sounds/lightning_amb1.mp3");
  load.audio("lightning_amb2", "assets/sounds/lightning_amb2.mp3");
  load.audio("lightning_amb3", "assets/sounds/lightning_amb3.mp3");
  load.audio("mystery_reveal", "assets/sounds/mystery_reveal.mp3");
  load.audio("mystery_reveal_succession", "assets/sounds/mystery_reveal_succession.opus");
  load.audio("wins_highlight", "assets/sounds/wins_highlight.opus");
  load.audio("wins_explode", "assets/sounds/wins_explode.opus");
  load.audio("wins_payout", "assets/sounds/wins_payout.opus");
  load.audio("bonus_won_stinger", "assets/sounds/Thunderkong/bonuswon.mp3");
  load.audio("lightning_at_lvl_up", "assets/sounds/Thunderkong/lightning_at_lvl_up.mp3");
  load.audio("ballon_won_celebration", "assets/sounds/Thunderkong/ballon_won_celebration.mp3");
  load.audio("symbol_clear_addition", "assets/sounds/Thunderkong/symbol_clear_addition.mp3");
  load.audio("bananacollect", "assets/sounds/Thunderkong/bananacollect.mp3");
  load.audio("freespin_smash_activated", "assets/sounds/akhet/toa_scarabwildactivated.opus");
  load.audio("freespin_smash_prepulse", "assets/sounds/akhet/toa_scarabwildprepulse.opus");
  load.audio("freespin_smash_second", "assets/sounds/akhet/toa_scarabwildsecond.opus");
  load.audio("freespin_smash_symbol_explosion_1", "assets/sounds/akhet/toa_scarabwildsymbolexplosion1.opus");
  load.audio("freespin_smash_symbol_explosion_2", "assets/sounds/akhet/toa_scarabwildsymbolexplosion2.opus");
  load.audio("freespin_smash_symbol_explosion_3", "assets/sounds/akhet/toa_scarabwildsymbolexplosion3.opus");
  load.audio("freespin_orb_start", "assets/sounds/battlepath/orb_start.mp3");
  load.audio("freespin_orb_appear", "assets/sounds/battlepath/orb_appear.opus");
  for (let index = 1; index <= 5; index++) {
    load.audio(`freespin_essence_${index}`, `assets/sounds/battlepath/essence${index}.opus`);
  }
  load.audio("coin1", "assets/sounds/coins/coin1.mp3");
  load.audio("coin2", "assets/sounds/coins/coin2.mp3");
  load.audio("coin3", "assets/sounds/coins/coin3.mp3");
  load.audio("coin4", "assets/sounds/coins/coin4.mp3");
  load.audio("coin5", "assets/sounds/coins/coin5.mp3");
  load.audio("coin6", "assets/sounds/coins/coin6.mp3");
  load.audio("divine_charge_impact", "assets/sounds/helldive/chargingStrikeImpact.mp3");
  load.audio("divine_charge_windup", "assets/sounds/helldive/divineChargingUp.mp3");
  load.audio("divine_strike_impact", "assets/sounds/helldive/divineStrikeImpact.mp3");
  load.audio("divine_x_impact", "assets/sounds/helldive/divineXimpact.mp3");
  load.audio("gold_drop", "assets/sounds/gold_drop.mp3");
  load.audio("symbolWave", "assets/sounds/helldive/symbolWave.mp3");
  load.audio("swing_1", "assets/sounds/helldive/swing1.mp3");
  load.audio("swing_2", "assets/sounds/helldive/swing2.mp3");
  load.audio("action_spin_click", "assets/sounds/action_spin_click.opus");
  load.audio("orb_collect", "assets/sounds/orb_collect.opus");
  load.audio("banana_spawn", "assets/sounds/banana_spawn.mp3");
  load.audio("banana_spawn_time", "assets/sounds/banana_spawn_time.mp3");
  load.audio("troll_before_entrance", "assets/sounds/troll_before_entrance.mp3");
  load.audio("troll_dies", "assets/sounds/troll_dies.mp3");
  load.audio("troll_trees_crack", "assets/sounds/troll_trees_crack.mp3");
  load.audio("troll_rushing_growl", "assets/sounds/troll_rushing_growl.mp3");
  load.audio("land1", "assets/sounds/land1.opus");
  load.audio("land2", "assets/sounds/land2.opus");
  load.audio("land3", "assets/sounds/land3.opus");
  load.audio("land4", "assets/sounds/land4.opus");
  load.audio("land5", "assets/sounds/land5.opus");
  load.audio("theme_main", "assets/sounds/helldive/maingame.mp3");
  load.audio("theme_bonus", "assets/sounds/helldive/bonusgame.mp3");
  load.audio("merge_gun_laser_loop", "assets/sounds/Thunderkong/laser-loop.mp3");
  load.audio("wheel_diamond_appear", "assets/sounds/wheel_diamond_appear.opus");
  load.audio("wheel_diamond_confirms", "assets/sounds/wheel_diamond_confirms.opus");
  load.image("multipliers", "assets/multipliers.png");
  load.image("multipliers_stones", "assets/multipliers_stones.png");
  load.image("multipliers_chests", "assets/multipliers_chests.png");
  load.image(HERO_STAGE_TEXTURE_KEYS.base, "assets/helldive/characters/female_angel.png");
  load.image(HERO_STAGE_TEXTURE_KEYS.rush, "assets/helldive/characters/female_angel_rush.png");
  load.image(HERO_STAGE_TEXTURE_KEYS.giant2, "assets/helldive/characters/female_angel_giant2.png");
  load.image(HERO_STAGE_TEXTURE_KEYS.giant3, "assets/helldive/characters/female_angel_giant3.png");
  load.image(HERO_STAGE_INTENSITY_TEXTURE_KEYS[HERO_STAGE_TEXTURE_KEYS.base], "assets/helldive/characters/female_angel_intensity.png");
  load.image(HERO_STAGE_INTENSITY_TEXTURE_KEYS[HERO_STAGE_TEXTURE_KEYS.rush], "assets/helldive/characters/female_angel_rush_intensity.png");
  load.image(HERO_STAGE_INTENSITY_TEXTURE_KEYS[HERO_STAGE_TEXTURE_KEYS.giant2], "assets/helldive/characters/female_angel_giant2_intensity.png");
  load.image(HERO_STAGE_INTENSITY_TEXTURE_KEYS[HERO_STAGE_TEXTURE_KEYS.giant3], "assets/helldive/characters/female_angel_giant3_intensity.png");
  load.image("hero", "assets/hero.png");
  load.image(HERO_LIGHTNING_SHEET_TEXTURE_KEY, "assets/atlas/lightning.webp");
  load.text(HERO_LIGHTNING_ATLAS_TEXT_KEY, "assets/atlas/lightning.atlas");
}
