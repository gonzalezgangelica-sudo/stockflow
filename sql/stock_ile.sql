-- Stock abierto en Item Ledger Entry (informe caducidad)
-- Cajas pendientes = Remaining Quantity = 1 (linea de caja aun abierta)
-- Solo lectura. No usa Inventory ni otra tabla para el stock.

SELECT
    ile.[Location Code] AS Almacen,
    ile.[Item No.] AS Item,
    ile.[Description] AS Producto,
    CAST(ile.[Kilos] AS float) AS [Stock disponible (kg)],
    CAST(ile.[Fecha despesque] AS date) AS [Fecha despesque],
    CAST(ile.[Fecha empaque] AS date) AS [Fecha empaque],
    CASE
        WHEN ile.[Expiration Date] IS NULL OR YEAR(ile.[Expiration Date]) < 1900 THEN NULL
        ELSE CAST(ile.[Expiration Date] AS date)
    END AS [Fecha caducidad],
    CAST(ile.[Remaining Quantity] AS float) AS [Cajas pendientes],
    CASE
        WHEN ile.[Expiration Date] IS NULL OR YEAR(ile.[Expiration Date]) < 1900 THEN NULL
        ELSE DATEDIFF(day, CAST(GETDATE() AS date), CAST(ile.[Expiration Date] AS date))
    END AS [Dias restantes],
    CASE
        WHEN ile.[Expiration Date] IS NULL OR YEAR(ile.[Expiration Date]) < 1900 THEN N'Sin fecha'
        WHEN DATEDIFF(day, CAST(GETDATE() AS date), CAST(ile.[Expiration Date] AS date)) < 0 THEN N'Caducado'
        WHEN DATEDIFF(day, CAST(GETDATE() AS date), CAST(ile.[Expiration Date] AS date)) <= 7 THEN N'Proximo a caducar'
        WHEN DATEDIFF(day, CAST(GETDATE() AS date), CAST(ile.[Expiration Date] AS date)) <= 15 THEN N'En seguimiento'
        ELSE N'Correcto'
    END AS [Estado caducidad]
FROM bc.[Item Ledger Entry] AS ile
WHERE ile.[Open] = 1
  AND ile.[Remaining Quantity] = 1
ORDER BY
    ile.[Location Code],
    CASE
        WHEN ile.[Expiration Date] IS NULL OR YEAR(ile.[Expiration Date]) < 1900 THEN 5
        WHEN DATEDIFF(day, CAST(GETDATE() AS date), CAST(ile.[Expiration Date] AS date)) < 0 THEN 1
        WHEN DATEDIFF(day, CAST(GETDATE() AS date), CAST(ile.[Expiration Date] AS date)) <= 7 THEN 2
        WHEN DATEDIFF(day, CAST(GETDATE() AS date), CAST(ile.[Expiration Date] AS date)) <= 15 THEN 3
        ELSE 4
    END,
    ile.[Expiration Date],
    ile.[Item No.];
