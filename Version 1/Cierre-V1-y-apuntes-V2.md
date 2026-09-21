# Cierre de la V1 y apuntes para una V2

Leer esto **antes de tocar código** en una versión 2.

## Estado al cerrar (21/09/2026)

Hecho y en producción operativa:

- App Node + React con login, i18n ES/EN, Excel, caducidades, duplicados de lote, comparación vivo vs foto.
- Stock vivo y foto por **SQL a BC**, no por API REST.
- Fotos y usuarios en Azure SQL `SSF_APP_StockFlow`.
- Código en GitHub `main` (`edae696`) salvo `Cover.jsx` local.
- Pipeline Azure DevOps **STOCK_FLOW** publicado, variables puestas, Run `#20260921.1` verde, foto del 21/09 con 49.368 registros.
- Cron local apagado. El PC puede apagarse; la foto de las 05:00 la hace DevOps.

No hecho / aparcado a propósito:

- Lectura por API de Business Central (se empezó a valorar y se dejó SQL).
- Despliegue de Azure Function `azure-snapshot-job`.
- IaC Stolt (`initiate-project` / `infrastructure/common`): 401, sin acceso a `stolt-bt`.
- Hosting de la **web** 24/7 (la foto sí es 24/7; la UI V1 se abre en el PC con `abrir_stock.bat`).
- Usuarios reales (siguen los demo).
- Ajuste horario de invierno del cron.
- Sustituir `NodeTool@0` por `UseNode@1`.

## Decisiones que no hay que revertir sin acuerdo

1. **SQL, no API BC.** La API v2.0 de BC no trae lote ni almacén. OData/custom serviría para movimientos de Biomasa, no está validada para ILE abierto + Remaining + Kilos + fechas custom. Si V2 pide API, hay que **probar campos** (Open, Remaining Quantity, Lot, Location, Kilos, Fecha despesque/empaque, Expiration) antes de quitar SQL.
2. **Una foto por día, inmutable** si el status es OK.
3. **Sin botones** de refresco manual ni “fotografiar ahora” en la UI.
4. **Almacenes** solo E, G, V3, J, W, Z.
5. **Cajas = Remaining Quantity**, **kg = Kilos**, **lote = número de caja**.
6. Excel de planta Bergondo: **VBA**, no Python.
7. **No** usar el correo / flujo de Power BI como origen.
8. Secretos **nunca** en git ni en Teams. `.env` gitignored. Pipeline: `Keep this value secret` en passwords.

## Cómo retomar (checklist V2)

1. Abrir este directorio `Version 1/` y el repo en `main`.
2. `git status`: no mezclar el `Cover.jsx` de auto-login.
3. Comprobar que el pipeline de ayer/hoy está verde y que **Stock histórico** tiene la fecha.
4. Arrancar con `abrir_stock.bat` y validar vivo vs histórico.
5. Cambiar código en rama nueva (`v2-...`), no reescribir la foto del pipeline a ciegas.
6. Si se cambia `foto-fija.yml`, un Run manual antes de fiarse del cron.

## Ideas / deudas técnicas para V2 (no son bugs de V1)

| Tema | Nota |
|---|---|
| Horario de invierno | Cron `0 3 * * *` UTC = 05:00 en CEST y **04:00** en CET (noviembre–marzo). Valorar dos horarios o `WEBSITE_TIME_ZONE` en Function si se migra. |
| NodeTool deprecado | Cambiar a `UseNode@1` cuando se toque el YAML. |
| `ubuntu-latest` | Aviso GitHub: label migrará a Ubuntu 26 (oct 2026). |
| API BC | Solo si IT/negocio lo exige. Reutilizar OAuth de Biomasa (`TENANT_ID`, `CLIENT_ID`, `CLIENT_SECRET`, `COMPANY_ID`, entorno `Produccion`). No copiar secretos a git. |
| Publicar la web | Hoy la UI es local. Para otros IP hace falta App Service / similar; la foto ya no depende del PC. |
| Function vs pipeline | El pipeline cumple. La Function es plan B si quieren timer nativo Azure. |
| IaC Stolt | Pedir a un colega con acceso `stolt-bt` el clone de Common.Infrastructure si V2 entra en el molde oficial. |
| GitHub público vs ADO privado | El asistente de pipeline avisó. El repo GitHub es el origen; no mezclar secretos. |
| Demo en Cover.jsx | Quitar auto-login antes de cualquier commit. |
| Usuarios | Sustituir seed demo; flujo de solicitud de acceso ya existe. |
| README raíz | Está desactualizado (habla de FastAPI/SQLite). La verdad está en esta carpeta. |
| `pipelines/azure-pipelines.yml` | Esqueleto viejo Python; no usarlo para la foto. |
| Repo colaborador | GitHub `gonzalezgangelica-sudo/stockflow`. |

## Pruebas mínimas si se toca el origen de stock

1. Conteo de líneas vivo ≈ foto (mismo filtro ILE).  
2. Suma de cajas y kg por almacén E/G/V3/J/W/Z.  
3. Un lote conocido: una caja, no duplicado.  
4. Caducidad: un artículo caducado / próximo / correcto.  
5. Run del pipeline y aparición en **Stock histórico**.  
6. Segundo Run el mismo día → SKIPPED, no pisa la foto OK.

## Contacto de contexto (V1)

- Org Azure DevOps: **stolt-ssf** (sí hay acceso).  
- Org **stolt-bt**: no hay acceso con la cuenta usada (ACZ@stolt.com).  
- Credenciales BC SQL locales: si faltan en el `.env` de Stock Flow, se leen del `.env` de Cálculo Biomasa.

## Mensaje de arranque para el agente / la persona que haga V2

> Retoma Stock Flow desde `Version 1/`. La V1 está cerrada el 21/09/2026: SQL a ILE, foto 05:00 por pipeline STOCK_FLOW, datos en `SSF_APP_StockFlow`, código en GitHub `edae696`. No migrar a API BC ni pisar fotos OK sin acuerdo. Secretos solo en `.env` y variables ADO.
