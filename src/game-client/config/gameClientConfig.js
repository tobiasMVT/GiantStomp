const gameClientConfig = {
  gameName: "Giant Stomp",
  layout: {
    mustSeeBounds: { x: 0, y: 0, width: 490, height: 466 },
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
      bg: 0x1a0f00,
      bgAlpha: 0.9,
      border: 0xffd700,
      hover: 0x2a1800,
      hoverAlpha: 0.95,
      text: "#ffd700",
    },
    secondary: {
      bg: 0x14141e,
      bgAlpha: 0.85,
      border: 0x555577,
      hover: 0x22223a,
      hoverAlpha: 0.95,
      text: "#a7b8ca",
    },
    utility: {
      bg: 0x14141e,
      bgAlpha: 0.7,
      border: 0x3a3a50,
      hover: 0x22223a,
      hoverAlpha: 0.85,
      text: "#a7b8ca",
    },
    disabled: {
      bg: 0x111118,
      bgAlpha: 0.6,
      border: 0x333344,
      text: "#666688",
    },
    autoplayActive: {
      bg: 0x0f2a0f,
      bgAlpha: 0.9,
      border: 0x44cc44,
    },
    picker: {
      bg: 0x0a0a14,
      bgAlpha: 0.94,
      border: 0x555577,
      chipActive: { bg: 0x2a1800, bgAlpha: 0.95, border: 0xffd700, text: "#ffd700" },
      chipInactive: { bg: 0x14141e, bgAlpha: 0.8, border: 0x555577, text: "#a7b8ca" },
    },
    secondaryBar: { bg: 0x080810, bgAlpha: 0.78 },
    regulatoryBar: { bg: 0x050508, bgAlpha: 0.85, text: "#8fa3bc" },
    dialog: {
      overlay: { color: 0x000000, alpha: 0.65 },
      panel: { bg: 0x0a0a14, bgAlpha: 0.95, border: 0x555577 },
    },
  },
};

export default gameClientConfig;
