@echo off
setlocal
set "ROOT=%~dp0"

where npx >nul 2>nul
if errorlevel 1 (
  echo npx not found. Install Node.js 22 from https://nodejs.org
  pause
  exit /b 1
)

echo Installing dependencies with Node 22...
if not exist "%ROOT%server\node_modules" (
  pushd "%ROOT%"
  call npx --yes -p node@22 -p npm@10 npm install --prefix server
  popd
)

if not exist "%ROOT%client\node_modules" (
  pushd "%ROOT%"
  call npx --yes -p node@22 -p npm@10 npm install --prefix client
  popd
)

echo Starting Minecraft Bot Dashboard...
start "Minecraft Bot API" cmd.exe /k "cd /d "%ROOT%" && npx --yes -p node@22 -p npm@10 npm --prefix server run start"
start "Minecraft Bot UI" cmd.exe /k "cd /d "%ROOT%" && npx --yes -p node@22 -p npm@10 npm --prefix client run dev -- --host 0.0.0.0"

timeout /t 8 >nul
start "" "http://localhost:5173/"

echo Backend:   http://localhost:4000
echo Dashboard: http://localhost:5173
echo Full built app: http://localhost:4000
echo Use repo-root build + start if you want the same host as Render.
endlocal