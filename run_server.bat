@echo off
chcp 65001 >nul
rem Orca Run - local server (double-click to run)
rem   run_server.bat          -> http://localhost:8770
rem   run_server.bat 9000     -> another port
cd /d "%~dp0"

set PORT=%1
if "%PORT%"=="" set PORT=8770
set URL=http://localhost:%PORT%/index.html

where python >nul 2>nul
if errorlevel 1 (
  echo [오류] Python을 찾을 수 없습니다. https://www.python.org 에서 설치한 뒤 다시 실행하세요.
  pause
  exit /b 1
)

rem a server already listening on this port: just open the game
netstat -ano | findstr /r /c:"127.0.0.1:%PORT% .*LISTENING" >nul
if not errorlevel 1 (
  echo 서버가 이미 실행 중입니다: %URL%
  if not "%NOBROWSER%"=="1" start "" "%URL%"
  exit /b 0
)

echo 서버 시작: %URL%
echo 이 창을 닫으면 서버가 종료됩니다.
rem open the browser two seconds later, once the server is up
if not "%NOBROWSER%"=="1" start "" /min cmd /c "timeout /t 2 /nobreak >nul & start "" %URL%"
python tools\serve.py %PORT%
pause
