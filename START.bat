@echo off
title Telecom Test Platform
color 0A

echo ================================================
echo   Telecom Test Platform - Auto Start
echo ================================================
echo.

:: Use the folder where this bat file lives
set APP_DIR=%~dp0
set BACKEND_DIR=%APP_DIR%backend
set ADB_PATH=C:\Users\iskan\platform-tools-latest-windows\platform-tools

:: Add ADB to PATH
set PATH=%ADB_PATH%;%PATH%

:: Check if .env exists
if not exist "%BACKEND_DIR%\.env" (
    echo ERROR: .env file not found at %BACKEND_DIR%\.env
    echo Please create it with your database credentials.
    pause
    exit /b 1
)

:: Install node_modules if missing
if not exist "%BACKEND_DIR%\node_modules" (
    echo Installing dependencies - please wait...
    cd /d "%BACKEND_DIR%"
    call npm install
    call npm approve-scripts bcrypt 2>nul
    call node scripts/migrate.js
    echo.
)

:: Copy APK if available
if exist "C:\Users\iskan\TelecomTestPlatform\app-debug.apk" (
    copy /Y "C:\Users\iskan\TelecomTestPlatform\app-debug.apk" "%BACKEND_DIR%\app-debug.apk" >nul 2>&1
)

:: Open browser after delay
start /min cmd /c "timeout /t 4 >nul && start http://localhost:4000"

echo Server starting at http://localhost:4000
echo.
echo TIP: Go to Admin Panel ^> System to pull updates from GitHub
echo Press Ctrl+C to stop the server
echo.

cd /d "%BACKEND_DIR%"
npm run dev
