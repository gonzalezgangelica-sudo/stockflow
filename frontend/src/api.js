const TOKEN_KEY = "stock_token";
const USER_KEY = "stock_user";

export function loadSession() {
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    const user = JSON.parse(localStorage.getItem(USER_KEY) || "null");
    if (token && user) return { token, user };
  } catch {
    /* ignore */
  }
  return null;
}

export function saveSession(token, user) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
  if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
  else localStorage.removeItem(USER_KEY);
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export async function api(path, opts = {}) {
  const session = loadSession();
  const headers = { "Content-Type": "application/json", ...(opts.headers || {}) };
  if (session?.token) headers.Authorization = `Bearer ${session.token}`;
  const res = await fetch(`/api${path}`, { ...opts, headers });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && !path.startsWith("/auth/login")) {
    clearSession();
  }
  if (!res.ok) throw new Error(data.detail || data.message || res.statusText);
  return data;
}

export function fmt(n, d = 1) {
  if (n == null || n === "") return "—";
  return Number(n).toLocaleString("es-ES", { maximumFractionDigits: d, minimumFractionDigits: d });
}

export function fmtDate(v) {
  if (!v) return "—";
  const p = String(v).slice(0, 10).split("-");
  if (p.length !== 3) return v;
  return `${p[2]}/${p[1]}/${p[0]}`;
}

export function statusColor(status) {
  switch (status) {
    case "Caducado":
      return "error";
    case "Proximo a caducar":
      return "warning";
    case "En seguimiento":
      return "info";
    case "Correcto":
      return "success";
    default:
      return "default";
  }
}
