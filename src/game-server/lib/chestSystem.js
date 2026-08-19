const CONTINUATION_SYMBOLS = new Set(["respin", "respinReel"]);
const CURRENCY_SYMBOLS = new Set(["coin", "diamond"]);
const GAMEPLAY_SYMBOLS = new Set(["freeSpin", "divineStrike", "divineX", "divineCharge", "multiplier"]);
const ABILITY_SYMBOL_TO_KEY = {
  divineStrike: "divineStrike",
  divineX: "divineX",
  divineCharge: "divineCharge"
};
const MAX_ABILITY_LEVEL = 2;

function clampProbability(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed <= 0) return 0;
  if (parsed >= 1) return 1;
  return parsed;
}

function roundCurrency(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return parseFloat(parsed.toFixed(2));
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function resolveChestRespinDampeningMultiplier(chestConfig = {}, reelCount = 1) {
  const dampeningConfig = asObject(chestConfig.respinDampening);
  if (dampeningConfig.enabled !== true) return 1;

  const normalizedReelCount = Math.max(1, Math.floor(Number(reelCount) || 1));
  const reductionPerReel = clampProbability(dampeningConfig.chanceReductionPerReel, 1);
  if (normalizedReelCount <= 1) return 1;

  return Math.pow(reductionPerReel, normalizedReelCount - 1);
}

function getBonusState(gameState) {
  return asObject(gameState?.heavenHell?.bonus);
}

function getAbilityLevel(gameState, abilityKey) {
  const bonusState = getBonusState(gameState);
  return Math.max(0, Math.floor(Number(bonusState?.abilities?.[abilityKey] || 0)));
}

function isSymbolAvailable({
  symbol = "",
  gameState = null,
  reelCount = 1,
  chestConfig = {}
} = {}) {
  if (!symbol) return false;
  if (symbol === "respinReel") {
    const maxReels = Math.max(1, Math.floor(Number(chestConfig.maxReels ?? 6) || 6));
    return reelCount < maxReels;
  }
  const abilityKey = ABILITY_SYMBOL_TO_KEY[symbol];
  if (abilityKey) {
    return getAbilityLevel(gameState, abilityKey) < MAX_ABILITY_LEVEL;
  }
  return true;
}

function getAvailableSymbols({
  symbolWeights = {},
  gameState = null,
  reelCount = 1,
  chestConfig = {},
  includeContinuations = true
} = {}) {
  return weightedEntriesFromObject(symbolWeights, (symbol) => {
    if (!includeContinuations && CONTINUATION_SYMBOLS.has(symbol)) {
      return false;
    }
    return isSymbolAvailable({ symbol, gameState, reelCount, chestConfig });
  }).map((entry) => entry.key);
}

function weightedEntriesFromObject(weights = {}, filterFn = null) {
  return Object.entries(asObject(weights))
    .map(([key, weight]) => ({ key, weight: Number(weight) }))
    .filter((entry) => Number.isFinite(entry.weight) && entry.weight > 0)
    .filter((entry) => (typeof filterFn === "function" ? filterFn(entry.key, entry.weight) : true));
}

function pickWeightedKey(weights = {}, filterFn = null) {
  const entries = weightedEntriesFromObject(weights, filterFn);
  if (entries.length === 0) return null;
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
  let pick = Math.random() * total;
  for (const entry of entries) {
    pick -= entry.weight;
    if (pick <= 0) return entry.key;
  }
  return entries[entries.length - 1]?.key ?? null;
}

function pickWeightedValueFromEntries(entries = [], fallback = 0) {
  const validEntries = asArray(entries)
    .map((entry) => ({
      value: entry?.value,
      weight: Number(entry?.weight)
    }))
    .filter((entry) => entry.value !== undefined && Number.isFinite(entry.weight) && entry.weight > 0);
  if (validEntries.length === 0) {
    return fallback;
  }
  const total = validEntries.reduce((sum, entry) => sum + entry.weight, 0);
  let pick = Math.random() * total;
  for (const entry of validEntries) {
    pick -= entry.weight;
    if (pick <= 0) return entry.value;
  }
  return validEntries[validEntries.length - 1]?.value ?? fallback;
}

function getChestTypeEntries(chestTypes = {}) {
  return Object.entries(asObject(chestTypes))
    .map(([key, chestType]) => ({
      key,
      weight: Number(chestType?.dropWeight),
      chestType: asObject(chestType)
    }))
    .filter((entry) => Number.isFinite(entry.weight) && entry.weight > 0);
}

function getChestTypeEntriesFromWeights(chestTypeWeights = {}, chestTypes = {}) {
  return Object.entries(asObject(chestTypeWeights))
    .map(([key, weight]) => ({
      key,
      weight: Number(weight),
      chestType: asObject(chestTypes?.[key])
    }))
    .filter((entry) => Number.isFinite(entry.weight) && entry.weight > 0 && Object.keys(entry.chestType).length > 0);
}

function resolveChestHighlight(chestTypeKey, chestTypeConfig = {}) {
  const presentation = asObject(chestTypeConfig.presentation);
  return {
    tint: presentation.tint ?? null,
    glowColor: presentation.glowColor ?? null,
    glowAlpha: Number.isFinite(Number(presentation.glowAlpha)) ? Number(presentation.glowAlpha) : null,
    glowScale: Number.isFinite(Number(presentation.glowScale)) ? Number(presentation.glowScale) : null,
    tierLabel: presentation.tierLabel ?? chestTypeKey
  };
}

export function generateChest({
  chestConfig = {},
  chestTypes = {},
  chestTypeWeights = null,
  dropChanceOverride = null,
  source = "normal",
  reel = 0,
  row = 0,
  symbol = 0,
  isBoss = false,
  isMultiplierDemon = false,
  isGargoyleDemon = false,
  pendingId = 1
} = {}) {
  const dropChanceTable = asObject(chestConfig.dropChance);
  const normalizedSource = isBoss
    ? "boss"
    : (isMultiplierDemon
      ? "multiplier"
      : (isGargoyleDemon ? "gargoyle" : (source || "normal")));
  const dropChance = clampProbability(
    dropChanceOverride ?? dropChanceTable[normalizedSource],
    0
  );
  if (dropChance <= 0 || Math.random() >= dropChance) {
    return null;
  }

  const chestTypeEntries = chestTypeWeights
    ? getChestTypeEntriesFromWeights(chestTypeWeights, chestTypes)
    : getChestTypeEntries(chestTypes);
  if (chestTypeEntries.length === 0) {
    return null;
  }

  const totalWeight = chestTypeEntries.reduce((sum, entry) => sum + entry.weight, 0);
  let pick = Math.random() * totalWeight;
  let selected = chestTypeEntries[chestTypeEntries.length - 1];
  for (const entry of chestTypeEntries) {
    pick -= entry.weight;
    if (pick <= 0) {
      selected = entry;
      break;
    }
  }

  return {
    id: pendingId,
    chestType: selected.key,
    source: normalizedSource,
    reel: Number(reel),
    row: Number(row),
    symbol: Number(symbol),
    isBoss: isBoss === true,
    isMultiplierDemon: isMultiplierDemon === true,
    isGargoyleDemon: isGargoyleDemon === true,
    highlight: resolveChestHighlight(selected.key, selected.chestType)
  };
}

export function rollContinuation({
  gameState = null,
  chest = null,
  chestConfig = {},
  chestTypeConfig = {},
  reelCount = 1
} = {}) {
  const maxReels = Math.max(1, Math.floor(Number(chestConfig.maxReels ?? 6) || 6));
  const continuationChanceTable = asObject(chestConfig.respinChanceByReelCount);
  const baseContinuationChance = clampProbability(
    continuationChanceTable[String(reelCount)] ?? continuationChanceTable[reelCount] ?? 0,
    0
  );
  const dampeningMultiplier = resolveChestRespinDampeningMultiplier(chestConfig, reelCount);
  const continuationChance = clampProbability(baseContinuationChance * dampeningMultiplier, 0);
  if (continuationChance <= 0 || Math.random() >= continuationChance) {
    return {
      triggered: false,
      symbol: null,
      nextReelCount: reelCount,
      chance: continuationChance,
      baseChance: baseContinuationChance,
      dampeningMultiplier
    };
  }

  const symbolWeights = asObject(chestTypeConfig.symbolWeights);
  const availableContinuationSymbols = new Set(
    getAvailableSymbols({
      symbolWeights,
      gameState,
      reelCount,
      chestConfig,
      includeContinuations: true
    }).filter((symbol) => CONTINUATION_SYMBOLS.has(symbol))
  );
  const symbol = pickWeightedKey(
    symbolWeights,
    (key) => CONTINUATION_SYMBOLS.has(key) && availableContinuationSymbols.has(key)
  );
  if (!symbol) {
    return {
      triggered: false,
      symbol: null,
      nextReelCount: reelCount,
      chance: continuationChance,
      baseChance: baseContinuationChance,
      dampeningMultiplier
    };
  }

  return {
    triggered: true,
    symbol,
    chance: continuationChance,
    baseChance: baseContinuationChance,
    dampeningMultiplier,
    nextReelCount: symbol === "respinReel"
      ? Math.min(maxReels, reelCount + 1)
      : reelCount
  };
}

function buildResolvedReward(symbol, rewardValue, gameState, bonusState) {
  if (CURRENCY_SYMBOLS.has(symbol)) {
    const baseValue = roundCurrency(rewardValue);
    return {
      kind: "loot",
      symbol,
      rewardValue: baseValue,
      baseValue,
      appliedValue: baseValue
    };
  }

  if (symbol === "freeSpin") {
    const amount = Math.max(1, Math.floor(Number(rewardValue) || 1));
    return {
      kind: "freespin",
      symbol,
      rewardValue: amount,
      appliedValue: amount
    };
  }

  if (symbol === "multiplier") {
    const bonusState = getBonusState(gameState);
    const before = Math.max(1, Math.floor(Number(bonusState?.globalMultiplier || 1)));
    const rewardAmount = Math.max(1, Math.floor(Number(rewardValue) || 1));
    const after = before + rewardAmount;
    return {
      kind: "multiplier",
      symbol,
      rewardValue: rewardAmount,
      before,
      after,
      appliedValue: rewardAmount
    };
  }

  if (GAMEPLAY_SYMBOLS.has(symbol)) {
    const abilityKey = ABILITY_SYMBOL_TO_KEY[symbol];
    const before = getAbilityLevel(gameState, abilityKey);
    const rewardAmount = Math.max(1, Math.floor(Number(rewardValue) || 1));
    const after = Math.min(MAX_ABILITY_LEVEL, before + rewardAmount);
    return {
      kind: "ability",
      symbol,
      abilityKey,
      rewardValue: rewardAmount,
      before,
      after,
      appliedValue: after - before
    };
  }

  return {
    kind: "none",
    symbol,
    rewardValue,
    appliedValue: 0
  };
}

function getLootScatterOffsets(drop = {}, pieceIndex = 0, pieceCount = 1) {
  const normalizedCount = Math.max(1, Math.floor(Number(pieceCount) || 1));
  const isBoss = drop?.isBoss === true;
  const minRadius = isBoss
    ? 40
    : normalizedCount === 1
      ? 6
      : 10;
  const maxRadius = isBoss
    ? 60
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

export function resolveRewards({
  gameState,
  chest = null,
  spin = null,
  chestTypeConfig = {}
} = {}) {
  if (!gameState?.heavenHell?.bonus || !spin) {
    return {
      reveals: [],
      freeSpinsAdded: 0,
      abilityGains: { divineStrike: 0, divineX: 0, divineCharge: 0 },
      lootDrops: []
    };
  }

  const bonusState = gameState.heavenHell.bonus;
  const rewardTable = asObject(chestTypeConfig.rewardTable);
  const reelCount = Math.max(1, Math.floor(Number(spin.reelCount) || 1));
  const revealResults = [];
  const lootDrops = [];
  let freeSpinsAdded = 0;
  const abilityGains = { divineStrike: 0, divineX: 0, divineCharge: 0 };

  asArray(spin.reveals).forEach((reveal, revealIndex) => {
    const symbol = String(reveal?.symbol || "");
    if (!symbol) return;

    if (CONTINUATION_SYMBOLS.has(symbol)) {
      revealResults.push({
        ...reveal,
        resolvedReward: null
      });
      return;
    }

    const rewardEntries = asArray(rewardTable[symbol]);
    const fallbackRewardValue = symbol === "freeSpin" ? 1 : 1;
    const rewardValue = pickWeightedValueFromEntries(rewardEntries, fallbackRewardValue);
    const resolvedReward = buildResolvedReward(symbol, rewardValue, gameState, bonusState);

    if (resolvedReward.kind === "loot") {
      const offsets = getLootScatterOffsets(chest, revealIndex, reelCount);
      const drop = {
        reel: Number(chest?.reel),
        row: Number(chest?.row),
        baseValue: resolvedReward.baseValue,
        value: resolvedReward.baseValue,
        lootKind: symbol,
        lootType: symbol,
        source: "chest",
        chestType: chest?.chestType || null,
        chestId: chest?.id ?? null,
        offsetX: offsets.offsetX,
        offsetY: offsets.offsetY
      };
      resolvedReward.lootDrop = drop;
      bonusState.lootGround.push(drop);
      lootDrops.push(drop);
    } else if (resolvedReward.kind === "freespin") {
      gameState.bonusState.finalFreespins = Math.max(
        0,
        Math.floor(Number(gameState.bonusState?.finalFreespins || 0) + resolvedReward.appliedValue)
      );
      freeSpinsAdded += resolvedReward.appliedValue;
    } else if (resolvedReward.kind === "multiplier") {
      bonusState.globalMultiplier = resolvedReward.after;
      gameState.multiplier = resolvedReward.after;
    } else if (resolvedReward.kind === "ability" && resolvedReward.abilityKey) {
      const abilityKey = resolvedReward.abilityKey;
      bonusState.abilities[abilityKey] = resolvedReward.after;
      abilityGains[abilityKey] += resolvedReward.appliedValue;
    }

    revealResults.push({
      ...reveal,
      resolvedReward
    });
  });

  return {
    reveals: revealResults,
    freeSpinsAdded,
    abilityGains,
    lootDrops
  };
}

export function generateSpin({
  gameState,
  chest = null,
  chestConfig = {},
  chestTypeConfig = {},
  reelCount = 1
} = {}) {
  const normalizedReelCount = Math.max(1, Math.floor(Number(reelCount) || 1));
  const continuation = rollContinuation({
    gameState,
    chest,
    chestConfig,
    chestTypeConfig,
    reelCount: normalizedReelCount
  });
  const continuationIndex = continuation.triggered
    ? Math.floor(Math.random() * normalizedReelCount)
    : -1;
  const symbolWeights = asObject(chestTypeConfig.symbolWeights);
  const availableTickSymbols = getAvailableSymbols({
    symbolWeights,
    gameState,
    reelCount: normalizedReelCount,
    chestConfig,
    includeContinuations: true
  });
  const rawReveals = [];

  for (let reelIndex = 0; reelIndex < normalizedReelCount; reelIndex++) {
    if (reelIndex === continuationIndex) {
      rawReveals.push({
        reelIndex,
        symbol: continuation.symbol
      });
      continue;
    }

    const symbol = pickWeightedKey(
      symbolWeights,
      (key) => !CONTINUATION_SYMBOLS.has(key) && isSymbolAvailable({
        symbol: key,
        gameState,
        reelCount: normalizedReelCount,
        chestConfig
      })
    );
    rawReveals.push({
      reelIndex,
      symbol: symbol || "coin"
    });
  }

  const rewardResult = resolveRewards({
    gameState,
    chest,
    spin: {
      reelCount: normalizedReelCount,
      reveals: rawReveals
    },
    chestTypeConfig
  });

  return {
    reelCount: normalizedReelCount,
    availableTickSymbols,
    reveals: rewardResult.reveals,
    continuation,
    freeSpinsAdded: rewardResult.freeSpinsAdded,
    abilityGains: rewardResult.abilityGains,
    lootDrops: rewardResult.lootDrops
  };
}

export function resolveChestSequence({
  gameState,
  pendingChests = [],
  chestConfig = {},
  chestTypes = {}
} = {}) {
  const bonusState = gameState?.heavenHell?.bonus;
  if (!bonusState) {
    return {
      chests: [],
      summary: {
        totalChestsOpened: 0,
        freeSpinsAdded: 0,
        lootDropsAdded: 0,
        abilityGains: { divineStrike: 0, divineX: 0, divineCharge: 0 },
        finalHeroPosition: null
      }
    };
  }

  const maxReels = Math.max(1, Math.floor(Number(chestConfig.maxReels ?? 6) || 6));
  const chestEvents = [];
  const summary = {
    totalChestsOpened: 0,
    freeSpinsAdded: 0,
    lootDropsAdded: 0,
    multiplierAdded: 0,
    abilityGains: { divineStrike: 0, divineX: 0, divineCharge: 0 },
    finalHeroPosition: null
  };

  asArray(pendingChests).forEach((pendingChest) => {
    const chestTypeConfig = asObject(chestTypes?.[pendingChest?.chestType]);
    let reelCount = Math.max(1, Math.floor(Number(chestConfig.initialReelCount ?? 1) || 1));
    const spins = [];
    let guard = 0;

    while (guard < 32) {
      guard += 1;
      const spin = generateSpin({
        gameState,
        chest: pendingChest,
        chestConfig,
        chestTypeConfig,
        reelCount
      });
      spins.push({
        spinIndex: spins.length,
        ...spin
      });
      summary.freeSpinsAdded += spin.freeSpinsAdded;
      summary.lootDropsAdded += spin.lootDrops.length;
      summary.multiplierAdded += Math.max(
        0,
        spin.reveals.reduce(
          (sum, reveal) => sum + Number(reveal?.resolvedReward?.kind === "multiplier"
            ? reveal?.resolvedReward?.appliedValue
            : 0),
          0
        )
      );
      Object.keys(summary.abilityGains).forEach((abilityKey) => {
        summary.abilityGains[abilityKey] += Number(spin.abilityGains?.[abilityKey] || 0);
      });

      if (!spin.continuation?.triggered) {
        break;
      }

      const nextReelCount = Math.max(
        1,
        Math.min(maxReels, Math.floor(Number(spin.continuation?.nextReelCount ?? reelCount) || reelCount))
      );
      if (nextReelCount === reelCount && spin.continuation.symbol !== "respin") {
        break;
      }
      reelCount = nextReelCount;
    }

    chestEvents.push({
      ...pendingChest,
      chestTypeConfig: {
        presentation: resolveChestHighlight(pendingChest?.chestType, chestTypeConfig)
      },
      spins
    });
    summary.totalChestsOpened += 1;
    summary.finalHeroPosition = {
      reel: Math.floor(Number(pendingChest?.reel) || 0),
      row: Math.floor(Number(pendingChest?.row) || 0)
    };
  });

  return {
    chests: chestEvents,
    summary
  };
}
