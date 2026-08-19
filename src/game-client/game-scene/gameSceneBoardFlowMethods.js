export function createGameSceneBoardFlowMethods(deps = {}) {
  const {
    BANANA_SYMBOL_IDS,
    DEBUG_BANANA_GRAVITY,
    DEPTH_BANANAS,
    DEPTH_HERO,
    DEPTH_SYMBOLS,
    GRID_OFFSET_X,
    GRID_OFFSET_Y,
    HERO_STAGE_INTENSITY_TEXTURE_KEYS,
    HERO_STAGE_TEXTURE_KEYS,
    Phaser,
    WIN_HIGHLIGHT_DURATION_MS,
    WIN_HIGHLIGHT_INTENSITY_BLINKS,
    WIN_HIGHLIGHT_INTENSITY_TEXTURE_KEYS,
    clientConfig,
    getBoardSymbolDepth,
    getHeroScaleForFootprint,
    getHeroTexture,
    getReelSymbolRenderable,
    getSymbolScale,
    isBanana,
    isPartOfTroll3x3,
    normalScale,
    normalizeSymbolKey,
    resolveSymbolId
  } = deps;

  return {
    clearSymbols() {
        if (!this.symbolsGroup) return;
        this.symbolsGroup.clear(true, true); // remove all sprites
      },

    getHeroStartingPosition() {
        return clientConfig.heroStartingPosition || { reel: 4, row: 2 };
      },

    isHeroAtStartingPosition(heroPosition = null) {
        if (!heroPosition || !Number.isFinite(Number(heroPosition.reel)) || !Number.isFinite(Number(heroPosition.row))) {
          return true;
        }
        const startingPos = this.getHeroStartingPosition();
        return (
          Math.floor(Number(heroPosition.reel)) === Math.floor(Number(startingPos.reel)) &&
          Math.floor(Number(heroPosition.row)) === Math.floor(Number(startingPos.row))
        );
      },

    getMainGameActiveWildPositions(gameState = {}) {
        const heroPosition = gameState?.heroPosition || null;
        if (this.isHeroAtStartingPosition(heroPosition)) {
          return null;
        }
        const footprintSize = Math.max(1, Math.floor(Number(gameState?.heroFootprintSize) || 1));
        const cells = [];
        for (let reelOffset = 0; reelOffset < footprintSize; reelOffset++) {
          for (let rowOffset = 0; rowOffset < footprintSize; rowOffset++) {
            cells.push({
              reel: Math.floor(Number(heroPosition.reel)) + reelOffset,
              row: Math.floor(Number(heroPosition.row)) + rowOffset
            });
          }
        }
        return cells;
      },

    getHeroWildActiveBadgeText(strength = null) {
        const currentAction = String(this.currentAction || "");
        const angelMultiplierDisplay = Number(this.currentHeroAngelMultiplierDisplay);
        if (
          (currentAction === "spin" || currentAction === "respin" || currentAction === "bananaHunt") &&
          Number.isFinite(angelMultiplierDisplay) &&
          angelMultiplierDisplay >= 1
        ) {
          return `${Math.max(1, Math.floor(angelMultiplierDisplay))}x`;
        }

        const parsedStrength = Number(strength ?? this.currentMonkeyWildStrength ?? 1);
        const displayStrength = Number.isFinite(parsedStrength)
          ? Math.max(1, Math.floor(parsedStrength))
          : 1;
        const footprintSize = Math.max(1, Math.floor(Number(this.currentHeroFootprintSize) || 1));
        const canShowStrengthPrefix = this.currentAction === "freespinbananaHunt";
        return !canShowStrengthPrefix || footprintSize > 1 || displayStrength <= 1
          ? "W"
          : `${displayStrength}W`;
      },

    shouldShowHeroWildBadgeForCurrentAction() {
        const action = String(this.currentAction || "");
        return action === "spin" || action === "respin" || action === "bananaHunt";
      },

    shouldPersistHeroWildActiveBadge() {
        const action = String(this.currentAction || "");
        if (action !== "spin" && action !== "respin" && action !== "bananaHunt") {
          return false;
        }
        const angelMultiplierDisplay = Number(this.currentHeroAngelMultiplierDisplay);
        return Number.isFinite(angelMultiplierDisplay) && angelMultiplierDisplay >= 1;
      },

    setHeroAngelMultiplierDisplay(value = null, options = {}) {
        const { showBadge = false, pulse = false, clearBadge = false } = options;
        const parsedValue = Number(value);
        this.currentHeroAngelMultiplierDisplay = Number.isFinite(parsedValue) && parsedValue >= 1
          ? Math.max(1, Math.floor(parsedValue))
          : null;
        this.heroWildActiveBadgeText = this.getHeroWildActiveBadgeText();

        if (this.currentHeroAngelMultiplierDisplay === null) {
          if (clearBadge) {
            this.clearHeroWildActiveBadge({ force: true });
          } else if (this.heroWildActiveBadge && !this.heroWildActiveBadge.destroyed) {
            this.heroWildActiveBadge.setText(this.heroWildActiveBadgeText || "W");
          }
          return this.currentHeroAngelMultiplierDisplay;
        }

        if (showBadge) {
          this.showHeroWildActiveBadge();
          if (pulse && this.heroWildActiveBadge && !this.heroWildActiveBadge.destroyed) {
            this.tweens.killTweensOf(this.heroWildActiveBadge);
            this.heroWildActiveBadge.setScale(0.9);
            this.tweens.add({
              targets: this.heroWildActiveBadge,
              scale: 1.12,
              duration: 140,
              yoyo: true,
              ease: 'Sine.easeOut'
            });
          }
        } else if (this.heroWildActiveBadge && !this.heroWildActiveBadge.destroyed) {
          this.heroWildActiveBadge.setText(this.heroWildActiveBadgeText || "W");
        }

        return this.currentHeroAngelMultiplierDisplay;
      },

    showHeroWildActiveBadge() {
        if (!this.shouldShowHeroWildBadgeForCurrentAction()) return;
        if (!this.heroSprite || this.heroSprite.destroyed) return;
    
        this.heroWildActiveBadgeText = this.getHeroWildActiveBadgeText();
    
        if (!this.heroWildActiveBadge || this.heroWildActiveBadge.destroyed) {
          this.heroWildActiveBadge = this.add.text(this.heroSprite.x, this.heroSprite.y, this.heroWildActiveBadgeText || "W", {
            fontSize: "32px",
            fontFamily: '"Cinzel", "Times New Roman", serif',
            fontStyle: "bold",
            color: "#FFF7C2",
            stroke: "#2F230D",
            strokeThickness: 6
          })
            .setOrigin(0.5)
            .setDepth(DEPTH_HERO + 7);
          this.heroWildActiveBadge.setShadow(0, 2, "#000000", 4, true, true);
        }
    
        this.heroWildActiveBadge.setText(this.heroWildActiveBadgeText || "W");
        this.heroWildActiveBadge.setVisible(true);
        this.heroWildActiveBadge.setPosition(this.heroSprite.x, this.heroSprite.y);
        this.heroWildActiveBadge.setAlpha(this.heroSprite.alpha ?? 1);
        this.tweens.killTweensOf(this.heroWildActiveBadge);
        this.heroWildActiveBadge.setScale(0.92);
        this.tweens.add({
          targets: this.heroWildActiveBadge,
          scale: 1.08,
          duration: 120,
          yoyo: true,
          ease: 'Sine.easeOut'
        });
    
        if (!this.heroWildActiveBadgeFollow) {
          this.heroWildActiveBadgeFollow = () => {
            if (!this.heroWildActiveBadge || this.heroWildActiveBadge.destroyed) return;
            if (!this.heroSprite || this.heroSprite.destroyed) return;
            this.heroWildActiveBadge.setPosition(this.heroSprite.x, this.heroSprite.y);
            this.heroWildActiveBadge.setAlpha(this.heroSprite.alpha ?? 1);
          };
          this.events.on('postupdate', this.heroWildActiveBadgeFollow);
        }
      },

    clearHeroWildActiveBadge(options = {}) {
        const { lingerMs = 0, leaveShadow = false, force = false } = options;
        const activeBadge = this.heroWildActiveBadge;
        if (leaveShadow && activeBadge && !activeBadge.destroyed) {
          const duration = Math.max(120, Number(lingerMs) || 500);
          const afterimage = this.add.text(activeBadge.x, activeBadge.y + 2, activeBadge.text || "W", {
            fontSize: "34px",
            fontFamily: '"Cinzel", "Times New Roman", serif',
            fontStyle: "bold",
            color: "#241706",
            stroke: "#FFD874",
            strokeThickness: 3
          })
            .setOrigin(0.5)
            .setScale(Math.max(activeBadge.scaleX || 1, activeBadge.scaleY || 1))
            .setAlpha(0.42)
            .setDepth(DEPTH_HERO + 5);
          afterimage.setShadow(0, 3, "#000000", 6, true, true);
          this.tweens.add({
            targets: afterimage,
            alpha: 0,
            scale: afterimage.scaleX * 1.2,
            y: afterimage.y + 8,
            duration,
            ease: 'Sine.easeOut',
            onComplete: () => afterimage.destroy()
          });
        }

        if (!force && this.shouldPersistHeroWildActiveBadge()) {
          if (activeBadge && !activeBadge.destroyed) {
            activeBadge.setText(this.heroWildActiveBadgeText || "W");
            activeBadge.setVisible(true);
            activeBadge.setAlpha(this.heroSprite?.alpha ?? 1);
          } else {
            this.showHeroWildActiveBadge();
          }
          return;
        }
    
        if (this.heroWildActiveBadgeFollow) {
          this.events.off('postupdate', this.heroWildActiveBadgeFollow);
          this.heroWildActiveBadgeFollow = null;
        }
        if (this.heroWildActiveBadge && !this.heroWildActiveBadge.destroyed) {
          this.tweens.killTweensOf(this.heroWildActiveBadge);
          this.heroWildActiveBadge.destroy();
        }
        this.heroWildActiveBadge = null;
      },

    updateMonkeyWildStrengthBadge(strength = 1) {
        const parsedStrength = Number(strength);
        this.currentMonkeyWildStrength = Number.isFinite(parsedStrength)
          ? Math.max(1, Math.floor(parsedStrength))
          : 1;
        this.heroWildActiveBadgeText = this.getHeroWildActiveBadgeText(this.currentMonkeyWildStrength);
    
        if (this.heroWildActiveBadge && !this.heroWildActiveBadge.destroyed) {
          this.heroWildActiveBadge.setText(this.heroWildActiveBadgeText);
        }
        this.clearMonkeyWildStrengthBadge();
      },

    clearMonkeyWildStrengthBadge() {
        if (this.monkeyWildStrengthBadgeFollow) {
          this.events.off('postupdate', this.monkeyWildStrengthBadgeFollow);
          this.monkeyWildStrengthBadgeFollow = null;
        }
        if (this.monkeyWildStrengthBadge && !this.monkeyWildStrengthBadge.destroyed) {
          this.monkeyWildStrengthBadge.destroy();
        }
        this.monkeyWildStrengthBadge = null;
      },

    getMonkeyWildStrengthByMeterLevel(rawLevel = 0, options = {}) {
        const { useMainGameOverride = false } = options;
        const overrideStrength = Number(clientConfig.monkeyWildStrengthOverrideMain);
        if (useMainGameOverride && Number.isFinite(overrideStrength) && overrideStrength >= 1) {
          return Math.max(1, Math.floor(overrideStrength));
        }
    
        const level = Math.max(0, Math.floor(Number(rawLevel) || 0));
        // Match meter milestones:
        // 10 bananas -> +1W (x2), 15 bananas -> +1W (x3).
        // 20/25/30 are form milestones (T/TK/TK+), not extra wild-strength bumps.
        if (level >= 2) return 3;
        if (level >= 1) return 2;
        return 1;
      },

    isBananaSymbolKey(symbol) {
        const n = Number(symbol);
        if (!Number.isFinite(n)) return false;
        return BANANA_SYMBOL_IDS.includes(n);
      },

    getClusterCheckSymbol(reel, row, activeWildKeys = null) {
        if (reel < 0 || reel >= clientConfig.area.width || row < 0 || row >= clientConfig.area.height) {
          return null;
        }
    
        const heroId = clientConfig.symbolsMapping?.hero || 10;
        if (activeWildKeys?.has?.(`${reel},${row}`)) {
          return heroId;
        }
    
        const sprite = this.reelSprites?.[reel]?.[row];
        if (!sprite || sprite.destroyed) return 0;
    
        const parsed = Number(sprite.symbolKey);
        return Number.isFinite(parsed) ? parsed : sprite.symbolKey;
      },

    collectBananaCheckClusters(bananaPosition, bananaMeterLevel = 0, activeWildPositions = null) {
        if (!bananaPosition) return [];
    
        const paytable = clientConfig.paytable || {};
        const minSize = clientConfig.minClusterSize || 4;
        const heroId = clientConfig.symbolsMapping?.hero || 10;
        const mysteryWildId = clientConfig.symbolsMapping?.mysteryWild || 15;
        const key = (reel, row) => `${reel},${row}`;
        const activeWildCells = Array.isArray(activeWildPositions) && activeWildPositions.length > 0
          ? activeWildPositions
          : [bananaPosition];
        const activeWildKeys = new Set(activeWildCells.map((cell) => key(cell.reel, cell.row)));
        const wildStrength = this.getMonkeyWildStrengthByMeterLevel(bananaMeterLevel, {
          useMainGameOverride: this.currentAction === "bananaHunt"
        });
        const getNeighbors = (reel, row) => ([
          { reel: reel - 1, row },
          { reel: reel + 1, row },
          { reel, row: row - 1 },
          { reel, row: row + 1 }
        ]);
        const isPayingSymbol = (symbol) =>
          symbol !== null &&
          symbol !== undefined &&
          symbol !== 0 &&
          symbol !== "HOUSE" &&
          Object.prototype.hasOwnProperty.call(paytable, String(symbol));
    
        const starts = new Map();
        activeWildCells.forEach((wildCell) => {
          getNeighbors(wildCell.reel, wildCell.row).forEach((pos) => {
            const symbol = this.getClusterCheckSymbol(pos.reel, pos.row, activeWildKeys);
            if (!isPayingSymbol(symbol)) return;
            starts.set(key(pos.reel, pos.row), { reel: pos.reel, row: pos.row, symbol });
          });
        });
    
        const seenClusterKeys = new Set();
        const clusters = [];
    
        const floodFill = (start, targetSymbol) => {
          const queue = [start];
          const localVisited = new Set();
          const positions = [];
    
          while (queue.length > 0) {
            const current = queue.shift();
            const posKey = key(current.reel, current.row);
            if (localVisited.has(posKey)) continue;
            localVisited.add(posKey);
    
            const symbol = this.getClusterCheckSymbol(current.reel, current.row, activeWildKeys);
            if (
              symbol === null ||
              symbol === undefined ||
              symbol === 0 ||
              symbol === "HOUSE" ||
              this.isBananaSymbolKey(symbol)
            ) {
              continue;
            }
    
            if (symbol !== targetSymbol && !activeWildKeys.has(posKey) && symbol !== mysteryWildId) {
              continue;
            }
    
            positions.push({ reel: current.reel, row: current.row, symbol });
            queue.push(...getNeighbors(current.reel, current.row));
          }
    
          return positions;
        };
    
        starts.forEach((start) => {
          const positions = floodFill({ reel: start.reel, row: start.row }, start.symbol);
          if (!positions.length) return;
    
          const clusterKey = `${start.symbol}|${positions
            .map((p) => key(p.reel, p.row))
            .sort()
            .join(";")}`;
          if (seenClusterKeys.has(clusterKey)) return;
          seenClusterKeys.add(clusterKey);
    
          const heroWildCount = positions.filter((p) => activeWildKeys.has(key(p.reel, p.row))).length;
          const effectiveSize = positions.length + heroWildCount * Math.max(0, wildStrength - 1);
          if (effectiveSize < minSize) return;
    
          clusters.push({
            symbol: start.symbol,
            size: positions.length,
            effectiveSize,
            heroWildCount,
            positions
          });
        });
    
        return clusters;
      },

    async explodeBananaCheckClusters(bananaPosition, bananaMeterLevel = 0) {
        return this.resolveBananaImpactClusters(
          bananaPosition,
          bananaMeterLevel,
          {
            waitForFastForward: false,
            fallbackAutoExplodeMs: 0
          }
        );
      },

    async resolveBananaImpactClusters(
        bananaPosition,
        bananaMeterLevel = 0,
        {
          precomputedClusters = null,
          activeWildPositions = null,
          waitForFastForward = true,
          fallbackAutoExplodeMs = 1400,
          noClusterSlowMoMs = 220,
          clusterSlowMoMs = 760
        } = {}
      ) {
        const clusters = Array.isArray(precomputedClusters)
          ? precomputedClusters
          : this.collectBananaCheckClusters(bananaPosition, bananaMeterLevel, activeWildPositions);
        const hasClusters = clusters.length > 0;
        const collectIntoBonusPile = this.currentAction === "freespinbananaHunt";
    
        this.showHeroWildActiveBadge();
        try {
          // Legacy option names are kept, but banana impacts no longer time-scale the scene.
          const impactWindowMs = hasClusters ? Number(clusterSlowMoMs) : Number(noClusterSlowMoMs);
          const hasImpactWindow = Number.isFinite(impactWindowMs) && impactWindowMs > 0;
    
          if (!hasClusters) {
            if (hasImpactWindow) {
              // Small hold so non-cluster banana hits still feel impactful.
              await this.waitForPresentation(Math.max(90, Math.min(260, impactWindowMs)), { skippable: true });
            }
            return false;
          }
    
          if (collectIntoBonusPile) {
            await this.collectBonusClusterFruits(clusters, {
              playHighlight: hasImpactWindow,
              highlightDuration: hasImpactWindow ? WIN_HIGHLIGHT_DURATION_MS : 0,
              activeWildPositions
            });
            return true;
          }
    
          // Start highlight immediately when an impact presentation window is active.
          const highlightDuration = waitForFastForward
            ? Math.max(5000, Number(fallbackAutoExplodeMs) + 2500)
            : (hasImpactWindow ? Math.max(360, impactWindowMs) : 0);
          const highlightPromise = this.highlightClusters(clusters, highlightDuration, {
            showWinLabels: false,
            activeWildPositions
          });
    
          if (!waitForFastForward) {
            await highlightPromise;
            await this.explodeSymbols(clusters);
            return true;
          }
    
          const baselineSerial = this._fastForwardRequestSerial || 0;
          await this.waitForFastForwardRequest({
            timeoutMs: Math.max(0, Number(fallbackAutoExplodeMs) || 0),
            sinceSerial: baselineSerial
          });
          this.skipHighlightPhase();
          await highlightPromise;
          await this.explodeSymbols(clusters);
          return true;
        } finally {
          this.clearHeroWildActiveBadge({
            lingerMs: 500,
            leaveShadow: hasClusters
          });
        }
      },

    getWinHighlightIntensityTextureKey(symbol = null) {
        const heroId = resolveSymbolId(clientConfig.symbolsMapping?.hero, 10);
        const normalizedSymbol = Math.floor(Number(symbol));
        if (Number.isFinite(normalizedSymbol) && normalizedSymbol === heroId) {
          const heroTextureKey = this.currentHeroTextureKey || HERO_STAGE_TEXTURE_KEYS.base;
          return HERO_STAGE_INTENSITY_TEXTURE_KEYS[heroTextureKey] || HERO_STAGE_INTENSITY_TEXTURE_KEYS[HERO_STAGE_TEXTURE_KEYS.base];
        }
        if (Number.isFinite(normalizedSymbol)) {
          const orbIntensityTextureKey = this.getBonusMultiplierFruitOrbIntensityTextureKey(normalizedSymbol);
          if (orbIntensityTextureKey) return orbIntensityTextureKey;
          return WIN_HIGHLIGHT_INTENSITY_TEXTURE_KEYS[normalizedSymbol] || null;
        }
        const rawKey = String(symbol || "");
        return HERO_STAGE_INTENSITY_TEXTURE_KEYS[rawKey] || null;
      },

    createWinHighlightIntensityOverlay(pos = null, cluster = null, blinkHalfMs = 90, options = {}) {
        if (!pos || !Number.isFinite(Number(pos.reel)) || !Number.isFinite(Number(pos.row))) {
          return null;
        }
    
        const { forceHero = false, noScalePop = false } = options;
        const heroId = resolveSymbolId(clientConfig.symbolsMapping?.hero, 10);
        const symbol = forceHero || pos.isHeroWild === true
          ? heroId
          : (pos.symbol ?? cluster?.symbol);
        const normalizedSymbol = Math.floor(Number(symbol));
        const isHeroWild = forceHero || pos.isHeroWild === true || (Number.isFinite(normalizedSymbol) && normalizedSymbol === heroId);
        const textureKey = this.getWinHighlightIntensityTextureKey(isHeroWild ? heroId : symbol);
        if (!textureKey || !this.textures?.exists?.(textureKey)) {
          return null;
        }
    
        const cellSize = 70;
        const fallbackX = Number(pos.reel) * cellSize + cellSize / 2 + GRID_OFFSET_X;
        const fallbackY = (clientConfig.area.height - 1 - Number(pos.row)) * cellSize + cellSize / 2 + GRID_OFFSET_Y;
        const source = isHeroWild
          ? this.heroSprite
          : getReelSymbolRenderable(this.reelSprites?.[pos.reel]?.[pos.row]);
        if (isHeroWild && (!source || source.destroyed)) {
          return null;
        }
    
        const worldMatrix = source && typeof source.getWorldTransformMatrix === "function"
          ? source.getWorldTransformMatrix()
          : null;
        const x = worldMatrix && Number.isFinite(Number(worldMatrix.tx))
          ? worldMatrix.tx
          : (Number.isFinite(Number(source?.x)) ? Number(source.x) : fallbackX);
        const y = worldMatrix && Number.isFinite(Number(worldMatrix.ty))
          ? worldMatrix.ty
          : (Number.isFinite(Number(source?.y)) ? Number(source.y) : fallbackY);
        const baseScaleX = Number.isFinite(Number(source?.scaleX))
          ? Number(source.scaleX)
          : (Number.isFinite(normalizedSymbol) ? getSymbolScale(normalizedSymbol) : 1);
        const baseScaleY = Number.isFinite(Number(source?.scaleY))
          ? Number(source.scaleY)
          : (Number.isFinite(normalizedSymbol) ? getSymbolScale(normalizedSymbol) : 1);
        const depth = isHeroWild
          ? (Number(source?.depth) || DEPTH_HERO) + 0.7
          : Math.max(DEPTH_SYMBOLS + 0.8, (Number(source?.depth) || getBoardSymbolDepth(normalizedSymbol)) + 0.7);
        const sourceDisplayWidth = Number(source?.displayWidth);
        const sourceDisplayHeight = Number(source?.displayHeight);
    
        const overlay = this.add.image(x, y, textureKey)
          .setOrigin(source?.originX ?? 0.5, source?.originY ?? 0.5)
          .setRotation(Number(source?.rotation) || 0)
          .setDepth(depth)
          .setAlpha(0);
        const overlayScaleX = Number.isFinite(sourceDisplayWidth) && sourceDisplayWidth > 0 && overlay.width > 0
          ? sourceDisplayWidth / overlay.width
          : baseScaleX;
        const overlayScaleY = Number.isFinite(sourceDisplayHeight) && sourceDisplayHeight > 0 && overlay.height > 0
          ? sourceDisplayHeight / overlay.height
          : baseScaleY;
        overlay.setScale(overlayScaleX, overlayScaleY);
    
        if (typeof overlay.setFlipX === "function") {
          overlay.setFlipX(Boolean(source?.flipX));
        }
        if (typeof overlay.setFlipY === "function") {
          overlay.setFlipY(Boolean(source?.flipY));
        }
    
        const overlayPeakAlpha = isHeroWild ? 0.68 : 0.74;

        const tweenConfig = {
          targets: overlay,
          alpha: { from: 0, to: overlayPeakAlpha },
          duration: blinkHalfMs,
          ease: "Sine.easeInOut"
        };
        if (!noScalePop && !isHeroWild) {
          tweenConfig.scaleX = overlayScaleX * 1.05;
          tweenConfig.scaleY = overlayScaleY * 1.05;
        }
        const overlayTween = this.tweens.add(tweenConfig);

      return {
          overlay,
          cleanup: () => {
            if (overlayTween) {
              overlayTween.stop();
            }
            if (overlay && !overlay.destroyed) {
              overlay.destroy();
            }
          }
        };
      },

    getClusterAngelMultiplierBadgeValue(cluster = null) {
        const explicitMultiplier = Math.floor(Number(
          cluster?.angelMultiplierDisplay ??
          cluster?.angelMultiplierApplied ??
          cluster?.heroAngelMultiplier
        ));
        if (Number.isFinite(explicitMultiplier) && explicitMultiplier > 1) {
          return explicitMultiplier;
        }

        const heroWildCount = Math.max(0, Math.floor(Number(cluster?.heroWildCount) || 0));
        const clusterMultiplier = Math.floor(Number(cluster?.multiplier));
        if (heroWildCount > 0 && Number.isFinite(clusterMultiplier) && clusterMultiplier > 1) {
          return clusterMultiplier;
        }

        return null;
      },

    createClusterAngelMultiplierBadge(pos = null, multiplier = null, blinkHalfMs = 180) {
        const resolvedMultiplier = Math.max(0, Math.floor(Number(multiplier) || 0));
        if (!pos || resolvedMultiplier <= 1) {
          return null;
        }

        const source = getReelSymbolRenderable(this.reelSprites?.[pos.reel]?.[pos.row]);
        if (!source || source.destroyed) {
          return null;
        }

        const worldMatrix = typeof source.getWorldTransformMatrix === "function"
          ? source.getWorldTransformMatrix()
          : null;
        const fallbackCenter = this.getGridCellCenter(pos.reel, pos.row);
        const x = worldMatrix && Number.isFinite(Number(worldMatrix.tx))
          ? Number(worldMatrix.tx)
          : (Number.isFinite(Number(source?.x)) ? Number(source.x) : fallbackCenter.x);
        const y = worldMatrix && Number.isFinite(Number(worldMatrix.ty))
          ? Number(worldMatrix.ty)
          : (Number.isFinite(Number(source?.y)) ? Number(source.y) : fallbackCenter.y);
        const depth = Math.max(
          DEPTH_SYMBOLS + 1.6,
          (Number(source?.depth) || getBoardSymbolDepth(this.getDisplayObjectSymbolId?.(source))) + 1.4
        );

        const badge = this.add.text(x, y + 18, `x${resolvedMultiplier}`, {
          fontSize: "22px",
          fontFamily: '"Cinzel", "Times New Roman", serif',
          fontStyle: "bold",
          color: "#FFF7C2",
          stroke: "#2F230D",
          strokeThickness: 5
        })
          .setOrigin(0.5)
          .setDepth(depth)
          .setAlpha(0);
        badge.setShadow(0, 2, "#000000", 4, true, true);

        const badgeTween = this.tweens.add({
          targets: badge,
          alpha: { from: 0, to: 1 },
          scale: { from: 0.86, to: 1.04 },
          duration: Math.max(90, Math.floor(Number(blinkHalfMs) || 180)),
          ease: "Sine.easeOut",
          yoyo: true
        });

        return {
          badge,
          cleanup: ({ lingerMs = 0 } = {}) => {
            if (badgeTween) {
              badgeTween.stop();
            }
            if (!badge || badge.destroyed) {
              return;
            }
            const fadeDuration = Math.max(120, Number(lingerMs) || 0);
            if (fadeDuration <= 0) {
              badge.destroy();
              return;
            }
            this.tweens.killTweensOf(badge);
            this.tweens.add({
              targets: badge,
              alpha: 0,
              y: badge.y - 12,
              duration: fadeDuration,
              ease: "Sine.easeOut",
              onComplete: () => {
                if (!badge.destroyed) {
                  badge.destroy();
                }
              }
            });
          }
        };
      },

    async highlightClusters(clusters, duration = 500, options = {}) {
        const { showWinLabels = true, excludeCellKeys = null, activeWildPositions = null } = options;
        const cellSize = 70;
        const highlights = [];
        const multiplierBadges = [];
        const winLabels = [];
        const excludedKeys = excludeCellKeys instanceof Set ? excludeCellKeys : new Set();
        const rawDuration = Math.max(1, Math.floor(Number(duration) || 500));
        const blinkHalfMs = Math.max(
          110,
          Math.min(220, Math.floor(rawDuration * 0.35))
        );
        const resolvedHighlightDuration = Math.max(
          rawDuration,
          blinkHalfMs + 30
        );
        const labelExcludedKeys = new Set(excludedKeys);
        (Array.isArray(this.mergeGunAreas) ? this.mergeGunAreas : []).forEach((area) => {
          (Array.isArray(area?.positions) ? area.positions : []).forEach((position) => {
            labelExcludedKeys.add(`${position.reel},${position.row}`);
          });
        });
        if (this._winHighlightBoardDimOverlay && !this._winHighlightBoardDimOverlay.destroyed) {
          this._winHighlightBoardDimOverlay.destroy();
        }
        const boardDimOverlay = this.add.rectangle(
          GRID_OFFSET_X + (clientConfig.area.width * cellSize) / 2,
          GRID_OFFSET_Y + (clientConfig.area.height * cellSize) / 2,
          clientConfig.area.width * cellSize,
          clientConfig.area.height * cellSize,
          0x04070d,
          1
        )
          .setDepth(DEPTH_SYMBOLS + 0.75)
          .setAlpha(0);
        this._winHighlightBoardDimOverlay = boardDimOverlay;
        this.tweens.add({
          targets: boardDimOverlay,
          alpha: 0.4,
          duration: Math.min(140, blinkHalfMs),
          ease: "Sine.easeOut"
        });
        
        // Play wins highlight sound
        this.playSfx('wins_highlight', { volume: 0.5 });
        
        if (showWinLabels) {
          // Calculate initial positions for all win labels (with offset)
          const labelData = clusters.map(cluster => {
            const labelPositions = cluster.positions.filter((pos) => !labelExcludedKeys.has(`${pos.reel},${pos.row}`));
            if (labelPositions.length === 0) {
              return null;
            }
            const positionsForCenter = labelPositions;
            let centerX = 0;
            let centerY = 0;
            positionsForCenter.forEach(pos => {
              centerX += pos.reel * cellSize + cellSize / 2 + GRID_OFFSET_X;
              centerY += (clientConfig.area.height - 1 - pos.row) * cellSize + cellSize / 2 + GRID_OFFSET_Y;
            });
            centerX /= positionsForCenter.length;
            centerY /= positionsForCenter.length;
            
            return {
              x: centerX,
              y: centerY - 40, // Start above cluster
              payout: cluster.payout || 0,
              cluster: cluster
            };
          }).filter(Boolean);
          
          // Separate overlapping labels by checking and adjusting Y positions
          const minSeparation = 40; // Minimum vertical separation in pixels
          
          for (let i = 0; i < labelData.length; i++) {
            for (let j = i + 1; j < labelData.length; j++) {
              const label1 = labelData[i];
              const label2 = labelData[j];
              
              // Check if labels are close horizontally (within 100px)
              const xDist = Math.abs(label1.x - label2.x);
              if (xDist < 100) {
                // Check vertical overlap
                const yDist = Math.abs(label1.y - label2.y);
                if (yDist < minSeparation) {
                  // Move the lower label down
                  if (label1.y < label2.y) {
                    label2.y = label1.y + minSeparation;
                  } else {
                    label1.y = label2.y + minSeparation;
                  }
                }
              }
            }
          }
    
          labelData.forEach(data => {
            // Create win label
            const winLabel = this.add.text(
              data.x,
              data.y,
              data.payout.toFixed(2),
              {
                fontSize: '32px',
                fontFamily: 'Arial Black',
                color: '#FFD700', // Gold
                stroke: '#000000',
                strokeThickness: 6,
                shadow: {
                  offsetX: 0,
                  offsetY: 0,
                  color: '#FFD700',
                  blur: 15,
                  fill: true
                }
              }
            )
              .setOrigin(0.5)
              .setDepth(DEPTH_HERO + 2)
              .setAlpha(0);
            
            winLabels.push(winLabel);
            
            // Pop in animation for win label
            this.tweens.add({
              targets: winLabel,
              alpha: 1,
              scale: { from: 0.5, to: 1.2 },
              duration: 200,
              ease: 'Back.easeOut'
            });
          });
        }
    
        const highlightedIntensityKeys = new Set();
        const heroId = resolveSymbolId(clientConfig.symbolsMapping?.hero, 10);
        const activeWildKeys = new Set();
        (Array.isArray(activeWildPositions) ? activeWildPositions : []).forEach((cell) => {
          const reel = Math.floor(Number(cell?.reel));
          const row = Math.floor(Number(cell?.row));
          if (!Number.isFinite(reel) || !Number.isFinite(row)) return;
          activeWildKeys.add(`${reel},${row}`);
        });
    
        const addHeroWinHighlight = () => {
          if (highlightedIntensityKeys.has("hero")) return;
          const heroAnchor = this.currentHeroAnchor;
          if (!this.heroSprite || this.heroSprite.destroyed || !heroAnchor) return;
          const reel = Math.floor(Number(heroAnchor.reel));
          const row = Math.floor(Number(heroAnchor.row));
          if (!Number.isFinite(reel) || !Number.isFinite(row)) return;
    
          const overlay = this.createWinHighlightIntensityOverlay(
            { reel, row, symbol: heroId, isHeroWild: true },
            null,
            blinkHalfMs,
            { forceHero: true, noScalePop: true }
          );
          if (overlay) {
            highlightedIntensityKeys.add("hero");
            highlights.push(overlay);
          }
        };
    
        clusters.forEach(cluster => {
          if (Number(cluster?.heroWildCount || 0) > 0) {
            addHeroWinHighlight();
          }
          const clusterAngelMultiplier = this.getClusterAngelMultiplierBadgeValue(cluster);
          cluster.positions.forEach(pos => {
            const cellKey = `${pos.reel},${pos.row}`;
            const normalizedSymbol = Math.floor(Number(pos.symbol ?? cluster?.symbol));
            const isHeroWildPosition = activeWildKeys.has(cellKey) || normalizedSymbol === heroId;
            if (excludedKeys.has(cellKey) && !isHeroWildPosition) {
              return;
            }
            const highlightKey = isHeroWildPosition ? "hero" : cellKey;
            if (highlightedIntensityKeys.has(highlightKey)) {
              return;
            }
    
            const overlay = this.createWinHighlightIntensityOverlay(
              isHeroWildPosition ? { ...pos, symbol: heroId, isHeroWild: true } : pos,
              cluster,
              blinkHalfMs,
              isHeroWildPosition ? { forceHero: true, noScalePop: true } : {}
            );
            if (overlay) {
              highlightedIntensityKeys.add(highlightKey);
              highlights.push(overlay);
            }

            if (!isHeroWildPosition && clusterAngelMultiplier > 1) {
              const badge = this.createClusterAngelMultiplierBadge(pos, clusterAngelMultiplier, blinkHalfMs);
              if (badge) {
                multiplierBadges.push(badge);
              }
            }
          });
        });

        await new Promise((resolve) => {
          let settled = false;
          let timerId = null;
    
          const finish = ({ skipped = false } = {}) => {
            if (settled) {
              return;
            }
    
            settled = true;
            if (timerId !== null) {
              clearTimeout(timerId);
            }
            if (this._highlightPhaseCleanup === finish) {
              this._highlightPhaseCleanup = null;
            }
            if (skipped && boardDimOverlay && !boardDimOverlay.destroyed) {
              boardDimOverlay.destroy();
              if (this._winHighlightBoardDimOverlay === boardDimOverlay) {
                this._winHighlightBoardDimOverlay = null;
              }
            }
    
            highlights.forEach((highlight) => {
              if (highlight?.cleanup) {
                highlight.cleanup();
              } else if (highlight && !highlight.destroyed) {
                highlight.destroy();
              }
            });
            multiplierBadges.forEach((badge) => {
              if (badge?.cleanup) {
                badge.cleanup({ lingerMs: 400 });
              } else if (badge && !badge.destroyed) {
                badge.destroy();
              }
            });

            if (skipped) {
              winLabels.forEach((label) => {
                if (label && !label.destroyed) {
                  label.destroy();
                }
              });
              resolve();
              return;
            }
    
            // Float up and fade out win labels after explosion (longer animation)
            winLabels.forEach((label) => {
              if (!label || label.destroyed) {
                return;
              }
    
              this.tweens.add({
                targets: label,
                y: label.y - 120, // Move up more (was 60)
                alpha: 0,
                scale: 0.8,
                duration: 1500, // Longer duration (was 800)
                ease: 'Power2.easeOut',
                onComplete: () => label.destroy()
              });
            });
    
            resolve();
          };
    
          this._highlightPhaseCleanup = finish;
          timerId = setTimeout(() => finish(), resolvedHighlightDuration);
        });
      },

    skipHighlightPhase() {
        if (typeof this._highlightPhaseCleanup === 'function') {
          this._highlightPhaseCleanup({ skipped: true });
        }
      },

    async collectBonusClusterFruits(clusters, options = {}) {
        const {
          playHighlight = true,
          highlightDuration = WIN_HIGHLIGHT_DURATION_MS,
          activeWildPositions = null
        } = options;
    
        if (!Array.isArray(clusters) || clusters.length === 0) {
          return false;
        }
    
        if (playHighlight) {
          await this.highlightClusters(clusters, highlightDuration, {
            showWinLabels: false,
            excludeCellKeys: this.getCurrentHeroFootprintCellKeys(),
            activeWildPositions
          });
        }
    
        const uniquePositions = new Map();
        clusters.forEach((cluster) => {
          const clusterPaytableValueTbm = Number(cluster?.bm);
          const valueTbm = Number.isFinite(clusterPaytableValueTbm) && clusterPaytableValueTbm > 0
            ? Number(clusterPaytableValueTbm.toFixed(4))
            : undefined;
          cluster?.positions?.forEach?.((pos) => {
            const key = `${pos.reel},${pos.row}`;
            if (!uniquePositions.has(key)) {
              uniquePositions.set(key, { ...pos, valueTbm });
            }
          });
        });
    
        const activeWildMetaByKey = new Map();
        (Array.isArray(activeWildPositions) ? activeWildPositions : []).forEach((cell) => {
          const reel = Math.floor(Number(cell?.reel));
          const row = Math.floor(Number(cell?.row));
          if (!Number.isFinite(reel) || !Number.isFinite(row)) return;
          activeWildMetaByKey.set(`${reel},${row}`, cell);
        });
    
        const collects = [];
        uniquePositions.forEach((pos, positionKey) => {
          const reel = Number(pos?.reel);
          const row = Number(pos?.row);
          if (!Number.isFinite(reel) || !Number.isFinite(row)) {
            return;
          }
    
          const wildMeta = activeWildMetaByKey.get(positionKey);
          const hintedSymbolId = this.getCollectableBonusSymbolId(wildMeta?.wasSymbol ?? pos?.symbol);
          let trackedSprite = this.reelSprites?.[reel]?.[row];
          if (trackedSprite?.destroyed) {
            trackedSprite = null;
          }
          if (!trackedSprite) {
            trackedSprite = this.findCollectableBoardSpriteAtCell(reel, row, hintedSymbolId);
          }
          const resolvedSymbolId = this.getCollectableBonusSymbolId(
            trackedSprite?.symbolKey ?? hintedSymbolId
          );
          if (resolvedSymbolId === null) {
            return;
          }
          if (this.hasActionBonusCollectionAnimated({
            reel,
            row,
            symbol: resolvedSymbolId
          })) {
            if (this.reelSprites?.[reel]) {
              this.reelSprites[reel][row] = null;
            }
            this.destroyDuplicateCollectableSpritesAtCell(reel, row, resolvedSymbolId, null);
            return;
          }
          this.destroyDuplicateCollectableSpritesAtCell(reel, row, resolvedSymbolId, trackedSprite);
    
          let sprite = trackedSprite;
          if (!sprite || sprite.destroyed) {
            const x = reel * 70 + 35 + GRID_OFFSET_X;
            const y = (clientConfig.area.height - 1 - row) * 70 + 35 + GRID_OFFSET_Y;
            sprite = this.add.image(x, y, this.getBonusAwareSymbolTextureKey(resolvedSymbolId))
              .setOrigin(0.5)
              .setScale(getSymbolScale(resolvedSymbolId))
              .setDepth(DEPTH_SYMBOLS);
            sprite.symbolKey = resolvedSymbolId;
          } else if (sprite.reelSymbolImage) {
            this.destroySymbolBonusGridBaseTbmOverlay(sprite, reel, row);
            sprite = this.reelSprites?.[reel]?.[row] || sprite;
          }
    
          const immediatePositionUpgrade = this.isBonusImmediateLowSymbol(resolvedSymbolId);
          if (immediatePositionUpgrade) {
            this.markActionBonusCollectionAnimated({
              reel,
              row,
              symbol: resolvedSymbolId
            });
            collects.push(this.animateImmediateLowBonusPositionUpgrade(
              {
                reel,
                row,
                symbol: resolvedSymbolId,
                immediatePositionUpgrade: true,
                valueTbm: pos?.valueTbm
              },
              sprite,
              resolvedSymbolId
            ));
            return;
          }
    
          this.markActionBonusCollectionAnimated({
            reel,
            row,
            symbol: resolvedSymbolId
          });
          if (this.reelSprites?.[reel]) {
            this.reelSprites[reel][row] = null;
          }
          if (!this.isBonusCenterMachineCollectableSymbol(resolvedSymbolId)) {
            collects.push(this.animateSpriteOutOfBonusCollection(sprite));
            return;
          }
          collects.push(this.animateSpriteIntoBonusFruitPile(sprite, resolvedSymbolId));
        });
    
        await Promise.all(collects);
        uniquePositions.forEach((pos) => {
          const reel = Number(pos?.reel);
          const row = Number(pos?.row);
          if (!Number.isFinite(reel) || !Number.isFinite(row)) return;
          const tracked = this.reelSprites?.[reel]?.[row];
          const trackedSymbolId = this.resolveCollectableSymbolIdFromDisplayObject(tracked);
          if (tracked && trackedSymbolId !== null) {
            this.clearReelSpriteReferencesForDisplayObject(tracked);
            this.tweens.killTweensOf(tracked);
            this.destroyBananaBackplate(tracked);
            if (!tracked.destroyed) {
              tracked.destroy();
            }
          }
          if (this.reelSprites?.[reel]) {
            this.reelSprites[reel][row] = null;
          }
          this.destroyDuplicateCollectableSpritesAtCell(reel, row, null, null);
        });
        this.purgeUntrackedGridCollectableSprites();
        return collects.length > 0;
      },

    async collectBonusSymbolsThisAction(collectedSymbols = [], targetCounts = {}, options = {}) {
        const {
          playHighlight = false,
          clusters = [],
          highlightDuration = WIN_HIGHLIGHT_DURATION_MS,
          immediateLowPositionLandings = null
        } = options;
    
        if (playHighlight && Array.isArray(clusters) && clusters.length > 0) {
          await this.highlightClusters(clusters, highlightDuration, {
            showWinLabels: false,
            excludeCellKeys: this.getCurrentHeroFootprintCellKeys()
          });
        }
    
        const normalizedTarget = this.getNormalizedBonusFruitCounts(targetCounts);
        const normalizedCurrent = this.getNormalizedBonusFruitCounts(this.bonusFruitPileCounts);
        const targetKeys = Object.keys(normalizedTarget);
        const currentKeys = Object.keys(normalizedCurrent);
        const needsRebuild =
          targetKeys.length < currentKeys.length ||
          currentKeys.some((key) => Number(normalizedCurrent[key] || 0) > Number(normalizedTarget[key] || 0));
    
        if (needsRebuild) {
          this.resetBonusFruitPile(normalizedTarget);
          if (Array.isArray(immediateLowPositionLandings)) {
            this.syncImmediateLowPositionBackplates(immediateLowPositionLandings);
          }
          return false;
        }
    
        const remainingBySymbol = {};
        Object.entries(normalizedTarget).forEach(([symbol, count]) => {
          const delta = Math.max(0, Number(count || 0) - Number(normalizedCurrent[symbol] || 0));
          if (delta > 0) {
            remainingBySymbol[String(symbol)] = delta;
          }
        });
    
        const cellSize = 70;
        const collects = [];
        const usedPositionKeys = new Set();
    
        (Array.isArray(collectedSymbols) ? collectedSymbols : []).forEach((entry) => {
          if (this.hasActionBonusCollectionAnimated(entry)) return;
    
          const resolvedSymbolId = this.getCollectableBonusSymbolId(entry?.symbol ?? entry?.symbolId);
          if (resolvedSymbolId === null) return;
    
          const reel = Number(entry?.reel);
          const row = Number(entry?.row);
          const hasBoardPosition = Number.isFinite(reel) && Number.isFinite(row);
          const immediatePositionUpgrade =
            entry?.immediatePositionUpgrade === true &&
            hasBoardPosition &&
            this.isBonusImmediateLowSymbol(resolvedSymbolId);
    
          let sprite = hasBoardPosition ? this.reelSprites?.[reel]?.[row] : null;
          if (sprite && sprite.destroyed) {
            sprite = null;
          }
          if (!sprite && hasBoardPosition) {
            sprite = this.findCollectableBoardSpriteAtCell(reel, row, resolvedSymbolId);
          }
          if (hasBoardPosition) {
            this.destroyDuplicateCollectableSpritesAtCell(reel, row, resolvedSymbolId, sprite);
          }
    
          if (!sprite && hasBoardPosition) {
            const x = reel * cellSize + cellSize / 2 + GRID_OFFSET_X;
            const y = (clientConfig.area.height - 1 - row) * cellSize + cellSize / 2 + GRID_OFFSET_Y;
            sprite = this.add.image(x, y, this.getBonusAwareSymbolTextureKey(resolvedSymbolId))
              .setOrigin(0.5)
              .setScale(getSymbolScale(resolvedSymbolId))
              .setDepth(DEPTH_SYMBOLS);
            sprite.symbolKey = resolvedSymbolId;
          } else if (sprite?.reelSymbolImage && hasBoardPosition) {
            this.destroySymbolBonusGridBaseTbmOverlay(sprite, reel, row);
            sprite = this.reelSprites?.[reel]?.[row] || sprite;
          }
    
          if (immediatePositionUpgrade) {
            this.markActionBonusCollectionAnimated({
              reel,
              row,
              symbol: resolvedSymbolId
            });
            collects.push(this.animateImmediateLowBonusPositionUpgrade(
              {
                reel,
                row,
                symbol: resolvedSymbolId,
                valueTbm: entry?.valueTbm
              },
              sprite,
              resolvedSymbolId
            ));
            return;
          }
    
          const centerMachineCollect =
            entry?.centerMachineCollect !== false &&
            this.isBonusCenterMachineCollectableSymbol(resolvedSymbolId);
          const symbolKey = String(resolvedSymbolId);
          if (centerMachineCollect && Number(remainingBySymbol[symbolKey] || 0) <= 0) return;
    
          const positionKey = hasBoardPosition ? `${reel},${row}` : `${symbolKey}|${collects.length}`;
          if (usedPositionKeys.has(positionKey)) return;
          usedPositionKeys.add(positionKey);
    
          if (hasBoardPosition && this.reelSprites?.[reel]) {
            this.reelSprites[reel][row] = null;
          }
    
          this.markActionBonusCollectionAnimated({
            reel,
            row,
            symbol: resolvedSymbolId
          });
          if (!centerMachineCollect) {
            collects.push(this.animateSpriteOutOfBonusCollection(sprite));
            return;
          }
    
          remainingBySymbol[symbolKey] -= 1;
          collects.push(this.animateSpriteIntoBonusFruitPile(sprite, resolvedSymbolId));
        });
    
        if (collects.length > 0) {
          await Promise.all(collects);
        }
    
        if (Array.isArray(immediateLowPositionLandings)) {
          this.syncImmediateLowPositionBackplates(immediateLowPositionLandings);
        }
        this.syncBonusCollectedSymbolCounts(normalizedTarget);
        return collects.length > 0;
      },

    async explodeSymbols(clusters) {
        const cellSize = 70;
        const popScaleMultiplier = 1.08;
        const promises = [];
        const boardDimOverlay = this._winHighlightBoardDimOverlay && !this._winHighlightBoardDimOverlay.destroyed
          ? this._winHighlightBoardDimOverlay
          : null;
        
        // Play wins explode and payout sounds together
        this.playSfx('wins_explode', { volume: 0.5 });
        this.playSfx('wins_payout', { volume: 0.5 });
    
        // Collect unique positions (a wild can be in multiple clusters)
        const uniquePositions = new Map();
        clusters.forEach(cluster => {
          cluster.positions.forEach(pos => {
            const key = `${pos.reel},${pos.row}`;
            if (!uniquePositions.has(key)) {
              uniquePositions.set(key, pos);
            }
          });
        });
    
        // Process each unique position only once
        uniquePositions.forEach(pos => {
          const sprite = this.reelSprites[pos.reel]?.[pos.row];
          if (!sprite) return;
          const source = getReelSymbolRenderable(sprite) || sprite;

          const x = pos.reel * cellSize + cellSize / 2 + GRID_OFFSET_X;
          const y = (clientConfig.area.height - 1 - pos.row) * cellSize + cellSize / 2 + GRID_OFFSET_Y;
          const sourceDepth = Number(source?.depth) || Number(sprite?.depth) || DEPTH_SYMBOLS;
          const intenseTextureKey = this.getWinHighlightIntensityTextureKey(
            this.getDisplayObjectSymbolId?.(source) ?? pos?.symbol
          );
          let intenseOverlay = null;

          if (intenseTextureKey && this.textures?.exists?.(intenseTextureKey)) {
            const worldMatrix = typeof source?.getWorldTransformMatrix === "function"
              ? source.getWorldTransformMatrix()
              : null;
            const overlayX = worldMatrix && Number.isFinite(Number(worldMatrix.tx))
              ? Number(worldMatrix.tx)
              : x;
            const overlayY = worldMatrix && Number.isFinite(Number(worldMatrix.ty))
              ? Number(worldMatrix.ty)
              : y;
            const sourceDisplayWidth = Number(source?.displayWidth);
            const sourceDisplayHeight = Number(source?.displayHeight);
            const baseScaleX = Number.isFinite(Number(source?.scaleX)) ? Number(source.scaleX) : 1;
            const baseScaleY = Number.isFinite(Number(source?.scaleY)) ? Number(source.scaleY) : 1;

            intenseOverlay = this.add.image(overlayX, overlayY, intenseTextureKey)
              .setOrigin(source?.originX ?? 0.5, source?.originY ?? 0.5)
              .setRotation(Number(source?.rotation) || 0)
              .setDepth(sourceDepth + 0.7)
              .setAlpha(0.96);

            const overlayScaleX = Number.isFinite(sourceDisplayWidth) && sourceDisplayWidth > 0 && intenseOverlay.width > 0
              ? sourceDisplayWidth / intenseOverlay.width
              : baseScaleX;
            const overlayScaleY = Number.isFinite(sourceDisplayHeight) && sourceDisplayHeight > 0 && intenseOverlay.height > 0
              ? sourceDisplayHeight / intenseOverlay.height
              : baseScaleY;
            intenseOverlay.setScale(overlayScaleX, overlayScaleY);
            if (typeof intenseOverlay.setFlipX === "function") {
              intenseOverlay.setFlipX(Boolean(source?.flipX));
            }
            if (typeof intenseOverlay.setFlipY === "function") {
              intenseOverlay.setFlipY(Boolean(source?.flipY));
            }

            this.tweens.add({
              targets: intenseOverlay,
              alpha: 0,
              scaleX: overlayScaleX * popScaleMultiplier,
              scaleY: overlayScaleY * popScaleMultiplier,
              duration: 200,
              ease: "Power2",
              onComplete: () => {
                if (intenseOverlay && !intenseOverlay.destroyed) {
                  intenseOverlay.destroy();
                }
              }
            });
          }

          // Brief white flash on the symbol itself
          const flash = this.add.circle(x, y, 35, 0xFFFFFF)
            .setDepth(sourceDepth + 1)
            .setAlpha(0.8)
            .setBlendMode(Phaser.BlendModes.ADD);
          
          this.tweens.add({
            targets: flash,
            alpha: 0,
            scale: 1.5,
            duration: 150,
            ease: 'Quad.easeOut',
            onComplete: () => flash.destroy()
          });
          this.playMonkeySymbolClearLightningBurst(x, y, {
            depth: sourceDepth + 3,
            radius: 38,
            boltCount: 4,
            color: 0xFFE778,
            intensityScale: 0.74
          });
          this.playSymbolPopParticleBurst(x, y, {
            depth: sourceDepth + 2.6,
            intensity: 1.15
          });

          // Keep the intense version visible through the pop, then fade the underlying board symbol.
          this.tweens.add({
            targets: sprite,
            alpha: 0,
            duration: 200,
            ease: 'Power2'
          });
          this.tweens.add({
            targets: source,
            scaleX: (Number(source?.scaleX) || 1) * popScaleMultiplier,
            scaleY: (Number(source?.scaleY) || 1) * popScaleMultiplier,
            duration: 200,
            ease: 'Power2'
          });

          // Gold particle burst (simple and balanced)
          const particleCount = 8;
          const colors = [0xFFD700, 0xFFAA00, 0xFFE55C, 0xFFC125];
          
          for (let i = 0; i < particleCount; i++) {
            const angle = (Math.PI * 2 * i) / particleCount;
            const speed = 30 + Math.random() * 40;
            const size = 2 + Math.random() * 3;
            
            const particle = this.add.circle(x, y, size, colors[Math.floor(Math.random() * colors.length)])
              .setDepth(sourceDepth + 2)
              .setAlpha(0.9)
              .setBlendMode(Phaser.BlendModes.ADD);
            
            // Explode outward then fade
            this.tweens.add({
              targets: particle,
              x: x + Math.cos(angle) * speed,
              y: y + Math.sin(angle) * speed - 20,
              alpha: 0,
              scale: 0.3,
              duration: 400 + Math.random() * 200,
              ease: 'Cubic.easeOut',
              onComplete: () => particle.destroy()
            });
          }
          
          // Lingering sparkles that float upward
          for (let i = 0; i < 4; i++) {
            const sparkle = this.add.circle(
              x + (Math.random() - 0.5) * 30,
              y + (Math.random() - 0.5) * 30,
              1 + Math.random() * 2,
              0xFFFFAA
            )
              .setDepth(sourceDepth + 2)
              .setAlpha(0.8)
              .setBlendMode(Phaser.BlendModes.ADD);
            
            // Float upward and fade slowly
            this.tweens.add({
              targets: sparkle,
              y: y - 40 - Math.random() * 30,
              x: sparkle.x + (Math.random() - 0.5) * 20,
              alpha: 0,
              duration: 600 + Math.random() * 400,
              ease: 'Quad.easeOut',
              onComplete: () => sparkle.destroy()
            });
          }
    
          // Mark for removal after animation
          promises.push(
            new Promise(resolve => {
              setTimeout(() => {
                this.destroyBananaBackplate(sprite); // Clean up backplate if banana
                if (intenseOverlay && !intenseOverlay.destroyed) {
                  intenseOverlay.destroy();
                }
                sprite.destroy();
                this.reelSprites[pos.reel][pos.row] = null;
                resolve();
              }, 200);
            })
          );
        });
    
        await Promise.all(promises);

        if (boardDimOverlay && !boardDimOverlay.destroyed) {
          await new Promise((resolve) => {
            this.tweens.add({
              targets: boardDimOverlay,
              alpha: 0,
              duration: 180,
              ease: "Sine.easeInOut",
              onComplete: () => {
                if (boardDimOverlay && !boardDimOverlay.destroyed) {
                  boardDimOverlay.destroy();
                }
                if (this._winHighlightBoardDimOverlay === boardDimOverlay) {
                  this._winHighlightBoardDimOverlay = null;
                }
                resolve();
              }
            });
          });
        }
      },

    async dropExistingSymbols() {
        const cellSize = 70;
        const promises = [];
    
        for (let reel = 0; reel < clientConfig.area.width; reel++) {
          const column = this.reelSprites[reel] || [];
          
          // Collect valid sprites (not destroyed, not null)
          const validSprites = [];
          for (let row = 0; row < column.length; row++) {
            const sprite = column[row];
            if (sprite && !sprite.destroyed && sprite.symbolKey !== 0) {
              validSprites.push(sprite);
            }
          }
    
          // Clear the column
          this.reelSprites[reel] = new Array(clientConfig.area.height).fill(null);
    
          // Drop sprites down from bottom up
          validSprites.forEach((sprite, index) => {
            const targetRow = index; // Bottom-aligned
            const x = reel * cellSize + cellSize / 2 + GRID_OFFSET_X;
            const yTarget = (clientConfig.area.height - 1 - targetRow) * cellSize + cellSize / 2 + GRID_OFFSET_Y;
    
            this.reelSprites[reel][targetRow] = sprite;
    
            // Animate drop
            const dropPromise = new Promise(resolve => {
              this.tweens.add({
                targets: sprite,
                x: x,
                y: yTarget,
                duration: 300,
                ease: 'Cubic.easeIn',
                onComplete: resolve
              });
            });
    
            promises.push(dropPromise);
          });
        }
    
        await Promise.all(promises);
      },

    syncSpritesToReelState(reels) {
        if (!reels || !this.reelSprites) return;
    
        const cellSize = 70;
        const houseId = clientConfig.symbolsMapping?.house || "HOUSE";
        const heroId = clientConfig.symbolsMapping?.hero || 10;
        const trollId = clientConfig.symbolsMapping?.banana3 || 13;
    
        for (let reel = 0; reel < clientConfig.area.width; reel++) {
          if (!this.reelSprites[reel]) {
            this.reelSprites[reel] = new Array(clientConfig.area.height).fill(null);
          }
    
          for (let row = 0; row < clientConfig.area.height; row++) {
            const symbol = reels[reel]?.[row];
            const cell = this.reelSprites[reel][row];
    
            if (symbol === undefined || symbol === houseId || symbol === heroId) {
              if (cell && !cell.destroyed) {
                this.destroyBananaBackplate(cell);
                cell.destroy();
              }
              this.reelSprites[reel][row] = null;
              continue;
            }
    
            const x = reel * cellSize + cellSize / 2 + GRID_OFFSET_X;
            const y = (clientConfig.area.height - 1 - row) * cellSize + cellSize / 2 + GRID_OFFSET_Y;
            const scale = getSymbolScale(symbol);
            const depth = getBoardSymbolDepth(symbol);
    
            if (!cell || cell.destroyed || !cell.scene) {
              const created = this.add.image(x, y, this.getBonusAwareSymbolTextureKey(symbol))
                .setOrigin(0.5)
                .setScale(scale)
                .setDepth(depth);
              created.symbolKey = symbol;
              created.isDepleted = false;
              if (Number(symbol) === Number(trollId)) {
                created.isTroll3x3 = true;
              }
              this.reelSprites[reel][row] = created;
              this.primeFeatureSymbolFloatingTilt(created, symbol);
              this.ensureSymbolBonusGridBaseTbmOverlay(created, reel, row);
              continue;
            }
    
            const graphic = getReelSymbolRenderable(cell);
    
            if (String(cell.symbolKey) !== String(symbol)) {
              this.destroyBananaBackplate(cell);
              if (graphic) {
                this.setBonusAwareSymbolTexture(cell, symbol);
                graphic.setScale(scale);
              }
              cell.symbolKey = symbol;
              this.setReelCellGraphicDepth(cell, depth);
              cell.setPosition(x, y);
              cell.setAlpha(1);
              cell.isDepleted = false;
              if (Number(symbol) !== Number(trollId)) {
                cell.isTroll3x3 = false;
              }
            } else {
              this.setBonusAwareSymbolTexture(cell, symbol);
              cell.setPosition(x, y);
              cell.setAlpha(1);
            }
    
            const placed = this.reelSprites[reel][row];
            if (placed && !placed.destroyed) {
              this.primeFeatureSymbolFloatingTilt(placed, symbol);
              this.ensureSymbolBonusGridBaseTbmOverlay(placed, reel, row);
            }
          }
        }
        this.syncBonusMysteryFeatureSpinState();
        this.refreshBonusMultiplierFruitOrbVisuals();
      },

    getVisibleStartPosition(from, direction, cellSize) {
        const gridHeight = clientConfig.area.height;
        const gridWidth = clientConfig.area.width;
        const offscreenOffset = 2; // How many cells outside grid to start (increased for larger GRID_OFFSET_Y)
        
        if (direction === 'down') {
          // Coming from above: start off-screen (negative Y)
          const clampedRow = Math.min(from, gridHeight + offscreenOffset);
          const y = (gridHeight - 1 - clampedRow) * cellSize + cellSize / 2 + GRID_OFFSET_Y;
          // Ensure it starts above visible area (y < 0)
          return Math.min(y, -cellSize);
        } else if (direction === 'up') {
          // Coming from below: clamp to max 1 cell below bottom edge
          const clampedRow = Math.max(from, -offscreenOffset);
          return (gridHeight - 1 - clampedRow) * cellSize + cellSize / 2 + GRID_OFFSET_Y;
        } else if (direction === 'left') {
          // Coming from right: clamp to max 1 cell right of right edge
          const clampedReel = Math.min(from, gridWidth + offscreenOffset);
          return clampedReel * cellSize + cellSize / 2 + GRID_OFFSET_X;
        } else if (direction === 'right') {
          // Coming from left: clamp to max 1 cell left of left edge
          const clampedReel = Math.max(from, -offscreenOffset);
          return clampedReel * cellSize + cellSize / 2 + GRID_OFFSET_X;
        }
        
        // Fallback: use actual position
        return (gridHeight - 1 - from) * cellSize + cellSize / 2 + GRID_OFFSET_Y;
      },

    async applyGravityAnimation(newReels, dropEvent, timeSymbols = []) {
        const cellSize = 70;
        const promises = [];
        const timeSymbolsToProcess = [];
        const spritesToDeplete = []; // Track sprites that need depleting after suspense
        const bananaDebugEnabled = DEBUG_BANANA_GRAVITY === true;
        
        // Track which reels/rows have played landing sounds (one per reel/row)
        const playedReels = new Set();
        const playedRows = new Set();
        const isHorizontalGravity = dropEvent?.direction === 'left' || dropEvent?.direction === 'right';
    
        if (!dropEvent || !dropEvent.movements) {
          console.warn('⚠️ No dropEvent provided to applyGravityAnimation');
          return;
        }
    
        if (!newReels) {
          return;
        }
    
        this.purgeUntrackedGridCollectableSprites();
    
        // Initialize new sprite columns
        const newSpriteColumns = [];
        for (let reel = 0; reel < clientConfig.area.width; reel++) {
          newSpriteColumns[reel] = new Array(clientConfig.area.height).fill(null);
        }
        const movementTargetKeys = new Set();
        for (const movement of dropEvent.movements) {
          const targetReel = Number(movement?.toReel !== undefined ? movement.toReel : movement?.reel);
          const targetRow = Number(movement?.to);
          if (!Number.isFinite(targetReel) || !Number.isFinite(targetRow)) continue;
          movementTargetKeys.add(`${targetReel},${targetRow}`);
        }
        const isBlockingGridSymbol = (rawSymbol) => {
          const symbolKey = normalizeSymbolKey(rawSymbol);
          if (symbolKey === null || symbolKey === undefined) return false;
          if (String(symbolKey) === String(clientConfig.symbolsMapping?.hero || 10)) return false;
          return isBanana(symbolKey) || this.isPersistentBonusFeatureSymbol(symbolKey);
        };
        const isStationaryPreservedTarget = (reel, row) => (
          isBlockingGridSymbol(newReels?.[reel]?.[row]) && !movementTargetKeys.has(`${reel},${row}`)
        );
    
        const collectBananaSpriteStats = (columns) => {
          const stats = {
            targetBananas: 0,
            present: 0,
            missing: 0,
            destroyed: 0,
            invisible: 0,
            alphaZero: 0,
            lowDepth: 0,
            samples: []
          };
    
          for (let reel = 0; reel < clientConfig.area.width; reel++) {
            for (let row = 0; row < clientConfig.area.height; row++) {
              const targetSymbol = newReels?.[reel]?.[row];
              if (!isBanana(targetSymbol)) continue;
              stats.targetBananas++;
    
              const sprite = columns?.[reel]?.[row];
              if (!sprite) {
                stats.missing++;
                if (stats.samples.length < 8) {
                  stats.samples.push({ reel, row, issue: "missing" });
                }
                continue;
              }
    
              stats.present++;
              if (sprite.destroyed) {
                stats.destroyed++;
                if (stats.samples.length < 8) {
                  stats.samples.push({ reel, row, issue: "destroyed", symbolKey: sprite.symbolKey });
                }
              }
              if (sprite.visible === false) {
                stats.invisible++;
                if (stats.samples.length < 8) {
                  stats.samples.push({ reel, row, issue: "visible_false", symbolKey: sprite.symbolKey });
                }
              }
              if ((sprite.alpha ?? 1) <= 0.01) {
                stats.alphaZero++;
                if (stats.samples.length < 8) {
                  stats.samples.push({ reel, row, issue: "alpha_zero", symbolKey: sprite.symbolKey });
                }
              }
              if ((sprite.depth ?? 0) < DEPTH_BANANAS) {
                stats.lowDepth++;
                if (stats.samples.length < 8) {
                  stats.samples.push({ reel, row, issue: "depth_low", depth: sprite.depth, symbolKey: sprite.symbolKey });
                }
              }
            }
          }
    
          return stats;
        };
    
        const logBananaStats = (label, columns) => {
          if (!bananaDebugEnabled) return;
          const stats = collectBananaSpriteStats(columns);
          const summary = `[banana-debug] ${label} targets=${stats.targetBananas} present=${stats.present} missing=${stats.missing} destroyed=${stats.destroyed} invisible=${stats.invisible} alphaZero=${stats.alphaZero} lowDepth=${stats.lowDepth}`;
          if (stats.samples.length > 0) {
            console.log(summary, stats.samples);
          } else {
            console.log(summary);
          }
        };
    
        const restoreReelCellVisibility = (cell) => {
          if (!cell || cell.destroyed) return;
          cell.setVisible?.(true);
          if (typeof this.applySymbolSpawnFadeToCell === "function" && this.isSymbolSpawnCurtainEnabled?.()) {
            this.applySymbolSpawnFadeToCell(cell);
            return;
          }
          cell.setAlpha?.(1);
          const renderable = getReelSymbolRenderable(cell);
          if (renderable && renderable !== cell && !renderable.destroyed) {
            renderable.setVisible?.(true);
            renderable.setAlpha?.(1);
          }
        };
    
        if (bananaDebugEnabled) {
          console.log(
            `[banana-debug] gravity-start dir=${dropEvent?.direction} movements=${Array.isArray(dropEvent?.movements) ? dropEvent.movements.length : 0}`
          );
          logBananaStats("before-normalize", this.reelSprites);
        }
    
        // Normalize existing symbol visuals before gravity so no stale hunt tweens
        // can keep symbols at alpha 0 during the drop phase.
        if (this.reelSprites) {
          for (let reel = 0; reel < this.reelSprites.length; reel++) {
            const column = this.reelSprites[reel];
            if (!column) continue;
            for (let row = 0; row < column.length; row++) {
              const sprite = column[row];
              if (!sprite || sprite.destroyed) continue;
    
              // Purge stale "destroying" sprites before gravity to avoid transparent
              // ghost slides (most visible on left/right shifts).
              if (sprite.isBeingDestroyed) {
                // Safety: stale destroy flags can linger on bananas between feature phases.
                // Keep bananas alive here so they don't blink out during the next gravity pass.
                if (isStationaryPreservedTarget(reel, row)) {
                  sprite.isBeingDestroyed = false;
                  restoreReelCellVisibility(sprite);
                } else {
                  this.tweens.killTweensOf(sprite);
                  this.destroyBananaBackplate(sprite);
                  sprite.destroy();
                  column[row] = null;
                  continue;
                }
              }
    
              this.tweens.killTweensOf(sprite);
              sprite.setAlpha(1);
            }
          }
        }
        logBananaStats("after-normalize", this.reelSprites);
    
        // Pre-seed stationary blocking symbols so they stay visible during gravity
        // tween windows without needing a full sprite-grid rebuild afterward.
        if (this.reelSprites && newReels) {
          for (let reel = 0; reel < clientConfig.area.width; reel++) {
            for (let row = 0; row < clientConfig.area.height; row++) {
              const targetSymbol = newReels[reel]?.[row];
              if (!isStationaryPreservedTarget(reel, row)) continue;
    
              const targetX = reel * cellSize + cellSize / 2 + GRID_OFFSET_X;
              const targetY = (clientConfig.area.height - 1 - row) * cellSize + cellSize / 2 + GRID_OFFSET_Y;
              const depth = getBoardSymbolDepth(targetSymbol);
              let sprite = this.reelSprites?.[reel]?.[row];
    
              if (!sprite || sprite.destroyed || !sprite.scene) {
                sprite = this.add.image(targetX, targetY, this.getBonusAwareSymbolTextureKey(targetSymbol))
                  .setOrigin(0.5)
                  .setScale(getSymbolScale(targetSymbol))
                  .setDepth(depth)
                  .setAlpha(1);
                sprite.symbolKey = normalizeSymbolKey(targetSymbol);
                sprite.isBeingDestroyed = false;
                sprite.isDepleted = false;
                if (!this.reelSprites[reel]) {
                  this.reelSprites[reel] = new Array(clientConfig.area.height).fill(null);
                }
                this.reelSprites[reel][row] = sprite;
                this.primeFeatureSymbolFloatingTilt(sprite, targetSymbol);
              } else {
                this.tweens.killTweensOf(sprite);
                sprite.isBeingDestroyed = false;
                const gPre = getReelSymbolRenderable(sprite);
                if (gPre) {
                  gPre.setTexture(this.getBonusAwareSymbolTextureKey(targetSymbol));
                  gPre.setScale(getSymbolScale(targetSymbol));
                }
                sprite.symbolKey = normalizeSymbolKey(targetSymbol);
                this.setReelCellGraphicDepth(sprite, depth);
                sprite.setPosition(targetX, targetY);
                restoreReelCellVisibility(sprite);
                this.primeFeatureSymbolFloatingTilt(sprite, targetSymbol);
              }
    
              newSpriteColumns[reel][row] = sprite;
              if (!sprite.isTroll3x3) {
                this.ensureSymbolBonusGridBaseTbmOverlay(sprite, reel, row, newSpriteColumns);
                sprite = newSpriteColumns[reel][row];
              }
            }
          }
        }
        logBananaStats("after-preseed", newSpriteColumns);
    
        // Process each movement
        for (const movement of dropEvent.movements) {
          const { reel, fromReel, toReel, from, to, symbol } = movement;
          const movementTargetReel = toReel !== undefined ? toReel : reel;
          const targetFinalSymbol = newReels?.[movementTargetReel]?.[to];
          let movementIsNewSymbol = false;
          let movementIsNoOp = false;
          if (isBanana(targetFinalSymbol) && !isBanana(symbol)) {
            if (bananaDebugEnabled) {
              console.warn(
                "[banana-debug] movement skipped: non-banana trying to occupy banana target",
                { reel, fromReel, toReel: movementTargetReel, from, to, symbol, targetFinalSymbol }
              );
            }
            continue;
          }
          
          // Skip creating sprite for HERO only - hero has its own sprite system
          // Bananas animate like regular symbols!
          const heroId = clientConfig.symbolsMapping?.hero || 10;
          
          if (symbol === heroId) {
            const targetReel = toReel !== undefined ? toReel : reel;
            if (!newSpriteColumns[targetReel]) {
              newSpriteColumns[targetReel] = new Array(clientConfig.area.height).fill(null);
            }
            newSpriteColumns[targetReel][to] = null;
            continue;
          }
          
          const isVertical = (dropEvent.direction === 'down' || dropEvent.direction === 'up');
          const isHorizontal = (dropEvent.direction === 'left' || dropEvent.direction === 'right');
    
          let sprite = null;
          let xStart, yStart, xTarget, yTarget;
    
          // Calculate target position (with offset)
          xTarget = Math.round(((toReel || reel) * cellSize) + (cellSize / 2) + GRID_OFFSET_X);
          yTarget = Math.round(((clientConfig.area.height - 1 - to) * cellSize) + (cellSize / 2) + GRID_OFFSET_Y);
    
          if (isVertical) {
            // VERTICAL MOVEMENT (up/down)
            const isNewSymbol = (dropEvent.direction === 'down' && from >= clientConfig.area.height) || 
                                (dropEvent.direction === 'up' && from < 0);
            movementIsNewSymbol = isNewSymbol;
            movementIsNoOp = !movementIsNewSymbol && Number(from) === Number(to);
    
            if (isNewSymbol) {
              // New symbol from outside grid - use visible start position
              xStart = xTarget;
              yStart = this.getVisibleStartPosition(from, dropEvent.direction, cellSize);
              
              // Check if this is part of a 3x3 troll formation
              const trollId = clientConfig.symbolsMapping?.banana3 || 13;
              const targetReel = toReel !== undefined ? toReel : reel;
              const troll3x3Info = symbol === trollId ? isPartOfTroll3x3(newReels, targetReel, to) : false;
              
              if (troll3x3Info && (troll3x3Info.topLeftReel !== targetReel || troll3x3Info.topLeftRow !== to)) {
                // This troll is part of a 3x3 but NOT the top-left corner - skip creating sprite
                sprite = null;
              } else if (troll3x3Info) {
                // This is the TOP-LEFT corner of a 3x3 troll - create ONE large sprite at center
                const centerReel = troll3x3Info.topLeftReel + 1;
                const centerRow = troll3x3Info.topLeftRow + 1;
                const centerX = centerReel * cellSize + cellSize / 2 + GRID_OFFSET_X;
                const centerY = (clientConfig.area.height - 1 - centerRow) * cellSize + cellSize / 2 + GRID_OFFSET_Y;
                
                // Position at center, fade in instead of animating position
                sprite = this.add.image(centerX, centerY, String(symbol))
                  .setOrigin(0.5)
                  .setScale(normalScale * 0.3) // 90% smaller than before (10% of original 3x)
                  .setDepth(DEPTH_BANANAS)
                  .setAlpha(1);
                sprite.symbolKey = symbol;
                sprite.isTroll3x3 = true; // Mark as 3x3 troll
                sprite.isDepleted = false;
              } else {
                // Regular symbol or single troll
                const trollId = clientConfig.symbolsMapping?.banana3 || 13;
                const scale = getSymbolScale(symbol);
                const depth = getBoardSymbolDepth(symbol);
                
                sprite = this.add.image(xStart, yStart, this.getBonusAwareSymbolTextureKey(symbol))
                  .setOrigin(0.5)
                  .setScale(scale)
                  .setDepth(depth);
                sprite.symbolKey = symbol;
                sprite.isDepleted = false;
                
                // Mark troll sprites as 3x3 troll
                if (Number(symbol) === Number(trollId)) {
                  sprite.isTroll3x3 = true;
                }
              }
            } else {
              // Existing symbol moving vertically
              const oldColumn = this.reelSprites[reel] || [];
              const oldSprite = oldColumn[from];
              const trollId = clientConfig.symbolsMapping?.banana3 || 13;
              const scale = getSymbolScale(symbol);
              const depth = getBoardSymbolDepth(symbol);
    
              if (oldSprite && !oldSprite.destroyed && !oldSprite.isBeingDestroyed && oldSprite.scene) {
                sprite = oldSprite;
                this.tweens.killTweensOf(sprite);
                // Preserve depleted state - don't reset texture if sprite was depleted
                const timeSymbolId = clientConfig.symbolsMapping?.time || 16;
                const depletedSymbolId = clientConfig.symbolsMapping?.time_depleted || 17;
                const gMove = getReelSymbolRenderable(sprite);
                if (sprite.isDepleted && String(symbol) === String(timeSymbolId)) {
                  // Keep the depleted texture (17), don't reset to 16
                  if (gMove) gMove.setTexture(String(depletedSymbolId));
                  sprite.symbolKey = depletedSymbolId;
                } else {
                  this.setBonusAwareSymbolTexture(sprite, symbol);
                  sprite.symbolKey = symbol;
                }
                if (gMove) {
                  gMove.setScale(scale);
                }
                this.setReelCellGraphicDepth(sprite, depth);
                sprite.setVisible(true);
                sprite.setAlpha(1);
                if (Number(symbol) !== Number(trollId)) {
                  sprite.isTroll3x3 = false;
                }
              }
              
              // If sprite is still null or destroyed, create a new one
              if (!sprite || sprite.destroyed) {
                // Fallback: create sprite at its real source cell when possible.
                xStart = xTarget;
                const sourceRow = Number(from);
                if (Number.isFinite(sourceRow) && sourceRow >= 0 && sourceRow < clientConfig.area.height) {
                  yStart = (clientConfig.area.height - 1 - sourceRow) * cellSize + cellSize / 2 + GRID_OFFSET_Y;
                } else {
                  yStart = this.getVisibleStartPosition(from, dropEvent.direction, cellSize);
                }
                
                // Check if position was tracked as depleted
                const posKey = `${reel},${from}`;
                const wasDepletedHere = this.depletedTimeSymbols?.has(posKey);
                const timeSymId = clientConfig.symbolsMapping?.time || 16;
                const depletedSymId = clientConfig.symbolsMapping?.time_depleted || 17;
                
                let textureKey = this.getBonusAwareSymbolTextureKey(symbol);
                if (wasDepletedHere && String(symbol) === String(timeSymId)) {
                  textureKey = String(depletedSymId);
                }
                
                // Use appropriate scale based on symbol type
                sprite = this.add.image(xStart, yStart, textureKey)
                  .setOrigin(0.5)
                  .setScale(scale)
                  .setDepth(depth);
                sprite.symbolKey = wasDepletedHere && String(symbol) === String(timeSymId)
                  ? normalizeSymbolKey(depletedSymId)
                  : normalizeSymbolKey(symbol);
                sprite.isDepleted = wasDepletedHere || false;
                
                // Mark troll sprites as 3x3 troll
                if (Number(symbol) === Number(trollId)) {
                  sprite.isTroll3x3 = true;
                }
              }
            }
    
            // Animate vertical movement (skip if sprite is null - part of 3x3 troll)
            if (sprite) {
              if (!sprite.isTroll3x3) {
                if (!newSpriteColumns[movementTargetReel]) {
                  newSpriteColumns[movementTargetReel] = new Array(clientConfig.area.height).fill(null);
                }
                newSpriteColumns[movementTargetReel][to] = sprite;
                this.ensureSymbolBonusGridBaseTbmOverlay(sprite, movementTargetReel, to, newSpriteColumns);
                sprite = newSpriteColumns[movementTargetReel][to];
              }
              this.tweens.killTweensOf(sprite);
              restoreReelCellVisibility(sprite);
              this.primeFeatureSymbolFloatingTilt(sprite, symbol);
              sprite.setX(xTarget); // Avoid tiny horizontal drift when only Y should animate.
              if (movementIsNoOp) {
                sprite.setPosition(xTarget, yTarget);
                restoreReelCellVisibility(sprite);
              } else {
                const dropPromise = new Promise(resolve => {
                  this.tweens.add({
                    targets: sprite,
                    y: yTarget,
                    duration: 400,
                    ease: 'Expo.easeOut',
                  onUpdate: () => {
                    restoreReelCellVisibility(sprite);
                  },
                  onComplete: () => {
                    restoreReelCellVisibility(sprite);
                    // Play landing sound for vertical movement (once per reel)
                    const targetReel = toReel !== undefined ? toReel : reel;
                    if (!playedReels.has(targetReel)) {
                      playedReels.add(targetReel);
                      const landSound = this.getLandingSoundByReel(targetReel);
                      // Use direction to determine if hitting top or bottom
                      const volume = (dropEvent.direction === 'up') ? 0.25 : 0.3;
                      this.playLandingSoundIfNotPlaying(landSound, volume);
                    }
                    
                    // Play landing effect for powered time symbols (16, not depleted)
                    const timeSymId = clientConfig.symbolsMapping?.time || 16;
                    const depletedSymId = clientConfig.symbolsMapping?.time_depleted || 17;
                    
                    if (Array.isArray(timeSymbols) && timeSymbols.length > 0 && String(sprite.symbolKey) === String(timeSymId) && !sprite.isDepleted) {
                      this.playTimeSymbolLandingEffect(xTarget, yTarget);
                      
                      // Store sprite for depletion later (after suspense)
                      spritesToDeplete.push(sprite);
                      
                      // Remove the persistent power glow effect
                      this.fadeOutTimeSymbolPowerEffect(xTarget, yTarget);
                      
                      // Track which reel/row this was
                      timeSymbolsToProcess.push({ reel: targetReel, row: to, x: xTarget, y: yTarget });
                    }
                    resolve();
                  }
                });
              });
                promises.push(dropPromise);
              }
            } // End if (sprite)
    
          } else if (isHorizontal) {
            // HORIZONTAL MOVEMENT (left/right)
            const isNewSymbol = (dropEvent.direction === 'left' && fromReel >= clientConfig.area.width) || 
                                (dropEvent.direction === 'right' && fromReel < 0);
            movementIsNewSymbol = isNewSymbol;
            movementIsNoOp = !movementIsNewSymbol && Number(fromReel) === Number(movementTargetReel);
    
            if (isNewSymbol) {
              // New symbol from outside grid - use visible start position
              yStart = yTarget;
              xStart = this.getVisibleStartPosition(fromReel, dropEvent.direction, cellSize);
              
              // Check if this is part of a 3x3 troll formation
              const trollId = clientConfig.symbolsMapping?.banana3 || 13;
              const troll3x3Info = symbol === trollId ? isPartOfTroll3x3(newReels, toReel, to) : false;
              
              if (troll3x3Info && (troll3x3Info.topLeftReel !== toReel || troll3x3Info.topLeftRow !== to)) {
                // This troll is part of a 3x3 but NOT the top-left corner - skip creating sprite
                sprite = null;
              } else if (troll3x3Info) {
                // This is the TOP-LEFT corner of a 3x3 troll - create ONE large sprite at center
                const centerReel = troll3x3Info.topLeftReel + 1;
                const centerRow = troll3x3Info.topLeftRow + 1;
                const centerX = centerReel * cellSize + cellSize / 2 + GRID_OFFSET_X;
                const centerY = (clientConfig.area.height - 1 - centerRow) * cellSize + cellSize / 2 + GRID_OFFSET_Y;
                
                // Position at center, fade in instead of animating position
                sprite = this.add.image(centerX, centerY, String(symbol))
                  .setOrigin(0.5)
                  .setScale(normalScale * 0.3) // 90% smaller than before (10% of original 3x)
                  .setDepth(DEPTH_BANANAS)
                  .setAlpha(1);
                sprite.symbolKey = symbol;
                sprite.isTroll3x3 = true; // Mark as 3x3 troll
                sprite.isDepleted = false;
              } else {
                // Regular symbol or single troll
                const trollId = clientConfig.symbolsMapping?.banana3 || 13;
                const scale = getSymbolScale(symbol);
                const depth = getBoardSymbolDepth(symbol);
                
                sprite = this.add.image(xStart, yStart, this.getBonusAwareSymbolTextureKey(symbol))
                  .setOrigin(0.5)
                  .setScale(scale)
                  .setDepth(depth);
                sprite.symbolKey = symbol;
                sprite.isDepleted = false;
                
                // Mark troll sprites as 3x3 troll
                if (Number(symbol) === Number(trollId)) {
                  sprite.isTroll3x3 = true;
                }
              }
            } else {
              const sourceReel = Number(fromReel);
              const validSourceReel = Number.isFinite(sourceReel) ? sourceReel : reel;
              const oldColumn = this.reelSprites[validSourceReel] || [];
              const oldSprite = oldColumn[to];
              let wasOldDepleted = !!oldSprite?.isDepleted;
              const timeSymbolId = clientConfig.symbolsMapping?.time || 16;
              const depletedSymbolId = clientConfig.symbolsMapping?.time_depleted || 17;
              const trollId = clientConfig.symbolsMapping?.banana3 || 13;
              const scale = getSymbolScale(symbol);
              const depth = getBoardSymbolDepth(symbol);
    
              xStart = (Number.isFinite(sourceReel) && sourceReel >= 0 && sourceReel < clientConfig.area.width)
                ? sourceReel * cellSize + cellSize / 2 + GRID_OFFSET_X
                : this.getVisibleStartPosition(fromReel, dropEvent.direction, cellSize);
              yStart = yTarget;
    
              // Reuse existing horizontal sprites instead of recreating them.
              // This preserves per-symbol visual state and stops feature symbols
              // like glue guns from blinking between respins/avalanches.
              if (oldSprite && !oldSprite.destroyed && !oldSprite.isBeingDestroyed && oldSprite.scene) {
                sprite = oldSprite;
                this.tweens.killTweensOf(sprite);
                const gMove = getReelSymbolRenderable(sprite);
                if (sprite.isDepleted && String(symbol) === String(timeSymbolId)) {
                  if (gMove) gMove.setTexture(String(depletedSymbolId));
                  sprite.symbolKey = depletedSymbolId;
                } else {
                  this.setBonusAwareSymbolTexture(sprite, symbol);
                  sprite.symbolKey = symbol;
                }
                if (gMove) {
                  gMove.setScale(scale);
                }
                this.setReelCellGraphicDepth(sprite, depth);
                sprite.setVisible(true);
                sprite.setPosition(xStart, yStart);
                sprite.setAlpha(1);
                sprite.isDepleted = wasOldDepleted || false;
                if (Number(symbol) !== Number(trollId)) {
                  sprite.isTroll3x3 = false;
                }
              } else {
                // Fallback only when the original sprite is missing or unusable.
                let textureKey = this.getBonusAwareSymbolTextureKey(symbol);
                if (wasOldDepleted && String(symbol) === String(timeSymbolId)) {
                  textureKey = String(depletedSymbolId);
                }
    
                sprite = this.add.image(xStart, yStart, textureKey)
                  .setOrigin(0.5)
                  .setScale(scale)
                  .setDepth(depth)
                  .setAlpha(1);
                sprite.symbolKey = wasOldDepleted && String(symbol) === String(timeSymbolId)
                  ? normalizeSymbolKey(depletedSymbolId)
                  : normalizeSymbolKey(symbol);
                sprite.isDepleted = wasOldDepleted || false;
    
                if (Number(symbol) === Number(trollId)) {
                  sprite.isTroll3x3 = true;
                }
              }
            }
    
            // Animate horizontal movement (skip if sprite is null - part of 3x3 troll)
            if (sprite) {
              if (!sprite.isTroll3x3) {
                if (!newSpriteColumns[movementTargetReel]) {
                  newSpriteColumns[movementTargetReel] = new Array(clientConfig.area.height).fill(null);
                }
                newSpriteColumns[movementTargetReel][to] = sprite;
                this.ensureSymbolBonusGridBaseTbmOverlay(sprite, movementTargetReel, to, newSpriteColumns);
                sprite = newSpriteColumns[movementTargetReel][to];
              }
              this.tweens.killTweensOf(sprite);
              restoreReelCellVisibility(sprite);
              this.primeFeatureSymbolFloatingTilt(sprite, symbol);
              sprite.setY(yTarget); // Avoid tiny vertical drift when only X should animate.
              if (movementIsNoOp) {
                sprite.setPosition(xTarget, yTarget);
                restoreReelCellVisibility(sprite);
              } else {
                const dropPromise = new Promise(resolve => {
                  this.tweens.add({
                    targets: sprite,
                    x: xTarget,
                    duration: 400,
                    ease: 'Expo.easeOut',
                  onUpdate: () => {
                    restoreReelCellVisibility(sprite);
                  },
                  onComplete: () => {
                    restoreReelCellVisibility(sprite);
                    // Play landing sound for horizontal movement (once per row)
                    if (!playedRows.has(to)) {
                      playedRows.add(to);
                      const landSound = this.getLandingSoundByRow(to);
                      this.playLandingSoundIfNotPlaying(landSound, 0.3);
                    }
                    
                    // Play landing effect for powered time symbols (16, not depleted)
                    const timeSymId = clientConfig.symbolsMapping?.time || 16;
                    const depletedSymId = clientConfig.symbolsMapping?.time_depleted || 17;
                    
                    if (Array.isArray(timeSymbols) && timeSymbols.length > 0 && String(sprite.symbolKey) === String(timeSymId) && !sprite.isDepleted) {
                      this.playTimeSymbolLandingEffect(xTarget, yTarget);
                      
                      // Store sprite for depletion later (after suspense)
                      spritesToDeplete.push(sprite);
                      
                      // Remove the persistent power glow effect
                      this.fadeOutTimeSymbolPowerEffect(xTarget, yTarget);
                      
                      // Track which reel/row this was
                      const targetReel = toReel !== undefined ? toReel : reel;
                      timeSymbolsToProcess.push({ reel: targetReel, row: to, x: xTarget, y: yTarget });
                    }
                    resolve();
                  }
                });
              });
                promises.push(dropPromise);
              }
            } // End if (sprite)
          }
    
          // Store sprite in new position
          const targetReel = toReel !== undefined ? toReel : reel;
          if (!newSpriteColumns[targetReel]) {
            newSpriteColumns[targetReel] = new Array(clientConfig.area.height).fill(null);
          }
          
          // If this is a 3x3 troll, store the sprite reference in all 9 positions
          if (sprite && sprite.isTroll3x3) {
            const trollId = clientConfig.symbolsMapping?.banana3 || 13;
            const troll3x3Info = isPartOfTroll3x3(newReels, targetReel, to);
            if (troll3x3Info) {
              // Store sprite reference in all 9 cells of the 3x3
              for (let r = troll3x3Info.topLeftReel; r < troll3x3Info.topLeftReel + 3; r++) {
                for (let ro = troll3x3Info.topLeftRow; ro < troll3x3Info.topLeftRow + 3; ro++) {
                  if (!newSpriteColumns[r]) {
                    newSpriteColumns[r] = new Array(clientConfig.area.height).fill(null);
                  }
                  newSpriteColumns[r][ro] = sprite; // All 9 positions reference the same sprite
                }
              }
            }
          } else {
            newSpriteColumns[targetReel][to] = sprite;
          }
        }
    
        // Handle HOUSE positions (no sprite needed)
        if (newReels) {
          for (let reel = 0; reel < clientConfig.area.width; reel++) {
            const reelColumn = newReels[reel];
            if (!reelColumn) continue; // Skip if reel doesn't exist
            for (let row = 0; row < clientConfig.area.height; row++) {
              if (reelColumn[row] === 'HOUSE') {
                if (!newSpriteColumns[reel]) {
                  newSpriteColumns[reel] = new Array(clientConfig.area.height).fill(null);
                }
                newSpriteColumns[reel][row] = null;
              }
            }
          }
        }
    
        const inUseSprites = new Set();
        for (let reel = 0; reel < newSpriteColumns.length; reel++) {
          const column = newSpriteColumns[reel];
          if (!column) continue;
          for (let row = 0; row < column.length; row++) {
            const cell = column[row];
            if (!cell || cell.destroyed) continue;
            inUseSprites.add(cell);
            const renderable = getReelSymbolRenderable(cell);
            if (renderable && !renderable.destroyed) {
              inUseSprites.add(renderable);
            }
          }
        }
    
        // Clean up old sprites that are no longer used
        // BUT: Preserve stationary bananas (they stay in same position)
        
        for (let reel = 0; reel < clientConfig.area.width; reel++) {
          const oldColumn = this.reelSprites[reel] || [];
          for (let row = 0; row < oldColumn.length; row++) {
            const oldSprite = oldColumn[row];
            if (oldSprite && !oldSprite.destroyed) {
              // Destroy stale sprites that were already marked for destruction.
              if (oldSprite.isBeingDestroyed) {
                if (bananaDebugEnabled) {
                  console.warn("[banana-debug] old sprite flagged isBeingDestroyed during cleanup", {
                    reel,
                    row,
                    symbolKey: oldSprite.symbolKey,
                    newSymbol: newReels[reel]?.[row]
                  });
                }
                this.destroyBananaBackplate(oldSprite);
                oldSprite.destroy();
                continue;
              }
              
              // Check if this sprite is still being used (with safety check for undefined column)
              const newColumn = newSpriteColumns[reel] || [];
              const oldRenderable = getReelSymbolRenderable(oldSprite);
              const stillInUse =
                inUseSprites.has(oldSprite) ||
                (oldRenderable && inUseSprites.has(oldRenderable));
              
              // OR if it's a stationary banana in the same position
              const newSymbol = newReels[reel]?.[row];
              const shouldRemainPreservedSymbol = isStationaryPreservedTarget(reel, row);
              const isStationaryPreservedSymbol = (
                shouldRemainPreservedSymbol &&
                !newColumn[row]
              );
              
              if (shouldRemainPreservedSymbol && !stillInUse) {
                // Hard-preserve stationary blocking visuals while other symbols fall/spawn.
                this.tweens.killTweensOf(oldSprite);
                oldSprite.isBeingDestroyed = false;
                const gBan = getReelSymbolRenderable(oldSprite);
                if (gBan) {
                  gBan.setTexture(String(newSymbol));
                  gBan.setScale(getSymbolScale(newSymbol));
                }
                oldSprite.symbolKey = normalizeSymbolKey(newSymbol);
                this.setReelCellGraphicDepth(oldSprite, getBoardSymbolDepth(newSymbol));
                oldSprite.setPosition(
                  reel * cellSize + cellSize / 2 + GRID_OFFSET_X,
                  (clientConfig.area.height - 1 - row) * cellSize + cellSize / 2 + GRID_OFFSET_Y
                );
                oldSprite.setVisible(true);
                oldSprite.setAlpha(1);
                newSpriteColumns[reel][row] = oldSprite;
              } else if (!stillInUse && !isStationaryPreservedSymbol) {
                if (bananaDebugEnabled && (isBlockingGridSymbol(oldSprite.symbolKey) || shouldRemainPreservedSymbol)) {
                  console.warn("[banana-debug] destroying sprite during cleanup", {
                    reel,
                    row,
                    oldSymbolKey: oldSprite.symbolKey,
                    newSymbol
                  });
                }
                oldSprite.destroy();
              } else if (isStationaryPreservedSymbol) {
                // Preserve the stationary blocking sprite
                if (!newSpriteColumns[reel]) {
                  newSpriteColumns[reel] = new Array(clientConfig.area.height).fill(null);
                }
                newSpriteColumns[reel][row] = oldSprite;
              }
            }
          }
        }
    
        // Update sprite array
        this.reelSprites = newSpriteColumns;
        for (let reel = 0; reel < this.reelSprites.length; reel++) {
          const column = this.reelSprites[reel];
          if (!column) continue;
          for (let row = 0; row < column.length; row++) {
            const sprite = column[row];
            if (!sprite || sprite.destroyed) continue;
            sprite.setAlpha(1);
          }
        }
        logBananaStats("after-column-swap", this.reelSprites);
    
        const forceBlockingSymbolVisibility = () => {
          if (!this.reelSprites) return;
          for (let reel = 0; reel < this.reelSprites.length; reel++) {
            const column = this.reelSprites[reel];
            if (!column) continue;
            for (let row = 0; row < column.length; row++) {
              const sprite = column[row];
              if (!sprite || sprite.destroyed) continue;
              if (!isBlockingGridSymbol(sprite.symbolKey)) continue;
              restoreReelCellVisibility(sprite);
            }
          }
        };
    
        this.events.on('update', forceBlockingSymbolVisibility);
        forceBlockingSymbolVisibility();
        await Promise.all(promises);
        this.events.off('update', forceBlockingSymbolVisibility);
        forceBlockingSymbolVisibility();
        logBananaStats("after-drop-promises", this.reelSprites);
        if (isHorizontalGravity) {
          const houseId = clientConfig.symbolsMapping?.house || "HOUSE";
          const heroId = clientConfig.symbolsMapping?.hero || 10;
          const trollId = clientConfig.symbolsMapping?.banana3 || 13;
    
          for (let reel = 0; reel < clientConfig.area.width; reel++) {
            if (!this.reelSprites[reel]) {
              this.reelSprites[reel] = new Array(clientConfig.area.height).fill(null);
            }
    
            for (let row = 0; row < clientConfig.area.height; row++) {
              const symbol = newReels?.[reel]?.[row];
              if (symbol === undefined || symbol === houseId || symbol === heroId) {
                continue;
              }
    
              const x = reel * cellSize + cellSize / 2 + GRID_OFFSET_X;
              const y = (clientConfig.area.height - 1 - row) * cellSize + cellSize / 2 + GRID_OFFSET_Y;
              const scale = getSymbolScale(symbol);
              const depth = getBoardSymbolDepth(symbol);
              let cell = this.reelSprites[reel][row];
    
              if (!cell || cell.destroyed || !cell.scene) {
                const created = this.add.image(x, y, this.getBonusAwareSymbolTextureKey(symbol))
                  .setOrigin(0.5)
                  .setScale(scale)
                  .setDepth(depth)
                  .setAlpha(1);
                created.setVisible(true);
                created.symbolKey = normalizeSymbolKey(symbol);
                created.isDepleted = false;
                if (Number(symbol) === Number(trollId)) {
                  created.isTroll3x3 = true;
                }
                this.reelSprites[reel][row] = created;
                this.primeFeatureSymbolFloatingTilt(created, symbol);
                this.ensureSymbolBonusGridBaseTbmOverlay(created, reel, row, this.reelSprites);
                continue;
              }
    
              const graphic = getReelSymbolRenderable(cell);
              if (graphic && String(cell.symbolKey) !== String(symbol)) {
                this.setBonusAwareSymbolTexture(cell, symbol);
                graphic.setScale?.(scale);
                cell.symbolKey = normalizeSymbolKey(symbol);
                cell.isDepleted = false;
                if (Number(symbol) !== Number(trollId)) {
                  cell.isTroll3x3 = false;
                }
              } else if (graphic) {
                graphic.setScale?.(scale);
              }
    
              this.setReelCellGraphicDepth(cell, depth);
              cell.setPosition?.(x, y);
              restoreReelCellVisibility(cell);
              this.primeFeatureSymbolFloatingTilt(cell, symbol);
              this.ensureSymbolBonusGridBaseTbmOverlay(cell, reel, row, this.reelSprites);
            }
          }
        }
        // Gravity already rebuilt `reelSprites` into the final board state.
        // Avoid a second full sprite-grid sync here because that can destroy or
        // recreate settled symbols again and causes visible blinking between
        // avalanches/respins.
        for (let reel = 0; reel < clientConfig.area.width; reel++) {
          for (let row = 0; row < clientConfig.area.height; row++) {
            const sprite = this.reelSprites?.[reel]?.[row];
            if (!sprite || sprite.destroyed) continue;
    
            const x = reel * cellSize + cellSize / 2 + GRID_OFFSET_X;
            const y = (clientConfig.area.height - 1 - row) * cellSize + cellSize / 2 + GRID_OFFSET_Y;
            sprite.setPosition(x, y);
            restoreReelCellVisibility(sprite);
          }
        }
        this.refreshBonusMultiplierFruitOrbVisuals();
        logBananaStats("after-finalize", this.reelSprites);
        
        // Wait for suspense after hammer lightning strikes (waiting for Thor's answer)
        if (timeSymbolsToProcess.length > 0) {
          await new Promise(resolve => setTimeout(resolve, 1500));
        }
        
        // Check if any time symbol triggered bonus and play god's lightning response
        let bonusTriggered = false;
        if (timeSymbolsToProcess.length > 0 && timeSymbols && timeSymbols.length > 0) {
          for (const processed of timeSymbolsToProcess) {
            const timeSymbolData = timeSymbols.find(ts => ts.reel === processed.reel && ts.row === processed.row);
            if (timeSymbolData && timeSymbolData.bonus) {
              // This time symbol triggered bonus - god responds!
              // Additional wait for bonus (already waited 1500ms above)
              await new Promise(resolve => setTimeout(resolve, 250));
              await this.playBonusLightningStrike(); // Thor's response
              bonusTriggered = true;
              break; // Only play once even if multiple time symbols
            }
          }
        }
        
        // === Deplete all hammers with instant swap ===
        if (spritesToDeplete.length > 0) {
          const depletedSymbolId = clientConfig.symbolsMapping?.time_depleted || 17;
          
          if (bonusTriggered) {
            // Bonus triggered: deplete immediately after lightning (no delay)
            spritesToDeplete.forEach(sprite => {
              if (sprite && !sprite.destroyed) {
                sprite.setTexture(String(depletedSymbolId));
                sprite.symbolKey = depletedSymbolId;
                sprite.isDepleted = true;
              }
            });
          } else {
            // No bonus: wait 250ms then deplete
            await new Promise(resolve => setTimeout(resolve, 250));
            
            spritesToDeplete.forEach(sprite => {
              if (sprite && !sprite.destroyed) {
                sprite.setTexture(String(depletedSymbolId));
                sprite.symbolKey = depletedSymbolId;
                sprite.isDepleted = true;
              }
            });
          }
        }
    
        // Handle any remaining bananas without sprites (failsafe)
        for (let reel = 0; reel < clientConfig.area.width; reel++) {
          for (let row = 0; row < clientConfig.area.height; row++) {
            const symbol = newReels[reel]?.[row];
            const hasSprite = this.reelSprites[reel]?.[row];
            
            // If this position has a preserved blocking symbol but no sprite, create one.
            if ((isBanana(symbol) || this.isPersistentBonusFeatureSymbol(symbol)) && !hasSprite) {
              const x = reel * cellSize + cellSize / 2 + GRID_OFFSET_X;
              const y = (clientConfig.area.height - 1 - row) * cellSize + cellSize / 2 + GRID_OFFSET_Y;
              
              const preservedSprite = this.add.image(x, y, String(symbol))
                .setOrigin(0.5)
                .setScale(getSymbolScale(symbol))
                .setDepth(getBoardSymbolDepth(symbol));
              preservedSprite.symbolKey = normalizeSymbolKey(symbol);
              this.primeFeatureSymbolFloatingTilt(preservedSprite, symbol);
    
              this.reelSprites[reel][row] = preservedSprite;
            }
          }
        }
    
        // Ensure house and hero are always on top after gravity
        // Note: Bananas are now regular animated sprites
        this.createOrUpdateHouse(this.currentMultiplier || 1);
        this.createOrUpdateHero(newReels);
        
        // Re-apply depleted state to any sprites marked as depleted (survives position changes)
        // Also update position tracking for next dropSymbols call
        const depletedSymbolId = clientConfig.symbolsMapping?.time_depleted || 17;
        
        // Clear old positions and rebuild from current sprite positions
        if (this.depletedTimeSymbols) {
          this.depletedTimeSymbols.clear();
        } else {
          this.depletedTimeSymbols = new Set();
        }
        
        for (let reel = 0; reel < this.reelSprites.length; reel++) {
          const column = this.reelSprites[reel];
          if (!column) continue;
          
          for (let row = 0; row < column.length; row++) {
            const sprite = column[row];
            if (sprite && sprite.isDepleted) {
              // Ensure texture is the depleted version (in case it wasn't swapped yet)
              sprite.setTexture(String(depletedSymbolId));
              sprite.symbolKey = depletedSymbolId;
              // Update position tracking with new position
              this.depletedTimeSymbols.add(`${reel},${row}`);
            }
          }
        }
        
        // Refresh all banana backplates after gravity
        this.refreshAllBananaBackplates();
        this.syncBonusMysteryFeatureSpinState();
      },

    async playFreespinSmashSymbolClear({
        heroPosition = null,
        heroFootprintSize = null,
        weapon = null
      } = {}) {
        if (!this.reelSprites) return false;
    
        const symbolEntries = [];
        const preservedFeatureSprites = [];
        const visitedSprites = new Set();
        for (let reel = 0; reel < this.reelSprites.length; reel++) {
          const column = this.reelSprites[reel];
          if (!column) continue;
          for (let row = 0; row < column.length; row++) {
            const sprite = column[row];
            if (!sprite || sprite.destroyed || sprite.isBeingDestroyed || visitedSprites.has(sprite)) continue;
            visitedSprites.add(sprite);
            const symbolId = this.getDisplayObjectSymbolId(sprite);
            if (this.isPersistentBonusFeatureSymbol(symbolId)) {
              const { x, y } = this.getGridCellCenter(reel, row);
              this.tweens.killTweensOf(sprite);
              sprite.isBeingDestroyed = false;
              sprite.setPosition?.(x, y);
              sprite.setVisible?.(true);
              sprite.setAlpha?.(1);
              this.setReelCellGraphicDepth(sprite, getBoardSymbolDepth(symbolId));
              preservedFeatureSprites.push({ sprite, reel, row });
              continue;
            }
            symbolEntries.push({
              sprite,
              reel,
              row,
              x: Number(sprite.x) || this.getGridCellCenter(reel, row).x,
              y: Number(sprite.y) || this.getGridCellCenter(reel, row).y
            });
          }
        }
    
        if (symbolEntries.length === 0) {
          return preservedFeatureSprites.length > 0;
        }
    
        const hasHeroPosition =
          heroPosition &&
          Number.isFinite(Number(heroPosition.reel)) &&
          Number.isFinite(Number(heroPosition.row));
        const footprintSize = Math.max(
          1,
          Math.floor(Number(heroFootprintSize ?? this.currentHeroFootprintSize) || 1)
        );
        this.currentHeroFootprintSize = footprintSize;
        if (hasHeroPosition) {
          this.currentHeroAnchor = {
            reel: Number(heroPosition.reel),
            row: Number(heroPosition.row)
          };
        }
    
        const fallbackAnchor = this.currentHeroAnchor &&
          Number.isFinite(Number(this.currentHeroAnchor.reel)) &&
          Number.isFinite(Number(this.currentHeroAnchor.row))
            ? this.currentHeroAnchor
            : (clientConfig.heroStartingPosition || { reel: 4, row: 2 });
        const smashCenter = hasHeroPosition
          ? this.getHeroAnchorCenter(Number(heroPosition.reel), Number(heroPosition.row), footprintSize)
          : (
            this.heroSprite && !this.heroSprite.destroyed
              ? { x: this.heroSprite.x, y: this.heroSprite.y }
              : this.getHeroAnchorCenter(Number(fallbackAnchor.reel) || 4, Number(fallbackAnchor.row) || 2, footprintSize)
          );
    
        const resolvedWeapon = weapon || this.currentHeroWeapon || "staff";
        const heroTexture = getHeroTexture(resolvedWeapon, {
          footprintSize,
          rushActive: this.currentHeroRushActive === true,
          bonusStage: this.currentBonusStage
        });
        const heroScale = getHeroScaleForFootprint(footprintSize, heroTexture);
        this.currentHeroWeapon = resolvedWeapon;
        this.currentHeroTextureKey = heroTexture;
    
        if (!this.heroSprite || this.heroSprite.destroyed) {
          this.heroSprite = this.add.image(smashCenter.x, smashCenter.y - 18, heroTexture)
            .setOrigin(0.5)
            .setScale(heroScale * 0.92)
            .setDepth(DEPTH_HERO + 8)
            .setAlpha(0);
        }
    
        const hero = this.heroSprite;
        this.tweens.killTweensOf(hero);
        hero
          .setTexture(heroTexture)
          .setDepth(DEPTH_HERO + 8)
          .setAlpha(Math.max(hero.alpha ?? 1, 0.01));
    
        this.tweens.add({
          targets: hero,
          x: smashCenter.x,
          y: smashCenter.y,
          alpha: 1,
          scaleX: heroScale,
          scaleY: heroScale,
          duration: 160,
          ease: 'Sine.easeOut'
        });
    
        const boardLeft = GRID_OFFSET_X;
        const boardTop = GRID_OFFSET_Y;
        const boardRight = GRID_OFFSET_X + clientConfig.area.width * 70;
        const boardBottom = GRID_OFFSET_Y + clientConfig.area.height * 70;
        const visualPower = 0.7;
        const maxRadius = Math.max(
          Phaser.Math.Distance.Between(smashCenter.x, smashCenter.y, boardLeft, boardTop),
          Phaser.Math.Distance.Between(smashCenter.x, smashCenter.y, boardRight, boardTop),
          Phaser.Math.Distance.Between(smashCenter.x, smashCenter.y, boardLeft, boardBottom),
          Phaser.Math.Distance.Between(smashCenter.x, smashCenter.y, boardRight, boardBottom)
        ) + 35;
        const chargeColors = [0xFFF6A8, 0xFFD24A, 0xFFFFFF];
        const chargeBeatDelay = 270;
        this.playSfx?.("freespin_smash_prepulse", { volume: 0.62 });
        this.time.delayedCall(190, () => {
          this.playSfx?.("symbol_clear_addition", { volume: 0.48 });
        });
    
        const spawnChargePulse = (beatIndex) => {
          const pulse = this.add.circle(smashCenter.x, smashCenter.y, (26 + beatIndex * 5) * visualPower, 0xFFF1A8, 0)
            .setStrokeStyle((5 + beatIndex) * visualPower, chargeColors[beatIndex % chargeColors.length], 0.72 * visualPower)
            .setDepth(DEPTH_HERO + 5)
            .setBlendMode(Phaser.BlendModes.ADD)
            .setScale(1.55);
          this.tweens.add({
            targets: pulse,
            scale: 0.32,
            alpha: 0,
            duration: 185,
            ease: 'Cubic.easeIn',
            onComplete: () => pulse.destroy()
          });
    
          const halo = this.add.circle(smashCenter.x, smashCenter.y, 18 * visualPower, 0xFFE680, 0.22 * visualPower)
            .setDepth(DEPTH_HERO + 4)
            .setBlendMode(Phaser.BlendModes.ADD)
            .setScale(0.7);
          this.tweens.add({
            targets: halo,
            scale: 1.55 + beatIndex * 0.25,
            alpha: 0,
            duration: 210,
            ease: 'Quad.easeOut',
            onComplete: () => halo.destroy()
          });
    
          for (let i = 0; i < 11; i++) {
            const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
            const distance = Phaser.Math.Between(56, 118 + beatIndex * 16);
            const spark = this.add.circle(
              smashCenter.x + Math.cos(angle) * distance,
              smashCenter.y + Math.sin(angle) * distance,
              Phaser.Math.FloatBetween(1.4, 3.1),
              chargeColors[Phaser.Math.Between(0, chargeColors.length - 1)],
              0.82 * visualPower
            )
              .setDepth(DEPTH_HERO + 7)
              .setBlendMode(Phaser.BlendModes.ADD);
            this.tweens.add({
              targets: spark,
              x: smashCenter.x + Math.cos(angle) * Phaser.Math.Between(14, 34),
              y: smashCenter.y + Math.sin(angle) * Phaser.Math.Between(14, 34),
              alpha: 0,
              scale: 0.2,
              duration: Phaser.Math.Between(170, 260),
              ease: 'Cubic.easeIn',
              onComplete: () => spark.destroy()
            });
          }
    
          this.tweens.add({
            targets: hero,
            y: smashCenter.y + 5 + beatIndex * 3,
            scaleX: heroScale * (1.08 + beatIndex * 0.035),
            scaleY: heroScale * (0.92 - beatIndex * 0.035),
            duration: 82,
            yoyo: true,
            ease: 'Sine.easeInOut'
          });
        };
    
        for (let beat = 0; beat < 3; beat++) {
          spawnChargePulse(beat);
          await this.waitForPresentation(chargeBeatDelay, { useSceneTime: true });
        }
    
        await new Promise((resolve) => {
          this.tweens.add({
            targets: hero,
            y: smashCenter.y - 26,
            scaleX: heroScale * 0.88,
            scaleY: heroScale * 1.16,
            duration: 110,
            ease: 'Quad.easeOut',
            onComplete: resolve
          });
        });
    
        await new Promise((resolve) => {
          this.tweens.add({
            targets: hero,
            y: smashCenter.y + 24,
            scaleX: heroScale * 1.28,
            scaleY: heroScale * 0.68,
            duration: 76,
            ease: 'Quad.easeIn',
            onComplete: resolve
          });
        });
    
        this.flushPendingBonusFreespinRingConsume({ consumeDelay: 0 });
        this.playSfx?.("freespin_smash_activated", { volume: 0.58 });
        this.playSfx?.("freespin_smash_second", { volume: 0.48 });
        this.cameras?.main?.shake(165, 0.0065);
    
        this.tweens.add({
          targets: hero,
          y: smashCenter.y,
          scaleX: heroScale,
          scaleY: heroScale,
          duration: 260,
          ease: 'Back.easeOut'
        });
    
        const groundFlash = this.add.circle(smashCenter.x, smashCenter.y + 18, 36, 0xFFF3B0, 0.43)
          .setDepth(DEPTH_HERO + 6)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setScale(0.35);
        this.tweens.add({
          targets: groundFlash,
          scale: 1.65,
          alpha: 0,
          duration: 260,
          ease: 'Cubic.easeOut',
          onComplete: () => groundFlash.destroy()
        });
    
        const waveDuration = 610;
        this.playHeroLightningLevelUpBurst({ x: smashCenter.x, y: smashCenter.y, heroFootprintSize: footprintSize }, {
          heroFootprintSize: footprintSize,
          intensity: "major",
          preferHeroSprite: false,
          boltCount: 10,
          durationMs: waveDuration,
          depth: DEPTH_HERO + 8,
          boltLengthScale: 1.05,
          boltSizeScale: 0.82,
          flashScale: 0.72,
          flashAlphaScale: 0.68
        });
        this.time.delayedCall(145, () => {
          this.playHeroLightningLevelUpBurst({ x: smashCenter.x, y: smashCenter.y, heroFootprintSize: footprintSize }, {
            heroFootprintSize: footprintSize,
            intensity: "medium",
            preferHeroSprite: false,
            boltCount: 6,
            durationMs: 360,
            depth: DEPTH_HERO + 8.2,
            boltLengthScale: 0.74,
            boltSizeScale: 0.7,
            flashScale: 0.48,
            flashAlphaScale: 0.42
          });
        });
        const waveFill = this.add.circle(smashCenter.x, smashCenter.y, 38, 0xFFD85A, 0.08)
          .setDepth(DEPTH_HERO + 2)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setScale(0.2);
        this.tweens.add({
          targets: waveFill,
          scale: maxRadius / 38,
          alpha: 0,
          duration: waveDuration,
          ease: 'Cubic.easeOut',
          onComplete: () => waveFill.destroy()
        });
    
        [
          { delay: 0, radius: 36, color: 0xFFFFFF, width: 7, alpha: 0.64, scaleBoost: 1 },
          { delay: 48, radius: 42, color: 0xFFD24A, width: 6, alpha: 0.55, scaleBoost: 0.92 },
          { delay: 96, radius: 48, color: 0xFF8E2B, width: 4, alpha: 0.41, scaleBoost: 0.82 }
        ].forEach((spec) => {
          const ring = this.add.circle(smashCenter.x, smashCenter.y, spec.radius, spec.color, 0)
            .setStrokeStyle(spec.width, spec.color, spec.alpha)
            .setDepth(DEPTH_HERO + 4)
            .setBlendMode(Phaser.BlendModes.ADD)
            .setScale(0.16);
          this.tweens.add({
            targets: ring,
            scale: (maxRadius / spec.radius) * spec.scaleBoost,
            alpha: 0,
            delay: spec.delay,
            duration: waveDuration,
            ease: 'Cubic.easeOut',
            onComplete: () => ring.destroy()
          });
        });
    
        let nextSymbolExplosionSfxAt = 0;
        const playSymbolExplosionSfx = () => {
          const now = Number(this.time?.now) || Date.now();
          if (now < nextSymbolExplosionSfxAt) return;
    
          const soundIndex = Phaser.Math.Between(1, 3);
          this.playSfx?.(`freespin_smash_symbol_explosion_${soundIndex}`, { volume: 0.32 });
          nextSymbolExplosionSfxAt = now + Phaser.Math.Between(45, 75);
        };
    
        const incinerateSymbol = (entry) => {
          const { sprite, reel, row, x, y } = entry;
          if (!sprite || sprite.destroyed || sprite.isBeingDestroyed) return;
    
          sprite.isBeingDestroyed = true;
          playSymbolExplosionSfx();
          this.tweens.killTweensOf(sprite);
          this.destroyBananaBackplate(sprite);
          if (this.reelSprites?.[reel]?.[row] === sprite) {
            this.reelSprites[reel][row] = null;
          }
    
          const flash = this.add.circle(x, y, 21, 0xFFF7C2, 0.45)
            .setDepth(DEPTH_HERO + 6)
            .setBlendMode(Phaser.BlendModes.ADD);
          this.tweens.add({
            targets: flash,
            scale: 1.35,
            alpha: 0,
            duration: 180,
            ease: 'Quad.easeOut',
            onComplete: () => flash.destroy()
          });
          this.playMonkeySymbolClearLightningBurst(x, y, {
            depth: DEPTH_HERO + 7.2,
            radius: 28,
            boltCount: 2,
            color: 0xFFE778,
            intensityScale: 0.48
          });
    
          for (let i = 0; i < 5; i++) {
            const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
            const distance = Phaser.Math.Between(14, 38);
            const ember = this.add.circle(
              x + Phaser.Math.Between(-8, 8),
              y + Phaser.Math.Between(-8, 8),
              Phaser.Math.FloatBetween(1.2, 2.7),
              i % 2 === 0 ? 0xFFD24A : 0xFFFFFF,
              0.62
            )
              .setDepth(DEPTH_HERO + 7)
              .setBlendMode(Phaser.BlendModes.ADD);
            this.tweens.add({
              targets: ember,
              x: x + Math.cos(angle) * distance,
              y: y + Math.sin(angle) * distance - Phaser.Math.Between(10, 34),
              alpha: 0,
              scale: 0.2,
              duration: Phaser.Math.Between(210, 360),
              ease: 'Cubic.easeOut',
              onComplete: () => ember.destroy()
            });
          }
    
          const currentScaleX = Number(sprite.scaleX) || normalScale;
          const currentScaleY = Number(sprite.scaleY) || normalScale;
          this.tweens.add({
            targets: sprite,
            alpha: 0,
            scaleX: currentScaleX * 0.18,
            scaleY: currentScaleY * 0.18,
            angle: (Number(sprite.angle) || 0) + Phaser.Math.Between(-42, 42),
            duration: 190,
            ease: 'Back.easeIn',
            onComplete: () => {
              if (!sprite.destroyed) {
                sprite.destroy();
              }
            }
          });
        };
    
        symbolEntries.forEach((entry) => {
          const distance = Phaser.Math.Distance.Between(smashCenter.x, smashCenter.y, entry.x, entry.y);
          const delay = Math.max(0, Math.min(waveDuration - 90, (distance / maxRadius) * (waveDuration * 0.78)));
          this.time.delayedCall(delay, () => incinerateSymbol(entry));
        });
    
        await this.waitForPresentation(waveDuration + 230, { useSceneTime: true });
    
        symbolEntries.forEach((entry) => {
          const { sprite } = entry;
          if (!sprite || sprite.destroyed) return;
          this.destroyBananaBackplate(sprite);
          sprite.destroy();
        });
        const preservedReelSprites = [];
        preservedFeatureSprites.forEach(({ sprite, reel, row }) => {
          if (!sprite || sprite.destroyed) return;
          if (!preservedReelSprites[reel]) {
            preservedReelSprites[reel] = [];
          }
          preservedReelSprites[reel][row] = sprite;
        });
        this.reelSprites = preservedReelSprites;
        this.syncBonusMysteryFeatureSpinState();
        this.createOrUpdateBoardShadowOverlay();
        if (hero && !hero.destroyed) {
          hero
            .setDepth(DEPTH_HERO)
            .setPosition(smashCenter.x, smashCenter.y)
            .setScale(heroScale)
            .setAlpha(1)
            .clearTint();
        }
    
        return true;
      },

    async slideOutOldSymbols() {
        if (!this.reelSprites) return;
    
        const slideDistance = 500;
        const slideDuration = 200;
        const cellSize = 70;
        const promises = [];
        const dropDelayPerSymbol = 2;
        let iteration = 0;
    
        for (let reelIndex = 0; reelIndex < this.reelSprites.length; reelIndex++) {
          const reel = this.reelSprites[reelIndex];
          if (!reel) continue;
    
          for (let row = 0; row < reel.length; row++) {
            const sprite = reel[row];
            if (!sprite || sprite.destroyed || sprite.isBeingDestroyed) continue; // Skip destroyed or being-destroyed sprites
    
            iteration++;
    
            const tween = new Promise(resolve => {
              this.tweens.add({
                targets: sprite,
                y: sprite.y + slideDistance,
                ease: 'Cubic.easeIn',
                duration: slideDuration - reelIndex * 5,
                delay: iteration * dropDelayPerSymbol + reelIndex * 50,
                onUpdate: () => {
                  if (sprite.destroyed) return;
                  if (typeof this.applySymbolSpawnFadeToCell === "function") {
                    this.applySymbolSpawnFadeToCell(sprite);
                  }
                },
                onComplete: () => {
                  // Safety check - sprite might already be destroyed
                  if (!sprite.destroyed) {
                    this.destroyBananaBackplate(sprite); // Clean up backplate if banana
                    sprite.destroy();
                  }
                  resolve();
                }
              });
            });
    
            promises.push(tween);
          }
        }
    
        await Promise.all(promises);
        
        // Clear references AFTER all animations complete
        this.reelSprites = [];
      }
  };
}
