import Client from "../game-client/Client";

/**
 * Core GameRuntime
 * - Runtime bridge that wires EventBus <-> Controller <-> Scene adapters.
 * - Subscribes to intents/lifecycle events and projects controller/store state to UI.
 * - Keeps App bootstrap thin while core remains framework-agnostic.
 */
class GameRuntime {
  constructor({ gameController, eventBus, stateStore, layoutManager }) {
    this.gameController = gameController;
    this.eventBus = eventBus;
    this.stateStore = stateStore;
    this.layoutManager = layoutManager;

    this.client = null;
    this.gameScene = null;
    this.uiScene = null;
    this.spinInFlight = false;
    this.pendingAutoSpin = false;
    this.unsubscribers = [];
    this.fastForwardArmingTimer = null;
    this.onScaleResize = null;
    this.layoutDebugEnabled = false;
    this.latestLayoutSnapshot = null;
    this.layoutSafeAreaProbe = null;
    this.debugSafeInsetsOverride = null;
    this.latestGameContent = null;

    this.autoplayTarget = 0;
    this.autoplayRemaining = 0;
  }

  init() {
    this.registerIntentListeners();
    this.registerDebugCommands();
    this.unsubscribers.push(
      this.stateStore.subscribe(({ uiState: nextUiState }, { uiState: prevUiState } = {}) => {
        this.publishUIState();
        this.syncSceneAudioState(nextUiState, prevUiState);
        this.maybeTriggerAutoplay(nextUiState, prevUiState);
      })
    );
    this.publishUIState();
  }

  destroy() {
    this.unsubscribers.forEach((unsubscribe) => unsubscribe());
    this.unsubscribers = [];
    if (this.fastForwardArmingTimer) {
      clearTimeout(this.fastForwardArmingTimer);
      this.fastForwardArmingTimer = null;
    }
    if (this.gameScene?.scale && this.onScaleResize) {
      this.gameScene.scale.off("resize", this.onScaleResize);
      this.onScaleResize = null;
    }
    clearTimeout(this._orientationDebounce);
    clearTimeout(this._orientationDebounce2);
    clearTimeout(this._orientationDebounce3);
    if (this._onWindowResize) {
      window.removeEventListener("resize", this._onWindowResize);
      this._onWindowResize = null;
    }
    if (this._onLegacyOrientationChange) {
      window.removeEventListener("orientationchange", this._onLegacyOrientationChange);
      this._onLegacyOrientationChange = null;
    }
    if (this._onOrientationChange && window.screen?.orientation) {
      window.screen.orientation.removeEventListener("change", this._onOrientationChange);
      this._onOrientationChange = null;
    }
    if (this._onVisualViewportResize && window.visualViewport) {
      window.visualViewport.removeEventListener("resize", this._onVisualViewportResize);
      this._onVisualViewportResize = null;
    }
    if (this.layoutSafeAreaProbe && this.layoutSafeAreaProbe.parentNode) {
      this.layoutSafeAreaProbe.parentNode.removeChild(this.layoutSafeAreaProbe);
      this.layoutSafeAreaProbe = null;
    }
  }

  async attachScenes({ gameScene, uiScene }) {
    this.gameScene = gameScene;
    this.uiScene = uiScene;
    this.client = new Client(gameScene, { setUiState: this.stateStore.setUiState.bind(this.stateStore) });
    this.gameScene?.setEventBus?.(this.eventBus);

    if (this.uiScene?.setEventBus) {
      this.uiScene.setEventBus(this.eventBus);
    }

    this.updateLayoutSnapshot();
    this.onScaleResize = (gameSize) => {
      this.updateLayoutSnapshot(gameSize.width, gameSize.height);
    };
    this.gameScene?.scale?.on("resize", this.onScaleResize);

    // Mobile orientation changes don't always trigger Phaser's scale resize reliably.
    // We force Phaser's Scale Manager to re-read the parent container, then recompute.
    // Three retries cover both Android's delayed viewport settling and iOS Safari's
    // even-later safe-area-inset recalculation after rotation.
    this._forceLayoutRefresh = () => {
      if (this.gameScene?.scale) {
        this.gameScene.scale.refresh();
      }
      this.updateLayoutSnapshot();
    };

    this._scheduleLayoutRefresh = () => {
      clearTimeout(this._orientationDebounce);
      clearTimeout(this._orientationDebounce2);
      clearTimeout(this._orientationDebounce3);
      this._orientationDebounce = setTimeout(() => this._forceLayoutRefresh(), 100);
      this._orientationDebounce2 = setTimeout(() => this._forceLayoutRefresh(), 500);
      this._orientationDebounce3 = setTimeout(() => this._forceLayoutRefresh(), 1000);
    };

    this._onWindowResize = () => this._scheduleLayoutRefresh();
    window.addEventListener("resize", this._onWindowResize);

    this._onLegacyOrientationChange = () => this._scheduleLayoutRefresh();
    window.addEventListener("orientationchange", this._onLegacyOrientationChange);

    if (window.screen?.orientation) {
      this._onOrientationChange = () => this._scheduleLayoutRefresh();
      window.screen.orientation.addEventListener("change", this._onOrientationChange);
    }
    if (window.visualViewport) {
      this._onVisualViewportResize = () => this._scheduleLayoutRefresh();
      window.visualViewport.addEventListener("resize", this._onVisualViewportResize);
    }

    // Fetch session + settings from the service, then build the UI dynamically.
    const { settings } = await this.gameController.initSession();
    if (this.uiScene?.configureUI) {
      this.uiScene.configureUI(settings);
    }

    this.syncSceneAudioState(this.stateStore.getUiState(), null);
    this.publishUIState();
  }

  registerIntentListeners() {
    this.unsubscribers = [
      this.eventBus.on("intent:spinRequested", () => this.handleSpinRequested()),
      this.eventBus.on("intent:betChangeRequested", () => this.handleBetChangeRequested()),
      this.eventBus.on("intent:betSelected", (bet) => this.handleBetSelected(bet)),
      this.eventBus.on("intent:autoplayToggled", () => this.handleAutoplayToggled()),
      this.eventBus.on("intent:autoplaySet", (count) => this.handleAutoplaySet(count)),
      this.eventBus.on("intent:pauseToggled", () => this.handlePauseToggled()),
      this.eventBus.on("intent:fastForwardRequested", () => this.handleFastForwardRequested()),
      this.eventBus.on("intent:soundToggled", () => this.handleSoundToggled()),
      this.eventBus.on("intent:musicToggled", () => this.handleMusicToggled()),
      this.eventBus.on("intent:ticketStrategySwap", () => this.handleTicketStrategySwap()),
      this.eventBus.on("intent:ticketStrategySelected", (strategyId) => this.handleTicketStrategySelected(strategyId)),
      this.eventBus.on("intent:paytableRequested", () => this.handlePaytableRequested()),
      this.eventBus.on("intent:layoutDebugToggled", () => this.handleLayoutDebugToggled()),
      this.eventBus.on("debug:layout:set", ({ enabled } = {}) => this.handleLayoutDebugToggled(enabled)),
      this.eventBus.on("layout:contentBoundsChanged", (payload) => this.handleGameContentBoundsChanged(payload)),
      this.eventBus.on("render:roundStarted", () => this.handleRenderRoundStarted()),
      this.eventBus.on("render:roundEnded", () => this.handleRenderRoundEnded()),
      this.eventBus.on("render:outcomeRevealed", () => this.handleRenderOutcomeRevealed()),
      this.eventBus.on("intent:injectRealityCheck", () => {
        this.gameController.enqueueMessage({
          type: "realityCheck",
          title: "Reality Check",
          body: "You have been playing for a while.\nDo you want to continue?",
          actions: ["Yes", "No"]
        });
      }),
      this.eventBus.on("intent:injectPlayerMessage", () => {
        this.gameController.enqueueMessage({
          type: "playerMessage",
          title: "Message",
          body: "This is a test message from the operator.",
          actions: ["OK"]
        });
      })
    ];
  }

  publishUIState() {
    const uiState = this.stateStore.getUiState();
    const ffStatus = this.gameController.getFastForwardStatus();
    const canFastForward = ffStatus.canFastForward;
    const fastForwardLabel = ">>";
    const settings = this.gameController.getSettings();
    const ticketModeEnabled = this.gameController.getDevTicketModeEnabled();
    const continuationPending = this.gameController.hasContinuationPending();
    const continuationAction = this.gameController.getContinuationAction();

    const gamePrevented = this.gameController.isGamePlayPrevented();

    this.eventBus.emit("ui:viewModel", {
      balance: uiState.balance,
      gamerounds: uiState.gamerounds,
      spinEnabled: gamePrevented ? false : uiState.spinState,
      spinLabel: continuationPending ? "Continue" : "Spin",
      betEnabled: gamePrevented ? false : uiState.betSwap,
      continuationPending,
      continuationAction,
      betSize: uiState.betSize,
      betLevels: this.gameController.getBetLevels(),
      autoplay: uiState.autoplay,
      autoplayTarget: this.autoplayTarget,
      autoplayRemaining: this.autoplayRemaining,
      autoplayAllowed: gamePrevented ? false : (settings.autoplay?.allowed ?? true),
      canFastForward,
      fastForwardLabel,
      gamePlayPrevented: gamePrevented,
      sound: uiState.sound,
      music: uiState.music,
      ticketStrategy: this.gameController.getTicketStrategy(),
      ticketStrategies: this.gameController.getTicketStrategies(),
      ticketModeEnabled,
      layoutDebugEnabled: this.layoutDebugEnabled
    });
  }

  maybeTriggerAutoplay(nextState, prevState) {
    if (!prevState) return;
    if (this.gameController.isGamePlayPrevented()) return;
    if (this.gameController.hasMessages()) return;
    if (this.gameController.hasContinuationPending()) return;

    const autoplayJustEnabled = prevState.autoplay !== "on" && nextState.autoplay === "on" && !!nextState.spinState;
    const spinBecameReady = !prevState.spinState && !!nextState.spinState && nextState.autoplay === "on";

    if (autoplayJustEnabled || spinBecameReady) {
      if (spinBecameReady && this.autoplayTarget !== Infinity && this.autoplayRemaining <= 0) {
        this.autoplayTarget = 0;
        this.stateStore.setUiState((prev) => ({ ...prev, autoplay: "off" }));
        return;
      }
      this.requestAutoSpin();
    }
  }

  requestAutoSpin() {
    if (this.spinInFlight) {
      this.pendingAutoSpin = true;
      return;
    }
    const delay = this.gameController.getSettings().spinDelayTimer || 0;
    if (delay > 0) {
      setTimeout(() => this.handleSpinRequested(), delay);
    } else {
      this.handleSpinRequested();
    }
  }

  syncSceneAudioState(nextState, prevState) {
    if (!this.gameScene) {
      return;
    }

    if (!prevState || prevState.sound !== nextState.sound) {
      const shouldMute = nextState.sound === "off";
      if (shouldMute) {
        this.gameScene._autoMuted = false;
      }
      this.gameScene.setMuted(shouldMute);
      if (!shouldMute) {
        this.gameScene._masterTarget = this.gameScene.sound.volume || 1;
      }
    }

    if (!prevState || prevState.music !== nextState.music) {
      const shouldMuteMusic = nextState.music === "off";
      if (this.gameScene.isMusicMuted && this.gameScene.isMusicMuted() !== shouldMuteMusic) {
        this.gameScene.toggleMusic();
      }
    }
  }

  async handleSpinRequested() {
    if (this.gameController.isGamePlayPrevented()) return;
    if (this.spinInFlight || !this.client) {
      return;
    }

    const spinDelay = this.gameController.getSettings().spinDelayTimer || 0;
    if (spinDelay > 0 && this._lastRoundEndedAt) {
      const elapsed = performance.now() - this._lastRoundEndedAt;
      if (elapsed < spinDelay) {
        await new Promise((r) => setTimeout(r, spinDelay - elapsed));
      }
    }

    this.spinInFlight = true;
    try {
      await this.gameController.handleSpinRequested({ client: this.client });
    } finally {
      this.spinInFlight = false;
      if (this.pendingAutoSpin) {
        this.pendingAutoSpin = false;
        // Re-check conditions to avoid unwanted spins if autoplay was turned off while busy.
        const uiState = this.stateStore.getUiState();
        if (
          uiState.autoplay === "on" &&
          uiState.spinState &&
          !this.gameController.hasContinuationPending()
        ) {
          this.handleSpinRequested();
        }
      }
    }
  }

  handleBetChangeRequested() {
    const uiState = this.stateStore.getUiState();
    if (!uiState.betSwap) return;

    const newBet = this.gameController.getNextBet(uiState.betSize);
    this.stateStore.setGameState((prev) => ({ ...prev, betSize: newBet }));
    this.stateStore.setUiState((prev) => ({ ...prev, betSize: newBet }));
  }

  handleBetSelected(bet) {
    const uiState = this.stateStore.getUiState();
    if (!uiState.betSwap) return;

    const betLevels = this.gameController.getBetLevels();
    if (!betLevels.includes(bet)) return;

    this.stateStore.setGameState((prev) => ({ ...prev, betSize: bet }));
    this.stateStore.setUiState((prev) => ({ ...prev, betSize: bet }));
  }

  handleAutoplayToggled() {
    const settings = this.gameController.getSettings();
    if (!settings.autoplay?.allowed) return;
    const uiState = this.stateStore.getUiState();
    if (uiState.autoplay === "on") {
      this.autoplayTarget = 0;
      this.autoplayRemaining = 0;
      this.stateStore.setUiState((prev) => ({ ...prev, autoplay: "off", stop: "off" }));
    }
  }

  handleAutoplaySet(count) {
    const settings = this.gameController.getSettings();
    if (!settings.autoplay?.allowed) return;
    if (count === 0) {
      this.autoplayTarget = 0;
      this.autoplayRemaining = 0;
      this.stateStore.setUiState((prev) => ({ ...prev, autoplay: "off", stop: "off" }));
    } else {
      this.autoplayTarget = count;
      this.autoplayRemaining = count;
      this.stateStore.setUiState((prev) => ({ ...prev, autoplay: "on", stop: "off" }));
    }
  }

  handlePauseToggled() {
    if (!this.gameScene) {
      return;
    }

    const uiState = this.stateStore.getUiState();
    if (uiState.pause === "off") {
      this.gameScene.pauseGame({ timers: true, audio: true });
      this.stateStore.setUiState((prev) => ({ ...prev, pause: "on" }));
    } else {
      this.gameScene.resumeGame({ audio: true });
      this.stateStore.setUiState((prev) => ({ ...prev, pause: "off" }));
    }
  }

  handleSoundToggled() {
    this.stateStore.setUiState((prev) => ({ ...prev, sound: prev.sound === "off" ? "on" : "off" }));
  }

  handleMusicToggled() {
    this.stateStore.setUiState((prev) => ({ ...prev, music: prev.music === "off" ? "on" : "off" }));
  }

  handleTicketStrategySwap() {
    this.gameController.cycleTicketStrategy();
    this.publishUIState();
  }

  handleTicketStrategySelected(strategyId) {
    if (typeof strategyId !== "string" || !strategyId) return;
    this.gameController.setTicketStrategy(strategyId);
    this.publishUIState();
  }

  handlePaytableRequested() {
    console.log("Paytable requested");
  }

  handleLayoutDebugToggled(forceEnabled) {
    const nextEnabled =
      typeof forceEnabled === "boolean" ? forceEnabled : !this.layoutDebugEnabled;
    this.layoutDebugEnabled = nextEnabled;
    this.eventBus.emit("layout:debug:visibility", { enabled: nextEnabled });
    this.publishUIState();
  }

  handleFastForwardRequested() {
    this.gameController.handleFastForwardRequested();
    // Controller interaction state may have changed due to policy gates, refresh UI projection.
    this.publishUIState();
    this.scheduleFastForwardArmingRefresh();
  }

  handleRenderRoundStarted() {
    this.gameController.handleRoundStarted();

    if (this.stateStore.getUiState().autoplay === "on" && this.autoplayTarget !== Infinity) {
      this.autoplayRemaining = Math.max(0, this.autoplayRemaining - 1);
    }

    this.publishUIState();
    this.scheduleFastForwardArmingRefresh();
  }

  async handleRenderRoundEnded() {
    this._lastRoundEndedAt = performance.now();
    this.gameController.handleRoundEnded();
    this.publishUIState();
    if (this.fastForwardArmingTimer) {
      clearTimeout(this.fastForwardArmingTimer);
      this.fastForwardArmingTimer = null;
    }
    if (this.gameController.hasMessages()) {
      await this.drainMessageQueue();
      this.stateStore.setUiState((prev) => ({ ...prev, spinState: true, betSwap: true }));
      this.publishUIState();
    }
  }

  async drainMessageQueue() {
    while (this.gameController.hasMessages()) {
      const msg = this.gameController.peekMessage();
      const result = await this.uiScene.showDialog(msg);
      this.gameController.dequeueMessage();
      console.log(`[MessageQueue] Dismissed "${msg.type}" (${msg.id}), player chose: ${result}`);

      if (msg.type === "realityCheck" && result === "No") {
        this.gameController.setPreventGamePlay(true);
        this.autoplayTarget = 0;
        this.autoplayRemaining = 0;
        this.stateStore.setUiState((prev) => ({ ...prev, autoplay: "off" }));
        this.publishUIState();
      }
    }
  }

  handleRenderOutcomeRevealed() {
    this.gameController.handleOutcomeRevealed();
    this.publishUIState();
    this.scheduleFastForwardArmingRefresh();
  }

  scheduleFastForwardArmingRefresh() {
    if (this.fastForwardArmingTimer) {
      clearTimeout(this.fastForwardArmingTimer);
      this.fastForwardArmingTimer = null;
    }

    const status = this.gameController.getFastForwardStatus();
    if (status.isArmed) {
      return;
    }

    const delayMs = Math.max(0, status.nextAvailableAt - performance.now());
    this.fastForwardArmingTimer = setTimeout(() => {
      this.fastForwardArmingTimer = null;
      this.publishUIState();
    }, delayMs);
  }

  updateLayoutSnapshot(width, height) {
    if (!this.layoutManager || !this.gameScene?.scale) {
      return;
    }

    const viewportWidth = width ?? this.gameScene.scale.width;
    const viewportHeight = height ?? this.gameScene.scale.height;
    const safeInsets = this.debugSafeInsetsOverride || this.readBrowserSafeInsets();
    const fallbackGameContent = this.gameScene?.getLayoutContentBounds?.();
    const snapshot = this.layoutManager.compute({
      viewportWidth,
      viewportHeight,
      safeInsets,
      gameContent: this.latestGameContent || fallbackGameContent
    });
    this.latestLayoutSnapshot = snapshot;
    this.eventBus.emit("layout:changed", snapshot);
  }

  handleGameContentBoundsChanged(gameContent) {
    this.latestGameContent = gameContent;
    this.updateLayoutSnapshot();
  }

  registerDebugCommands() {
    if (typeof window === "undefined") {
      return;
    }

    window.slotDebug = window.slotDebug || {};
    window.slotDebug.layout = {
      show: () => this.handleLayoutDebugToggled(true),
      hide: () => this.handleLayoutDebugToggled(false),
      toggle: () => this.handleLayoutDebugToggled(),
      log: () => {
        console.log("[slotDebug] layout snapshot", this.latestLayoutSnapshot);
      },
      setSafeInsets: (insets = {}) => {
        this.debugSafeInsetsOverride = {
          top: Number(insets.top) || 0,
          right: Number(insets.right) || 0,
          bottom: Number(insets.bottom) || 0,
          left: Number(insets.left) || 0
        };
        this.updateLayoutSnapshot();
      },
      clearSafeInsets: () => {
        this.debugSafeInsetsOverride = null;
        this.updateLayoutSnapshot();
      }
    };
  }

  ensureLayoutSafeAreaProbe() {
    if (typeof document === "undefined") {
      return null;
    }
    if (this.layoutSafeAreaProbe) {
      return this.layoutSafeAreaProbe;
    }

    const probe = document.createElement("div");
    probe.style.position = "fixed";
    probe.style.left = "-9999px";
    probe.style.top = "-9999px";
    probe.style.width = "1px";
    probe.style.height = "1px";
    probe.style.paddingTop = "env(safe-area-inset-top)";
    probe.style.paddingRight = "env(safe-area-inset-right)";
    probe.style.paddingBottom = "env(safe-area-inset-bottom)";
    probe.style.paddingLeft = "env(safe-area-inset-left)";
    document.body.appendChild(probe);
    this.layoutSafeAreaProbe = probe;
    return probe;
  }

  readBrowserSafeInsets() {
    const probe = this.ensureLayoutSafeAreaProbe();
    if (!probe || typeof window === "undefined") {
      return { top: 0, right: 0, bottom: 0, left: 0 };
    }

    const styles = window.getComputedStyle(probe);
    const toPx = (value) => {
      const parsed = Number.parseFloat(value);
      return Number.isFinite(parsed) ? parsed : 0;
    };

    return {
      top: toPx(styles.paddingTop),
      right: toPx(styles.paddingRight),
      bottom: toPx(styles.paddingBottom),
      left: toPx(styles.paddingLeft)
    };
  }
}

export default GameRuntime;
