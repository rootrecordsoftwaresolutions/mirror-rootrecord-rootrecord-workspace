@echo off
setlocal EnableExtensions
set "REPO=%~dp0solana\solanasite"
cd /d "%REPO%" 2>nul
if not exist ".git" (
  echo Push_It.bat: no .git found at:
  echo   %REPO%
  echo Fix the path in this script if your repo moved.
  pause
  exit /b 1
)

echo [%CD%]
git status -sb
echo.

REM Optional: commit everything first — pass the whole message after the script name, e.g.:
REM   Push_It.bat "Fix OTC history"
if not "%~1"=="" (
  echo --- git add -A ^&^& git commit ---
  git add -A
  git commit -m "%*"
  if errorlevel 1 (
    echo Commit failed or nothing to commit. Fix errors above, then run again.
    pause
    exit /b 1
  )
  echo.
)

git status --porcelain | findstr /r "." >nul
if not errorlevel 1 (
  echo WARNING: Uncommitted or untracked changes remain in the working tree.
  echo   git push only uploads commits. Save work with:  git add -A  then  git commit -m "message"
  echo   Or run:  Push_It.bat "your commit message"  to add+commit+push in one step.
  echo.
)

git status -sb | findstr /C:"ahead" >nul
if errorlevel 1 (
  echo No local commits ahead of origin — push will say everything up-to-date.
  echo That is normal if you have not committed yet ^(see WARNING above^).
  echo.
)

echo --- git push ---
git push
set "ERR=%ERRORLEVEL%"
echo.
if not "%ERR%"=="0" (
  echo Push finished with errorlevel %ERR%.
  pause
  exit /b %ERR%
)
echo Push OK.
timeout /t 2 >nul
