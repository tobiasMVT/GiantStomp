const cloneValue = (value) => {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
};

const DEFAULT_UI_STATE = {
  balance: 0,
  gamerounds: 0,
  spinState: true,
  betSwap: true,
  betSize: 1,
  autoplay: "off",
  stop: "off",
  pause: "off",
  sound: "on",
  music: "on"
};

const createInitialUiState = (overrides = {}) => {
  return { ...cloneValue(DEFAULT_UI_STATE), ...cloneValue(overrides) };
};

export { DEFAULT_UI_STATE, createInitialUiState };

