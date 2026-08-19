export function createGameSceneSymbolMaskMethods(deps = {}) {
  const {
    Phaser,
    clientConfig,
    gameClientConfig,
    GRID_OFFSET_Y,
    getReelSymbolRenderable
  } = deps;

  const smoothstep = (value) => {
    const t = Phaser.Math.Clamp(Number(value) || 0, 0, 1);
    return t * t * (3 - 2 * t);
  };

  const getSymbolSpawnCurtainConfig = () => {
    const legacy = gameClientConfig?.layout?.symbolGridMask || {};
    const configured = gameClientConfig?.layout?.symbolSpawnCurtain || {};
    const defaults = {
      enabled: true,
      fadeHeightPx: 48,
      offscreenOffset: 2,
      extendToScreenTop: true,
      extendToScreenBottom: true,
      topPaddingPx: 8,
      bottomPaddingPx: 8,
      slideOutDistancePx: 500
    };
    return {
      ...defaults,
      ...legacy,
      ...configured,
      enabled: configured.enabled ?? legacy.enabled ?? defaults.enabled
    };
  };

  const resolveDownwardSpawnY = (from, cellSize, offscreenOffset) => {
    const gridHeight = clientConfig.area.height;
    const clampedRow = Math.min(from, gridHeight + offscreenOffset);
    const y = (gridHeight - 1 - clampedRow) * cellSize + cellSize / 2 + GRID_OFFSET_Y;
    return Math.min(y, -cellSize);
  };

  const resolveUpwardExitY = (from, cellSize, offscreenOffset) => {
    const gridHeight = clientConfig.area.height;
    const clampedRow = Math.max(from, -offscreenOffset);
    return (gridHeight - 1 - clampedRow) * cellSize + cellSize / 2 + GRID_OFFSET_Y;
  };

  return {
    getSymbolSpawnCurtainConfig,

    isSymbolSpawnCurtainEnabled() {
      return getSymbolSpawnCurtainConfig().enabled === true && this.isInBonusMode !== true;
    },

    getSymbolSpawnScreenTopY() {
      const cfg = getSymbolSpawnCurtainConfig();
      if (cfg.extendToScreenTop === false) {
        return null;
      }
      return Number(this.layoutSnapshot?.mustSeeBounds?.y
        ?? gameClientConfig?.layout?.mustSeeBounds?.y
        ?? 0);
    },

    getSymbolSpawnScreenBottomY() {
      const cfg = getSymbolSpawnCurtainConfig();
      if (cfg.extendToScreenBottom === false) {
        return null;
      }
      const mustSeeBounds = this.layoutSnapshot?.mustSeeBounds
        ?? gameClientConfig?.layout?.mustSeeBounds
        ?? { y: 0, height: clientConfig.area.height * 70 + GRID_OFFSET_Y };
      return Number(mustSeeBounds.y || 0) + Number(mustSeeBounds.height || 0);
    },

    getSymbolSpawnHiddenTopY(cellSize = 70) {
      const cfg = getSymbolSpawnCurtainConfig();
      const offscreenOffset = Math.max(0, Number(cfg.offscreenOffset ?? 2));
      const gridHeight = clientConfig.area.height;
      const spawnCandidates = [
        resolveDownwardSpawnY(gridHeight + offscreenOffset, cellSize, offscreenOffset),
        resolveDownwardSpawnY(gridHeight + 1, cellSize, offscreenOffset),
        resolveDownwardSpawnY(gridHeight + offscreenOffset + 1, cellSize, offscreenOffset)
      ];
      let hiddenTopY = Math.min(...spawnCandidates);

      const screenTopY = this.getSymbolSpawnScreenTopY();
      if (Number.isFinite(screenTopY)) {
        hiddenTopY = Math.min(hiddenTopY, screenTopY);
      }

      const topPadding = Math.max(0, Number(cfg.topPaddingPx ?? 0));
      return hiddenTopY - topPadding;
    },

    getSymbolSpawnHiddenBottomY(cellSize = 70) {
      const cfg = getSymbolSpawnCurtainConfig();
      const offscreenOffset = Math.max(0, Number(cfg.offscreenOffset ?? 2));
      const gridHeight = clientConfig.area.height;
      const boardBottom = GRID_OFFSET_Y + gridHeight * cellSize;
      const bottomRowY = (gridHeight - 1) * cellSize + cellSize / 2 + GRID_OFFSET_Y;
      const slideDistance = Math.max(cellSize, Number(cfg.slideOutDistancePx ?? 500));

      const exitCandidates = [
        bottomRowY + slideDistance,
        boardBottom + cellSize * offscreenOffset,
        resolveUpwardExitY(-offscreenOffset, cellSize, offscreenOffset),
        resolveUpwardExitY(-1, cellSize, offscreenOffset)
      ];
      let hiddenBottomY = Math.max(...exitCandidates);

      const screenBottomY = this.getSymbolSpawnScreenBottomY();
      if (Number.isFinite(screenBottomY)) {
        hiddenBottomY = Math.max(hiddenBottomY, screenBottomY);
      }

      const bottomPadding = Math.max(0, Number(cfg.bottomPaddingPx ?? 0));
      return hiddenBottomY + bottomPadding;
    },

    getSymbolSpawnFadeBounds(cellSize = 70) {
      const cfg = getSymbolSpawnCurtainConfig();
      const gridHeight = clientConfig.area.height;
      const boardTop = GRID_OFFSET_Y;
      const boardBottom = GRID_OFFSET_Y + gridHeight * cellSize;
      const fadeHeight = Math.max(1, Number(cfg.fadeHeightPx) || 48);
      const fadeStartTop = boardTop - fadeHeight;
      const fadeEndBottom = boardBottom + fadeHeight;

      return {
        boardTop,
        boardBottom,
        fadeStartTop,
        fadeEndBottom,
        fadeHeight,
        hiddenTopY: this.getSymbolSpawnHiddenTopY(cellSize),
        hiddenBottomY: this.getSymbolSpawnHiddenBottomY(cellSize)
      };
    },

    getSymbolSpawnTopFadeAlpha(y, cellSize = 70) {
      const { boardTop, fadeStartTop, hiddenTopY } = this.getSymbolSpawnFadeBounds(cellSize);

      if (y >= boardTop) {
        return 1;
      }
      if (y <= hiddenTopY || y <= fadeStartTop) {
        return 0;
      }
      return smoothstep((y - fadeStartTop) / (boardTop - fadeStartTop));
    },

    getSymbolSpawnBottomFadeAlpha(y, cellSize = 70) {
      const { boardBottom, fadeEndBottom, hiddenBottomY, fadeHeight } = this.getSymbolSpawnFadeBounds(cellSize);

      if (y <= boardBottom) {
        return 1;
      }
      if (y >= hiddenBottomY || y >= fadeEndBottom) {
        return 0;
      }
      return 1 - smoothstep((y - boardBottom) / fadeHeight);
    },

    getSymbolSpawnFadeAlpha(y, cellSize = 70) {
      const topAlpha = this.getSymbolSpawnTopFadeAlpha(y, cellSize);
      const bottomAlpha = this.getSymbolSpawnBottomFadeAlpha(y, cellSize);
      return Math.min(topAlpha, bottomAlpha);
    },

    applySymbolSpawnFadeToCell(cell) {
      if (!cell || cell.destroyed) {
        return 1;
      }

      if (!this.isSymbolSpawnCurtainEnabled()) {
        return cell.alpha ?? 1;
      }

      const alpha = this.getSymbolSpawnFadeAlpha(cell.y);
      cell.setAlpha(alpha);
      cell.setVisible(alpha > 0.02);

      const renderable = getReelSymbolRenderable(cell);
      if (renderable && renderable !== cell && !renderable.destroyed) {
        renderable.setAlpha(alpha);
        renderable.setVisible(alpha > 0.02);
      }

      if (cell.symbolBackdrop && !cell.symbolBackdrop.destroyed) {
        cell.symbolBackdrop.setAlpha(alpha);
        cell.symbolBackdrop.setVisible(alpha > 0.02);
      }

      return alpha;
    },

    refreshSymbolSpawnFadeTargets() {
      if (!this.isSymbolSpawnCurtainEnabled() || !this.reelSprites) {
        return;
      }

      const visited = new Set();
      for (let reel = 0; reel < this.reelSprites.length; reel++) {
        const column = this.reelSprites[reel];
        if (!column) continue;
        for (let row = 0; row < column.length; row++) {
          const cell = column[row];
          if (!cell || cell.destroyed || visited.has(cell)) continue;
          visited.add(cell);
          this.applySymbolSpawnFadeToCell(cell);
        }
      }
    },

    clearSymbolSpawnCurtain() {
      if (this._symbolSpawnCurtainSprite && !this._symbolSpawnCurtainSprite.destroyed) {
        this._symbolSpawnCurtainSprite.destroy();
      }
      this._symbolSpawnCurtainSprite = null;
    },

    ensureSymbolSpawnFadeWatcher() {
      if (this._symbolSpawnFadeWatcher) {
        return;
      }

      this._symbolSpawnFadeWatcher = () => {
        if (!this.isSymbolSpawnCurtainEnabled()) {
          return;
        }
        this.refreshSymbolSpawnFadeTargets();
      };
      this.events.on("postupdate", this._symbolSpawnFadeWatcher);
    },

    removeSymbolSpawnFadeWatcher() {
      if (!this._symbolSpawnFadeWatcher) {
        return;
      }
      this.events.off("postupdate", this._symbolSpawnFadeWatcher);
      this._symbolSpawnFadeWatcher = null;
    },

    createOrUpdateSymbolSpawnCurtain() {
      this.clearSymbolSpawnCurtain();

      if (!this.isSymbolSpawnCurtainEnabled()) {
        return null;
      }

      this.ensureSymbolSpawnFadeWatcher();
      this.refreshSymbolSpawnFadeTargets();
      return null;
    },

    /** @deprecated use createOrUpdateSymbolSpawnCurtain */
    createOrUpdateSymbolGridMask() {
      return this.createOrUpdateSymbolSpawnCurtain();
    }
  };
}
