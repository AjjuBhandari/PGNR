@echo off
setlocal

taskkill /FI "WINDOWTITLE eq Minecraft Bot API" /T /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq Minecraft Bot UI" /T /F >nul 2>&1

powershell.exe -NoProfile -Command "$procs = Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'src/index.js|vite|mc-bot-dashboard' }; foreach ($p in $procs) { try { Stop-Process -Id $p.ProcessId -Force } catch {} }"

echo Dashboard stopped.
echo Logs stayed in: "%~dp0logs"
endlocal
exit /b 0
