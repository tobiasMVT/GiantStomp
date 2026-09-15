const gameClientConfig = {
  gameName: "Giant Stomp",
  layout: {
    mustSeeBounds: { x: 0, y: 0, width: 428, height: 458 },
    freeArea: {
      minBottomPx: 150,
      fitPaddingPx: 0,
      landscapeMinBottomPx: 48,
      landscapeMinRightPx: 150,
      bottomBarsPx: 34,
      rightRailMinSafeHeightPx: 0,
      railSpinLiftPx: 30,
      rightRailScaleBaseSafeHeightPx: 780,
      rightRailScaleMin: 0.85,
      rightRailScaleMax: 1.5,
    },
  },
  theme: {
    primary: {
      bg: 0x1a1208,
      bgAlpha: 0.92,
      border: 0xfcd12a,
      hover: 0x2a1e0c,
      hoverAlpha: 0.95,
      text: "#fcd12a",
    },
    secondary: {
      bg: 0x14100c,
      bgAlpha: 0.62,
      border: 0x6b4423,
      hover: 0x241a12,
      hoverAlpha: 0.72,
      text: "#ffffff",
    },
    utility: {
      bg: 0x14100c,
      bgAlpha: 0.55,
      border: 0x6b4423,
      hover: 0x241a12,
      hoverAlpha: 0.68,
      text: "#e8dcc8",
    },
    disabled: {
      bg: 0x14100c,
      bgAlpha: 0.42,
      border: 0x3d2b1f,
      text: "#8a7a6a",
    },
    autoplayActive: {
      bg: 0x1a3010,
      bgAlpha: 0.88,
      border: 0x8fb339,
      text: "#b8e86a",
    },
    picker: {
      bg: 0x2a1e14,
      bgAlpha: 0.94,
      border: 0x8b5a2b,
      chipActive: { bg: 0x4b2c1d, bgAlpha: 0.95, border: 0xfcd12a, text: "#fcd12a" },
      chipInactive: { bg: 0x1a1208, bgAlpha: 0.82, border: 0x6b4423, text: "#e8dcc8" },
    },
    secondaryBar: { bg: 0x1a1208, bgAlpha: 0.55, text: "#ffffff" },
    regulatoryBar: { bg: 0x0d0a08, bgAlpha: 0.82, text: "#e8dcc8" },
    dialog: {
      overlay: { color: 0x1a1208, alpha: 0.6 },
      panel: { bg: 0x2a1e14, bgAlpha: 0.96, border: 0x8b5a2b, titleText: "#fcd12a", bodyText: "#e8dcc8" },
    },
  },
};

export default gameClientConfig;
