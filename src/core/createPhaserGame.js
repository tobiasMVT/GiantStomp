import Phaser from "phaser";
import { GameScene } from "../game-client/GameScene";
import { LoadingScene } from "../game-client/LoadingScene";
import { UIScene } from "../framework-ui/UIScene";

/**
 * Plain JS Phaser bootstrapper.
 * React only provides a mount element; Phaser lifecycle stays framework-agnostic.
 */
export default function createPhaserGame({ parentElement, onReady }) {
  if (!parentElement) {
    throw new Error("createPhaserGame requires a parentElement");
  }
  const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
  const renderResolution = Math.min(2, Math.max(1, dpr));

  const config = {
    type: Phaser.WEBGL,
    parent: parentElement,
    transparent: true,
    resolution: renderResolution,
    render: {
      antialias: true,
      antialiasGL: true,
      pixelArt: false,
      roundPixels: false
    },
    scale: {
      mode: Phaser.Scale.RESIZE,
      width: 1,
      height: 1,
      autoRound: true,
      resizeInterval: 100
    },
    scene: [LoadingScene, GameScene, UIScene]
  };

  const game = new Phaser.Game(config);
  let pollTimer = null;

  const disposeHiDpiCanvas = installHiDpiCanvas(game, parentElement);
  installResolutionDebug(game);

  const checkReady = () => {
    const gameScene = game.scene.keys.GameScene;
    let uiScene = game.scene.keys.UIScene;

    if (gameScene?.sys?.isActive() && (!uiScene || !uiScene.sys?.isActive())) {
      game.scene.start("UIScene");
      uiScene = game.scene.keys.UIScene;
    }

    if (gameScene?.sys?.isActive() && uiScene?.sys?.isActive()) {
      game.scene.bringToTop("UIScene");
      onReady?.({ game, gameScene, uiScene });
      return;
    }

    pollTimer = window.setTimeout(checkReady, 50);
  };

  checkReady();

  return {
    game,
    destroy() {
      if (pollTimer) {
        clearTimeout(pollTimer);
        pollTimer = null;
      }
      disposeHiDpiCanvas?.();
      game.destroy(true);
    }
  };
}

function getRenderPixelRatio() {
  if (typeof window === "undefined") {
    return 1;
  }
  return Math.min(2, Math.max(1, window.devicePixelRatio || 1));
}

function installHiDpiCanvas(game, parentElement) {
  if (typeof window === "undefined" || !game || !parentElement) {
    return () => {};
  }

  const timers = [];
  let deferredTimer = null;
  let pending = false;
  let applying = false;

  const apply = () => {
    pending = false;

    const canvas = game.canvas;
    const renderer = game.renderer;
    const scale = game.scale;
    const rect = parentElement.getBoundingClientRect();
    const cssWidth = Math.max(1, Math.round(rect.width || window.innerWidth || 1));
    const cssHeight = Math.max(1, Math.round(rect.height || window.innerHeight || 1));
    const ratio = getRenderPixelRatio();
    const backingWidth = Math.max(1, Math.round(cssWidth * ratio));
    const backingHeight = Math.max(1, Math.round(cssHeight * ratio));

    if (!canvas || !renderer || !scale) {
      return;
    }

    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;
    game._hiDpiPixelRatio = ratio;

    if (
      canvas.width === backingWidth &&
      canvas.height === backingHeight &&
      renderer.width === backingWidth &&
      renderer.height === backingHeight &&
      Math.round(scale.width) === backingWidth &&
      Math.round(scale.height) === backingHeight
    ) {
      scale.updateBounds?.();
      scale.displayScale?.set?.(backingWidth / cssWidth, backingHeight / cssHeight);
      return;
    }

    const previousWidth = scale.width || scale.gameSize?.width || cssWidth;
    const previousHeight = scale.height || scale.gameSize?.height || cssHeight;

    applying = true;
    try {
      scale.gameSize?.resize?.(backingWidth, backingHeight);
      scale.baseSize?.resize?.(backingWidth, backingHeight);
      scale.displaySize?.resize?.(cssWidth, cssHeight);

      canvas.width = backingWidth;
      canvas.height = backingHeight;
      renderer.resize(backingWidth, backingHeight);

      scale.updateBounds?.();
      scale.displayScale?.set?.(backingWidth / cssWidth, backingHeight / cssHeight);
      scale.emit?.(
        Phaser.Scale.Events.RESIZE,
        scale.gameSize,
        scale.baseSize,
        scale.displaySize,
        previousWidth,
        previousHeight
      );
    } finally {
      applying = false;
    }
  };

  const scheduleNextFrame = () => {
    if (pending) {
      return;
    }
    pending = true;
    window.requestAnimationFrame(apply);
  };

  const scheduleSettled = () => {
    if (deferredTimer) {
      window.clearTimeout(deferredTimer);
    }
    deferredTimer = window.setTimeout(() => {
      deferredTimer = null;
      scheduleNextFrame();
    }, 80);
  };

  const onScaleResize = () => {
    if (!applying) {
      apply();
    }
  };

  scaleSafeOn(game.scale, Phaser.Scale.Events.RESIZE, onScaleResize);
  window.addEventListener("resize", scheduleSettled, { passive: true });
  window.addEventListener("orientationchange", scheduleSettled, { passive: true });
  window.visualViewport?.addEventListener?.("resize", scheduleSettled, { passive: true });

  scheduleNextFrame();
  [100, 500, 1000].forEach((delay) => {
    timers.push(window.setTimeout(scheduleNextFrame, delay));
  });

  return () => {
    timers.forEach((timer) => window.clearTimeout(timer));
    if (deferredTimer) {
      window.clearTimeout(deferredTimer);
      deferredTimer = null;
    }
    game.scale?.off?.(Phaser.Scale.Events.RESIZE, onScaleResize);
    window.removeEventListener("resize", scheduleSettled);
    window.removeEventListener("orientationchange", scheduleSettled);
    window.visualViewport?.removeEventListener?.("resize", scheduleSettled);
  };
}

function scaleSafeOn(scale, eventName, callback) {
  if (scale?.on && eventName && callback) {
    scale.on(eventName, callback);
  }
}

function installResolutionDebug(game) {
  if (typeof window === "undefined") {
    return;
  }

  window.slotDebug = window.slotDebug || {};
  window.slotDebug.resolution = {
    log() {
      const canvas = game.canvas || document.querySelector("canvas");
      const rect = canvas?.getBoundingClientRect?.();
      const width = rect?.width || 0;
      const height = rect?.height || 0;
      const metrics = {
        href: window.location.href,
        dpr: window.devicePixelRatio || 1,
        visualViewportScale: window.visualViewport?.scale || 1,
        inner: `${window.innerWidth}x${window.innerHeight}`,
        canvasCss: `${Math.round(width)}x${Math.round(height)}`,
        canvasBacking: canvas ? `${canvas.width}x${canvas.height}` : "none",
        backingRatioX: width ? Number((canvas.width / width).toFixed(3)) : null,
        backingRatioY: height ? Number((canvas.height / height).toFixed(3)) : null,
        phaserScale: `${game.scale?.width || 0}x${game.scale?.height || 0}`,
        renderer: `${game.renderer?.width || 0}x${game.renderer?.height || 0}`,
        renderPixelRatio: game._hiDpiPixelRatio || getRenderPixelRatio()
      };
      console.table(metrics);
      return metrics;
    },
    refresh() {
      game.scale?.refresh?.();
      return this.log();
    }
  };
}
