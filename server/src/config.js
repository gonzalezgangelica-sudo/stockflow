import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, "../..");

function loadLegacyEnv(file) {
  if (!fs.existsSync(file)) return;
  const mapping = {
    "server name": "BC_SERVER",
    database: "BC_DATABASE",
    user: "BC_USER",
    password: "BC_PASSWORD",
  };
  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    if (line.includes("=") && !line.startsWith("server name")) {
      const idx = line.indexOf("=");
      const k = line.slice(0, idx).trim();
      const v = line.slice(idx + 1).trim().replace(/^['"]|['"]$/g, "");
      if (k && !process.env[k]) process.env[k] = v;
      continue;
    }
    if (!line.includes(":")) continue;
    const idx = line.indexOf(":");
    const mapped = mapping[line.slice(0, idx).trim().toLowerCase()];
    if (mapped && !process.env[mapped]) process.env[mapped] = line.slice(idx + 1).trim();
  }
}

dotenv.config({ path: path.join(ROOT, ".env") });
loadLegacyEnv(path.join("C:/Users/ACZ/.codex/CALCULO_BIOMASA", ".env"));
loadLegacyEnv(path.join(ROOT, ".env"));

export const config = {
  port: Number(process.env.PORT || 8000),
  host: process.env.HOST || "0.0.0.0",
  app: {
    server: process.env.APP_SQL_SERVER || "",
    database: process.env.APP_SQL_DATABASE || "",
    user: process.env.APP_SQL_USER || "",
    password: process.env.APP_SQL_PASSWORD || "",
  },
  bc: {
    server: process.env.BC_SERVER || "",
    database: process.env.BC_DATABASE || "",
    user: process.env.BC_USER || "",
    password: process.env.BC_PASSWORD || "",
  },
  snapshotHour: Number(process.env.SNAPSHOT_HOUR || 5),
  snapshotMinute: Number(process.env.SNAPSHOT_MINUTE || 0),
  expiryWarningDays: Number(process.env.EXPIRY_WARNING_DAYS || 7),
  timezone: process.env.TIMEZONE || "Europe/Madrid",
  sqlitePath: process.env.SQLITE_PATH || path.join(ROOT, "data", "stock_app.db"),
};
