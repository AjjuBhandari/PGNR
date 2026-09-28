import "dotenv/config";
import express from "express";
import cors from "cors";
import http from "http";
import { Server } from "socket.io";
import rateLimit from "express-rate-limit";

import apiRouter from "./routes/api.js";
import { issueToken, verifyPassword, requireAuth, verifySocketToken } from "./auth.js";
import { bus, getRecentChatMessages, recordVitalsSample } from "./bots/state.js";

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

app.get("/health", (req, res) => res.json({ ok: true, mock: process.env.MOCK_MODE === "true" }));

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
server.listen(PORT, () => {
  console.log(`Bot manager backend listening on :${PORT} (mock=${process.env.MOCK_MODE})`);
});
