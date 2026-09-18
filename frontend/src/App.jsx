import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  AppBar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  CssBaseline,
  Drawer,
  FormControl,
  InputLabel,
  LinearProgress,
  List,
  ListItemButton,
  ListItemText,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Toolbar,
  Typography,
} from "@mui/material";
import { api, clearSession, fmt, fmtDate, loadSession, saveSession, statusColor } from "./api.js";
import Cover from "./Cover.jsx";
import { downloadExcel, warehouseSheets } from "./excel.js";
import { NAVY, StoltMark } from "./brand.jsx";
import { useLang } from "./i18n.jsx";
import UserMenu from "./UserMenu.jsx";

const VIEW_IDS = [
  "dashboard",
  "vivo",
  "historico",
  "evolucion",
  "caducidades",
  "repetidas",
  "analisis",
  "comparacion",
  "config",
  "logs",
];

const DRAWER = 240;

function Kpis({ summary }) {
  const { t } = useLang();
  const st = summary?.by_status || {};
  const items = [
    [t("kpi_kg"), fmt(summary?.kg)],
    [t("kpi_boxes"), fmt(summary?.boxes, 0)],
    [t("kpi_products"), summary?.products ?? "—"],
    [t("kpi_lots"), summary?.lots ?? "—"],
    [t("kpi_expired"), fmt(st.Caducado?.kg || 0)],
    [t("kpi_near"), fmt(st["Proximo a caducar"]?.kg || 0)],
    [t("kpi_watch"), fmt(st["En seguimiento"]?.kg || 0)],
    [t("kpi_ok"), fmt(st.Correcto?.kg || 0)],
  ];
  return (
    <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 1.5, mb: 2 }}>
      {items.map(([label, value]) => (
        <Paper key={label} sx={{ p: 1.5 }}>
          <Typography variant="caption" color="text.secondary">
            {label}
          </Typography>
          <Typography variant="h6">{value}</Typography>
        </Paper>
      ))}
    </Box>
  );
}

function DataTable({ headers, rows, maxHeight = 460 }) {
  return (
    <Paper sx={{ overflow: "auto", maxHeight }}>
      <Table size="small" stickyHeader>
        <TableHead>
          <TableRow>
            {headers.map((h) => (
              <TableCell key={h} sx={{ fontWeight: 700 }}>
                {h}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>{rows}</TableBody>
      </Table>
    </Paper>
  );
}

function LineChart({ points, valueKey = "kg" }) {
  const { t } = useLang();
  if (!points?.length) {
    return <Typography color="text.secondary">{t("noHistory")}</Typography>;
  }
  const w = 640;
  const h = 220;
  const p = 28;
  const vals = points.map((x) => Number(x[valueKey] || 0));
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const coords = points.map((pt, i) => {
    const x = p + (i * (w - 2 * p)) / Math.max(points.length - 1, 1);
    const y = h - p - ((Number(pt[valueKey] || 0) - min) / span) * (h - 2 * p);
    return `${x},${y}`;
  });
  const labels = [points[0].date, points[Math.floor(points.length / 2)].date, points[points.length - 1].date]
    .map(fmtDate)
    .join(" · ");
  return (
    <Box>
      <Box component="svg" viewBox={`0 0 ${w} ${h}`} sx={{ width: "100%", height: 180 }}>
        <polyline fill="none" stroke="#173a4a" strokeWidth="2" points={coords.join(" ")} />
      </Box>
      <Typography variant="caption" color="text.secondary">
        {labels} · {valueKey}
      </Typography>
    </Box>
  );
}

function StatusChip({ status }) {
  const { t } = useLang();
  return <Chip size="small" label={t(status) || status || "—"} color={statusColor(status)} variant={status === "Sin fecha" ? "outlined" : "filled"} />;
}

function ExportButton({ filename, sheets }) {
  const { t } = useLang();
  if (!sheets?.length) return null;
  return (
    <Button
      size="small"
      variant="outlined"
      onClick={() => downloadExcel(filename, sheets)}
      sx={{ textTransform: "none", whiteSpace: "nowrap" }}
    >
      {t("exportExcel")}
    </Button>
  );
}

function stockHeaders(t) {
  return [t("col_product"), t("col_lots"), t("col_packing"), t("col_expiry"), t("col_boxes"), t("col_kg"), t("col_status")];
}

function stockRow(r, t) {
  return [
    `${r.product_no} ${r.product_description || ""}`.trim(),
    r.lot_count ?? r.lots ?? 0,
    fmtDate(r.packing_date),
    fmtDate(r.expiry_date),
    r.boxes,
    r.kg,
    t(r.expiry_status) || r.expiry_status,
  ];
}

function WarehouseTables({ sections, filename = "StockFlow" }) {
  const { t } = useLang();
  if (!sections?.length) {
    return <Alert severity="info">{t("noStock")}</Alert>;
  }
  const headers = stockHeaders(t);
  return (
    <Stack spacing={3}>
      <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
        <ExportButton filename={filename} sheets={warehouseSheets(sections, headers, (r) => stockRow(r, t))} />
      </Box>
      {sections.map((section) => (
        <Paper key={section.warehouse} sx={{ p: 2 }}>
          <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ sm: "center" }} sx={{ mb: 1.5 }} gap={1}>
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 800, letterSpacing: 0.4 }}>
                {t("warehouse")} {section.warehouse}
                {section.name && section.name !== section.warehouse ? ` · ${section.name}` : ""}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {t("boxesKgProducts", {
                  boxes: fmt(section.summary?.boxes, 0),
                  kg: fmt(section.summary?.kg),
                  products: section.summary?.products,
                })}
              </Typography>
            </Box>
            <ExportButton
              filename={`${filename}_${section.warehouse}`}
              sheets={[
                {
                  name: `Alm ${section.warehouse}`,
                  headers,
                  rows: (section.rows || []).map((r) => stockRow(r, t)),
                },
              ]}
            />
          </Stack>
          <DataTable
            headers={headers}
            rows={(section.rows || []).map((r, i) => (
              <TableRow key={`${section.warehouse}-${i}`}>
                <TableCell>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {r.product_no}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {r.product_description || "—"}
                  </Typography>
                </TableCell>
                <TableCell align="right">{r.lot_count ?? "—"}</TableCell>
                <TableCell>{fmtDate(r.packing_date)}</TableCell>
                <TableCell>{fmtDate(r.expiry_date)}</TableCell>
                <TableCell align="right">{fmt(r.boxes, 0)}</TableCell>
                <TableCell align="right">{fmt(r.kg)}</TableCell>
                <TableCell>
                  <StatusChip status={r.expiry_status} />
                </TableCell>
              </TableRow>
            ))}
          />
        </Paper>
      ))}
    </Stack>
  );
}

function UsersPanel() {
  const [data, setData] = useState({ users: [], requests: [] });
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "consulta" });
  const [msg, setMsg] = useState("");

  async function refresh() {
    const d = await api("/users");
    setData(d);
  }

  useEffect(() => {
    refresh().catch((err) => setMsg(err.message));
  }, []);

  async function create(e) {
    e.preventDefault();
    setMsg("");
    try {
      await api("/users", { method: "POST", body: JSON.stringify(form) });
      setForm({ name: "", email: "", password: "", role: "consulta" });
      await refresh();
      setMsg("Usuario creado.");
    } catch (err) {
      setMsg(err.message);
    }
  }

  async function toggleActive(u) {
    await api(`/users/${u.id}`, { method: "PATCH", body: JSON.stringify({ active: !u.active }) });
    await refresh();
  }

  return (
    <Stack spacing={3}>
      <Paper sx={{ p: 2 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
          Nuevo usuario
        </Typography>
        <Box component="form" onSubmit={create} sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr 1fr 140px auto" }, gap: 1.5 }}>
          <TextField size="small" label="Nombre" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <TextField size="small" label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          <TextField size="small" label="Contraseña" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
          <FormControl size="small">
            <InputLabel>Rol</InputLabel>
            <Select label="Rol" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <MenuItem value="consulta">Consulta</MenuItem>
              <MenuItem value="admin">Admin</MenuItem>
            </Select>
          </FormControl>
          <Button type="submit" variant="contained">
            Crear
          </Button>
        </Box>
        {msg && (
          <Alert severity={msg.includes("creado") ? "success" : "error"} sx={{ mt: 2 }}>
            {msg}
          </Alert>
        )}
      </Paper>
      <Paper sx={{ p: 2 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
          Usuarios
        </Typography>
        <DataTable
          headers={["Nombre", "Email", "Rol", "Estado", ""]}
          rows={(data.users || []).map((u) => (
            <TableRow key={u.id}>
              <TableCell>{u.name}</TableCell>
              <TableCell>{u.email}</TableCell>
              <TableCell>{u.role}</TableCell>
              <TableCell>{u.active ? "Activo" : "Inactivo"}</TableCell>
              <TableCell>
                <Button size="small" onClick={() => toggleActive(u)}>
                  {u.active ? "Desactivar" : "Activar"}
                </Button>
              </TableCell>
            </TableRow>
          ))}
        />
      </Paper>
      <Paper sx={{ p: 2 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
          Solicitudes de acceso
        </Typography>
        <DataTable
          headers={["Fecha", "Nombre", "Email", "Nota", "Estado"]}
          rows={(data.requests || []).map((r) => (
            <TableRow key={r.id}>
              <TableCell>{fmtDate(r.created_at)}</TableCell>
              <TableCell>{r.name}</TableCell>
              <TableCell>{r.email}</TableCell>
              <TableCell>{r.note || "—"}</TableCell>
              <TableCell>{r.status}</TableCell>
            </TableRow>
          ))}
        />
      </Paper>
    </Stack>
  );
}

export default function App() {
  const [user, setUser] = useState(() => loadSession()?.user || null);
  const [checking, setChecking] = useState(Boolean(loadSession()?.token));

  useEffect(() => {
    const session = loadSession();
    if (!session?.token) {
      setChecking(false);
      return;
    }
    api("/auth/me")
      .then((d) => {
        saveSession(session.token, d.user);
        setUser(d.user);
      })
      .catch(() => {
        clearSession();
        setUser(null);
      })
      .finally(() => setChecking(false));
  }, []);

  if (checking) {
    return (
      <Stack alignItems="center" justifyContent="center" sx={{ minHeight: "100vh" }}>
        <CircularProgress />
      </Stack>
    );
  }
  if (!user) {
    return <Cover onLogin={(u) => setUser(u)} />;
  }
  return (
    <StockApp
      user={user}
      onLogout={async () => {
        try {
          await api("/auth/logout", { method: "POST" });
        } catch {
          /* ignore */
        }
        clearSession();
        setUser(null);
      }}
    />
  );
}

function StockApp({ onLogout, user }) {
  const { t } = useLang();
  const [view, setView] = useState("dashboard");
  const [warehouse, setWarehouse] = useState("");
  const [product, setProduct] = useState("");
  const [warehouses, setWarehouses] = useState([]);
  const [subtitle, setSubtitle] = useState("Stock histórico frente a stock vivo");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [content, setContent] = useState(null);
  const [snapshotId, setSnapshotId] = useState(null);
  const refreshRef = useRef(false);

  const warehouseChoices = useMemo(() => {
    const preferred = ["E", "G", "V3", "J", "W", "Z"];
    const extra = warehouses.map((w) => w.code).filter((c) => !preferred.includes(c));
    return ["", ...preferred, ...extra];
  }, [warehouses]);

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    if (warehouse) p.set("warehouse", warehouse);
    if (product) p.set("product_no", product);
    const s = p.toString();
    return s ? `?${s}` : "";
  }, [warehouse, product]);

  const menuViews = [...VIEW_IDS, ...(user?.role === "admin" ? ["usuarios"] : [])].map((id) => [id, t(`nav_${id}`)]);
  const title = menuViews.find((v) => v[0] === view)?.[1] || "Stock Flow";

  const loadConfig = useCallback(async () => {
    try {
      const d = await api("/config");
      setWarehouses((d.warehouses || []).filter((w) => w.active));
    } catch {
      /* ignore */
    }
  }, []);

  const render = useCallback(async () => {
    setBusy(true);
    setError("");
    const forceRefresh = refreshRef.current;
    refreshRef.current = false;
    const liveParams = new URLSearchParams();
    if (warehouse) liveParams.set("warehouse", warehouse);
    if (product) liveParams.set("product_no", product);
    if (forceRefresh) liveParams.set("refresh", "1");
    const liveQs = liveParams.toString() ? `?${liveParams}` : "";
    try {
      if (view === "dashboard") {
        const extra = liveQs ? `${liveQs}&days=30` : "?days=30";
        const d = await api(`/dashboard${extra}`);
        setSubtitle(
          d.snapshot_date
            ? `Vivo ahora · fotografía ${fmtDate(d.snapshot_date)} · variación ${fmt(d.variation_kg)} kg`
            : "Aún no hay fotografía de las 05:00"
        );
        setContent(
          <Box>
            {!d.live_ok && <Alert severity="warning" sx={{ mb: 2 }}>Stock vivo no disponible: {d.live_error}</Alert>}
            <Alert severity="info" sx={{ mb: 2 }}>
              {d.definition}
            </Alert>
            <Kpis summary={d.kpis} />
            {(d.duplicates?.lot_count > 0 || d.duplicates?.extra_boxes > 0) && (
              <Alert
                severity="warning"
                sx={{ mb: 2, cursor: "pointer" }}
                onClick={() => setView("repetidas")}
              >
                {d.duplicates.lot_count} lote(s) repetido(s): el lote es el nº de caja y no debería repetirse.
                Cajas {fmt(d.duplicates.boxes, 0)} · lotes distintos {fmt(d.duplicates.unique_lots, 0)}
                {d.duplicates.extra_boxes ? ` · ${fmt(d.duplicates.extra_boxes, 0)} caja(s) de más` : ""}.
                Pulse para ver el detalle.
              </Alert>
            )}
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
              <Paper sx={{ p: 2 }}>
                <Typography variant="subtitle2" gutterBottom>
                  Evolución 30 días{warehouse ? ` · almacén ${warehouse}` : " · todos los almacenes"}
                </Typography>
                <LineChart points={d.evolution} />
              </Paper>
              <Paper sx={{ p: 2 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                  <Typography variant="subtitle2">
                    Stock por almacén — pulse para ver el detalle
                  </Typography>
                  <ExportButton
                    filename="StockFlow_dashboard_almacenes"
                    sheets={[
                      {
                        name: "Almacenes",
                        headers: ["Almacén", "Cajas", "Kg", "Productos", "Próximo kg", "Seguimiento kg", "Caducado kg"],
                        rows: (d.warehouses || []).map((w) => [
                          w.warehouse,
                          w.boxes,
                          w.kg,
                          w.products,
                          w.proximo_kg,
                          w.seguimiento_kg,
                          w.caducado_kg,
                        ]),
                      },
                    ]}
                  />
                </Stack>
                <DataTable
                  headers={["Almacén", "Cajas", "Kg", "Productos", "Próximo", "Seguim.", "Caducado"]}
                  rows={(d.warehouses || []).map((w) => (
                    <TableRow
                      key={w.warehouse}
                      hover
                      selected={warehouse === w.warehouse}
                      onClick={() => {
                        setWarehouse(w.warehouse);
                        setView("vivo");
                      }}
                      sx={{ cursor: "pointer" }}
                    >
                      <TableCell>{w.warehouse}</TableCell>
                      <TableCell align="right">{fmt(w.boxes, 0)}</TableCell>
                      <TableCell align="right">{fmt(w.kg)}</TableCell>
                      <TableCell align="right">{w.products}</TableCell>
                      <TableCell align="right">{fmt(w.proximo_kg)}</TableCell>
                      <TableCell align="right">{fmt(w.seguimiento_kg)}</TableCell>
                      <TableCell align="right">{fmt(w.caducado_kg)}</TableCell>
                    </TableRow>
                  ))}
                />
              </Paper>
            </Box>
          </Box>
        );
        return;
      }
      if (view === "vivo") {
        const d = await api(`/stock/live${liveQs}`);
        const nWh = (d.warehouses || []).length;
        const when = d.queried_at ? new Date(d.queried_at).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "";
        setSubtitle(
          warehouse
            ? `Stock vivo · almacén ${warehouse} · ${fmt(d.summary?.boxes, 0)} cajas${when ? ` · actualizado ${when}` : ""}`
            : `Stock vivo · ${nWh} almacenes · ${fmt(d.summary?.boxes, 0)} cajas${when ? ` · actualizado ${when}` : ""}`
        );
        setContent(
          <Box>
            <Alert severity="info" sx={{ mb: 2 }}>
              Stock en tiempo real de Business Central. Se refresca solo cada 5 minutos (no usa la foto de las 05:00).
            </Alert>
            {!warehouse && <Kpis summary={d.summary} />}
            <WarehouseTables sections={d.warehouses} filename={`StockFlow_vivo_${d.as_of || "hoy"}`} />
          </Box>
        );
        return;
      }
      if (view === "historico") {
        const snaps = await api("/snapshots");
        if (!snaps.length) {
          setSubtitle("Sin fotografías");
          setContent(<Alert severity="info">No hay fotografías todavía. La foto fija se guarda sola a las 05:00 en Azure.</Alert>);
          return;
        }
        const selected = snaps.find((s) => s.id === snapshotId) || snaps.find((s) => s.status === "OK") || snaps[0];
        const d = await api(`/snapshots/${selected.id}${qs}`);
        setSubtitle(
          `Foto fija ${fmtDate(d.date)} ${d.time}${warehouse ? ` · almacén ${warehouse}` : " · una tabla por almacén"}`
        );
        setContent(
          <Box>
            <Paper sx={{ p: 2, mb: 2 }}>
              <Typography variant="subtitle2" gutterBottom>
                Seleccione la fotografía
              </Typography>
              <DataTable
                maxHeight={220}
                headers={["Fecha", "Hora", "Estado", "Registros", "Error"]}
                rows={snaps.map((s) => (
                  <TableRow
                    key={s.id}
                    hover
                    selected={s.id === selected.id}
                    onClick={() => setSnapshotId(s.id)}
                    sx={{ cursor: "pointer" }}
                  >
                    <TableCell>{fmtDate(s.date)}</TableCell>
                    <TableCell>{s.time}</TableCell>
                    <TableCell>
                      <StatusChip status={s.status} />
                    </TableCell>
                    <TableCell align="right">{s.records}</TableCell>
                    <TableCell>{s.error || ""}</TableCell>
                  </TableRow>
                ))}
              />
            </Paper>
            {!warehouse && <Kpis summary={d.summary} />}
            <WarehouseTables sections={d.warehouses} filename={`StockFlow_foto_${d.date}`} />
          </Box>
        );
        return;
      }
      if (view === "evolucion") {
        const extra = [`days=30`, warehouse && `warehouse=${encodeURIComponent(warehouse)}`, product && `product_no=${encodeURIComponent(product)}`]
          .filter(Boolean)
          .join("&");
        const d = await api(`/evolution?${extra}`);
        setSubtitle(
          warehouse
            ? `Evolución exclusiva del almacén ${warehouse}`
            : "Evolución consolidada. Seleccione un almacén (E, G, W, J, Z…) para ver solo el suyo."
        );
        setContent(
          <Box>
            <Stack direction="row" justifyContent="flex-end" sx={{ mb: 1 }}>
              <ExportButton
                filename="StockFlow_evolucion"
                sheets={[
                  {
                    name: "Evolucion",
                    headers: ["Fecha", "Stock inicial kg", "Stock final kg", "Variación"],
                    rows: (d.movement || []).map((m) => [fmtDate(m.date), m.stock_inicial, m.stock_final, m.variacion]),
                  },
                ]}
              />
            </Stack>
            <Paper sx={{ p: 2, mb: 2 }}>
              <LineChart points={d.points} />
            </Paper>
            <DataTable
              headers={["Fecha", "Stock inicial kg", "Stock final kg", "Variación"]}
              rows={(d.movement || []).map((m) => (
                <TableRow key={m.date}>
                  <TableCell>{fmtDate(m.date)}</TableCell>
                  <TableCell align="right">{fmt(m.stock_inicial)}</TableCell>
                  <TableCell align="right">{fmt(m.stock_final)}</TableCell>
                  <TableCell align="right">{fmt(m.variacion)}</TableCell>
                </TableRow>
              ))}
            />
          </Box>
        );
        return;
      }
      if (view === "caducidades") {
        const d = await api(`/expiry${liveQs}`);
        setSubtitle("Caducado · próximo (0-7) · seguimiento (8-15) · sin fecha");
        setContent(
          <Box>
            <Stack direction="row" justifyContent="flex-end" sx={{ mb: 1 }}>
              <ExportButton
                filename="StockFlow_caducidades"
                sheets={[
                  {
                    name: "Caducidades",
                    headers: ["Almacén", "Item", "Producto", "Caducidad", "Días", "Estado", "Kg"],
                    rows: d.rows.map((r) => [
                      r.warehouse,
                      r.product_no,
                      r.product_description,
                      fmtDate(r.expiry_date),
                      r.days_to_expiry,
                      t(r.expiry_status) || r.expiry_status,
                      r.kg,
                    ]),
                  },
                ]}
              />
            </Stack>
            <Kpis summary={d.summary} />
            <DataTable
              headers={["Almacén", "Item", "Producto", "Caducidad", "Días", "Estado", "Kg"]}
              rows={d.rows.map((r, i) => (
                <TableRow key={i}>
                  <TableCell>{r.warehouse}</TableCell>
                  <TableCell>{r.product_no}</TableCell>
                  <TableCell>{r.product_description}</TableCell>
                  <TableCell>{fmtDate(r.expiry_date)}</TableCell>
                  <TableCell align="right">{r.days_to_expiry ?? "—"}</TableCell>
                  <TableCell>
                    <StatusChip status={r.expiry_status} />
                  </TableCell>
                  <TableCell align="right">{fmt(r.kg)}</TableCell>
                </TableRow>
              ))}
            />
          </Box>
        );
        return;
      }
      if (view === "repetidas") {
        const d = await api(`/analysis/duplicates${liveQs}`);
        const ok = !d.lot_count && !d.extra_boxes;
        setSubtitle(
          ok
            ? `Correcto: ${fmt(d.boxes, 0)} cajas = ${fmt(d.unique_lots, 0)} lotes (1 lote = 1 caja)`
            : `${d.lot_count} lote(s) repetido(s) · ${fmt(d.boxes, 0)} cajas · ${fmt(d.unique_lots, 0)} lotes distintos · ${fmt(d.extra_boxes, 0)} de más`
        );
        setContent(
          <Box>
            <Alert severity={ok ? "success" : "warning"} sx={{ mb: 2 }}>
              El lote es el número de caja. Un producto puede tener muchos lotes, uno por caja, pero el mismo lote no
              debe repetirse: nº de lotes = nº de cajas.
              {d.missing_lot_boxes ? ` Hay ${fmt(d.missing_lot_boxes, 0)} caja(s) sin lote.` : ""}
            </Alert>
            <Stack direction="row" justifyContent="flex-end" sx={{ mb: 1 }}>
              <ExportButton
                filename="StockFlow_cajas_repetidas"
                sheets={[
                  {
                    name: "Lotes repetidos",
                    headers: ["Lote (nº caja)", "Almacén", "Producto", "Descripción", "Líneas ILE", "Cajas", "Cajas de más", "Kg"],
                    rows: (d.lots || []).map((r) => [
                      r.lot_no,
                      r.warehouse,
                      r.product_no,
                      r.product_description,
                      r.lines,
                      r.boxes,
                      r.extra_boxes,
                      r.kg,
                    ]),
                  },
                ]}
              />
            </Stack>
            {(d.lots || []).length ? (
              <DataTable
                headers={["Lote (nº caja)", "Almacén", "Producto", "Descripción", "Líneas ILE", "Cajas", "De más", "Kg"]}
                rows={(d.lots || []).slice(0, 800).map((r) => (
                  <TableRow key={r.lot_no} sx={{ bgcolor: "warning.light" }}>
                    <TableCell>{r.lot_no}</TableCell>
                    <TableCell>{r.warehouse}</TableCell>
                    <TableCell>{r.product_no}</TableCell>
                    <TableCell>{r.product_description}</TableCell>
                    <TableCell align="right">{r.lines}</TableCell>
                    <TableCell align="right">{fmt(r.boxes, 0)}</TableCell>
                    <TableCell align="right">{fmt(r.extra_boxes, 0)}</TableCell>
                    <TableCell align="right">{fmt(r.kg)}</TableCell>
                  </TableRow>
                ))}
              />
            ) : (
              <Alert severity="success">Ningún lote está repetido. Cada caja tiene su propio número de lote.</Alert>
            )}
          </Box>
        );
        return;
      }
      if (view === "analisis") {
        const d = await api(`/analysis/packing${liveQs}`);
        setSubtitle("Antigüedad y fecha de empaque");
        setContent(
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
            <Paper sx={{ p: 2 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography variant="subtitle2" gutterBottom>
                  Stock por fecha de empaque
                </Typography>
                <ExportButton
                  filename="StockFlow_analisis"
                  sheets={[
                    {
                      name: "Empaque",
                      headers: ["Empaque", "Kg", "Cajas", "%"],
                      rows: d.packing.map((p) => [fmtDate(p.packing_date), p.kg, p.boxes, p.pct]),
                    },
                    {
                      name: "Antiguedad",
                      headers: ["Tramo", "Kg", "Cajas", "Lineas"],
                      rows: d.age.map((a) => [a.bucket, a.kg, a.boxes, a.count]),
                    },
                  ]}
                />
              </Stack>
              <DataTable
                headers={["Empaque", "Kg", "Cajas", "%"]}
                rows={d.packing.map((p) => (
                  <TableRow key={p.packing_date}>
                    <TableCell>{fmtDate(p.packing_date)}</TableCell>
                    <TableCell align="right">{fmt(p.kg)}</TableCell>
                    <TableCell align="right">{fmt(p.boxes, 0)}</TableCell>
                    <TableCell align="right">{p.pct}%</TableCell>
                  </TableRow>
                ))}
              />
            </Paper>
            <Paper sx={{ p: 2 }}>
              <Typography variant="subtitle2" gutterBottom>
                Antigüedad desde empaque
              </Typography>
              <DataTable
                headers={["Tramo", "Kg", "Cajas", "Líneas"]}
                rows={d.age.map((a) => (
                  <TableRow key={a.bucket}>
                    <TableCell>{a.bucket}</TableCell>
                    <TableCell align="right">{fmt(a.kg)}</TableCell>
                    <TableCell align="right">{fmt(a.boxes, 0)}</TableCell>
                    <TableCell align="right">{a.count}</TableCell>
                  </TableRow>
                ))}
              />
            </Paper>
          </Box>
        );
        return;
      }
      if (view === "comparacion") {
        const d = await api(`/compare${liveQs}`);
        setSubtitle(`Fotografía ${fmtDate(d.snapshot_date)} ${d.snapshot_time} vs stock vivo`);
        setContent(
          <Box>
            <Stack direction="row" justifyContent="flex-end" sx={{ mb: 1 }}>
              <ExportButton
                filename={`StockFlow_comparacion_${d.snapshot_date}`}
                sheets={[
                  {
                    name: "Comparacion",
                    headers: ["Producto", "Descripción", "Almacén", "Kg 05:00", "Kg vivo", "Dif.", "%"],
                    rows: d.rows.map((r) => [
                      r.product_no,
                      r.product_description,
                      r.warehouse,
                      r.kg_inicial,
                      r.kg_vivo,
                      r.kg_diff,
                      r.pct,
                    ]),
                  },
                ]}
              />
            </Stack>
            <Kpis summary={d.live} />
            <DataTable
              headers={["Producto", "Descripción", "Almacén", "Kg 05:00", "Kg vivo", "Dif.", "%"]}
              rows={d.rows.map((r, i) => (
                <TableRow key={i}>
                  <TableCell>{r.product_no}</TableCell>
                  <TableCell>{r.product_description}</TableCell>
                  <TableCell>{r.warehouse}</TableCell>
                  <TableCell align="right">{fmt(r.kg_inicial)}</TableCell>
                  <TableCell align="right">{fmt(r.kg_vivo)}</TableCell>
                  <TableCell align="right">{fmt(r.kg_diff)}</TableCell>
                  <TableCell align="right">{r.pct == null ? "—" : `${r.pct}%`}</TableCell>
                </TableRow>
              ))}
            />
          </Box>
        );
        return;
      }
      if (view === "config") {
        const d = await api("/config");
        const c = d.config || {};
        setSubtitle("Parámetros de fotografía y semáforo");
        setContent(
          <Paper sx={{ p: 2 }}>
            <Typography>
              Hora de fotografía: <b>{c.snapshot_hour}:{String(c.snapshot_minute || "0").padStart(2, "0")}</b>
            </Typography>
            <Typography>
              Días alerta caducidad: <b>{c.expiry_warning_days}</b> (próximo 0–N; seguimiento hasta 15)
            </Typography>
            <Typography>
              Tramos antigüedad: <b>{c.age_buckets}</b>
            </Typography>
            <Typography sx={{ mb: 2 }}>
              Almacenes informe BI: <b>{c.active_warehouses}</b>
            </Typography>
            <Alert severity="info" sx={{ mb: 2 }}>
              Stock real = Item Ledger Entry abierto con Remaining Quantity = 1. Kg = Kilos. Misma regla que el informe paginado de caducidad.
            </Alert>
            <DataTable
              headers={["Código", "Nombre", "Activo"]}
              rows={(d.warehouses || []).map((w) => (
                <TableRow key={w.code}>
                  <TableCell>{w.code}</TableCell>
                  <TableCell>{w.name}</TableCell>
                  <TableCell>{w.active ? "Sí" : "No"}</TableCell>
                </TableRow>
              ))}
            />
          </Paper>
        );
        return;
      }
      if (view === "logs") {
        const rows = await api("/logs");
        setSubtitle("Ejecuciones de fotografía y consultas");
        setContent(
          <Box>
            <Stack direction="row" justifyContent="flex-end" sx={{ mb: 1 }}>
              <ExportButton
                filename="StockFlow_logs"
                sheets={[
                  {
                    name: "Logs",
                    headers: ["Fecha", "Hora", "Estado", "Registros", "Error"],
                    rows: rows.map((r) => [fmtDate(r.date), r.time, r.status, r.records, r.error || ""]),
                  },
                ]}
              />
            </Stack>
            <DataTable
              headers={["Fecha", "Hora", "Estado", "Registros", "Error"]}
              rows={rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{fmtDate(r.date)}</TableCell>
                  <TableCell>{r.time}</TableCell>
                  <TableCell>
                    <StatusChip status={r.status} />
                  </TableCell>
                  <TableCell align="right">{r.records}</TableCell>
                  <TableCell>{r.error || ""}</TableCell>
                </TableRow>
              ))}
            />
          </Box>
        );
        return;
      }
      if (view === "usuarios") {
        setSubtitle("Altas, roles y solicitudes de acceso");
        setContent(<UsersPanel />);
      }
    } catch (err) {
      setContent(null);
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }, [product, qs, snapshotId, t, view, warehouse]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  useEffect(() => {
    render();
  }, [render]);

  const renderRef = useRef(render);
  renderRef.current = render;

  useEffect(() => {
    const liveViews = ["dashboard", "vivo", "caducidades", "repetidas", "comparacion"];
    if (!liveViews.includes(view)) return undefined;
    const id = setInterval(() => {
      refreshRef.current = true;
      renderRef.current();
    }, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [view]);

  return (
    <Box sx={{ display: "flex", minHeight: "100vh" }}>
      <CssBaseline />
      <Drawer
        variant="permanent"
        sx={{
          width: DRAWER,
          [`& .MuiDrawer-paper`]: {
            width: DRAWER,
            boxSizing: "border-box",
            bgcolor: NAVY,
            color: "#fff",
            display: "flex",
            flexDirection: "column",
          },
        }}
      >
        <Toolbar sx={{ gap: 1.2, alignItems: "center" }}>
          <StoltMark size={28} />
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 800, lineHeight: 1.1 }}>
              Stock Flow
            </Typography>
            <Typography variant="caption" sx={{ opacity: 0.75 }}>
              {t("brandSub")}
            </Typography>
          </Box>
        </Toolbar>
        <List sx={{ flexGrow: 1 }}>
          {menuViews.map(([id, label]) => (
            <ListItemButton key={id} selected={view === id} onClick={() => setView(id)} sx={{ "&.Mui-selected": { bgcolor: "rgba(255,255,255,0.12)" } }}>
              <ListItemText primary={label} />
            </ListItemButton>
          ))}
        </List>
        <UserMenu user={user} onLogout={onLogout} />
      </Drawer>
      <Box sx={{ flexGrow: 1 }}>
        <AppBar position="sticky" color="inherit" elevation={0} sx={{ borderBottom: "1px solid #e0e0e0" }}>
          <Toolbar sx={{ gap: 2, flexWrap: "wrap" }}>
            <Box sx={{ flexGrow: 1 }}>
              <Typography variant="h6">{title}</Typography>
              <Typography variant="body2" color="text.secondary">
                {subtitle}
              </Typography>
            </Box>
            <ToggleButtonGroup
              exclusive
              size="small"
              value={warehouse}
              onChange={(_e, value) => {
                if (value !== null) setWarehouse(value);
              }}
            >
              {warehouseChoices.map((code) => (
                <ToggleButton key={code || "all"} value={code} sx={{ px: 1.5, textTransform: "none" }}>
                  {code || t("all")}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
            <TextField size="small" label={t("product")} value={product} onChange={(e) => setProduct(e.target.value)} />
            <Button variant="outlined" onClick={render} disabled={busy}>
              {t("filter")}
            </Button>
          </Toolbar>
          {busy && <LinearProgress />}
        </AppBar>
        <Container maxWidth="xl" sx={{ py: 3 }}>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          {busy && !content && (
            <Stack alignItems="center" sx={{ py: 8 }}>
              <CircularProgress />
            </Stack>
          )}
          {content}
        </Container>
      </Box>
    </Box>
  );
}
