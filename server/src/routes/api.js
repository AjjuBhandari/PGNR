import { Router } from "express";
import { v4 as uuid } from "uuid";
import db from "../db/index.js";
import { bots, createBotRecord, getAiDecisionHistory, sessionMetrics, updateBot } from "../bots/state.js";
import * as manager from "../bots/manager.js";

const router = Router();

function normalizeMinecraftHost(hostValue) {
  const raw = String(hostValue ?? "").trim();
  if (!raw) return "localhost";
  if (/^\[[^\]]+\]:\d{1,5}$/.test(raw) || /^.+:\d{1,5}$/.test(raw)) return raw;
  if (/\.aternos\.me$/i.test(raw)) return `${raw}:58405`;
  return `${raw}:25565`;
}

router.get("/analytics", (req, res) => {
  const botCount = db.prepare(`SELECT COUNT(*) AS count FROM (SELECT lower(username), lower(host) FROM bots GROUP BY lower(username), lower(host))`).get().count;
  const onlineBotKeys = new Set(Array.from(bots.values())
    .filter((bot) => ["SPAWNED", "IN_LOBBY", "AT_AFK"].includes(bot.state))
    .map((bot) => `${bot.username.toLowerCase()}@${bot.host.toLowerCase()}`));
  const commandTotals = db.prepare(`SELECT COUNT(*) AS total, SUM(status = 'executed') AS executed, SUM(status = 'failed') AS failed FROM commands`).get();
  const commandRows = db.prepare(`SELECT strftime('%Y-%m-%dT%H:%M', created_at) AS minute, COUNT(*) AS commands FROM commands WHERE created_at >= datetime('now', '-7 minutes') GROUP BY minute`).all();
  const commandMap = new Map(commandRows.map((row) => [row.minute, row.commands]));
  const now = new Date();
  now.setUTCSeconds(0, 0);
  const commandsPerMinute = Array.from({ length: 8 }, (_, index) => {
    const time = new Date(now.getTime() - (7 - index) * 60_000);
    return { t: time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }), cmds: commandMap.get(time.toISOString().slice(0, 16)) || 0 };
  });
  res.json({
    sessionStartedAt: sessionMetrics.startedAt,
    totalBots: botCount,
    onlineBots: onlineBotKeys.size,
    blocksMined: sessionMetrics.blocksMined,
    distanceWalked: sessionMetrics.distanceWalked,
    commands: { total: commandTotals.total, executed: commandTotals.executed || 0, failed: commandTotals.failed || 0 },
    vitalsHistory: sessionMetrics.vitalsHistory.map((sample) => ({ ...sample, t: new Date(sample.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) })),
    commandsPerMinute,
  });
});

// ---- Bots ----
router.get("/bots", (req, res) => {
  const savedBots = db.prepare(`SELECT id, username, version, host FROM bots ORDER BY created_at DESC, rowid DESC`).all();
  const uniqueByAccount = new Map();
  for (const saved of savedBots) {
    const key = `${saved.username.toLowerCase()}@${saved.host.toLowerCase()}`;
    if (!uniqueByAccount.has(key)) uniqueByAccount.set(key, saved);
  }
  const uniqueSavedBots = [...uniqueByAccount.values()];
  for (const saved of uniqueSavedBots) {
    if (!bots.has(saved.id)) createBotRecord(saved);
  }
  res.json(uniqueSavedBots.map(({ id }) => bots.get(id)));
});

router.post("/bots", (req, res) => {
  const { password } = req.body;
  const username = String(req.body.username || "").trim();
  if (!username) return res.status(400).json({ error: "username is required" });
  const id = uuid();
  const finalHost = normalizeMinecraftHost(req.body.host || process.env.DEFAULT_MC_HOST || "localhost");
  const finalVersion = String(req.body.version || process.env.DEFAULT_MC_VERSION || "1.20.4").trim();
  const duplicate = db.prepare(`SELECT id FROM bots WHERE lower(username) = lower(?) AND lower(host) = lower(?)`).get(username, finalHost);
  if (duplicate) return res.status(409).json({ error: `${username} is already saved for ${finalHost}` });

  db.prepare(
    `INSERT INTO bots (id, username, password_encrypted, version, host) VALUES (?, ?, ?, ?, ?)`
  ).run(id, username, password ? encrypt(password) : null, finalVersion, finalHost);

  manager.addBot({ id, username, password, host: finalHost, version: finalVersion });
  res.status(201).json({ id });
});

router.post("/bots/start-all", (req, res) => {
  const allRows = db.prepare(`SELECT * FROM bots ORDER BY created_at DESC, rowid DESC`).all();
  const uniqueByAccount = new Map();
  for (const row of allRows) {
    const key = `${row.username.toLowerCase()}@${row.host.toLowerCase()}`;
    if (!uniqueByAccount.has(key)) uniqueByAccount.set(key, row);
  }
  const rows = [...uniqueByAccount.values()];
  const spacingMs = Math.max(0, Number(process.env.MC_BOT_START_SPACING_MS || 5000));
  let accounts;
  try {
    accounts = rows.map((row) => ({
      row,
      password: !manager.isMock() && row.password_encrypted ? decrypt(row.password_encrypted) : null,
    }));
  } catch {
    return res.status(400).json({ error: "A saved Minecraft password cannot be decrypted. Edit that account and re-enter its password before starting bots." });
  }
  accounts.forEach(({ row, password }, index) => {
    if (!bots.has(row.id)) createBotRecord(row);
    setTimeout(() => {
      manager.start(row.id, {
        username: row.username,
        password,
        host: row.host,
        version: row.version,
      });
    }, index * spacingMs);
  });
  res.json({ ok: true, scheduled: rows.length, spacingMs });
});

router.put("/bots/:id", (req, res) => {
  const row = db.prepare(`SELECT * FROM bots WHERE id = ?`).get(req.params.id);
  if (!row) return res.status(404).json({ error: "Bot not found" });
  const username = String(req.body.username ?? row.username).trim();
  const host = normalizeMinecraftHost(req.body.host ?? row.host);
  const version = String(req.body.version ?? row.version).trim();
  if (!username || !host || !version) return res.status(400).json({ error: "Username, host, and version are required" });
  const duplicate = db.prepare(`SELECT id FROM bots WHERE id != ? AND lower(username) = lower(?) AND lower(host) = lower(?)`).get(row.id, username, host);
  if (duplicate) return res.status(409).json({ error: `${username} is already saved for ${host}` });

  manager.stop(row.id);
  db.prepare(`UPDATE bots SET username = ?, host = ?, version = ?, password_encrypted = ? WHERE id = ?`).run(
    username,
    host,
    version,
    req.body.password ? encrypt(req.body.password) : row.password_encrypted,
    row.id
  );
  updateBot(row.id, { username, host, version });
  res.json({ ok: true });
});

router.post("/bots/:id/start", (req, res) => {
  const row = db.prepare(`SELECT * FROM bots WHERE id = ?`).get(req.params.id);
  if (!row) return res.status(404).json({ error: "Bot not found" });
  if (!bots.has(row.id)) createBotRecord(row);
  let password;
  try {
    password = !manager.isMock() && row.password_encrypted ? decrypt(row.password_encrypted) : null;
  } catch {
    return res.status(400).json({ error: "This saved Minecraft password cannot be decrypted. Edit the account and re-enter its password before starting it." });
  }
  manager.start(row.id, {
    username: row.username,
    password,
    host: row.host,
    version: row.version,
  });
  res.json({ ok: true });
});

router.post("/bots/:id/stop", (req, res) => {
  manager.stop(req.params.id);
  res.json({ ok: true });
});

router.post("/bots/:id/restart", (req, res) => {
  const row = db.prepare(`SELECT * FROM bots WHERE id = ?`).get(req.params.id);
  if (!row) return res.status(404).json({ error: "Bot not found" });
  let password;
  try {
    password = !manager.isMock() && row.password_encrypted ? decrypt(row.password_encrypted) : null;
  } catch {
    return res.status(400).json({ error: "This saved Minecraft password cannot be decrypted. Edit the account and re-enter its password before restarting it." });
  }
  manager.restart(row.id, {
    username: row.username,
    password,
    host: row.host,
    version: row.version,
  });
  res.json({ ok: true });
});

// ---- Commands / actions ----
router.post("/bots/:id/command", async (req, res) => {
  const { action, params, raw } = req.body;
  const cmdId = uuid();
  const label = raw || action;

  db.prepare(
    `INSERT INTO commands (id, bot_id, command, status) VALUES (?, ?, ?, 'sent')`
  ).run(cmdId, req.params.id, label);

  try {
    const result = await manager.runAction(req.params.id, action || "chat", params || { message: raw });
    db.prepare(`UPDATE commands SET status = ? WHERE id = ?`).run(
      result?.ok ? "executed" : "failed",
      cmdId
    );
    res.json({ id: cmdId, ...result });
  } catch (err) {
    db.prepare(`UPDATE commands SET status = 'failed' WHERE id = ?`).run(cmdId);
    res.status(500).json({ id: cmdId, error: err.message });
  }
});

router.get("/bots/:id/commands", (req, res) => {
  const rows = db
    .prepare(`SELECT * FROM commands WHERE bot_id = ? ORDER BY created_at DESC LIMIT 200`)
    .all(req.params.id);
  res.json(rows);
});

// ---- Inventory ----
router.get("/bots/:id/inventory", (req, res) => {
  const bot = bots.get(req.params.id);
  if (!bot) return res.status(404).json({ error: "Bot not found" });
  res.json({ inventory: bot.inventory, equipment: bot.equipment });
});

router.post("/bots/:id/inventory/move", async (req, res) => {
  // Real inventory manipulation goes through manager.runAction with a
  // 'move_item' action in the live-server (non-mock) driver.
  const result = await manager.runAction(req.params.id, "move_item", req.body);
  res.json(result);
});

router.post("/bots/:id/inventory/drop", async (req, res) => {
  const result = await manager.runAction(req.params.id, "drop_item", req.body);
  res.json(result);
});

// ---- AI ----
router.get("/ai/config", (req, res) => {
  res.json(manager.getAiConfig());
});

router.post("/bots/:id/ai/toggle", (req, res) => {
  const bot = bots.get(req.params.id);
  if (!bot) return res.status(404).json({ error: "Bot not found" });
  if (req.body.enabled && !manager.getAiConfig().configured) {
    return res.status(400).json({ error: "Configure an AI provider key in server/.env before enabling bot AI" });
  }
  bot.ai.enabled = !!req.body.enabled;
  if (bot.ai.enabled) manager.startAi(req.params.id);
  else manager.stopAi(req.params.id);
  res.json({ ai: bot.ai });
});

router.post("/bots/:id/ai/interval", (req, res) => {
  const bot = bots.get(req.params.id);
  if (!bot) return res.status(404).json({ error: "Bot not found" });
  const intervalMs = Number(req.body.intervalMs);
  if (!Number.isFinite(intervalMs)) return res.status(400).json({ error: "intervalMs must be a number" });
  bot.ai.intervalMs = Math.max(1000, Math.min(30000, Math.round(intervalMs)));
  res.json({ ai: bot.ai });
});

router.post("/bots/:id/ai/goal", (req, res) => {
  const bot = bots.get(req.params.id);
  if (!bot) return res.status(404).json({ error: "Bot not found" });
  bot.ai.goal = req.body.goal || "";
  res.json({ ai: bot.ai });
});

router.get("/bots/:id/ai/decisions", (req, res) => {
  if (!bots.has(req.params.id)) return res.status(404).json({ error: "Bot not found" });
  res.json(getAiDecisionHistory(req.params.id));
});

// ---- Macros ----
router.get("/macros", (req, res) => {
  res.json(db.prepare(`SELECT * FROM macros ORDER BY created_at DESC`).all());
});

router.post("/macros", (req, res) => {
  const { name, steps } = req.body;
  const id = uuid();
  db.prepare(`INSERT INTO macros (id, name, steps_json) VALUES (?, ?, ?)`).run(
    id,
    name,
    JSON.stringify(steps || [])
  );
  res.status(201).json({ id });
});

router.post("/macros/:id/run", (req, res) => {
  const macro = db.prepare(`SELECT * FROM macros WHERE id = ?`).get(req.params.id);
  if (!macro) return res.status(404).json({ error: "Macro not found" });
  const steps = JSON.parse(macro.steps_json);
  const targetIds = req.body.botIds || Array.from(bots.keys());
  targetIds.forEach((botId) => {
    steps.forEach((step, i) => {
      setTimeout(() => manager.runAction(botId, step.action, step.params), i * 800);
    });
  });
  res.json({ ok: true, dispatched: targetIds.length });
});

// ---- naive AES via Node crypto, placeholder for real key management ----
import crypto from "crypto";
const KEY = crypto
  .createHash("sha256")
  .update(process.env.BOT_ENCRYPTION_KEY || "dev_key")
  .digest();

function encrypt(text) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", KEY, iv);
  const enc = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  return iv.toString("hex") + ":" + enc.toString("hex");
}
function decrypt(payload) {
  const [ivHex, dataHex] = payload.split(":");
  const decipher = crypto.createDecipheriv("aes-256-cbc", KEY, Buffer.from(ivHex, "hex"));
  const dec = Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]);
  return dec.toString("utf8");
}

export default router;
