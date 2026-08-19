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

test("accumulates Anger within one paid round and resets on the next", async () => {
  const provider = ({ action }) => {
    const board = noWinBoard();
    if (action === "spin") board[4][2] = SCATTER;
    return board;
  };
  const server = new GameServer({ random: () => 0, boardProvider: provider });

  const first = await server.generateRoundStates({ ticketStrategy: "noWin" });
  const second = await server.generateRoundStates({ ticketStrategy: "noWin" });
  const third = await server.generateRoundStates({ ticketStrategy: "noWin" });

  assert.equal(first.at(-1).anger, 1);
  assert.deepEqual(first.at(-1).angerMeter, { count: 1, max: 3 });
  assert.equal(second.at(-1).anger, 1);
  assert.deepEqual(second.at(-1).angerMeter, { count: 1, max: 3 });
  assert.equal(third.at(-1).anger, 1);
  assert.deepEqual(third.at(-1).angerMeter, { count: 1, max: 3 });
});

test("fills Anger from scatters across cascades in one round", async () => {
  const provider = ({ action }) => {
    if (action === "freespin") return noWinBoard();
    const board = noWinBoard();
    board[0][0] = 1;
    board[1][0] = 1;
    board[2][0] = 1;
    return board;
  };
  const server = new GameServer({ random: () => 0.999999, boardProvider: provider });

  const states = await server.generateRoundStates({ betSize: 1, ticketStrategy: "waysWin" });
  const spin = states.find((state) => state.executedAction === "spin");
  const respin = states.find((state) => state.executedAction === "respin");

  assert.equal(spin.scatterLandings.length, 0);
  assert.equal(respin.scatterLandings.length, 4);
  assert.deepEqual(respin.scatterLandings.map((landing) => landing.counted), [true, true, true, false]);
  assert.equal(states.filter((state) => state.executedAction === "bonustransition").length, 1);
  assert.equal(states.filter((state) => state.executedAction === "freespin").length, 3);
  assert.deepEqual(states.at(-1).angerMeter, { count: 0, max: 3 });
});

test("ignores extra scatters after Anger triggers", async () => {
  const provider = ({ action }) => {
    const board = noWinBoard();
    if (action === "spin") {
      board[0][0] = SCATTER;
      board[1][0] = SCATTER;
      board[2][1] = SCATTER;
      board[4][2] = SCATTER;
    }
    return board;
  };
  const server = new GameServer({ random: () => 0, boardProvider: provider });

  const states = await server.generateRoundStates({ ticketStrategy: "bonusEntry" });
  const landings = states[0].scatterLandings;

  assert.equal(landings.length, 4);
  assert.deepEqual(landings.map((landing) => landing.counted), [true, true, true, false]);
  assert.equal(landings[2].triggeredBonus, true);
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
  assert.equal(states.at(-1).anger, 1);
  assert.deepEqual(states.at(-1).angerMeter, { count: 1, max: 3 });
  assert.equal(states.filter((state) => state.executedAction === "bonustransition").length, 0);
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

  assert.equal(states.find((state) => state.executedAction === "spin")?.crushEvent, null);
  freespins.forEach((state) => assert.equal(state.crushEvent, null));
});
