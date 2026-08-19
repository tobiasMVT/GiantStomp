import serverConfig from "../game-server/server_config.json";
import gameClientConfig from "../game-client/config/gameClientConfig";
import flowInteractionPolicy from "../game-client/config/flowInteractionPolicy";
import { GAME_LOGICAL_HEIGHT, GAME_LOGICAL_WIDTH } from "../game-client/config/layoutMetrics";
import { createInitialUiState } from "./config/uiStateConfig";
import GameController from "./GameController";
import RoundGateway from "./RoundGateway";
import SessionService from "./SessionService";
import EventBus from "./EventBus";
import GameStateStore from "./GameStateStore";
import LayoutManager from "./LayoutManager";

const { layout } = gameClientConfig;
const apiBaseUrl =
  typeof import.meta !== "undefined" && import.meta.env?.VITE_GAME_SERVER_URL
    ? String(import.meta.env.VITE_GAME_SERVER_URL)
    : "";
const runtimeGameConfig = { ...serverConfig, apiBaseUrl };

const initialGameState = {};
const initialUiState = createInitialUiState();

const roundGateway = new RoundGateway({ gameConfig: runtimeGameConfig });
const sessionService = new SessionService({ mockDelayMs: 300, apiBaseUrl });
const stateStore = new GameStateStore({
  gameState: initialGameState,
  uiState: initialUiState
});
const gameController = new GameController({
  roundGateway,
  gameConfig: runtimeGameConfig,
  flowInteractionConfig: flowInteractionPolicy,
  stateStore,
  sessionService
});
const eventBus = new EventBus();
const layoutManager = new LayoutManager({
  baseCanvas: { width: GAME_LOGICAL_WIDTH, height: GAME_LOGICAL_HEIGHT },
  safePadding: { top: 12, right: 12, bottom: 12, left: 12 },
  defaultGameContent: {
    mustSeeBounds: layout.mustSeeBounds,
    freeArea: layout.freeArea
  },
  ui: {
    minScale: 0.72,
    maxScale: 1.05,
    baseBottomRowHeight: 112
  }
});

export default gameController;
export { eventBus, stateStore, layoutManager };
