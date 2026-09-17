import express from "express";
import cron from "node-cron";
import { fetchLiveStock } from "./bc.js";
import { config } from "./config.js";
import {
  applyFilters,
  ageAnalysis,
  compareSets,
  enrich,
  findRepeatedBoxes,
  packingAnalysis,
  splitByWarehouse,
  summarize,
  todayISO,
} from "./domain.js";
import {
  evolution,
  getConfig,
  getSnapshot,
  latestOkSnapshot,
  listLogs,
  listSnapshots,
  saveErrorSnapshot,
  saveSnapshot,
  snapshotLines,
  warningDays,
  loginUser,
  sessionByToken,
  logoutToken,
  listUsers,
  createUser,
  updateUser,
  listAccessRequests,
  createAccessRequest,
  setAccessRequestStatus,
} from "./store.js";
import { bearerToken } from "./auth.js";

const router = express.Router();
let liveCache = { at: 0, rows: null };

export const STOCK_DEFINITION =
  "ILE Open=1 AND Remaining Quantity=1 | kg=Kilos | cajas=Remaining Quantity (informe Power BI / Excel caducidad)";

async function liveRows(force = false) {
  const now = Date.now();
  if (!force && liveCache.rows && now - liveCache.at < 60_000) return liveCache.rows;
  const rows = await fetchLiveStock();
  liveCache = { at: now, rows };
  return rows;
}

function q(req) {
  return {
    warehouse: req.query.warehouse || "",
    product_no: req.query.product_no || "",
    lot_no: req.query.lot_no || "",
    expiry_status: req.query.expiry_status || "",
  };
}

function wantRefresh(req) {
  return req.query.refresh === "1" || req.query.refresh === "true";
}

function enrichRows(rows, req) {
  const today = todayISO();
  const warn = warningDays();
  return applyFilters(
    rows.map((r) => enrich(r, today, warn)),
    q(req)
  );
}

function enrichSnap(id, req) {
  return enrichRows(snapshotLines(id), req);
}

function warehousePayload(rows) {
  const names = Object.fromEntries((getConfig().warehouses || []).map((w) => [w.code, w.name]));
  return splitByWarehouse(rows).map((section) => ({
    ...section,
    name: names[section.warehouse] || section.warehouse,
  }));
}

router.get("/health", (_req, res) => {
  res.json({ ok: true, engine: "node", bc_configured: Boolean(config.bc.server), definition: STOCK_DEFINITION });
});

router.post("/auth/login", (req, res) => {
  const { email, password } = req.body || {};
  const session = loginUser(email, password);
  if (!session) return res.status(401).json({ detail: "Email o contraseña no válidos" });
  res.json(session);
});

router.post("/auth/request", (req, res) => {
  try {
    createAccessRequest(req.body || {});
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ detail: err.message });
  }
});

router.use((req, res, next) => {
  const session = sessionByToken(bearerToken(req));
  if (!session) return res.status(401).json({ detail: "No autenticado" });
  req.user = session.user;
  next();
});

router.get("/auth/me", (req, res) => res.json({ user: req.user }));

router.post("/auth/logout", (req, res) => {
  logoutToken(bearerToken(req));
  res.json({ ok: true });
});

function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") return res.status(403).json({ detail: "Solo administradores" });
  next();
}

router.get("/users", requireAdmin, (_req, res) => {
  res.json({ users: listUsers(), requests: listAccessRequests() });
});

router.post("/users", requireAdmin, (req, res) => {
  try {
    const user = createUser(req.body || {});
    res.json(user);
  } catch (err) {
    res.status(400).json({ detail: err.message });
  }
});

router.patch("/users/:id", requireAdmin, (req, res) => {
  try {
    res.json(updateUser(Number(req.params.id), req.body || {}));
  } catch (err) {
    res.status(400).json({ detail: err.message });
  }
});

router.patch("/access-requests/:id", requireAdmin, (req, res) => {
  const status = req.body?.status === "rejected" ? "rejected" : "approved";
  setAccessRequestStatus(Number(req.params.id), status);
  res.json({ ok: true });
});

router.get("/config", (_req, res) => res.json(getConfig()));

router.get("/stock/live", async (req, res) => {
  try {
    const rows = enrichRows(await liveRows(wantRefresh(req)), req);
    const last = latestOkSnapshot();
    res.json({
      source: "live",
      as_of: todayISO(),
      queried_at: new Date().toISOString(),
      definition: STOCK_DEFINITION,
      initial_snapshot_date: last?.snapshot_date || null,
      summary: summarize(rows),
      warehouses: warehousePayload(rows),
      total_rows: rows.length,
    });
  } catch (err) {
    res.status(503).json({ detail: `No se pudo leer stock vivo: ${err.message}` });
  }
});

router.get("/dashboard", async (req, res) => {
  let liveOk = true;
  let liveError = "";
  let live = [];
  try {
    live = enrichRows(await liveRows(wantRefresh(req)), req);
  } catch (err) {
    liveOk = false;
    liveError = err.message;
    const last = latestOkSnapshot();
    if (last) live = enrichSnap(last.id, req);
  }
  const last = latestOkSnapshot();
  const initial = last ? enrichSnap(last.id, req) : [];
  const liveSum = summarize(live);
  const initSum = initial.length ? summarize(initial) : null;
  res.json({
    live_ok: liveOk,
    live_error: liveError,
    kpis: liveSum,
    initial: initSum,
    variation_kg: initSum ? Math.round((liveSum.kg - initSum.kg) * 10) / 10 : null,
    warehouses: liveSum.by_warehouse,
    evolution: evolution(Number(req.query.days || 30), req.query.warehouse || "", req.query.product_no || ""),
    snapshot_date: last?.snapshot_date || null,
    definition: STOCK_DEFINITION,
    duplicates: ((d) => ({
      lot_count: d.lot_count,
      extra_boxes: d.extra_boxes,
      boxes: d.boxes,
      unique_lots: d.unique_lots,
      missing_lot_boxes: d.missing_lot_boxes,
    }))(findRepeatedBoxes(live)),
  });
});

router.get("/snapshots", (_req, res) => res.json(listSnapshots()));

router.get("/snapshots/:id", (req, res) => {
  const snap = getSnapshot(Number(req.params.id));
  if (!snap) return res.status(404).json({ detail: "Fotografia no encontrada" });
  const rows = enrichSnap(snap.id, req);
  res.json({
    id: snap.id,
    date: snap.snapshot_date,
    time: snap.snapshot_time,
    status: snap.status,
    summary: summarize(rows),
    warehouses: warehousePayload(rows),
    total_rows: rows.length,
  });
});

async function runSnapshot(replace = false) {
  const now = new Date();
  const date = todayISO();
  const time = now.toTimeString().slice(0, 8);
  try {
    const rows = await liveRows(true);
    return saveSnapshot(date, time, rows, { replace });
  } catch (err) {
    saveErrorSnapshot(date, time, err.message);
    throw err;
  }
}

router.post("/snapshots/run", requireAdmin, async (req, res) => {
  try {
    const snap = await runSnapshot(Boolean(req.query.replace || req.body?.replace));
    res.json({
      id: snap.id,
      date: snap.snapshot_date,
      time: snap.snapshot_time,
      status: snap.status,
      records: snap.records_processed,
      error: snap.error_message,
    });
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});

router.get("/compare", async (req, res) => {
  const last = latestOkSnapshot();
  if (!last) return res.status(404).json({ detail: "No hay fotografia historica todavia" });
  try {
    const live = enrichRows(await liveRows(wantRefresh(req)), req);
    const initial = enrichSnap(last.id, req);
    res.json({
      snapshot_date: last.snapshot_date,
      snapshot_time: last.snapshot_time,
      initial: summarize(initial),
      live: summarize(live),
      rows: compareSets(initial, live).slice(0, 300),
    });
  } catch (err) {
    res.status(503).json({ detail: err.message });
  }
});

router.get("/evolution", (req, res) => {
  const points = evolution(Number(req.query.days || 30), req.query.warehouse || "", req.query.product_no || "");
  const movement = points.map((p, i) => ({
    date: p.date,
    stock_inicial: i ? points[i - 1].kg : null,
    stock_final: p.kg,
    variacion: i ? Math.round((p.kg - points[i - 1].kg) * 10) / 10 : null,
  }));
  res.json({ points, movement });
});

router.get("/analysis/packing", async (req, res) => {
  const last = latestOkSnapshot();
  let rows;
  if (last) rows = enrichSnap(last.id, req);
  else rows = enrichRows(await liveRows(wantRefresh(req)), req);
  res.json({ packing: packingAnalysis(rows), age: ageAnalysis(rows) });
});

router.get("/analysis/duplicates", async (req, res) => {
  let rows;
  try {
    rows = enrichRows(await liveRows(wantRefresh(req)), req);
  } catch {
    const last = latestOkSnapshot();
    if (!last) return res.status(503).json({ detail: "Sin stock vivo ni historico" });
    rows = enrichSnap(last.id, req);
  }
  res.json(findRepeatedBoxes(rows));
});

router.get("/expiry", async (req, res) => {
  let rows;
  try {
    rows = enrichRows(await liveRows(wantRefresh(req)), req);
  } catch {
    const last = latestOkSnapshot();
    if (!last) return res.status(503).json({ detail: "Sin stock vivo ni historico" });
    rows = enrichSnap(last.id, req);
  }
  const interesting = rows
    .filter((r) => ["Caducado", "Proximo a caducar", "En seguimiento", "Sin fecha"].includes(r.expiry_status))
    .sort((a, b) => (a.days_to_expiry ?? 9999) - (b.days_to_expiry ?? 9999));
  res.json({ summary: summarize(rows), rows: interesting.slice(0, 800) });
});

router.get("/logs", (_req, res) => res.json(listLogs()));

export function startJobs() {
  const spec = `${config.snapshotMinute} ${config.snapshotHour} * * *`;
  cron.schedule(spec, () => runSnapshot(false).catch((err) => console.error("snapshot job", err)), {
    timezone: config.timezone,
  });
}

export default router;
