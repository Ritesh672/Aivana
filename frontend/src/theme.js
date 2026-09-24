// light / dark theme: follows the system until the user picks one
const STORAGE_KEY = "theme";

export function initialTheme() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch (_) {}
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyTheme(theme, remember = false) {
  document.documentElement.dataset.theme = theme;
  if (!remember) return;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch (_) {}
}
