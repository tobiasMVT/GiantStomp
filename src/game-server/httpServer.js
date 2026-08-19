import http from "node:http";

import serverConfig from "./server_config.json" with { type: "json" };
import { GameServer } from "./Gameserver.js";
import {
  clearForcedOutcomeSelection,
  getForcedOutcomeSelection,
  listForcedOutcomeOptions,
  setForcedOutcomeSelection
} from "./lib/devForcedOutcomeStore.js";

const DEFAULT_PORT = 8787;
const portFromEnv = Number(process.env.PORT);
const port = Number.isFinite(portFromEnv) && portFromEnv > 0 ? portFromEnv : DEFAULT_PORT;

const toLabel = (id) =>
  String(id)
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (char) => char.toUpperCase());

const resolveTicketStrategies = () => {
  const gameServer = new GameServer();
  const ids = gameServer.getAvailableTicketStrategies();
  return ids.map((id) => ({ id, label: toLabel(id) }));
};

const buildSessionPayload = () => {
  const ticketStrategies = resolveTicketStrategies();
  const defaultTicketStrategy = ticketStrategies.find((entry) => entry.id === serverConfig.mathStyle)?.id
    || ticketStrategies[0]?.id
    || "normal";

  return {
    session: {
      sessionId: "local-session-" + Math.random().toString(36).slice(2, 10),
      token: "local-dev-token",
      playerId: "player-1",
      currency: "EUR",
      jurisdiction: "MGA"
    },
    settings: {
      betLevels: [0.1, 0.5, 1, 2, 5, 10, 25, 50, 75, 100],
      defaultBetIndex: 2,
      autoplay: {
        allowed: true
      },
      quickStopAllowed: true,
      spinDelayTimer: 0,
      balance: Number(serverConfig?.wallet?.balance ?? 1000),
      dev: {
        ticketModeEnabled: true,
        defaultTicketStrategy,
        ticketStrategies
      }
    }
  };
};

const buildForcedOutcomePayload = () => ({
  forcedOutcomeSelection: getForcedOutcomeSelection(),
  options: listForcedOutcomeOptions(
    serverConfig,
    resolveTicketStrategies().map((entry) => entry.id)
  )
});

const sendJson = (res, statusCode, payload) => {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
};

const sendNotFound = (res) => {
  sendJson(res, 404, { error: "Not Found" });
};

const applyCors = (res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
};

const parseJsonBody = (req) =>
  new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!body.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });

const server = http.createServer(async (req, res) => {
  applyCors(res);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  if (req.method === "GET" && url.pathname === "/health") {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/session") {
    sendJson(res, 200, buildSessionPayload());
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/ticket-strategies") {
    sendJson(res, 200, {
      ticketStrategies: resolveTicketStrategies()
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/dev/forced-ticket") {
    sendJson(res, 200, buildForcedOutcomePayload());
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/dev/forced-ticket") {
    try {
      const body = await parseJsonBody(req);
      const selection = body?.forcedOutcomeSelection ?? body;

      if (selection) {
        setForcedOutcomeSelection(selection);
      } else {
        clearForcedOutcomeSelection();
      }

      sendJson(res, 200, buildForcedOutcomePayload());
    } catch (err) {
      sendJson(res, 400, { error: err.message || "Bad Request" });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/round-states") {
    try {
      const body = await parseJsonBody(req);
      const betSize = Number(body?.betSize);
      const normalizedBetSize = Number.isFinite(betSize) && betSize > 0 ? betSize : 1;
      const ticketStrategy = typeof body?.ticketStrategy === "string" ? body.ticketStrategy : undefined;

      const gameServer = new GameServer();
      const roundStates = await gameServer.generateRoundStates({
        betSize: normalizedBetSize,
        ticketStrategy
      });

      sendJson(res, 200, { roundStates });
    } catch (err) {
      sendJson(res, 400, { error: err.message || "Bad Request" });
    }
    return;
  }

  sendNotFound(res);
});

server.listen(port, () => {
  console.log(`[game-server] listening on http://localhost:${port}`);
});
