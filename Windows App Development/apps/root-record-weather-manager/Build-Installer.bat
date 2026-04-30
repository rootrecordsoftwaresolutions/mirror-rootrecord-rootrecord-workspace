@echo off
setlocal EnableExtensions
cd /d "%~dp0"
echo Root Record Weather Manager — repacking app.asar version then NSIS installer...
echo Working directory: %CD%
call npm run build:installer
set ERR=%ERRORLEVEL%
if %ERR% neq 0 (
  echo Failed with exit code %ERR%.
  exit /b %ERR%
)
echo.
echo Output: dist\Root.Record.Weather.Manager-Setup-*.exe
exit /b 0
