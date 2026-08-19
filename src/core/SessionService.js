import rawServerConfig from "../game-server/server_config.json";

/**
 * Mock SessionService
 * Simulates an API call that returns a player session and game settings.
 * In production, replace getSession() with a real HTTP client hitting your backend.
 */
class SessionService {
  constructor({ mockDelayMs = 300, apiBaseUrl = "" } = {}) {
    this.mockDelayMs = mockDelayMs;
    this.apiBaseUrl = resolveApiBaseUrl(apiBaseUrl);
  }

  isRemoteApiEnabled() {
    return typeof this.apiBaseUrl === "string" && this.apiBaseUrl.length > 0;
  }

  async fetchRemoteSession() {
    const response = await fetch(`${this.apiBaseUrl}/api/session`);
    if (!response.ok) {
      throw new Error(`Session API error (${response.status})`);
    }
    return response.json();
  }

  async getSession() {
    if (this.isRemoteApiEnabled()) {
      try {
        return await this.fetchRemoteSession();
      } catch (error) {
        console.warn("[SessionService] Falling back to mock session:", error.message);
      }
    }

    if (this.mockDelayMs > 0) {
      await new Promise((r) => setTimeout(r, this.mockDelayMs));
    }

    return {
      session: {
        sessionId: "mock-session-" + Math.random().toString(36).slice(2, 10),
        token: "mock-jwt-token",
        playerId: "player-1",
        currency: "EUR",
        jurisdiction: "MGA"
      },
      settings: {
        ...defaultGameSettings,
        dev: buildDevSettings(),
        balance: 1000
      }
    };
  }
}

export default SessionService;


const defaultGameSettings = {
  betLevels: [0.1, 0.5, 1, 2, 5, 10, 25, 50, 75, 100],
  defaultBetIndex: 2,
  autoplay: {
    allowed: true
  },
  quickStopAllowed: true,
  spinDelayTimer: 0
};

const resolveApiBaseUrl = (apiBaseUrl = "") => {
  const fromConstructor = typeof apiBaseUrl === "string" ? apiBaseUrl : "";
  const fromEnv =
    typeof import.meta !== "undefined" && import.meta.env?.VITE_GAME_SERVER_URL
      ? String(import.meta.env.VITE_GAME_SERVER_URL)
      : "";
  const baseUrl = (fromConstructor || fromEnv).trim();
  return baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
};

const isPlainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

const hasPositiveWeight = (bucket) => {
  if (!isPlainObject(bucket)) return false;
  return Object.values(bucket).some((weight) => Number(weight) > 0);
};

const toLabel = (id) =>
  String(id)
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (char) => char.toUpperCase());

const getTicketStrategyIds = () => {
  const allowedStrategiesInOrder = [
    "max",
    "necromancer2",
    "mystery",
    "mysteryWild",
    "axe",
    "trollTease",
    "trollMain",
    "trollBonus",
    "bonus",
    "normal"
  ];

  const valid = allowedStrategiesInOrder.filter((id) => hasPositiveWeight(rawServerConfig[id]));
  if (valid.length > 0) {
    return valid;
  }

  return ["normal"];
};

const buildDevSettings = () => {
  const ids = getTicketStrategyIds();
  const defaultStrategy = ids.includes(rawServerConfig.mathStyle) ? rawServerConfig.mathStyle : ids[0];
  return {
    ticketModeEnabled: isDevQueryEnabled(),
    defaultTicketStrategy: defaultStrategy,
    ticketStrategies: ids.map((id) => ({ id, label: toLabel(id) }))
  };
};

const isDevQueryEnabled = () => {
  try {
    return typeof window !== "undefined" && window.location?.search?.includes("dev");
  } catch (_) {
    return false;
  }
};
