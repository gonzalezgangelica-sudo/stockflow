# Stock — Item Ledger Entry

Excel de stock **solo** desde `bc.[Item Ledger Entry]`.

## Filtro

- `Open = 1` (movimiento aun abierto)
- `Remaining Quantity = 1` → campo de negocio **Cajas pendientes = 1**

No se usa Inventory, Value Entry ni otra tabla para calcular el stock. `Stock disponible` es el campo `Kilos` de esa misma linea.

## Columnas

Almacen, Item, Producto, Stock disponible (kg), Fecha despesque, Fecha empaque, Fecha caducidad, Cajas pendientes, Dias a caducidad, Estado caducidad.

## Alertas

| Estado | Criterio |
|--------|----------|
| Caducado | caducidad &lt; hoy |
| Proximo a caducar | 0–7 dias |
| En seguimiento | 8–15 dias |
| Correcto | mas de 15 dias |

Filtra en la hoja **Stock** con las flechas de la tabla (Almacen, Producto, Estado caducidad).

## Ejecutar

Las credenciales se leen de `.env` de este proyecto o, si no existe, de `CALCULO_BIOMASA\.env` (BC SQL Azure).

```powershell
cd C:\Users\ACZ\Downloads\Proyectos\stock
pip install -r requirements.txt
python generar_excel_stock.py
```

Salida: `Reports/stock_ile_YYYYMMDD.xlsx`
