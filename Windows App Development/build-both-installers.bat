@echo off
setlocal EnableExtensions
set "ROOT=%~dp0"
echo Building installers for both Windows apps...
echo.

call "%ROOT%apps\root-record-business-manager\Build-Installer.bat"
if errorlevel 1 exit /b %ERRORLEVEL%

echo.
echo ---------------------------------------------------------------------------
echo.

call "%ROOT%apps\root-record-weather-manager\Build-Installer.bat"
if errorlevel 1 exit /b %ERRORLEVEL%

echo.
echo All installer build steps finished successfully.
exit /b 0
