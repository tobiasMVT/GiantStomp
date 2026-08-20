import SegmentFlowRunner from "../flow/SegmentFlowRunner";
import { buildSegmentFlow } from "./buildSegmentFlow";

const BOARD_ACTIONS = new Set(["spin", "respin", "freespin", "freerespin"]);

export class Client {
  constructor(phaserScene, { setUiState, setClientState } = {}) {
    this.scene = phaserScene;
    this.setUiState = setUiState || setClientState;
    this.segmentFlowRunner = new SegmentFlowRunner();
  }

  async reactOnResponse(gameState, _clientState) {
    if (!this.scene || !gameState) return;
    const action = gameState.executedAction;
    this.scene.clearPendingFastForward?.();
    this.scene.cancelSkippablePresentationWaits?.();
    this.segmentFlowRunner.reset();

    if (action === "spin" || action === "freespin") {
      this.scene.emitRoundStarted?.();
    }

    if (action === "spin") {
      await this.scene.leaveBonus?.();
      this.scene.resetForNewSpin?.();
      this.scene.playSpinClickSound?.();
      this.scene.startMainTheme?.();
    } else if (action === "bonustransition") {
      await this.scene.enterBonus?.(gameState);
      this.scene.emitOutcomeRevealed?.();
    } else if (action === "freespin" || action === "freerespin") {
      this.scene.startBonusTheme?.();
      this.scene.beginBonusSpin?.(gameState.bonusState);
    }

    if (BOARD_ACTIONS.has(action)) {
      await this.runSegmentFlow(gameState);
    }

    if (
      (action === "freespin" || action === "freerespin")
      && gameState.nextAction === "spin"
      && this.scene.isInBonusMode
    ) {
      await this.scene.presentBonusExitSequence?.(gameState);
    }

    if (gameState.nextAction === "spin") {
      this.scene.emitRoundEnded?.();
    }
  }

  async runSegmentFlow(gameState) {
    const segments = buildSegmentFlow({
      gameState,
      scene: this.scene,
      waitCancellable: (ms) => this.scene.waitForPresentation?.(ms, { skippable: true }),
      cancelActiveDelay: () => this.scene.cancelSkippablePresentationWaits?.(),
    });
    if (!segments.length) return false;
    this.segmentFlowRunner.setSegments(segments);
    try {
      await this.segmentFlowRunner.run();
    } finally {
      this.segmentFlowRunner.reset();
      this.scene.cancelSkippablePresentationWaits?.();
      this.scene.clearPendingFastForward?.();
    }
    return true;
  }

  requestFastForward() {
    this.segmentFlowRunner.requestSkip({
      fallbackSkipAction: () => {
        this.scene?.cancelSkippablePresentationWaits?.();
        this.scene?.requestFastForward?.();
      },
    });
  }
}

export default Client;
