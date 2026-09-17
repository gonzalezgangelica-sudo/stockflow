import sql from "mssql";
import { config } from "./config.js";

/** Stock vivo desde BC: ILE abierto con remaining distinto de 0.
 * Cajas = Remaining Quantity. Kg = Kilos.
 */
export const SQL_LIVE = `
SELECT
    ile.[Location Code] AS warehouse,
    ile.[Item No.] AS product_no,
    ile.[Description] AS product_description,
    ISNULL(ile.[Lot No.], '') AS lot_no,
    CAST(ile.[Fecha despesque] AS date) AS harvest_date,
    CAST(ile.[Fecha empaque] AS date) AS packing_date,
    CASE
        WHEN ile.[Expiration Date] IS NULL OR YEAR(ile.[Expiration Date]) < 1900 THEN NULL
        ELSE CAST(ile.[Expiration Date] AS date)
    END AS expiry_date,
    CAST(ile.[Remaining Quantity] AS float) AS remaining_quantity,
    CAST(ile.[Kilos] AS float) AS kg
FROM bc.[Item Ledger Entry] AS ile
WHERE ile.[Open] = 1
  AND ile.[Remaining Quantity] <> 0
  AND ile.[Location Code] IN ('E', 'G', 'V3', 'J', 'W', 'Z')
`;

let pool;

function bcPool() {
  if (!config.bc.server) throw new Error("BC_SERVER no configurado");
  if (!pool) {
    pool = new sql.ConnectionPool({
      server: config.bc.server,
      database: config.bc.database,
      user: config.bc.user,
      password: config.bc.password,
      options: { encrypt: true, trustServerCertificate: true },
      requestTimeout: 180000,
      connectionTimeout: 30000,
      pool: { max: 5, min: 0, idleTimeoutMillis: 30000 },
    });
  }
  return pool;
}

function cleanDate(v) {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime()) || d.getUTCFullYear() < 1900) return null;
  return d.toISOString().slice(0, 10);
}

export async function fetchLiveStock() {
  const p = bcPool();
  if (!p.connected) await p.connect();
  const result = await p.request().query(SQL_LIVE);
  return result.recordset.map((r) => ({
    warehouse: String(r.warehouse || "").trim(),
    product_no: String(r.product_no || "").trim(),
    product_description: String(r.product_description || "").trim(),
    lot_no: String(r.lot_no || "").trim(),
    harvest_date: cleanDate(r.harvest_date),
    packing_date: cleanDate(r.packing_date),
    expiry_date: cleanDate(r.expiry_date),
    remaining_quantity: Number(r.remaining_quantity || 0),
    boxes: Number(r.remaining_quantity || 0),
    kg: Number(r.kg || 0),
    quantity: Number(r.remaining_quantity || 0),
  }));
}
