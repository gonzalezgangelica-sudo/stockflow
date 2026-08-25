-- Stock abierto en Item Ledger Entry
-- Cajas pendientes = Remaining Quantity = 1 (linea de caja aun abierta)
-- Solo lectura. No usa Inventory ni otra tabla para el stock.

SELECT
    ile.[Location Code] AS almacen,
    ile.[Item No.] AS item_no,
    ile.[Description] AS producto,
    CAST(ile.[Kilos] AS float) AS stock_kg,
    CAST(ile.[Remaining Quantity] AS float) AS cajas_pendientes,
    CAST(ile.[Fecha despesque] AS date) AS fecha_despesque,
    CAST(ile.[Fecha empaque] AS date) AS fecha_empaque,
    CAST(ile.[Expiration Date] AS date) AS fecha_caducidad,
    ile.[Lot No.] AS lote
FROM bc.[Item Ledger Entry] AS ile
WHERE ile.[Open] = 1
  AND ile.[Remaining Quantity] = 1
