export function createGameSceneAudioTimingMethods(deps = {}) {
  const {
    BONUS_THEME_FADE_IN_MS,
    BONUS_THEME_SEEK_SECONDS,
    BONUS_THEME_VOLUME,
    BONUS_WON_CELEBRATION_HOLD_MS,
    EPS,
    MAIN_THEME_VOLUME,
    ONE,
    SOUND_VOLUME_DEFAULT,
    SOUND_VOLUME_FILE_NAME,
    SOUND_VOLUME_MAX,
    SOUND_VOLUME_MIN,
    SOUND_VOLUME_STEP,
    SOUND_VOLUME_STORAGE_KEY,
    SOUND_VOLUME_TOOL_SOUNDS,
    SOUND_VOLUME_TOOL_SOUND_BY_KEY,
    clampSoundVolume,
    normalizeSoundVolumeMap,
    soundInteractionPolicy,
    soundVolumeConfig
  } = deps;

  return {
    waitForPresentation(ms, { skippable = false, useSceneTime = true } = {}) {
        if (!Number.isFinite(ms) || ms <= 0) {
          return Promise.resolve();
        }
    
        return new Promise((resolve) => {
          let settled = false;
          let timerEvent = null;
          let timeoutId = null;
    
          const finish = () => {
            if (settled) {
              return;
            }
    
            settled = true;
            if (skippable) {
              this._skippablePresentationWaits.delete(finish);
            }
            if (timerEvent) {
              timerEvent.remove(false);
            }
            if (timeoutId !== null) {
              clearTimeout(timeoutId);
            }
            resolve();
          };
    
          if (skippable) {
            this._skippablePresentationWaits.add(finish);
            if (this._fastForwardRequested) {
              finish();
              return;
            }
          }
    
          if (useSceneTime && this.time?.delayedCall) {
            timerEvent = this.time.delayedCall(ms, finish);
          } else {
            timeoutId = setTimeout(finish, ms);
          }
        });
      },

    cancelSkippablePresentationWaits() {
        const pending = [...this._skippablePresentationWaits];
        this._skippablePresentationWaits.clear();
        pending.forEach((finish) => finish?.());
      },

    waitForFastForwardRequest({ timeoutMs = 0, sinceSerial = null } = {}) {
        const baselineSerial = Number.isFinite(Number(sinceSerial))
          ? Number(sinceSerial)
          : (this._fastForwardRequestSerial || 0);
    
        if ((this._fastForwardRequestSerial || 0) > baselineSerial) {
          return Promise.resolve(true);
        }
    
        return new Promise((resolve) => {
          let settled = false;
          let timerEvent = null;
          let timeoutId = null;
    
          const finish = (serial = null) => {
            if (settled) {
              return;
            }
            settled = true;
            this._fastForwardWaiters?.delete(finish);
            if (timerEvent) {
              timerEvent.remove(false);
            }
            if (timeoutId !== null) {
              clearTimeout(timeoutId);
            }
            resolve(Number.isFinite(Number(serial)) && Number(serial) > baselineSerial);
          };
    
          this._fastForwardWaiters?.add(finish);
          if (Number(timeoutMs) > 0) {
            if (this.time?.delayedCall) {
              timerEvent = this.time.delayedCall(Number(timeoutMs), () => finish(null));
            } else {
              timeoutId = setTimeout(() => finish(null), Number(timeoutMs));
            }
          }
        });
      },

    setAudioInteractionMode(mode = 'normal') {
        this._audioInteractionMode = mode;
      },

    getAudioInteractionMode() {
        return this._audioInteractionMode || 'normal';
      },

    buildDefaultSoundVolumeMap() {
        const volumes = {};
        SOUND_VOLUME_TOOL_SOUNDS.forEach(({ key }) => {
          volumes[key] = SOUND_VOLUME_DEFAULT;
        });
    
        return {
          ...volumes,
          ...normalizeSoundVolumeMap(soundVolumeConfig)
        };
      },

    readStoredSoundVolumeMap() {
        if (typeof window === "undefined" || !window.localStorage) {
          return {};
        }
    
        try {
          const raw = window.localStorage.getItem(SOUND_VOLUME_STORAGE_KEY);
          return raw ? normalizeSoundVolumeMap(JSON.parse(raw)) : {};
        } catch (error) {
          console.warn("Could not read sound volume settings.", error);
          return {};
        }
      },

    buildInitialSoundVolumeMap() {
        return {
          ...this.buildDefaultSoundVolumeMap(),
          ...this.readStoredSoundVolumeMap()
        };
      },

    ensureSoundVolumeMap() {
        if (!this.soundVolumeMultipliers) {
          this.soundVolumeMultipliers = this.buildInitialSoundVolumeMap();
        }
    
        return this.soundVolumeMultipliers;
      },

    getSoundVolumeMultiplier(soundKey) {
        if (!soundKey) return SOUND_VOLUME_DEFAULT;
        const volumes = this.ensureSoundVolumeMap();
        return clampSoundVolume(volumes[soundKey] ?? SOUND_VOLUME_DEFAULT);
      },

    getAdjustedSoundVolume(soundKey, baseVolume = SOUND_VOLUME_DEFAULT) {
        const parsedBase = Number(baseVolume);
        const safeBase = Number.isFinite(parsedBase) ? Math.max(0, parsedBase) : SOUND_VOLUME_DEFAULT;
        return safeBase * this.getSoundVolumeMultiplier(soundKey);
      },

    applySoundVolumeConfig(soundKey, config = {}, {
        kind = "sound",
        originalVolume,
        record = true
      } = {}) {
        const nextConfig = { ...config };
        const parsedBase = Number(nextConfig.volume);
        const modeAdjustedVolume = Number.isFinite(parsedBase) ? Math.max(0, parsedBase) : SOUND_VOLUME_DEFAULT;
        const parsedOriginal = Number(originalVolume);
        const baseVolume = Number.isFinite(parsedOriginal) ? Math.max(0, parsedOriginal) : modeAdjustedVolume;
        const multiplier = this.getSoundVolumeMultiplier(soundKey);
        const finalVolume = modeAdjustedVolume * multiplier;
    
        nextConfig.volume = finalVolume;
    
        if (record) {
          this.recordSoundVolumePlay(soundKey, {
            kind,
            baseVolume,
            modeAdjustedVolume,
            multiplier,
            finalVolume,
            rate: nextConfig.rate,
            detune: nextConfig.detune
          });
        }
    
        return nextConfig;
      },

    setSoundVolumeMultiplier(soundKey, value, { persist = true } = {}) {
        if (!soundKey) return;
        const volumes = this.ensureSoundVolumeMap();
        volumes[soundKey] = clampSoundVolume(value);
        this.updateTrackedSoundVolumes(soundKey);
    
        if (persist) {
          this.persistSoundVolumeMap();
        }
    
        this.refreshSoundVolumeTool();
      },

    persistSoundVolumeMap() {
        if (typeof window === "undefined" || !window.localStorage) {
          return;
        }
    
        try {
          window.localStorage.setItem(SOUND_VOLUME_STORAGE_KEY, this.serializeSoundVolumeConfig());
          this.setSoundVolumeToolStatus("Saved in browser.");
        } catch (error) {
          console.warn("Could not save sound volume settings.", error);
          this.setSoundVolumeToolStatus("Save failed. Copy JSON still works.");
        }
      },

    serializeSoundVolumeConfig() {
        const orderedVolumes = {};
        this.getSoundVolumeToolKeys().forEach((soundKey) => {
          orderedVolumes[soundKey] = Number(this.getSoundVolumeMultiplier(soundKey).toFixed(3));
        });
    
        return JSON.stringify({
          version: 1,
          updatedAt: new Date().toISOString(),
          volumes: orderedVolumes
        }, null, 2);
      },

    getSoundVolumeToolKeys() {
        const keys = new Set(SOUND_VOLUME_TOOL_SOUNDS.map(({ key }) => key));
        Object.keys(this.ensureSoundVolumeMap()).forEach((key) => keys.add(key));
        this._soundVolumeLastPlayedByKey?.forEach((_, key) => keys.add(key));
    
        const cacheKeys = this.cache?.audio?.getKeys?.();
        if (Array.isArray(cacheKeys)) {
          cacheKeys.forEach((key) => keys.add(key));
        }
    
        return Array.from(keys).sort((a, b) => {
          const groupA = SOUND_VOLUME_TOOL_SOUND_BY_KEY[a]?.group || "Other";
          const groupB = SOUND_VOLUME_TOOL_SOUND_BY_KEY[b]?.group || "Other";
          if (groupA !== groupB) return groupA.localeCompare(groupB);
          return a.localeCompare(b);
        });
      },

    getSoundVolumeMetadata(soundKey) {
        return SOUND_VOLUME_TOOL_SOUND_BY_KEY[soundKey] || {
          key: soundKey,
          path: "Loaded by Phaser audio cache",
          group: "Other"
        };
      },

    getSoundVolumeDefaultBaseVolume(soundKey) {
        const defaultBaseVolume = Number(this.getSoundVolumeMetadata(soundKey).defaultBaseVolume);
        return Number.isFinite(defaultBaseVolume) ? Math.max(0, defaultBaseVolume) : SOUND_VOLUME_DEFAULT;
      },

    getSoundVolumeDisplayBaseVolume(soundKey) {
        const lastRecord = this._soundVolumeLastPlayedByKey?.get(soundKey);
        const lastBaseVolume = Number(lastRecord?.baseVolume);
        if (Number.isFinite(lastBaseVolume)) {
          return Math.max(0, lastBaseVolume);
        }
    
        return this.getSoundVolumeDefaultBaseVolume(soundKey);
      },

    getSoundVolumeDisplayFinalVolume(soundKey) {
        return this.getAdjustedSoundVolume(soundKey, this.getSoundVolumeDisplayBaseVolume(soundKey));
      },

    getSoundVolumeDisplayMaxVolume(soundKey) {
        const baseVolume = this.getSoundVolumeDisplayBaseVolume(soundKey);
        const maxVolume = baseVolume > 0 ? baseVolume * SOUND_VOLUME_MAX : SOUND_VOLUME_MAX;
        return Math.max(SOUND_VOLUME_STEP, maxVolume);
      },

    setSoundVolumeFinalVolume(soundKey, value) {
        if (!soundKey) return;
        const finalVolume = Math.max(0, Number(value) || 0);
        const baseVolume = this.getSoundVolumeDisplayBaseVolume(soundKey);
        const nextMultiplier = baseVolume > 0 ? finalVolume / baseVolume : finalVolume;
        this.setSoundVolumeMultiplier(soundKey, nextMultiplier);
      },

    formatSoundVolumeNumber(value) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed.toFixed(2) : "0.00";
      },

    formatSoundVolumePercent(value) {
        return `${Math.round(Number(value || 0) * 100)}%`;
      },

    formatSoundPlaySummary(record = null) {
        if (!record) {
          return "Not played yet in this session.";
        }
    
        const ageSeconds = Math.max(0, Math.round((Date.now() - Number(record.playedAt || Date.now())) / 1000));
        const ageText = ageSeconds <= 1 ? "just now" : `${ageSeconds}s ago`;
        const modeText = Math.abs(Number(record.modeAdjustedVolume) - Number(record.baseVolume)) > 0.001
          ? `, mode ${this.formatSoundVolumeNumber(record.modeAdjustedVolume)}`
          : "";
        const rateText = Number.isFinite(Number(record.rate))
          ? `, rate ${this.formatSoundVolumeNumber(record.rate)}`
          : "";
    
        return `${record.kind || "sound"} ${ageText}: base ${this.formatSoundVolumeNumber(record.baseVolume)}${modeText} x ${this.formatSoundVolumeNumber(record.multiplier)} = ${this.formatSoundVolumeNumber(record.finalVolume)}${rateText}`;
      },

    getSoundVolumeDescription(soundKey) {
        const metadata = this.getSoundVolumeMetadata(soundKey);
        const selectedRecord = this._soundVolumeLastPlayedByKey?.get(soundKey);
        return [
          `${soundKey}`,
          `${metadata.group || "Sound"} sound`,
          `File: ${metadata.path || "Unknown"}`,
          `Saved multiplier: ${this.formatSoundVolumeNumber(this.getSoundVolumeMultiplier(soundKey))} (${this.formatSoundVolumePercent(this.getSoundVolumeMultiplier(soundKey))})`,
          `In-game volume: ${this.formatSoundVolumeNumber(this.getSoundVolumeDisplayFinalVolume(soundKey))}`,
          `Base volume: ${this.formatSoundVolumeNumber(this.getSoundVolumeDisplayBaseVolume(soundKey))}`,
          `Last play: ${this.formatSoundPlaySummary(selectedRecord)}`
        ].join("\n");
      },

    recordSoundVolumePlay(soundKey, details = {}) {
        if (!soundKey) return;
    
        const metadata = this.getSoundVolumeMetadata(soundKey);
        const record = {
          soundKey,
          group: metadata.group,
          path: metadata.path,
          playedAt: Date.now(),
          ...details
        };
    
        this._soundVolumeLastPlayed = record;
        this._soundVolumeLastPlayedByKey?.set(soundKey, record);
    
        if (this._soundVolumeToolFollowCurrent || !this._soundVolumeToolSelectedKey) {
          this._soundVolumeToolSelectedKey = soundKey;
        }
    
        this.refreshSoundVolumeTool();
      },

    trackSoundVolumeInstance(soundInstance, soundKey, baseVolume = SOUND_VOLUME_DEFAULT, kind = "sound") {
        if (!soundInstance || !soundKey) {
          return soundInstance;
        }
    
        const tracked = { soundInstance, soundKey, baseVolume, kind };
        this._soundVolumeTrackedInstances?.add(tracked);
        const cleanup = () => this._soundVolumeTrackedInstances?.delete(tracked);
    
        if (typeof soundInstance.once === "function") {
          soundInstance.once("complete", cleanup);
          soundInstance.once("destroy", cleanup);
        }
    
        return soundInstance;
      },

    updateTrackedSoundVolumes(soundKey = null) {
        if (!this._soundVolumeTrackedInstances) return;
    
        Array.from(this._soundVolumeTrackedInstances).forEach((tracked) => {
          const { soundInstance, soundKey: trackedKey, baseVolume, kind } = tracked;
          if (!soundInstance || soundInstance.destroyed) {
            this._soundVolumeTrackedInstances.delete(tracked);
            return;
          }
          if (soundKey && trackedKey !== soundKey) {
            return;
          }
          if (kind === "music" && this.musicMuted) {
            return;
          }
    
          const nextVolume = this.getAdjustedSoundVolume(trackedKey, baseVolume);
          if (typeof soundInstance.setVolume === "function") {
            soundInstance.setVolume(nextVolume);
          } else {
            soundInstance.volume = nextVolume;
          }
        });
      },

    initializeSoundVolumeTool() {
        this.soundVolumeMultipliers = this.buildInitialSoundVolumeMap();
        this._soundVolumeToolSelectedKey = this._soundVolumeToolSelectedKey
          || this._soundVolumeLastPlayed?.soundKey
          || "action_spin_click";
    
        this.installSoundVolumeToolKeyboardShortcut();
        this.createSoundVolumeToolPanel();
      },

    installSoundVolumeToolKeyboardShortcut() {
        if (typeof window === "undefined" || this._soundVolumeToolKeydownHandler) {
          return;
        }
    
        this._soundVolumeToolKeydownHandler = (event) => {
          const targetTag = String(event.target?.tagName || "").toLowerCase();
          const isTyping = ["input", "select", "textarea"].includes(targetTag) || event.target?.isContentEditable;
          if (isTyping) return;
    
          if (event.shiftKey && String(event.key || "").toLowerCase() === "a") {
            event.preventDefault();
            this.toggleSoundVolumeTool();
          }
        };
    
        window.addEventListener("keydown", this._soundVolumeToolKeydownHandler);
      },

    createSoundVolumeToolPanel() {
        if (typeof document === "undefined" || this._soundVolumeToolElements) {
          return;
        }
    
        let style = document.getElementById("tk-sound-volume-tool-style");
        if (!style) {
          style = document.createElement("style");
          style.id = "tk-sound-volume-tool-style";
          style.textContent = `
            .tk-sound-volume-tool {
              position: fixed;
              top: 64px;
              right: 16px;
              z-index: 99999;
              width: 360px;
              max-width: calc(100vw - 24px);
              box-sizing: border-box;
              padding: 12px;
              border: 1px solid rgba(148, 163, 184, 0.45);
              border-radius: 8px;
              background: rgba(15, 23, 42, 0.96);
              box-shadow: 0 16px 44px rgba(0, 0, 0, 0.42);
              color: #f8fafc;
              font: 13px/1.35 Arial, sans-serif;
            }
            .tk-sound-volume-tool[hidden] { display: none; }
            .tk-sound-volume-tool button,
            .tk-sound-volume-tool select,
            .tk-sound-volume-tool input {
              font: inherit;
            }
            .tk-sound-volume-header,
            .tk-sound-volume-row,
            .tk-sound-volume-buttons {
              display: flex;
              align-items: center;
              gap: 8px;
            }
            .tk-sound-volume-header {
              justify-content: space-between;
              margin-bottom: 10px;
            }
            .tk-sound-volume-header strong {
              font-size: 14px;
            }
            .tk-sound-volume-field {
              display: grid;
              gap: 4px;
              margin: 8px 0;
            }
            .tk-sound-volume-field span,
            .tk-sound-volume-check {
              color: #cbd5e1;
              font-size: 12px;
            }
            .tk-sound-volume-tool select,
            .tk-sound-volume-tool input[type="number"] {
              width: 100%;
              min-height: 30px;
              box-sizing: border-box;
              border: 1px solid rgba(148, 163, 184, 0.5);
              border-radius: 6px;
              background: #0b1220;
              color: #f8fafc;
              padding: 4px 8px;
            }
            .tk-sound-volume-tool input[type="range"] {
              width: 100%;
            }
            .tk-sound-volume-row {
              grid-template-columns: 1fr 78px;
              display: grid;
              align-items: center;
            }
            .tk-sound-volume-selected {
              min-height: 18px;
              padding: 6px 8px;
              margin: 6px 0;
              border-radius: 6px;
              background: rgba(30, 41, 59, 0.86);
              color: #facc15;
              word-break: break-word;
              cursor: help;
            }
            .tk-sound-volume-check {
              display: flex;
              align-items: center;
              gap: 6px;
              margin: 8px 0;
            }
            .tk-sound-volume-buttons {
              flex-wrap: wrap;
              margin-top: 9px;
            }
            .tk-sound-volume-tool button,
            .tk-sound-volume-file-button {
              min-height: 29px;
              border: 1px solid rgba(148, 163, 184, 0.5);
              border-radius: 6px;
              background: #1f2937;
              color: #f8fafc;
              padding: 4px 9px;
              cursor: pointer;
            }
            .tk-sound-volume-tool button:hover,
            .tk-sound-volume-file-button:hover {
              background: #334155;
            }
            .tk-sound-volume-file-button input { display: none; }
            .tk-sound-volume-info {
              min-height: 46px;
              margin-top: 9px;
              padding: 8px;
              border-radius: 6px;
              background: rgba(2, 6, 23, 0.62);
              color: #dbeafe;
              white-space: pre-line;
            }
            .tk-sound-volume-status {
              min-height: 18px;
              margin-top: 8px;
              color: #a7f3d0;
              font-size: 12px;
            }
            .tk-sound-volume-tooltip {
              position: fixed;
              z-index: 100000;
              max-width: 340px;
              padding: 8px 10px;
              border: 1px solid rgba(250, 204, 21, 0.5);
              border-radius: 6px;
              background: rgba(2, 6, 23, 0.97);
              color: #f8fafc;
              font: 12px/1.35 Arial, sans-serif;
              white-space: pre-line;
              pointer-events: none;
            }
            .tk-sound-volume-tooltip[hidden] { display: none; }
          `;
          document.head.appendChild(style);
        }
    
        const panel = document.createElement("div");
        panel.className = "tk-sound-volume-tool";
        panel.hidden = true;
        panel.innerHTML = `
          <div class="tk-sound-volume-header">
            <strong>Sound Volume</strong>
            <button type="button" data-action="close">x</button>
          </div>
          <label class="tk-sound-volume-field">
            <span>Sound key</span>
            <select data-role="sound-select"></select>
          </label>
          <div class="tk-sound-volume-selected" data-role="sound-key" tabindex="0"></div>
          <label class="tk-sound-volume-check">
            <input type="checkbox" data-role="follow-current" checked>
            <span>Follow current sound</span>
          </label>
          <label class="tk-sound-volume-field">
            <span>In-game volume</span>
            <div class="tk-sound-volume-row">
              <input type="range" data-role="volume-range" min="${SOUND_VOLUME_MIN}" max="${SOUND_VOLUME_MAX}" step="${SOUND_VOLUME_STEP}">
              <input type="number" data-role="volume-number" min="${SOUND_VOLUME_MIN}" max="${SOUND_VOLUME_MAX}" step="${SOUND_VOLUME_STEP}">
            </div>
          </label>
          <div class="tk-sound-volume-buttons">
            <button type="button" data-action="decrease">-</button>
            <button type="button" data-action="increase">+</button>
            <button type="button" data-action="play">Play</button>
            <button type="button" data-action="stop">Stop test</button>
            <button type="button" data-action="reset">Reset</button>
          </div>
          <div class="tk-sound-volume-info" data-role="info"></div>
          <div class="tk-sound-volume-buttons">
            <button type="button" data-action="copy-json">Copy JSON</button>
            <button type="button" data-action="download-json">Download JSON</button>
            <label class="tk-sound-volume-file-button">
              Import JSON
              <input type="file" data-role="import-json" accept="application/json,.json">
            </label>
          </div>
          <div class="tk-sound-volume-status" data-role="status"></div>
        `;
    
        const tooltip = document.createElement("div");
        tooltip.className = "tk-sound-volume-tooltip";
        tooltip.hidden = true;
    
        document.body.appendChild(panel);
        document.body.appendChild(tooltip);
    
        const elements = {
          panel,
          tooltip,
          select: panel.querySelector('[data-role="sound-select"]'),
          soundKey: panel.querySelector('[data-role="sound-key"]'),
          followCurrent: panel.querySelector('[data-role="follow-current"]'),
          volumeRange: panel.querySelector('[data-role="volume-range"]'),
          volumeNumber: panel.querySelector('[data-role="volume-number"]'),
          info: panel.querySelector('[data-role="info"]'),
          status: panel.querySelector('[data-role="status"]'),
          importJson: panel.querySelector('[data-role="import-json"]')
        };
        this._soundVolumeToolElements = elements;
    
        panel.addEventListener("pointerdown", (event) => event.stopPropagation());
        panel.querySelector('[data-action="close"]')?.addEventListener("click", () => this.toggleSoundVolumeTool(false));
        panel.querySelector('[data-action="decrease"]')?.addEventListener("click", () => this.stepSelectedSoundVolume(-SOUND_VOLUME_STEP));
        panel.querySelector('[data-action="increase"]')?.addEventListener("click", () => this.stepSelectedSoundVolume(SOUND_VOLUME_STEP));
        panel.querySelector('[data-action="play"]')?.addEventListener("click", () => this.playSoundVolumeToolSelectedSound());
        panel.querySelector('[data-action="stop"]')?.addEventListener("click", () => this.stopSoundVolumeToolPreview());
        panel.querySelector('[data-action="reset"]')?.addEventListener("click", () => this.resetSelectedSoundVolume());
        panel.querySelector('[data-action="copy-json"]')?.addEventListener("click", () => this.copySoundVolumeConfigJson());
        panel.querySelector('[data-action="download-json"]')?.addEventListener("click", () => this.downloadSoundVolumeConfigJson());
    
        elements.select?.addEventListener("change", () => {
          this._soundVolumeToolFollowCurrent = false;
          if (elements.followCurrent) elements.followCurrent.checked = false;
          this._soundVolumeToolSelectedKey = elements.select.value;
          this.refreshSoundVolumeTool();
        });
        elements.followCurrent?.addEventListener("change", () => {
          this._soundVolumeToolFollowCurrent = !!elements.followCurrent.checked;
          if (this._soundVolumeToolFollowCurrent && this._soundVolumeLastPlayed?.soundKey) {
            this._soundVolumeToolSelectedKey = this._soundVolumeLastPlayed.soundKey;
          }
          this.refreshSoundVolumeTool();
        });
        elements.volumeRange?.addEventListener("input", () => {
          this.setSoundVolumeFinalVolume(this.getSelectedSoundVolumeToolKey(), elements.volumeRange.value);
        });
        elements.volumeNumber?.addEventListener("change", () => {
          this.setSoundVolumeFinalVolume(this.getSelectedSoundVolumeToolKey(), elements.volumeNumber.value);
        });
        elements.importJson?.addEventListener("change", () => this.importSoundVolumeConfigJson(elements.importJson.files?.[0]));
    
        const scheduleTooltip = (event) => this.scheduleSoundVolumeTooltip(event);
        elements.soundKey?.addEventListener("mouseenter", scheduleTooltip);
        elements.soundKey?.addEventListener("mousemove", (event) => this.positionSoundVolumeTooltip(event.clientX, event.clientY));
        elements.soundKey?.addEventListener("mouseleave", () => this.hideSoundVolumeTooltip());
        elements.soundKey?.addEventListener("focus", (event) => this.scheduleSoundVolumeTooltip(event));
        elements.soundKey?.addEventListener("blur", () => this.hideSoundVolumeTooltip());
    
        this.refreshSoundVolumeTool();
      },

    getSelectedSoundVolumeToolKey() {
        const keys = this.getSoundVolumeToolKeys();
        if (this._soundVolumeToolSelectedKey && keys.includes(this._soundVolumeToolSelectedKey)) {
          return this._soundVolumeToolSelectedKey;
        }
    
        const fallback = this._soundVolumeLastPlayed?.soundKey || keys[0] || "action_spin_click";
        this._soundVolumeToolSelectedKey = fallback;
        return fallback;
      },

    refreshSoundVolumeTool() {
        const elements = this._soundVolumeToolElements;
        if (!elements) return;
        if (!this._soundVolumeToolVisible) return;
    
        const selectedKey = this.getSelectedSoundVolumeToolKey();
        const selectedMultiplier = this.getSoundVolumeMultiplier(selectedKey);
        const selectedBaseVolume = this.getSoundVolumeDisplayBaseVolume(selectedKey);
        const selectedFinalVolume = this.getSoundVolumeDisplayFinalVolume(selectedKey);
        const selectedMaxVolume = this.getSoundVolumeDisplayMaxVolume(selectedKey);
        this.populateSoundVolumeToolSelect(selectedKey);
    
        if (elements.soundKey) {
          elements.soundKey.textContent = selectedKey;
        }
        if (elements.followCurrent) {
          elements.followCurrent.checked = !!this._soundVolumeToolFollowCurrent;
        }
        if (elements.volumeRange) {
          elements.volumeRange.max = String(selectedMaxVolume);
          elements.volumeRange.value = String(selectedFinalVolume);
        }
        if (elements.volumeNumber) {
          elements.volumeNumber.max = String(selectedMaxVolume);
          elements.volumeNumber.value = this.formatSoundVolumeNumber(selectedFinalVolume);
        }
        if (elements.info) {
          const selectedRecord = this._soundVolumeLastPlayedByKey?.get(selectedKey);
          const latestRecord = this._soundVolumeLastPlayed;
          const metadata = this.getSoundVolumeMetadata(selectedKey);
          elements.info.textContent = [
            `Selected: ${metadata.group || "Sound"} (${metadata.path || "Unknown file"})`,
            `In-game volume: ${this.formatSoundVolumeNumber(selectedFinalVolume)}`,
            `Base x multiplier: ${this.formatSoundVolumeNumber(selectedBaseVolume)} x ${this.formatSoundVolumeNumber(selectedMultiplier)}`,
            `Selected last play: ${this.formatSoundPlaySummary(selectedRecord)}`,
            `Current in game: ${latestRecord?.soundKey || "none"}`
          ].join("\n");
        }
      },

    populateSoundVolumeToolSelect(selectedKey) {
        const select = this._soundVolumeToolElements?.select;
        if (!select) return;
    
        const keys = this.getSoundVolumeToolKeys();
        const previousValue = select.value;
        select.innerHTML = "";
    
        const groups = new Map();
        keys.forEach((soundKey) => {
          const group = this.getSoundVolumeMetadata(soundKey).group || "Other";
          if (!groups.has(group)) groups.set(group, []);
          groups.get(group).push(soundKey);
        });
    
        Array.from(groups.keys()).sort().forEach((group) => {
          const optgroup = document.createElement("optgroup");
          optgroup.label = group;
          groups.get(group).forEach((soundKey) => {
            const option = document.createElement("option");
            option.value = soundKey;
            option.textContent = soundKey;
            optgroup.appendChild(option);
          });
          select.appendChild(optgroup);
        });
    
        select.value = selectedKey || previousValue;
      },

    toggleSoundVolumeTool(forceVisible = null) {
        if (!this._soundVolumeToolElements) {
          this.createSoundVolumeToolPanel();
        }
    
        const elements = this._soundVolumeToolElements;
        if (!elements?.panel) return;
    
        const nextVisible = forceVisible === null ? !this._soundVolumeToolVisible : !!forceVisible;
        this._soundVolumeToolVisible = nextVisible;
        elements.panel.hidden = !nextVisible;
    
        if (nextVisible) {
          if (this._soundVolumeToolFollowCurrent && this._soundVolumeLastPlayed?.soundKey) {
            this._soundVolumeToolSelectedKey = this._soundVolumeLastPlayed.soundKey;
          }
          this.refreshSoundVolumeTool();
        } else {
          this.hideSoundVolumeTooltip();
        }
      },

    stepSelectedSoundVolume(delta) {
        const soundKey = this.getSelectedSoundVolumeToolKey();
        const nextValue = this.getSoundVolumeDisplayFinalVolume(soundKey) + Number(delta || 0);
        this.setSoundVolumeFinalVolume(soundKey, nextValue);
      },

    resetSelectedSoundVolume() {
        this.setSoundVolumeMultiplier(this.getSelectedSoundVolumeToolKey(), SOUND_VOLUME_DEFAULT);
      },

    playSoundVolumeToolSelectedSound() {
        const soundKey = this.getSelectedSoundVolumeToolKey();
        if (!soundKey || !this.sound) return;
    
        this.stopSoundVolumeToolPreview({ silent: true });
        const resumePromise = this.sound.context?.resume?.();
        if (resumePromise?.catch) {
          resumePromise.catch(() => {});
        }
    
        const baseVolume = this.getSoundVolumeDisplayBaseVolume(soundKey);
        const previewConfig = this.applySoundVolumeConfig(soundKey, {
          volume: baseVolume
        }, {
          kind: "preview",
          originalVolume: baseVolume
        });
    
        try {
          const sound = this.sound.add(soundKey, previewConfig);
          this._soundVolumeToolPreview = sound;
          this.trackSoundVolumeInstance(sound, soundKey, baseVolume, "preview");
          sound.once?.("complete", () => {
            if (this._soundVolumeToolPreview === sound) {
              this._soundVolumeToolPreview = null;
            }
          });
          sound.play();
          this.setSoundVolumeToolStatus(`Playing ${soundKey}.`);
        } catch (error) {
          console.warn(`Could not preview sound ${soundKey}.`, error);
          this.setSoundVolumeToolStatus(`Could not play ${soundKey}.`);
        }
      },

    stopSoundVolumeToolPreview({ silent = false } = {}) {
        const preview = this._soundVolumeToolPreview;
        if (preview && !preview.destroyed) {
          preview.stop?.();
          preview.destroy?.();
        }
        this._soundVolumeToolPreview = null;
        if (!silent) {
          this.setSoundVolumeToolStatus("Stopped test sound.");
        }
      },

    async copySoundVolumeConfigJson() {
        const text = this.serializeSoundVolumeConfig();
    
        try {
          if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
          } else {
            const textarea = document.createElement("textarea");
            textarea.value = text;
            textarea.setAttribute("readonly", "readonly");
            textarea.style.position = "fixed";
            textarea.style.left = "-9999px";
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand("copy");
            textarea.remove();
          }
          this.setSoundVolumeToolStatus("JSON copied.");
        } catch (error) {
          console.warn("Could not copy sound volume JSON.", error);
          this.setSoundVolumeToolStatus("Copy failed. Use Download JSON.");
        }
      },

    downloadSoundVolumeConfigJson() {
        if (typeof document === "undefined") return;
    
        const blob = new Blob([this.serializeSoundVolumeConfig()], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = SOUND_VOLUME_FILE_NAME;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        this.setSoundVolumeToolStatus("JSON file prepared.");
      },

    async importSoundVolumeConfigJson(file) {
        if (!file) return;
    
        try {
          const text = await file.text();
          const parsed = JSON.parse(text);
          const imported = normalizeSoundVolumeMap(parsed);
          this.soundVolumeMultipliers = {
            ...this.buildDefaultSoundVolumeMap(),
            ...imported
          };
          this.persistSoundVolumeMap();
          this.updateTrackedSoundVolumes();
          this.refreshSoundVolumeTool();
          this.setSoundVolumeToolStatus("Imported JSON settings.");
        } catch (error) {
          console.warn("Could not import sound volume JSON.", error);
          this.setSoundVolumeToolStatus("Import failed. Check the JSON file.");
        } finally {
          if (this._soundVolumeToolElements?.importJson) {
            this._soundVolumeToolElements.importJson.value = "";
          }
        }
      },

    scheduleSoundVolumeTooltip(event) {
        this.hideSoundVolumeTooltip({ keepTimer: false });
        const target = event?.currentTarget;
        const rect = target?.getBoundingClientRect?.();
        const x = event?.clientX ?? rect?.left ?? 16;
        const y = event?.clientY ?? rect?.bottom ?? 16;
    
        this._soundVolumeToolHoverTimer = window.setTimeout(() => {
          this.showSoundVolumeTooltip(x, y);
        }, 550);
      },

    showSoundVolumeTooltip(x, y) {
        const tooltip = this._soundVolumeToolElements?.tooltip;
        if (!tooltip) return;
    
        tooltip.textContent = this.getSoundVolumeDescription(this.getSelectedSoundVolumeToolKey());
        tooltip.hidden = false;
        this.positionSoundVolumeTooltip(x, y);
      },

    positionSoundVolumeTooltip(x, y) {
        const tooltip = this._soundVolumeToolElements?.tooltip;
        if (!tooltip || tooltip.hidden) return;
    
        const margin = 12;
        const nextX = Math.min(window.innerWidth - tooltip.offsetWidth - margin, Number(x || 0) + margin);
        const nextY = Math.min(window.innerHeight - tooltip.offsetHeight - margin, Number(y || 0) + margin);
        tooltip.style.left = `${Math.max(margin, nextX)}px`;
        tooltip.style.top = `${Math.max(margin, nextY)}px`;
      },

    hideSoundVolumeTooltip({ keepTimer = false } = {}) {
        if (!keepTimer && this._soundVolumeToolHoverTimer) {
          clearTimeout(this._soundVolumeToolHoverTimer);
          this._soundVolumeToolHoverTimer = null;
        }
        if (this._soundVolumeToolElements?.tooltip) {
          this._soundVolumeToolElements.tooltip.hidden = true;
        }
      },

    setSoundVolumeToolStatus(message) {
        const status = this._soundVolumeToolElements?.status;
        if (status) {
          status.textContent = message || "";
        }
      },

    destroySoundVolumeTool() {
        this.stopSoundVolumeToolPreview({ silent: true });
        this.hideSoundVolumeTooltip();
    
        if (typeof window !== "undefined" && this._soundVolumeToolKeydownHandler) {
          window.removeEventListener("keydown", this._soundVolumeToolKeydownHandler);
        }
        this._soundVolumeToolKeydownHandler = null;
    
        if (this._soundVolumeToolElements?.panel) {
          this._soundVolumeToolElements.panel.remove();
        }
        if (this._soundVolumeToolElements?.tooltip) {
          this._soundVolumeToolElements.tooltip.remove();
        }
        this._soundVolumeToolElements = null;
        this._soundVolumeToolVisible = false;
        this._soundVolumeTrackedInstances?.clear();
      },

    getSfxConfigForAudioMode(config = {}, { volumeMultiplier } = {}) {
        const mode = this.getAudioInteractionMode();
        if (mode === 'muteSfx') {
          return null;
        }
    
        if (mode !== 'duckSfx') {
          return { ...config };
        }
    
        const nextConfig = { ...config };
        const multiplier = typeof volumeMultiplier === 'number'
          ? volumeMultiplier
          : this._fastForwardSfxVolumeMultiplier;
        const baseVolume = typeof nextConfig.volume === 'number' ? nextConfig.volume : 1;
        nextConfig.volume = baseVolume * multiplier;
        return nextConfig;
      },

    isFastForwardSfxSuppressed() {
        return !!this._fastForwardRequested;
      },

    shouldPlaySfx(soundKey, { allowDuringFastForward } = {}) {
        if (!soundKey || !this.sound) {
          return false;
        }
    
        const policy = soundInteractionPolicy[soundKey];
        const allowed = allowDuringFastForward ?? policy?.allowDuringFastForward ?? true;
        if (this.isFastForwardSfxSuppressed() && !allowed) {
          return false;
        }
    
        return true;
      },

    playSfx(soundKey, config = {}, options = {}) {
        if (!this.shouldPlaySfx(soundKey, options)) {
          return null;
        }
    
        const nextConfig = this.getSfxConfigForAudioMode(config, options);
        if (!nextConfig) {
          return null;
        }
    
        return this.sound.play(soundKey, this.applySoundVolumeConfig(soundKey, nextConfig, {
          kind: "sfx",
          originalVolume: config.volume
        }));
      },

    startLoopingSfx(soundKey, config = {}, options = {}) {
        if (!this.shouldPlaySfx(soundKey, options)) {
          return null;
        }
    
        const nextConfig = this.getSfxConfigForAudioMode({
          ...config,
          loop: true
        }, options);
        if (!nextConfig) {
          return null;
        }
    
        const baseVolume = typeof nextConfig.volume === "number" ? nextConfig.volume : SOUND_VOLUME_DEFAULT;
        const tunedConfig = this.applySoundVolumeConfig(soundKey, nextConfig, {
          kind: "loop",
          originalVolume: config.volume
        });
        const sound = this.sound.add(soundKey, tunedConfig);
        sound.play();
        return this.trackSoundVolumeInstance(sound, soundKey, baseVolume, "loop");
      },

    stopLoopingSfx(soundInstance = null, fadeMs = 120) {
        if (!soundInstance || soundInstance.destroyed) return;
        const stopAndDestroy = () => {
          if (!soundInstance || soundInstance.destroyed) return;
          soundInstance.stop();
          soundInstance.destroy();
        };
    
        if (fadeMs > 0 && Number(soundInstance.volume) > 0) {
          this.tweens.add({
            targets: soundInstance,
            volume: 0,
            duration: fadeMs,
            ease: "Linear",
            onComplete: stopAndDestroy
          });
          return;
        }
    
        stopAndDestroy();
      },

    async playBonusWonCelebrationPause({
        holdMs = BONUS_WON_CELEBRATION_HOLD_MS
      } = {}) {
        this.playSfx?.("bonus_won_stinger", {
          volume: 0.62
        }, {
          allowDuringFastForward: false
        });
        this.startBonusTheme?.();
        await this.waitForPresentation(Math.max(0, Math.floor(Number(holdMs) || 0)), {
          skippable: true
        });
      },

    playSpinClickSound() {
        this.playSfx('action_spin_click', { volume: 0.5 });
      },

    startMainTheme() {
        // FAILSAFE: Don't start if already playing OR if bonus theme is playing
        if ((this.mainThemeMusic && this.mainThemeMusic.isPlaying) || 
            (this.bonusThemeMusic && this.bonusThemeMusic.isPlaying)) {
          return;
        }
        
        // Stop and remove any existing main theme
        if (this.mainThemeMusic) {
          this.mainThemeMusic.stop();
          this.mainThemeMusic.destroy();
        }
        
        // Start main theme with loop
        this.mainThemeMusic = this.sound.add('theme_main', this.applySoundVolumeConfig('theme_main', {
          loop: true,
          volume: MAIN_THEME_VOLUME
        }, {
          kind: "music",
          originalVolume: MAIN_THEME_VOLUME
        }));
        this.trackSoundVolumeInstance(this.mainThemeMusic, 'theme_main', MAIN_THEME_VOLUME, "music");
        this.mainThemeMusic.play();
      },

    startBonusTheme() {
        // FAILSAFE: Don't start if bonus theme is already playing
        if (this.bonusThemeMusic && this.bonusThemeMusic.isPlaying) {
          return;
        }
        
        // Kill any existing music tweens to prevent conflicts
        if (this.bonusMusicFadeTween) {
          this.bonusMusicFadeTween.stop();
          this.bonusMusicFadeTween = null;
        }
        if (this.mainMusicFadeTween) {
          this.mainMusicFadeTween.stop();
          this.mainMusicFadeTween = null;
        }
        
        // Crossfade out of main theme when bonus starts so the Helldive handoff feels smoother.
        if (this.mainThemeMusic && this.mainThemeMusic.isPlaying) {
          const mainMusic = this.mainThemeMusic;
          this.mainMusicFadeTween = this.tweens.add({
            targets: mainMusic,
            volume: 0,
            duration: 900,
            ease: 'Linear',
            onUpdate: (tween) => {
              if (!mainMusic || mainMusic.destroyed) {
                tween.stop();
              }
            },
            onComplete: () => {
              if (mainMusic && !mainMusic.destroyed) {
                mainMusic.stop();
              }
              this.mainMusicFadeTween = null;
            }
          });
        }
        
        // Start bonus theme from the active section of the track.
        this.bonusThemeMusic = this.sound.add('theme_bonus', {
          loop: true,
          volume: 0
        });
        this.trackSoundVolumeInstance(this.bonusThemeMusic, 'theme_bonus', BONUS_THEME_VOLUME, "music");
        this.recordSoundVolumePlay('theme_bonus', {
          kind: "music",
          baseVolume: BONUS_THEME_VOLUME,
          modeAdjustedVolume: BONUS_THEME_VOLUME,
          multiplier: this.getSoundVolumeMultiplier('theme_bonus'),
          finalVolume: this.getAdjustedSoundVolume('theme_bonus', BONUS_THEME_VOLUME)
        });
        this.bonusThemeMusic.play({ seek: BONUS_THEME_SEEK_SECONDS });
        
        // Fade in bonus theme
        const bonusMusic = this.bonusThemeMusic;
        this.bonusMusicFadeTween = this.tweens.add({
          targets: bonusMusic,
          volume: this.musicMuted ? 0 : this.getAdjustedSoundVolume('theme_bonus', BONUS_THEME_VOLUME),
          duration: BONUS_THEME_FADE_IN_MS,
          ease: 'Linear',
          onUpdate: (tween) => {
            if (!bonusMusic || bonusMusic.destroyed) {
              tween.stop();
            }
          },
          onComplete: () => {
            this.bonusMusicFadeTween = null;
          }
        });
      },

    stopBonusTheme() {
        // Only do this if bonus theme is actually playing
        if (!this.bonusThemeMusic || !this.bonusThemeMusic.isPlaying) {
          return; // No need to transition if not in bonus
        }
        
        // Kill any existing music tweens to prevent volume errors
        if (this.bonusMusicFadeTween) {
          this.bonusMusicFadeTween.stop();
          this.bonusMusicFadeTween = null;
        }
        if (this.mainMusicFadeTween) {
          this.mainMusicFadeTween.stop();
          this.mainMusicFadeTween = null;
        }
        
        // Fade out bonus theme
        const bonusMusic = this.bonusThemeMusic; // Store reference
        this.bonusMusicFadeTween = this.tweens.add({
          targets: bonusMusic,
          volume: 0,
          duration: 1500,
          ease: 'Linear',
          onUpdate: (tween) => {
            // Safety check - stop tween if music is gone
            if (!bonusMusic || bonusMusic.destroyed) {
              tween.stop();
            }
          },
          onComplete: () => {
            if (bonusMusic && !bonusMusic.destroyed) {
              bonusMusic.stop();
              bonusMusic.destroy();
            }
            this.bonusThemeMusic = null;
            this.bonusMusicFadeTween = null;
          }
        });
        
        // Resume main theme
        if (this.mainThemeMusic && !this.mainThemeMusic.destroyed) {
          this.mainThemeMusic.setVolume(0);
          if (!this.mainThemeMusic.isPlaying) {
            this.mainThemeMusic.play();
          }
          
          const mainMusic = this.mainThemeMusic; // Store reference
          this.mainMusicFadeTween = this.tweens.add({
            targets: mainMusic,
            volume: this.getAdjustedSoundVolume('theme_main', MAIN_THEME_VOLUME),
            duration: 1500,
            ease: 'Linear',
            onUpdate: (tween) => {
              // Safety check - stop tween if music is gone
              if (!mainMusic || mainMusic.destroyed) {
                tween.stop();
              }
            },
            onComplete: () => {
              this.mainMusicFadeTween = null;
            }
          });
        }
      },

    toggleMusic() {
        this.musicMuted = !this.musicMuted;
        
        // Mute/unmute main theme
        if (this.mainThemeMusic) {
          if (this.musicMuted) {
            this.mainThemeMusic.setVolume(0);
          } else if (this.mainThemeMusic.isPlaying) {
            this.mainThemeMusic.setVolume(this.getAdjustedSoundVolume('theme_main', MAIN_THEME_VOLUME));
          }
        }
        
        // Mute/unmute bonus theme
        if (this.bonusThemeMusic) {
          if (this.musicMuted) {
            this.bonusThemeMusic.setVolume(0);
          } else if (this.bonusThemeMusic.isPlaying) {
            this.bonusThemeMusic.setVolume(this.getAdjustedSoundVolume('theme_bonus', BONUS_THEME_VOLUME));
          }
        }
      },

    isMusicMuted() {
        return this.musicMuted || false;
      },

    getLandingSoundByReel(reel) {
        if (reel <= 1) return 'land1'; // Reels 0-1 (1-2 in 1-indexed)
        if (reel <= 3) return 'land2'; // Reels 2-3 (3-4 in 1-indexed)
        if (reel <= 5) return 'land3'; // Reels 4-5 (5-6 in 1-indexed)
        if (reel === 6) return 'land4'; // Reel 6 (7 in 1-indexed)
        return 'land5'; // Reel 7 (8 in 1-indexed)
      },

    getLandingSoundByRow(row) {
        if (row <= 1) return 'land1'; // Rows 0-1 (1-2 in 1-indexed)
        if (row <= 4) return 'land2'; // Rows 2-4 (3-5 in 1-indexed)
        if (row <= 5) return 'land3'; // Rows 5-6 (6-7 in 1-indexed)
        return 'land4'; // Row 6+ (use land4 for remaining)
      },

    playLandingSoundIfNotPlaying(soundKey, volume = 0.3) {
        // Initialize tracking object if needed
        if (!this.playingLandingSounds) {
          this.playingLandingSounds = {};
        }
        
        // Don't play if this sound is already playing
        if (this.playingLandingSounds[soundKey]) {
          return;
        }
        
        const soundInstance = this.playSfx(soundKey, { volume });
        if (!soundInstance) {
          return;
        }
    
        // Mark as playing only when the sound was actually emitted.
        this.playingLandingSounds[soundKey] = true;
        
        // Clear flag after a short delay (landing sounds are short, ~500ms)
        this.time.delayedCall(500, () => {
          this.playingLandingSounds[soundKey] = false;
        });
      },

    beginBriefSlowMo(factor = 0.35, duration = 300, { affectTimers = false } = {}) {
        // prevent stacking if multiple books trigger close together
        if (this._slowMoActive) return;
    
        this._slowMoActive = true;
    
        const prevTweenScale = this.tweens.timeScale;
        const prevTimeScale  = this.time.timeScale;
    
        this.tweens.timeScale = factor;
        if (affectTimers) this.time.timeScale = factor; // leave false if you don't want delayedCall slowed
    
        this._slowMoTimer?.remove(false);
        this._slowMoTimer = this.time.delayedCall(duration, () => {
          this.tweens.timeScale = prevTweenScale;
          if (affectTimers) this.time.timeScale = prevTimeScale;
          this._slowMoActive = false;
          this._slowMoTimer = null;
        });
      },

    beginCrescendoSlowMo(levels=[1,1,1,2,3,4,5], totalMs=320, affectTimers=false) {
        // cancel previous slowmo only (not pause)
        this.endSlowMo();
        this.endSlowMoRT?.();
    
        this._slowMoActive = true;
        this._slowMoAffectTimers = affectTimers;
        this._slowMoEvents = [];
        const base = 5;
    
        const stepMs = Math.max(1, Math.floor(totalMs / levels.length));
        const clamp = v => Math.max(0.05, Math.min(2, v / base));
    
        const apply = (lvl) => {
          this._slowMoCurrent = clamp(lvl);
          this._recalcScales();
        };
    
        apply(levels[0]);
    
        for (let i = 1; i < levels.length; i++) {
          const lvl = levels[i];
          const ev = this.time.delayedCall(i * stepMs, () => apply(lvl));
          this._slowMoEvents.push(ev);
        }
    
        const endEv = this.time.delayedCall(totalMs, () => this.endSlowMo());
        this._slowMoEvents.push(endEv);
    
        return () => this.endSlowMo(); // cancel handle
      },

    beginCrescendoSlowMoRT(levels=[1,1,1,2,3,4,5], totalMs=320, affectTimers=false) {
        // cancel any existing RT crescendo
        this.endSlowMoRT?.();
        this.endSlowMo();
    
        const base = 5;
        const clamp = v => Math.max(0.05, Math.min(2, v / base));
    
        this._slowMoRT = {
          start: performance.now(),
          total: totalMs,
          levels,
          affectTimers,
          onUpdate: null,
          timeout: null
        };
    
        // apply by index based on elapsed real time
        const applyByElapsed = (now) => {
          const st = this._slowMoRT;
          if (!st) return;
          const t = Math.min(1, (now - st.start) / st.total);
          const idx = Math.min(st.levels.length - 1, Math.floor(t * st.levels.length));
          this._slowMoCurrent = clamp(st.levels[idx]);
          this._slowMoAffectTimers = st.affectTimers;
          this._slowMoActive = true;
          this._recalcScales?.();  // from previous message; recompute combined scales
        };
    
        // per-frame updater (real-time)
        const updateFn = (time /*ms*/) => applyByElapsed(performance.now());
        this.events.on('update', updateFn);
        this._slowMoRT.onUpdate = updateFn;
    
        // initial apply + hard wall-clock stop
        applyByElapsed(performance.now());
        this._slowMoRT.timeout = setTimeout(() => this.endSlowMoRT(), totalMs);
    
        // allow manual cancel
        return () => this.endSlowMoRT();
      },

    endSlowMoRT() {
        const st = this._slowMoRT;
        if (!st) return;
        if (st.onUpdate) this.events.off('update', st.onUpdate);
        if (st.timeout) clearTimeout(st.timeout);
        this._slowMoRT = null;
    
        // clear slowmo state & recompute (respects pause, etc.)
        this._slowMoActive = false;
        this._slowMoCurrent = 1;
        this._recalcScales?.();
    
        // ✨ give in-flight tweens a brief speed boost to “catch up”
        this.boostActiveTweens?.(2.0, 120);
      },

    endSlowMo() {
      if (!this._slowMoActive) return;
      this._slowMoEvents?.forEach(e => e?.remove(false));
      this._slowMoEvents = null;
      this._slowMoActive = false;
      this._slowMoCurrent = 1;
      this._recalcScales(); // ← recompute final (respects pause if active)
      },

    _recalcScales() {
      const baselineTweens = this._baseline?.tweens ?? ONE;
      const baselineTime = this._baseline?.time ?? ONE;
      const baselineAnims = this._baseline?.anims ?? ONE;

      if (this._softPaused) {
        this.tweens.timeScale = EPS;
        if (this._softAffectTimers) {
          this.time.timeScale = EPS;
        } else {
          this.time.timeScale = baselineTime;
        }
        if (this.anims) {
          this.anims.globalTimeScale = EPS;
        }
        return;
      }

      const slowMoScale = this._slowMoActive
        ? Math.max(0.05, Number(this._slowMoCurrent) || 1)
        : 1;

      this.tweens.timeScale = baselineTweens * slowMoScale;
      this.time.timeScale = this._slowMoAffectTimers
        ? baselineTime * slowMoScale
        : baselineTime;
      if (this.anims) {
        this.anims.globalTimeScale = baselineAnims * slowMoScale;
      }
    },

    pauseGame({ timers = true, audio = true, input = true } = {}) {
      this.installSoftPause();
      if (this._softPaused) return;
      this._softPaused = true;
      this._softAffectTimers = timers;
    
      // Apply immediately (the preupdate guard keeps it enforced)
      this.tweens.timeScale = EPS;
      if (timers) this.time.timeScale = EPS;
      if (this.anims) this.anims.globalTimeScale = EPS;
    
      // Optional niceties
      if (audio && this.sound) { 
        this.sound.setMute(true)
        this.sound.pauseAll();
      }
      // if (input) this.input?.keyboard?.preventDefault = true; // or disable pointers you care about
      },

    resumeGame({ audio = false } = {}) {
      if (!this._softPaused) return;
      this._softPaused = false;
    
      // Restore to baselines (or recompute if you have slow-mo manager)
      this.tweens.timeScale = this._baseline.tweens ?? ONE;
      this.time.timeScale   = this._baseline.time   ?? ONE;
      if (this.anims) this.anims.globalTimeScale = this._baseline.anims ?? ONE;
    
      if (audio && this.sound) {
        this.sound.resumeAll();
        this.sound.setMute(false)
      }
    
      // If you also run slow-mo / crescendo, re-apply your combined solver here:
      this._recalcScales?.();
      },

    installSoftPause() {
      if (this._softPauseInstalled) return;
      this._softPauseInstalled = true;
    
      // remember current “normal” baselines you use in your game
      this._baseline = {
        tweens: this.tweens.timeScale ?? ONE,
        time:   this.time.timeScale   ?? ONE,
        anims:  this.anims?.globalTimeScale ?? ONE,
      };
    
      // Guard each frame so other code can't override while paused
      this.events.on('preupdate', () => {
        if (!this._softPaused) return;
        this.tweens.timeScale = EPS;
        if (this._softAffectTimers) this.time.timeScale = EPS;
        if (this.anims) this.anims.globalTimeScale = EPS;
    
        // PHYSICS:
        // Arcade doesn't have a universal timeScale pre-3.90 in all setups,
        // so either leave it running or explicitly pause/resume the world.
        // If you want physics "soft paused", consider zeroing velocities for key bodies
        // or gating updates in your own systems while _softPaused is true.
        // Matter.js users can do: this.matter.world.engine.timing.timeScale = EPS;
      });
      },

    isMuted() {
      return !!this.sound?.mute;
      },

    setMuted(flag) {
      if (!this.sound) return;
      this.sound.setMute(!!flag);
      // Optional: resume AudioContext on unmute (Safari/iOS friendly)
      if (!flag) this.sound.context?.resume?.();
      },

    toggleMute() {
      this.setMuted(!this.isMuted());
      },

    requestFastForward() {
        this._fastForwardRequested = true;
        this._fastForwardRequestSerial = (this._fastForwardRequestSerial || 0) + 1;
        this.setAudioInteractionMode('duckSfx');
        this.cancelSkippablePresentationWaits();
        if (this._fastForwardWaiters?.size) {
          const waiters = [...this._fastForwardWaiters];
          this._fastForwardWaiters.clear();
          waiters.forEach((finish) => finish?.(this._fastForwardRequestSerial));
        }
    
        if (this._softPaused) {
          return;
        }
    
        const BOOST_SCALE = 8;
        this.tweens.timeScale = Math.max(this.tweens.timeScale ?? ONE, BOOST_SCALE);
        this.time.timeScale = Math.max(this.time.timeScale ?? ONE, BOOST_SCALE);
        if (this.anims) {
          this.anims.globalTimeScale = Math.max(this.anims.globalTimeScale ?? ONE, BOOST_SCALE);
        }
    
        if (this._fastForwardTimer) {
          clearTimeout(this._fastForwardTimer);
        }
        this._fastForwardTimer = setTimeout(() => {
          this.clearQuickStopBoost();
        }, 220);
      },

    requestQuickStop() {
        this.requestFastForward();
      },

    clearQuickStopBoost() {
        if (this._softPaused) return;
        this.tweens.timeScale = this._baseline?.tweens ?? ONE;
        this.time.timeScale = this._baseline?.time ?? ONE;
        if (this.anims) {
          this.anims.globalTimeScale = this._baseline?.anims ?? ONE;
        }
        if (this._fastForwardTimer) {
          clearTimeout(this._fastForwardTimer);
          this._fastForwardTimer = null;
        }
      },

    clearPendingFastForward() {
        this._fastForwardRequested = false;
        this.setAudioInteractionMode('normal');
        this.cancelSkippablePresentationWaits();
        if (this._fastForwardWaiters?.size) {
          const waiters = [...this._fastForwardWaiters];
          this._fastForwardWaiters.clear();
          waiters.forEach((finish) => finish?.(null));
        }
        this.clearQuickStopBoost();
      },

    consumeQuickStop() {
        const requested = !!this._fastForwardRequested;
        this._fastForwardRequested = false;
        this.setAudioInteractionMode('normal');
        return requested;
      }
  };
}
