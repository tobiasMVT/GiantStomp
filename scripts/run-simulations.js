import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";

import simulationConfig from "../src/game-server/simulation_config.json" with { type: "json" };
import serverConfig from "../src/game-server/server_config.json" with { type: "json" };
import { GameServer } from "../src/game-server/Gameserver.js";

const twoDecimals = (n) => Number(Number(n).toFixed(2));
const fourDecimals = (n) => Number(Number(n).toFixed(4));

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

/** Attribute each twa step to main (paid spin) vs bonus using previous state's isBonus. */
const splitRoundTwaByPhase = (states) => {
  let mainGameWin = 0;
  let bonusWin = 0;
  let prevTwa = 0;
  let prevInBonus = false;

  for (const state of states) {
    const twa = Number(state?.twa) || 0;
    const delta = twa - prevTwa;
    if (prevInBonus) bonusWin += delta;
    else mainGameWin += delta;
    prevTwa = twa;
    prevInBonus = state?.isBonus === true;
  }

  return { mainGameWin, bonusWin };
};

const readMainGameWinComponents = (state) => {
  const components = {
    normal: 0,
    golfswing: 0,
    superGolfswing: 0,
    party: 0,
    crush: 0,
    stomp: 0,
  };

  if (state?.isBonus) return components;

  components.stomp = Number(state?.stompEvent?.coinWin) || 0;
  components.crush = Number(state?.crushEvent?.coinWin) || 0;
  if (state?.golfswingEvent?.hit) {
    const jackpotWin = Number(state.golfswingEvent.jackpotWin) || 0;
    if (state.golfswingEvent.isSuperGolfswing === true) {
      components.superGolfswing = jackpotWin;
    } else {
      components.golfswing = jackpotWin;
    }
  }

  const waysWin = Number(state?.winAmount ?? state?.result?.winAmount) || 0;
  if (state?.partyEvent?.triggered) components.party = waysWin;
  else components.normal = waysWin;

  return components;
};

const isSuperBonusRound = (states) =>
  states.some((state) =>
    state?.superBonusTriggered === true || state?.bonusState?.isSuperBonus === true);

/** Split round payout into main-game sources and bonus phase (regular vs super). */
const splitRoundWinBySource = (states) => {
  const mainGame = {
    normal: 0,
    golfswing: 0,
    superGolfswing: 0,
    party: 0,
    crush: 0,
    stomp: 0,
  };
  const bonus = {
    regular: 0,
    superBonus: 0,
  };

  for (const state of states) {
    const components = readMainGameWinComponents(state);
    mainGame.normal += components.normal;
    mainGame.golfswing += components.golfswing;
    mainGame.superGolfswing += components.superGolfswing;
    mainGame.party += components.party;
    mainGame.crush += components.crush;
    mainGame.stomp += components.stomp;
  }

  const superBonusRound = isSuperBonusRound(states);
  let prevTwa = 0;
  let prevInBonus = false;

  for (const state of states) {
    const twa = Number(state?.twa) || 0;
    const delta = twa - prevTwa;
    if (prevInBonus) {
      if (superBonusRound) bonus.superBonus += delta;
      else bonus.regular += delta;
    }
    prevTwa = twa;
    prevInBonus = state?.isBonus === true;
  }

  return { mainGame, bonus, superBonusRound };
};

const buildRtpSourceEntry = ({
  totalPayout,
  totalStake,
  sampleCount,
  parentPayout = null,
}) => {
  const rtpPercent = totalStake > 0 ? (totalPayout / totalStake) * 100 : 0;
  const averageWin = sampleCount > 0 ? totalPayout / sampleCount : 0;
  const sharePercent = parentPayout > 0 ? (totalPayout / parentPayout) * 100 : null;

  return {
    totalPayout: Number(totalPayout.toFixed(4)),
    rtpPercent: fourDecimals(rtpPercent),
    averageWin: Number(averageWin.toFixed(6)),
    sampleCount,
    sharePercent: sharePercent === null ? null : fourDecimals(sharePercent),
  };
};

const meanOf = (values) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0);

const populationVariance = (values, mean) =>
  values.length ? values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length : 0;

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

const countAnimalsCrushedInRound = (states) => {
  let count = 0;
  for (const state of states) {
    for (const cell of state.stompEvent?.crushedCells || []) {
      if (cell?.isAnimal) count += 1;
    }
    for (const cell of state.crushEvent?.crushedCells || []) {
      if (cell?.isAnimal) count += 1;
    }
  }
  return count;
};

const readBonusTrapPower = (states, lastState) => {
  const fromSummary = Number(lastState?.roundSummary?.trapPower);
  if (Number.isFinite(fromSummary) && fromSummary >= 0) return fromSummary;

  const lastBonusState = [...states].reverse().find((state) => state.isBonus);
  const fromOuch = Number(lastBonusState?.ouchStompEvent?.trapPower);
  if (Number.isFinite(fromOuch) && fromOuch >= 0) return fromOuch;

  return Number(lastBonusState?.trapMeter?.power) || 0;
};

const readFinalMultiplier = (states) => {
  const lastBonusState = [...states].reverse().find((state) => state.isBonus);
  const ouchEvent = lastBonusState?.ouchStompEvent;
  if (!ouchEvent?.triggered) return null;
  const multiplier = Number(ouchEvent.finalMultiplier);
  return Number.isFinite(multiplier) ? multiplier : null;
};

const formatFrequency = (count, total) =>
  count > 0 ? `1/${Number((total / count).toFixed(2))}` : "N/A";

const MAIN_GAME_WIN_BUCKETS = [
  { label: "0", test: (value) => value === 0 },
  { label: ">0 to <1", test: (value) => value > 0 && value < 1 },
  { label: "1 to <5", test: (value) => value >= 1 && value < 5 },
  { label: "5 to <10", test: (value) => value >= 5 && value < 10 },
  { label: "10 to <15", test: (value) => value >= 10 && value < 15 },
  { label: "15 to <20", test: (value) => value >= 15 && value < 20 },
  { label: "20 to <25", test: (value) => value >= 20 && value < 25 },
  { label: "25 to <30", test: (value) => value >= 25 && value < 30 },
  { label: "30 to <40", test: (value) => value >= 30 && value < 40 },
  { label: "40 to <50", test: (value) => value >= 40 && value < 50 },
  { label: "50 to <60", test: (value) => value >= 50 && value < 60 },
  { label: "60 to <70", test: (value) => value >= 60 && value < 70 },
  { label: "70 to <80", test: (value) => value >= 70 && value < 80 },
  { label: "80 to <90", test: (value) => value >= 80 && value < 90 },
  { label: "90 to <100", test: (value) => value >= 90 && value < 100 },
  { label: "100+", min: 100, test: (value) => value >= 100 },
];

const makeRangeBucket = (start, end) => ({
  label: `${start} to <${end}`,
  min: start,
  test: (value) => value >= start && value < end,
});

const buildBonusWinBuckets = () => {
  const buckets = [];

  for (let start = 0; start < 200; start += 10) {
    buckets.push(makeRangeBucket(start, start + 10));
  }

  for (let start = 200; start < 1000; start += 50) {
    buckets.push(makeRangeBucket(start, start + 50));
  }

  for (let start = 1000; start < 2000; start += 100) {
    buckets.push(makeRangeBucket(start, start + 100));
  }

  for (let start = 2000; start < 3000; start += 200) {
    buckets.push(makeRangeBucket(start, start + 200));
  }

  for (let start = 3000; start < 10000; start += 500) {
    buckets.push(makeRangeBucket(start, start + 500));
  }

  buckets.push({
    label: "10000+",
    min: 10000,
    test: (value) => value >= 10000,
  });

  return buckets;
};

const BONUS_WIN_BUCKETS = buildBonusWinBuckets();

const TRAP_POWER_BUCKETS = (() => {
  const buckets = [];
  for (let start = 0; start < 20; start += 1) {
    buckets.push(makeRangeBucket(start, start + 1));
  }
  for (let start = 20; start < 400; start += 20) {
    buckets.push(makeRangeBucket(start, start + 20));
  }
  buckets.push({
    label: "400+",
    min: 400,
    test: (value) => value >= 400,
  });
  return buckets;
})();

const FINAL_MULTIPLIER_VALUES = [...new Set(
  (serverConfig.damageWheelSegments || []).map(Number).filter(Number.isFinite)
)].sort((left, right) => left - right);

const FINAL_MULTIPLIER_BUCKETS = [
  {
    label: "none",
    test: (value) => value === null || value === undefined,
  },
  ...FINAL_MULTIPLIER_VALUES.map((multiplier) => ({
    label: String(multiplier),
    min: multiplier,
    test: (value) => Number(value) === multiplier,
  })),
  {
    label: "other",
    test: (value) => value !== null
      && value !== undefined
      && !FINAL_MULTIPLIER_VALUES.includes(Number(value)),
  },
];

const getPercentAtOrAbove = (values, minThreshold, sampleCount, { normalizeValue = (v) => v } = {}) => {
  if (sampleCount <= 0 || minThreshold === null || minThreshold === undefined) return null;
  const threshold = Number(minThreshold);
  const atOrAbove = values.reduce((count, rawValue) => {
    const value = normalizeValue(rawValue);
    return count + (Number(value) >= threshold ? 1 : 0);
  }, 0);
  return fourDecimals((atOrAbove / sampleCount) * 100);
};

const buildWinDistribution = (values, buckets, sampleCount, {
  normalizeValue = (rawValue) => Number(rawValue) || 0,
  cumulative = "range",
} = {}) => {
  const counts = buckets.map(() => 0);
  let unmatched = 0;

  for (const rawValue of values) {
    const value = normalizeValue(rawValue);
    const bucketIndex = buckets.findIndex((bucket) => bucket.test(value));
    if (bucketIndex >= 0) counts[bucketIndex] += 1;
    else unmatched += 1;
  }

  return {
    sampleCount,
    unmatched,
    percentAtOrAboveDefinition: "Share of samples at this bucket's threshold or higher.",
    buckets: buckets.map((bucket, index) => {
      const count = counts[index];
      let percentAtOrAbove = null;

      if (cumulative === "range") {
        const atOrAboveCount = counts.slice(index).reduce((sum, entry) => sum + entry, 0);
        percentAtOrAbove = sampleCount > 0
          ? fourDecimals((atOrAboveCount / sampleCount) * 100)
          : 0;
      } else if (cumulative === "min" && bucket.min !== undefined) {
        percentAtOrAbove = getPercentAtOrAbove(values, bucket.min, sampleCount, { normalizeValue });
      }

      return {
        label: bucket.label,
        count,
        percent: sampleCount > 0 ? fourDecimals((count / sampleCount) * 100) : 0,
        percentAtOrAbove,
        frequency: formatFrequency(count, sampleCount),
      };
    }),
  };
};

const printWinDistribution = (title, distribution) => {
  const labelWidth = Math.max(
    12,
    ...distribution.buckets.map((bucket) => bucket.label.length)
  );
  const includesConditionalMultiplier = distribution.buckets.some(
    (bucket) => Object.hasOwn(bucket, "averageFinalMultiplier")
  );
  console.log(`\n${title} (n=${distribution.sampleCount})`);
  console.log(
    `  ${"".padEnd(labelWidth)} ${"count".padStart(8)}  ${"in".padStart(7)}%  ${">=".padStart(7)}%  frequency${includesConditionalMultiplier ? "  avg mult" : ""}`
  );
  for (const bucket of distribution.buckets) {
    const atOrAbove = bucket.percentAtOrAbove === null
      ? "    n/a"
      : String(bucket.percentAtOrAbove).padStart(7);
    const conditionalMultiplier = includesConditionalMultiplier
      ? `  ${bucket.averageFinalMultiplier === null ? "n/a" : `${bucket.averageFinalMultiplier}x`.padStart(8)}`
      : "";
    console.log(
      `  ${bucket.label.padEnd(labelWidth)} ${String(bucket.count).padStart(8)}  ${String(bucket.percent).padStart(7)}%  ${atOrAbove}%  ${bucket.frequency}${conditionalMultiplier}`
    );
  }
  if (distribution.unmatched > 0) {
    console.log(`  unmatched: ${distribution.unmatched}`);
  }
};

const buildPhaseStats = ({
  wins,
  totalPayout,
  totalStake,
  sampleCount,
  maxWin = 0
}) => {
  const averageWin = sampleCount > 0 ? totalPayout / sampleCount : 0;
  const variance = populationVariance(wins, averageWin);
  const stdDev = Math.sqrt(variance);
  const rtpPercent = totalStake > 0 ? (totalPayout / totalStake) * 100 : 0;

  return {
    sampleCount,
    totalPayout: Number(totalPayout.toFixed(4)),
    rtpPercent: fourDecimals(rtpPercent),
    averageWin: Number(averageWin.toFixed(6)),
    maxWin: Number(maxWin.toFixed(6)),
    variance: Number(variance.toFixed(6)),
    stdDev: Number(stdDev.toFixed(6))
  };
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
const mainGameWinsPerRound = [];
const bonusWinsPerBonusRound = [];
const trapPowerPerBonusRound = [];
const finalMultiplierPerBonusRound = [];
const animalsCrushedPerRound = [];
const animalsCrushedInBonusRounds = [];
const animalsCrushedBetweenBonuses = [];
const paidSpinsBetweenBonuses = [];

let totalStake = 0;
let totalPayout = 0;
let totalMainGameWin = 0;
let totalBonusWin = 0;
let totalMainGameNormalWin = 0;
let totalMainGameGolfswingWin = 0;
let totalMainGameSuperGolfswingWin = 0;
let totalMainGamePartyWin = 0;
let totalMainGameCrushWin = 0;
let totalMainGameStompWin = 0;
let totalRegularBonusWin = 0;
let totalSuperBonusWin = 0;
let completedRounds = 0;
let failedRounds = 0;
let hitRounds = 0;
let noHitRounds = 0;
let maxWin = 0;
let maxMainGameWin = 0;
let maxBonusWin = 0;

let bonusRounds = 0;
let superBonusRounds = 0;
let stompFeatureRounds = 0;
let crushFeatureRounds = 0;
let partyFeatureRounds = 0;
let golfswingFeatureRounds = 0;
let golfswingHitRounds = 0;
let golfswingMissRounds = 0;
let totalGolfswingJackpotWin = 0;
const golfswingJackpotSegmentCounts = {};
let unicornOnGameAreaRounds = 0;
let unicornSuperBonusRounds = 0;
let totalAnimalsCrushed = 0;
let totalAnimalsCrushedInBonusRounds = 0;
let totalTrapPower = 0;
let maxTrapPower = 0;

let animalsAccumulatedSinceLastBonus = 0;
let paidSpinsSinceLastBonus = 0;

const startedAt = performance.now();

if (fakeNoWins) {
  originalConsoleLog(
    "[sim] fakeNoWins enabled — drawn noWin tickets use a synthetic zero-win spin instead of RNG."
  );
  originalConsoleLog(
    "[sim] RTP/hit-rate metrics will stay near zero unless stomp/crush coin wins or bonus entry occur on those spins."
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

  const safeStake = Number.isFinite(roundStake) ? roundStake : betSize;
  const safeWin = Number.isFinite(roundWin) ? roundWin : 0;

  totalStake += safeStake;
  totalPayout += safeWin;
  wins.push(safeWin);
  tbmValues.push(roundTbm);
  completedRounds += 1;
  maxWin = Math.max(maxWin, safeWin);

  if (roundTbm > 0) hitRounds += 1;
  else noHitRounds += 1;

  const { mainGameWin, bonusWin } = splitRoundTwaByPhase(states);
  mainGameWinsPerRound.push(mainGameWin);
  totalMainGameWin += mainGameWin;
  maxMainGameWin = Math.max(maxMainGameWin, mainGameWin);
  maxBonusWin = Math.max(maxBonusWin, bonusWin);

  const winBySource = splitRoundWinBySource(states);
  totalMainGameNormalWin += winBySource.mainGame.normal;
  totalMainGameGolfswingWin += winBySource.mainGame.golfswing;
  totalMainGameSuperGolfswingWin += winBySource.mainGame.superGolfswing;
  totalMainGamePartyWin += winBySource.mainGame.party;
  totalMainGameCrushWin += winBySource.mainGame.crush;
  totalMainGameStompWin += winBySource.mainGame.stomp;

  const animalsCrushed = countAnimalsCrushedInRound(states);
  animalsCrushedPerRound.push(animalsCrushed);
  totalAnimalsCrushed += animalsCrushed;

  if (server.hasStomp(states)) stompFeatureRounds += 1;
  if (server.hasCrush(states)) crushFeatureRounds += 1;
  if (server.hasParty(states)) partyFeatureRounds += 1;

  if (server.hasGolfswing(states)) {
    golfswingFeatureRounds += 1;
    const swingState = states.find((state) => state.golfswingEvent?.triggered);
    const swingEvent = swingState?.golfswingEvent;
    if (swingEvent?.hit) {
      golfswingHitRounds += 1;
      const jackpotWin = Number(swingEvent.jackpotWin) || 0;
      totalGolfswingJackpotWin += jackpotWin;
      const segment = String(swingEvent.jackpotSegment ?? 0);
      golfswingJackpotSegmentCounts[segment] = (golfswingJackpotSegmentCounts[segment] || 0) + 1;
    } else {
      golfswingMissRounds += 1;
    }
  }

  const hadUnicornOnBoard = server.hasUnicornOnGameArea(states);
  if (hadUnicornOnBoard) unicornOnGameAreaRounds += 1;

  const hadSuperBonus = server.hasSuperBonus(states);
  if (hadSuperBonus) superBonusRounds += 1;
  if (hadUnicornOnBoard && hadSuperBonus) unicornSuperBonusRounds += 1;

  const hadBonus = server.hasBonus(states);
  if (hadBonus) {
    bonusRounds += 1;
    bonusWinsPerBonusRound.push(bonusWin);
    totalBonusWin += bonusWin;
    if (winBySource.superBonusRound) {
      totalSuperBonusWin += winBySource.bonus.superBonus;
    } else {
      totalRegularBonusWin += winBySource.bonus.regular;
    }
    const trapPower = readBonusTrapPower(states, lastState);
    trapPowerPerBonusRound.push(trapPower);
    totalTrapPower += trapPower;
    maxTrapPower = Math.max(maxTrapPower, trapPower);
    finalMultiplierPerBonusRound.push(readFinalMultiplier(states));
    animalsCrushedInBonusRounds.push(animalsCrushed);
    totalAnimalsCrushedInBonusRounds += animalsCrushed;
    animalsCrushedBetweenBonuses.push(animalsAccumulatedSinceLastBonus + animalsCrushed);
    paidSpinsBetweenBonuses.push(paidSpinsSinceLastBonus + 1);
    animalsAccumulatedSinceLastBonus = 0;
    paidSpinsSinceLastBonus = 0;
  } else {
    animalsAccumulatedSinceLastBonus += animalsCrushed;
    paidSpinsSinceLastBonus += 1;
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
const rtp = totalStake > 0 ? (totalPayout / totalStake) * 100 : 0;
const hitRate = completedRounds > 0 ? hitRounds / completedRounds : 0;

wins.sort((a, b) => a - b);
const medianWin = wins.length ? wins[Math.floor((wins.length - 1) / 2)] : 0;
const payoutVariance = populationVariance(wins, averageWin);
const payoutStdDev = Math.sqrt(payoutVariance);

const mainGameStats = buildPhaseStats({
  wins: mainGameWinsPerRound,
  totalPayout: totalMainGameWin,
  totalStake,
  sampleCount: completedRounds,
  maxWin: maxMainGameWin
});

const bonusStats = buildPhaseStats({
  wins: bonusWinsPerBonusRound,
  totalPayout: totalBonusWin,
  totalStake,
  sampleCount: bonusRounds,
  maxWin: maxBonusWin
});

const mainGameWinDistribution = buildWinDistribution(
  mainGameWinsPerRound,
  MAIN_GAME_WIN_BUCKETS,
  completedRounds
);

const bonusWinDistribution = buildWinDistribution(
  bonusWinsPerBonusRound,
  BONUS_WIN_BUCKETS,
  bonusRounds
);

const averageTrapPower = bonusRounds > 0 ? totalTrapPower / bonusRounds : 0;
const averageFinalMultiplier = bonusRounds > 0
  ? finalMultiplierPerBonusRound.reduce((sum, multiplier) => sum + (Number(multiplier) || 0), 0) / bonusRounds
  : 0;

const trapPowerDistribution = buildWinDistribution(
  trapPowerPerBonusRound,
  TRAP_POWER_BUCKETS,
  bonusRounds
);

for (const bucket of trapPowerDistribution.buckets) {
  const bucketDefinition = TRAP_POWER_BUCKETS.find(({ label }) => label === bucket.label);
  let multiplierTotal = 0;
  let multiplierSamples = 0;

  for (let index = 0; index < trapPowerPerBonusRound.length; index += 1) {
    if (!bucketDefinition?.test(Number(trapPowerPerBonusRound[index]) || 0)) continue;
    const multiplier = Number(finalMultiplierPerBonusRound[index]);
    if (!Number.isFinite(multiplier)) continue;
    multiplierTotal += multiplier;
    multiplierSamples += 1;
  }

  bucket.averageFinalMultiplier = multiplierSamples > 0
    ? Number((multiplierTotal / multiplierSamples).toFixed(6))
    : null;
}

const finalMultiplierDistribution = buildWinDistribution(
  finalMultiplierPerBonusRound,
  FINAL_MULTIPLIER_BUCKETS,
  bonusRounds,
  {
    normalizeValue: (rawValue) => rawValue ?? null,
    cumulative: "min",
  }
);

const avgAnimalsCrushedPerRound =
  completedRounds > 0 ? totalAnimalsCrushed / completedRounds : 0;
const avgAnimalsCrushedOnBonusTriggerRound =
  bonusRounds > 0 ? totalAnimalsCrushedInBonusRounds / bonusRounds : 0;
const avgAnimalsCrushedBetweenBonuses = meanOf(animalsCrushedBetweenBonuses);
const avgPaidSpinsBetweenBonuses = meanOf(paidSpinsBetweenBonuses);
const animalsCrushedPerBonusRatio =
  totalAnimalsCrushed > 0 ? totalAnimalsCrushedInBonusRounds / totalAnimalsCrushed : 0;

const regularBonusRounds = bonusRounds - superBonusRounds;
const unicornToSuperBonusRate = unicornOnGameAreaRounds > 0
  ? unicornSuperBonusRounds / unicornOnGameAreaRounds
  : 0;

const mainGameRtpDistribution = {
  description: "Main-game RTP split by win source (paid spin phase only). Denominator is total stake across all completed rounds.",
  normalWins: buildRtpSourceEntry({
    totalPayout: totalMainGameNormalWin,
    totalStake,
    sampleCount: completedRounds,
    parentPayout: totalMainGameWin,
  }),
  golfswing: buildRtpSourceEntry({
    totalPayout: totalMainGameGolfswingWin,
    totalStake,
    sampleCount: completedRounds,
    parentPayout: totalMainGameWin,
  }),
  superGolfswing: buildRtpSourceEntry({
    totalPayout: totalMainGameSuperGolfswingWin,
    totalStake,
    sampleCount: completedRounds,
    parentPayout: totalMainGameWin,
  }),
  party: buildRtpSourceEntry({
    totalPayout: totalMainGamePartyWin,
    totalStake,
    sampleCount: completedRounds,
    parentPayout: totalMainGameWin,
  }),
  crush: buildRtpSourceEntry({
    totalPayout: totalMainGameCrushWin,
    totalStake,
    sampleCount: completedRounds,
    parentPayout: totalMainGameWin,
  }),
  stomp: buildRtpSourceEntry({
    totalPayout: totalMainGameStompWin,
    totalStake,
    sampleCount: completedRounds,
    parentPayout: totalMainGameWin,
  }),
  componentTotalPayout: Number(
    (totalMainGameNormalWin
      + totalMainGameGolfswingWin
      + totalMainGameSuperGolfswingWin
      + totalMainGamePartyWin
      + totalMainGameCrushWin
      + totalMainGameStompWin).toFixed(4)
  ),
  attributionNotes: {
    normalWins: "winAmount on paid spins without partyEvent.triggered",
    golfswing: "golfswingEvent.jackpotWin on hit when isSuperGolfswing is false",
    superGolfswing: "golfswingEvent.jackpotWin on hit when unicorn is picked (isSuperGolfswing true)",
    party: "winAmount on paid spins with partyEvent.triggered",
    crush: "crushEvent.coinWin",
    stomp: "stompEvent.coinWin",
  },
};

const bonusRtpDistribution = {
  description: "Bonus RTP split by entry type. Denominator is total stake across all completed rounds.",
  regularBonus: buildRtpSourceEntry({
    totalPayout: totalRegularBonusWin,
    totalStake,
    sampleCount: regularBonusRounds,
    parentPayout: totalBonusWin,
  }),
  superBonus: buildRtpSourceEntry({
    totalPayout: totalSuperBonusWin,
    totalStake,
    sampleCount: superBonusRounds,
    parentPayout: totalBonusWin,
  }),
  componentTotalPayout: Number((totalRegularBonusWin + totalSuperBonusWin).toFixed(4)),
  attributionNotes: {
    regularBonus: "TWA delta while isBonus is true on non-superbonus rounds",
    superBonus: "TWA delta while isBonus is true on superbonus rounds",
  },
};

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
    hitRate: fourDecimals(hitRate),
    hitRounds,
    noHitRounds,
    hitRatioDefinition: "rounds with tbm > 0 / completed rounds",
    averageWin: Number(averageWin.toFixed(6)),
    medianWin: Number(medianWin.toFixed(6)),
    maxWin: Number(maxWin.toFixed(6)),
    payoutVariance: Number(payoutVariance.toFixed(6)),
    payoutStdDev: Number(payoutStdDev.toFixed(6))
  },
  mainGame: {
    description: "Win credited while isBonus is false (paid spin and pre-bonus states).",
    ...mainGameStats,
    rtpDistribution: mainGameRtpDistribution,
    winDistribution: {
      description: "Per-round main-game win (TWA delta while isBonus is false).",
      ...mainGameWinDistribution,
    },
  },
  bonus: {
    description: "Win credited while isBonus is true (bonustransition, freespins, and ouch stomp).",
    bonusRounds,
    bonusDetection: "server.hasBonus(states): any state with executedAction bonustransition",
    bonusFrequency: formatFrequency(bonusRounds, completedRounds),
    bonusRatePercent: completedRounds > 0 ? twoDecimals((bonusRounds / completedRounds) * 100) : 0,
    superBonusRounds,
    superBonusDetection: "server.hasSuperBonus(states): bonustransition with superBonusTriggered",
    superBonusFrequency: formatFrequency(superBonusRounds, completedRounds),
    superBonusRatePercent: completedRounds > 0 ? twoDecimals((superBonusRounds / completedRounds) * 100) : 0,
    regularBonusRounds,
    regularBonusFrequency: formatFrequency(regularBonusRounds, completedRounds),
    regularBonusRatePercent: completedRounds > 0 ? twoDecimals((regularBonusRounds / completedRounds) * 100) : 0,
    rtpDistribution: bonusRtpDistribution,
    ...bonusStats,
    winDistribution: {
      description: "Per bonus-round win (TWA delta while isBonus is true). Buckets: 10-wide to 200, 50-wide to 1000, 100-wide to 2000, 200-wide to 3000, 500-wide to 10000, then 10000+.",
      ...bonusWinDistribution,
    },
    trapPower: {
      description: "Trap meter power at bonus end (roundSummary.trapPower / ouchStompEvent.trapPower). Bonus rounds only.",
      average: Number(averageTrapPower.toFixed(6)),
      max: Number(maxTrapPower.toFixed(6)),
      distribution: {
        description: "1-wide buckets from 0 to <20, then 20-wide to <400, then 400+. Each bucket includes the average final multiplier for bonus rounds in that trap-power range.",
        ...trapPowerDistribution,
      },
    },
    finalMultiplier: {
      description: "ouchStompEvent.finalMultiplier — last damage-wheel segment consumed. Bonus rounds only.",
      configuredValues: FINAL_MULTIPLIER_VALUES,
      average: Number(averageFinalMultiplier.toFixed(6)),
      distribution: finalMultiplierDistribution,
    },
  },
  features: {
    stompFeature: {
      triggeredRounds: stompFeatureRounds,
      triggerRatePercent:
        completedRounds > 0 ? twoDecimals((stompFeatureRounds / completedRounds) * 100) : 0,
      frequency: formatFrequency(stompFeatureRounds, completedRounds)
    },
    crushFeature: {
      triggeredRounds: crushFeatureRounds,
      triggerRatePercent:
        completedRounds > 0 ? twoDecimals((crushFeatureRounds / completedRounds) * 100) : 0,
      frequency: formatFrequency(crushFeatureRounds, completedRounds)
    },
    partyFeature: {
      triggeredRounds: partyFeatureRounds,
      triggerRatePercent:
        completedRounds > 0 ? twoDecimals((partyFeatureRounds / completedRounds) * 100) : 0,
      frequency: formatFrequency(partyFeatureRounds, completedRounds)
    },
    golfswingFeature: {
      description: "Main-game golf swing when no stomp/crush/party giant and animals exist on board.",
      detection: "server.hasGolfswing(states): any state with golfswingEvent.triggered",
      configuredOdds: Number(serverConfig.golfswingFeature?.odds ?? 0),
      triggeredRounds: golfswingFeatureRounds,
      triggerRatePercent:
        completedRounds > 0 ? twoDecimals((golfswingFeatureRounds / completedRounds) * 100) : 0,
      frequency: formatFrequency(golfswingFeatureRounds, completedRounds),
      hitRounds: golfswingHitRounds,
      missRounds: golfswingMissRounds,
      hitRatePercent: golfswingFeatureRounds > 0
        ? twoDecimals((golfswingHitRounds / golfswingFeatureRounds) * 100)
        : 0,
      hitRateDefinition: "hit rounds / triggered golfswing rounds",
      totalJackpotWin: Number(totalGolfswingJackpotWin.toFixed(4)),
      averageJackpotWinOnHit: golfswingHitRounds > 0
        ? Number((totalGolfswingJackpotWin / golfswingHitRounds).toFixed(6))
        : 0,
      jackpotSegmentDistribution: Object.keys(golfswingJackpotSegmentCounts)
        .map(Number)
        .filter(Number.isFinite)
        .sort((left, right) => left - right)
        .map((segment) => ({
          segment,
          count: golfswingJackpotSegmentCounts[String(segment)],
          percentOfHits: golfswingHitRounds > 0
            ? fourDecimals((golfswingJackpotSegmentCounts[String(segment)] / golfswingHitRounds) * 100)
            : 0,
        })),
    },
    unicornOnGameArea: {
      description: "Paid spin with symbol 14 visible on reels (unicorn injection or dev ticket board).",
      detection: "server.hasUnicornOnGameArea(states): any paid spin state with unicorn on reels",
      roundsWithUnicorn: unicornOnGameAreaRounds,
      triggerRatePercent:
        completedRounds > 0 ? twoDecimals((unicornOnGameAreaRounds / completedRounds) * 100) : 0,
      frequency: formatFrequency(unicornOnGameAreaRounds, completedRounds),
      superBonusFromUnicornRounds: unicornSuperBonusRounds,
      superBonusFromUnicornRatePercent: fourDecimals(unicornToSuperBonusRate * 100),
      superBonusFromUnicornRateDefinition:
        "share of unicorn-on-board rounds that entered superbonus (unicorn crushed by stomp/crush)"
    },
    animalsCrushed: {
      total: totalAnimalsCrushed,
      averagePerRound: Number(avgAnimalsCrushedPerRound.toFixed(4)),
      averageOnBonusTriggerRound: Number(avgAnimalsCrushedOnBonusTriggerRound.toFixed(4)),
      averageOnBonusTriggerRoundDefinition:
        "avg animals crushed on the single paid spin that entered bonus (stomp/crush kills only)",
      averageBetweenBonuses: Number(avgAnimalsCrushedBetweenBonuses.toFixed(4)),
      averageBetweenBonusesDefinition:
        "avg cumulative animals crushed across paid spins from after the previous bonus until each bonus entry (inclusive)",
      averagePaidSpinsBetweenBonuses: Number(avgPaidSpinsBetweenBonuses.toFixed(4)),
      averagePaidSpinsBetweenBonusesDefinition:
        "avg paid spins between consecutive bonus entries (inclusive of the triggering spin)",
      totalInBonusTriggerRounds: totalAnimalsCrushedInBonusRounds,
      animalsCrushedPerBonusRatio: fourDecimals(animalsCrushedPerBonusRatio),
      animalsCrushedPerBonusRatioDefinition:
        "share of all crushed animals that occurred in rounds that entered bonus"
    }
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
console.log(`Fake no-wins:     ${fakeNoWins}`);
console.log(`Total stake:      ${report.metrics.totalStake}`);
console.log(`Total payout:     ${report.metrics.totalPayout}`);
console.log(`RTP:              ${report.metrics.rtpPercent}%`);
console.log(`Hit rate (tbm):   ${report.metrics.hitRate} (${report.metrics.hitRounds} hit / ${report.metrics.noHitRounds} no-hit)`);
console.log(`Main game RTP:    ${report.mainGame.rtpPercent}%  (avg win ${report.mainGame.averageWin})`);
console.log(`Bonus RTP:        ${report.bonus.rtpPercent}%  (avg win ${report.bonus.averageWin})`);
console.log("\n--- RTP distribution ---");
console.log("Main game:");
console.log(`  Normal wins:    ${report.mainGame.rtpDistribution.normalWins.rtpPercent}%  (payout ${report.mainGame.rtpDistribution.normalWins.totalPayout}, ${report.mainGame.rtpDistribution.normalWins.sharePercent}% of main)`);
console.log(`  Golf swing:     ${report.mainGame.rtpDistribution.golfswing.rtpPercent}%  (payout ${report.mainGame.rtpDistribution.golfswing.totalPayout}, ${report.mainGame.rtpDistribution.golfswing.sharePercent}% of main)`);
console.log(`  Super golfswing: ${report.mainGame.rtpDistribution.superGolfswing.rtpPercent}%  (payout ${report.mainGame.rtpDistribution.superGolfswing.totalPayout}, ${report.mainGame.rtpDistribution.superGolfswing.sharePercent}% of main)`);
console.log(`  Party:          ${report.mainGame.rtpDistribution.party.rtpPercent}%  (payout ${report.mainGame.rtpDistribution.party.totalPayout}, ${report.mainGame.rtpDistribution.party.sharePercent}% of main)`);
console.log(`  Crush:          ${report.mainGame.rtpDistribution.crush.rtpPercent}%  (payout ${report.mainGame.rtpDistribution.crush.totalPayout}, ${report.mainGame.rtpDistribution.crush.sharePercent}% of main)`);
console.log(`  Stomp:          ${report.mainGame.rtpDistribution.stomp.rtpPercent}%  (payout ${report.mainGame.rtpDistribution.stomp.totalPayout}, ${report.mainGame.rtpDistribution.stomp.sharePercent}% of main)`);
console.log("Bonus:");
console.log(`  Regular bonus:  ${report.bonus.rtpDistribution.regularBonus.rtpPercent}%  (payout ${report.bonus.rtpDistribution.regularBonus.totalPayout}, avg win ${report.bonus.rtpDistribution.regularBonus.averageWin}, ${report.bonus.rtpDistribution.regularBonus.sharePercent}% of bonus)`);
console.log(`  Super bonus:    ${report.bonus.rtpDistribution.superBonus.rtpPercent}%  (payout ${report.bonus.rtpDistribution.superBonus.totalPayout}, avg win ${report.bonus.rtpDistribution.superBonus.averageWin}, ${report.bonus.rtpDistribution.superBonus.sharePercent}% of bonus)`);
console.log(`Bonus frequency:  ${report.bonus.bonusFrequency} (${report.bonus.bonusRatePercent}%)`);
console.log(`Superbonus:       ${report.bonus.superBonusFrequency} (${report.bonus.superBonusRatePercent}%, ${report.bonus.superBonusRounds} rounds)`);
console.log(`Regular bonus:    ${report.bonus.regularBonusFrequency} (${report.bonus.regularBonusRatePercent}%, ${report.bonus.regularBonusRounds} rounds)`);
console.log(`Unicorn on board: ${report.features.unicornOnGameArea.frequency} (${report.features.unicornOnGameArea.triggerRatePercent}%, ${report.features.unicornOnGameArea.roundsWithUnicorn} rounds)`);
console.log(`Unicorn→super:    ${report.features.unicornOnGameArea.superBonusFromUnicornRatePercent}% of unicorn rounds (${report.features.unicornOnGameArea.superBonusFromUnicornRounds})`);
console.log(`Avg trap power:   ${report.bonus.trapPower.average}  (max ${report.bonus.trapPower.max})`);
console.log(`Avg final mult:   ${report.bonus.finalMultiplier.average}x`);
console.log(`Stomp feature:    ${report.features.stompFeature.frequency} (${report.features.stompFeature.triggeredRounds} rounds)`);
console.log(`Crush feature:    ${report.features.crushFeature.frequency} (${report.features.crushFeature.triggeredRounds} rounds)`);
console.log(`Party feature:    ${report.features.partyFeature.frequency} (${report.features.partyFeature.triggeredRounds} rounds)`);
console.log(`Golfswing:        ${report.features.golfswingFeature.frequency} (${report.features.golfswingFeature.triggeredRounds} rounds, ${report.features.golfswingFeature.hitRatePercent}% hit)`);
console.log(`Animals crushed:  ${report.features.animalsCrushed.total} total, ${report.features.animalsCrushed.averagePerRound} avg/round`);
console.log(`Animals/trigger:  ${report.features.animalsCrushed.averageOnBonusTriggerRound} avg on bonus-entry spin, ratio ${report.features.animalsCrushed.animalsCrushedPerBonusRatio}`);
console.log(`Animals/bonus:    ${report.features.animalsCrushed.averageBetweenBonuses} avg crushed between bonuses (${report.features.animalsCrushed.averagePaidSpinsBetweenBonuses} paid spins)`);
console.log(`Main var/std:     ${report.mainGame.variance} / ${report.mainGame.stdDev}`);
console.log(`Bonus var/std:    ${report.bonus.variance} / ${report.bonus.stdDev}`);
printWinDistribution("Main game win distribution", report.mainGame.winDistribution);
printWinDistribution("Bonus win distribution", report.bonus.winDistribution);
printWinDistribution(
  `Trap power distribution (avg ${report.bonus.trapPower.average}, max ${report.bonus.trapPower.max})`,
  report.bonus.trapPower.distribution
);
printWinDistribution(
  `Final multiplier distribution (avg ${report.bonus.finalMultiplier.average}x)`,
  report.bonus.finalMultiplier.distribution
);
console.log(`Output:           ${resolvedOutputPath}`);
console.log("========================================\n");
