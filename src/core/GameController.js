/**
 * Core GameController
 * - Single decision gateway for gameplay actions.
 * - Owns: round orchestration, interaction policy gates, and balance/round counters.
 * - Receives intent from runtime, talks to gateway/client, and updates state store.
 */
class GameController {
  constructor({ roundGateway, gameConfig, flowInteractionConfig = {}, stateStore, sessionService }) {
    this.roundGateway = roundGateway;
    this.gameConfig = gameConfig || {};
    this.stateStore = stateStore;
    this.sessionService = sessionService;

    this.session = null;
    this.settings = {};
    this.betLevels = [1];

    this.replaysToExecuteBeforeRng = [];
    this.amountOfReplays = 0;
    this.amountOfReplaysCompleted = 0;
    const initialBalance = Number(this.stateStore?.getUiState?.()?.balance ?? 0);
    this.balance = Number.isFinite(initialBalance) ? initialBalance : 0;
    this.gamerounds = 0;
    this.activeClient = null;

    this.flowInteractionPolicy = {
      quickStopAllowed: flowInteractionConfig.quickStopAllowed ?? true,
      skipAllowed: flowInteractionConfig.skipAllowed ?? true,
      fastForwardArmingDelayMs: flowInteractionConfig.fastForwardArmingDelayMs ?? 250,
      fastForwardCooldownMs: flowInteractionConfig.fastForwardCooldownMs ?? 25
    };
    this.interactionState = {
      canQuickStop: false,
      canSkip: false,
      fastForwardArmedAt: 0,
      fastForwardCooldownUntil: 0
    };
    this.stopContinuedActions = new Set(flowInteractionConfig.stopContinuedActions || []);
    this.stopActionsOncePerRound = new Set(
      flowInteractionConfig.stopActionsOncePerRound || ["freespin"]
    );
    this.roundStopActionsHandled = new Set();
    this.messageQueue = [];
    this._msgIdCounter = 0;
    this.preventGamePlay = false;
    this.continuationAction = null;
    this.devTicketModeEnabled = this.isDevTicketModeEnabled();
    const initialStrategies = this.normalizeTicketStrategies(
      this.roundGateway?.getTicketStrategies?.() || [this.gameConfig?.mathStyle || "normal"]
    );
    this.ticketStrategyOptions = initialStrategies;
    this.ticketStrategy = this.resolveTicketStrategy(
      this.gameConfig?.mathStyle,
      initialStrategies
    );
  }

  normalizeTicketStrategies(input) {
    const asArray = Array.isArray(input) ? input : [];
    const normalized = asArray
      .map((item) => {
        if (typeof item === "string") {
          return { id: item, label: item };
        }
        if (item && typeof item === "object" && typeof item.id === "string") {
          return { id: item.id, label: item.label || item.id };
        }
        return null;
      })
      .filter(Boolean);

    const byId = new Map();
    normalized.forEach((entry) => {
      if (!byId.has(entry.id)) {
        byId.set(entry.id, entry);
      }
    });

    return [...byId.values()];
  }

  resolveTicketStrategy(preferred, options = this.ticketStrategyOptions) {
    const ids = options.map((opt) => opt.id);
    if (preferred && ids.includes(preferred)) {
      return preferred;
    }
    return ids[0] || "normal";
  }

  getTicketStrategies() {
    return [...this.ticketStrategyOptions];
  }

  getTicketStrategy() {
    return this.ticketStrategy;
  }

  setTicketStrategy(strategyId) {
    const next = this.resolveTicketStrategy(strategyId);
    this.ticketStrategy = next;
    this.gameConfig.mathStyle = next;
    return next;
  }

  cycleTicketStrategy() {
    if (!this.ticketStrategyOptions.length) {
      this.ticketStrategyOptions = [{ id: "normal", label: "normal" }];
    }
    const ids = this.ticketStrategyOptions.map((opt) => opt.id);
    const idx = ids.indexOf(this.ticketStrategy);
    const nextIdx = idx < 0 ? 0 : (idx + 1) % ids.length;
    return this.setTicketStrategy(ids[nextIdx] || "normal");
  }

  isDevTicketModeEnabled() {
    try {
      return typeof window !== "undefined" && window.location?.search?.includes("dev");
    } catch (_) {
      return false;
    }
  }

  getDevTicketModeEnabled() {
    return this.devTicketModeEnabled;
  }

  setPreventGamePlay(value) {
    this.preventGamePlay = !!value;
  }

  isGamePlayPrevented() {
    return this.preventGamePlay;
  }

  getContinuationAction() {
    return this.continuationAction;
  }

  hasContinuationPending() {
    return !!this.continuationAction;
  }

  clearContinuationAction() {
    this.continuationAction = null;
  }

  async initSession() {
    const { session, settings } = await this.sessionService.getSession();
    this.session = session;
    this.settings = settings;
    this.betLevels = settings.betLevels || [1];

    if (typeof settings.quickStopAllowed === "boolean") {
      this.flowInteractionPolicy.quickStopAllowed = settings.quickStopAllowed;
    }

    const devSettings = settings.dev || {};
    const fromSession = this.normalizeTicketStrategies(devSettings.ticketStrategies);
    if (fromSession.length > 0) {
      this.ticketStrategyOptions = fromSession;
    } else {
      this.ticketStrategyOptions = this.normalizeTicketStrategies(
        this.roundGateway?.getTicketStrategies?.() || [this.gameConfig?.mathStyle || "normal"]
      );
    }

    const requestedDefault = devSettings.defaultTicketStrategy;
    this.setTicketStrategy(requestedDefault || this.ticketStrategy);

    if (typeof devSettings.ticketModeEnabled === "boolean") {
      this.devTicketModeEnabled = devSettings.ticketModeEnabled;
    }

    const defaultBet = this.betLevels[settings.defaultBetIndex ?? 0] ?? this.betLevels[0];
    if (typeof settings.balance === "number") {
      this.balance = settings.balance;
    }

    this.stateStore.setUiState((prev) => ({
      ...prev,
      balance: this.balance,
      betSize: defaultBet
    }));
    this.stateStore.setGameState((prev) => ({
      ...prev,
      betSize: defaultBet
    }));

    console.log("[SessionService] Session initialized", session);
    console.log("[SessionService] Settings applied", settings);

    return { session, settings };
  }

  getInteractionState() {
    return { ...this.interactionState };
  }

  getFastForwardStatus(now = performance.now()) {
    const { canQuickStop, canSkip, fastForwardArmedAt, fastForwardCooldownUntil } = this.interactionState;
    const canPolicyForward =
      (canQuickStop && this.flowInteractionPolicy.quickStopAllowed) ||
      (canSkip && this.flowInteractionPolicy.skipAllowed);
    const isArmed = now >= fastForwardArmedAt && now >= fastForwardCooldownUntil;
    const nextAvailableAt = Math.max(fastForwardArmedAt, fastForwardCooldownUntil);
    return {
      canFastForward: canPolicyForward && isArmed,
      isArmed,
      armedAt: fastForwardArmedAt,
      cooldownUntil: fastForwardCooldownUntil,
      nextAvailableAt
    };
  }

  setInteractionState(nextPartialState) {
    this.interactionState = { ...this.interactionState, ...nextPartialState };
  }

  handleOutcomeRevealed() {
    if (this.flowInteractionPolicy.skipAllowed) {
      this.setInteractionState({ canQuickStop: false, canSkip: true });
    }
  }

  handleRoundStarted() {
    const now = performance.now();
    this.clearContinuationAction();
    this.stateStore.setUiState((prev) => ({ ...prev, spinState: false, betSwap: false }));
    this.setInteractionState({
      canQuickStop: !!this.flowInteractionPolicy.quickStopAllowed,
      canSkip: false,
      fastForwardArmedAt: now + this.flowInteractionPolicy.fastForwardArmingDelayMs,
      fastForwardCooldownUntil: 0
    });
  }

  handleRoundEnded() {
    this.clearContinuationAction();
    this.roundStopActionsHandled.clear();
    if (!this.hasMessages()) {
      this.stateStore.setUiState((prev) => ({ ...prev, spinState: true, betSwap: true }));
    }
    this.setInteractionState({
      canQuickStop: false,
      canSkip: false,
      fastForwardArmedAt: 0,
      fastForwardCooldownUntil: 0
    });
  }

  async handleSpinRequested({ client }) {
    if (this.preventGamePlay) return;

    this.activeClient = client;

    this.clearContinuationAction();
    this.stateStore.setUiState((prev) => ({ ...prev, spinState: false, betSwap: false }));

    if (this.replaysToExecuteBeforeRng.length === 0) {
      this.roundStopActionsHandled.clear();
      const betSize = this.stateStore.getUiState().betSize;
      const newReplays = await this.roundGateway.fetchRoundStates({
        betSize,
        ticketStrategy: this.ticketStrategy
      });
      this.replaysToExecuteBeforeRng.push(...newReplays);
      this.amountOfReplaysCompleted = 0;
      this.amountOfReplays = this.replaysToExecuteBeforeRng.length;

      if (this.amountOfReplays === 0) {
        this.clearContinuationAction();
        this.stateStore.setUiState((prev) => ({ ...prev, spinState: true, betSwap: true }));
        return;
      }
    }

    // One user spin should auto-play through all normal in-round actions.
    // We only stop when round returns to idle spin, or action becomes non-auto (e.g. bonus entry).
    while (this.replaysToExecuteBeforeRng.length > 0) {
      const resp = structuredClone(this.replaysToExecuteBeforeRng[0]);
      this.replaysToExecuteBeforeRng.shift();
      this.amountOfReplaysCompleted++;
      console.log(`REPLAYING STATE ${this.amountOfReplaysCompleted} of ${this.amountOfReplays}`);

      console.log("## SERVER");
      console.log(resp);

      if (resp.executedAction === "spin") {
        const activeUiState = this.stateStore.getUiState();
        const roundCost = this.resolveRoundCost(resp, activeUiState.betSize);
        this.balance = this.roundCurrency(this.balance - roundCost);
        this.gamerounds++;
        this.stateStore.setUiState((prev) => ({ ...prev, gamerounds: this.gamerounds }));
      }

      this.stateStore.setUiState((prev) => ({ ...prev, balance: this.balance }));
      await client.reactOnResponse(resp, this.stateStore.getUiState());

      // Initial drop/outcome phase has passed; quick stop is no longer valid, skip can be allowed.
      if (resp.executedAction === "spin") {
        this.handleOutcomeRevealed();
      }

      if (resp.nextAction === "spin") {
        const activeUiState = this.stateStore.getUiState();
        const roundWin = this.resolveRoundWin(resp, activeUiState.betSize);
        this.balance = this.roundCurrency(this.balance + roundWin);
        this.stateStore.setUiState((prev) => ({ ...prev, balance: this.balance }));
        this.clearContinuationAction();
        this.roundStopActionsHandled.clear();
        break;
      }

      if (this.stopContinuedActions.has(resp.nextAction)) {
        const shouldStopOnlyOnce = this.stopActionsOncePerRound.has(resp.nextAction);
        const alreadyStoppedThisRound = this.roundStopActionsHandled.has(resp.nextAction);
        if (shouldStopOnlyOnce && alreadyStoppedThisRound) {
          continue;
        }

        // Explicit stop action (e.g. bonus entry) should be manually initiated.
        this.continuationAction = resp.nextAction;
        this.roundStopActionsHandled.add(resp.nextAction);
        this.stateStore.setUiState((prev) => ({ ...prev, spinState: true, betSwap: false }));
        break;
      }
    }
  }

  handleFastForwardRequested() {
    const { canFastForward } = this.getFastForwardStatus();

    if (!canFastForward) {
      return;
    }

    this.setInteractionState({
      fastForwardCooldownUntil: performance.now() + this.flowInteractionPolicy.fastForwardCooldownMs
    });

    if (this.activeClient?.requestFastForward) {
      this.activeClient.requestFastForward();
    }
  }

  async runBackendSimulation() {
    console.log(`Playing backend ${this.gameConfig.gameRounds} gamerounds.`);
    const wins = [];
    let totalTbm = 0;
    let totalSimulationCost = 0;
    let iterations = 0;
    let newStartTime = 0;
    let noHits = 0;
    let hits = 0;

    const startTime = performance.now();
    let gamerounds = this.gameConfig.gameRounds;

    for (let i = 0; i < this.gameConfig.gameRounds; i++) {
      let responses = [];
      iterations++;

      const states = await this.roundGateway.fetchRoundStates({
        betSize: 1,
        ticketStrategy: this.ticketStrategy
      });
      responses.push(...states);

      if (responses.length < 1) {
        gamerounds--;
        if (this.gameConfig.devMode) {
          console.warn("✗ Failed to generate valid gameround");
        }
        continue;
      }

      const firstResp = responses[0];
      const lastResp = responses[responses.length - 1];
      if (lastResp.nextAction === "spin") {
        const payout = this.resolveRoundWin(lastResp, 1);
        const roundCost = this.resolveRoundCost(firstResp, 1);
        const tbm = lastResp.tbm || 0;

        if (tbm > 1500) {
          console.log("Found more than 1500x!");
        }

        totalTbm += payout;
        wins.push(payout);
        totalSimulationCost += roundCost;
        if (payout === 0) {
          noHits++;
        } else {
          hits++;
        }
        responses = [];
      }

      if (iterations === 50000) {
        iterations = 0;
        if (newStartTime === 0) {
          newStartTime = startTime;
        }
        console.log(
          `Execution time for 50000 gamerounds: ${((performance.now() - newStartTime) / 1000).toFixed(2)} s`
        );
        newStartTime = performance.now();
      }
    }

    const endTime = performance.now();
    console.log(`Execution time: ${((endTime - startTime) / 1000).toFixed(2)} s`);

    totalSimulationCost = totalSimulationCost || gamerounds;
    const rtp = parseFloat(((totalTbm / totalSimulationCost) * 100).toFixed(2));
    const { variance, stdDev } = this.calculateVariance(wins, totalTbm / this.gameConfig.gameRounds);

    wins.sort((a, b) => a - b);

    console.log("\n========== RESULTS ==========");
    console.log(`Gamerounds: ${gamerounds}`);
    console.log(`Average Win: ${(totalTbm / gamerounds).toFixed(4)}x`);
    console.log(`Median win: ${wins[Math.floor((wins.length - 1) / 2)]}x`);
    console.log(`Max win: ${wins[wins.length - 1]}x`);
    console.log(`Hit ratio: ${parseFloat((hits / (hits + noHits)).toFixed(2))}`);
    console.log(`Total payout: ${totalTbm.toFixed(2)} | Cost: ${totalSimulationCost.toFixed(2)}`);
    console.log(`Variance: ${variance.toFixed(4)}`);
    console.log(`Standard deviation: ${stdDev.toFixed(4)}`);
    console.log(`RTP: ${rtp}%`);
    console.log("=============================\n");
  }

  calculateVariance(wins, averageWin) {
    const variance = wins.reduce((sum, value) => sum + Math.pow(value - averageWin, 2), 0) / wins.length;
    const stdDev = Math.sqrt(variance);
    return { variance, stdDev };
  }

  roundCurrency(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return parseFloat(n.toFixed(2));
  }

  resolveRoundCost(resp, fallbackBetSize = 1) {
    const fromServer = Number(resp?.roundMeta?.roundCost);
    if (Number.isFinite(fromServer) && fromServer >= 0) {
      return fromServer;
    }
    const betSize = Number(fallbackBetSize);
    return Number.isFinite(betSize) ? this.roundCurrency(betSize) : 0;
  }

  resolveRoundWin(resp, fallbackBetSize = 1) {
    const fromTwa = Number(resp?.twa);
    if (Number.isFinite(fromTwa) && fromTwa >= 0) {
      return fromTwa;
    }

    const fromTbm = Number(resp?.tbm);
    const betSize = Number(fallbackBetSize);
    if (Number.isFinite(fromTbm) && Number.isFinite(betSize)) {
      return this.roundCurrency(fromTbm * betSize);
    }

    return 0;
  }

  getSettings() {
    return this.settings;
  }

  getBetLevels() {
    return [...this.betLevels];
  }

  getNextBet(currentBet) {
    const idx = this.betLevels.indexOf(currentBet);
    if (idx === -1) return this.betLevels[0];
    return this.betLevels[(idx + 1) % this.betLevels.length];
  }

  enqueueMessage(msg) {
    if (!msg.id) {
      msg.id = `msg-${++this._msgIdCounter}`;
    }
    this.messageQueue.push(msg);
  }

  peekMessage() {
    return this.messageQueue.length > 0 ? this.messageQueue[0] : null;
  }

  dequeueMessage() {
    return this.messageQueue.shift() || null;
  }

  hasMessages() {
    return this.messageQueue.length > 0;
  }
}

export default GameController;
