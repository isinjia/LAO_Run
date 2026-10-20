@echo off
rem ORCA RUN - starts the local server and opens the game in Chrome (double-click to play)
rem (ASCII only on purpose: non-ASCII text inside a .bat breaks cmd's line parsing)
cd /d "%~dp0"
set PORT=8770
set URL=http://localhost:%PORT%/

where python >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Python not found. Install it from https://www.python.org and run this again.
  pause
  exit /b 1
)

rem start the server in its own minimized window unless one is already running (close that window to stop it)
netstat -ano | findstr /r /c:"127.0.0.1:%PORT% .*LISTENING" >nul
if errorlevel 1 (
  start "ORCA RUN server" /min python tools\serve.py %PORT%
  ping -n 3 127.0.0.1 >nul
)

set CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe
if not exist "%CHROME%" set CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe
if not exist "%CHROME%" set CHROME=%LocalAppData%\Google\Chrome\Application\chrome.exe
if exist "%CHROME%" (
  start "" "%CHROME%" --new-window "%URL%"
) else (
  echo Chrome not found: opening the default browser.
  start "" "%URL%"
)
