import fs from "node:fs";
import path from "node:path";
import sql from "mssql";
import { config, ROOT } from "./config.js";

function azureConfig() {
  if (!config.app.server) throw new Error("APP_SQL_SERVER no configurado");
  return {
    server: config.app.server,
    database: config.app.database,
    user: config.app.user,
    password: config.app.password,
    options: { encrypt: true, trustServerCertificate: true },
    requestTimeout: 180000,
    connectionTimeout: 30000,
    pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
  };
}

let pool;

export async function appPool() {
  if (!pool) {
    pool = new sql.ConnectionPool(azureConfig());
    await pool.connect();
  }
  return pool;
}

export async function runQuery(text, inputs = {}) {
  const p = await appPool();
  const req = p.request();
  for (const [name, value] of Object.entries(inputs)) req.input(name, value);
  return req.query(text);
}

export async function ensureSchema() {
  const schema = fs.readFileSync(path.join(ROOT, "sql", "stockflow_schema.sql"), "utf8");
  await runQuery(schema);
}

export { sql };
