@echo off
setlocal
set "ROOT=%~dp0"

echo Building full-stack app for repo-root deployment...
call npx --yes -p node@22 -p npm@10 npm install --prefix server
call npx --yes -p node@22 -p npm@10 npm install --prefix client
call npx --yes -p node@22 -p npm@10 npm run build

echo Starting full app at http://localhost:4000
start "Minecraft Bot Full App" cmd.exe /k "cd /d "%ROOT%" && npx --yes -p node@22 -p npm@10 npm start"

timeout /t 5 >nul
start "" "http://localhost:4000/"

echo Done.
endlocal
