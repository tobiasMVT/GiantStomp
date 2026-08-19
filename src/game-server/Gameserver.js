import serverConfig from "./server_config.json" with { type: "json" };
import { createGameServerMainActionMethods } from "./game-server/gameServerMainActionMethods.js";
import { createGameServerBonusActionMethods } from "./game-server/gameServerBonusActionMethods.js";
import { createGameServerFlowMethods } from "./game-server/gameServerFlowMethods.js";
import { generateChest, resolveChestSequence } from "./lib/chestSystem.js";
import {
  getForcedOutcomeSelection,
  normalizeForcedOutcomeSelection,
  parseForcedOutcomeOptionId
} from "./lib/devForcedOutcomeStore.js";

const originalConfig = JSON.parse(JSON.stringify(serverConfig))
const MAX_ACTIONS_PER_ROUND = 10000;
const MAX_TICKET_SEARCH_ATTEMPTS = 25000;
const FALLBACK_TICKET = "noStrategy";
const DEFAULT_LIGHTNING_BEE_MULTIPLIER_LADDER = [
  1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233,
  377, 610, 987, 1597, 2584, 4181, 6765, 10946,
  17711, 28657, 46368
];
const DEFAULT_TICKET_STRATEGIES = [
  "normal",
  "bonus",
  "axe",
  "mysteryWild",
  "mystery",
  "necromancer2",
  "max"
];
const ACTION_BANANA_HUNT = "bananaHunt";
const ACTION_FREESPIN_BANANA_HUNT = "freespinbananaHunt";
const LEGACY_ACTION_BANANA_HUNT = "bananaHunt";
const LEGACY_ACTION_FREESPIN_BANANA_HUNT = "freespinbananaHunt";
const ACTION_TROLL_TEASE = "trolltease";
const ACTION_TROLL_RUSH = "trollrush";
const TROLL_FEATURE_ENABLED = false;
const DISABLED_TICKET_STRATEGIES = new Set(["trollBonus", "trollMain", "trollTease"]);
const BASE_MONKEY_STATE = { step: "destroy", weapon: "staff", necromancer: 0 };
const BANANA_BONUS_TRIGGER_COUNT = 5;
const MAX_BANANA_METER_COUNT = 30;
const BARREL_BANANA_BURST_MIN = 1;
const BARREL_BANANA_BURST_MAX = 5;
const BANANA_METER_LEVELS = [
  { min: 30, level: 5 },
  { min: 25, level: 4 },
  { min: 20, level: 3 },
  { min: 15, level: 2 },
  { min: 10, level: 1 },
  { min: 0, level: 0 }
];
const BONUS_STAGE_THRESHOLDS = [
  { min: 30, stage: 5 },
  { min: 25, stage: 4 },
  { min: 20, stage: 3 },
  { min: 15, stage: 2 },
  { min: 10, stage: 1 },
  { min: 5, stage: 0 },
  { min: 0, stage: 0 }
];
const BONUS_STAGE_FREESPIN_AWARD = 2;
const BONUS_BASE_ENTRY_FREESPINS = 5;
const BONUS_MULTIPLIER_FRUIT_VALUES = [4, 3, 2];
const BONUS_MULTIPLIER_FRUIT_MAX = BONUS_MULTIPLIER_FRUIT_VALUES.length;
// Internal stage 3 is the visible stage-4 rushing monkey; stages 0-2 are visible stages 1-3.
const BONUS_RUSH_START_STAGE = 3;
const BONUS_IMMEDIATE_LOW_SYMBOLS = new Set([7, 6, 5, 4]);
const BONUS_RETRIGGER_THRESHOLDS = Array.from(
  new Set(
    BONUS_STAGE_THRESHOLDS
      .map((entry) => Number(entry?.min || 0))
      .filter((threshold) => threshold > BANANA_BONUS_TRIGGER_COUNT)
  )
).sort((a, b) => a - b);

const resolveDemonMeterLevel = (rawCount = 0) => {
  const count = Math.max(0, Math.min(MAX_BANANA_METER_COUNT, Math.floor(Number(rawCount) || 0)));
  const match = BANANA_METER_LEVELS.find((entry) => count >= entry.min);
  return match ? match.level : 0;
};

const resolveBonusStage = (rawCount = 0, isBonus = false) => {
  if (!isBonus) return 0;
  const count = Math.max(0, Math.min(MAX_BANANA_METER_COUNT, Math.floor(Number(rawCount) || 0)));
  const match = BONUS_STAGE_THRESHOLDS.find((entry) => count >= entry.min);
  return match ? match.stage : 0;
};

const resolveBonusEntryFreespins = (rawCount = 0) => {
  const stage = resolveBonusStage(rawCount, true);
  return BONUS_BASE_ENTRY_FREESPINS + Math.max(0, stage) * BONUS_STAGE_FREESPIN_AWARD;
};

const resolveNextBonusRetriggerThreshold = (rawCount = 0) => {
  const count = Math.max(0, Math.min(MAX_BANANA_METER_COUNT, Math.floor(Number(rawCount) || 0)));
  return BONUS_RETRIGGER_THRESHOLDS.find((threshold) => count < threshold) ?? null;
};

const isPlainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);

const isPositiveNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0;
};

const getCollectedDemonThreshold = (entry) => {
  const threshold = Number(entry?.minCollectedBananas ?? entry?.collectedBananas ?? 0);
  if (!Number.isFinite(threshold)) return 0;
  return Math.max(0, Math.floor(threshold));
};

const resolveAdjustedNumber = (
  baseValue,
  adjustment = null,
  {
    overrideKey = null,
    multiplierKey = null,
    min = 0,
    max = null
  } = {}
) => {
  let value = Number.isFinite(Number(baseValue)) ? Number(baseValue) : 0;

  if (adjustment && overrideKey && hasOwn(adjustment, overrideKey)) {
    const overrideValue = Number(adjustment[overrideKey]);
    if (Number.isFinite(overrideValue)) {
      value = overrideValue;
    }
  } else if (adjustment && multiplierKey && hasOwn(adjustment, multiplierKey)) {
    const multiplierValue = Number(adjustment[multiplierKey]);
    if (Number.isFinite(multiplierValue)) {
      value = value * multiplierValue;
    }
  }

  if (Number.isFinite(min)) {
    value = Math.max(min, value);
  }
  if (Number.isFinite(max)) {
    value = Math.min(max, value);
  }

  return value;
};

const parseTicketConstraints = (ticketName = FALLBACK_TICKET) => {
  const minMatch = ticketName.match(/min_?([\d.]+)/);
  const maxMatch = ticketName.match(/max_?([\d.]+)/);
  const baseStrategy = ticketName
    .replace(/_min_?[\d.]+/g, "")
    .replace(/_max_?[\d.]+/g, "");

  return {
    baseStrategy,
    minTbm: minMatch ? parseFloat(minMatch[1]) : 0,
    maxTbm: maxMatch ? parseFloat(maxMatch[1]) : Infinity
  };
};

export class GameServer {
  constructor (gameState) {
      this.gameState = gameState
      this.serverConfig = serverConfig
      this.width = serverConfig.area.width
      this.height = serverConfig.area.height
      this.nearMissTriggered = 0;
      this.heroId = serverConfig.symbolsMapping?.hero;
      this.mysteryWildId = serverConfig.symbolsMapping?.mysteryWild; // Mystery wild (ID 15)
      this.mysteryId = serverConfig.symbolsMapping?.mystery; // Mystery (ID 14)
      this.timeId = serverConfig.symbolsMapping?.time; // Time symbol (ID 16)
      this.bonusMysteryFeatureId = serverConfig.symbolsMapping?.bonusMysteryFeature; // Bonus mystery feature (ID 18)
      this.mergeGunFeatureId = serverConfig.symbolsMapping?.mergeGunFeature; // Merge gun feature (ID 19)
      this.lightningBeeFeatureId = serverConfig.symbolsMapping?.lightningBeeFeature; // Lightning bee feature (ID 20)
      this.gargoyleDemonId = serverConfig.symbolsMapping?.gargoyleDemon ?? 21;
      
      // Store all hunt target IDs (banana preferred, banana kept for compatibility)
      this.demonId = serverConfig.symbolsMapping?.banana ?? serverConfig.symbolsMapping?.banana;
      this.demonIds = [
        serverConfig.symbolsMapping?.banana,
        serverConfig.symbolsMapping?.banana2,
        serverConfig.symbolsMapping?.banana3,
        serverConfig.symbolsMapping?.gargoyleDemon,
        serverConfig.symbolsMapping?.banana,
        serverConfig.symbolsMapping?.banana2,
        serverConfig.symbolsMapping?.banana3,
        serverConfig.symbolsMapping?.gargoyleDemon
      ].filter(id => id !== undefined);
      
      // House definition (2x2 in center)
      this.house = {
        startReel: 3,
        endReel: 4,
        startRow: 3,
        endRow: 4
      };
  }

  roundCurrency(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return parseFloat(n.toFixed(2));
  }

  normalizeDemonMeter(gameState) {
    if (!gameState || typeof gameState !== "object") return { count: 0, level: 0 };

    const legacyCount = Number(gameState?.bonusState?.finalDemonsCollected ?? gameState?.bonusState?.finalDemonsKilled ?? 0);
    const currentCount = Number(gameState?.bananaMeter?.count ?? gameState?.bananaMeterCount ?? legacyCount);
    const count = Math.max(
      0,
      Math.min(
        MAX_BANANA_METER_COUNT,
        Math.floor(Number.isFinite(currentCount) ? currentCount : 0)
      )
    );
    const level = resolveDemonMeterLevel(count);

    gameState.bananaMeter = { count, level };
    gameState.bananaMeterCount = count;
    gameState.bananaMeterLevel = level;
    this.activeDemonMeterLevel = level;

    return gameState.bananaMeter;
  }

  normalizeRushState(gameState) {
    if (!gameState || typeof gameState !== "object") return false;
    gameState.rushActive = gameState.rushActive === true;
    return gameState.rushActive;
  }

  normalizeProbability(rawValue, fallback = 0) {
    const fallbackNumber = Number.isFinite(Number(fallback)) ? Number(fallback) : 0;
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed)) {
      return Math.max(0, Math.min(1, fallbackNumber));
    }
    const normalized = parsed > 1 ? parsed / 100 : parsed;
    return Math.max(0, Math.min(1, normalized));
  }

  getCollectedDemonCount(gameState = null) {
    const rawCount = Number(
      gameState?.bananaMeter?.count ??
      gameState?.bananaMeterCount ??
      gameState?.bonusState?.finalDemonsCollected ??
      gameState?.bonusState?.finalDemonsKilled ??
      gameState?.totalDemonsCollectedInSequence ??
      gameState?.demonsCollected ??
      0
    );

    return Math.max(
      0,
      Math.min(
        MAX_BANANA_METER_COUNT,
        Math.floor(Number.isFinite(rawCount) ? rawCount : 0)
      )
    );
  }

  getCollectedDemonAdjustment(entries = [], gameState = null) {
    if (!Array.isArray(entries) || entries.length === 0) return null;

    const collectedCount = this.getCollectedDemonCount(gameState);
    const sortedEntries = [...entries]
      .filter((entry) => isPlainObject(entry))
      .sort((a, b) => getCollectedDemonThreshold(b) - getCollectedDemonThreshold(a));

    return sortedEntries.find((entry) => collectedCount >= getCollectedDemonThreshold(entry)) || null;
  }

  resolveDemonSpawnConfig(config = {}, gameState = null) {
    const baseConfig = isPlainObject(config) ? config : {};
    const adjustment = this.getCollectedDemonAdjustment(baseConfig.collectedBananaAdjustments, gameState);
    if (!adjustment) {
      return baseConfig;
    }

    const resolvedConfig = {
      ...baseConfig,
      ...adjustment,
      chance: resolveAdjustedNumber(baseConfig.chance, adjustment, {
        overrideKey: "chance",
        multiplierKey: "chanceMultiplier",
        min: 0,
        max: 1
      }),
      respinChance: resolveAdjustedNumber(baseConfig.respinChance, adjustment, {
        overrideKey: "respinChance",
        multiplierKey: "respinChanceMultiplier",
        min: 0,
        max: 1
      })
    };

    resolvedConfig.countOdds = isPlainObject(adjustment?.countOdds)
      ? adjustment.countOdds
      : baseConfig.countOdds;
    resolvedConfig.typeOdds = isPlainObject(adjustment?.typeOdds)
      ? adjustment.typeOdds
      : baseConfig.typeOdds;
    resolvedConfig.abilityReduction = isPlainObject(adjustment?.abilityReduction)
      ? adjustment.abilityReduction
      : baseConfig.abilityReduction;

    return resolvedConfig;
  }

  resolveExplodingBarrelConfig(gameState = null) {
    const baseConfig = isPlainObject(serverConfig?.explodingBananBarrel)
      ? serverConfig.explodingBananBarrel
      : {};
    const adjustment = this.getCollectedDemonAdjustment(baseConfig.collectedBananaAdjustments, gameState);
    if (!adjustment) {
      return baseConfig;
    }

    const resolvedConfig = {
      ...baseConfig,
      ...adjustment,
      chancePerSpin: resolveAdjustedNumber(baseConfig.chancePerSpin, adjustment, {
        overrideKey: "chancePerSpin",
        multiplierKey: "chancePerSpinMultiplier",
        min: 0
      }),
      chancePerFreespin: resolveAdjustedNumber(baseConfig.chancePerFreespin, adjustment, {
        overrideKey: "chancePerFreespin",
        multiplierKey: "chancePerFreespinMultiplier",
        min: 0
      }),
      chancePerNewSymbolOnRespin: resolveAdjustedNumber(baseConfig.chancePerNewSymbolOnRespin, adjustment, {
        overrideKey: "chancePerNewSymbolOnRespin",
        multiplierKey: "chancePerNewSymbolOnRespinMultiplier",
        min: 0
      }),
      chancePerNewSymbolOnFreerespin: resolveAdjustedNumber(baseConfig.chancePerNewSymbolOnFreerespin, adjustment, {
        overrideKey: "chancePerNewSymbolOnFreerespin",
        multiplierKey: "chancePerNewSymbolOnFreerespinMultiplier",
        min: 0
      }),
      bonusChancePerSymbol: resolveAdjustedNumber(baseConfig.bonusChancePerSymbol, adjustment, {
        overrideKey: "bonusChancePerSymbol",
        multiplierKey: "bonusChancePerSymbolMultiplier",
        min: 0
      }),
      burstMinBananas: Math.floor(
        resolveAdjustedNumber(
          baseConfig.burstMinBananas ?? BARREL_BANANA_BURST_MIN,
          adjustment,
          {
            overrideKey: "burstMinBananas",
            min: 0
          }
        )
      ),
      burstMaxBananas: Math.floor(
        resolveAdjustedNumber(
          baseConfig.burstMaxBananas ?? BARREL_BANANA_BURST_MAX,
          adjustment,
          {
            overrideKey: "burstMaxBananas",
            min: 0
          }
        )
      )
    };

    resolvedConfig.countOdds = isPlainObject(adjustment?.countOdds)
      ? adjustment.countOdds
      : baseConfig.countOdds;
    resolvedConfig.burstCountOdds = isPlainObject(adjustment?.burstCountOdds)
      ? adjustment.burstCountOdds
      : baseConfig.burstCountOdds;

    return resolvedConfig;
  }

  rollConfiguredCount(minCount = 0, maxCount = 0, countOdds = null) {
    const parsedMinCount = Math.max(0, Math.floor(Number(minCount) || 0));
    const parsedMaxCount = Math.max(parsedMinCount, Math.floor(Number(maxCount) || parsedMinCount));

    if (isPlainObject(countOdds)) {
      const weightedCounts = [];
      let totalWeight = 0;

      for (const [rawCount, rawWeight] of Object.entries(countOdds)) {
        const count = Math.floor(Number(rawCount));
        const weight = Number(rawWeight);
        if (!Number.isFinite(count) || !Number.isFinite(weight) || weight <= 0) continue;
        if (count < parsedMinCount || count > parsedMaxCount) continue;
        weightedCounts.push({ count, weight });
        totalWeight += weight;
      }

      if (weightedCounts.length > 0 && totalWeight > 0) {
        let roll = Math.random() * totalWeight;
        for (const entry of weightedCounts) {
          roll -= entry.weight;
          if (roll <= 0) {
            return entry.count;
          }
        }
        return weightedCounts[weightedCounts.length - 1].count;
      }
    }

    return Math.floor(Math.random() * (parsedMaxCount - parsedMinCount + 1)) + parsedMinCount;
  }

  getBonusMysteryFeatureConfig() {
    const cfg = isPlainObject(serverConfig?.bonusMysteryFeature)
      ? serverConfig.bonusMysteryFeature
      : {};
    const mappedId = Number(serverConfig?.symbolsMapping?.bonusMysteryFeature ?? this.bonusMysteryFeatureId ?? 18);
    const symbolId = Number.isFinite(Number(cfg?.symbolId))
      ? Math.floor(Number(cfg.symbolId))
      : (Number.isFinite(mappedId) ? Math.floor(mappedId) : 18);
    const maxCollect = Math.max(1, Math.floor(Number(cfg?.maxCollect) || 3));
    const chancePerFreespin = this.normalizeProbability(cfg?.chancePerFreespin, 0);
    const chancePerNewSymbolOnFreerespin = this.normalizeProbability(cfg?.chancePerNewSymbolOnFreerespin, 0);
    const maxPerAction = Math.max(0, Math.floor(Number(cfg?.maxPerAction) || 1));

    return {
      symbolId,
      maxCollect,
      chancePerFreespin,
      chancePerNewSymbolOnFreerespin,
      maxPerAction
    };
  }

  getMergeGunFeatureConfig() {
    const cfg = isPlainObject(serverConfig?.mergeGunFeature)
      ? serverConfig.mergeGunFeature
      : {};
    const spawnChanceMultiplier = 1.5;
    const mappedId = Number(serverConfig?.symbolsMapping?.mergeGunFeature ?? this.mergeGunFeatureId ?? 19);
    const symbolId = Number.isFinite(Number(cfg?.symbolId))
      ? Math.floor(Number(cfg.symbolId))
      : (Number.isFinite(mappedId) ? Math.floor(mappedId) : 19);
    const maxCollect = Math.max(1, Math.floor(Number(cfg?.maxCollect) || 6));
    const maxPerAction = Math.max(0, Math.floor(Number(cfg?.maxPerAction) || 1));
    const chancePerFreespin = Math.min(
      1,
      this.normalizeProbability(cfg?.chancePerFreespin, 0) * spawnChanceMultiplier
    );
    const chancePerNewSymbolOnFreerespin = Math.min(
      1,
      this.normalizeProbability(cfg?.chancePerNewSymbolOnFreerespin, 0) * spawnChanceMultiplier
    );
    const shotsMin = Math.max(1, Math.floor(Number(cfg?.shotsMin) || 3));
    const shotsMax = Math.max(shotsMin, Math.floor(Number(cfg?.shotsMax) || shotsMin));
    const maxHighlightedPositions = Math.max(
      shotsMax,
      Math.floor(Number(cfg?.maxHighlightedPositions) || 18)
    );
    return {
      symbolId,
      maxCollect,
      maxPerAction,
      chancePerFreespin,
      chancePerNewSymbolOnFreerespin,
      shotsMin,
      shotsMax,
      maxHighlightedPositions,
      shotCountOdds: isPlainObject(cfg?.shotCountOdds) ? cfg.shotCountOdds : {}
    };
  }

  getLightningBeeFeatureConfig() {
    const cfg = isPlainObject(serverConfig?.lightningBeeFeature)
      ? serverConfig.lightningBeeFeature
      : {};
    const mappedId = Number(serverConfig?.symbolsMapping?.lightningBeeFeature ?? this.lightningBeeFeatureId ?? 20);
    const symbolId = Number.isFinite(Number(cfg?.symbolId))
      ? Math.floor(Number(cfg.symbolId))
      : (Number.isFinite(mappedId) ? Math.floor(mappedId) : 20);
    const maxCollect = Math.max(1, Math.floor(Number(cfg?.maxCollect) || 3));
    const maxPerAction = Math.max(0, Math.floor(Number(cfg?.maxPerAction) || 1));
    const chancePerFreespin = this.normalizeProbability(cfg?.chancePerFreespin, 0);
    const chancePerNewSymbolOnFreerespin = this.normalizeProbability(cfg?.chancePerNewSymbolOnFreerespin, 0);
    const rawLadder = Array.isArray(cfg?.multiplierLadder) && cfg.multiplierLadder.length > 0
      ? cfg.multiplierLadder
      : DEFAULT_LIGHTNING_BEE_MULTIPLIER_LADDER;
    const multiplierLadder = rawLadder
      .map((value) => Math.max(1, Math.floor(Number(value) || 1)))
      .filter((value, index, values) => index === 0 || value >= values[index - 1]);
    const resolvedLadder = multiplierLadder.length > 0 ? multiplierLadder : DEFAULT_LIGHTNING_BEE_MULTIPLIER_LADDER;
    const endUpgradeEveryMs = Math.max(500, Math.floor(Number(cfg?.endUpgradeEveryMs) || 4000));
    const endFlightDurationMinMs = Math.max(endUpgradeEveryMs, Math.floor(Number(cfg?.endFlightDurationMinMs) || 4200));
    const endFlightDurationMaxMs = Math.max(
      endFlightDurationMinMs,
      Math.floor(Number(cfg?.endFlightDurationMaxMs) || 7600)
    );
    const endLandChancePerStep = this.normalizeProbability(cfg?.endLandChancePerStep, 0.33);
    const endLandingSettleMs = Math.max(250, Math.floor(Number(cfg?.endLandingSettleMs) || 900));

    return {
      symbolId,
      maxCollect,
      maxPerAction,
      chancePerFreespin,
      chancePerNewSymbolOnFreerespin,
      multiplierLadder: resolvedLadder,
      endUpgradeEveryMs,
      endFlightDurationMinMs,
      endFlightDurationMaxMs,
      endLandChancePerStep,
      endLandingSettleMs
    };
  }

  normalizeMergeGunHighlightPositions(rawPositions = null) {
    const normalized = [];
    const seen = new Set();
    (Array.isArray(rawPositions) ? rawPositions : []).forEach((entry) => {
      const reel = Math.floor(Number(entry?.reel));
      const row = Math.floor(Number(entry?.row));
      if (!Number.isFinite(reel) || !Number.isFinite(row)) return;
      if (reel < 0 || reel >= this.width || row < 0 || row >= this.height) return;
      if (this.isHouse(reel, row)) return;

      const key = `${reel},${row}`;
      if (seen.has(key)) return;
      seen.add(key);
      normalized.push({ reel, row });
    });
    return normalized;
  }

  normalizeMergeGunFeatureAreas(rawAreas = null) {
    const cellsByKey = new Map();
    const metadataBySignature = new Map();
    const getAreaSignature = (positions = []) => positions
      .map((cell) => `${cell.reel},${cell.row}`)
      .sort((a, b) => {
        const [aReel, aRow] = a.split(",").map(Number);
        const [bReel, bRow] = b.split(",").map(Number);
        if (aRow !== bRow) return aRow - bRow;
        return aReel - bReel;
      })
      .join("|");
    (Array.isArray(rawAreas) ? rawAreas : []).forEach((area) => {
      const positions = this.normalizeMergeGunHighlightPositions(area?.positions);
      if (positions.length === 0) return;
      const signature = getAreaSignature(positions);
      metadataBySignature.set(signature, {
        baseValueTbm: Number(area?.baseValueTbm || 0),
        resultValueTbm: Number(area?.resultValueTbm ?? area?.totalTbm ?? 0),
        resultValueTwa: Number(area?.resultValueTwa ?? area?.totalTwa ?? 0)
      });
      positions.forEach((cell) => {
        cellsByKey.set(`${cell.reel},${cell.row}`, cell);
      });
    });

    const directions = [
      { reelDelta: 1, rowDelta: 0 },
      { reelDelta: -1, rowDelta: 0 },
      { reelDelta: 0, rowDelta: 1 },
      { reelDelta: 0, rowDelta: -1 }
    ];
    const visited = new Set();
    const sortedKeys = Array.from(cellsByKey.keys()).sort((a, b) => {
      const [aReel, aRow] = a.split(",").map(Number);
      const [bReel, bRow] = b.split(",").map(Number);
      if (aRow !== bRow) return aRow - bRow;
      return aReel - bReel;
    });
    const areas = [];

    sortedKeys.forEach((startKey, index) => {
      if (visited.has(startKey)) return;
      visited.add(startKey);

      const queue = [startKey];
      const positions = [];
      while (queue.length > 0) {
        const key = queue.shift();
        const current = cellsByKey.get(key);
        if (!current) continue;
        positions.push({ reel: current.reel, row: current.row });

        directions.forEach((direction) => {
          const nextKey = `${current.reel + direction.reelDelta},${current.row + direction.rowDelta}`;
          if (!cellsByKey.has(nextKey) || visited.has(nextKey)) return;
          visited.add(nextKey);
          queue.push(nextKey);
        });
      }

      positions.sort((a, b) => {
        if (a.row !== b.row) return a.row - b.row;
        return a.reel - b.reel;
      });
      const signature = positions
        ? getAreaSignature(positions)
        : "";
      const metadata = metadataBySignature.get(signature) || {
        baseValueTbm: 0,
        resultValueTbm: 0,
        resultValueTwa: 0
      };
      const areaIdBase = positions[0]
        ? `${positions[0].reel}_${positions[0].row}`
        : `${index}_0`;
      areas.push({
        id: `merge_area_${index}_${areaIdBase}`,
        positions,
        cellCount: positions.length,
        baseValueTbm: Number((Number(metadata.baseValueTbm || 0)).toFixed(4)),
        resultValueTbm: Number((Number(metadata.resultValueTbm || 0)).toFixed(4)),
        resultValueTwa: Number((Number(metadata.resultValueTwa || 0)).toFixed(4)),
        totalTbm: Number((Number(metadata.resultValueTbm || 0)).toFixed(4)),
        totalTwa: Number((Number(metadata.resultValueTwa || 0)).toFixed(4))
      });
    });

    return areas;
  }

  buildMergeGunFeatureAreasFromPositions(rawPositions = null) {
    const normalizedPositions = this.normalizeMergeGunHighlightPositions(rawPositions);
    return this.normalizeMergeGunFeatureAreas(
      normalizedPositions.map((position) => ({
        positions: [position]
      }))
    );
  }

  normalizeMergeGunFeatureState(gameState, { resetCollected = false, resetAreas = false } = {}) {
    const config = this.getMergeGunFeatureConfig();
    if (!gameState || typeof gameState !== "object") {
      return {
        collected: 0,
        max: config.maxCollect,
        highlightedPositions: [],
        persistentHighlightedPositions: [],
        areas: [],
        persistentAreas: []
      };
    }

    if (!gameState.mergeGunFeature || typeof gameState.mergeGunFeature !== "object") {
      gameState.mergeGunFeature = {};
    }

    const max = Math.max(
      1,
      Math.floor(Number(gameState.mergeGunFeature.max ?? config.maxCollect) || config.maxCollect)
    );
    const rawCollected = resetCollected
      ? 0
      : Number(gameState.mergeGunFeature.collected ?? 0);
    let collected = Math.max(0, Math.min(max, Math.floor(Number(rawCollected) || 0)));
    const persistedBonusState =
      gameState?.bonusState && typeof gameState.bonusState === "object" && gameState.bonusState.mergeGunPersistentState
        ? gameState.bonusState.mergeGunPersistentState
        : null;
    const topLevelPersistentState =
      gameState?.mergeGunPersistentState && typeof gameState.mergeGunPersistentState === "object"
        ? gameState.mergeGunPersistentState
        : null;
    const highlightedPositions = resetAreas
      ? []
      : this.normalizeMergeGunHighlightPositions([
        ...(Array.isArray(gameState.mergeGunFeature.persistentHighlightedPositions)
          ? gameState.mergeGunFeature.persistentHighlightedPositions
          : []),
        ...(Array.isArray(gameState.mergeGunFeature.highlightedPositions)
          ? gameState.mergeGunFeature.highlightedPositions
          : []),
        ...(Array.isArray(topLevelPersistentState?.highlightedPositions)
          ? topLevelPersistentState.highlightedPositions
          : []),
        ...(Array.isArray(persistedBonusState?.highlightedPositions)
          ? persistedBonusState.highlightedPositions
          : [])
      ]);
    const areas = this.normalizeMergeGunFeatureAreas(
      resetAreas
        ? []
        : [
          ...(Array.isArray(gameState.mergeGunFeature.persistentAreas) ? gameState.mergeGunFeature.persistentAreas : []),
          ...(Array.isArray(gameState.mergeGunFeature.areas) ? gameState.mergeGunFeature.areas : []),
          ...(Array.isArray(topLevelPersistentState?.areas) ? topLevelPersistentState.areas : []),
          ...(Array.isArray(persistedBonusState?.areas) ? persistedBonusState.areas : []),
          ...highlightedPositions.map((position) => ({
            positions: [position]
          }))
        ]
    );
    const flattenedAreas = this.normalizeMergeGunHighlightPositions(
      areas.flatMap((area) => Array.isArray(area?.positions) ? area.positions : [])
    );

    // Recover from older/stale states where pickup progress was kept but no
    // actual merged cells survived in state. Without this, bonus can get stuck
    // at max collected while the client receives an empty merge feature forever.
    if (!resetCollected && !resetAreas && flattenedAreas.length === 0 && areas.length === 0 && collected > 0) {
      collected = 0;
    }

    gameState.mergeGunFeature = {
      collected,
      max,
      highlightedPositions: flattenedAreas,
      persistentHighlightedPositions: flattenedAreas,
      areas,
      persistentAreas: areas
    };
    gameState.mergeGunPersistentState = {
      highlightedPositions: flattenedAreas,
      areas
    };
    if (gameState.bonusState && typeof gameState.bonusState === "object") {
      gameState.bonusState.mergeGunPersistentState = {
        highlightedPositions: flattenedAreas,
        areas
      };
    }
    if (!Array.isArray(gameState.mergeGunFeatureCollectedThisAction)) {
      gameState.mergeGunFeatureCollectedThisAction = [];
    }
    if (!Array.isArray(gameState.mergeGunActivationsThisAction)) {
      gameState.mergeGunActivationsThisAction = [];
    }
    if (!Array.isArray(gameState.mergeGunHitPositionsThisAction)) {
      gameState.mergeGunHitPositionsThisAction = [];
    }
    if (!gameState.mergeGunFeatureThisAction || typeof gameState.mergeGunFeatureThisAction !== "object") {
      gameState.mergeGunFeatureThisAction = {
        collected: [],
        activations: [],
        hitPositions: [],
        areas: []
      };
    }

    return gameState.mergeGunFeature;
  }

  normalizeMergeGunFeatureActivations(rawActivations = []) {
    return (Array.isArray(rawActivations) ? rawActivations : []).map((activation) => {
      const areas = this.normalizeMergeGunFeatureAreas(
        Array.isArray(activation?.areas) ? activation.areas : []
      );
      const rayPaths = (Array.isArray(activation?.rayPaths) ? activation.rayPaths : [])
        .map((path, index) => ({
          pathIndex: Number.isFinite(Number(path?.pathIndex))
            ? Math.floor(Number(path.pathIndex))
            : index,
          positions: this.normalizeMergeGunHighlightPositions(path?.positions)
        }))
        .filter((path) => path.positions.length > 0);
      const affectedAreaIds = Array.from(
        new Set(
          [
            ...(Array.isArray(activation?.affectedAreaIds) ? activation.affectedAreaIds : []),
            ...areas.map((area) => area.id)
          ]
            .map((entry) => (typeof entry === "string" ? entry : null))
            .filter(Boolean)
        )
      );

      return {
        sourceReel: Number.isFinite(Number(activation?.sourceReel))
          ? Math.floor(Number(activation.sourceReel))
          : null,
        sourceRow: Number.isFinite(Number(activation?.sourceRow))
          ? Math.floor(Number(activation.sourceRow))
          : null,
        pickupReel: Number.isFinite(Number(activation?.pickupReel))
          ? Math.floor(Number(activation.pickupReel))
          : null,
        pickupRow: Number.isFinite(Number(activation?.pickupRow))
          ? Math.floor(Number(activation.pickupRow))
          : null,
        pathIndex: Number.isFinite(Number(activation?.pathIndex))
          ? Math.floor(Number(activation.pathIndex))
          : null,
        firedTargets: this.normalizeMergeGunHighlightPositions(activation?.firedTargets),
        rayPaths,
        affectedAreaIds,
        areas
      };
    });
  }

  normalizeMergeGunFeatureActionState(gameState, { reset = false } = {}) {
    if (!gameState || typeof gameState !== "object") {
      return {
        collected: [],
        activations: [],
        hitPositions: [],
        areas: []
      };
    }

    const collected = reset
      ? []
      : (Array.isArray(gameState.mergeGunFeatureCollectedThisAction)
        ? gameState.mergeGunFeatureCollectedThisAction
        : []);
    const activations = reset
      ? []
      : this.normalizeMergeGunFeatureActivations(gameState.mergeGunActivationsThisAction);
    const hitPositions = reset
      ? []
      : this.normalizeMergeGunHighlightPositions(
        Array.isArray(gameState.mergeGunHitPositionsThisAction) && gameState.mergeGunHitPositionsThisAction.length > 0
          ? gameState.mergeGunHitPositionsThisAction
          : activations.flatMap((activation) => activation.firedTargets || [])
      );
    const areas = reset
      ? []
      : this.normalizeMergeGunFeatureAreas(
        Array.isArray(gameState.mergeGunFeatureThisAction?.areas) && gameState.mergeGunFeatureThisAction.areas.length > 0
          ? gameState.mergeGunFeatureThisAction.areas
          : activations.flatMap((activation) => activation.areas || [])
      );

    const normalized = {
      collected,
      activations,
      hitPositions,
      areas
    };

    gameState.mergeGunFeatureCollectedThisAction = collected;
    gameState.mergeGunActivationsThisAction = activations;
    gameState.mergeGunHitPositionsThisAction = hitPositions;
    gameState.mergeGunFeatureThisAction = normalized;

    return normalized;
  }

  recomputeMergeGunAreas(gameState) {
    const featureState = this.normalizeMergeGunFeatureState(gameState);
    const topLevelPersistentState =
      gameState?.mergeGunPersistentState && typeof gameState.mergeGunPersistentState === "object"
        ? gameState.mergeGunPersistentState
        : null;
    const persistedPositions = this.normalizeMergeGunHighlightPositions([
      ...(Array.isArray(featureState?.persistentHighlightedPositions) ? featureState.persistentHighlightedPositions : []),
      ...(Array.isArray(featureState?.highlightedPositions) ? featureState.highlightedPositions : []),
      ...(Array.isArray(topLevelPersistentState?.highlightedPositions) ? topLevelPersistentState.highlightedPositions : []),
      ...(Array.isArray(featureState?.persistentAreas)
        ? featureState.persistentAreas.flatMap((area) => area?.positions || [])
        : []),
      ...(Array.isArray(featureState?.areas)
        ? featureState.areas.flatMap((area) => area?.positions || [])
        : []),
      ...(Array.isArray(topLevelPersistentState?.areas)
        ? topLevelPersistentState.areas.flatMap((area) => area?.positions || [])
        : [])
    ]);
    featureState.areas = this.buildMergeGunFeatureAreasFromPositions(persistedPositions);
    featureState.highlightedPositions = this.normalizeMergeGunHighlightPositions(
      featureState.areas.flatMap((area) => area.positions || [])
    );
    if (gameState?.mergeGunFeature) {
      gameState.mergeGunFeature = {
        ...gameState.mergeGunFeature,
        highlightedPositions: featureState.highlightedPositions,
        persistentHighlightedPositions: featureState.highlightedPositions,
        areas: featureState.areas,
        persistentAreas: featureState.areas
      };
    }
    gameState.mergeGunPersistentState = {
      highlightedPositions: featureState.highlightedPositions,
      areas: featureState.areas
    };
    if (gameState?.bonusState && typeof gameState.bonusState === "object") {
      gameState.bonusState.mergeGunPersistentState = {
        highlightedPositions: featureState.highlightedPositions,
        areas: featureState.areas
      };
    }
    return featureState;
  }

  isMergeGunFeatureSymbol(rawSymbol) {
    const symbol = Number(rawSymbol);
    if (!Number.isFinite(symbol)) return false;
    const config = this.getMergeGunFeatureConfig();
    return Math.floor(symbol) === Math.floor(config.symbolId);
  }

  isLightningBeeFeatureSymbol(rawSymbol) {
    const symbol = Number(rawSymbol);
    if (!Number.isFinite(symbol)) return false;
    const config = this.getLightningBeeFeatureConfig();
    return Math.floor(symbol) === Math.floor(config.symbolId);
  }

  isPersistentBonusFeatureSymbol(rawSymbol) {
    return (
      this.isBonusMysteryFeatureSymbol(rawSymbol) ||
      this.isMergeGunFeatureSymbol(rawSymbol) ||
      this.isLightningBeeFeatureSymbol(rawSymbol)
    );
  }

  collectPersistentBonusFeatureSymbols(reels = null) {
    const positions = [];
    if (!reels) return positions;

    for (let reel = 0; reel < this.width; reel++) {
      for (let row = 0; row < this.height; row++) {
        const symbol = reels?.[reel]?.[row];
        if (!this.isPersistentBonusFeatureSymbol(symbol)) continue;
        positions.push({ reel, row, symbol: Number(symbol) });
      }
    }

    return positions;
  }

  restorePersistentBonusFeatureSymbols(reels = null, featurePositions = [], heroState = null) {
    if (!reels || !Array.isArray(featurePositions) || featurePositions.length === 0) {
      return [];
    }

    const heroCells = heroState?.cellKeys instanceof Set ? heroState.cellKeys : new Set();
    const restored = [];
    featurePositions.forEach((entry) => {
      const reel = Math.floor(Number(entry?.reel));
      const row = Math.floor(Number(entry?.row));
      const symbol = Number(entry?.symbol);
      if (!Number.isFinite(reel) || !Number.isFinite(row) || !Number.isFinite(symbol)) return;
      if (reel < 0 || reel >= this.width || row < 0 || row >= this.height) return;
      if (this.isHouse(reel, row)) return;
      if (heroCells.has(`${reel},${row}`)) return;
      if (!this.isPersistentBonusFeatureSymbol(symbol)) return;

      if (!Array.isArray(reels[reel])) {
        reels[reel] = [];
      }
      reels[reel][row] = symbol;
      restored.push({ reel, row, symbol });
    });

    return restored;
  }

  canPlaceMergeGunFeature(reels, reel, row, heroState = null) {
    if (!reels) return false;
    if (!Number.isFinite(reel) || !Number.isFinite(row)) return false;
    if (reel < 0 || reel >= this.width || row < 0 || row >= this.height) return false;
    if (this.isHouse(reel, row)) return false;
    if (heroState?.cellKeys instanceof Set && heroState.cellKeys.has(`${reel},${row}`)) return false;

    const currentSymbol = reels?.[reel]?.[row];
    const currentNumber = Number(currentSymbol);
    if (!Number.isFinite(currentNumber) || currentNumber <= 0) return false;
    if (currentNumber === this.heroId) return false;
    if (this.isDemon(currentNumber)) return false;
    if (currentNumber === this.timeId) return false;
    if (currentNumber === Number(serverConfig?.symbolsMapping?.time_depleted ?? 17)) return false;
    if (currentNumber === this.mysteryId || currentNumber === this.mysteryWildId) return false;
    if (this.isBonusMysteryFeatureSymbol(currentNumber)) return false;
    if (this.isMergeGunFeatureSymbol(currentNumber)) return false;
    if (this.isLightningBeeFeatureSymbol(currentNumber)) return false;

    const payoutSymbols = Array.isArray(serverConfig?.payoutSymbols) ? serverConfig.payoutSymbols : [];
    if (payoutSymbols.length > 0) {
      const payoutSet = new Set(
        payoutSymbols
          .map((rawSymbol) => Number(rawSymbol))
          .filter((symbolId) => Number.isFinite(symbolId))
      );
      if (!payoutSet.has(currentNumber)) {
        return false;
      }
    }

    return true;
  }

  countMergeGunFeatureSymbolsOnBoard(reels) {
    if (!reels) return 0;

    let total = 0;
    for (let reel = 0; reel < this.width; reel++) {
      for (let row = 0; row < this.height; row++) {
        if (this.isMergeGunFeatureSymbol(reels?.[reel]?.[row])) {
          total += 1;
        }
      }
    }

    return total;
  }

  clearCompletedMergeGunFeatureSymbols(gameState, reels = null) {
    if (!gameState || !reels) return [];

    const config = this.getMergeGunFeatureConfig();
    const featureState = gameState.mergeGunFeature && typeof gameState.mergeGunFeature === "object"
      ? gameState.mergeGunFeature
      : {};
    const max = Math.max(1, Math.floor(Number(featureState?.max ?? config.maxCollect) || config.maxCollect));
    const collected = Math.max(0, Math.floor(Number(featureState?.collected || 0) || 0));
    if (collected < max) return [];

    const cleared = [];
    const weights = this.serverConfig?.symbolWeightsMain || serverConfig.symbolWeightsMain || {};
    for (let reel = 0; reel < this.width; reel++) {
      for (let row = 0; row < this.height; row++) {
        if (!this.isMergeGunFeatureSymbol(reels?.[reel]?.[row])) continue;

        let replacement = this.getRandomSymbol(weights, false, 0, 0);
        if (
          !Number.isFinite(Number(replacement)) ||
          this.isMergeGunFeatureSymbol(replacement) ||
          this.isBonusMysteryFeatureSymbol(replacement) ||
          Number(replacement) === this.timeId
        ) {
          replacement = 1;
        }
        reels[reel][row] = Number(replacement);
        cleared.push({ reel, row, symbol: Number(replacement) });
      }
    }

    return cleared;
  }

  injectMergeGunFeatureSymbols(
    gameState,
    reels,
    {
      candidatePositions = null,
      chancePerAction = null,
      chancePerPosition = 0,
      maxPerAction = 1,
      heroState = null
    } = {}
  ) {
    if (!gameState || !reels) return [];
    if (gameState.isBonus !== true) return [];

    const featureState = this.normalizeMergeGunFeatureState(gameState);
    const config = this.getMergeGunFeatureConfig();
    const remainingCapacity = Math.max(0, Number(featureState.max || 0) - Number(featureState.collected || 0));
    if (remainingCapacity <= 0) {
      this.clearCompletedMergeGunFeatureSymbols(gameState, reels);
      return [];
    }

    const visibleGunsOnBoard = this.countMergeGunFeatureSymbolsOnBoard(reels);
    const remainingSpawnCapacity = Math.max(0, remainingCapacity - visibleGunsOnBoard);
    if (remainingSpawnCapacity <= 0) return [];

    const cappedMaxPerAction = Math.max(0, Math.floor(Number(maxPerAction) || 0));
    const placementCap = Math.min(cappedMaxPerAction, remainingSpawnCapacity);
    if (placementCap <= 0) return [];

    const actionChance = chancePerAction === null ? null : this.normalizeProbability(chancePerAction, 0);
    if (actionChance !== null && Math.random() >= actionChance) {
      return [];
    }

    const perPositionChance = this.normalizeProbability(chancePerPosition, actionChance !== null ? 1 : 0);
    if (perPositionChance <= 0) return [];

    let candidates = [];
    if (Array.isArray(candidatePositions) && candidatePositions.length > 0) {
      candidates = candidatePositions
        .map((entry) => ({
          reel: Math.floor(Number(entry?.reel)),
          row: Math.floor(Number(entry?.row))
        }))
        .filter(
          (entry) =>
            Number.isFinite(entry.reel) &&
            Number.isFinite(entry.row) &&
            entry.reel >= 0 &&
            entry.reel < this.width &&
            entry.row >= 0 &&
            entry.row < this.height
        );
    } else {
      for (let reel = 0; reel < this.width; reel++) {
        for (let row = 0; row < this.height; row++) {
          candidates.push({ reel, row });
        }
      }
    }

    for (let index = candidates.length - 1; index > 0; index--) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [candidates[index], candidates[swapIndex]] = [candidates[swapIndex], candidates[index]];
    }

    const placed = [];
    for (const candidate of candidates) {
      if (placed.length >= placementCap) break;
      if (!this.canPlaceMergeGunFeature(reels, candidate.reel, candidate.row, heroState)) continue;
      if (Math.random() >= perPositionChance) continue;
      reels[candidate.reel][candidate.row] = config.symbolId;
      placed.push({
        reel: candidate.reel,
        row: candidate.row,
        symbol: config.symbolId
      });
    }

    return placed;
  }

  collectMergeGunFeaturePositions(gameState, reels, rawPositions = [], defaultReason = "mergeGunFeature") {
    if (!gameState || !reels || !Array.isArray(rawPositions) || rawPositions.length === 0) {
      return [];
    }

    const config = this.getMergeGunFeatureConfig();
    const featureState = this.normalizeMergeGunFeatureState(gameState);
    const existing = Array.isArray(gameState.mergeGunFeatureCollectedThisAction)
      ? gameState.mergeGunFeatureCollectedThisAction
      : [];
    const seenKeys = new Set(
      existing
        .map((entry) => {
          const reel = Math.floor(Number(entry?.reel));
          const row = Math.floor(Number(entry?.row));
          if (!Number.isFinite(reel) || !Number.isFinite(row)) return null;
          return `${reel},${row}`;
        })
        .filter(Boolean)
    );

    let collected = Math.max(0, Math.floor(Number(featureState.collected) || 0));
    const max = Math.max(1, Math.floor(Number(featureState.max) || config.maxCollect));
    const collectedNow = [];

    rawPositions.forEach((entry) => {
      const reel = Math.floor(Number(entry?.reel));
      const row = Math.floor(Number(entry?.row));
      if (!Number.isFinite(reel) || !Number.isFinite(row)) return;
      if (reel < 0 || reel >= this.width || row < 0 || row >= this.height) return;
      if (this.isHouse(reel, row)) return;

      const key = `${reel},${row}`;
      if (seenKeys.has(key)) return;

      const forceCollect = entry?.forceCollect === true;
      const boardSymbol = reels?.[reel]?.[row];
      const hasFeatureOnBoard = this.isMergeGunFeatureSymbol(boardSymbol);
      if (!hasFeatureOnBoard && !forceCollect) return;

      if (hasFeatureOnBoard) {
        reels[reel][row] = 0;
      }

      const applied = collected < max;
      if (applied) {
        collected += 1;
      }

      const reason = typeof entry?.reason === "string" && entry.reason
        ? entry.reason
        : defaultReason;
      const payload = {
        reel,
        row,
        symbol: config.symbolId,
        reason,
        applied,
        pathIndex: Number.isFinite(Number(entry?.pathIndex)) ? Math.floor(Number(entry.pathIndex)) : null,
        sourceReel: Number.isFinite(Number(entry?.sourceReel)) ? Math.floor(Number(entry.sourceReel)) : null,
        sourceRow: Number.isFinite(Number(entry?.sourceRow)) ? Math.floor(Number(entry.sourceRow)) : null
      };
      collectedNow.push(payload);
      existing.push(payload);
      seenKeys.add(key);
    });

    gameState.mergeGunFeature = {
      ...featureState,
      collected: Math.max(0, Math.min(max, collected)),
      max
    };
    this.clearCompletedMergeGunFeatureSymbols(gameState, reels);
    gameState.mergeGunFeatureCollectedThisAction = existing;
    this.normalizeMergeGunFeatureActionState(gameState);

    return collectedNow;
  }

  collectMergeGunFeaturesFromHeroPath(gameState, reels, heroPath = []) {
    if (!Array.isArray(heroPath) || heroPath.length === 0) return [];

    const candidates = [];
    const orthogonalDirections = [
      { reelDelta: 1, rowDelta: 0 },
      { reelDelta: -1, rowDelta: 0 },
      { reelDelta: 0, rowDelta: 1 },
      { reelDelta: 0, rowDelta: -1 }
    ];
    const addCandidatesFromCells = (cells = [], step = null, pathIndex = 0, { includeAdjacent = true } = {}) => {
      cells.forEach((cell) => {
        const reel = Math.floor(Number(cell?.reel));
        const row = Math.floor(Number(cell?.row));
        if (!Number.isFinite(reel) || !Number.isFinite(row)) return;
        if (reel < 0 || reel >= this.width || row < 0 || row >= this.height) return;

        if (this.isMergeGunFeatureSymbol(cell?.wasSymbol)) {
          candidates.push({
            reel,
            row,
            reason: "heroRunOver",
            forceCollect: true,
            pathIndex,
            sourceReel: Math.floor(Number(step?.reel)),
            sourceRow: Math.floor(Number(step?.row))
          });
        }

        if (includeAdjacent !== true) return;
        orthogonalDirections.forEach((direction) => {
          const adjacentReel = reel + direction.reelDelta;
          const adjacentRow = row + direction.rowDelta;
          if (adjacentReel < 0 || adjacentReel >= this.width || adjacentRow < 0 || adjacentRow >= this.height) return;
          if (this.isMergeGunFeatureSymbol(reels?.[adjacentReel]?.[adjacentRow])) {
            candidates.push({
              reel: adjacentReel,
              row: adjacentRow,
              reason: "heroAdjacent",
              pathIndex,
              sourceReel: Math.floor(Number(step?.reel)),
              sourceRow: Math.floor(Number(step?.row))
            });
          }
        });
      });
    };

    heroPath.forEach((step, pathIndex) => {
      const footprintCells = Array.isArray(step?.footprintCells) ? step.footprintCells : [];
      const growthConsumedCells = Array.isArray(step?.growthConsumedCells) ? step.growthConsumedCells : [];
      if (step?.rushActive === true || step?.banana === true) {
        addCandidatesFromCells(footprintCells, step, pathIndex, { includeAdjacent: true });
      }
      addCandidatesFromCells(growthConsumedCells, step, pathIndex, { includeAdjacent: false });
    });

    return this.collectMergeGunFeaturePositions(gameState, reels, candidates, "heroMergeGun");
  }

  collectMergeGunFeaturesNearHero(gameState, reels, heroAnchor = null, heroFootprintSize = 1) {
    const heroState = this.buildHeroFootprintState(
      heroAnchor || gameState?.heroPosition || null,
      heroFootprintSize || gameState?.heroFootprintSize || 1
    );
    if (!reels || !Array.isArray(heroState.cells) || heroState.cells.length === 0) {
      return [];
    }

    const candidates = [];
    const seen = new Set();
    const orthogonalDirections = [
      { reelDelta: 1, rowDelta: 0 },
      { reelDelta: -1, rowDelta: 0 },
      { reelDelta: 0, rowDelta: 1 },
      { reelDelta: 0, rowDelta: -1 }
    ];
    const addCandidate = (reel, row, sourceCell, reason = "heroAdjacentDrop", forceCollect = false) => {
      if (reel < 0 || reel >= this.width || row < 0 || row >= this.height) return;
      const key = `${reel},${row}`;
      if (seen.has(key)) return;
      if (!this.isMergeGunFeatureSymbol(reels?.[reel]?.[row])) return;
      seen.add(key);
      candidates.push({
        reel,
        row,
        reason,
        forceCollect,
        sourceReel: Math.floor(Number(sourceCell?.reel)),
        sourceRow: Math.floor(Number(sourceCell?.row))
      });
    };

    heroState.cells.forEach((cell) => {
      const reel = Math.floor(Number(cell?.reel));
      const row = Math.floor(Number(cell?.row));
      if (!Number.isFinite(reel) || !Number.isFinite(row)) return;
      addCandidate(reel, row, cell, "heroOverlapDrop", true);
      orthogonalDirections.forEach((direction) => {
        addCandidate(reel + direction.reelDelta, row + direction.rowDelta, cell, "heroAdjacentDrop", false);
      });
    });

    return this.collectMergeGunFeaturePositions(gameState, reels, candidates, "heroAdjacentDrop");
  }

  resolveMergeGunShotTargets(gameState, heroState = null) {
    const featureState = this.normalizeMergeGunFeatureState(gameState);
    const config = this.getMergeGunFeatureConfig();
    const actionState = this.normalizeMergeGunFeatureActionState(gameState);
    const existingKeys = new Set(
      this.normalizeMergeGunHighlightPositions([
        ...(Array.isArray(featureState?.persistentHighlightedPositions) ? featureState.persistentHighlightedPositions : []),
        ...(Array.isArray(featureState?.highlightedPositions) ? featureState.highlightedPositions : []),
        ...(Array.isArray(actionState?.hitPositions) ? actionState.hitPositions : []),
        ...(Array.isArray(actionState?.areas)
          ? actionState.areas.flatMap((area) => area?.positions || [])
          : [])
      ])
        .map((entry) => `${entry.reel},${entry.row}`)
    );
    const blockedKeys = new Set(existingKeys);
    if (heroState?.cellKeys instanceof Set) {
      heroState.cellKeys.forEach((key) => blockedKeys.add(key));
    }

    const remainingCapacity = Math.max(0, config.maxHighlightedPositions - existingKeys.size);
    if (remainingCapacity <= 0) return [];

    const desiredCount = this.rollConfiguredCount(
      config.shotsMin,
      config.shotsMax,
      config.shotCountOdds
    );
    const targetCount = Math.max(0, Math.min(remainingCapacity, desiredCount));
    if (targetCount <= 0) {
      return {
        targets: [],
        rayPaths: []
      };
    }
    const directions = [
      { reelDelta: 1, rowDelta: 0 },
      { reelDelta: -1, rowDelta: 0 },
      { reelDelta: 0, rowDelta: 1 },
      { reelDelta: 0, rowDelta: -1 }
    ];
    const shuffleInPlace = (items = []) => {
      for (let index = items.length - 1; index > 0; index--) {
        const swapIndex = Math.floor(Math.random() * (index + 1));
        [items[index], items[swapIndex]] = [items[swapIndex], items[index]];
      }
      return items;
    };
    const isFreeCell = (reel, row, localBlockedKeys) => {
      if (reel < 0 || reel >= this.width || row < 0 || row >= this.height) return false;
      if (this.isHouse(reel, row)) return false;
      return !localBlockedKeys.has(`${reel},${row}`);
    };
    const collectAvailableStarts = (localBlockedKeys) => {
      const starts = [];
      for (let reel = 0; reel < this.width; reel++) {
        for (let row = 0; row < this.height; row++) {
          if (!isFreeCell(reel, row, localBlockedKeys)) continue;
          starts.push({ reel, row });
        }
      }
      return starts;
    };
    const buildRayFromStart = (start, remainingShots, localBlockedKeys) => {
      const path = [{ reel: start.reel, row: start.row }];
      localBlockedKeys.add(`${start.reel},${start.row}`);
      if (remainingShots <= 1) {
        return path;
      }
      let current = start;
      while (path.length < remainingShots) {
        const adjacentOptions = shuffleInPlace(
          directions
            .map((direction) => ({
              reel: current.reel + direction.reelDelta,
              row: current.row + direction.rowDelta
            }))
            .filter((position) => isFreeCell(position.reel, position.row, localBlockedKeys))
        );
        if (adjacentOptions.length === 0) {
          break;
        }

        const scoredOptions = adjacentOptions.map((position) => {
          const onwardCount = directions.reduce((sum, direction) => {
            const nextReel = position.reel + direction.reelDelta;
            const nextRow = position.row + direction.rowDelta;
            return sum + (isFreeCell(nextReel, nextRow, localBlockedKeys) ? 1 : 0);
          }, 0);
          return {
            position,
            onwardCount
          };
        });
        const maxOnwardCount = Math.max(...scoredOptions.map((option) => option.onwardCount));
        const bestOptions = scoredOptions.filter((option) => option.onwardCount === maxOnwardCount);
        const chosenOption = bestOptions[Math.floor(Math.random() * bestOptions.length)];
        localBlockedKeys.add(`${chosenOption.position.reel},${chosenOption.position.row}`);
        path.push(chosenOption.position);
        current = chosenOption.position;
      }

      return path;
    };

    const localBlockedKeys = new Set(blockedKeys);
    const firedTargets = [];
    const rayPaths = [];

    while (firedTargets.length < targetCount) {
      const availableStarts = shuffleInPlace(collectAvailableStarts(localBlockedKeys));
      if (availableStarts.length === 0) break;

      const start = availableStarts[0];
      const remainingShots = targetCount - firedTargets.length;
      const rayPath = buildRayFromStart(start, remainingShots, localBlockedKeys);
      if (rayPath.length === 0) break;

      rayPaths.push({
        pathIndex: rayPaths.length,
        positions: rayPath
      });
      firedTargets.push(...rayPath);
    }

    return {
      targets: firedTargets,
      rayPaths
    };
  }

  triggerMergeGunActivations(gameState, collectedEntries = [], heroAnchor = null, heroFootprintSize = 1) {
    if (!gameState || !Array.isArray(collectedEntries) || collectedEntries.length === 0) {
      return [];
    }

    const existingActivations = this.normalizeMergeGunFeatureActivations(gameState.mergeGunActivationsThisAction);
    const existingActivationKeys = new Set(
      existingActivations.map((activation) => {
        const reel = Number.isFinite(Number(activation?.pickupReel)) ? Math.floor(Number(activation.pickupReel)) : null;
        const row = Number.isFinite(Number(activation?.pickupRow)) ? Math.floor(Number(activation.pickupRow)) : null;
        const pathIndex = Number.isFinite(Number(activation?.pathIndex)) ? Math.floor(Number(activation.pathIndex)) : null;
        return `${reel},${row},${pathIndex}`;
      })
    );
    const outputs = [];
    const featureState = this.normalizeMergeGunFeatureState(gameState);
    const heroState = this.buildHeroFootprintState(heroAnchor, heroFootprintSize);

    const orderedEntries = [...collectedEntries].sort((left, right) => {
      const leftPathIndex = Number.isFinite(Number(left?.pathIndex)) ? Math.floor(Number(left.pathIndex)) : Number.MAX_SAFE_INTEGER;
      const rightPathIndex = Number.isFinite(Number(right?.pathIndex)) ? Math.floor(Number(right.pathIndex)) : Number.MAX_SAFE_INTEGER;
      if (leftPathIndex !== rightPathIndex) {
        return leftPathIndex - rightPathIndex;
      }
      const leftReasonWeight = left?.reason === "heroRunOver" ? 0 : 1;
      const rightReasonWeight = right?.reason === "heroRunOver" ? 0 : 1;
      if (leftReasonWeight !== rightReasonWeight) {
        return leftReasonWeight - rightReasonWeight;
      }
      const leftRow = Number.isFinite(Number(left?.row)) ? Math.floor(Number(left.row)) : 0;
      const rightRow = Number.isFinite(Number(right?.row)) ? Math.floor(Number(right.row)) : 0;
      if (leftRow !== rightRow) {
        return leftRow - rightRow;
      }
      const leftReel = Number.isFinite(Number(left?.reel)) ? Math.floor(Number(left.reel)) : 0;
      const rightReel = Number.isFinite(Number(right?.reel)) ? Math.floor(Number(right.reel)) : 0;
      return leftReel - rightReel;
    });

    orderedEntries.forEach((entry) => {
      if (entry?.applied !== true) return;
      const activationKey = [
        Number.isFinite(Number(entry?.reel)) ? Math.floor(Number(entry.reel)) : null,
        Number.isFinite(Number(entry?.row)) ? Math.floor(Number(entry.row)) : null,
        Number.isFinite(Number(entry?.pathIndex)) ? Math.floor(Number(entry.pathIndex)) : null
      ].join(",");
      if (existingActivationKeys.has(activationKey)) return;
      const shotPlan = this.resolveMergeGunShotTargets(gameState, heroState);
      const shotTargets = Array.isArray(shotPlan?.targets)
        ? shotPlan.targets
        : (Array.isArray(shotPlan) ? shotPlan : []);
      const rayPaths = Array.isArray(shotPlan?.rayPaths)
        ? shotPlan.rayPaths
        : [];
      if (shotTargets.length === 0) return;

      const mergedPersistentPositions = this.normalizeMergeGunHighlightPositions([
        ...this.normalizeMergeGunHighlightPositions(featureState.persistentHighlightedPositions),
        ...this.normalizeMergeGunHighlightPositions(featureState.highlightedPositions),
        ...shotTargets
      ]);
      featureState.highlightedPositions = mergedPersistentPositions;
      featureState.persistentHighlightedPositions = mergedPersistentPositions;
      if (gameState?.mergeGunFeature) {
        gameState.mergeGunFeature.highlightedPositions = mergedPersistentPositions;
        gameState.mergeGunFeature.persistentHighlightedPositions = mergedPersistentPositions;
      }
      gameState.mergeGunPersistentState = {
        highlightedPositions: mergedPersistentPositions,
        areas: Array.isArray(gameState?.mergeGunPersistentState?.areas)
          ? gameState.mergeGunPersistentState.areas
          : []
      };
      if (gameState?.bonusState && typeof gameState.bonusState === "object") {
        gameState.bonusState.mergeGunPersistentState = {
          highlightedPositions: mergedPersistentPositions,
          areas: Array.isArray(gameState?.bonusState?.mergeGunPersistentState?.areas)
            ? gameState.bonusState.mergeGunPersistentState.areas
            : []
        };
      }
      this.recomputeMergeGunAreas(gameState);
      const updatedFeatureState = this.normalizeMergeGunFeatureState(gameState);
      const touchedAreaIds = new Set();
      updatedFeatureState.areas.forEach((area) => {
        const hasTouchedTarget = area.positions.some((cell) =>
          shotTargets.some((target) => target.reel === cell.reel && target.row === cell.row)
        );
        if (hasTouchedTarget) {
          touchedAreaIds.add(area.id);
        }
      });

      const activation = {
        sourceReel: Number(entry?.sourceReel ?? entry?.reel),
        sourceRow: Number(entry?.sourceRow ?? entry?.row),
        pickupReel: Number(entry?.reel),
        pickupRow: Number(entry?.row),
        pathIndex: Number.isFinite(Number(entry?.pathIndex)) ? Math.floor(Number(entry.pathIndex)) : null,
        firedTargets: shotTargets.map((target) => ({ reel: target.reel, row: target.row })),
        rayPaths: rayPaths.map((path, index) => ({
          pathIndex: Number.isFinite(Number(path?.pathIndex))
            ? Math.floor(Number(path.pathIndex))
            : index,
          positions: this.normalizeMergeGunHighlightPositions(path?.positions)
        })),
        affectedAreaIds: Array.from(touchedAreaIds),
        areas: updatedFeatureState.areas
          .filter((area) => touchedAreaIds.has(area.id))
          .map((area) => ({
            id: area.id,
            positions: area.positions.map((cell) => ({ reel: cell.reel, row: cell.row })),
            cellCount: Number(area.cellCount || area.positions.length || 0)
          }))
      };
      outputs.push(activation);
      existingActivationKeys.add(activationKey);
    });

    gameState.mergeGunActivationsThisAction = [...existingActivations, ...outputs];
    this.normalizeMergeGunFeatureActionState(gameState);
    return outputs;
  }

  buildMergeGunAreaLookup(rawAreas = []) {
    const lookup = new Map();
    this.normalizeMergeGunFeatureAreas(rawAreas).forEach((area) => {
      area.positions.forEach((position) => {
        lookup.set(`${position.reel},${position.row}`, area);
      });
    });
    return lookup;
  }

  buildBonusEndMergedAreaEntry(area = null, positionStates = null, betSize = 0) {
    const positions = this.normalizeMergeGunHighlightPositions(area?.positions);
    const totals = positions.reduce((acc, position) => {
      const key = `${position.reel},${position.row}`;
      const state = positionStates instanceof Map ? positionStates.get(key) : null;
      acc.baseValueTbm += Number(state?.baseValueTbm || 0);
      acc.resultValueTbm += Number(state?.resultValueTbm || 0);
      acc.resultValueTwa += Number(state?.resultValueTwa || 0);
      return acc;
    }, {
      baseValueTbm: 0,
      resultValueTbm: 0,
      resultValueTwa: 0
    });

    return {
      id: String(area?.id || "merge_area"),
      positions,
      cellCount: positions.length,
      baseValueTbm: Number(totals.baseValueTbm.toFixed(4)),
      resultValueTbm: Number(totals.resultValueTbm.toFixed(4)),
      resultValueTwa: Number(
        (
          Number(totals.resultValueTwa || 0) ||
          (Number(totals.resultValueTbm || 0) * Number(betSize || 0))
        ).toFixed(4)
      ),
      totalTbm: Number(totals.resultValueTbm.toFixed(4)),
      totalTwa: Number(
        (
          Number(totals.resultValueTwa || 0) ||
          (Number(totals.resultValueTbm || 0) * Number(betSize || 0))
        ).toFixed(4)
      )
    };
  }

  syncMergeGunFeatureAreaTotals(gameState, positionStates = null, betSize = 0) {
    const featureState = this.normalizeMergeGunFeatureState(gameState);
    const enrichedAreas = this.normalizeMergeGunFeatureAreas(
      featureState.areas.map((area) => (
        positionStates instanceof Map
          ? this.buildBonusEndMergedAreaEntry(area, positionStates, betSize)
          : {
            id: area.id,
            positions: area.positions,
            cellCount: area.cellCount,
            baseValueTbm: Number(area?.baseValueTbm || 0),
            resultValueTbm: Number(area?.resultValueTbm || area?.totalTbm || 0),
            resultValueTwa: Number(area?.resultValueTwa || area?.totalTwa || 0),
            totalTbm: Number(area?.totalTbm || area?.resultValueTbm || 0),
            totalTwa: Number(area?.totalTwa || area?.resultValueTwa || 0)
          }
      ))
    );

    if (gameState?.mergeGunFeature) {
      gameState.mergeGunFeature = {
        ...gameState.mergeGunFeature,
        highlightedPositions: this.normalizeMergeGunHighlightPositions(
          enrichedAreas.flatMap((area) => area.positions || [])
        ),
        persistentHighlightedPositions: this.normalizeMergeGunHighlightPositions(
          enrichedAreas.flatMap((area) => area.positions || [])
        ),
        areas: enrichedAreas,
        persistentAreas: enrichedAreas
      };
    }

    gameState.mergeGunPersistentState = {
      highlightedPositions: this.normalizeMergeGunHighlightPositions(
        enrichedAreas.flatMap((area) => area.positions || [])
      ),
      areas: enrichedAreas
    };
    if (gameState?.bonusState && typeof gameState.bonusState === "object") {
      gameState.bonusState.mergeGunPersistentState = {
        highlightedPositions: this.normalizeMergeGunHighlightPositions(
          enrichedAreas.flatMap((area) => area.positions || [])
        ),
        areas: enrichedAreas
      };
    }

    if (gameState?.mergeGunFeatureThisAction && typeof gameState.mergeGunFeatureThisAction === "object") {
      gameState.mergeGunFeatureThisAction = {
        ...gameState.mergeGunFeatureThisAction,
        areas: this.normalizeMergeGunFeatureAreas(gameState.mergeGunFeatureThisAction.areas || [])
      };
    }

    return enrichedAreas;
  }

  normalizeBonusMysteryFeatureState(gameState, { resetCollected = false } = {}) {
    const config = this.getBonusMysteryFeatureConfig();
    if (!gameState || typeof gameState !== "object") {
      return {
        collected: 0,
        max: config.maxCollect
      };
    }

    if (!gameState.bonusMysteryFeature || typeof gameState.bonusMysteryFeature !== "object") {
      gameState.bonusMysteryFeature = {};
    }

    const max = Math.max(
      1,
      Math.floor(Number(gameState.bonusMysteryFeature.max ?? config.maxCollect) || config.maxCollect)
    );
    const rawCollected = resetCollected
      ? 0
      : Number(gameState.bonusMysteryFeature.collected ?? 0);
    const collected = Math.max(0, Math.min(max, Math.floor(Number(rawCollected) || 0)));

    gameState.bonusMysteryFeature = {
      collected,
      max
    };
    if (!Array.isArray(gameState.bonusMysteryFeatureCollectedThisAction)) {
      gameState.bonusMysteryFeatureCollectedThisAction = [];
    }

    return gameState.bonusMysteryFeature;
  }

  isBonusMysteryFeatureSymbol(rawSymbol) {
    const symbol = Number(rawSymbol);
    if (!Number.isFinite(symbol)) return false;
    const config = this.getBonusMysteryFeatureConfig();
    return Math.floor(symbol) === Math.floor(config.symbolId);
  }

  canPlaceBonusMysteryFeature(reels, reel, row, heroState = null) {
    if (!reels) return false;
    if (!Number.isFinite(reel) || !Number.isFinite(row)) return false;
    if (reel < 0 || reel >= this.width || row < 0 || row >= this.height) return false;
    if (this.isHouse(reel, row)) return false;
    if (heroState?.cellKeys instanceof Set && heroState.cellKeys.has(`${reel},${row}`)) return false;

    const currentSymbol = reels?.[reel]?.[row];
    const currentNumber = Number(currentSymbol);
    if (!Number.isFinite(currentNumber) || currentNumber <= 0) return false;
    if (currentNumber === this.heroId) return false;
    if (this.isDemon(currentNumber)) return false;
    if (currentNumber === this.timeId) return false;
    if (currentNumber === Number(serverConfig?.symbolsMapping?.time_depleted ?? 17)) return false;
    if (currentNumber === this.mysteryId || currentNumber === this.mysteryWildId) return false;
    if (this.isBonusMysteryFeatureSymbol(currentNumber)) return false;
    if (this.isMergeGunFeatureSymbol(currentNumber)) return false;
    if (this.isLightningBeeFeatureSymbol(currentNumber)) return false;

    const payoutSymbols = Array.isArray(serverConfig?.payoutSymbols) ? serverConfig.payoutSymbols : [];
    if (payoutSymbols.length > 0) {
      const payoutSet = new Set(
        payoutSymbols
          .map((rawSymbol) => Number(rawSymbol))
          .filter((symbolId) => Number.isFinite(symbolId))
      );
      if (!payoutSet.has(currentNumber)) {
        return false;
      }
    }

    return true;
  }

  countBonusMysteryFeatureSymbolsOnBoard(reels) {
    if (!reels) return 0;

    let total = 0;
    for (let reel = 0; reel < this.width; reel++) {
      for (let row = 0; row < this.height; row++) {
        if (this.isBonusMysteryFeatureSymbol(reels?.[reel]?.[row])) {
          total += 1;
        }
      }
    }

    return total;
  }

  injectBonusMysteryFeatureSymbols(
    gameState,
    reels,
    {
      candidatePositions = null,
      chancePerAction = null,
      chancePerPosition = 0,
      maxPerAction = 1,
      heroState = null
    } = {}
  ) {
    if (!gameState || !reels) return [];

    const featureState = this.normalizeBonusMysteryFeatureState(gameState);
    const config = this.getBonusMysteryFeatureConfig();
    const remainingCapacity = Math.max(0, Number(featureState.max || 0) - Number(featureState.collected || 0));
    if (remainingCapacity <= 0) return [];

    const cappedMaxPerAction = Math.max(0, Math.floor(Number(maxPerAction) || 0));
    const visibleBalloonsOnBoard = this.countBonusMysteryFeatureSymbolsOnBoard(reels);
    const remainingSpawnCapacity = Math.max(0, remainingCapacity - visibleBalloonsOnBoard);
    if (remainingSpawnCapacity <= 0) return [];

    const placementCap = Math.min(cappedMaxPerAction, remainingSpawnCapacity);
    if (placementCap <= 0) return [];

    const actionChance = chancePerAction === null ? null : this.normalizeProbability(chancePerAction, 0);
    if (actionChance !== null && Math.random() >= actionChance) {
      return [];
    }

    const perPositionChance = this.normalizeProbability(chancePerPosition, actionChance !== null ? 1 : 0);
    if (perPositionChance <= 0) return [];

    let candidates = [];
    if (Array.isArray(candidatePositions) && candidatePositions.length > 0) {
      candidates = candidatePositions
        .map((entry) => ({
          reel: Math.floor(Number(entry?.reel)),
          row: Math.floor(Number(entry?.row))
        }))
        .filter(
          (entry) =>
            Number.isFinite(entry.reel) &&
            Number.isFinite(entry.row) &&
            entry.reel >= 0 &&
            entry.reel < this.width &&
            entry.row >= 0 &&
            entry.row < this.height
        );
    } else {
      for (let reel = 0; reel < this.width; reel++) {
        for (let row = 0; row < this.height; row++) {
          candidates.push({ reel, row });
        }
      }
    }

    for (let index = candidates.length - 1; index > 0; index--) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [candidates[index], candidates[swapIndex]] = [candidates[swapIndex], candidates[index]];
    }

    const placed = [];
    for (const candidate of candidates) {
      if (placed.length >= placementCap) break;
      if (!this.canPlaceBonusMysteryFeature(reels, candidate.reel, candidate.row, heroState)) continue;
      if (Math.random() >= perPositionChance) continue;
      reels[candidate.reel][candidate.row] = config.symbolId;
      placed.push({
        reel: candidate.reel,
        row: candidate.row,
        symbol: config.symbolId
      });
    }

    return placed;
  }

  collectBonusMysteryFeaturePositions(gameState, reels, rawPositions = [], defaultReason = "bonusMysteryFeature") {
    if (!gameState || !reels || !Array.isArray(rawPositions) || rawPositions.length === 0) {
      return [];
    }

    const config = this.getBonusMysteryFeatureConfig();
    const featureState = this.normalizeBonusMysteryFeatureState(gameState);
    const existing = Array.isArray(gameState.bonusMysteryFeatureCollectedThisAction)
      ? gameState.bonusMysteryFeatureCollectedThisAction
      : [];
    const seenKeys = new Set(
      existing
        .map((entry) => {
          const reel = Math.floor(Number(entry?.reel));
          const row = Math.floor(Number(entry?.row));
          if (!Number.isFinite(reel) || !Number.isFinite(row)) return null;
          return `${reel},${row}`;
        })
        .filter(Boolean)
    );

    let collected = Math.max(0, Math.floor(Number(featureState.collected) || 0));
    const max = Math.max(1, Math.floor(Number(featureState.max) || config.maxCollect));
    const collectedNow = [];

    rawPositions.forEach((entry) => {
      const reel = Math.floor(Number(entry?.reel));
      const row = Math.floor(Number(entry?.row));
      if (!Number.isFinite(reel) || !Number.isFinite(row)) return;
      if (reel < 0 || reel >= this.width || row < 0 || row >= this.height) return;
      if (this.isHouse(reel, row)) return;

      const key = `${reel},${row}`;
      if (seenKeys.has(key)) return;

      const forceCollect = entry?.forceCollect === true;
      const boardSymbol = reels?.[reel]?.[row];
      const hasMysteryOnBoard = this.isBonusMysteryFeatureSymbol(boardSymbol);
      if (!hasMysteryOnBoard && !forceCollect) return;

      if (hasMysteryOnBoard) {
        reels[reel][row] = 0;
      }

      const applied = collected < max;
      if (applied) {
        collected += 1;
      }

      const reason = typeof entry?.reason === "string" && entry.reason
        ? entry.reason
        : defaultReason;
      const payload = {
        reel,
        row,
        symbol: config.symbolId,
        reason,
        applied,
        pathIndex: Number.isFinite(Number(entry?.pathIndex)) ? Math.floor(Number(entry.pathIndex)) : null,
        sourceReel: Number.isFinite(Number(entry?.sourceReel)) ? Math.floor(Number(entry.sourceReel)) : null,
        sourceRow: Number.isFinite(Number(entry?.sourceRow)) ? Math.floor(Number(entry.sourceRow)) : null
      };
      collectedNow.push(payload);
      existing.push(payload);
      seenKeys.add(key);
    });

    gameState.bonusMysteryFeature = {
      collected: Math.max(0, Math.min(max, collected)),
      max
    };
    gameState.bonusMysteryFeatureCollectedThisAction = existing;

    return collectedNow;
  }

  collectBonusMysteryFeaturesFromHeroPath(gameState, reels, heroPath = []) {
    if (!Array.isArray(heroPath) || heroPath.length === 0) return [];

    const candidates = [];
    const orthogonalDirections = [
      { reelDelta: 1, rowDelta: 0 },
      { reelDelta: -1, rowDelta: 0 },
      { reelDelta: 0, rowDelta: 1 },
      { reelDelta: 0, rowDelta: -1 }
    ];
    const addCandidatesFromCells = (cells = [], step = null, pathIndex = 0, { includeAdjacent = true } = {}) => {
      cells.forEach((cell) => {
        const reel = Math.floor(Number(cell?.reel));
        const row = Math.floor(Number(cell?.row));
        if (!Number.isFinite(reel) || !Number.isFinite(row)) return;
        if (reel < 0 || reel >= this.width || row < 0 || row >= this.height) return;

        if (this.isBonusMysteryFeatureSymbol(cell?.wasSymbol)) {
          candidates.push({
            reel,
            row,
            reason: "heroRunOver",
            forceCollect: true,
            pathIndex,
            sourceReel: Math.floor(Number(step?.reel)),
            sourceRow: Math.floor(Number(step?.row))
          });
        }

        if (includeAdjacent !== true) return;
        orthogonalDirections.forEach((direction) => {
          const adjacentReel = reel + direction.reelDelta;
          const adjacentRow = row + direction.rowDelta;
          if (adjacentReel < 0 || adjacentReel >= this.width || adjacentRow < 0 || adjacentRow >= this.height) return;
          if (this.isBonusMysteryFeatureSymbol(reels?.[adjacentReel]?.[adjacentRow])) {
            candidates.push({
              reel: adjacentReel,
              row: adjacentRow,
              reason: "heroAdjacent",
              pathIndex,
              sourceReel: Math.floor(Number(step?.reel)),
              sourceRow: Math.floor(Number(step?.row))
            });
          }
        });
      });
    };

    heroPath.forEach((step, pathIndex) => {
      const footprintCells = Array.isArray(step?.footprintCells) ? step.footprintCells : [];
      const growthConsumedCells = Array.isArray(step?.growthConsumedCells) ? step.growthConsumedCells : [];
      if (step?.rushActive === true || step?.banana === true) {
        addCandidatesFromCells(footprintCells, step, pathIndex, { includeAdjacent: true });
      }
      addCandidatesFromCells(growthConsumedCells, step, pathIndex, { includeAdjacent: false });
    });

    return this.collectBonusMysteryFeaturePositions(gameState, reels, candidates, "heroInfluence");
  }

  collectBonusMysteryFeaturesNearHero(gameState, reels, heroAnchor = null, heroFootprintSize = 1) {
    const heroState = this.buildHeroFootprintState(
      heroAnchor || gameState?.heroPosition || null,
      heroFootprintSize || gameState?.heroFootprintSize || 1
    );
    if (!reels || !Array.isArray(heroState.cells) || heroState.cells.length === 0) {
      return [];
    }

    const candidates = [];
    const seen = new Set();
    const orthogonalDirections = [
      { reelDelta: 1, rowDelta: 0 },
      { reelDelta: -1, rowDelta: 0 },
      { reelDelta: 0, rowDelta: 1 },
      { reelDelta: 0, rowDelta: -1 }
    ];
    const addCandidate = (reel, row, sourceCell, reason = "heroAdjacentDrop", forceCollect = false) => {
      if (reel < 0 || reel >= this.width || row < 0 || row >= this.height) return;
      const key = `${reel},${row}`;
      if (seen.has(key)) return;
      if (!this.isBonusMysteryFeatureSymbol(reels?.[reel]?.[row])) return;
      seen.add(key);
      candidates.push({
        reel,
        row,
        reason,
        forceCollect,
        sourceReel: Math.floor(Number(sourceCell?.reel)),
        sourceRow: Math.floor(Number(sourceCell?.row))
      });
    };

    heroState.cells.forEach((cell) => {
      const reel = Math.floor(Number(cell?.reel));
      const row = Math.floor(Number(cell?.row));
      if (!Number.isFinite(reel) || !Number.isFinite(row)) return;
      addCandidate(reel, row, cell, "heroOverlapDrop", true);
      orthogonalDirections.forEach((direction) => {
        addCandidate(reel + direction.reelDelta, row + direction.rowDelta, cell, "heroAdjacentDrop", false);
      });
    });

    return this.collectBonusMysteryFeaturePositions(gameState, reels, candidates, "heroAdjacentDrop");
  }

  normalizeLightningBeeFeatureState(gameState, { resetCollected = false, resetMultiplier = false } = {}) {
    const config = this.getLightningBeeFeatureConfig();
    const ladder = Array.isArray(config.multiplierLadder) && config.multiplierLadder.length > 0
      ? config.multiplierLadder
      : DEFAULT_LIGHTNING_BEE_MULTIPLIER_LADDER;
    const normalizeStep = (rawStep = 0) => Math.max(
      0,
      Math.min(ladder.length - 1, Math.floor(Number(rawStep) || 0))
    );
    const normalizeEntry = (entry = {}, fallbackId = 1, { includePosition = false } = {}) => {
      const id = Math.max(1, Math.floor(Number(entry?.beeId ?? entry?.id ?? fallbackId) || fallbackId));
      const step = resetMultiplier ? 0 : normalizeStep(entry?.multiplierStep ?? entry?.step ?? 0);
      const normalized = {
        id,
        beeId: id,
        multiplierStep: step,
        multiplier: ladder[step] || 1
      };
      if (includePosition) {
        const reel = Math.floor(Number(entry?.reel));
        const row = Math.floor(Number(entry?.row));
        if (!Number.isFinite(reel) || !Number.isFinite(row)) return null;
        normalized.reel = reel;
        normalized.row = row;
      }
      return normalized;
    };
    if (!gameState || typeof gameState !== "object") {
      return {
        collected: 0,
        max: config.maxCollect,
        multiplierStep: 0,
        multiplier: ladder[0],
        multiplierLadder: ladder,
        boardBees: [],
        collectedBees: [],
        nextBeeId: 1
      };
    }

    if (!gameState.lightningBeeFeature || typeof gameState.lightningBeeFeature !== "object") {
      gameState.lightningBeeFeature = {};
    }

    const max = Math.max(
      1,
      Math.floor(Number(gameState.lightningBeeFeature.max ?? config.maxCollect) || config.maxCollect)
    );
    const rawCollected = resetCollected
      ? 0
      : Number(gameState.lightningBeeFeature.collected ?? 0);
    const legacyCollected = Math.max(0, Math.min(max, Math.floor(Number(rawCollected) || 0)));
    const rawStep = resetMultiplier
      ? 0
      : Number(gameState.lightningBeeFeature.multiplierStep ?? gameState.lightningBeeFeature.step ?? 0);
    const legacyStep = normalizeStep(rawStep);
    const sourceBoardBees = resetCollected
      ? []
      : (Array.isArray(gameState.lightningBeeFeature.boardBees) ? gameState.lightningBeeFeature.boardBees : []);
    const sourceCollectedBees = resetCollected
      ? []
      : (Array.isArray(gameState.lightningBeeFeature.collectedBees) ? gameState.lightningBeeFeature.collectedBees : []);
    const usedIds = new Set();
    let maxSeenId = 0;
    const boardBees = [];
    sourceBoardBees.forEach((entry, index) => {
      const normalized = normalizeEntry(entry, index + 1, { includePosition: true });
      if (!normalized) return;
      const positionKey = `${normalized.reel},${normalized.row}`;
      if (boardBees.some((bee) => `${bee.reel},${bee.row}` === positionKey)) return;
      if (usedIds.has(normalized.id)) {
        normalized.id = Math.max(maxSeenId + 1, normalized.id + 1);
        normalized.beeId = normalized.id;
      }
      usedIds.add(normalized.id);
      maxSeenId = Math.max(maxSeenId, normalized.id);
      boardBees.push(normalized);
    });

    const collectedBees = [];
    sourceCollectedBees.slice(0, max).forEach((entry, index) => {
      const normalized = normalizeEntry(entry, boardBees.length + index + 1);
      if (!normalized) return;
      if (usedIds.has(normalized.id)) {
        normalized.id = Math.max(maxSeenId + 1, normalized.id + 1);
        normalized.beeId = normalized.id;
      }
      usedIds.add(normalized.id);
      maxSeenId = Math.max(maxSeenId, normalized.id);
      collectedBees.push(normalized);
    });

    if (!resetCollected && collectedBees.length === 0 && legacyCollected > 0) {
      for (let index = 0; index < legacyCollected; index++) {
        const id = Math.max(maxSeenId + 1, index + 1);
        maxSeenId = id;
        usedIds.add(id);
        collectedBees.push({
          id,
          beeId: id,
          multiplierStep: legacyStep,
          multiplier: ladder[legacyStep] || 1
        });
      }
    }

    const displayEntries = collectedBees.length > 0 ? collectedBees : boardBees;
    const multiplierStep = displayEntries.reduce(
      (best, entry) => Math.max(best, normalizeStep(entry?.multiplierStep)),
      legacyStep
    );
    const configuredNextId = Math.max(1, Math.floor(Number(gameState.lightningBeeFeature.nextBeeId) || 1));
    const nextBeeId = Math.max(configuredNextId, maxSeenId + 1);

    gameState.lightningBeeFeature = {
      collected: collectedBees.length,
      max,
      multiplierStep,
      multiplier: ladder[multiplierStep] || 1,
      multiplierLadder: ladder,
      boardBees,
      collectedBees,
      nextBeeId
    };
    if (!Array.isArray(gameState.lightningBeeFeatureCollectedThisAction)) {
      gameState.lightningBeeFeatureCollectedThisAction = [];
    }
    if (!Array.isArray(gameState.lightningBeeMovementsThisAction)) {
      gameState.lightningBeeMovementsThisAction = [];
    }

    return gameState.lightningBeeFeature;
  }

  syncLightningBeeBoardState(gameState, reels = null) {
    if (!gameState || typeof gameState !== "object") return this.normalizeLightningBeeFeatureState(gameState);
    const featureState = this.normalizeLightningBeeFeatureState(gameState);
    const ladder = Array.isArray(featureState.multiplierLadder) && featureState.multiplierLadder.length > 0
      ? featureState.multiplierLadder
      : this.getLightningBeeFeatureConfig().multiplierLadder;
    if (!reels) return featureState;

    const existingByPosition = new Map();
    (Array.isArray(featureState.boardBees) ? featureState.boardBees : []).forEach((bee) => {
      const reel = Math.floor(Number(bee?.reel));
      const row = Math.floor(Number(bee?.row));
      if (!Number.isFinite(reel) || !Number.isFinite(row)) return;
      existingByPosition.set(`${reel},${row}`, bee);
    });

    const boardBees = [];
    let nextBeeId = Math.max(1, Math.floor(Number(featureState.nextBeeId) || 1));
    for (let reel = 0; reel < this.width; reel++) {
      for (let row = 0; row < this.height; row++) {
        if (!this.isLightningBeeFeatureSymbol(reels?.[reel]?.[row])) continue;
        const existing = existingByPosition.get(`${reel},${row}`);
        const step = Math.max(
          0,
          Math.min(ladder.length - 1, Math.floor(Number(existing?.multiplierStep) || 0))
        );
        const id = existing
          ? Math.max(1, Math.floor(Number(existing.beeId ?? existing.id) || nextBeeId))
          : nextBeeId++;
        boardBees.push({
          id,
          beeId: id,
          reel,
          row,
          multiplierStep: step,
          multiplier: ladder[step] || 1
        });
        nextBeeId = Math.max(nextBeeId, id + 1);
      }
    }

    gameState.lightningBeeFeature = {
      ...featureState,
      boardBees,
      nextBeeId
    };
    return this.normalizeLightningBeeFeatureState(gameState);
  }

  canPlaceLightningBeeFeature(reels, reel, row, heroState = null) {
    if (!reels) return false;
    if (!Number.isFinite(reel) || !Number.isFinite(row)) return false;
    if (reel < 0 || reel >= this.width || row < 0 || row >= this.height) return false;
    if (this.isHouse(reel, row)) return false;
    if (heroState?.cellKeys instanceof Set && heroState.cellKeys.has(`${reel},${row}`)) return false;

    const currentSymbol = reels?.[reel]?.[row];
    const currentNumber = Number(currentSymbol);
    if (!Number.isFinite(currentNumber) || currentNumber <= 0) return false;
    if (currentNumber === this.heroId) return false;
    if (this.isDemon(currentNumber)) return false;
    if (currentNumber === this.timeId) return false;
    if (currentNumber === Number(serverConfig?.symbolsMapping?.time_depleted ?? 17)) return false;
    if (currentNumber === this.mysteryId || currentNumber === this.mysteryWildId) return false;
    if (this.isBonusMysteryFeatureSymbol(currentNumber)) return false;
    if (this.isMergeGunFeatureSymbol(currentNumber)) return false;
    if (this.isLightningBeeFeatureSymbol(currentNumber)) return false;

    const payoutSymbols = Array.isArray(serverConfig?.payoutSymbols) ? serverConfig.payoutSymbols : [];
    if (payoutSymbols.length > 0) {
      const payoutSet = new Set(
        payoutSymbols
          .map((rawSymbol) => Number(rawSymbol))
          .filter((symbolId) => Number.isFinite(symbolId))
      );
      if (!payoutSet.has(currentNumber)) {
        return false;
      }
    }

    return true;
  }

  countLightningBeeFeatureSymbolsOnBoard(reels) {
    if (!reels) return 0;

    let total = 0;
    for (let reel = 0; reel < this.width; reel++) {
      for (let row = 0; row < this.height; row++) {
        if (this.isLightningBeeFeatureSymbol(reels?.[reel]?.[row])) {
          total += 1;
        }
      }
    }

    return total;
  }

  getLightningBeeBoardPositions(reels = null) {
    const positions = [];
    if (!reels) return positions;

    for (let reel = 0; reel < this.width; reel++) {
      for (let row = 0; row < this.height; row++) {
        if (this.isLightningBeeFeatureSymbol(reels?.[reel]?.[row])) {
          positions.push({ reel, row });
        }
      }
    }

    return positions;
  }

  getLightningBeeReplacementSymbol() {
    const payoutSymbols = Array.isArray(serverConfig?.payoutSymbols) && serverConfig.payoutSymbols.length > 0
      ? serverConfig.payoutSymbols
      : [1];
    const fallback = Number(payoutSymbols[0]) || 1;
    const weights = this.serverConfig?.symbolWeightsMain || serverConfig.symbolWeightsMain || {};
    let replacement = this.getRandomSymbol(weights, false, 0, 0);
    const replacementNumber = Number(replacement);
    if (
      !Number.isFinite(replacementNumber) ||
      !payoutSymbols.map((symbol) => Number(symbol)).includes(replacementNumber) ||
      this.isPersistentBonusFeatureSymbol(replacementNumber) ||
      this.isDemon(replacementNumber) ||
      replacementNumber === this.timeId
    ) {
      replacement = fallback;
    }
    return Number(replacement);
  }

  clearCompletedLightningBeeFeatureSymbols(gameState, reels = null) {
    if (!gameState || !reels) return [];

    const config = this.getLightningBeeFeatureConfig();
    const featureState = this.normalizeLightningBeeFeatureState(gameState);
    const max = Math.max(1, Math.floor(Number(featureState?.max ?? config.maxCollect) || config.maxCollect));
    const collected = Math.max(0, Math.floor(Number(featureState?.collected || 0) || 0));
    if (collected < max) return [];

    const cleared = [];
    for (let reel = 0; reel < this.width; reel++) {
      for (let row = 0; row < this.height; row++) {
        if (!this.isLightningBeeFeatureSymbol(reels?.[reel]?.[row])) continue;
        const replacement = this.getLightningBeeReplacementSymbol();
        reels[reel][row] = replacement;
        cleared.push({ reel, row, symbol: replacement });
      }
    }
    gameState.lightningBeeFeature = {
      ...featureState,
      boardBees: []
    };
    this.normalizeLightningBeeFeatureState(gameState);

    return cleared;
  }

  moveLightningBeeFeaturesForKapow(gameState, reels = null, heroState = null) {
    if (!gameState || !reels) return [];

    let featureState = this.syncLightningBeeBoardState(gameState, reels);
    const config = this.getLightningBeeFeatureConfig();
    const ladder = Array.isArray(featureState.multiplierLadder) && featureState.multiplierLadder.length > 0
      ? featureState.multiplierLadder
      : config.multiplierLadder;
    const beeEntries = Array.isArray(featureState.boardBees) ? featureState.boardBees : [];

    if (beeEntries.length === 0) {
      gameState.lightningBeeMovementsThisAction = [];
      return [];
    }

    const directions = [
      { reelDelta: -1, rowDelta: -1 },
      { reelDelta: 0, rowDelta: -1 },
      { reelDelta: 1, rowDelta: -1 },
      { reelDelta: -1, rowDelta: 0 },
      { reelDelta: 1, rowDelta: 0 },
      { reelDelta: -1, rowDelta: 1 },
      { reelDelta: 0, rowDelta: 1 },
      { reelDelta: 1, rowDelta: 1 }
    ];
    const sourceKeys = new Set(beeEntries.map((position) => `${position.reel},${position.row}`));
    const blockedTargetKeys = new Set(sourceKeys);
    const shuffle = (items = []) => {
      for (let index = items.length - 1; index > 0; index--) {
        const swapIndex = Math.floor(Math.random() * (index + 1));
        [items[index], items[swapIndex]] = [items[swapIndex], items[index]];
      }
      return items;
    };
    const maxCollect = Math.max(1, Math.floor(Number(featureState.max) || config.maxCollect));
    const collectedBees = Array.isArray(featureState.collectedBees) ? [...featureState.collectedBees] : [];
    const existingCollections = Array.isArray(gameState.lightningBeeFeatureCollectedThisAction)
      ? gameState.lightningBeeFeatureCollectedThisAction
      : [];
    gameState.lightningBeeFeatureCollectedThisAction = existingCollections;
    const collectionBeeIds = new Set(
      existingCollections
        .map((entry) => Math.floor(Number(entry?.beeId ?? entry?.id)))
        .filter((id) => Number.isFinite(id))
    );
    const heroCells = Array.isArray(heroState?.cells) ? heroState.cells : [];
    const heroCellKeys = heroState?.cellKeys instanceof Set ? heroState.cellKeys : new Set();
    const getNearestHeroCell = (reel, row) => {
      let nearest = null;
      let nearestDistance = Number.POSITIVE_INFINITY;
      heroCells.forEach((cell) => {
        const cellReel = Math.floor(Number(cell?.reel));
        const cellRow = Math.floor(Number(cell?.row));
        if (!Number.isFinite(cellReel) || !Number.isFinite(cellRow)) return;
        const distance = Math.abs(cellReel - reel) + Math.abs(cellRow - row);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearest = { reel: cellReel, row: cellRow };
        }
      });
      return nearest;
    };
    const getHeroFlightGrabInfo = (reel, row) => {
      if (!Number.isFinite(reel) || !Number.isFinite(row)) return null;
      if (heroCellKeys.has(`${reel},${row}`)) {
        const source = getNearestHeroCell(reel, row) || { reel, row };
        return {
          reel,
          row,
          sourceReel: source.reel,
          sourceRow: source.row,
          reason: "heroBeeFlightOverlap",
          forceCollect: true
        };
      }
      for (const cell of heroCells) {
        const cellReel = Math.floor(Number(cell?.reel));
        const cellRow = Math.floor(Number(cell?.row));
        if (!Number.isFinite(cellReel) || !Number.isFinite(cellRow)) continue;
        if (Math.abs(cellReel - reel) + Math.abs(cellRow - row) === 1) {
          return {
            reel,
            row,
            sourceReel: cellReel,
            sourceRow: cellRow,
            reason: "heroBeeFlightGrab",
            forceCollect: false
          };
        }
      }
      return null;
    };
    const recordFlightGrabCollection = ({
      beeId,
      reel,
      row,
      multiplierStep,
      multiplier,
      sourceReel,
      sourceRow,
      reason
    }) => {
      if (collectionBeeIds.has(beeId)) return null;
      const applied = collectedBees.length < maxCollect;
      if (applied) {
        collectedBees.push({
          id: beeId,
          beeId,
          multiplierStep,
          multiplier
        });
      }
      const payload = {
        beeId,
        reel,
        row,
        symbol: config.symbolId,
        reason: reason || "heroBeeFlightGrab",
        applied,
        multiplierStep,
        multiplier,
        pathIndex: null,
        sourceReel: Number.isFinite(sourceReel) ? sourceReel : null,
        sourceRow: Number.isFinite(sourceRow) ? sourceRow : null,
        handledByLightningBeeMovement: true
      };
      existingCollections.push(payload);
      collectionBeeIds.add(beeId);
      return payload;
    };
    const movements = [];
    const nextBoardBees = [];

    shuffle([...beeEntries]).forEach((bee) => {
      const reel = Math.floor(Number(bee?.reel));
      const row = Math.floor(Number(bee?.row));
      if (!Number.isFinite(reel) || !Number.isFinite(row)) return;
      if (!this.isLightningBeeFeatureSymbol(reels?.[reel]?.[row])) return;
      const beeId = Math.max(1, Math.floor(Number(bee?.beeId ?? bee?.id) || 1));
      const fromStep = Math.max(
        0,
        Math.min(ladder.length - 1, Math.floor(Number(bee?.multiplierStep) || 0))
      );
      const toStep = Math.min(ladder.length - 1, fromStep + 1);
      const fromMultiplier = Math.max(1, Number(ladder[fromStep] || bee?.multiplier || 1));
      const toMultiplier = Math.max(1, Number(ladder[toStep] || fromMultiplier));

      const options = shuffle([...directions])
        .map((direction) => ({
          reel: reel + direction.reelDelta,
          row: row + direction.rowDelta
        }))
        .filter((target) => {
          if (target.reel < 0 || target.reel >= this.width || target.row < 0 || target.row >= this.height) return false;
          if (this.isHouse(target.reel, target.row)) return false;
          const key = `${target.reel},${target.row}`;
          if (blockedTargetKeys.has(key)) return false;
          return this.canPlaceLightningBeeFeature(reels, target.reel, target.row, heroState);
        });

      const target = options[0] || null;
      if (!target) {
        const stationaryGrabInfo = getHeroFlightGrabInfo(reel, row);
        if (stationaryGrabInfo) {
          reels[reel][row] = this.getLightningBeeReplacementSymbol();
          const collection = recordFlightGrabCollection({
            beeId,
            reel,
            row,
            multiplierStep: toStep,
            multiplier: toMultiplier,
            sourceReel: stationaryGrabInfo.sourceReel,
            sourceRow: stationaryGrabInfo.sourceRow,
            reason: stationaryGrabInfo.reason
          });
          movements.push({
            beeId,
            fromReel: reel,
            fromRow: row,
            toReel: reel,
            toRow: row,
            symbol: config.symbolId,
            moved: false,
            collectedByHero: true,
            grabReel: stationaryGrabInfo.sourceReel,
            grabRow: stationaryGrabInfo.sourceRow,
            collection,
            hitByCharge: true,
            upgraded: toStep > fromStep,
            fromMultiplierStep: fromStep,
            fromMultiplier,
            multiplierStep: toStep,
            multiplier: toMultiplier
          });
          return;
        }
        nextBoardBees.push({
          id: beeId,
          beeId,
          reel,
          row,
          multiplierStep: toStep,
          multiplier: toMultiplier
        });
        movements.push({
          beeId,
          fromReel: reel,
          fromRow: row,
          toReel: reel,
          toRow: row,
          symbol: config.symbolId,
          moved: false,
          hitByCharge: true,
          upgraded: toStep > fromStep,
          fromMultiplierStep: fromStep,
          fromMultiplier,
          multiplierStep: toStep,
          multiplier: toMultiplier
        });
        return;
      }

      const fromGrabInfo = getHeroFlightGrabInfo(reel, row);
      const targetGrabInfo = getHeroFlightGrabInfo(target.reel, target.row);
      const grabInfo = fromGrabInfo || targetGrabInfo;
      if (grabInfo) {
        const flightTarget = fromGrabInfo ? { reel, row } : target;
        reels[reel][row] = this.getLightningBeeReplacementSymbol();
        const collection = recordFlightGrabCollection({
          beeId,
          reel: flightTarget.reel,
          row: flightTarget.row,
          multiplierStep: toStep,
          multiplier: toMultiplier,
          sourceReel: grabInfo.sourceReel,
          sourceRow: grabInfo.sourceRow,
          reason: grabInfo.reason
        });
        movements.push({
          beeId,
          fromReel: reel,
          fromRow: row,
          toReel: flightTarget.reel,
          toRow: flightTarget.row,
          symbol: config.symbolId,
          moved: fromGrabInfo ? false : true,
          collectedByHero: true,
          grabReel: grabInfo.sourceReel,
          grabRow: grabInfo.sourceRow,
          collection,
          hitByCharge: true,
          upgraded: toStep > fromStep,
          fromMultiplierStep: fromStep,
          fromMultiplier,
          multiplierStep: toStep,
          multiplier: toMultiplier
        });
        return;
      }

      reels[reel][row] = this.getLightningBeeReplacementSymbol();
      reels[target.reel][target.row] = config.symbolId;
      blockedTargetKeys.add(`${target.reel},${target.row}`);
      nextBoardBees.push({
        id: beeId,
        beeId,
        reel: target.reel,
        row: target.row,
        multiplierStep: toStep,
        multiplier: toMultiplier
      });
      movements.push({
        beeId,
        fromReel: reel,
        fromRow: row,
        toReel: target.reel,
        toRow: target.row,
        symbol: config.symbolId,
        moved: true,
        hitByCharge: true,
        upgraded: toStep > fromStep,
        fromMultiplierStep: fromStep,
        fromMultiplier,
        multiplierStep: toStep,
        multiplier: toMultiplier
      });
    });

    gameState.lightningBeeFeature = {
      ...featureState,
      collected: Math.max(0, Math.min(maxCollect, collectedBees.length)),
      max: maxCollect,
      boardBees: nextBoardBees,
      collectedBees
    };
    this.normalizeLightningBeeFeatureState(gameState);
    gameState.lightningBeeMovementsThisAction = movements;
    return movements;
  }

  injectLightningBeeFeatureSymbols(
    gameState,
    reels,
    {
      candidatePositions = null,
      chancePerAction = null,
      chancePerPosition = 0,
      maxPerAction = 1,
      heroState = null
    } = {}
  ) {
    if (!gameState || !reels) return [];
    if (gameState.isBonus !== true) return [];

    const featureState = this.syncLightningBeeBoardState(gameState, reels);
    const config = this.getLightningBeeFeatureConfig();
    const remainingCapacity = Math.max(0, Number(featureState.max || 0) - Number(featureState.collected || 0));
    if (remainingCapacity <= 0) {
      this.clearCompletedLightningBeeFeatureSymbols(gameState, reels);
      return [];
    }

    const visibleBeesOnBoard = this.countLightningBeeFeatureSymbolsOnBoard(reels);
    const remainingSpawnCapacity = Math.max(0, remainingCapacity - visibleBeesOnBoard);
    if (remainingSpawnCapacity <= 0) return [];

    const cappedMaxPerAction = Math.max(0, Math.floor(Number(maxPerAction) || 0));
    const placementCap = Math.min(cappedMaxPerAction, remainingSpawnCapacity);
    if (placementCap <= 0) return [];

    const actionChance = chancePerAction === null ? null : this.normalizeProbability(chancePerAction, 0);
    if (actionChance !== null && Math.random() >= actionChance) {
      return [];
    }

    const perPositionChance = this.normalizeProbability(chancePerPosition, actionChance !== null ? 1 : 0);
    if (perPositionChance <= 0) return [];

    let candidates = [];
    if (Array.isArray(candidatePositions) && candidatePositions.length > 0) {
      candidates = candidatePositions
        .map((entry) => ({
          reel: Math.floor(Number(entry?.reel)),
          row: Math.floor(Number(entry?.row))
        }))
        .filter(
          (entry) =>
            Number.isFinite(entry.reel) &&
            Number.isFinite(entry.row) &&
            entry.reel >= 0 &&
            entry.reel < this.width &&
            entry.row >= 0 &&
            entry.row < this.height
        );
    } else {
      for (let reel = 0; reel < this.width; reel++) {
        for (let row = 0; row < this.height; row++) {
          candidates.push({ reel, row });
        }
      }
    }

    for (let index = candidates.length - 1; index > 0; index--) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [candidates[index], candidates[swapIndex]] = [candidates[swapIndex], candidates[index]];
    }

    const placed = [];
    const boardBees = Array.isArray(featureState.boardBees) ? [...featureState.boardBees] : [];
    const ladder = Array.isArray(featureState.multiplierLadder) && featureState.multiplierLadder.length > 0
      ? featureState.multiplierLadder
      : config.multiplierLadder;
    let nextBeeId = Math.max(1, Math.floor(Number(featureState.nextBeeId) || 1));
    for (const candidate of candidates) {
      if (placed.length >= placementCap) break;
      if (!this.canPlaceLightningBeeFeature(reels, candidate.reel, candidate.row, heroState)) continue;
      if (Math.random() >= perPositionChance) continue;
      reels[candidate.reel][candidate.row] = config.symbolId;
      const beeId = nextBeeId++;
      const multiplierStep = 0;
      const multiplier = Math.max(1, Number(ladder[multiplierStep] || 1));
      boardBees.push({
        id: beeId,
        beeId,
        reel: candidate.reel,
        row: candidate.row,
        multiplierStep,
        multiplier
      });
      placed.push({
        beeId,
        reel: candidate.reel,
        row: candidate.row,
        symbol: config.symbolId,
        multiplierStep,
        multiplier
      });
    }

    if (placed.length > 0) {
      gameState.lightningBeeFeature = {
        ...featureState,
        boardBees,
        nextBeeId
      };
      this.normalizeLightningBeeFeatureState(gameState);
    }

    return placed;
  }

  collectLightningBeeFeaturePositions(gameState, reels, rawPositions = [], defaultReason = "lightningBeeFeature") {
    if (!gameState || !reels || !Array.isArray(rawPositions) || rawPositions.length === 0) {
      return [];
    }

    const config = this.getLightningBeeFeatureConfig();
    const featureState = this.syncLightningBeeBoardState(gameState, reels);
    const existing = Array.isArray(gameState.lightningBeeFeatureCollectedThisAction)
      ? gameState.lightningBeeFeatureCollectedThisAction
      : [];
    const seenKeys = new Set(
      existing
        .map((entry) => {
          const reel = Math.floor(Number(entry?.reel));
          const row = Math.floor(Number(entry?.row));
          if (!Number.isFinite(reel) || !Number.isFinite(row)) return null;
          return `${reel},${row}`;
        })
        .filter(Boolean)
    );

    const max = Math.max(1, Math.floor(Number(featureState.max) || config.maxCollect));
    const ladder = Array.isArray(featureState.multiplierLadder) && featureState.multiplierLadder.length > 0
      ? featureState.multiplierLadder
      : config.multiplierLadder;
    const remainingBoardBees = Array.isArray(featureState.boardBees) ? [...featureState.boardBees] : [];
    const collectedBees = Array.isArray(featureState.collectedBees) ? [...featureState.collectedBees] : [];
    const collectedNow = [];

    rawPositions.forEach((entry) => {
      const reel = Math.floor(Number(entry?.reel));
      const row = Math.floor(Number(entry?.row));
      if (!Number.isFinite(reel) || !Number.isFinite(row)) return;
      if (reel < 0 || reel >= this.width || row < 0 || row >= this.height) return;
      if (this.isHouse(reel, row)) return;

      const key = `${reel},${row}`;
      if (seenKeys.has(key)) return;
      const beeIndex = remainingBoardBees.findIndex((bee) =>
        Math.floor(Number(bee?.reel)) === reel &&
        Math.floor(Number(bee?.row)) === row
      );
      const beeEntry = beeIndex >= 0 ? remainingBoardBees[beeIndex] : null;

      const forceCollect = entry?.forceCollect === true;
      const boardSymbol = reels?.[reel]?.[row];
      const hasBeeOnBoard = this.isLightningBeeFeatureSymbol(boardSymbol);
      if (!hasBeeOnBoard && !beeEntry && !forceCollect) return;

      if (hasBeeOnBoard) {
        reels[reel][row] = 0;
      }
      if (beeIndex >= 0) {
        remainingBoardBees.splice(beeIndex, 1);
      }

      const beeId = Math.max(1, Math.floor(Number(beeEntry?.beeId ?? beeEntry?.id ?? entry?.beeId ?? featureState.nextBeeId ?? 1)) || 1);
      const multiplierStep = Math.max(
        0,
        Math.min(ladder.length - 1, Math.floor(Number(beeEntry?.multiplierStep ?? entry?.multiplierStep ?? 0)) || 0)
      );
      const multiplier = Math.max(1, Number(ladder[multiplierStep] || beeEntry?.multiplier || entry?.multiplier || 1));

      const applied = collectedBees.length < max;
      if (applied) {
        collectedBees.push({
          id: beeId,
          beeId,
          multiplierStep,
          multiplier
        });
      }

      const reason = typeof entry?.reason === "string" && entry.reason
        ? entry.reason
        : defaultReason;
      const payload = {
        beeId,
        reel,
        row,
        symbol: config.symbolId,
        reason,
        applied,
        multiplierStep,
        multiplier,
        pathIndex: Number.isFinite(Number(entry?.pathIndex)) ? Math.floor(Number(entry.pathIndex)) : null,
        sourceReel: Number.isFinite(Number(entry?.sourceReel)) ? Math.floor(Number(entry.sourceReel)) : null,
        sourceRow: Number.isFinite(Number(entry?.sourceRow)) ? Math.floor(Number(entry.sourceRow)) : null
      };
      collectedNow.push(payload);
      existing.push(payload);
      seenKeys.add(key);
    });

    gameState.lightningBeeFeature = {
      ...featureState,
      collected: Math.max(0, Math.min(max, collectedBees.length)),
      max,
      boardBees: remainingBoardBees,
      collectedBees
    };
    this.normalizeLightningBeeFeatureState(gameState);
    gameState.lightningBeeFeatureCollectedThisAction = existing;
    this.clearCompletedLightningBeeFeatureSymbols(gameState, reels);

    return collectedNow;
  }

  collectLightningBeeFeaturesFromHeroPath(gameState, reels, heroPath = []) {
    if (!Array.isArray(heroPath) || heroPath.length === 0) return [];

    const candidates = [];
    const orthogonalDirections = [
      { reelDelta: 1, rowDelta: 0 },
      { reelDelta: -1, rowDelta: 0 },
      { reelDelta: 0, rowDelta: 1 },
      { reelDelta: 0, rowDelta: -1 }
    ];
    const addCandidatesFromCells = (cells = [], step = null, pathIndex = 0, { includeAdjacent = true } = {}) => {
      cells.forEach((cell) => {
        const reel = Math.floor(Number(cell?.reel));
        const row = Math.floor(Number(cell?.row));
        if (!Number.isFinite(reel) || !Number.isFinite(row)) return;
        if (reel < 0 || reel >= this.width || row < 0 || row >= this.height) return;

        if (this.isLightningBeeFeatureSymbol(cell?.wasSymbol)) {
          candidates.push({
            reel,
            row,
            reason: "heroRunOver",
            forceCollect: true,
            pathIndex,
            sourceReel: Math.floor(Number(step?.reel)),
            sourceRow: Math.floor(Number(step?.row))
          });
        }

        if (includeAdjacent !== true) return;
        orthogonalDirections.forEach((direction) => {
          const adjacentReel = reel + direction.reelDelta;
          const adjacentRow = row + direction.rowDelta;
          if (adjacentReel < 0 || adjacentReel >= this.width || adjacentRow < 0 || adjacentRow >= this.height) return;
          if (this.isLightningBeeFeatureSymbol(reels?.[adjacentReel]?.[adjacentRow])) {
            candidates.push({
              reel: adjacentReel,
              row: adjacentRow,
              reason: "heroAdjacent",
              pathIndex,
              sourceReel: Math.floor(Number(step?.reel)),
              sourceRow: Math.floor(Number(step?.row))
            });
          }
        });
      });
    };

    heroPath.forEach((step, pathIndex) => {
      const footprintCells = Array.isArray(step?.footprintCells) ? step.footprintCells : [];
      const growthConsumedCells = Array.isArray(step?.growthConsumedCells) ? step.growthConsumedCells : [];
      if (step?.rushActive === true || step?.banana === true) {
        addCandidatesFromCells(footprintCells, step, pathIndex, { includeAdjacent: true });
      }
      addCandidatesFromCells(growthConsumedCells, step, pathIndex, { includeAdjacent: false });
    });

    return this.collectLightningBeeFeaturePositions(gameState, reels, candidates, "heroLightningBee");
  }

  collectLightningBeeFeaturesNearHero(gameState, reels, heroAnchor = null, heroFootprintSize = 1) {
    const heroState = this.buildHeroFootprintState(
      heroAnchor || gameState?.heroPosition || null,
      heroFootprintSize || gameState?.heroFootprintSize || 1
    );
    if (!reels || !Array.isArray(heroState.cells) || heroState.cells.length === 0) {
      return [];
    }

    const candidates = [];
    const seen = new Set();
    const orthogonalDirections = [
      { reelDelta: 1, rowDelta: 0 },
      { reelDelta: -1, rowDelta: 0 },
      { reelDelta: 0, rowDelta: 1 },
      { reelDelta: 0, rowDelta: -1 }
    ];
    const addCandidate = (reel, row, sourceCell, reason = "heroAdjacentDrop", forceCollect = false) => {
      if (reel < 0 || reel >= this.width || row < 0 || row >= this.height) return;
      const key = `${reel},${row}`;
      if (seen.has(key)) return;
      if (!this.isLightningBeeFeatureSymbol(reels?.[reel]?.[row])) return;
      seen.add(key);
      candidates.push({
        reel,
        row,
        reason,
        forceCollect,
        sourceReel: Math.floor(Number(sourceCell?.reel)),
        sourceRow: Math.floor(Number(sourceCell?.row))
      });
    };

    heroState.cells.forEach((cell) => {
      const reel = Math.floor(Number(cell?.reel));
      const row = Math.floor(Number(cell?.row));
      if (!Number.isFinite(reel) || !Number.isFinite(row)) return;
      addCandidate(reel, row, cell, "heroOverlapDrop", true);
      orthogonalDirections.forEach((direction) => {
        addCandidate(reel + direction.reelDelta, row + direction.rowDelta, cell, "heroAdjacentDrop", false);
      });
    });

    return this.collectLightningBeeFeaturePositions(gameState, reels, candidates, "heroAdjacentDrop");
  }

  collectSettledHeroFeatureAdjacency(gameState, reels, heroAnchor = null, heroFootprintSize = 1) {
    if (!gameState || !reels) {
      return {
        mergeGunCollections: [],
        mergeGunActivations: [],
        bonusMysteryCollections: [],
        lightningBeeCollections: []
      };
    }

    const anchor = heroAnchor || gameState.heroPosition || null;
    const footprintSize = Math.max(1, Math.floor(Number(heroFootprintSize || gameState.heroFootprintSize || 1)) || 1);
    const mergeGunCollections = this.collectMergeGunFeaturesNearHero(gameState, reels, anchor, footprintSize);
    const mergeGunActivations = this.triggerMergeGunActivations(
      gameState,
      mergeGunCollections,
      anchor,
      footprintSize
    );
    const bonusMysteryCollections = this.collectBonusMysteryFeaturesNearHero(gameState, reels, anchor, footprintSize);
    const lightningBeeCollections = this.collectLightningBeeFeaturesNearHero(gameState, reels, anchor, footprintSize);

    return {
      mergeGunCollections,
      mergeGunActivations,
      bonusMysteryCollections,
      lightningBeeCollections
    };
  }

  getHeroFootprintSize(rawStage = 0) {
    const stage = Math.max(0, Math.floor(Number(rawStage) || 0));
    if (stage >= 5) return 3; // TK+ form.
    if (stage >= 4) return 2; // TK form.
    return 1;
  }

  getHeroFootprintCells(anchor = null, footprintSize = 1) {
    if (!anchor || !Number.isFinite(anchor.reel) || !Number.isFinite(anchor.row)) {
      return [];
    }

    const size = Math.max(1, Math.floor(Number(footprintSize) || 1));
    const cells = [];
    for (let reelOffset = 0; reelOffset < size; reelOffset++) {
      for (let rowOffset = 0; rowOffset < size; rowOffset++) {
        cells.push({
          reel: anchor.reel + reelOffset,
          row: anchor.row + rowOffset
        });
      }
    }
    return cells;
  }

  isValidHeroAnchor(reel, row, footprintSize = 1) {
    const size = Math.max(1, Math.floor(Number(footprintSize) || 1));
    if (!Number.isFinite(reel) || !Number.isFinite(row)) return false;
    if (reel < 0 || row < 0) return false;
    if ((reel + size - 1) >= this.width || (row + size - 1) >= this.height) return false;

    return this.getHeroFootprintCells({ reel, row }, size).every((cell) => !this.isHouse(cell.reel, cell.row));
  }

  normalizeHeroAnchorForSize(position = null, footprintSize = 1) {
    const size = Math.max(1, Math.floor(Number(footprintSize) || 1));
    if (!position || !Number.isFinite(position.reel) || !Number.isFinite(position.row)) {
      return null;
    }

    const requested = {
      reel: Math.floor(Number(position.reel) || 0),
      row: Math.floor(Number(position.row) || 0)
    };
    if (this.isValidHeroAnchor(requested.reel, requested.row, size)) {
      return requested;
    }

    let bestAnchor = null;
    let bestDistance = Infinity;
    for (let reel = 0; reel <= this.width - size; reel++) {
      for (let row = 0; row <= this.height - size; row++) {
        if (!this.isValidHeroAnchor(reel, row, size)) continue;
        const distance = Math.abs(reel - requested.reel) + Math.abs(row - requested.row);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestAnchor = { reel, row };
        }
      }
    }

    return bestAnchor;
  }

  buildHeroFootprintState(anchor = null, footprintSize = 1) {
    const normalizedAnchor = this.normalizeHeroAnchorForSize(anchor, footprintSize);
    const size = Math.max(1, Math.floor(Number(footprintSize) || 1));
    const cells = normalizedAnchor ? this.getHeroFootprintCells(normalizedAnchor, size) : [];
    return {
      anchor: normalizedAnchor,
      size,
      cells,
      cellKeys: new Set(cells.map((cell) => `${cell.reel},${cell.row}`))
    };
  }

  getHeroStartingPosition() {
    return serverConfig.heroStartingPosition || { reel: 4, row: 2 };
  }

  isHeroAtStartingPosition(anchor = null) {
    if (!anchor || !Number.isFinite(anchor.reel) || !Number.isFinite(anchor.row)) {
      return true;
    }
    const startingPos = this.getHeroStartingPosition();
    return (
      Math.floor(Number(anchor.reel)) === Math.floor(Number(startingPos.reel)) &&
      Math.floor(Number(anchor.row)) === Math.floor(Number(startingPos.row))
    );
  }

  shouldHeroActAsWild(anchor = null) {
    return !this.isHeroAtStartingPosition(anchor);
  }

  getHeroWildCellsForClusterEval(heroState = null) {
    const anchor = heroState?.anchor || heroState?.position || null;
    if (!this.shouldHeroActAsWild(anchor)) {
      return [];
    }
    return this.buildHeroFootprintState(anchor, heroState?.size || 1).cells;
  }

  markHeroFootprintWalked(walkedPositions, anchor, footprintSize = 1) {
    if (!(walkedPositions instanceof Set)) return;
    this.getHeroFootprintCells(anchor, footprintSize).forEach((cell) => {
      walkedPositions.add(`${cell.reel},${cell.row}`);
    });
  }

  countPathWalkedCells(path = [], walkedPositions = new Set(), footprintSize = 1) {
    if (!Array.isArray(path) || path.length === 0) return 0;
    const seen = new Set();
    let count = 0;

    path.forEach((step) => {
      this.getHeroFootprintCells(step, footprintSize).forEach((cell) => {
        const key = `${cell.reel},${cell.row}`;
        if (seen.has(key)) return;
        seen.add(key);
        if (walkedPositions.has(key)) {
          count++;
        }
      });
    });

    return count;
  }

  getTargetAnchorsForDemon(banana, footprintSize = 1) {
    const size = Math.max(1, Math.floor(Number(footprintSize) || 1));
    if (!banana || !Number.isFinite(banana.reel) || !Number.isFinite(banana.row)) return [];
    if (size <= 1) {
      return [{ reel: banana.reel, row: banana.row }];
    }

    const anchors = [];
    for (let reel = banana.reel - size + 1; reel <= banana.reel; reel++) {
      for (let row = banana.row - size + 1; row <= banana.row; row++) {
        if (!this.isValidHeroAnchor(reel, row, size)) continue;
        anchors.push({ reel, row });
      }
    }
    return anchors;
  }

  getDemonsInFootprint(reels, anchor, footprintSize = 1) {
    return this.getHeroFootprintCells(anchor, footprintSize)
      .map((cell) => ({
        reel: cell.reel,
        row: cell.row,
        bananaId: reels?.[cell.reel]?.[cell.row]
      }))
      .filter((cell) => this.isDemon(cell.bananaId));
  }

  stampHeroFootprintOnReels(reels, anchor, footprintSize = 1) {
    const heroState = this.buildHeroFootprintState(anchor, footprintSize);
    if (!heroState.anchor || !reels) {
      return reels;
    }

    heroState.cells.forEach((cell) => {
      if (!reels?.[cell.reel]) return;
      reels[cell.reel][cell.row] = 0;
    });

    if (reels?.[heroState.anchor.reel]) {
      reels[heroState.anchor.reel][heroState.anchor.row] = this.heroId;
    }

    return reels;
  }

  trimPathToFirstDemonContact(reels, path = [], footprintSize = 1) {
    if (!Array.isArray(path) || path.length === 0) {
      return [];
    }

    for (let index = 0; index < path.length; index++) {
      const anchor = path[index];
      if (this.getDemonsInFootprint(reels, anchor, footprintSize).length > 0) {
        return path.slice(0, index + 1);
      }
    }

    return path;
  }

  getHeroGrowthAnchors(previousAnchor = null, previousFootprintSize = 1, nextFootprintSize = 2) {
    const oldState = this.buildHeroFootprintState(previousAnchor, previousFootprintSize);
    const nextSize = Math.max(1, Math.floor(Number(nextFootprintSize) || 1));
    if (!oldState.anchor) return [];
    if (nextSize <= oldState.size) {
      return [oldState.anchor];
    }

    const candidateAnchors = new Map();
    oldState.cells.forEach((cell) => {
      for (let reel = cell.reel - nextSize + 1; reel <= cell.reel; reel++) {
        for (let row = cell.row - nextSize + 1; row <= cell.row; row++) {
          if (!this.isValidHeroAnchor(reel, row, nextSize)) continue;
          candidateAnchors.set(`${reel},${row}`, { reel, row });
        }
      }
    });

    return Array.from(candidateAnchors.values());
  }

  chooseHeroGrowthAnchor(reels, previousAnchor = null, previousFootprintSize = 1, nextFootprintSize = 2) {
    const oldState = this.buildHeroFootprintState(previousAnchor, previousFootprintSize);
    const nextSize = Math.max(1, Math.floor(Number(nextFootprintSize) || 1));
    if (!oldState.anchor) {
      return {
        anchor: this.normalizeHeroAnchorForSize(previousAnchor, nextSize),
        footprintState: this.buildHeroFootprintState(previousAnchor, nextSize)
      };
    }
    if (nextSize <= oldState.size) {
      return {
        anchor: oldState.anchor,
        footprintState: oldState
      };
    }

    const candidates = this.getHeroGrowthAnchors(oldState.anchor, oldState.size, nextSize);
    let bestCandidate = null;

    candidates.forEach((anchor) => {
      const footprintState = this.buildHeroFootprintState(anchor, nextSize);
      if (!footprintState.anchor) return;

      const newCells = footprintState.cells.filter((cell) => !oldState.cellKeys.has(`${cell.reel},${cell.row}`));
      let bananaCount = 0;
      let occupiedCount = 0;

      newCells.forEach((cell) => {
        const symbol = reels?.[cell.reel]?.[cell.row];
        if (symbol === null || symbol === undefined || symbol === 0 || symbol === "HOUSE" || symbol === this.heroId) {
          return;
        }
        if (this.isDemon(symbol)) {
          bananaCount++;
        } else {
          occupiedCount++;
        }
      });

      const shiftDistance =
        Math.abs(anchor.reel - oldState.anchor.reel) +
        Math.abs(anchor.row - oldState.anchor.row);
      const score = {
        bananaCount,
        shiftDistance,
        occupiedCount,
        reel: anchor.reel,
        row: anchor.row
      };
      const isBetterCandidate =
        !bestCandidate ||
        score.bananaCount < bestCandidate.score.bananaCount ||
        (score.bananaCount === bestCandidate.score.bananaCount && score.shiftDistance < bestCandidate.score.shiftDistance) ||
        (score.bananaCount === bestCandidate.score.bananaCount &&
          score.shiftDistance === bestCandidate.score.shiftDistance &&
          score.occupiedCount < bestCandidate.score.occupiedCount) ||
        (score.bananaCount === bestCandidate.score.bananaCount &&
          score.shiftDistance === bestCandidate.score.shiftDistance &&
          score.occupiedCount === bestCandidate.score.occupiedCount &&
          score.reel < bestCandidate.score.reel) ||
        (score.bananaCount === bestCandidate.score.bananaCount &&
          score.shiftDistance === bestCandidate.score.shiftDistance &&
          score.occupiedCount === bestCandidate.score.occupiedCount &&
          score.reel === bestCandidate.score.reel &&
          score.row < bestCandidate.score.row);

      if (isBetterCandidate) {
        bestCandidate = {
          score,
          anchor,
          footprintState
        };
      }
    });

    return bestCandidate || {
      anchor: oldState.anchor,
      footprintState: this.buildHeroFootprintState(oldState.anchor, nextSize)
    };
  }

  applyHeroGrowthExpansion(reels, previousAnchor = null, previousFootprintSize = 1, nextFootprintSize = 2, weaponIdOrName = 0) {
    const oldState = this.buildHeroFootprintState(previousAnchor, previousFootprintSize);
    const nextSize = Math.max(1, Math.floor(Number(nextFootprintSize) || 1));
    if (!oldState.anchor) {
      return {
        heroPosition: null,
        heroFootprintState: this.buildHeroFootprintState(previousAnchor, nextSize),
        consumedCells: [],
        bananasConsumed: 0,
        orbDrops: []
      };
    }
    if (nextSize <= oldState.size) {
      return {
        heroPosition: oldState.anchor,
        heroFootprintState: oldState,
        consumedCells: [],
        bananasConsumed: 0,
        orbDrops: []
      };
    }

    const chosenGrowth = this.chooseHeroGrowthAnchor(reels, oldState.anchor, oldState.size, nextSize);
    const newState = chosenGrowth.footprintState;
    const consumedCells = [];
    const orbDrops = [];
    let bananasConsumed = 0;

    oldState.cells.forEach((cell) => {
      if (reels?.[cell.reel]?.[cell.row] === this.heroId) {
        reels[cell.reel][cell.row] = 0;
      }
    });

    newState.cells.forEach((cell) => {
      const currentSymbol = reels?.[cell.reel]?.[cell.row];
      if (
        currentSymbol !== null &&
        currentSymbol !== undefined &&
        currentSymbol !== 0 &&
        currentSymbol !== "HOUSE" &&
        currentSymbol !== this.heroId
      ) {
        const isBananaCell = this.isDemon(currentSymbol);
        consumedCells.push({
          reel: cell.reel,
          row: cell.row,
          wasSymbol: currentSymbol,
          banana: isBananaCell,
          bananaId: isBananaCell ? currentSymbol : null
        });
        if (isBananaCell) {
          bananasConsumed++;
          orbDrops.push({
            reel: cell.reel,
            row: cell.row,
            count: this.calculateOrbDrops(weaponIdOrName)
          });
        }
      }

      if (reels?.[cell.reel]) {
        reels[cell.reel][cell.row] = 0;
      }
    });

    if (newState.anchor && reels?.[newState.anchor.reel]) {
      reels[newState.anchor.reel][newState.anchor.row] = this.heroId;
    }

    return {
      heroPosition: newState.anchor,
      heroFootprintState: newState,
      consumedCells,
      bananasConsumed,
      orbDrops
    };
  }

  applyPendingGiantMonkeyGrowth(gameState, reels, weaponIdOrName = 0) {
    if (!gameState || typeof gameState !== "object" || !reels) return null;
    if (gameState?.bonusStageEvent?.giantMonkeyActivated !== true) return null;

    const previousFootprintSize = Math.max(
      1,
      Math.floor(Number(gameState?.bonusStageEvent?.previousHeroFootprintSize || 1))
    );
    const nextFootprintSize = Math.max(
      previousFootprintSize,
      Math.floor(Number(gameState?.heroFootprintSize || gameState?.bonusStageEvent?.heroFootprintSize || previousFootprintSize))
    );
    const growthResult = this.applyHeroGrowthExpansion(
      reels,
      gameState.heroPosition,
      previousFootprintSize,
      nextFootprintSize,
      weaponIdOrName
    );

    gameState.heroPosition = growthResult.heroPosition || gameState.heroPosition;
    gameState.bonusStageEvent.heroPosition = gameState.heroPosition;
    gameState.bonusStageEvent.heroFootprintSize = nextFootprintSize;
    gameState.bonusStageEvent.growthConsumedCells = growthResult.consumedCells || [];
    gameState.bonusStageEvent.bananasConsumed = Number(growthResult.bananasConsumed || 0);

    if (Array.isArray(growthResult.orbDrops) && growthResult.orbDrops.length > 0) {
      gameState.orbDrops = [...(gameState.orbDrops || []), ...growthResult.orbDrops];
    }

    const demonsConsumed = Number(growthResult.bananasConsumed || 0);
    if (demonsConsumed > 0) {
      gameState.demonsKilled = Number(gameState.demonsKilled || 0) + demonsConsumed;
      gameState.demonsKilledThisAction = Number(gameState.demonsKilledThisAction || 0) + demonsConsumed;
      gameState.demonsCollected = Number(gameState.demonsCollected || 0) + demonsConsumed;
      gameState.totalDemonsKilledInSequence = Number(gameState.totalDemonsKilledInSequence || 0) + demonsConsumed;
      gameState.totalDemonsCollectedInSequence = Number(gameState.totalDemonsCollectedInSequence || 0) + demonsConsumed;
      this.addDemonMeterProgress(gameState, demonsConsumed);
    }

    return growthResult;
  }

  normalizeBonusStageState(gameState, { awardFreespins = false } = {}) {
    if (!gameState || typeof gameState !== "object") {
      return {
        previousStage: 0,
        stage: 0,
        freespinsAwarded: 0,
        rushActive: false,
        giantMonkeyActive: false,
        heroFootprintSize: 1
      };
    }

    const meter = this.normalizeDemonMeter(gameState);
    const previousStage = Math.max(0, Math.floor(Number(gameState.bonusStage) || 0));
    const previousHeroFootprintSize = Math.max(1, Math.floor(Number(gameState.heroFootprintSize) || 1));
    const stage = resolveBonusStage(meter.count, gameState.isBonus === true);
    const heroFootprintSize = this.getHeroFootprintSize(stage);
    const rushActive = gameState.isBonus === true && stage >= BONUS_RUSH_START_STAGE;
    const giantMonkeyActive = gameState.isBonus === true && heroFootprintSize > 1;
    const giantMonkeyActivated = giantMonkeyActive && heroFootprintSize > previousHeroFootprintSize;
    let freespinsAwarded = 0;

    if (awardFreespins && gameState.isBonus === true) {
      const stageGain = Math.max(0, stage - previousStage);
      freespinsAwarded = stageGain * BONUS_STAGE_FREESPIN_AWARD;
      if (freespinsAwarded > 0 && gameState.bonusState) {
        gameState.bonusState.finalFreespins = Math.max(
          0,
          Number(gameState.bonusState.finalFreespins || 0) + freespinsAwarded
        );
      }
    }

    gameState.bonusStage = stage;
    gameState.heroFootprintSize = heroFootprintSize;
    gameState.giantMonkeyActive = giantMonkeyActive;
    gameState.rushActive = rushActive;
    if (gameState.heroPosition) {
      gameState.heroPosition = this.normalizeHeroAnchorForSize(gameState.heroPosition, heroFootprintSize);
    }

    gameState.bonusStageEvent = stage !== previousStage || freespinsAwarded > 0
      ? {
          previousStage,
          stage,
          freespinsAwarded,
          rushActivated: rushActive && previousStage < BONUS_RUSH_START_STAGE,
          giantMonkeyActivated,
          previousHeroFootprintSize,
          heroFootprintSize
        }
      : null;

    return {
      previousStage,
      stage,
      freespinsAwarded,
      rushActive,
      giantMonkeyActive,
      heroFootprintSize
    };
  }

  syncBonusEntryFreespins(gameState) {
    if (!gameState || typeof gameState !== "object") return BONUS_BASE_ENTRY_FREESPINS;

    const meter = this.normalizeDemonMeter(gameState);
    const entryFreespins = resolveBonusEntryFreespins(meter.count);

    if (!gameState.bonusWon || typeof gameState.bonusWon !== "object") {
      gameState.bonusWon = { won: true, enterBonusWith: { freespins: entryFreespins } };
    }
    if (!gameState.bonusWon.enterBonusWith || typeof gameState.bonusWon.enterBonusWith !== "object") {
      gameState.bonusWon.enterBonusWith = {};
    }

    gameState.bonusWon.enterBonusWith.freespins = entryFreespins;
    return entryFreespins;
  }

  syncHeavenHellPortalBonusFlag(gameState) {
    if (!gameState || typeof gameState !== "object") return false;
    if (!gameState.bonusWon || typeof gameState.bonusWon !== "object") {
      gameState.bonusWon = { won: true, enterBonusWith: {} };
    }
    if (!gameState.bonusWon.enterBonusWith || typeof gameState.bonusWon.enterBonusWith !== "object") {
      gameState.bonusWon.enterBonusWith = {};
    }

    const existingFlag = gameState.bonusWon.enterBonusWith.portalBonus;
    if (typeof existingFlag === "boolean") {
      return existingFlag;
    }

    const chanceOnEntry = Number(this.getHeavenHellConfig()?.bonus?.portalBonusChanceOnEntry ?? 0.25);
    const shouldGrantPortalBonus = this.rollChance(chanceOnEntry);
    gameState.bonusWon.enterBonusWith.portalBonus = shouldGrantPortalBonus;
    return shouldGrantPortalBonus;
  }

  getBonusStageSuspenseChanceMultiplier(rawBananasAway = null, remainingFreespins = null) {
    const throttle = serverConfig.freespinConfig?.chestProximityThrottle;
    if (!throttle?.enabled) {
      return 1;
    }

    const bananasAway = Number.isFinite(Number(rawBananasAway))
      ? Math.max(0, Math.floor(Number(rawBananasAway) || 0))
      : null;
    if (bananasAway === null) {
      return 1;
    }

    const parsedRemainingFreespins = Number(remainingFreespins);
    if (Number.isFinite(parsedRemainingFreespins) && parsedRemainingFreespins <= 0) {
      return 1;
    }

    for (const threshold of Array.isArray(throttle.thresholds) ? throttle.thresholds : []) {
      if (bananasAway <= Number(threshold?.bananasAway)) {
        const parsedMultiplier = Number(threshold?.chanceMultiplier);
        return Number.isFinite(parsedMultiplier) ? Math.max(0, parsedMultiplier) : 1;
      }
    }

    return 1;
  }

  addDemonMeterProgress(gameState, rawAmount = 0) {
    const meter = this.normalizeDemonMeter(gameState);
    const amount = Math.max(0, Math.floor(Number(rawAmount) || 0));
    if (amount <= 0) return meter;

    const nextCount = Math.min(MAX_BANANA_METER_COUNT, meter.count + amount);
    const nextLevel = resolveDemonMeterLevel(nextCount);
    gameState.bananaMeter = { count: nextCount, level: nextLevel };
    gameState.bananaMeterCount = nextCount;
    gameState.bananaMeterLevel = nextLevel;
    this.activeDemonMeterLevel = nextLevel;

    return gameState.bananaMeter;
  }

  shouldTriggerBonusFromDemonMeter(gameState) {
    if (!gameState || gameState.isBonus) return false;
    if (gameState.bonusTriggered) return true;

    const meter = this.normalizeDemonMeter(gameState);
    return meter.count >= BANANA_BONUS_TRIGGER_COUNT;
  }

  getHeroWildStrengthByMeterLevel(rawLevel = 0) {
    const level = Math.max(0, Math.floor(Number(rawLevel) || 0));
    // Meter milestones:
    // 10 bananas -> +1W (strength 2)
    // 15 bananas -> +1W (strength 3)
    // 20/25/30 are T/TK/TK+ form milestones, not extra wild-strength upgrades.
    if (level >= 2) return 3;
    if (level >= 1) return 2;
    return 1;
  }

  getMainGameHeroWildStrengthByMeterLevel(rawLevel = 0) {
    const overrideStrength = Number(serverConfig.monkeyWildStrengthOverrideMain);
    if (Number.isFinite(overrideStrength) && overrideStrength >= 1) {
      return Math.max(1, Math.floor(overrideStrength));
    }

    return this.getHeroWildStrengthByMeterLevel(rawLevel);
  }

  getDestroyCollectChanceByMeterLevel(rawLevel = 0) {
    const level = Math.max(0, Math.floor(Number(rawLevel) || 0));
    if (level >= 3) return 1;
    return 0;
  }

  getCollectableBonusSymbolId(rawSymbol) {
    const parsed = Number(rawSymbol);
    if (!Number.isFinite(parsed)) return null;
    const payoutSymbols = Array.isArray(serverConfig.payoutSymbols) ? serverConfig.payoutSymbols : [];
    return payoutSymbols.includes(parsed) ? parsed : null;
  }

  getPresentBonusMultiplierFruitCandidates(reels = null) {
    const candidates = [];
    const seen = new Set();
    if (!reels || typeof reels !== "object") return candidates;

    for (let reel = 0; reel < this.width; reel++) {
      const column = reels?.[reel];
      if (!Array.isArray(column)) continue;
      for (let row = 0; row < this.height; row++) {
        if (this.isHouse(reel, row)) continue;
        const symbolId = this.getCollectableBonusSymbolId(column[row]);
        if (symbolId === null || seen.has(symbolId)) continue;
        seen.add(symbolId);
        candidates.push(symbolId);
      }
    }

    return candidates;
  }

  getBonusMultiplierFruitStateSource(gameState = null) {
    if (!gameState || typeof gameState !== "object") return null;
    return gameState.bonusMultiplierFruits || gameState.bonusState?.bonusMultiplierFruits || null;
  }

  normalizeBonusMultiplierFruitState(rawState = null) {
    if (!rawState || typeof rawState !== "object") return null;

    const rawSelected = Array.isArray(rawState.selectedSymbols)
      ? rawState.selectedSymbols
      : (Array.isArray(rawState.symbols) ? rawState.symbols : []);
    const rawAssigned = Array.isArray(rawState.assigned) ? rawState.assigned : [];
    const candidates = rawSelected.length > 0
      ? rawSelected
      : rawAssigned.map((entry) => entry?.symbol ?? entry?.symbolId);
    const selectedSymbols = [];
    const seen = new Set();

    candidates.forEach((symbol) => {
      const symbolId = this.getCollectableBonusSymbolId(symbol);
      if (symbolId === null || seen.has(symbolId)) return;
      seen.add(symbolId);
      selectedSymbols.push(symbolId);
    });

    const cappedSymbols = selectedSymbols.slice(0, BONUS_MULTIPLIER_FRUIT_MAX);
    if (cappedSymbols.length === 0) return null;

    const rawMultiplierBySymbol = isPlainObject(rawState.multiplierBySymbol)
      ? rawState.multiplierBySymbol
      : {};
    const rawAssignedBySymbol = new Map(
      rawAssigned
        .map((entry) => [String(entry?.symbol ?? entry?.symbolId), Number(entry?.multiplier)])
        .filter(([symbol, multiplier]) => symbol !== "undefined" && Number.isFinite(multiplier))
    );
    const multiplierBySymbol = {};
    const assigned = cappedSymbols.map((symbolId, index) => {
      const key = String(symbolId);
      const configured = Number(
        rawMultiplierBySymbol[key] ??
        rawMultiplierBySymbol[symbolId] ??
        rawAssignedBySymbol.get(key)
      );
      const fallback = BONUS_MULTIPLIER_FRUIT_VALUES[index] ?? 2;
      const multiplier = BONUS_MULTIPLIER_FRUIT_VALUES.includes(configured) ? configured : fallback;
      multiplierBySymbol[key] = multiplier;
      return {
        symbol: symbolId,
        multiplier,
        rank: index + 1
      };
    });

    return {
      selectedSymbols: cappedSymbols,
      multiplierBySymbol,
      assigned,
      maxSelected: BONUS_MULTIPLIER_FRUIT_MAX
    };
  }

  buildBonusMultiplierFruitState(selectedSymbols = []) {
    return this.normalizeBonusMultiplierFruitState({ selectedSymbols }) || {
      selectedSymbols: [],
      multiplierBySymbol: {},
      assigned: [],
      maxSelected: BONUS_MULTIPLIER_FRUIT_MAX
    };
  }

  ensureBonusMultiplierFruitState(gameState, { reroll = false } = {}) {
    if (!gameState || typeof gameState !== "object") return null;

    const existingState = this.normalizeBonusMultiplierFruitState(this.getBonusMultiplierFruitStateSource(gameState));
    if (existingState && reroll !== true) {
      gameState.bonusMultiplierFruits = existingState;
      if (gameState.bonusState && typeof gameState.bonusState === "object") {
        gameState.bonusState.bonusMultiplierFruits = existingState;
      }
      return existingState;
    }

    const candidates = this.getPresentBonusMultiplierFruitCandidates(gameState.reels);
    if (candidates.length === 0) {
      gameState.bonusMultiplierFruits = null;
      if (gameState.bonusState && typeof gameState.bonusState === "object") {
        gameState.bonusState.bonusMultiplierFruits = null;
      }
      return null;
    }

    const shuffled = [...candidates];
    for (let index = shuffled.length - 1; index > 0; index--) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
    }

    const maxCount = Math.min(BONUS_MULTIPLIER_FRUIT_MAX, shuffled.length);
    const selectedCount = 1 + Math.floor(Math.random() * maxCount);
    const state = this.buildBonusMultiplierFruitState(shuffled.slice(0, selectedCount));
    gameState.bonusMultiplierFruits = state;
    if (gameState.bonusState && typeof gameState.bonusState === "object") {
      gameState.bonusState.bonusMultiplierFruits = state;
    }
    return state;
  }

  getBonusMultiplierForSymbol(symbolId, gameState = null) {
    const key = String(this.getCollectableBonusSymbolId(symbolId));
    if (key === "null") return null;

    const state = this.normalizeBonusMultiplierFruitState(this.getBonusMultiplierFruitStateSource(gameState));
    if (!state || !hasOwn(state.multiplierBySymbol, key)) return null;

    const multiplier = Number(state.multiplierBySymbol[key]);
    return BONUS_MULTIPLIER_FRUIT_VALUES.includes(multiplier) ? multiplier : null;
  }

  isBonusCenterMachineCollectableSymbol(symbolId, gameState = null) {
    const collectableSymbolId = this.getCollectableBonusSymbolId(symbolId);
    if (collectableSymbolId === null) return false;

    const dynamicState = this.normalizeBonusMultiplierFruitState(this.getBonusMultiplierFruitStateSource(gameState));
    if (dynamicState) {
      return this.getBonusMultiplierForSymbol(collectableSymbolId, gameState) !== null;
    }

    const baseDefinition = this.getBonusEndFallenSymbolMap()?.[String(collectableSymbolId)];
    return Number(baseDefinition?.multiplier) > 1;
  }

  isBonusEndStoredCollectedSymbol(symbolId, gameState = null) {
    const collectableSymbolId = this.getCollectableBonusSymbolId(symbolId);
    if (collectableSymbolId === null) return false;

    return !this.isBonusImmediateLowSymbol(collectableSymbolId, gameState);
  }

  isBonusImmediateLowSymbol(rawSymbol, gameState = null) {
    const symbolId = this.getCollectableBonusSymbolId(rawSymbol);
    if (symbolId === null) return false;
    if (this.getBonusMultiplierForSymbol(symbolId, gameState) !== null) return false;
    if (this.normalizeBonusMultiplierFruitState(this.getBonusMultiplierFruitStateSource(gameState))) return true;
    return BONUS_IMMEDIATE_LOW_SYMBOLS.has(symbolId);
  }

  normalizeBonusImmediateLowPositionLandings(rawLandings = null, gameState = null) {
    const normalized = [];
    (Array.isArray(rawLandings) ? rawLandings : []).forEach((entry) => {
      const symbolId = this.getCollectableBonusSymbolId(entry?.symbol ?? entry?.symbolId);
      if (!this.isBonusImmediateLowSymbol(symbolId, gameState)) return;

      const reel = Math.floor(Number(entry?.reel));
      const row = Math.floor(Number(entry?.row));
      if (!Number.isFinite(reel) || !Number.isFinite(row)) return;
      if (reel < 0 || reel >= this.width || row < 0 || row >= this.height) return;
      if (this.isHouse(reel, row)) return;

      normalized.push({
        reel,
        row,
        symbol: symbolId,
        valueTbm: Number.isFinite(Number(entry?.valueTbm))
          ? Math.max(0, Number(entry.valueTbm))
          : undefined
      });
    });
    return normalized;
  }

  normalizeBonusCollectedSymbolCounts(rawCounts = null, gameState = null) {
    const normalized = {};
    const payoutSymbols = Array.isArray(serverConfig.payoutSymbols) ? serverConfig.payoutSymbols : [];

    payoutSymbols.forEach((symbolId) => {
      if (!this.isBonusEndStoredCollectedSymbol(symbolId, gameState)) return;
      const value = Math.max(
        0,
        Math.floor(Number(rawCounts?.[symbolId] ?? rawCounts?.[String(symbolId)] ?? 0) || 0)
      );
      if (value > 0) {
        normalized[String(symbolId)] = value;
      }
    });

    return normalized;
  }

  syncBonusCollectedSymbolsOnState(gameState) {
    if (!gameState || typeof gameState !== "object") {
      return {};
    }

    if (!gameState.bonusState || typeof gameState.bonusState !== "object") {
      gameState.bonusState = {};
    }

    const counts = this.normalizeBonusCollectedSymbolCounts(gameState.bonusState.collectedSymbolCounts, gameState);
    const total = Object.values(counts).reduce((sum, value) => sum + Number(value || 0), 0);
    const immediateLowPositionLandings = this.normalizeBonusImmediateLowPositionLandings(
      gameState.bonusState.immediateLowPositionLandings,
      gameState
    );

    gameState.bonusState.collectedSymbolCounts = counts;
    gameState.bonusState.collectedSymbolsTotal = total;
    gameState.bonusState.immediateLowPositionLandings = immediateLowPositionLandings;
    gameState.bonusCollectedSymbols = { ...counts };
    if (!Array.isArray(gameState.bonusCollectedThisAction)) {
      gameState.bonusCollectedThisAction = [];
    }

    return counts;
  }

  addBonusCollectedSymbols(gameState, collectedSymbols = []) {
    this.syncBonusCollectedSymbolsOnState(gameState);
    if (!Array.isArray(collectedSymbols) || collectedSymbols.length === 0) {
      gameState.bonusCollectedThisAction = [];
      return [];
    }

    const normalizedEvents = [];
    collectedSymbols.forEach((entry) => {
      const symbolId = this.getCollectableBonusSymbolId(entry?.symbol ?? entry?.symbolId ?? entry);
      if (symbolId === null) return;

      const reel = Math.floor(Number(entry?.reel));
      const row = Math.floor(Number(entry?.row));
      const hasBoardPosition = Number.isFinite(reel) && Number.isFinite(row);
      const immediatePositionUpgrade =
        gameState?.isBonus === true &&
        hasBoardPosition &&
        reel >= 0 &&
        reel < this.width &&
        row >= 0 &&
        row < this.height &&
        this.isBonusImmediateLowSymbol(symbolId, gameState) &&
        !this.isHouse(reel, row);
      const centerMachineCollect =
        gameState?.isBonus === true &&
        !immediatePositionUpgrade &&
        this.isBonusCenterMachineCollectableSymbol(symbolId, gameState);
      const storedForBonusEnd =
        gameState?.isBonus === true &&
        !immediatePositionUpgrade &&
        this.isBonusEndStoredCollectedSymbol(symbolId, gameState);
      const explicitValueTbm = Number(
        entry?.valueTbm ??
        entry?.paytableValueTbm ??
        entry?.baseValueTbm ??
        entry?.bm
      );
      const hasExplicitValueTbm = Number.isFinite(explicitValueTbm) && explicitValueTbm > 0;

      if (immediatePositionUpgrade) {
        if (!Array.isArray(gameState.bonusState.immediateLowPositionLandings)) {
          gameState.bonusState.immediateLowPositionLandings = [];
        }
        const immediateLanding = {
          reel,
          row,
          symbol: symbolId
        };
        if (hasExplicitValueTbm) {
          immediateLanding.valueTbm = Number(explicitValueTbm.toFixed(4));
        }
        gameState.bonusState.immediateLowPositionLandings.push(immediateLanding);
      } else if (storedForBonusEnd) {
        const key = String(symbolId);
        const current = Number(gameState.bonusState.collectedSymbolCounts?.[key] || 0);
        gameState.bonusState.collectedSymbolCounts[key] = current + 1;
      }

      normalizedEvents.push({
        reel: hasBoardPosition ? reel : Number(entry?.reel),
        row: hasBoardPosition ? row : Number(entry?.row),
        symbol: symbolId,
        immediatePositionUpgrade,
        centerMachineCollect,
        storedForBonusEnd,
        valueTbm: hasExplicitValueTbm ? Number(explicitValueTbm.toFixed(4)) : undefined
      });
    });

    this.syncBonusCollectedSymbolsOnState(gameState);
    gameState.bonusCollectedThisAction = normalizedEvents;
    return normalizedEvents;
  }

  collectBonusSymbolsFromClusters(reels, clusters = []) {
    if (!Array.isArray(clusters) || clusters.length === 0) return [];

    const uniquePositions = new Set();
    const collectedSymbols = [];

    clusters.forEach((cluster) => {
      const clusterPaytableValueTbm = Number(cluster?.bm);
      const valueTbm = Number.isFinite(clusterPaytableValueTbm) && clusterPaytableValueTbm > 0
        ? Number(clusterPaytableValueTbm.toFixed(4))
        : undefined;

      cluster?.positions?.forEach?.((pos) => {
        const posKey = `${pos.reel},${pos.row}`;
        if (uniquePositions.has(posKey)) return;
        uniquePositions.add(posKey);

        const symbolId = this.getCollectableBonusSymbolId(pos?.symbol ?? reels?.[pos.reel]?.[pos.row]);
        if (symbolId === null) return;

        collectedSymbols.push({
          reel: pos.reel,
          row: pos.row,
          symbol: symbolId,
          valueTbm
        });
      });
    });

    return collectedSymbols;
  }

  /** Default bonus-end “falling symbol” payout per paying symbol id (string keys "1"…"7"). */
  getDefaultBonusEndFallenSymbolMap() {
    return {
      "1": { baseTbm: 4, multiplier: 4, emptySlotBaseTbm: 0.4 },
      "2": { baseTbm: 3, multiplier: 3, emptySlotBaseTbm: 0.3 },
      "3": { baseTbm: 2, multiplier: 2, emptySlotBaseTbm: 0.2 },
      "4": { baseTbm: 0.5, multiplier: 1, emptySlotBaseTbm: 0 },
      "5": { baseTbm: 0.5, multiplier: 1, emptySlotBaseTbm: 0 },
      "6": { baseTbm: 0.5, multiplier: 1, emptySlotBaseTbm: 0 },
      "7": { baseTbm: 0.5, multiplier: 1, emptySlotBaseTbm: 0 }
    };
  }

  /**
   * Merged map: symbol id string -> { baseTbm, multiplier, emptySlotBaseTbm }.
   * `server_config.bonusEndFallenSymbols` uses per-id keys like "7": { ... }.
   * Legacy keys "low" / "mid" / "high" are ignored.
   */
  getBonusEndFallenSymbolMap() {
    const defaults = this.getDefaultBonusEndFallenSymbolMap();
    const raw = serverConfig.bonusEndFallenSymbols;
    const out = {};
    for (const key of Object.keys(defaults)) {
      out[key] = { ...defaults[key] };
    }
    if (!raw || typeof raw !== "object") return out;
    for (const [k, v] of Object.entries(raw)) {
      if (k === "low" || k === "mid" || k === "high") continue;
      const id = String(k);
      const base = out[id] || { baseTbm: 0, multiplier: 1, emptySlotBaseTbm: 0 };
      out[id] = {
        ...base,
        ...(typeof v === "object" && v !== null ? v : {})
      };
    }
    return out;
  }

  /**
   * Landing phases (order + timing). Default: low symbols first, then mid, then high.
   * Optional `server_config.bonusEndFallenSymbolPhases`: array of symbol-id arrays, e.g. [[7,6,5,4],[3,2],[1]],
   * or full objects: [{ "symbolIds": [...], "minDurationMs": 600, ... }, ...].
   */
  getBonusEndFallenPhaseDefinitions(gameState = null) {
    const defaultMeta = [
      { minDurationMs: 600, maxDurationMs: 2000, splashIntensity: "heavy", perSymbolMs: 70 },
      { minDurationMs: 1000, maxDurationMs: 8000, splashIntensity: "medium", perSymbolMs: 420 },
      { minDurationMs: 1000, maxDurationMs: 8000, splashIntensity: "medium", perSymbolMs: 420 }
    ];
    const defaultSymbolPhases = [[7, 6, 5, 4], [3, 2], [1]];
    const raw = serverConfig.bonusEndFallenSymbolPhases;

    const pickMeta = (index) =>
      defaultMeta[Math.min(index, defaultMeta.length - 1)] || defaultMeta[defaultMeta.length - 1];

    const phaseDefinitions = (!Array.isArray(raw) || raw.length === 0)
      ? defaultSymbolPhases.map((symbolIds, index) => {
        const m = pickMeta(index);
        return {
          id: `phase_${index}`,
          symbolIds: [...symbolIds],
          ...m
        };
      })
      : raw.map((phase, index) => {
      const m = pickMeta(index);
      if (Array.isArray(phase)) {
        return {
          id: `phase_${index}`,
          symbolIds: phase.map((id) => Number(id)),
          ...m
        };
      }
      if (phase && typeof phase === "object") {
        const ids = Array.isArray(phase.symbolIds) ? phase.symbolIds.map((id) => Number(id)) : [];
        return {
          id: String(phase.id || `phase_${index}`),
          symbolIds: ids,
          minDurationMs: Number(phase.minDurationMs) || m.minDurationMs,
          maxDurationMs: Number(phase.maxDurationMs) || m.maxDurationMs,
          splashIntensity: phase.splashIntensity || m.splashIntensity,
          perSymbolMs: Number(phase.perSymbolMs) || m.perSymbolMs
        };
      }
      return { id: `phase_${index}`, symbolIds: [], ...m };
    });

    const dynamicState = this.normalizeBonusMultiplierFruitState(this.getBonusMultiplierFruitStateSource(gameState));
    if (!dynamicState) {
      return phaseDefinitions;
    }

    const selected = new Set(dynamicState.selectedSymbols.map((symbolId) => Number(symbolId)));
    const payoutSymbols = (Array.isArray(serverConfig.payoutSymbols) ? serverConfig.payoutSymbols : [])
      .map((symbolId) => this.getCollectableBonusSymbolId(symbolId))
      .filter((symbolId, index, list) => symbolId !== null && list.indexOf(symbolId) === index);
    const valueSymbols = payoutSymbols.filter((symbolId) => !selected.has(symbolId));
    const middleMultiplierSymbols = dynamicState.assigned
      .filter((entry) => Number(entry?.multiplier) === 2 || Number(entry?.multiplier) === 3)
      .map((entry) => Number(entry.symbol))
      .filter((symbolId) => Number.isFinite(symbolId));
    const topMultiplierSymbols = dynamicState.assigned
      .filter((entry) => Number(entry?.multiplier) >= 4)
      .map((entry) => Number(entry.symbol))
      .filter((symbolId) => Number.isFinite(symbolId));
    const dynamicGroups = [valueSymbols, middleMultiplierSymbols, topMultiplierSymbols];

    return phaseDefinitions.map((phase, index) => ({
      ...phase,
      symbolIds: dynamicGroups[index] ? [...dynamicGroups[index]] : []
    }));
  }

  resolveBonusEndFallenSymbol(symbolId, gameState = null) {
    const key = String(this.getCollectableBonusSymbolId(symbolId));
    const map = this.getBonusEndFallenSymbolMap();
    const baseDefinition = map[key] || null;
    if (!baseDefinition) return null;

    const multiplier = this.getBonusMultiplierForSymbol(symbolId, gameState);
    const dynamicState = this.normalizeBonusMultiplierFruitState(this.getBonusMultiplierFruitStateSource(gameState));
    if (!dynamicState) {
      return baseDefinition;
    }

    if (multiplier !== null) {
      const emptySlotBaseTbm = Number((multiplier / 10).toFixed(4));
      return {
        ...baseDefinition,
        multiplier,
        emptySlotBaseTbm
      };
    }

    return {
      ...baseDefinition,
      multiplier: 1
    };
  }

  getBonusEndSymbolValueTbm(symbolId, gameState = null) {
    const def = this.resolveBonusEndFallenSymbol(symbolId, gameState);
    if (!def) return 0;
    const mult = Number(def.multiplier) || 1;
    if (mult > 1) {
      const empty = Number(def.emptySlotBaseTbm);
      return Number.isFinite(empty) ? empty : mult;
    }
    return Number(def.baseTbm) || 0;
  }

  getBonusEndLandingPositions() {
    const positions = [];
    for (let row = this.height - 1; row >= 0; row--) {
      for (let reel = 0; reel < this.width; reel++) {
        if (this.isHouse(reel, row)) continue;
        positions.push({ reel, row });
      }
    }
    return positions;
  }

  getBonusEndMultiplierFruitTargetingConfig() {
    const raw = isPlainObject(serverConfig?.bonusEndMultiplierFruitTargeting)
      ? serverConfig.bonusEndMultiplierFruitTargeting
      : {};
    const rawGluedTargets = isPlainObject(raw?.gluedAreaTargets) ? raw.gluedAreaTargets : {};
    const parseNumber = (value, fallback) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : fallback;
    };
    const extraCellWeightFactor = Math.max(
      0,
      Math.min(1, parseNumber(rawGluedTargets?.extraCellWeightFactor, 0.35))
    );
    const weightMultiplier = Math.max(
      0.05,
      Math.min(5, parseNumber(rawGluedTargets?.weightMultiplier, 1.15))
    );
    const maxWeight = Math.max(
      1,
      Math.min(25, parseNumber(rawGluedTargets?.maxWeight, 3.5))
    );
    const rawTargetValuePenalty = isPlainObject(raw?.targetValuePenalty) ? raw.targetValuePenalty : {};
    const mediumValueThresholdTbm = Math.max(0, parseNumber(rawTargetValuePenalty?.mediumThresholdTbm, 5));
    const heavyValueThresholdTbm = Math.max(
      mediumValueThresholdTbm,
      parseNumber(rawTargetValuePenalty?.heavyThresholdTbm, 10)
    );
    const extremeValueThresholdTbm = Math.max(
      heavyValueThresholdTbm,
      parseNumber(rawTargetValuePenalty?.extremeThresholdTbm, 50)
    );
    const mediumValueWeightMultiplier = Math.max(
      0,
      Math.min(1, parseNumber(rawTargetValuePenalty?.mediumWeightMultiplier, 0.67))
    );
    const heavyValueWeightMultiplier = Math.max(
      0,
      Math.min(mediumValueWeightMultiplier, parseNumber(rawTargetValuePenalty?.heavyWeightMultiplier, 0.5))
    );
    const extremeValueWeightMultiplier = Math.max(
      0,
      Math.min(heavyValueWeightMultiplier, parseNumber(rawTargetValuePenalty?.extremeWeightMultiplier, 0.25))
    );
    const gluedAreaRelief = Math.max(
      0,
      Math.min(1, parseNumber(rawTargetValuePenalty?.gluedAreaRelief, 0.35))
    );

    return {
      gluedAreaTargets: {
        enabled: rawGluedTargets?.enabled !== false,
        extraCellWeightFactor,
        weightMultiplier,
        maxWeight
      },
      targetValuePenalty: {
        enabled: rawTargetValuePenalty?.enabled !== false,
        mediumValueThresholdTbm,
        heavyValueThresholdTbm,
        extremeValueThresholdTbm,
        mediumValueWeightMultiplier,
        heavyValueWeightMultiplier,
        extremeValueWeightMultiplier,
        gluedAreaRelief
      }
    };
  }

  getBonusEndTargetValuePenaltyMultiplier(effectiveTargetTbm = 0, config = null) {
    const penaltyConfig = isPlainObject(config) ? config : {};
    if (penaltyConfig.enabled === false) return 1;
    const parseNumber = (value, fallback) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : fallback;
    };

    const valueTbm = Math.max(0, Number(effectiveTargetTbm) || 0);
    if (valueTbm >= parseNumber(penaltyConfig?.extremeValueThresholdTbm, 50)) {
      return Math.max(0, parseNumber(penaltyConfig?.extremeValueWeightMultiplier, 0.25));
    }
    if (valueTbm >= parseNumber(penaltyConfig?.heavyValueThresholdTbm, 10)) {
      return Math.max(0, parseNumber(penaltyConfig?.heavyValueWeightMultiplier, 0.5));
    }
    if (valueTbm >= parseNumber(penaltyConfig?.mediumValueThresholdTbm, 5)) {
      return Math.max(0, parseNumber(penaltyConfig?.mediumValueWeightMultiplier, 0.67));
    }
    return 1;
  }

  applyBonusEndGluedAreaPenaltyRelief(penaltyMultiplier = 1, relief = 0) {
    const penalty = Math.max(0, Number(penaltyMultiplier) || 0);
    if (penalty >= 1) return penalty;
    const reliefRatio = Math.max(0, Math.min(1, Number(relief) || 0));
    return Number((penalty + ((1 - penalty) * reliefRatio)).toFixed(4));
  }

  getBonusEndGluedAreaTargetWeight(cellCount = 1, config = null) {
    const count = Math.max(1, Math.floor(Number(cellCount) || 1));
    const rawConfig = isPlainObject(config) ? config : {};
    if (rawConfig.enabled === false || count <= 1) return 1;

    const parseNumber = (value, fallback) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : fallback;
    };
    const extraCellWeightFactor = Math.max(0, parseNumber(rawConfig.extraCellWeightFactor, 0.35));
    const weightMultiplier = Math.max(0.05, parseNumber(rawConfig.weightMultiplier, 1.15));
    const maxWeight = Math.max(1, parseNumber(rawConfig.maxWeight, 3.5));
    const weight = (1 + Math.max(0, count - 1) * extraCellWeightFactor) * weightMultiplier;
    return Number(Math.max(1, Math.min(maxWeight, weight)).toFixed(4));
  }

  buildBonusEndMultiplierFruitTargetPool(boardPositions = [], mergeAreaLookup = null, targetingConfig = null) {
    const gluedTargetConfig = isPlainObject(targetingConfig?.gluedAreaTargets)
      ? targetingConfig.gluedAreaTargets
      : {};
    const gluedTargetsEnabled = gluedTargetConfig.enabled !== false;
    const targets = [];
    const addedAreaIds = new Set();

    (Array.isArray(boardPositions) ? boardPositions : []).forEach((position) => {
      const reel = Math.floor(Number(position?.reel));
      const row = Math.floor(Number(position?.row));
      if (!Number.isFinite(reel) || !Number.isFinite(row) || this.isHouse(reel, row)) return;

      const positionKey = `${reel},${row}`;
      const mergedArea = mergeAreaLookup instanceof Map ? mergeAreaLookup.get(positionKey) : null;
      const areaPositions = this.normalizeMergeGunHighlightPositions(mergedArea?.positions);
      if (gluedTargetsEnabled && areaPositions.length > 1) {
        const areaId = String(
          mergedArea?.id ||
          areaPositions.map((cell) => `${cell.reel},${cell.row}`).join("|")
        );
        if (addedAreaIds.has(areaId)) return;
        addedAreaIds.add(areaId);
        targets.push({
          type: "gluedArea",
          mergeAreaId: areaId,
          mergeArea: mergedArea,
          positions: areaPositions,
          cellCount: areaPositions.length,
          weight: this.getBonusEndGluedAreaTargetWeight(areaPositions.length, gluedTargetConfig)
        });
        return;
      }

      targets.push({
        type: "position",
        reel,
        row,
        positions: [{ reel, row }],
        cellCount: 1,
        weight: 1
      });
    });

    return targets;
  }

  getBonusEndLandingTargetEffectiveTbm(target = null, positionStates = null, betSize = 0) {
    const positions = this.normalizeMergeGunHighlightPositions(target?.positions);
    if (positions.length === 0) return 0;

    if (target?.type === "gluedArea") {
      const areaEntry = this.buildBonusEndMergedAreaEntry(
        { id: target.mergeAreaId || target?.mergeArea?.id, positions },
        positionStates,
        betSize
      );
      const storedAreaTbm = Number(
        target?.mergeArea?.resultValueTbm ??
        target?.mergeArea?.totalTbm ??
        target?.mergeArea?.baseValueTbm ??
        0
      );
      return Math.max(0, Number(areaEntry?.resultValueTbm || 0), Number.isFinite(storedAreaTbm) ? storedAreaTbm : 0);
    }

    const position = positions[0];
    const positionKey = `${position.reel},${position.row}`;
    const state = positionStates instanceof Map ? positionStates.get(positionKey) : null;
    return Math.max(0, Number(state?.resultValueTbm || 0));
  }

  pickBonusEndWeightedLandingTarget(targets = [], positionStates = null, targetingConfig = null, betSize = 0) {
    const valuePenaltyConfig = isPlainObject(targetingConfig?.targetValuePenalty)
      ? targetingConfig.targetValuePenalty
      : {};
    const parsedGluedAreaRelief = Number(valuePenaltyConfig?.gluedAreaRelief);
    const gluedAreaRelief = Math.max(
      0,
      Math.min(1, Number.isFinite(parsedGluedAreaRelief) ? parsedGluedAreaRelief : 0.35)
    );
    const weightedTargets = (Array.isArray(targets) ? targets : [])
      .map((target) => {
        const baseWeight = Math.max(0, Number(target?.weight || 0));
        const effectiveTargetTbm = this.getBonusEndLandingTargetEffectiveTbm(target, positionStates, betSize);
        let valuePenaltyMultiplier = this.getBonusEndTargetValuePenaltyMultiplier(
          effectiveTargetTbm,
          valuePenaltyConfig
        );
        if (target?.type === "gluedArea") {
          valuePenaltyMultiplier = this.applyBonusEndGluedAreaPenaltyRelief(
            valuePenaltyMultiplier,
            gluedAreaRelief
          );
        }
        return {
          ...target,
          baseWeight,
          effectiveTargetTbm,
          valuePenaltyMultiplier,
          weight: Math.max(0, Number((baseWeight * valuePenaltyMultiplier).toFixed(4)))
        };
      })
      .filter((target) => target.weight > 0 && Array.isArray(target.positions) && target.positions.length > 0);
    if (weightedTargets.length === 0) return null;

    const totalWeight = weightedTargets.reduce((sum, target) => sum + Number(target.weight || 0), 0);
    if (!(totalWeight > 0)) {
      return weightedTargets[Math.floor(Math.random() * weightedTargets.length)] || null;
    }

    let roll = Math.random() * totalWeight;
    for (const target of weightedTargets) {
      roll -= Number(target.weight || 0);
      if (roll <= 0) {
        return target;
      }
    }
    return weightedTargets[weightedTargets.length - 1] || null;
  }

  resolveBonusEndLandingTargetPosition(target = null) {
    const positions = this.normalizeMergeGunHighlightPositions(target?.positions);
    if (positions.length === 0) return null;
    return positions[Math.floor(Math.random() * positions.length)] || null;
  }

  getBonusEndBalloonPopConfig() {
    const raw = isPlainObject(serverConfig?.bonusEndBalloonPopFeature)
      ? serverConfig.bonusEndBalloonPopFeature
      : {};
    const tierKeys = ["normal", "good", "veryGood", "superGood"];
    const normalizeNumberMap = (input, defaults, { min = 0, max = Infinity } = {}) => {
      const source = isPlainObject(input) ? input : {};
      const resolved = {};
      tierKeys.forEach((key) => {
        const fallback = Number(defaults?.[key]);
        const parsed = Number(source?.[key]);
        const candidate = Number.isFinite(parsed)
          ? parsed
          : (Number.isFinite(fallback) ? fallback : 0);
        resolved[key] = Math.max(min, Math.min(max, candidate));
      });
      return resolved;
    };
    const normalizeProbabilityMap = (input, defaults) => {
      const source = isPlainObject(input) ? input : {};
      const resolved = {};
      tierKeys.forEach((key) => {
        resolved[key] = this.normalizeProbability(source?.[key], defaults?.[key]);
      });
      return resolved;
    };
    const parseOptionalProbability = (value) => {
      if (value === undefined || value === null) return null;
      return this.normalizeProbability(value, 0);
    };
    const clamp01 = (value, fallback = 0) => {
      const parsed = Number(value);
      if (!Number.isFinite(parsed)) {
        const safeFallback = Number.isFinite(Number(fallback)) ? Number(fallback) : 0;
        return Math.max(0, Math.min(1, safeFallback));
      }
      return Math.max(0, Math.min(1, parsed));
    };
    const defaultBalloons = [
      { id: "blue", spriteKey: "blue_ballon", multiplier: 2, weight: 24 },
      { id: "green", spriteKey: "green_ballon", multiplier: 3, weight: 21 },
      { id: "yellow", spriteKey: "yellow_ballon", multiplier: 4, weight: 18 },
      { id: "purple", spriteKey: "purple_ballon", multiplier: 5, weight: 15 },
      { id: "orange", spriteKey: "orange_ballon", multiplier: 6, weight: 12 },
      { id: "red", spriteKey: "red_ballon", multiplier: 7, weight: 10 }
    ];
    const balloonsRaw = Array.isArray(raw?.balloons) && raw.balloons.length > 0
      ? raw.balloons
      : defaultBalloons;
    const balloons = balloonsRaw
      .map((entry, index) => {
        const normalizedId = String(entry?.id || `balloon_${index}`);
        const normalizedMultiplier = Math.max(2, Math.floor(Number(entry?.multiplier) || 2));
        const normalizedWeight = Number(entry?.weight);
        const weight = Number.isFinite(normalizedWeight) && normalizedWeight > 0 ? normalizedWeight : 1;
        const popChanceOverride = entry?.popChance === undefined || entry?.popChance === null
          ? null
          : this.normalizeProbability(entry.popChance, null);
        return {
          id: normalizedId,
          spriteKey: String(entry?.spriteKey || `${normalizedId}_ballon`),
          multiplier: normalizedMultiplier,
          weight,
          popChance: popChanceOverride
        };
      })
      .filter((entry) => Number(entry?.weight) > 0 && Number(entry?.multiplier) > 1);

    const minBalloons = Math.max(0, Math.floor(Number(raw?.minBalloons) || 0));
    const maxBalloons = Math.max(minBalloons, Math.floor(Number(raw?.maxBalloons) || minBalloons));
    const rawThresholds = isPlainObject(raw?.targetTierThresholds) ? raw.targetTierThresholds : {};
    const goodProjectedTbmMin = Math.max(0, Number(rawThresholds?.goodProjectedTbmMin ?? rawThresholds?.good ?? 15) || 15);
    const veryGoodProjectedTbmMin = Math.max(
      goodProjectedTbmMin,
      Number(rawThresholds?.veryGoodProjectedTbmMin ?? rawThresholds?.veryGood ?? 50) || 50
    );
    const superGoodProjectedTbmMin = Math.max(
      veryGoodProjectedTbmMin,
      Number(rawThresholds?.superGoodProjectedTbmMin ?? rawThresholds?.superGood ?? 100) || 100
    );
    const targetTierWeights = normalizeNumberMap(raw?.targetTierWeights, {
      normal: 1,
      good: 1.35,
      veryGood: 1.75,
      superGood: 2.1
    }, { min: 0.05, max: 20 });
    const targetValuePenalty = isPlainObject(raw?.targetValuePenalty) ? raw.targetValuePenalty : {};
    const mediumValueThresholdTbm = Math.max(0, Number(targetValuePenalty?.mediumThresholdTbm ?? 5) || 5);
    const heavyValueThresholdTbm = Math.max(
      mediumValueThresholdTbm,
      Number(targetValuePenalty?.heavyThresholdTbm ?? 10) || 10
    );
    const extremeValueThresholdTbm = Math.max(
      heavyValueThresholdTbm,
      Number(targetValuePenalty?.extremeThresholdTbm ?? 50) || 50
    );
    const mediumValueWeightMultiplier = Math.max(
      0,
      Math.min(1, Number(targetValuePenalty?.mediumWeightMultiplier ?? 0.67) || 0.67)
    );
    const heavyValueWeightMultiplier = Math.max(
      0,
      Math.min(mediumValueWeightMultiplier, Number(targetValuePenalty?.heavyWeightMultiplier ?? 0.5) || 0.5)
    );
    const extremeValueWeightMultiplier = Math.max(
      0,
      Math.min(heavyValueWeightMultiplier, Number(targetValuePenalty?.extremeWeightMultiplier ?? 0.25) || 0.25)
    );
    const targetSelectionBias = clamp01(raw?.targetSelectionBias, 0.58);
    const targetSelectionNoise = Math.max(0, Math.min(0.6, Number(raw?.targetSelectionNoise ?? 0.14) || 0.14));
    const rawGluedTargets = isPlainObject(raw?.gluedAreaTargets) ? raw.gluedAreaTargets : {};
    const parseNumber = (value, fallback) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : fallback;
    };
    const gluedAreaTargets = {
      enabled: rawGluedTargets?.enabled !== false,
      weightMultiplier: Math.max(0.05, Math.min(5, parseNumber(rawGluedTargets?.weightMultiplier, 1.2))),
      valuePenaltyRelief: clamp01(rawGluedTargets?.valuePenaltyRelief, 0.35)
    };
    const popChanceByTierRaw = isPlainObject(raw?.popChanceByTier) ? raw.popChanceByTier : {};
    const popChanceByTier = {
      normal: parseOptionalProbability(popChanceByTierRaw?.normal),
      good: parseOptionalProbability(popChanceByTierRaw?.good),
      veryGood: parseOptionalProbability(popChanceByTierRaw?.veryGood),
      superGood: parseOptionalProbability(popChanceByTierRaw?.superGood)
    };
    const rawFlightPassOver = isPlainObject(raw?.flightPassOverTarget) ? raw.flightPassOverTarget : {};
    const flightPassOverTarget = {
      enabled: rawFlightPassOver?.enabled !== false,
      chance: this.normalizeProbability(rawFlightPassOver?.chance, 0.72),
      chanceByTier: normalizeProbabilityMap(rawFlightPassOver?.chanceByTier, {
        normal: 0.62,
        good: 0.76,
        veryGood: 0.87,
        superGood: 0.94
      }),
      startXJitterRatioByTier: normalizeNumberMap(rawFlightPassOver?.startXJitterRatioByTier, {
        normal: 0.2,
        good: 0.12,
        veryGood: 0.08,
        superGood: 0.05
      }, { min: 0, max: 0.45 }),
      driftXRatioAbsByTier: normalizeNumberMap(rawFlightPassOver?.driftXRatioAbsByTier, {
        normal: 0.2,
        good: 0.12,
        veryGood: 0.08,
        superGood: 0.05
      }, { min: 0.01, max: 0.45 }),
      randomSideBiasRatioAbsByTier: normalizeNumberMap(rawFlightPassOver?.randomSideBiasRatioAbsByTier, {
        normal: 0.12,
        good: 0.08,
        veryGood: 0.05,
        superGood: 0.03
      }, { min: 0, max: 0.25 })
    };

    return {
      enabled: raw?.enabled === true,
      triggerChance: this.normalizeProbability(raw?.triggerChance, 0),
      minBalloons,
      maxBalloons,
      popChance: this.normalizeProbability(raw?.popChance, 0.65),
      popChanceByTier,
      allowRepeatTargets: raw?.allowRepeatTargets !== false,
      requirePositiveTargets: raw?.requirePositiveTargets !== false,
      targetTierThresholds: {
        goodProjectedTbmMin,
        veryGoodProjectedTbmMin,
        superGoodProjectedTbmMin
      },
      targetValuePenalty: {
        mediumValueThresholdTbm,
        heavyValueThresholdTbm,
        extremeValueThresholdTbm,
        mediumValueWeightMultiplier,
        heavyValueWeightMultiplier,
        extremeValueWeightMultiplier
      },
      targetTierWeights,
      targetSelectionBias,
      targetSelectionNoise,
      gluedAreaTargets,
      flightPassOverTarget,
      balloons
    };
  }

  pickBonusEndBalloonDefinition(balloonDefinitions = []) {
    if (!Array.isArray(balloonDefinitions) || balloonDefinitions.length === 0) return null;
    const totalWeight = balloonDefinitions.reduce((sum, entry) => {
      const weight = Number(entry?.weight);
      return sum + (Number.isFinite(weight) && weight > 0 ? weight : 0);
    }, 0);
    if (!(totalWeight > 0)) return null;

    let roll = Math.random() * totalWeight;
    for (const entry of balloonDefinitions) {
      const weight = Number(entry?.weight);
      if (!(weight > 0)) continue;
      roll -= weight;
      if (roll <= 0) {
        return entry;
      }
    }
    return balloonDefinitions[balloonDefinitions.length - 1] || null;
  }

  getBonusEndBalloonTargetTier(projectedTbm = 0, thresholds = null) {
    const value = Math.max(0, Number(projectedTbm) || 0);
    const resolved = isPlainObject(thresholds) ? thresholds : {};
    const goodMin = Math.max(0, Number(resolved?.goodProjectedTbmMin) || 15);
    const veryGoodMin = Math.max(goodMin, Number(resolved?.veryGoodProjectedTbmMin) || 50);
    const superGoodMin = Math.max(veryGoodMin, Number(resolved?.superGoodProjectedTbmMin) || 100);
    if (value >= superGoodMin) return "superGood";
    if (value >= veryGoodMin) return "veryGood";
    if (value >= goodMin) return "good";
    return "normal";
  }

  pickBonusEndBalloonTargetSelection(targetPool = [], positionStates = null, definition = null, config = null, mergeAreaLookup = null) {
    if (!Array.isArray(targetPool) || targetPool.length === 0) return null;
    const targetSelectionBias = Math.max(0, Math.min(1, Number(config?.targetSelectionBias) || 0));
    const targetSelectionNoise = Math.max(0, Math.min(0.6, Number(config?.targetSelectionNoise) || 0));
    const balloonMultiplier = Math.max(1, Number(definition?.multiplier) || 1);
    const tierWeights = isPlainObject(config?.targetTierWeights) ? config.targetTierWeights : {};
    const valuePenaltyConfig = isPlainObject(config?.targetValuePenalty) ? config.targetValuePenalty : {};
    const weightedCandidates = targetPool.map((targetKey) => {
      const state = positionStates instanceof Map ? positionStates.get(targetKey) : null;
      const beforeResultValueTbm = Math.max(0, Number(state?.resultValueTbm || 0));
      const mergedArea = mergeAreaLookup instanceof Map ? mergeAreaLookup.get(targetKey) : null;
      const mergedAreaResultValueTbm = mergedArea
        ? Math.max(0, Number(this.buildBonusEndMergedAreaEntry(mergedArea, positionStates, 0)?.resultValueTbm || 0))
        : 0;
      const mergedAreaCellCount = this.normalizeMergeGunHighlightPositions(mergedArea?.positions).length;
      const isGluedAreaTarget = mergedAreaCellCount > 1;
      const gluedAreaConfig = isPlainObject(config?.gluedAreaTargets) ? config.gluedAreaTargets : {};
      const gluedAreaTargetsEnabled = gluedAreaConfig.enabled !== false;
      const parseNumber = (value, fallback) => {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : fallback;
      };
      const gluedAreaWeightMultiplier = isGluedAreaTarget && gluedAreaTargetsEnabled
        ? Math.max(0.05, parseNumber(gluedAreaConfig?.weightMultiplier, 1.2))
        : 1;
      const gluedAreaPenaltyRelief = isGluedAreaTarget && gluedAreaTargetsEnabled
        ? Math.max(0, Math.min(1, parseNumber(gluedAreaConfig?.valuePenaltyRelief, 0.35)))
        : 0;
      const effectiveTargetTbm = Math.max(beforeResultValueTbm, mergedAreaResultValueTbm);
      const projectedTargetTbm = Number((effectiveTargetTbm * balloonMultiplier).toFixed(4));
      const targetTier = this.getBonusEndBalloonTargetTier(projectedTargetTbm, config?.targetTierThresholds);
      const tierWeightRaw = Number(tierWeights?.[targetTier]);
      const tierWeight = Number.isFinite(tierWeightRaw) && tierWeightRaw > 0 ? tierWeightRaw : 1;
      const biasedWeight = 1 + (tierWeight - 1) * targetSelectionBias;
      let valuePenaltyMultiplier = 1;
      if (effectiveTargetTbm >= Number(valuePenaltyConfig?.extremeValueThresholdTbm || 50)) {
        valuePenaltyMultiplier = Math.max(0, Number(valuePenaltyConfig?.extremeValueWeightMultiplier ?? 0.25) || 0.25);
      } else if (effectiveTargetTbm >= Number(valuePenaltyConfig?.heavyValueThresholdTbm || 10)) {
        valuePenaltyMultiplier = Math.max(0, Number(valuePenaltyConfig?.heavyValueWeightMultiplier ?? 0.5) || 0.5);
      } else if (effectiveTargetTbm >= Number(valuePenaltyConfig?.mediumValueThresholdTbm || 5)) {
        valuePenaltyMultiplier = Math.max(0, Number(valuePenaltyConfig?.mediumValueWeightMultiplier ?? 0.67) || 0.67);
      }
      if (gluedAreaPenaltyRelief > 0 && valuePenaltyMultiplier < 1) {
        valuePenaltyMultiplier = valuePenaltyMultiplier + ((1 - valuePenaltyMultiplier) * gluedAreaPenaltyRelief);
      }
      const noise = targetSelectionNoise > 0
        ? (1 + ((Math.random() * 2 - 1) * targetSelectionNoise))
        : 1;
      const finalWeight = Math.max(0.0001, biasedWeight * valuePenaltyMultiplier * gluedAreaWeightMultiplier * noise);
      return {
        targetKey,
        targetTier,
        beforeResultValueTbm,
        mergedAreaResultValueTbm,
        mergedAreaCellCount,
        isGluedAreaTarget,
        gluedAreaWeightMultiplier,
        effectiveTargetTbm,
        projectedTargetTbm,
        valuePenaltyMultiplier,
        selectionWeight: finalWeight
      };
    });

    const totalWeight = weightedCandidates.reduce((sum, entry) => sum + Number(entry?.selectionWeight || 0), 0);
    if (!(totalWeight > 0)) {
      const fallback = weightedCandidates[Math.floor(Math.random() * weightedCandidates.length)] || null;
      return fallback;
    }

    let roll = Math.random() * totalWeight;
    for (const candidate of weightedCandidates) {
      roll -= Number(candidate?.selectionWeight || 0);
      if (roll <= 0) {
        return candidate;
      }
    }
    return weightedCandidates[weightedCandidates.length - 1] || null;
  }

  applyBonusEndBalloonPops(positionStates, betSize = 0, mergeAreaLookup = null, options = {}) {
    const config = this.getBonusEndBalloonPopConfig();
    const forcedBalloonCountRaw = Number(options?.forcedBalloonCount);
    const hasForcedBalloonCount = Number.isFinite(forcedBalloonCountRaw) && forcedBalloonCountRaw > 0;
    const forcedBalloonCount = hasForcedBalloonCount
      ? Math.max(0, Math.floor(forcedBalloonCountRaw))
      : 0;
    const allowAnyPositionFallback = options?.allowAnyPositionFallback === true;
    const result = {
      enabled: config.enabled === true,
      triggered: false,
      triggerChance: config.triggerChance,
      balloonCount: 0,
      triggerSource: hasForcedBalloonCount ? "bonusMysteryMeter" : "configRandom",
      forcedBalloonCount,
      poppedCount: 0,
      totalAddedTbm: 0,
      totalAddedTwa: 0,
      events: []
    };
    if (config.enabled !== true) {
      result.reason = "disabled";
      return result;
    }
    let workingPositionStates = positionStates instanceof Map ? positionStates : new Map();
    if (
      workingPositionStates.size === 0 &&
      hasForcedBalloonCount &&
      allowAnyPositionFallback
    ) {
      for (let reel = 0; reel < this.width; reel++) {
        for (let row = 0; row < this.height; row++) {
          if (this.isHouse(reel, row)) continue;
          const key = `${reel},${row}`;
          if (workingPositionStates.has(key)) continue;
          workingPositionStates.set(key, {
            reel,
            row,
            baseValueTbm: 0,
            multiplier: 1,
            hasUpgradeBackplate: false,
            hasNaturalValue: false,
            resultValueTbm: 0,
            resultValueTwa: 0
          });
        }
      }
    }
    if (workingPositionStates.size === 0) {
      result.reason = "noPositionStates";
      return result;
    }
    if (!hasForcedBalloonCount && Math.random() >= config.triggerChance) {
      result.reason = "triggerMiss";
      return result;
    }

    const positiveCandidateKeys = Array.from(workingPositionStates.entries())
      .filter(([_, state]) => {
        if (!state || typeof state !== "object") return false;
        if (config.requirePositiveTargets !== true) return true;
        return Number(state?.resultValueTbm || 0) > 0;
      })
      .map(([key]) => key);
    let candidateKeys = [...positiveCandidateKeys];
    let usingNoPositiveTargetFallbackPool = false;
    if (candidateKeys.length === 0 && allowAnyPositionFallback) {
      candidateKeys = Array.from(workingPositionStates.keys());
      usingNoPositiveTargetFallbackPool = candidateKeys.length > 0;
    }
    if (candidateKeys.length === 0) {
      result.reason = "noEligibleTargets";
      return result;
    }

    const requestedCount = hasForcedBalloonCount
      ? forcedBalloonCount
      : (
        config.maxBalloons <= config.minBalloons
          ? config.minBalloons
          : (Math.floor(Math.random() * (config.maxBalloons - config.minBalloons + 1)) + config.minBalloons)
      );
    const balloonCount = Math.max(0, requestedCount);
    if (balloonCount <= 0) {
      result.reason = "zeroBalloons";
      return result;
    }

    result.triggered = true;
    result.balloonCount = balloonCount;

    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    const getTierValue = (tierMap, tierKey, fallback) => {
      const rawValue = Number(isPlainObject(tierMap) ? tierMap?.[tierKey] : undefined);
      if (Number.isFinite(rawValue)) return rawValue;
      const fallbackValue = Number(fallback);
      return Number.isFinite(fallbackValue) ? fallbackValue : 0;
    };
    const toFixedNumber = (value, digits = 4) => Number(Number(value || 0).toFixed(digits));

    const availableTargetKeys = [...candidateKeys];
    for (let index = 0; index < balloonCount; index++) {
      const definition = this.pickBonusEndBalloonDefinition(config.balloons);
      if (!definition) break;

      const targetPool = config.allowRepeatTargets === true ? candidateKeys : availableTargetKeys;
      if (!Array.isArray(targetPool) || targetPool.length === 0) break;
      const targetSelection = this.pickBonusEndBalloonTargetSelection(
        targetPool,
        workingPositionStates,
        definition,
        config,
        mergeAreaLookup
      );
      if (!targetSelection?.targetKey) break;

      const targetKey = targetSelection.targetKey;
      const targetTier = String(targetSelection.targetTier || "normal");
      const effectiveTargetTbm = Number(targetSelection.effectiveTargetTbm || 0);
      const projectedTargetTbm = Number(targetSelection.projectedTargetTbm || 0);
      const valuePenaltyMultiplier = Number(targetSelection.valuePenaltyMultiplier || 1);
      const gluedAreaWeightMultiplier = Number(targetSelection.gluedAreaWeightMultiplier || 1);
      const selectionWeight = Number(targetSelection.selectionWeight || 0);
      if (config.allowRepeatTargets !== true) {
        const indexInAvailable = availableTargetKeys.indexOf(targetKey);
        if (indexInAvailable >= 0) {
          availableTargetKeys.splice(indexInAvailable, 1);
        }
      }

      const [rawReel, rawRow] = String(targetKey).split(",");
      const reel = Math.floor(Number(rawReel));
      const row = Math.floor(Number(rawRow));
      const targetState = workingPositionStates.get(targetKey);
      const beforeResultValueTbm = Number(targetState?.resultValueTbm || 0);
      const beforeResultValueTwa = Number(targetState?.resultValueTwa || 0);
      const mergedArea = mergeAreaLookup instanceof Map ? mergeAreaLookup.get(targetKey) : null;
      const mergedAreaPositionKeys = mergedArea && Array.isArray(mergedArea?.positions) && mergedArea.positions.length > 0
        ? mergedArea.positions.map((position) => `${position.reel},${position.row}`)
        : [];
      const beforeMergedAreaResultTbm = mergedAreaPositionKeys.reduce((sum, affectedKey) => {
        const state = workingPositionStates.get(affectedKey);
        return sum + Number(state?.resultValueTbm || 0);
      }, 0);
      const positiveMergedAreaPositionKeys = mergedAreaPositionKeys.filter((affectedKey) => {
        const state = workingPositionStates.get(affectedKey);
        return Number(state?.resultValueTbm || 0) > 0;
      });
      const affectedPositionKeys = mergedArea && beforeMergedAreaResultTbm > 0 && positiveMergedAreaPositionKeys.length > 0
        ? positiveMergedAreaPositionKeys
        : [targetKey];
      const tierPopChance = Number(config?.popChanceByTier?.[targetTier]);
      const basePopChance = definition.popChance !== null && definition.popChance !== undefined && Number.isFinite(Number(definition.popChance))
        ? Number(definition.popChance)
        : config.popChance;
      const popChance = Number.isFinite(tierPopChance) ? tierPopChance : basePopChance;
      const fallbackLandingAwardTbm = Number((Math.max(1, Number(definition?.multiplier || 1)) / 10).toFixed(4));
      const allowNoPositiveTargetFallbackAward = usingNoPositiveTargetFallbackPool === true;
      const canApply = Number(beforeResultValueTbm || 0) > 0 || (
        mergedArea &&
        beforeMergedAreaResultTbm > 0 &&
        positiveMergedAreaPositionKeys.length > 0
      ) || allowNoPositiveTargetFallbackAward;
      const popped = canApply && Math.random() < popChance;
      let addedTbm = 0;
      let addedTwa = 0;
      let afterResultValueTbm = beforeResultValueTbm;
      let afterResultValueTwa = beforeResultValueTwa;

      if (popped) {
        let didIncreaseAnyTarget = false;
        let primaryState = targetState;
        affectedPositionKeys.forEach((affectedKey) => {
          const [affectedReelRaw, affectedRowRaw] = String(affectedKey).split(",");
          const affectedReel = Math.floor(Number(affectedReelRaw));
          const affectedRow = Math.floor(Number(affectedRowRaw));
          if (!Number.isFinite(affectedReel) || !Number.isFinite(affectedRow)) return;

          const currentState = workingPositionStates.get(affectedKey);
          if (!currentState || typeof currentState !== "object") {
            return;
          }

          const currentResultValueTbm = Number(currentState.resultValueTbm || 0);
          if (!(currentResultValueTbm > 0)) {
            return;
          }

          const currentMultiplier = Number(currentState.multiplier || 1);
          const nextMultiplier = currentMultiplier * Number(definition.multiplier || 1);
          currentState.multiplier = Number(nextMultiplier.toFixed(4));
          currentState.resultValueTbm = Number((Number(currentState.baseValueTbm || 0) * Number(currentState.multiplier || 1)).toFixed(4));
          currentState.resultValueTwa = Number((Number(currentState.resultValueTbm || 0) * Number(betSize || 0)).toFixed(4));
          workingPositionStates.set(affectedKey, currentState);
          didIncreaseAnyTarget = didIncreaseAnyTarget || Number(currentState.resultValueTbm || 0) > currentResultValueTbm;

          if (affectedKey === targetKey) {
            primaryState = currentState;
          }
        });

        afterResultValueTbm = Number(primaryState?.resultValueTbm || beforeResultValueTbm || 0);
        afterResultValueTwa = Number(primaryState?.resultValueTwa || beforeResultValueTwa || 0);
        addedTbm = Number((afterResultValueTbm - beforeResultValueTbm).toFixed(4));
        addedTwa = Number((afterResultValueTwa - beforeResultValueTwa).toFixed(4));

        if (!didIncreaseAnyTarget && allowNoPositiveTargetFallbackAward) {
          const fallbackTargetState = workingPositionStates.get(targetKey);
          if (fallbackTargetState && typeof fallbackTargetState === "object") {
            const currentBaseValueTbm = Number(fallbackTargetState.baseValueTbm || 0);
            const nextBaseValueTbm = Number((currentBaseValueTbm + fallbackLandingAwardTbm).toFixed(4));
            fallbackTargetState.baseValueTbm = nextBaseValueTbm;
            fallbackTargetState.hasUpgradeBackplate = true;
            fallbackTargetState.resultValueTbm = Number((nextBaseValueTbm * Number(fallbackTargetState.multiplier || 1)).toFixed(4));
            fallbackTargetState.resultValueTwa = Number((Number(fallbackTargetState.resultValueTbm || 0) * Number(betSize || 0)).toFixed(4));
            workingPositionStates.set(targetKey, fallbackTargetState);
            primaryState = fallbackTargetState;
            afterResultValueTbm = Number(primaryState?.resultValueTbm || beforeResultValueTbm || 0);
            afterResultValueTwa = Number(primaryState?.resultValueTwa || beforeResultValueTwa || 0);
            addedTbm = Number((afterResultValueTbm - beforeResultValueTbm).toFixed(4));
            addedTwa = Number((afterResultValueTwa - beforeResultValueTwa).toFixed(4));
            didIncreaseAnyTarget = Number(addedTbm || 0) > 0;
          }
        }

        if (didIncreaseAnyTarget) {
          const mergedAreaAfter = mergedArea
            ? this.buildBonusEndMergedAreaEntry(mergedArea, workingPositionStates, betSize)
            : null;
          const beforeMergedAreaTbm = mergedArea
            ? Number(beforeMergedAreaResultTbm.toFixed(4))
            : beforeResultValueTbm;
          const beforeMergedAreaTwa = mergedArea
            ? Number((beforeMergedAreaTbm * Number(betSize || 0)).toFixed(4))
            : beforeResultValueTwa;
          const addedMergedTbm = mergedArea
            ? Number(((mergedAreaAfter?.resultValueTbm ?? afterResultValueTbm) - beforeMergedAreaTbm).toFixed(4))
            : Number((addedTbm || 0).toFixed(4));
          const addedMergedTwa = mergedArea
            ? Number(((mergedAreaAfter?.resultValueTwa ?? afterResultValueTwa) - beforeMergedAreaTwa).toFixed(4))
            : Number((addedTwa || 0).toFixed(4));

          result.poppedCount += 1;
          result.totalAddedTbm = Number((result.totalAddedTbm + Math.max(0, addedMergedTbm)).toFixed(4));
          result.totalAddedTwa = Number((result.totalAddedTwa + Math.max(0, addedMergedTwa)).toFixed(4));
        }
      }

      const targetXRatio = clamp((reel + 0.5) / Math.max(1, Number(this.width) || 1), 0.02, 0.98);
      const passOverConfig = isPlainObject(config?.flightPassOverTarget) ? config.flightPassOverTarget : {};
      const passOverBaseChance = Number(passOverConfig?.chance);
      const passOverTierChance = getTierValue(
        passOverConfig?.chanceByTier,
        targetTier,
        Number.isFinite(passOverBaseChance) ? passOverBaseChance : 0.72
      );
      const passOverEnabled = passOverConfig?.enabled === true;
      const passOverTarget = passOverEnabled && Math.random() < passOverTierChance;

      const startJitterRatio = getTierValue(
        passOverConfig?.startXJitterRatioByTier,
        targetTier,
        0.14
      );
      const driftXRatioAbs = getTierValue(
        passOverConfig?.driftXRatioAbsByTier,
        targetTier,
        0.14
      );
      const randomSideBiasRatioAbs = getTierValue(
        passOverConfig?.randomSideBiasRatioAbsByTier,
        targetTier,
        0.08
      );
      const startXRatio = passOverTarget
        ? clamp(targetXRatio + ((Math.random() * 2 - 1) * startJitterRatio), 0.02, 0.98)
        : (0.08 + Math.random() * 0.84);
      const driftXRatio = passOverTarget
        ? ((Math.random() * 2 - 1) * driftXRatioAbs)
        : (-0.18 + Math.random() * 0.36);

      result.events.push({
        index,
        balloonId: definition.id,
        spriteKey: definition.spriteKey,
        multiplier: Number(definition.multiplier || 1),
        targetTier,
        effectiveTargetTbm,
        projectedTargetTbm,
        valuePenaltyMultiplier: Number(valuePenaltyMultiplier.toFixed(4)),
        gluedAreaWeightMultiplier: Number(gluedAreaWeightMultiplier.toFixed(4)),
        selectionWeight: Number(selectionWeight.toFixed(4)),
        popChance,
        popped,
        reel,
        row,
        targetPositionKey: targetKey,
        beforeResultValueTbm,
        beforeResultValueTwa,
        afterResultValueTbm,
        afterResultValueTwa,
        addedTbm,
        addedTwa,
        usedNoPositiveTargetFallbackAward: allowNoPositiveTargetFallbackAward && Number(addedTbm || 0) > 0,
        noPositiveTargetFallbackAwardTbm: fallbackLandingAwardTbm,
        mergedAreaId: mergedArea?.id || null,
        mergedAreaPositions: Array.isArray(mergedArea?.positions)
          ? mergedArea.positions.map((position) => ({ reel: position.reel, row: position.row }))
          : [],
        mergedAreaResultValueTbm: mergedArea
          ? Number(this.buildBonusEndMergedAreaEntry(mergedArea, workingPositionStates, betSize).resultValueTbm || 0)
          : afterResultValueTbm,
        mergedAreaResultValueTwa: mergedArea
          ? Number(this.buildBonusEndMergedAreaEntry(mergedArea, workingPositionStates, betSize).resultValueTwa || 0)
          : afterResultValueTwa,
        affectedPositionKeys,
        flight: {
          startXRatio: toFixedNumber(startXRatio),
          driftXRatio: toFixedNumber(driftXRatio),
          passOverTarget,
          randomSideBiasRatioAbs: toFixedNumber(randomSideBiasRatioAbs),
          swayAmplitudeRatio: Number((0.015 + Math.random() * 0.035).toFixed(4)),
          swayCycles: Number((1.4 + Math.random() * 2.4).toFixed(3)),
          riseDurationMs: Math.floor(1500 + Math.random() * 1700),
          popAtProgress: Number((0.65 + Math.random() * 0.3).toFixed(3))
        }
      });
    }

    if (result.events.length === 0) {
      result.triggered = false;
      result.reason = "noEvents";
    }

    return result;
  }

  buildBonusMysteryFeatureReleaseForFreespin(gameState, betSize = 0) {
    const featureState = this.normalizeBonusMysteryFeatureState(gameState);
    const collectedBalloons = Math.max(
      0,
      Math.floor(Number(featureState?.collected || 0) || 0)
    );
    const balloonConfig = this.getBonusEndBalloonPopConfig();
    if (collectedBalloons <= 0) {
      return {
        enabled: balloonConfig.enabled === true,
        triggered: false,
        triggerChance: balloonConfig.triggerChance,
        balloonCount: 0,
        poppedCount: 0,
        totalAddedTbm: 0,
        totalAddedTwa: 0,
        events: [],
        reason: "noCollectedBalloons",
        triggerSource: "freespinStartSymbolClear",
        collectedBalloons
      };
    }

    const landingPositions = this.getBonusEndLandingPositions();
    const positionStates = new Map();
    const minPerCollect = Math.max(0, Math.floor(Number(balloonConfig?.minBalloons) || 0));
    const maxPerCollect = Math.max(minPerCollect, Math.floor(Number(balloonConfig?.maxBalloons) || minPerCollect));
    let forcedBalloonCount = 0;
    for (let index = 0; index < collectedBalloons; index++) {
      const countThisCollect = maxPerCollect <= minPerCollect
        ? minPerCollect
        : (Math.floor(Math.random() * (maxPerCollect - minPerCollect + 1)) + minPerCollect);
      forcedBalloonCount += Math.max(0, Math.floor(Number(countThisCollect) || 0));
    }

    landingPositions.forEach((position) => {
      const key = `${position.reel},${position.row}`;
      positionStates.set(key, {
        reel: position.reel,
        row: position.row,
        baseValueTbm: 0,
        multiplier: 1,
        hasUpgradeBackplate: false,
        hasNaturalValue: false,
        resultValueTbm: 0,
        resultValueTwa: 0
      });
    });

    const releaseFeature = this.applyBonusEndBalloonPops(
      positionStates,
      betSize,
      null,
      {
        forcedBalloonCount,
        allowAnyPositionFallback: true
      }
    );

    return {
      ...releaseFeature,
      triggerSource: "freespinStartSymbolClear",
      collectedBalloons
    };
  }

  applyBonusEndLightningBeeFeature(positionStates, betSize = 0, mergeAreaLookup = null, gameState = null) {
    const config = this.getLightningBeeFeatureConfig();
    const featureState = gameState
      ? this.normalizeLightningBeeFeatureState(gameState)
      : {
        collected: 0,
        max: config.maxCollect,
        multiplierStep: 0,
        multiplier: config.multiplierLadder[0] || 1,
        multiplierLadder: config.multiplierLadder,
        boardBees: [],
        collectedBees: [],
        nextBeeId: 1
      };
    const ladder = Array.isArray(featureState.multiplierLadder) && featureState.multiplierLadder.length > 0
      ? featureState.multiplierLadder
      : config.multiplierLadder;
    const max = Math.max(1, Math.floor(Number(featureState.max || config.maxCollect) || config.maxCollect));
    const fallbackBaseStep = Math.max(
      0,
      Math.min(ladder.length - 1, Math.floor(Number(featureState.multiplierStep) || 0))
    );
    const collectedBees = Array.isArray(featureState.collectedBees)
      ? featureState.collectedBees.slice(0, max)
      : [];
    const collected = Math.max(0, Math.min(max, Math.floor(Number(featureState.collected || collectedBees.length) || 0)));
    const releaseBees = collectedBees.length > 0
      ? collectedBees
      : Array.from({ length: collected }, (_, index) => ({
          id: index + 1,
          beeId: index + 1,
          multiplierStep: fallbackBaseStep,
          multiplier: ladder[fallbackBaseStep] || 1
        }));
    const baseStep = releaseBees.reduce(
      (lowest, bee) => Math.min(lowest, Math.max(0, Math.min(ladder.length - 1, Math.floor(Number(bee?.multiplierStep) || 0)))),
      fallbackBaseStep
    );
    const baseMultiplier = ladder[baseStep] || 1;
    const result = {
      enabled: true,
      triggered: false,
      beeCount: releaseBees.length,
      releasedCount: 0,
      baseMultiplier,
      baseMultiplierStep: baseStep,
      multiplierLadder: ladder,
      upgradeEveryMs: config.endUpgradeEveryMs,
      landChancePerStep: config.endLandChancePerStep,
      totalAddedTbm: 0,
      totalAddedTwa: 0,
      events: []
    };
    if (releaseBees.length <= 0) {
      result.reason = "noCollectedBees";
      return result;
    }
    if (!(positionStates instanceof Map)) {
      result.reason = "noPositionStates";
      return result;
    }

    const toFixedNumber = (value, digits = 4) => Number(Number(value || 0).toFixed(digits));
    const getState = (positionKey) => positionStates.get(positionKey) || null;
    const ensureState = (positionKey) => {
      const existing = getState(positionKey);
      if (existing && typeof existing === "object") return existing;

      const [rawReel, rawRow] = String(positionKey).split(",");
      const reel = Math.floor(Number(rawReel));
      const row = Math.floor(Number(rawRow));
      const created = {
        reel,
        row,
        baseValueTbm: 0,
        multiplier: 1,
        hasUpgradeBackplate: false,
        hasNaturalValue: false,
        resultValueTbm: 0,
        resultValueTwa: 0
      };
      positionStates.set(positionKey, created);
      return created;
    };
    const getMergedAreaPositionKeys = (mergedArea = null) => (
      Array.isArray(mergedArea?.positions)
        ? mergedArea.positions
          .map((position) => {
            const reel = Math.floor(Number(position?.reel));
            const row = Math.floor(Number(position?.row));
            if (!Number.isFinite(reel) || !Number.isFinite(row)) return null;
            return `${reel},${row}`;
          })
          .filter(Boolean)
        : []
    );
    const getAreaResultTbm = (positionKeys = []) => toFixedNumber(
      positionKeys.reduce((sum, key) => sum + Number(getState(key)?.resultValueTbm || 0), 0)
    );
    const positiveCandidateKeys = Array.from(positionStates.entries())
      .filter(([_, state]) => Number(state?.resultValueTbm || 0) > 0)
      .map(([key]) => key);
    const fallbackCandidateKeys = positiveCandidateKeys.length > 0
      ? positiveCandidateKeys
      : (
        positionStates.size > 0
          ? Array.from(positionStates.keys())
          : this.getBonusEndLandingPositions().map((position) => `${position.reel},${position.row}`)
      );
    if (fallbackCandidateKeys.length === 0) {
      result.reason = "noEligibleTargets";
      return result;
    }

    result.triggered = true;

    for (let index = 0; index < releaseBees.length; index++) {
      const releaseBee = releaseBees[index] || {};
      const targetKey = fallbackCandidateKeys[Math.floor(Math.random() * fallbackCandidateKeys.length)];
      const [rawReel, rawRow] = String(targetKey).split(",");
      const reel = Math.floor(Number(rawReel));
      const row = Math.floor(Number(rawRow));
      if (!Number.isFinite(reel) || !Number.isFinite(row)) continue;

      const beeBaseStep = Math.max(
        0,
        Math.min(ladder.length - 1, Math.floor(Number(releaseBee?.multiplierStep) || 0))
      );
      const beeBaseMultiplier = Math.max(1, Number(ladder[beeBaseStep] || releaseBee?.multiplier || 1));
      let finalStep = beeBaseStep;
      const upgradeTimeline = [];
      const upgradeEveryMs = Math.max(1, Number(config.endUpgradeEveryMs) || 4000);
      const landChancePerStep = this.normalizeProbability(config.endLandChancePerStep, 0.33);
      let stepOffset = 0;
      while (finalStep < ladder.length - 1) {
        stepOffset += 1;
        finalStep += 1;
        upgradeTimeline.push({
          atMs: stepOffset * config.endUpgradeEveryMs,
          multiplierStep: finalStep,
          multiplier: ladder[finalStep] || beeBaseMultiplier
        });
        if (Math.random() < landChancePerStep) {
          break;
        }
      }
      const upgradeSteps = upgradeTimeline.length;
      const beeMultiplier = Math.max(1, Number(ladder[finalStep] || beeBaseMultiplier || 1));
      const flightDurationMs = Math.max(
        Math.max(1600, Number(config.endLandingSettleMs) || 900),
        Math.floor(upgradeSteps * upgradeEveryMs + Math.max(250, Number(config.endLandingSettleMs) || 900))
      );

      const targetState = ensureState(targetKey);
      const beforeResultValueTbm = toFixedNumber(targetState?.resultValueTbm || 0);
      const beforeResultValueTwa = toFixedNumber(targetState?.resultValueTwa || 0);
      const mergedArea = mergeAreaLookup instanceof Map ? mergeAreaLookup.get(targetKey) : null;
      const mergedAreaPositionKeys = getMergedAreaPositionKeys(mergedArea);
      const beforeMergedAreaResultTbm = mergedAreaPositionKeys.length > 0
        ? getAreaResultTbm(mergedAreaPositionKeys)
        : beforeResultValueTbm;
      const beforeMergedAreaResultTwa = toFixedNumber(beforeMergedAreaResultTbm * Number(betSize || 0));
      const positiveMergedAreaPositionKeys = mergedAreaPositionKeys.filter((affectedKey) =>
        Number(getState(affectedKey)?.resultValueTbm || 0) > 0
      );
      const affectedPositionKeys = mergedArea && beforeMergedAreaResultTbm > 0 && positiveMergedAreaPositionKeys.length > 0
        ? positiveMergedAreaPositionKeys
        : [targetKey];

      affectedPositionKeys.forEach((affectedKey) => {
        const state = ensureState(affectedKey);
        const currentResult = Number(state.resultValueTbm || 0);
        if (!(currentResult > 0)) return;

        const currentMultiplier = Math.max(1, Number(state.multiplier || 1));
        state.multiplier = toFixedNumber(currentMultiplier * beeMultiplier);
        state.resultValueTbm = toFixedNumber(Number(state.baseValueTbm || 0) * Number(state.multiplier || 1));
        state.resultValueTwa = toFixedNumber(Number(state.resultValueTbm || 0) * Number(betSize || 0));
        positionStates.set(affectedKey, state);
      });

      const afterTargetState = ensureState(targetKey);
      const afterResultValueTbm = toFixedNumber(afterTargetState?.resultValueTbm || 0);
      const afterResultValueTwa = toFixedNumber(afterTargetState?.resultValueTwa || 0);
      const mergedAreaAfter = mergedArea
        ? this.buildBonusEndMergedAreaEntry(mergedArea, positionStates, betSize)
        : null;
      const afterMergedAreaResultTbm = toFixedNumber(mergedAreaAfter?.resultValueTbm ?? afterResultValueTbm);
      const afterMergedAreaResultTwa = toFixedNumber(mergedAreaAfter?.resultValueTwa ?? afterResultValueTwa);
      const addedMergedTbm = toFixedNumber(afterMergedAreaResultTbm - beforeMergedAreaResultTbm);
      const addedMergedTwa = toFixedNumber(afterMergedAreaResultTwa - beforeMergedAreaResultTwa);
      const addedTbm = toFixedNumber(afterResultValueTbm - beforeResultValueTbm);
      const addedTwa = toFixedNumber(afterResultValueTwa - beforeResultValueTwa);

      result.releasedCount += 1;
      result.totalAddedTbm = toFixedNumber(result.totalAddedTbm + Math.max(0, addedMergedTbm));
      result.totalAddedTwa = toFixedNumber(result.totalAddedTwa + Math.max(0, addedMergedTwa));
      result.events.push({
        index,
        beeId: Math.max(1, Math.floor(Number(releaseBee?.beeId ?? releaseBee?.id ?? index + 1) || index + 1)),
        reel,
        row,
        targetPositionKey: targetKey,
        multiplier: beeMultiplier,
        multiplierStep: finalStep,
        baseMultiplier: beeBaseMultiplier,
        baseMultiplierStep: beeBaseStep,
        upgradeSteps,
        upgradeTimeline,
        flightDurationMs,
        beforeResultValueTbm,
        beforeResultValueTwa,
        afterResultValueTbm,
        afterResultValueTwa,
        addedTbm,
        addedTwa,
        targetEffectiveTbm: Math.max(beforeResultValueTbm, beforeMergedAreaResultTbm),
        mergedAreaId: mergedArea?.id || null,
        mergedAreaPositions: Array.isArray(mergedArea?.positions)
          ? mergedArea.positions.map((position) => ({ reel: position.reel, row: position.row }))
          : [],
        mergedAreaResultValueTbm: afterMergedAreaResultTbm,
        mergedAreaResultValueTwa: afterMergedAreaResultTwa,
        mergedAreaAddedTbm: addedMergedTbm,
        mergedAreaAddedTwa: addedMergedTwa,
        affectedPositionKeys
      });
    }

    if (result.events.length === 0) {
      result.triggered = false;
      result.reason = "noEvents";
    }

    return result;
  }

  isBonusEndMultiplierSymbol(symbolId, gameState = null) {
    const def = this.resolveBonusEndFallenSymbol(symbolId, gameState);
    return def != null && Number(def.multiplier) > 1;
  }

  getBonusEndRandomLandingOrder(counts = {}) {
    const symbols = [];
    const payoutSymbols = Array.isArray(serverConfig.payoutSymbols) ? serverConfig.payoutSymbols : [];

    payoutSymbols.forEach((symbolId) => {
      const count = Math.max(0, Math.floor(Number(counts?.[String(symbolId)] || 0)));
      for (let i = 0; i < count; i++) {
        symbols.push(symbolId);
      }
    });

    for (let index = symbols.length - 1; index > 0; index--) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [symbols[index], symbols[swapIndex]] = [symbols[swapIndex], symbols[index]];
    }

    return symbols;
  }

  buildBonusEndPayout(gameState, betSize = 0) {
    const bonusMultiplierFruits = this.ensureBonusMultiplierFruitState(gameState);
    const counts = this.normalizeBonusCollectedSymbolCounts(gameState?.bonusState?.collectedSymbolCounts, gameState);
    const immediateLowPositionLandings = this.normalizeBonusImmediateLowPositionLandings(
      gameState?.bonusState?.immediateLowPositionLandings,
      gameState
    );
    const countsForRain = { ...counts };

    const boardPositions = this.getBonusEndLandingPositions();
    const positionStates = new Map();
    const allLandings = [];
    const phaseDefinitions = this.getBonusEndFallenPhaseDefinitions(gameState);
    const mergeGunFeatureState = gameState ? this.normalizeMergeGunFeatureState(gameState) : { areas: [] };
    const mergeAreaDefinitions = Array.isArray(mergeGunFeatureState?.areas)
      ? mergeGunFeatureState.areas
      : [];
    const mergeAreaLookup = this.buildMergeGunAreaLookup(mergeAreaDefinitions);
    const multiplierFruitTargetingConfig = this.getBonusEndMultiplierFruitTargetingConfig();
    const multiplierFruitTargetPool = this.buildBonusEndMultiplierFruitTargetPool(
      boardPositions,
      mergeAreaLookup,
      multiplierFruitTargetingConfig
    );

    const ensurePositionState = (positionKey, reel, row) => {
      const existingState = positionStates.get(positionKey);
      if (existingState && typeof existingState === "object") {
        return existingState;
      }

      const createdState = {
        reel,
        row,
        baseValueTbm: 0,
        multiplier: 1,
        hasUpgradeBackplate: false,
        hasNaturalValue: false,
        resultValueTbm: 0,
        resultValueTwa: 0
      };
      positionStates.set(positionKey, createdState);
      return createdState;
    };

    const applySymbolToPositionState = (positionKey, symbolId, options = {}) => {
      const [rawReel, rawRow] = String(positionKey).split(",");
      const targetReel = Number(rawReel);
      const targetRow = Number(rawRow);
      const previousState = ensurePositionState(positionKey, targetReel, targetRow);

      const fallenDef = this.resolveBonusEndFallenSymbol(symbolId, gameState);
      const multiplierApplied = fallenDef ? Number(fallenDef.multiplier) || 1 : 1;
      const isMultiplier = multiplierApplied > 1;
      const isValueSymbol = fallenDef != null && multiplierApplied <= 1;
      const baseValueAwardOverrideTbm = Number(options?.baseValueAwardTbm);
      const hasBaseValueAwardOverride =
        Number.isFinite(baseValueAwardOverrideTbm) &&
        baseValueAwardOverrideTbm > 0;
      let baseAddedTbm = 0;
      let emptyUpgradeAwardTbm = 0;
      let nextMultiplier = previousState.multiplier;
      let hasUpgradeBackplate = previousState.hasUpgradeBackplate === true;
      let hasNaturalValue = previousState.hasNaturalValue === true;

      if (isMultiplier) {
        const hasExistingValue =
          hasNaturalValue ||
          hasUpgradeBackplate ||
          Number(previousState.baseValueTbm || 0) > 0;
        if (hasExistingValue) {
          nextMultiplier = previousState.multiplier * multiplierApplied;
        } else if (!hasUpgradeBackplate) {
          const hasEmptyUpgradeAwardOverride =
            options?.emptyUpgradeAwardTbm !== undefined &&
            options?.emptyUpgradeAwardTbm !== null;
          const overrideEmptyUpgradeAwardTbm = Number(options?.emptyUpgradeAwardTbm);
          emptyUpgradeAwardTbm = hasEmptyUpgradeAwardOverride && Number.isFinite(overrideEmptyUpgradeAwardTbm)
            ? Math.max(0, overrideEmptyUpgradeAwardTbm)
            : Number(this.getBonusEndSymbolValueTbm(symbolId, gameState) || 0);
          baseAddedTbm = emptyUpgradeAwardTbm;
          hasUpgradeBackplate = true;
        }
      } else if (isValueSymbol) {
        baseAddedTbm = hasBaseValueAwardOverride
          ? Math.max(0, baseValueAwardOverrideTbm)
          : Number(this.getBonusEndSymbolValueTbm(symbolId, gameState) || 0);
        hasNaturalValue = true;
      }

      const nextState = {
        ...previousState,
        reel: targetReel,
        row: targetRow,
        baseValueTbm: previousState.baseValueTbm + baseAddedTbm,
        multiplier: nextMultiplier,
        hasUpgradeBackplate,
        hasNaturalValue
      };
      nextState.resultValueTbm = Number((nextState.baseValueTbm * nextState.multiplier).toFixed(4));
      nextState.resultValueTwa = Number((nextState.resultValueTbm * Number(betSize || 0)).toFixed(4));
      positionStates.set(positionKey, nextState);

      return {
        positionKey,
        reel: targetReel,
        row: targetRow,
        state: nextState,
        isMultiplier,
        baseAddedTbm,
        multiplierApplied,
        emptyUpgradeAwardTbm
      };
    };

    const splitTbmAcrossCount = (totalTbm = 0, count = 1) => {
      const partCount = Math.max(1, Math.floor(Number(count) || 1));
      const totalUnits = Math.max(0, Math.round(Number(totalTbm || 0) * 10000));
      const baseUnits = Math.floor(totalUnits / partCount);
      const remainderUnits = totalUnits - baseUnits * partCount;
      return Array.from({ length: partCount }, (_, index) =>
        Number(((baseUnits + (index < remainderUnits ? 1 : 0)) / 10000).toFixed(4))
      );
    };

    const seedMergeAreaPositionStatesFromStoredValue = (area = null) => {
      const positions = this.normalizeMergeGunHighlightPositions(area?.positions);
      if (positions.length === 0) return;

      const currentResultTbm = positions.reduce((sum, position) => {
        const state = positionStates.get(`${position.reel},${position.row}`);
        return sum + Number(state?.resultValueTbm || 0);
      }, 0);
      if (currentResultTbm > 0) return;

      const storedResultTbm = Number(area?.resultValueTbm ?? area?.totalTbm ?? area?.baseValueTbm ?? 0);
      if (!(Number.isFinite(storedResultTbm) && storedResultTbm > 0)) return;

      const baseParts = splitTbmAcrossCount(storedResultTbm, positions.length);

      positions.forEach((position, index) => {
        const key = `${position.reel},${position.row}`;
        const state = ensurePositionState(key, position.reel, position.row);
        state.baseValueTbm = baseParts[index] || 0;
        state.multiplier = 1;
        state.hasUpgradeBackplate = true;
        state.resultValueTbm = Number((state.baseValueTbm * state.multiplier).toFixed(4));
        state.resultValueTwa = Number((state.resultValueTbm * Number(betSize || 0)).toFixed(4));
        positionStates.set(key, state);
      });
    };

    const applyLandingToPosition = ({
      symbolId,
      reel,
      row,
      phaseId = null,
      phaseLandingIndex = null,
      splashIntensity = "medium",
      includeInRainLandings = true,
      baseValueAwardTbm = null,
      landingTarget = null
    } = {}) => {
      const targetReel = Number(reel);
      const targetRow = Number(row);
      const normalizedSymbolId = this.getCollectableBonusSymbolId(symbolId);
      if (
        normalizedSymbolId === null ||
        !Number.isFinite(targetReel) ||
        !Number.isFinite(targetRow) ||
        this.isHouse(targetReel, targetRow)
      ) {
        return null;
      }

      const positionKey = `${targetReel},${targetRow}`;
      const mergedArea = mergeAreaLookup.get(positionKey) || null;
      const isMergedAreaMultiplier = mergedArea && this.isBonusEndMultiplierSymbol(normalizedSymbolId, gameState);
      if (isMergedAreaMultiplier) {
        seedMergeAreaPositionStatesFromStoredValue(mergedArea);
      }
      const beforeAreaEntry = mergedArea
        ? this.buildBonusEndMergedAreaEntry(mergedArea, positionStates, betSize)
        : null;
      const mergedAreaPositionKeys = isMergedAreaMultiplier && Array.isArray(mergedArea?.positions)
        ? mergedArea.positions.map((position) => `${position.reel},${position.row}`)
        : [];
      const beforeMergedAreaResultTbm = Number(beforeAreaEntry?.resultValueTbm || 0);
      const positiveMergedAreaPositionKeys = mergedAreaPositionKeys.filter((affectedKey) => {
        const state = positionStates.get(affectedKey);
        return Number(state?.resultValueTbm || 0) > 0;
      });
      const affectedPositionKeys = isMergedAreaMultiplier
        ? (
          beforeMergedAreaResultTbm > 0 && positiveMergedAreaPositionKeys.length > 0
            ? positiveMergedAreaPositionKeys
            : mergedAreaPositionKeys
        )
        : [positionKey];
      // Glued areas are one logical fall-scene target; split the first empty
      // multiplier seed across cells so the area total does not scale by size.
      const mergedAreaEmptyUpgradeAwardTbm = (
        isMergedAreaMultiplier &&
        beforeMergedAreaResultTbm <= 0 &&
        affectedPositionKeys.length > 1
      )
        ? Number(this.getBonusEndSymbolValueTbm(normalizedSymbolId, gameState) || 0)
        : null;
      const perPositionEmptyUpgradeAwardTbms = Number.isFinite(mergedAreaEmptyUpgradeAwardTbm)
        ? splitTbmAcrossCount(mergedAreaEmptyUpgradeAwardTbm, affectedPositionKeys.length)
        : null;
      const affectedResults = affectedPositionKeys.map((affectedKey, affectedIndex) =>
        applySymbolToPositionState(affectedKey, normalizedSymbolId, {
          emptyUpgradeAwardTbm: perPositionEmptyUpgradeAwardTbms?.[affectedIndex],
          baseValueAwardTbm
        })
      );
      const primaryResult = affectedResults.find((entry) => entry.positionKey === positionKey) || affectedResults[0];
      const nextState = primaryResult?.state || ensurePositionState(positionKey, targetReel, targetRow);
      const mergedAreaAfter = mergedArea
        ? this.buildBonusEndMergedAreaEntry(mergedArea, positionStates, betSize)
        : null;
      const aggregateBaseAddedTbm = affectedResults.reduce((sum, entry) => (
        sum + Number(entry?.baseAddedTbm || 0)
      ), 0);
      const aggregateEmptyUpgradeAwardTbm = affectedResults.reduce((sum, entry) => (
        sum + Number(entry?.emptyUpgradeAwardTbm || 0)
      ), 0);
      const landingBaseAddedTbm = isMergedAreaMultiplier
        ? Number(aggregateBaseAddedTbm.toFixed(4))
        : Number(primaryResult?.baseAddedTbm || 0);
      const landingEmptyUpgradeAwardTbm = isMergedAreaMultiplier
        ? Number(aggregateEmptyUpgradeAwardTbm.toFixed(4))
        : Number(primaryResult?.emptyUpgradeAwardTbm || 0);
      const landingResultValueTbm = Number(
        (
          isMergedAreaMultiplier
            ? Number(mergedAreaAfter?.resultValueTbm ?? nextState.resultValueTbm ?? 0)
            : Number(nextState.resultValueTbm || 0)
        ).toFixed(4)
      );
      const landingResultValueTwa = Number(
        (
          isMergedAreaMultiplier
            ? Number(mergedAreaAfter?.resultValueTwa ?? nextState.resultValueTwa ?? 0)
            : Number(nextState.resultValueTwa || 0)
        ).toFixed(4)
      );

      const landing = {
        index: includeInRainLandings ? allLandings.length : -1,
        phaseId,
        phaseLandingIndex,
        symbol: normalizedSymbolId,
        reel: targetReel,
        row: targetRow,
        positionKey,
        isMultiplier: primaryResult?.isMultiplier === true,
        baseAddedTbm: landingBaseAddedTbm,
        multiplierApplied: Number(primaryResult?.multiplierApplied || 1),
        emptyUpgradeAwardTbm: landingEmptyUpgradeAwardTbm,
        configBaseTbm: Number(this.getBonusEndSymbolValueTbm(normalizedSymbolId, gameState) || 0),
        resultValueTbm: landingResultValueTbm,
        resultValueTwa: landingResultValueTwa,
        resultingMultiplier: nextState.multiplier,
        splashIntensity,
        affectedPositionKeys,
        mergedAreaId: mergedArea?.id || null,
        mergedAreaPositions: Array.isArray(mergedArea?.positions)
          ? mergedArea.positions.map((position) => ({ reel: position.reel, row: position.row }))
          : [],
        mergedAreaResultValueTbm: Number(
          mergedAreaAfter?.resultValueTbm ??
          nextState.resultValueTbm ??
          0
        ),
        mergedAreaResultValueTwa: Number(
          mergedAreaAfter?.resultValueTwa ??
          nextState.resultValueTwa ??
          0
        ),
        mergedAreaAddedTbm: Number(
          (
            Number(mergedAreaAfter?.resultValueTbm || nextState.resultValueTbm || 0) -
            Number(beforeAreaEntry?.resultValueTbm || 0)
          ).toFixed(4)
        ),
        mergedAreaAddedTwa: Number(
          (
            Number(mergedAreaAfter?.resultValueTwa || nextState.resultValueTwa || 0) -
            Number(beforeAreaEntry?.resultValueTwa || 0)
          ).toFixed(4)
        ),
        targetSelectionType: landingTarget?.type || null,
        targetSelectionWeight: Number(Number(landingTarget?.weight || 0).toFixed(4)),
        targetSelectionBaseWeight: Number(Number(landingTarget?.baseWeight || landingTarget?.weight || 0).toFixed(4)),
        targetValuePenaltyMultiplier: Number(Number(landingTarget?.valuePenaltyMultiplier ?? 1).toFixed(4)),
        targetEffectiveTbm: Number(Number(landingTarget?.effectiveTargetTbm || 0).toFixed(4)),
        targetSelectionCellCount: Math.max(1, Math.floor(Number(landingTarget?.cellCount || 1) || 1))
      };

      if (includeInRainLandings) {
        allLandings.push(landing);
      }

      return landing;
    };

    immediateLowPositionLandings.forEach((landing, index) => {
      applyLandingToPosition({
        symbolId: landing?.symbol ?? landing?.symbolId,
        reel: landing?.reel,
        row: landing?.row,
        phaseId: "phase_immediate_lows",
        phaseLandingIndex: index,
        splashIntensity: "heavy",
        includeInRainLandings: false,
        baseValueAwardTbm: landing?.valueTbm
      });
    });

    const phases = phaseDefinitions.map((phaseDefinition) => {
      const phaseSymbols = [];
      phaseDefinition.symbolIds.forEach((symbolId) => {
        const count = Math.max(0, Math.floor(Number(countsForRain?.[String(symbolId)] || 0)));
        for (let i = 0; i < count; i++) {
          phaseSymbols.push(symbolId);
        }
      });

      for (let index = phaseSymbols.length - 1; index > 0; index--) {
        const swapIndex = Math.floor(Math.random() * (index + 1));
        [phaseSymbols[index], phaseSymbols[swapIndex]] = [phaseSymbols[swapIndex], phaseSymbols[index]];
      }

      const phaseDurationMs = Math.max(
        phaseDefinition.minDurationMs,
        Math.min(
          phaseDefinition.maxDurationMs,
          phaseSymbols.length * (Number(phaseDefinition.perSymbolMs) || 420)
        )
      );
      const phaseLandings = [];

      phaseSymbols.forEach((symbolId, phaseLandingIndex) => {
        let targetSelection = null;
        let targetPosition = null;
        if (this.isBonusEndMultiplierSymbol(symbolId, gameState)) {
          targetSelection = this.pickBonusEndWeightedLandingTarget(
            multiplierFruitTargetPool,
            positionStates,
            multiplierFruitTargetingConfig,
            betSize
          );
          targetPosition = this.resolveBonusEndLandingTargetPosition(targetSelection);
        }
        if (!targetPosition) {
          targetPosition = boardPositions.length > 0
            ? boardPositions[Math.floor(Math.random() * boardPositions.length)]
            : { reel: 0, row: 0 };
        }

        const landing = applyLandingToPosition({
          symbolId,
          reel: targetPosition.reel,
          row: targetPosition.row,
          phaseId: phaseDefinition.id,
          phaseLandingIndex,
          splashIntensity: phaseDefinition.splashIntensity,
          includeInRainLandings: true,
          landingTarget: targetSelection
        });

        if (landing) {
          phaseLandings.push(landing);
        }
      });

      const phaseTbm = Number(
        phaseLandings.reduce((sum, landing) => sum + Number(landing.baseAddedTbm || 0), 0).toFixed(4)
      );

      return {
        id: phaseDefinition.id,
        symbolIds: [...phaseDefinition.symbolIds],
        minDurationMs: phaseDefinition.minDurationMs,
        maxDurationMs: phaseDefinition.maxDurationMs,
        durationMs: phaseDurationMs,
        splashIntensity: phaseDefinition.splashIntensity,
        landings: phaseLandings,
        phaseTbm,
        phaseTwa: Number((phaseTbm * Number(betSize || 0)).toFixed(4))
      };
    }).filter((phase) => phase.landings.length > 0);

    const balloonConfig = this.getBonusEndBalloonPopConfig();
    const balloonPopFeature = {
      enabled: balloonConfig.enabled === true,
      triggered: false,
      triggerChance: balloonConfig.triggerChance,
      balloonCount: 0,
      poppedCount: 0,
      totalAddedTbm: 0,
      totalAddedTwa: 0,
      events: [],
      reason: "movedToFreespinStart"
    };
    const lightningBeeFeature = this.applyBonusEndLightningBeeFeature(
      positionStates,
      betSize,
      mergeAreaLookup,
      gameState
    );

    const positionTotals = Array.from(positionStates.values())
      .map((state) => ({
        reel: state.reel,
        row: state.row,
        baseValueTbm: Number(state.baseValueTbm.toFixed(4)),
        multiplier: state.multiplier,
        resultValueTbm: Number(state.resultValueTbm.toFixed(4)),
        resultValueTwa: Number(state.resultValueTwa.toFixed(4))
      }))
      .filter((state) => Number(state.resultValueTbm || 0) > 0)
      .sort((a, b) => {
        if (b.resultValueTbm !== a.resultValueTbm) {
          return b.resultValueTbm - a.resultValueTbm;
        }
        if (a.row !== b.row) {
          return a.row - b.row;
        }
        return a.reel - b.reel;
      });

    const totalSymbols = allLandings.length;
    const totalTbm = Number(
      positionTotals.reduce((sum, entry) => sum + Number(entry.resultValueTbm || 0), 0).toFixed(4)
    );
    const totalTwa = Number(
      positionTotals.reduce((sum, entry) => sum + Number(entry.resultValueTwa || 0), 0).toFixed(4)
    );
    const mergedAreas = mergeAreaDefinitions.map((area) =>
      this.buildBonusEndMergedAreaEntry(area, positionStates, betSize)
    );
    this.syncMergeGunFeatureAreaTotals(gameState, positionStates, betSize);

    return {
      counts: countsForRain,
      totalSymbols,
      totalTbm,
      totalTwa,
      landings: allLandings,
      positionTotals,
      mergedAreas,
      phases,
      immediateLowPositionLandings,
      balloonPopFeature,
      lightningBeeFeature,
      bonusMultiplierFruits
    };
  }

  applyBonusEndPayout(gameState, betSize = 0) {
    if (!gameState || typeof gameState !== "object") return null;

    const payout = this.buildBonusEndPayout(gameState, betSize);
    gameState.bonusEndPayout = payout;
    const existingRelease = gameState?.bonusMysteryFeatureReleaseThisAction;
    const existingReleaseHasEvents =
      existingRelease?.triggered === true &&
      Array.isArray(existingRelease?.events) &&
      existingRelease.events.length > 0;
    if (!existingReleaseHasEvents) {
      gameState.bonusMysteryFeatureReleaseThisAction = payout?.balloonPopFeature || null;
    }
    gameState.winAmount = Number(payout.totalTbm || 0);
    if (gameState?.bonusMysteryFeature && typeof gameState.bonusMysteryFeature === "object") {
      const max = Math.max(1, Math.floor(Number(gameState.bonusMysteryFeature.max || 3) || 3));
      const currentCollected = Math.max(
        0,
        Math.min(max, Math.floor(Number(gameState.bonusMysteryFeature.collected || 0) || 0))
      );
      const releasedCount = Math.max(
        0,
        Math.floor(Number(payout?.balloonPopFeature?.balloonCount || 0) || 0)
      );
      gameState.bonusMysteryFeature = {
        ...gameState.bonusMysteryFeature,
        collected: Math.max(0, Math.min(max, currentCollected - releasedCount)),
        max
      };
    }

    if (Number(payout.totalTbm || 0) > 0) {
      gameState.tbm = Number(gameState.tbm || 0) + Number(payout.totalTbm || 0);
      gameState.twa = Number(gameState.twa || 0) + Number(payout.totalTwa || 0);
      if (!gameState.rtpData || typeof gameState.rtpData !== "object") {
        gameState.rtpData = {};
      }
      gameState.rtpData.bonusEndPayoutTBM = Number(gameState.rtpData.bonusEndPayoutTBM || 0) + Number(payout.totalTbm || 0);
      const balloonFeature = payout?.balloonPopFeature;
      const balloonAddedTbm = Number(balloonFeature?.totalAddedTbm || 0);
      if (balloonAddedTbm > 0) {
        gameState.rtpData.bonusEndBalloonPopTBM = Number(gameState.rtpData.bonusEndBalloonPopTBM || 0) + balloonAddedTbm;
      }
    }

    return payout;
  }

  resolveRoundCost({ betSize = 1, ticketStrategy } = {}) {
    const normalizedBetSize = Number.isFinite(Number(betSize)) ? Number(betSize) : 1;
    const baseCost = Number.isFinite(Number(serverConfig?.wallet?.cost))
      ? Number(serverConfig.wallet.cost)
      : 1;
    const strategyMultipliers = isPlainObject(serverConfig?.ticketStrategyCostMultipliers)
      ? serverConfig.ticketStrategyCostMultipliers
      : {};
    const strategyCostMultiplier = Number.isFinite(Number(strategyMultipliers?.[ticketStrategy]))
      ? Number(strategyMultipliers[ticketStrategy])
      : 1;
    const roundCost = this.roundCurrency(normalizedBetSize * baseCost * strategyCostMultiplier);

    return {
      betSize: normalizedBetSize,
      baseCost,
      strategyCostMultiplier,
      roundCost
    };
  }

  buildRoundMeta({ betSize = 1, ticketStrategy } = {}) {
    const cost = this.resolveRoundCost({ betSize, ticketStrategy });
    return {
      ...cost,
      ticketStrategy: ticketStrategy || null
    };
  }

  /**
   * Check if position is inside the house
   */
  isHouse(reel, row) {
    return reel >= this.house.startReel && 
           reel <= this.house.endReel && 
           row >= this.house.startRow && 
           row <= this.house.endRow;
  }
  
  /**
   * Check if a symbol is any type of banana
   */
  isDemon(symbol) {
    return this.demonIds.includes(symbol);
  }
  
  /**
   * Randomly select a banana type based on configured odds
   * Returns the symbol ID of the selected banana type
   */
  getRandomDemonType() {
    const typeOdds = serverConfig.bananaSpawn?.typeOdds || { banana: 100 };
    const symbolsMapping = serverConfig.symbolsMapping;
    
    // Build weighted array
    const weighted = [];
    for (const [bananaType, weight] of Object.entries(typeOdds)) {
      const bananaId = symbolsMapping[bananaType];
      if (bananaId !== undefined) {
        for (let i = 0; i < weight; i++) {
          weighted.push(bananaId);
        }
      }
    }
    
    // Random selection
    if (weighted.length === 0) return this.demonId; // Fallback to default
    return weighted[Math.floor(Math.random() * weighted.length)];
  }

  /**
   * Spawn bananas based on necromancer level
   * Bananas spawn in a group (adjacent/diagonal) avoiding house and hero position
   * @param {number} necromancerLevel - The necromancer ability level (0, 1, 2)
   * @param {object} heroPosition - Current hero position {reel, row} to avoid (optional, uses starting position if not provided)
   * @returns {Array} - Array of spawn positions [{reel, row, bananaId}, ...]
   */
  spawnNecromancerDemons(necromancerLevel, heroPosition = null, heroFootprintSize = 1) {
    const spawnConfig = serverConfig.necromancerBananaOutput?.[necromancerLevel];
    if (!spawnConfig || spawnConfig.from === 0 && spawnConfig.to === 0) {
      return []; // No bananas to spawn
    }
    
    // Calculate how many bananas to spawn
    const bananaCount = Math.floor(Math.random() * (spawnConfig.to - spawnConfig.from + 1)) + spawnConfig.from;
    if (bananaCount === 0) return [];
    
    // Get hero position to avoid (use provided position or fall back to starting position)
    const heroPos = heroPosition || serverConfig.heroStartingPosition || { reel: 4, row: 2 };
    const heroFootprint = this.buildHeroFootprintState(heroPos, heroFootprintSize);
    
    // Build list of valid positions (not house, not hero position)
    const validPositions = [];
    for (let reel = 0; reel < this.width; reel++) {
      for (let row = 0; row < this.height; row++) {
        // Skip house positions
        if (this.isHouse(reel, row)) continue;
        // Skip hero position
        if (heroFootprint.cellKeys.has(`${reel},${row}`)) continue;
        
        validPositions.push({ reel, row });
      }
    }
    
    if (validPositions.length === 0) return [];
    
    // Pick a random starting position for the banana group
    const spawns = [];
    const usedPositions = new Set();
    
    // Start with a random valid position
    const startIdx = Math.floor(Math.random() * validPositions.length);
    const startPos = validPositions[startIdx];
    // Use banana2 (ID 12) for necromancer spawns - has special "summoned" look
    const necroBananaId = serverConfig.symbolsMapping?.banana2 || 12;
    spawns.push({
      reel: startPos.reel,
      row: startPos.row,
      bananaId: necroBananaId
    });
    usedPositions.add(`${startPos.reel},${startPos.row}`);
    
    // Spawn remaining bananas adjacent to existing ones
    const directions = [
      { dr: -1, dc: -1 }, { dr: -1, dc: 0 }, { dr: -1, dc: 1 },
      { dr: 0, dc: -1 },                      { dr: 0, dc: 1 },
      { dr: 1, dc: -1 },  { dr: 1, dc: 0 },   { dr: 1, dc: 1 }
    ];
    
    while (spawns.length < bananaCount) {
      // Find all valid adjacent positions to existing spawns
      const adjacentOptions = [];
      
      for (const spawn of spawns) {
        for (const dir of directions) {
          const newReel = spawn.reel + dir.dc;
          const newRow = spawn.row + dir.dr;
          const key = `${newReel},${newRow}`;
          
          // Check bounds
          if (newReel < 0 || newReel >= this.width || newRow < 0 || newRow >= this.height) continue;
          // Check if already used
          if (usedPositions.has(key)) continue;
          // Check if valid (not house, not hero position)
          if (this.isHouse(newReel, newRow)) continue;
          if (heroFootprint.cellKeys.has(`${newReel},${newRow}`)) continue;
          
          adjacentOptions.push({ reel: newReel, row: newRow });
        }
      }
      
      if (adjacentOptions.length === 0) {
        // No more adjacent positions available, stop spawning
        break;
      }
      
      // Pick a random adjacent position
      const nextPos = adjacentOptions[Math.floor(Math.random() * adjacentOptions.length)];
      spawns.push({
        reel: nextPos.reel,
        row: nextPos.row,
        bananaId: necroBananaId
      });
      usedPositions.add(`${nextPos.reel},${nextPos.row}`);
    }
    
  
    
    return spawns;
  }

  /**
   * Place necromancer bananas into the reels
   * @param {Object} reels - Current reel state
   * @param {Array} spawns - Array of spawn positions from spawnNecromancerDemons
   * @returns {Object} - Updated reels with bananas placed
   */
  placeNecromancerDemons(reels, spawns) {
    if (!spawns || spawns.length === 0) return reels;
    
    // Clone reels
    const newReels = {};
    for (let reel = 0; reel < this.width; reel++) {
      newReels[reel] = [...reels[reel]];
    }
    
    // Place each banana
    for (const spawn of spawns) {
      newReels[spawn.reel][spawn.row] = spawn.bananaId;
    }
    
    return newReels;
  }

  /**
   * Select a weighted random symbol for mystery reveal
   * Returns the symbol ID that the mystery symbol will reveal to
   */
  getWeightedMysterySymbol() {
    const weights = serverConfig.symbolWeightMystery || { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1, 7: 1, 8: 1 };
    
    // Build weighted array
    const weighted = [];
    for (const [symbolId, weight] of Object.entries(weights)) {
      const numericId = parseInt(symbolId);
      if (weight > 0) {
        for (let i = 0; i < weight; i++) {
          weighted.push(numericId);
        }
      }
    }
    
    // Random selection
    if (weighted.length === 0) return 1; // Fallback to symbol 1
    return weighted[Math.floor(Math.random() * weighted.length)];
  }
  
  /**
   * Check if a symbol blocks other symbols from appearing behind it
   * (Hero, Banana, Monsters, etc.)
   */
  isBlockingSymbol(symbol) {
    return symbol === this.heroId || this.isDemon(symbol) || this.isPersistentBonusFeatureSymbol(symbol);
  }

  /**
   * Decides gravity direction based on hero position using gravityLaws from config
   * @param {Object} reels - Current reel state
   * @returns {string} - Gravity direction ('down', 'up', 'left', 'right')
   */
  decideGravity(reels) {
    const heroId = serverConfig.symbolsMapping.hero;
    const gravityLaws = serverConfig.gravityLaws;

    // Find hero position
    let heroReel = null;
    let heroRow = null;

    for (let reel = 0; reel < this.width; reel++) {
      for (let row = 0; row < this.height; row++) {
        if (reels[reel]?.[row] === heroId) {
          heroReel = reel;
          heroRow = row;
          break;
        }
      }
      if (heroReel !== null) break;
    }

    // If no hero found, default to 'down'
    if (heroReel === null || heroRow === null) {
      return 'down';
    }

    // Look up gravity from gravityLaws
    const gravityDirection = gravityLaws[heroReel]?.[heroRow];

    // If gravityLaws doesn't have this position or it's 'house', default to 'down'
    if (!gravityDirection || gravityDirection === 'house') {
      return 'down';
    }

    return gravityDirection;
  }

  /**
   * Find all clusters of size >= minSize
   * Hero acts as wild on any off-center board cell.
   * Bananas/Monsters do NOT participate in clusters
   * Cluster checks are banana-position driven:
   * - for each banana, we test neighboring paying symbols as cluster seeds
   * - off-center hero cells also seed neighboring cluster checks
   * - if no bananas exist, we fall back to full-board seed scanning
   * Monkey wild can contribute to multiple clusters.
   * Returns array of cluster objects: { symbol, positions: [{reel, row}, ...] }
   */
  findClusters(
    reels,
    minSize = 4,
    bananaMeterLevel = 0,
    heroState = null,
    useMainGameWildOverride = false,
    options = {}
  ) {
    const forceFullBoardScan = options?.forceFullBoardScan === true;
    const clusters = [];
    const seenClusterKeys = new Set();
    const heroWildCells = this.getHeroWildCellsForClusterEval(heroState);
    const activeWildCellKeys = new Set(heroWildCells.map((cell) => `${cell.reel},${cell.row}`));
    const wildStrength = useMainGameWildOverride
      ? this.getMainGameHeroWildStrengthByMeterLevel(bananaMeterLevel)
      : this.getHeroWildStrengthByMeterLevel(bananaMeterLevel);

    const key = (reel, row) => `${reel},${row}`;
    const bananaPositions = [];
    for (let reel = 0; reel < this.width; reel++) {
      for (let row = 0; row < this.height; row++) {
        const symbol = reels?.[reel]?.[row];
        if (this.isDemon(symbol)) {
          bananaPositions.push({ reel, row });
        }
      }
    }

    const getSymbol = (reel, row) => {
      if (reel < 0 || reel >= this.width || row < 0 || row >= this.height) return null;
      if (activeWildCellKeys.has(key(reel, row))) return this.heroId;
      return reels[reel]?.[row];
    };

    const getNeighbors = (reel, row) => ([
      { reel: reel - 1, row },
      { reel: reel + 1, row },
      { reel, row: row - 1 },
      { reel, row: row + 1 }
    ]);

    const isValidClusterStartSymbol = (symbol) =>
      symbol &&
      symbol !== "HOUSE" &&
      symbol !== 0 &&
      !this.isDemon(symbol) &&
      symbol !== this.heroId &&
      symbol !== this.mysteryWildId &&
      !this.isPersistentBonusFeatureSymbol(symbol);

    const floodFill = (startReel, startRow, targetSymbol) => {
      const queue = [{ reel: startReel, row: startRow }];
      const localVisited = new Set();
      const positions = [];
      const touchedWildKeys = new Set();

      while (queue.length > 0) {
        const { reel, row } = queue.shift();
        const posKey = key(reel, row);

        if (localVisited.has(posKey)) continue;
        localVisited.add(posKey);

        const symbol = getSymbol(reel, row);
        if (!symbol || symbol === "HOUSE" || symbol === 0 || this.isDemon(symbol)) continue;
        if (this.isHouse(reel, row)) continue;
        if (this.isPersistentBonusFeatureSymbol(symbol)) continue;

        if (activeWildCellKeys.has(posKey)) {
          touchedWildKeys.add(posKey);
          queue.push(...getNeighbors(reel, row));
          continue;
        }

        if (symbol !== targetSymbol && symbol !== this.mysteryWildId) continue;

        positions.push({ reel, row, symbol });
        queue.push(...getNeighbors(reel, row));
      }

      return { positions, touchedWildKeys };
    };

    const tryClusterFromStart = (reel, row, symbol) => {
      const clusterData = floodFill(reel, row, symbol);
      const positions = clusterData.positions;
      if (positions.length === 0) return;

      const clusterKey = `${symbol}|${positions
        .map((pos) => key(pos.reel, pos.row))
        .sort()
        .join(";")}`;
      if (seenClusterKeys.has(clusterKey)) return;
      seenClusterKeys.add(clusterKey);

      const heroWildCount = clusterData.touchedWildKeys.size;
      const effectiveSize = positions.length + heroWildCount * Math.max(1, wildStrength);
      if (effectiveSize < minSize) return;

      clusters.push({
        symbol,
        size: positions.length,
        effectiveSize,
        heroWildCount,
        positions
      });
    };

    const candidateStartsByKey = new Map();
    const addCandidateStart = (reel, row, symbol) => {
      if (!isValidClusterStartSymbol(symbol)) return;
      candidateStartsByKey.set(key(reel, row), { reel, row, symbol });
    };

    heroWildCells.forEach((wildCell) => {
      getNeighbors(wildCell.reel, wildCell.row).forEach((neighbor) => {
        addCandidateStart(neighbor.reel, neighbor.row, getSymbol(neighbor.reel, neighbor.row));
      });
    });

    if (!forceFullBoardScan && bananaPositions.length > 0) {
      bananaPositions.forEach(({ reel, row }) => {
        getNeighbors(reel, row).forEach((neighbor) => {
          addCandidateStart(neighbor.reel, neighbor.row, getSymbol(neighbor.reel, neighbor.row));
        });
      });
    } else {
      for (let reel = 0; reel < this.width; reel++) {
        for (let row = 0; row < this.height; row++) {
          addCandidateStart(reel, row, getSymbol(reel, row));
        }
      }
    }

    candidateStartsByKey.forEach((start) => {
      tryClusterFromStart(start.reel, start.row, start.symbol);
    });

    return clusters;
  }

  getDemonCheckSymbol(reels, reel, row, heroState = null, activeWildCellKeys = null) {
    if (reel < 0 || reel >= this.width || row < 0 || row >= this.height) {
      return null;
    }

    const heroAnchor = heroState?.anchor || heroState?.position || null;
    const heroFootprint = this.buildHeroFootprintState(heroAnchor, heroState?.size || 1);
    if (activeWildCellKeys?.has?.(`${reel},${row}`)) {
      return this.heroId;
    }
    if (heroFootprint.cellKeys.has(`${reel},${row}`) && this.shouldHeroActAsWild(heroAnchor)) {
      return this.heroId;
    }

    const symbol = reels?.[reel]?.[row];
    if (symbol === null || symbol === undefined) return 0;

    const parsed = Number(symbol);
    return Number.isFinite(parsed) ? parsed : symbol;
  }

  collectDemonCheckClusters(reels, bananaPosition, bananaMeterLevel = 0, minSize = 4, heroState = null) {
    if (!bananaPosition) return [];

    const paytable = serverConfig.paytable || {};
    const mysteryWildId = this.mysteryWildId;
    const key = (reel, row) => `${reel},${row}`;
    const effectiveHeroState = this.buildHeroFootprintState(
      heroState?.anchor || heroState?.position || bananaPosition,
      heroState?.size || 1
    );
    const activeWildCells = Array.isArray(heroState?.activeWildCells) && heroState.activeWildCells.length > 0
      ? heroState.activeWildCells
      : [bananaPosition];
    const activeWildCellKeys = new Set(activeWildCells.map((cell) => key(cell.reel, cell.row)));
    const wildStrength = heroState?.useMainGameWildOverride
      ? this.getMainGameHeroWildStrengthByMeterLevel(bananaMeterLevel)
      : this.getHeroWildStrengthByMeterLevel(bananaMeterLevel);

    const getNeighbors = (reel, row) => ([
      { reel: reel - 1, row },
      { reel: reel + 1, row },
      { reel, row: row - 1 },
      { reel, row: row + 1 }
    ]);
    const isPayingSymbol = (symbol) =>
      symbol !== null &&
      symbol !== undefined &&
      symbol !== 0 &&
      symbol !== "HOUSE" &&
      Object.prototype.hasOwnProperty.call(paytable, String(symbol));

    const starts = new Map();
    activeWildCells.forEach((wildCell) => {
      getNeighbors(wildCell.reel, wildCell.row).forEach((pos) => {
        const symbol = this.getDemonCheckSymbol(reels, pos.reel, pos.row, effectiveHeroState, activeWildCellKeys);
        if (!isPayingSymbol(symbol)) return;
        starts.set(key(pos.reel, pos.row), { reel: pos.reel, row: pos.row, symbol });
      });
    });

    const seenClusterKeys = new Set();
    const clusters = [];

    const floodFill = (start, targetSymbol) => {
      const queue = [start];
      const localVisited = new Set();
      const positions = [];
      const touchedWildKeys = new Set();

      while (queue.length > 0) {
        const current = queue.shift();
        const posKey = key(current.reel, current.row);
        if (localVisited.has(posKey)) continue;
        localVisited.add(posKey);

        const symbol = this.getDemonCheckSymbol(reels, current.reel, current.row, effectiveHeroState, activeWildCellKeys);
        if (
          symbol === null ||
          symbol === undefined ||
          symbol === 0 ||
          symbol === "HOUSE" ||
          this.isHouse(current.reel, current.row) ||
          this.isDemon(symbol)
        ) {
          continue;
        }

        if (activeWildCellKeys.has(posKey)) {
          touchedWildKeys.add(posKey);
          queue.push(...getNeighbors(current.reel, current.row));
          continue;
        }

        if (symbol !== targetSymbol && !activeWildCellKeys.has(posKey) && symbol !== mysteryWildId) {
          continue;
        }

        positions.push({ reel: current.reel, row: current.row, symbol });
        queue.push(...getNeighbors(current.reel, current.row));
      }

      return {
        positions,
        touchedWildKeys
      };
    };

    starts.forEach((start) => {
      const clusterData = floodFill({ reel: start.reel, row: start.row }, start.symbol);
      const positions = clusterData.positions;
      if (!positions.length) return;

      const clusterKey = `${start.symbol}|${positions
        .map((p) => key(p.reel, p.row))
        .sort()
        .join(";")}`;
      if (seenClusterKeys.has(clusterKey)) return;
      seenClusterKeys.add(clusterKey);

      const heroWildCount = clusterData.touchedWildKeys.size;
      const effectiveSize = positions.length + heroWildCount * Math.max(1, wildStrength);
      if (effectiveSize < minSize) return;

      clusters.push({
        symbol: start.symbol,
        size: positions.length,
        effectiveSize,
        heroWildCount,
        positions
      });
    });

    return clusters;
  }

  applyDemonCheckClusterExplosions(
    reels,
    bananaPosition,
    bananaMeterLevel = 0,
    minSize = 4,
    betSize = 0,
    multiplier = 1,
    heroState = null,
    options = {}
  ) {
    const includeHeroWildCells = options?.includeHeroWildCells === true;
    const clusters = this.collectDemonCheckClusters(reels, bananaPosition, bananaMeterLevel, minSize, heroState);
    const scoreResult = this.scoreClusters(clusters, betSize, multiplier);
    if (!scoreResult.hasWins) {
      return { hasClusters: false, clusters: [], twa: 0, tbm: 0, collectedSymbols: [] };
    }

    const uniquePositions = new Set();
    const collectedSymbols = [];
    scoreResult.clusters.forEach((cluster) => {
      cluster.positions.forEach((pos) => {
        uniquePositions.add(`${pos.reel},${pos.row}`);
      });
    });

    uniquePositions.forEach((posKey) => {
      const [reel, row] = posKey.split(",").map(Number);
      if (!Number.isFinite(reel) || !Number.isFinite(row)) return;

      const isHeroWildCell = heroState?.cellKeys?.has?.(`${reel},${row}`) === true;
      const isBananaAnchorCell = Boolean(bananaPosition && reel === bananaPosition.reel && row === bananaPosition.row);

      // Legacy behavior keeps temporary wild spots untouched.
      // Bonus flow can opt-in to collect/remove these cells so visuals and state stay aligned.
      if (!includeHeroWildCells && (isHeroWildCell || isBananaAnchorCell)) {
        return;
      }

      if (this.isHouse(reel, row)) return;
      const symbol = reels?.[reel]?.[row];
      if (symbol === null || symbol === undefined || symbol === 0 || symbol === "HOUSE") return;

      // Blocking symbols persist by rule.
      if (this.isBlockingSymbol(symbol)) return;

      const collectableSymbolId = this.getCollectableBonusSymbolId(symbol);
      if (collectableSymbolId !== null) {
        collectedSymbols.push({ reel, row, symbol: collectableSymbolId });
      }

      reels[reel][row] = 0;
    });

    return {
      hasClusters: true,
      clusters: scoreResult.clusters,
      twa: scoreResult.twa,
      tbm: scoreResult.tbm,
      collectedSymbols
    };
  }

  simulateMainGameAngelWinOutcome(reels, gameState = null) {
    if (!this.isHeavenHellEnabled() || !reels || gameState?.isBonus === true) {
      return { hasAngelWin: false, huntResult: null };
    }
    if (!this.boardHasDemons(reels)) {
      return { hasAngelWin: false, huntResult: null };
    }

    const simulatedGameState = JSON.parse(JSON.stringify(gameState || {}));
    simulatedGameState.isBonus = false;
    simulatedGameState.betSize = Number(gameState?.betSize || simulatedGameState?.betSize || 0);
    simulatedGameState.multiplier = Number(gameState?.multiplier || simulatedGameState?.multiplier || 1);
    simulatedGameState.heroPosition = gameState?.heroPosition || null;
    simulatedGameState.heroFootprintSize = Math.max(
      1,
      Math.floor(Number(gameState?.heroFootprintSize || simulatedGameState?.heroFootprintSize || 1) || 1)
    );
    simulatedGameState.heroAngelNextMultiplier = this.clampMainGameAngelMultiplier(
      gameState?.heroAngelNextMultiplier ?? simulatedGameState?.heroAngelNextMultiplier ?? 1
    );
    simulatedGameState.heroAngelMultiplier = Number.isFinite(Number(gameState?.heroAngelMultiplier))
      ? this.clampMainGameAngelMultiplier(gameState.heroAngelMultiplier)
      : null;

    const huntResult = this.executeDemonHunt(
      reels,
      "destroy",
      BASE_MONKEY_STATE.weapon,
      simulatedGameState.heroPosition,
      simulatedGameState
    );

    return {
      hasAngelWin: Number(huntResult?.clusterWinTbm || 0) > 0,
      huntResult
    };
  }

  evaluateMainGameAngelWinStruggle(reels, gameState = null) {
    const startingMultiplier = this.clampMainGameAngelMultiplier(
      gameState?.heroAngelNextMultiplier ?? gameState?.heroAngelMultiplier ?? 1
    );
    const rule = this.getMainGameAngelWinStruggleRule(startingMultiplier);
    const simulation = this.simulateMainGameAngelWinOutcome(reels, gameState);
    const shouldReroll = Boolean(
      simulation.hasAngelWin &&
      rule &&
      rule.times > 0 &&
      this.rollChance(rule.odds)
    );

    return {
      ...simulation,
      startingMultiplier,
      rule,
      shouldReroll,
      rerollAttempts: shouldReroll ? rule.times : 0
    };
  }

  /**
   * Attempt to reroll new symbols to create wins (Normal Win Boost)
   * Only rerolls symbols that were spawned from outside the grid
   */
  attemptNormalWinBoost(reels, newSymbolPositions, betSize, multiplier, boostConfig, heroState = null, bananaMeterLevel = null, useMainGameWildOverride = false) {
    const maxAttempts = boostConfig.maxAttempts || 3;
    const minNewSymbols = boostConfig.minNewSymbols || 3;
    
    // Extract new symbol positions into array
    const newPositions = Array.from(newSymbolPositions).map(key => {
      const [reel, row] = key.split(',').map(Number);
      return { reel, row };
    });
    
    // Need at least minNewSymbols to attempt boost
    if (newPositions.length < minNewSymbols) {
      return { hasWins: false };
    }
    
    // Try rerolling up to maxAttempts times
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const rerollReels = JSON.parse(JSON.stringify(reels)); // Deep copy
      
      // Reroll each new symbol position
      newPositions.forEach(pos => {
        // Use getRandomSymbol with no bananas or time symbols for clean reroll
        const newSymbol = this.getRandomSymbol(this.serverConfig.symbolWeightsMain, false, 0, 0);
        rerollReels[pos.reel][pos.row] = newSymbol;
      });
      
      // Check if reroll created wins
      const result = this.processClusters(
        rerollReels,
        betSize,
        serverConfig.minClusterSize || 4,
        multiplier,
        bananaMeterLevel,
        heroState,
        useMainGameWildOverride
      );
      
      if (result.hasWins) {
        return {
          hasWins: true,
          reels: rerollReels,
          result: result
        };
      }
    }
    
    // No wins found after all attempts
    return { hasWins: false };
  }

  attemptMainGameAngelWinStruggleReroll(reels, newSymbolPositions, rerollAttempts, gameState = null) {
    const maxAttempts = Math.max(0, Math.floor(Number(rerollAttempts) || 0));
    const newPositions = Array.from(newSymbolPositions || [])
      .map((key) => {
        const [reel, row] = String(key).split(",").map(Number);
        return { reel, row };
      })
      .filter((pos) => Number.isFinite(pos.reel) && Number.isFinite(pos.row));

    const paytable = serverConfig.paytable || {};
    const candidatePositions = newPositions.filter((pos) => {
      const symbol = reels?.[pos.reel]?.[pos.row];
      return Object.prototype.hasOwnProperty.call(paytable, String(symbol));
    });

    if (maxAttempts <= 0 || candidatePositions.length === 0) {
      return {
        reels,
        struggleResolved: false,
        attemptsUsed: 0,
        simulation: this.simulateMainGameAngelWinOutcome(reels, gameState)
      };
    }

    let finalReels = reels;
    let finalSimulation = this.simulateMainGameAngelWinOutcome(reels, gameState);

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const rerollReels = JSON.parse(JSON.stringify(reels));
      candidatePositions.forEach((pos) => {
        rerollReels[pos.reel][pos.row] = this.getRandomSymbol(
          this.serverConfig?.symbolWeightsMain || serverConfig.symbolWeightsMain,
          false,
          0,
          0
        );
      });

      finalReels = rerollReels;
      finalSimulation = this.simulateMainGameAngelWinOutcome(rerollReels, gameState);
      if (!finalSimulation.hasAngelWin) {
        return {
          reels: finalReels,
          struggleResolved: true,
          attemptsUsed: attempt + 1,
          simulation: finalSimulation
        };
      }
    }

    return {
      reels: finalReels,
      struggleResolved: !finalSimulation.hasAngelWin,
      attemptsUsed: maxAttempts,
      simulation: finalSimulation
    };
  }

  /**
   * Remove clusters and return updated reels + win data
   */
  scoreClusters(clusters, betSize, multiplier = 1) {
    if (!Array.isArray(clusters) || clusters.length === 0) {
      return {
        hasWins: false,
        clusters: [],
        twa: 0,
        tbm: 0
      };
    }

    const paytable = serverConfig.paytable || {};
    const payingClusters = [];
    let totalTbm = 0;
    let totalTwa = 0;

    clusters.forEach(cluster => {
      const symbolId = String(cluster.symbol);
      const clusterSize = cluster.effectiveSize ?? cluster.size;
      const symbolPaytable = paytable[symbolId];
      let twa = 0;
      let tbm = 0;
      let bm = 0;
      
      if (symbolPaytable) {
        const sizes = Object.keys(symbolPaytable).map(Number).sort((a, b) => b - a);
        
        for (const size of sizes) {
          if (clusterSize >= size) {
            bm = symbolPaytable[String(size)];
            break;
          }
        }
      }
      
      if (bm && bm > 0) {
        tbm = bm * multiplier;
      }

      twa = tbm * betSize;
      
      if (tbm && tbm > 0) {
        cluster.payout = twa;
        cluster.multiplier = multiplier;
        cluster.bm = bm;
        cluster.tbm = tbm;
        payingClusters.push(cluster);
        totalTbm += tbm;
        totalTwa += twa;
      }
    });

    return {
      hasWins: payingClusters.length > 0,
      clusters: payingClusters,
      twa: totalTwa,
      tbm: totalTbm
    };
  }

  boardHasDemons(reels) {
    if (!reels) return false;
    for (let reel = 0; reel < this.width; reel++) {
      for (let row = 0; row < this.height; row++) {
        if (this.isDemon(reels?.[reel]?.[row])) {
          return true;
        }
      }
    }
    return false;
  }

  resolveFullBoardClusterResult(
    reels,
    betSize,
    minSize = 4,
    multiplier = 1,
    bananaMeterLevel = null,
    heroState = null,
    useMainGameWildOverride = false
  ) {
    if (!this.boardHasDemons(reels)) {
      return null;
    }
    const fullBoardResult = this.processClusters(
      reels,
      betSize,
      minSize,
      multiplier,
      bananaMeterLevel,
      heroState,
      useMainGameWildOverride,
      { forceFullBoardScan: true }
    );
    return fullBoardResult.hasWins ? fullBoardResult : null;
  }

  processClusters(
    reels,
    betSize,
    minSize = 4,
    multiplier = 1,
    bananaMeterLevel = null,
    heroState = null,
    useMainGameWildOverride = false,
    options = {}
  ) {
    const parsedMeterLevel = Number(bananaMeterLevel);
    const effectiveMeterLevel = Number.isFinite(parsedMeterLevel)
      ? Math.max(0, Math.floor(parsedMeterLevel))
      : 0;
    const clusters = this.findClusters(
      reels,
      minSize,
      effectiveMeterLevel,
      heroState,
      useMainGameWildOverride,
      options
    );
    
    if (clusters.length === 0) {
      return {
        hasWins: false,
        clusters: [],
        updatedReels: reels,
        twa: 0,
        tbm: 0
      };
    }

    const scoreResult = this.scoreClusters(clusters, betSize, multiplier);
    const payingClusters = scoreResult.clusters;
    const totalTbm = scoreResult.tbm;

    // If no paying clusters, return no wins
    if (!scoreResult.hasWins) {
      return {
        hasWins: false,
        clusters: [],
        updatedReels: reels,
        twa: 0,
        tbm: 0
      };
    }

    // Mark positions to remove (only for paying clusters)
    const toRemove = new Set();
    payingClusters.forEach(cluster => {
      cluster.positions.forEach(pos => {
        toRemove.add(`${pos.reel},${pos.row}`);
      });
    });

    // Create new reels with removed symbols set to 0 (empty)
    // BUT: Don't remove blocking symbols (hero, banana) - they persist
    const updatedReels = {};
    for (let reel = 0; reel < this.width; reel++) {
      updatedReels[reel] = [...reels[reel]];
      for (let row = 0; row < this.height; row++) {
        if (toRemove.has(`${reel},${row}`)) {
          const symbol = reels[reel][row];
          // Don't remove blocking symbols - they stay on board
          if (!this.isBlockingSymbol(symbol)) {
            updatedReels[reel][row] = 0; // Mark as empty
          }
          // Blocking symbols stay in place even if part of winning cluster
        }
      }
    }

    return {
      hasWins: true,
      clusters: payingClusters, // Only return paying clusters
      updatedReels,
      tbm: totalTbm, // Win in bet multiples
      twa: scoreResult.twa // Actual currency amount
    };
  }

  /**
   * Apply gravity: drop symbols down and fill empty spaces
   * Symbols pass through house positions during drops
   * @param {boolean} allowDemons - If false, prevents banana spawning in new symbols (default: true)
   * @param {number} timeSymbolChance - Chance (0-100) to spawn time symbols in new positions (default: 0)
   * @param {number} demonChanceMultiplier - Multiplier for banana spawn chance (default: 1.0)
   * @param {number|null} demonBaseChance - Base per-new-symbol banana chance for this gravity pass
   */
  applyGravity(
    reels,
    symbolWeights,
    direction = 'down',
    allowDemons = true,
    timeSymbolChance = 0,
    demonChanceMultiplier = 1.0,
    demonBaseChance = null,
    heroState = null,
    options = {}
  ) {
    const newReels = {};
    const movements = [];
    const parsedDemonBaseChance = Number(demonBaseChance);
    const fallbackDemonBaseChance = Number(serverConfig.bananaSpawn?.respinChance);
    const resolvedDemonBaseChance = Number.isFinite(parsedDemonBaseChance)
      ? Math.max(0, parsedDemonBaseChance)
      : (Number.isFinite(fallbackDemonBaseChance) ? Math.max(0, fallbackDemonBaseChance) : 0.05);
    const heroFootprint = this.buildHeroFootprintState(
      heroState?.anchor || heroState?.position || null,
      heroState?.size || 1
    );
    const spawnBehaviorMode = options?.spawnBehaviorMode || (options?.isBonus === true ? "bonus" : "base");
    const spawnBehavior = this.getSymbolSpawnBehaviorConfig(spawnBehaviorMode);
    const pairState = this.createReelPairState(this.width);
    const isReservedHeroCell = (reel, row) => heroFootprint.cellKeys.has(`${reel},${row}`);
    const getHeroCellValue = (reel, row) => (
      heroFootprint.anchor &&
      reel === heroFootprint.anchor.reel &&
      row === heroFootprint.anchor.row
    ) ? this.heroId : 0;

    if (direction === 'down' || direction === 'up') {
      // VERTICAL GRAVITY: Work per reel (column)
      for (let reel = 0; reel < this.width; reel++) {
        const column = reels[reel] || [];
        const newColumn = new Array(this.height).fill(null);
        
      // Collect remaining symbols with their original positions
      const houseId = serverConfig.symbolsMapping?.house || 'HOUSE';
      
      const remaining = [];
      for (let row = 0; row < this.height; row++) {
        if (isReservedHeroCell(reel, row)) continue;
        const symbol = column[row];
        // Keep only valid symbols (not empty, not null, not HOUSE, not blocking symbols)
        if (symbol !== null && symbol !== 0 && symbol !== houseId && !this.isBlockingSymbol(symbol)) {
          // Ensure number type consistency
          const normalizedSymbol = typeof symbol === 'string' && symbol !== houseId ? Number(symbol) : symbol;
          remaining.push({ symbol: normalizedSymbol, fromRow: row });
        }
      }

        // For UP gravity, reverse the remaining symbols so they maintain relative position
        if (direction === 'up') {
          remaining.reverse();
        }

        let remainingIndex = 0;
        let newSymbolOffset = 0;

        if (direction === 'down') {
          // DOWN: Fill from bottom (row 0) upward to top (row 7)
          for (let row = 0; row < this.height; row++) {
            if (this.isHouse(reel, row)) {
              this.resetPairStateForReel(pairState, reel);
              newColumn[row] = 'HOUSE';
            } else if (isReservedHeroCell(reel, row)) {
              this.resetPairStateForReel(pairState, reel);
              newColumn[row] = getHeroCellValue(reel, row);
            } else if (this.isBlockingSymbol(column[row])) {
              // Keep blocking symbols (hero, banana) in place - symbols pass over/around them
              this.resetPairStateForReel(pairState, reel);
              newColumn[row] = column[row];
            } else if (remainingIndex < remaining.length) {
              const item = remaining[remainingIndex++];
              this.resetPairStateForReel(pairState, reel);
              newColumn[row] = item.symbol;
              movements.push({
                reel: reel,
                fromReel: reel,
                toReel: reel,
                from: item.fromRow,
                to: row,
                symbol: item.symbol
              });
            } else {
              // New symbols spawn from above (row 8, 9, 10...)
              // Allow bananas during respins with configured chance (unless disabled)
              const baseDemonChance = allowDemons ? resolvedDemonBaseChance : 0;
              const demonChance = Math.max(0, baseDemonChance * demonChanceMultiplier);
              const newSymbol = this.getSpawnSymbolForReel(
                reel,
                symbolWeights,
                pairState,
                {
                  allowDemons: true,
                  demonChance,
                  timeSymbolChance
                },
                spawnBehavior
              );

              newColumn[row] = newSymbol;
              const fromPosition = this.height + newSymbolOffset;
              movements.push({
                reel: reel,
                fromReel: reel,
                toReel: reel,
                from: fromPosition,
                to: row,
                symbol: newSymbol
              });
              newSymbolOffset++;
            }
          }
        } else if (direction === 'up') {
          // UP: Fill from top (row 7) downward to bottom (row 0)
          for (let row = this.height - 1; row >= 0; row--) {
            if (this.isHouse(reel, row)) {
              this.resetPairStateForReel(pairState, reel);
              newColumn[row] = 'HOUSE';
            } else if (isReservedHeroCell(reel, row)) {
              this.resetPairStateForReel(pairState, reel);
              newColumn[row] = getHeroCellValue(reel, row);
            } else if (this.isBlockingSymbol(column[row])) {
              // Keep blocking symbols (hero, banana) in place - symbols pass over/around them
              this.resetPairStateForReel(pairState, reel);
              newColumn[row] = column[row];
            } else if (remainingIndex < remaining.length) {
              const item = remaining[remainingIndex++];
              this.resetPairStateForReel(pairState, reel);
              newColumn[row] = item.symbol;
              movements.push({
                reel: reel,
                fromReel: reel,
                toReel: reel,
                from: item.fromRow,
                to: row,
                symbol: item.symbol
              });
            } else {
              // New symbols spawn from below (row -1, -2, -3...)
              // Allow bananas during respins with configured chance (unless disabled)
              const baseDemonChance = allowDemons ? resolvedDemonBaseChance : 0;
              const demonChance = Math.max(0, baseDemonChance * demonChanceMultiplier);
              const newSymbol = this.getSpawnSymbolForReel(
                reel,
                symbolWeights,
                pairState,
                {
                  allowDemons: true,
                  demonChance,
                  timeSymbolChance
                },
                spawnBehavior
              );
              newColumn[row] = newSymbol;
              const fromPosition = -(newSymbolOffset + 1);
              movements.push({
                reel: reel,
                fromReel: reel,
                toReel: reel,
                from: fromPosition,
                to: row,
                symbol: newSymbol
              });
              newSymbolOffset++;
            }
          }
        }

        newReels[reel] = newColumn;
      }
    } else if (direction === 'left' || direction === 'right') {
      // HORIZONTAL GRAVITY: Work per row
      // Initialize all reels
      for (let reel = 0; reel < this.width; reel++) {
        newReels[reel] = new Array(this.height).fill(null);
      }

      for (let row = 0; row < this.height; row++) {
        // Collect remaining symbols in this row across all reels
        const houseId = serverConfig.symbolsMapping?.house || 'HOUSE';
        
        const remaining = [];
        for (let reel = 0; reel < this.width; reel++) {
          if (isReservedHeroCell(reel, row)) continue;
          const symbol = reels[reel]?.[row];
          if (symbol !== null && symbol !== 0 && symbol !== houseId && !this.isBlockingSymbol(symbol)) {
            const normalizedSymbol = typeof symbol === 'string' && symbol !== houseId ? Number(symbol) : symbol;
            remaining.push({ symbol: normalizedSymbol, fromReel: reel });
          }
        }

        // For RIGHT gravity, reverse the remaining symbols
        if (direction === 'right') {
          remaining.reverse();
        }

        let remainingIndex = 0;
        let newSymbolOffset = 0;

        if (direction === 'left') {
          // LEFT: Fill from left (reel 0) to right (reel 7)
          for (let reel = 0; reel < this.width; reel++) {
            if (this.isHouse(reel, row)) {
              this.resetPairStateForReel(pairState, reel);
              newReels[reel][row] = 'HOUSE';
            } else if (isReservedHeroCell(reel, row)) {
              this.resetPairStateForReel(pairState, reel);
              newReels[reel][row] = getHeroCellValue(reel, row);
            } else if (this.isBlockingSymbol(reels[reel]?.[row])) {
              // Keep blocking symbols (hero, banana, etc.) in place
              this.resetPairStateForReel(pairState, reel);
              newReels[reel][row] = reels[reel][row];
            } else if (remainingIndex < remaining.length) {
              const item = remaining[remainingIndex++];
              this.resetPairStateForReel(pairState, reel);
              newReels[reel][row] = item.symbol;
              movements.push({
                reel: reel,
                fromReel: item.fromReel,
                toReel: reel,
                from: row,
                to: row,
                symbol: item.symbol
              });
      } else {
              // New symbols spawn from right (reel 8, 9, 10...)
              // Allow bananas during respins with configured chance (unless disabled)
              const baseDemonChance = allowDemons ? resolvedDemonBaseChance : 0;
              const demonChance = Math.max(0, baseDemonChance * demonChanceMultiplier);
              const newSymbol = this.getSpawnSymbolForReel(
                reel,
                symbolWeights,
                pairState,
                {
                  allowDemons: true,
                  demonChance,
                  timeSymbolChance
                },
                spawnBehavior
              );
              newReels[reel][row] = newSymbol;
              const fromPosition = this.width + newSymbolOffset;
              movements.push({
                reel: reel,
                fromReel: fromPosition,
                toReel: reel,
                from: row,
                to: row,
                symbol: newSymbol
              });
              newSymbolOffset++;
            }
          }
        } else if (direction === 'right') {
          // RIGHT: Fill from right (reel 7) to left (reel 0)
          for (let reel = this.width - 1; reel >= 0; reel--) {
            if (this.isHouse(reel, row)) {
              this.resetPairStateForReel(pairState, reel);
              newReels[reel][row] = 'HOUSE';
            } else if (isReservedHeroCell(reel, row)) {
              this.resetPairStateForReel(pairState, reel);
              newReels[reel][row] = getHeroCellValue(reel, row);
            } else if (this.isBlockingSymbol(reels[reel]?.[row])) {
              // Keep blocking symbols (hero, banana, etc.) in place
              this.resetPairStateForReel(pairState, reel);
              newReels[reel][row] = reels[reel][row];
            } else if (remainingIndex < remaining.length) {
              const item = remaining[remainingIndex++];
              this.resetPairStateForReel(pairState, reel);
              newReels[reel][row] = item.symbol;
              movements.push({
                reel: reel,
                fromReel: item.fromReel,
                toReel: reel,
                from: row,
                to: row,
                symbol: item.symbol
              });
            } else {
              // New symbols spawn from left (reel -1, -2, -3...)
              // Allow bananas during respins with configured chance (unless disabled)
              const baseDemonChance = allowDemons ? resolvedDemonBaseChance : 0;
              const demonChance = Math.max(0, baseDemonChance * demonChanceMultiplier);
              const newSymbol = this.getSpawnSymbolForReel(
                reel,
                symbolWeights,
                pairState,
                {
                  allowDemons: true,
                  demonChance,
                  timeSymbolChance
                },
                spawnBehavior
              );
              newReels[reel][row] = newSymbol;
              const fromPosition = -(newSymbolOffset + 1);
              movements.push({
                reel: reel,
                fromReel: fromPosition,
                toReel: reel,
                from: row,
                to: row,
                symbol: newSymbol
              });
              newSymbolOffset++;
            }
          }
        }
      }
    }

    return {
      reels: newReels,
      dropEvent: {
        movements: movements,
        direction: direction
      }
    };
  }

  /**
   * Find path from start to target using BFS (no diagonals)
   * @param {Set} alreadyWalked - Set of "reel,row" strings for positions already walked
   * @param {boolean} shortestPathMode - If true, use shortest path. If false, avoid walked positions
   * Returns array of {reel, row} positions
   */
  findPath(startReel, startRow, targetReel, targetRow, reels, alreadyWalked = new Set(), shortestPathMode = true, footprintSize = 1) {
    const queue = [[{reel: startReel, row: startRow}]];
    const visited = new Set([`${startReel},${startRow}`]);
    const allPaths = []; // Collect all paths of same length for comparison
    let shortestLength = Infinity;
    
    while (queue.length > 0) {
      const path = queue.shift();
      const current = path[path.length - 1];
      
      // If path is already longer than shortest found, skip
      if (path.length > shortestLength) {
        continue;
      }
      
      // Found target
      if (current.reel === targetReel && current.row === targetRow) {
        if (shortestPathMode) {
          // In shortest path mode, collect all paths of same length
          if (path.length < shortestLength) {
            allPaths.length = 0; // Clear previous paths
            shortestLength = path.length;
          }
          if (path.length === shortestLength) {
            allPaths.push(path);
          }
        } else {
          // In avoid-walked mode, return first valid path found
          return path;
        }
        continue; // Keep searching for other paths of same length
      }
      
      // Check all 4 directions (no diagonals)
      const directions = [
        {reel: current.reel - 1, row: current.row}, // left
        {reel: current.reel + 1, row: current.row}, // right
        {reel: current.reel, row: current.row - 1}, // down
        {reel: current.reel, row: current.row + 1}  // up
      ];
      
      // Sort directions by preference if avoiding walked paths
      if (!shortestPathMode) {
        directions.sort((a, b) => {
          const aKey = `${a.reel},${a.row}`;
          const bKey = `${b.reel},${b.row}`;
          const aWalked = alreadyWalked.has(aKey) ? 1 : 0;
          const bWalked = alreadyWalked.has(bKey) ? 1 : 0;
          return aWalked - bWalked; // Prefer non-walked positions
        });
      }
      
      for (const next of directions) {
        const key = `${next.reel},${next.row}`;
        
        // Check bounds
        if (!this.isValidHeroAnchor(next.reel, next.row, footprintSize)) {
          continue;
        }
        
        // Skip visited in THIS search
        if (visited.has(key)) {
          continue;
        }
        
        visited.add(key);
        queue.push([...path, next]);
      }
    }
    
    // If we collected multiple paths (shortest path mode), pick best one
    if (allPaths.length > 0) {
      // Prefer path with fewest already-walked positions
      return allPaths.reduce((best, current) => {
        const bestWalkedCount = this.countPathWalkedCells(best, alreadyWalked, footprintSize);
        const currentWalkedCount = this.countPathWalkedCells(current, alreadyWalked, footprintSize);
        return currentWalkedCount < bestWalkedCount ? current : best;
      });
    }
    
    return null; // No path found
  }

  /**
   * Calculate how many orbs should drop based on hero's weapon
   * @param {number|string} weaponIdOrName - Weapon ID (0, 1, 2) or weapon name ("staff", "sword", "axe")
   * @returns {number} Number of orbs to drop
   */
  calculateOrbDrops(_weaponIdOrName = 0) {
    // Thunderkong rule: collecting bananas must not increase multiplier.
    // Keep orb drops disabled for hunt flow.
    return 0;
  }

  rollGoldPileDrop(bananaSymbolId, reel, row, weaponIdOrName, gameState) {
    // Thunderkong rule: bananas never drop gold.
    return;
  }

  collectGoldPiles(gameState) {
    if (!gameState) return;
    gameState.collectedGoldPiles = null;
    gameState.goldPiles = [];
  }

  /**
   * Check if troll should rush based on odds
   * @param {boolean} isBonus - Whether we're in bonus mode
   * @param {object} heroPosition - Hero's current position (null if not on board)
   * @param {number} multiplier - Current multiplier value
   * @returns {boolean} - True if troll should rush
   */
  shouldTrollRush(isBonus, heroPosition, multiplier = 1) {
    if (!TROLL_FEATURE_ENABLED) {
      return false;
    }
    // Troll can ONLY appear when hero is present on the board
    if (!heroPosition || heroPosition.reel === undefined || heroPosition.row === undefined) {
      return false;
    }
    
    // Get base odds
    let odds = isBonus 
      ? serverConfig.trollRushOdds?.bonusGame || 8
      : serverConfig.trollRushOdds?.baseGame || 5;
    
    // Apply multiplier-based reduction if configured
    const reductionConfig = serverConfig.trollRushOdds?.oddsReductionWhenMultiplier || {};
    
    // Find the highest multiplier threshold that applies
    let applicableReduction = null;
    let highestThreshold = 0;
    
    for (const [threshold, reduction] of Object.entries(reductionConfig)) {
      const thresholdNum = parseInt(threshold);
      if (multiplier >= thresholdNum && thresholdNum > highestThreshold) {
        highestThreshold = thresholdNum;
        applicableReduction = reduction;
      }
    }
    
    // Apply reduction if found (multiply odds by reduction factor)
    if (applicableReduction !== null) {
      odds *= applicableReduction;
    }
    
    return Math.random() * 100 < odds;
  }

  /**
   * Find valid position for 3x3 troll spawn with straight-line rush
   * - If hero present: Rush towards hero in straight line (3 reels/rows wide)
   * - If hero not present: Random position avoiding starting position and house
   * @param {object} reels - Current game reels
   * @param {object} heroPosition - Hero's current position (null if not on board)
   * @returns {object|null} - {topLeftReel, topLeftRow, direction, positions} or null if no valid position
   */
  findTrollRushPosition(reels, heroPosition) {
    const trollRushLaws = serverConfig.trollRushLaws;
    if (!trollRushLaws) return null;

    const heroIsPresent = heroPosition && heroPosition.reel !== undefined && heroPosition.row !== undefined;
    const heroStartingPos = serverConfig.heroStartingPosition || { reel: 4, row: 2 };
    
    // Always avoid the 2x2 house area (center of grid: reels 3-4, rows 3-4)
    const housePositions = [
      { reel: 3, row: 3 },
      { reel: 3, row: 4 },
      { reel: 4, row: 3 },
      { reel: 4, row: 4 }
    ];
    
    // Determine rush direction based on hero position (if present)
    let preferredDirection = null;
    if (heroIsPresent) {
      // Calculate which direction gives longest destruction path towards hero
      // Prioritize horizontal (left/right) over vertical (up/down)
      if (heroPosition.reel < 3) {
        // Hero on left side → rush FROM right
        preferredDirection = 'fromright';
      } else if (heroPosition.reel > 4) {
        // Hero on right side → rush FROM left
        preferredDirection = 'fromleft';
      } else if (heroPosition.row < 3) {
        // Hero on top → rush FROM bottom
        preferredDirection = 'fromdown';
      } else if (heroPosition.row > 4) {
        // Hero on bottom → rush FROM top
        preferredDirection = 'fromtop';
      } else {
        // Hero near center, pick based on which gives more space
        if (heroPosition.reel <= 3) {
          preferredDirection = 'fromright';
        } else {
          preferredDirection = 'fromleft';
        }
      }
    }
    
    // Helper: Check if rush direction would pass through a position
    const rushPassesThrough = (trollCenterReel, trollCenterRow, direction, targetReel, targetRow) => {
      switch (direction) {
        case 'fromleft':
          // Coming from left (reel -1), passes through if target is left of troll center
          return targetRow >= trollCenterRow - 1 && targetRow <= trollCenterRow + 1 && targetReel < trollCenterReel;
        case 'fromright':
          // Coming from right (reel 8+), passes through if target is right of troll center
          return targetRow >= trollCenterRow - 1 && targetRow <= trollCenterRow + 1 && targetReel > trollCenterReel;
        case 'fromtop':
          // Coming from top (row -1), passes through if target is above troll center
          return targetReel >= trollCenterReel - 1 && targetReel <= trollCenterReel + 1 && targetRow < trollCenterRow;
        case 'fromdown':
          // Coming from bottom (row 8+), passes through if target is below troll center
          return targetReel >= trollCenterReel - 1 && targetReel <= trollCenterReel + 1 && targetRow > trollCenterRow;
      }
      return false;
    };
    
    // Helper: Check if a position is directly adjacent to target (up/down/left/right only)
    const isAdjacentTo = (reel, row, targetReel, targetRow) => {
      const reelDist = Math.abs(reel - targetReel);
      const rowDist = Math.abs(row - targetRow);
      return (reelDist === 1 && rowDist === 0) || (reelDist === 0 && rowDist === 1);
    };
    
    // Collect all valid positions
    const validPositions = [];
    const heroHitPositions = []; // Troll's 3x3 INCLUDES hero position
    
    // A 3x3 troll can have top-left corner at reels 0-5 and rows 0-5
    for (let reel = 0; reel <= 5; reel++) {
      for (let row = 0; row <= 5; row++) {
        let containsHero = false;
        let overlapsStarting = false;
        let overlapsHouse = false;
        
        for (let r = reel; r < reel + 3; r++) {
          for (let ro = row; ro < row + 3; ro++) {
            // Check if troll's 3x3 CONTAINS hero
            if (heroIsPresent && r === heroPosition.reel && ro === heroPosition.row) {
              containsHero = true;
            }
            // Check starting position overlap (not used since hero must be present)
            if (!heroIsPresent && r === heroStartingPos.reel && ro === heroStartingPos.row) {
              overlapsStarting = true;
            }
            // Check house overlap
            for (const housePos of housePositions) {
              if (r === housePos.reel && ro === housePos.row) {
                overlapsHouse = true;
                break;
              }
            }
          }
        }
        
        // Skip if overlaps house or starting position
        if (overlapsHouse || overlapsStarting) {
          continue;
        }
        
        const centerReel = reel + 1;
        const centerRow = row + 1;
        
        // Use preferred direction if hero present, otherwise use trollRushLaws
        const direction = (heroIsPresent && preferredDirection) 
          ? preferredDirection 
          : (trollRushLaws[centerReel]?.[centerRow] || 'fromright');
        
        // Build array of all 9 positions
        const positions = [];
        for (let r = reel; r < reel + 3; r++) {
          for (let ro = row; ro < row + 3; ro++) {
            positions.push({ reel: r, row: ro });
          }
        }
        
        const posData = {
          topLeftReel: reel,
          topLeftRow: row,
          centerReel,
          centerRow,
          direction,
          positions
        };
        
        validPositions.push(posData);
        
        // If troll's 3x3 CONTAINS hero, this is a valid hit position
        if (heroIsPresent && containsHero) {
          heroHitPositions.push(posData);
        }
      }
    }
    
    // Selection logic
    let selectedPositions;
    if (heroIsPresent) {
      // Hero present: MUST hit hero (troll's 3x3 includes hero position)
      selectedPositions = heroHitPositions.length > 0 ? heroHitPositions : [];
    } else {
      // Hero not present: Not applicable (troll only appears when hero present)
      selectedPositions = [];
    }
    
    if (selectedPositions.length === 0) return null;
    
    // Pick a random position from selected list
    return selectedPositions[Math.floor(Math.random() * selectedPositions.length)];
  }

  /**
   * Execute troll rush: Troll rushes through creating 3x6 impact zone (3x3 troll + 3x3 destruction)
   * @param {object} reels - Current game reels
   * @param {object} heroPosition - Hero's current position (null if not on board)
   * @param {object} gameState - Game state
   * @returns {object} - {reels, trollPosition, affectedPositions, direction}
   */
  executeTrollRush(reels, heroPosition, gameState) {
    const trollId = serverConfig.symbolsMapping?.banana3 || 13;
    
    // Clone reels
    const rushReels = {};
    for (let reel = 0; reel < this.width; reel++) {
      rushReels[reel] = [...reels[reel]];
    }
    
    // Find valid troll position
    const trollPos = this.findTrollRushPosition(rushReels, heroPosition);
    
    if (!trollPos) {
      // No valid position found, return unchanged reels
      return {
        reels: rushReels,
        trollPosition: [],
        affectedPositions: [],
        direction: 'fromright'
      };
    }
    
    // Calculate destruction path based on direction
    // Troll comes from forest OUTSIDE grid, destroys 3 rows/reels between edge and where it stops
    const destructionPositions = [];
    const direction = trollPos.direction;
    
    // Get the 3 reels and 3 rows that the troll occupies
    const trollReels = [trollPos.topLeftReel, trollPos.topLeftReel + 1, trollPos.topLeftReel + 2];
    const trollRows = [trollPos.topLeftRow, trollPos.topLeftRow + 1, trollPos.topLeftRow + 2];
    
    // Determine destruction path based on which edge the troll came from
    // Destroy ALL positions between the troll and the edge it rushed from
    if (direction === 'fromtop') {
      // Troll comes from top edge (row 0), destroys ALL rows from edge to troll
      for (const reel of trollReels) {
        for (let row = 0; row < trollPos.topLeftRow; row++) {
          destructionPositions.push({ reel, row });
        }
      }
    } else if (direction === 'fromdown') {
      // Troll comes from bottom edge (row 7), destroys ALL rows from troll to edge
      for (const reel of trollReels) {
        for (let row = trollPos.topLeftRow + 3; row < 8; row++) {
          destructionPositions.push({ reel, row });
        }
      }
    } else if (direction === 'fromleft') {
      // Troll comes from left edge (reel 0), destroys ALL reels from edge to troll
      for (const row of trollRows) {
        for (let reel = 0; reel < trollPos.topLeftReel; reel++) {
          destructionPositions.push({ reel, row });
        }
      }
    } else if (direction === 'fromright') {
      // Troll comes from right edge (reel 7), destroys ALL reels from troll to edge
      for (const row of trollRows) {
        for (let reel = trollPos.topLeftReel + 3; reel < 8; reel++) {
          destructionPositions.push({ reel, row });
        }
      }
    }
    
    // Track all affected positions
    const affectedPositions = [];
    
    // 1. Place the troll (3x3 area with id 13)
    for (const pos of trollPos.positions) {
      const existingSymbol = rushReels[pos.reel][pos.row];
      
      // Track what was replaced (skip if already empty or house)
      if (existingSymbol !== 0 && existingSymbol !== 'HOUSE') {
        affectedPositions.push({
          reel: pos.reel,
          row: pos.row,
          oldSymbol: existingSymbol,
          newSymbol: trollId
        });
        
        // Place troll piece
        rushReels[pos.reel][pos.row] = trollId;
      }
    }
    
    // 2. Destroy symbols in the destruction path (set to 0)
    for (const pos of destructionPositions) {
      const existingSymbol = rushReels[pos.reel][pos.row];
      
      // Track what was destroyed (skip if already empty or house)
      if (existingSymbol !== 0 && existingSymbol !== 'HOUSE') {
        affectedPositions.push({
          reel: pos.reel,
          row: pos.row,
          oldSymbol: existingSymbol,
          newSymbol: 0
        });
        
        // Destroy the symbol
        rushReels[pos.reel][pos.row] = 0;
      }
    }
    
    return {
      reels: rushReels,
      trollPosition: trollPos.positions, // Array of 9 troll positions
      affectedPositions, // Both troll placement and destruction
      direction: trollPos.direction,
      centerPosition: {
        reel: trollPos.centerReel,
        row: trollPos.centerRow
      }
    };
  }

  /**
   * Execute banana hunt: Hero moves from starting position to kill all bananas
   * @param {object} heroPosition - Hero's last known position from gameState (null for fresh entry)
   */
  executeDemonHunt(reels, stepType = "destroy", weaponIdOrName = 0, heroPosition = null, gameState = null) {
    const heroId = serverConfig.symbolsMapping.hero;
    const shortestPathMode = serverConfig.heroShortestPath !== false; // Default to true if not set
    
    // Clone reels
    const huntReels = {};
    for (let reel = 0; reel < this.width; reel++) {
      huntReels[reel] = [...reels[reel]];
    }

    const stageState = gameState ? this.normalizeBonusStageState(gameState) : {
      heroFootprintSize: 1,
      rushActive: false
    };
    const isBonusHunt = gameState?.isBonus === true;
    const initialMeter = gameState ? this.normalizeDemonMeter(gameState) : { count: 0, level: 0 };
    let currentMeterCount = Math.max(0, Math.min(MAX_BANANA_METER_COUNT, Math.floor(Number(initialMeter.count) || 0)));
    let currentMeterLevel = Math.max(0, Math.floor(Number(initialMeter.level) || 0));
    let currentStage = isBonusHunt ? resolveBonusStage(currentMeterCount, true) : 0;
    let currentHeroFootprintSize = Math.max(
      1,
      Math.floor(Number(stageState.heroFootprintSize || this.getHeroFootprintSize(currentStage) || 1))
    );
    let rushActive = stageState.rushActive === true;
    let growthAppliedDuringHunt = false;

    const syncDynamicStageState = () => {
      currentMeterCount = Math.max(0, Math.min(MAX_BANANA_METER_COUNT, Math.floor(Number(currentMeterCount) || 0)));
      currentMeterLevel = resolveDemonMeterLevel(currentMeterCount);
      currentStage = isBonusHunt ? resolveBonusStage(currentMeterCount, true) : 0;
      rushActive = isBonusHunt && currentStage >= BONUS_RUSH_START_STAGE;
    };

    const buildStepContext = (anchor, footprintSize = currentHeroFootprintSize) => {
      const heroState = this.buildHeroFootprintState(anchor, footprintSize);
      const footprintCells = heroState.cells.map((cell) => {
        const symbol = huntReels[cell.reel]?.[cell.row];
        return {
          reel: cell.reel,
          row: cell.row,
          wasSymbol: symbol,
          banana: this.isDemon(symbol),
          bananaId: this.isDemon(symbol) ? symbol : null
        };
      });
      const eatenBananas = footprintCells
        .filter((cell) => cell.banana)
        .map((cell) => ({
          reel: cell.reel,
          row: cell.row,
          bananaId: cell.bananaId,
          orbs: this.calculateOrbDrops(weaponIdOrName)
        }));
      heroState.activeWildCells = this.shouldHeroActAsWild(anchor)
        ? heroState.cells.map((cell) => ({
            reel: cell.reel,
            row: cell.row
          }))
        : [];
      heroState.activeWildCellKeys = new Set(heroState.activeWildCells.map((cell) => `${cell.reel},${cell.row}`));
      heroState.useMainGameWildOverride = gameState?.isBonus !== true;

      return {
        anchor: heroState.anchor,
        heroState,
        footprintCells,
        eatenBananas,
        hasBanana: eatenBananas.length > 0,
        hasHero: footprintCells.some((cell) => cell.wasSymbol === heroId),
        totalOrbs: eatenBananas.reduce((sum, banana) => sum + Number(banana.orbs || 0), 0),
        primaryBananaId: eatenBananas[0]?.bananaId ?? null
      };
    };
    const createStepEntry = (context, options = {}) => ({
      reel: context.anchor.reel,
      row: context.anchor.row,
      banana: context.hasBanana,
      bananaId: context.primaryBananaId,
      orbs: context.totalOrbs,
      footprintSize: Math.max(1, Math.floor(Number(options.footprintSize || currentHeroFootprintSize || 1))),
      rushActive: options.rushActive === true,
      bananaMeterCount: Math.max(0, Math.floor(Number(options.bananaMeterCount ?? currentMeterCount) || 0)),
      bananaMeterLevel: Math.max(0, Math.floor(Number(options.bananaMeterLevel ?? currentMeterLevel) || 0)),
      bonusStage: Math.max(0, Math.floor(Number(options.bonusStage ?? currentStage) || 0)),
      footprintCells: context.footprintCells.map((cell) => ({
        reel: cell.reel,
        row: cell.row,
        wasSymbol: cell.wasSymbol,
        banana: cell.banana,
        bananaId: cell.bananaId
      })),
      eatenBananas: context.eatenBananas.map((banana) => ({
        reel: banana.reel,
        row: banana.row,
        bananaId: banana.bananaId,
        orbs: banana.orbs
      }))
    });
    const affectedPositionKeys = new Set();
    const affectedPositions = [];
    const recordAffectedCells = (cells = []) => {
      cells.forEach((cell) => {
        const posKey = `${cell.reel},${cell.row}`;
        if (affectedPositionKeys.has(posKey)) return;
        affectedPositionKeys.add(posKey);
        affectedPositions.push({
          reel: cell.reel,
          row: cell.row,
          stepType: effectiveStepType,
          wasSymbol: cell.wasSymbol
        });
      });
    };
    const buildFeatureCandidatesForStep = (
      cells = [],
      stepEntry = null,
      pathIndex = null,
      defaultReason = "heroRunOver",
      { includeAdjacent = true, forceOverlap = true } = {}
    ) => {
      if (!gameState || gameState.isBonus !== true || !Array.isArray(cells) || cells.length === 0) {
        return {
          mergeGun: [],
          bonusMystery: []
        };
      }

      const sourceReel = Math.floor(Number(stepEntry?.reel ?? currentPos?.reel));
      const sourceRow = Math.floor(Number(stepEntry?.row ?? currentPos?.row));
      const normalizedPathIndex = Number.isFinite(Number(pathIndex)) ? Math.floor(Number(pathIndex)) : null;
      const mergeGunCandidates = [];
      const bonusMysteryCandidates = [];
      const seenMergeGun = new Set();
      const seenBonusMystery = new Set();
      const orthogonalDirections = [
        { reelDelta: 1, rowDelta: 0 },
        { reelDelta: -1, rowDelta: 0 },
        { reelDelta: 0, rowDelta: 1 },
        { reelDelta: 0, rowDelta: -1 }
      ];
      const pushCandidate = (target, seen, reel, row, reason, forceCollect = false) => {
        if (reel < 0 || reel >= this.width || row < 0 || row >= this.height) return;
        const key = `${reel},${row}`;
        if (seen.has(key)) return;
        seen.add(key);
        target.push({
          reel,
          row,
          reason,
          forceCollect,
          pathIndex: normalizedPathIndex,
          sourceReel,
          sourceRow
        });
      };

      cells.forEach((cell) => {
        const reel = Math.floor(Number(cell?.reel));
        const row = Math.floor(Number(cell?.row));
        if (!Number.isFinite(reel) || !Number.isFinite(row)) return;
        if (reel < 0 || reel >= this.width || row < 0 || row >= this.height) return;

        const cellSymbol = cell?.wasSymbol ?? huntReels?.[reel]?.[row];
        if (this.isMergeGunFeatureSymbol(cellSymbol) || this.isMergeGunFeatureSymbol(huntReels?.[reel]?.[row])) {
          pushCandidate(mergeGunCandidates, seenMergeGun, reel, row, defaultReason, forceOverlap);
        }
        if (this.isBonusMysteryFeatureSymbol(cellSymbol) || this.isBonusMysteryFeatureSymbol(huntReels?.[reel]?.[row])) {
          pushCandidate(bonusMysteryCandidates, seenBonusMystery, reel, row, defaultReason, forceOverlap);
        }

        if (includeAdjacent !== true) return;
        orthogonalDirections.forEach((direction) => {
          const adjacentReel = reel + direction.reelDelta;
          const adjacentRow = row + direction.rowDelta;
          if (adjacentReel < 0 || adjacentReel >= this.width || adjacentRow < 0 || adjacentRow >= this.height) return;
          const adjacentSymbol = huntReels?.[adjacentReel]?.[adjacentRow];
          if (this.isMergeGunFeatureSymbol(adjacentSymbol)) {
            pushCandidate(mergeGunCandidates, seenMergeGun, adjacentReel, adjacentRow, "heroAdjacent", false);
          }
          if (this.isBonusMysteryFeatureSymbol(adjacentSymbol)) {
            pushCandidate(bonusMysteryCandidates, seenBonusMystery, adjacentReel, adjacentRow, "heroAdjacent", false);
          }
        });
      });

      return {
        mergeGun: mergeGunCandidates,
        bonusMystery: bonusMysteryCandidates
      };
    };
    const collectStepFeatures = (cells = [], stepEntry = null, pathIndex = null, defaultReason = "heroRunOver", options = {}) => {
      const candidates = buildFeatureCandidatesForStep(cells, stepEntry, pathIndex, defaultReason, options);
      const mergeGunCollections = this.collectMergeGunFeaturePositions(
        gameState,
        huntReels,
        candidates.mergeGun,
        defaultReason
      );
      if (mergeGunCollections.length > 0) {
        this.triggerMergeGunActivations(
          gameState,
          mergeGunCollections,
          stepEntry ? { reel: stepEntry.reel, row: stepEntry.row } : currentPos,
          currentHeroFootprintSize
        );
      }
      const bonusMysteryCollections = this.collectBonusMysteryFeaturePositions(
        gameState,
        huntReels,
        candidates.bonusMystery,
        defaultReason
      );
      return {
        mergeGunCollections,
        bonusMysteryCollections
      };
    };
    const contextHasFeatureCandidate = (context = null) => {
      if (!context || gameState?.isBonus !== true || rushActive !== true) return false;
      const candidates = buildFeatureCandidatesForStep(
        context.footprintCells || [],
        context.anchor || null,
        null,
        "heroRunOver"
      );
      return candidates.mergeGun.length > 0 || candidates.bonusMystery.length > 0;
    };
    const shouldCollectFeaturesForStep = (context = null) => (
      rushActive === true || context?.hasBanana === true
    );
    const clearRushTrailCells = (cells = []) => {
      if (!rushActive) return;
      cells.forEach((cell) => {
        const symbol = huntReels[cell.reel]?.[cell.row];
        if (
          symbol === null ||
          symbol === undefined ||
          symbol === 0 ||
          symbol === "HOUSE" ||
          symbol === heroId ||
          this.isDemon(symbol) ||
          this.isMergeGunFeatureSymbol(symbol) ||
          this.isBonusMysteryFeatureSymbol(symbol)
        ) {
          return;
        }
        huntReels[cell.reel][cell.row] = 0;
      });
    };
    
    // Use provided heroPosition if available, otherwise use configured starting position
    let startPos;
    
    if (heroPosition && heroPosition.reel !== undefined && heroPosition.row !== undefined) {
      // Hero continues from last position (respins)
      startPos = this.normalizeHeroAnchorForSize(heroPosition, currentHeroFootprintSize) || { ...heroPosition };
    } else {
      // Fresh entry - jump in on the first target banana instead of legacy start tile.
      const entryAnchor = this.normalizeHeroAnchorForSize(
        serverConfig.heroStartingPosition || {reel: 4, row: 2},
        currentHeroFootprintSize
      ) || { reel: 0, row: 0 };
      const bananasOnBoard = [];
      for (let reel = 0; reel < this.width; reel++) {
        for (let row = 0; row < this.height; row++) {
          if (this.isDemon(huntReels[reel]?.[row])) {
            bananasOnBoard.push({ reel, row });
          }
        }
      }

      let chosenAnchor = null;
      let bestEntryPath = null;
      let bestCoveredBananas = 0;
      const anchorVisited = new Set();
      this.markHeroFootprintWalked(anchorVisited, entryAnchor, currentHeroFootprintSize);

      bananasOnBoard.forEach((banana) => {
        this.getTargetAnchorsForDemon(banana, currentHeroFootprintSize).forEach((targetAnchor) => {
          const rawPath = this.findPath(
            entryAnchor.reel,
            entryAnchor.row,
            targetAnchor.reel,
            targetAnchor.row,
            huntReels,
            anchorVisited,
            true,
            currentHeroFootprintSize
          );
          if (!rawPath) return;

          const path = this.trimPathToFirstDemonContact(huntReels, rawPath, currentHeroFootprintSize);
          const resolvedAnchor = path[path.length - 1];
          if (!resolvedAnchor) return;

          const coveredBananas = this.getDemonsInFootprint(huntReels, resolvedAnchor, currentHeroFootprintSize).length;
          if (
            !bestEntryPath ||
            coveredBananas > bestCoveredBananas ||
            (coveredBananas === bestCoveredBananas && path.length < bestEntryPath.length) ||
            (coveredBananas === bestCoveredBananas && path.length === bestEntryPath.length && Math.random() < 0.5)
          ) {
            chosenAnchor = resolvedAnchor;
            bestEntryPath = path;
            bestCoveredBananas = coveredBananas;
          }
        });
      });

      startPos = chosenAnchor || { ...entryAnchor };
    }
    
    let currentPos = this.normalizeHeroAnchorForSize(startPos, currentHeroFootprintSize) || { ...startPos };
    const fullPath = []; // Track all positions hero visits
    const walkedPositions = new Set();
    this.markHeroFootprintWalked(walkedPositions, currentPos, currentHeroFootprintSize);
    const orbDrops = []; // Track orb drops from killed bananas {reel, row, count}
    let demonsKilled = 0;
    let clusterWinTwa = 0;
    let clusterWinTbm = 0;
    const collectedSymbolDetails = [];
    
    // Thunderkong currently uses destroy-only hunt behavior.
    const isTrollRush = gameState && gameState.trollRush && gameState.trollRush.isTrollRush;
    const effectiveStepType = "destroy";
    const awardImpactPayouts = gameState?.isBonus !== true;
    const minClusterSize = serverConfig.minClusterSize || 4;
    const huntBetSize = Number(gameState?.betSize || 0);
    const huntMultiplier = Number(gameState?.multiplier || 1);
    let currentAngelClusterMultiplier = this.clampMainGameAngelMultiplier(
      gameState?.heroAngelNextMultiplier ?? 1
    );
    const startingAngelCarryMultiplier = currentAngelClusterMultiplier;
    let latestAngelDisplayMultiplier = Number.isFinite(Number(gameState?.heroAngelMultiplier))
      ? this.clampMainGameAngelMultiplier(gameState.heroAngelMultiplier)
      : null;

    const applyMainGameAngelMultiplierProgression = (killsThisStep = 0, stepEntry = null) => {
      const normalizedKills = Math.max(0, Math.floor(Number(killsThisStep) || 0));
      if (awardImpactPayouts !== true || normalizedKills <= 0) {
        return null;
      }

      const appliedMultiplier = this.clampMainGameAngelMultiplier(currentAngelClusterMultiplier);
      latestAngelDisplayMultiplier = appliedMultiplier;
      if (stepEntry && typeof stepEntry === "object") {
        stepEntry.angelMultiplier = appliedMultiplier;
      }
      currentAngelClusterMultiplier = this.clampMainGameAngelMultiplier(appliedMultiplier * 2);
      return appliedMultiplier;
    };

    const applyStepProgression = (bananasConsumedThisStep = 0, stepEntry = null, anchorForGrowth = currentPos) => {
      const consumedNow = Math.max(0, Math.floor(Number(bananasConsumedThisStep) || 0));
      const previousRushActive = rushActive;
      const previousStage = currentStage;
      const previousFootprintSize = currentHeroFootprintSize;

      if (consumedNow > 0) {
        currentMeterCount = Math.min(MAX_BANANA_METER_COUNT, currentMeterCount + consumedNow);
        syncDynamicStageState();
      }

      let growthResult = null;
      const nextFootprintSize = this.getHeroFootprintSize(currentStage);
      if (nextFootprintSize > previousFootprintSize) {
        growthResult = this.applyHeroGrowthExpansion(
          huntReels,
          anchorForGrowth,
          previousFootprintSize,
          nextFootprintSize,
          weaponIdOrName
        );
        currentHeroFootprintSize = nextFootprintSize;
        growthAppliedDuringHunt = true;

        if (growthResult?.heroPosition) {
          currentPos = growthResult.heroPosition;
        }
        if (Array.isArray(growthResult?.orbDrops) && growthResult.orbDrops.length > 0) {
          orbDrops.push(...growthResult.orbDrops);
        }

        if (Array.isArray(growthResult?.consumedCells) && growthResult.consumedCells.length > 0) {
          collectStepFeatures(
            growthResult.consumedCells,
            stepEntry || { reel: anchorForGrowth?.reel, row: anchorForGrowth?.row },
            stepEntry ? fullPath.indexOf(stepEntry) : null,
            "heroGrowthOverlap",
            { includeAdjacent: false, forceOverlap: true }
          );
        }

        const growthBananasConsumed = Math.max(0, Math.floor(Number(growthResult?.bananasConsumed || 0) || 0));
        if (growthBananasConsumed > 0) {
          demonsKilled += growthBananasConsumed;
          currentMeterCount = Math.min(MAX_BANANA_METER_COUNT, currentMeterCount + growthBananasConsumed);
          syncDynamicStageState();
        }

        const growthCollectedSymbols = [];
        (growthResult?.consumedCells || []).forEach((cell) => {
          const collectibleSymbol = this.getCollectableBonusSymbolId(cell?.wasSymbol);
          if (collectibleSymbol === null) return;
          growthCollectedSymbols.push({
            reel: Number(cell?.reel),
            row: Number(cell?.row),
            symbol: collectibleSymbol
          });
        });
        if (growthCollectedSymbols.length > 0) {
          collectedSymbolDetails.push(...growthCollectedSymbols);
          if (stepEntry) {
            stepEntry.growthCollectedSymbols = growthCollectedSymbols;
          }
        }
      }

      if (stepEntry) {
        stepEntry.rushActive = previousRushActive;
        stepEntry.rushActivated = rushActive && !previousRushActive;
        stepEntry.bananaMeterCount = currentMeterCount;
        stepEntry.bananaMeterLevel = currentMeterLevel;
        stepEntry.bonusStage = currentStage;
        if (growthResult) {
          stepEntry.giantMonkeyActivated = true;
          stepEntry.previousFootprintSize = previousFootprintSize;
          stepEntry.footprintSizeAfterGrowth = currentHeroFootprintSize;
          stepEntry.heroPositionAfterGrowth = currentPos ? { ...currentPos } : null;
          stepEntry.growthConsumedCells = growthResult.consumedCells || [];
        }
      }

      return {
        rushActivated: rushActive && !previousRushActive,
        stageChanged: currentStage !== previousStage,
        growthTriggered: Boolean(growthResult)
      };
    };
    
    const startContext = buildStepContext(currentPos);
    fullPath.push(createStepEntry(startContext, {
      footprintSize: currentHeroFootprintSize,
      rushActive,
      bananaMeterCount: currentMeterCount,
      bananaMeterLevel: currentMeterLevel,
      bonusStage: currentStage
    }));
    const startStepEntry = fullPath[fullPath.length - 1];
    
    if (rushActive || startContext.hasBanana || this.shouldHeroActAsWild(currentPos)) {
      recordAffectedCells(startContext.footprintCells);
    }
    if (shouldCollectFeaturesForStep(startContext)) {
      collectStepFeatures(startContext.footprintCells, startStepEntry, 0, "heroRunOver");
    }
    clearRushTrailCells(startContext.footprintCells);
    
    if (startContext.hasBanana) {
      let startBananasConsumed = 0;
      startContext.eatenBananas.forEach((banana) => {
        if (this.isDemon(huntReels[banana.reel]?.[banana.row])) {
          huntReels[banana.reel][banana.row] = 0;
          demonsKilled++;
          startBananasConsumed++;
          orbDrops.push({
            reel: banana.reel,
            row: banana.row,
            count: banana.orbs
          });
        }
      });
      const startAngelMultiplier = applyMainGameAngelMultiplierProgression(startBananasConsumed, startStepEntry);
      const startProgression = applyStepProgression(startBananasConsumed, startStepEntry, currentPos);
      const clusterResult = this.applyDemonCheckClusterExplosions(
        huntReels,
        currentPos,
        currentMeterLevel,
        minClusterSize,
        huntBetSize,
        huntMultiplier * Math.max(1, Number(startAngelMultiplier || 1)),
        startContext.heroState,
        {
          includeHeroWildCells: gameState?.isBonus === true
        }
      );
      if (clusterResult.hasClusters) {
        if (awardImpactPayouts) {
          clusterWinTwa += Number(clusterResult.twa || 0);
          clusterWinTbm += Number(clusterResult.tbm || 0);
        }
        if (Array.isArray(clusterResult.collectedSymbols) && clusterResult.collectedSymbols.length > 0) {
          collectedSymbolDetails.push(...clusterResult.collectedSymbols);
        }
        startStepEntry.impactClusters = clusterResult.clusters;
        startStepEntry.impactWinTwa = awardImpactPayouts ? Number(clusterResult.twa || 0) : 0;
        startStepEntry.impactWinTbm = awardImpactPayouts ? Number(clusterResult.tbm || 0) : 0;
        startStepEntry.impactWinCumulativeTwa = clusterWinTwa;
        startStepEntry.impactWinCumulativeTbm = clusterWinTbm;
      }
      if (startProgression.growthTriggered) {
        this.markHeroFootprintWalked(walkedPositions, currentPos, currentHeroFootprintSize);
      }
    } else if (this.shouldHeroActAsWild(currentPos)) {
      const clusterResult = this.applyDemonCheckClusterExplosions(
        huntReels,
        currentPos,
        currentMeterLevel,
        minClusterSize,
        huntBetSize,
        huntMultiplier,
        startContext.heroState,
        {
          includeHeroWildCells: gameState?.isBonus === true
        }
      );
      if (clusterResult.hasClusters) {
        if (awardImpactPayouts) {
          clusterWinTwa += Number(clusterResult.twa || 0);
          clusterWinTbm += Number(clusterResult.tbm || 0);
        }
        if (Array.isArray(clusterResult.collectedSymbols) && clusterResult.collectedSymbols.length > 0) {
          collectedSymbolDetails.push(...clusterResult.collectedSymbols);
        }
        startStepEntry.impactClusters = clusterResult.clusters;
        startStepEntry.impactWinTwa = awardImpactPayouts ? Number(clusterResult.twa || 0) : 0;
        startStepEntry.impactWinTbm = awardImpactPayouts ? Number(clusterResult.tbm || 0) : 0;
        startStepEntry.impactWinCumulativeTwa = clusterWinTwa;
        startStepEntry.impactWinCumulativeTbm = clusterWinTbm;
      }
    } else if (startContext.hasHero) {
      startContext.footprintCells.forEach((cell) => {
        if (huntReels[cell.reel]?.[cell.row] === heroId) {
          huntReels[cell.reel][cell.row] = 0;
        }
      });
    }
    // else: Regular symbol stays until conversion phase
    
    // Find and kill all bananas
    while (true) {
      // Find all remaining bananas
      const bananas = [];
      for (let reel = 0; reel < this.width; reel++) {
        for (let row = 0; row < this.height; row++) {
          if (this.isDemon(huntReels[reel][row])) {
            bananas.push({reel, row});
          }
        }
      }
      
      // No more bananas
      if (bananas.length === 0) {
        break;
      }
      
      // Find best banana anchor to target
      let bestTarget = null;
      
      for (const banana of bananas) {
        this.getTargetAnchorsForDemon(banana, currentHeroFootprintSize).forEach((targetAnchor) => {
          const rawPath = this.findPath(
            currentPos.reel,
            currentPos.row,
            targetAnchor.reel,
            targetAnchor.row,
            huntReels,
            walkedPositions,
            shortestPathMode,
            currentHeroFootprintSize
          );

          if (!rawPath) return;

          const path = this.trimPathToFirstDemonContact(huntReels, rawPath, currentHeroFootprintSize);
          const resolvedAnchor = path[path.length - 1];
          if (!resolvedAnchor) return;

          const coveredBananas = this.getDemonsInFootprint(huntReels, resolvedAnchor, currentHeroFootprintSize).length;
          const walkedCount = this.countPathWalkedCells(path, walkedPositions, currentHeroFootprintSize);
          if (!bestTarget) {
            bestTarget = { anchor: resolvedAnchor, path, coveredBananas, walkedCount };
            return;
          }

          if (coveredBananas > bestTarget.coveredBananas) {
            bestTarget = { anchor: resolvedAnchor, path, coveredBananas, walkedCount };
            return;
          }

          if (coveredBananas < bestTarget.coveredBananas) {
            return;
          }

          if (shortestPathMode) {
            if (
              path.length < bestTarget.path.length ||
              (path.length === bestTarget.path.length && walkedCount < bestTarget.walkedCount)
            ) {
              bestTarget = { anchor: resolvedAnchor, path, coveredBananas, walkedCount };
            }
          } else if (
            walkedCount < bestTarget.walkedCount ||
            (walkedCount === bestTarget.walkedCount && path.length < bestTarget.path.length)
          ) {
            bestTarget = { anchor: resolvedAnchor, path, coveredBananas, walkedCount };
          }
        });
      }
      
      // No path to any banana (shouldn't happen)
      if (!bestTarget || !bestTarget.path) {
        break;
      }
      
      // Move along path (skip first position as it's current position)
      let restartFromGrowth = false;
      for (let i = 1; i < bestTarget.path.length; i++) {
        const stepAnchor = bestTarget.path[i];
        const stepContext = buildStepContext(stepAnchor);

        this.markHeroFootprintWalked(walkedPositions, stepAnchor, currentHeroFootprintSize);
        const stepHasFeatureCandidate = contextHasFeatureCandidate(stepContext);
        const shouldTrackStep = rushActive || stepContext.hasBanana || stepHasFeatureCandidate;
        let stepEntry = null;
        if (shouldTrackStep) {
          fullPath.push(createStepEntry(stepContext, {
            footprintSize: currentHeroFootprintSize,
            rushActive,
            bananaMeterCount: currentMeterCount,
            bananaMeterLevel: currentMeterLevel,
            bonusStage: currentStage
          }));
          stepEntry = fullPath[fullPath.length - 1];
          recordAffectedCells(stepContext.footprintCells);
        }
        if (stepEntry && (stepHasFeatureCandidate || shouldCollectFeaturesForStep(stepContext))) {
          collectStepFeatures(stepContext.footprintCells, stepEntry, fullPath.length - 1, "heroRunOver");
        }
        clearRushTrailCells(stepContext.footprintCells);
        
        // Kill banana if present (always destroy to prevent infinite loop)
        if (stepContext.hasBanana) {
          let bananasConsumedThisStep = 0;
          stepContext.eatenBananas.forEach((banana) => {
            if (!this.isDemon(huntReels[banana.reel]?.[banana.row])) return;
            huntReels[banana.reel][banana.row] = 0;
            demonsKilled++;
            bananasConsumedThisStep++;
            orbDrops.push({
              reel: banana.reel,
              row: banana.row,
              count: banana.orbs
            });
          });
          const stepAngelMultiplier = applyMainGameAngelMultiplierProgression(bananasConsumedThisStep, stepEntry);
          const stepProgression = applyStepProgression(bananasConsumedThisStep, stepEntry, stepAnchor);

          // Server-side mirror of banana-position cluster pop (keeps gravity state in sync with client).
          const clusterResult = this.applyDemonCheckClusterExplosions(
            huntReels,
            stepAnchor,
            currentMeterLevel,
            minClusterSize,
            huntBetSize,
            huntMultiplier * Math.max(1, Number(stepAngelMultiplier || 1)),
            stepContext.heroState,
            {
              includeHeroWildCells: gameState?.isBonus === true
            }
          );
          if (clusterResult.hasClusters) {
            if (awardImpactPayouts) {
              clusterWinTwa += Number(clusterResult.twa || 0);
              clusterWinTbm += Number(clusterResult.tbm || 0);
            }
            if (Array.isArray(clusterResult.collectedSymbols) && clusterResult.collectedSymbols.length > 0) {
              collectedSymbolDetails.push(...clusterResult.collectedSymbols);
            }
            if (stepEntry) {
              stepEntry.impactClusters = clusterResult.clusters;
              stepEntry.impactWinTwa = awardImpactPayouts ? Number(clusterResult.twa || 0) : 0;
              stepEntry.impactWinTbm = awardImpactPayouts ? Number(clusterResult.tbm || 0) : 0;
              stepEntry.impactWinCumulativeTwa = clusterWinTwa;
              stepEntry.impactWinCumulativeTbm = clusterWinTbm;
            }
          }
          if (stepProgression.growthTriggered) {
            this.markHeroFootprintWalked(walkedPositions, currentPos, currentHeroFootprintSize);
            restartFromGrowth = true;
            break;
          }
        }
      }

      if (restartFromGrowth) {
        continue;
      }
      
      // Update current position
      currentPos = bestTarget.anchor;
    }
    
    // Apply step effects to affected positions FIRST (including final position if it had a banana/symbol)
    const collectChance = gameState?.isBonus === true
      ? 1
      : this.getDestroyCollectChanceByMeterLevel(currentMeterLevel);
    let collectedSymbols = 0;
    const mysterySymbolId = serverConfig.symbolsMapping?.mystery || 14;
    const mysteryReveals = []; // Track what symbols mystery symbols will reveal to
    
    // Note: effectiveStepType already declared at the start of function (forced to "destroy" for troll rush)
    
    // Pick ONE reveal target for ALL mysteries in this hunt
    let mysteryRevealSymbol = null;
    if (effectiveStepType === "mystery") {
      // Regular mystery step - ALWAYS weighted random (no wilds possible)
      mysteryRevealSymbol = this.getWeightedMysterySymbol();
    } else if (effectiveStepType === "mysteryWild") {
      // MysteryWild step - wilds are POSSIBLE based on odds
      const mysteryToWildOdds = serverConfig.mysteryToWildOdds || 0;
      const shouldBeWild = Math.random() * 100 < mysteryToWildOdds;
      
      if (shouldBeWild) {
        // Convert to mysteryWild (ID 15)
        const mysteryWildId = serverConfig.symbolsMapping?.mysteryWild || 15;
        mysteryRevealSymbol = mysteryWildId;
      } else {
        // Use weighted random from symbolWeightMystery
        mysteryRevealSymbol = this.getWeightedMysterySymbol();
      }
    }
    
    // Process ALL affected positions (don't filter out final position yet)
    affectedPositions.forEach(pos => {
      // Note: huntReels[pos.reel][pos.row] is already 0 for bananas (they were destroyed to prevent infinite loop)
      // So we use pos.wasSymbol which was stored BEFORE destruction
      const currentSymbol = huntReels[pos.reel][pos.row];
      
      if (effectiveStepType === "destroy") {
        const collectibleSymbol = this.getCollectableBonusSymbolId(pos.wasSymbol);
        if (collectibleSymbol && collectChance > 0 && Math.random() < collectChance) {
          collectedSymbols++;
          collectedSymbolDetails.push({
            reel: pos.reel,
            row: pos.row,
            symbol: collectibleSymbol
          });
        }

        // Destroy position (if not already destroyed)
        if (currentSymbol !== 0) {
          huntReels[pos.reel][pos.row] = 0;
        }
      } else if (effectiveStepType === "mystery") {
        // Convert to mystery symbol (position may already be 0 from banana destruction)
        // This includes starting position and all banana positions!
        huntReels[pos.reel][pos.row] = mysterySymbolId;
        
        // All mysteries in this hunt reveal to the SAME symbol (picked once above)
        mysteryReveals.push({
          reel: pos.reel,
          row: pos.row,
          revealTo: mysteryRevealSymbol,  // Same for all mysteries!
          wasBanana: this.isDemon(pos.wasSymbol)  // Track if original was banana
        });
      } else if (effectiveStepType === "mysteryWild") {
        // MysteryWild step - create mystery symbols (same as regular mystery)
        // The difference is: wilds are POSSIBLE during reveal
        huntReels[pos.reel][pos.row] = mysterySymbolId;
        
        mysteryReveals.push({
          reel: pos.reel,
          row: pos.row,
          revealTo: mysteryRevealSymbol,  // Might be wild or weighted random
          wasBanana: this.isDemon(pos.wasSymbol)
        });
      }
    });
    
    // Place hero at final position (this will overwrite mystery symbol if final position was affected)
    this.stampHeroFootprintOnReels(huntReels, currentPos, currentHeroFootprintSize);
    const finalFootprintState = this.buildHeroFootprintState(currentPos, currentHeroFootprintSize);
    
    // Filter out final position from affectedPositions for client display
    // (Client doesn't need to animate the final position since hero stays there)
    const finalAffectedPositions = rushActive
      ? affectedPositions
      : affectedPositions.filter((pos) => !finalFootprintState.cellKeys.has(`${pos.reel},${pos.row}`));
    
    // Also filter out hero's final position from mysteryReveals
    // (Hero stays there, so we shouldn't reveal a symbol at that position)
    const finalMysteryReveals = mysteryReveals.filter((reveal) => !finalFootprintState.cellKeys.has(`${reveal.reel},${reveal.row}`));

    return {
      reels: huntReels,
      heroPath: fullPath,
      affectedPositions: finalAffectedPositions,
      demonsKilled: demonsKilled,
      // Meter/stage progression should follow demon kills only.
      demonsCollected: demonsKilled,
      collectedSymbols,
      collectedSymbolDetails,
      clusterWinTwa,
      clusterWinTbm,
      orbDrops: orbDrops,
      mysteryReveals: finalMysteryReveals, // Positions with mystery symbols (excluding hero's final position)
      heroFinalPosition: currentPos, // Where the hero ended up
      heroFinalFootprintSize: currentHeroFootprintSize,
      growthAppliedDuringHunt,
      heroAngelStartMultiplier: startingAngelCarryMultiplier,
      heroAngelMultiplier: latestAngelDisplayMultiplier,
      heroAngelNextMultiplier: currentAngelClusterMultiplier
    };
  }

  getSymbolSpawnBehaviorConfig(mode = "base") {
    const rootConfig = isPlainObject(serverConfig?.symbolSpawnBehavior)
      ? serverConfig.symbolSpawnBehavior
      : {};
    const modeKey = typeof mode === "string" ? mode : "";
    const modeConfig = modeKey && modeKey !== "base" && isPlainObject(rootConfig?.[modeKey])
      ? rootConfig[modeKey]
      : {};
    const lowSymbolBiasConfig = {
      ...(isPlainObject(rootConfig?.lowSymbolBias) ? rootConfig.lowSymbolBias : {}),
      ...(isPlainObject(modeConfig?.lowSymbolBias) ? modeConfig.lowSymbolBias : {})
    };
    const sameReelPairsConfig = {
      ...(isPlainObject(rootConfig?.sameReelPairs) ? rootConfig.sameReelPairs : {}),
      ...(isPlainObject(modeConfig?.sameReelPairs) ? modeConfig.sameReelPairs : {})
    };

    const lowSymbols = Array.isArray(lowSymbolBiasConfig?.symbols)
      ? lowSymbolBiasConfig.symbols
      : [7, 6, 5, 4];
    const lowSymbolSet = new Set(
      lowSymbols
        .map((rawSymbol) => Number(rawSymbol))
        .filter((symbolId) => Number.isFinite(symbolId))
    );
    const lowMultiplier = Number.isFinite(Number(lowSymbolBiasConfig?.multiplier))
      ? Math.max(0, Number(lowSymbolBiasConfig.multiplier))
      : 1.6;

    const configuredExclusions = Array.isArray(sameReelPairsConfig?.excludeSymbols)
      ? sameReelPairsConfig.excludeSymbols
      : [];
    const excludedSet = new Set(
      [
        ...configuredExclusions,
        this.timeId,
        this.heroId,
        this.mysteryId,
        this.mysteryWildId,
        ...(Array.isArray(this.demonIds) ? this.demonIds : [])
      ]
        .map((rawSymbol) => Number(rawSymbol))
        .filter((symbolId) => Number.isFinite(symbolId))
    );

    const payoutSymbols = Array.isArray(serverConfig?.payoutSymbols)
      ? serverConfig.payoutSymbols
      : [];
    const payoutSymbolSet = new Set(
      payoutSymbols
        .map((rawSymbol) => Number(rawSymbol))
        .filter((symbolId) => Number.isFinite(symbolId))
    );

    return {
      lowSymbolBias: {
        enabled: lowSymbolBiasConfig?.enabled !== false,
        multiplier: lowMultiplier,
        symbolSet: lowSymbolSet
      },
      sameReelPairs: {
        enabled: sameReelPairsConfig?.enabled === true,
        chance: Number.isFinite(Number(sameReelPairsConfig?.chance))
          ? Math.max(0, Math.min(1, Number(sameReelPairsConfig.chance)))
          : 1,
        length: Number.isFinite(Number(sameReelPairsConfig?.length))
          ? Math.max(2, Math.floor(Number(sameReelPairsConfig.length)))
          : 2,
        restrictToPayoutSymbols: sameReelPairsConfig?.restrictToPayoutSymbols !== false,
        excludedSet,
        payoutSymbolSet
      }
    };
  }

  getBiasedBaseSymbolWeight(symbolId, baseWeight = 0, spawnBehaviorConfig = null) {
    const behavior = spawnBehaviorConfig || this.getSymbolSpawnBehaviorConfig();
    const normalizedSymbolId = Number(symbolId);
    const normalizedWeight = Number(baseWeight);
    if (!Number.isFinite(normalizedSymbolId) || !Number.isFinite(normalizedWeight)) {
      return 0;
    }
    if (normalizedWeight <= 0) {
      return 0;
    }

    const lowBias = behavior?.lowSymbolBias;
    if (!lowBias?.enabled) {
      return normalizedWeight;
    }
    if (!(lowBias.symbolSet instanceof Set) || !lowBias.symbolSet.has(normalizedSymbolId)) {
      return normalizedWeight;
    }
    const multiplier = Number(lowBias?.multiplier);
    if (!Number.isFinite(multiplier) || multiplier <= 0) {
      return normalizedWeight;
    }
    return normalizedWeight * multiplier;
  }

  pickWeightedBaseSymbol(weights, spawnBehaviorConfig = null) {
    if (!weights || typeof weights !== "object") {
      return null;
    }
    const behavior = spawnBehaviorConfig || this.getSymbolSpawnBehaviorConfig();
    const entries = [];
    let totalWeight = 0;

    Object.entries(weights).forEach(([rawSymbol, rawWeight]) => {
      const symbolId = Number(rawSymbol);
      if (!Number.isFinite(symbolId)) return;

      const weightedValue = this.getBiasedBaseSymbolWeight(symbolId, rawWeight, behavior);
      if (!(weightedValue > 0)) return;

      entries.push({ symbolId, weight: weightedValue });
      totalWeight += weightedValue;
    });

    if (!(totalWeight > 0) || entries.length === 0) {
      return null;
    }

    let roll = Math.random() * totalWeight;
    for (const entry of entries) {
      roll -= entry.weight;
      if (roll <= 0) {
        return entry.symbolId;
      }
    }

    return entries[entries.length - 1]?.symbolId ?? null;
  }

  createReelPairState(reelCount = this.width) {
    const state = [];
    for (let reel = 0; reel < reelCount; reel++) {
      state[reel] = { symbol: null, remaining: 0 };
    }
    return state;
  }

  resetPairStateForReel(pairState, reel) {
    if (!Array.isArray(pairState)) return;
    if (!pairState[reel]) return;
    pairState[reel].symbol = null;
    pairState[reel].remaining = 0;
  }

  isPairEligibleSymbol(symbol, spawnBehaviorConfig = null) {
    const behavior = spawnBehaviorConfig || this.getSymbolSpawnBehaviorConfig();
    const pairConfig = behavior?.sameReelPairs;
    if (!pairConfig?.enabled) return false;

    const symbolId = Number(symbol);
    if (!Number.isFinite(symbolId)) return false;
    if (pairConfig.excludedSet instanceof Set && pairConfig.excludedSet.has(symbolId)) {
      return false;
    }
    if (
      pairConfig.restrictToPayoutSymbols &&
      pairConfig.payoutSymbolSet instanceof Set &&
      pairConfig.payoutSymbolSet.size > 0 &&
      !pairConfig.payoutSymbolSet.has(symbolId)
    ) {
      return false;
    }
    return true;
  }

  getSpawnSymbolForReel(
    reel,
    weights,
    pairState,
    {
      allowDemons = false,
      demonChance = 0,
      timeSymbolChance = 0
    } = {},
    spawnBehaviorConfig = null
  ) {
    const behavior = spawnBehaviorConfig || this.getSymbolSpawnBehaviorConfig();
    const pairConfig = behavior?.sameReelPairs;
    const reelPairState = Array.isArray(pairState) ? pairState[reel] : null;

    if (
      pairConfig?.enabled &&
      reelPairState &&
      reelPairState.remaining > 0 &&
      Number.isFinite(Number(reelPairState.symbol))
    ) {
      const forcedSymbol = Number(reelPairState.symbol);
      reelPairState.remaining = Math.max(0, Number(reelPairState.remaining) - 1);
      if (reelPairState.remaining <= 0) {
        reelPairState.symbol = null;
      }
      return forcedSymbol;
    }

    const symbol = this.getRandomSymbol(weights, allowDemons, demonChance, timeSymbolChance, {
      spawnBehaviorConfig: behavior
    });

    if (!pairConfig?.enabled || !reelPairState) {
      return symbol;
    }

    if (
      this.isPairEligibleSymbol(symbol, behavior) &&
      Math.random() <= pairConfig.chance
    ) {
      reelPairState.symbol = Number(symbol);
      reelPairState.remaining = Math.max(0, pairConfig.length - 1);
    } else {
      reelPairState.symbol = null;
      reelPairState.remaining = 0;
    }

    return symbol;
  }

  /**
   * Get random symbol from weighted pool
   */
  getRandomSymbol(weights, allowDemons = false, demonChance = 0, timeSymbolChance = 0, options = {}) {
    const behavior = options?.spawnBehaviorConfig || this.getSymbolSpawnBehaviorConfig();

    // If bananas are allowed and chance hits, return banana
    if (allowDemons && demonChance > 0 && Math.random() < demonChance) {
      return this.getRandomDemonType();
    }
    
    // If time symbols allowed and chance hits, return time symbol
    if (timeSymbolChance > 0 && Math.random() * 100 < timeSymbolChance) {
      return this.timeId;
    }

    const picked = this.pickWeightedBaseSymbol(weights, behavior);
    if (picked !== null) {
      return picked;
    }

    // Hard fallback: first positive-weight symbol in config.
    const fallbackEntry = Object.entries(weights || {}).find(([, rawWeight]) => Number(rawWeight) > 0);
    if (fallbackEntry) {
      const fallbackSymbol = Number(fallbackEntry[0]);
      if (Number.isFinite(fallbackSymbol)) {
        return fallbackSymbol;
      }
    }

    return 1;
  }

  /**
   * Check if a banana can be placed at this position
   * Bananas cannot be placed on: house, hero, other bananas, treasures, hero starting position
   */
  canPlaceDemon(reel, row, reels, options = {}) {
    const heroFootprint = this.buildHeroFootprintState(
      options.heroPosition || options.heroAnchor || null,
      options.heroFootprintSize || 1
    );

    // Can't place on house
    if (this.isHouse(reel, row)) {
      return false;
    }

    // Can't place on hero's starting position (prevents visual bug)
    const startingPos = serverConfig.heroStartingPosition || { reel: 4, row: 2 };
    if (reel === startingPos.reel && row === startingPos.row) {
      return false;
    }

    const currentSymbol = reels[reel]?.[row];

    // Can't place on hero
    if (currentSymbol === this.heroId) {
      return false;
    }

    if (heroFootprint.cellKeys.has(`${reel},${row}`)) {
      return false;
    }

    // Can't place on existing banana
    if (this.isDemon(currentSymbol)) {
      return false;
    }

    // Can't place on feature symbols or barrels.
    if (this.isBonusMysteryFeatureSymbol(currentSymbol)) {
      return false;
    }

    // Merge guns stay sticky on the board until collected.
    if (this.isMergeGunFeatureSymbol(currentSymbol)) {
      return false;
    }

    if (this.isLightningBeeFeatureSymbol(currentSymbol)) {
      return false;
    }

    if (
      Number(currentSymbol) === Number(this.timeId) ||
      Number(currentSymbol) === Number(serverConfig?.symbolsMapping?.time_depleted ?? 17)
    ) {
      return false;
    }

    // Can't place on treasures (if implemented in future)
    // if (currentSymbol === treasureId) return false;

    return true;
  }

  /**
   * Add bananas to the reels after initial generation
   * Used for spin/freespin actions
   * @param {Object} reels - Current reels state
   * @param {Object} config - Banana spawn config (supports optional countOdds for weighted banana counts)
   * @param {Object} options - Additional options like guaranteedDemon, chestProximity
   */
  addDemons(reels, config = {}, options = {}) {
      const resolvedConfig = this.resolveDemonSpawnConfig(config, options.gameState);
      const { minBananas = 1, maxBananas = 3, chance = 0.5, abilityReduction = {}, countOdds = null } = resolvedConfig;
      const {
        guaranteedDemon = false,
        demonsAwayFromChest = null,
        demonsAwayFromBonusStage = null,
        remainingFreespins = null,
        hero = null,
        heroPosition = null,
        heroFootprintSize = 1,
        bananaMeterLevel = null
      } = options;

    // Calculate effective chance (may be throttled based on chest proximity)
    let effectiveChance = chance;
    
    // Apply ability reduction multiplier based on banana meter level (threshold-driven)
    if (bananaMeterLevel !== null && Object.keys(abilityReduction).length > 0) {
      const meterLevel = Math.max(0, Math.floor(Number(bananaMeterLevel) || 0));
      const multiplier = abilityReduction[meterLevel] ?? abilityReduction[String(meterLevel)] ?? 1;
      effectiveChance *= multiplier;
    }
    
    const throttleDistance = demonsAwayFromBonusStage ?? demonsAwayFromChest;
    const suspenseMultiplier = this.getBonusStageSuspenseChanceMultiplier(throttleDistance, remainingFreespins);
    if (suspenseMultiplier !== 1) {
      effectiveChance = effectiveChance * suspenseMultiplier;
    }
    effectiveChance = Math.max(0, Math.min(1, Number(effectiveChance) || 0));

    // Roll to see if we spawn bananas this round
    // Skip roll if guaranteed banana is required
    if (!guaranteedDemon && Math.random() > effectiveChance) {
      return reels; // No bananas this round
    }

    const parsedMinBananas = Math.max(0, Math.floor(Number(minBananas) || 0));
    const parsedMaxBananas = Math.max(parsedMinBananas, Math.floor(Number(maxBananas) || parsedMinBananas));

    // Determine how many bananas to spawn (at least 1 if guaranteed)
    let bananaCount = this.rollConfiguredCount(parsedMinBananas, parsedMaxBananas, countOdds);
    if (guaranteedDemon && bananaCount < 1) {
      bananaCount = 1;
    }

    // Collect all valid positions
      const validPositions = [];
      for (let reel = 0; reel < this.width; reel++) {
        for (let row = 0; row < this.height; row++) {
        if (this.canPlaceDemon(reel, row, reels, { heroPosition, heroFootprintSize })) {
            validPositions.push({ reel, row });
          }
        }
      }

    // Shuffle valid positions
    for (let i = validPositions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [validPositions[i], validPositions[j]] = [validPositions[j], validPositions[i]];
    }

    // Place bananas (randomly select type for each)
    const placed = Math.min(bananaCount, validPositions.length);
    for (let i = 0; i < placed; i++) {
      const { reel, row } = validPositions[i];
      reels[reel][row] = this.getRandomDemonType();
    }

    return reels;
  }

  syncDropEventSymbols(dropEvent, reels) {
    if (!dropEvent || !Array.isArray(dropEvent.movements) || !reels) return;

    dropEvent.movements.forEach((movement) => {
      const targetReel = movement.toReel !== undefined ? movement.toReel : movement.reel;
      const targetRow = movement.to;
      if (reels[targetReel] && reels[targetReel][targetRow] !== undefined) {
        movement.symbol = reels[targetReel][targetRow];
      }
    });
  }

  triggerBarrelDemonBursts(reels, barrelSymbols = [], gameState = null) {
    const barrelBursts = [];
    if (!reels || !Array.isArray(barrelSymbols) || barrelSymbols.length === 0) {
      if (gameState) {
        gameState.barrelBursts = [];
      }
      return { reels, barrelBursts };
    }

    const barrelConfig = this.resolveExplodingBarrelConfig(gameState);
    const reelsBeforeBurst = JSON.parse(JSON.stringify(reels));
    const reelsAfterBurst = JSON.parse(JSON.stringify(reels));
    const plusOffsets = [
      { reelDelta: 0, rowDelta: 0 },   // center
      { reelDelta: 1, rowDelta: 0 },   // right
      { reelDelta: -1, rowDelta: 0 },  // left
      { reelDelta: 0, rowDelta: 1 },   // up
      { reelDelta: 0, rowDelta: -1 }   // down
    ];
    const minBananas = Math.max(0, Math.floor(Number(barrelConfig?.burstMinBananas) || BARREL_BANANA_BURST_MIN));
    const maxBananas = Math.max(minBananas, Math.floor(Number(barrelConfig?.burstMaxBananas) || BARREL_BANANA_BURST_MAX));
    const globallyDestroyed = new Set();
    const barrelSourceKeys = new Set();
    const globallyReservedBananaSpawns = new Set();
    const depletedTimeId = Number(serverConfig?.symbolsMapping?.time_depleted ?? 17);
    const isBarrelSymbol = (symbol) => (
      Number(symbol) === Number(this.timeId) ||
      Number(symbol) === depletedTimeId
    );
    const heroFootprintSize = Math.max(
      1,
      Math.floor(
        Number(
          gameState?.heroFootprintSize ??
          gameState?.bonusStageEvent?.heroFootprintSize ??
          1
        ) || 1
      )
    );
    const heroAnchor =
      gameState?.heroPosition ??
      gameState?.bonusStageEvent?.heroPosition ??
      null;
    const heroFootprint = this.buildHeroFootprintState(heroAnchor, heroFootprintSize);
    const isHeroFootprintCell = (reel, row) => heroFootprint.cellKeys.has(`${reel},${row}`);

    if (Array.isArray(heroFootprint?.cells) && heroFootprint.cells.length > 0) {
      heroFootprint.cells.forEach((cell) => {
        globallyReservedBananaSpawns.add(`${cell.reel},${cell.row}`);
      });
    }

    barrelSymbols.forEach((barrel) => {
      const reel = Number(barrel?.reel);
      const row = Number(barrel?.row);
      if (!Number.isFinite(reel) || !Number.isFinite(row)) return;
      const key = `${reel},${row}`;
      barrelSourceKeys.add(key);
      globallyReservedBananaSpawns.add(key);
    });

    barrelSymbols.forEach((barrel) => {
      const barrelReel = Number(barrel?.reel);
      const barrelRow = Number(barrel?.row);
      if (!Number.isFinite(barrelReel) || !Number.isFinite(barrelRow)) return;
      if (!reelsAfterBurst[barrelReel] || reelsAfterBurst[barrelReel][barrelRow] === undefined) return;

      const destroyedPositions = [];
      const burstSeen = new Set();
      plusOffsets.forEach((offset) => {
        const reel = barrelReel + offset.reelDelta;
        const row = barrelRow + offset.rowDelta;
        if (reel < 0 || reel >= this.width || row < 0 || row >= this.height) return;
        const isBarrelCenterCell = reel === barrelReel && row === barrelRow;

        const posKey = `${reel},${row}`;
        if (burstSeen.has(posKey)) return;
        burstSeen.add(posKey);

        if (globallyDestroyed.has(posKey)) return;
        if (this.isHouse(reel, row)) return;
        if (isHeroFootprintCell(reel, row)) return;

        const oldSymbol = reelsBeforeBurst[reel]?.[row];
        if (oldSymbol === undefined || oldSymbol === null) return;
        if (oldSymbol === this.heroId) return;
        if (this.isDemon(oldSymbol)) return;
        if (this.isMergeGunFeatureSymbol(oldSymbol)) return;
        if (this.isBonusMysteryFeatureSymbol(oldSymbol)) return;
        if (this.isLightningBeeFeatureSymbol(oldSymbol)) return;
        if (!isBarrelCenterCell && isBarrelSymbol(oldSymbol)) return;

        reelsAfterBurst[reel][row] = 0; // empty slot for next gravity fill
        globallyDestroyed.add(posKey);
        globallyReservedBananaSpawns.add(posKey);
        destroyedPositions.push({
          reel,
          row,
          oldSymbol,
          newSymbol: 0
        });
      });

      const bananaPositions = [];
      const spawnTargetCount = this.rollConfiguredCount(minBananas, maxBananas, barrelConfig?.burstCountOdds);
      for (let i = 0; i < spawnTargetCount; i++) {
        const validPositions = [];
        for (let reel = 0; reel < this.width; reel++) {
          for (let row = 0; row < this.height; row++) {
            const posKey = `${reel},${row}`;
            if (globallyReservedBananaSpawns.has(posKey)) continue;
            if (barrelSourceKeys.has(posKey)) continue;
            if (isHeroFootprintCell(reel, row)) continue;

            const currentSymbol = reelsAfterBurst[reel]?.[row];
            if (isBarrelSymbol(currentSymbol)) continue; // keep pending barrels intact
            if (this.isBonusMysteryFeatureSymbol(currentSymbol)) continue;
            if (this.isMergeGunFeatureSymbol(currentSymbol)) continue;
            if (this.isLightningBeeFeatureSymbol(currentSymbol)) continue;
            if (
              !this.canPlaceDemon(reel, row, reelsAfterBurst, {
                heroPosition: heroFootprint.anchor || heroAnchor,
                heroFootprintSize: heroFootprint.size
              })
            ) {
              continue;
            }
            validPositions.push({ reel, row });
          }
        }

        if (!validPositions.length) break;
        const pick = validPositions[Math.floor(Math.random() * validPositions.length)];
        const posKey = `${pick.reel},${pick.row}`;
        const oldSymbol = reelsBeforeBurst[pick.reel]?.[pick.row];
        const newSymbol = this.getRandomDemonType();
        reelsAfterBurst[pick.reel][pick.row] = newSymbol;
        globallyReservedBananaSpawns.add(posKey);
        bananaPositions.push({
          reel: pick.reel,
          row: pick.row,
          oldSymbol,
          newSymbol
        });
      }

      if (destroyedPositions.length > 0 || bananaPositions.length > 0) {
        barrelBursts.push({
          reel: barrelReel,
          row: barrelRow,
          spawnedBananas: bananaPositions.length,
          destroyedSymbols: destroyedPositions.length,
          positions: destroyedPositions,
          bananaPositions
        });
      }
    });

    if (gameState) {
      gameState.barrelBursts = barrelBursts;
      const totalSpawnedBananas = barrelBursts.reduce(
        (sum, burst) => sum + (burst.spawnedBananas || 0),
        0
      );
      const totalDestroyed = barrelBursts.reduce(
        (sum, burst) => sum + (burst.destroyedSymbols || 0),
        0
      );
      gameState.totalBarrelBananasSpawned = totalSpawnedBananas; // legacy name
      gameState.totalBarrelDestroyedSymbols = totalDestroyed;
    }

    return { reels: reelsAfterBurst, barrelBursts };
  }

  getBarrelSymbolsOnBoard(reels) {
    const barrels = [];
    if (!reels) return barrels;

    for (let reel = 0; reel < this.width; reel++) {
      for (let row = 0; row < this.height; row++) {
        if (reels[reel]?.[row] === this.timeId) {
          barrels.push({ reel, row });
        }
      }
    }

    return barrels;
  }

  /**
   * Inject time symbols into reels
   * Time symbols can only replace normal payout symbols (1-8)
   * Cannot replace: bananas, hero, house, mystery, mysteryWild
   * @param {Object} reels - Current reel state
   * @param {boolean} bonusAlreadyWon - If true, don't spawn time symbols
   * @param {Object} dropEvent - Optional drop event data to restrict to new symbols only
   * @param {Object} gameState - Optional gameState to track time symbols in roundSummary
   * @returns {Object} { reels, timeSymbols: [{reel, row}, ...] }
   */
  injectTimeSymbols(reels, bonusAlreadyWon = false, dropEvent = null, gameState = null, options = {}) {
    const baseConfig = this.resolveExplodingBarrelConfig(gameState) || {
      chancePerSpin: 0,
      chancePerNewSymbolOnRespin: 0,
      countOdds: { "1": 100 }
    };
    const chancePerSpinOverride = Number(options?.chancePerSpin);
    const chancePerNewSymbolOnRespinOverride = Number(options?.chancePerNewSymbolOnRespin);
    const config = {
      ...baseConfig,
      chancePerSpin: Number.isFinite(chancePerSpinOverride) ? chancePerSpinOverride : baseConfig.chancePerSpin,
      chancePerNewSymbolOnRespin: Number.isFinite(chancePerNewSymbolOnRespinOverride)
        ? chancePerNewSymbolOnRespinOverride
        : baseConfig.chancePerNewSymbolOnRespin
    };
    const ignoreBonusLock = options?.ignoreBonusLock === true;
    const timeSymbols = [];
    
    // If bonus already won, don't spawn any time symbols
    if (bonusAlreadyWon && !ignoreBonusLock) {
      return { reels, timeSymbols };
    }
    
    // Roll for time symbol spawn
    if (Math.random() * 100 >= config.chancePerSpin) {
      return { reels, timeSymbols }; // No time symbols this spin
    }
    
    // Roll how many time symbols to spawn
    const count = parseInt(rollWeightedOption(config.countOdds));
    
    // If dropEvent provided (respin), only consider NEW symbols
    let newSymbolPositions = null;
    if (dropEvent && dropEvent.movements && dropEvent.movements.length > 0) {
      newSymbolPositions = new Set();
      const direction = dropEvent.direction || 'down';
      
      dropEvent.movements.forEach(movement => {
        let isNewSymbol = false;
        
        if (direction === 'down' || direction === 'up') {
          // Vertical gravity: check if `from` is outside grid
          // Down: from >= this.height (8, 9, 10...)
          // Up: from < 0 (-1, -2, -3...)
          isNewSymbol = movement.from >= this.height || movement.from < 0;
        } else if (direction === 'left' || direction === 'right') {
          // Horizontal gravity: check if `fromReel` is outside grid
          // Right: fromReel < 0 (-1, -2, -3...)
          // Left: fromReel >= this.width (8, 9, 10...)
          isNewSymbol = movement.fromReel < 0 || movement.fromReel >= this.width;
        }
        
        if (isNewSymbol) {
          const targetReel = movement.toReel !== undefined ? movement.toReel : movement.reel;
          newSymbolPositions.add(`${targetReel},${movement.to}`);
        }
      });
    }
    
    // Find valid positions (only normal payout symbols 1-8)
    const validPositions = [];
    const normalPayoutSymbols = [1, 2, 3, 4, 5, 6, 7, 8];
    
    for (let reel = 0; reel < this.width; reel++) {
      for (let row = 0; row < this.height; row++) {
        const symbol = reels[reel]?.[row];
        
        // If dropEvent provided, only allow positions with NEW symbols
        if (newSymbolPositions && !newSymbolPositions.has(`${reel},${row}`)) {
          continue;
        }
        
        if (normalPayoutSymbols.includes(symbol)) {
          if (this.isLightningBeeFeatureSymbol(symbol)) {
            continue;
          }
          validPositions.push({ reel, row });
        }
      }
    }
    
    // Shuffle valid positions
    for (let i = validPositions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [validPositions[i], validPositions[j]] = [validPositions[j], validPositions[i]];
    }
    
    // Place time symbols
    const toPlace = Math.min(count, validPositions.length);
    
    for (let i = 0; i < toPlace; i++) {
      const { reel, row } = validPositions[i];
      reels[reel][row] = this.timeId;
      timeSymbols.push({ reel, row });
    }
    
    return { reels, timeSymbols };
  }

  /**
   * Roll for bonus abilities - upgrades 0-3 random abilities from current hero state
   * @param {Object} currentHero - Current hero state { step, weapon, necromancer }
   * @param {boolean} forceAtLeastOne - If true, ensures at least 1 upgrade (for chest rewards)
   * @returns {Object} { won: true, enterBonusWith: { upgrades, step, weapon, necromancer, freespins } }
   */
  rollBonusAbilities(currentHero = {}, forceAtLeastOne = false) {
    const current = {
      step: currentHero?.step || BASE_MONKEY_STATE.step,
      weapon: currentHero?.weapon || BASE_MONKEY_STATE.weapon,
      necromancer: Number(currentHero?.necromancer ?? BASE_MONKEY_STATE.necromancer)
    };

    return {
      won: true,
      enterBonusWith: {
        upgrades: {
          step: 0,
          weapon: 0,
          necromancer: 0
        },
        step: {
          from: current.step,
          to: current.step
        },
        weapon: {
          from: current.weapon,
          to: current.weapon
        },
        necromancer: {
          from: current.necromancer,
          to: current.necromancer
        },
        freespins: BONUS_BASE_ENTRY_FREESPINS,
        portalBonus: false
      }
    };
  }

  getHeavenHellConfig() {
    return isPlainObject(serverConfig?.heavenHell) ? serverConfig.heavenHell : {};
  }

  getHeavenHellMainConfig() {
    return isPlainObject(this.getHeavenHellConfig()?.main) ? this.getHeavenHellConfig().main : {};
  }

  isHeavenHellEnabled() {
    return this.getHeavenHellConfig()?.enabled === true;
  }

  canHeavenHellMultiplierDemonProcFromKill(entry = null) {
    if (this.getHeavenHellConfig()?.multiplierDemonProcOnAbilitesOnly !== true) {
      return true;
    }
    const source = String(entry?.source || "").trim();
    return source === "divineX" || source === "divineStrike" || source === "divineCharge";
  }

  getMainGameAngelMultiplierCap() {
    const configuredCap = Number(this.getHeavenHellMainConfig()?.maxMuliplierOnAngel);
    if (!Number.isFinite(configuredCap) || configuredCap < 1) {
      return Number.MAX_SAFE_INTEGER;
    }
    return Math.max(1, Math.floor(configuredCap));
  }

  clampMainGameAngelMultiplier(multiplier = 1) {
    const normalizedMultiplier = Math.max(1, Math.floor(Number(multiplier) || 1));
    return Math.min(normalizedMultiplier, this.getMainGameAngelMultiplierCap());
  }

  getMainGameAngelWinStruggleRule(multiplier = 1) {
    const struggleConfig = this.getHeavenHellMainConfig()?.multiplierWinStruggleChanceByTier;
    if (!isPlainObject(struggleConfig)) return null;

    const normalizedMultiplier = this.clampMainGameAngelMultiplier(multiplier);
    const tierEntries = Object.entries(struggleConfig)
      .map(([threshold, rule]) => ({
        threshold: Number(threshold),
        odds: this.normalizeProbability(rule?.odds, 0),
        times: Math.max(0, Math.floor(Number(rule?.times) || 0))
      }))
      .filter((entry) => Number.isFinite(entry.threshold))
      .sort((a, b) => a.threshold - b.threshold);

    let matchedRule = null;
    tierEntries.forEach((entry) => {
      if (normalizedMultiplier >= entry.threshold) {
        matchedRule = entry;
      }
    });

    return matchedRule;
  }

  rollChance(chance = 0) {
    const parsed = Number(chance);
    if (!Number.isFinite(parsed) || parsed <= 0) return false;
    const normalized = parsed > 1 ? parsed / 100 : parsed;
    if (normalized >= 1) return true;
    return Math.random() < Math.max(0, normalized);
  }

  pickWeightedValueFromEntries(entries = []) {
    const valid = Array.isArray(entries)
      ? entries
          .map((entry) => ({
            value: Number(entry?.value),
            weight: Number(entry?.weight)
          }))
          .filter((entry) => Number.isFinite(entry.value) && Number.isFinite(entry.weight) && entry.weight > 0)
      : [];
    if (valid.length === 0) return 0;
    const totalWeight = valid.reduce((sum, entry) => sum + entry.weight, 0);
    let roll = Math.random() * totalWeight;
    for (const entry of valid) {
      roll -= entry.weight;
      if (roll <= 0) return entry.value;
    }
    return valid[valid.length - 1]?.value ?? 0;
  }

  pickWeightedEntry(entries = []) {
    const valid = Array.isArray(entries)
      ? entries
          .map((entry) => ({
            entry,
            weight: Number(entry?.weight)
          }))
          .filter((entry) => Number.isFinite(entry.weight) && entry.weight > 0)
      : [];
    if (valid.length === 0) return null;
    const totalWeight = valid.reduce((sum, entry) => sum + entry.weight, 0);
    let roll = Math.random() * totalWeight;
    for (const entry of valid) {
      roll -= entry.weight;
      if (roll <= 0) return entry.entry ?? null;
    }
    return valid[valid.length - 1]?.entry ?? null;
  }

  getHeavenHellLootDropDefinitions(lootConfig = null) {
    const config = lootConfig || this.getHeavenHellConfig()?.bonus?.loot || {};
    const lootDrops = config?.lootDrops && typeof config.lootDrops === "object"
      ? config.lootDrops
      : {};
    return Object.entries(lootDrops)
      .map(([type, entry]) => ({
        type: String(type || "").trim().toLowerCase(),
        id: Number(entry?.id),
        value: Number(entry?.value)
      }))
      .filter((entry) => entry.type && Number.isFinite(entry.value) && entry.value > 0)
      .sort((left, right) => left.value - right.value || left.type.localeCompare(right.type));
  }

  getHeavenHellLootDropDefinitionByType(rawType = "", lootConfig = null) {
    const normalizedType = String(rawType || "").trim().toLowerCase();
    if (!normalizedType) return null;
    return this.getHeavenHellLootDropDefinitions(lootConfig).find((entry) => entry.type === normalizedType) || null;
  }

  getHeavenHellLootDropDefinitionByValue(rawValue = 0, lootConfig = null, { allowNearest = false } = {}) {
    const parsedValue = Number(rawValue);
    if (!Number.isFinite(parsedValue) || parsedValue <= 0) return null;
    const definitions = this.getHeavenHellLootDropDefinitions(lootConfig);
    if (definitions.length === 0) return null;

    const exact = definitions.find((entry) => Math.abs(entry.value - parsedValue) < 0.000001);
    if (exact || allowNearest !== true) {
      return exact || null;
    }

    let closest = definitions[0];
    let closestDiff = Math.abs(definitions[0].value - parsedValue);
    for (let index = 1; index < definitions.length; index++) {
      const candidate = definitions[index];
      const candidateDiff = Math.abs(candidate.value - parsedValue);
      if (
        candidateDiff < closestDiff ||
        (Math.abs(candidateDiff - closestDiff) < 0.000001 && candidate.value < closest.value)
      ) {
        closest = candidate;
        closestDiff = candidateDiff;
      }
    }
    return closest;
  }

  resolveHeavenHellLootDropSelection(selectedEntry = null, lootConfig = null) {
    const typeCandidate = typeof selectedEntry?.lootType === "string"
      ? selectedEntry.lootType
      : typeof selectedEntry?.value === "string"
        ? selectedEntry.value
        : "";
    const byType = this.getHeavenHellLootDropDefinitionByType(typeCandidate, lootConfig);
    if (byType) {
      return {
        lootType: byType.type,
        lootId: Number.isFinite(byType.id) ? byType.id : null,
        baseValue: byType.value
      };
    }

    const byValue = this.getHeavenHellLootDropDefinitionByValue(selectedEntry?.value, lootConfig, {
      allowNearest: true
    });
    if (byValue) {
      return {
        lootType: byValue.type,
        lootId: Number.isFinite(byValue.id) ? byValue.id : null,
        baseValue: byValue.value
      };
    }

    const fallbackValue = Number(selectedEntry?.value);
    return {
      lootType: "",
      lootId: null,
      baseValue: Number.isFinite(fallbackValue) && fallbackValue > 0 ? fallbackValue : 0
    };
  }

  getHeavenHellLootTableKey(entry = {}, lootConfig = null) {
    const config = lootConfig || this.getHeavenHellConfig()?.bonus?.loot || {};
    if (typeof entry?.lootTableKey === "string" && entry.lootTableKey.length > 0) {
      return entry.lootTableKey;
    }
    const symbolTableMap = config?.symbolLootTables && typeof config.symbolLootTables === "object"
      ? config.symbolLootTables
      : {};
    const symbolKey = String(Math.floor(Number(entry?.symbol)));
    if (symbolTableMap[symbolKey]) {
      return String(symbolTableMap[symbolKey]);
    }
    if (entry?.isBoss === true) return "boss_demon";
    if (entry?.isMultiplierDemon === true) return "multiplier_demon";
    if (entry?.isGargoyleDemon === true) return "gargoyle_demon";
    return "normal_demon";
  }

  getHeavenHellLootTableEntries(tableKey = "", lootConfig = null) {
    const config = lootConfig || this.getHeavenHellConfig()?.bonus?.loot || {};
    const tables = config?.tables && typeof config.tables === "object" ? config.tables : {};
    if (Array.isArray(tables?.[tableKey])) {
      return tables[tableKey];
    }
    if (Array.isArray(config?.[tableKey])) {
      return config[tableKey];
    }
    return Array.isArray(config?.values) ? config.values : [];
  }

  getHeavenHellChestConfig() {
    return this.getHeavenHellConfig()?.bonus?.chests || {};
  }

  getHeavenHellChestTypes() {
    return this.getHeavenHellConfig()?.bonus?.chestTypes || {};
  }

  getHeavenHellPentagramConfig() {
    return this.getHeavenHellConfig()?.bonus?.pentagram || {};
  }

  getHeavenHellSymbolIds() {
    const symbols = this.getHeavenHellConfig()?.bonus?.symbols || {};
    return {
      demonId: Number(symbols?.demon ?? serverConfig.symbolsMapping?.banana ?? 11),
      multiplierDemonId: Number(symbols?.multiplierDemon ?? serverConfig.symbolsMapping?.banana2 ?? 12),
      bossDemonId: Number(symbols?.bossDemon ?? serverConfig.symbolsMapping?.banana3 ?? 13),
      gargoyleDemonId: Number(symbols?.gargoyleDemon ?? serverConfig.symbolsMapping?.gargoyleDemon ?? 21)
    };
  }

  getHeavenHellGargoyleConfig() {
    return this.getHeavenHellConfig()?.bonus?.gargoyleInjection || {};
  }

  buildHeavenHellPentagramPoints() {
    const points = Array.isArray(this.getHeavenHellPentagramConfig()?.points)
      ? this.getHeavenHellPentagramConfig().points
      : [];
    const debugShowTriggerCells = this.getHeavenHellPentagramConfig()?.debugShowTriggerCells === true;
    const normalized = points
      .map((entry, index) => {
        const id = String(entry?.id || "").trim() || `P${index + 1}`;
        const segmentId = String(entry?.segmentId || id).trim() || id;
        const x = Number(entry?.x);
        const y = Number(entry?.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
        const triggerCells = (Array.isArray(entry?.triggerCells) ? entry.triggerCells : [])
          .map((cell) => {
            const reel = Math.floor(Number(cell?.reel));
            const row = Math.floor(Number(cell?.row));
            if (!Number.isFinite(reel) || !Number.isFinite(row)) return null;
            return { reel, row };
          })
          .filter(Boolean);
        return {
          id,
          segmentId,
          x,
          y,
          triggerCells,
          debugShowTriggerCells
        };
      })
      .filter(Boolean);
    return normalized;
  }

  buildHeavenHellPentagramPointStates(points = []) {
    const sourcePoints = Array.isArray(points) && points.length > 0
      ? points
      : this.buildHeavenHellPentagramPoints();
    if (sourcePoints.length === 0) {
      return {
        A: false,
        B: false,
        C: false,
        D: false,
        E: false
      };
    }
    return sourcePoints.reduce((pointStates, point) => {
      const segmentId = String(point?.segmentId || point?.id || "").trim();
      if (!segmentId) return pointStates;
      pointStates[segmentId] = false;
      return pointStates;
    }, {});
  }

  countHeavenHellPentagramLitPoints(pointStates = {}) {
    return Object.values(pointStates || {}).reduce((sum, value) => sum + (value === true ? 1 : 0), 0);
  }

  getHeavenHellPentagramRewardStepValue() {
    return Math.max(1, Math.floor(Number(this.getHeavenHellPentagramConfig()?.rewardStepValue ?? 1) || 1));
  }

  buildHeavenHellPentagramRewardSteps(totalAdded = 0) {
    const remainingTotal = Math.max(0, Math.floor(Number(totalAdded) || 0));
    const stepValue = this.getHeavenHellPentagramRewardStepValue();
    if (remainingTotal <= 0) return [];

    const steps = [];
    let remaining = remainingTotal;
    while (remaining > 0) {
      const amount = Math.min(stepValue, remaining);
      steps.push({
        amount,
        label: `+${amount}`
      });
      remaining -= amount;
    }
    return steps;
  }

  rollHeavenHellPentagramCompletionRewardTotal() {
    const rewardEntries = this.getHeavenHellPentagramConfig()?.completionMultiplierRewards;
    const rolledTotal = Math.max(
      0,
      Math.floor(Number(this.pickWeightedValueFromEntries(rewardEntries)) || 0)
    );
    if (rolledTotal > 0) {
      return rolledTotal;
    }
    return this.getHeavenHellPentagramRewardStepValue() * 6;
  }

  findHeavenHellPentagramTriggerCellMatch(point = {}, targets = []) {
    const triggerCells = Array.isArray(point?.triggerCells) ? point.triggerCells : [];
    if (triggerCells.length === 0) return null;

    const targetMap = new Map();
    (Array.isArray(targets) ? targets : []).forEach((target) => {
      const reel = Math.floor(Number(target?.reel));
      const row = Math.floor(Number(target?.row));
      if (!Number.isFinite(reel) || !Number.isFinite(row)) return;
      targetMap.set(`${reel},${row}`, {
        reel,
        row,
        wave: Math.max(0, Math.floor(Number(target?.wave) || 0))
      });
    });

    for (const cell of triggerCells) {
      const match = targetMap.get(`${Math.floor(Number(cell?.reel))},${Math.floor(Number(cell?.row))}`);
      if (match) {
        return match;
      }
    }
    return null;
  }

  resolveHeavenHellPentagramTargetHits(
    gameState,
    {
      pathIndex = -1,
      ability = "",
      targets = []
    } = {}
  ) {
    const heavenHell = this.ensureHeavenHellState(gameState);
    const pentagram = heavenHell?.bonus?.pentagram;
    if (!pentagram || pentagram.enabled !== true) {
      return [];
    }

    const points = Array.isArray(pentagram.points) ? pentagram.points : [];
    const hits = [];
    points.forEach((point) => {
      const matchedTarget = this.findHeavenHellPentagramTriggerCellMatch(point, targets);
      if (!matchedTarget) return;
      const event = this.registerHeavenHellPentagramHit(gameState, {
        pathIndex,
        ability,
        point,
        originReel: matchedTarget.reel,
        originRow: matchedTarget.row,
        triggerReel: matchedTarget.reel,
        triggerRow: matchedTarget.row,
        triggerWave: matchedTarget.wave
      });
      if (event) {
        hits.push(event);
      }
    });
    return hits;
  }

  collectHeavenHellDivineStrikePentagramTargets(strikeTargets = []) {
    const targets = [];
    (Array.isArray(strikeTargets) ? strikeTargets : []).forEach((target) => {
      const wave = Math.max(0, Math.floor(Number(target?.wave) || 0));
      (Array.isArray(target?.hitCells) ? target.hitCells : []).forEach((cell) => {
        const reel = Math.floor(Number(cell?.reel));
        const row = Math.floor(Number(cell?.row));
        if (!Number.isFinite(reel) || !Number.isFinite(row)) return;
        targets.push({
          reel,
          row,
          wave
        });
      });
    });
    return targets;
  }

  registerHeavenHellPentagramHit(
    gameState,
    {
      pathIndex = -1,
      ability = "",
      point = null,
      originReel = null,
      originRow = null,
      triggerReel = null,
      triggerRow = null,
      triggerWave = null
    } = {}
  ) {
    const heavenHell = this.ensureHeavenHellState(gameState);
    const pentagram = heavenHell?.bonus?.pentagram;
    if (!pentagram || !point) return null;

    const pointId = String(point?.segmentId || point?.id || "").trim();
    if (!pointId) return null;

    const alreadyCompleted = pentagram.pointStates?.[pointId] === true;
    const event = {
      pathIndex: Math.max(-1, Math.floor(Number(pathIndex) || -1)),
      ability: String(ability || ""),
      pointId: String(point?.id || pointId),
      litPointId: pointId,
      pointIdsLitAtActionStart: Array.isArray(pentagram?.pointIdsLitAtActionStart)
        ? pentagram.pointIdsLitAtActionStart.slice()
        : [],
      point: {
        id: String(point?.id || pointId),
        segmentId: pointId,
        x: Number(point?.x),
        y: Number(point?.y),
        triggerCells: Array.isArray(point?.triggerCells)
          ? point.triggerCells.map((cell) => ({
              reel: Math.floor(Number(cell?.reel)),
              row: Math.floor(Number(cell?.row))
            }))
          : []
      },
      originReel: Number.isFinite(Number(originReel)) ? Number(originReel) : null,
      originRow: Number.isFinite(Number(originRow)) ? Number(originRow) : null,
      triggerReel: Number.isFinite(Number(triggerReel)) ? Number(triggerReel) : null,
      triggerRow: Number.isFinite(Number(triggerRow)) ? Number(triggerRow) : null,
      triggerWave: Number.isFinite(Number(triggerWave)) ? Math.floor(Number(triggerWave)) : null,
      activated: false,
      alreadyCompleted
    };

    if (!alreadyCompleted) {
      pentagram.pointStates[pointId] = true;
      pentagram.litPointCount = this.countHeavenHellPentagramLitPoints(pentagram.pointStates);
      event.activated = true;

      if (
        pentagram.completed !== true &&
        Object.values(pentagram.pointStates).length > 0 &&
        Object.values(pentagram.pointStates).every(Boolean)
      ) {
        const completedPointIds = Object.keys(pentagram.pointStates).filter((key) => pentagram.pointStates[key] === true);
        pentagram.completed = true;
        const totalAdded = this.rollHeavenHellPentagramCompletionRewardTotal();
        pentagram.pendingCompletionReward = {
          pathIndex: event.pathIndex,
          triggerAbility: event.ability,
          pointId: event.pointId,
          litPointId: pointId,
          pointIdsLitAtActionStart: event.pointIdsLitAtActionStart,
          completedPointIds,
          totalAdded,
          steps: this.buildHeavenHellPentagramRewardSteps(totalAdded)
        };
      }
    }

    pentagram.activationsThisAction.push(event);
    return event;
  }

  finalizeHeavenHellPentagramCompletionReward(gameState) {
    const heavenHell = this.ensureHeavenHellState(gameState);
    const bonusState = heavenHell?.bonus;
    const pentagram = bonusState?.pentagram;
    if (!bonusState || !pentagram || pentagram.enabled !== true || !pentagram.pendingCompletionReward) return null;

    const reward = pentagram.pendingCompletionReward;
    const totalAdded = Math.max(0, Math.floor(Number(reward?.totalAdded) || 0));
    const steps = Array.isArray(reward?.steps) && reward.steps.length > 0
      ? reward.steps.map((step) => ({
          amount: Math.max(1, Math.floor(Number(step?.amount || 1) || 1)),
          label: String(step?.label || `+${Math.max(1, Math.floor(Number(step?.amount || 1) || 1))}`)
        }))
      : this.buildHeavenHellPentagramRewardSteps(totalAdded);
    const beforeMultiplier = Math.max(1, Math.floor(Number(bonusState.globalMultiplier) || 1));
    const addedFromSteps = steps.reduce((sum, step) => sum + Math.max(0, Math.floor(Number(step?.amount || 0) || 0)), 0);
    const appliedTotal = addedFromSteps > 0 ? addedFromSteps : totalAdded;
    const afterMultiplier = beforeMultiplier + appliedTotal;

    bonusState.globalMultiplier = afterMultiplier;
    pentagram.completionEventThisAction = {
      pathIndex: Math.max(-1, Math.floor(Number(reward?.pathIndex) || -1)),
      triggerAbility: String(reward?.triggerAbility || ""),
      pointId: String(reward?.pointId || ""),
      litPointId: String(reward?.litPointId || ""),
      pointIdsLitAtActionStart: Array.isArray(reward?.pointIdsLitAtActionStart)
        ? reward.pointIdsLitAtActionStart.slice()
        : [],
      completedPointIds: Array.isArray(reward?.completedPointIds)
        ? reward.completedPointIds.slice()
        : [],
      totalAdded: appliedTotal,
      steps,
      beforeMultiplier,
      afterMultiplier,
      completedPoints: this.countHeavenHellPentagramLitPoints(pentagram.pointStates)
    };
    pentagram.completionCount = Math.max(0, Math.floor(Number(pentagram.completionCount || 0) || 0) + 1);
    pentagram.pointStates = this.buildHeavenHellPentagramPointStates(pentagram.points);
    pentagram.litPointCount = 0;
    pentagram.completed = false;
    pentagram.pendingCompletionReward = null;
    return pentagram.completionEventThisAction;
  }

  syncHeavenHellChestCounters(gameState) {
    if (!gameState) return;
    const bonusState = gameState?.heavenHell?.bonus;
    if (!bonusState) return;
    const pendingChests = Array.isArray(bonusState.pendingChests) ? bonusState.pendingChests : [];
    const rewardedCount = Math.max(0, Math.floor(Number(bonusState.chestsRewarded || 0) || 0));
    bonusState.pendingChests = pendingChests;
    bonusState.chestsRewarded = rewardedCount;
    if (gameState.bonusState && typeof gameState.bonusState === "object") {
      gameState.bonusState.chestsPending = pendingChests.length;
      gameState.bonusState.chestsRewarded = rewardedCount;
    }
  }

  resolveHeavenHellChestDrops(gameState, killEntries = []) {
    if (!gameState || !Array.isArray(killEntries) || killEntries.length === 0) {
      return [];
    }

    const heavenHell = this.ensureHeavenHellState(gameState);
    const bonusState = heavenHell?.bonus;
    if (!bonusState) return [];

    const chestConfig = this.getHeavenHellChestConfig();
    const chestTypes = this.getHeavenHellChestTypes();
    const gargoyleConfig = this.getHeavenHellGargoyleConfig();
    const createdChests = [];

    killEntries.forEach((entry) => {
      const nextChestId = Math.max(1, Math.floor(Number(bonusState.nextChestId || 1) || 1));
      const isGargoyleDemon = entry?.isGargoyleDemon === true;
      const chest = generateChest({
        chestConfig,
        chestTypes,
        dropChanceOverride: isGargoyleDemon ? gargoyleConfig?.chestChance : null,
        chestTypeWeights: isGargoyleDemon ? gargoyleConfig?.chestType : null,
        source: entry?.isBoss
          ? "boss"
          : (entry?.isMultiplierDemon
            ? "multiplier"
            : (isGargoyleDemon ? "gargoyle" : "normal")),
        reel: entry?.reel,
        row: entry?.row,
        symbol: entry?.symbol,
        isBoss: entry?.isBoss === true,
        isMultiplierDemon: entry?.isMultiplierDemon === true,
        isGargoyleDemon,
        pendingId: nextChestId
      });
      if (!chest) return;
      bonusState.nextChestId = nextChestId + 1;
      bonusState.pendingChests.push(chest);
      createdChests.push(chest);
    });

    this.syncHeavenHellChestCounters(gameState);
    return createdChests;
  }

  collectHeavenHellStepAttackKillKeys(step = {}) {
    const keys = new Set();
    const addKey = (reel, row) => {
      const normalizedReel = Math.floor(Number(reel));
      const normalizedRow = Math.floor(Number(row));
      if (!Number.isFinite(normalizedReel) || !Number.isFinite(normalizedRow)) return;
      keys.add(`${normalizedReel},${normalizedRow}`);
    };
    const bananaTargets =
      Array.isArray(step?.eatenBananas) && step.eatenBananas.length > 0
        ? step.eatenBananas
        : (step?.banana === true ? [{ reel: step?.reel, row: step?.row }] : []);
    bananaTargets.forEach((banana) => addKey(banana?.reel, banana?.row));
    (Array.isArray(step?.divineStrikeTargets) ? step.divineStrikeTargets : []).forEach((target) => {
      (Array.isArray(target?.hitCells) ? target.hitCells : []).forEach((cell) => {
        if (cell?.killed === true) addKey(cell?.reel, cell?.row);
      });
    });
    (Array.isArray(step?.divineXTargets) ? step.divineXTargets : []).forEach((target) => {
      if (target?.killed === true) addKey(target?.reel, target?.row);
    });
    return keys;
  }

  applyHeavenHellChargeLootFromPath(heroPath = [], killEntries = []) {
    if (!Array.isArray(heroPath) || !Array.isArray(killEntries)) return;
    heroPath.forEach((step) => {
      if (step?.divineChargeProc !== true) return;
      const chargeLootMultiplier = Math.max(
        1,
        Math.floor(Number(step?.divineChargeLootMultiplier ?? 1) || 1)
      );
      this.collectHeavenHellStepAttackKillKeys(step).forEach((key) => {
        const [reel, row] = key.split(",").map((value) => Math.floor(Number(value)));
        const entry = killEntries.find((candidate) => (
          Number(candidate?.reel) === reel && Number(candidate?.row) === row
        ));
        if (!entry) return;
        entry.guaranteedLoot = true;
        entry.lootMultiplier = Math.max(
          1,
          Math.floor(Number(entry?.lootMultiplier ?? 1) || 1),
          chargeLootMultiplier
        );
      });
    });
  }

  applyHeavenHellDivineXKillCreditFromPath(heroPath = [], killEntries = []) {
    if (!Array.isArray(heroPath) || !Array.isArray(killEntries)) return;
    heroPath.forEach((step) => {
      if (step?.divineXProc !== true) return;
      this.collectHeavenHellStepAttackKillKeys(step).forEach((key) => {
        const [reel, row] = key.split(",").map((value) => Math.floor(Number(value)));
        const entry = killEntries.find((candidate) => (
          Number(candidate?.reel) === reel && Number(candidate?.row) === row
        ));
        if (!entry) return;
        entry.divineXDoubleKill = true;
      });
    });
  }

  applyHeavenHellChestDropsToPath(heroPath = [], chestDrops = []) {
    if (!Array.isArray(heroPath) || !Array.isArray(chestDrops) || chestDrops.length === 0) return;

    heroPath.forEach((step) => {
      if (step && typeof step === "object" && Array.isArray(step.chestDrops)) {
        step.chestDrops = [];
      }
    });

    const unassigned = chestDrops.map((drop, index) => ({ drop, index }));
    heroPath.forEach((step) => {
      if (!step || typeof step !== "object" || unassigned.length === 0) return;
      const stepKillKeys = this.collectHeavenHellStepAttackKillKeys(step);
      if (stepKillKeys.size === 0) return;

      const matchedDrops = [];
      for (let i = unassigned.length - 1; i >= 0; i--) {
        const entry = unassigned[i];
        const key = `${Math.floor(Number(entry?.drop?.reel))},${Math.floor(Number(entry?.drop?.row))}`;
        if (!stepKillKeys.has(key)) continue;
        matchedDrops.push(entry.drop);
        unassigned.splice(i, 1);
      }

      if (matchedDrops.length > 0) {
        step.chestDrops = matchedDrops.reverse();
      }
    });
  }

  normalizeHeavenHellKillEntryCredit(entry = {}, { weightedBossKills = 1 } = {}) {
    // Each demon counts once per attack. Divine X is ×2 max — never stacks impact + X into ×4.
    const killCountMultiplier = entry?.divineXDoubleKill === true ? 2 : 1;
    entry.killCountMultiplier = killCountMultiplier;
    entry.weightedKills = (entry?.isBoss === true ? weightedBossKills : 1) * killCountMultiplier;
    return entry;
  }

  dedupeHeavenHellKillEntries(killEntries = []) {
    if (!Array.isArray(killEntries)) return [];
    const seenKeys = new Set();
    return killEntries.filter((entry) => {
      const key = `${Number(entry?.reel)},${Number(entry?.row)}`;
      if (seenKeys.has(key)) return false;
      seenKeys.add(key);
      return true;
    });
  }

  getHeavenHellLootScatterOffsets(entry = {}, pieceIndex = 0, pieceCount = 1) {
    const normalizedCount = Math.max(1, Math.floor(Number(pieceCount) || 1));
    const chargeMultiplier = Math.max(1, Math.floor(Number(entry?.lootMultiplier ?? 1) || 1));
    const isBoss = entry?.isBoss === true;
    const minRadius = isBoss
      ? 40
      : chargeMultiplier > 1
        ? 25
        : normalizedCount === 1
          ? 6
          : 10;
    const maxRadius = isBoss
      ? 60
      : chargeMultiplier > 1
        ? 45
        : normalizedCount === 1
          ? 16
          : 20;
    const angleStep = (Math.PI * 2) / normalizedCount;
    const baseAngle = normalizedCount === 1 ? Math.random() * Math.PI * 2 : pieceIndex * angleStep;
    const angle = baseAngle + ((Math.random() - 0.5) * angleStep * 0.55);
    const radius = minRadius + (Math.random() * Math.max(0, maxRadius - minRadius));
    return {
      offsetX: Math.round(Math.cos(angle) * radius),
      offsetY: Math.round(Math.sin(angle) * radius * 0.72)
    };
  }

  ensureHeavenHellState(gameState) {
    if (!gameState || typeof gameState !== "object") return null;
    if (!gameState.heavenHell || typeof gameState.heavenHell !== "object") {
      gameState.heavenHell = {};
    }
    if (!gameState.heavenHell.bonus || typeof gameState.heavenHell.bonus !== "object") {
      gameState.heavenHell.bonus = {};
    }
    const bonusState = gameState.heavenHell.bonus;
    gameState.heavenHell.portalTriggered = gameState.heavenHell.portalTriggered === true;
    gameState.heavenHell.portalTriggerKillsThisRound = Math.max(
      0,
      Math.floor(Number(gameState.heavenHell.portalTriggerKillsThisRound) || 0)
    );
    bonusState.globalMultiplier = Math.max(1, Math.floor(Number(bonusState.globalMultiplier) || 1));
    bonusState.killsTotal = Math.max(0, Math.floor(Number(bonusState.killsTotal) || 0));
    const killsPerUnlock = Math.max(
      20,
      Math.floor(Number(this.getHeavenHellConfig()?.bonus?.abilityUnlock?.killsPerUnlock ?? 20) || 20)
    );
    bonusState.nextAbilityKillThreshold = killsPerUnlock;
    bonusState.killsTowardsUnlock = Math.max(
      0,
      Math.floor(Number(bonusState.killsTowardsUnlock) || (bonusState.killsTotal % killsPerUnlock))
    );
    bonusState.portalBonus = bonusState.portalBonus === true;
    if (!bonusState.abilities || typeof bonusState.abilities !== "object") {
      bonusState.abilities = {};
    }
    bonusState.abilities.divineX = Math.max(
      0,
      Math.min(2, Math.floor(Number(bonusState.abilities.divineX || 0)))
    );
    bonusState.abilities.divineStrike = Math.max(
      0,
      Math.min(2, Math.floor(Number(bonusState.abilities.divineStrike || 0)))
    );
    bonusState.abilities.divineCharge = Math.max(
      0,
      Math.min(2, Math.floor(Number(bonusState.abilities.divineCharge || 0)))
    );
    bonusState.freerespinChain = Math.max(0, Math.floor(Number(bonusState.freerespinChain) || 0));
    bonusState.actionCount = Math.max(0, Math.floor(Number(bonusState.actionCount) || 0));
    bonusState.lootGround = Array.isArray(bonusState.lootGround) ? bonusState.lootGround : [];
    bonusState.pendingChests = Array.isArray(bonusState.pendingChests) ? bonusState.pendingChests : [];
    bonusState.nextChestId = Math.max(1, Math.floor(Number(bonusState.nextChestId || 1) || 1));
    bonusState.chestsRewarded = Math.max(0, Math.floor(Number(bonusState.chestsRewarded || 0) || 0));
    bonusState.chestRewardResumeAction = typeof bonusState.chestRewardResumeAction === "string"
      ? bonusState.chestRewardResumeAction
      : null;
    if (!bonusState.pentagram || typeof bonusState.pentagram !== "object") {
      bonusState.pentagram = {};
    }
    const pentagramPoints = this.buildHeavenHellPentagramPoints();
    const pentagram = bonusState.pentagram;
    pentagram.enabled = this.getHeavenHellPentagramConfig()?.enabled !== false && pentagramPoints.length > 0;
    pentagram.points = pentagramPoints;
    const legacySegments = pentagram?.segments && typeof pentagram.segments === "object"
      ? pentagram.segments
      : null;
    const defaultPointStates = this.buildHeavenHellPentagramPointStates(pentagramPoints);
    const normalizedPointStates = { ...defaultPointStates };
    Object.keys(defaultPointStates).forEach((pointId) => {
      normalizedPointStates[pointId] = (
        pentagram?.pointStates?.[pointId] === true ||
        legacySegments?.[pointId] === true
      );
    });
    pentagram.pointStates = normalizedPointStates;
    pentagram.pointIdsLitAtActionStart = Object.keys(pentagram.pointStates).filter(
      (pointId) => pentagram.pointStates[pointId] === true
    );
    pentagram.litPointCount = this.countHeavenHellPentagramLitPoints(pentagram.pointStates);
    pentagram.completed = pentagram.enabled === true && Object.values(pentagram.pointStates).length > 0
      ? Object.values(pentagram.pointStates).every(Boolean)
      : false;
    pentagram.completionCount = Math.max(0, Math.floor(Number(pentagram.completionCount || 0) || 0));
    pentagram.activationsThisAction = [];
    pentagram.completionEventThisAction = null;
    pentagram.pendingCompletionReward = pentagram.pendingCompletionReward && typeof pentagram.pendingCompletionReward === "object"
      ? pentagram.pendingCompletionReward
      : null;
    bonusState.abilityProcsThisAction = [];
    bonusState.rippleInjectionsThisAction = [];
    bonusState.demonWaveThisAction = null;
    bonusState.bossEventsThisAction = [];
    bonusState.chestEventsThisAction = [];
    bonusState.chestActionSummary = null;
    bonusState.killsThisAction = 0;
    bonusState.killMeterSettledThisAction = false;
    this.syncHeavenHellChestCounters(gameState);
    return gameState.heavenHell;
  }

  maybeTriggerHeavenHellPortal(gameState, killsInAction = 0) {
    if (!this.isHeavenHellEnabled() || !gameState || gameState.isBonus === true) return false;
    const heavenHell = this.ensureHeavenHellState(gameState);
    if (!heavenHell || heavenHell.portalTriggered === true) return false;
    const heavenHellMainCfg = this.getHeavenHellConfig()?.main || {};
    const chancePerKill = Number(
      heavenHellMainCfg?.portalTriggerChancePerKill ??
      heavenHellMainCfg?.portalTriggerChancePerHuntAction ??
      0.01
    );
    const kills = Math.max(0, Math.floor(Number(killsInAction) || 0));
    if (kills > 0) {
      heavenHell.portalTriggerKillsThisRound += kills;
    }
    if (!(kills > 0) || !(Number.isFinite(chancePerKill) && chancePerKill > 0)) {
      return false;
    }
    for (let i = 0; i < kills; i++) {
      if (!this.rollChance(chancePerKill)) continue;
      heavenHell.portalTriggered = true;
      gameState.bonusTriggered = true;
      gameState.bgwe = true;
      gameState.bonusGameWonEvent = {
        source: "heavenHellRandomTrigger",
        action: gameState.executedAction || null,
        killsInAction: kills
      };
      return true;
    }
    return false;
  }

  isHeavenHellDemonSymbol(symbol) {
    const { demonId: demon, multiplierDemonId: mult, bossDemonId: boss, gargoyleDemonId: gargoyle } = this.getHeavenHellSymbolIds();
    const n = Number(symbol);
    return n === demon || n === mult || n === boss || n === gargoyle;
  }

  isHeavenHellGargoyleSymbol(symbol) {
    const { gargoyleDemonId } = this.getHeavenHellSymbolIds();
    return Number(symbol) === gargoyleDemonId;
  }

  countHeavenHellDemons(reels = {}) {
    let count = 0;
    for (let reel = 0; reel < this.width; reel++) {
      for (let row = 0; row < this.height; row++) {
        if (this.isHeavenHellDemonSymbol(reels?.[reel]?.[row])) {
          count++;
        }
      }
    }
    return count;
  }

  unlockRandomHeavenHellAbility(gameState, { entry = false } = {}) {
    if (!gameState) return null;
    const heavenHell = this.ensureHeavenHellState(gameState);
    if (!heavenHell) return null;
    const bonus = heavenHell.bonus;
    const unlockPool = Array.isArray(this.getHeavenHellConfig()?.bonus?.abilityUnlock?.entryUnlockPool)
      ? this.getHeavenHellConfig().bonus.abilityUnlock.entryUnlockPool
      : ["divineX", "divineStrike", "divineCharge"];

    const candidates = unlockPool.filter((ability) => {
      const current = Math.max(0, Math.floor(Number(bonus.abilities?.[ability] || 0)));
      return current < 2;
    });
    if (candidates.length === 0) return null;
    const picked = candidates[Math.floor(Math.random() * candidates.length)];
    bonus.abilities[picked] = Math.max(1, Math.min(2, Math.floor(Number(bonus.abilities[picked] || 0) + 1)));
    return {
      ability: picked,
      level: bonus.abilities[picked],
      entry
    };
  }

  createHeavenHellBoard(gameState, executedAction = "freespin") {
    const heavenHellConfig = this.getHeavenHellConfig();
    const bonusConfig = heavenHellConfig?.bonus || {};
    const {
      demonId,
      multiplierDemonId,
      bossDemonId,
      gargoyleDemonId
    } = this.getHeavenHellSymbolIds();
    const gargoyleConfig = this.getHeavenHellGargoyleConfig();
    const heavenHell = this.ensureHeavenHellState(gameState);
    const bonusState = heavenHell?.bonus || {};
    const chain = Math.max(0, Math.floor(Number(bonusState?.freerespinChain || 0)));
    const isFirstBonusAction = Math.max(0, Math.floor(Number(bonusState?.actionCount || 0))) <= 1;

    const hasPortalBonus = bonusState?.portalBonus === true;
    const portalSpawn = hasPortalBonus ? (bonusConfig?.portalBonusSpawn || {}) : {};

    // HellDive bonus spawning is intentionally decided at the spin-event level.
    // This keeps all board positions available, but avoids weak 1-demon spins:
    // first roll whether this action is a demon wave, then place a 3+ demon pack.
    // Portal guarantees are injected separately and are not blocked by a missed wave roll.
    const actionWaveKey = executedAction === "freerespin" ? "freerespin" : "freespin";
    const demonWaveConfig = isPlainObject(bonusConfig?.demonWave) ? bonusConfig.demonWave : null;
    const actionWaveConfig = isPlainObject(demonWaveConfig?.[actionWaveKey])
      ? demonWaveConfig[actionWaveKey]
      : {};
    const demonWaveModeEnabled = demonWaveConfig !== null && demonWaveConfig?.enabled !== false;
    let perSlotSpawnChance = 0;
    let demonWaveChance = 0;
    let demonWaveTriggered = false;
    let demonWaveTargetCount = 0;
    let demonWaveSuppressedByChain = false;

    if (demonWaveModeEnabled) {
      const defaultWaveChance = actionWaveKey === "freerespin" ? 0.5 : 0.35;
      demonWaveChance = this.normalizeProbability(
        actionWaveConfig?.chance ??
          demonWaveConfig?.[`${actionWaveKey}Chance`] ??
          demonWaveConfig?.chance,
        defaultWaveChance
      );

      if (actionWaveKey === "freerespin") {
        const forceNoWaveAtChain = Math.floor(Number(actionWaveConfig?.forceNoWaveAtChain ?? Infinity));
        if (Number.isFinite(forceNoWaveAtChain) && chain >= forceNoWaveAtChain) {
          demonWaveChance = 0;
          demonWaveSuppressedByChain = true;
        } else {
          const reductionStart = Math.max(0, Math.floor(Number(actionWaveConfig?.chainChanceReductionStart ?? Infinity)));
          const reductionPerChain = Math.max(0, Number(actionWaveConfig?.chanceReductionPerChain ?? 0));
          if (Number.isFinite(reductionStart) && chain >= reductionStart && reductionPerChain > 0) {
            const reductionSteps = Math.max(0, chain - reductionStart + 1);
            const minChance = this.normalizeProbability(actionWaveConfig?.minChance, 0);
            demonWaveChance = Math.max(minChance, demonWaveChance - reductionSteps * reductionPerChain);
          }
        }
      }

      demonWaveTriggered = this.rollChance(demonWaveChance);
      if (demonWaveTriggered) {
        const minDemons = Math.max(1, Math.floor(Number(actionWaveConfig?.minDemons ?? demonWaveConfig?.minDemons ?? 3) || 3));
        const maxDemons = Math.max(minDemons, Math.floor(Number(actionWaveConfig?.maxDemons ?? demonWaveConfig?.maxDemons ?? minDemons) || minDemons));
        demonWaveTargetCount = this.rollConfiguredCount(
          minDemons,
          maxDemons,
          actionWaveConfig?.countOdds ?? demonWaveConfig?.countOdds ?? null
        );
      }
    } else {
      const chanceTable = bonusConfig?.spawnChanceByStage || {};
      const stageKey = executedAction === "freespin"
        ? "freespin"
        : (chain >= 5 ? "5plus" : String(Math.max(1, chain)));
      const stageChanceRaw = Number(chanceTable?.[stageKey]);
      const fallbackBaseChance = Number(bonusConfig?.baseSpawnChancePerSlot ?? 0.05);
      perSlotSpawnChance = Math.max(
        0,
        Math.min(1, Number.isFinite(stageChanceRaw) ? stageChanceRaw : fallbackBaseChance)
      );
    }

    const candidates = [];
    for (let reel = 0; reel < this.width; reel++) {
      for (let row = 0; row < this.height; row++) {
        if (this.isHouse(reel, row)) continue;
        if (
          gameState.heroPosition &&
          Number(gameState.heroPosition.reel) === reel &&
          Number(gameState.heroPosition.row) === row
        ) {
          continue;
        }
        candidates.push({ reel, row });
      }
    }
    const shufflePositions = (positions = []) => {
      const shuffled = positions.slice();
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      return shuffled;
    };

    const randomCandidates = shufflePositions(candidates);
    const clusterCenterPool = candidates.length > 0 ? candidates : [{ reel: Math.floor(this.width / 2), row: Math.floor(this.height / 2) }];
    const portalClusterCenter = clusterCenterPool[Math.floor(Math.random() * clusterCenterPool.length)];
    const portalClusterOrder = shufflePositions(candidates)
      .sort((a, b) => {
        const ad = Math.abs(a.reel - portalClusterCenter.reel) + Math.abs(a.row - portalClusterCenter.row);
        const bd = Math.abs(b.reel - portalClusterCenter.reel) + Math.abs(b.row - portalClusterCenter.row);
        return ad - bd || Math.abs(a.row - portalClusterCenter.row) - Math.abs(b.row - portalClusterCenter.row);
      });

    const reels = {};
    for (let reel = 0; reel < this.width; reel++) {
      reels[reel] = [];
      for (let row = 0; row < this.height; row++) {
        reels[reel][row] = this.isHouse(reel, row) ? "HOUSE" : 0;
      }
    }

    const portalGuaranteeActions = Array.isArray(demonWaveConfig?.portalGuaranteeActions)
      ? demonWaveConfig.portalGuaranteeActions
      : ["freespin"];
    const portalGuaranteesEnabledForAction = hasPortalBonus && portalGuaranteeActions.includes(actionWaveKey);
    const activePortalSpawn = portalGuaranteesEnabledForAction ? portalSpawn : {};
    const configuredNormalExact = Number(activePortalSpawn?.guaranteedNormalDemons ?? activePortalSpawn?.guaranteedDemons);
    const configuredNormalMin = Number(activePortalSpawn?.guaranteedNormalMinDemons ?? activePortalSpawn?.guaranteedNormalMin);
    const configuredNormalMax = Number(activePortalSpawn?.guaranteedNormalMaxDemons ?? activePortalSpawn?.guaranteedNormalMax);
    const hasConfiguredNormalRange = Number.isFinite(configuredNormalMin) || Number.isFinite(configuredNormalMax);
    const guaranteedNormalMin = hasConfiguredNormalRange
      ? (
        Number.isFinite(configuredNormalMin)
          ? Math.max(0, Math.floor(configuredNormalMin))
          : 0
      )
      : (
        Number.isFinite(configuredNormalExact)
          ? Math.max(0, Math.floor(configuredNormalExact))
          : 0
      );
    const guaranteedNormalMax = hasConfiguredNormalRange
      ? (
        Number.isFinite(configuredNormalMax)
          ? Math.max(guaranteedNormalMin, Math.floor(configuredNormalMax))
          : guaranteedNormalMin
      )
      : (
        Number.isFinite(configuredNormalExact)
          ? Math.max(guaranteedNormalMin, Math.floor(configuredNormalExact))
          : guaranteedNormalMin
      );
    const guaranteedNormalDemons = guaranteedNormalMax <= guaranteedNormalMin
      ? guaranteedNormalMin
      : (guaranteedNormalMin + Math.floor(Math.random() * (guaranteedNormalMax - guaranteedNormalMin + 1)));
    const configuredMultiplier = Number(activePortalSpawn?.guaranteedMultiplierDemons);
    const guaranteedMultiplierDemons = Number.isFinite(configuredMultiplier)
      ? Math.max(0, Math.floor(configuredMultiplier))
      : 0;

    const placements = [];
    const occupied = new Set();
    const injectGuaranteed = (count = 0, symbol = demonId, type = "demon") => {
      let remaining = Math.max(0, Math.floor(Number(count) || 0));
      if (remaining <= 0) return;
      for (const pos of portalClusterOrder) {
        if (remaining <= 0) break;
        const key = `${pos.reel},${pos.row}`;
        if (occupied.has(key)) continue;
        reels[pos.reel][pos.row] = symbol;
        placements.push({ ...pos, symbol, type, guaranteed: true, portalInjected: true, clusterCenter: portalClusterCenter });
        occupied.add(key);
        remaining--;
      }
    };

    // Portal injects guaranteed demons in a tight cluster before the red wave/random generation.
    injectGuaranteed(guaranteedMultiplierDemons, multiplierDemonId, "multiplierDemon");
    injectGuaranteed(guaranteedNormalDemons, demonId, "demon");

    if (demonWaveModeEnabled) {
      let remainingWaveDemons = Math.max(0, Math.floor(Number(demonWaveTargetCount) || 0));
      for (const pos of randomCandidates) {
        if (remainingWaveDemons <= 0) break;
        const key = `${pos.reel},${pos.row}`;
        if (occupied.has(key)) continue;
        reels[pos.reel][pos.row] = demonId;
        placements.push({
          ...pos,
          symbol: demonId,
          type: "demon",
          guaranteed: false,
          waveTriggered: demonWaveTriggered === true
        });
        occupied.add(key);
        remainingWaveDemons--;
      }
    } else {
      for (const pos of randomCandidates) {
        const key = `${pos.reel},${pos.row}`;
        if (occupied.has(key)) continue;
        if (!this.rollChance(perSlotSpawnChance)) continue;
        reels[pos.reel][pos.row] = demonId;
        placements.push({ ...pos, symbol: demonId, type: "demon", guaranteed: false });
        occupied.add(key);
      }
    }

    if (isFirstBonusAction && placements.length === 0) {
      for (const pos of portalClusterOrder) {
        const key = `${pos.reel},${pos.row}`;
        if (occupied.has(key)) continue;
        reels[pos.reel][pos.row] = demonId;
        placements.push({
          ...pos,
          symbol: demonId,
          type: "demon",
          guaranteed: true,
          firstActionGuarantee: true
        });
        occupied.add(key);
        break;
      }
    }

    const gargoyleChance = this.normalizeProbability(gargoyleConfig?.chance, 0);
    let gargoyleTriggered = false;
    let gargoyleTargetCount = 0;
    let gargoyleSpawnedCount = 0;
    if (gargoyleChance > 0 && this.rollChance(gargoyleChance)) {
      gargoyleTriggered = true;
      const minGargoyles = Math.max(0, Math.floor(Number(gargoyleConfig?.minGargoyles ?? 1) || 1));
      const maxGargoyles = Math.max(minGargoyles, Math.floor(Number(gargoyleConfig?.maxGargoyles ?? minGargoyles) || minGargoyles));
      gargoyleTargetCount = maxGargoyles <= minGargoyles
        ? minGargoyles
        : (minGargoyles + Math.floor(Math.random() * (maxGargoyles - minGargoyles + 1)));
    }
    if (gargoyleTargetCount > 0) {
      let remainingGargoyles = gargoyleTargetCount;
      for (const pos of randomCandidates) {
        if (remainingGargoyles <= 0) break;
        const key = `${pos.reel},${pos.row}`;
        if (occupied.has(key)) continue;
        reels[pos.reel][pos.row] = gargoyleDemonId;
        placements.push({
          ...pos,
          symbol: gargoyleDemonId,
          type: "gargoyleDemon",
          guaranteed: false,
          gargoyleInjected: true
        });
        occupied.add(key);
        gargoyleSpawnedCount++;
        remainingGargoyles--;
      }
    }

    const guaranteedMultiplierKeys = new Set();
    const guaranteedNormalKeys = new Set();
    const gargoyleKeys = new Set();
    placements.forEach((entry) => {
      const key = `${entry.reel},${entry.row}`;
      if (entry.type === "gargoyleDemon") {
        gargoyleKeys.add(key);
      }
      if (entry.guaranteed !== true) return;
      if (entry.type === "multiplierDemon") guaranteedMultiplierKeys.add(key);
      if (entry.type === "demon") {
        guaranteedNormalKeys.add(key);
      }
    });

    const randomMultiplierChance = Number(bonusConfig?.loot?.multiplierDemonSpawnChance ?? 0.1);
    for (let i = 0; i < placements.length; i++) {
      const entry = placements[i];
      const key = `${entry.reel},${entry.row}`;
      if (guaranteedMultiplierKeys.has(key) || guaranteedNormalKeys.has(key) || gargoyleKeys.has(key)) continue;
      if (this.rollChance(randomMultiplierChance)) {
        reels[entry.reel][entry.row] = multiplierDemonId;
        entry.symbol = multiplierDemonId;
        entry.type = "multiplierDemon";
      }
    }

    const bossChance = Number(bonusConfig?.boss?.spawnChanceByAction?.[executedAction] ?? 0);
    if (placements.length > 0 && this.rollChance(bossChance)) {
      const nonGuaranteedPlacements = placements.filter((entry) => {
        const key = `${entry.reel},${entry.row}`;
        return !guaranteedMultiplierKeys.has(key) && !guaranteedNormalKeys.has(key) && !gargoyleKeys.has(key);
      });
      if (nonGuaranteedPlacements.length > 0) {
        const bossTarget = nonGuaranteedPlacements[Math.floor(Math.random() * nonGuaranteedPlacements.length)];
        reels[bossTarget.reel][bossTarget.row] = bossDemonId;
        bossTarget.symbol = bossDemonId;
        bossTarget.type = "bossDemon";
        bonusState.bossEventsThisAction.push({
          type: "spawn",
          reel: bossTarget.reel,
          row: bossTarget.row,
          symbol: bossDemonId
        });
      }
    }

    const rippleInjections = placements
      .slice()
      .sort((a, b) => (a.reel + a.row) - (b.reel + b.row) || a.row - b.row || a.reel - b.reel)
      .map((entry) => ({
        reel: entry.reel,
        row: entry.row,
        symbol: entry.symbol,
        type: entry.type,
        portalInjected: entry.portalInjected === true,
        guaranteed: entry.guaranteed === true,
        clusterCenter: entry.clusterCenter || null
      }));

    bonusState.rippleInjectionsThisAction = rippleInjections;
    bonusState.demonWaveThisAction = {
      action: actionWaveKey,
      mode: demonWaveModeEnabled ? "spinEvent" : "perSlot",
      triggered: demonWaveTriggered === true,
      chance: Number(demonWaveChance.toFixed ? demonWaveChance.toFixed(4) : demonWaveChance),
      randomDemonsTargeted: Math.max(0, Math.floor(Number(demonWaveTargetCount) || 0)),
      gargoyleInjectionTriggered: gargoyleTriggered === true,
      gargoylesTargeted: Math.max(0, Math.floor(Number(gargoyleSpawnedCount) || 0)),
      portalDemonsTargeted: guaranteedNormalDemons + guaranteedMultiplierDemons,
      firstActionForcedGuarantee: isFirstBonusAction && placements.some((entry) => entry?.firstActionGuarantee === true),
      totalDemonsSpawned: rippleInjections.length,
      freerespinChain: chain,
      suppressedByChain: demonWaveSuppressedByChain === true
    };
    return { reels, rippleInjections };
  }

  buildEmptyHeavenHellBoard(gameState) {
    const reels = {};
    for (let reel = 0; reel < this.width; reel++) {
      reels[reel] = [];
      for (let row = 0; row < this.height; row++) {
        reels[reel][row] = this.isHouse(reel, row) ? "HOUSE" : 0;
      }
    }
    if (gameState?.heroPosition) {
      const r = Number(gameState.heroPosition.reel);
      const row = Number(gameState.heroPosition.row);
      if (Number.isFinite(r) && Number.isFinite(row) && reels?.[r]) {
        reels[r][row] = serverConfig.symbolsMapping?.hero || 10;
      }
    }
    return reels;
  }

  ensureAbilityRtpData(gameState) {
    if (!gameState.rtpData || typeof gameState.rtpData !== "object") {
      gameState.rtpData = {};
    }
    if (!gameState.rtpData.abilityContributionTBM || typeof gameState.rtpData.abilityContributionTBM !== "object") {
      gameState.rtpData.abilityContributionTBM = {
        divineX: 0,
        divineStrike: 0,
        divineCharge: 0,
        baseHunt: 0,
        other: 0
      };
    }
    if (!gameState.rtpData.abilityProcCounts || typeof gameState.rtpData.abilityProcCounts !== "object") {
      gameState.rtpData.abilityProcCounts = {
        divineX: 0,
        divineStrike: 0,
        divineCharge: 0
      };
    }
    return gameState.rtpData;
  }

  normalizeAbilityRtpSource(rawSource = "") {
    const source = String(rawSource || "").trim();
    if (source === "divineX" || source === "divineStrike" || source === "divineCharge" || source === "baseHunt") {
      return source;
    }
    if (source === "demon") {
      return "baseHunt";
    }
    return "other";
  }

  recordAbilityProc(gameState, abilityType) {
    const rtpData = this.ensureAbilityRtpData(gameState);
    const key = this.normalizeAbilityRtpSource(abilityType);
    if (key === "divineX" || key === "divineStrike" || key === "divineCharge") {
      rtpData.abilityProcCounts[key] = Number(rtpData.abilityProcCounts[key] || 0) + 1;
    }
  }

  allocateHeavenHellCollectRtpBySource(gameState, totalTbm, drops = []) {
    const rtpData = this.ensureAbilityRtpData(gameState);
    if (!(Number(totalTbm) > 0)) return;

    const sourceBase = {};
    let totalBase = 0;
    drops.forEach((drop) => {
      const source = this.normalizeAbilityRtpSource(drop?.source);
      const base = Number(drop?.baseValue ?? drop?.value ?? 0);
      if (!(base > 0)) return;
      sourceBase[source] = (sourceBase[source] || 0) + base;
      totalBase += base;
    });

    if (totalBase > 0) {
      Object.entries(sourceBase).forEach(([source, base]) => {
        rtpData.abilityContributionTBM[source] =
          Number(rtpData.abilityContributionTBM[source] || 0) + (base / totalBase) * totalTbm;
      });
      return;
    }

    rtpData.abilityContributionTBM.other = Number(rtpData.abilityContributionTBM.other || 0) + totalTbm;
  }

  resolveHeavenHellLootDrops(gameState, killEntries = [], { guaranteed = false, lootMultiplier = 1 } = {}) {
    if (!gameState || !Array.isArray(killEntries) || killEntries.length === 0) return [];
    const heavenHell = this.ensureHeavenHellState(gameState);
    if (!heavenHell) return [];
    const bonusState = heavenHell.bonus;
    const lootConfig = this.getHeavenHellConfig()?.bonus?.loot || {};
    const baseDropChance = Number(lootConfig?.baseDropChance ?? 0.3);
    const bossDropFactor = Math.max(1, Math.floor(Number(lootConfig?.bossDropFactor ?? 1) || 1));
    const drops = [];

    killEntries.forEach((entry) => {
      const shouldDrop = guaranteed || entry?.guaranteedLoot === true || this.rollChance(baseDropChance);
      if (!shouldDrop) return;
      const tableKey = this.getHeavenHellLootTableKey(entry, lootConfig);
      const valueEntries = this.getHeavenHellLootTableEntries(tableKey, lootConfig);
      const dropRollCount = entry?.isBoss === true ? bossDropFactor : 1;
      const pieceMultiplier = Math.max(
        1,
        Math.floor(Number(entry?.lootMultiplier ?? lootMultiplier ?? 1) || 1)
      );
      const totalScatterCount = dropRollCount * pieceMultiplier;
      let scatterIndex = 0;

      for (let rollIndex = 0; rollIndex < dropRollCount; rollIndex++) {
        const selectedEntry = this.pickWeightedEntry(valueEntries);
        const resolvedDrop = this.resolveHeavenHellLootDropSelection(selectedEntry, lootConfig);
        const amount = Number(resolvedDrop?.baseValue || 0);
        if (!(amount > 0)) continue;

        for (let pieceIndex = 0; pieceIndex < pieceMultiplier; pieceIndex++) {
          const offsets = this.getHeavenHellLootScatterOffsets(entry, scatterIndex, totalScatterCount);
          const drop = {
            reel: Number(entry?.reel),
            row: Number(entry?.row),
            baseValue: amount,
            value: amount,
            lootKind: resolvedDrop?.lootType || null,
            lootType: resolvedDrop?.lootType || null,
            lootId: resolvedDrop?.lootId ?? null,
            source: entry?.source || "demon",
            isBoss: entry?.isBoss === true,
            lootTableKey: tableKey,
            pieceMultiplier: totalScatterCount,
            offsetX: offsets.offsetX,
            offsetY: offsets.offsetY
          };
          bonusState.lootGround.push(drop);
          drops.push(drop);
          scatterIndex += 1;
        }
      }
    });

    return drops;
  }

  buildHeavenHellDivineXTargets(originReel, originRow, distance = 0) {
    const targets = [];
    const maxDistance = Math.max(0, Math.floor(Number(distance) || 0));
    if (!Number.isFinite(Number(originReel)) || !Number.isFinite(Number(originRow)) || maxDistance <= 0) {
      return targets;
    }

    for (let wave = 1; wave <= maxDistance; wave++) {
      const candidates = [
        { reel: originReel - wave, row: originRow - wave },
        { reel: originReel + wave, row: originRow - wave },
        { reel: originReel - wave, row: originRow + wave },
        { reel: originReel + wave, row: originRow + wave }
      ];
      candidates.forEach((target) => {
        if (
          target.reel < 0 ||
          target.reel >= this.width ||
          target.row < 0 ||
          target.row >= this.height
        ) {
          return;
        }
        // Keep house-center cells in the payload so the client can render
        // Divine X through the middle even though demons never spawn there.
        targets.push({ ...target, wave });
      });
    }
    return targets;
  }

  buildHeavenHellDivineStrikeCells(originReel, originRow, radius = 0) {
    const targets = [];
    const maxRadius = Math.max(0, Math.floor(Number(radius) || 0));
    if (!Number.isFinite(Number(originReel)) || !Number.isFinite(Number(originRow))) {
      return targets;
    }

    for (let reel = originReel - maxRadius; reel <= originReel + maxRadius; reel++) {
      for (let row = originRow - maxRadius; row <= originRow + maxRadius; row++) {
        if (
          reel < 0 ||
          reel >= this.width ||
          row < 0 ||
          row >= this.height
        ) {
          continue;
        }
        // Include house cells for VFX reach markers / impact visuals.
        // Combat resolution still won't kill anything there because the
        // house symbol is not treated as a demon.
        targets.push({
          reel,
          row,
          distance: Math.max(Math.abs(reel - originReel), Math.abs(row - originRow))
        });
      }
    }
    return targets;
  }

  annotateHeavenHellHuntAbilities(gameState, huntResult, preHuntReels = null) {
    const heavenHell = this.ensureHeavenHellState(gameState);
    const bonusState = heavenHell?.bonus;
    if (!bonusState || !huntResult || gameState?.isBonus !== true) {
      return { divineAbilityExtraKills: [], preKilledKeys: new Set() };
    }

    const bonusConfig = this.getHeavenHellConfig()?.bonus || {};
    const {
      multiplierDemonId,
      bossDemonId,
      gargoyleDemonId
    } = this.getHeavenHellSymbolIds();
    const gargoyleFleeDistance = Math.max(
      0,
      Math.floor(Number(this.getHeavenHellGargoyleConfig()?.fleeDistance ?? 2) || 2)
    );
    const weightedBossKills = Math.max(1, Math.floor(Number(bonusConfig?.boss?.killsGranted ?? 9) || 9));
    const divineXKillCountMultiplier = 2;
    const divineStrikeLevel = Math.max(0, Math.floor(Number(bonusState?.abilities?.divineStrike || 0)));
    const divineXLevel = Math.max(0, Math.floor(Number(bonusState?.abilities?.divineX || 0)));
    const chargeLevel = Math.max(0, Math.floor(Number(bonusState?.abilities?.divineCharge || 0)));
    const divineStrikeConfig = bonusConfig?.abilityProc?.divineStrike?.[String(divineStrikeLevel)] || null;
    const divineXConfig = bonusConfig?.abilityProc?.divineX?.[String(divineXLevel)] || null;
    const chargeConfig = bonusConfig?.abilityProc?.divineCharge?.[String(chargeLevel)] || null;

    const board = JSON.parse(JSON.stringify(preHuntReels && typeof preHuntReels === "object" ? preHuntReels : {}));
    const killedKeys = new Set();
    const removedKeys = new Set();
    const escapedKeys = new Set();
    const abilityProcs = [];
    const divineAbilityExtraKills = [];
    const preKilledKeys = new Set();
    const heroPath = Array.isArray(huntResult.heroPath) ? huntResult.heroPath : [];

    const getSymbolAt = (reel, row) => Number(board?.[reel]?.[row]);
    const markRemoved = (reel, row, set) => {
      const key = `${reel},${row}`;
      set.add(key);
      removedKeys.add(key);
      if (board?.[reel]) board[reel][row] = 0;
      return key;
    };
    const markKilled = (reel, row) => {
      const key = `${reel},${row}`;
      if (killedKeys.has(key)) return false;
      markRemoved(reel, row, killedKeys);
      return true;
    };
    const getStepBananaTargets = (step) => (
      Array.isArray(step?.eatenBananas) && step.eatenBananas.length > 0
        ? step.eatenBananas
        : [{ reel: step?.reel, row: step?.row }]
    );
    const markStepCombatPreResolved = (step, targets = [], reason = "ability") => {
      step.combatPreResolved = true;
      step.preResolvedReason = reason;
      step.abilityPreKilled = true;
      step.banana = false;
      step.orbs = 0;
      step.eatenBananas = [];
      targets.forEach((banana) => {
        const reel = Number(banana?.reel);
        const row = Number(banana?.row);
        if (!Number.isFinite(reel) || !Number.isFinite(row)) return;
        preKilledKeys.add(`${reel},${row}`);
      });
    };
    const getTriggeredKillCellsForStep = (step) => {
      const keys = this.collectHeavenHellStepAttackKillKeys(step);
      return Array.from(keys).map((key) => {
        const [reel, row] = key.split(",").map((value) => Math.floor(Number(value)));
        return { key, reel, row };
      }).filter((cell) => Number.isFinite(cell.reel) && Number.isFinite(cell.row));
    };
    const resolveStepGargoyleEscapes = (step) => {
      if (gargoyleFleeDistance <= 0) return [];
      const triggeredBy = getTriggeredKillCellsForStep(step);
      if (triggeredBy.length === 0) return [];

      const escapes = [];
      for (let reel = 0; reel < this.width; reel++) {
        for (let row = 0; row < this.height; row++) {
          const symbol = getSymbolAt(reel, row);
          if (symbol !== gargoyleDemonId) continue;
          const killMatches = triggeredBy.filter((cell) => (
            Math.max(Math.abs(cell.reel - reel), Math.abs(cell.row - row)) <= gargoyleFleeDistance
          ));
          if (killMatches.length === 0) continue;
          markRemoved(reel, row, escapedKeys);
          escapes.push({
            reel,
            row,
            symbol,
            triggeredBy: killMatches.map((cell) => ({ reel: cell.reel, row: cell.row }))
          });
        }
      }
      if (escapes.length > 0) {
        step.gargoyleEscapesAfterStep = escapes;
      }
      return escapes;
    };

    heroPath.forEach((step, pathIndex) => {
      if (step?.banana !== true) return;

      const bananaTargets = getStepBananaTargets(step);
      const allPreKilled = bananaTargets.every((banana) => {
        const reel = Number(banana?.reel);
        const row = Number(banana?.row);
        if (!Number.isFinite(reel) || !Number.isFinite(row)) return true;
        return removedKeys.has(`${reel},${row}`);
      });
      if (allPreKilled) {
        const preResolvedReason = bananaTargets.some((banana) => (
          escapedKeys.has(`${Number(banana?.reel)},${Number(banana?.row)}`)
        ))
          ? "gargoyleEscape"
          : "ability";
        markStepCombatPreResolved(step, bananaTargets, preResolvedReason);
        return;
      }

      let chargeLootMultiplier = 1;
      if (chargeLevel > 0 && chargeConfig && this.rollChance(Number(chargeConfig?.chance ?? 0))) {
        chargeLootMultiplier = Math.max(1, Math.floor(Number(chargeConfig?.lootMultiplier ?? 1) || 1));
        step.divineChargeProc = true;
        step.divineChargeLootMultiplier = chargeLootMultiplier;
        abilityProcs.push({
          type: "divineCharge",
          pathIndex,
          level: chargeLevel,
          reel: Number(step.reel),
          row: Number(step.row),
          lootMultiplier: chargeLootMultiplier
        });
      }

      bananaTargets.forEach((banana) => {
        const reel = Number(banana?.reel);
        const row = Number(banana?.row);
        if (!Number.isFinite(reel) || !Number.isFinite(row)) return;
        markKilled(reel, row);
      });

      const originReel = Number(step.reel);
      const originRow = Number(step.row);
      const divineStrikeProc =
        divineStrikeLevel > 0 &&
        divineStrikeConfig &&
        Number.isFinite(originReel) &&
        Number.isFinite(originRow) &&
        this.rollChance(Number(divineStrikeConfig?.chance ?? 0));
      const divineXProc =
        divineXLevel > 0 &&
        divineXConfig &&
        Number.isFinite(originReel) &&
        Number.isFinite(originRow) &&
        this.rollChance(Number(divineXConfig?.chance ?? 0));
      const divineXDistance = divineXProc
        ? Math.max(0, Math.floor(Number(divineXConfig?.distance ?? 0) || 0))
        : 0;
      const divineStrikeRadius = divineStrikeProc
        ? Math.max(0, Math.floor(Number(divineStrikeConfig?.radius ?? 0) || 0))
        : 0;
      const divineXTargets = divineXProc
        ? this.buildHeavenHellDivineXTargets(originReel, originRow, divineXDistance)
        : [];
      const divineStrikeTargets = [];
      let strikeOrigins = [];

      if (divineStrikeProc) {
        step.divineStrikeProc = true;
        strikeOrigins = [
          { reel: originReel, row: originRow, wave: 0, center: true },
          ...(divineXProc ? divineXTargets.map((target) => ({
            reel: target.reel,
            row: target.row,
            wave: target.wave,
            center: false
          })) : [])
        ];
        strikeOrigins.forEach((originTarget) => {
          const hitCells = this.buildHeavenHellDivineStrikeCells(
            originTarget.reel,
            originTarget.row,
            divineStrikeRadius
          ).map((cell) => {
            const symbol = getSymbolAt(cell.reel, cell.row);
            const isOriginCell = cell.reel === originTarget.reel && cell.row === originTarget.row;
            const hadDemon =
              isOriginCell && originTarget.center === true
                ? true
                : this.isDemon(symbol);
            let killed = false;
            if (this.isDemon(symbol)) {
              killed = markKilled(cell.reel, cell.row);
            }
            const isDivineXOriginCellKill = divineXProc === true && isOriginCell;
            const isPrimaryImpactCell = isOriginCell && originTarget.center === true;
            const countsAsDivineXDoubleKill =
              divineXProc === true &&
              (killed || (hadDemon === true && isPrimaryImpactCell));
            if (killed) {
              divineAbilityExtraKills.push({
                reel: cell.reel,
                row: cell.row,
                symbol,
                source: isDivineXOriginCellKill ? "divineX" : "divineStrike",
                isBoss: symbol === bossDemonId,
                isMultiplierDemon: symbol === multiplierDemonId,
                isGargoyleDemon: symbol === gargoyleDemonId,
                weightedKills: symbol === bossDemonId ? weightedBossKills : 1,
                killCountMultiplier: 1,
                divineXDoubleKill: false,
                guaranteedLoot: true,
                lootMultiplier: step.divineChargeProc === true ? chargeLootMultiplier : 1
              });
            }
            return {
              reel: cell.reel,
              row: cell.row,
              distance: cell.distance,
              hadDemon,
              killed,
              origin: isOriginCell,
              killCountMultiplier: countsAsDivineXDoubleKill ? divineXKillCountMultiplier : 1,
              divineXDoubleKill: countsAsDivineXDoubleKill,
              isMultiplierDemon: killed && symbol === multiplierDemonId
            };
          });
          divineStrikeTargets.push({
            reel: originTarget.reel,
            row: originTarget.row,
            wave: originTarget.wave,
            center: originTarget.center,
            hitCells
          });
        });
        step.divineStrikeTargets = divineStrikeTargets;
        abilityProcs.push({
          type: "divineStrike",
          pathIndex,
          level: divineStrikeLevel,
          reel: originReel,
          row: originRow,
          radius: divineStrikeRadius,
          targets: divineStrikeTargets
        });
        this.resolveHeavenHellPentagramTargetHits(gameState, {
          pathIndex,
          ability: "divineStrike",
          targets: this.collectHeavenHellDivineStrikePentagramTargets(divineStrikeTargets)
        });
      }

      if (divineXProc) {
        step.divineXProc = true;
        const xTargetEntries = divineXTargets.map((target) => {
          const linkedStrikeTarget = divineStrikeTargets.find((entry) => (
            entry.reel === target.reel && entry.row === target.row
          ));
          if (linkedStrikeTarget) {
            const originHit = linkedStrikeTarget.hitCells.find((cell) => cell.origin === true);
            return {
              reel: target.reel,
              row: target.row,
              wave: target.wave,
              hadDemon: originHit?.hadDemon === true,
              killed: originHit?.killed === true,
              killCountMultiplier: Math.max(1, Math.floor(Number(originHit?.killCountMultiplier ?? 1) || 1)),
              divineXDoubleKill: originHit?.divineXDoubleKill === true,
              isMultiplierDemon: originHit?.isMultiplierDemon === true
            };
          }

          const symbol = getSymbolAt(target.reel, target.row);
          const hadDemon = this.isDemon(symbol);
          let killed = false;
          if (hadDemon) {
            killed = markKilled(target.reel, target.row);
          }
          if (killed) {
            divineAbilityExtraKills.push({
              reel: target.reel,
              row: target.row,
              symbol,
              source: "divineX",
              isBoss: symbol === bossDemonId,
              isMultiplierDemon: symbol === multiplierDemonId,
              isGargoyleDemon: symbol === gargoyleDemonId,
              weightedKills: symbol === bossDemonId ? weightedBossKills : 1,
              killCountMultiplier: 1,
              divineXDoubleKill: false,
              guaranteedLoot: true,
              lootMultiplier: step.divineChargeProc === true ? chargeLootMultiplier : 1
            });
          }
          return {
            reel: target.reel,
            row: target.row,
            wave: target.wave,
            hadDemon,
            killed,
            killCountMultiplier: killed && divineXProc === true ? divineXKillCountMultiplier : 1,
            divineXDoubleKill: killed && divineXProc === true,
            isMultiplierDemon: killed && symbol === multiplierDemonId
          };
        });
        step.divineXTargets = xTargetEntries;
        abilityProcs.push({
          type: "divineX",
          pathIndex,
          level: divineXLevel,
          distance: divineXDistance,
          originReel,
          originRow,
          targets: xTargetEntries,
          killCells: xTargetEntries.filter((entry) => entry.killed === true)
        });
        this.resolveHeavenHellPentagramTargetHits(gameState, {
          pathIndex,
          ability: "divineX",
          targets: xTargetEntries
        });
      }

      resolveStepGargoyleEscapes(step);
    });

    divineAbilityExtraKills.forEach((entry) => {
      if (huntResult.reels?.[entry.reel]) {
        huntResult.reels[entry.reel][entry.row] = 0;
      }
    });
    escapedKeys.forEach((key) => {
      const [reel, row] = key.split(",").map((value) => Math.floor(Number(value)));
      if (huntResult.reels?.[reel]) {
        huntResult.reels[reel][row] = 0;
      }
    });

    if (preKilledKeys.size > 0 && Array.isArray(huntResult.orbDrops)) {
      huntResult.orbDrops = huntResult.orbDrops.filter((orb) => (
        !preKilledKeys.has(`${Number(orb?.reel)},${Number(orb?.row)}`)
      ));
    }

    this.pruneWrathPreKilledHuntPath(huntResult, gameState);

    abilityProcs.forEach((proc) => {
      if (proc?.type === "divineX" || proc?.type === "divineStrike" || proc?.type === "divineCharge") {
        this.recordAbilityProc(gameState, proc.type);
      }
    });
    bonusState.abilityProcsThisAction = abilityProcs;
    return { divineAbilityExtraKills, preKilledKeys };
  }

  pruneWrathPreKilledHuntPath(huntResult, gameState = null) {
    const path = Array.isArray(huntResult?.heroPath) ? huntResult.heroPath : [];
    if (!path.some((step) => step?.abilityPreKilled === true)) return;

    huntResult.heroPath = path.filter((step) => step?.abilityPreKilled !== true);
    if (huntResult.heroPath.length === 0) return;

    const lastStep = huntResult.heroPath[huntResult.heroPath.length - 1];
    const finalPos = {
      reel: Number(lastStep?.reel),
      row: Number(lastStep?.row)
    };
    if (!Number.isFinite(finalPos.reel) || !Number.isFinite(finalPos.row)) return;

    huntResult.heroFinalPosition = finalPos;
    const footprintSize = Math.max(
      1,
      Math.floor(
        Number(
          lastStep?.footprintSize ||
            huntResult.heroFinalFootprintSize ||
            gameState?.heroFootprintSize ||
            1
        ) || 1
      )
    );
    huntResult.heroFinalFootprintSize = footprintSize;
    if (huntResult.reels) {
      this.stampHeroFootprintOnReels(huntResult.reels, finalPos, footprintSize);
    }
  }

  processHeavenHellPostHunt(gameState, huntResult, sourceReels = null, { isBonus = false } = {}) {
    if (!gameState || !huntResult || !this.isHeavenHellEnabled()) {
      return { totalKills: 0, weightedKills: 0, lootDrops: [] };
    }
    const heavenHell = this.ensureHeavenHellState(gameState);
    const bonusState = heavenHell?.bonus;
    const bonusConfig = this.getHeavenHellConfig()?.bonus || {};
    const { multiplierDemonId, bossDemonId, gargoyleDemonId } = this.getHeavenHellSymbolIds();
    const weightedBossKills = Math.max(1, Math.floor(Number(bonusConfig?.boss?.killsGranted ?? 9) || 9));
    const bossMultiplierGain = Math.max(0, Math.floor(Number(bonusConfig?.boss?.multiplierGain ?? 2) || 2));
    const portalBonusSpawn = bonusConfig?.portalBonusSpawn || {};
    const hasPortalBonus = bonusState?.portalBonus === true;
    const baseMultiplierDemonGain = Math.max(
      1,
      Math.floor(Number(bonusConfig?.multiplierDemon?.multiplierGain ?? 1) || 1)
    );
    const multiplierDemonGain = hasPortalBonus
      ? Math.max(
          1,
          Math.floor(Number(portalBonusSpawn?.multiplierGainPerKill ?? baseMultiplierDemonGain) || baseMultiplierDemonGain)
        )
      : baseMultiplierDemonGain;

    const killed = new Map();
    const abilityGuaranteedKillBoosts = new Map();
    const source = sourceReels && typeof sourceReels === "object" ? sourceReels : {};
    let divineAbilityExtraKills = [];
    if (isBonus) {
      const abilityResult = this.annotateHeavenHellHuntAbilities(gameState, huntResult, source);
      divineAbilityExtraKills = abilityResult.divineAbilityExtraKills || [];

      const heroPath = Array.isArray(huntResult.heroPath) ? huntResult.heroPath : [];
      heroPath.forEach((step) => {
        const bananaTargets =
          Array.isArray(step?.eatenBananas) && step.eatenBananas.length > 0
            ? step.eatenBananas
            : [{ reel: step?.reel, row: step?.row }];
        const hasGuaranteedLootProc =
          step?.banana === true &&
          (step?.divineChargeProc === true || step?.divineStrikeProc === true || step?.divineXProc === true);
        const chargeLootMultiplier = step?.divineChargeProc === true
          ? Math.max(1, Math.floor(Number(step?.divineChargeLootMultiplier ?? 1) || 1))
          : 1;
        bananaTargets.forEach((banana) => {
          const reel = Number(banana?.reel);
          const row = Number(banana?.row);
          if (!Number.isFinite(reel) || !Number.isFinite(row)) return;
          const key = `${reel},${row}`;
          if (hasGuaranteedLootProc) {
            const abilitySource = step?.divineChargeProc === true
              ? "divineCharge"
              : step?.divineStrikeProc === true
                ? "divineStrike"
                : "divineX";
            const existingBoost = abilityGuaranteedKillBoosts.get(key);
            if (!existingBoost || chargeLootMultiplier > existingBoost.lootMultiplier) {
              abilityGuaranteedKillBoosts.set(key, {
                guaranteedLoot: true,
                lootMultiplier: chargeLootMultiplier,
                source: abilitySource
              });
            } else if (!existingBoost.source) {
              abilityGuaranteedKillBoosts.set(key, {
                ...existingBoost,
                source: abilitySource
              });
            }
          }
        });
      });
    }
    (huntResult.orbDrops || []).forEach((orb) => {
      const key = `${orb.reel},${orb.row}`;
      if (killed.has(key)) return;
      const symbol = source?.[orb.reel]?.[orb.row];
      killed.set(key, {
        reel: Number(orb.reel),
        row: Number(orb.row),
        symbol,
        source: "baseHunt"
      });
    });

    const killEntries = Array.from(killed.values()).map((entry) => {
      const symbol = Number(entry.symbol);
      const isBoss = symbol === bossDemonId;
      const isMultiplierDemon = symbol === multiplierDemonId;
      const isGargoyleDemon = symbol === gargoyleDemonId;
      const killKey = `${Number(entry.reel)},${Number(entry.row)}`;
      const abilityBoost = abilityGuaranteedKillBoosts.get(killKey);
      return {
        ...entry,
        symbol,
        isBoss,
        isMultiplierDemon,
        isGargoyleDemon,
        weightedKills: isBoss ? weightedBossKills : 1,
        killCountMultiplier: 1,
        divineXDoubleKill: false,
        lootMultiplier: abilityBoost?.lootMultiplier ?? 1,
        guaranteedLoot: abilityBoost?.guaranteedLoot === true,
        source: abilityBoost?.source ?? entry.source
      };
    });

    if (isBonus) {
      const divineAbilityKillKeys = new Set(
        divineAbilityExtraKills.map((entry) => `${Number(entry?.reel)},${Number(entry?.row)}`)
      );
      const dedupedKillEntries = killEntries.filter((entry) => {
        const key = `${Number(entry?.reel)},${Number(entry?.row)}`;
        return !(entry?.source === "baseHunt" && divineAbilityKillKeys.has(key));
      });
      killEntries.length = 0;
      killEntries.push(...dedupedKillEntries, ...divineAbilityExtraKills);
      const heroPath = Array.isArray(huntResult.heroPath) ? huntResult.heroPath : [];
      this.applyHeavenHellChargeLootFromPath(heroPath, killEntries);
      this.applyHeavenHellDivineXKillCreditFromPath(heroPath, killEntries);
      killEntries.forEach((entry) => {
        this.normalizeHeavenHellKillEntryCredit(entry, { weightedBossKills });
      });
      const uniqueKillEntries = this.dedupeHeavenHellKillEntries(killEntries);
      killEntries.length = 0;
      killEntries.push(...uniqueKillEntries);
    } else if (bonusState) {
      bonusState.abilityProcsThisAction = [];
    }

    let weightedKills = 0;
    killEntries.forEach((entry) => {
      weightedKills += Math.max(1, Math.floor(Number(entry.weightedKills) || 1));
      if (isBonus && entry.isMultiplierDemon && this.canHeavenHellMultiplierDemonProcFromKill(entry)) {
        bonusState.globalMultiplier += multiplierDemonGain;
      }
      if (isBonus && entry.isBoss) {
        bonusState.globalMultiplier += bossMultiplierGain;
      }
    });
    if (isBonus) {
      this.finalizeHeavenHellPentagramCompletionReward(gameState);
    }

    const lootDrops = isBonus
      ? this.resolveHeavenHellLootDrops(gameState, killEntries, { guaranteed: false, lootMultiplier: 1 })
      : [];
    const chestDrops = isBonus
      ? this.resolveHeavenHellChestDrops(gameState, killEntries)
      : [];
    if (isBonus) {
      this.applyHeavenHellChestDropsToPath(huntResult?.heroPath || [], chestDrops);
    }

    if (isBonus) {
      bonusState.killsThisAction = killEntries.length;
      bonusState.killsTotal += weightedKills;
      gameState.multiplier = Math.max(1, Math.floor(Number(bonusState.globalMultiplier) || 1));

      const unlockCfg = bonusConfig?.abilityUnlock || {};
      const killsPerUnlock = Math.max(1, Math.floor(Number(unlockCfg?.killsPerUnlock ?? 20) || 20));
      bonusState.nextAbilityKillThreshold = killsPerUnlock;
      bonusState.killsTowardsUnlockAtActionStart = Math.max(
        0,
        Math.floor(Number(bonusState.killsTowardsUnlock) || 0)
      );
      bonusState.killsTowardsUnlock = bonusState.killsTowardsUnlockAtActionStart + weightedKills;
      bonusState.killsTowardsUnlockBeforeSettlement = bonusState.killsTowardsUnlock;
      bonusState.killMeterSettledThisAction = false;
    }

    return {
      totalKills: killEntries.length,
      weightedKills,
      killEntries,
      lootDrops,
      chestDrops
    };
  }

  settleHeavenHellKillMeterUnlocks(gameState) {
    if (!gameState || !this.isHeavenHellEnabled() || gameState.isBonus !== true) {
      return { unlockCount: 0, freespinsAwarded: 0 };
    }

    const heavenHell = this.ensureHeavenHellState(gameState);
    const bonusState = heavenHell?.bonus;
    if (!bonusState || bonusState.killMeterSettledThisAction === true) {
      return { unlockCount: 0, freespinsAwarded: 0 };
    }

    const bonusConfig = this.getHeavenHellConfig()?.bonus || {};
    const unlockCfg = bonusConfig?.abilityUnlock || {};
    const killsPerUnlock = Math.max(1, Math.floor(Number(unlockCfg?.killsPerUnlock ?? 20) || 20));
    const freespinsPerUnlock = Math.max(0, Math.floor(Number(unlockCfg?.freespinsAwardedPerUnlock ?? 2) || 2));
    const maxFreespinsCapRaw = Number(bonusConfig?.maxFreespinsCap ?? 60);
    const hasFreespinCap = Number.isFinite(maxFreespinsCapRaw) && maxFreespinsCapRaw > 0;

    bonusState.nextAbilityKillThreshold = killsPerUnlock;
    if (!Number.isFinite(Number(bonusState.killsTowardsUnlockBeforeSettlement))) {
      bonusState.killsTowardsUnlockBeforeSettlement = Math.max(
        0,
        Math.floor(Number(bonusState.killsTowardsUnlock) || 0)
      );
    }

    let unlockCount = 0;
    let freespinsAwarded = 0;

    while (bonusState.killsTowardsUnlock >= killsPerUnlock) {
      const meterBeforeReset = bonusState.killsTowardsUnlock;
      bonusState.killsTowardsUnlock -= killsPerUnlock;
      const unlockEvent = this.unlockRandomHeavenHellAbility(gameState, { entry: false });
      if (unlockEvent) {
        bonusState.abilityProcsThisAction.push({
          type: "abilityUnlock",
          meterBeforeReset,
          meterAfterReset: bonusState.killsTowardsUnlock,
          threshold: killsPerUnlock,
          freespinsAwarded: freespinsPerUnlock,
          ...unlockEvent
        });
      } else {
        bonusState.abilityProcsThisAction.push({
          type: "abilityReward",
          meterBeforeReset,
          meterAfterReset: bonusState.killsTowardsUnlock,
          threshold: killsPerUnlock,
          freespinsAwarded: freespinsPerUnlock
        });
      }
      unlockCount += 1;
      freespinsAwarded += freespinsPerUnlock;
      const nextFreespins = Math.max(
        0,
        Number(gameState.bonusState.finalFreespins || 0) + freespinsPerUnlock
      );
      gameState.bonusState.finalFreespins = hasFreespinCap
        ? Math.min(Math.floor(maxFreespinsCapRaw), nextFreespins)
        : nextFreespins;
    }

    bonusState.killMeterSettledThisAction = true;
    return { unlockCount, freespinsAwarded };
  }

  settleHeavenHellBonus(gameState, betSize = 0) {
    if (!gameState || !this.isHeavenHellEnabled()) return 0;
    const heavenHell = this.ensureHeavenHellState(gameState);
    const bonusState = heavenHell?.bonus;
    const drops = Array.isArray(bonusState?.lootGround) ? bonusState.lootGround : [];
    const baseLoot = drops.reduce((sum, drop) => sum + Number(drop?.baseValue ?? drop?.value ?? 0), 0);
    const globalMultiplier = Math.max(1, Math.floor(Number(bonusState?.globalMultiplier || 1)));
    const winCapTbm = Number(serverConfig?.wincap);
    const hasWinCap = Number.isFinite(winCapTbm) && winCapTbm > 0;
    const currentRoundTbm = Math.max(0, Number(gameState.tbm || 0));
    let remainingCapTbm = hasWinCap
      ? Math.max(0, Number((winCapTbm - currentRoundTbm).toFixed(4)))
      : Number.POSITIVE_INFINITY;
    const settledDrops = drops.map((drop) => {
      const baseValue = Number(drop?.baseValue ?? drop?.value ?? 0);
      const uncappedSettledValue = baseValue * globalMultiplier;
      const settledValue = hasWinCap
        ? Math.max(0, Math.min(uncappedSettledValue, remainingCapTbm))
        : uncappedSettledValue;
      if (hasWinCap) {
        remainingCapTbm = Math.max(0, Number((remainingCapTbm - settledValue).toFixed(4)));
      }
      return {
        ...drop,
        baseValue,
        value: baseValue,
        collectMultiplier: globalMultiplier,
        settledValue
      };
    });
    const uncappedTotalTbm = baseLoot * globalMultiplier;
    const totalTbm = hasWinCap
      ? Math.max(0, Math.min(uncappedTotalTbm, Math.max(0, winCapTbm - currentRoundTbm)))
      : uncappedTotalTbm;
    const totalTwa = totalTbm * Number(betSize || 0);
    this.allocateHeavenHellCollectRtpBySource(gameState, totalTbm, drops);
    gameState.tbm = Number(gameState.tbm || 0) + totalTbm;
    gameState.twa = Number(gameState.twa || 0) + totalTwa;
    gameState.winAmount = totalTbm;
    gameState.heavenHell.bonus.lootGroundSettled = settledDrops;
    gameState.heavenHell.bonus.lootGround = [];
    gameState.heavenHell.bonus.pendingChests = [];
    gameState.heavenHell.bonus.chestRewardResumeAction = null;
    gameState.multiplier = globalMultiplier;
    this.syncHeavenHellChestCounters(gameState);
    return totalTbm;
  }

  getHeavenHellProjectedCollectTbm(gameState) {
    if (!gameState || !this.isHeavenHellEnabled()) return 0;
    const bonusState = gameState?.heavenHell?.bonus;
    const drops = Array.isArray(bonusState?.lootGround) ? bonusState.lootGround : [];
    if (drops.length === 0) return 0;
    const baseLoot = drops.reduce((sum, drop) => sum + Number(drop?.baseValue ?? drop?.value ?? 0), 0);
    const globalMultiplier = Math.max(1, Math.floor(Number(bonusState?.globalMultiplier || 1)));
    return baseLoot * globalMultiplier;
  }

  forceHeavenHellProjectedWinCapSettlement(gameState) {
    if (!gameState || gameState.isBonus !== true || !this.isHeavenHellEnabled()) return false;
    const winCapTbm = Number(serverConfig?.wincap);
    if (!Number.isFinite(winCapTbm) || winCapTbm <= 0) return false;

    const currentTbm = Math.max(0, Number(gameState.tbm || 0));
    const projectedCollectTbm = this.getHeavenHellProjectedCollectTbm(gameState);
    if ((currentTbm + projectedCollectTbm) < winCapTbm - 0.0001) {
      return false;
    }

    const bonusState = gameState?.heavenHell?.bonus;

    if (bonusState) {
      bonusState.freerespinChain = 0;
      bonusState.winCapForcedEndThisAction = true;
    }

    if (gameState.bonusState && typeof gameState.bonusState === "object") {
      gameState.bonusState.finalFreespins = 0;
    }

    this.settleHeavenHellBonus(gameState, gameState.betSize);
    gameState.isBonus = false;
    gameState.nextAction = "spin";
    return true;
  }

  executeHeavenHellBonusSpawnAction(gameState, betSize = 0) {
    const heavenHell = this.ensureHeavenHellState(gameState);
    const bonusState = heavenHell?.bonus;
    const action = gameState.executedAction;
    const isFreespin = action === "freespin";
    const isFreerespin = action === "freerespin";
    if (!isFreespin && !isFreerespin) return false;

    const bonusConfig = this.getHeavenHellConfig()?.bonus || {};
    heavenHell.bonus.actionCount = Math.max(0, Math.floor(Number(heavenHell.bonus.actionCount || 0) + 1));
    const maxBonusActionsPerRoundRaw = Number(bonusConfig?.maxBonusActionsPerRound ?? 220);
    const hasBonusActionCap = Number.isFinite(maxBonusActionsPerRoundRaw) && maxBonusActionsPerRoundRaw > 0;
    if (hasBonusActionCap && heavenHell.bonus.actionCount > Math.floor(maxBonusActionsPerRoundRaw)) {
      gameState.bonusState.finalFreespins = 0;
      if ((bonusState?.pendingChests?.length || 0) > 0) {
        bonusState.chestRewardResumeAction = "spin";
        gameState.nextAction = "chestreward";
        return true;
      }
      this.settleHeavenHellBonus(gameState, betSize);
      gameState.isBonus = false;
      gameState.nextAction = "spin";
      return true;
    }

    if (isFreespin) {
      gameState.bonusState.finalFreespins = Math.max(0, Number(gameState.bonusState.finalFreespins || 0) - 1);
      heavenHell.bonus.freerespinChain = 0;
    } else {
      heavenHell.bonus.freerespinChain = Math.max(0, Math.floor(Number(heavenHell.bonus.freerespinChain || 0) + 1));
    }

    const boardResult = this.createHeavenHellBoard(gameState, action);
    gameState.reels = boardResult.reels;
    gameState.reelsAfterDrop = boardResult.reels;
    gameState.reelsBeforeDrop = null;
    gameState.dropEvent = {
      direction: "ripple",
      movements: boardResult.rippleInjections.map((entry, index) => ({
        reel: entry.reel,
        to: entry.row,
        symbol: entry.symbol,
        rippleOrder: index
      }))
    };
    gameState.timeSymbols = [];
    gameState.clusters = [];
    gameState.winAmount = 0;
    gameState.heroPosition = gameState.heroPosition || serverConfig.heroStartingPosition || { reel: 4, row: 2 };
    gameState.multiplier = Math.max(1, Math.floor(Number(heavenHell.bonus.globalMultiplier || 1)));

    const hasDemons = boardResult.rippleInjections.length > 0;
    if (hasDemons) {
      gameState.nextAction = ACTION_FREESPIN_BANANA_HUNT;
      return true;
    }

    if ((bonusState?.pendingChests?.length || 0) > 0) {
      bonusState.chestRewardResumeAction = gameState.bonusState.finalFreespins > 0 ? "freerespin" : "spin";
      gameState.nextAction = "chestreward";
      return true;
    }

    if (gameState.bonusState.finalFreespins > 0) {
      gameState.nextAction = "freespin";
    } else {
      this.settleHeavenHellBonus(gameState, betSize);
      gameState.isBonus = false;
      gameState.nextAction = "spin";
    }
    return true;
  }

generateReels(symbolWeightsMain, reelCount = 8, symbolsPerReel = 8, options = {}) {
  const spawnBehaviorMode = options?.spawnBehaviorMode || (options?.isBonus === true ? "bonus" : "base");
  const spawnBehavior = this.getSymbolSpawnBehaviorConfig(spawnBehaviorMode);
  const pairState = this.createReelPairState(reelCount);
  const hasPositiveWeight = Object.values(symbolWeightsMain || {}).some((rawWeight) => Number(rawWeight) > 0);
  if (!hasPositiveWeight) {
    throw new Error('No symbols with positive weight.');
  }

  // Generate reels
  const reels = {};
  for (let reelIndex = 0; reelIndex < reelCount; reelIndex++) {
    const reelSymbols = [];
    for (let rowIndex = 0; rowIndex < symbolsPerReel; rowIndex++) {
      // Place house in center (reels 3-4, rows 3-4)
      if (this.isHouse(reelIndex, rowIndex)) {
        this.resetPairStateForReel(pairState, reelIndex);
        reelSymbols.push('HOUSE');
      } else {
        const symbolId = this.getSpawnSymbolForReel(
          reelIndex,
          symbolWeightsMain,
          pairState,
          {
            allowDemons: false,
            demonChance: 0,
            timeSymbolChance: 0
          },
          spawnBehavior
        );
        reelSymbols.push(Number(symbolId)); // Ensure number type
      }
    }
    reels[reelIndex] = reelSymbols;
  }

  return reels;
}

getAvailableTicketStrategies() {
  const configured = Array.isArray(serverConfig.ticketStrategies) ? serverConfig.ticketStrategies : [];
  const ordered = [...DEFAULT_TICKET_STRATEGIES, ...configured, serverConfig.mathStyle].filter(Boolean);
  const unique = [...new Set(ordered)];

  const available = unique.filter((strategyName) => {
    if (DISABLED_TICKET_STRATEGIES.has(strategyName)) {
      return false;
    }
    const bucket = serverConfig?.[strategyName];
    if (!isPlainObject(bucket)) {
      return false;
    }
    return Object.values(bucket).some(isPositiveNumber);
  });

  return available.length > 0 ? available : ["normal"];
}

resolveTicketStrategy(strategyName) {
  const available = this.getAvailableTicketStrategies();
  if (strategyName && available.includes(strategyName)) {
    return strategyName;
  }
  if (serverConfig.mathStyle && available.includes(serverConfig.mathStyle)) {
    return serverConfig.mathStyle;
  }
  return available[0] || "normal";
}

resolveForcedOutcomeSelection(strategyName) {
  const explicitSelection = parseForcedOutcomeOptionId(strategyName);
  const storedSelection = getForcedOutcomeSelection();
  const forcedSelection = normalizeForcedOutcomeSelection(explicitSelection || storedSelection);

  if (!forcedSelection) {
    return null;
  }

  const bucket = serverConfig?.[forcedSelection.strategy];
  if (!isPlainObject(bucket)) {
    return null;
  }

  if (!isPositiveNumber(bucket?.[forcedSelection.ticket])) {
    return null;
  }

  return forcedSelection;
}

drawWeightedTicket(strategyName) {
  const resolvedStrategy = this.resolveTicketStrategy(strategyName);
  const bucket = serverConfig?.[resolvedStrategy];
  if (!isPlainObject(bucket)) {
    return FALLBACK_TICKET;
  }

  const entries = Object.entries(bucket)
    .map(([ticket, weight]) => [ticket, Number(weight)])
    .filter(([, weight]) => Number.isFinite(weight) && weight > 0);

  if (!entries.length) {
    return FALLBACK_TICKET;
  }

  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let pick = Math.random() * total;
  for (const [ticket, weight] of entries) {
    pick -= weight;
    if (pick < 0) {
      return ticket;
    }
  }

  return entries[entries.length - 1][0];
}

hasBonus(roundStates) {
  return roundStates.some((state) => {
    if (state?.bgwe === true) return true;
    const action = state.executedAction;
    return (
      action === "bonustransition" ||
      action === "freespin" ||
      action === "freerespin" ||
      action === ACTION_FREESPIN_BANANA_HUNT ||
      action === LEGACY_ACTION_FREESPIN_BANANA_HUNT ||
      state.isBonus === true
    );
  });
}

hasDemonHunt(roundStates) {
  return roundStates.some(
    (state) =>
      state.executedAction === ACTION_BANANA_HUNT ||
      state.executedAction === ACTION_FREESPIN_BANANA_HUNT ||
      state.executedAction === LEGACY_ACTION_BANANA_HUNT ||
      state.executedAction === LEGACY_ACTION_FREESPIN_BANANA_HUNT
  );
}

hasRealTroll(roundStates) {
  return false;
}

hasTrollTease(roundStates) {
  return false;
}

hasBonusOnSpin(roundStates) {
  return roundStates.some(
    (state) => state.executedAction === "spin" && state.nextAction === "bonustransition"
  );
}

isTicketMatch(ticketName, roundStates) {
  if (!Array.isArray(roundStates) || roundStates.length === 0) {
    return false;
  }

  const { baseStrategy, minTbm, maxTbm } = parseTicketConstraints(ticketName);
  const finalState = roundStates[roundStates.length - 1];
  const finalTbm = Number(finalState?.tbm || 0);
  const tbmInRange = finalTbm >= minTbm && finalTbm <= maxTbm;
  if (!tbmInRange) {
    return false;
  }

  const hasBonus = this.hasBonus(roundStates);
  const hasDemonHunt = this.hasDemonHunt(roundStates);
  const hasHammers = (finalState?.collectedTimeSymbols?.length || 0) > 0;

  const hasMystery = roundStates.some((state) => state.hero?.step === "mystery");
  const hasMysteryWild = roundStates.some((state) => state.hero?.step === "mysteryWild");
  const hasAxe = roundStates.some((state) => state.hero?.weapon === "axe");
  const hasNecromancer2 = roundStates.some((state) => Number(state.hero?.necromancer) === 2);
  const hasCompletedPentagram = roundStates.some((state) => (
    Number(state?.heavenHell?.bonus?.pentagram?.completionCount || 0) > 0 ||
    state?.heavenHell?.bonus?.pentagram?.completionEventThisAction
  ));

  switch (baseStrategy) {
    case "bonus":
      return hasBonus;
    case "bonusPentagram":
      return hasBonus && hasCompletedPentagram;
    case "noBonus":
      return !hasBonus;
    case "noBonus_noHammers":
      return !hasBonus && !hasHammers;
    case "noWin":
      return finalTbm === 0 && !hasBonus;
    case "noWin_noHammers":
      return finalTbm === 0 && !hasBonus && !hasHammers;
    case "winMainGame":
      return !hasBonus && finalTbm > 0;
    case "bonusOnRespin":
      return hasBonus && hasDemonHunt;
    case "bonusOnSpin":
      return this.hasBonusOnSpin(roundStates);
    case "mystery":
      return hasMystery && hasDemonHunt;
    case "mysteryWild":
      return hasMysteryWild && hasDemonHunt;
    case "mysteryRunNoBonus":
      return hasMystery && hasDemonHunt && !hasBonus;
    case "mysteryRunBonus":
      return hasMystery && hasBonus;
    case "axe":
      return hasAxe && hasDemonHunt;
    case "necromancer2":
      return hasNecromancer2 && hasDemonHunt;
    case "max":
      return hasMysteryWild && hasAxe && hasNecromancer2;
    case "trollBonus":
      return false;
    case "trollMain":
      return false;
    case "trollTease":
      return false;
    case "noStrategy":
    default:
      return true;
  }
}

}

Object.assign(
  GameServer.prototype,
  createGameServerMainActionMethods({
    ACTION_BANANA_HUNT,
    BASE_MONKEY_STATE,
    originalConfig,
    resetGameState,
    serverConfig
  }),
  createGameServerBonusActionMethods({
    ACTION_BANANA_HUNT,
    ACTION_FREESPIN_BANANA_HUNT,
    ACTION_TROLL_RUSH,
    ACTION_TROLL_TEASE,
    BASE_MONKEY_STATE,
    LEGACY_ACTION_FREESPIN_BANANA_HUNT,
    resolveChestSequence,
    resolveNextBonusRetriggerThreshold,
    serverConfig
  }),
  createGameServerFlowMethods({
    ACTION_BANANA_HUNT,
    ACTION_FREESPIN_BANANA_HUNT,
    ACTION_TROLL_RUSH,
    ACTION_TROLL_TEASE,
    BASE_MONKEY_STATE,
    FALLBACK_TICKET,
    LEGACY_ACTION_BANANA_HUNT,
    LEGACY_ACTION_FREESPIN_BANANA_HUNT,
    MAX_ACTIONS_PER_ROUND,
    MAX_TICKET_SEARCH_ATTEMPTS,
    TROLL_FEATURE_ENABLED,
    isPlainObject,
    isPositiveNumber,
    parseTicketConstraints,
    resetGameState,
    serverConfig
  })
);

/**
 * Roll a single buff dimension using weighted random selection
 * @param {Object} odds - Object with options as keys and weights as values
 * @returns {string} - The selected option
 */
function rollWeightedOption(odds) {
  const options = Object.keys(odds);
  const weights = Object.values(odds);
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  
  let roll = Math.random() * totalWeight;
  
  for (let i = 0; i < options.length; i++) {
    roll -= weights[i];
    if (roll <= 0) {
      return options[i];
    }
  }
  
  return options[options.length - 1]; // Fallback
}

/**
 * Roll hero buffs independently for each dimension
 * Called on each new spin
 * @returns {Object} - { weapon: string, step: string, necromancer: number }
 */
function rollHeroBuffs() {
  return { ...BASE_MONKEY_STATE };
}




function resetGameState(gameState) {
        gameState.nextAction = "spin";
        gameState.executedAction = "spin";
        gameState.reels = {};
        gameState.freels = {};
        gameState.twa = 0;
        gameState.tbm = 0;
        gameState.bgwe = false;
        gameState.bonusGameWonEvent = null;
        gameState.isBonus = false;
        gameState.clusters = [];
        gameState.heroPath = [];
        gameState.affectedPositions = [];
        gameState.demonsKilled = 0;
        gameState.demonsKilledThisAction = 0;
        gameState.demonsCollected = 0;
        gameState.totalDemonsKilledInSequence = 0; // Reset speed boost counter
        gameState.totalDemonsCollectedInSequence = 0;
        gameState.bananaMeter = { count: 0, level: 0 };
        gameState.bananaMeterCount = 0;
        gameState.bananaMeterLevel = 0;
        gameState.bonusStage = 0;
        gameState.heroFootprintSize = 1;
        gameState.giantMonkeyActive = false;
        gameState.bonusStageEvent = null;
        gameState.rushActive = false;
        gameState.bananas = [];
        gameState.bananas = [];
        gameState.mysteryReveals = []; // Reset mystery reveals
        gameState.rtpData = { // Reset RTP tracking data
          mysteryPositionRTP: [],
          mysteryWinTBM: 0,
          mysteryRTP: 0,
          mysteryWildRTP: 0,
          clusterWinTBM: 0, // Track cluster wins
          heroAbilitiesApplied: false,
          abilityContributionTBM: {
            divineX: 0,
            divineStrike: 0,
            divineCharge: 0,
            baseHunt: 0,
            other: 0
          },
          abilityProcCounts: {
            divineX: 0,
            divineStrike: 0,
            divineCharge: 0
          }
        };
        gameState.reelsBeforeDrop = null;
        gameState.reelsAfterDrop = null;
        gameState.necromancerSpawns = []; // Reset necromancer spawns
        gameState.timeSymbols = []; // Reset time symbol positions
        gameState.collectedTimeSymbols = []; // Reset collected time symbols for round summary
        gameState.bonusTriggered = false; // Reset bonus trigger flag
        gameState.goldPiles = []; // Reset gold piles
        gameState.trollRush = { isTease: false };
        gameState.bonusWon = { 
          won: false,
          upgrades: 0,
          enterBonusWith: {
              step: {from: "destroy", to: "X"},
              weapon: {from: "staff", to: "X"},
              necromancer: {from: "0", to: "X"},
              freespins: BONUS_BASE_ENTRY_FREESPINS,
              portalBonus: false
          },
          chestRewards: {
              weapon: "staff",
              step: "destroy",
              necromancer: 0
          }
      };
        
        // Reset bonus state (freespins tracking)
        gameState.bonusState = {
          initialFreespins: 0,
          finalFreespins: 0,
          initialDemonsKilled: 0,
          initialDemonsCollected: 0,
          finalDemonsKilled: 0,
          finalDemonsCollected: 0,
          collectedSymbolCounts: {},
          collectedSymbolsTotal: 0,
          immediateLowPositionLandings: [],
          bonusMultiplierFruits: null,
          chestsRewarded: 0,
          chestsPending: 0
        };
        gameState.bonusMultiplierFruits = null;
        gameState.bonusCollectedSymbols = {};
        gameState.bonusCollectedThisAction = [];
        gameState.bonusMysteryFeature = {
          collected: 0,
          max: Math.max(1, Math.floor(Number(serverConfig?.bonusMysteryFeature?.maxCollect) || 3))
        };
        gameState.bonusMysteryFeatureCollectedThisAction = [];
        gameState.lightningBeeFeature = {
          collected: 0,
          max: Math.max(1, Math.floor(Number(serverConfig?.lightningBeeFeature?.maxCollect) || 3)),
          multiplierStep: 0,
          multiplier: 1,
          multiplierLadder: Array.isArray(serverConfig?.lightningBeeFeature?.multiplierLadder)
            ? serverConfig.lightningBeeFeature.multiplierLadder
            : DEFAULT_LIGHTNING_BEE_MULTIPLIER_LADDER,
          boardBees: [],
          collectedBees: [],
          nextBeeId: 1
        };
        gameState.lightningBeeFeatureCollectedThisAction = [];
        gameState.lightningBeeMovementsThisAction = [];
        gameState.mergeGunFeature = {
          collected: 0,
          max: Math.max(1, Math.floor(Number(serverConfig?.mergeGunFeature?.maxCollect) || 6)),
          highlightedPositions: [],
          persistentHighlightedPositions: [],
          areas: [],
          persistentAreas: []
        };
        gameState.mergeGunPersistentState = {
          highlightedPositions: [],
          areas: []
        };
        gameState.bonusState.mergeGunPersistentState = {
          highlightedPositions: [],
          areas: []
        };
        gameState.mergeGunFeatureCollectedThisAction = [];
        gameState.mergeGunActivationsThisAction = [];
        gameState.mergeGunHitPositionsThisAction = [];
        gameState.mergeGunFeatureThisAction = {
          collected: [],
          activations: [],
          hitPositions: [],
          areas: []
        };
        gameState.bonusEndPayout = null;
        
        // Reset multiplier on new spin
        gameState.multiplier = 1;
        gameState.heroAngelStartMultiplier = 1;
        gameState.heroAngelMultiplier = null;
        gameState.heroAngelNextMultiplier = 1;
        
        // Reset hero position (will enter from starting position on next hunt)
        gameState.heroPosition = null;
        
        // Roll fresh hero buffs on each spin
        const buffs = rollHeroBuffs();
        gameState.hero = {
          step: buffs.step,           // "destroy", "mystery", or "mysteryWild"
          weapon: buffs.weapon,       // "staff", "sword", or "axe"
          necromancer: buffs.necromancer  // 0, 1, or 2
        };

        gameState.roundSummary = {
          tbm: 0,
          wasBonus: false,
          mysteryWinTBM: 0,
          mysteryRTP: 0,
          mysteryWildRTP: 0,
          normalWinTBM: 0,
          clusterWinTBM: 0, // Track cluster wins
          bonusBananasKilled: 0,
          bonusBananasCollected: 0,
          bananaMeterCount: 0,
          bananaMeterLevel: 0,
          bonusEnteredWith: null,
          bonusTriggeredWith: null,
          timeSymbolsTotal: 0,
          timeSymbolsBonus: 0,
          timeSymbolsSpin: 0,
          timeSymbolsRespin: 0,
          timeSymbolsBonusSpin: 0,
          timeSymbolsBonusRespin: 0,
          heroAbilitiesApplied: false,
          isComplete: false
        };
        gameState.heavenHell = {
          portalTriggered: false,
          portalTriggerKillsThisRound: 0,
          bonus: {
            globalMultiplier: 1,
            killsTotal: 0,
            nextAbilityKillThreshold: 20,
            killsTowardsUnlock: 0,
            portalBonus: false,
            abilities: {
              divineX: 0,
              divineStrike: 0,
              divineCharge: 0
            },
            freerespinChain: 0,
            actionCount: 0,
            lootGround: [],
            lootGroundSettled: [],
          pendingChests: [],
          nextChestId: 1,
          chestsRewarded: 0,
          chestRewardResumeAction: null,
          abilityProcsThisAction: [],
          pentagram: {
            points: [],
            pointStates: {
              A: false,
              B: false,
              C: false,
              D: false,
              E: false
            },
            pointIdsLitAtActionStart: [],
            litPointCount: 0,
            completed: false,
            completionCount: 0,
            activationsThisAction: [],
            completionEventThisAction: null,
            pendingCompletionReward: null
          },
          rippleInjectionsThisAction: [],
          bossEventsThisAction: [],
          chestEventsThisAction: [],
          chestActionSummary: null,
          killsThisAction: 0
          }
        };
        gameState.bonusState.chestsPending = 0;
        gameState.bonusState.chestsRewarded = 0;
}

// Export resetGameState so it can be used externally
export { resetGameState };
