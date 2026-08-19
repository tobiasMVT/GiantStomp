import clientConfig from "./client_config.json";

// Shared layout metrics for reel-space coordinates and logical game envelope.
// Keeping these in one file prevents GameScene/layout profile drift.
const CELL_SIZE = 70;
const GRID_OFFSET_X = 0;
const GRID_OFFSET_Y = 0;
const GRID_WIDTH_PX = clientConfig.area.width * CELL_SIZE;
const GRID_HEIGHT_PX = clientConfig.area.height * CELL_SIZE;
const REEL_ORIGIN_X = GRID_OFFSET_X;
const REEL_ORIGIN_Y = GRID_OFFSET_Y;
const REEL_SAFE_MARGIN_PX = 0;
const PRESENTATION_BAND_TOP_PX = 0;
const PRESENTATION_BAND_BOTTOM_PX = 0;

// Logical layout target for responsive fit.
// Keep this mapped to the visible reel rectangle so game area fills predictably.
const GAME_LOGICAL_WIDTH = GRID_WIDTH_PX;
const GAME_LOGICAL_HEIGHT = GRID_HEIGHT_PX + 180;

const getCellCenter = (reel, row) => ({
  x: REEL_ORIGIN_X + reel * CELL_SIZE + CELL_SIZE / 2,
  y: REEL_ORIGIN_Y + (clientConfig.area.height - 1 - row) * CELL_SIZE + CELL_SIZE / 2
});

const getCountUpAnchor = () => ({
  x: REEL_ORIGIN_X + GRID_WIDTH_PX / 2,
  y: REEL_ORIGIN_Y + GRID_HEIGHT_PX - 24 + 70
});

const getGridBottomY = () => REEL_ORIGIN_Y + GRID_HEIGHT_PX;

export {
  CELL_SIZE,
  GRID_OFFSET_X,
  GRID_OFFSET_Y,
  GRID_WIDTH_PX,
  GRID_HEIGHT_PX,
  REEL_ORIGIN_X,
  REEL_ORIGIN_Y,
  REEL_SAFE_MARGIN_PX,
  PRESENTATION_BAND_TOP_PX,
  PRESENTATION_BAND_BOTTOM_PX,
  GAME_LOGICAL_WIDTH,
  GAME_LOGICAL_HEIGHT,
  getCellCenter,
  getCountUpAnchor,
  getGridBottomY
};

