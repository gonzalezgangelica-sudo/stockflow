import { createContext, useContext, useMemo, useState } from "react";
import { createTheme, ThemeProvider } from "@mui/material/styles";
import { CssBaseline } from "@mui/material";

const KEY = "stockflow_theme";
const ThemeModeContext = createContext(null);

export function makeTheme(mode) {
  const dark = mode === "dark";
  return createTheme({
    palette: {
      mode,
      primary: { main: dark ? "#8ab4f8" : "#1E3A8C" },
      secondary: { main: "#E10600" },
      background: dark
        ? { default: "#0f1724", paper: "#1a2433" }
        : { default: "#F4F6FA", paper: "#ffffff" },
      error: { main: "#c00000" },
      warning: { main: "#ed7d31" },
      info: { main: "#ffc000" },
      success: { main: "#548235" },
    },
    shape: { borderRadius: 10 },
    typography: {
      fontFamily: 'Inter, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
      h5: { fontWeight: 700 },
      h6: { fontWeight: 700 },
    },
  });
}

export function ThemeModeProvider({ children }) {
  const [mode, setMode] = useState(() => localStorage.getItem(KEY) || "light");
  const value = useMemo(() => {
    const setTheme = (next) => {
      localStorage.setItem(KEY, next);
      setMode(next);
    };
    return { mode, setTheme };
  }, [mode]);
  const theme = useMemo(() => makeTheme(mode), [mode]);
  return (
    <ThemeModeContext.Provider value={value}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </ThemeModeContext.Provider>
  );
}

export function useThemeMode() {
  const ctx = useContext(ThemeModeContext);
  if (!ctx) throw new Error("useThemeMode must be used within ThemeModeProvider");
  return ctx;
}
