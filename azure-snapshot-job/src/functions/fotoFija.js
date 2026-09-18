import { app } from "@azure/functions";
import { runDailySnapshot } from "stock-api/snapshot-job";

/** 05:00 Europe/Madrid. En la Function App: WEBSITE_TIME_ZONE=Romance Standard Time */
app.timer("fotoFija", {
  schedule: "0 0 5 * * *",
  handler: async (_timer, context) => {
    const snap = await runDailySnapshot(false);
    context.log(`Foto fija ${snap.status} ${snap.date} ${snap.time} registros=${snap.records}`);
  },
});
