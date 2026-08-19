const gameClientConfig = {

  gameName: "Thunderkong",



  layout: {

    mustSeeBounds: { x: 15, y: 0, width: 575, height: 711 },

    // Scene background (heaven_city / hell bonus floor) — centered on mustSeeBounds.
    // `bonus` overrides apply when helldive_hell_bonus_bg is active.

    background: {

      offsetX: 0,

      offsetY: -560,

      scale: 1.5,

      bleedFactor: 1.04,

      widthPadding: 40,

      heightPadding: 80,

      alignY: "top",

      depth: 0,

      bonus: {

        scale: 1,

        offsetY: 0,

      },

    },

    freeArea: {

      minBottomPx: 200,

      fitPaddingPx: 0,

      // Landscape tuning for right-rail controls.

      // Minimum bottom reserve (px) in landscape when controls move to right rail.

      // Lower = more game area height, higher = more space for bottom UI strip.

      landscapeMinBottomPx: 48,

      // Minimum reserved right-side rail width (px) for spin/bet/autoplay stack.

      // Lower = rail can appear on tighter screens, higher = more comfortable rail spacing.

      landscapeMinRightPx: 150,

      // Estimated combined height of the persistent bottom mini bars (sec/reg strip), in px.

      // Used to keep game content from colliding with bottom informational bars.

      bottomBarsPx: 34,

      // Minimum safe-area height required before right-rail mode is allowed.

      // 0 = allow rail in all landscape sizes; increase only if you want stricter fallback.

      rightRailMinSafeHeightPx: 0,

      // Vertical lift (px) that keeps spin button above sec-bar in right-rail mode.

      // Increase for more separation from bottom bars.

      railSpinLiftPx: 30,

      // Safe-area height (px) treated as "1.0x reference size" for right-rail scaling.

      // Taller safe area than this grows controls; shorter safe area shrinks controls.

      rightRailScaleBaseSafeHeightPx: 780,

      // Lower clamp for right-rail control scale (relative to base button sizes).

      rightRailScaleMin: 0.85,

      // Upper clamp for right-rail control scale (relative to base button sizes).

      rightRailScaleMax: 1.5

    },

    // Main-game portal at the soul-portal spot (replaces red dot when enabled).

    // source: "gif" (portal.gif) or "redPng" (redportal/Lager *.png sequence)

    mainGamePortal: {

      enabled: true,

      replaceDot: true,

      source: "redPng",

      anchor: {

        reel: -1,

        rowA: 5,

        rowB: 6,

        offsetX: -245,

        offsetY: 15,

      },

      dot: {

        offsetX: 0,

        offsetY: 0,

        radius: 8,

      },

      portal: {

        offsetX: 0,

        offsetY: 0,

        scale: 0.2,

        displaySize: 2080,

        alpha: 1,

        depth: 3,

      },

      zoomFocus: {
        reelA: 3,
        reelB: 4,
        rowA: 5,
        rowB: 6,
        offsetX: 50,
        offsetY: 60,
      },
      mask: {
        enabled: true,

        edgeSoftness: 1,

        growth: {

          startRadius: 20,

          startInnerHold: 0.1,

          endRadius: 200,

          endInnerHold: 0.4,

        },

        bonusEntry: {

          radius: 300,

          durationMs: 1300,
          cameraZoom: 1.35,

        },

      },

      sources: {

        gif: { path: "assets/helldive/backgrounds/portal.gif" },

        redPng: {

          folder: "assets/helldive/backgrounds/redportal",

          frameCount: 23,

          frameRate: 25,

        },

      },

    },

    // Per-cell dark board shadow panels behind symbols (center 2x2 opening stays clear).

    boardShadowBackplates: {

      enabled: false,

    },

    // Invisible spawn / exit fade above and below the reel.

    symbolSpawnCurtain: {

      enabled: true,

      fadeHeightPx: 48,

      extendToScreenTop: true,

      extendToScreenBottom: true,

      topPaddingPx: 8,

      bottomPaddingPx: 8,

      slideOutDistancePx: 500,

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

    secondaryBar: {

      bg: 0x080810,

      bgAlpha: 0.78,

    },

    regulatoryBar: {

      bg: 0x050508,

      bgAlpha: 0.85,

      text: "#8fa3bc",

    },

    dialog: {

      overlay: { color: 0x000000, alpha: 0.65 },

      panel: { bg: 0x0a0a14, bgAlpha: 0.95, border: 0x555577 },

    },

  },

};



export default gameClientConfig;




