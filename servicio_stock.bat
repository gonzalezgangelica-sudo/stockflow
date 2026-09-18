@echo off
REM Arranque en primer plano para tarea de Windows (sobrevive al cierre de sesion).
set NODE=C:\Users\ACZ\AppData\Local\nodejs-lts\node.exe
set ROOT=C:\Users\ACZ\Downloads\Proyectos\stock
cd /d "%ROOT%"
if not exist "%ROOT%\data" mkdir "%ROOT%\data"
echo [%DATE% %TIME%] Arranque Stock Flow >> "%ROOT%\data\stockflow.log"
"%NODE%" --experimental-sqlite "%ROOT%\server\src\index.js" >> "%ROOT%\data\stockflow.log" 2>&1
