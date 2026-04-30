@echo off
setlocal EnableExtensions
cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
  echo [pool-bucket] creating venv...
  py -3 -m venv .venv 2>nul
  if errorlevel 1 python -m venv .venv
  if errorlevel 1 (
    echo Python not found. Install Python 3.10+ and retry.
    pause
    exit /b 1
  )
  call ".venv\Scripts\pip.exe" install -r requirements.txt
  if errorlevel 1 (
    echo pip install failed.
    pause
    exit /b 1
  )
)

if not exist ".env" (
  echo [pool-bucket] missing .env — copy from pool-matcher-bot or .env.example
  pause
  exit /b 1
)

echo [pool-bucket] starting...
call ".venv\Scripts\python.exe" main.py
set "EC=%ERRORLEVEL%"
echo.
echo [pool-bucket] exit code %EC%
pause
exit /b %EC%
