import { appPool, ensureSchema, runQuery, sql } from "./appdb.js";
import { hashPassword, newToken, publicUser, verifyPassword } from "./auth.js";
import { config } from "./config.js";
import { summarize, todayISO } from "./domain.js";
import { ACTIVE_WAREHOUSES, WAREHOUSE_NAMES } from "./warehouses.js";

let configCache = {};
let warehouseCache = [];
let warnCache = Number(config.expiryWarningDays || 7);

function isoDate(v) {
  if (!v) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10);
  const s = String(v).slice(0, 10);
  return s || null;
}

function mapSnap(r) {
  if (!r) return null;
  const date = isoDate(r.snapshot_date);
  return {
    ...r,
    snapshot_date: date,
    date,
    time: r.snapshot_time,
    records: r.records_processed,
    error: r.error_message,
  };
}

function mapLine(r) {
  return {
    ...r,
    packing_date: isoDate(r.packing_date),
    harvest_date: isoDate(r.harvest_date),
    expiry_date: isoDate(r.expiry_date),
    boxes: Number(r.boxes || 0),
    kg: Number(r.kg || 0),
    quantity: Number(r.quantity || 0),
    remaining_quantity: Number(r.remaining_quantity || 0),
  };
}

async function refreshCaches() {
  const cfg = await runQuery("SELECT [key], value FROM dbo.app_config");
  configCache = Object.fromEntries((cfg.recordset || []).map((r) => [r.key, r.value]));
  warnCache = Number(configCache.expiry_warning_days || config.expiryWarningDays || 7);
  const wh = await runQuery("SELECT code, name, active FROM dbo.warehouse ORDER BY code");
  warehouseCache = (wh.recordset || []).map((w) => ({ ...w, active: Boolean(w.active) }));
}

async function seed() {
  for (const code of ACTIVE_WAREHOUSES) {
    await runQuery(
      `IF NOT EXISTS (SELECT 1 FROM dbo.warehouse WHERE code=@code)
       INSERT INTO dbo.warehouse(code,name,active) VALUES (@code,@name,1)`,
      { code, name: WAREHOUSE_NAMES[code] || code }
    );
  }
  const keys = [
    ["snapshot_hour", String(config.snapshotHour)],
    ["snapshot_minute", String(config.snapshotMinute)],
    ["expiry_warning_days", "7"],
    ["age_buckets", "0-7,8-15,16-30,31-60,61+"],
    ["active_warehouses", ACTIVE_WAREHOUSES.join(",")],
  ];
  for (const [key, value] of keys) {
    await runQuery(
      `IF NOT EXISTS (SELECT 1 FROM dbo.app_config WHERE [key]=@key)
       INSERT INTO dbo.app_config([key],value) VALUES (@key,@value)`,
      { key, value }
    );
  }
  await runQuery("UPDATE dbo.app_config SET value=@value WHERE [key]='active_warehouses'", {
    value: ACTIVE_WAREHOUSES.join(","),
  });
  const users = await runQuery("SELECT COUNT(*) AS n FROM dbo.app_user");
  if (!Number(users.recordset?.[0]?.n || 0)) {
    await runQuery(
      "INSERT INTO dbo.app_user(email,name,password_hash,role,active) VALUES (@email,@name,@hash,@role,1)",
      { email: "admin@ssf.demo", name: "Administrador", hash: hashPassword("Demo1234!"), role: "admin" }
    );
    await runQuery(
      "INSERT INTO dbo.app_user(email,name,password_hash,role,active) VALUES (@email,@name,@hash,@role,1)",
      { email: "consulta@ssf.demo", name: "Consulta stock", hash: hashPassword("Demo1234!"), role: "consulta" }
    );
  }
}

export async function initStore() {
  if (!config.app.server) throw new Error("APP_SQL_SERVER no configurado: la foto fija vive en Azure SQL");
  await ensureSchema();
  await seed();
  await refreshCaches();
}

export function getConfig() {
  return { config: configCache, warehouses: warehouseCache };
}

export function warningDays() {
  return warnCache;
}

export async function listSnapshots() {
  const r = await runQuery(
    `SELECT id, snapshot_date, snapshot_time, status, records_processed, error_message
     FROM dbo.stock_snapshot ORDER BY snapshot_date DESC`
  );
  return (r.recordset || []).map(mapSnap);
}

export async function getSnapshot(id) {
  const r = await runQuery("SELECT * FROM dbo.stock_snapshot WHERE id=@id", { id });
  return mapSnap(r.recordset?.[0]);
}

export async function snapshotLines(id) {
  const r = await runQuery("SELECT * FROM dbo.stock_snapshot_line WHERE snapshot_id=@id", { id });
  return (r.recordset || []).map(mapLine);
}

export async function latestOkSnapshot() {
  const r = await runQuery(
    `SELECT TOP 1 * FROM dbo.stock_snapshot WHERE status='OK' ORDER BY snapshot_date DESC, id DESC`
  );
  return mapSnap(r.recordset?.[0]);
}

export async function logExecution(status, records, error = "") {
  const d = todayISO();
  const t = new Intl.DateTimeFormat("en-GB", {
    timeZone: config.timezone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date());
  await runQuery(
    `INSERT INTO dbo.execution_log(execution_date,execution_time,status,records_processed,error_message)
     VALUES (@d,@t,@status,@records,@error)`,
    { d, t, status, records: Number(records || 0), error: String(error || "").slice(0, 4000) }
  );
}

async function insertWarehouseSummaries(snapshotId, rows) {
  await runQuery("DELETE FROM dbo.stock_snapshot_warehouse WHERE snapshot_id=@id", { id: snapshotId });
  for (const w of summarize(rows).by_warehouse) {
    await runQuery(
      `INSERT INTO dbo.stock_snapshot_warehouse
        (snapshot_id,warehouse,kg,boxes,products,caducado_kg,proximo_kg,seguimiento_kg)
       VALUES (@id,@warehouse,@kg,@boxes,@products,@caducado,@proximo,@seguimiento)`,
      {
        id: snapshotId,
        warehouse: w.warehouse,
        kg: w.kg,
        boxes: w.boxes,
        products: w.products,
        caducado: w.caducado_kg,
        proximo: w.proximo_kg,
        seguimiento: w.seguimiento_kg,
      }
    );
  }
}

async function bulkLines(snapshotId, rows) {
  const table = new sql.Table("dbo.stock_snapshot_line");
  table.create = false;
  table.columns.add("snapshot_id", sql.Int, { nullable: false });
  table.columns.add("warehouse", sql.NVarChar(20), { nullable: false });
  table.columns.add("product_no", sql.NVarChar(40), { nullable: false });
  table.columns.add("product_description", sql.NVarChar(200), { nullable: false });
  table.columns.add("lot_no", sql.NVarChar(50), { nullable: false });
  table.columns.add("packing_date", sql.Date, { nullable: true });
  table.columns.add("harvest_date", sql.Date, { nullable: true });
  table.columns.add("expiry_date", sql.Date, { nullable: true });
  table.columns.add("quantity", sql.Float, { nullable: false });
  table.columns.add("remaining_quantity", sql.Float, { nullable: false });
  table.columns.add("boxes", sql.Float, { nullable: false });
  table.columns.add("kg", sql.Float, { nullable: false });
  for (const r of rows) {
    table.rows.add(
      snapshotId,
      String(r.warehouse || "").slice(0, 20),
      String(r.product_no || "").slice(0, 40),
      String(r.product_description || "").slice(0, 200),
      String(r.lot_no || "").slice(0, 50),
      r.packing_date || null,
      r.harvest_date || null,
      r.expiry_date || null,
      Number(r.quantity || 0),
      Number(r.remaining_quantity || 0),
      Number(r.boxes || 0),
      Number(r.kg || 0)
    );
  }
  const pool = await appPool();
  await pool.request().bulk(table);
}

export async function saveSnapshot(date, time, rows, { replace = false } = {}) {
  const existing = mapSnap(
    (await runQuery("SELECT * FROM dbo.stock_snapshot WHERE snapshot_date=@date", { date })).recordset?.[0]
  );
  if (existing && existing.status === "OK" && !replace) {
    await logExecution("SKIPPED", existing.records_processed, "Ya existe fotografia de hoy");
    return existing;
  }
  let id;
  if (existing) {
    await runQuery("DELETE FROM dbo.stock_snapshot_line WHERE snapshot_id=@id", { id: existing.id });
    await runQuery("DELETE FROM dbo.stock_snapshot_warehouse WHERE snapshot_id=@id", { id: existing.id });
    await runQuery(
      `UPDATE dbo.stock_snapshot
       SET snapshot_time=@time, status='OK', records_processed=@n, error_message=''
       WHERE id=@id`,
      { time, n: rows.length, id: existing.id }
    );
    id = existing.id;
  } else {
    const ins = await runQuery(
      `INSERT INTO dbo.stock_snapshot(snapshot_date,snapshot_time,status,records_processed,error_message)
       OUTPUT INSERTED.id
       VALUES (@date,@time,'OK',@n,'')`,
      { date, time, n: rows.length }
    );
    id = ins.recordset[0].id;
  }
  if (rows.length) await bulkLines(id, rows);
  await insertWarehouseSummaries(id, rows);
  await logExecution("OK", rows.length, "");
  return getSnapshot(id);
}

export async function saveErrorSnapshot(date, time, error) {
  const msg = String(error || "").slice(0, 4000);
  const existing = (await runQuery("SELECT id FROM dbo.stock_snapshot WHERE snapshot_date=@date", { date })).recordset?.[0];
  if (existing) {
    await runQuery(
      `UPDATE dbo.stock_snapshot SET status='ERROR', error_message=@msg, snapshot_time=@time WHERE id=@id`,
      { msg, time, id: existing.id }
    );
  } else {
    await runQuery(
      `INSERT INTO dbo.stock_snapshot(snapshot_date,snapshot_time,status,records_processed,error_message)
       VALUES (@date,@time,'ERROR',0,@msg)`,
      { date, time, msg }
    );
  }
  await logExecution("ERROR", 0, msg);
}

export async function listLogs() {
  const r = await runQuery(
    `SELECT TOP 200 id, execution_date, execution_time, status, records_processed, error_message
     FROM dbo.execution_log ORDER BY id DESC`
  );
  return (r.recordset || []).map((row) => ({
    id: row.id,
    date: isoDate(row.execution_date),
    time: row.execution_time,
    status: row.status,
    records: row.records_processed,
    error: row.error_message,
  }));
}

export async function evolution(days, warehouse, product_no) {
  const snaps = await runQuery(
    `SELECT id, snapshot_date FROM dbo.stock_snapshot WHERE status='OK' ORDER BY snapshot_date`
  );
  const cut = new Date();
  cut.setDate(cut.getDate() - Number(days || 30));
  const cutIso = cut.toISOString().slice(0, 10);
  const points = [];
  for (const s of snaps.recordset || []) {
    const date = isoDate(s.snapshot_date);
    if (!date || date < cutIso) continue;
    let text = `SELECT COALESCE(SUM(kg),0) kg, COALESCE(SUM(boxes),0) boxes
                FROM dbo.stock_snapshot_line WHERE snapshot_id=@id`;
    const inputs = { id: s.id };
    if (warehouse) {
      text += " AND warehouse=@warehouse";
      inputs.warehouse = warehouse;
    }
    if (product_no) {
      text += " AND product_no=@product_no";
      inputs.product_no = product_no;
    }
    const tot = (await runQuery(text, inputs)).recordset[0];
    points.push({ date, kg: Number(tot.kg || 0), boxes: Number(tot.boxes || 0) });
  }
  return points;
}

export async function findUserByEmail(email) {
  const r = await runQuery("SELECT * FROM dbo.app_user WHERE LOWER(email)=LOWER(@email)", {
    email: String(email || "").trim(),
  });
  return r.recordset?.[0] || null;
}

export async function getUserById(id) {
  const r = await runQuery("SELECT * FROM dbo.app_user WHERE id=@id", { id });
  return r.recordset?.[0] || null;
}

export async function listUsers() {
  const r = await runQuery("SELECT id, email, name, role, active, created_at FROM dbo.app_user ORDER BY id");
  return (r.recordset || []).map((u) => ({ ...u, active: Boolean(u.active) }));
}

export async function createUser({ email, name, password, role = "consulta" }) {
  const mail = String(email || "").trim().toLowerCase();
  if (!mail || !password) throw new Error("Email y contraseña son obligatorios");
  if (await findUserByEmail(mail)) throw new Error("Ya existe un usuario con ese email");
  const ins = await runQuery(
    `INSERT INTO dbo.app_user(email,name,password_hash,role,active)
     OUTPUT INSERTED.id
     VALUES (@email,@name,@hash,@role,1)`,
    {
      email: mail,
      name: String(name || "").trim() || mail,
      hash: hashPassword(password),
      role: role === "admin" ? "admin" : "consulta",
    }
  );
  return publicUser(await getUserById(ins.recordset[0].id));
}

export async function updateUser(id, patch) {
  const user = await getUserById(id);
  if (!user) throw new Error("Usuario no encontrado");
  const name = patch.name != null ? String(patch.name).trim() : user.name;
  const role = patch.role === "admin" || patch.role === "consulta" ? patch.role : user.role;
  const active = patch.active == null ? (user.active ? 1 : 0) : patch.active ? 1 : 0;
  const hash = patch.password ? hashPassword(patch.password) : user.password_hash;
  await runQuery(
    "UPDATE dbo.app_user SET name=@name, role=@role, active=@active, password_hash=@hash WHERE id=@id",
    { name, role, active, hash, id }
  );
  return publicUser(await getUserById(id));
}

export async function loginUser(email, password) {
  const user = await findUserByEmail(email);
  if (!user || !user.active || !verifyPassword(password, user.password_hash)) return null;
  const token = newToken();
  const expires = Date.now() + 7 * 24 * 60 * 60 * 1000;
  await runQuery("INSERT INTO dbo.app_session(token,user_id,expires_at) VALUES (@token,@userId,@expires)", {
    token,
    userId: user.id,
    expires,
  });
  return { token, user: publicUser(user), expires_at: expires };
}

export async function sessionByToken(token) {
  if (!token) return null;
  const r = await runQuery("SELECT * FROM dbo.app_session WHERE token=@token", { token });
  const row = r.recordset?.[0];
  if (!row || Number(row.expires_at) < Date.now()) {
    if (row) await runQuery("DELETE FROM dbo.app_session WHERE token=@token", { token });
    return null;
  }
  const user = await getUserById(row.user_id);
  if (!user || !user.active) return null;
  return { token, user: publicUser(user) };
}

export async function logoutToken(token) {
  if (token) await runQuery("DELETE FROM dbo.app_session WHERE token=@token", { token });
}

export async function listAccessRequests() {
  const r = await runQuery("SELECT TOP 100 * FROM dbo.access_request ORDER BY id DESC");
  return r.recordset || [];
}

export async function createAccessRequest({ name, email, note }) {
  const mail = String(email || "").trim().toLowerCase();
  if (!mail) throw new Error("Indique un email");
  await runQuery(
    "INSERT INTO dbo.access_request(name,email,note,status) VALUES (@name,@email,@note,'pending')",
    { name: String(name || "").trim(), email: mail, note: String(note || "").trim() }
  );
}

export async function setAccessRequestStatus(id, status) {
  await runQuery("UPDATE dbo.access_request SET status=@status WHERE id=@id", { status, id });
}
