import serverConfig from "../../game-server/server_config.json";
import simulationReportText from "../assets/giantstomp/simdata.json?raw";

const DEFAULT_DAMAGE_SEGMENTS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 25, 100];
const ANIMAL_NAMES = ["Rabbit", "Squirrel", "Bird", "Hedgehog", "Mole"];
const CARD_NAMES = ["A", "K", "Q", "J", "10"];

function numberOr(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function formatRulesMultiplier(value) {
  const number = numberOr(value);
  return `${Number(number.toFixed(2)).toString()}x`;
}

function formatRange(values, fallback) {
  const numbers = Object.keys(values || {})
    .map(Number)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  if (!numbers.length) return fallback;
  return `${formatRulesMultiplier(numbers[0])} - ${formatRulesMultiplier(numbers.at(-1))}`;
}

function readSimulationMatch(pattern) {
  return simulationReportText.match(pattern)?.[1]?.trim() || null;
}

function formatSimulationNumber(value) {
  const number = Number(String(value || "").replace(/,/g, ""));
  return Number.isFinite(number) ? number.toLocaleString("en-US") : "Unavailable";
}

function buildSimulationStatistics() {
  const rounds = readSimulationMatch(/^Rounds completed:\s*([\d,]+)/m);
  const rtp = readSimulationMatch(/^RTP:\s*([\d.]+%)/m);
  const hitRate = readSimulationMatch(/^Hit rate \(tbm\):\s*([\d.]+)/m);
  const bonusFrequency = readSimulationMatch(/^Bonus frequency:\s*(1\/[\d.]+\s*\([\d.]+%\))/m);
  const mainGameRtp = readSimulationMatch(/^Main game RTP:\s*([\d.]+%)/m);
  const bonusRtp = readSimulationMatch(/^Bonus RTP:\s*([\d.]+%)/m);
  const trapPower = readSimulationMatch(/^Avg trap power:\s*([\d.]+)/m);
  const finalMultiplier = readSimulationMatch(/^Avg final mult:\s*([\d.]+x)/m);
  const golfHitRate = readSimulationMatch(/^Golfswing:.*?,\s*([\d.]+% hit)\)/m);
  const mainVariance = readSimulationMatch(/^Main var\/std:\s*([\d.]+)/m);
  const mainStdDev = readSimulationMatch(/^Main var\/std:\s*[\d.]+\s*\/\s*([\d.]+)/m);
  const bonusVariance = readSimulationMatch(/^Bonus var\/std:\s*([\d.]+)/m);
  const bonusStdDev = readSimulationMatch(/^Bonus var\/std:\s*[\d.]+\s*\/\s*([\d.]+)/m);

  const hitRatePercent = Number(hitRate);
  return {
    rounds: formatSimulationNumber(rounds),
    cards: [
      { label: "RTP", value: rtp || "Unavailable", detail: "Return to player" },
      {
        label: "Hit Rate",
        value: Number.isFinite(hitRatePercent) ? `${(hitRatePercent * 100).toFixed(2)}%` : "Unavailable",
        detail: "Winning paid rounds",
      },
      { label: "Bonus Frequency", value: bonusFrequency || "Unavailable", detail: "Regular + Super Bonus" },
      { label: "Rounds Simulated", value: formatSimulationNumber(rounds), detail: "Completed normal rounds" },
      { label: "Main Game RTP", value: mainGameRtp || "Unavailable", detail: "Paid spin phase" },
      { label: "Bonus RTP", value: bonusRtp || "Unavailable", detail: "Bonus feature phase" },
      { label: "Main Variance", value: mainVariance || "Unavailable", detail: "Main-game win spread" },
      { label: "Main Std. Deviation", value: mainStdDev || "Unavailable", detail: "Main-game volatility" },
      { label: "Bonus Variance", value: bonusVariance || "Unavailable", detail: "Bonus win spread" },
      { label: "Bonus Std. Deviation", value: bonusStdDev || "Unavailable", detail: "Bonus volatility" },
      { label: "Avg Trap Power", value: trapPower ? formatRulesMultiplier(trapPower) : "Unavailable", detail: "Per completed bonus" },
      { label: "Avg Final Multiplier", value: finalMultiplier || "Unavailable", detail: "Ouch Stomp result" },
      { label: "Golf Swing Hit Rate", value: golfHitRate || "Unavailable", detail: "Per triggered Golf Swing" },
    ],
  };
}

function buildPaytableRows(config) {
  const payingSymbols = Array.isArray(config.payingSymbols)
    ? config.payingSymbols.map(Number).filter(Number.isFinite)
    : Array.from({ length: 10 }, (_, index) => index + 1);

  return payingSymbols.map((symbol) => {
    const index = symbol - 1;
    const label = index < ANIMAL_NAMES.length
      ? ANIMAL_NAMES[index]
      : CARD_NAMES[index - ANIMAL_NAMES.length] || `Symbol ${symbol}`;
    const payouts = config.paytable?.[String(symbol)] || {};
    return {
      icon: String(symbol),
      label,
      values: [3, 4, 5].map((reels) => formatRulesMultiplier(payouts[String(reels)])),
    };
  });
}

function buildBonusSymbolCards(config) {
  const materialSymbols = [111, 222, 333, 444, 555];
  const trapSymbols = Array.isArray(config.bonus?.trapSymbols)
    ? config.bonus.trapSymbols.map(Number)
    : [666, 777, 888, 999];
  const required = Math.max(1, numberOr(config.bonus?.trapLightsRequired, 4));
  const materials = materialSymbols.map((symbol) => ({
    icon: String(symbol),
    title: `Material ${symbol}`,
    detail: `Adds ${formatRulesMultiplier(config.bonusWinAmounts?.[String(symbol)])} trap power.`,
  }));
  const traps = trapSymbols.map((symbol) => ({
    icon: String(symbol),
    title: `Trap ${symbol}`,
    detail: `${required} symbols collect ${formatRulesMultiplier(config.bonusWinAmounts?.[String(symbol)])} trap power.`,
  }));

  return [
    ...materials,
    ...traps,
    {
      icon: String(numberOr(config.bonus?.damageSymbol, 1000)),
      title: "Hammer",
      detail: "Banks the next damage multiplier step for the final Ouch Stomp.",
    },
  ];
}

/**
 * Presentation-only game rules. Numeric values intentionally come from the
 * same server configuration that drives the local game math.
 */
export function buildGameRulesContent(config = serverConfig) {
  const mainLives = Math.max(1, numberOr(config.bonus?.lives, 3));
  const superLives = Math.max(mainLives, numberOr(config.superBonus?.lives, 4));
  const angerMax = Math.max(1, numberOr(config.anger?.maximum, 10));
  const stompSizes = Object.keys(config.stompFeature?.stompReelSize || { 2: 1, 3: 1 })
    .map(Number)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  const crushSizes = Object.keys(config.crushFeature?.crushAmount || { 1: 1, 2: 1, 3: 1, 4: 1 })
    .map(Number)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  const damageSegments = Array.isArray(config.damageWheelSegments)
    ? config.damageWheelSegments.map(Number).filter(Number.isFinite)
    : DEFAULT_DAMAGE_SEGMENTS;
  const simulation = buildSimulationStatistics();

  return {
    title: "GAME RULES",
    sections: [
      {
        id: "main-game",
        label: "Main Game",
        title: "Payways in the Main Game",
        intro: "Giant Stomp is played on 5 reels with 3 rows and pays 243 ways. Wins are formed on consecutive reels from the leftmost reel.",
        bullets: [
          "Match a paying symbol on 3, 4, or 5 consecutive reels to win.",
          "Every matching position on each winning reel creates another way.",
          "Your payout is the table multiplier × number of ways × your bet.",
          "The rainbow unicorn is wild and can substitute for every paying symbol.",
        ],
        images: ["1", "2", "3", "4", "5", "14"],
        table: { headers: ["Symbol", "3 reels", "4 reels", "5 reels"], rows: buildPaytableRows(config) },
      },
      {
        id: "anger",
        label: "Anger & Giants",
        title: "Anger Meter, Stomp & Crush",
        intro: `Crushing animals can make the anger meter rise. Fill all ${angerMax} steps to enter the regular bonus.`,
        bullets: [
          `The giant foot stomps ${stompSizes[0] || 2}-${stompSizes.at(-1) || 3} adjacent reels.`,
          `The giant hand can grab and crush ${crushSizes[0] || 1}-${crushSizes.at(-1) || 4} animals.`,
          "Each crushed animal can add anger; more crushed animals improve the chance to trigger the bonus.",
          "A crushed unicorn overrides the regular trigger and starts the Super Bonus instead.",
        ],
        images: ["giantfoot", "open_hand", "1", "14"],
      },
      {
        id: "golf",
        label: "Golf Swing",
        title: "Golf Swing",
        intro: "When the giant takes an animal for a golf swing, the aim decides whether the shot hits the jackpot zone.",
        bullets: [
          "A miss pays nothing; a hit spins the displayed jackpot wheel.",
          `Normal Golf Swing jackpots range from ${formatRange(config.golfSwingJackpotSegmentsAndWeight, "1x - 512x")}.`,
          "If the giant picks the rainbow unicorn, Super Golf Swing uses the upgraded jackpot wheel.",
          `Super Golf Swing jackpots range from ${formatRange(config.golfSwingSuperJackpotSegmentsAndWeight, "10x - 5120x")}.`,
        ],
        images: ["giant_golfswing", "golf_flag", "1", "14"],
      },
      {
        id: "bonus-symbols",
        label: "Bonus Symbols",
        title: "Bonus Symbols",
        intro: "Bonus symbols build the animals' trap. Material values add power immediately, while matching trap parts must be collected before they award their value.",
        bullets: [
          `Collect ${Math.max(1, numberOr(config.bonus?.trapLightsRequired, 4))} matching trap symbols to complete that trap and collect its value.`,
          "Hammers bank damage multiplier steps for the Ouch Stomp at the end of the bonus.",
        ],
        symbolCards: buildBonusSymbolCards(config),
      },
      {
        id: "bonus",
        label: "Bonus Game",
        title: "Bonus Game & Ouch Stomp",
        intro: `The regular bonus begins with ${mainLives} lives. Every bonus spin starts with an empty board, then bonus symbols may land.`,
        bullets: [
          "Any non-empty bonus spin restores all lives.",
          `The bonus ends after ${mainLives} consecutive empty spins.`,
          "Collected material and completed traps build unscaled trap power.",
          "When the bonus ends, the Ouch Stomp resolves the final damage multiplier and applies it to trap power.",
        ],
        images: ["bonus_life_1", "bonus_life_2", "bonus_life_3", "1000", "ouch_snared_foot"],
        multiplierValues: damageSegments,
      },
      {
        id: "super",
        label: "Super Features",
        title: "Super Bonus & Super Golf",
        intro: "The rainbow unicorn is both a wild in the main game and the key to Giant Stomp's super features.",
        bullets: [
          "When a stomp or crush takes the unicorn, the Super Bonus is guaranteed.",
          `The Super Bonus starts with ${superLives} lives and refills all ${superLives} lives on a non-empty spin.`,
          "A unicorn chosen for golf activates Super Golf Swing and its higher jackpot range.",
          "Rainbow effects mark the Super Bonus and its upgraded life sigil.",
        ],
        images: ["14", "bonus_life_4", "giantfoot", "giant_golfswing"],
      },
      {
        id: "statistics",
        label: "Statistics",
        title: "Statistics",
        intro: `Simulation results from ${simulation.rounds} normal rounds. These are game-math estimates, not live player statistics.`,
        bullets: ["Update simdata.json with a newer simulation report to refresh these values at the next client build."],
        statistics: simulation.cards,
        reportText: simulationReportText.trim(),
      },
    ],
  };
}

export default buildGameRulesContent;
