# Deployment

This repository supports a separate backend plus frontend deployment on most hosting providers.

## Render Blueprint

Use **New > Blueprint** and select this repository. Render reads `render.yaml` and creates:

- `pgnr-backend`: Node Web Service from `server`

Render Blueprints do not create the frontend static site in this setup. Deploy
the frontend with the GitHub Pages workflow, or create a Render Static Site
manually with root directory `client`, build command `npm install && npm run
build`, and publish directory `dist`.

After the backend is created, set `DEFAULT_MC_HOST` to the current Minecraft address and port. For AppleMC:

```env
DEFAULT_MC_HOST=play.applemc.fun:25565
MC_TARGET_SERVER=
MOCK_MODE=false
```

Set the frontend variables after Render gives you the backend URL:

```env
VITE_API_URL=https://YOUR-BACKEND.onrender.com/api
VITE_WS_URL=https://YOUR-BACKEND.onrender.com
```

Redeploy the frontend after changing Vite variables because they are embedded during the build.

## Docker on Any Host

The backend and frontend can run separately with Docker Compose:

```bash
cp server/.env.example server/.env
# Fill server/.env with real secrets and server settings
docker compose up -d --build
```

The local URLs are:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:4000`

For a remote frontend container, override the client build arguments:

```bash
docker compose build \
  --build-arg VITE_API_URL=https://api.example.com/api \
  --build-arg VITE_WS_URL=https://api.example.com
```

Then start the services:

```bash
docker compose up -d
```

The backend requires Node 22 because it uses the native `better-sqlite3` package. Keep `server/.env`, SQLite files, logs, and passwords out of Git. They are already covered by `.gitignore`.

Docker stores SQLite at `/data/data.sqlite` through the named `bot-data` volume. On hosts with a persistent disk, set `DB_PATH` to a file inside that disk, such as `/var/data/data.sqlite`.

## Other Platforms

For Railway, Fly.io, Render Web Services, or a VPS, deploy `server` as a Node service:

```bash
npm install
npm run start
```

Deploy `client` as a static site:

```bash
npm install
npm run build
```

Publish the `client/dist` directory and set `VITE_API_URL` and `VITE_WS_URL` to the public backend URL before building.

Free hosting plans may sleep, disconnect Socket.IO, or use temporary storage. A persistent always-on service is required for reliable 24/7 bots and SQLite data.
