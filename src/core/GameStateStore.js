/**
 * Core GameStateStore
 * - Holds canonical game/client state snapshots in plain JS.
 * - Provides mutation helpers and subscriber notifications.
 * - Replaces React setter contracts in core flow logic.
 */
class GameStateStore {
  constructor({ gameState = {}, uiState, clientState }) {
    this.gameState = structuredClone(gameState);
    this.uiState = structuredClone(uiState ?? clientState ?? {});
    this.listeners = new Set();
  }

  getGameState() {
    return this.gameState;
  }

  getUiState() {
    return this.uiState;
  }

  getClientState() {
    return this.getUiState();
  }

  setGameState(updater) {
    const prevSnapshot = this.snapshot();
    this.gameState =
      typeof updater === "function"
        ? updater(this.gameState)
        : { ...this.gameState, ...updater };
    this.notify(prevSnapshot);
  }

  setUiState(updater) {
    const prevSnapshot = this.snapshot();
    this.uiState =
      typeof updater === "function"
        ? updater(this.uiState)
        : { ...this.uiState, ...updater };
    this.notify(prevSnapshot);
  }

  setClientState(updater) {
    this.setUiState(updater);
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  snapshot() {
    return {
      gameState: this.gameState,
      uiState: this.uiState,
      clientState: this.uiState
    };
  }

  notify(prevSnapshot) {
    const nextSnapshot = this.snapshot();
    this.listeners.forEach((listener) => listener(nextSnapshot, prevSnapshot));
  }
}

export default GameStateStore;
