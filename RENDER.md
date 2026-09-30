# Render setup (full app: dashboard + API)

This is the current hosting guide. One Render **Web Service** serves the login page, dashboard, REST API, and Socket.IO on the **same URL**.

That is what fixes **`Cannot GET /`**. The old setup only ran Express API routes, so opening `https://….onrender.com/` in a browser had no page.

Do **not** create a separate Render Static Site for `client`. Do **not** point GitHub Pages at this service unless you still want a second frontend.

---

## 1. Delete the old Render services

In [Render Dashboard](https://dashboard.render.com):

1. Open every old service from this repo (`pgnr-backend`, `pgnr-1`, any Static Site named like `pgnr-frontend`).
2. **Settings → Delete** each one.
3. If you used **Blueprint**, you can also delete the old Blueprint instance from **Blueprints**.

Wait until they are gone so the new service can reuse a name like `pgnr`.

---

## 2. Push this repo (required)

Render builds from GitHub. Commit and push these files first:

- `render.yaml`
- root `package.json` and `Dockerfile`
- `scripts/copy-ui.mjs`
- `server/src/index.js` (serves `server/public`)

---

## 3. Create the new service (Blueprint)

1. [Render Dashboard](https://dashboard.render.com) → **New** → **Blueprint**.
2. Connect the GitHub repo (`PGNR` or `mc-bot-dashboard`).
3. Apply `render.yaml`. It creates one web service named **`pgnr`**.
4. Fill the **sync: false** env vars in the Blueprint form (see table below). You cannot skip `ADMIN_USERNAME` and `ADMIN_PASSWORD_HASH` or login will fail.

### Manual create (if you skip Blueprint)

1. **New** → **Web Service** → this repo.
2. **Root Directory**: leave **empty** (repo root, not `server`).
3. **Runtime**: Node.
4. **Build Command**: `npm run build`
5. **Start Command**: `npm start`
6. **Instance**: Free is fine to test. It sleeps after idle; bots disconnect while asleep.
7. **Health Check Path**: `/health`
8. Add env vars from the table.

Render sets `PORT` for you. Do not hardcode `4000` in production env.

---

## 4. Environment variables

| Key | Required | Example / how to set |
| --- | --- | --- |
| `NODE_VERSION` | yes | `22` (Blueprint sets this) |
| `ADMIN_USERNAME` | yes | `admin` |
| `ADMIN_PASSWORD_HASH` | yes | bcrypt hash, not the raw password |
| `JWT_SECRET` | yes | Blueprint can auto-generate |
| `BOT_ENCRYPTION_KEY` | yes | Blueprint can auto-generate (32+ chars) |
| `MOCK_MODE` | yes | `false` for a real Minecraft server, `true` to test UI only |
| `DEFAULT_MC_HOST` | for real bots | `play.applemc.fun:25565` (host:port of the MC server) |
| `DEFAULT_MC_VERSION` | yes | `1.20.4` |
| `MC_AUTH_MODE` | usually | `offline` for cracked/offline servers |
| `MC_TARGET_SERVER` | optional | hub `/server` name if the network uses one |
| `OPENAI_API_KEY` | optional | only if you use the AI Control tab |

Generate the password hash on your PC (Node 22):

```bash
cd server
npm install
node scripts/hash-password.js "yourAdminPassword"
```

Paste the printed hash into `ADMIN_PASSWORD_HASH`. Keep the raw password for logging into the dashboard. Never commit `.env`.

You do **not** set `VITE_API_URL` or `VITE_WS_URL` on Render. The UI is built for same-origin `/api` and the same host for WebSockets.

---

## 5. What the build does

`npm run build` on Render:

1. Installs and builds the React app in `client/` (`base` is `/`, not GitHub Pages).
2. Installs the Node API in `server/`.
3. Copies `client/dist` → `server/public`.

`npm start` runs `node src/index.js`. Express then:

- `/health` → JSON (Render health check)
- `/api/*` → login + bot API
- `/socket.io` → live bot updates
- everything else → dashboard (`index.html`)

Open **`https://YOUR-SERVICE.onrender.com/`** — you should see the login screen, not `Cannot GET /`.

`https://YOUR-SERVICE.onrender.com/health` should return:

```json
{ "ok": true, "mock": false, "ui": true }
```

If `ui` is `false`, the client build/copy step failed. Open **Logs** and look for `Copied client/dist -> server/public`.

---

## 6. First login after deploy

1. Wait until the deploy is **Live** (first free-tier build can take several minutes; `better-sqlite3` compiles native code).
2. Open the service URL.
3. Sign in with `ADMIN_USERNAME` and the password you hashed.
4. Add a bot with the Minecraft username (and password if the server needs it).
5. Use the current Minecraft host:port (`DEFAULT_MC_HOST` or the host field on Add Bot).

Free Render services **spin down**. After sleep, the first request is slow, Socket.IO drops, and SQLite on the ephemeral disk can reset. For 24/7 bots, use a paid instance and a persistent disk (`DB_PATH` pointing at the disk mount).

---

## 7. Local check (same as Render)

From the repo root, with Node 22:

```bash
cd server
copy .env.example .env
# fill ADMIN_USERNAME, ADMIN_PASSWORD_HASH, JWT_SECRET, BOT_ENCRYPTION_KEY
npm install
cd ..
npm run build
npm start
```

Then open `http://localhost:4000` — dashboard + API together.

Day-to-day UI work can still use two terminals (`server` + `client` Vite on `:5173`). Vite proxies `/api` and `/socket.io` to `:4000`.

---

## 8. Docker (optional, not Render)

```bash
cp server/.env.example server/.env
docker compose up --build
```

App: `http://localhost:4000`
