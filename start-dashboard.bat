@echo off
setlocal
set "ROOT=%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Download it from https://nodejs.org
  pause
  exit /b 1
)

if not exist "%ROOT%server\node_modules" (
  echo Installing backend dependencies...
  pushd "%ROOT%server"
  call npm install
  popd
)

if not exist "%ROOT%client\node_modules" (
  echo Installing frontend dependencies...
  pushd "%ROOT%client"
  call npm install
  popd
)

echo Starting Minecraft Bot Dashboard...
start "Minecraft Bot API" /D "%ROOT%server" cmd.exe /k "node src/index.js"
start "Minecraft Bot UI" /D "%ROOT%client" cmd.exe /k "npm run dev -- --host 0.0.0.0"

timeout /t 6 >nul
start "" "http://localhost:5173/"

echo Backend:   http://localhost:4000
echo Dashboard: http://localhost:5173
echo After npm run build at repo root, the dashboard is also at http://localhost:4000
endlocal