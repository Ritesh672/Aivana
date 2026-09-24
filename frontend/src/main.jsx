import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./i18n";
import "./styles.css";
import { applyTheme, initialTheme } from "./theme";
import App from "./App";

// set the theme before the first paint so there's no flash
applyTheme(initialTheme());

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);
