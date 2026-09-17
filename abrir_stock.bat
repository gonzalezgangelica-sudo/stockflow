@echo off
cd /d "%~dp0"
set NODE=%LOCALAPPDATA%\nodejs-lts\node.exe
set NPM=%LOCALAPPDATA%\nodejs-lts\npm.cmd
if not exist "%NODE%" (
  echo Node portable no encontrado en %LOCALAPPDATA%\nodejs-lts
  exit /b 1
)
if not exist data mkdir data
echo Instalando dependencias...
call "%NPM%" --prefix server install
call "%NPM%" --prefix frontend install
echo Compilando frontend...
call "%NPM%" --prefix frontend run build
echo Abriendo Stock Flow
start "" http://127.0.0.1:8000
"%NODE%" --experimental-sqlite server\src\index.js
