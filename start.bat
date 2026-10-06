@echo off
REM Catalyst - one-click launcher (backend :3000 + frontend :3001)
title Catalyst Launcher
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js not found. Install Node 20+ from https://nodejs.org then re-run.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo [1/4] Installing backend dependencies...
  call npm install
) else (
  echo [1/4] Backend dependencies OK.
)

if not exist ".env" (
  echo [2/4] Creating .env from .env.example - offline mode works without a key...
  copy /y ".env.example" ".env" >nul
) else (
  echo [2/4] .env OK.
)

if not exist "catalyst-frontend\node_modules" (
  echo [3/4] Installing frontend dependencies...
  pushd "catalyst-frontend"
  call npm install
  popd
) else (
  echo [3/4] Frontend dependencies OK.
)

echo [4/4] Starting servers...
start "Catalyst Backend" /d "%~dp0" cmd /k npm run dev
timeout /t 4 /nobreak >nul
start "Catalyst Frontend" /d "%~dp0catalyst-frontend" cmd /k npm run dev

echo.
echo Waiting for servers to boot, then opening browser...
timeout /t 8 /nobreak >nul
start "" "http://localhost:3001"
timeout /t 1 /nobreak >nul
start "" "http://localhost:3000/api/health"

echo.
echo ===============================================
echo  Catalyst is starting!
echo  UI:      http://localhost:3001
echo  API:     http://localhost:3000/api/health
echo  No API key? Offline Python 2-^>3 demo works.
echo  Close the two server windows to stop.
echo ===============================================
pause
