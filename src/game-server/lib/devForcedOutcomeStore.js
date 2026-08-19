const DEV_FORCED_OUTCOME_GLOBAL_KEY = "__HELLDIVE_DEV_FORCED_OUTCOME__";
const DEV_FORCED_OUTCOME_STORAGE_KEY = "helldive.devForcedOutcome.v1";
const FORCED_OUTCOME_OPTION_PREFIX = "forceTicket";

const isPlainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

const getGlobalScope = () => {
  if (typeof globalThis === "object" && globalThis) {
    return globalThis;
  }
  return null;
};

const toStoredSelection = (value) => {
  if (!isPlainObject(value)) return null;
  const strategy = typeof value.strategy === "string" ? value.strategy.trim() : "";
  const ticket = typeof value.ticket === "string" ? value.ticket.trim() : "";
  if (!strategy || !ticket) return null;
  return { strategy, ticket };
};

const readStoredSelection = () => {
  try {
    if (typeof window === "undefined" || !window.localStorage) {
      return null;
    }
    const raw = window.localStorage.getItem(DEV_FORCED_OUTCOME_STORAGE_KEY);
    if (!raw) return null;
    return toStoredSelection(JSON.parse(raw));
  } catch (_) {
    return null;
  }
};

const writeStoredSelection = (selection) => {
  try {
    if (typeof window === "undefined" || !window.localStorage) {
      return;
    }
    if (selection) {
      window.localStorage.setItem(DEV_FORCED_OUTCOME_STORAGE_KEY, JSON.stringify(selection));
    } else {
      window.localStorage.removeItem(DEV_FORCED_OUTCOME_STORAGE_KEY);
    }
  } catch (_) {
    // Ignore storage failures in dev tooling.
  }
};

export const buildForcedOutcomeOptionId = (strategy, ticket) =>
  `${FORCED_OUTCOME_OPTION_PREFIX}::${String(strategy || "").trim()}::${String(ticket || "").trim()}`;

export const parseForcedOutcomeOptionId = (value) => {
  if (typeof value !== "string" || !value.startsWith(`${FORCED_OUTCOME_OPTION_PREFIX}::`)) {
    return null;
  }
  const [, strategy = "", ticket = ""] = value.split("::");
  return toStoredSelection({ strategy, ticket });
};

export const normalizeForcedOutcomeSelection = (value) => toStoredSelection(value);

export const getForcedOutcomeSelection = () => {
  const scope = getGlobalScope();
  const globalValue = toStoredSelection(scope?.[DEV_FORCED_OUTCOME_GLOBAL_KEY]);
  if (globalValue) {
    return globalValue;
  }
  const storedValue = readStoredSelection();
  if (storedValue && scope) {
    scope[DEV_FORCED_OUTCOME_GLOBAL_KEY] = storedValue;
  }
  return storedValue;
};

export const setForcedOutcomeSelection = (value) => {
  const selection = toStoredSelection(value);
  const scope = getGlobalScope();
  if (scope) {
    if (selection) {
      scope[DEV_FORCED_OUTCOME_GLOBAL_KEY] = selection;
    } else {
      delete scope[DEV_FORCED_OUTCOME_GLOBAL_KEY];
    }
  }
  writeStoredSelection(selection);
  return selection;
};

export const clearForcedOutcomeSelection = () => {
  const scope = getGlobalScope();
  if (scope) {
    delete scope[DEV_FORCED_OUTCOME_GLOBAL_KEY];
  }
  writeStoredSelection(null);
};

export const listForcedOutcomeOptions = (config = {}, strategyNames = []) => {
  const filteredStrategyNames = Array.isArray(strategyNames)
    ? strategyNames.filter((value) => typeof value === "string" && value.trim())
    : [];
  const entries =
    filteredStrategyNames.length > 0
      ? filteredStrategyNames.map((strategy) => [strategy, config?.[strategy]])
      : Object.entries(config || {});
  const options = [];

  entries.forEach(([strategy, bucket]) => {
    if (!isPlainObject(bucket)) return;

    Object.entries(bucket).forEach(([ticket, weight]) => {
      const numericWeight = Number(weight);
      if (!Number.isFinite(numericWeight) || numericWeight <= 0) {
        return;
      }

      options.push({
        id: buildForcedOutcomeOptionId(strategy, ticket),
        strategy,
        ticket,
        weight: numericWeight,
        label: `${strategy} / ${ticket}`
      });
    });
  });

  return options;
};
