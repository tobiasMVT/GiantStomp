import Phaser from "phaser";

const H_ALIGN_TO_ORIGIN = {
  left: 0,
  center: 0.5,
  right: 1
};

const V_ALIGN_TO_ORIGIN = {
  top: 0,
  middle: 0.5,
  bottom: 1
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function toInt(value, fallback) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeText(value) {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value);
}

function normalizeBounds(bounds) {
  const b = bounds || {};
  return {
    x: Number(b.x) || 0,
    y: Number(b.y) || 0,
    width: Math.max(0, Number(b.width) || 0),
    height: Math.max(0, Number(b.height) || 0)
  };
}

function normalizePadding(padding) {
  if (typeof padding === "number") {
    const n = Math.max(0, padding);
    return { top: n, right: n, bottom: n, left: n };
  }

  const p = padding || {};
  return {
    top: Math.max(0, Number(p.top) || 0),
    right: Math.max(0, Number(p.right) || 0),
    bottom: Math.max(0, Number(p.bottom) || 0),
    left: Math.max(0, Number(p.left) || 0)
  };
}

function normalizeHAlign(value) {
  if (value === "left" || value === "center" || value === "right") {
    return value;
  }
  return "center";
}

function normalizeVAlign(value) {
  if (value === "top" || value === "middle" || value === "bottom") {
    return value;
  }
  return "middle";
}

function normalizeEllipsis(ellipsis) {
  if (!ellipsis) {
    return {
      enabled: false,
      token: "...",
      preserveWords: true
    };
  }

  if (ellipsis === true) {
    return {
      enabled: true,
      token: "...",
      preserveWords: true
    };
  }

  const token = typeof ellipsis.token === "string" && ellipsis.token.length > 0
    ? ellipsis.token
    : "...";

  return {
    enabled: ellipsis.enabled !== false,
    token,
    preserveWords: ellipsis.preserveWords !== false
  };
}

export default class ResponsiveTextBox {
  constructor(scene, config = {}) {
    if (!scene) {
      throw new Error("ResponsiveTextBox requires a Phaser scene.");
    }

    this.scene = scene;
    this.bounds = normalizeBounds(config.bounds);
    this.padding = normalizePadding(config.padding);
    this.minFontSize = Math.max(1, toInt(config.minFontSize, 10));
    this.maxFontSize = Math.max(this.minFontSize, toInt(config.maxFontSize, 64));
    this.hAlign = normalizeHAlign(config.hAlign || "center");
    this.vAlign = normalizeVAlign(config.vAlign || "middle");
    this.wrap = config.wrap !== false;
    this.useAdvancedWrap = !!config.useAdvancedWrap;
    this.roundPixels = config.roundPixels !== false;
    this.roundFn = typeof config.roundFn === "function" ? config.roundFn : Math.round;
    this.ellipsis = normalizeEllipsis(config.ellipsis);
    this.visibleWhenEmpty = !!config.visibleWhenEmpty;

    this.baseStyle = {
      ...(config.style || {})
    };
    delete this.baseStyle.fontSize;

    this._text = normalizeText(config.text);
    this.lastLayout = null;

    this.textObject = scene.add.text(0, 0, this._text, {
      ...this.baseStyle,
      fontSize: `${this.maxFontSize}px`,
      align: this.hAlign
    });
    this.textObject.setOrigin(0, 0);
    this.textObject.setScale(1, 1);

    if (Number.isFinite(config.depth)) {
      this.textObject.setDepth(config.depth);
    }

    const resolution = Number.isFinite(config.resolution)
      ? config.resolution
      : Math.min(3, Math.max(1, window.devicePixelRatio || 1));
    if (typeof this.textObject.setResolution === "function") {
      this.textObject.setResolution(resolution);
    }

    if (config.name) {
      this.textObject.name = config.name;
    }

    this.textObject._responsiveBox = this;
    this.textObject._isBitmap = false;
    this.textObject._crispRes = 1;

    if (config.parentContainer && typeof config.parentContainer.add === "function") {
      config.parentContainer.add(this.textObject);
    }

    this._onScaleResize = this._onScaleResize.bind(this);
    this.relayoutOnResize = config.relayoutOnResize !== false;
    if (this.relayoutOnResize && this.scene.scale) {
      this.scene.scale.on(Phaser.Scale.Events.RESIZE, this._onScaleResize, this);
    }

    this.layout();
  }

  get displayObject() {
    return this.textObject;
  }

  setText(value, relayout = true) {
    this._text = normalizeText(value);
    if (relayout) {
      this.layout();
    }
    return this;
  }

  setBounds(bounds, relayout = true) {
    this.bounds = normalizeBounds(bounds);
    if (relayout) {
      this.layout();
    }
    return this;
  }

  setStyle(style = {}, relayout = true) {
    this.baseStyle = {
      ...this.baseStyle,
      ...style
    };
    delete this.baseStyle.fontSize;
    if (relayout) {
      this.layout();
    }
    return this;
  }

  setVisible(visible) {
    if (this.textObject && !this.textObject.destroyed) {
      this.textObject.setVisible(visible);
    }
    return this;
  }

  layout() {
    if (!this.textObject || this.textObject.destroyed) {
      return null;
    }

    const inner = this._getInnerRect();
    if (inner.width <= 0 || inner.height <= 0) {
      this.textObject.setText("");
      this.textObject.setVisible(false);
      this.lastLayout = {
        fontSize: this.minFontSize,
        text: "",
        truncated: false,
        fits: false,
        measuredWidth: 0,
        measuredHeight: 0,
        innerRect: inner
      };
      return this.lastLayout;
    }

    let finalText = this._text;
    let truncated = false;
    let bestFontSize = this._findBestFontSize(finalText, inner.width, inner.height);
    if (bestFontSize === 0) {
      bestFontSize = this.minFontSize;
      this._applyTextState(finalText, bestFontSize, inner.width);
      if (!this._fitsWithin(inner.width, inner.height) && this.ellipsis.enabled) {
        const trunc = this._truncateToFitWithEllipsis(finalText, inner.width, inner.height);
        finalText = trunc.text;
        truncated = trunc.truncated;
      }
    }

    this._applyTextState(finalText, bestFontSize, inner.width);
    this._placeText(inner);

    const fits = this._fitsWithin(inner.width, inner.height);
    const visible = this.visibleWhenEmpty || finalText.length > 0;
    this.textObject.setVisible(visible);

    this.lastLayout = {
      fontSize: bestFontSize,
      text: finalText,
      truncated,
      fits,
      measuredWidth: this.textObject.width,
      measuredHeight: this.textObject.height,
      innerRect: inner
    };
    return this.lastLayout;
  }

  destroy() {
    if (this.scene?.scale) {
      this.scene.scale.off(Phaser.Scale.Events.RESIZE, this._onScaleResize, this);
    }
    if (this.textObject && !this.textObject.destroyed) {
      this.textObject.destroy();
    }
    this.textObject = null;
    this.lastLayout = null;
  }

  _onScaleResize() {
    this.layout();
  }

  _round(value) {
    if (!this.roundPixels) {
      return value;
    }
    return this.roundFn(value);
  }

  _getInnerRect() {
    return {
      x: this.bounds.x + this.padding.left,
      y: this.bounds.y + this.padding.top,
      width: Math.max(0, this.bounds.width - this.padding.left - this.padding.right),
      height: Math.max(0, this.bounds.height - this.padding.top - this.padding.bottom)
    };
  }

  _applyTextState(text, fontSize, wrapWidth) {
    const clampedFont = clamp(Math.floor(fontSize), this.minFontSize, this.maxFontSize);
    this.textObject.setStyle({
      ...this.baseStyle,
      fontSize: `${clampedFont}px`,
      align: this.hAlign
    });
    if (this.wrap && wrapWidth > 0) {
      this.textObject.setWordWrapWidth(Math.floor(wrapWidth), this.useAdvancedWrap);
    } else {
      this.textObject.setWordWrapWidth(0, this.useAdvancedWrap);
    }
    this.textObject.setText(text);
    this.textObject.setScale(1, 1);
  }

  _fitsWithin(maxWidth, maxHeight) {
    return this.textObject.width <= maxWidth + 0.01
      && this.textObject.height <= maxHeight + 0.01;
  }

  _findBestFontSize(text, maxWidth, maxHeight) {
    if (!text || text.length === 0) {
      return this.maxFontSize;
    }

    let low = this.minFontSize;
    let high = this.maxFontSize;
    let best = 0;

    while (low <= high) {
      const mid = (low + high) >> 1;
      this._applyTextState(text, mid, maxWidth);
      if (this._fitsWithin(maxWidth, maxHeight)) {
        best = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    return best;
  }

  _truncateToFitWithEllipsis(text, maxWidth, maxHeight) {
    const token = this.ellipsis.token || "...";
    this._applyTextState(token, this.minFontSize, maxWidth);
    if (!this._fitsWithin(maxWidth, maxHeight)) {
      return { text: "", truncated: true };
    }

    let low = 0;
    let high = text.length;
    let bestText = token;

    while (low <= high) {
      const mid = (low + high) >> 1;
      const candidate = this._buildEllipsisCandidate(text, mid, token);
      this._applyTextState(candidate, this.minFontSize, maxWidth);
      if (this._fitsWithin(maxWidth, maxHeight)) {
        bestText = candidate;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    return {
      text: bestText,
      truncated: bestText !== text
    };
  }

  _buildEllipsisCandidate(text, keepCount, token) {
    if (keepCount >= text.length) {
      return text;
    }

    let kept = text.slice(0, keepCount);
    if (this.ellipsis.preserveWords && kept.length > 0) {
      const breakAt = Math.max(
        kept.lastIndexOf(" "),
        kept.lastIndexOf("\n"),
        kept.lastIndexOf("\t")
      );
      if (breakAt > 0) {
        kept = kept.slice(0, breakAt);
      }
    }

    kept = kept.trimEnd();
    if (!kept) {
      return token;
    }
    return `${kept}${token}`;
  }

  _placeText(innerRect) {
    const originX = H_ALIGN_TO_ORIGIN[this.hAlign];
    const originY = V_ALIGN_TO_ORIGIN[this.vAlign];
    const x = innerRect.x + innerRect.width * originX;
    const y = innerRect.y + innerRect.height * originY;

    this.textObject.setOrigin(originX, originY);
    this.textObject.setPosition(this._round(x), this._round(y));
  }
}
