@echo off
title Team Schedule Dashboard
echo Starting dashboard on http://localhost:8089 ...
echo.

REM Try Python 3 first
python --version >nul 2>&1
if %errorlevel% == 0 (
    start "" http://localhost:8089/dashboard.html
    python -m http.server 8089
    goto :end
)

REM Try py launcher
py --version >nul 2>&1
if %errorlevel% == 0 (
    start "" http://localhost:8089/dashboard.html
    py -m http.server 8089
    goto :end
)

REM Fallback: Node.js http-server
npx --yes http-server . -p 8089 --cors -o /dashboard.html
if %errorlevel% == 0 goto :end

echo.
echo ERROR: Python and Node.js not found. Please install Python from https://python.org
pause

:end
