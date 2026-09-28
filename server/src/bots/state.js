// In-memory registry of bot state. This is the single source of truth the
// REST API and Socket.IO layer both read from. Real bot instances (mock or
// real mineflayer) write into this via updateBot().

import { EventEmitter } from "events";

export const bus = new EventEmitter();

/** @type {Map<string, object>} */
export const bots = new Map();
export const sessionMetrics = {
  startedAt: Date.now(),
  blocksMined: 0,
  distanceWalked: 0,
  vitalsHistory: [],
};
const previousPositions = new Map();
const aiDecisionHistory = new Map();
const recentChatMessages = [];

export function createBotRecord({ id, username, host, version }) {
  const bot = {
    id,
    username,
    host,
    version,
    state: "OFFLINE", // CONNECTING | LOGGED_IN | SPAWNED | IN_LOBBY | AT_AFK | OFFLINE
    task: "idle",
    health: 20,
    maxHealth: 20,
    food: 20,
    xpLevel: 0,
    xpProgress: 0,
    position: { x: 0, y: 64, z: 0 },
    heldItem: null,
    target: null,
    inventory: emptyInventory(),
    equipment: { helmet: null, chestplate: null, leggings: null, boots: null, offhand: null },
    ai: { enabled: false, provider: "keyless", model: null, goal: "", intervalMs: 5000 },
    connectedAt: null,
    lastSeen: null,
    autoEatEnabled: true,
    autoKillEnabled: false,
  };
  bots.set(id, bot);
  return bot;
}

export function emptyInventory() {
  return {
    hotbar: Array(9).fill(null),
    main: Array(27).fill(null),
    armor: Array(4).fill(null),
    offhand: null,
  };
}

export function updateBot(id, patch) {
  const bot = bots.get(id);
  if (!bot) return null;
  if (patch.position && bot.state !== "OFFLINE") {
    const position = patch.position;
    const previous = previousPositions.get(id);
    if (previous) {
      const distance = Math.hypot(position.x - previous.x, position.y - previous.y, position.z - previous.z);
      if (Number.isFinite(distance) && distance <= 8) sessionMetrics.distanceWalked += distance;
    }
    previousPositions.set(id, { x: position.x, y: position.y, z: position.z });
  }
  Object.assign(bot, patch);
  bus.emit("bot:state", bot);
  return bot;
}

export function recordMinedBlocks(count = 1) {
  if (Number.isFinite(count) && count > 0) sessionMetrics.blocksMined += count;
}

export function recordVitalsSample() {
  const active = Array.from(bots.values()).filter((bot) => bot.state !== "OFFLINE" && bot.lastSeen != null);
  if (active.length === 0) return;
  sessionMetrics.vitalsHistory.push({
    ts: Date.now(),
    health: active.reduce((sum, bot) => sum + bot.health, 0) / active.length,
    food: active.reduce((sum, bot) => sum + bot.food, 0) / active.length,
  });
  sessionMetrics.vitalsHistory = sessionMetrics.vitalsHistory.slice(-60);
}

export function emitChat(id, message) {
  const entry = { botId: id, ...message, ts: Date.now() };
  recentChatMessages.push(entry);
  if (recentChatMessages.length > 500) recentChatMessages.shift();
  bus.emit("bot:chat", entry);
}

export function getRecentChatMessages() {
  return recentChatMessages.slice();
}

export function emitInventory(id) {
  const bot = bots.get(id);
  if (!bot) return;
  bus.emit("bot:inventory", { botId: id, inventory: bot.inventory, equipment: bot.equipment });
}

export function emitNotification(payload) {
  bus.emit("system:notification", { ...payload, ts: Date.now() });
}

export function emitAiDecision(id, decision) {
  const history = aiDecisionHistory.get(id) || [];
  history.push({ ...decision, ts: Date.now() });
  aiDecisionHistory.set(id, history.slice(-50));
  bus.emit("bot:ai-decision", { botId: id, ...decision, ts: Date.now() });
}

export function getAiDecisionHistory(id) {
  return aiDecisionHistory.get(id) || [];
}
