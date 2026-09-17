const views = [
  ["dashboard", "Dashboard"],
  ["vivo", "Stock vivo"],
  ["historico", "Stock histórico"],
  ["evolucion", "Evolución"],
  ["caducidades", "Caducidades"],
  ["analisis", "Análisis"],
  ["comparacion", "Inicial vs vivo"],
  ["config", "Configuración"],
  ["logs", "Logs"],
];

const state = { view: "dashboard", warehouse: "", product_no: "" };
const $ = (id) => document.getElementById(id);
const viewEl = $("view");

function fmt(n, d = 1) {
  if (n == null || n === "") return "—";
  return Number(n).toLocaleString("es-ES", { maximumFractionDigits: d, minimumFractionDigits: d });
}
function fmtDate(v) {
  if (!v) return "—";
  const p = String(v).slice(0, 10).split("-");
  if (p.length !== 3) return v;
  return `${p[2]}/${p[1]}/${p[0]}`;
}
function badge(status) {
  const cls = String(status || "").split(" ")[0];
  return `<span class="badge ${cls}">${status || ""}</span>`;
}
function qs() {
  const p = new URLSearchParams();
  if (state.warehouse) p.set("warehouse", state.warehouse);
  if (state.product_no) p.set("product_no", state.product_no);
  const s = p.toString();
  return s ? `?${s}` : "";
}
async function api(path, opts) {
  const res = await fetch(`/api${path}`, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || data.message || res.statusText);
  return data;
}
function kpis(s) {
  const st = s.by_status || {};
  return `
    <div class="kpis">
      <div class="card"><span>Stock total kg</span><strong>${fmt(s.kg)}</strong></div>
      <div class="card"><span>Cajas</span><strong>${fmt(s.boxes, 0)}</strong></div>
      <div class="card"><span>Productos</span><strong>${s.products}</strong></div>
      <div class="card"><span>Lotes</span><strong>${s.lots}</strong></div>
      <div class="card"><span>Caducado</span><strong>${fmt((st.Caducado || {}).kg || 0)}</strong></div>
      <div class="card"><span>Próximo a caducar</span><strong>${fmt((st["Proximo a caducar"] || {}).kg || 0)}</strong></div>
      <div class="card"><span>Correcto</span><strong>${fmt((st.Correcto || {}).kg || 0)}</strong></div>
    </div>`;
}
function lineChart(points, key = "kg") {
  if (!points || !points.length) return `<p class="muted">Sin histórico todavía. Pulse «Fotografiar ahora».</p>`;
  const w = 640, h = 220, p = 28;
  const vals = points.map((x) => Number(x[key] || 0));
  const min = Math.min(...vals), max = Math.max(...vals);
  const span = max - min || 1;
  const coords = points.map((pt, i) => {
    const x = p + (i * (w - 2 * p)) / Math.max(points.length - 1, 1);
    const y = h - p - ((Number(pt[key] || 0) - min) / span) * (h - 2 * p);
    return `${x},${y}`;
  });
  const labels = [points[0].date, points[Math.floor(points.length / 2)].date, points[points.length - 1].date]
    .map(fmtDate)
    .join(" · ");
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
    <polyline fill="none" stroke="#173a4a" stroke-width="2" points="${coords.join(" ")}" />
    </svg><p class="muted">${labels} · ${key}</p>`;
}
function table(headers, rows) {
  return `<div style="overflow:auto"><table><thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead>
    <tbody>${rows.join("")}</tbody></table></div>`;
}

async function renderDashboard() {
  const extra = qs();
  const d = await api(extra ? `/dashboard${extra}&days=30` : `/dashboard?days=30`);
  $("subtitle").textContent = d.snapshot_date
    ? `Vivo ahora · fotografía ${fmtDate(d.snapshot_date)} · variación ${fmt(d.variation_kg)} kg`
    : "Aún no hay fotografía de las 05:00";
  const whRows = (d.warehouses || []).map((w) =>
    `<tr><td>${w.warehouse}</td><td class="num">${fmt(w.boxes, 0)}</td><td class="num">${fmt(w.kg)}</td><td class="num">${w.products}</td><td class="num">${fmt(w.proximo_kg)}</td><td class="num">${fmt(w.caducado_kg)}</td></tr>`
  );
  viewEl.innerHTML = `
    ${!d.live_ok ? `<p class="err">Stock vivo no disponible: ${d.live_error}. Se muestra la última fotografía.</p>` : ""}
    ${kpis(d.kpis)}
    <div class="grid2">
      <div class="card"><span>Evolución 30 días</span>${lineChart(d.evolution)}</div>
      <div class="card"><span>Stock por almacén</span>
        ${table(["Almacén", "Cajas", "Kg", "Productos", "Próximo kg", "Caducado kg"], whRows)}
      </div>
    </div>`;
}

async function renderVivo() {
  const d = await api(`/stock/live${qs()}`);
  $("subtitle").textContent = `Fuente actual · ${d.rows.length} líneas · inicial ${fmtDate(d.initial_snapshot_date)}`;
  const rows = d.rows.slice(0, 400).map((r) =>
    `<tr><td>${r.warehouse}</td><td>${r.product_no}</td><td>${r.product_description}</td><td>${r.lot_no || "—"}</td>
     <td>${fmtDate(r.packing_date)}</td><td>${fmtDate(r.expiry_date)}</td>
     <td class="num">${fmt(r.boxes, 0)}</td><td class="num">${fmt(r.kg)}</td>
     <td>${r.days_to_expiry ?? "—"}</td><td>${badge(r.expiry_status)}</td></tr>`
  );
  viewEl.innerHTML = `${kpis(d.summary)}${table(
    ["Almacén", "Item", "Producto", "Lote", "Empaque", "Caducidad", "Cajas", "Kg", "Días", "Estado"],
    rows
  )}${d.rows.length > 400 ? `<p class="muted">Mostrando 400 de ${d.rows.length} líneas.</p>` : ""}`;
}

async function renderHistorico() {
  const snaps = await api("/snapshots");
  if (!snaps.length) {
    viewEl.innerHTML = `<p>No hay fotografías. Pulse «Fotografiar ahora» para crear la de hoy.</p>`;
    return;
  }
  const first = snaps.find((s) => s.status === "OK") || snaps[0];
  const d = await api(`/snapshots/${first.id}${qs()}`);
  const list = snaps.map((s) =>
    `<tr><td>${fmtDate(s.date)}</td><td>${s.time}</td><td>${badge(s.status)}</td><td class="num">${s.records}</td><td>${s.error || ""}</td></tr>`
  );
  $("subtitle").textContent = `Última OK: ${fmtDate(d.date)} ${d.time} · inmutable`;
  viewEl.innerHTML = `${kpis(d.summary)}
    <div class="card"><span>Fotografías diarias 05:00</span>${table(["Fecha", "Hora", "Estado", "Registros", "Error"], list)}</div>`;
}

async function renderEvolucion() {
  const d = await api(`/evolution?days=30${state.warehouse ? `&warehouse=${state.warehouse}` : ""}${state.product_no ? `&product_no=${state.product_no}` : ""}`);
  const mov = (d.movement || []).map((m) =>
    `<tr><td>${fmtDate(m.date)}</td><td class="num">${fmt(m.stock_inicial)}</td><td class="num">${fmt(m.stock_final)}</td><td class="num">${fmt(m.variacion)}</td></tr>`
  );
  viewEl.innerHTML = `<div class="card">${lineChart(d.points)}</div>
    ${table(["Fecha", "Stock inicial kg", "Stock final kg", "Variación"], mov)}`;
}

async function renderCaducidades() {
  const d = await api(`/expiry${qs()}`);
  const rows = d.rows.map((r) =>
    `<tr><td>${r.warehouse}</td><td>${r.product_no}</td><td>${r.product_description}</td>
     <td>${fmtDate(r.expiry_date)}</td><td class="num">${r.days_to_expiry ?? "—"}</td>
     <td>${badge(r.expiry_status)}</td><td class="num">${fmt(r.kg)}</td></tr>`
  );
  viewEl.innerHTML = `${kpis(d.summary)}${table(
    ["Almacén", "Item", "Producto", "Caducidad", "Días", "Estado", "Kg"],
    rows
  )}`;
}

async function renderAnalisis() {
  const d = await api(`/analysis/packing${qs()}`);
  const pack = d.packing.map((p) =>
    `<tr><td>${fmtDate(p.packing_date)}</td><td class="num">${fmt(p.kg)}</td><td class="num">${fmt(p.boxes, 0)}</td><td class="num">${p.pct}%</td></tr>`
  );
  const age = d.age.map((a) =>
    `<tr><td>${a.bucket}</td><td class="num">${fmt(a.kg)}</td><td class="num">${fmt(a.boxes, 0)}</td><td class="num">${a.count}</td></tr>`
  );
  viewEl.innerHTML = `<div class="grid2">
    <div class="card"><span>Stock por fecha de empaque</span>${table(["Empaque", "Kg", "Cajas", "%"], pack)}</div>
    <div class="card"><span>Antigüedad desde empaque</span>${table(["Tramo", "Kg", "Cajas", "Líneas"], age)}</div>
  </div>`;
}

async function renderComparacion() {
  const d = await api(`/compare${qs()}`);
  $("subtitle").textContent = `Fotografía ${fmtDate(d.snapshot_date)} ${d.snapshot_time} vs stock vivo`;
  const rows = d.rows.slice(0, 200).map((r) =>
    `<tr><td>${r.product_no}</td><td>${r.product_description}</td><td>${r.warehouse}</td>
     <td class="num">${fmt(r.kg_inicial)}</td><td class="num">${fmt(r.kg_vivo)}</td>
     <td class="num">${fmt(r.kg_diff)}</td><td class="num">${r.pct == null ? "—" : r.pct + "%"}</td></tr>`
  );
  viewEl.innerHTML = `${kpis(d.live)}
    ${table(["Producto", "Descripción", "Almacén", "Kg 05:00", "Kg vivo", "Dif.", "%"], rows)}`;
}

async function renderConfig() {
  const d = await api("/config");
  const c = d.config || {};
  viewEl.innerHTML = `<div class="card">
    <p>Hora de fotografía: <strong>${c.snapshot_hour}:${String(c.snapshot_minute || "0").padStart(2, "0")}</strong></p>
    <p>Días alerta caducidad: <strong>${c.expiry_warning_days}</strong></p>
    <p>Tramos antigüedad: <strong>${c.age_buckets}</strong></p>
    <p>Almacenes activos: <strong>${c.active_warehouses}</strong></p>
    <p class="muted">La fotografía diaria no se modifica una vez OK. Si falla, se puede repetir el mismo día.</p>
    ${table(["Código", "Nombre", "Activo"], d.warehouses.map((w) => `<tr><td>${w.code}</td><td>${w.name}</td><td>${w.active ? "Sí" : "No"}</td></tr>`))}
  </div>`;
}

async function renderLogs() {
  const rows = await api("/logs");
  viewEl.innerHTML = table(
    ["Fecha", "Hora", "Estado", "Registros", "Error"],
    rows.map((r) => `<tr><td>${fmtDate(r.date)}</td><td>${r.time}</td><td>${badge(r.status)}</td><td class="num">${r.records}</td><td>${r.error || ""}</td></tr>`)
  );
}

const renderers = {
  dashboard: renderDashboard,
  vivo: renderVivo,
  historico: renderHistorico,
  evolucion: renderEvolucion,
  caducidades: renderCaducidades,
  analisis: renderAnalisis,
  comparacion: renderComparacion,
  config: renderConfig,
  logs: renderLogs,
};

async function go(name) {
  state.view = name;
  document.querySelectorAll("nav button").forEach((b) => b.classList.toggle("active", b.dataset.view === name));
  $("title").textContent = views.find((v) => v[0] === name)[1];
  viewEl.innerHTML = `<p class="muted">Cargando…</p>`;
  try {
    await renderers[name]();
  } catch (err) {
    viewEl.innerHTML = `<p class="err">${err.message}</p>`;
  }
}

function buildNav() {
  $("nav").innerHTML = views.map(([id, label]) => `<button data-view="${id}">${label}</button>`).join("");
  $("nav").onclick = (e) => {
    const b = e.target.closest("button");
    if (b) go(b.dataset.view);
  };
}

async function loadWarehouses() {
  try {
    const d = await api("/config");
    const sel = $("warehouse");
    for (const w of d.warehouses.filter((x) => x.active)) {
      const o = document.createElement("option");
      o.value = w.code;
      o.textContent = `${w.code} · ${w.name}`;
      sel.appendChild(o);
    }
  } catch (_) {}
}

$("filters").onsubmit = (e) => {
  e.preventDefault();
  state.warehouse = $("warehouse").value;
  state.product_no = $("product_no").value.trim();
  go(state.view);
};
$("btnSnap").onclick = async () => {
  $("btnSnap").disabled = true;
  try {
    const r = await api("/snapshots/run", { method: "POST" });
    alert(`Fotografía ${r.status}: ${r.date} ${r.time} · ${r.records} registros`);
    go(state.view);
  } catch (err) {
    alert(err.message);
  } finally {
    $("btnSnap").disabled = false;
  }
};

buildNav();
loadWarehouses();
go("dashboard");
