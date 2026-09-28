# Minecraft Bot Manager Dashboard

Full-stack dashboard for controlling multiple Mineflayer bots from a browser:
bot list, live inventory viewer, chat/console feeds, per-bot action panel,
AI control loop, macros, and analytics.

## Stack
- **Frontend**: React 18 + Vite + TypeScript + Tailwind + Zustand + Socket.IO client
- **Backend**: Node.js + Express + Socket.IO + SQLite (better-sqlite3) + JWT auth
- **Bots**: mineflayer + pathfinder + collectblock + pvp + armor-manager + auto-eat

## Quick start (local dev, no real Minecraft server needed)

Use Node.js 22 for the backend; its native SQLite dependency must use the same Node ABI.

The backend ships with a **mock mode** that simulates bot lifecycle and state
so you can build/test the UI without a live server.

```bash
# 1. Backend
cd server
cp .env.example .env
npm install
node scripts/hash-password.js "yourAdminPassword"   # paste result into ADMIN_PASSWORD_HASH in .env
npm run dev

# 2. Frontend (new terminal)
cd client
cp .env.example .env
npm install
npm run dev
```

Open http://localhost:5173, log in with the admin username/password you set,
and you'll see simulated bots connecting and moving around.

## Connecting to a real Minecraft server

1. In `server/.env`, set `MOCK_MODE=false` and `DEFAULT_MC_HOST` /
   `DEFAULT_MC_VERSION` to your server.
2. Add a bot from the dashboard ("Add Bot") with its Minecraft username
  (and password, if the account is premium/online-mode). Use the current Aternos
  address and port. The real
   `mineflayer` driver in `server/src/bots/mineflayerDriver.js` takes over —
   it already wires pathfinder, pvp, collectblock, armor-manager and auto-eat.
3. Use the inventory menu to equip, move, or drop items. These actions use
  Mineflayer's inventory slot, equipment, and toss operations.

## Docker (one command)

```bash
cp server/.env.example server/.env   # fill in real secrets first
docker compose up --build
```

Frontend on :5173, backend on :4000.

## GitHub Pages frontend

The frontend deploys automatically with `.github/workflows/deploy-pages.yml`.
Enable **Settings > Pages > Source: GitHub Actions** in the repository. The
published site is `https://ajjubhandari.github.io/PGNR/`.

Set repository variables named `VITE_API_URL` and `VITE_WS_URL` when the backend
URL is known. The workflow defaults to the current Render backend URL.

## Hosting files

- `render.yaml` defines the backend Web Service and frontend Static Site for Render.
- `DEPLOYMENT.md` contains provider-neutral Docker instructions and the required environment variables.
- The backend is pinned to Node 22 because `better-sqlite3` is a native dependency.

## Project layout

```
server/
  src/
    index.js            # Express + Socket.IO entrypoint
    auth.js             # JWT issue/verify
    db/index.js          # SQLite schema
    bots/
      state.js           # in-memory bot registry + event bus
      manager.js          # picks mock vs real driver
      mockDriver.js        # simulated bots for UI dev
      mineflayerDriver.js  # real mineflayer integration
    routes/api.js        # REST endpoints
  scripts/hash-password.js
client/
  src/
    App.tsx              # socket wiring + layout
    components/          # Sidebar, TopBar, CenterPanel tabs, RightPanel...
    store/useStore.ts    # Zustand global state
    lib/                 # api.ts, socket.ts, placeholderData.ts
    types/bot.ts          # shared TS types
```

## What's stubbed vs. real

- **Mock mode (default)**: bots simulate connecting, moving, taking damage,
  and chatting so every panel has live data to render immediately.
- **Real mode**: `mineflayerDriver.js` is a full port of a working
  single-file CLI bot manager, adapted to this app's event shape:
  - **Fast movement**: `Movements` is configured with sprinting and parkour
    on, and every walk/pathfind call waits for the bot to be on solid
    ground first (`waitForGround`) — this is what fixes the "1-pixel
    crawl" / stuck-after-teleport problem the original script solved.
  - **Auto login/register**: listens to chat/system messages for
    `/register`, `/login`, "already logged in", etc. and answers them
    using the bot's stored password; optionally hops through a hub to a
    named sub-server via `MC_TARGET_SERVER` in `.env` and retries the
    `/server <name>` command a few times if the first attempt doesn't land.
  - **Actions**: `chop_wood`, `mine`, `come`/`follow` (walk to or trail a
    named player), `goto`, `explore` (random-walk to find new terrain),
    `walk` (directional + sprint for a duration), `attack_nearest`,
    `drop_all`, `eat`, plus the simpler ones (`stop`, `home`, `spawn`,
    `warp`, `dig_down`, `collect_nearby`).
  - **AI Control tab is live**: toggling AI on a bot starts a real
    decision loop (`aiLoop` in `mineflayerDriver.js`) that reads the bot's
    health/food/position/inventory/visible players/hostile mobs, asks an
    OpenAI-compatible model (`AI_PROVIDER=openai|deepseek|keyless` in
    `.env`) for one JSON action, and executes it — same priority order
    as the original script (eat if low HP/food, fight, chop, mine, greet
    players, otherwise explore). Decisions stream into the AI Control
    tab's log via the `bot:ai-decision` socket event.
  - Still open: `screenshot` / `show_path` (would need
    `prismarine-viewer`), and inventory drag-and-drop move/drop against a
    live server (`bot.moveSlotItem` / `bot.tossStack` are the calls to
    finish wiring in `runRealAction`).
- **Macros**: create/list/run endpoints exist and dispatch a sequence of
  actions with delay; there's no recorder UI yet — add one that pushes
  each action the user clicks into a steps array before saving.

### A note on credentials
Bot usernames/passwords are entered through the **Add Bot** modal (or the
`POST /api/bots` endpoint) and stored AES-encrypted in SQLite — never
hardcode real account credentials into any source file, and don't commit
a filled-in `server/.env`.

## Security notes
- Bot passwords are AES-256-CBC encrypted at rest using `BOT_ENCRYPTION_KEY`.
- AI provider keys are read from `server/.env` and never sent to the client.
- All `/api/*` routes require a JWT; Socket.IO handshakes are verified too.
- Set a strong `JWT_SECRET` and `BOT_ENCRYPTION_KEY` before deploying.
