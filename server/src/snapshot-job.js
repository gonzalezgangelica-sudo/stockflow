import { pathToFileURL } from "node:url";
import { fetchLiveStock } from "./bc.js";
import { nowTime, todayISO } from "./domain.js";
import { initStore, saveErrorSnapshot, saveSnapshot } from "./store.js";
import { closePool } from "./appdb.js";

/** Foto fija 05:00: lee ILE de BC y guarda por almacén en Azure SQL. */
export async function runDailySnapshot(replace = false) {
  await initStore();
  const date = todayISO();
  const time = nowTime();
  try {
    const rows = await fetchLiveStock();
    const snap = await saveSnapshot(date, time, rows, { replace });
    return {
      id: snap.id,
      date: snap.snapshot_date,
      time: snap.snapshot_time,
      status: snap.status,
      records: snap.records_processed,
      error: snap.error_message,
    };
  } catch (err) {
    await saveErrorSnapshot(date, time, err.message);
    throw err;
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  runDailySnapshot(process.argv.includes("--replace"))
    .then(async (snap) => {
      console.log(`Foto fija ${snap.status}: ${snap.date} ${snap.time} · ${snap.records} registros`);
      await closePool();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error("Foto fija ERROR:", err.message);
      try {
        await closePool();
      } catch {
        /* ignore */
      }
      process.exit(1);
    });
}
