import clientConfig from "./config/client_config.json";

const resolveSymbolId = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const BONUS_MYSTERY_FEATURE_SYMBOL_ID = resolveSymbolId(clientConfig.symbolsMapping?.bonusMysteryFeature, 18);
const MERGE_GUN_FEATURE_SYMBOL_ID = resolveSymbolId(clientConfig.symbolsMapping?.mergeGunFeature, 19);
const LIGHTNING_BEE_FEATURE_SYMBOL_ID = resolveSymbolId(clientConfig.symbolsMapping?.lightningBeeFeature, 20);
const BONUS_MYSTERY_FEATURE_INTENSE_TEXTURE_KEY = "bonus_mystery_feature_intense";
const MERGE_GUN_FEATURE_INTENSE_TEXTURE_KEY = "merge_gun_feature_intense";
const HERO_LIGHTNING_SHEET_TEXTURE_KEY = "hero_lightning_sheet";
const HERO_LIGHTNING_ATLAS_TEXT_KEY = "hero_lightning_atlas";
const BONUS_MYSTERY_FEATURE_USE_ATLAS_ANIMATION = false;
const BONUS_MYSTERY_FEATURE_ATLAS_KEY = "bonus_mystery_feature_minor";
const BONUS_END_COIN_ATLAS_KEY = "bonus_end_coin";
const BONUS_WON_CRACKLING_SHEET_TEXTURE_KEY = "bonus_won_crackling_sheet";
const BONUS_WON_CRACKLING_ATLAS_TEXT_KEY = "bonus_won_crackling_atlas";
const SCENE_SKY_TEXTURE_KEY = "scene_split_sky";
const SCENE_BEHIND_SKY_TEXTURE_KEY = "scene_behind_sky";
const BACKGROUND_CLOUD_SHEET_TEXTURE_KEY = "background_cloud_sheet";
const BONUS_FREESPIN_RING_SHEET_TEXTURE_KEY = "bonus_freespin_ring_sheet";
const BONUS_FREESPIN_POWER_CIRCLE_TEXTURE_KEY = "bonus_freespin_power_circle";
const HERO_STAGE_TEXTURE_KEYS = {
  base: "tk_stage1_3",
  rush: "tk_stage4",
  giant2: "tk_stage5",
  giant3: "tk_stage6"
};
const WIN_HIGHLIGHT_INTENSITY_TEXTURE_KEYS = {
  1: "1_intensity",
  2: "2_intensity",
  3: "3_intensity",
  4: "4_intensity",
  5: "5_intensity",
  6: "6_intensity",
  7: "7_intensity"
};
const HERO_STAGE_INTENSITY_TEXTURE_KEYS = {
  [HERO_STAGE_TEXTURE_KEYS.base]: "tk_stage1_3_intensity",
  [HERO_STAGE_TEXTURE_KEYS.rush]: "tk_stage4_intensity",
  [HERO_STAGE_TEXTURE_KEYS.giant2]: "tk_stage5_intensity",
  [HERO_STAGE_TEXTURE_KEYS.giant3]: "tk_stage6_intensity"
};

export const gameSceneAssetDeps = {
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
};
