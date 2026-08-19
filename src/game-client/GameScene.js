import Phaser from 'phaser';
import clientConfig from "./config/client_config.json";
import gameClientConfig from "./config/gameClientConfig";
import soundInteractionPolicy from "./config/soundInteractionPolicy";
import soundVolumeConfig from "./config/soundVolumeConfig.json";
import { createGameSceneAudioTimingMethods } from "./game-scene/gameSceneAudioTimingMethods";
import { createGameSceneHeavenHellMethods } from "./game-scene/gameSceneHeavenHellMethods";
import { createGameSceneBonusMysteryMethods } from "./game-scene/gameSceneBonusMysteryMethods";
import { createGameSceneLightningBeeMethods } from "./game-scene/gameSceneLightningBeeMethods";
import { createGameSceneMergeGunMethods } from "./game-scene/gameSceneMergeGunMethods";
import { createGameSceneFreespinUiMethods } from "./game-scene/gameSceneFreespinUiMethods";
import { createGameSceneLayoutMethods } from "./game-scene/gameSceneLayoutMethods";
import { createGameSceneEnvironmentMethods } from "./game-scene/gameSceneEnvironmentMethods";
import { createGameSceneBonusCollectionMethods } from "./game-scene/gameSceneBonusCollectionMethods";
import { createGameSceneHeroEffectsMethods } from "./game-scene/gameSceneHeroEffectsMethods";
import { createGameSceneHeroCombatMethods } from "./game-scene/gameSceneHeroCombatMethods";
import { createGameSceneBonusPresentationMethods } from "./game-scene/gameSceneBonusPresentationMethods";
import { createGameSceneBoardFlowMethods } from "./game-scene/gameSceneBoardFlowMethods";
import { createGameSceneSymbolMaskMethods } from "./game-scene/gameSceneSymbolMaskMethods";
import { createGameSceneForcedOutcomeMethods } from "./game-scene/gameSceneForcedOutcomeMethods";
import {
  createGameSceneMainPortalMethods,
  MAIN_GAME_PORTAL_CANVAS_KEY as MAIN_GAME_PORTAL_CANVAS_TEXTURE_KEY,
  MAIN_GAME_PORTAL_MASK_KEY as MAIN_GAME_PORTAL_MASK_TEXTURE_KEY,
  RED_PORTAL_FRAME_COUNT,
  getRedPortalFrameKey,
  getRedPortalFramePath,
} from "./game-scene/gameSceneMainPortalMethods";

// PAUSE 
const EPS = 0.001;   // ~1000× slower
const ONE = 1;

// Grid offset (padding from canvas edge)
const GRID_OFFSET_X = 20;
const GRID_OFFSET_Y = 75;

// Balanced symbol size without custom tile backplates.
const bananaScale = 0.792;  // Same as normal symbols
const normalScale = 0.792;
const trollScale = 0.68; // HellDive 3x3 boss demon should cover roughly a 3x3 area
const resolveSymbolId = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const BANANA_SYMBOL_IDS = Array.from(new Set([
  resolveSymbolId(clientConfig.symbolsMapping?.banana, 11),
  resolveSymbolId(clientConfig.symbolsMapping?.banana2, 12),
  resolveSymbolId(clientConfig.symbolsMapping?.banana3, 13),
  resolveSymbolId(clientConfig.symbolsMapping?.gargoyleDemon, 21)
]));
const BONUS_MYSTERY_FEATURE_SYMBOL_ID = resolveSymbolId(clientConfig.symbolsMapping?.bonusMysteryFeature, 18);
const MERGE_GUN_FEATURE_SYMBOL_ID = resolveSymbolId(clientConfig.symbolsMapping?.mergeGunFeature, 19);
const LIGHTNING_BEE_FEATURE_SYMBOL_ID = resolveSymbolId(clientConfig.symbolsMapping?.lightningBeeFeature, 20);
const BONUS_MYSTERY_FEATURE_INTENSE_TEXTURE_KEY = "bonus_mystery_feature_intense";
const MERGE_GUN_FEATURE_INTENSE_TEXTURE_KEY = "merge_gun_feature_intense";
const FEATURE_SYMBOL_CROSSFADE_MIN_ALPHA = 0.08;
const FEATURE_SYMBOL_CROSSFADE_MAX_ALPHA = 0.78;
const FEATURE_SYMBOL_CROSSFADE_DURATION_MS = 3200;
const HERO_LIGHTNING_SHEET_TEXTURE_KEY = "hero_lightning_sheet";
const HERO_LIGHTNING_ATLAS_TEXT_KEY = "hero_lightning_atlas";
const HERO_LIGHTNING_AURA_FRAME_KEYS = [
  "hero_lightning_aura_0",
  "hero_lightning_aura_1",
  "hero_lightning_aura_2",
  "hero_lightning_aura_3"
];
const HERO_LIGHTNING_AURA_FALLBACK_FRAMES = [
  { x: 3516, y: 510, width: 200, height: 500 },
  { x: 3718, y: 510, width: 200, height: 500 },
  { x: 3516, y: 8, width: 200, height: 500 },
  { x: 3718, y: 8, width: 200, height: 500 }
];
const BONUS_MYSTERY_FEATURE_SCALE_MULTIPLIER = 0.83;
const LIGHTNING_BEE_FEATURE_SCALE_MULTIPLIER = 0.76;
const LIGHTNING_BEE_METER_ICON_SCALE = 0.4;
const LIGHTNING_BEE_METER_ICON_OUTLINE_SCALE = LIGHTNING_BEE_METER_ICON_SCALE * 1.14;
const LIGHTNING_BEE_MULTIPLIER_LADDER_FALLBACK = [
  1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233,
  377, 610, 987, 1597, 2584, 4181, 6765, 10946,
  17711, 28657, 46368
];
const BONUS_MYSTERY_FEATURE_USE_ATLAS_ANIMATION = false;
const BONUS_MYSTERY_FEATURE_ATLAS_KEY = "bonus_mystery_feature_minor";
const BONUS_MYSTERY_FEATURE_ANIM_KEY = "bonus_mystery_feature_spin";
const BONUS_MYSTERY_METER_ICON_SCALE = 0.46;
const BONUS_MYSTERY_METER_ICON_OUTLINE_SCALE = BONUS_MYSTERY_METER_ICON_SCALE * 1.1;
const BONUS_MYSTERY_FEATURE_FRAME_COUNT = 29;
const BONUS_MYSTERY_FEATURE_ANIM_FPS = 24;
const BONUS_MYSTERY_FEATURE_SPIN_DURATION_MS =
  (BONUS_MYSTERY_FEATURE_FRAME_COUNT / BONUS_MYSTERY_FEATURE_ANIM_FPS) * 1000;
const BONUS_END_COIN_ATLAS_KEY = "bonus_end_coin";
const BONUS_END_COIN_SPIN_ANIM_KEY = "bonus_end_coin_spin";
const BONUS_END_COIN_FRAME_COUNT = 30;
const BONUS_END_COIN_ANIM_FPS = 45;
const BONUS_WON_CRACKLING_SHEET_TEXTURE_KEY = "bonus_won_crackling_sheet";
const BONUS_WON_CRACKLING_ATLAS_TEXT_KEY = "bonus_won_crackling_atlas";
const BONUS_WON_CRACKLING_ANIM_KEY = "bonus_won_crackling_spin";
const SYMBOL_POP_PARTICLE_FRAME_KEY_PREFIX = "symbol_pop_particle_";
const SYMBOL_POP_PARTICLE_ANIM_KEY = "symbol_pop_particle_burst";
const MERGE_GUN_FLARE_AURA_FRAME_KEY = "merge_gun_flare_aura";
const MERGE_GUN_FLARE_AURA_SOURCE_FRAME = "add/strikeParticles06";
const MERGE_GUN_FLARE_AURA_FALLBACK_FRAME = "add/pulseSoft";
const HERO_AURA_CRACKLE_FRAME_KEY_PREFIX = "hero_aura_crackle_";
const SCENE_SKY_TEXTURE_KEY = "scene_split_sky";
const SCENE_BEHIND_SKY_TEXTURE_KEY = "scene_behind_sky";
const BACKGROUND_CLOUD_SHEET_TEXTURE_KEY = "background_cloud_sheet";
const BACKGROUND_CLOUD_ATLAS_PAGE = "frameAndBackground_3.webp";
const BONUS_FREESPIN_RING_SHEET_TEXTURE_KEY = "bonus_freespin_ring_sheet";
const BONUS_FREESPIN_RING_ATLAS_PAGE = "frameAndBackground_4.webp";
const BONUS_FREESPIN_RING_ORB_ANIM_KEY = "bonus_freespin_ring_orb_spin";
const BONUS_FREESPIN_RING_VISUALS_ENABLED = false;
const BONUS_FREESPIN_POWER_CIRCLE_TEXTURE_KEY = "bonus_freespin_power_circle";
const BONUS_END_BALLOON_TEXTURE_FALLBACK = "yellow_ballon";
const TROLL_SYMBOL_ID = resolveSymbolId(clientConfig.symbolsMapping?.banana3, 13);
const BONUS_IMMEDIATE_LOW_SYMBOL_IDS = new Set([7, 6, 5, 4]);
const MONKEY_PICTURE_LEVEL_UP_THRESHOLDS = [5, 20, 25, 30];
const MAIN_THEME_VOLUME = 0.735;
const BONUS_THEME_VOLUME = 0.300;
const BONUS_THEME_SEEK_SECONDS = 5;
const BONUS_THEME_FADE_IN_MS = 2000;
const BONUS_WON_CELEBRATION_HOLD_MS = 1600;
const MERGE_GUN_LASER_LOOP_VOLUME = 0.25;
const SOUND_VOLUME_STORAGE_KEY = "thunderkong.soundVolumeConfig.v1";
const SOUND_VOLUME_FILE_NAME = "soundVolumeConfig.json";
const SOUND_VOLUME_MIN = 0;
const SOUND_VOLUME_MAX = 4;
const SOUND_VOLUME_STEP = 0.05;
const SOUND_VOLUME_DEFAULT = 1;
const SOUND_VOLUME_TOOL_SOUNDS = [
  { key: "action_spin_click", path: "assets/sounds/action_spin_click.opus", group: "Action" },
  { key: "attack_swing", path: "assets/sounds/attack_swing_any.mp3", group: "Combat" },
  { key: "attack_swing_axe", path: "assets/sounds/attack_swing_axe.mp3", group: "Combat" },
  { key: "banana_hit_1", path: "assets/sounds/banana_attacked1.mp3", group: "Combat" },
  { key: "banana_hit_2", path: "assets/sounds/banana_attacked2.mp3", group: "Combat" },
  { key: "banana_hit_3", path: "assets/sounds/banana_attacked3.mp3", group: "Combat" },
  { key: "banana_hit_4", path: "assets/sounds/banana_attacked4.mp3", group: "Combat" },
  { key: "banana_spawn", path: "assets/sounds/banana_spawn.mp3", group: "Spawn" },
  { key: "banana_spawn_time", path: "assets/sounds/banana_spawn_time.mp3", group: "Spawn" },
  { key: "bananacollect", path: "assets/sounds/Thunderkong/bananacollect.mp3", group: "Feature" },
  { key: "ballon_won_celebration", path: "assets/sounds/Thunderkong/ballon_won_celebration.mp3", group: "Feature" },
  { key: "bonus_won_stinger", path: "assets/sounds/Thunderkong/bonuswon.mp3", group: "Win" },
  { key: "coin1", path: "assets/sounds/coins/coin1.mp3", group: "Coins" },
  { key: "coin2", path: "assets/sounds/coins/coin2.mp3", group: "Coins" },
  { key: "coin3", path: "assets/sounds/coins/coin3.mp3", group: "Coins" },
  { key: "coin4", path: "assets/sounds/coins/coin4.mp3", group: "Coins" },
  { key: "coin5", path: "assets/sounds/coins/coin5.mp3", group: "Coins" },
  { key: "coin6", path: "assets/sounds/coins/coin6.mp3", group: "Coins" },
  { key: "divine_charge_impact", path: "assets/sounds/helldive/chargingStrikeImpact.mp3", group: "Combat" },
  { key: "divine_charge_windup", path: "assets/sounds/helldive/divineChargingUp.mp3", group: "Combat" },
  { key: "divine_strike_impact", path: "assets/sounds/helldive/divineStrikeImpact.mp3", group: "Combat" },
  { key: "divine_x_impact", path: "assets/sounds/helldive/divineXimpact.mp3", group: "Combat" },
  { key: "finisher_axe", path: "assets/sounds/finisher_axe.mp3", group: "Combat" },
  { key: "finisher_staff", path: "assets/sounds/finisher_staff.mp3", group: "Combat" },
  { key: "finisher_sword", path: "assets/sounds/finisher_sword.mp3", group: "Combat" },
  { key: "freespin_essence_1", path: "assets/sounds/battlepath/essence1.opus", group: "Freespin" },
  { key: "freespin_essence_2", path: "assets/sounds/battlepath/essence2.opus", group: "Freespin" },
  { key: "freespin_essence_3", path: "assets/sounds/battlepath/essence3.opus", group: "Freespin" },
  { key: "freespin_essence_4", path: "assets/sounds/battlepath/essence4.opus", group: "Freespin" },
  { key: "freespin_essence_5", path: "assets/sounds/battlepath/essence5.opus", group: "Freespin" },
  { key: "freespin_orb_appear", path: "assets/sounds/battlepath/orb_appear.opus", group: "Freespin" },
  { key: "freespin_orb_start", path: "assets/sounds/battlepath/orb_start.mp3", group: "Freespin" },
  { key: "freespin_smash_activated", path: "assets/sounds/akhet/toa_scarabwildactivated.opus", group: "Freespin" },
  { key: "freespin_smash_prepulse", path: "assets/sounds/akhet/toa_scarabwildprepulse.opus", group: "Freespin" },
  { key: "freespin_smash_second", path: "assets/sounds/akhet/toa_scarabwildsecond.opus", group: "Freespin" },
  { key: "freespin_smash_symbol_explosion_1", path: "assets/sounds/akhet/toa_scarabwildsymbolexplosion1.opus", group: "Freespin" },
  { key: "freespin_smash_symbol_explosion_2", path: "assets/sounds/akhet/toa_scarabwildsymbolexplosion2.opus", group: "Freespin" },
  { key: "freespin_smash_symbol_explosion_3", path: "assets/sounds/akhet/toa_scarabwildsymbolexplosion3.opus", group: "Freespin" },
  { key: "gold_drop", path: "assets/sounds/gold_drop.mp3", group: "Coins" },
  { key: "land1", path: "assets/sounds/land1.opus", group: "Landing" },
  { key: "land2", path: "assets/sounds/land2.opus", group: "Landing" },
  { key: "land3", path: "assets/sounds/land3.opus", group: "Landing" },
  { key: "land4", path: "assets/sounds/land4.opus", group: "Landing" },
  { key: "land5", path: "assets/sounds/land5.opus", group: "Landing" },
  { key: "lightning_amb1", path: "assets/sounds/lightning_amb1.mp3", group: "Lightning" },
  { key: "lightning_amb2", path: "assets/sounds/lightning_amb2.mp3", group: "Lightning" },
  { key: "lightning_amb3", path: "assets/sounds/lightning_amb3.mp3", group: "Lightning" },
  { key: "lightning_at_lvl_up", path: "assets/sounds/Thunderkong/lightning_at_lvl_up.mp3", group: "Lightning" },
  { key: "lightning_hammer", path: "assets/sounds/lightning_hammer.mp3", group: "Lightning" },
  { key: "lightning_thor", path: "assets/sounds/lightning_thor.mp3", group: "Lightning" },
  { key: "lightning_thor_impact", path: "assets/sounds/lightning_thor_impact.mp3", group: "Lightning" },
  { key: "merge_gun_laser_loop", path: "assets/sounds/Thunderkong/laser-loop.mp3", group: "Feature", defaultBaseVolume: MERGE_GUN_LASER_LOOP_VOLUME },
  { key: "mystery_reveal", path: "assets/sounds/mystery_reveal.mp3", group: "Mystery" },
  { key: "mystery_reveal_succession", path: "assets/sounds/mystery_reveal_succession.opus", group: "Mystery" },
  { key: "orb_collect", path: "assets/sounds/orb_collect.opus", group: "Feature" },
  { key: "symbol_clear_addition", path: "assets/sounds/Thunderkong/symbol_clear_addition.mp3", group: "Feature" },
  { key: "swing_1", path: "assets/sounds/helldive/swing1.mp3", group: "Combat" },
  { key: "swing_2", path: "assets/sounds/helldive/swing2.mp3", group: "Combat" },
  { key: "theme_bonus", path: "assets/sounds/helldive/bonusgame.mp3", group: "Music", defaultBaseVolume: BONUS_THEME_VOLUME },
  { key: "theme_main", path: "assets/sounds/helldive/maingame.mp3", group: "Music", defaultBaseVolume: MAIN_THEME_VOLUME },
  { key: "troll_before_entrance", path: "assets/sounds/troll_before_entrance.mp3", group: "Troll" },
  { key: "troll_dies", path: "assets/sounds/troll_dies.mp3", group: "Troll" },
  { key: "troll_rushing_growl", path: "assets/sounds/troll_rushing_growl.mp3", group: "Troll" },
  { key: "troll_trees_crack", path: "assets/sounds/troll_trees_crack.mp3", group: "Troll" },
  { key: "wheel_diamond_appear", path: "assets/sounds/wheel_diamond_appear.opus", group: "Wheel" },
  { key: "wheel_diamond_confirms", path: "assets/sounds/wheel_diamond_confirms.opus", group: "Wheel" },
  { key: "wins_explode", path: "assets/sounds/wins_explode.opus", group: "Win" },
  { key: "wins_highlight", path: "assets/sounds/wins_highlight.opus", group: "Win" },
  { key: "wins_payout", path: "assets/sounds/wins_payout.opus", group: "Win" }
];
const SOUND_VOLUME_TOOL_SOUND_BY_KEY = SOUND_VOLUME_TOOL_SOUNDS.reduce((map, sound) => {
  map[sound.key] = sound;
  return map;
}, {});
const BONUS_PILE_KEEP_TOKENS = true;
const COLLECT_FALL_SPEED_MULTIPLIER = 1.15;
const COLLECT_FALL_IMPACT_DURATION_MS = 1000;
const HERO_STAGE_TEXTURE_KEYS = {
  base: "tk_stage1_3",
  rush: "tk_stage4",
  giant2: "tk_stage5",
  giant3: "tk_stage6"
};
const WIN_HIGHLIGHT_INTENSITY_BLINKS = 1;
const WIN_HIGHLIGHT_INTENSITY_TEXTURE_KEYS = {
  1: "1_intensity",
  2: "2_intensity",
  3: "3_intensity",
  4: "4_intensity",
  5: "5_intensity",
  6: "6_intensity",
  7: "7_intensity"
};
const WIN_HIGHLIGHT_ORB_INTENSITY_TEXTURE_KEYS = {
  1: "1_orb_intensity",
  2: "2_orb_intensity",
  3: "3_orb_intensity",
  4: "4_orb_intensity",
  5: "5_orb_intensity",
  6: "6_orb_intensity",
  7: "7_orb_intensity"
};
const HERO_STAGE_INTENSITY_TEXTURE_KEYS = {
  [HERO_STAGE_TEXTURE_KEYS.base]: "tk_stage1_3_intensity",
  [HERO_STAGE_TEXTURE_KEYS.rush]: "tk_stage4_intensity",
  [HERO_STAGE_TEXTURE_KEYS.giant2]: "tk_stage5_intensity",
  [HERO_STAGE_TEXTURE_KEYS.giant3]: "tk_stage6_intensity"
};
const WIN_HIGHLIGHT_DURATION_MS = 900;

function clampSoundVolume(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return SOUND_VOLUME_DEFAULT;
  }

  return Phaser.Math.Clamp(parsed, SOUND_VOLUME_MIN, SOUND_VOLUME_MAX);
}

function normalizeSoundVolumeMap(source = {}) {
  const input = source?.volumes && typeof source.volumes === "object"
    ? source.volumes
    : source;
  const normalized = {};

  Object.entries(input || {}).forEach(([soundKey, value]) => {
    if (typeof soundKey !== "string" || !soundKey) return;
    normalized[soundKey] = clampSoundVolume(value);
  });

  return normalized;
}

// Helper function to check if a symbol is any banana type
function isBanana(symbol) {
  const normalizedSymbol = Number(symbol);
  if (!Number.isFinite(normalizedSymbol)) {
    return false;
  }

  return BANANA_SYMBOL_IDS.includes(normalizedSymbol);
}

// Helper function to get the appropriate scale for a symbol
function getSymbolScale(symbol) {
  const normalizedSymbol = Number(symbol);
  if (Number.isFinite(normalizedSymbol) && normalizedSymbol === BONUS_MYSTERY_FEATURE_SYMBOL_ID) {
    return normalScale * BONUS_MYSTERY_FEATURE_SCALE_MULTIPLIER;
  }
  if (Number.isFinite(normalizedSymbol) && normalizedSymbol === LIGHTNING_BEE_FEATURE_SYMBOL_ID) {
    return normalScale * LIGHTNING_BEE_FEATURE_SCALE_MULTIPLIER;
  }
  if (Number.isFinite(normalizedSymbol) && normalizedSymbol === TROLL_SYMBOL_ID) {
    return trollScale;
  } else if (isBanana(symbol)) {
    return bananaScale;
  } else {
    return normalScale;
  }
}

function getHeroScaleForFootprint(rawFootprintSize = 1, textureKey = null) {
  return 1;
}

function normalizeSymbolKey(symbol) {
  const parsed = Number(symbol);
  return Number.isFinite(parsed) ? parsed : symbol;
}

/** Reel cell may be a bare Image or a Container with `reelSymbolImage` (Image child). */
function getReelSymbolRenderable(cell) {
  if (!cell || cell.destroyed) return null;
  return cell.reelSymbolImage ?? cell;
}

/** Bonus grid overlay text offset from symbol center (container space). */
const BONUS_GRID_OVERLAY_LOCAL_Y = 6;
const BONUS_MULTIPLIER_FRUIT_CHARGE_OFFSET_Y = 72;

// Helper function to get the correct troll texture based on rush direction
function getTrollTexture(direction) {
  // Use special texture when rushing from left to right
  if (direction === 'fromleft') {
    return '13_fromleft';
  }
  // Use regular banana3 texture for all other directions
  return String(TROLL_SYMBOL_ID);
}

// Helper function to detect if a position is the top-left corner of a 3x3 troll formation
function isTroll3x3TopLeft(reels, reel, row) {
  const trollId = TROLL_SYMBOL_ID;
  
  // Check if this position and the next 2x2 cells (total 3x3) are all trolls
  if (reel > 5 || row > 5) return false; // Can't fit 3x3 from this position
  
  for (let r = reel; r < reel + 3; r++) {
    for (let ro = row; ro < row + 3; ro++) {
      if (!reels[r] || reels[r][ro] !== trollId) {
        return false;
      }
    }
  }
  
  return true; // All 9 cells are trolls
}

// Helper function to check if a position is part of ANY 3x3 troll formation
function isPartOfTroll3x3(reels, reel, row) {
  const trollId = TROLL_SYMBOL_ID;
  
  // Not a troll? Can't be part of 3x3
  if (!reels[reel] || reels[reel][row] !== trollId) return false;
  
  // Check if this position is part of a 3x3 starting from any nearby top-left corner
  for (let topLeftReel = Math.max(0, reel - 2); topLeftReel <= Math.min(5, reel); topLeftReel++) {
    for (let topLeftRow = Math.max(0, row - 2); topLeftRow <= Math.min(5, row); topLeftRow++) {
      if (isTroll3x3TopLeft(reels, topLeftReel, topLeftRow)) {
        return { topLeftReel, topLeftRow }; // Return the top-left corner position
      }
    }
  }
  
  return false;
}

// Get monkey texture based on current bonus stage form.
function getHeroTexture(_weapon, { footprintSize = 1, rushActive = false, bonusStage = 0 } = {}) {
  const resolvedFootprintSize = Math.max(1, Math.floor(Number(footprintSize) || 1));
  if (resolvedFootprintSize >= 3) return HERO_STAGE_TEXTURE_KEYS.giant3;
  if (resolvedFootprintSize >= 2) return HERO_STAGE_TEXTURE_KEYS.giant2;
  if (rushActive === true) return HERO_STAGE_TEXTURE_KEYS.rush;
  return HERO_STAGE_TEXTURE_KEYS.base;
}

// Depth/Z-index layers
const DEPTH_SYMBOLS = 10;      // Regular symbols
const DEPTH_BANANAS = 20;      // Bananas above symbols
const DEPTH_BONUS_MYSTERY_FEATURE = 22; // Board mystery balloons above regular symbols/bananas
const DEPTH_MERGE_GUN_FEATURE = 24;     // Glue guns above mystery balloons
const DEPTH_LIGHTNING_BEE_FEATURE = 26; // Bees above other board feature symbols
const DEPTH_HERO = 30;         // Hero above everything
const DEPTH_HOUSE = 5;         // House above everything
const DEPTH_BOARD_BACKDROP = 4.25; // Board contrast layer, behind house and symbols
const DEBUG_BANANA_GRAVITY = false; // Temporary diagnostics for respin banana blink

function getBoardSymbolDepth(symbol) {
  if (symbol === null || symbol === undefined) {
    return null;
  }
  const normalizedSymbol = Number(symbol);
  if (Number.isFinite(normalizedSymbol) && normalizedSymbol === MERGE_GUN_FEATURE_SYMBOL_ID) {
    return DEPTH_MERGE_GUN_FEATURE;
  }
  if (Number.isFinite(normalizedSymbol) && normalizedSymbol === LIGHTNING_BEE_FEATURE_SYMBOL_ID) {
    return DEPTH_LIGHTNING_BEE_FEATURE;
  }
  if (Number.isFinite(normalizedSymbol) && normalizedSymbol === BONUS_MYSTERY_FEATURE_SYMBOL_ID) {
    return DEPTH_BONUS_MYSTERY_FEATURE;
  }
  if (Number.isFinite(normalizedSymbol) && normalizedSymbol === TROLL_SYMBOL_ID) {
    return DEPTH_BANANAS;
  }
  return isBanana(symbol) ? DEPTH_BANANAS : DEPTH_SYMBOLS;
}

function getFeatureSymbolIntenseTextureKey(rawSymbol) {
  const symbolId = Math.floor(Number(rawSymbol));
  if (!Number.isFinite(symbolId)) return null;
  if (symbolId === Math.floor(BONUS_MYSTERY_FEATURE_SYMBOL_ID)) {
    return BONUS_MYSTERY_FEATURE_INTENSE_TEXTURE_KEY;
  }
  if (symbolId === Math.floor(MERGE_GUN_FEATURE_SYMBOL_ID)) {
    return MERGE_GUN_FEATURE_INTENSE_TEXTURE_KEY;
  }
  return null;
}

function parseHeroLightningAtlasFrames(atlasText = "") {
  const frames = [];
  let currentFrame = null;
  const pushCurrentFrame = () => {
    if (!currentFrame || !currentFrame.bounds) return;
    frames.push(currentFrame);
  };

  String(atlasText).split(/\r?\n/).forEach((line) => {
    const trimmed = String(line || "").trim();
    if (!trimmed) return;

    if (trimmed.startsWith("lightning/")) {
      pushCurrentFrame();
      currentFrame = {
        name: trimmed,
        rotated: false,
        bounds: null
      };
      return;
    }

    if (!currentFrame) return;
    if (trimmed.startsWith("bounds:")) {
      const values = trimmed
        .slice("bounds:".length)
        .split(",")
        .map((value) => Math.floor(Number(value)));
      if (values.length === 4 && values.every((value) => Number.isFinite(value))) {
        currentFrame.bounds = {
          x: values[0],
          y: values[1],
          width: values[2],
          height: values[3]
        };
      }
      return;
    }

    if (trimmed.startsWith("rotate:")) {
      currentFrame.rotated = trimmed.includes("90");
    }
  });

  pushCurrentFrame();
  return frames;
}

function parseSpineAtlasFrames(atlasText = "", {
  prefix = "",
  pageName = null
} = {}) {
  const frames = [];
  let currentPage = null;
  let currentFrame = null;

  const pushCurrentFrame = () => {
    if (!currentFrame || !currentFrame.bounds) return;
    frames.push(currentFrame);
  };

  String(atlasText).split(/\r?\n/).forEach((line) => {
    const trimmed = String(line || "").trim();
    if (!trimmed) return;

    if (/\.(png|webp|jpe?g)$/i.test(trimmed)) {
      pushCurrentFrame();
      currentPage = trimmed;
      currentFrame = null;
      return;
    }

    if (!trimmed.includes(":")) {
      pushCurrentFrame();
      currentFrame = (
        (!pageName || currentPage === pageName) &&
        (!prefix || trimmed.startsWith(prefix))
      )
        ? { name: trimmed, page: currentPage, rotated: false, bounds: null }
        : null;
      return;
    }

    if (!currentFrame) return;
    if (trimmed.startsWith("bounds:")) {
      const values = trimmed
        .slice("bounds:".length)
        .split(",")
        .map((value) => Math.floor(Number(value)));
      if (values.length === 4 && values.every((value) => Number.isFinite(value))) {
        currentFrame.bounds = {
          x: values[0],
          y: values[1],
          width: values[2],
          height: values[3]
        };
      }
      return;
    }

    if (trimmed.startsWith("rotate:")) {
      currentFrame.rotated = trimmed.includes("90");
    }
  });

  pushCurrentFrame();
  return frames;
}

// ========== SCREEN SHAKE CONFIG (tweak these!) ==========
// Hero entry shake
const SHAKE_HERO_ENTRY_DURATION = 200;
const SHAKE_HERO_ENTRY_INTENSITY = 0.003;

// Regular banana kill shake (during banana hunt path)
const SHAKE_BANANA_KILL_DURATION = 100;        // was 120
const SHAKE_BANANA_KILL_INTENSITY = 0.008;     // was 0.012

// Banana destruction at start position shake
const SHAKE_BANANA_DESTROY_DURATION = 150;     // was 200
const SHAKE_BANANA_DESTROY_INTENSITY = 0.010;  // was 0.015

// Final/finishing move shake (last banana - bigger impact)
const SHAKE_FINISHING_MOVE_DURATION = 180;     // was 250
const SHAKE_FINISHING_MOVE_INTENSITY = 0.014;  // was 0.02

// Mystery reveal shake
const SHAKE_MYSTERY_REVEAL_DURATION = 400;
const SHAKE_MYSTERY_REVEAL_INTENSITY = 0.008;

// Exploding barrel (TNT) detonation — screen shake after anticipation wiggle
const SHAKE_BARREL_BURST_DURATION = 220;
const SHAKE_BARREL_BURST_INTENSITY = 0.008;

// Thunderkong palette for banana/banana impact effects (no red tones).
const BANANA_SPLATTER_COLORS = [0x3D2B12, 0x4A3516, 0x2F2410, 0x5A421C, 0x6A4E22];
const BANANA_IMPACT_COLORS = [0x6E5423, 0x7A602A, 0x5E4A20, 0x4B3A19, 0x8A6C2F];
const BANANA_BACKPLATE_COLORS = [0x3A5F2A, 0x4B7A33, 0x5E8A34, 0x66993D, 0x8CBF47];
const BANANA_TRAIL_TINT = 0xFFE7A1;
const BONUS_COUNTER_GLOW_COLOR = 0xFFD54F;
const NECROMANCER_ORB_COLORS = [0x2B7A5B, 0x1F8C6A, 0x2E9D7A, 0x3FBF8F, 0x1E5F47, 0x56D6A8];
const NECROMANCER_GROUND_GLOW = 0x2D6B4D;

export class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene' });
    this.symbolsGroup = null;
    this.monkeyWildStrengthBadge = null;
    this.monkeyWildStrengthBadgeFollow = null;
    this.heroWildActiveBadge = null;
    this.heroWildActiveBadgeFollow = null;
    this.heroWildActiveBadgeText = "W";
    this.currentHeroAngelMultiplierDisplay = null;
    this._heroPreviewConsoleCommand = null;
    this._heroPreviewHelpCommand = null;
    this.currentMonkeyWildStrength = 1;
    this.bonusFruitPileTokens = [];
    this.bonusFruitPileCounts = {};
    this.bonusFruitPileHitArea = null;
    this.bonusFruitPileTooltip = null;
    this.bonusFruitPileTooltipVisible = false;
    this.bonusMysteryMeterBg = null;
    this.bonusMysteryMeterIconOutline = null;
    this.bonusMysteryMeterIcon = null;
    this.bonusMysteryMeterText = null;
    this.bonusMysteryMeterState = { collected: 0, max: 3 };
    this.lightningBeeMeterIconOutline = null;
    this.lightningBeeMeterIcon = null;
    this.lightningBeeMeterText = null;
    this.lightningBeeMeterMultiplierText = null;
    this.lightningBeeMeterHitArea = null;
    this.lightningBeeMeterTooltip = null;
    this.lightningBeeMeterTooltipVisible = false;
    this.lightningBeeMeterState = {
      collected: 0,
      max: 3,
      multiplier: 1,
      multiplierStep: 0,
      boardBees: [],
      collectedBees: [],
      nextBeeId: 1
    };
    this.freespinCounterValue = null;
    this.bonusFreespinRingDisplays = [];
    this.bonusFreespinRingCount = 0;
    this._bonusFreespinRingFramesReady = false;
    this._bonusFreespinRingFrames = null;
    this.pendingBonusFreespinRingRemaining = null;
    this.suppressCountUpUntilBonusEndPayout = false;
    this.immediateLowPositionTbmByKey = new Map();
    this.immediateLowBackplateDisplays = new Map();
    this.mergeGunAreaDisplays = new Map();
    this.mergeGunAreas = [];
    this.bonusMultiplierFruits = null;
    this.bonusMultiplierFruitSymbolIds = new Set();
    this.bonusMultiplierFruitPresentationSignature = null;
    this._symbolBackdropSyncHandler = null;
    this.boardShadowOverlay = null;
    this._symbolSpawnCurtainSprite = null;
    this._symbolSpawnFadeWatcher = null;
    this.currentBonusStage = 0;
    this.currentHeroRushActive = false;
    this.currentHeroFootprintSize = 1;
    this.currentHeroTextureKey = HERO_STAGE_TEXTURE_KEYS.base;
    this.heroLightningAura = null;
    this.heroLightningAuraSparks = [];
    this._heroLightningAuraNextSparkAt = 0;
    this._heroLightningAuraWatcher = null;
    this._heroLightningAuraFramesReady = false;
    this._heroLightningAuraFrameKeys = [];
    this._heroAuraCrackleFramesReady = false;
    this._heroAuraCrackleFrameKeys = [];
    this._mergeGunFlareAuraFrameReady = false;
    this._mergeGunFlareAuraFrameKey = null;
    this._symbolPopParticleFramesReady = false;
    this._symbolPopParticleFrameKeys = [];
    this.totalWinText = null; // 👈 shared ref
    
    // Thor's Lightning counter (resets on bonus)
    this.lightningCount = 0;
    this.stormBegun = false; // Track if storm/ambient lightning has started
    
    // Track current action to prevent stale orb updates
    this.currentAction = null;
    this.eventBus = null;
    this.unsubscribeLayout = null;
    this.layoutSnapshot = null;
    this.unsubscribeLayoutDebugVisibility = null;
    this.layoutDebugEnabled = false;
    this.mustSeeDebugGraphics = null;
    this._fastForwardRequested = false;
    this._fastForwardTimer = null;
    this._fastForwardRequestSerial = 0;
    this._fastForwardWaiters = new Set();
    this._highlightPhaseCleanup = null;
    this._skippablePresentationWaits = new Set();
    this._audioInteractionMode = 'normal';
    this._fastForwardSfxVolumeMultiplier = 0.65;
    this.soundVolumeMultipliers = null;
    this._soundVolumeLastPlayed = null;
    this._soundVolumeLastPlayedByKey = new Map();
    this._soundVolumeToolElements = null;
    this._soundVolumeToolVisible = false;
    this._soundVolumeToolSelectedKey = null;
    this._soundVolumeToolFollowCurrent = true;
    this._soundVolumeToolKeydownHandler = null;
    this._soundVolumeToolHoverTimer = null;
    this._soundVolumeToolPreview = null;
    this._soundVolumeTrackedInstances = new Set();
    this._forcedOutcomeToolElements = null;
    this._forcedOutcomeToolChangeHandler = null;
    this.heavenHellLootSprites = [];
    this.heavenHellRenderedLootKeys = new Set();
    this.heavenHellPortalAura = null;
    this.heavenHellAbilityPanel = null;
    this._heavenHellMeterUi = null;
    this._heavenHellMeterDisplayKills = null;
    this._heavenHellMeterRuntime = null;
    this._heavenHellPendingMeterSoulTrails = 0;
    this._heavenHellActiveGameState = null;
    this._heavenHellGroundLootDisplayValue = 0;
    this.heavenHellLastRewardFxKey = null;
    this.heavenHellMeterBlinkTween = null;
    this.heavenHellRippleFx = [];
    this.heavenHellDivineGroundFx = [];
    this.heavenHellBonusEntryAngelArrivalPlayed = false;
    this._heavenHellMultiplierOrbPlan = null;
  }

  /** @deprecated Use inline hunt charge wind-up + impact instead. */
  /** @deprecated Use playHeavenHellDivineXAtStep during hunt instead. */
  
  /**
   * Reset Thor's lightning count (call when entering bonus/freespin)
   */
  
  /**
   * Get current lightning count for visual intensity
   */
  
  /**
   * Get storm intensity level (0-30) - increases every lightning
   */
  
  /**
   * Initialize the storm sky area above the grid
   */
  
  /**
   * Start seamless wind drift animations for mist layers
   * Uses two copies per layer for seamless looping - when one exits, the other enters
   */
  
  /**
   * Main storm loop - updates visuals and creates random lightning
   */
  
  /**
   * Create a random lightning bolt in the sky with illumination effect
   */
  
  /**
   * Force update storm visuals (call after lightning count changes)
   */
  /**
   * Get the appropriate mystery symbol texture based on hero's step ability
   * @param {string} stepType - Hero's step type ("destroy", "mystery", "mysteryWild")
   * @returns {string} - Texture key for mystery symbol
   */

  
  /**
   * Update count-up display - directly set value, no animation
   * @param {number} targetValue - The target win amount to display
   */
  
  /**
   * Format config base TBM for small on-symbol labels (matches server bonusEndFallenSymbols baseTbm).
   */
  /**
   * `symbolBaseTbmById` entry: number → formatted TBM string; non-empty string → shown as-is;
   * `null` / missing / empty string → no overlay for that symbol id.
   */
  /**
   * Payout symbol 1 ≈ top tier (e.g. 4x) → gold; 2 → silver; 3 → bronze; rest → default warm gold.
   */
  /**
   * True while the visible grid is bonus freespin / freerespin / freespin hunt (not main-game spin).
   */
  /**
   * Wrap a reel Image in a Container so overlay text is a child (moves/destroys with the symbol).
   */
  /**
   * When `bonusEndPayout.showSymbolConfigBaseTbmOnOverlay` is true and we're in bonus mode,
   * show each payout symbol's (1–7) configured base TBM on the symbol (child of same container).
   * Typography matches bonus-end backplate value text (~24px Cinzel).
   */
  /**
   * Tooltip value text when hovering bonus fruit pile: e.g. "x4"
   * Uses bonusEndPayout.symbolBaseTbmById.
   */
  /**
   * Update freespin counter state for the framework display.
   * The local scene counter was removed so the balloon meter can stand alone.
   * @param {number} remaining - Remaining freespins
   */
  
  /**
   * Hide freespin counter (when returning to main game)
   */
  
  /**
   * Create or update hero abilities UI - shows step, weapon, and necromancer levels
   * @param {Object} hero - Hero object with step, weapon, necromancer properties
   */
  
  /**
   * Hide hero abilities UI
   */
  
  /**
   * Create or update banana kill counter - shows progress to next chest
   * Displays like "5/10" or "13/10" (can exceed threshold)
   * @param {number} killed - Total bananas killed
   * @param {number} threshold - Bananas needed per chest (e.g., 10)
   */
  
  /**
   * Hide banana kill counter (when returning to main game)
   */
  
  /**
   * Add looping sparkle effect to chest icon when reaching threshold
   * Mini version of the center chest sparkles
   */
  
  /**
   * Stop chest sparkle effect (called when Thor strikes)
   */
  
  /**
   * Particle burst when multiplier upgrades (orb hits house)
   * Firework-style swirling particles
   */
  /**
   * Create blood splatter effect at banana death location
   * Blood persists behind symbols and stacks up with each kill
   * Subtle and dark - doesn't dominate the scene
   */
  
  /**
   * Clear all blood splatters with fade animation
   */
  /**
   * Drop energy orbs from killed banana
   */
  /**
   * Drop gold pile from killed banana - creates sparkle pile with heavy drop
   * Visual style varies based on tier (id1=basic, id2=good, id3=great, id4=legendary)
   */
  /**
   * Collect all gold piles - animate ALL coins with smooth countup
   */
  /**
   * Create magical hellfire flames behind a banana sprite
   */
  
  /**
   * Update banana backplate position (flames follow sprite automatically via tweens)
   */
  
  /**
   * Destroy banana hellfire flames
   */
  
  /**
   * Clean up ALL banana backplates from all sprites
   * Call this to ensure no lingering flames
   */
  
  /**
   * Refresh all banana backplates - call after animations complete
   * Note: banana2 (necromancer spawns) don't get backplates - they have special sprite
   */
  /**
   * Create blood splash particle effect
   */
  /**
   * Create rapid attack storm effect for 3x3 troll combat
   * Shows hero as a blur with multiple slash effects
   * @param {number} centerX - Center X of troll
   * @param {number} centerY - Center Y of troll
   * @param {Array} heroPath - Full hero path
   * @param {string} weapon - Weapon type
   */
  /**
   * Animate hero hunting bananas along a path
   * @param {number} totalDemonsKilledInSequence - Legacy sequence counter; speed is now driven by monkey form.
   * @param {string} stepType - The hero step type ("destroy", "mystery", "mysteryWild")
   * @param {string} weapon - The hero weapon ("staff", "sword", "axe")
   * @param {object} bonusInfo - Optional: { isBonus: boolean, baseKillCount: number, bananasPerChest: number }
   */
  /**
   * Reveal mystery symbols to their actual symbols
   * Called after banana hunt and orb collection complete
   * DRAMATIC MAGICAL SWEEP EFFECT
   * @param {string} stepType - The hero step type ("mystery" or "mysteryWild")
   */
  /**
   * Shared presentation wait helper.
   * - Use scene time by default so fast-forward timeScale can shorten normal waits.
   * - Mark waits as skippable when fast-forward should resolve them immediately.
   */
  /**
   * Whether SFX should currently respect fast-forward suppression rules.
   * This stays latched for the current action until Client clears it.
   */
  /**
   * Central SFX wrapper.
   * - One-shot effects should use this instead of calling this.sound.play directly.
   * - Music keeps using dedicated theme methods because it has separate lifecycle rules.
   */
  /**
   * Play spin click sound
   */
  /**
   * Start main theme music (on first spin)
   */
  /**
   * Start bonus theme music (when wheel spins)
   */
  /**
   * Stop bonus theme and resume main theme
   */
  /**
   * Toggle music on/off (main and bonus themes)
   */
  /**
   * Get current music mute state
   */
  /**
   * Get landing sound based on reel (for vertical drops)
   * @param {number} reel - Reel index (0-7)
   */
  /**
   * Get landing sound based on row (for horizontal slides)
   * @param {number} row - Row index (0-6)
   */
  
  /**
   * Play landing sound only if it's not already playing
   * @param {string} soundKey - Sound key to play
   * @param {number} volume - Volume (0-1)
   */
  /**
   * Reset visuals for a new spin (called before necromancer spawns)
   * Clears hero, multiplier, and win displays
   */
  /**
   * Update hero sprite texture based on weapon (without changing position)
   * Used during bonus wheel to update hero appearance when weapon is upgraded
   */
  
  /**
   * Place hero at starting position (before freespins begin)
   * Hero appears at heroStartingPosition from client_config (when set)
   * Clears ALL symbols on the board
   */
  /**
   * Remove bonus chest and bonus text from sky
   * Called before freespins start (keeps lightning and sparkles)
   */
  /**
   * Start ambient lightning sound loops
   */
  
  /**
   * Stop ambient lightning sound loops
   */
  
  /**
   * Start periodic check for ambient lightning intensity
   * Randomly mutes ambient tracks based on storm intensity
   */
  /**
   * Start bonus mode - fades out the BONUS text in the sky
   * Called at the start of the first freespin
   * Also prevents the BONUS text tease from appearing during lightning
   */
  /**
   * Animate necromancer banana spawns - mystical spiral orb summoning
   * @param {Array} spawns - Array of {reel, row, bananaId} positions
   */
  /**
   * Animate fake troll attack (tease) - just warning effects, no actual rush
   * @param {string} direction - Direction troll "comes from" ('fromleft', 'fromright', etc.)
   * @param {object} centerPosition - Center position for effects
   */
  /**
   * Animate troll rushing into the game area and destroying symbols
   * @param {object} reelsWithTroll - Reels after troll placement (has trolls + 0s)
   * @param {array} trollPosition - Array of 9 positions where troll ends up
   * @param {array} affectedPositions - Symbols that were destroyed/replaced
   * @param {string} direction - Direction troll came from ('fromleft', 'fromright', etc.)
   * @param {object} centerPosition - Center of the 3x3 troll
   */
  //**
  // * Play magical landing effect for powered time symbols (hammer with lightning)
  // * Creates lightning bolt to sky and persistent glow
  // */
  
  /**
   * Fade out the power effects when lightning transfers the energy
   */
  
  /**
   * Cleanup all time symbol power effects (for new spin)
   */
  /**
   * Play magical beam effect for time symbols - energy transfers to sky
   * After effect, the compass looks depleted (desaturated)
   */
  
  /**
   * Yellow lightning strike to center when bonus is triggered
   * Shows BONUS text (main game) or +X FREESPINS text (during bonus mode)
   * @param {number} freespinsAwarded - Number of freespins awarded (for chest rewards)
   */
  
  /**
   * Create sparkles in front of the bonus text
   */
  
  /**
   * Create sparkles around the bonus chest (smaller than bonus text sparkles)
   */
  
  /**
   * Create golden particles across the whole sky/mountain line
   * Sparkles behind the forest spanning the full width
   */
  /**
   * Play the bonus transition sequence
   * 1. Fade game area to black
   * 2. Show hero opening chest image
   * 3. Launch 1-3 golden daggers that swirl in circles with glitter trails
   * 4. Daggers settle evenly around a circle
   * 5. Feature wheel fades in
   * @param {object} bonusWon - The bonusWon object from gameState
   */
  
  /**
   * Start the feature wheel spinning with texture transitions
   * Speeds up, spins for ~5 seconds, then slows down and stops
   */
  
  /**
   * Trigger a golden burst when wheel stops, then start subtle pulsing glow
   */
  
  /**
   * Create a golden diamond shape (like ♦ from cards)
   * Top point will be rotated to face inward toward circle center
   */
  
  /**
   * Create burst effect when dagger launches
   */
  
  /**
   * Start continuous glitter trail behind dagger
   */
  
  /**
   * Fade out bonus transition and return to game area
   */
  
  /**
   * Cleanup bonus transition elements (instant, no animation)
   */
  /**
   * Highlight winning clusters with intensity symbol crossfades and win labels
   */
  /**
   * Explode winning symbols with particle effect
   */
  /**
   * Drop existing symbols down to fill gaps (no new symbols spawned)
   */
  /**
   * Helper function to get visible starting position for symbols entering from outside grid
   * Clamps positions to be just outside the grid edge (1 cell) for better visibility
   */
  /**
   * Drop symbols with gravity animation (includes new symbols from top)
   * @param {Array} timeSymbols - Array of time symbol positions with bonus info
   */
  // Tiny global slow-mo that affects tweens (optionally timers)
  // factor < 1 = slower (e.g., 0.35); duration in ms
  // ----- SLOW-MO -----
  // ----- PAUSE -----
  // Toggle functions
  // ---- toggles ----
  // Call once in Scene.create()

  setCurrentAction(value) {
    this.currentAction = value;
    return value;
  }

  setCurrentHeroFootprintSize(value) {
    this.currentHeroFootprintSize = value;
    return value;
  }

  setLightningCount(value) {
    this.lightningCount = value;
    return value;
  }
}
const gameSceneExtractedDeps = {
  BACKGROUND_CLOUD_ATLAS_PAGE,
  BACKGROUND_CLOUD_SHEET_TEXTURE_KEY,
  BANANA_IMPACT_COLORS,
  BANANA_SYMBOL_IDS,
  BANANA_TRAIL_TINT,
  BONUS_COUNTER_GLOW_COLOR,
  BONUS_END_BALLOON_TEXTURE_FALLBACK,
  BONUS_END_COIN_ANIM_FPS,
  BONUS_END_COIN_ATLAS_KEY,
  BONUS_END_COIN_FRAME_COUNT,
  BONUS_END_COIN_SPIN_ANIM_KEY,
  BONUS_FREESPIN_POWER_CIRCLE_TEXTURE_KEY,
  BONUS_FREESPIN_RING_ATLAS_PAGE,
  BONUS_FREESPIN_RING_ORB_ANIM_KEY,
  BONUS_FREESPIN_RING_SHEET_TEXTURE_KEY,
  BONUS_FREESPIN_RING_VISUALS_ENABLED,
  BONUS_GRID_OVERLAY_LOCAL_Y,
  BONUS_IMMEDIATE_LOW_SYMBOL_IDS,
  BONUS_MULTIPLIER_FRUIT_CHARGE_OFFSET_Y,
  BONUS_MYSTERY_FEATURE_ANIM_FPS,
  BONUS_MYSTERY_FEATURE_ANIM_KEY,
  BONUS_MYSTERY_FEATURE_ATLAS_KEY,
  BONUS_MYSTERY_FEATURE_FRAME_COUNT,
  BONUS_MYSTERY_FEATURE_INTENSE_TEXTURE_KEY,
  BONUS_MYSTERY_FEATURE_SPIN_DURATION_MS,
  BONUS_MYSTERY_FEATURE_SYMBOL_ID,
  BONUS_MYSTERY_FEATURE_USE_ATLAS_ANIMATION,
  BONUS_MYSTERY_METER_ICON_OUTLINE_SCALE,
  BONUS_MYSTERY_METER_ICON_SCALE,
  BONUS_PILE_KEEP_TOKENS,
  BONUS_THEME_FADE_IN_MS,
  BONUS_THEME_SEEK_SECONDS,
  BONUS_THEME_VOLUME,
  BONUS_WON_CELEBRATION_HOLD_MS,
  BONUS_WON_CRACKLING_ANIM_KEY,
  BONUS_WON_CRACKLING_ATLAS_TEXT_KEY,
  BONUS_WON_CRACKLING_SHEET_TEXTURE_KEY,
  COLLECT_FALL_IMPACT_DURATION_MS,
  COLLECT_FALL_SPEED_MULTIPLIER,
  DEBUG_BANANA_GRAVITY,
  DEPTH_BANANAS,
  DEPTH_BOARD_BACKDROP,
  DEPTH_HERO,
  DEPTH_HOUSE,
  DEPTH_LIGHTNING_BEE_FEATURE,
  DEPTH_MERGE_GUN_FEATURE,
  DEPTH_SYMBOLS,
  EPS,
  FEATURE_SYMBOL_CROSSFADE_DURATION_MS,
  FEATURE_SYMBOL_CROSSFADE_MAX_ALPHA,
  FEATURE_SYMBOL_CROSSFADE_MIN_ALPHA,
  GRID_OFFSET_X,
  GRID_OFFSET_Y,
  HERO_AURA_CRACKLE_FRAME_KEY_PREFIX,
  HERO_LIGHTNING_ATLAS_TEXT_KEY,
  HERO_LIGHTNING_AURA_FALLBACK_FRAMES,
  HERO_LIGHTNING_AURA_FRAME_KEYS,
  HERO_LIGHTNING_SHEET_TEXTURE_KEY,
  HERO_STAGE_INTENSITY_TEXTURE_KEYS,
  HERO_STAGE_TEXTURE_KEYS,
  LIGHTNING_BEE_FEATURE_SYMBOL_ID,
  LIGHTNING_BEE_METER_ICON_OUTLINE_SCALE,
  LIGHTNING_BEE_METER_ICON_SCALE,
  LIGHTNING_BEE_MULTIPLIER_LADDER_FALLBACK,
  MAIN_THEME_VOLUME,
  MERGE_GUN_FEATURE_INTENSE_TEXTURE_KEY,
  MERGE_GUN_FEATURE_SYMBOL_ID,
  MERGE_GUN_FLARE_AURA_FALLBACK_FRAME,
  MERGE_GUN_FLARE_AURA_FRAME_KEY,
  MERGE_GUN_FLARE_AURA_SOURCE_FRAME,
  MERGE_GUN_LASER_LOOP_VOLUME,
  MONKEY_PICTURE_LEVEL_UP_THRESHOLDS,
  NECROMANCER_GROUND_GLOW,
  NECROMANCER_ORB_COLORS,
  ONE,
  Phaser,
  SCENE_BEHIND_SKY_TEXTURE_KEY,
  SCENE_SKY_TEXTURE_KEY,
  SHAKE_BARREL_BURST_DURATION,
  SHAKE_BARREL_BURST_INTENSITY,
  SHAKE_MYSTERY_REVEAL_DURATION,
  SHAKE_MYSTERY_REVEAL_INTENSITY,
  SOUND_VOLUME_DEFAULT,
  SOUND_VOLUME_FILE_NAME,
  SOUND_VOLUME_MAX,
  SOUND_VOLUME_MIN,
  SOUND_VOLUME_STEP,
  SOUND_VOLUME_STORAGE_KEY,
  SOUND_VOLUME_TOOL_SOUNDS,
  SOUND_VOLUME_TOOL_SOUND_BY_KEY,
  SYMBOL_POP_PARTICLE_ANIM_KEY,
  SYMBOL_POP_PARTICLE_FRAME_KEY_PREFIX,
  TROLL_SYMBOL_ID,
  WIN_HIGHLIGHT_DURATION_MS,
  WIN_HIGHLIGHT_INTENSITY_BLINKS,
  WIN_HIGHLIGHT_INTENSITY_TEXTURE_KEYS,
  WIN_HIGHLIGHT_ORB_INTENSITY_TEXTURE_KEYS,
  bananaScale,
  clampSoundVolume,
  clientConfig,
  gameClientConfig,
  getBoardSymbolDepth,
  getFeatureSymbolIntenseTextureKey,
  getHeroScaleForFootprint,
  getHeroTexture,
  getReelSymbolRenderable,
  getSymbolScale,
  getTrollTexture,
  isBanana,
  isPartOfTroll3x3,
  normalScale,
  normalizeSoundVolumeMap,
  normalizeSymbolKey,
  parseHeroLightningAtlasFrames,
  parseSpineAtlasFrames,
  resolveSymbolId,
  soundInteractionPolicy,
  soundVolumeConfig,
  trollScale
};

Object.assign(GameScene.prototype, createGameSceneAudioTimingMethods(gameSceneExtractedDeps));
Object.assign(GameScene.prototype, createGameSceneHeavenHellMethods(gameSceneExtractedDeps));
Object.assign(GameScene.prototype, createGameSceneBonusMysteryMethods(gameSceneExtractedDeps));
Object.assign(GameScene.prototype, createGameSceneLightningBeeMethods(gameSceneExtractedDeps));
Object.assign(GameScene.prototype, createGameSceneMergeGunMethods(gameSceneExtractedDeps));
Object.assign(GameScene.prototype, createGameSceneFreespinUiMethods(gameSceneExtractedDeps));
Object.assign(GameScene.prototype, createGameSceneLayoutMethods(gameSceneExtractedDeps));
Object.assign(GameScene.prototype, createGameSceneEnvironmentMethods(gameSceneExtractedDeps));
Object.assign(GameScene.prototype, createGameSceneBonusCollectionMethods(gameSceneExtractedDeps));
Object.assign(GameScene.prototype, createGameSceneHeroEffectsMethods(gameSceneExtractedDeps));
Object.assign(GameScene.prototype, createGameSceneHeroCombatMethods(gameSceneExtractedDeps));
Object.assign(GameScene.prototype, createGameSceneBonusPresentationMethods(gameSceneExtractedDeps));
Object.assign(GameScene.prototype, createGameSceneBoardFlowMethods(gameSceneExtractedDeps));
Object.assign(GameScene.prototype, createGameSceneForcedOutcomeMethods(gameSceneExtractedDeps));
Object.assign(GameScene.prototype, createGameSceneSymbolMaskMethods({
  ...gameSceneExtractedDeps,
  getReelSymbolRenderable
}));

const mainGamePortalDeps = {
  ...gameSceneExtractedDeps,
  Phaser,
  GRID_OFFSET_X,
  GRID_OFFSET_Y,
  SOUL_PORTAL_DEPTH: DEPTH_HOUSE + 3,
  SOUL_PORTAL_BASE_RADIUS: 8,
  SOUL_PORTAL_KILLS_FOR_MAX_SIZE: 75,
  SOUL_PORTAL_MAX_SCALE: 4,
  MAIN_GAME_PORTAL_PRELOAD_KEY: "helldive_main_portal_bg",
  MAIN_GAME_PORTAL_CANVAS_KEY: MAIN_GAME_PORTAL_CANVAS_TEXTURE_KEY,
  MAIN_GAME_PORTAL_MASK_KEY: MAIN_GAME_PORTAL_MASK_TEXTURE_KEY,
};
Object.assign(GameScene.prototype, createGameSceneMainPortalMethods(mainGamePortalDeps));

const originalHeavenHellDemonDeathFx = GameScene.prototype.playHeavenHellDemonDeathFx;
const SOUL_PORTAL_DEPTH = DEPTH_HOUSE + 3;
const SOUL_PORTAL_BASE_RADIUS = 8;
const SOUL_PORTAL_KILLS_FOR_MAX_SIZE = 75;
const SOUL_PORTAL_MAX_SCALE = 4;

Object.assign(GameScene.prototype, {
  shouldPlayHeavenHellSoulCollectionFx(_gameState = null) {
    if (this.isInBonusMode === true) return false;

    // Main-game demon hunts use currentAction "bananaHunt".
    // Bonus demon hunts use "freespinbananaHunt" and must not trigger soul FX.
    if (String(this.currentAction || "") !== "bananaHunt") return false;

    return true;
  },

  clearHeavenHellSoulPortalMarker() {
    if (this._heavenHellSoulPortalMarker && !this._heavenHellSoulPortalMarker.destroyed) {
      this.tweens.killTweensOf(this._heavenHellSoulPortalMarker);
      this._heavenHellSoulPortalMarker.destroy();
    }
    this._heavenHellSoulPortalMarker = null;
  },

  resetHeavenHellSoulPortalState() {
    this.clearHeavenHellSoulPortalMarker();
    this._heavenHellSoulPortalKillCount = 0;
    if (this.shouldMainGamePortalReplaceDot()) {
      this.layoutMainGamePortalBackground?.();
    }
  },

  getHeavenHellSoulPortalKillCount() {
    return Math.min(
      SOUL_PORTAL_KILLS_FOR_MAX_SIZE,
      Math.max(0, Math.floor(Number(this._heavenHellSoulPortalKillCount) || 0))
    );
  },

  incrementHeavenHellSoulPortalKillCount() {
    this._heavenHellSoulPortalKillCount = Math.min(
      SOUL_PORTAL_KILLS_FOR_MAX_SIZE,
      this.getHeavenHellSoulPortalKillCount() + 1
    );
    return this._heavenHellSoulPortalKillCount;
  },

  getHeavenHellSoulPortalMarkerScale(killCount = this.getHeavenHellSoulPortalKillCount()) {
    const progress = Phaser.Math.Clamp(killCount / SOUL_PORTAL_KILLS_FOR_MAX_SIZE, 0, 1);
    return 1 + progress * (SOUL_PORTAL_MAX_SCALE - 1);
  },

  ensureHeavenHellSoulPortalMarker() {
    if (this.shouldMainGamePortalReplaceDot()) {
      this.ensureMainGamePortalBackground();
      this.layoutMainGamePortalBackground();
      return null;
    }

    const pos = this.getHeavenHellPortalSoulFlashPosition?.();
    if (!pos) return null;

    if (this._heavenHellSoulPortalMarker && !this._heavenHellSoulPortalMarker.destroyed) {
      this._heavenHellSoulPortalMarker
        .setPosition(pos.x, pos.y)
        .setDepth(SOUL_PORTAL_DEPTH);
      return this._heavenHellSoulPortalMarker;
    }

    const dotCfg = this.getMainGamePortalConfig().dot || {};
    const dotRadius = Math.max(1, Number(dotCfg.radius) || SOUL_PORTAL_BASE_RADIUS);

    const marker = this.add.circle(pos.x, pos.y, dotRadius, 0xFF0000, 0.72)
      .setDepth(SOUL_PORTAL_DEPTH)
      .setStrokeStyle(2, 0xFF3333, 0.9)
      .setBlendMode(Phaser.BlendModes.NORMAL);
    marker.setScale(this.getHeavenHellSoulPortalMarkerScale());
    this._heavenHellSoulPortalMarker = marker;
    return marker;
  },

  updateHeavenHellSoulPortalMarkerScale(killCount = this.getHeavenHellSoulPortalKillCount()) {
    if (this.shouldMainGamePortalReplaceDot()) {
      this.ensureMainGamePortalBackground();
      void this.tweenMainGamePortalMaskLayout(killCount);
      return;
    }

    const marker = this.ensureHeavenHellSoulPortalMarker();
    if (!marker) return;
    const targetScale = this.getHeavenHellSoulPortalMarkerScale(killCount);
    this.tweens.killTweensOf(marker);
    marker.setAlpha(0.72);
    this.tweens.add({
      targets: marker,
      scale: targetScale,
      duration: 200,
      ease: "Sine.easeOut"
    });
  },

  pulseHeavenHellSoulPortalMarker() {
    if (this.shouldMainGamePortalReplaceDot()) {
      void this.tweenMainGamePortalMaskLayout(this.getHeavenHellSoulPortalKillCount(), {
        duration: 100,
        pulseScale: 1.06,
      });
      return;
    }

    const marker = this._heavenHellSoulPortalMarker;
    if (!marker || marker.destroyed) return;
    const baseScale = this.getHeavenHellSoulPortalMarkerScale();
    this.tweens.killTweensOf(marker);
    marker.setAlpha(0.72);
    marker.setScale(baseScale);
    this.tweens.add({
      targets: marker,
      scale: baseScale * 1.06,
      duration: 100,
      yoyo: true,
      ease: "Sine.easeOut"
    });
  },

  shouldPlayHeavenHellBonusSoulCollectionFx(_gameState = null) {
    if (this.isInBonusMode !== true) return false;
    if (String(this.currentAction || "") !== "freespinbananaHunt") return false;
    return true;
  },

  createHeavenHellBonusSoulCollectionFx({
    reel,
    row,
    center = null,
    intensity = 1,
    divineXDoubleKill = false,
    gameState = null,
    killWeight = null
  } = {}) {
    if (!this.shouldPlayHeavenHellBonusSoulCollectionFx?.()) return;
    if (!this.add || !this.tweens || !this.time) return;

    const source = center || this.getGridCellCenter(reel, row);
    if (!source) return;

    this.playHeavenHellSoulDiveIntoMeter?.({
      startX: Number(source.x),
      startY: Number(source.y),
      intensity,
      divineXDoubleKill,
      reel,
      row,
      gameState,
      killWeight
    });
  },

  createHeavenHellSoulCollectionFx({
    reel,
    row,
    center = null,
    intensity = 1,
    divineXDoubleKill = false,
    gameState = null
  } = {}) {
    if (!this.shouldPlayHeavenHellSoulCollectionFx?.()) return;
    if (!this.add || !this.tweens || !this.time) return;

    const source = center || this.getGridCellCenter(reel, row);
    const portalTarget = this.shouldMainGamePortalReplaceDot()
      ? this.getMainGamePortalDisplayPosition()
      : this.getHeavenHellBonusEntryPortalPosition?.();
    if (!source || !portalTarget) return;

    const killCount = this.incrementHeavenHellSoulPortalKillCount();
    this.ensureHeavenHellSoulPortalMarker();
    this.updateHeavenHellSoulPortalMarkerScale(killCount);

    this.playHeavenHellSoulDiveIntoPortal?.({
      startX: Number(source.x),
      startY: Number(source.y),
      intensity,
      divineXDoubleKill,
      onComplete: () => this.pulseHeavenHellSoulPortalMarker()
    });
  },

  playHeavenHellDemonDeathFx(reel, row, options = {}) {
    originalHeavenHellDemonDeathFx?.call?.(this, reel, row, options);
  }
});
