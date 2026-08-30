import assert from "node:assert/strict";
import test from "node:test";

import { GameServer } from "./Gameserver.js";
import { clearForcedOutcomeSelection } from "./lib/devForcedOutcomeStore.js";
import serverConfig from "./server_config.json" with { type: "json" };

const SCATTER = serverConfig.scatterSymbol;

const noWinBoard = () =>
  Array.from({ length: 5 }, (_, reel) =>
    Array.from({ length: 3 }, (_, row) => ((reel * 3 + row) % 7) + 1)
  );

test.beforeEach(() => clearForcedOutcomeSelection());

test("evaluates only the longest left-to-right ways win", () => {
  const server = new GameServer({ random: () => 0 });
  const board = [
    [1, 1, 2],
    [1, 1, 1],
    [1, 2, 3],
    [4, 5, 6],
    [7, 2, 3]
  ];

  const result = server.evaluateWays(board, 2);

  assert.equal(result.waysWins.length, 1);
  assert.deepEqual(
    {
      symbol: result.waysWins[0].symbol,
      reelCount: result.waysWins[0].reelCount,
      ways: result.waysWins[0].ways,
      tbm: result.waysWins[0].tbm,
      winAmount: result.waysWins[0].winAmount
    },
    { symbol: 1, reelCount: 3, ways: 6, tbm: 3, winAmount: 6 }
  );
});

test("removes the union of wins and applies downward gravity", () => {
  const server = new GameServer({ random: () => 0 });
  const board = [
    [1, 1, 2],
    [1, 2, 2],
    [1, 2, 3],
    [4, 5, 6],
    [7, 3, 4]
  ];
  const result = server.evaluateWays(board, 1);
  const removed = server.removeWinningPositions(board, result.waysWins);

  assert.deepEqual(removed.slice(0, 3), [[0, 0, 0], [0, 0, 0], [0, 0, 3]]);

  const gravity = server.applyDownwardGravity(removed);
  assert.equal(gravity.dropEvent.direction, "down");
  assert.equal(gravity.reels[2][0], 3);
  assert.equal(gravity.newPositions.length, 8);
  assert.ok(gravity.dropEvent.movements.every((movement) => Number.isInteger(movement.to)));
});

test("winning paid spins emit one spin action without respins", async () => {
  const server = new GameServer({ random: () => 0.999999 });

  const states = await server.generateRoundStates({ ticketStrategy: "waysWin" });

  assert.equal(states.filter((state) => state.executedAction === "respin").length, 0);
  const spin = states.find((state) => state.executedAction === "spin");
  assert.ok(spin?.waysWins?.length);
  assert.equal(spin.nextAction, "spin");
  assert.equal(spin.reelsBeforeDrop, null);
  assert.equal(spin.dropEvent, null);
});

test("scatter landings no longer charge Anger", async () => {
  const provider = ({ action }) => {
    const board = noWinBoard();
    if (action === "spin") board[4][2] = SCATTER;
    return board;
  };
  const server = new GameServer({ random: () => 0, boardProvider: provider });

  const first = await server.generateRoundStates({ ticketStrategy: "noWin" });
  const second = await server.generateRoundStates({ ticketStrategy: "noWin" });

  assert.equal(first.at(-1).anger, 0);
  assert.deepEqual(first.at(-1).angerMeter, { count: 0, max: 10 });
  assert.equal(second.at(-1).anger, 0);
  assert.deepEqual(second.at(-1).angerMeter, { count: 0, max: 10 });
});

test("crush spins attach fake Anger kill events", () => {
  const server = new GameServer({ random: () => 0.05 });
  const board = noWinBoard();
  board[0][0] = 1;
  board[1][0] = 2;
  board[2][0] = 3;
  const tracker = server.createRoundTracker();
  const crushResult = server.resolveCrushFeature(board, { forceCrush: true, betSize: 1 });
  const killResult = server.processAnimalKills(crushResult.crushEvent.crushedCells, tracker);

  assert.ok(crushResult?.crushEvent?.triggered);
  assert.ok(killResult.events.length >= 1);
  assert.ok(killResult.events.every((event) => typeof event.ticked === "boolean"));
  assert.ok(tracker.angerDisplay >= 0);
  assert.ok(tracker.angerDisplay <= 9);
});

test("bonusEntry dev ticket forces bonus through crushed animals", async () => {
  const server = new GameServer({ random: () => 0.999999 });

  const states = await server.generateRoundStates({ ticketStrategy: "bonusEntry" });
  const spin = states.find((state) => state.executedAction === "spin");

  assert.ok(spin?.crushEvent?.triggered || spin?.stompEvent?.triggered);
  assert.equal(spin.roundMeta?.ticket, "bonusEntry");
  assert.equal(spin.bonusGameWonEvent?.source, "animalCrush");
  assert.equal(states.filter((state) => state.executedAction === "bonustransition").length, 1);
  assert.ok(states.filter((state) => state.executedAction === "freespin").length >= 1);
  const transition = states.find((state) => state.executedAction === "bonustransition");
  assert.equal(transition?.bonusState?.maxLives, 3);
  assert.equal(transition?.bonusState?.isSuperBonus, false);
  assert.equal(transition?.bonusState?.livesRemaining, 3);
});

test("feature buy bonus hunts normal rng until a natural bonus is found", async () => {
  const server = new GameServer({ random: Math.random });

  const states = await server.generateRoundStates({ featureBuyStrategy: "bonusEntry" });
  const spin = states.find((state) => state.executedAction === "spin");
  const transition = states.find((state) => state.executedAction === "bonustransition");

  assert.ok(spin);
  assert.notEqual(spin.roundMeta?.ticket, "bonusEntry");
  assert.equal(spin.roundMeta?.featureBuy, true);
  assert.equal(spin.bucket, "bonusEntry");
  assert.equal(states.filter((state) => state.executedAction === "bonustransition").length, 1);
  assert.equal(transition?.bonusState?.isSuperBonus, false);
  assert.equal(transition?.bonusState?.maxLives, 3);
  assert.notEqual(transition?.bonusGameWonEvent?.source, "unicornCrush");
});

test("feature buy party hunts normal rng until a natural party is found", async () => {
  const server = new GameServer({ random: Math.random });

  const states = await server.generateRoundStates({ featureBuyStrategy: "partyEntry" });
  const spin = states.find((state) => state.executedAction === "spin");

  assert.ok(spin?.partyEvent?.triggered);
  assert.notEqual(spin.roundMeta?.ticket, "partyEntry");
  assert.equal(spin.roundMeta?.featureBuy, true);
  assert.equal(spin.bucket, "partyEntry");
});

test("feature buy super bonus hunts normal rng until unicorn superbonus is found", async () => {
  const server = new GameServer({ random: Math.random });

  const states = await server.generateRoundStates({ featureBuyStrategy: "superBonusEntry" });
  const spin = states.find((state) => state.executedAction === "spin");
  const transition = states.find((state) => state.executedAction === "bonustransition");

  assert.ok(spin);
  assert.notEqual(spin.roundMeta?.ticket, "superBonusEntry");
  assert.equal(spin.roundMeta?.featureBuy, true);
  assert.equal(spin.bucket, "superBonusEntry");
  assert.equal(transition?.bonusState?.isSuperBonus, true);
  assert.equal(transition?.bonusState?.maxLives, 4);
});

test("unicorn wild substitutes in left-to-right ways wins", () => {
  const server = new GameServer({ random: () => 0 });
  const unicorn = Number(serverConfig.unicornSymbol ?? 14);
  const board = [
    [3, 2, 1],
    [unicorn, 2, 1],
    [3, 2, 1],
    [4, 5, 6],
    [7, 2, 3],
  ];

  const result = server.evaluateWays(board, 1);

  assert.ok(result.waysWins.some((win) => win.symbol === 3 && win.reelCount === 3));
});

test("superBonusEntry dev ticket enters four-life superbonus via unicorn stomp", async () => {
  const server = new GameServer({ random: () => 0.999999 });

  const states = await server.generateRoundStates({ ticketStrategy: "superBonusEntry" });
  const spin = states.find((state) => state.executedAction === "spin");
  const transition = states.find((state) => state.executedAction === "bonustransition");

  assert.ok(spin?.stompEvent?.triggered);
  assert.equal(spin.superBonusTriggered, true);
  assert.equal(spin.bonusGameWonEvent?.source, "unicornCrush");
  assert.equal(transition?.bonusState?.maxLives, 4);
  assert.equal(transition?.bonusState?.isSuperBonus, true);
  assert.equal(transition?.bonusGameWonEvent?.source, "unicornCrush");
});

test("unicorn crush overrides animal bonus roll when both die in one stomp", async () => {
  const unicorn = Number(serverConfig.unicornSymbol ?? 14);
  const provider = ({ action }) => {
    if (action !== "spin") return null;
    const board = noWinBoard();
    board[2][1] = unicorn;
    for (let reel = 1; reel <= 3; reel += 1) {
      for (let row = 0; row < 3; row += 1) {
        if (reel === 2 && row === 1) continue;
        board[reel][row] = ((reel + row) % 5) + 1;
      }
    }
    return board;
  };
  const server = new GameServer({ random: () => 0.999999, boardProvider: provider });

  const states = await server.generateRoundStates({ ticketStrategy: "superBonusEntry" });
  const spin = states.find((state) => state.executedAction === "spin");

  assert.equal(spin?.bonusGameWonEvent?.source, "unicornCrush");
  assert.equal(spin?.bonusGameWonEvent?.isSuperBonus, true);
  assert.notEqual(spin?.bonusGameWonEvent?.source, "animalCrush");
});

test("superbonus cash landing resets lives to four", async () => {
  const provider = ({ action, spinIndex }) => {
    if (action === "spin") {
      const board = noWinBoard();
      board[2][1] = Number(serverConfig.unicornSymbol ?? 14);
      for (let reel = 1; reel <= 3; reel += 1) {
        for (let row = 0; row < 3; row += 1) {
          if (reel === 2 && row === 1) continue;
          board[reel][row] = ((reel + row) % 5) + 1;
        }
      }
      return board;
    }
    const emptyBoard = Array.from({ length: 5 }, () => Array(3).fill(0));
    if (spinIndex === 1) emptyBoard[2][1] = 111;
    return emptyBoard;
  };
  const server = new GameServer({ random: () => 0.999999, boardProvider: provider });

  const states = await server.generateRoundStates({ ticketStrategy: "superBonusEntry" });
  const bonusSpins = states.filter((state) => state.executedAction === "freespin");

  assert.equal(bonusSpins[0]?.bonusState?.maxLives, 4);
  assert.equal(bonusSpins[1]?.bonusState?.livesRemaining, 4);
  assert.equal(bonusSpins[1]?.bonusState?.resetLives, true);
});

test("fake no-win rounds still report scatter landings without bonus entry", async () => {
  const provider = () => {
    const board = noWinBoard();
    board[4][2] = SCATTER;
    return board;
  };
  const server = new GameServer({ boardProvider: provider });

  const states = await server.generateRoundStates({ fakeNoWins: true });

  assert.equal(states.at(-1).simulationFakeNoWin, true);
  assert.equal(states.at(-1).anger, 0);
  assert.deepEqual(states.at(-1).angerMeter, { count: 0, max: 10 });
  assert.equal(states.filter((state) => state.executedAction === "bonustransition").length, 0);
});

test("processAnimalKills caps fake Anger display before bonus", () => {
  const server = new GameServer({ random: () => 0 });
  const tracker = server.createRoundTracker();
  const cells = Array.from({ length: 12 }, (_, index) => ({
    reel: index % 5,
    row: 0,
    symbol: 1,
    isAnimal: true,
  }));

  const result = server.processAnimalKills(cells, tracker, { forceBonus: false });

  assert.equal(result.events.length, 12);
  assert.equal(tracker.angerDisplay, 9);
  assert.equal(result.bonusTriggered, true);
});

test("stompEntry ticket always triggers giant stomp on paid spin", async () => {
  const server = new GameServer({ random: () => 0 });

  const states = await server.generateRoundStates({ ticketStrategy: "stompEntry" });
  const spin = states.find((state) => state.executedAction === "spin");

  assert.ok(spin?.stompEvent?.triggered);
  assert.ok(Array.isArray(spin.stompEvent.reels));
  assert.ok(spin.stompEvent.reels.length >= 2);
  assert.ok(Array.isArray(spin.stompEvent.crushedCells));
  assert.ok(spin.stompEvent.crushedCells.length > 0);
  assert.ok(spin.stompEvent.reelsBeforeStomp);
  const animals = spin.stompEvent.crushedCells.filter((cell) => cell.isAnimal);
  const lows = spin.stompEvent.crushedCells.filter((cell) => !cell.isAnimal);
  animals.forEach((cell) => {
    assert.ok(cell.coinType >= 20 && cell.coinType <= 27);
    assert.ok(Number(cell.coinValue) > 0);
  });
  lows.forEach((cell) => {
    assert.equal(cell.coinType, null);
    assert.equal(cell.coinValue, null);
  });
  assert.ok(Number(spin.twa) >= Number(spin.stompEvent.coinWin || 0));
});

test("huntStompFeature returns a round containing a stomp", async () => {
  const server = new GameServer({ random: () => 0.01 });

  const states = await server.generateRoundStates({ ticketStrategy: "normal", huntStompFeature: true });

  assert.ok(states.some((state) => state.stompEvent?.triggered));
});

test("crushEntry ticket always triggers giant crush on paid spin", async () => {
  const server = new GameServer({ random: () => 0 });

  const states = await server.generateRoundStates({ ticketStrategy: "crushEntry" });
  const spin = states.find((state) => state.executedAction === "spin");

  assert.ok(spin?.crushEvent?.triggered);
  assert.ok(Array.isArray(spin.crushEvent.crushedCells));
  assert.ok(spin.crushEvent.crushedCells.length >= 1);
  assert.ok(spin.crushEvent.reelsBeforeCrush);
  spin.crushEvent.crushedCells.forEach((cell) => {
    assert.equal(Number(spin.reels[cell.reel][cell.row]), 0);
    assert.ok(cell.coinType >= 20 && cell.coinType <= 27);
    assert.ok(Number(cell.coinValue) > 0);
  });
  assert.ok(Number(spin.twa) >= Number(spin.crushEvent.coinWin || 0));
  assert.equal(spin.stompEvent, null);
});

test("stompReelSize weights pick a valid consecutive reel span", () => {
  const server = new GameServer({ random: () => 0 });
  const reels = server.pickStompReels();
  assert.ok(reels.length === 2 || reels.length === 3);
  assert.equal(reels[1] - reels[0], 1);
  if (reels.length === 3) assert.equal(reels[2] - reels[1], 1);
});

test("crushAmount weights can remove multiple animals", () => {
  const board = Array.from({ length: 5 }, (_, reel) =>
    Array.from({ length: 3 }, () => ((reel % 5) + 1))
  );
  const server = new GameServer({ random: () => 0.99 });
  const result = server.resolveCrushFeature(board, { forceCrush: true });
  assert.ok(result?.crushEvent?.crushedCells?.length >= 1);
});

test("stomp suppresses crush on the same paid spin", async () => {
  const server = new GameServer({ random: () => 0 });

  const states = await server.generateRoundStates({ ticketStrategy: "stompEntry" });
  const spin = states.find((state) => state.executedAction === "spin");

  assert.ok(spin?.stompEvent?.triggered);
  assert.equal(spin.crushEvent, null);
});

test("crush does not run during bonus freespins", async () => {
  const provider = ({ action }) => {
    const board = noWinBoard();
    if (action === "spin") {
      board[0][0] = SCATTER;
      board[1][0] = SCATTER;
      board[2][1] = SCATTER;
    }
    if (action === "freespin") {
      board[1][1] = 3;
      board[2][0] = 4;
    }
    return board;
  };
  const server = new GameServer({ random: () => 0, boardProvider: provider });

  const states = await server.generateRoundStates({ ticketStrategy: "bonusEntry" });
  const freespins = states.filter((state) => state.executedAction === "freespin");

  assert.ok(states.find((state) => state.executedAction === "spin")?.crushEvent?.triggered);
  freespins.forEach((state) => assert.equal(state.crushEvent, null));
});

test("bonus cash spins spend lives and a cash landing resets them to three", async () => {
  const provider = ({ action, spinIndex }) => {
    if (action === "spin") {
      const board = noWinBoard();
      board[0][0] = SCATTER;
      board[1][0] = SCATTER;
      board[2][1] = SCATTER;
      return board;
    }
    const emptyBoard = Array.from({ length: 5 }, () => Array(3).fill(0));
    if (spinIndex === 1) emptyBoard[2][1] = 111;
    return emptyBoard;
  };
  const server = new GameServer({ random: () => 0.999999, boardProvider: provider });

  const states = await server.generateRoundStates({ betSize: 2, ticketStrategy: "bonusEntry" });
  const bonusSpins = states.filter((state) => state.executedAction === "freespin");

  assert.equal(bonusSpins.length, 5);
  assert.deepEqual(
    bonusSpins.map((state) => state.bonusState.livesRemaining),
    [2, 3, 2, 1, 0]
  );
  assert.equal(bonusSpins[1].bonusLandings[0].symbol, 111);
  assert.equal(bonusSpins[1].bonusLandings[0].powerAwarded, 0.1);
  assert.equal(bonusSpins[1].winAmount, 0);
  assert.equal(bonusSpins[1].trapMeter.power, 0.1);
  assert.equal(bonusSpins.at(-1).nextAction, "spin");
});

test("bonus cash seeds low trap power during the first two bonus spins when needed", async () => {
  const server = new GameServer({ random: () => 0.999999 });

  const states = await server.generateRoundStates({ ticketStrategy: "bonusEntry" });
  const bonusSpins = states.filter((state) => state.executedAction === "freespin");
  const firstSeedLanding = bonusSpins[0]?.bonusLandings?.find((landing) => (
    [111, 222, 333, 444, 555].includes(landing.symbol)
  ));

  assert.ok(firstSeedLanding);
  assert.ok(Number(bonusSpins[0].trapMeter.power) > 0);
  assert.equal(bonusSpins.at(-1)?.ouchStompEvent?.triggered, true);
});

test("bonus gate count zero produces an all-empty board", () => {
  const server = new GameServer({ random: () => 0 });
  const board = server.generateBonusBoard();
  const emptySymbol = Number(serverConfig.bonus?.emptySymbol ?? 0);

  board.forEach((reel) => reel.forEach((symbol) => assert.equal(symbol, emptySymbol)));
});

test("bonus gate injects the drawn symbol count from bonusSymbolWeights", () => {
  let call = 0;
  const server = new GameServer({
    random: () => {
      const values = [63 / 84, 0, 0, 0, 0, 0];
      return values[call++] ?? 0;
    }
  });
  const board = server.generateBonusBoard({ trapPower: 5 });
  const emptySymbol = Number(serverConfig.bonus?.emptySymbol ?? 0);
  const nonEmpty = board.flat().filter((symbol) => symbol !== emptySymbol);

  assert.equal(nonEmpty.length, 3);
  nonEmpty.forEach((symbol) => assert.equal(symbol, 111));
});

test("bonus safe end gate removes zero-inject option on last life with no trap power", () => {
  const server = new GameServer({ random: () => 0 });
  const board = server.generateBonusBoard({ forceSymbolLanding: true });
  const emptySymbol = Number(serverConfig.bonus?.emptySymbol ?? 0);
  const nonEmpty = board.flat().filter((symbol) => symbol !== emptySymbol);

  assert.ok(nonEmpty.length >= 1);
});

test("bonus gate zero adjustment follows trap power brackets", () => {
  const server = new GameServer({ random: () => 0 });

  assert.equal(server.resolveBonusGateZeroAdjustment(0), -10);
  assert.equal(server.resolveBonusGateZeroAdjustment(4.9), -10);
  assert.equal(server.resolveBonusGateZeroAdjustment(5), -5);
  assert.equal(server.resolveBonusGateZeroAdjustment(19.9), 0);
  assert.equal(server.resolveBonusGateZeroAdjustment(50), 10);
  assert.equal(server.resolveBonusGateZeroAdjustment(200), 15);
});

test("bonus gate weights shift empty odds by trap power before rolling", () => {
  const server = new GameServer({ random: () => 0 });

  assert.equal(server.buildBonusGateWeights({ trapPower: 0 })["0"], 32);
  assert.equal(server.buildBonusGateWeights({ trapPower: 9 })["0"], 37);
  assert.equal(server.buildBonusGateWeights({ trapPower: 15 })["0"], 42);
  assert.equal(server.buildBonusGateWeights({ trapPower: 25 })["0"], 47);
  assert.equal(server.buildBonusGateWeights({ trapPower: 55 })["0"], 52);
});

test("low trap power increases symbol landing chance versus high trap power", () => {
  let call = 0;
  const server = new GameServer({
    random: () => {
      const values = [33 / 74, 0, 0, 0, 0, 0];
      return values[call++] ?? 0;
    }
  });
  const emptySymbol = Number(serverConfig.bonus?.emptySymbol ?? 0);
  const lowPowerBoard = server.generateBonusBoard({ trapPower: 0 });
  const highPowerBoard = server.generateBonusBoard({ trapPower: 50 });

  assert.equal(lowPowerBoard.flat().filter((symbol) => symbol !== emptySymbol).length, 1);
  assert.equal(highPowerBoard.flat().filter((symbol) => symbol !== emptySymbol).length, 0);
});

test("trap power swap gate shifts bonusSymbolWeights toward low materials", () => {
  const server = new GameServer();

  assert.equal(server.resolveTrapPowerSwapOdds(666, 2), 0);
  assert.equal(server.resolveTrapPowerSwapOdds(666, 3), 15);
  assert.equal(server.resolveTrapPowerSwapOdds(999, 3), 75);

  const baseline = server.buildBonusSymbolWeights({});
  assert.equal(baseline["666"], Number(serverConfig.bonusSymbolWeights["666"]));

  const gated = server.buildBonusSymbolWeights({ "666": 3 });
  assert.ok(gated["666"] < baseline["666"]);
  assert.ok(gated["111"] > baseline["111"]);
  assert.ok(gated["555"] > baseline["555"]);

  const lowMaterials = new Set([111, 222, 333, 444, 555]);
  let lowCount = 0;
  const trials = 500;
  for (let i = 0; i < trials; i += 1) {
    const board = server.generateBonusBoard({ trapPower: 0, trapProgress: { "666": 3, "777": 0, "888": 0, "999": 0 } });
    for (const symbol of board.flat()) {
      if (lowMaterials.has(symbol)) lowCount += 1;
    }
  }
  const baselineLowCount = (() => {
    let count = 0;
    for (let i = 0; i < trials; i += 1) {
      const board = server.generateBonusBoard({ trapPower: 0, trapProgress: {} });
      for (const symbol of board.flat()) {
        if (lowMaterials.has(symbol)) count += 1;
      }
    }
    return count;
  })();
  assert.ok(lowCount > baselineLowCount);
});

test("buildBonusSymbolWeights removes hammer symbol when hammer cap is reached", () => {
  const server = new GameServer({ random: () => 0 });

  assert.ok(Number(server.buildBonusSymbolWeights({}, 0)["1000"]) > 0);
  assert.equal(server.buildBonusSymbolWeights({}, 9)["1000"], 5);
  assert.equal(server.buildBonusSymbolWeights({}, 10)["1000"], 0);
});

test("generateBonusBoard only injects remaining hammer slots on a single spin", () => {
  const server = new GameServer({
    random: () => 0,
  });
  const originalGate = serverConfig.bonusGateForSymbols;
  const originalWeights = serverConfig.bonusSymbolWeights;
  serverConfig.bonusGateForSymbols = { "6": 1 };
  serverConfig.bonusSymbolWeights = { "1000": 1, "111": 0, "0": 0 };

  try {
    const boardAtNine = server.generateBonusBoard({ hammersCollected: 9 });
    const hammersAtNine = boardAtNine.flat().filter((symbol) => symbol === 1000).length;
    assert.equal(hammersAtNine, 1);

    const boardAtMax = server.generateBonusBoard({ hammersCollected: 10 });
    const hammersAtMax = boardAtMax.flat().filter((symbol) => symbol === 1000).length;
    assert.equal(hammersAtMax, 0);
  } finally {
    serverConfig.bonusGateForSymbols = originalGate;
    serverConfig.bonusSymbolWeights = originalWeights;
  }
});

test("evaluateBonusCash ignores extra hammer landings once hammer cap is reached", () => {
  const server = new GameServer();
  const board = Array.from({ length: 5 }, () => Array(3).fill(0));
  board[0][0] = 1000;
  board[1][1] = 1000;
  const trapTracker = { progress: {}, power: 0 };
  const damageTracker = {
    segments: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    removedSegments: [1, 2, 3, 4, 5, 6, 7, 8, 9],
    remainingSegments: [10, 11, 12],
  };

  const result = server.evaluateBonusCash(board, 1, trapTracker, damageTracker);

  assert.equal(result.landings.filter((landing) => landing.symbol === 1000).length, 2);
  assert.equal(damageTracker.removedSegments.length, 10);
  assert.deepEqual(damageTracker.remainingSegments, [11, 12]);
  assert.equal(
    result.landings.filter((landing) => landing.symbol === 1000 && landing.damageRemovedSegment !== null).length,
    1
  );
});

test("traps award power only on four lights and damage removes the lowest meter segment", () => {
  const server = new GameServer();
  const board = Array.from({ length: 5 }, () => Array(3).fill(0));
  board[0][0] = 666;
  board[1][1] = 666;
  board[3][0] = 777;
  board[2][2] = 1000;
  const trapTracker = {
    progress: { "666": 3, "777": 0, "888": 0 },
    power: 10
  };
  const damageTracker = {
    segments: [1, 2, 3],
    removedSegments: [],
    remainingSegments: [1, 2, 3]
  };

  const result = server.evaluateBonusCash(board, 1, trapTracker, damageTracker);

  assert.equal(result.landings.length, 4);
  assert.equal(trapTracker.progress["777"], 1);
  assert.equal(result.trapPower, 15);
  assert.equal(result.winAmount, 0);
  assert.deepEqual(damageTracker.removedSegments, [1]);
  assert.deepEqual(damageTracker.remainingSegments, [2, 3]);
  assert.equal(result.landings.find((landing) => landing.symbol === 777).powerAwarded, 0);
  assert.equal(result.landings.find((landing) => landing.symbol === 1000).isDamage, true);

  const [completed, restarted] = result.landings.filter((landing) => landing.symbol === 666);
  assert.deepEqual(
    { completedTrap: completed.completedTrap, lights: completed.trapLightsFilled, after: completed.trapProgressAfter },
    { completedTrap: true, lights: 4, after: 0 }
  );
  assert.deepEqual(
    { completedTrap: restarted.completedTrap, lights: restarted.trapLightsFilled, after: restarted.trapProgressAfter },
    { completedTrap: false, lights: 1, after: 1 }
  );
  assert.equal(trapTracker.progress["666"], 1);
});

test("bonus spins report the life spent before the outcome is known", async () => {
  const provider = ({ action, spinIndex }) => {
    if (action === "spin") {
      const board = noWinBoard();
      board[0][0] = SCATTER;
      board[1][0] = SCATTER;
      board[2][1] = SCATTER;
      return board;
    }
    const emptyBoard = Array.from({ length: 5 }, () => Array(3).fill(0));
    if (spinIndex === 0) emptyBoard[1][1] = 222;
    return emptyBoard;
  };
  const server = new GameServer({ random: () => 0.999999, boardProvider: provider });

  const states = await server.generateRoundStates({ ticketStrategy: "bonusEntry" });
  const bonusSpins = states.filter((state) => state.executedAction === "freespin");

  assert.deepEqual(
    bonusSpins.map(({ bonusState }) => [
      bonusState.livesBeforeSpin,
      bonusState.livesAfterSpend,
      bonusState.livesRemaining,
    ]),
    [[3, 2, 3], [3, 2, 2], [2, 1, 1], [1, 0, 0]]
  );
});

test("resolveOuchStomp picks target segment from multilpierOdds weights", () => {
  const server = new GameServer({ random: () => 0 });
  const damageWheel = {
    segments: [1, 2, 3],
    removedSegments: [],
    remainingSegments: [1, 2, 3],
  };

  const result = server.resolveOuchStomp(5, damageWheel, 1);

  assert.equal(result.event.triggered, true);
  assert.equal(result.event.steps.length, 1);
  assert.deepEqual(result.event.steps[0], {
    step: 1,
    multiplier: 1,
    winTbm: 5,
    winAmount: 5,
  });
  assert.equal(result.event.finalMultiplier, 1);
  assert.equal(result.event.finalWinAmount, 5);
  assert.equal(result.winAmount, 5);
  assert.deepEqual(result.event.consumedSegments, [1]);
});

test("resolveOuchStomp walks from active index to weighted target segment", () => {
  let roll = 0;
  const server = new GameServer({
    random: () => {
      roll += 1;
      return roll === 1 ? 0.24 : 0.99;
    },
  });
  const damageWheel = {
    segments: [1, 2, 3, 4],
    removedSegments: [],
    remainingSegments: [1, 2, 3, 4],
  };

  const result = server.resolveOuchStomp(5, damageWheel, 1);

  assert.equal(result.event.steps.length, 2);
  assert.equal(result.event.steps[1].multiplier, 2);
  assert.equal(result.event.finalWinAmount, 10);
  assert.deepEqual(result.event.consumedSegments, [1, 2]);
});

test("resolveOuchStomp skips when trap power is zero", () => {
  const server = new GameServer({ random: () => 0 });
  const damageWheel = {
    segments: [1, 2, 3],
    removedSegments: [],
    remainingSegments: [1, 2, 3],
  };

  const result = server.resolveOuchStomp(0, damageWheel, 1);

  assert.equal(result.event.triggered, false);
  assert.equal(result.winAmount, 0);
});

test("resolveDamageStepOddsBoost still resolves trap-power bracket table", () => {
  const server = new GameServer({ random: () => 0 });

  assert.deepEqual(server.resolveDamageStepOddsBoost(0), {
    oddsDeltaPercent: 15,
    stepsActive: 3
  });
  assert.deepEqual(server.resolveDamageStepOddsBoost(5), {
    oddsDeltaPercent: 10,
    stepsActive: 3
  });
  assert.equal(server.resolveDamageStepOddsForDraw(0.65, 0, server.resolveDamageStepOddsBoost(5)), 0.75);
  assert.equal(server.resolveDamageStepOddsForDraw(0.65, 2, server.resolveDamageStepOddsBoost(5)), 0.75);
  assert.equal(server.resolveDamageStepOddsForDraw(0.65, 3, server.resolveDamageStepOddsBoost(5)), 0.65);
});

test("resolveWinAmountOddsReduction still resolves winTbm brackets", () => {
  const server = new GameServer({ random: () => 0 });

  assert.equal(server.resolveWinAmountOddsReduction(0), 0);
  assert.equal(server.resolveWinAmountOddsReduction(10), 0.2);
  assert.equal(server.resolveWinAmountOddsReduction(50), 0.35);
});

test("buildOuchStompSegmentWeights zeroes banked segment weights per hammer", () => {
  const server = new GameServer({ random: () => 0 });
  const segments = [1, 2, 3, 4, 5, 10];

  assert.deepEqual(
    server.buildOuchStompSegmentWeights(0, segments.length, 0),
    [1, 2, 3, 4, 5, 20]
  );
  assert.deepEqual(
    server.buildOuchStompSegmentWeights(0, segments.length, 1),
    [0, 2, 3, 4, 5, 20]
  );
  assert.deepEqual(
    server.buildOuchStompSegmentWeights(0, segments.length, 3),
    [0, 0, 0, 4, 5, 20]
  );
});

test("resolveOuchStomp cannot pick banked segments after hammers were collected", () => {
  const server = new GameServer({ random: () => 0 });
  const damageWheel = {
    segments: [1, 2, 3, 4, 5, 10],
    removedSegments: [1, 2, 3],
    remainingSegments: [4, 5, 10],
  };

  const result = server.resolveOuchStomp(5, damageWheel, 1);

  assert.ok(result.event.steps.every((step) => step.multiplier >= 4));
  assert.equal(result.event.steps[0].multiplier, 4);
});

test("resolveOuchStomp forces last segment when hammer cap is reached", () => {
  const server = new GameServer({ random: () => 0 });
  const damageWheel = {
    segments: [1, 2, 3, 4, 5, 10, 15, 20, 25, 50, 75, 100],
    removedSegments: [1, 2, 3, 4, 5, 10, 15, 20, 25, 50],
    remainingSegments: [75, 100],
  };

  const result = server.resolveOuchStomp(5, damageWheel, 1);

  assert.equal(result.event.finalMultiplier, 100);
  assert.equal(result.event.steps.at(-1).multiplier, 100);
});

test("pickOuchStompTargetIndex uses higher trap-power weight table", () => {
  const server = new GameServer({ random: () => 0.99 });
  const segments = [1, 2, 3, 4, 5, 10, 15, 20, 25, 50, 75, 100];

  const lowPowerTarget = server.pickOuchStompTargetIndex({
    trapPower: 0,
    segments,
    activeIndex: 0,
    hammersCollected: 0,
  });
  const highPowerTarget = server.pickOuchStompTargetIndex({
    trapPower: 5,
    segments,
    activeIndex: 0,
    hammersCollected: 0,
  });

  assert.ok(lowPowerTarget >= 0);
  assert.ok(highPowerTarget >= 0);
  assert.notEqual(
    server.resolveMultiplierOddsWeights(0),
    server.resolveMultiplierOddsWeights(5)
  );
});

test("bonus end attaches ouchStompEvent and credits twa", async () => {
  let roll = 0;
  const provider = ({ action, spinIndex }) => {
    if (action === "spin") {
      const board = noWinBoard();
      board[0][0] = SCATTER;
      board[1][0] = SCATTER;
      board[2][1] = SCATTER;
      return board;
    }
    const emptyBoard = Array.from({ length: 5 }, () => Array(3).fill(0));
    if (spinIndex === 0) emptyBoard[0][0] = 666;
    if (spinIndex === 1) emptyBoard[1][1] = 666;
    if (spinIndex === 2) emptyBoard[2][2] = 666;
    if (spinIndex === 3) emptyBoard[3][1] = 666;
    return emptyBoard;
  };
  const server = new GameServer({
    random: () => {
      roll += 1;
      return roll % 2 === 0 ? 0.1 : 0.9;
    },
    boardProvider: provider,
  });

  const states = await server.generateRoundStates({ betSize: 1, ticketStrategy: "bonusEntry" });
  const lastBonusSpin = states.filter((state) => state.executedAction === "freespin").at(-1);

  assert.equal(lastBonusSpin.nextAction, "spin");
  assert.equal(lastBonusSpin.ouchStompEvent?.triggered, true);
  assert.ok(Number(lastBonusSpin.ouchStompEvent?.trapPower) > 0);
  assert.ok(Number(lastBonusSpin.ouchStompEvent?.finalWinAmount) > 0);
  const twaBeforeOuch = states.filter((state) => state.isBonus).at(-2)?.twa ?? 0;
  assert.equal(
    lastBonusSpin.twa,
    Number(twaBeforeOuch) + Number(lastBonusSpin.ouchStompEvent.finalWinAmount)
  );
});

test("partyEntry ticket always triggers party on paid spin", async () => {
  const server = new GameServer({ random: () => 0 });
  const unicorn = Number(serverConfig.unicornSymbol ?? 14);

  const states = await server.generateRoundStates({ ticketStrategy: "partyEntry" });
  const spin = states.find((state) => state.executedAction === "spin");

  assert.ok(spin?.partyEvent?.triggered);
  assert.ok(spin?.stompEvent?.triggered);
  assert.equal(spin.crushEvent, null);
  spin.stompEvent.reelsBeforeStomp.flat().forEach((symbol) => {
    assert.ok(
      (symbol >= 1 && symbol <= 5) || symbol === unicorn,
      `expected animal or unicorn symbol, got ${symbol}`
    );
  });
});

test("party board can include injected unicorn", () => {
  const server = new GameServer({ random: () => 0 });
  const unicorn = Number(serverConfig.unicornSymbol ?? 14);
  const result = server.resolvePartyFeature(
    Array.from({ length: 5 }, () => Array(3).fill(6)),
    { forceParty: true, betSize: 1 }
  );

  assert.ok(result?.partyEvent?.triggered);
  const symbols = result.stompEvent?.reelsBeforeStomp?.flat() ?? result.board.flat();
  assert.ok(symbols.includes(unicorn), "expected unicorn on party board");
});

test("party stomp can crush unicorn for superbonus entry", async () => {
  const unicorn = Number(serverConfig.unicornSymbol ?? 14);
  const server = new GameServer({ random: () => 0 });
  server.pickRandomUnicornCell = () => ({ reel: 2, row: 1 });
  server.pickStompReels = () => [2];

  const states = await server.generateRoundStates({ ticketStrategy: "partyEntry" });
  const spin = states.find((state) => state.executedAction === "spin");

  assert.ok(spin?.partyEvent?.triggered);
  assert.ok(spin?.stompEvent?.crushedCells?.some((cell) => cell.isUnicorn));
  assert.equal(spin?.superBonusTriggered, true);
  assert.equal(spin?.bonusGameWonEvent?.source, "unicornCrush");
});

test("party giant roll can force stomp with animal or unicorn crushed cells", () => {
  const server = new GameServer({ random: () => 0 });
  const unicorn = Number(serverConfig.unicornSymbol ?? 14);
  const result = server.resolvePartyFeature(
    Array.from({ length: 5 }, () => Array(3).fill(6)),
    { forceParty: true, betSize: 1 }
  );

  assert.ok(result?.partyEvent?.triggered);
  assert.equal(result.partyEvent.giantAppeared, true);
  assert.ok(result.stompEvent?.triggered);
  assert.equal(result.crushEvent, null);
  result.stompEvent.crushedCells.forEach((cell) => {
    assert.ok(
      cell.isUnicorn === true || (cell.isAnimal === true && cell.symbol >= 1 && cell.symbol <= 5),
      `unexpected crushed cell symbol ${cell.symbol}`
    );
    if (cell.isUnicorn) assert.equal(cell.symbol, unicorn);
  });
});

test("party without giant keeps a full animal board", () => {
  const server = new GameServer({ random: () => 0.99 });
  const result = server.resolvePartyFeature(
    Array.from({ length: 5 }, () => Array(3).fill(6)),
    { forceParty: true, betSize: 1 }
  );

  assert.ok(result?.partyEvent?.triggered);
  assert.equal(result.partyEvent.giantAppeared, false);
  assert.equal(result.stompEvent, null);
  assert.equal(result.crushEvent, null);
  result.board.flat().forEach((symbol) => {
    assert.ok(symbol >= 1 && symbol <= 5, `expected animal symbol, got ${symbol}`);
  });
});
