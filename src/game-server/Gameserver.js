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

  buildBonusSymbolWeights(trapProgress = {}) {
    const weights = Object.fromEntries(
      Object.entries(serverConfig.bonusSymbolWeights || {})
        .map(([symbol, weight]) => [symbol, Number(weight) || 0])
        .filter(([, weight]) => weight > 0)
    );
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

  generateBonusBoard({ trapPower = 0, forceSymbolLanding = false, trapProgress = {} } = {}) {
    const emptySymbol = Number(serverConfig.bonus?.emptySymbol ?? 0);
    const gateWeights = this.buildBonusGateWeights({ trapPower, forceSymbolLanding });
    const symbolCount = this.randomWeightedCount(gateWeights);
    const board = Array.from({ length: this.width }, () =>
      Array.from({ length: this.height }, () => emptySymbol)
    );
    if (symbolCount <= 0) return board;

    const symbolWeights = this.buildBonusSymbolWeights(trapProgress);
    for (const { reel, row } of this.pickRandomCells(symbolCount)) {
      board[reel][row] = this.randomSymbol(symbolWeights);
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
    spinIndex,
    isBonus,
    forceSymbolLanding = false,
    trapPower = 0,
    trapProgress = {}
  }) {
    if (this.boardProvider) {
      const supplied = this.boardProvider({ action, ticket, spinIndex, isBonus });
      if (supplied) return this.validateBoard(clone(supplied));
    }

    if (ticket === "noWin") return this.buildNoWinBoard();
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
    return isBonus
      ? this.generateBonusBoard({ trapPower, forceSymbolLanding, trapProgress })
      : this.generateRandomBoard(serverConfig.symbolWeights);
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
    for (const symbol of serverConfig.payingSymbols) {
      const reelPositions = [];
      for (let reel = 0; reel < this.width; reel += 1) {
        const positions = [];
        for (let row = 0; row < this.height; row += 1) {
          if (Number(reels[reel][row]) === symbol) positions.push({ reel, row });
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
          damageRemovedSegment = damageTracker.remainingSegments.shift() ?? null;
          if (damageRemovedSegment !== null) {
            damageTracker.removedSegments.push(damageRemovedSegment);
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
    const maxLives = Math.max(1, Number(serverConfig.bonus?.lives) || 3);
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
    const baseStepOdds = Number(serverConfig.damageMultilpierStepOdds ?? 0.66);
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
    const workingRemaining = [...remaining];

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

    pushStep(workingRemaining.shift());
    while (workingRemaining.length > 0) {
      const currentWinTbm = steps.at(-1)?.winTbm ?? 0;
      const stepOdds = this.resolveDamageStepOddsForCurrentWin(baseStepOdds, currentWinTbm);
      if (this.random() >= stepOdds) break;
      pushStep(workingRemaining.shift());
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

  getAnimalSymbolSet() {
    return new Set(
      Array.isArray(serverConfig.animalSymbols) ? serverConfig.animalSymbols.map(Number) : [1, 2, 3, 4, 5]
    );
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
    const animalSymbols = new Set(
      Array.isArray(serverConfig.animalSymbols) ? serverConfig.animalSymbols.map(Number) : [1, 2, 3, 4, 5]
    );
    const crushedCells = [];
    const nextBoard = clone(board);

    reels.forEach((reel) => {
      for (let row = 0; row < this.height; row += 1) {
        const symbol = Number(nextBoard[reel][row]);
        if (symbol <= 0) continue;
        const isAnimal = animalSymbols.has(symbol);
        const coinType = isAnimal ? this.drawCoinType() : null;
        crushedCells.push({
          reel,
          row,
          symbol,
          isAnimal,
          coinType,
          coinValue: coinType ? this.getCoinValue(coinType, betSize) : null
        });
        nextBoard[reel][row] = 0;
      }
    });

    const coinWin = crushedCells
      .filter((cell) => cell.isAnimal && Number(cell.coinValue) > 0)
      .reduce((sum, cell) => asTbm(sum + Number(cell.coinValue)), 0);

    return {
      board: nextBoard,
      stompEvent: {
        triggered: true,
        reels,
        crushedCells,
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
    if (!animals.length) return null;

    const crushAmount = isObject(cfg.crushAmount)
      ? this.drawWeightedCount(cfg.crushAmount, 1)
      : 1;
    const pool = [...animals];
    const crushedCells = [];
    const nextBoard = clone(board);
    const picks = Math.min(crushAmount, pool.length);

    for (let index = 0; index < picks; index += 1) {
      const pickIndex = Math.floor(this.random() * pool.length);
      const target = pool.splice(pickIndex, 1)[0];
      const coinType = this.drawCoinType();
      crushedCells.push({
        reel: target.reel,
        row: target.row,
        symbol: target.symbol,
        isAnimal: true,
        coinType,
        coinValue: this.getCoinValue(coinType, betSize),
      });
      nextBoard[target.reel][target.row] = 0;
    }

    const coinWin = crushedCells
      .filter((cell) => cell.isAnimal && Number(cell.coinValue) > 0)
      .reduce((sum, cell) => asTbm(sum + Number(cell.coinValue)), 0);

    return {
      board: nextBoard,
      crushEvent: {
        triggered: true,
        crushedCells,
        crushCount: crushedCells.length,
        reelsBeforeCrush: clone(board),
        coinWin,
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
    animalKillEvents = [],
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
        ? { source: "animalCrush", action }
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
      angerEvent: {
        triggered: bonusTriggeredThisAction,
        ignoredLandings: scatterLandings.filter((landing) => !landing.counted).length,
      },
      stompEvent: stompEvent ? clone(stompEvent) : null,
      crushEvent: crushEvent ? clone(crushEvent) : null,
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
    forceBonus = false,
  }) {
    let board = clone(initialBoard);
    let stompEvent = null;
    let crushEvent = null;
    let animalKillEvents = [];
    let bonusTriggeredThisAction = false;

    if (initialAction === "spin" && !isBonus) {
      const stompResult = this.resolveStompFeature(board, {
        forceStomp,
        allowNatural: allowNaturalStomp,
        betSize
      });
      if (stompResult) {
        board = stompResult.board;
        stompEvent = stompResult.stompEvent;
        const capResult = this.applyWinCapAddition(
          totals,
          Number(stompEvent.coinWin || 0),
          { stompEvent }
        );
        stompEvent.winCapReached = capResult.capped || this.isWinCapReached(totals);
      } else {
        const crushResult = this.resolveCrushFeature(board, {
          forceCrush: forceCrush || forceBonus,
          allowNatural: allowNaturalCrush,
          betSize,
        });
        if (crushResult) {
          board = crushResult.board;
          crushEvent = crushResult.crushEvent;
          const capResult = this.applyWinCapAddition(
            totals,
            Number(crushEvent.coinWin || 0),
            { crushEvent }
          );
          crushEvent.winCapReached = capResult.capped || this.isWinCapReached(totals);
        }
      }

      const killCells = stompEvent?.crushedCells || crushEvent?.crushedCells || [];
      if (killCells.length) {
        const killResult = this.processAnimalKills(killCells, tracker, { forceBonus });
        animalKillEvents = killResult.events;
        bonusTriggeredThisAction = killResult.bonusTriggered;
        if (stompEvent) {
          stompEvent.animalKillEvents = clone(killResult.events);
          stompEvent.bonusTriggered = killResult.bonusTriggered;
        }
        if (crushEvent) {
          crushEvent.animalKillEvents = clone(killResult.events);
          crushEvent.bonusTriggered = killResult.bonusTriggered;
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

    if (this.isWinCapReached(totals)) {
      bonusTriggeredThisAction = false;
      if (stompEvent) stompEvent.bonusTriggered = false;
      if (crushEvent) crushEvent.bonusTriggered = false;
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
      animalKillEvents,
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
    const forceStomp = ticket === "stompEntry";
    const allowNaturalStomp = ticket === "random";
    const forceCrush = ticket === "crushEntry" || ticket === "bonusEntry";
    const allowNaturalCrush = ticket === "random";
    const tracker = this.createRoundTracker();
    const totals = { twa: 0, tbm: 0 };
    const roundStates = [];

    const paidBoard = this.createInitialBoard({
      action: "spin",
      ticket,
      spinIndex: 0,
      isBonus: false
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
      forceBonus: ticket === "bonusEntry",
    });

    if (paidNext === "bonustransition" && !this.isWinCapReached(totals)) {
      const bonusLives = Math.max(1, Number(serverConfig.bonus?.lives) || 3);
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
        bonusGameWonEvent: { source: "animalCrush", action: roundStates.at(-1).executedAction },
        isBonus: true,
        bonusState: {
          initialFreespins: bonusLives,
          finalFreespins: bonusLives,
          livesRemaining: bonusLives,
          livesBeforeSpin: bonusLives,
          livesAfterSpend: bonusLives,
          maxLives: bonusLives,
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

  async generateRoundStates({ betSize = 1, ticketStrategy, fakeNoWins = false, huntStompFeature = false } = {}) {
    const normalizedBet = Number(betSize);
    if (!Number.isFinite(normalizedBet) || normalizedBet <= 0) {
      throw new Error("betSize must be a positive number");
    }

    if (huntStompFeature) {
      const maxAttempts = 100000;
      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        const roundStates = this.generateRoundStatesOnce({
          betSize: normalizedBet,
          ticketStrategy,
          fakeNoWins
        });
        if (this.hasStomp(roundStates)) {
          return roundStates;
        }
      }
      throw new Error("Could not find stomp feature outcome");
    }

    return this.generateRoundStatesOnce({
      betSize: normalizedBet,
      ticketStrategy,
      fakeNoWins
    });
  }

  hasBonus(roundStates) {
    return roundStates.some((state) => state.executedAction === "bonustransition");
  }

  isTicketMatch(ticket, roundStates) {
    const totalTbm = Number(roundStates.at(-1)?.tbm || 0);
    if (ticket === "noWin") return totalTbm === 0;
    if (ticket === "waysWin") return totalTbm > 0;
    if (ticket === "bonusEntry") return this.hasBonus(roundStates);
    if (ticket === "stompEntry") return this.hasStomp(roundStates);
    if (ticket === "crushEntry") return this.hasCrush(roundStates);
    return false;
  }
}
