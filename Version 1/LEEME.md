# Stock Flow — Versión 1

**Fecha de cierre:** 21 de septiembre de 2026  
**Cliente / planta:** Stolt Sea Farm — Bergondo  
**Producto:** Stock Flow (stock vivo + fotografía fija 05:00)

Este directorio es el **punto de partida** si hay que hacer una versión 2. No cambia código: describe lo que quedó hecho, dónde vive y qué no tocar sin querer.

Empieza por aquí, en este orden:

1. Este archivo (`LEEME.md`)
2. `Producto-y-reglas.md`
3. `Arquitectura.md`
4. `Operacion.md`
5. `Cierre-V1-y-apuntes-V2.md`

## Qué es la V1, en una frase

Web interna que compara el **stock vivo de Business Central** (consulta SQL a Item Ledger Entry) con una **foto inmutable diaria a las 05:00 Europe/Madrid**, guardada en Azure SQL. El PC no tiene que estar encendido: la foto la lanza un pipeline de Azure DevOps.

## Dónde está el código y el runtime

| Sitio | Valor |
|---|---|
| Código local | `C:\Users\ACZ\Downloads\Proyectos\stock` |
| GitHub | https://github.com/gonzalezgangelica-sudo/stockflow |
| Rama | `main` |
| Commit de cierre V1 | `edae696` — *Add Azure DevOps pipeline to save the 05:00 stock snapshot.* |
| Azure DevOps | https://dev.azure.com/stolt-ssf/ → proyecto **STOCK_FLOW** |
| Pipeline diario | YAML `yaml-pipelines/foto-fija.yml` |
| Primera ejecución OK | run `#20260921.1` (21/09/2026), job verde |
| App en local | http://127.0.0.1:8000 |
| Base de la app | Azure SQL `SSF_APP_StockFlow` |
| Origen BC | SQL Server `bitmap-ssfprod-QLSRVPDE-sqldb` (tabla `bc.[Item Ledger Entry]`) |

## Fotos ya guardadas al cerrar V1

| Id | Fecha | Hora (Europe/Madrid en UI; en SQL puede verse UTC) | Estado | Registros | Cómo se tomó |
|---|---|---|---|---|---|
| 1 | 2026-09-18 | 08:39:09 | OK | 51.087 | Manual (`POST /api/snapshots/run`) |
| 2 | 2026-09-21 | 12:29:50 UTC ≈ 14:29 Madrid | OK | 49.368 | Pipeline DevOps (Run manual) |

No hay fotos del 19 ni del 20: el job 05:00 aún no estaba publicado.

## Lo que la V1 no es

- No consulta Business Central por **API REST**. Se dejó en SQL a propósito.
- No usa Power BI ni el correo de Power BI.
- El Excel de Bergondo sigue siendo **VBA**, no Python.
- La Azure Function de `azure-snapshot-job/` existe en el repo pero **no está desplegada**. La foto diaria real es el pipeline de DevOps.
- `infrastructure/common` (plantilla Stolt) **no se pudo clonar**: la cuenta no tiene acceso a `stolt-bt`. No hace falta para operar la V1.

## Cambio local que no forma parte de la V1 publicada

`frontend/src/Cover.jsx` puede tener login automático de demo (`?auto=1`). **No está en GitHub** y no debe subirse: incluye credenciales de demostración en el código.
