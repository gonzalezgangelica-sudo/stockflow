import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import { LanguageProvider } from "./i18n.jsx";
import { ThemeModeProvider } from "./theme.jsx";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <LanguageProvider>
      <ThemeModeProvider>
        <App />
      </ThemeModeProvider>
    </LanguageProvider>
  </React.StrictMode>
);
