/**
 * Core EventBus
 * - Tiny framework-agnostic pub/sub primitive.
 * - Used for UI intents, render lifecycle events, and state projection events.
 * - Keeps controller/runtime/scene communication decoupled from React/Phaser APIs.
 */
class EventBus {
  constructor() {
    this.listeners = new Map();
  }

  on(eventName, handler) {
    if (!this.listeners.has(eventName)) {
      this.listeners.set(eventName, new Set());
    }
    const handlers = this.listeners.get(eventName);
    handlers.add(handler);

    return () => {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.listeners.delete(eventName);
      }
    };
  }

  emit(eventName, payload) {
    const handlers = this.listeners.get(eventName);
    if (!handlers || handlers.size === 0) {
      return;
    }
    [...handlers].forEach((handler) => handler(payload));
  }
}

export default EventBus;
