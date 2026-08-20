import Phaser from "phaser";
import gameClientConfig from "./config/gameClientConfig";
import { queueGameSceneAssets } from "./queueGameSceneAssets";
import { gameSceneAssetDeps } from "./gameSceneAssetDeps";

export const LOADING_BACKGROUND_TEXTURE_KEY = "main_background";
const LOADING_BACKGROUND_PATH = "assets/giantstomp/stompy_background.png";

const PROGRESS_BAR = {
  width: 320,
  height: 10,
  bottomOffset: 72,
  trackColor: 0x14141e,
  trackAlpha: 0.85,
  fillColor: 0xffd700,
  borderColor: 0x555577,
};

export class LoadingScene extends Phaser.Scene {
  constructor() {
    super({ key: "LoadingScene" });
    this._background = null;
    this._progressTrack = null;
    this._progressFill = null;
    this._progressFillWidth = 0;
    this._onResize = null;
  }

  preload() {
    this.load.image(LOADING_BACKGROUND_TEXTURE_KEY, LOADING_BACKGROUND_PATH);
  }

  create() {
    this.cameras.main.setBackgroundColor(0x000000);
    this.layoutBackground();
    this.createProgressBar();
    this._onResize = () => this.layout();
    this.scale.on(Phaser.Scale.Events.RESIZE, this._onResize);

    this.load.on(Phaser.Loader.Events.PROGRESS, this.updateProgress, this);
    this.load.once(Phaser.Loader.Events.COMPLETE, this.onAssetsReady, this);

    queueGameSceneAssets(this.load, gameSceneAssetDeps);
    this.load.start();
  }

  shutdown() {
    if (this._onResize) {
      this.scale.off(Phaser.Scale.Events.RESIZE, this._onResize);
      this._onResize = null;
    }
    this.load.off(Phaser.Loader.Events.PROGRESS, this.updateProgress, this);
  }

  layout() {
    this.layoutBackground();
    this.layoutProgressBar();
  }

  layoutBackground() {
    const { width, height } = this.scale;
    if (!this.textures.exists(LOADING_BACKGROUND_TEXTURE_KEY)) {
      return;
    }

    if (!this._background || this._background.destroyed) {
      this._background = this.add.image(width * 0.5, height * 0.5, LOADING_BACKGROUND_TEXTURE_KEY)
        .setDepth(0);
    }

    const texture = this.textures.get(LOADING_BACKGROUND_TEXTURE_KEY);
    const source = texture.getSourceImage();
    const scale = Math.min(width / source.width, height / source.height);
    this._background
      .setPosition(width * 0.5, height * 0.5)
      .setScale(scale);
  }

  createProgressBar() {
    const theme = gameClientConfig.theme?.primary || {};
    const fillColor = theme.border ?? PROGRESS_BAR.fillColor;
    const trackColor = gameClientConfig.theme?.secondary?.bg ?? PROGRESS_BAR.trackColor;

    this._progressFillWidth = PROGRESS_BAR.width - 4;
    const centerX = this.scale.width * 0.5;
    const centerY = this.scale.height - PROGRESS_BAR.bottomOffset;

    this._progressTrack = this.add.rectangle(
      centerX,
      centerY,
      PROGRESS_BAR.width,
      PROGRESS_BAR.height,
      trackColor,
      PROGRESS_BAR.trackAlpha
    ).setStrokeStyle(1, PROGRESS_BAR.borderColor, 0.9).setDepth(2);

    this._progressFill = this.add.rectangle(
      centerX - this._progressFillWidth * 0.5,
      centerY,
      0,
      PROGRESS_BAR.height - 4,
      fillColor,
      1
    ).setOrigin(0, 0.5).setDepth(3);
  }

  layoutProgressBar() {
    if (!this._progressTrack || !this._progressFill) {
      return;
    }

    const centerX = this.scale.width * 0.5;
    const centerY = this.scale.height - PROGRESS_BAR.bottomOffset;
    this._progressTrack.setPosition(centerX, centerY);
    this._progressFill.setPosition(centerX - this._progressFillWidth * 0.5, centerY);
  }

  updateProgress(progress) {
    if (!this._progressFill) {
      return;
    }
    const clamped = Phaser.Math.Clamp(progress, 0, 1);
    this._progressFill.width = Math.max(0, this._progressFillWidth * clamped);
  }

  onAssetsReady() {
    this.scene.start("GameScene");
  }
}
