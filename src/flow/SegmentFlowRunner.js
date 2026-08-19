/**
 * Flow SegmentFlowRunner
 * - Generic async segment executor.
 * - Executes enabled segments in order.
 * - On skip request, applies current segment skip action and jumps to next checkpoint.
 *
 * Notes:
 * - `checkpoint: true` marks safe boundary where skip can land.
 * - Runner is intentionally game-agnostic; segment content comes from flow builders.
 */
class SegmentFlowRunner {
  constructor() {
    this.segments = [];
    this.currentSegmentIndex = -1;
    this.pendingSkip = false;
  }

  setSegments(segments = []) {
    this.segments = segments;
    this.currentSegmentIndex = -1;
    this.pendingSkip = false;
  }

  requestSkip({ fallbackSkipAction } = {}) {
    // Ignore repeated skip requests until current pending skip is consumed.
    if (this.pendingSkip) {
      return;
    }

    const activeSegment = this.segments[this.currentSegmentIndex];

    if (!activeSegment) {
      fallbackSkipAction?.();
      return;
    }

    if (typeof activeSegment.onSkipAction === "function") {
      activeSegment.onSkipAction();
    } else if (activeSegment.onSkip && typeof activeSegment.onSkip.action === "function") {
      // Backward compatibility while flows migrate.
      activeSegment.onSkip.action();
    } else {
      fallbackSkipAction?.();
    }

    this.pendingSkip = true;
  }

  async run({ onCheckpointReached } = {}) {
    for (let i = 0; i < this.segments.length; i++) {
      const segment = this.segments[i];
      if (!segment?.enabled) {
        continue;
      }

      this.currentSegmentIndex = i;
      await segment.run();

      if (segment.checkpoint) {
        // Any extra skip presses should not leak beyond the checkpoint boundary.
        this.pendingSkip = false;
        onCheckpointReached?.(segment, i);
      }

      if (this.pendingSkip) {
        this.pendingSkip = false;
        const nextCheckpointIndex = this.findNextCheckpointIndex(i + 1);
        if (typeof nextCheckpointIndex === "number") {
          i = nextCheckpointIndex - 1;
        }
      }
    }
  }

  findNextCheckpointIndex(startIndex) {
    // Skip lands on next enabled checkpoint, not on arbitrary semantic IDs.
    for (let i = startIndex; i < this.segments.length; i++) {
      if (this.segments[i]?.enabled && this.segments[i]?.checkpoint) {
        return i;
      }
    }
    return undefined;
  }

  reset() {
    this.currentSegmentIndex = -1;
    this.pendingSkip = false;
    this.segments = [];
  }
}

export default SegmentFlowRunner;
