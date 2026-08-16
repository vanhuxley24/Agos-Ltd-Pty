@echo off
title Agos Local ERP - Setup & Start
color 0B
echo ===================================================
echo     Agos Local ERP - Local Automated Setup
echo ===================================================
echo.

:: Check if Node is installed
node -v >nul 2>&1
if %errorlevel% neq 0 (
    color 0C
    echo ERROR: Node.js was not found on your system.
    echo Node.js is required to run this application.
    echo.
    echo We are opening nodejs.org in your browser so you can download it.
    echo Please download and install the LTS version, then try again.
    echo.
    pause
    start https://nodejs.org/
    exit /b
)

echo Check status: Node.js is installed.
echo.
echo Installing dependencies (this can take a minute, please wait)...
call npm install
if %errorlevel% neq 0 (
    color 0C
    echo.
    echo ERROR: Dependency installation failed.
    echo Please check your internet connection and try again.
    pause
    exit /b
)

echo.
echo Creating Desktop Shortcut...
set DESKTOP_PATH=%USERPROFILE%\Desktop
if exist "%DESKTOP_PATH%" (
    echo [InternetShortcut] > "%DESKTOP_PATH%\Agos Local ERP.url"
    echo URL=http://localhost:3000 >> "%DESKTOP_PATH%\Agos Local ERP.url"
    echo IconIndex=0 >> "%DESKTOP_PATH%\Agos Local ERP.url"
    echo IconFile=C:\Windows\System32\shell32.dll >> "%DESKTOP_PATH%\Agos Local ERP.url"
    echo.
    echo SUCCESS: Created shortcut 'Agos Local ERP' on your Desktop!
) else (
    echo [INFO] Could not locate user Desktop path to place shortcut.
)

echo.
echo Starting the Local Server...
echo The app will open in your browser automatically shortly.
start http://localhost:3000

call npm run dev
pause
