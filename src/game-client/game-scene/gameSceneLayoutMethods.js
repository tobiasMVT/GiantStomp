export function createGameSceneLayoutMethods(deps = {}) {
  const {
    clientConfig,
    gameClientConfig
  } = deps;

  return {
    setEventBus(eventBus) {
        this.eventBus = eventBus;
        if (this.unsubscribeLayout) {
          this.unsubscribeLayout();
          this.unsubscribeLayout = null;
        }
        if (this.unsubscribeLayoutDebugVisibility) {
          this.unsubscribeLayoutDebugVisibility();
          this.unsubscribeLayoutDebugVisibility = null;
        }
        if (eventBus) {
          this.unsubscribeLayout = eventBus.on("layout:changed", (layoutSnapshot) => {
            this.layoutSnapshot = layoutSnapshot;
            this.applyLayoutSnapshot();
          });
          this.unsubscribeLayoutDebugVisibility = eventBus.on("layout:debug:visibility", ({ enabled } = {}) => {
            this.layoutDebugEnabled = !!enabled;
            this.refreshLayoutDebugVisualization();
          });
          this.emitFreespinsCounter(null);
          this.emitLayoutContentBounds();
        }
      },

    getLayoutContentBounds() {
        const fallbackBounds = {
          x: 0,
          y: 0,
          width: clientConfig.area.width * 70,
          height: clientConfig.area.height * 70
        };
        const fallbackFreeArea = {
          minBottomPx: 180,
          fitPaddingPx: 0
        };
        const layoutCfg = gameClientConfig?.layout || {};
        const viewportW = this.scale?.width || 0;
        const viewportH = this.scale?.height || 0;
        const isLandscape = viewportW > viewportH;
        const configuredFreeArea = { ...(layoutCfg.freeArea || fallbackFreeArea) };
        const configuredBottomBarsPx = Math.max(0, Number(configuredFreeArea.bottomBarsPx) || 0);
        const defaultLandscapeBottomPx = Math.max(40, configuredBottomBarsPx + 12);
        const landscapeMinRightPx = Math.max(
          150,
          Number(configuredFreeArea.landscapeMinRightPx) || 0,
          Number(configuredFreeArea.minRightPx) || 0
        );
        const canUseLandscapeRail = isLandscape;
    
        const responsiveFreeArea = canUseLandscapeRail
          ? {
            ...configuredFreeArea,
            // Right-rail landscape: keep only a slim bottom UI strip for sec/reg mini-bars.
            minBottomPx: Math.max(
              36,
              Number(configuredFreeArea.landscapeMinBottomPx) || defaultLandscapeBottomPx
            ),
            minRightPx: landscapeMinRightPx
          }
          : {
            ...configuredFreeArea,
            minRightPx: 0
          };
    
        return {
          mustSeeBounds: { ...(layoutCfg.mustSeeBounds || fallbackBounds) },
          freeArea: responsiveFreeArea
        };
      },

    emitLayoutContentBounds() {
        this.eventBus?.emit("layout:contentBoundsChanged", this.getLayoutContentBounds());
      },

    refreshLayoutDebugVisualization() {
        const camera = this.cameras?.main;
        if (camera) {
          camera.setBackgroundColor(this.layoutDebugEnabled ? 0x2a2a2a : 0x000000);
        }
        this.redrawMustSeeBoundsOverlay();
        this.eventBus?.emit("layout:gamescene:debugVisibility", { enabled: this.layoutDebugEnabled });
      },

    redrawMustSeeBoundsOverlay() {
        if (!this.mustSeeDebugGraphics) {
          return;
        }
    
        this.mustSeeDebugGraphics.clear();
        if (!this.layoutDebugEnabled) {
          return;
        }
    
        const mustSeeBounds = this.layoutSnapshot?.mustSeeBounds || this.getLayoutContentBounds().mustSeeBounds;
        this.mustSeeDebugGraphics.lineStyle(3, 0xff2d2d, 0.95);
        this.mustSeeDebugGraphics.strokeRect(
          mustSeeBounds.x,
          mustSeeBounds.y,
          mustSeeBounds.width,
          mustSeeBounds.height
        );
      },

    applyLayoutSnapshot() {
        const camera = this.cameras?.main;
        if (!camera) {
          return;
        }
    
        const fallbackRect = {
          x: 0,
          y: 0,
          width: this.scale.width,
          height: this.scale.height
        };
        const rawRect = this.layoutSnapshot?.gameRect || fallbackRect;
        const mustSeeBounds = this.layoutSnapshot?.mustSeeBounds || this.getLayoutContentBounds().mustSeeBounds;
        const rect = {
          x: rawRect.x,
          y: rawRect.y,
          width: Math.max(1, rawRect.width),
          height: Math.max(1, rawRect.height)
        };
    
        const gameW = Math.max(1, rect.width);
        const gameH = Math.max(1, rect.height);
        const zoomX = gameW / mustSeeBounds.width;
        const zoomY = gameH / mustSeeBounds.height;
        const zoom = Math.max(0.01, Math.min(zoomX, zoomY));
    
        const screenW = this.scale.width;
        const screenH = this.scale.height;
        const msCenterX = mustSeeBounds.x + mustSeeBounds.width / 2;
        const msCenterY = mustSeeBounds.y + mustSeeBounds.height / 2;
        const gameRectCenterX = rect.x + gameW / 2;
        const gameRectCenterY = rect.y + gameH / 2;
        const scrollX = msCenterX - screenW / 2 - (gameRectCenterX - screenW / 2) / zoom;
        const scrollY = msCenterY - screenH / 2 - (gameRectCenterY - screenH / 2) / zoom;
    
        camera.setViewport(0, 0, screenW, screenH);
        camera.setZoom(zoom);
        camera.setScroll(scrollX, scrollY);
        camera.setRoundPixels(false);
    
        this.eventBus?.emit("layout:gamescene:cameraRect", {
          x: rect.x,
          y: rect.y,
          width: gameW,
          height: gameH
        });
    
        const projW = mustSeeBounds.width * zoom;
        const projH = mustSeeBounds.height * zoom;
        const projectedMustSeeRect = {
          x: gameRectCenterX - projW / 2,
          y: gameRectCenterY - projH / 2,
          width: projW,
          height: projH
        };
        this.eventBus?.emit("layout:gamescene:mustSeeRect", projectedMustSeeRect);
        this.redrawMustSeeBoundsOverlay();
        this.applySceneBackgroundLayout?.();
        this.createOrUpdateSymbolSpawnCurtain?.();
      },

    emitRoundStarted() {
        this.eventBus?.emit("render:roundStarted");
      },

    emitRoundEnded() {
        this.eventBus?.emit("render:roundEnded");
      },

    emitOutcomeRevealed() {
        this.eventBus?.emit("render:outcomeRevealed");
      }
  };
}
