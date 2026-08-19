import assert from "node:assert/strict";
import test from "node:test";

import { GameServer } from "./Gameserver.js";
import { clearForcedOutcomeSelection } from "./lib/devForcedOutcomeStore.js";

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

test("counts only replacement scatters during a cascade", async () => {
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
});

test("persists Anger across paid rounds and runs exactly three freespins", async () => {
  const provider = ({ action }) => {
    const board = noWinBoard();
    if (action === "spin") board[4][2] = 8;
    return board;
  };
  const server = new GameServer({ random: () => 0, boardProvider: provider });

  const first = await server.generateRoundStates({ ticketStrategy: "noWin" });
  const second = await server.generateRoundStates({ ticketStrategy: "noWin" });
  const third = await server.generateRoundStates({ ticketStrategy: "noWin" });

  assert.equal(first.at(-1).anger, 1);
  assert.deepEqual(first.at(-1).angerMeter, { count: 1, max: 3 });
  assert.equal(second.at(-1).anger, 2);
  assert.deepEqual(second.at(-1).angerMeter, { count: 2, max: 3 });
  assert.equal(server.anger, 0);
  assert.equal(third.filter((state) => state.executedAction === "bonustransition").length, 1);
  assert.equal(third.filter((state) => state.executedAction === "freespin").length, 3);
  assert.deepEqual(third.at(-1).angerMeter, { count: 0, max: 3 });
  assert.equal(third.at(-1).nextAction, "spin");
  assert.equal(third.at(-1).roundSummary.wasBonus, true);
});

test("ignores extra scatters after Anger triggers", async () => {
  const provider = ({ action }) => {
    const board = noWinBoard();
    if (action === "spin") {
      board[0][0] = 8;
      board[1][0] = 8;
      board[2][1] = 8;
      board[4][2] = 8;
    }
    return board;
  };
  const server = new GameServer({ anger: 2, random: () => 0, boardProvider: provider });

  const states = await server.generateRoundStates({ ticketStrategy: "bonusEntry" });
  const landings = states[0].scatterLandings;

  assert.equal(landings.length, 4);
  assert.deepEqual(landings.map((landing) => landing.counted), [true, false, false, false]);
  assert.equal(landings[0].triggeredBonus, true);
  assert.equal(server.anger, 0);
});

test("fake no-win rounds do not mutate persistent Anger", async () => {
  const provider = () => {
    const board = noWinBoard();
    board[4][2] = 8;
    return board;
  };
  const server = new GameServer({ anger: 1, boardProvider: provider });

  const states = await server.generateRoundStates({ fakeNoWins: true });

  assert.equal(states.at(-1).simulationFakeNoWin, true);
  assert.equal(server.anger, 1);
});
