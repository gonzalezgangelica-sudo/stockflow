import express from "express";
import cors from "cors";
import path from "node:path";
import { config, ROOT } from "./config.js";
import router, { startJobs } from "./routes.js";

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

startJobs();
app.listen(config.port, config.host, () => {
  console.log(`Stock Flow en http://${config.host}:${config.port} (foto fija 05:00 ${config.timezone})`);
});
