# Operación — V1

Las contraseñas **no van en este documento**. Están en el `.env` local (fuera de git) y en las variables secretas del pipeline.

## Arrancar la app en el PC

Desde la raíz del repo:

```powershell
.\abrir_stock.bat
```

O, si ya está compilado el frontend:

```powershell
.\iniciar_stock.bat
```

Abre http://127.0.0.1:8000

Node portable esperado: `%LOCALAPPDATA%\nodejs-lts\node.exe`

El cron local **no** debe estar a 1. Si `SNAPSHOT_LOCAL_CRON=1`, el PC duplicaría la foto de las 05:00.

## Publicar / actualizar código

```powershell
git push origin main
```

Remoto: `https://github.com/gonzalezgangelica-sudo/stockflow.git`

No subir `.env` ni `Cover.jsx` con auto-login.

Tras un push a `main`, el YAML del pipeline ya está; **no** hace falta recrear el pipeline. El schedule apunta a `main` con `always: true` (corre aunque no haya commits ese día).

## Pipeline foto fija

- Org: `stolt-ssf`  
- Proyecto: `STOCK_FLOW`  
- Archivo: `yaml-pipelines/foto-fija.yml`  
- Cron UTC: `0 3 * * *` → **05:00 Europe/Madrid en horario de verano (CEST)**  
- Agente: `ubuntu-latest`  
- Pasos: Node 22 → `npm ci` → `node src/snapshot-job.js` (carpeta `server`)

Trigger de CI: **ninguno**. Solo horario + Run manual.

### Variables del pipeline (nombres exactos)

| Name | Secret | Contenido |
|---|---|---|
| `APP_SQL_SERVER` | no | servidor Azure SQL de la app |
| `APP_SQL_DATABASE` | no | `SSF_APP_StockFlow` |
| `APP_SQL_USER` | no | usuario SQL de la app |
| `APP_SQL_PASSWORD` | sí | contraseña SQL de la app |
| `BC_SERVER` | no | servidor SQL de BC |
| `BC_DATABASE` | sí o no | base SQL de BC (`bitmap-ssfprod-QLSRVPDE-sqldb`) |
| `BC_USER` | no | usuario SQL de BC |
| `BC_PASSWORD` | sí | contraseña SQL de BC |

Valores de servidor / usuario de cierre V1 (no son secretos de aplicación web):

- App SQL server: `bitmap-ssfprod-sqlsvr-01.database.windows.net`  
- App SQL database: `SSF_APP_StockFlow`  
- App / BC user: `bitmap-ssfprod-dbsvc-01`  
- BC database: `bitmap-ssfprod-QLSRVPDE-sqldb`  
- BC server: el mismo host Azure SQL  

### Cómo forzar una foto ahora

En DevOps: pipeline → **Run new** → rama `main`.

Comprobar el log del paso **Guardar foto fija en Azure SQL**:

- `Foto fija OK: YYYY-MM-DD … · N registros` → bien  
- `SKIPPED` / “Ya existe fotografia de hoy” → ese día ya tenía foto OK  
- rojo → falló BC o Azure SQL; no se guarda foto buena

Luego: app → **Stock histórico**.

## Comprobar salud

`GET http://127.0.0.1:8000/api/health`

Debe decir `storage: azure-sql` y `bc_configured: true` si hay `BC_SERVER`.

## Avisos del pipeline que se pueden ignorar (V1)

- Migración de `ubuntu-latest` a Ubuntu 26 (octubre 2026)  
- `NodeTool@0` deprecado (sustituto: `UseNode@1`)  

No impiden la foto.

## Qué no hace falta para operar V1

- Clonar `Shared-infrastructure` / `Common.Infrastructure`  
- Publicar Azure Function  
- Tarea programada de Windows / servicio Windows (`instalar_servicio_stock.bat` se canceló; no es el camino)  
- API OAuth de BC (`CLIENT_ID` / `CLIENT_SECRET` de Biomasa)  
- Rellenar el correo de Power BI  
