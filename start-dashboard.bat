@echo off
setlocal

set "ROOT=%~dp0"

echo Starting Minecraft Bot Dashboard...
powershell.exe -NoProfile -Command "try { $null = Invoke-WebRequest -UseBasicParsing http://localhost:4000/health -TimeoutSec 2; exit 0 } catch { exit 1 }"
if errorlevel 1 start "Minecraft Bot API" /D "%ROOT%server" cmd.exe /k "npx -y -p node@22 node src/index.js"

powershell.exe -NoProfile -Command "try { $null = Invoke-WebRequest -UseBasicParsing http://localhost:5173/ -TimeoutSec 2; exit 0 } catch { exit 1 }"
if errorlevel 1 start "Minecraft Bot UI" /D "%ROOT%client" cmd.exe /k "npm run dev -- --host 0.0.0.0"

start "" "http://localhost:5173/"

echo Backend: http://localhost:4000
echo Dashboard: http://localhost:5173
endlocal