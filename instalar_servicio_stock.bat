@echo off
REM Ejecutar UNA VEZ como Administrador. Instala Stock Flow para que la foto
REM de las 05:00 se haga aunque se cierre la sesion (el PC debe seguir encendido).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0instalar_servicio_stock.ps1"
pause
