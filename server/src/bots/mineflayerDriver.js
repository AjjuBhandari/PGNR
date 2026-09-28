// Real mineflayer driver — connects to an actual Minecraft server.
//
// Ported from a working single-file multi-bot CLI manager into the
// dashboard's event-driven shape. Keeps the parts that mattered:
//   - waitForGround() + fast Movements (sprint/parkour) so pathfinder
//     doesn't crawl or fail right after a teleport/respawn
//   - a chat-driven auth flow that answers /register and /login prompts
//     and optionally hops to a target sub-server (e.g. via "/server X")
//   - an AI decision loop (OpenAI-compatible client — openai, deepseek,
//     or a keyless proxy) that reads bot state and picks one action
//   - the action set from the CLI: chop wood, mine, follow/come/goto,
//     walk-with-duration, attack, eat, drop all, explore
//
// Credentials are never hardcoded here — they come from the bot record
// created via the "Add Bot" API / DB, same as the rest of this app.

import mineflayer from "mineflayer";
import pkgPathfinder from "mineflayer-pathfinder";
import collectBlockPkg from "mineflayer-collectblock";
import toolPkg from "mineflayer-tool";
import pvpPkg from "mineflayer-pvp";
import armorManagerPkg from "mineflayer-armor-manager";
import autoEatPkg from "mineflayer-auto-eat";
import { updateBot, emitChat, emitInventory, emitNotification, emitAiDecision, recordMinedBlocks, bots as botStore } from "./state.js";

const collectBlockPlugin = collectBlockPkg?.plugin ?? collectBlockPkg;
const toolPlugin = toolPkg?.plugin ?? toolPkg?.default ?? toolPkg;
const pvpPlugin = pvpPkg?.plugin ?? pvpPkg;
const armorManagerPlugin = armorManagerPkg?.plugin ?? armorManagerPkg;
const autoEatPlugin = autoEatPkg?.plugin ?? autoEatPkg;

let OpenAI = null;
try {
  ({ OpenAI } = await import("openai"));
} catch {
  console.warn("[AI] openai package not installed — AI Control tab will stay disabled");
}

const { Movements, goals } = pkgPathfinder;

const SETTINGS = {
  targetServer: process.env.MC_TARGET_SERVER || "",
  afkWarp: process.env.MC_AFK_WARP?.trim() || "",
  targetServerRetryMs: Number(process.env.MC_TARGET_SERVER_RETRY_MS || 8000),
  targetServerMaxRetries: Number(process.env.MC_TARGET_SERVER_MAX_RETRIES || 5),
  reconnectBaseMs: Number(process.env.MC_RECONNECT_BASE_MS || 10000),
  reconnectMaxMs: Number(process.env.MC_RECONNECT_MAX_MS || 120000),
  aiDecisionIntervalMs: Number(process.env.AI_DECISION_INTERVAL_MS || 3000),
  groundWaitTimeoutMs: Number(process.env.MC_GROUND_WAIT_TIMEOUT_MS || 5000),
};

const instances = new Map(); // id -> { bot, timers, flags, aiRunning }
const reconnectAttempts = new Map();
const HOSTILE_MOBS = new Set([
  "blaze", "bogged", "breeze", "cave_spider", "creeper", "drowned", "elder_guardian", "ender_dragon",
  "enderman", "endermite", "evoker", "ghast", "guardian", "hoglin", "husk", "magma_cube", "phantom",
  "piglin_brute", "pillager", "ravager", "shulker", "silverfish", "skeleton", "slime", "spider",
  "stray", "vex", "vindicator", "warden", "witch", "wither", "wither_skeleton", "zoglin", "zombie",
  "zombie_villager",
]);

function normalizeMinecraftHost(hostValue) {
  const raw = String(hostValue ?? "").trim();
  if (!raw) return "localhost";
  if (/^\[[^\]]+\]:\d{1,5}$/.test(raw) || /^.+:\d{1,5}$/.test(raw)) return raw;
  if (/\.aternos\.me$/i.test(raw)) return `${raw}:58405`;
  return `${raw}:25565`;
}

function targetServerForHost(host) {
  return /\.aternos\.me(?::\d+)?$/i.test(String(host || "")) ? SETTINGS.targetServer : "";
}

// ---------------- AI client (shared across all bots) ----------------
let aiClient = null;
let aiModel = null;
let aiProviderName = "none";

function initAiClient() {
  if (aiClient || !OpenAI) return;
  const provider = (process.env.AI_PROVIDER || "openai").toLowerCase();
  if (provider === "deepseek" && process.env.DEEPSEEK_API_KEY) {
    aiClient = new OpenAI({ apiKey: process.env.DEEPSEEK_API_KEY, baseURL: "https://api.deepseek.com/v1" });
    aiModel = "deepseek-chat";
    aiProviderName = "deepseek";
  } else if (provider === "keyless" && process.env.KEYLESS_AI_BASE_URL) {
    aiClient = new OpenAI({ apiKey: "not-needed", baseURL: process.env.KEYLESS_AI_BASE_URL });
    aiModel = "gpt-4o-mini";
    aiProviderName = "keyless";
  } else if (process.env.OPENAI_API_KEY) {
    aiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    aiModel = "gpt-4o-mini";
    aiProviderName = "openai";
  }
  console.log(`[AI] provider=${aiProviderName} model=${aiModel || "none"}`);
}

function log(username, msg) {
  console.log(`[${new Date().toLocaleTimeString()}] [${username}] ${msg}`);
}

function componentText(component) {
  if (component == null) return "";
  if (typeof component === "string" || typeof component === "number") return String(component);
  if (Array.isArray(component)) return component.map(componentText).join("");
  if (typeof component !== "object") return "";
  if (component.type && Object.prototype.hasOwnProperty.call(component, "value")) return componentText(component.value);
  if (Object.prototype.hasOwnProperty.call(component, "text") || Object.prototype.hasOwnProperty.call(component, "extra")) {
    return `${componentText(component.text)}${componentText(component.extra)}`;
  }
  if (Object.prototype.hasOwnProperty.call(component, "translate")) {
    return `${componentText(component.translate)}${componentText(component.with)}`;
  }
  if (Object.prototype.hasOwnProperty.call(component, "value")) return componentText(component.value);
  return Object.values(component).map(componentText).join("");
}

function kickReasonText(reason) {
  const text = componentText(reason).replace(/\s+/g, " ").trim();
  if (text) return text.slice(0, 1000);
  try { return JSON.stringify(reason).slice(0, 1000); } catch { return String(reason).slice(0, 1000); }
}

function isOnline(inst) {
  return !!(inst && inst.bot && inst.bot.entity);
}

function nearestHostileMob(bot, maxDistance = 16) {
  return bot.nearestEntity((entity) =>
    entity.type === "mob" && HOSTILE_MOBS.has(entity.name) && entity.position.distanceTo(bot.entity.position) <= maxDistance
  );
}

function scheduleAutoKill(id, inst) {
  if (!inst.autoKillEnabled || !isOnline(inst)) return;
  inst.timers.autoKill = setTimeout(() => {
    if (!inst.autoKillEnabled || !isOnline(inst)) return;
    const target = nearestHostileMob(inst.bot);
    if (target && !inst.actionRunning) {
      try {
        if (inst.autoKillTarget !== target.id) inst.bot.pvp.attack(target);
        inst.autoKillTarget = target.id;
        updateBot(id, { task: "auto-kill", target: target.name });
      } catch (error) {
        emitNotification({ botId: id, level: "warning", text: `${inst.bot.username} auto-kill failed: ${error.message}` });
      }
    } else if (!target && inst.autoKillTarget) {
      inst.bot.pvp.stop();
      inst.autoKillTarget = null;
      updateBot(id, { task: "idle", target: null });
    }
    scheduleAutoKill(id, inst);
  }, 1000);
}

function clearInstanceTimers(inst) {
  for (const key of Object.keys(inst.timers || {})) {
    try { clearTimeout(inst.timers[key]); } catch {}
    try { clearInterval(inst.timers[key]); } catch {}
  }
  inst.timers = {};
}

// ---------------- movement helpers (the "fast walk" fix) ----------------
async function waitForGround(bot, timeoutMs = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (bot.entity && bot.entity.onGround) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
}

function setupMovements(bot) {
  try {
    const m = new Movements(bot);
    m.allowSprinting = true;
    m.allowParkour = true;
    m.canDig = false;
    m.canOpenDoors = true;
    m.maxDropDown = 4;
    m.dontCreateFlow = true;
    m.scafoldingBlocks = [];
    try {
      m.blocksToAvoid.add(bot.registry.blocksByName.water.id);
      m.blocksToAvoid.add(bot.registry.blocksByName.lava.id);
    } catch {}
    bot.pathfinder.setMovements(m);
    bot.pathfinder.thinkTimeout = 20000;
    bot.pathfinder.tickTimeout = 20;
    bot.pathfinder.searchRadius = 128;
  } catch (e) {
    log(bot.username, `movements setup failed: ${e.message}`);
  }
}

async function smartWalk(bot, x, y, z) {
  if (!bot.pathfinder) return { ok: false, reason: "no pathfinder" };
  if (![x, y, z].every(Number.isFinite)) return { ok: false, reason: "coordinates must be finite numbers" };
  const grounded = await waitForGround(bot, SETTINGS.groundWaitTimeoutMs);
  if (!grounded) return { ok: false, reason: "Bot is still airborne; wait for it to land before walking" };
  try {
    const start = bot.entity.position.clone();
    await bot.pathfinder.goto(new goals.GoalNear(x, y, z, 1));
    return { ok: true, movedBlocks: start.distanceTo(bot.entity.position) };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

async function smartGoToPlayer(bot, username) {
  const p = bot.players[username] || Object.values(bot.players).find((player) => player.username.toLowerCase() === String(username).toLowerCase());
  if (!p || !p.entity) return { ok: false, reason: "player not visible" };
  const { x, y, z } = p.entity.position;
  return smartWalk(bot, Math.floor(x), Math.floor(y), Math.floor(z));
}

// ---------------- AI decision loop ----------------
function getLocalAIAction(id, bot) {
  const goal = (botStore.get(id)?.ai?.goal || "").toLowerCase();
  const position = bot.entity.position;
  const nearbyHostile = bot.nearestEntity((entity) => entity.type === "mob" && entity.position.distanceTo(position) < 8);
  if (bot.health <= 8 || bot.food <= 8) return { action: "eat", reason: `survival priority: health ${bot.health}, food ${bot.food}` };
  if (nearbyHostile && bot.health > 12) return { action: "attack_nearest", reason: `nearby threat: ${nearbyHostile.name}` };

  if (/wood|tree|log|chop|lumber/.test(goal)) {
    const logIds = new Set(["oak_log", "birch_log", "spruce_log", "jungle_log", "acacia_log", "dark_oak_log", "mangrove_log", "cherry_log"]);
    const tree = bot.findBlock({ matching: (block) => logIds.has(block.name), maxDistance: 32 });
    return tree
      ? { action: "chop_wood", target: tree.name, reason: "goal requires wood; tree found nearby" }
      : { action: "explore", reason: "goal requires wood; searching for a tree" };
  }

  if (/mine|stone|ore|cobble/.test(goal)) {
    const stone = bot.findBlock({ matching: (block) => block.name === "stone" || block.name === "cobblestone", maxDistance: 24 });
    return stone
      ? { action: "mine", target: "stone", reason: "goal requires mining; stone found nearby" }
      : { action: "explore", reason: "goal requires mining; searching for stone" };
  }

  if (/collect|pickup|item/.test(goal)) return { action: "collect_nearby", reason: "goal requires collecting nearby drops" };

  const visiblePlayers = Object.values(bot.players).filter((player) => player.entity && player.username !== bot.username);
  const playerGoal = goal.match(/(?:follow|come|meet)\s+([a-z0-9_]{1,16})/i)?.[1];
  if (playerGoal) {
    const player = visiblePlayers.find((entry) => entry.username.toLowerCase() === playerGoal.toLowerCase());
    return player
      ? { action: "come", target: player.username, reason: "following the named player in the goal" }
      : { action: "idle", reason: `${playerGoal} is not visible; move closer or choose another goal` };
  }

  if (/explore|survive|learn/.test(goal)) return { action: "explore", reason: "working toward the exploration goal" };
  return { action: "idle", reason: "Set a goal such as chop wood, mine stone, collect items, explore, or follow a player" };
}

async function getAIAction(id, inst) {
  if (!isOnline(inst)) return null;
  const bot = inst.bot;

  if (!aiClient) {
    const decision = getLocalAIAction(id, bot);
    emitAiDecision(id, { action: decision.action, reason: decision.reason });
    return decision;
  }

  const nearbyLogs = bot.findBlocks({ matching: (b) => b.name.includes("_log"), maxDistance: 32, count: 1 });
  const nearbyStone = bot.findBlocks({ matching: (b) => b.name === "stone" || b.name === "cobblestone", maxDistance: 16, count: 1 });
  const visiblePlayers = Object.values(bot.players).filter((p) => p.entity && p.username !== bot.username).map((p) => p.username);
  const hostileMobs = Object.values(bot.entities).filter((e) => e.type === "mob" && e.position.distanceTo(bot.entity.position) < 10).map((e) => e.name);

  const state = {
    health: bot.health,
    food: bot.food,
    pos: { x: Math.round(bot.entity.position.x), y: Math.round(bot.entity.position.y), z: Math.round(bot.entity.position.z) },
    onGround: bot.entity.onGround,
    hasTreeNearby: nearbyLogs.length > 0,
    hasStoneNearby: nearbyStone.length > 0,
    visiblePlayers,
    hostileMobsNearby: hostileMobs,
    inventory: bot.inventory.items().map((i) => `${i.name}x${i.count}`).slice(0, 15),
    goal: botStore.get(id)?.ai?.goal || "",
  };

  const sys = `You are a Minecraft survival bot. Reply with ONE JSON only.
{ "action": "<name>", "target": <optional> }

ACTIONS:
- "chop_wood"      (no target) — use if hasTreeNearby
- "mine_stone"     (no target) — use if hasStoneNearby
- "walk_to_player" (target=name) — use if visiblePlayers has someone
- "explore"        (no target) — walk to find new stuff
- "attack_mob"     (no target) — if hostile mobs nearby
- "eat"            (no target) — if hungry or hurt
- "say"            (target=text)
- "idle"           (no target)

PRIORITY:
1. health<8 OR food<8 -> "eat"
2. hostileMobsNearby AND health>14 -> "attack_mob"
3. hasTreeNearby -> "chop_wood"
4. hasStoneNearby -> "mine_stone"
5. visiblePlayers -> "walk_to_player" with closest name
6. If a "goal" is given, work toward it
7. Otherwise -> "explore" (avoid idle)

Be decisive. Reply with one action.`;

  try {
    const res = await aiClient.chat.completions.create({
      model: aiModel,
      messages: [{ role: "system", content: sys }, { role: "user", content: JSON.stringify(state) }],
      response_format: { type: "json_object" },
      max_tokens: 60,
    });
    const text = res.choices?.[0]?.message?.content;
    if (!text) return null;
    const decision = JSON.parse(text);
    emitAiDecision(id, { action: decision.action, reason: decision.target ? `target=${decision.target}` : "" });
    return decision;
  } catch (e) {
    log(bot.username, `AI ERROR: ${e.message}`);
    return null;
  }
}

async function aiLoop(id, inst) {
  log(inst.bot.username, "AI loop started");
  while (isOnline(inst) && botStore.get(id)?.ai?.enabled) {
    if (!inst.actionRunning) {
      const d = await getAIAction(id, inst);
      if (d && botStore.get(id)?.ai?.enabled) await runRealAction(id, mapAiActionToDriverAction(d.action), { target: d.target, message: d.target });
    }
    const interval = botStore.get(id)?.ai?.intervalMs || SETTINGS.aiDecisionIntervalMs;
    await new Promise((r) => setTimeout(r, interval));
  }
  inst.aiRunning = false;
  log(inst.bot.username, "AI loop stopped");
}

function mapAiActionToDriverAction(action) {
  switch (action) {
    case "chop_wood": return "chop_wood";
    case "mine_stone": return "mine";
    case "walk_to_player": return "come";
    case "explore": return "explore";
    case "attack_mob": return "attack_nearest";
    case "eat": return "eat";
    case "say": return "chat";
    default: return "idle";
  }
}

export function startAiLoop(id) {
  initAiClient();
  const inst = instances.get(id);
  if (!inst || inst.aiRunning) return;
  inst.aiRunning = true;
  aiLoop(id, inst);
}

export function getAiConfig() {
  initAiClient();
  return aiClient
    ? { provider: aiProviderName, model: aiModel, configured: true }
    : { provider: "built-in", model: "local survival rules", configured: true };
}

export function stopAiLoop(id) {
  // aiLoop's own while-condition checks bots.get(id).ai.enabled each tick,
  // so flipping that (done by the caller before this) is what actually
  // stops it; this just clears the local flag for isRunning checks.
  const inst = instances.get(id);
  if (inst) inst.aiRunning = false;
}

// ---------------- connect / lifecycle ----------------
export function startRealBot(id, { username, password, host, version }) {
  const existing = instances.get(id);
  if (existing && !existing.ended) {
    log(username, "bot is already connecting or online; reusing existing connection");
    return existing.bot;
  }
  if (existing) clearInstanceTimers(existing);

  const normalizedHost = normalizeMinecraftHost(host);
  updateBot(id, { state: "CONNECTING", task: `Connecting to ${normalizedHost}` });

  const [ip, portStr] = normalizedHost.split(":");
  const bot = mineflayer.createBot({
    host: ip,
    ...(portStr ? { port: Number(portStr) } : {}),
    username,
    password: password || undefined,
    version: version || false,
    auth: process.env.MC_AUTH_MODE || "offline",
    keepAlive: true,
    hideErrors: true,
    logErrors: false,
  });
  bot.username = username;
  bot.on("error", (err) => {
    const message = err.message || err.code || String(err);
    log(username, `connection error: ${message}`);
    emitNotification({ botId: id, level: "danger", text: `${username} connection error: ${message}` });
  });

  const inst = { bot, timers: {}, aiRunning: false, autoKillEnabled: false, autoKillTarget: null, ended: false, manualStop: false, options: { username, password, host, version } };
  instances.set(id, inst);

  const flags = {
    sentRegister: false,
    sentLogin: false,
    loginSucceeded: false,
    spawned: false,
    inTarget: false,
    targetServer: targetServerForHost(normalizedHost),
  };

  bot.loadPlugin(pkgPathfinder.pathfinder);
  bot.loadPlugin(collectBlockPlugin);
  if (typeof toolPlugin === "function") bot.loadPlugin(toolPlugin);
  bot.loadPlugin(pvpPlugin);
  bot.loadPlugin(armorManagerPlugin);
  bot.loadPlugin(autoEatPlugin);

  bot.once("login", () => updateBot(id, { state: "LOGGED_IN" }));
  bot.on("path_update", (result) => {
    if (Array.isArray(result?.path)) {
      inst.lastPath = result.path.map(({ x, y, z }) => ({ x, y, z }));
    }
  });

  bot.on("message", (jsonMsg) => {
    const msg = jsonMsg.toString();
    const normalizedMsg = msg.replace(/§[0-9a-fk-or]/gi, "").toLowerCase();
    emitChat(id, { type: "system", text: msg });

    if (/being verified|please do not move/i.test(msg)) return;
    if (/failed the bot|verification failed|logging in too fast/i.test(msg)) {
      try { bot.quit(); } catch {}
      return;
    }

    const targetName = flags.targetServer.toLowerCase();
    const targetBanner = normalizedMsg.includes(`${targetName}!`);
    const targetTransfer = targetName && normalizedMsg.includes(targetName) && /welcome\s+to|\bto\s+(?:server\s+)?|\b(?:connected|transferred|switched|sent)\s+(?:you\s+)?to/.test(normalizedMsg);
    if (targetName && (targetBanner || targetTransfer) && !flags.inTarget) {
      flags.inTarget = true;
      updateBot(id, { state: "IN_LOBBY", task: `Connected to ${flags.targetServer}` });
      if (inst.timers.targetRetry) clearInterval(inst.timers.targetRetry);
      setTimeout(() => setupMovements(bot), 2000);
      inst.timers.afkWarp = setTimeout(() => {
        if (!isOnline(inst) || !SETTINGS.afkWarp) return;
        updateBot(id, { task: `Warping to ${SETTINGS.afkWarp}` });
        try { bot.chat(`/warp ${SETTINGS.afkWarp}`); } catch {}
        inst.timers.afkConfirmation = setTimeout(() => {
          if (botStore.get(id)?.state === "IN_LOBBY") {
            updateBot(id, { task: `Waiting for /warp ${SETTINGS.afkWarp} confirmation` });
            emitNotification({ botId: id, level: "warning", text: `${username} reached ${SETTINGS.targetServer}, but the server has not confirmed the AFK warp.` });
          }
        }, 10000);
      }, 3000);
      return;
    }

    if (/teleport(?:ed)? .*\bafk\b|warp(?:ed|ing)? .*\bafk\b|you are now.*\bafk\b|welcome to.*afk zone/i.test(normalizedMsg)) {
      updateBot(id, { state: "AT_AFK", task: "idle" });
      return;
    }
    if (SETTINGS.afkWarp && /can't use|no permission|doesn't exist|unknown|invalid|not found/i.test(normalizedMsg) && /warp|afk/i.test(normalizedMsg)) {
      updateBot(id, { state: "IN_LOBBY", task: "AFK warp failed" });
      emitNotification({ botId: id, level: "warning", text: `${username} could not use /warp ${SETTINGS.afkWarp}: ${msg.slice(0, 160)}` });
      return;
    }

    if (!flags.sentRegister && /\/register|please register|register a password/i.test(msg) && password) {
      flags.sentRegister = true;
      setTimeout(() => { try { bot.chat(`/register ${password} ${password}`); } catch {} }, 1500);
      return;
    }
    if (!flags.sentLogin && /\/login|please login|please log in|already registered|you have \d+ attempts/i.test(msg) && password) {
      flags.sentLogin = true;
      setTimeout(() => { try { bot.chat(`/login ${password}`); } catch {} }, 1500);
      return;
    }
    if (/successfully registered|registration successful|account created/i.test(msg)) {
      flags.loginSucceeded = true;
      updateBot(id, { state: "LOGGED_IN" });
      return;
    }
    if (/successfully logged in|you are now logged|login successful|logged in successfully|already logged in/i.test(msg)) {
      flags.loginSucceeded = true;
      updateBot(id, { state: "LOGGED_IN" });
    }
  });

  bot.once("spawn", () => {
    flags.spawned = true;
    updateBot(id, { state: "SPAWNED", connectedAt: Date.now(), lastSeen: Date.now() });
    inst.timers.stableConnection = setTimeout(() => {
      if (isOnline(inst)) reconnectAttempts.set(id, 0);
    }, 300000);
    setupMovements(bot);
    if (bot.autoEat) try {
      bot.autoEat.options = { priority: "foodPoints", startAt: 14 };
      bot.autoEat.enable();
      updateBot(id, { autoEatEnabled: true });
    } catch (error) {
      emitNotification({ botId: id, level: "warning", text: `${username} auto-eat setup failed: ${error.message}` });
    }
    if (bot.armorManager) try { bot.armorManager.equipAll(); } catch {}
    syncInventory(id, bot);

    if (flags.targetServer) {
      setTimeout(() => {
        if (!isOnline(inst) || flags.inTarget) return;
        let tries = 0;
        const requestTarget = () => {
          if (flags.inTarget || !isOnline(inst)) {
            clearInterval(inst.timers.targetRetry);
            return;
          }
          if (tries >= SETTINGS.targetServerMaxRetries) {
            clearInterval(inst.timers.targetRetry);
            emitNotification({ botId: id, level: "warning", text: `${username} did not reach ${flags.targetServer} after ${tries} attempts.` });
            return;
          }
          tries++;
          updateBot(id, { task: `Requesting ${flags.targetServer} (attempt ${tries})` });
          try { bot.chat(`/server ${flags.targetServer}`); } catch {}
        };
        requestTarget();
        inst.timers.targetRetry = setInterval(requestTarget, SETTINGS.targetServerRetryMs);
      }, 3000);
    }

    setTimeout(() => setupMovements(bot), 15000);

    if (botStore.get(id)?.ai?.enabled) startAiLoop(id);
  });

  bot.on("health", () => updateBot(id, { health: bot.health, food: bot.food, lastSeen: Date.now() }));
  bot.on("move", () => updateBot(id, { position: bot.entity?.position || { x: 0, y: 0, z: 0 }, lastSeen: Date.now() }));
  bot.on("chat", (username, message) => emitChat(id, { type: "chat", from: username, text: message }));
  bot.on("playerCollect", () => syncInventory(id, bot));
  bot.inventory?.on?.("updateSlot", () => syncInventory(id, bot));

  bot.on("death", () => emitNotification({ botId: id, level: "danger", text: `${username} died.` }));
  bot.on("kicked", (reason) => {
    const text = kickReasonText(reason);
    emitNotification({ botId: id, level: "danger", text: `${username} was kicked: ${text}` });
    updateBot(id, { state: "OFFLINE" });
  });
  bot.on("end", () => {
    inst.ended = true;
    clearInstanceTimers(inst);
    updateBot(id, { state: "OFFLINE", task: "idle" });
    if (inst.manualStop || instances.get(id) !== inst) return;
    const attempts = (reconnectAttempts.get(id) || 0) + 1;
    reconnectAttempts.set(id, attempts);
    const delay = Math.min(SETTINGS.reconnectMaxMs, SETTINGS.reconnectBaseMs * (2 ** Math.min(attempts - 1, 8)));
    updateBot(id, { task: `Retry ${attempts} in ${Math.round(delay / 1000)}s` });
    emitNotification({ botId: id, level: "warning", text: `${username} disconnected; retry ${attempts} in ${Math.round(delay / 1000)} seconds.` });
    inst.timers.reconnect = setTimeout(() => {
      if (!inst.manualStop && instances.get(id) === inst) startRealBot(id, inst.options);
    }, delay);
  });
  return bot;
}

export function stopRealBot(id) {
  const inst = instances.get(id);
  if (inst) {
    inst.manualStop = true;
    clearInstanceTimers(inst);
    try { inst.bot.quit(); } catch {}
  }
  instances.delete(id);
  updateBot(id, { state: "OFFLINE" });
}

// ---------------- actions (ported from the CLI's per-bot commands) ----------------
export async function runRealAction(id, action, params = {}) {
  const inst = instances.get(id);
  if (!inst || !isOnline(inst)) return { ok: false, error: "Bot not connected" };
  const bot = inst.bot;
  if (inst.actionRunning && action !== "stop" && action !== "stop_move") {
    return { ok: false, error: `Bot is already ${inst.actionRunning}; stop it before starting another action` };
  }

  try {
    switch (action) {
      case "chat":
        bot.chat(String(params.message ?? ""));
        return { ok: true };

      case "sync_inventory":
        syncInventory(id, bot);
        return { ok: true };

      case "players": {
        const players = Object.values(bot.players).map((player) => player.username);
        emitChat(id, { type: "system", text: `Players: ${players.join(", ") || "none visible"}` });
        return { ok: true, players };
      }

      case "pos":
      case "position": {
        const position = {
          x: Math.round(bot.entity.position.x),
          y: Math.round(bot.entity.position.y),
          z: Math.round(bot.entity.position.z),
        };
        emitChat(id, { type: "system", text: `Position: ${position.x}, ${position.y}, ${position.z}` });
        return { ok: true, position };
      }

      case "look": {
        const player = params.target && bot.players[params.target];
        const entity = player?.entity || Object.values(bot.entities).find((candidate) => candidate.type === "player" && candidate !== bot.entity);
        if (!entity) return { ok: false, error: "No visible player to look at" };
        await bot.lookAt(entity.position.offset(0, 1.6, 0));
        return { ok: true, target: entity.username || params.target || "nearest player" };
      }

      case "show_path": {
        const path = (inst.lastPath || []).slice(0, 40);
        emitChat(id, { type: "system", text: path.length ? `Current path (${path.length} nodes): ${path.map((p) => `${p.x},${p.y},${p.z}`).join(" -> ")}` : "No active path is available." });
        return { ok: true, path };
      }

      case "reply":
        bot.chat("ok");
        return { ok: true };

      case "wave":
        for (let i = 0; i < 2; i++) {
          setTimeout(() => {
            if (!isOnline(inst)) return;
            bot.setControlState("jump", true);
            setTimeout(() => { if (isOnline(inst)) bot.setControlState("jump", false); }, 200);
          }, i * 400);
        }
        return { ok: true };

      case "equip": {
        const item = bot.inventory.items().find((entry) => entry.name.includes(String(params.item || "")));
        if (!item) return { ok: false, error: `Item not found: ${params.item || ""}` };
        await bot.equip(item, params.destination || "hand");
        return { ok: true, item: item.name };
      }

      case "inventory_action":
      case "move_item":
      case "drop_item": {
        const requestedSlot = params.slot ?? params.fromSlot;
        const sourceSlot = requestedSlot == null || requestedSlot === "" ? NaN : Number(requestedSlot);
        const item = Number.isInteger(sourceSlot) ? bot.inventory.slots[sourceSlot] : bot.inventory.items().find((entry) => entry.name === params.item);
        if (!item) return { ok: false, error: "Inventory item not found" };
        const operation = String(params.action || action).toLowerCase();
        if (action === "move_item" || operation.includes("move")) {
          const targetSlot = Number(params.toSlot);
          const destination = Number.isInteger(targetSlot) ? targetSlot : Array.from({ length: 9 }, (_, i) => 36 + i).find((slot) => !bot.inventory.slots[slot]);
          if (!Number.isInteger(destination)) return { ok: false, error: "No empty hotbar slot" };
          await bot.moveSlotItem(item.slot, destination);
        } else if (operation.includes("equip to armor")) {
          const armorSlots = [["helmet", "head"], ["chestplate", "torso"], ["leggings", "legs"], ["boots", "feet"]];
          const destination = armorSlots.find(([name]) => item.name.includes(name))?.[1];
          if (!destination) return { ok: false, error: "Selected item is not armor" };
          await bot.equip(item, destination);
        } else if (operation.includes("equip")) {
          await bot.equip(item, "hand");
        } else if (operation.includes("drop one")) {
          await bot.toss(item.type, item.metadata, 1);
        } else if (operation.includes("drop") || action === "drop_item") {
          await bot.tossStack(item);
        } else {
          return { ok: false, error: `Unknown inventory operation: ${operation}` };
        }
        syncInventory(id, bot);
        return { ok: true };
      }

      case "walk": {
        const dir = String(params.dir || "forward").toLowerCase();
        if (!bot.pathfinder) return { ok: false, error: "Pathfinder plugin is unavailable" };
        if (!["forward", "back", "left", "right"].includes(dir)) return { ok: false, error: `Unknown walk direction: ${dir}` };
        const durationMs = Math.max(500, Math.min(8000, Number(params.durationMs) || 2000));
        const { x, y, z } = bot.entity.position;
        const yaw = bot.entity.yaw;
        const forward = { x: -Math.sin(yaw), z: Math.cos(yaw) };
        const right = { x: -Math.cos(yaw), z: -Math.sin(yaw) };
        const vectors = {
          forward,
          back: { x: -forward.x, z: -forward.z },
          right,
          left: { x: -right.x, z: -right.z },
        };
        const vector = vectors[dir];
        const distance = Math.max(2, Math.min(8, durationMs / 500));
        updateBot(id, { task: `walking ${dir}` });
        try {
          const result = await smartWalk(bot, Math.round(x + vector.x * distance), Math.round(y), Math.round(z + vector.z * distance));
          return result.ok ? { ...result, movedBlocks: result.movedBlocks } : { ok: false, error: result.reason };
        } finally {
          if (isOnline(inst)) updateBot(id, { task: "idle" });
        }
      }

      case "jump":
        if (!await waitForGround(bot, 3000)) return { ok: false, error: "Bot is not on solid ground yet" };
        bot.setControlState("jump", true);
        setTimeout(() => bot.setControlState("jump", false), 300);
        return { ok: true };

      case "jump_forward": {
        if (!await waitForGround(bot, SETTINGS.groundWaitTimeoutMs)) return { ok: false, error: "Bot is not on solid ground yet" };
        const start = bot.entity.position.clone();
        const durationMs = Math.max(300, Math.min(700, Number(params.durationMs) || 500));
        try {
          bot.setControlState("forward", true);
          bot.setControlState("jump", true);
          await new Promise((resolve) => setTimeout(resolve, durationMs));
        } finally {
          bot.setControlState("forward", false);
          bot.setControlState("jump", false);
        }
        const movedBlocks = start.distanceTo(bot.entity.position);
        return movedBlocks > 0.2
          ? { ok: true, movedBlocks }
          : { ok: false, error: "Jump was blocked; check the wall, server protection, or anti-cheat", movedBlocks };
      }

      case "goto": {
        updateBot(id, { task: "walking" });
        const r = await smartWalk(bot, params.x ?? 0, params.y ?? 64, params.z ?? 0);
        updateBot(id, { task: "idle" });
        return r;
      }

      case "come":
      case "walk_to_player": {
        if (!params.target) return { ok: false, error: "missing target player" };
        updateBot(id, { task: `walking to ${params.target}` });
        const r = await smartGoToPlayer(bot, params.target);
        updateBot(id, { task: "idle" });
        return r;
      }

      case "follow": {
        if (!params.target) return { ok: false, error: "missing target player" };
        const p = bot.players[params.target] || Object.values(bot.players).find((player) => player.username.toLowerCase() === String(params.target).toLowerCase());
        if (!p?.entity) return { ok: false, error: "player not visible" };
        bot.pathfinder.setGoal(new goals.GoalFollow(p.entity, 2), true);
        updateBot(id, { task: `following ${params.target}` });
        return { ok: true };
      }

      case "explore": {
        const pos = bot.entity.position;
        const x = Math.round(pos.x + (Math.random() * 80 - 40));
        const z = Math.round(pos.z + (Math.random() * 80 - 40));
        updateBot(id, { task: "exploring" });
        const r = await smartWalk(bot, x, Math.round(pos.y), z);
        updateBot(id, { task: "idle" });
        return r;
      }

      case "chop_wood": {
        if (!bot.collectBlock) return { ok: false, error: "collectBlock plugin missing" };
        const count = Math.max(1, Math.min(128, Number(params.count) || 16));
        const logIds = ["oak_log", "birch_log", "spruce_log", "jungle_log", "acacia_log", "dark_oak_log", "mangrove_log", "cherry_log"];
        inst.actionRunning = "chopping wood";
        inst.cancelAction = false;
        updateBot(id, { task: "chopping" });
        void (async () => {
          let chopped = 0;
          let searchAttempts = 0;
          while (chopped < count && isOnline(inst) && !inst.cancelAction) {
            const block = bot.findBlock({ matching: (b) => logIds.includes(b.name), maxDistance: 64 });
            if (!block) {
              if (searchAttempts >= 2) break;
              const pos = bot.entity.position;
              searchAttempts++;
              const result = await smartWalk(bot, Math.round(pos.x + 20), Math.round(pos.y), Math.round(pos.z + 20));
              if (!result.ok) break;
              continue;
            }
            searchAttempts = 0;
            try { await bot.collectBlock.collect(block); chopped++; recordMinedBlocks(); } catch { break; }
          }
          inst.actionRunning = null;
          inst.cancelAction = false;
          if (isOnline(inst)) updateBot(id, { task: "idle" });
          emitNotification({ botId: id, level: "info", text: `Chopped ${chopped}/${count} logs.` });
        })().catch((err) => {
          inst.actionRunning = null;
          inst.cancelAction = false;
          emitNotification({ botId: id, level: "warning", text: `${bot.username} wood task failed: ${err.message}` });
        });
        return { ok: true };
      }

      case "mine": {
        if (!bot.collectBlock) return { ok: false, error: "collectBlock plugin missing" };
        const blockName = params.block || "stone";
        const count = Math.max(1, Math.min(128, Number(params.count) || 32));
        inst.actionRunning = `mining ${blockName}`;
        inst.cancelAction = false;
        updateBot(id, { task: "mining" });
        void (async () => {
          let mined = 0;
          while (mined < count && isOnline(inst) && !inst.cancelAction) {
            const block = bot.findBlock({ matching: (b) => b.name === blockName, maxDistance: 64 });
            if (!block) break;
            try { await bot.collectBlock.collect(block); mined++; recordMinedBlocks(); } catch { break; }
          }
          inst.actionRunning = null;
          inst.cancelAction = false;
          if (isOnline(inst)) updateBot(id, { task: "idle" });
          emitNotification({ botId: id, level: "info", text: `Mined ${mined}/${count} ${blockName}.` });
        })().catch((err) => {
          inst.actionRunning = null;
          inst.cancelAction = false;
          emitNotification({ botId: id, level: "warning", text: `${bot.username} mining task failed: ${err.message}` });
        });
        return { ok: true };
      }

      case "mine_stone":
        return runRealAction(id, "mine", { ...params, block: params.block || "stone" });

      case "dig_down": {
        const block = bot.blockAt(bot.entity.position.offset(0, -1, 0));
        if (block && block.name !== "air") {
          await bot.dig(block);
          recordMinedBlocks();
        }
        return { ok: true };
      }

      case "collect_nearby": {
        const items = Object.values(bot.entities).filter((e) => e.name === "item" && e.position.distanceTo(bot.entity.position) < 20);
        for (const it of items.slice(0, 10)) {
          await smartWalk(bot, Math.floor(it.position.x), Math.floor(it.position.y), Math.floor(it.position.z)).catch(() => {});
        }
        return { ok: true, collected: items.length };
      }

      case "attack_nearest":
      case "attack": {
        if (!bot.pvp) return { ok: false, error: "PvP plugin unavailable" };
        const entity = params.target
          ? Object.values(bot.entities).find((candidate) =>
            [candidate.username, candidate.name, candidate.displayName].some((value) => value?.toLowerCase() === String(params.target).toLowerCase())
          )
          : nearestHostileMob(bot);
        if (!entity) return { ok: false, error: params.target ? `Target not visible: ${params.target}` : "No nearby mob found" };
        bot.pvp.attack(entity);
        updateBot(id, { task: "attacking", target: entity.displayName || entity.username || entity.name });
        return { ok: true, target: entity.displayName || entity.username || entity.name };
      }

      case "stop_attack":
        inst.autoKillEnabled = false;
        clearTimeout(inst.timers.autoKill);
        inst.autoKillTarget = null;
        if (bot.pvp) bot.pvp.stop();
        updateBot(id, { task: "idle", target: null, autoKillEnabled: false });
        return { ok: true };

      case "flee": {
        const mob = nearestHostileMob(bot);
        if (!mob) return { ok: false, error: "No nearby mob to flee from" };
        const position = bot.entity.position;
        const dx = position.x - mob.position.x;
        const dz = position.z - mob.position.z;
        const distance = Math.hypot(dx, dz) || 1;
        updateBot(id, { task: "fleeing" });
        return smartWalk(bot, Math.round(position.x + (dx / distance) * 16), Math.round(position.y), Math.round(position.z + (dz / distance) * 16));
      }

      case "stop":
      case "stop_move":
        inst.cancelAction = true;
        inst.autoKillEnabled = false;
        clearTimeout(inst.timers.autoKill);
        inst.autoKillTarget = null;
        ["forward", "back", "left", "right", "jump", "sprint", "sneak"].forEach((c) => bot.setControlState(c, false));
        if (bot.pathfinder) try { bot.pathfinder.stop(); bot.pathfinder.setGoal(null); } catch {}
        if (bot.pvp) try { bot.pvp.stop(); } catch {}
        if (bot.collectBlock) try { bot.collectBlock.cancelTask(); } catch {}
        updateBot(id, { task: "idle", target: null, autoKillEnabled: false });
        return { ok: true };

      case "eat":
        if (!bot.autoEat?.eat) return { ok: false, error: "Auto-Eat plugin unavailable" };
        if (!await bot.autoEat.eat()) return { ok: false, error: "No suitable food in inventory" };
        return { ok: true };

      case "drop_all":
      case "dropall":
        if (!bot.inventory.items().length) return { ok: false, error: "Inventory is already empty" };
        for (const item of bot.inventory.items()) await bot.tossStack(item);
        syncInventory(id, bot);
        return { ok: true };

      case "toggle_auto_eat":
        if (!bot.autoEat) return { ok: false, error: "Auto-Eat plugin unavailable" };
        if (bot.autoEat.disabled) bot.autoEat.enable();
        else bot.autoEat.disable();
        updateBot(id, { autoEatEnabled: !bot.autoEat.disabled });
        return { ok: true, enabled: !bot.autoEat.disabled };

      case "toggle_auto_kill":
        if (!bot.pvp) return { ok: false, error: "PvP plugin unavailable" };
        inst.autoKillEnabled = !inst.autoKillEnabled;
        updateBot(id, { autoKillEnabled: inst.autoKillEnabled, task: inst.autoKillEnabled ? "auto-kill" : "idle" });
        if (inst.autoKillEnabled) scheduleAutoKill(id, inst);
        else {
          clearTimeout(inst.timers.autoKill);
          inst.autoKillTarget = null;
          bot.pvp.stop();
          updateBot(id, { target: null });
        }
        return { ok: true, enabled: inst.autoKillEnabled };

      case "toggle_auto_armor":
        if (!bot.armorManager) return { ok: false, error: "Armor manager plugin unavailable" };
        await bot.armorManager.equipAll();
        return { ok: true };

      case "warp":
        bot.chat(`/warp ${params.target}`);
        return { ok: true };

      case "home":
        bot.chat("/home");
        return { ok: true };

      case "spawn":
        bot.chat("/spawn");
        return { ok: true };

      case "idle":
        return { ok: true };

      default:
        return { ok: false, error: `Unknown action: ${action}` };
    }
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function syncInventory(id, bot) {
  const items = bot.inventory.items();
  const hotbar = Array(9).fill(null);
  const main = Array(27).fill(null);
  items.forEach((item) => {
    const slot = item.slot;
    if (slot >= 36 && slot <= 44) hotbar[slot - 36] = toItemView(item);
    else if (slot >= 9 && slot <= 35) main[slot - 9] = toItemView(item);
  });
  const armor = [5, 6, 7, 8].map((slot) => bot.inventory.slots[slot] ? toItemView(bot.inventory.slots[slot]) : null);
  const offhand = bot.inventory.slots[45] ? toItemView(bot.inventory.slots[45]) : null;
  updateBot(id, {
    inventory: { hotbar, main, armor, offhand },
    equipment: { helmet: armor[0], chestplate: armor[1], leggings: armor[2], boots: armor[3], offhand },
    heldItem: bot.heldItem ? toItemView(bot.heldItem) : null,
  });
  emitInventory(id);
}

function toItemView(item) {
  return {
    name: item.name,
    displayName: item.displayName,
    count: item.count,
    slot: item.slot,
    enchanted: (item.enchants || []).length > 0,
    nbt: item.nbt || null,
  };
}
