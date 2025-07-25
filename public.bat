@echo off
REM Change directory to script folder
cd /d "%~dp0"

REM Run the daily-generator.js with Node.js
"C:\Program Files\nodejs\node.exe" public-server.js

REM End of script