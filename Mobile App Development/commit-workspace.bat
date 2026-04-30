@echo off
setlocal EnableExtensions
rem Manual commit for "Mobile App Development" pnpm workspace + nested rr-weather-manager-mobile.
rem Usage:   commit-workspace.bat
rem          commit-workspace.bat your commit message here
rem If no message is given, a default subject is used (same for both repos when both commit).

cd /d "%~dp0" || exit /b 1

set "MSG=%*"
if not defined MSG set "MSG=chore: workspace manual commit"

echo.
echo ========== Mobile App Development (root workspace) ==========
git rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 (
  echo Not a git repository. Skipping root.
  goto :mobile
)

git add -A
git diff --cached --quiet
if errorlevel 1 (
  git commit -m "%MSG%"
  if errorlevel 1 echo Root: git commit failed.
) else (
  echo Root: nothing to commit.
)

:mobile
if not exist "rr-weather-manager-mobile\.git" (
  echo.
  echo rr-weather-manager-mobile: no .git here, skipping nested repo.
  goto :done
)

echo.
echo ========== rr-weather-manager-mobile ==========
pushd "rr-weather-manager-mobile" || goto :done

git add -A
git diff --cached --quiet
if errorlevel 1 (
  git commit -m "%MSG%"
  if errorlevel 1 echo Mobile: git commit failed.
) else (
  echo Mobile: nothing to commit.
)

popd

:done
echo.
echo Done. Open a new terminal if you rely on freshly set environment variables.
endlocal
