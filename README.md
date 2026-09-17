# Stock — gestión y análisis

Aplicación web (MVP) para **stock histórico (fotografía 05:00)** y **stock vivo** desde Business Central `bc.[Item Ledger Entry]`.

## Cómo arrancar

```powershell
cd C:\Users\ACZ\Downloads\Proyectos\stock
.\abrir_stock.bat
```

Abre http://127.0.0.1:8000

Credenciales BC: `.env` del proyecto o `CALCULO_BIOMASA\.env`. Si no hay SQL, se usa modo demo.

## Arquitectura

| Capa | Tecnología |
|------|------------|
| Visual | HTML/JS estático servido por FastAPI (`web/`) |
| API / negocio | FastAPI (`backend/app`) |
| Histórico | SQLite local (`data/stock_app.db`), intercambiable por SQL Server vía `STOCK_DATABASE_URL` |
| Origen vivo | SQL Server BC, `Open=1` y `Remaining Quantity=1` (1 línea = 1 caja, kg = `Kilos`) |
| Job 05:00 | APScheduler (`Europe/Madrid`). En Azure: Function App timer + `POST /api/snapshots/run` |
| Auth (siguiente) | Entra ID / App Service Easy Auth. MVP interno sin login |
| IaC | `infrastructure/main.bicep` + `pipelines/azure-pipelines.yml` |

Flujo: BC ILE → `fetch_live_stock` → (05:00) `stock_snapshot` inmutable → dashboard / evolución / caducidad / comparación.

Las fotografías OK de un día **no se sobrescriben**.

---

# Stock — Item Ledger Entry (Excel)


Informe Excel (`.xlsm`) de stock y caducidad **solo** desde `bc.[Item Ledger Entry]`.

## Filtro (obligatorio)

- `Open = 1`
- `Remaining Quantity = 1` → **Cajas pendientes = 1**

No se usa Inventory ni otra tabla. `Stock disponible` = campo `Kilos` de la misma linea ILE.

## Libro: `Reports/Stock_caducidad.xlsm`

| Hoja | Contenido |
|------|-----------|
| **Resumen** | Vista global, conteos por estado y por almacen, boton **Actualizar** |
| **Pivot** | Tabla dinamica con **Almacen** como filtro de informe |
| **Todos** | Detalle completo (filtrable) |
| **Alm X** | Una pestana por almacen (solo su stock) |
| Parametros | Conexion BC SQL |
| Query | SQL embebida (`Query!B2`) |

### Columnas

Almacen, Item, Producto, Stock disponible (kg), Fecha despesque, Fecha empaque, Fecha caducidad, Cajas pendientes, Dias restantes, Estado caducidad.

### Alertas

| Estado | Criterio |
|--------|----------|
| Caducado | caducidad &lt; hoy |
| Proximo a caducar | 0–7 dias |
| En seguimiento | 8–15 dias |
| Correcto | mas de 15 dias |

## Actualizar

1. Abre `Reports/Stock_caducidad.xlsm`
2. Pulsa **Actualizar** en **Resumen**
3. La macro consulta ILE, recalcula dias/estado, refresca Resumen / Todos / Alm X / Pivot

## Crear o regenerar el libro

Credenciales desde `.env` del proyecto o `CALCULO_BIOMASA\.env`.

```powershell
cd C:\Users\ACZ\Downloads\Proyectos\stock
pip install -r requirements.txt
python crear_informe_stock.py
```

Requiere Excel instalado y acceso al proyecto VBA (`AccessVBOM`).

## Alternativa sin macro

`python generar_excel_stock.py` → `Reports/stock_ile_YYYYMMDD.xlsx` (extraccion puntual, sin VBA).
