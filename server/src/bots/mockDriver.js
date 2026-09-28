import { updateBot, emitChat, emitInventory, emitNotification } from "./state.js";

const SAMPLE_ITEMS = [
  { name: "oak_log", displayName: "Oak Log" },
  { name: "cobblestone", displayName: "Cobblestone" },
  { name: "iron_ingot", displayName: "Iron Ingot" },
  { name: "diamond_sword", displayName: "Diamond Sword", enchanted: true },
  { name: "cooked_beef", displayName: "Cooked Beef" },
  { name: "torch", displayName: "Torch" },
];

const timers = new Map();

export function startMockBot(id) {
  updateBot(id, { state: "CONNECTING" });

  const t1 = setTimeout(() => updateBot(id, { state: "LOGGED_IN" }), 600);
  const t2 = setTimeout(() => {
    updateBot(id, {
      state: "SPAWNED",
      connectedAt: Date.now(),
      lastSeen: Date.now(),
      task: "idle",
      inventory: seedInventory(),
      position: { x: rnd(-200, 200), y: 64, z: rnd(-200, 200) },
    });
    emitInventory(id);
    emitChat(id, { type: "system", text: "Bot spawned in world." });
  }, 1400);

  // Periodic tick: position drift, health/food wobble, occasional chat.
  const tick = setInterval(() => {
    const jitter = () => (Math.random() - 0.5) * 2;
    updateBot(id, {
      lastSeen: Date.now(),
      position: {
        x: +(Math.random() * 400 - 200).toFixed(1),
        y: 64,
        z: +(Math.random() * 400 - 200).toFixed(1),
      },
      health: clamp(20 - Math.round(Math.random() * 2 * jitter()), 0, 20),
      food: clamp(20 - Math.round(Math.random() * 1.5), 0, 20),
    });
    if (Math.random() < 0.08) {
      emitChat(id, { type: "chat", text: sampleChatLine(), from: "PGNR" });
    }
  }, 4000);

  timers.set(id, [t1, t2, tick]);
}

export function stopMockBot(id) {
  (timers.get(id) || []).forEach((h) => clearTimeout(h) || clearInterval(h));
  timers.delete(id);
  updateBot(id, { state: "OFFLINE", task: "idle" });
  emitChat(id, { type: "system", text: "Bot disconnected." });
}

export function runMockAction(id, action, params = {}) {
  const bot = updateBot(id, {}); // no-op fetch pattern kept consistent with real driver
  switch (action) {
    case "chat":
      emitChat(id, { type: "chat", text: params.message, from: "bot" });
      return { ok: true };
    case "chop_wood":
      updateBot(id, { task: "chopping" });
      setTimeout(() => {
        updateBot(id, { task: "idle" });
        emitNotification({ botId: id, level: "info", text: `Finished chopping ${params.count || 16} logs.` });
      }, 2000);
      return { ok: true };
    case "goto":
      updateBot(id, { task: "walking", position: { x: params.x ?? 0, y: params.y ?? 64, z: params.z ?? 0 } });
      setTimeout(() => updateBot(id, { task: "idle" }), 1500);
      return { ok: true };
    case "attack_nearest":
      updateBot(id, { task: "attacking", target: "Zombie" });
      setTimeout(() => updateBot(id, { task: "idle", target: null }), 1800);
      return { ok: true };
    default:
      updateBot(id, { task: action });
      setTimeout(() => updateBot(id, { task: "idle" }), 1200);
      return { ok: true };
  }
}

function seedInventory() {
  const hotbar = Array(9).fill(null);
  const main = Array(27).fill(null);
  SAMPLE_ITEMS.forEach((item, i) => {
    hotbar[i] = { ...item, count: rnd(1, 64), slot: i };
  });
  main[0] = { name: "oak_planks", displayName: "Oak Planks", count: 32, slot: 9 };
  return { hotbar, main, armor: Array(4).fill(null), offhand: null };
}

function sampleChatLine() {
  const lines = [
    "<Steve> anyone need wood?",
    "[Server] PGNR joined the game",
    "<Alex> heading to spawn",
  ];
  return lines[rnd(0, lines.length - 1)];
}

function rnd(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}
