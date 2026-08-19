import serverConfig from "../../game-server/server_config.json" with { type: "json" };
import {
  buildForcedOutcomeOptionId,
  clearForcedOutcomeSelection,
  getForcedOutcomeSelection,
  listForcedOutcomeOptions,
  normalizeForcedOutcomeSelection,
  parseForcedOutcomeOptionId,
  setForcedOutcomeSelection
} from "../../game-server/lib/devForcedOutcomeStore.js";

const TOOL_TITLE = "Forced outcome";
const TOOL_COLLAPSED_STORAGE_KEY = "helldive.devForcedOutcome.collapsed.v1";
const DEFAULT_FORCED_OUTCOME_STRATEGIES = [
  "normal",
  "bonus",
  "trollBonus",
  "trollMain",
  "trollTease",
  "axe",
  "mysteryWild",
  "mystery",
  "necromancer2",
  "max"
];

const isToolEnabled = () => {
  try {
    return serverConfig?.devMode === true || window.location?.search?.includes("dev");
  } catch (_) {
    return serverConfig?.devMode === true;
  }
};

const getLocalStrategyNames = () => {
  const configured = Array.isArray(serverConfig?.ticketStrategies) ? serverConfig.ticketStrategies : [];
  return [...new Set([...DEFAULT_FORCED_OUTCOME_STRATEGIES, ...configured, serverConfig?.mathStyle].filter(Boolean))];
};

const resolveApiBaseUrl = () => {
  const fromEnv =
    typeof import.meta !== "undefined" && import.meta.env?.VITE_GAME_SERVER_URL
      ? String(import.meta.env.VITE_GAME_SERVER_URL)
      : "";
  const baseUrl = fromEnv.trim();
  return baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
};

const createTextNode = (tagName, text) => {
  const el = document.createElement(tagName);
  el.textContent = text;
  return el;
};

const readCollapsedPreference = () => {
  try {
    if (typeof window === "undefined" || !window.localStorage) {
      return true;
    }
    const raw = window.localStorage.getItem(TOOL_COLLAPSED_STORAGE_KEY);
    if (raw == null) return true;
    return raw !== "false";
  } catch (_) {
    return true;
  }
};

const writeCollapsedPreference = (collapsed) => {
  try {
    if (typeof window === "undefined" || !window.localStorage) {
      return;
    }
    window.localStorage.setItem(TOOL_COLLAPSED_STORAGE_KEY, collapsed ? "true" : "false");
  } catch (_) {
    // Ignore dev UI persistence issues.
  }
};

export function createGameSceneForcedOutcomeMethods() {
  return {
    async initializeForcedOutcomeTool() {
      if (!isToolEnabled() || typeof document === "undefined" || this._forcedOutcomeToolElements) {
        return;
      }

      const root = document.createElement("div");
      root.style.position = "fixed";
      root.style.bottom = "32px";
      root.style.left = "12px";
      root.style.zIndex = "9999";
      root.style.display = "flex";
      root.style.flexDirection = "column";
      root.style.gap = "4px";
      root.style.padding = "0";
      root.style.background = "transparent";
      root.style.border = "0";
      root.style.borderRadius = "0";
      root.style.color = "#f4f1d0";
      root.style.fontFamily = "Arial, sans-serif";
      root.style.fontSize = "11px";
      root.style.boxShadow = "none";
      root.style.maxWidth = "280px";

      const header = document.createElement("div");
      header.style.display = "flex";
      header.style.alignItems = "center";
      header.style.gap = "6px";

      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.style.width = "18px";
      toggle.style.height = "18px";
      toggle.style.padding = "0";
      toggle.style.border = "1px solid rgba(255, 215, 0, 0.35)";
      toggle.style.borderRadius = "999px";
      toggle.style.background = "#151521";
      toggle.style.color = "#f4f1d0";
      toggle.style.cursor = "pointer";
      toggle.style.fontSize = "11px";
      toggle.style.lineHeight = "1";
      toggle.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.28)";

      const pillStatus = createTextNode("div", "weighted");
      pillStatus.style.color = "#b8c2cc";
      pillStatus.style.whiteSpace = "nowrap";
      pillStatus.style.maxWidth = "170px";
      pillStatus.style.overflow = "hidden";
      pillStatus.style.textOverflow = "ellipsis";

      header.append(toggle, pillStatus);

      const body = document.createElement("div");
      body.style.display = "flex";
      body.style.flexDirection = "column";
      body.style.gap = "6px";
      body.style.paddingTop = "2px";

      const select = document.createElement("select");
      select.style.minWidth = "220px";
      select.style.padding = "4px 6px";
      select.style.borderRadius = "4px";
      select.style.border = "1px solid rgba(255, 215, 0, 0.35)";
      select.style.background = "#151521";
      select.style.color = "#f4f1d0";

      const status = createTextNode("div", "Loading...");
      status.style.color = "#b8c2cc";
      status.style.lineHeight = "1.35";

      const hint = createTextNode("div", "Applies to the next generated round until you turn it off.");
      hint.style.color = "#8c96a3";
      hint.style.lineHeight = "1.35";

      body.append(select, status, hint);
      root.append(header, body);
      document.body.appendChild(root);

      this._forcedOutcomeToolElements = { root, header, toggle, pillStatus, body, select, status, hint };
      this._forcedOutcomeToolChangeHandler = async (event) => {
        await this.applyForcedOutcomeToolSelection(event?.target?.value);
      };
      this._forcedOutcomeToolToggleHandler = () => {
        const nextCollapsed = !this._forcedOutcomeToolCollapsed;
        this.setForcedOutcomeToolCollapsed(nextCollapsed);
      };
      select.addEventListener("change", this._forcedOutcomeToolChangeHandler);
      toggle.addEventListener("click", this._forcedOutcomeToolToggleHandler);

      this._forcedOutcomeToolCollapsed = readCollapsedPreference();
      this.setForcedOutcomeToolCollapsed(this._forcedOutcomeToolCollapsed);

      await this.refreshForcedOutcomeTool();
    },

    async refreshForcedOutcomeTool() {
      if (!this._forcedOutcomeToolElements) {
        return;
      }

      let options = listForcedOutcomeOptions(serverConfig, getLocalStrategyNames());
      let selection = getForcedOutcomeSelection();

      try {
        const response = await fetch(`${resolveApiBaseUrl()}/api/dev/forced-ticket`, {
          method: "GET",
          headers: { Accept: "application/json" }
        });
        if (response.ok) {
          const data = await response.json();
          if (Array.isArray(data?.options) && data.options.length > 0) {
            options = data.options;
          }
          selection = normalizeForcedOutcomeSelection(data?.forcedOutcomeSelection) || selection;
          if (selection) {
            setForcedOutcomeSelection(selection);
          } else {
            clearForcedOutcomeSelection();
          }
        }
      } catch (_) {
        // Local in-process mode uses the shared browser store instead of HTTP.
      }

      this.populateForcedOutcomeToolOptions(options, selection);
    },

    populateForcedOutcomeToolOptions(options = [], selection = null) {
      if (!this._forcedOutcomeToolElements?.select) {
        return;
      }

      const { select } = this._forcedOutcomeToolElements;
      const activeId = selection ? buildForcedOutcomeOptionId(selection.strategy, selection.ticket) : "";
      select.innerHTML = "";

      const offOption = document.createElement("option");
      offOption.value = "";
      offOption.textContent = "Weighted default";
      select.appendChild(offOption);

      options.forEach((option) => {
        const optionNode = document.createElement("option");
        optionNode.value = option.id;
        optionNode.textContent = option.label;
        select.appendChild(optionNode);
      });

      select.value = activeId;
      this.updateForcedOutcomeToolStatus(selection);
    },

    updateForcedOutcomeToolStatus(selection = null) {
      if (!this._forcedOutcomeToolElements?.status) {
        return;
      }

      const compactLabel = selection
        ? `${selection.strategy} / ${selection.ticket}`
        : "weighted";
      this._forcedOutcomeToolElements.status.textContent = selection
        ? `Active: ${compactLabel}`
        : "Active: weighted bucket selection";
      this._forcedOutcomeToolElements.pillStatus.textContent = compactLabel;
      this._forcedOutcomeToolElements.root.style.borderRadius = this._forcedOutcomeToolCollapsed ? "0" : "10px";
    },

    setForcedOutcomeToolCollapsed(collapsed) {
      if (!this._forcedOutcomeToolElements) {
        return;
      }

      this._forcedOutcomeToolCollapsed = collapsed === true;
      this._forcedOutcomeToolElements.body.style.display = this._forcedOutcomeToolCollapsed ? "none" : "flex";
      this._forcedOutcomeToolElements.toggle.textContent = this._forcedOutcomeToolCollapsed ? "+" : "-";
      this._forcedOutcomeToolElements.pillStatus.style.display = this._forcedOutcomeToolCollapsed ? "none" : "block";
      this._forcedOutcomeToolElements.root.style.padding = this._forcedOutcomeToolCollapsed ? "0" : "6px 8px 8px";
      this._forcedOutcomeToolElements.root.style.background = this._forcedOutcomeToolCollapsed ? "transparent" : "rgba(10, 10, 18, 0.9)";
      this._forcedOutcomeToolElements.root.style.border = this._forcedOutcomeToolCollapsed ? "0" : "1px solid rgba(255, 215, 0, 0.35)";
      this._forcedOutcomeToolElements.root.style.boxShadow = this._forcedOutcomeToolCollapsed ? "none" : "0 8px 24px rgba(0, 0, 0, 0.28)";
      this._forcedOutcomeToolElements.root.style.borderRadius = this._forcedOutcomeToolCollapsed ? "0" : "10px";
      this._forcedOutcomeToolElements.root.style.bottom = this._forcedOutcomeToolCollapsed ? "32px" : "36px";
      writeCollapsedPreference(this._forcedOutcomeToolCollapsed);
    },

    async applyForcedOutcomeToolSelection(optionId) {
      const selection = parseForcedOutcomeOptionId(optionId);

      if (selection) {
        setForcedOutcomeSelection(selection);
      } else {
        clearForcedOutcomeSelection();
      }

      try {
        await fetch(`${resolveApiBaseUrl()}/api/dev/forced-ticket`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            forcedOutcomeSelection: selection
          })
        });
      } catch (_) {
        // Local in-process mode does not require the HTTP sync path.
      }

      this.updateForcedOutcomeToolStatus(selection);
      this.blurForcedOutcomeToolFocus();
      this.setForcedOutcomeToolCollapsed(true);
    },

    blurForcedOutcomeToolFocus() {
      const tool = this._forcedOutcomeToolElements;
      if (!tool) {
        return;
      }

      if (typeof tool.select?.blur === "function") {
        tool.select.blur();
      }
      if (typeof tool.toggle?.blur === "function") {
        tool.toggle.blur();
      }

      const activeElement = document?.activeElement;
      if (activeElement instanceof HTMLElement && tool.root?.contains(activeElement)) {
        activeElement.blur();
      }
    },

    destroyForcedOutcomeTool() {
      const tool = this._forcedOutcomeToolElements;
      if (!tool) {
        return;
      }

      if (this._forcedOutcomeToolChangeHandler) {
        tool.select?.removeEventListener("change", this._forcedOutcomeToolChangeHandler);
      }
      if (this._forcedOutcomeToolToggleHandler) {
        tool.toggle?.removeEventListener("click", this._forcedOutcomeToolToggleHandler);
      }

      tool.root?.remove();
      this._forcedOutcomeToolElements = null;
      this._forcedOutcomeToolChangeHandler = null;
      this._forcedOutcomeToolToggleHandler = null;
    }
  };
}
