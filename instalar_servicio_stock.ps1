$ErrorActionPreference = "Stop"
$root = "C:\Users\ACZ\Downloads\Proyectos\stock"
$bat = Join-Path $root "servicio_stock.bat"
$node = "C:\Users\ACZ\AppData\Local\nodejs-lts\node.exe"

if (-not (Test-Path $node)) { throw "No se encontro Node: $node" }
if (-not (Test-Path $bat)) { throw "No se encontro $bat" }

$action = New-ScheduledTaskAction -Execute $bat -WorkingDirectory $root
$start = New-ScheduledTaskTrigger -AtStartup
$daily = New-ScheduledTaskTrigger -Daily -At "04:50"
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -DontStopOnIdleEnd `
  -StartWhenAvailable `
  -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -RestartCount 3 `
  -RestartInterval (New-TimeSpan -Minutes 1)
$principal = New-ScheduledTaskPrincipal -UserId "NT AUTHORITY\SYSTEM" -LogonType ServiceAccount -RunLevel Highest

Register-ScheduledTask -TaskName "StockFlow-servicio" -Action $action -Trigger @($start, $daily) -Settings $settings -Principal $principal -Force | Out-Null

Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue |
  Select-Object -ExpandProperty OwningProcess -Unique |
  ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 2

Start-ScheduledTask -TaskName "StockFlow-servicio"
Start-Sleep -Seconds 5

$listen = Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue
if (-not $listen) { throw "La tarea se creo pero el puerto 8000 no esta en escucha. Mira data\stockflow.log" }

Write-Host "Stock Flow instalado como servicio de Windows (SYSTEM)."
Write-Host "Puedes cerrar sesion. No apagues el PC. Foto fija a las 05:00."
Write-Host "URL: http://127.0.0.1:8000  /  http://192.168.140.144:8000"
