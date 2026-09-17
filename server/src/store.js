import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { config } from "./config.js";
import { hashPassword, newToken, publicUser, verifyPassword } from "./auth.js";

fs.mkdirSync(path.dirname(config.sqlitePath), { recursive: true });

export const db = new DatabaseSync(config.sqlitePath);

db.exec(`
CREATE TABLE IF NOT EXISTS warehouse (
  code TEXT PRIMARY KEY,
  name TEXT DEFAULT '',
  active INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS app_config (
  key TEXT PRIMARY KEY,
  value TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS stock_snapshot (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_date TEXT NOT NULL UNIQUE,
  snapshot_time TEXT NOT NULL,
  status TEXT DEFAULT 'OK',
  records_processed INTEGER DEFAULT 0,
  error_message TEXT DEFAULT '',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS stock_snapshot_line (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_id INTEGER NOT NULL,
  warehouse TEXT,
  product_no TEXT,
  product_description TEXT,
  lot_no TEXT,
  packing_date TEXT,
  harvest_date TEXT,
  expiry_date TEXT,
  quantity REAL,
  remaining_quantity REAL,
  boxes REAL,
  kg REAL
);
CREATE INDEX IF NOT EXISTS ix_line_snap ON stock_snapshot_line(snapshot_id, warehouse, product_no);
CREATE TABLE IF NOT EXISTS execution_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  execution_date TEXT,
  execution_time TEXT,
  status TEXT,
  records_processed INTEGER,
  error_message TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS app_user (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  name TEXT DEFAULT '',
  password_hash TEXT NOT NULL,
  role TEXT DEFAULT 'consulta',
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS app_session (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS access_request (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT DEFAULT '',
  email TEXT NOT NULL,
  note TEXT DEFAULT '',
  status TEXT DEFAULT 'pending',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
`);

const defaults = [
  ["E", "Empaque"],
  ["G", "Bergondo"],
  ["J", "J"],
  ["V3", "V3"],
  ["W", "W"],
  ["Z", "Z"],
];
const insWh = db.prepare("INSERT OR IGNORE INTO warehouse(code,name,active) VALUES (?,?,1)");
for (const [code, name] of defaults) insWh.run(code, name);

const insCfg = db.prepare("INSERT OR IGNORE INTO app_config(key,value) VALUES (?,?)");
insCfg.run("snapshot_hour", String(config.snapshotHour));
insCfg.run("snapshot_minute", String(config.snapshotMinute));
insCfg.run("expiry_warning_days", "7");
insCfg.run("age_buckets", "0-7,8-15,16-30,31-60,61+");
insCfg.run("active_warehouses", "E,G,J,V3,W");
db.prepare("UPDATE app_config SET value='7' WHERE key='expiry_warning_days'").run();
db.prepare("UPDATE app_config SET value='E,G,J,V3,W' WHERE key='active_warehouses'").run();

export function getConfig() {
  const cfg = Object.fromEntries(db.prepare("SELECT key, value FROM app_config").all().map((r) => [r.key, r.value]));
  const warehouses = db.prepare("SELECT code, name, active FROM warehouse ORDER BY code").all();
  return { config: cfg, warehouses };
}

export function warningDays() {
  const row = db.prepare("SELECT value FROM app_config WHERE key='expiry_warning_days'").get();
  return Number(row?.value || config.expiryWarningDays);
}

export function listSnapshots() {
  return db
    .prepare(
      "SELECT id, snapshot_date AS date, snapshot_time AS time, status, records_processed AS records, error_message AS error FROM stock_snapshot ORDER BY snapshot_date DESC"
    )
    .all();
}

export function getSnapshot(id) {
  return db.prepare("SELECT * FROM stock_snapshot WHERE id=?").get(id);
}

export function snapshotLines(id) {
  return db.prepare("SELECT * FROM stock_snapshot_line WHERE snapshot_id=?").all(id);
}

export function latestOkSnapshot() {
  return db.prepare("SELECT * FROM stock_snapshot WHERE status='OK' ORDER BY snapshot_date DESC, id DESC LIMIT 1").get();
}

export function logExecution(status, records, error = "") {
  const now = new Date();
  const d = now.toISOString().slice(0, 10);
  const t = now.toTimeString().slice(0, 8);
  db.prepare(
    "INSERT INTO execution_log(execution_date,execution_time,status,records_processed,error_message) VALUES (?,?,?,?,?)"
  ).run(d, t, status, records, error || "");
}

export function saveSnapshot(date, time, rows, { replace = false } = {}) {
  const existing = db.prepare("SELECT * FROM stock_snapshot WHERE snapshot_date=?").get(date);
  if (existing && existing.status === "OK" && !replace) {
    logExecution("SKIPPED", existing.records_processed, "Ya existe fotografia de hoy");
    return existing;
  }
  const tx = db.transaction(() => {
    let id;
    if (existing) {
      db.prepare("DELETE FROM stock_snapshot_line WHERE snapshot_id=?").run(existing.id);
      db.prepare(
        "UPDATE stock_snapshot SET snapshot_time=?, status='OK', records_processed=?, error_message='' WHERE id=?"
      ).run(time, rows.length, existing.id);
      id = existing.id;
    } else {
      const info = db
        .prepare(
          "INSERT INTO stock_snapshot(snapshot_date,snapshot_time,status,records_processed,error_message) VALUES (?,?,?,?,?)"
        )
        .run(date, time, "OK", rows.length, "");
      id = Number(info.lastInsertRowid);
    }
    const ins = db.prepare(
      `INSERT INTO stock_snapshot_line(snapshot_id,warehouse,product_no,product_description,lot_no,packing_date,harvest_date,expiry_date,quantity,remaining_quantity,boxes,kg)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
    );
    for (const r of rows) {
      ins.run(
        id,
        r.warehouse,
        r.product_no,
        r.product_description,
        r.lot_no,
        r.packing_date,
        r.harvest_date,
        r.expiry_date,
        r.quantity,
        r.remaining_quantity,
        r.boxes,
        r.kg
      );
    }
    return getSnapshot(id);
  });
  const snap = tx();
  logExecution("OK", rows.length, "");
  return snap;
}

export function saveErrorSnapshot(date, time, error) {
  const existing = db.prepare("SELECT * FROM stock_snapshot WHERE snapshot_date=?").get(date);
  if (existing) {
    db.prepare("UPDATE stock_snapshot SET status='ERROR', error_message=?, snapshot_time=? WHERE id=?").run(
      error.slice(0, 2000),
      time,
      existing.id
    );
  } else {
    db.prepare(
      "INSERT INTO stock_snapshot(snapshot_date,snapshot_time,status,records_processed,error_message) VALUES (?,?,?,?,?)"
    ).run(date, time, "ERROR", 0, error.slice(0, 2000));
  }
  logExecution("ERROR", 0, error.slice(0, 2000));
}

export function listLogs() {
  return db
    .prepare(
      "SELECT id, execution_date AS date, execution_time AS time, status, records_processed AS records, error_message AS error FROM execution_log ORDER BY id DESC LIMIT 200"
    )
    .all();
}

export function evolution(days, warehouse, product_no) {
  const snaps = db
    .prepare("SELECT id, snapshot_date AS date FROM stock_snapshot WHERE status='OK' ORDER BY snapshot_date")
    .all();
  const cut = new Date();
  cut.setDate(cut.getDate() - days);
  const cutIso = cut.toISOString().slice(0, 10);
  const points = [];
  for (const s of snaps.filter((x) => x.date >= cutIso)) {
    let sql = "SELECT COALESCE(SUM(kg),0) kg, COALESCE(SUM(boxes),0) boxes FROM stock_snapshot_line WHERE snapshot_id=?";
    const params = [s.id];
    if (warehouse) {
      sql += " AND warehouse=?";
      params.push(warehouse);
    }
    if (product_no) {
      sql += " AND product_no=?";
      params.push(product_no);
    }
    const tot = db.prepare(sql).get(...params);
    points.push({ date: s.date, kg: tot.kg, boxes: tot.boxes });
  }
  return points;
}

function seedUsers() {
  const count = db.prepare("SELECT COUNT(*) AS n FROM app_user").get().n;
  if (count) return;
  const ins = db.prepare(
    "INSERT INTO app_user(email,name,password_hash,role,active) VALUES (?,?,?,?,1)"
  );
  ins.run("admin@ssf.demo", "Administrador", hashPassword("Demo1234!"), "admin");
  ins.run("consulta@ssf.demo", "Consulta stock", hashPassword("Demo1234!"), "consulta");
}
seedUsers();

export function findUserByEmail(email) {
  return db.prepare("SELECT * FROM app_user WHERE lower(email)=lower(?)").get(String(email || "").trim());
}

export function getUserById(id) {
  return db.prepare("SELECT * FROM app_user WHERE id=?").get(id);
}

export function listUsers() {
  return db
    .prepare("SELECT id, email, name, role, active, created_at FROM app_user ORDER BY id")
    .all()
    .map((u) => ({ ...u, active: Boolean(u.active) }));
}

export function createUser({ email, name, password, role = "consulta" }) {
  const mail = String(email || "").trim().toLowerCase();
  if (!mail || !password) throw new Error("Email y contraseña son obligatorios");
  if (findUserByEmail(mail)) throw new Error("Ya existe un usuario con ese email");
  const info = db
    .prepare("INSERT INTO app_user(email,name,password_hash,role,active) VALUES (?,?,?,?,1)")
    .run(mail, String(name || "").trim() || mail, hashPassword(password), role === "admin" ? "admin" : "consulta");
  return publicUser(getUserById(Number(info.lastInsertRowid)));
}

export function updateUser(id, patch) {
  const user = getUserById(id);
  if (!user) throw new Error("Usuario no encontrado");
  const name = patch.name != null ? String(patch.name).trim() : user.name;
  const role = patch.role === "admin" || patch.role === "consulta" ? patch.role : user.role;
  const active = patch.active == null ? user.active : patch.active ? 1 : 0;
  let hash = user.password_hash;
  if (patch.password) hash = hashPassword(patch.password);
  db.prepare("UPDATE app_user SET name=?, role=?, active=?, password_hash=? WHERE id=?").run(name, role, active, hash, id);
  return publicUser(getUserById(id));
}

export function loginUser(email, password) {
  const user = findUserByEmail(email);
  if (!user || !user.active || !verifyPassword(password, user.password_hash)) return null;
  const token = newToken();
  const expires = Date.now() + 7 * 24 * 60 * 60 * 1000;
  db.prepare("INSERT INTO app_session(token,user_id,expires_at) VALUES (?,?,?)").run(token, user.id, expires);
  return { token, user: publicUser(user), expires_at: expires };
}

export function sessionByToken(token) {
  if (!token) return null;
  const row = db.prepare("SELECT * FROM app_session WHERE token=?").get(token);
  if (!row || row.expires_at < Date.now()) {
    if (row) db.prepare("DELETE FROM app_session WHERE token=?").run(token);
    return null;
  }
  const user = getUserById(row.user_id);
  if (!user || !user.active) return null;
  return { token, user: publicUser(user) };
}

export function logoutToken(token) {
  if (token) db.prepare("DELETE FROM app_session WHERE token=?").run(token);
}

export function listAccessRequests() {
  return db.prepare("SELECT * FROM access_request ORDER BY id DESC LIMIT 100").all();
}

export function createAccessRequest({ name, email, note }) {
  const mail = String(email || "").trim().toLowerCase();
  if (!mail) throw new Error("Indique un email");
  db.prepare("INSERT INTO access_request(name,email,note,status) VALUES (?,?,?,'pending')").run(
    String(name || "").trim(),
    mail,
    String(note || "").trim()
  );
}

export function setAccessRequestStatus(id, status) {
  db.prepare("UPDATE access_request SET status=? WHERE id=?").run(status, id);
}
