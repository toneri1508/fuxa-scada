@echo off
cd /d "%~dp0"
set "PY32=C:\Users\thyhs\AppData\Local\Programs\Python\Python312-32\python.exe"

start "FUXA Server" cmd /k "cd /d %~dp0 && node server.js"
timeout /t 3 /nobreak >nul
start "MC Bridge" cmd /k "cd /d %~dp0 && "%PY32%" mc_bridge.py"
exit