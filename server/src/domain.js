/** Semaforo identico al informe Power BI / Excel caducidad. */
export function expiryStatus(expiry, today, warningDays = 7) {
  if (!expiry) return { status: "Sin fecha", days: null };
  const d0 = new Date(today);
  const d1 = new Date(expiry);
  const days = Math.round((d1 - d0) / 86400000);
  const near = Number(warningDays) || 7;
  const watch = Math.max(near + 8, 15);
  if (days < 0) return { status: "Caducado", days };
  if (days <= near) return { status: "Proximo a caducar", days };
  if (days <= watch) return { status: "En seguimiento", days };
  return { status: "Correcto", days };
}

export function daysSincePacking(packing, today) {
  if (!packing) return null;
  return Math.round((new Date(today) - new Date(packing)) / 86400000);
}

export function ageBucket(days) {
  if (days == null) return "Sin fecha empaque";
  if (days <= 7) return "0-7";
  if (days <= 15) return "8-15";
  if (days <= 30) return "16-30";
  if (days <= 60) return "31-60";
  return "61+";
}

export function enrich(row, today, warningDays) {
  const { status, days } = expiryStatus(row.expiry_date, today, warningDays);
  const ageDays = daysSincePacking(row.packing_date, today);
  return {
    ...row,
    boxes: Number(row.boxes ?? row.remaining_quantity ?? 0),
    kg: Number(row.kg || 0),
    expiry_status: status,
    days_to_expiry: days,
    days_since_packing: ageDays,
    age_bucket: ageBucket(ageDays),
  };
}

export function applyFilters(rows, q = {}) {
  return rows.filter((r) => {
    if (q.warehouse && r.warehouse !== q.warehouse) return false;
    if (q.product_no) {
      const n = q.product_no.toLowerCase();
      if (!`${r.product_no} ${r.product_description}`.toLowerCase().includes(n)) return false;
    }
    if (q.lot_no && !(r.lot_no || "").toLowerCase().includes(q.lot_no.toLowerCase())) return false;
    if (q.expiry_status && r.expiry_status !== q.expiry_status) return false;
    return true;
  });
}

export function summarize(rows) {
  const byStatus = {};
  const byWh = {};
  const products = new Set();
  const lots = new Set();
  let kg = 0;
  let boxes = 0;
  for (const r of rows) {
    kg += r.kg;
    boxes += r.boxes;
    products.add(r.product_no);
    if (r.lot_no) lots.add(r.lot_no);
    const st = r.expiry_status || "Sin fecha";
    byStatus[st] ??= { kg: 0, boxes: 0, count: 0 };
    byStatus[st].kg += r.kg;
    byStatus[st].boxes += r.boxes;
    byStatus[st].count += 1;
    const w = (byWh[r.warehouse] ??= {
      kg: 0,
      boxes: 0,
      products: new Set(),
      caducado_kg: 0,
      proximo_kg: 0,
      seguimiento_kg: 0,
    });
    w.kg += r.kg;
    w.boxes += r.boxes;
    w.products.add(r.product_no);
    if (st === "Caducado") w.caducado_kg += r.kg;
    if (st === "Proximo a caducar") w.proximo_kg += r.kg;
    if (st === "En seguimiento") w.seguimiento_kg += r.kg;
  }
  return {
    kg: round(kg),
    boxes: round(boxes),
    products: products.size,
    lots: lots.size,
    records: rows.length,
    by_status: Object.fromEntries(
      Object.entries(byStatus).map(([k, v]) => [k, { kg: round(v.kg), boxes: round(v.boxes), count: v.count }])
    ),
    by_warehouse: Object.entries(byWh)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([warehouse, v]) => ({
        warehouse,
        kg: round(v.kg),
        boxes: round(v.boxes),
        products: v.products.size,
        caducado_kg: round(v.caducado_kg),
        proximo_kg: round(v.proximo_kg),
        seguimiento_kg: round(v.seguimiento_kg),
      })),
  };
}

export function compareSets(initial, live) {
  const a = new Map();
  const b = new Map();
  const bump = (map, r) => {
    const k = `${r.warehouse}|${r.product_no}`;
    const cur = map.get(k) || { warehouse: r.warehouse, product_no: r.product_no, product_description: r.product_description, kg: 0, boxes: 0 };
    cur.kg += r.kg;
    cur.boxes += r.boxes;
    map.set(k, cur);
  };
  initial.forEach((r) => bump(a, r));
  live.forEach((r) => bump(b, r));
  const keys = new Set([...a.keys(), ...b.keys()]);
  const out = [];
  for (const k of keys) {
    const x = a.get(k) || { kg: 0, boxes: 0, warehouse: "", product_no: "", product_description: "" };
    const y = b.get(k) || { kg: 0, boxes: 0, warehouse: x.warehouse, product_no: x.product_no, product_description: x.product_description };
    const diff = y.kg - x.kg;
    out.push({
      warehouse: y.warehouse || x.warehouse,
      product_no: y.product_no || x.product_no,
      product_description: x.product_description || y.product_description,
      kg_inicial: round(x.kg),
      kg_vivo: round(y.kg),
      kg_diff: round(diff),
      pct: x.kg ? round((diff / x.kg) * 100) : null,
      boxes_inicial: round(x.boxes),
      boxes_vivo: round(y.boxes),
    });
  }
  out.sort((p, q) => Math.abs(q.kg_diff) - Math.abs(p.kg_diff));
  return out;
}

export function packingAnalysis(rows) {
  const groups = {};
  const total = rows.reduce((s, r) => s + r.kg, 0) || 1;
  for (const r of rows) {
    const key = r.packing_date || "Sin fecha";
    groups[key] ??= { kg: 0, boxes: 0 };
    groups[key].kg += r.kg;
    groups[key].boxes += r.boxes;
  }
  return Object.entries(groups)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([packing_date, v]) => ({ packing_date, kg: round(v.kg), boxes: round(v.boxes), pct: round((100 * v.kg) / total) }));
}

export function ageAnalysis(rows) {
  const groups = {};
  for (const r of rows) {
    const b = r.age_bucket || "Sin clasificar";
    groups[b] ??= { kg: 0, boxes: 0, count: 0 };
    groups[b].kg += r.kg;
    groups[b].boxes += r.boxes;
    groups[b].count += 1;
  }
  return Object.entries(groups).map(([bucket, v]) => ({ bucket, kg: round(v.kg), boxes: round(v.boxes), count: v.count }));
}

function round(n, d = 1) {
  return Math.round(Number(n || 0) * 10 ** d) / 10 ** d;
}

export const WAREHOUSE_ORDER = ["E", "G", "V3", "J", "W", "Z"];

const STATUS_RANK = {
  Caducado: 0,
  "Proximo a caducar": 1,
  "En seguimiento": 2,
  "Sin fecha": 3,
  Correcto: 4,
};

function worseStatus(a, b) {
  const ra = STATUS_RANK[a] ?? 9;
  const rb = STATUS_RANK[b] ?? 9;
  return ra <= rb ? a : b;
}

function earlierDate(a, b) {
  if (!a) return b || null;
  if (!b) return a;
  return a < b ? a : b;
}

export function aggregateLines(rows) {
  const map = new Map();
  for (const r of rows) {
    const k = `${r.warehouse}|${r.product_no}`;
    const cur = map.get(k);
    const lot = (r.lot_no || "").trim();
    if (cur) {
      cur.boxes += Number(r.boxes || 0);
      cur.kg += Number(r.kg || 0);
      if (lot) cur.lots.add(lot);
      cur.packing_date = earlierDate(cur.packing_date, r.packing_date);
      cur.expiry_date = earlierDate(cur.expiry_date, r.expiry_date);
      cur.expiry_status = worseStatus(cur.expiry_status, r.expiry_status);
      if (r.days_to_expiry != null && (cur.days_to_expiry == null || r.days_to_expiry < cur.days_to_expiry)) {
        cur.days_to_expiry = r.days_to_expiry;
      }
      continue;
    }
    map.set(k, {
      warehouse: r.warehouse,
      product_no: r.product_no,
      product_description: r.product_description,
      lots: new Set(lot ? [lot] : []),
      packing_date: r.packing_date || null,
      expiry_date: r.expiry_date || null,
      expiry_status: r.expiry_status,
      days_to_expiry: r.days_to_expiry,
      boxes: Number(r.boxes || 0),
      kg: Number(r.kg || 0),
    });
  }
  return [...map.values()]
    .map((r) => ({
      warehouse: r.warehouse,
      product_no: r.product_no,
      product_description: r.product_description,
      lot_count: r.lots.size,
      packing_date: r.packing_date,
      expiry_date: r.expiry_date,
      expiry_status: r.expiry_status,
      days_to_expiry: r.days_to_expiry,
      boxes: round(r.boxes, 0),
      kg: round(r.kg),
    }))
    .sort(
      (a, b) =>
        (a.days_to_expiry ?? 9999) - (b.days_to_expiry ?? 9999) ||
        String(a.product_no).localeCompare(String(b.product_no))
    );
}

export function splitByWarehouse(rows) {
  const groups = new Map();
  for (const r of rows) {
    const w = r.warehouse || "SIN";
    if (!groups.has(w)) groups.set(w, []);
    groups.get(w).push(r);
  }
  const keys = WAREHOUSE_ORDER.filter((c) => groups.has(c));
  return keys.map((warehouse) => {
    const list = groups.get(warehouse);
    const aggregated = aggregateLines(list);
    const cap = 800;
    return {
      warehouse,
      summary: summarize(list),
      rows: aggregated.slice(0, cap),
      line_count: aggregated.length,
      truncated: aggregated.length > cap,
    };
  });
}

export function todayISO() {
  const t = new Date();
  const z = (n) => String(n).padStart(2, "0");
  return `${t.getFullYear()}-${z(t.getMonth() + 1)}-${z(t.getDate())}`;
}

/** El lote es el nº de caja: 1 lote = 1 caja. Se repite si el mismo lote tiene >1 caja o >1 línea. */
export function findRepeatedBoxes(rows) {
  const byLot = new Map();
  let boxes = 0;
  let missingLotBoxes = 0;
  for (const r of rows) {
    const n = Number(r.boxes || 0);
    boxes += n;
    const lot = String(r.lot_no || "").trim();
    if (!lot) {
      missingLotBoxes += n;
      continue;
    }
    const cur = byLot.get(lot) || {
      lot_no: lot,
      product_no: r.product_no,
      product_description: r.product_description,
      warehouses: new Set(),
      products: new Set(),
      lines: 0,
      boxes: 0,
      kg: 0,
    };
    cur.lines += 1;
    cur.boxes += n;
    cur.kg += Number(r.kg || 0);
    cur.warehouses.add(r.warehouse || "");
    cur.products.add(r.product_no);
    if (!cur.product_no) cur.product_no = r.product_no;
    if (!cur.product_description) cur.product_description = r.product_description;
    byLot.set(lot, cur);
  }

  const uniqueLots = byLot.size;
  const lots = [...byLot.values()]
    .filter((x) => x.lines > 1 || x.boxes > 1)
    .map((x) => ({
      lot_no: x.lot_no,
      warehouse: [...x.warehouses].filter(Boolean).sort().join(", "),
      warehouse_count: x.warehouses.size,
      product_no: x.product_no,
      product_description: x.product_description,
      products: x.products.size,
      lines: x.lines,
      boxes: round(x.boxes, 0),
      extra_boxes: round(Math.max(0, x.boxes - 1), 0),
      kg: round(x.kg),
    }))
    .sort((a, b) => b.boxes - a.boxes || b.lines - a.lines);

  const extraBoxes = round(Math.max(0, boxes - uniqueLots), 0);
  return {
    lots: lots.slice(0, 1500),
    clones: [],
    multi_warehouse: lots.filter((x) => x.warehouse_count > 1).slice(0, 800),
    lot_count: lots.length,
    clone_count: lots.length,
    multi_count: lots.filter((x) => x.warehouse_count > 1).length,
    boxes: round(boxes, 0),
    unique_lots: uniqueLots,
    extra_boxes: extraBoxes,
    missing_lot_boxes: round(missingLotBoxes, 0),
  };
}
