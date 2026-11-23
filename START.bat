@echo off
setlocal
cd /d "%~dp0"
echo ==========================================
echo       THE INDIANI WAY - CLIENT TEST
echo ==========================================
echo Starting local website server...
echo Keep this window open while testing.
echo To stop the server, close this window.
echo.
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0local-server.ps1"
if errorlevel 1 (
  echo.
  echo The local server could not start.
  echo Please contact the project developer.
  pause
)
endlocal
