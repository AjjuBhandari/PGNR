import "dotenv/config";
import express from "express";
import cors from "cors";
import fs from "fs";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { Server } from "socket.io";
import rateLimit from "express-rate-limit";

import apiRouter from "./routes/api.js";
import { issueToken, verifyPassword, requireAuth, verifySocketToken } from "./auth.js";
import { bus, getRecentChatMessages, recordVitalsSample } from "./bots/state.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = process.env.PUBLIC_DIR || path.join(__dirname, "../public");
const indexHtml = path.join(publicDir, "index.html");

const app = express();
app.use(cors());
app.use(express.json());

const limiter = rateLimit({ windowMs: 60_000, max: 120 });
app.use("/api/", limiter);

// ---- Auth ----
app.post("/api/auth/login", (req, res) => {
  const { username, password } = req.body;
  const ok =
    username === process.env.ADMIN_USERNAME &&
    verifyPassword(password, process.env.ADMIN_PASSWORD_HASH);
  if (!ok) return res.status(401).json({ error: "Invalid credentials" });
  res.json({ token: issueToken(username) });
});

// Everything else under /api requires a valid JWT.
app.use("/api", requireAuth, apiRouter);

app.get("/health", (req, res) =>
  res.json({
    ok: true,
    mock: process.env.MOCK_MODE === "true",
    ui: fs.existsSync(indexHtml),
  })
);

function isApiPath(reqPath) {
  return reqPath.startsWith("/api") || reqPath.startsWith("/socket.io") || reqPath === "/health";
}

if (fs.existsSync(indexHtml)) {
  app.use(express.static(publicDir));
  app.use((req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    if (isApiPath(req.path)) return next();
    res.sendFile(indexHtml);
  });
} else {
  const missingUiPage = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Minecraft Bot Manager</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #12141a; color: #e8eaed; margin: 0; padding: 48px 24px; }
    main { max-width: 640px; margin: 0 auto; }
    a { color: #7dce7a; }
    code { background: #1c1f27; padding: 2px 6px; border-radius: 4px; }
  </style>
</head>
<body>
  <main>
    <h1>Backend is running</h1>
    <p>The API is up, but the dashboard UI was not copied into <code>server/public</code>.</p>
    <p>Health check: <a href="/health">/health</a></p>
    <p>Rebuild with the Render start guide so the React app is served from this same URL.</p>
  </main>
</body>
</html>`;
  app.use((req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    if (isApiPath(req.path)) return next();
    res.type("html").send(missingUiPage);
  });
}

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });
const vitalsSampler = setInterval(recordVitalsSample, 5_000);
vitalsSampler.unref();

io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  const user = verifySocketToken(token);
  if (!user) return next(new Error("unauthorized"));
  next();
});

io.on("connection", (socket) => {
  const forward = (event) => (payload) => socket.emit(event, payload);
  const handlers = {
    "bot:state": forward("bot:state"),
    "bot:chat": forward("bot:chat"),
    "bot:inventory": forward("bot:inventory"),
    "bot:ai-decision": forward("bot:ai-decision"),
    "system:notification": forward("system:notification"),
  };
  Object.entries(handlers).forEach(([evt, fn]) => bus.on(evt, fn));
  socket.emit("bot:chat-history", getRecentChatMessages());

  socket.on("disconnect", () => {
    Object.entries(handlers).forEach(([evt, fn]) => bus.off(evt, fn));
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, "0.0.0.0", () => {
  const ui = fs.existsSync(indexHtml) ? "dashboard UI enabled" : "API only (no server/public/index.html)";
  console.log(`Bot manager listening on :${PORT} (mock=${process.env.MOCK_MODE}, ${ui})`);
});
