import { GameServer, resetGameState } from "../game-server/Gameserver";

/**
 * Core RoundGateway
 * - Fetches/produces a full round state timeline (`roundStates[]`).
 * - Encapsulates current local game-server usage behind one interface.
 * - Can be swapped later with a remote API gateway without changing controller logic.
 */
class RoundGateway {
  constructor({ gameServer = new GameServer(), gameConfig }) {
    this.gameServer = gameServer;
    this.gameConfig = gameConfig;
    this.apiBaseUrl = this.resolveApiBaseUrl(gameConfig);
  }

  resolveApiBaseUrl(gameConfig) {
    const fromConfig = typeof gameConfig?.apiBaseUrl === "string" ? gameConfig.apiBaseUrl : "";
    const fromEnv =
      typeof import.meta !== "undefined" && import.meta.env?.VITE_GAME_SERVER_URL
        ? String(import.meta.env.VITE_GAME_SERVER_URL)
        : "";
    const baseUrl = (fromConfig || fromEnv).trim();
    return baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  }

  isRemoteApiEnabled() {
    return typeof this.apiBaseUrl === "string" && this.apiBaseUrl.length > 0;
  }

  async fetchRoundStatesRemote({ betSize = 1, ticketStrategy } = {}) {
    const response = await fetch(`${this.apiBaseUrl}/api/round-states`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ betSize, ticketStrategy })
    });

    if (!response.ok) {
      throw new Error(`Round API error (${response.status})`);
    }

    const data = await response.json();
    return Array.isArray(data?.roundStates) ? data.roundStates : [];
  }

  getTicketStrategies() {
    if (typeof this.gameServer?.getAvailableTicketStrategies === "function") {
      return this.gameServer.getAvailableTicketStrategies();
    }

    const fromConfig = Array.isArray(this.gameConfig?.ticketStrategies)
      ? this.gameConfig.ticketStrategies
      : [];

    if (fromConfig.length > 0) {
      return fromConfig;
    }

    return [this.gameConfig?.mathStyle || "normal"];
  }

  async fetchRoundStates({ betSize = 1, ticketStrategy } = {}) {
    if (this.isRemoteApiEnabled()) {
      return this.fetchRoundStatesRemote({ betSize, ticketStrategy });
    }

    if (typeof this.gameServer?.generateRoundStates === "function") {
      return this.gameServer.generateRoundStates({
        betSize,
        ticketStrategy
      });
    }

    // Safety fallback if server adapter does not yet support generateRoundStates
    const gameState = structuredClone(this.gameConfig.gameState);
    resetGameState(gameState);
    const roundStates = [];
    for (let i = 0; i < 10000; i++) {
      const resp = await this.gameServer.getResponse(gameState, betSize);
      roundStates.push(structuredClone(resp));
      if (resp.nextAction === "spin") {
        return roundStates;
      }
    }
    return [];
  }
}

export default RoundGateway;
