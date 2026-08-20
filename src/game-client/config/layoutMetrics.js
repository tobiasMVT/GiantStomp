import clientConfig from "./client_config.json";

const CELL_SIZE = 76;
const GRID_OFFSET_X = 24;
const GRID_OFFSET_Y = 88;
const GRID_WIDTH_PX = clientConfig.area.width * CELL_SIZE;
const GRID_HEIGHT_PX = clientConfig.area.height * CELL_SIZE;
const REEL_ORIGIN_X = GRID_OFFSET_X;
const REEL_ORIGIN_Y = GRID_OFFSET_Y;
const REEL_SAFE_MARGIN_PX = 12;
const PRESENTATION_BAND_TOP_PX = 58;
const PRESENTATION_BAND_BOTTOM_PX = 126;
const GAME_LOGICAL_WIDTH = GRID_WIDTH_PX + GRID_OFFSET_X * 2;
const GAME_LOGICAL_HEIGHT = GRID_OFFSET_Y + GRID_HEIGHT_PX + PRESENTATION_BAND_BOTTOM_PX;

const getRowYOffset = (row) => {
  const topRow = clientConfig.area.height - 1;
  if (row === topRow) return -10;
  if (row === 0) return 10;
  return 0;
};

const getCellCenter = (reel, row) => ({
  x: REEL_ORIGIN_X + reel * CELL_SIZE + CELL_SIZE / 2,
  y: REEL_ORIGIN_Y + (clientConfig.area.height - 1 - row) * CELL_SIZE + CELL_SIZE / 2 + getRowYOffset(row),
});

const getCountUpAnchor = () => ({
  x: REEL_ORIGIN_X + GRID_WIDTH_PX / 2,
  y: REEL_ORIGIN_Y + GRID_HEIGHT_PX + 46,
});

const getGridBottomY = () => REEL_ORIGIN_Y + GRID_HEIGHT_PX;

// Inner playable grid rect within reel_frame.png (1340×1043), normalized 0–1.
const REEL_FRAME_INNER_NORM = { x: 0.06, y: 0.15, width: 0.88, height: 0.73 };
const REEL_FRAME_OFFSET_Y = -14;
const BONUS_BACKGROUND_OFFSET_Y = 30;
const OUCH_BACKGROUND_OFFSET_Y = 270;
const OUCH_BACKGROUND_SCALE = 1.2;
const OUCH_STOMP_OFFSET_X = 50;
const OUCH_PIT_STEP_DELTA_Y = 88;
const OUCH_UI_OFFSET_Y = 50;

const layoutReelFrame = (image, source) => {
  const innerW = source.width * REEL_FRAME_INNER_NORM.width;
  const innerH = source.height * REEL_FRAME_INNER_NORM.height;
  const scale = Math.max(GRID_WIDTH_PX / innerW, GRID_HEIGHT_PX / innerH);
  image.setScale(scale);

  const innerCenterX = source.width * (REEL_FRAME_INNER_NORM.x + REEL_FRAME_INNER_NORM.width / 2);
  const innerCenterY = source.height * (REEL_FRAME_INNER_NORM.y + REEL_FRAME_INNER_NORM.height / 2);
  image.setPosition(
    GRID_OFFSET_X + GRID_WIDTH_PX / 2 + (source.width / 2 - innerCenterX) * scale,
    GRID_OFFSET_Y + GRID_HEIGHT_PX / 2 + (source.height / 2 - innerCenterY) * scale + REEL_FRAME_OFFSET_Y
  );
};

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
  layoutReelFrame,
  BONUS_BACKGROUND_OFFSET_Y,
  OUCH_BACKGROUND_OFFSET_Y,
  OUCH_BACKGROUND_SCALE,
  OUCH_STOMP_OFFSET_X,
  OUCH_PIT_STEP_DELTA_Y,
  OUCH_UI_OFFSET_Y,
};
