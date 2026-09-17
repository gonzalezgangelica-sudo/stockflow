import { createContext, useContext, useMemo, useState } from "react";

const KEY = "stockflow_lang";

const dict = {
  es: {
    welcome: "Bienvenido",
    access: "Accede a Stock Flow",
    email: "Correo electrónico",
    password: "Contraseña",
    signIn: "Iniciar sesión",
    signingIn: "Entrando…",
    requestAccess: "Solicitar alta de usuario sin acceso",
    requestTitle: "Solicitar acceso",
    name: "Nombre",
    comment: "Comentario",
    send: "Enviar",
    close: "Cerrar",
    requestOk: "Solicitud enviada. Un administrador le dará de alta.",
    coverSubtitle: "Consulta el stock vivo, la fotografía de las 05:00 y las caducidades desde una única plataforma empresarial.",
    coverFooter: "Gestión y análisis · Stock Flow",
    language: "Idioma",
    spanish: "Español",
    english: "English",
    account: "Cuenta",
    theme: "Tema",
    light: "Claro",
    dark: "Oscuro",
    userMenu: "Menú de usuario",
    logout: "Cerrar sesión",
    nav_dashboard: "Dashboard",
    nav_vivo: "Stock vivo",
    nav_historico: "Stock histórico",
    nav_evolucion: "Evolución",
    nav_caducidades: "Caducidades",
    nav_repetidas: "Cajas repetidas",
    nav_analisis: "Análisis",
    nav_comparacion: "Inicial vs vivo",
    nav_config: "Configuración",
    nav_logs: "Logs",
    nav_usuarios: "Usuarios",
    brandSub: "Histórico 05:00 · Vivo",
    all: "Todos",
    product: "Producto / código",
    filter: "Filtrar",
    refresh: "Actualizar",
    photograph: "Fotografiar ahora",
    kpi_kg: "Stock total kg",
    kpi_boxes: "Cajas",
    kpi_products: "Productos",
    kpi_lots: "Lotes",
    kpi_expired: "Caducado kg",
    kpi_near: "Próximo kg",
    kpi_watch: "Seguimiento kg",
    kpi_ok: "Correcto kg",
    warehouse: "ALMACÉN",
    boxesKgProducts: "{boxes} cajas · {kg} kg · {products} productos",
    col_product: "Producto",
    col_lots: "Lotes",
    col_packing: "Fecha empaque",
    col_expiry: "Caducidad",
    col_boxes: "Cajas",
    col_kg: "Kg",
    col_status: "Estado",
    exportExcel: "Exportar Excel",
    noStock: "No hay stock para el almacén seleccionado.",
    noHistory: "Sin histórico todavía. Pulse «Fotografiar ahora».",
    Caducado: "Caducado",
    "Proximo a caducar": "Próximo a caducar",
    "En seguimiento": "En seguimiento",
    Correcto: "Correcto",
    "Sin fecha": "Sin fecha",
    role_admin: "admin",
    role_consulta: "consulta",
  },
  en: {
    welcome: "Welcome",
    access: "Sign in to Stock Flow",
    email: "Email",
    password: "Password",
    signIn: "Sign in",
    signingIn: "Signing in…",
    requestAccess: "Request access without an account",
    requestTitle: "Request access",
    name: "Name",
    comment: "Comment",
    send: "Send",
    close: "Close",
    requestOk: "Request sent. An administrator will create your account.",
    coverSubtitle: "Check live stock, the 05:00 snapshot and expiry from a single business platform.",
    coverFooter: "Management and analytics · Stock Flow",
    language: "Language",
    spanish: "Español",
    english: "English",
    account: "Account",
    theme: "Theme",
    light: "Light",
    dark: "Dark",
    userMenu: "User menu",
    logout: "Sign out",
    nav_dashboard: "Dashboard",
    nav_vivo: "Live stock",
    nav_historico: "Historical stock",
    nav_evolucion: "Trend",
    nav_caducidades: "Expiry",
    nav_repetidas: "Repeated boxes",
    nav_analisis: "Analysis",
    nav_comparacion: "Initial vs live",
    nav_config: "Settings",
    nav_logs: "Logs",
    nav_usuarios: "Users",
    brandSub: "Snapshot 05:00 · Live",
    all: "All",
    product: "Product / code",
    filter: "Filter",
    refresh: "Refresh",
    photograph: "Take snapshot now",
    kpi_kg: "Total stock kg",
    kpi_boxes: "Boxes",
    kpi_products: "Products",
    kpi_lots: "Lots",
    kpi_expired: "Expired kg",
    kpi_near: "Near expiry kg",
    kpi_watch: "Watch kg",
    kpi_ok: "OK kg",
    warehouse: "WAREHOUSE",
    boxesKgProducts: "{boxes} boxes · {kg} kg · {products} products",
    col_product: "Product",
    col_lots: "Lots",
    col_packing: "Packing date",
    col_expiry: "Expiry",
    col_boxes: "Boxes",
    col_kg: "Kg",
    col_status: "Status",
    exportExcel: "Export Excel",
    noStock: "No stock for the selected warehouse.",
    noHistory: "No history yet. Click «Take snapshot now».",
    Caducado: "Expired",
    "Proximo a caducar": "Near expiry",
    "En seguimiento": "Watch",
    Correcto: "OK",
    "Sin fecha": "No date",
    role_admin: "admin",
    role_consulta: "viewer",
  },
};

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(() => localStorage.getItem(KEY) || "es");

  const value = useMemo(() => {
    const t = (key, vars = {}) => {
      let text = dict[lang]?.[key] ?? dict.es[key] ?? key;
      for (const [k, v] of Object.entries(vars)) text = text.replaceAll(`{${k}}`, String(v));
      return text;
    };
    const setLanguage = (next) => {
      localStorage.setItem(KEY, next);
      setLang(next);
      document.documentElement.lang = next;
    };
    document.documentElement.lang = lang;
    return { lang, setLanguage, t };
  }, [lang]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLang() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLang must be used within LanguageProvider");
  return ctx;
}
