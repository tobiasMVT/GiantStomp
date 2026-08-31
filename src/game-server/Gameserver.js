import serverConfig from "./server_config.json" with { type: "json" };
import {
  getForcedOutcomeSelection,
  normalizeForcedOutcomeSelection,
  parseForcedOutcomeOptionId
} from "./lib/devForcedOutcomeStore.js";

const clone = (value) => structuredClone(value);
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const asMoney = (value) => Number(Number(value || 0).toFixed(2));
const asTbm = (value) => Number(Number(value || 0).toFixed(8));

export function resetGameState(gameState) {
  const fresh = clone(serverConfig.gameState);
  Object.keys(gameState || {}).forEach((key) => delete gameState[key]);
  Object.assign(gameState, fresh);
  return gameState;
}

export class GameServer {
  constructor(options = {}) {
    const normalizedOptions = isObject(options) ? options : {};
    this.serverConfig = serverConfig;
    this.width = serverConfig.area.width;
    this.height = serverConfig.area.height;
    this.random = typeof normalizedOptions.random === "function" ? normalizedOptions.random : Math.random;
    this.boardProvider =
      typeof normalizedOptions.boardProvider === "function" ? normalizedOptions.boardProvider : null;
  }

  roundCurrency(value) {
    return asMoney(value);
  }

  getWinCap() {
    return Math.max(0, Number(serverConfig.wincap) || 0);
  }

  getWinCapHeadroom(totals) {
    const cap = this.getWinCap();
    if (cap <= 0) return Infinity;
    return asTbm(Math.max(0, cap - Number(totals?.twa || 0)));
  }

  isWinCapReached(totals) {
    const cap = this.getWinCap();
    return cap > 0 && Number(totals?.twa || 0) >= cap - 0.00000001;
  }

  enforceWinCapTotal(totals) {
    const cap = this.getWinCap();
    if (cap <= 0 || !totals) return false;
    if (Number(totals.twa || 0) >= cap - 0.00000001) {
      totals.twa = asMoney(cap);
      return true;
    }
    return false;
  }

  scaleCoinCellValues(cells = [], scale = 1) {
    const factor = Math.max(0, Number(scale) || 0);
    let total = 0;
    cells.forEach((cell) => {
      if (!cell?.isAnimal || !(Number(cell.coinValue) > 0)) return;
      cell.coinValue = asMoney(Number(cell.coinValue) * factor);
      total = asTbm(total + Number(cell.coinValue));
    });
    return total;
  }

  scaleOuchStepValues(steps = [], scale = 1) {
    const factor = Math.max(0, Number(scale) || 0);
    steps.forEach((step) => {
      if (factor <= 0) {
        step.winAmount = 0;
        step.winTbm = 0;
        return;
      }
      step.winAmount = asMoney(Number(step.winAmount) * factor);
      step.winTbm = asTbm(Number(step.winTbm) * factor);
    });
    const lastStep = steps.at(-1);
    return lastStep ? Number(lastStep.winAmount) || 0 : 0;
  }

  applyWinCapAddition(totals, amount, {
    stompEvent = null,
    crushEvent = null,
    ouchEvent = null,
    golfswingEvent = null,
  } = {}) {
    const delta = Math.max(0, Number(amount) || 0);
    if (delta <= 0) {
      return { applied: 0, capped: this.isWinCapReached(totals) };
    }

    const cap = this.getWinCap();
    if (cap <= 0) {
      totals.twa = asTbm(Number(totals.twa || 0) + delta);
      return { applied: delta, capped: false };
    }

    const headroom = this.getWinCapHeadroom(totals);
    if (headroom <= 0) {
      this.enforceWinCapTotal(totals);
      return { applied: 0, capped: true };
    }

    const applied = asTbm(Math.min(delta, headroom));
    totals.twa = asTbm(Number(totals.twa || 0) + applied);
    const capped = applied + 0.00000001 < delta || this.isWinCapReached(totals);

    if (capped) {
      this.enforceWinCapTotal(totals);
      const scale = cap > 0 && delta > 0 ? applied / delta : 0;
      if (stompEvent?.crushedCells?.length) {
        stompEvent.coinWin = this.scaleCoinCellValues(stompEvent.crushedCells, scale);
      }
      if (crushEvent?.crushedCells?.length) {
        crushEvent.coinWin = this.scaleCoinCellValues(crushEvent.crushedCells, scale);
      }
      if (ouchEvent?.steps?.length) {
        const scaledTotal = this.scaleOuchStepValues(ouchEvent.steps, scale);
        ouchEvent.finalWinAmount = asMoney(scaledTotal);
        const lastStep = ouchEvent.steps.at(-1);
        if (lastStep) {
          ouchEvent.finalWinTbm = lastStep.winTbm;
          ouchEvent.finalMultiplier = lastStep.multiplier;
        }
      }
      if (golfswingEvent?.hit) {
        golfswingEvent.jackpotWin = asMoney(Number(golfswingEvent.jackpotWin || 0) * scale);
      }
    }

    return { applied, capped };
  }

  getAvailableTicketStrategies() {
    return serverConfig.ticketStrategies.filter((strategy) => {
      const bucket = serverConfig[strategy];
      return isObject(bucket) && Object.values(bucket).some((weight) => Number(weight) > 0);
    });
  }

  resolveTicketStrategy(strategyName) {
    const available = this.getAvailableTicketStrategies();
    return available.includes(strategyName)
      ? strategyName
      : available.includes(serverConfig.mathStyle)
        ? serverConfig.mathStyle
        : available[0];
  }

  resolveForcedOutcomeSelection(strategyName) {
    const explicit = parseForcedOutcomeOptionId(strategyName);
    const selection = normalizeForcedOutcomeSelection(explicit || getForcedOutcomeSelection());
    if (!selection) return null;
    const bucket = serverConfig[selection.strategy];
    return isObject(bucket) && Number(bucket[selection.ticket]) > 0 ? selection : null;
  }

  drawWeightedTicket(strategyName) {
    const strategy = this.resolveTicketStrategy(strategyName);
    const entries = Object.entries(serverConfig[strategy] || {}).filter(([, weight]) => Number(weight) > 0);
    const total = entries.reduce((sum, [, weight]) => sum + Number(weight), 0);
    let pick = this.random() * total;
    for (const [ticket, weight] of entries) {
      pick -= Number(weight);
      if (pick < 0) return ticket;
    }
    return entries.at(-1)?.[0] || "noWin";
  }

  buildRoundMeta({ betSize, ticketStrategy, ticket }) {
    const normalizedBet = Number(betSize);
    const baseCost = Number(serverConfig.wallet.cost || 1);
    return {
      betSize: normalizedBet,
      baseCost,
      strategyCostMultiplier: 1,
      roundCost: asMoney(normalizedBet * baseCost),
      ticketStrategy,
      ticket
    };
  }

  randomSymbol(weights = serverConfig.symbolWeights) {
    const entries = Object.entries(weights).filter(([, weight]) => Number(weight) > 0);
    const total = entries.reduce((sum, [, weight]) => sum + Number(weight), 0);
    let pick = this.random() * total;
    for (const [symbol, weight] of entries) {
      pick -= Number(weight);
      if (pick < 0) return Number(symbol);
    }
    return Number(entries.at(-1)?.[0] || 1);
  }

  randomWeightedCount(weights = serverConfig.bonusGateForSymbols) {
    const entries = Object.entries(weights).filter(([, weight]) => Number(weight) > 0);
    const total = entries.reduce((sum, [, weight]) => sum + Number(weight), 0);
    let pick = this.random() * total;
    for (const [count, weight] of entries) {
      pick -= Number(weight);
      if (pick < 0) return Number(count);
    }
    return Number(entries.at(-1)?.[0] || 0);
  }

  resolveTrapPowerFloorBracket(table, trapPower) {
    if (!table || typeof table !== "object") return null;
    const power = Number(trapPower) || 0;
    const thresholds = Object.keys(table).map(Number).sort((a, b) => b - a);
    for (const threshold of thresholds) {
      if (power >= threshold) return table[String(threshold)];
    }
    return null;
  }

  resolveBonusGateZeroAdjustment(trapPower = 0) {
    const entry = this.resolveTrapPowerFloorBracket(
      serverConfig.adjust0ForBonusGate_TrapPowerValueAffects0odds,
      trapPower
    );
    return Number(entry) || 0;
  }

  resolveTrapPowerSwapOdds(symbol, progressBefore = 0) {
    const table = serverConfig.trapPowerSwapOdds?.[String(symbol)];
    if (!table || typeof table !== "object") return 0;
    const progress = Math.max(0, Math.floor(Number(progressBefore) || 0));
    return Number(table[String(progress)]) || 0;
  }

  getLowMaterialSymbols() {
    return (serverConfig.bonus?.guaranteedPowerSeedSymbols || [111, 222, 333, 444, 555])
      .map(Number)
      .filter((symbol) => Number(serverConfig.bonusWinAmounts?.[String(symbol)] || 0) > 0);
  }

  getMaxDamageHammers() {
    return Math.max(1, Number(serverConfig.ouchStompFeature?.maxDamageHammers) || 10);
  }

  getRemainingHammerSlots(hammersCollected = 0) {
    const collected = Math.max(0, Number(hammersCollected) || 0);
    return Math.max(0, this.getMaxDamageHammers() - collected);
  }

  buildBonusSymbolWeights(trapProgress = {}, hammersCollected = 0) {
    const weights = Object.fromEntries(
      Object.entries(serverConfig.bonusSymbolWeights || {})
        .map(([symbol, weight]) => [symbol, Number(weight) || 0])
        .filter(([, weight]) => weight > 0)
    );
    const damageSymbol = String(serverConfig.bonus?.damageSymbol ?? 1000);
    if (this.getRemainingHammerSlots(hammersCollected) <= 0) {
      weights[damageSymbol] = 0;
    }
    const trapSymbols = (serverConfig.bonus?.trapSymbols || [666, 777, 888, 999]).map(Number);
    const lowSymbols = this.getLowMaterialSymbols();
    const lowWeightTotal = lowSymbols.reduce(
      (sum, symbol) => sum + (Number(weights[String(symbol)]) || 0),
      0
    );
    if (lowWeightTotal <= 0) return weights;

    for (const trapSymbol of trapSymbols) {
      const trapKey = String(trapSymbol);
      const trapWeight = Number(weights[trapKey] || 0);
      if (trapWeight <= 0) continue;

      const swapOddsPercent = this.resolveTrapPowerSwapOdds(
        trapSymbol,
        Number(trapProgress[trapKey] || 0)
      );
      if (swapOddsPercent <= 0) continue;

      const swapWeight = trapWeight * (swapOddsPercent / 100);
      weights[trapKey] = trapWeight - swapWeight;
      for (const lowSymbol of lowSymbols) {
        const lowKey = String(lowSymbol);
        const lowShare = Number(weights[lowKey] || 0) / lowWeightTotal;
        weights[lowKey] = Number(weights[lowKey] || 0) + (swapWeight * lowShare);
      }
    }

    return weights;
  }

  resolveDamageStepOddsBoost(trapPower = 0) {
    const entry = this.resolveTrapPowerFloorBracket(
      serverConfig.adjustdamageMultilpierStepOdds_TrapPowerUpToValueAffectOdds,
      trapPower
    );
    if (!entry || typeof entry !== "object") return null;
    return {
      oddsDeltaPercent: Number(entry.damageMultilpierStepOdds) || 0,
      stepsActive: Math.max(0, Number(entry.stepsActive) || 0)
    };
  }

  resolveDamageStepOddsForDraw(baseOdds, drawIndex, boost) {
    const normalizedBase = Number(baseOdds) || 0;
    if (!boost || drawIndex >= boost.stepsActive || boost.oddsDeltaPercent === 0) {
      return normalizedBase;
    }
    return Math.min(1, Math.max(0, normalizedBase + (boost.oddsDeltaPercent / 100)));
  }

  resolveWinAmountOddsReduction(currentWinTbm = 0) {
    const entry = this.resolveTrapPowerFloorBracket(
      serverConfig.damageMultilpierStepOddsReductionBasedOnCurrentWinAmount,
      currentWinTbm
    );
    return Number(entry) || 0;
  }

  resolveDamageStepOddsForCurrentWin(baseOdds, currentWinTbm) {
    const normalizedBase = Number(baseOdds) || 0;
    const reduction = this.resolveWinAmountOddsReduction(currentWinTbm);
    return Math.min(1, Math.max(0, normalizedBase - reduction));
  }

  resolveMultiplierOddsWeights(trapPower = 0) {
    const weights = this.resolveTrapPowerFloorBracket(serverConfig.multilpierOdds, trapPower);
    if (!Array.isArray(weights) || !weights.length) return null;
    return weights.map((weight) => Math.max(0, Number(weight) || 0));
  }

  resolveDamageMeterActiveIndex(segments = [], remaining = []) {
    const configured = [...segments].map(Number);
    const remainingValues = [...remaining].map(Number);
    if (!remainingValues.length) return configured.length;
    const index = configured.findIndex((value) => value === remainingValues[0]);
    return index >= 0 ? index : Math.max(0, configured.length - remainingValues.length);
  }

  pickWeightedSegmentIndex(weights = [], segmentCount = 0, minIndex = 0) {
    const normalized = Array.from({ length: segmentCount }, (_, index) =>
      index < minIndex ? 0 : Math.max(0, Number(weights[index]) || 0)
    );
    const total = normalized.reduce((sum, weight) => sum + weight, 0);
    if (total <= 0) return minIndex;
    let pick = this.random() * total;
    for (let index = minIndex; index < normalized.length; index += 1) {
      pick -= normalized[index];
      if (pick < 0) return index;
    }
    return normalized.length - 1;
  }

  buildOuchStompSegmentWeights(trapPower = 0, segmentCount = 0, activeIndex = 0) {
    const baseWeights = this.resolveMultiplierOddsWeights(trapPower);
    if (!baseWeights) return null;
    return Array.from({ length: segmentCount }, (_, index) =>
      index < activeIndex ? 0 : Math.max(0, Number(baseWeights[index]) || 0)
    );
  }

  pickOuchStompTargetIndex({
    trapPower = 0,
    segments = [],
    activeIndex = 0,
    hammersCollected = 0,
  } = {}) {
    const lastIndex = Math.max(0, segments.length - 1);
    const cfg = serverConfig.ouchStompFeature || {};
    const maxHammers = Math.max(1, Number(cfg.maxDamageHammers) || 10);

    if (hammersCollected >= maxHammers || activeIndex >= lastIndex) {
      return lastIndex;
    }

    const weights = this.buildOuchStompSegmentWeights(trapPower, segments.length, activeIndex);
    if (!weights) {
      return activeIndex;
    }

    return this.pickWeightedSegmentIndex(weights, segments.length, activeIndex);
  }

  buildBonusGateWeights({ trapPower = 0, forceSymbolLanding = false } = {}) {
    const weights = { ...(serverConfig.bonusGateForSymbols || {}) };
    const zeroAdjustment = this.resolveBonusGateZeroAdjustment(trapPower);
    if (zeroAdjustment !== 0 && Object.prototype.hasOwnProperty.call(weights, "0")) {
      weights["0"] = Math.max(0, Number(weights["0"]) + zeroAdjustment);
    }
    if (forceSymbolLanding) {
      return Object.fromEntries(
        Object.entries(weights).filter(([count]) => Number(count) > 0)
      );
    }
    return weights;
  }

  pickRandomCells(count) {
    const cells = [];
    for (let reel = 0; reel < this.width; reel += 1) {
      for (let row = 0; row < this.height; row += 1) {
        cells.push({ reel, row });
      }
    }
    const picks = Math.min(count, cells.length);
    for (let i = 0; i < picks; i += 1) {
      const j = i + Math.floor(this.random() * (cells.length - i));
      [cells[i], cells[j]] = [cells[j], cells[i]];
    }
    return cells.slice(0, picks);
  }

  generateBonusBoard({ trapPower = 0, forceSymbolLanding = false, trapProgress = {}, hammersCollected = 0 } = {}) {
    const emptySymbol = Number(serverConfig.bonus?.emptySymbol ?? 0);
    const damageSymbol = Number(serverConfig.bonus?.damageSymbol ?? 1000);
    const gateWeights = this.buildBonusGateWeights({ trapPower, forceSymbolLanding });
    const symbolCount = this.randomWeightedCount(gateWeights);
    const board = Array.from({ length: this.width }, () =>
      Array.from({ length: this.height }, () => emptySymbol)
    );
    if (symbolCount <= 0) return board;

    let hammerSlotsRemaining = this.getRemainingHammerSlots(hammersCollected);
    let symbolWeights = this.buildBonusSymbolWeights(trapProgress, hammersCollected);
    for (const { reel, row } of this.pickRandomCells(symbolCount)) {
      if (hammerSlotsRemaining <= 0) {
        symbolWeights = {
          ...symbolWeights,
          [String(damageSymbol)]: 0,
        };
      }
      const symbol = this.randomSymbol(symbolWeights);
      board[reel][row] = symbol;
      if (symbol === damageSymbol) {
        hammerSlotsRemaining = Math.max(0, hammerSlotsRemaining - 1);
      }
    }
    return board;
  }

  generateRandomBoard(weights = serverConfig.symbolWeights) {
    return Array.from({ length: this.width }, () =>
      Array.from({ length: this.height }, () => this.randomSymbol(weights))
    );
  }

  buildNoWinBoard() {
    return Array.from({ length: this.width }, (_, reel) =>
      Array.from({ length: this.height }, (_, row) => ((reel * 3 + row) % 7) + 1)
    );
  }

  maybeInjectSymbolWin(board, { ticket, ticketStrategy, fakeNoWins = false } = {}) {
    if (ticket !== "noWin" || ticketStrategy !== "normal" || fakeNoWins) return board;

    const odds = Number(serverConfig.symHitRateAdjustments?.winInjection ?? 0);
    if (odds <= 0 || this.random() >= odds) return board;

    const nextBoard = clone(board);
    const symbol = this.pickInjectedSymbol();
    const reel1Row = Math.floor(this.random() * this.height);
    nextBoard[0][reel1Row] = symbol;

    for (const reel of [1, 2]) {
      const alreadyThere = nextBoard[reel].some((cell) => Number(cell) === symbol);
      if (!alreadyThere) {
        const row = Math.floor(this.random() * this.height);
        nextBoard[reel][row] = symbol;
      }
    }

    return nextBoard;
  }

  pickInjectedSymbol() {
    const cfg = serverConfig.symHitRateAdjustments || {};
    const lows = (Array.isArray(cfg.Lows) ? cfg.Lows : cfg.lows || [6, 7, 8, 9, 10]).map(Number);
    const highs = (Array.isArray(cfg.Highs) ? cfg.Highs : cfg.highs || [1, 2, 3, 4, 5]).map(Number);
    const lowsWeight = Number(cfg.lowsWeight ?? 1);
    const highsWeight = Number(cfg.highsWeight ?? 0);

    const tier = this.drawWeightedKey(
      { low: lowsWeight, high: highsWeight },
      lows.length ? "low" : "high"
    );
    const pool = tier === "high" ? highs : lows;
    if (!pool.length) return highs[0] || lows[0] || 1;
    return pool[Math.floor(this.random() * pool.length)];
  }

  validateBoard(board) {
    const validSymbols = new Set([
      ...Object.keys(serverConfig.symbolWeights || {}),
      ...Object.keys(serverConfig.bonusSymbolWeights || {})
    ].map(Number));
    if (!Array.isArray(board) || board.length !== this.width) {
      throw new Error(`Board must contain ${this.width} reels`);
    }
    board.forEach((reel) => {
      if (!Array.isArray(reel) || reel.length !== this.height) {
        throw new Error(`Every reel must contain ${this.height} rows`);
      }
      reel.forEach((symbol) => {
        if (!Number.isInteger(Number(symbol)) || !validSymbols.has(Number(symbol))) {
          throw new Error(`Invalid symbol: ${symbol}`);
        }
      });
    });
    return board.map((reel) => reel.map(Number));
  }

  createInitialBoard({
    action,
    ticket,
    ticketStrategy,
    spinIndex,
    isBonus,
    forceSymbolLanding = false,
    trapPower = 0,
    trapProgress = {},
    hammersCollected = 0,
    fakeNoWins = false,
  }) {
    if (this.boardProvider) {
      const supplied = this.boardProvider({ action, ticket, spinIndex, isBonus });
      if (supplied) return this.validateBoard(clone(supplied));
    }

    if (ticket === "noWin") {
      return this.maybeInjectSymbolWin(this.buildNoWinBoard(), { ticket, ticketStrategy, fakeNoWins });
    }
    if (ticket === "waysWin") {
      const board = this.buildNoWinBoard();
      board[0][0] = 1;
      board[1][0] = 1;
      board[2][0] = 1;
      return board;
    }
    if (ticket === "bonusEntry") {
      const board = this.buildNoWinBoard();
      board[0][0] = 1;
      board[1][0] = 2;
      board[2][0] = 3;
      board[3][0] = 4;
      return board;
    }
    if (ticket === "stompEntry") {
      const board = this.buildNoWinBoard();
      for (let reel = 1; reel <= 3; reel += 1) {
        for (let row = 0; row < this.height; row += 1) {
          board[reel][row] = ((reel + row) % 5) + 1;
        }
      }
      return board;
    }
    if (ticket === "crushEntry") {
      const board = this.buildNoWinBoard();
      board[4][0] = 1;
      board[4][1] = 2;
      board[4][2] = 3;
      return board;
    }
    if (ticket === "golfswingEntry") {
      return this.buildGolfswingEntryBoard({ requireUnicorn: false });
    }
    if (ticket === "superGolfswingEntry") {
      return this.buildGolfswingEntryBoard({ requireUnicorn: true });
    }
    if (ticket === "superBonusEntry") {
      const board = this.buildNoWinBoard();
      const { reel: unicornReel, row: unicornRow } = this.pickRandomUnicornCell();
      board[unicornReel][unicornRow] = this.getUnicornSymbol();
      for (let reel = 1; reel <= 3; reel += 1) {
        for (let row = 0; row < this.height; row += 1) {
          if (reel === unicornReel && row === unicornRow) continue;
          board[reel][row] = ((reel + row) % 5) + 1;
        }
      }
      return board;
    }
    const board = isBonus
      ? this.generateBonusBoard({ trapPower, forceSymbolLanding, trapProgress, hammersCollected })
      : this.generateRandomBoard(serverConfig.symbolWeights);
    if (!isBonus && action === "spin") {
      return this.maybeInjectUnicorn(board, { ticket });
    }
    return board;
  }

  injectGuaranteedBonusPowerSeed(board, trapTracker = {}, spinIndex = 0) {
    const maxSeedSpins = Math.max(0, Number(serverConfig.bonus?.guaranteedPowerSeedSpins) || 0);
    if (spinIndex >= maxSeedSpins || Number(trapTracker?.power) > 0) return board;

    const seedSymbols = (serverConfig.bonus?.guaranteedPowerSeedSymbols || [111, 222, 333, 444, 555])
      .map(Number)
      .filter((symbol) => Number(serverConfig.bonusWinAmounts?.[String(symbol)] || 0) > 0);
    if (!seedSymbols.length) return board;

    const seedSymbolSet = new Set(seedSymbols);
    const emptySymbol = Number(serverConfig.bonus?.emptySymbol ?? 0);
    const damageSymbol = Number(serverConfig.bonus?.damageSymbol ?? 1000);
    const protectedSymbols = new Set([
      emptySymbol,
      ...(serverConfig.bonus?.trapSymbols || [666, 777, 888, 999]).map(Number),
    ]);

    let hasDirectPower = false;
    const emptyCells = [];
    const damageCells = [];
    const fallbackCells = [];
    for (let reel = 0; reel < this.width; reel += 1) {
      for (let row = 0; row < this.height; row += 1) {
        const symbol = Number(board?.[reel]?.[row]);
        if (seedSymbolSet.has(symbol)) {
          hasDirectPower = true;
        }
        if (symbol === emptySymbol) {
          emptyCells.push({ reel, row });
          continue;
        }
        if (symbol === damageSymbol) {
          damageCells.push({ reel, row });
          continue;
        }
        if (!protectedSymbols.has(symbol) && !seedSymbolSet.has(symbol)) {
          fallbackCells.push({ reel, row });
        }
      }
    }
    if (hasDirectPower) return board;

    const candidates = emptyCells.length
      ? emptyCells
      : damageCells.length
        ? damageCells
        : fallbackCells;
    if (!candidates.length) return board;

    const target = candidates[Math.floor(this.random() * candidates.length)];
    const seedSymbol = seedSymbols[Math.floor(this.random() * seedSymbols.length)];
    board[target.reel][target.row] = seedSymbol;
    return board;
  }

  evaluateWays(reels, betSize = 1) {
    const waysWins = [];
    const wildSymbols = this.getWildSymbolSet();
    for (const symbol of serverConfig.payingSymbols) {
      const reelPositions = [];
      for (let reel = 0; reel < this.width; reel += 1) {
        const positions = [];
        for (let row = 0; row < this.height; row += 1) {
          const cell = Number(reels[reel][row]);
          if (cell === symbol || wildSymbols.has(cell)) positions.push({ reel, row });
        }
        if (positions.length === 0) break;
        reelPositions.push(positions);
      }

      const reelCount = reelPositions.length;
      if (reelCount < 3) continue;
      const ways = reelPositions.reduce((product, positions) => product * positions.length, 1);
      const baseTbm = Number(serverConfig.paytable[String(symbol)]?.[String(reelCount)] || 0);
      if (baseTbm <= 0) continue;
      const tbm = asTbm(baseTbm * ways);
      const winAmount = asTbm(tbm * Number(betSize));
      const positions = reelPositions.flat();
      waysWins.push({
        symbol,
        reelCount,
        length: reelCount,
        ways,
        baseTbm,
        tbm,
        winAmount,
        positions,
        positionsByReel: reelPositions
      });
    }

    const winAmount = asTbm(waysWins.reduce((sum, win) => sum + win.winAmount, 0));
    const tbm = asTbm(waysWins.reduce((sum, win) => sum + win.tbm, 0));
    return {
      hasWins: waysWins.length > 0,
      waysWins,
      winAmount,
      tbm,
      twa: winAmount
    };
  }

  evaluateBonusCash(reels, _betSize = 1, trapTracker = {}, damageTracker = {}) {
    const emptySymbol = Number(serverConfig.bonus?.emptySymbol ?? 0);
    const trapSymbols = new Set(
      (serverConfig.bonus?.trapSymbols || [666, 777, 888, 999]).map(Number)
    );
    const damageSymbol = Number(serverConfig.bonus?.damageSymbol ?? 1000);
    const required = Math.max(1, Number(serverConfig.bonus?.trapLightsRequired) || 4);
    trapTracker.progress ||= {};
    trapTracker.power = Number(trapTracker.power) || 0;
    damageTracker.segments ||= [...(serverConfig.damageWheelSegments || [])].map(Number);
    damageTracker.removedSegments ||= [];
    damageTracker.remainingSegments ||= [...damageTracker.segments];
    const maxHammers = this.getMaxDamageHammers();
    let hammersAppliedThisSpin = 0;
    const landings = [];
    let trapPower = trapTracker.power;

    for (let reel = 0; reel < this.width; reel += 1) {
      for (let row = 0; row < this.height; row += 1) {
        const symbol = Number(reels[reel][row]);
        if (symbol === emptySymbol) continue;
        const isDamage = symbol === damageSymbol;
        const baseTbm = Number(serverConfig.bonusWinAmounts?.[String(symbol)] || 0);
        if (baseTbm <= 0 && !isDamage) continue;

        const symbolPower = asTbm(baseTbm);
        const isTrap = trapSymbols.has(symbol);
        const progressBefore = Number(trapTracker.progress?.[String(symbol)] || 0);
        const lightsFilled = isTrap ? Math.min(required, progressBefore + 1) : progressBefore;
        const completedTrap = isTrap && lightsFilled >= required;
        const progressAfter = completedTrap ? 0 : lightsFilled;
        const trapPowerBefore = trapPower;
        let powerAwarded = 0;
        let damageRemovedSegment = null;
        if (isTrap) {
          trapTracker.progress[String(symbol)] = progressAfter;
          if (completedTrap) powerAwarded = symbolPower;
        } else if (isDamage) {
          const remainingHammerSlots =
            maxHammers - damageTracker.removedSegments.length - hammersAppliedThisSpin;
          if (remainingHammerSlots > 0 && damageTracker.remainingSegments.length > 0) {
            damageRemovedSegment = damageTracker.remainingSegments.shift() ?? null;
            if (damageRemovedSegment !== null) {
              damageTracker.removedSegments.push(damageRemovedSegment);
              hammersAppliedThisSpin += 1;
            }
          }
        } else {
          powerAwarded = symbolPower;
        }
        trapPower = asTbm(trapPower + powerAwarded);
        landings.push({
          reel,
          row,
          symbol,
          basePower: baseTbm,
          symbolPower,
          powerAwarded,
          isTrap,
          isDamage,
          completedTrap,
          trapProgressBefore: progressBefore,
          trapLightsFilled: lightsFilled,
          trapProgressAfter: progressAfter,
          trapPowerBefore,
          trapPowerAfter: trapPower,
          damageRemovedSegment
        });
      }
    }

    trapTracker.power = trapPower;
    return {
      hasWin: landings.length > 0,
      landings,
      winAmount: 0,
      tbm: 0,
      trapPower
    };
  }

  buildBonusCashState({
    board,
    pastAction,
    nextAction,
    result,
    totals,
    betSize,
    roundMeta,
    lives,
    livesBeforeSpin,
    livesAfterSpend,
    maxLives,
    isSuperBonus = false,
    spinIndex,
    trapTracker,
    damageTracker
  }) {
    return {
      ...clone(serverConfig.gameState),
      bucket: roundMeta.ticketStrategy,
      betSize,
      pastAction,
      executedAction: "freespin",
      nextAction,
      reels: clone(board),
      waysWins: [],
      clusters: [],
      winAmount: result.winAmount,
      twa: totals.twa,
      tbm: totals.tbm,
      isBonus: true,
      bonusLandings: clone(result.landings),
      bonusState: {
        initialFreespins: maxLives,
        finalFreespins: lives,
        livesRemaining: lives,
        livesBeforeSpin,
        livesAfterSpend,
        maxLives,
        isSuperBonus: isSuperBonus === true,
        spinsPlayed: spinIndex + 1,
        resetLives: result.hasWin
      },
      trapMeter: {
        progress: clone(trapTracker.progress),
        required: Math.max(1, Number(serverConfig.bonus?.trapLightsRequired) || 4),
        values: Object.fromEntries(
          (serverConfig.bonus?.trapSymbols || [666, 777, 888, 999]).map((symbol) => [
            String(symbol),
            asTbm(Number(serverConfig.bonusWinAmounts?.[String(symbol)] || 0))
          ])
        ),
        power: trapTracker.power
      },
      damageWheel: clone(damageTracker),
      anger: 0,
      angerMeter: {
        count: 0,
        max: serverConfig.anger.maximum
      },
      roundMeta: clone(roundMeta)
    };
  }

  appendBonusCashGame({ roundStates, totals, betSize, roundMeta }) {
    const transitionState = [...roundStates].reverse().find((state) => state.executedAction === "bonustransition");
    const maxLives = Math.max(
      1,
      Number(transitionState?.bonusState?.maxLives)
      || Number(serverConfig.bonus?.lives)
      || 3
    );
    const isSuperBonus = transitionState?.bonusState?.isSuperBonus === true;
    const maxSpins = Math.max(maxLives, Number(serverConfig.bonus?.maxSpins) || 1000);
    const trapTracker = {
      progress: Object.fromEntries(
        (serverConfig.bonus?.trapSymbols || [666, 777, 888, 999]).map((symbol) => [String(symbol), 0])
      ),
      power: 0
    };
    const damageTracker = {
      segments: [...(serverConfig.damageWheelSegments || [])].map(Number),
      removedSegments: [],
      remainingSegments: [...(serverConfig.damageWheelSegments || [])].map(Number)
    };
    let lives = maxLives;
    let pastAction = "bonustransition";

    for (let spinIndex = 0; lives > 0 && spinIndex < maxSpins; spinIndex += 1) {
      const livesBeforeSpin = lives;
      lives -= 1;
      const livesAfterSpend = lives;
      const forceSymbolLanding = livesBeforeSpin === 1 && Number(trapTracker.power) <= 0;
      let board = this.createInitialBoard({
        action: "freespin",
        ticket: null,
        spinIndex,
        isBonus: true,
        forceSymbolLanding,
        trapPower: Number(trapTracker.power) || 0,
        trapProgress: trapTracker.progress,
        hammersCollected: damageTracker.removedSegments?.length || 0,
      });
      if (!this.boardProvider) {
        board = this.injectGuaranteedBonusPowerSeed(board, trapTracker, spinIndex);
      }
      const result = this.evaluateBonusCash(board, betSize, trapTracker, damageTracker);
      if (result.hasWin) lives = maxLives;
      const isLastSpin = lives <= 0 || spinIndex + 1 >= maxSpins;
      const nextAction = isLastSpin ? "spin" : "freespin";
      roundStates.push(this.buildBonusCashState({
        board,
        pastAction,
        nextAction,
        result,
        totals,
        betSize,
        roundMeta,
        lives,
        livesBeforeSpin,
        livesAfterSpend,
        maxLives,
        isSuperBonus,
        spinIndex,
        trapTracker,
        damageTracker
      }));
      pastAction = "freespin";
    }

    const lastBonusState = roundStates.filter((state) => state.isBonus).at(-1);
    if (lastBonusState) {
      const ouchResult = this.resolveOuchStomp(trapTracker.power, damageTracker, betSize);
      lastBonusState.ouchStompEvent = clone(ouchResult.event);
      if (ouchResult.winAmount > 0) {
        const capResult = this.applyWinCapAddition(totals, ouchResult.winAmount, {
          ouchEvent: lastBonusState.ouchStompEvent,
        });
        lastBonusState.ouchStompEvent.winCapReached = capResult.capped || this.isWinCapReached(totals);
        lastBonusState.twa = totals.twa;
      }
      lastBonusState.winCapReached = this.isWinCapReached(totals);
    }
  }

  resolveOuchStomp(trapPower, damageWheel = {}, betSize = 1) {
    const power = Number(trapPower) || 0;
    const configuredSegments = [...(damageWheel?.segments || serverConfig.damageWheelSegments || [])].map(Number);
    const rawRemaining = [...(damageWheel?.remainingSegments || [])].map(Number);
    const remaining = rawRemaining.length
      ? rawRemaining
      : (power > 0 ? [configuredSegments[0] || 1] : []);
    const removedSegments = [...(damageWheel?.removedSegments || [])].map(Number);
    const cfg = serverConfig.ouchStompFeature || {};
    const stepIntervalMs = Math.max(0, Number(cfg.stepIntervalMs) || 3000);
    const maxCoinsPerStep = Math.max(1, Number(cfg.maxCoinsPerStep) || 20);
    const normalizedBet = Number(betSize) || 1;

    if (power <= 0 || !remaining.length) {
      return {
        event: { triggered: false },
        winAmount: 0,
        winTbm: 0,
      };
    }

    const consumedSegments = [];
    const steps = [];
    const activeIndex = this.resolveDamageMeterActiveIndex(configuredSegments, remaining);
    const targetIndex = this.pickOuchStompTargetIndex({
      trapPower: power,
      segments: configuredSegments,
      activeIndex,
      hammersCollected: removedSegments.length,
    });

    const pushStep = (multiplier) => {
      consumedSegments.push(multiplier);
      const winTbm = asTbm(power * multiplier);
      steps.push({
        step: steps.length + 1,
        multiplier,
        winTbm,
        winAmount: asMoney(winTbm * normalizedBet),
      });
    };

    for (let index = activeIndex; index <= targetIndex; index += 1) {
      pushStep(configuredSegments[index] ?? configuredSegments.at(-1) ?? 1);
    }

    const lastStep = steps.at(-1);
    const coinCountPerStep = Math.min(Math.max(1, Math.round(power)), maxCoinsPerStep);

    return {
      event: {
        triggered: true,
        trapPower: power,
        steps,
        finalMultiplier: lastStep.multiplier,
        finalWinTbm: lastStep.winTbm,
        finalWinAmount: lastStep.winAmount,
        coinCountPerStep,
        stepIntervalMs,
        damageWheelBefore: {
          ...clone(damageWheel),
          segments: configuredSegments.length ? [...configuredSegments] : [1],
          remainingSegments: [...remaining],
        },
        consumedSegments: [...consumedSegments],
      },
      winAmount: lastStep.winAmount,
      winTbm: lastStep.winTbm,
    };
  }

  toCompatibilityClusters(waysWins) {
    return waysWins.map((win) => ({
      symbol: win.symbol,
      count: win.positions.length,
      reelCount: win.reelCount,
      ways: win.ways,
      baseTbm: win.baseTbm,
      tbm: win.tbm,
      twa: win.winAmount,
      winAmount: win.winAmount,
      positions: clone(win.positions)
    }));
  }

  removeWinningPositions(reels, waysWins) {
    const removed = clone(reels);
    const union = new Set();
    waysWins.forEach((win) => {
      win.positions.forEach(({ reel, row }) => union.add(`${reel},${row}`));
    });
    union.forEach((key) => {
      const [reel, row] = key.split(",").map(Number);
      removed[reel][row] = 0;
    });
    return removed;
  }

  applyDownwardGravity(reels, weights = serverConfig.symbolWeights) {
    const result = Array.from({ length: this.width }, () => Array(this.height).fill(0));
    const movements = [];
    const newPositions = [];

    for (let reel = 0; reel < this.width; reel += 1) {
      const survivors = [];
      for (let row = 0; row < this.height; row += 1) {
        if (Number(reels[reel][row]) !== 0) {
          survivors.push({ symbol: Number(reels[reel][row]), from: row });
        }
      }

      survivors.forEach(({ symbol, from }, to) => {
        result[reel][to] = symbol;
        movements.push({ reel, from, to, symbol });
      });

      for (let to = survivors.length; to < this.height; to += 1) {
        const symbol = this.randomSymbol(weights);
        const from = this.height + (to - survivors.length);
        result[reel][to] = symbol;
        movements.push({ reel, from, to, symbol });
        newPositions.push({ reel, row: to, symbol });
      }
    }

    return {
      reels: result,
      newPositions,
      dropEvent: {
        direction: "down",
        movements
      }
    };
  }

  findScatterPositions(reels) {
    const positions = [];
    for (let reel = 0; reel < this.width; reel += 1) {
      for (let row = 0; row < this.height; row += 1) {
        if (Number(reels[reel][row]) === serverConfig.scatterSymbol) {
          positions.push({ reel, row, symbol: serverConfig.scatterSymbol });
        }
      }
    }
    return positions;
  }

  getStompConfig() {
    return serverConfig.stompFeature || {
      stompReelSizeMin: 2,
      stompReelSizeMax: 3,
      odds: 0.05
    };
  }

  getCrushConfig() {
    return serverConfig.crushFeature || { odds: 0.05 };
  }

  getGolfswingConfig() {
    return serverConfig.golfswingFeature || { odds: 0.03, hitWeight: 1, missWeight: 1 };
  }

  getGolfSwingJackpotWeights() {
    return serverConfig.golfSwingJackpotSegmentsAndWeight || { "5": 1 };
  }

  getGolfSwingSuperJackpotWeights() {
    return serverConfig.golfSwingSuperJackpotSegmentsAndWeight || { "10": 1 };
  }

  shuffleGolfJackpotWheel(values = []) {
    const list = [...values];
    for (let index = list.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(this.random() * (index + 1));
      [list[index], list[swapIndex]] = [list[swapIndex], list[index]];
    }
    return list;
  }

  buildGolfJackpotWheelSegments(segments = []) {
    const sorted = [...segments].filter(Number.isFinite).sort((a, b) => a - b);
    if (sorted.length <= 2) return this.shuffleGolfJackpotWheel(sorted);

    const splitAt = Math.ceil(sorted.length / 2);
    const common = this.shuffleGolfJackpotWheel(sorted.slice(0, splitAt));
    const rare = this.shuffleGolfJackpotWheel(sorted.slice(splitAt));
    const wheel = [];

    for (let index = 0; index < Math.max(common.length, rare.length); index += 1) {
      if (index < common.length) wheel.push(common[index]);
      if (index < rare.length) wheel.push(rare[index]);
    }

    const offset = Math.floor(this.random() * wheel.length);
    const rotated = wheel.slice(offset).concat(wheel.slice(0, offset));
    const swapPasses = Math.min(3, Math.max(1, Math.floor(rotated.length / 4)));
    for (let pass = 0; pass < swapPasses; pass += 1) {
      const swapIndex = Math.floor(this.random() * (rotated.length - 1));
      [rotated[swapIndex], rotated[swapIndex + 1]] = [rotated[swapIndex + 1], rotated[swapIndex]];
    }

    return rotated;
  }

  getPartyConfig() {
    return serverConfig.partyFeature || {
      odds: 0.03,
      oddsForGiant: 0.5,
      oddsForStomp: 1,
      oddsForCrush: 0,
      preDropMs: 1400,
    };
  }

  buildPartySymbolWeights() {
    const animals = this.getAnimalSymbolSet();
    const weights = {};
    animals.forEach((symbolId) => {
      weights[String(symbolId)] = Number(serverConfig.symbolWeights?.[String(symbolId)] || 1);
    });
    return weights;
  }

  buildPartyBoard() {
    const weights = this.buildPartySymbolWeights();
    return Array.from({ length: this.width }, () =>
      Array.from({ length: this.height }, () => this.randomSymbol(weights))
    );
  }

  resolvePartyFeature(board, { forceParty = false, allowNatural = false, betSize = 1, ticket } = {}) {
    if (!forceParty && !allowNatural) return null;
    const cfg = this.getPartyConfig();
    const triggered = forceParty || this.random() < Number(cfg.odds || 0);
    if (!triggered) return null;

    const partyBoard = this.maybeInjectUnicorn(this.buildPartyBoard(), { ticket });
    const giantAppeared = this.random() < Number(cfg.oddsForGiant ?? 0.5);
    let finalBoard = partyBoard;
    let stompEvent = null;
    let crushEvent = null;

    if (giantAppeared) {
      const giantType = this.drawWeightedKey({
        stomp: Number(cfg.oddsForStomp ?? 1),
        crush: Number(cfg.oddsForCrush ?? 0),
      }, "stomp");
      if (giantType === "stomp") {
        const stompResult = this.resolveStompFeature(partyBoard, { forceStomp: true, betSize });
        if (stompResult) {
          finalBoard = stompResult.board;
          stompEvent = stompResult.stompEvent;
        }
      } else {
        const crushResult = this.resolveCrushFeature(partyBoard, { forceCrush: true, betSize });
        if (crushResult) {
          finalBoard = crushResult.board;
          crushEvent = crushResult.crushEvent;
        }
      }
    }

    return {
      board: finalBoard,
      partyEvent: {
        triggered: true,
        giantAppeared,
        preDropMs: Math.max(0, Number(cfg.preDropMs) || 1400),
      },
      stompEvent,
      crushEvent,
    };
  }

  getAnimalSymbolSet() {
    return new Set(
      Array.isArray(serverConfig.animalSymbols) ? serverConfig.animalSymbols.map(Number) : [1, 2, 3, 4, 5]
    );
  }

  getUnicornSymbol() {
    return Number(serverConfig.unicornSymbol ?? 14);
  }

  getWildSymbolSet() {
    const configured = serverConfig.wildSymbols || [serverConfig.unicornSymbol ?? 14];
    return new Set((Array.isArray(configured) ? configured : [configured]).map(Number));
  }

  getSuperBonusLives() {
    return Math.max(1, Number(serverConfig.superBonus?.lives) || 4);
  }

  findUnicornPositions(board) {
    const unicornSymbol = this.getUnicornSymbol();
    const positions = [];
    for (let reel = 0; reel < this.width; reel += 1) {
      for (let row = 0; row < this.height; row += 1) {
        const symbol = Number(board[reel][row]);
        if (symbol === unicornSymbol) {
          positions.push({ reel, row, symbol, isAnimal: false, isUnicorn: true });
        }
      }
    }
    return positions;
  }

  pickRandomUnicornCell() {
    return {
      reel: Math.floor(this.random() * this.width),
      row: Math.floor(this.random() * this.height),
    };
  }

  buildGolfswingEntryBoard({ requireUnicorn = false } = {}) {
    const board = this.generateRandomBoard(serverConfig.symbolWeights);
    const unicornSymbol = this.getUnicornSymbol();
    const animalSymbols = [...this.getAnimalSymbolSet()];

    if (requireUnicorn) {
      const { reel, row } = this.pickRandomUnicornCell();
      board[reel][row] = unicornSymbol;
    }

    const minAnimals = 1;
    let guard = 0;
    while (this.findAnimalPositions(board).length < minAnimals && guard < 50) {
      guard += 1;
      const reel = Math.floor(this.random() * this.width);
      const row = Math.floor(this.random() * this.height);
      if (Number(board[reel][row]) === unicornSymbol) continue;
      const symbol = animalSymbols[Math.floor(this.random() * animalSymbols.length)] || 1;
      board[reel][row] = symbol;
    }

    return board;
  }

  maybeInjectUnicorn(board, { ticket } = {}) {
    const unicornSymbol = this.getUnicornSymbol();
    if (ticket === "superBonusEntry") return board;

    const odds = Number(serverConfig.unicorn_injection?.odds ?? 0);
    if (odds <= 0 || this.random() >= odds) return board;

    const nextBoard = clone(board);
    const { reel, row } = this.pickRandomUnicornCell();
    nextBoard[reel][row] = unicornSymbol;
    return nextBoard;
  }

  findAnimalPositions(board) {
    const animalSymbols = this.getAnimalSymbolSet();
    const positions = [];
    for (let reel = 0; reel < this.width; reel += 1) {
      for (let row = 0; row < this.height; row += 1) {
        const symbol = Number(board[reel][row]);
        if (animalSymbols.has(symbol)) {
          positions.push({ reel, row, symbol, isAnimal: true });
        }
      }
    }
    return positions;
  }

  ensureAnimalSurvivor(board, blockedPositions = new Set(), crushedCells = []) {
    const survivingAnimals = this.findAnimalPositions(board);
    if (survivingAnimals.length) return survivingAnimals;

    const sparedAnimalIndex = crushedCells.findLastIndex((cell) => cell?.isAnimal);
    if (sparedAnimalIndex >= 0) {
      const [sparedAnimal] = crushedCells.splice(sparedAnimalIndex, 1);
      board[sparedAnimal.reel][sparedAnimal.row] = sparedAnimal.symbol;
      return [{
        reel: sparedAnimal.reel,
        row: sparedAnimal.row,
        symbol: sparedAnimal.symbol,
        isAnimal: true,
      }];
    }

    const animalSymbol = this.getAnimalSymbolSet().values().next().value || 1;
    for (let reel = 0; reel < this.width; reel += 1) {
      for (let row = 0; row < this.height; row += 1) {
        if (blockedPositions.has(`${reel},${row}`)) continue;
        board[reel][row] = animalSymbol;
        return [{ reel, row, symbol: animalSymbol, isAnimal: true }];
      }
    }
    return [];
  }

  drawCoinType() {
    const entries = Object.entries(serverConfig.coinTypes || {}).filter(([, weight]) => Number(weight) > 0);
    if (!entries.length) return 20;
    const total = entries.reduce((sum, [, weight]) => sum + Number(weight), 0);
    let pick = this.random() * total;
    for (const [coinType, weight] of entries) {
      pick -= Number(weight);
      if (pick < 0) return Number(coinType);
    }
    return Number(entries.at(-1)?.[0] || 20);
  }

  drawWeightedKey(weights = {}, fallbackKey = "1") {
    const entries = Object.entries(weights).filter(([, weight]) => Number(weight) > 0);
    if (!entries.length) return fallbackKey;
    const total = entries.reduce((sum, [, weight]) => sum + Number(weight), 0);
    let pick = this.random() * total;
    for (const [key, weight] of entries) {
      pick -= Number(weight);
      if (pick < 0) return key;
    }
    return entries.at(-1)?.[0] || fallbackKey;
  }

  drawWeightedCount(weights = {}, fallback = 1) {
    const key = this.drawWeightedKey(weights, String(fallback));
    const count = Math.floor(Number(key));
    return Number.isFinite(count) && count > 0 ? count : fallback;
  }

  getCoinValue(coinType, betSize = 1) {
    const base = Number(serverConfig.coinTypeValue?.[String(coinType)] || 0);
    return asMoney(base * Number(betSize));
  }

  pickStompReels() {
    const cfg = this.getStompConfig();
    let size;
    if (isObject(cfg.stompReelSize)) {
      size = this.drawWeightedCount(cfg.stompReelSize, 2);
    } else {
      const min = Math.max(1, Math.floor(Number(cfg.stompReelSizeMin) || 2));
      const max = Math.min(this.width, Math.max(min, Math.floor(Number(cfg.stompReelSizeMax) || 3)));
      size = min + Math.floor(this.random() * (max - min + 1));
    }
    size = Math.max(1, Math.min(this.width, size));
    const start = Math.floor(this.random() * (this.width - size + 1));
    return Array.from({ length: size }, (_, index) => start + index);
  }

  resolveStompFeature(board, { forceStomp = false, allowNatural = false, betSize = 1 } = {}) {
    if (!forceStomp && !allowNatural) return null;
    const cfg = this.getStompConfig();
    const triggered = forceStomp || this.random() < Number(cfg.odds || 0);
    if (!triggered) return null;

    const reels = this.pickStompReels();
    const animalSymbols = this.getAnimalSymbolSet();
    const unicornSymbol = this.getUnicornSymbol();
    const crushedCells = [];
    const nextBoard = clone(board);

    reels.forEach((reel) => {
      for (let row = 0; row < this.height; row += 1) {
        const symbol = Number(nextBoard[reel][row]);
        if (symbol <= 0) continue;
        const isUnicorn = symbol === unicornSymbol;
        const isAnimal = animalSymbols.has(symbol);
        const coinType = isAnimal ? this.drawCoinType() : null;
        crushedCells.push({
          reel,
          row,
          symbol,
          isAnimal,
          isUnicorn,
          coinType,
          coinValue: coinType ? this.getCoinValue(coinType, betSize) : null
        });
        nextBoard[reel][row] = 0;
      }
    });
    const angerReactorPositions = this.ensureAnimalSurvivor(
      nextBoard,
      new Set(crushedCells.map((cell) => `${cell.reel},${cell.row}`)),
      crushedCells
    );

    const coinWin = crushedCells
      .filter((cell) => cell.isAnimal && Number(cell.coinValue) > 0)
      .reduce((sum, cell) => asTbm(sum + Number(cell.coinValue)), 0);

    return {
      board: nextBoard,
      stompEvent: {
        triggered: true,
        reels,
        crushedCells,
        angerReactorPositions,
        reelsBeforeStomp: clone(board),
        coinWin,
        teaseMs: 900,
        pauseMs: 450
      }
    };
  }

  resolveCrushFeature(board, { forceCrush = false, allowNatural = false, betSize = 1 } = {}) {
    if (!forceCrush && !allowNatural) return null;
    const cfg = this.getCrushConfig();
    const triggered = forceCrush || this.random() < Number(cfg.odds || 0);
    if (!triggered) return null;

    const animals = this.findAnimalPositions(board);
    const unicorns = this.findUnicornPositions(board);
    const pool = [...unicorns, ...animals];
    if (!pool.length) return null;

    const crushAmount = isObject(cfg.crushAmount)
      ? this.drawWeightedCount(cfg.crushAmount, 1)
      : 1;
    const crushedCells = [];
    const nextBoard = clone(board);
    const picks = Math.min(crushAmount, pool.length);
    const workingPool = [...pool];

    for (let index = 0; index < picks; index += 1) {
      const unicornIndex = workingPool.findIndex((target) => target.isUnicorn);
      const pickIndex = unicornIndex >= 0
        ? unicornIndex
        : Math.floor(this.random() * workingPool.length);
      const target = workingPool.splice(pickIndex, 1)[0];
      const isAnimal = target.isAnimal === true;
      const coinType = isAnimal ? this.drawCoinType() : null;
      crushedCells.push({
        reel: target.reel,
        row: target.row,
        symbol: target.symbol,
        isAnimal,
        isUnicorn: target.isUnicorn === true,
        coinType,
        coinValue: coinType ? this.getCoinValue(coinType, betSize) : null,
      });
      nextBoard[target.reel][target.row] = 0;
    }
    const angerReactorPositions = this.ensureAnimalSurvivor(
      nextBoard,
      new Set(crushedCells.map((cell) => `${cell.reel},${cell.row}`)),
      crushedCells
    );

    const coinWin = crushedCells
      .filter((cell) => cell.isAnimal && Number(cell.coinValue) > 0)
      .reduce((sum, cell) => asTbm(sum + Number(cell.coinValue)), 0);

    return {
      board: nextBoard,
      crushEvent: {
        triggered: true,
        crushedCells,
        angerReactorPositions,
        crushCount: crushedCells.length,
        reelsBeforeCrush: clone(board),
        coinWin,
        teaseMs: 700,
        pauseMs: 350,
      },
    };
  }

  getGolfHitZoneDistance(nx, ny, hitZone) {
    const dx = Number(nx) - Number(hitZone.x);
    const dy = Number(ny) - Number(hitZone.y);
    return Math.sqrt(dx * dx + dy * dy);
  }

  isInsideGolfHitZone(nx, ny, hitZone) {
    return this.getGolfHitZoneDistance(nx, ny, hitZone) <= Number(hitZone.radius);
  }

  resolveGolfCrosshairEnd(hit, hitZone) {
    const bounds = { minX: 0.08, maxX: 0.92, minY: 0.2, maxY: 0.7 };
    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    const minMissDist = Number(hitZone.radius) * 1.08;
    const maxHitDist = Number(hitZone.radius) * 0.98;

    if (hit) {
      const angle = this.random() * Math.PI * 2;
      const dist = maxHitDist * (0.12 + this.random() * 0.88);
      let endX = hitZone.x + Math.cos(angle) * dist;
      let endY = hitZone.y + Math.sin(angle) * dist;
      endX = clamp(endX, bounds.minX, bounds.maxX);
      endY = clamp(endY, bounds.minY, bounds.maxY);
      if (!this.isInsideGolfHitZone(endX, endY, hitZone)) {
        endX = hitZone.x + Math.cos(angle) * dist * 0.75;
        endY = hitZone.y + Math.sin(angle) * dist * 0.75;
      }
      return { crosshairEndX: endX, crosshairEndY: endY };
    }

    for (let attempt = 0; attempt < 24; attempt += 1) {
      const angle = this.random() * Math.PI * 2;
      const dist = minMissDist + this.random() * Number(hitZone.radius) * 0.55;
      let endX = clamp(hitZone.x + Math.cos(angle) * dist, bounds.minX, bounds.maxX);
      let endY = clamp(hitZone.y + Math.sin(angle) * dist, bounds.minY, bounds.maxY);
      if (!this.isInsideGolfHitZone(endX, endY, hitZone)
        && this.getGolfHitZoneDistance(endX, endY, hitZone) >= minMissDist) {
        return { crosshairEndX: endX, crosshairEndY: endY };
      }
    }

    const fallbackAngle = this.random() * Math.PI * 2;
    return {
      crosshairEndX: clamp(hitZone.x + Math.cos(fallbackAngle) * minMissDist, bounds.minX, bounds.maxX),
      crosshairEndY: clamp(hitZone.y + Math.sin(fallbackAngle) * minMissDist, bounds.minY, bounds.maxY),
    };
  }

  resolveGolfswingFeature(board, {
    forceGolfswing = false,
    forceSuperGolfswing = false,
    allowNatural = false,
    betSize = 1,
  } = {}) {
    if (!forceGolfswing && !allowNatural) return null;
    const cfg = this.getGolfswingConfig();
    const triggered = forceGolfswing || this.random() < Number(cfg.odds || 0);
    if (!triggered) return null;

    const animals = this.findAnimalPositions(board);
    const unicorns = this.findUnicornPositions(board);
    let picked;
    let isSuperGolfswing = false;

    if (forceSuperGolfswing) {
      if (!unicorns.length) return null;
      picked = unicorns[Math.floor(this.random() * unicorns.length)];
      isSuperGolfswing = true;
    } else {
      const pickPool = [...animals, ...unicorns];
      if (!pickPool.length) return null;
      picked = pickPool[Math.floor(this.random() * pickPool.length)];
      isSuperGolfswing = picked.isUnicorn === true;
    }

    const hit = this.drawWeightedKey({
      hit: Number(cfg.hitWeight ?? 1),
      miss: Number(cfg.missWeight ?? 1),
    }, "hit") === "hit";

    const jackpotWeights = isSuperGolfswing
      ? this.getGolfSwingSuperJackpotWeights()
      : this.getGolfSwingJackpotWeights();
    const defaultJackpotKey = isSuperGolfswing ? "10" : "5";
    const jackpotSegment = hit
      ? Number(this.drawWeightedKey(jackpotWeights, defaultJackpotKey))
      : 0;
    const jackpotWin = hit ? asMoney(jackpotSegment * Number(betSize)) : 0;

    const aimDurationMs = 3000 + Math.floor(this.random() * 2001);
    const hitZoneX = 0.5;
    const hitZoneY = 0.45;
    const hitZoneRadius = 0.34;

    const hitZone = { x: hitZoneX, y: hitZoneY, radius: hitZoneRadius };
    const { crosshairEndX, crosshairEndY } = this.resolveGolfCrosshairEnd(hit, hitZone);

    const jackpotSegments = Object.keys(jackpotWeights)
      .map(Number)
      .filter(Number.isFinite)
      .sort((a, b) => a - b);
    const jackpotWheelSegments = this.buildGolfJackpotWheelSegments(jackpotSegments);

    return {
      golfswingEvent: {
        triggered: true,
        isSuperGolfswing,
        pickedCell: { ...picked },
        reelsBeforeGolfswing: clone(board),
        hit,
        aimDurationMs,
        hitZone,
        crosshairY: hitZoneY,
        crosshairEndX,
        crosshairEndY,
        crosshairInsideHitZone: this.isInsideGolfHitZone(crosshairEndX, crosshairEndY, hitZone),
        jackpotSegment,
        jackpotWin,
        jackpotSegments,
        jackpotWheelSegments,
        teaseMs: 700,
        pauseMs: 350,
      },
    };
  }

  getAngerMeterMax() {
    return Math.max(1, Number(serverConfig.anger?.maximum) || 10);
  }

  getAngerDisplayCapBeforeBonus() {
    const max = this.getAngerMeterMax();
    const configured = Number(serverConfig.anger?.displayCapBeforeBonus);
    if (!Number.isFinite(configured)) return max - 1;
    return Math.max(1, Math.min(configured, max - 1));
  }

  getAngerMeterTickOdds() {
    return Number(
      serverConfig.angerMeterTickOdds
      ?? serverConfig.angetMeterTickOdds
      ?? 0.1
    );
  }

  getBonusTriggerOdds(animalKillCount = 0) {
    const table = serverConfig.bonusTriggerOdds || {};
    const keys = Object.keys(table).map(Number).filter(Number.isFinite);
    const capped = keys.length
      ? Math.min(Math.max(0, Math.floor(Number(animalKillCount) || 0)), Math.max(...keys))
      : Math.max(0, Math.floor(Number(animalKillCount) || 0));
    return Number(table[String(capped)] ?? 0);
  }

  createRoundTracker() {
    return {
      triggered: false,
      consumedScatterKeys: new Set(),
      animalsKilled: 0,
      angerDisplay: 0,
    };
  }

  processAnimalKills(cells = [], tracker, { forceBonus = false } = {}) {
    const cap = this.getAngerDisplayCapBeforeBonus();
    const animals = (Array.isArray(cells) ? cells : []).filter((cell) => cell?.isAnimal);
    const events = [];

    animals.forEach((cell) => {
      tracker.animalsKilled += 1;
      const ticked = this.random() < this.getAngerMeterTickOdds();
      if (ticked && tracker.angerDisplay < cap) {
        tracker.angerDisplay += 1;
      }
      events.push({
        reel: cell.reel,
        row: cell.row,
        symbol: cell.symbol,
        ticked,
        displayAfter: tracker.angerDisplay,
      });
    });

    let bonusTriggered = false;
    if (!tracker.triggered && animals.length > 0) {
      const odds = forceBonus ? 100 : this.getBonusTriggerOdds(tracker.animalsKilled);
      if (this.random() * 100 < odds) {
        bonusTriggered = true;
        tracker.triggered = true;
      }
    }

    return {
      events,
      bonusTriggered,
      animalsKilled: tracker.animalsKilled,
    };
  }

  scatterPositionKey({ reel, row }) {
    return `${reel},${row}`;
  }

  collectScatterCandidates(board, gravityResult, consumedScatterKeys) {
    const positions = gravityResult
      ? gravityResult.newPositions.filter(({ symbol }) => symbol === serverConfig.scatterSymbol)
      : this.findScatterPositions(board);
    return positions.filter((position) => !consumedScatterKeys.has(this.scatterPositionKey(position)));
  }

  consumeScatterLandings(positions) {
    return positions.map((position) => ({
      ...position,
      counted: false,
      angerBefore: 0,
      angerAfter: 0,
      triggeredBonus: false,
    }));
  }

  buildActionState({
    action,
    pastAction,
    nextAction,
    board,
    removedBoard,
    gravityResult,
    result,
    scatterLandings,
    tracker,
    totals,
    betSize,
    roundMeta,
    isBonus,
    bonusRemaining,
    bonusTriggeredThisAction,
    stompEvent = null,
    crushEvent = null,
    partyEvent = null,
    golfswingEvent = null,
    animalKillEvents = [],
    superBonusTriggered = false,
    unicornCrushEvent = null,
  }) {
    const angerMax = this.getAngerMeterMax();
    const angerCount = bonusTriggeredThisAction ? angerMax : tracker.angerDisplay;
    const winCapReached = this.isWinCapReached(totals);
    return {
      ...clone(serverConfig.gameState),
      bucket: roundMeta.ticketStrategy,
      betSize,
      pastAction,
      executedAction: action,
      nextAction,
      reels: clone(board),
      reelsBeforeDrop: removedBoard ? clone(removedBoard) : null,
      reelsAfterDrop: gravityResult ? clone(board) : null,
      dropEvent: gravityResult ? clone(gravityResult.dropEvent) : null,
      waysWins: clone(result.waysWins),
      clusters: this.toCompatibilityClusters(result.waysWins),
      scatterLandings: clone(scatterLandings),
      gravity: "down",
      winAmount: result.winAmount,
      twa: totals.twa,
      tbm: totals.tbm,
      bgwe: bonusTriggeredThisAction,
      bonusGameWonEvent: bonusTriggeredThisAction
        ? (superBonusTriggered
          ? { source: "unicornCrush", action, isSuperBonus: true }
          : { source: "animalCrush", action })
        : null,
      isBonus,
      bonusState: {
        initialFreespins: isBonus ? serverConfig.bonus.freespins : 0,
        finalFreespins: isBonus ? bonusRemaining : 0
      },
      anger: angerCount,
      angerMeter: {
        count: angerCount,
        max: angerMax,
      },
      animalKillEvents: clone(animalKillEvents),
      superBonusTriggered,
      unicornCrushEvent: unicornCrushEvent ? clone(unicornCrushEvent) : null,
      angerEvent: {
        triggered: bonusTriggeredThisAction,
        ignoredLandings: scatterLandings.filter((landing) => !landing.counted).length,
      },
      stompEvent: stompEvent ? clone(stompEvent) : null,
      crushEvent: crushEvent ? clone(crushEvent) : null,
      partyEvent: partyEvent ? clone(partyEvent) : null,
      golfswingEvent: golfswingEvent ? clone(golfswingEvent) : null,
      winCapReached,
      roundMeta: clone(roundMeta)
    };
  }

  appendCascadeChain({
    roundStates,
    initialBoard,
    initialAction,
    cascadeAction: _cascadeAction,
    pastAction,
    nextWhenDone,
    tracker,
    totals,
    betSize,
    roundMeta,
    isBonus,
    bonusRemaining,
    forceStomp = false,
    allowNaturalStomp = false,
    forceCrush = false,
    allowNaturalCrush = false,
    forceParty = false,
    allowNaturalParty = false,
    forceGolfswing = false,
    forceSuperGolfswing = false,
    allowNaturalGolfswing = false,
    forceBonus = false,
  }) {
    let board = clone(initialBoard);
    const landingBoard = clone(initialBoard);
    let stompEvent = null;
    let crushEvent = null;
    let partyEvent = null;
    let golfswingEvent = null;
    let animalKillEvents = [];
    let bonusTriggeredThisAction = false;
    let superBonusTriggered = false;
    let unicornCrushEvent = null;

    if (initialAction === "spin" && !isBonus) {
      const partyResult = this.resolvePartyFeature(board, {
        forceParty,
        allowNatural: allowNaturalParty,
        betSize,
        ticket: roundMeta?.ticket,
      });
      if (partyResult) {
        board = partyResult.board;
        partyEvent = partyResult.partyEvent;
        stompEvent = partyResult.stompEvent;
        crushEvent = partyResult.crushEvent;
      } else {
        const stompResult = this.resolveStompFeature(board, {
          forceStomp,
          allowNatural: allowNaturalStomp,
          betSize
        });
        if (stompResult) {
          board = stompResult.board;
          stompEvent = stompResult.stompEvent;
        } else {
          const crushResult = this.resolveCrushFeature(board, {
            forceCrush: forceCrush || forceBonus,
            allowNatural: allowNaturalCrush,
            betSize,
          });
          if (crushResult) {
            board = crushResult.board;
            crushEvent = crushResult.crushEvent;
          }
        }
      }

      if (stompEvent) {
        const capResult = this.applyWinCapAddition(
          totals,
          Number(stompEvent.coinWin || 0),
          { stompEvent }
        );
        stompEvent.winCapReached = capResult.capped || this.isWinCapReached(totals);
      }
      if (crushEvent) {
        const capResult = this.applyWinCapAddition(
          totals,
          Number(crushEvent.coinWin || 0),
          { crushEvent }
        );
        crushEvent.winCapReached = capResult.capped || this.isWinCapReached(totals);
      }

      const killCells = stompEvent?.crushedCells || crushEvent?.crushedCells || [];
      const unicornSymbol = this.getUnicornSymbol();
      const unicornCrushed = killCells.some((cell) => Number(cell.symbol) === unicornSymbol);

      if (unicornCrushed) {
        const unicornCell = killCells.find((cell) => Number(cell.symbol) === unicornSymbol);
        unicornCrushEvent = {
          reel: unicornCell.reel,
          row: unicornCell.row,
          symbol: unicornSymbol,
        };
        tracker.triggered = true;
        superBonusTriggered = true;
        bonusTriggeredThisAction = true;
      }

      if (killCells.length) {
        const killResult = this.processAnimalKills(killCells, tracker, { forceBonus: forceBonus && !superBonusTriggered });
        animalKillEvents = killResult.events;
        if (!superBonusTriggered) {
          bonusTriggeredThisAction = killResult.bonusTriggered;
        }
        if (stompEvent) {
          stompEvent.animalKillEvents = clone(killResult.events);
          stompEvent.bonusTriggered = bonusTriggeredThisAction;
          stompEvent.superBonusTriggered = superBonusTriggered;
          stompEvent.unicornCrushEvent = unicornCrushEvent ? clone(unicornCrushEvent) : null;
        }
        if (crushEvent) {
          crushEvent.animalKillEvents = clone(killResult.events);
          crushEvent.bonusTriggered = bonusTriggeredThisAction;
          crushEvent.superBonusTriggered = superBonusTriggered;
          crushEvent.unicornCrushEvent = unicornCrushEvent ? clone(unicornCrushEvent) : null;
        }
      }

      if (forceBonus && !tracker.triggered) {
        tracker.triggered = true;
        bonusTriggeredThisAction = true;
        if (stompEvent) stompEvent.bonusTriggered = true;
        if (crushEvent) crushEvent.bonusTriggered = true;
      }
    }

    const result = this.evaluateWays(board, betSize);
    const waysCapResult = this.applyWinCapAddition(totals, result.winAmount);
    if (waysCapResult.applied + 0.00000001 < result.winAmount) {
      const scale = waysCapResult.applied / Math.max(result.winAmount, 0.00000001);
      result.winAmount = asMoney(result.winAmount * scale);
      result.tbm = asTbm(result.tbm * scale);
      result.waysWins = result.waysWins.map((win) => ({
        ...win,
        winAmount: asMoney(Number(win.winAmount) * scale),
        tbm: asTbm(Number(win.tbm) * scale),
      }));
    }
    totals.tbm = asTbm(totals.tbm + result.tbm);
    const scatterCandidates = this.collectScatterCandidates(board, null, tracker.consumedScatterKeys);
    const scatterLandings = this.consumeScatterLandings(scatterCandidates);

    if (initialAction === "spin" && !isBonus
      && !stompEvent && !crushEvent && !partyEvent?.giantAppeared) {
      const swingResult = this.resolveGolfswingFeature(landingBoard, {
        forceGolfswing,
        forceSuperGolfswing,
        allowNatural: allowNaturalGolfswing,
        betSize,
      });
      if (swingResult?.golfswingEvent) {
        golfswingEvent = swingResult.golfswingEvent;
        if (golfswingEvent.hit && Number(golfswingEvent.jackpotWin) > 0) {
          const capResult = this.applyWinCapAddition(
            totals,
            Number(golfswingEvent.jackpotWin),
            { golfswingEvent }
          );
          golfswingEvent.jackpotWin = capResult.applied;
          golfswingEvent.winCapReached = capResult.capped || this.isWinCapReached(totals);
          totals.tbm = asTbm(totals.tbm + Number(golfswingEvent.jackpotSegment || 0));
        }
      }
    }

    if (this.isWinCapReached(totals)) {
      bonusTriggeredThisAction = false;
      superBonusTriggered = false;
      unicornCrushEvent = null;
      if (stompEvent) {
        stompEvent.bonusTriggered = false;
        stompEvent.superBonusTriggered = false;
        stompEvent.unicornCrushEvent = null;
      }
      if (crushEvent) {
        crushEvent.bonusTriggered = false;
        crushEvent.superBonusTriggered = false;
        crushEvent.unicornCrushEvent = null;
      }
    }

    let nextAction = !isBonus && tracker.triggered ? "bonustransition" : nextWhenDone;
    if (this.isWinCapReached(totals)) {
      nextAction = "spin";
    }

    roundStates.push(this.buildActionState({
      action: initialAction,
      pastAction,
      nextAction,
      board,
      removedBoard: null,
      gravityResult: null,
      result,
      scatterLandings,
      tracker,
      totals,
      betSize,
      roundMeta,
      isBonus,
      bonusRemaining,
      bonusTriggeredThisAction,
      stompEvent,
      crushEvent,
      partyEvent,
      golfswingEvent,
      animalKillEvents,
      superBonusTriggered,
      unicornCrushEvent,
    }));

    if (this.isWinCapReached(totals)) return "spin";
    if (tracker.triggered) return "bonustransition";
    return nextAction;
  }

  generateRoundStatesOnce({ betSize, ticketStrategy, fakeNoWins = false } = {}) {
    const normalizedBet = Number(betSize);
    const forced = this.resolveForcedOutcomeSelection(ticketStrategy);
    const strategy = this.resolveTicketStrategy(forced?.strategy || ticketStrategy);
    const ticket = fakeNoWins ? "noWin" : (forced?.ticket || this.drawWeightedTicket(strategy));
    const roundMeta = this.buildRoundMeta({ betSize: normalizedBet, ticketStrategy: strategy, ticket });
    const forceStomp = ticket === "stompEntry" || ticket === "superBonusEntry";
    const allowNaturalStomp = ticket === "random";
    const forceCrush = ticket === "crushEntry" || ticket === "bonusEntry";
    const allowNaturalCrush = ticket === "random";
    const forceParty = ticket === "partyEntry";
    const allowNaturalParty = ticket === "random";
    const forceGolfswing = ticket === "golfswingEntry" || ticket === "superGolfswingEntry";
    const forceSuperGolfswing = ticket === "superGolfswingEntry";
    const allowNaturalGolfswing = ticket === "random";
    const tracker = this.createRoundTracker();
    const totals = { twa: 0, tbm: 0 };
    const roundStates = [];

    const paidBoard = this.createInitialBoard({
      action: "spin",
      ticket,
      ticketStrategy: strategy,
      spinIndex: 0,
      isBonus: false,
      fakeNoWins,
    });
    const paidNext = this.appendCascadeChain({
      roundStates,
      initialBoard: paidBoard,
      initialAction: "spin",
      cascadeAction: "respin",
      pastAction: "spin",
      nextWhenDone: "spin",
      tracker,
      totals,
      betSize: normalizedBet,
      roundMeta,
      isBonus: false,
      bonusRemaining: 0,
      forceStomp,
      allowNaturalStomp,
      forceCrush,
      allowNaturalCrush,
      forceParty,
      allowNaturalParty,
      forceGolfswing,
      forceSuperGolfswing,
      allowNaturalGolfswing,
      forceBonus: ticket === "bonusEntry",
    });

    if (paidNext === "bonustransition" && !this.isWinCapReached(totals)) {
      const lastSpin = roundStates.at(-1);
      const isSuperBonus = lastSpin?.superBonusTriggered === true;
      const bonusLives = isSuperBonus
        ? this.getSuperBonusLives()
        : Math.max(1, Number(serverConfig.bonus?.lives) || 3);
      roundStates.push({
        ...clone(serverConfig.gameState),
        bucket: strategy,
        betSize: normalizedBet,
        pastAction: roundStates.at(-1).executedAction,
        executedAction: "bonustransition",
        nextAction: "freespin",
        twa: totals.twa,
        tbm: totals.tbm,
        bgwe: true,
        bonusGameWonEvent: {
          source: isSuperBonus ? "unicornCrush" : "animalCrush",
          action: roundStates.at(-1).executedAction,
          isSuperBonus,
        },
        superBonusTriggered: isSuperBonus,
        unicornCrushEvent: lastSpin?.unicornCrushEvent ? clone(lastSpin.unicornCrushEvent) : null,
        isBonus: true,
        bonusState: {
          initialFreespins: bonusLives,
          finalFreespins: bonusLives,
          livesRemaining: bonusLives,
          livesBeforeSpin: bonusLives,
          livesAfterSpend: bonusLives,
          maxLives: bonusLives,
          isSuperBonus,
          spinsPlayed: 0,
          resetLives: false
        },
        trapMeter: {
          progress: Object.fromEntries(
            (serverConfig.bonus?.trapSymbols || [666, 777, 888, 999]).map((symbol) => [String(symbol), 0])
          ),
          required: Math.max(1, Number(serverConfig.bonus?.trapLightsRequired) || 4),
          values: Object.fromEntries(
            (serverConfig.bonus?.trapSymbols || [666, 777, 888, 999]).map((symbol) => [
              String(symbol),
              asTbm(Number(serverConfig.bonusWinAmounts?.[String(symbol)] || 0))
            ])
          ),
          power: 0
        },
        damageWheel: {
          segments: [...(serverConfig.damageWheelSegments || [])].map(Number),
          removedSegments: [],
          remainingSegments: [...(serverConfig.damageWheelSegments || [])].map(Number)
        },
        anger: 0,
        angerMeter: {
          count: 0,
          max: this.getAngerMeterMax(),
        },
        roundMeta: clone(roundMeta)
      });

      this.appendBonusCashGame({
        roundStates,
        totals,
        betSize: normalizedBet,
        roundMeta
      });
    }

    const finalState = roundStates.at(-1);
    this.enforceWinCapTotal(totals);
    if (finalState) {
      finalState.twa = totals.twa;
      finalState.winCapReached = this.isWinCapReached(totals);
    }
    finalState.roundSummary = {
      totalWin: totals.twa,
      tbm: totals.tbm,
      normalWinTBM: roundStates
        .filter((state) => !state.isBonus)
        .reduce((sum, state) => asTbm(sum + Number(state.waysWins?.reduce((s, win) => s + win.tbm, 0) || 0)), 0),
      bonusWinTBM: asTbm(Number(finalState?.ouchStompEvent?.finalWinTbm || 0)),
      trapPower: Number(
        [...roundStates].reverse().find((state) => state.isBonus)?.trapMeter?.power || 0
      ),
      wasBonus: paidNext === "bonustransition",
      isComplete: true
    };
    if (fakeNoWins) {
      finalState.simulationFakeNoWin = true;
    }
    return roundStates;
  }

  hasStomp(roundStates) {
    return roundStates.some((state) => state.stompEvent?.triggered);
  }

  hasCrush(roundStates) {
    return roundStates.some((state) => state.crushEvent?.triggered);
  }

  hasGolfswing(roundStates) {
    return roundStates.some((state) => state.golfswingEvent?.triggered);
  }

  hasSuperGolfswing(roundStates) {
    return roundStates.some(
      (state) => state.golfswingEvent?.triggered && state.golfswingEvent?.isSuperGolfswing === true
    );
  }

  hasParty(roundStates) {
    return roundStates.some((state) => state.partyEvent?.triggered);
  }

  hasSuperBonus(roundStates) {
    return roundStates.some(
      (state) => state.executedAction === "bonustransition" && state.superBonusTriggered === true
    );
  }

  hasUnicornOnGameArea(roundStates) {
    const unicornSymbol = this.getUnicornSymbol();
    const hasUnicornOnReels = (reels) => {
      if (!Array.isArray(reels)) return false;
      return reels.some(
        (reel) => Array.isArray(reel) && reel.some((symbol) => Number(symbol) === unicornSymbol)
      );
    };
    const crushedCellsContainUnicorn = (cells) =>
      (cells || []).some(
        (cell) => cell?.isUnicorn === true || Number(cell?.symbol) === unicornSymbol
      );

    return roundStates.some((state) => {
      if (state.isBonus === true || state.executedAction !== "spin") return false;

      if (hasUnicornOnReels(state.reels)) return true;
      if (hasUnicornOnReels(state.stompEvent?.reelsBeforeStomp)) return true;
      if (state.unicornCrushEvent) return true;
      if (crushedCellsContainUnicorn(state.stompEvent?.crushedCells)) return true;
      if (crushedCellsContainUnicorn(state.crushEvent?.crushedCells)) return true;

      return false;
    });
  }

  resolveFeatureBuyStrategy(strategy) {
    const allowed = new Set([
      "bonusEntry",
      "superBonusEntry",
      "partyEntry",
      "golfswingEntry",
      "superGolfswingEntry",
    ]);
    return allowed.has(strategy) ? strategy : null;
  }

  isFeatureBuyMatch(strategy, roundStates) {
    if (strategy === "bonusEntry") {
      return this.hasBonus(roundStates) && !this.hasSuperBonus(roundStates);
    }
    if (strategy === "superBonusEntry") {
      return this.hasSuperBonus(roundStates);
    }
    if (strategy === "partyEntry") {
      return this.hasParty(roundStates);
    }
    if (strategy === "golfswingEntry") {
      return this.hasGolfswing(roundStates);
    }
    if (strategy === "superGolfswingEntry") {
      return this.hasSuperGolfswing(roundStates);
    }
    return false;
  }

  applyFeatureBuyBucket(roundStates, bucket) {
    return roundStates.map((state) => ({
      ...state,
      bucket,
      roundMeta: state.roundMeta
        ? { ...state.roundMeta, ticketStrategy: bucket, featureBuy: true }
        : state.roundMeta,
    }));
  }

  async generateRoundStates({
    betSize = 1,
    ticketStrategy,
    fakeNoWins = false,
    huntStompFeature = false,
    featureBuyStrategy = null,
  } = {}) {
    const normalizedBet = Number(betSize);
    if (!Number.isFinite(normalizedBet) || normalizedBet <= 0) {
      throw new Error("betSize must be a positive number");
    }

    const strategy = this.resolveTicketStrategy(ticketStrategy);
    const normalizedFeatureBuy = this.resolveFeatureBuyStrategy(featureBuyStrategy);
    const guaranteedStrategies = new Set([
      "noWin",
      "waysWin",
      "bonusEntry",
      "superBonusEntry",
      "stompEntry",
      "crushEntry",
      "partyEntry",
      "golfswingEntry",
      "superGolfswingEntry",
    ]);

    const generateOnce = (boardStrategy = ticketStrategy) => this.generateRoundStatesOnce({
      betSize: normalizedBet,
      ticketStrategy: boardStrategy,
      fakeNoWins
    });

    if (normalizedFeatureBuy) {
      if (normalizedFeatureBuy === "golfswingEntry" || normalizedFeatureBuy === "superGolfswingEntry") {
        const maxAttempts = 1000;
        for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
          const roundStates = generateOnce(normalizedFeatureBuy);
          const ticket = roundStates[0]?.roundMeta?.ticket;
          if (ticket && this.isTicketMatch(ticket, roundStates)) {
            return this.applyFeatureBuyBucket(roundStates, normalizedFeatureBuy);
          }
        }
        throw new Error(`Could not find ${normalizedFeatureBuy} outcome`);
      }

      const maxAttempts = 100000;
      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        const roundStates = generateOnce("normal");
        if (this.isFeatureBuyMatch(normalizedFeatureBuy, roundStates)) {
          return this.applyFeatureBuyBucket(roundStates, normalizedFeatureBuy);
        }
      }
      throw new Error(`Could not find ${normalizedFeatureBuy} outcome via normal RNG`);
    }

    if (huntStompFeature) {
      const maxAttempts = 100000;
      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        const roundStates = generateOnce();
        if (this.hasStomp(roundStates)) {
          return roundStates;
        }
      }
      throw new Error("Could not find stomp feature outcome");
    }

    if (guaranteedStrategies.has(strategy)) {
      const maxAttempts = 1000;
      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        const roundStates = generateOnce();
        const ticket = roundStates[0]?.roundMeta?.ticket;
        if (ticket && this.isTicketMatch(ticket, roundStates)) {
          return roundStates;
        }
      }
      throw new Error(`Could not generate guaranteed outcome for ${strategy}`);
    }

    return generateOnce();
  }

  hasBonus(roundStates) {
    return roundStates.some((state) => state.executedAction === "bonustransition");
  }

  isTicketMatch(ticket, roundStates) {
    const totalTbm = Number(roundStates.at(-1)?.tbm || 0);
    if (ticket === "noWin") return totalTbm === 0;
    if (ticket === "waysWin") return totalTbm > 0;
    if (ticket === "bonusEntry") return this.hasBonus(roundStates);
    if (ticket === "superBonusEntry") {
      return this.hasBonus(roundStates)
        && roundStates.some((state) => state.superBonusTriggered || state.bonusGameWonEvent?.source === "unicornCrush");
    }
    if (ticket === "stompEntry") return this.hasStomp(roundStates);
    if (ticket === "crushEntry") return this.hasCrush(roundStates);
    if (ticket === "partyEntry") return this.hasParty(roundStates);
    if (ticket === "golfswingEntry") return this.hasGolfswing(roundStates);
    if (ticket === "superGolfswingEntry") return this.hasSuperGolfswing(roundStates);
    return false;
  }
}
