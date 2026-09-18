import express from "express";
import cors from "cors";
import path from "node:path";
import { config, ROOT } from "./config.js";
import router, { startJobs } from "./routes.js";
import { initStore } from "./store.js";

await initStore();

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use("/api", router);

const webDist = path.join(ROOT, "frontend", "dist");
app.use(express.static(webDist));
app.get(/^(?!\/api).*/, (_req, res) => {
  res.sendFile(path.join(webDist, "index.html"), (err) => {
    if (err) res.status(404).send("Frontend no compilado. Ejecuta npm run build en frontend/");
  });
});

if (process.env.SNAPSHOT_LOCAL_CRON === "1") startJobs();
app.listen(config.port, config.host, () => {
  const where = process.env.SNAPSHOT_LOCAL_CRON === "1" ? "cron local + Azure SQL" : "Azure Function 05:00 + Azure SQL";
  console.log(`Stock Flow en http://${config.host}:${config.port} (${where})`);
});
