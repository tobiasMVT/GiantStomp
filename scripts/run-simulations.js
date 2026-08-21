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

const formatFrequency = (count, total) =>
  count > 0 ? `1/${Number((total / count).toFixed(2))}` : "N/A";

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
const animalsCrushedPerRound = [];
const animalsCrushedInBonusRounds = [];

let totalStake = 0;
let totalPayout = 0;
let totalMainGameWin = 0;
let totalBonusWin = 0;
let completedRounds = 0;
let failedRounds = 0;
let hitRounds = 0;
let noHitRounds = 0;
let maxWin = 0;
let maxMainGameWin = 0;
let maxBonusWin = 0;

let bonusRounds = 0;
let stompFeatureRounds = 0;
let crushFeatureRounds = 0;
let totalAnimalsCrushed = 0;
let totalAnimalsCrushedInBonusRounds = 0;

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

  const animalsCrushed = countAnimalsCrushedInRound(states);
  animalsCrushedPerRound.push(animalsCrushed);
  totalAnimalsCrushed += animalsCrushed;

  if (server.hasStomp(states)) stompFeatureRounds += 1;
  if (server.hasCrush(states)) crushFeatureRounds += 1;

  const hadBonus = server.hasBonus(states);
  if (hadBonus) {
    bonusRounds += 1;
    bonusWinsPerBonusRound.push(bonusWin);
    totalBonusWin += bonusWin;
    animalsCrushedInBonusRounds.push(animalsCrushed);
    totalAnimalsCrushedInBonusRounds += animalsCrushed;
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

const avgAnimalsCrushedPerRound =
  completedRounds > 0 ? totalAnimalsCrushed / completedRounds : 0;
const avgAnimalsCrushedPerBonusRound =
  bonusRounds > 0 ? totalAnimalsCrushedInBonusRounds / bonusRounds : 0;
const animalsCrushedPerBonusRatio =
  totalAnimalsCrushed > 0 ? totalAnimalsCrushedInBonusRounds / totalAnimalsCrushed : 0;

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
    ...mainGameStats
  },
  bonus: {
    description: "Win credited while isBonus is true (bonustransition, freespins, and ouch stomp).",
    bonusRounds,
    bonusDetection: "server.hasBonus(states): any state with executedAction bonustransition",
    bonusFrequency: formatFrequency(bonusRounds, completedRounds),
    bonusRatePercent: completedRounds > 0 ? twoDecimals((bonusRounds / completedRounds) * 100) : 0,
    ...bonusStats
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
    animalsCrushed: {
      total: totalAnimalsCrushed,
      averagePerRound: Number(avgAnimalsCrushedPerRound.toFixed(4)),
      averagePerBonusRound: Number(avgAnimalsCrushedPerBonusRound.toFixed(4)),
      totalInBonusRounds: totalAnimalsCrushedInBonusRounds,
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
console.log(`Bonus frequency:  ${report.bonus.bonusFrequency} (${report.bonus.bonusRatePercent}%)`);
console.log(`Stomp feature:    ${report.features.stompFeature.frequency} (${report.features.stompFeature.triggeredRounds} rounds)`);
console.log(`Crush feature:    ${report.features.crushFeature.frequency} (${report.features.crushFeature.triggeredRounds} rounds)`);
console.log(`Animals crushed:  ${report.features.animalsCrushed.total} total, ${report.features.animalsCrushed.averagePerRound} avg/round`);
console.log(`Animals/bonus:    ${report.features.animalsCrushed.averagePerBonusRound} avg when bonus, ratio ${report.features.animalsCrushed.animalsCrushedPerBonusRatio}`);
console.log(`Main var/std:     ${report.mainGame.variance} / ${report.mainGame.stdDev}`);
console.log(`Bonus var/std:    ${report.bonus.variance} / ${report.bonus.stdDev}`);
console.log(`Output:           ${resolvedOutputPath}`);
console.log("========================================\n");
