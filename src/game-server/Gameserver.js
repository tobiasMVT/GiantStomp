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
    if (!Array.isArray(board) || board.length !== this.width) {
      throw new Error(`Board must contain ${this.width} reels`);
    }
    board.forEach((reel) => {
      if (!Array.isArray(reel) || reel.length !== this.height) {
        throw new Error(`Every reel must contain ${this.height} rows`);
      }
      reel.forEach((symbol) => {
        if (!Number.isInteger(Number(symbol)) || Number(symbol) < 1 || Number(symbol) > 27) {
          throw new Error(`Invalid symbol: ${symbol}`);
        }
      });
    });
    return board.map((reel) => reel.map(Number));
  }

  createInitialBoard({ action, ticket, spinIndex, isBonus }) {
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
      const scatter = serverConfig.scatterSymbol;
      board[0][0] = scatter;
      board[2][1] = scatter;
      board[4][2] = scatter;
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
    return this.generateRandomBoard(isBonus ? serverConfig.bonusSymbolWeights : serverConfig.symbolWeights);
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

  scatterPositionKey({ reel, row }) {
    return `${reel},${row}`;
  }

  collectScatterCandidates(board, gravityResult, consumedScatterKeys) {
    const positions = gravityResult
      ? gravityResult.newPositions.filter(({ symbol }) => symbol === serverConfig.scatterSymbol)
      : this.findScatterPositions(board);
    return positions.filter((position) => !consumedScatterKeys.has(this.scatterPositionKey(position)));
  }

  consumeScatterLandings(positions, tracker, { isBonus = false } = {}) {
    return positions.map((position) => {
      const angerBefore = tracker.anger;
      const counted = !isBonus && !tracker.triggered && tracker.anger < serverConfig.anger.maximum;
      if (counted) {
        tracker.anger += 1;
        tracker.consumedScatterKeys.add(this.scatterPositionKey(position));
      }
      const triggeredBonus = counted && tracker.anger >= serverConfig.anger.maximum;
      if (triggeredBonus) {
        tracker.triggered = true;
        tracker.anger = 0;
      }
      return {
        ...position,
        counted,
        angerBefore,
        angerAfter: tracker.anger,
        triggeredBonus
      };
    });
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
    crushEvent = null
  }) {
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
        ? { source: "anger", action }
        : null,
      isBonus,
      bonusState: {
        initialFreespins: isBonus ? serverConfig.bonus.freespins : 0,
        finalFreespins: isBonus ? bonusRemaining : 0
      },
      anger: tracker.anger,
      angerMeter: {
        count: tracker.anger,
        max: serverConfig.anger.maximum
      },
      angerEvent: {
        triggered: bonusTriggeredThisAction,
        ignoredLandings: scatterLandings.filter((landing) => !landing.counted).length
      },
      stompEvent: stompEvent ? clone(stompEvent) : null,
      crushEvent: crushEvent ? clone(crushEvent) : null,
      roundMeta: clone(roundMeta)
    };
  }

  appendCascadeChain({
    roundStates,
    initialBoard,
    initialAction,
    cascadeAction,
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
    allowNaturalCrush = false
  }) {
    let board = clone(initialBoard);
    let action = initialAction;
    let previousAction = pastAction;
    let gravityResult = null;

    for (let cascade = 0; cascade <= serverConfig.maxCascadesPerSpin; cascade += 1) {
      let stompEvent = null;
      let crushEvent = null;
      if (cascade === 0 && initialAction === "spin" && !isBonus) {
        const stompResult = this.resolveStompFeature(board, {
          forceStomp,
          allowNatural: allowNaturalStomp,
          betSize
        });
        if (stompResult) {
          board = stompResult.board;
          stompEvent = stompResult.stompEvent;
          totals.twa = asTbm(totals.twa + Number(stompEvent.coinWin || 0));
        } else {
          const crushResult = this.resolveCrushFeature(board, {
            forceCrush,
            allowNatural: allowNaturalCrush,
            betSize,
          });
          if (crushResult) {
            board = crushResult.board;
            crushEvent = crushResult.crushEvent;
            totals.twa = asTbm(totals.twa + Number(crushEvent.coinWin || 0));
          }
        }
      }

      const result = this.evaluateWays(board, betSize);
      totals.twa = asTbm(totals.twa + result.winAmount);
      totals.tbm = asTbm(totals.tbm + result.tbm);
      const scatterCandidates = this.collectScatterCandidates(board, gravityResult, tracker.consumedScatterKeys);
      const wasTriggered = tracker.triggered;
      const scatterLandings = this.consumeScatterLandings(scatterCandidates, tracker, { isBonus });
      const triggeredNow = !wasTriggered && tracker.triggered;
      const removedBoard = result.hasWins
        ? this.removeWinningPositions(board, result.waysWins)
        : null;
      const nextAction = result.hasWins
        ? cascadeAction
        : (!isBonus && tracker.triggered ? "bonustransition" : nextWhenDone);

      roundStates.push(this.buildActionState({
        action,
        pastAction: previousAction,
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
        bonusTriggeredThisAction: triggeredNow,
        stompEvent,
        crushEvent
      }));

      if (!result.hasWins) return nextAction;
      if (cascade === serverConfig.maxCascadesPerSpin) {
        throw new Error("Maximum cascade count exceeded");
      }

      gravityResult = this.applyDownwardGravity(
        removedBoard,
        isBonus ? serverConfig.bonusSymbolWeights : serverConfig.symbolWeights
      );
      board = gravityResult.reels;
      previousAction = action;
      action = cascadeAction;
    }
    return nextWhenDone;
  }

  generateRoundStatesOnce({ betSize, ticketStrategy, fakeNoWins = false } = {}) {
    const normalizedBet = Number(betSize);
    const forced = this.resolveForcedOutcomeSelection(ticketStrategy);
    const strategy = this.resolveTicketStrategy(forced?.strategy || ticketStrategy);
    const ticket = fakeNoWins ? "noWin" : (forced?.ticket || this.drawWeightedTicket(strategy));
    const roundMeta = this.buildRoundMeta({ betSize: normalizedBet, ticketStrategy: strategy, ticket });
    const forceStomp = ticket === "stompEntry";
    const allowNaturalStomp = ticket === "random";
    const forceCrush = ticket === "crushEntry";
    const allowNaturalCrush = ticket === "random";
    const tracker = { anger: 0, triggered: false, consumedScatterKeys: new Set() };
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
      allowNaturalCrush
    });

    if (paidNext === "bonustransition") {
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
        bonusGameWonEvent: { source: "anger", action: roundStates.at(-1).executedAction },
        isBonus: true,
        bonusState: {
          initialFreespins: serverConfig.bonus.freespins,
          finalFreespins: serverConfig.bonus.freespins
        },
        anger: 0,
        angerMeter: {
          count: 0,
          max: serverConfig.anger.maximum
        },
        roundMeta: clone(roundMeta)
      });

      for (let spinIndex = 0; spinIndex < serverConfig.bonus.freespins; spinIndex += 1) {
        const remaining = serverConfig.bonus.freespins - spinIndex - 1;
        const bonusBoard = this.createInitialBoard({
          action: "freespin",
          ticket: null,
          spinIndex,
          isBonus: true
        });
        this.appendCascadeChain({
          roundStates,
          initialBoard: bonusBoard,
          initialAction: "freespin",
          cascadeAction: "freerespin",
          pastAction: roundStates.at(-1).executedAction,
          nextWhenDone: remaining > 0 ? "freespin" : "spin",
          tracker,
          totals,
          betSize: normalizedBet,
          roundMeta,
          isBonus: true,
          bonusRemaining: remaining
        });
      }
    }

    const finalState = roundStates.at(-1);
    finalState.roundSummary = {
      totalWin: totals.twa,
      tbm: totals.tbm,
      normalWinTBM: roundStates
        .filter((state) => !state.isBonus)
        .reduce((sum, state) => asTbm(sum + Number(state.waysWins?.reduce((s, win) => s + win.tbm, 0) || 0)), 0),
      bonusWinTBM: roundStates
        .filter((state) => state.isBonus)
        .reduce((sum, state) => asTbm(sum + Number(state.waysWins?.reduce((s, win) => s + win.tbm, 0) || 0)), 0),
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
