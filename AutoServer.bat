@echo off
title FUXA Server
cd /d "%~dp0"

REM Mo trinh duyet sau 3 giay (chay song song voi node)
start "" /b cmd /c "timeout /t 3 /nobreak >nul && start "" http://localhost:8080"

node server.js
pause