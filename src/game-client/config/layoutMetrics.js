import clientConfig from "./client_config.json";

const CELL_SIZE = 90;
const GRID_OFFSET_X = 20;
const GRID_OFFSET_Y = 70;
const GRID_WIDTH_PX = clientConfig.area.width * CELL_SIZE;
const GRID_HEIGHT_PX = clientConfig.area.height * CELL_SIZE;
const REEL_ORIGIN_X = GRID_OFFSET_X;
const REEL_ORIGIN_Y = GRID_OFFSET_Y;
const REEL_SAFE_MARGIN_PX = 12;
const PRESENTATION_BAND_TOP_PX = 58;
const PRESENTATION_BAND_BOTTOM_PX = 126;
const GAME_LOGICAL_WIDTH = GRID_WIDTH_PX + GRID_OFFSET_X * 2;
const GAME_LOGICAL_HEIGHT = GRID_OFFSET_Y + GRID_HEIGHT_PX + PRESENTATION_BAND_BOTTOM_PX;

const getCellCenter = (reel, row) => ({
  x: REEL_ORIGIN_X + reel * CELL_SIZE + CELL_SIZE / 2,
  y: REEL_ORIGIN_Y + (clientConfig.area.height - 1 - row) * CELL_SIZE + CELL_SIZE / 2,
});

const getCountUpAnchor = () => ({
  x: REEL_ORIGIN_X + GRID_WIDTH_PX / 2,
  y: REEL_ORIGIN_Y + GRID_HEIGHT_PX + 46,
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
  getGridBottomY,
};
