# Arquitectura — V1

## Piezas

```
Navegador (React / MUI)
        │  HTTP  /api/...
        ▼
Express  (server/, puerto 8000)
        │
        ├── SQL BC          → stock vivo (bc.[Item Ledger Entry])
        └── Azure SQL       → fotos, usuarios, logs (SSF_APP_StockFlow)

Azure DevOps pipeline 05:00
        │
        ├── SQL BC          → misma consulta ILE
        └── Azure SQL       → INSERT foto del día
```

La **API de Stock Flow** es nuestra (Node). **No** es la API REST de Business Central.

## Carpetas que importan

| Ruta | Rol en V1 |
|---|---|
| `frontend/` | UI React (Vite). Se sirve compilada desde Express (`frontend/dist`) |
| `server/src/` | API, dominio, job de foto, auth, Azure SQL |
| `server/src/bc.js` | Consulta SQL de stock vivo |
| `server/src/snapshot-job.js` | Job: leer ILE + guardar foto |
| `server/src/store.js` | Persistencia Azure SQL |
| `server/src/domain.js` | Semáforo, KPIs, duplicados, comparación |
| `sql/stockflow_schema.sql` | Tablas de la app |
| `yaml-pipelines/foto-fija.yml` | Pipeline real de las 05:00 |
| `azure-snapshot-job/` | Function App de respaldo — **no desplegada** |
| `pipelines/azure-pipelines.yml` | Restos de un esqueleto Python/Bicep — **no es el job diario** |
| `web/` | UI estática antigua — no es la app actual |
| `.env` | Secretos locales (gitignored) |
| `Version 1/` | Esta documentación |

## Cómo se lee el stock vivo

`fetchLiveStock()` en `server/src/bc.js`:

1. Pool `mssql` a `BC_SERVER` / `BC_DATABASE` / `BC_USER` / `BC_PASSWORD`.
2. Query `SQL_LIVE` sobre `bc.[Item Ledger Entry]`.
3. Mapeo: `boxes` = remaining, `kg` = Kilos.

El frontend llama `GET /api/stock/live` cada 5 minutos. El servidor cachea **60 segundos**.

Si BC no responde, el dashboard puede caer a la última foto OK.

## Cómo se guarda la foto

`runDailySnapshot()`:

1. `initStore()` (esquema + seed).
2. `fetchLiveStock()`.
3. `saveSnapshot(fecha, hora, filas)`.
4. Una fila en `stock_snapshot`, líneas en `stock_snapshot_line`, resúmenes por almacén en `stock_snapshot_warehouse`.

Una foto OK por `snapshot_date` (constraint único). Sin `replace`, si ya hay OK ese día → skip.

## Tablas Azure SQL (`SSF_APP_StockFlow`)

Definidas en `sql/stockflow_schema.sql`:

- `warehouse` — E, G, V3, J, W, Z  
- `app_config` — hora foto, días aviso, almacenes activos  
- `stock_snapshot` — cabecera diaria  
- `stock_snapshot_line` — detalle ILE de esa foto  
- `stock_snapshot_warehouse` — KPIs por almacén de esa foto  
- `execution_log`  
- `app_user` / `app_session` / `access_request`  

El stock vivo **no** se persiste.

## Configuración

`server/src/config.js` carga:

1. `.env` del repo Stock Flow  
2. Luego el `.env` de Biomasa (`C:/Users/ACZ/.codex/CALCULO_BIOMASA/.env`) si faltan `BC_*`  
3. Otra vez el `.env` del repo (el local gana)

Variables de app: `APP_SQL_*`  
Variables de BC SQL: `BC_SERVER`, `BC_DATABASE`, `BC_USER`, `BC_PASSWORD`  
Zona horaria: `TIMEZONE=Europe/Madrid`  
Puerto: `8000`  
Cron local: `SNAPSHOT_LOCAL_CRON` (por defecto **apagado**; la foto la hace DevOps)

## Auth

- Hash: scrypt  
- Token de sesión en `app_session`  
- Admin: usuarios, solicitudes de acceso, `POST /api/snapshots/run`  
- Job remoto opcional: `POST /api/snapshots/job` con cabecera `x-job-key` = `SNAPSHOT_JOB_KEY` (no es el mecanismo diario de V1)

## Endpoints útiles

Públicos: `GET /api/health`, `POST /api/auth/login`, `POST /api/auth/request`, `POST /api/snapshots/job` (con clave).

Con sesión: `/dashboard`, `/stock/live`, `/snapshots`, `/compare`, `/evolution`, `/analysis/duplicates`, `/expiry`, `/logs`, Excel vía frontend.

## Dependencias runtime

- Node 22 (pipeline y portable local en `%LOCALAPPDATA%\nodejs-lts`)  
- `mssql`, `express`, `dotenv`, `cors`, `node-cron`  
- Frontend: React + MUI + Vite  

No hay Python en el camino feliz de la V1.
