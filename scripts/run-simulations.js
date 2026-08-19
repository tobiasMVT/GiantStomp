import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";

import simulationConfig from "../src/game-server/simulation_config.json" with { type: "json" };
import serverConfig from "../src/game-server/server_config.json" with { type: "json" };
import { GameServer } from "../src/game-server/Gameserver.js";

const twoDecimals = (n) => Number(Number(n).toFixed(2));
const fourDecimals = (n) => Number(Number(n).toFixed(4));

const ABILITY_KEYS = ["divineX", "divineStrike", "divineCharge", "baseHunt", "other"];
const ABILITY_PROC_KEYS = ["divineX", "divineStrike", "divineCharge"];

const emptyAbilityContribution = () => ({
  divineX: 0,
  divineStrike: 0,
  divineCharge: 0,
  baseHunt: 0,
  other: 0
});

const emptyAbilityProcCounts = () => ({
  divineX: 0,
  divineStrike: 0,
  divineCharge: 0
});

const parseArgs = () => {
  const args = process.argv.slice(2);
  const out = {};

  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];
    if (!token.startsWith("--")) continue;

    const key = token.slice(2);
    const value = args[i + 1];
    if (!value || value.startsWith("--")) {
      out[key] = true;
      continue;
    }

    out[key] = value;
    i += 1;
  }

  return out;
};

const pad2 = (value) => String(value).padStart(2, "0");
const toPathSafe = (value) => String(value).replace(/[^a-zA-Z0-9._-]/g, "_");

/** Attribute each twa step to main (spin/respin) vs bonus using previous state's isBonus. */
const splitRoundTwaByPhase = (states) => {
  let mainGameWin = 0;
  let bonusWin = 0;
  let prevTwa = 0;
  let prevInBonus = false;
  for (const s of states) {
    const twa = Number(s?.twa) || 0;
    const delta = twa - prevTwa;
    if (prevInBonus) bonusWin += delta;
    else mainGameWin += delta;
    prevTwa = twa;
    prevInBonus = s?.isBonus === true;
  }
  return { mainGameWin, bonusWin };
};

const meanOf = (values) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0);

const populationVariance = (values, mean) =>
  values.length ? values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length : 0;

const applyOutputTokens = (template, tokens) =>
  String(template).replace(/\{(date|time|timestamp|strategy|rounds|bet)\}/g, (_, key) =>
    Object.prototype.hasOwnProperty.call(tokens, key) ? String(tokens[key]) : _
  );

const readRoundTbm = (state) => {
  const fromSummary = Number(state?.roundSummary?.tbm);
  if (Number.isFinite(fromSummary)) return fromSummary;
  const fromState = Number(state?.tbm);
  return Number.isFinite(fromState) ? fromState : 0;
};

const readBonusAbilities = (state) => {
  const abilities = state?.heavenHell?.bonus?.abilities;
  if (!abilities || typeof abilities !== "object") {
    return { divineX: 0, divineStrike: 0, divineCharge: 0 };
  }
  return {
    divineX: Math.max(0, Math.floor(Number(abilities.divineX) || 0)),
    divineStrike: Math.max(0, Math.floor(Number(abilities.divineStrike) || 0)),
    divineCharge: Math.max(0, Math.floor(Number(abilities.divineCharge) || 0))
  };
};

const readAbilityContribution = (state) => {
  const fromSummary = state?.roundSummary?.abilityContributionTBM;
  const fromRtp = state?.rtpData?.abilityContributionTBM;
  const source = fromSummary && typeof fromSummary === "object" ? fromSummary : fromRtp;
  const out = emptyAbilityContribution();
  if (!source || typeof source !== "object") return out;
  ABILITY_KEYS.forEach((key) => {
    out[key] = Number(source[key] || 0);
  });
  return out;
};

const readAbilityProcCounts = (state) => {
  const fromSummary = state?.roundSummary?.abilityProcCounts;
  const fromRtp = state?.rtpData?.abilityProcCounts;
  const source = fromSummary && typeof fromSummary === "object" ? fromSummary : fromRtp;
  const out = emptyAbilityProcCounts();
  if (!source || typeof source !== "object") return out;
  ABILITY_PROC_KEYS.forEach((key) => {
    out[key] = Math.max(0, Math.floor(Number(source[key] || 0)));
  });
  return out;
};

const totalAbilityLevels = (abilities) =>
  abilities.divineX + abilities.divineStrike + abilities.divineCharge;

const abilityKey = (abilities) =>
  `X${abilities.divineX}_S${abilities.divineStrike}_C${abilities.divineCharge}`;

const readBonusKillCount = (state) => {
  const bonus = state?.heavenHell?.bonus;
  const killsTotal = Number(bonus?.killsTotal);
  if (Number.isFinite(killsTotal)) return Math.max(0, Math.floor(killsTotal));
  const summaryKills = Number(state?.roundSummary?.bonusDemonsKilled);
  if (Number.isFinite(summaryKills)) return Math.max(0, Math.floor(summaryKills));
  return Math.max(0, Math.floor(Number(state?.demonsKilled) || 0));
};

const BONUS_EXECUTED_ACTIONS = new Set([
  "bonustransition",
  "freespin",
  "freerespin",
  "freespinbananaHunt",
  "chestreward"
]);

const isBonusPhaseState = (state) => {
  if (!state || typeof state !== "object") return false;
  if (state.bgwe === true || state.isBonus === true) return true;
  return BONUS_EXECUTED_ACTIONS.has(String(state.executedAction || ""));
};

/** Last state from the bonus phase (freespin / hunt / collect), used for gameover stats. */
const findBonusSnapshotState = (states) => {
  if (!Array.isArray(states) || !states.length) return null;
  let lastBonusState = null;
  for (const state of states) {
    if (isBonusPhaseState(state)) {
      lastBonusState = state;
    }
  }
  return lastBonusState;
};

/** Bonus-only final TBM: 0 on its own, then >0 ranges. Non-bonus rounds are separate. */
const BONUS_TBM_ZERO_KEY = "0";

const BONUS_TBM_ABOVE_ZERO_BUCKETS = [
  { key: "0-10", label: ">0-10", low: 0, high: 10, lowExclusive: true },
  { key: "10-20", label: "10-20", low: 10, high: 20, lowExclusive: true },
  { key: "20-40", label: "20-40", low: 20, high: 40, lowExclusive: true },
  { key: "40-80", label: "40-80", low: 40, high: 80, lowExclusive: true },
  { key: "80-120", label: "80-120", low: 80, high: 120, lowExclusive: true },
  { key: "120-150", label: "120-150", low: 120, high: 150, lowExclusive: true },
  { key: "150-200", label: "150-200", low: 150, high: 200, lowExclusive: true },
  { key: "200-250", label: "200-250", low: 200, high: 250, lowExclusive: true },
  { key: "250-300", label: "250-300", low: 250, high: 300, lowExclusive: true },
  { key: "300-400", label: "300-400", low: 300, high: 400, lowExclusive: true },
  { key: "400-500", label: "400-500", low: 400, high: 500, lowExclusive: true },
  { key: "500-600", label: "500-600", low: 500, high: 600, lowExclusive: true },
  { key: "600-700", label: "600-700", low: 600, high: 700, lowExclusive: true },
  { key: "700-800", label: "700-800", low: 700, high: 800, lowExclusive: true },
  { key: "800-900", label: "800-900", low: 800, high: 900, lowExclusive: true },
  { key: "900-1000", label: "900-1000", low: 900, high: 1000, lowExclusive: true },
  { key: "1000-1250", label: "1000-1250", low: 1000, high: 1250, lowExclusive: true },
  { key: "1250-1500", label: "1250-1500", low: 1250, high: 1500, lowExclusive: true },
  { key: "1500-1750", label: "1500-1750", low: 1500, high: 1750, lowExclusive: true },
  { key: "1750-2000", label: "1750-2000", low: 1750, high: 2000, lowExclusive: true },
  { key: "2000+", label: "2000+", low: 2000, high: Infinity, lowExclusive: false }
];

const resolveBonusTbmBucketKey = (tbm) => {
  const value = Number(tbm);
  if (!Number.isFinite(value) || value === 0) return BONUS_TBM_ZERO_KEY;

  for (const bucket of BONUS_TBM_ABOVE_ZERO_BUCKETS) {
    const aboveLow = bucket.lowExclusive ? value > bucket.low : value >= bucket.low;
    const withinHigh = bucket.high === Infinity ? true : value <= bucket.high;
    if (aboveLow && withinHigh) return bucket.key;
  }

  return "uncategorized";
};

const buildStatSummary = (agg, { totalStake = 0, completedRounds = 0, bonusRounds = 0, bonusOnly = false } = {}) => ({
  rounds: agg.count,
  shareOfAllRoundsPercent:
    completedRounds > 0 ? twoDecimals((agg.count / completedRounds) * 100) : 0,
  shareOfBonusesPercent:
    bonusOnly && bonusRounds > 0 ? twoDecimals((agg.count / bonusRounds) * 100) : 0,
  totalTbm: Number(agg.sumTbm.toFixed(4)),
  averageTbm: agg.count > 0 ? twoDecimals(agg.sumTbm / agg.count) : 0,
  totalPayout: Number(agg.sumPayout.toFixed(4)),
  averagePayout: agg.count > 0 ? twoDecimals(agg.sumPayout / agg.count) : 0,
  rtpPercent: totalStake > 0 ? fourDecimals((agg.sumPayout / totalStake) * 100) : 0
});

const buildFinalTbmDistributionRows = (countMap, { totalStake = 0, completedRounds = 0, bonusRounds = 0 } = {}) => {
  const zeroAgg = countMap.get(BONUS_TBM_ZERO_KEY) || { count: 0, sumTbm: 0, sumPayout: 0 };
  const zeroRow = {
    key: BONUS_TBM_ZERO_KEY,
    label: "0",
    ...buildStatSummary(zeroAgg, { totalStake, completedRounds, bonusRounds, bonusOnly: true })
  };

  const aboveZeroRows = BONUS_TBM_ABOVE_ZERO_BUCKETS.map((bucket) => {
    const agg = countMap.get(bucket.key) || { count: 0, sumTbm: 0, sumPayout: 0 };
    return {
      key: bucket.key,
      label: bucket.label,
      ...buildStatSummary(agg, { totalStake, completedRounds, bonusRounds, bonusOnly: true })
    };
  });

  const uncategorized = countMap.has("uncategorized")
    ? [{
        key: "uncategorized",
        label: "uncategorized",
        ...buildStatSummary(countMap.get("uncategorized"), {
          totalStake,
          completedRounds,
          bonusRounds,
          bonusOnly: true
        })
      }]
    : [];

  return { zero: zeroRow, aboveZero: [...aboveZeroRows, ...uncategorized] };
};

/** Flat { "0": {...}, "0-10": {...}, ... } from distribution rows. */
const distributionToKeyedObject = (distributionRows) => {
  const out = {};
  const addRow = (row) => {
    const { key, label, ...stats } = row;
    out[key] = { label, ...stats };
  };
  addRow(distributionRows.zero);
  distributionRows.aboveZero.forEach(addRow);
  return out;
};

const countExecutedActions = (states, actionName) =>
  Array.isArray(states)
    ? states.filter((state) => String(state?.executedAction || "") === actionName).length
    : 0;

const readBonusEndMultiplier = (state) => {
  const fromBonus = Number(state?.heavenHell?.bonus?.globalMultiplier);
  if (Number.isFinite(fromBonus) && fromBonus > 0) {
    return Math.max(1, Math.floor(fromBonus));
  }
  const fromState = Number(state?.multiplier);
  if (Number.isFinite(fromState) && fromState > 0) {
    return Math.max(1, Math.floor(fromState));
  }
  return 1;
};

const readMainGameAngelMaxMultiplier = (states) => {
  if (!Array.isArray(states) || !states.length) return 1;
  let maxMultiplier = 1;
  for (const state of states) {
    if (isBonusPhaseState(state)) continue;
    const candidates = [
      Number(state?.heroAngelStartMultiplier),
      Number(state?.heroAngelMultiplier),
      Number(state?.heroAngelNextMultiplier)
    ];
    candidates.forEach((value) => {
      if (Number.isFinite(value) && value > maxMultiplier) {
        maxMultiplier = Math.max(1, Math.floor(value));
      }
    });
  }
  return maxMultiplier;
};

const emptyBonusBucketAgg = () => ({
  count: 0,
  sumTbm: 0,
  sumPayout: 0,
  sumFreespins: 0,
  maxFreespins: 0,
  sumFreerespins: 0,
  maxFreerespins: 0,
  sumDemonKillCount: 0,
  maxDemonKillCount: 0,
  sumEndMultiplier: 0,
  maxEndMultiplier: 0
});

const bumpBonusRoundAgg = (map, key, tbm, payout = 0, extras = {}) => {
  const prev = map.get(key) || emptyBonusBucketAgg();
  const freespins = Math.max(0, Math.floor(Number(extras.freespins) || 0));
  const freerespins = Math.max(0, Math.floor(Number(extras.freerespins) || 0));
  const demonKillCount = Math.max(0, Math.floor(Number(extras.demonKillCount) || 0));
  const endMultiplier = Math.max(1, Math.floor(Number(extras.endMultiplier) || 1));

  prev.count += 1;
  prev.sumTbm += tbm;
  prev.sumPayout += payout;
  prev.sumFreespins += freespins;
  prev.maxFreespins = Math.max(prev.maxFreespins, freespins);
  prev.sumFreerespins += freerespins;
  prev.maxFreerespins = Math.max(prev.maxFreerespins, freerespins);
  prev.sumDemonKillCount += demonKillCount;
  prev.maxDemonKillCount = Math.max(prev.maxDemonKillCount, demonKillCount);
  prev.sumEndMultiplier += endMultiplier;
  prev.maxEndMultiplier = Math.max(prev.maxEndMultiplier, endMultiplier);
  map.set(key, prev);
};

const bumpAgg = (map, key, tbm, payout = 0) => {
  const prev = map.get(key) || { count: 0, sumTbm: 0, sumPayout: 0 };
  prev.count += 1;
  prev.sumTbm += tbm;
  prev.sumPayout += payout;
  map.set(key, prev);
};

const buildTbmBucketRows = (countMap, { totalStake = 0, bonusRounds = 0 } = {}) =>
  [...countMap.entries()]
    .sort((a, b) => {
      if (typeof a[0] === "number" && typeof b[0] === "number") return a[0] - b[0];
      return String(a[0]).localeCompare(String(b[0]));
    })
    .map(([key, agg]) => ({
      key,
      rounds: agg.count,
      shareOfBonusesPercent: bonusRounds > 0 ? twoDecimals((agg.count / bonusRounds) * 100) : 0,
      totalTbm: Number(agg.sumTbm.toFixed(4)),
      averageTbm: agg.count > 0 ? twoDecimals(agg.sumTbm / agg.count) : 0,
      totalPayout: Number(agg.sumPayout.toFixed(4)),
      averagePayout: agg.count > 0 ? twoDecimals(agg.sumPayout / agg.count) : 0,
      rtpPercent: totalStake > 0 ? fourDecimals((agg.sumPayout / totalStake) * 100) : 0
    }));

const buildAbilityRtpRows = (contributionTBM, contributionPayout, totalStake) =>
  ABILITY_KEYS.map((ability) => ({
    ability,
    totalContributionTbm: fourDecimals(contributionTBM[ability]),
    totalContributionPayout: fourDecimals(contributionPayout[ability]),
    rtpPercent: totalStake > 0 ? fourDecimals((contributionPayout[ability] / totalStake) * 100) : 0
  }));

const buildBonusBucketSummary = (agg, { totalStake = 0, completedRounds = 0, bonusRounds = 0 } = {}) => ({
  rounds: agg.count,
  shareOfAllRoundsPercent:
    completedRounds > 0 ? twoDecimals((agg.count / completedRounds) * 100) : 0,
  shareOfBonusesPercent:
    bonusRounds > 0 ? twoDecimals((agg.count / bonusRounds) * 100) : 0,
  totalTbm: Number(agg.sumTbm.toFixed(4)),
  averageTbm: agg.count > 0 ? twoDecimals(agg.sumTbm / agg.count) : 0,
  totalPayout: Number(agg.sumPayout.toFixed(4)),
  averagePayout: agg.count > 0 ? twoDecimals(agg.sumPayout / agg.count) : 0,
  rtpPercent: totalStake > 0 ? fourDecimals((agg.sumPayout / totalStake) * 100) : 0,
  totalFreespins: agg.sumFreespins,
  averageFreespins: agg.count > 0 ? twoDecimals(agg.sumFreespins / agg.count) : 0,
  maxFreespins: agg.maxFreespins,
  totalFreerespins: agg.sumFreerespins,
  averageFreerespins: agg.count > 0 ? twoDecimals(agg.sumFreerespins / agg.count) : 0,
  maxFreerespins: agg.maxFreerespins,
  totalDemonKillCount: agg.sumDemonKillCount,
  averageDemonKillCount: agg.count > 0 ? twoDecimals(agg.sumDemonKillCount / agg.count) : 0,
  maxDemonKillCount: agg.maxDemonKillCount,
  averageEndMultiplier: agg.count > 0 ? twoDecimals(agg.sumEndMultiplier / agg.count) : 0,
  maxEndMultiplier: agg.maxEndMultiplier
});

const buildBonusDistributionRows = (countMap, { totalStake = 0, completedRounds = 0, bonusRounds = 0 } = {}) => {
  const zeroAgg = countMap.get(BONUS_TBM_ZERO_KEY) || emptyBonusBucketAgg();
  const zeroRow = {
    key: BONUS_TBM_ZERO_KEY,
    label: "0",
    ...buildBonusBucketSummary(zeroAgg, { totalStake, completedRounds, bonusRounds })
  };

  const aboveZeroRows = BONUS_TBM_ABOVE_ZERO_BUCKETS.map((bucket) => {
    const agg = countMap.get(bucket.key) || emptyBonusBucketAgg();
    return {
      key: bucket.key,
      label: bucket.label,
      ...buildBonusBucketSummary(agg, { totalStake, completedRounds, bonusRounds })
    };
  });

  const uncategorized = countMap.has("uncategorized")
    ? [{
        key: "uncategorized",
        label: "uncategorized",
        ...buildBonusBucketSummary(countMap.get("uncategorized"), {
          totalStake,
          completedRounds,
          bonusRounds
        })
      }]
    : [];

  return { zero: zeroRow, aboveZero: [...aboveZeroRows, ...uncategorized] };
};

const parseBool = (value, fallback = false) => {
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  return fallback;
};

const args = parseArgs();

const rounds = Number(args.rounds ?? simulationConfig.rounds ?? 10000);
const betSize = Number(args.betSize ?? simulationConfig.betSize ?? 1);
const ticketStrategy = String(args.ticketStrategy ?? simulationConfig.ticketStrategy ?? "normal");
const outputPathTemplate = String(
  args.output ?? simulationConfig.outputPath ?? "simulation-output/sim-{timestamp}.json"
);
const progressEvery = Number(args.progressEvery ?? 5000);
const quietRoundLogs = String(args.quietRoundLogs ?? "true") !== "false";
const fakeNoWins = parseBool(args.fakeNoWins, parseBool(simulationConfig.fakeNoWins, false));

if (!Number.isFinite(rounds) || rounds <= 0) {
  throw new Error(`Invalid --rounds value: ${rounds}`);
}

if (!Number.isFinite(betSize) || betSize <= 0) {
  throw new Error(`Invalid --betSize value: ${betSize}`);
}

const server = new GameServer();
const availableTicketStrategies = server.getAvailableTicketStrategies();
const resolvedTicketStrategy = server.resolveTicketStrategy(ticketStrategy);
const explicitTicketStrategyArg = typeof args.ticketStrategy === "string";

if (explicitTicketStrategyArg && resolvedTicketStrategy !== ticketStrategy) {
  console.warn(
    `[sim] Requested ticket strategy "${ticketStrategy}" is unavailable. Using "${resolvedTicketStrategy}" instead.`
  );
  console.warn(`[sim] Available strategies: ${availableTicketStrategies.join(", ")}`);
}

const now = new Date();
const dateToken = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
const timeToken = `${pad2(now.getHours())}-${pad2(now.getMinutes())}-${pad2(now.getSeconds())}`;
const timestampToken = `${dateToken}_${timeToken}`;
const outputTokens = {
  date: dateToken,
  time: timeToken,
  timestamp: timestampToken,
  strategy: toPathSafe(resolvedTicketStrategy),
  rounds: String(rounds),
  bet: String(betSize).replace(".", "_")
};
const outputPath = applyOutputTokens(outputPathTemplate, outputTokens);

const originalConsoleLog = console.log.bind(console);

if (quietRoundLogs) {
  console.log = (...parts) => {
    if (parts.length === 1 && typeof parts[0] === "string") {
      const msg = parts[0];
      if (msg === ">>> Generating game round" || msg.startsWith("[DEV Tickets]")) {
        return;
      }
    }
    originalConsoleLog(...parts);
  };
}

const wins = [];
const tbmValues = [];
let totalStake = 0;
let totalPayout = 0;
let completedRounds = 0;
let failedRounds = 0;
let hitRounds = 0;
let noHitRounds = 0;
let maxWin = 0;
let maxTbm = 0;
let maxMainGameWin = 0;
let maxBonusGameWin = 0;
let maxMainGameAngelMultiplier = 1;

let bonusRounds = 0;
let totalBonusPhaseWin = 0;
let totalRoundWinWhenBonus = 0;
let totalMainGameWin = 0;
const mainGameWinsPerRound = [];
const bonusWinsPerBonusRound = [];
const bonusEndTbmValues = [];
const bonusEndKillCounts = [];
const bonusEndAbilityTotals = [];
const tbmByTotalAbilityLevels = new Map();
const tbmByAbilityKey = new Map();
const tbmByDivineXLevel = new Map();
const tbmByDivineStrikeLevel = new Map();
const tbmByDivineChargeLevel = new Map();
const finalTbmDistribution = new Map();
const bonusPhaseDistribution = new Map();
const noBonusStats = { count: 0, sumTbm: 0, sumPayout: 0 };

const abilityContributionTBM = emptyAbilityContribution();
const abilityContributionPayout = emptyAbilityContribution();
const abilityProcTotals = emptyAbilityProcCounts();

const startedAt = performance.now();

if (fakeNoWins) {
  originalConsoleLog(
    "[sim] fakeNoWins enabled — drawn noWin tickets use a synthetic zero-win spin instead of RNG."
  );
}

for (let i = 1; i <= rounds; i += 1) {
  const states = await server.generateRoundStates({
    betSize,
    ticketStrategy: resolvedTicketStrategy,
    fakeNoWins
  });
  if (!states.length) {
    failedRounds += 1;
    continue;
  }

  const firstState = states[0];
  const lastState = states[states.length - 1];

  if (lastState.nextAction !== "spin") {
    failedRounds += 1;
    continue;
  }

  const roundStake = Number(firstState?.roundMeta?.roundCost);
  const roundWin = Number(lastState?.twa);
  const roundTbm = readRoundTbm(lastState);
  const roundBetSize = Number(firstState?.roundMeta?.betSize ?? firstState?.betSize ?? betSize) || betSize;

  const safeStake = Number.isFinite(roundStake) ? roundStake : betSize;
  const safeWin = Number.isFinite(roundWin) ? roundWin : 0;

  totalStake += safeStake;
  totalPayout += safeWin;
  wins.push(safeWin);
  tbmValues.push(roundTbm);
  completedRounds += 1;
  maxWin = Math.max(maxWin, safeWin);
  maxTbm = Math.max(maxTbm, roundTbm);

  if (roundTbm > 0) hitRounds += 1;
  else noHitRounds += 1;

  const { mainGameWin, bonusWin } = splitRoundTwaByPhase(states);
  mainGameWinsPerRound.push(mainGameWin);
  totalMainGameWin += mainGameWin;
  maxMainGameWin = Math.max(maxMainGameWin, mainGameWin);
  maxBonusGameWin = Math.max(maxBonusGameWin, bonusWin);
  maxMainGameAngelMultiplier = Math.max(maxMainGameAngelMultiplier, readMainGameAngelMaxMultiplier(states));

  const roundAbilityContribution = readAbilityContribution(lastState);
  const roundAbilityProcs = readAbilityProcCounts(lastState);
  ABILITY_KEYS.forEach((key) => {
    const tbmPart = Number(roundAbilityContribution[key] || 0);
    abilityContributionTBM[key] += tbmPart;
    abilityContributionPayout[key] += tbmPart * roundBetSize;
  });
  ABILITY_PROC_KEYS.forEach((key) => {
    abilityProcTotals[key] += Number(roundAbilityProcs[key] || 0);
  });

  const bonusSnapshot = findBonusSnapshotState(states);
  const hadBonus = server.hasBonus(states);

  if (hadBonus) {
    const bonusPhaseTbm = roundBetSize > 0 ? bonusWin / roundBetSize : bonusWin;
    const bonusPhaseBucket = resolveBonusTbmBucketKey(bonusPhaseTbm);
    const bonusFreespins = countExecutedActions(states, "freespin");
    const bonusFreerespins = countExecutedActions(states, "freerespin");
    const bonusDemonKillCount = readBonusKillCount(bonusSnapshot);
    const bonusEndMultiplier = readBonusEndMultiplier(bonusSnapshot);

    bumpBonusRoundAgg(finalTbmDistribution, resolveBonusTbmBucketKey(roundTbm), roundTbm, safeWin, {
      freespins: bonusFreespins,
      freerespins: bonusFreerespins,
      demonKillCount: bonusDemonKillCount,
      endMultiplier: bonusEndMultiplier
    });
    bumpAgg(bonusPhaseDistribution, bonusPhaseBucket, bonusPhaseTbm, bonusWin);
    bonusRounds += 1;
    bonusWinsPerBonusRound.push(bonusWin);
    totalBonusPhaseWin += bonusWin;
    totalRoundWinWhenBonus += safeWin;

    // Full round TBM at game over + ability loadout from last bonus-phase state.
    bonusEndTbmValues.push(roundTbm);

    const abilities = readBonusAbilities(bonusSnapshot);
    const abilityTotal = totalAbilityLevels(abilities);
    bonusEndAbilityTotals.push(abilityTotal);
    bumpAgg(tbmByTotalAbilityLevels, abilityTotal, roundTbm, safeWin);
    bumpAgg(tbmByAbilityKey, abilityKey(abilities), roundTbm, safeWin);
    bumpAgg(tbmByDivineXLevel, abilities.divineX, roundTbm, safeWin);
    bumpAgg(tbmByDivineStrikeLevel, abilities.divineStrike, roundTbm, safeWin);
    bumpAgg(tbmByDivineChargeLevel, abilities.divineCharge, roundTbm, safeWin);

    bonusEndKillCounts.push(bonusDemonKillCount);
  } else {
    noBonusStats.count += 1;
    noBonusStats.sumTbm += roundTbm;
    noBonusStats.sumPayout += safeWin;
  }

  if (progressEvery > 0 && i % progressEvery === 0) {
    const elapsedSec = (performance.now() - startedAt) / 1000;
    console.log(
      `[sim] processed ${i}/${rounds} rounds in ${elapsedSec.toFixed(1)}s (completed: ${completedRounds}, failed: ${failedRounds})`
    );
  }
}

const elapsedMs = performance.now() - startedAt;
const averageWin = completedRounds > 0 ? totalPayout / completedRounds : 0;
const averageTbm = meanOf(tbmValues);
const rtp = totalStake > 0 ? (totalPayout / totalStake) * 100 : 0;
const hitRate = completedRounds > 0 ? hitRounds / completedRounds : 0;
const mainGameRtpPercent = totalStake > 0 ? (totalMainGameWin / totalStake) * 100 : 0;
const bonusPhaseRtpPercent = totalStake > 0 ? (totalBonusPhaseWin / totalStake) * 100 : 0;

wins.sort((a, b) => a - b);
const medianWin = wins.length ? wins[Math.floor((wins.length - 1) / 2)] : 0;

const payoutVariance = populationVariance(wins, averageWin);
const payoutStdDev = Math.sqrt(payoutVariance);
const tbmVariance = populationVariance(tbmValues, averageTbm);
const tbmStdDev = Math.sqrt(tbmVariance);

const avgMainGameWin = meanOf(mainGameWinsPerRound);
const mainGameVariance = populationVariance(mainGameWinsPerRound, avgMainGameWin);
const mainGameStdDev = Math.sqrt(mainGameVariance);

const avgBonusPhaseWin = meanOf(bonusWinsPerBonusRound);
const bonusWinVariance = populationVariance(bonusWinsPerBonusRound, avgBonusPhaseWin);
const bonusWinStdDev = Math.sqrt(bonusWinVariance);

const avgBonusEndTbm = meanOf(bonusEndTbmValues);
const avgBonusEndKillCount = meanOf(bonusEndKillCounts);
const avgBonusEndAbilityTotal = meanOf(bonusEndAbilityTotals);

const gameOverAbilityStats = {
  description:
    "Correlational: full round TBM/payout grouped by ability levels on the last bonus-phase state. Shows which loadouts tended to finish with strong runs — not direct causal RTP per ability.",
  averageTbm: bonusRounds > 0 ? twoDecimals(avgBonusEndTbm) : 0,
  averageKillCount: bonusRounds > 0 ? twoDecimals(avgBonusEndKillCount) : 0,
  averageTotalAbilityLevels: bonusRounds > 0 ? twoDecimals(avgBonusEndAbilityTotal) : 0,
  byLoadout: buildTbmBucketRows(tbmByAbilityKey, { totalStake, bonusRounds }),
  byTotalAbilityLevels: buildTbmBucketRows(tbmByTotalAbilityLevels, { totalStake, bonusRounds }),
  byDivineXLevel: buildTbmBucketRows(tbmByDivineXLevel, { totalStake, bonusRounds }),
  byDivineStrikeLevel: buildTbmBucketRows(tbmByDivineStrikeLevel, { totalStake, bonusRounds }),
  byDivineChargeLevel: buildTbmBucketRows(tbmByDivineChargeLevel, { totalStake, bonusRounds }),
  topLoadoutsByAvgTbm:
    bonusRounds > 0
      ? buildTbmBucketRows(tbmByAbilityKey, { totalStake, bonusRounds })
          .filter((row) => row.rounds >= 5)
          .sort((a, b) => b.averageTbm - a.averageTbm)
          .slice(0, 10)
      : []
};

const bonusRatePercent =
  completedRounds > 0 ? twoDecimals((bonusRounds / completedRounds) * 100) : 0;

const abilityRtpRows = buildAbilityRtpRows(abilityContributionTBM, abilityContributionPayout, totalStake);
const trackedAbilityRtpPercent = abilityRtpRows.reduce((sum, row) => sum + row.rtpPercent, 0);

const finalTbmDistributionRows = buildBonusDistributionRows(finalTbmDistribution, {
  totalStake,
  completedRounds,
  bonusRounds
});

const bonusPhaseDistributionRows = buildFinalTbmDistributionRows(bonusPhaseDistribution, {
  totalStake,
  completedRounds,
  bonusRounds
});

const noBonusSummary = buildStatSummary(noBonusStats, { totalStake, completedRounds });

const report = {
  config: {
    roundsRequested: rounds,
    betSize,
    ticketStrategy: resolvedTicketStrategy,
    requestedTicketStrategy: ticketStrategy,
    availableTicketStrategies,
    playBackEnd: serverConfig.playBackEnd === true,
    fakeNoWins,
    outputPathTemplate,
    resolvedOutputPath: outputPath
  },
  runtime: {
    completedRounds,
    failedRounds,
    durationMs: Number(elapsedMs.toFixed(2))
  },
  metrics: {
    totalStake: Number(totalStake.toFixed(4)),
    totalPayout: Number(totalPayout.toFixed(4)),
    rtpPercent: fourDecimals(rtp),
    mainGameRtpPercent: fourDecimals(mainGameRtpPercent),
    bonusPhaseRtpPercent: fourDecimals(bonusPhaseRtpPercent),
    averageWin: Number(averageWin.toFixed(4)),
    averageTbm: Number(averageTbm.toFixed(4)),
    medianWin: Number(medianWin.toFixed(4)),
    maxWin: Number(maxWin.toFixed(4)),
    maxTbm: Number(maxTbm.toFixed(4)),
    hitRate: fourDecimals(hitRate),
    hitRounds,
    noHitRounds,
    hitRatioDefinition: "rounds with tbm > 0 / completed rounds",
    payoutVariance: Number(payoutVariance.toFixed(6)),
    payoutStdDev: Number(payoutStdDev.toFixed(6)),
    tbmVariance: Number(tbmVariance.toFixed(6)),
    tbmStdDev: Number(tbmStdDev.toFixed(6))
  },
  abilities: {
    atGameOver: gameOverAbilityStats,
    lootSourceAtCollect: {
      description:
        "Diagnostic only: at Collect Phase settlement, loot drops are tagged by which ability killed the demon. Splits collect TBM proportionally by loot base value. Overlaps (one drop, global multiplier) and indirect effects (divineX → more kills → more loot) are not fully captured. Sum can exceed bonus RTP.",
      procTotals: abilityProcTotals,
      contributionTbm: Object.fromEntries(
        ABILITY_KEYS.map((key) => [key, fourDecimals(abilityContributionTBM[key])])
      ),
      contributionPayout: Object.fromEntries(
        ABILITY_KEYS.map((key) => [key, fourDecimals(abilityContributionPayout[key])])
      ),
      rtpByLootSource: abilityRtpRows,
      trackedLootSourceRtpPercent: fourDecimals(trackedAbilityRtpPercent)
    }
  },
  mainGameSpinRespin: {
    description: "Per completed round: win attributed to main-game actions (spin/respin) before bonus phase",
    sampleCount: completedRounds,
    averageWin: Number(avgMainGameWin.toFixed(6)),
    maxWin: Number(maxMainGameWin.toFixed(6)),
    maxMultiplier: maxMainGameAngelMultiplier,
    maxAngelMultiplier: maxMainGameAngelMultiplier,
    variance: Number(mainGameVariance.toFixed(6)),
    stdDev: Number(mainGameStdDev.toFixed(6))
  },
  bonus: {
    bonusRounds,
    bonusDetection:
      "server.hasBonus(states): any state with executedAction bonustransition/freespin/freerespin/freespinbananaHunt, isBonus, or bgwe",
    bonusFrequency:
      bonusRounds > 0
        ? `1/${Number((completedRounds / bonusRounds).toFixed(2))}`
        : "N/A",
    bonusRatePercent,
    averageBonusPhaseWin:
      bonusRounds > 0 ? Number((totalBonusPhaseWin / bonusRounds).toFixed(4)) : 0,
    maxWin: Number(maxBonusGameWin.toFixed(6)),
    averageRoundWinWhenBonus:
      bonusRounds > 0 ? Number((totalRoundWinWhenBonus / bonusRounds).toFixed(4)) : 0,
    bonusPhaseWinVariance: Number(bonusWinVariance.toFixed(6)),
    bonusPhaseWinStdDev: Number(bonusWinStdDev.toFixed(6)),
    noBonus: {
      description: "Rounds that never entered bonus.",
      ...noBonusSummary
    },
    finalTbmDistribution: {
      description: "Bonus rounds only. Full round final TBM. zero = exactly 0; aboveZero = final TBM > 0.",
      ...finalTbmDistributionRows
    },
    bonusPhaseDistribution: {
      description:
        "Bonus rounds only. Win earned during bonus phase (twa while isBonus), bucketed by bonus-phase TBM (bonusWin / betSize).",
      ...distributionToKeyedObject(bonusPhaseDistributionRows)
    },
    description:
      "bonusPhaseWin* = twa while isBonus; averageRoundWinWhenBonus = full round twa when bonus occurred."
  },
  generatedAt: new Date().toISOString()
};

const resolvedOutputPath = path.resolve(process.cwd(), outputPath);
fs.mkdirSync(path.dirname(resolvedOutputPath), { recursive: true });
fs.writeFileSync(resolvedOutputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

console.log("\n========== Simulation Complete ==========");
console.log(`Rounds requested: ${rounds}`);
console.log(`Rounds completed: ${completedRounds}`);
console.log(`Rounds failed:    ${failedRounds}`);
console.log(`Strategy:         ${resolvedTicketStrategy}${resolvedTicketStrategy !== ticketStrategy ? ` (requested: ${ticketStrategy})` : ""}`);
console.log(`Total stake:      ${report.metrics.totalStake}`);
console.log(`Total payout:     ${report.metrics.totalPayout}`);
console.log(`RTP:              ${report.metrics.rtpPercent}%`);
console.log(`  Main game RTP:  ${report.metrics.mainGameRtpPercent}%`);
console.log(`  Bonus phase RTP:${report.metrics.bonusPhaseRtpPercent}%`);
console.log(`Hit rate (tbm):   ${report.metrics.hitRate} (${report.metrics.hitRounds} hit / ${report.metrics.noHitRounds} no-hit)`);
console.log(`Avg TBM:          ${report.metrics.averageTbm}`);
console.log(`Payout var/std:   ${report.metrics.payoutVariance} / ${report.metrics.payoutStdDev}`);
console.log(`TBM var/std:      ${report.metrics.tbmVariance} / ${report.metrics.tbmStdDev}`);
console.log(`Max win:          ${report.metrics.maxWin}`);
console.log(`Max TBM:          ${report.metrics.maxTbm}`);
console.log(`Bonus rounds:     ${report.bonus.bonusRounds}`);
console.log(`Bonus frequency:  ${report.bonus.bonusFrequency}`);
console.log(`Bonus rate:       ${report.bonus.bonusRatePercent}% of completed rounds`);
console.log("--- No bonus ---");
console.log(
  `  ${String(report.bonus.noBonus.rounds).padStart(6)} rounds  (${report.bonus.noBonus.shareOfAllRoundsPercent}% all, avg TBM ${report.bonus.noBonus.averageTbm}, RTP ${report.bonus.noBonus.rtpPercent}%)`
);
console.log("--- Bonus final TBM ---");
const printBonusTbmRow = (row) => {
  console.log(
    `  ${row.label.padEnd(14)} ${String(row.rounds).padStart(6)} rounds  (${row.shareOfBonusesPercent}% of bonuses, RTP ${row.rtpPercent}%)`
  );
};
printBonusTbmRow(report.bonus.finalTbmDistribution.zero);
report.bonus.finalTbmDistribution.aboveZero.forEach((row) => {
  if (row.rounds <= 0) return;
  printBonusTbmRow(row);
});
console.log("--- Bonus phase win only (bonus TBM buckets) ---");
const phaseDist = report.bonus.bonusPhaseDistribution;
if (phaseDist["0"]) {
  printBonusTbmRow({ label: phaseDist["0"].label || "0", ...phaseDist["0"] });
}
Object.keys(phaseDist)
  .filter((key) => key !== "description" && key !== "0")
  .forEach((key) => {
    const row = phaseDist[key];
    if (row.rounds <= 0) return;
    printBonusTbmRow({ label: row.label || key, ...row });
  });
if (bonusRounds > 0) {
  console.log("--- Abilities at game over (full round TBM by final loadout) ---");
  console.log(`  Avg round TBM when bonus: ${report.abilities.atGameOver.averageTbm}`);
  console.log(`  Avg kills at game over:   ${report.abilities.atGameOver.averageKillCount}`);
  console.log("  Per ability level (X / Strike / Charge):");
  const printLevelRow = (label, rows) => {
    if (!rows.length) return;
    const summary = rows.map((r) => `L${r.key}: avgTBM ${r.averageTbm} (${r.rounds}r, ${r.rtpPercent}% RTP)`).join(" | ");
    console.log(`    ${label}: ${summary}`);
  };
  printLevelRow("divineX     ", report.abilities.atGameOver.byDivineXLevel);
  printLevelRow("divineStrike", report.abilities.atGameOver.byDivineStrikeLevel);
  printLevelRow("divineCharge", report.abilities.atGameOver.byDivineChargeLevel);
  if (report.abilities.atGameOver.topLoadoutsByAvgTbm.length > 0) {
    console.log("  Top loadouts (min 5 rounds, by avg TBM):");
    report.abilities.atGameOver.topLoadoutsByAvgTbm.slice(0, 5).forEach((row) => {
      console.log(
        `    ${String(row.key).padEnd(12)} avgTBM ${String(row.averageTbm).padStart(8)}  RTP ${String(row.rtpPercent).padStart(6)}%  (${row.rounds} rounds)`
      );
    });
  }
}
console.log("--- Loot source at collect (diagnostic, not causal RTP) ---");
report.abilities.lootSourceAtCollect.rtpByLootSource.forEach((row) => {
  const procCount = report.abilities.lootSourceAtCollect.procTotals[row.ability];
  const procLabel = procCount === undefined ? "—" : procCount;
  const isCoreAbility = row.ability === "divineX" || row.ability === "divineStrike" || row.ability === "divineCharge";
  if (row.totalContributionTbm > 0 || isCoreAbility) {
    console.log(
      `  ${row.ability.padEnd(13)} collect ${String(row.rtpPercent).padStart(8)}%  (TBM ${row.totalContributionTbm}, procs ${procLabel})`
    );
  }
});
console.log(`  Loot-source sum: ${report.abilities.lootSourceAtCollect.trackedLootSourceRtpPercent}% (can exceed bonus RTP)`);
console.log(`Main game var/std:   ${report.mainGameSpinRespin.variance} / ${report.mainGameSpinRespin.stdDev}`);
console.log(`Bonus phase var/std: ${report.bonus.bonusPhaseWinVariance} / ${report.bonus.bonusPhaseWinStdDev}`);
console.log(`Output:           ${resolvedOutputPath}`);
console.log("========================================\n");
