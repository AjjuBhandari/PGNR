import { bots, createBotRecord } from "./state.js";
import * as mock from "./mockDriver.js";
import * as real from "./mineflayerDriver.js";

const MOCK = (process.env.MOCK_MODE || "true") === "true";

export function listBots() {
  return Array.from(bots.values());
}

export function addBot({ id, username, password, host, version }) {
  createBotRecord({ id, username, host, version });
  return start(id, { username, password, host, version });
}

export function start(id, { username, password, host, version }) {
  if (MOCK) return mock.startMockBot(id);
  return real.startRealBot(id, { username, password, host, version });
}

export function stop(id) {
  stopAi(id);
  if (MOCK) return mock.stopMockBot(id);
  return real.stopRealBot(id);
}

export function restart(id, opts) {
  stop(id);
  setTimeout(() => start(id, opts), 500);
}

export function runAction(id, action, params) {
  if (MOCK) return mock.runMockAction(id, action, params);
  return real.runRealAction(id, action, params);
}

// AI loop only runs against the real mineflayer driver — mock bots just
// flip the `ai.enabled` flag in state for the UI to reflect.
export function startAi(id) {
  if (!MOCK) real.startAiLoop(id);
}

export function stopAi(id) {
  if (!MOCK) real.stopAiLoop(id);
}

export function getAiConfig() {
  return MOCK ? { provider: "mock", model: null, configured: false } : real.getAiConfig();
}

export function isMock() {
  return MOCK;
}
