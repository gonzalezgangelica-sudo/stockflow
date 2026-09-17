@echo off
cd /d "%~dp0"
set NODE=%LOCALAPPDATA%\nodejs-lts\node.exe
if not exist "%NODE%" (
  echo Node portable no encontrado en %LOCALAPPDATA%\nodejs-lts
  exit /b 1
)
if not exist data mkdir data

netstat -ano | findstr ":8000" | findstr "LISTENING" >nul
if %ERRORLEVEL%==0 (
  echo Stock Flow ya esta en marcha en el puerto 8000
  exit /b 0
)

echo Arrancando Stock Flow (foto fija 05:00)...
start "Stock Flow" /MIN "%NODE%" --experimental-sqlite "%~dp0server\src\index.js"
exit /b 0
