/**
 * Core LayoutManager
 * - Automatic, content-driven layout solver.
 * - Fits GameScene "mustSeeBounds" into the safe viewport and returns free UI areas.
 * - No ratio/profile branching: same logic for every device.
 */
class LayoutManager {
  constructor({ baseCanvas, safePadding, defaultGameContent, ui }) {
    this.baseCanvas = baseCanvas || { width: 530, height: 785 };
    this.safePadding = safePadding || { top: 0, right: 0, bottom: 0, left: 0 };
    this.defaultGameContent = defaultGameContent || {
      mustSeeBounds: { x: 0, y: 0, width: this.baseCanvas.width, height: this.baseCanvas.height },
      freeArea: {}
    };
    this.ui = ui || {
      minScale: 0.8,
      maxScale: 1.1,
      baseBottomRowHeight: 112
    };
  }

  compute({ viewportWidth, viewportHeight, safeInsets, gameContent }) {
    const safePadding = this.mergeSafePadding(this.safePadding, safeInsets);
    const safeRect = this.computeSafeRect(viewportWidth, viewportHeight, safePadding);
    const normalizedContent = this.normalizeGameContent(gameContent);
    const gameRect = this.computeGameRect(safeRect, normalizedContent.mustSeeBounds, normalizedContent.freeArea);
    const freeAreas = this.computeFreeAreas(safeRect, gameRect);
    const uiScale = this.computeUiScale(freeAreas.bottom.height);

    return {
      viewport: { width: viewportWidth, height: viewportHeight },
      safePadding,
      safeRect,
      gameRect,
      freeAreas,
      mustSeeBounds: normalizedContent.mustSeeBounds,
      uiScale
    };
  }

  computeSafeRect(width, height, padding = {}) {
    const top = padding.top ?? 0;
    const right = padding.right ?? 0;
    const bottom = padding.bottom ?? 0;
    const left = padding.left ?? 0;

    return {
      x: left,
      y: top,
      width: Math.max(0, width - left - right),
      height: Math.max(0, height - top - bottom)
    };
  }

  mergeSafePadding(configPadding = {}, runtimeSafeInsets = {}) {
    return {
      top: Math.max(configPadding.top ?? 0, runtimeSafeInsets.top ?? 0),
      right: Math.max(configPadding.right ?? 0, runtimeSafeInsets.right ?? 0),
      bottom: Math.max(configPadding.bottom ?? 0, runtimeSafeInsets.bottom ?? 0),
      left: Math.max(configPadding.left ?? 0, runtimeSafeInsets.left ?? 0)
    };
  }

  normalizeGameContent(gameContent) {
    const source = gameContent || this.defaultGameContent;
    const mustSeeBounds = source?.mustSeeBounds || this.defaultGameContent.mustSeeBounds;
    const freeArea = source?.freeArea || {};

    return {
      mustSeeBounds: {
        x: Number(mustSeeBounds.x) || 0,
        y: Number(mustSeeBounds.y) || 0,
        width: Math.max(1, Number(mustSeeBounds.width) || this.baseCanvas.width),
        height: Math.max(1, Number(mustSeeBounds.height) || this.baseCanvas.height)
      },
      freeArea: {
        minBottomPx: Math.max(0, Number(freeArea.minBottomPx) || 0),
        minTopPx: Math.max(0, Number(freeArea.minTopPx) || 0),
        minLeftPx: Math.max(0, Number(freeArea.minLeftPx) || 0),
        minRightPx: Math.max(0, Number(freeArea.minRightPx) || 0),
        fitPaddingPx: Math.max(0, Number(freeArea.fitPaddingPx) || 0)
      }
    };
  }

  computeGameRect(safeRect, mustSeeBounds, freeArea = {}) {
    const fitPaddingPx = freeArea.fitPaddingPx ?? 0;
    const reservedTop = freeArea.minTopPx ?? 0;
    const reservedBottom = freeArea.minBottomPx ?? 0;
    const reservedLeft = freeArea.minLeftPx ?? 0;
    const reservedRight = freeArea.minRightPx ?? 0;
    const contentAspect = mustSeeBounds.width / Math.max(1, mustSeeBounds.height);

    const usable = {
      x: safeRect.x + fitPaddingPx + reservedLeft,
      y: safeRect.y + fitPaddingPx + reservedTop,
      width: Math.max(1, safeRect.width - fitPaddingPx * 2 - reservedLeft - reservedRight),
      height: Math.max(1, safeRect.height - fitPaddingPx * 2 - reservedTop - reservedBottom)
    };

    const scale = Math.min(usable.width / mustSeeBounds.width, usable.height / mustSeeBounds.height);
    const width = Math.max(1, mustSeeBounds.width * Math.max(0.0001, scale));
    const height = Math.max(1, width / contentAspect);
    const x = usable.x + (usable.width - width) / 2;
    const y = usable.y + (usable.height - height) / 2;

    return { x, y, width, height };
  }

  computeFreeAreas(safeRect, gameRect) {
    const topHeight = Math.max(0, gameRect.y - safeRect.y);
    const bottomHeight = Math.max(0, safeRect.y + safeRect.height - (gameRect.y + gameRect.height));
    const leftWidth = Math.max(0, gameRect.x - safeRect.x);
    const rightWidth = Math.max(0, safeRect.x + safeRect.width - (gameRect.x + gameRect.width));

    return {
      top: { x: safeRect.x, y: safeRect.y, width: safeRect.width, height: topHeight },
      bottom: { x: safeRect.x, y: safeRect.y + safeRect.height - bottomHeight, width: safeRect.width, height: bottomHeight },
      left: { x: safeRect.x, y: gameRect.y, width: leftWidth, height: gameRect.height },
      right: { x: safeRect.x + safeRect.width - rightWidth, y: gameRect.y, width: rightWidth, height: gameRect.height }
    };
  }

  computeUiScale(bottomFreeAreaHeight) {
    const base = Math.max(1, this.ui.baseBottomRowHeight || 112);
    const raw = bottomFreeAreaHeight / base;
    const min = this.ui.minScale ?? 0.8;
    const max = this.ui.maxScale ?? 1.1;
    return Math.max(min, Math.min(max, raw));
  }
}

export default LayoutManager;
