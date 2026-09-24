import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import hi from "./locales/hi.json";
import es from "./locales/es.json";

// to add arabic later: create locales/ar.json and add
// ar: { label: "العربية", dir: "rtl", messages: ar } below
export const UI_LANGUAGES = {
  en: { label: "English", dir: "ltr", messages: en },
  hi: { label: "हिन्दी", dir: "ltr", messages: hi },
  es: { label: "Español", dir: "ltr", messages: es },
};

const STORAGE_KEY = "ui_language";

function savedLanguage() {
  try {
    const lang = localStorage.getItem(STORAGE_KEY);
    if (lang in UI_LANGUAGES) return lang;
  } catch (_) {}
  const browser = navigator.language?.slice(0, 2);
  return browser in UI_LANGUAGES ? browser : "en";
}

function applyDocumentLanguage(lang) {
  document.documentElement.lang = lang;
  document.documentElement.dir = UI_LANGUAGES[lang]?.dir || "ltr";
}

i18n.use(initReactI18next).init({
  resources: Object.fromEntries(
    Object.entries(UI_LANGUAGES).map(([code, l]) => [code, { translation: l.messages }])
  ),
  lng: savedLanguage(),
  fallbackLng: "en",
  interpolation: { escapeValue: false }, // react already escapes
});

applyDocumentLanguage(i18n.language);

i18n.on("languageChanged", (lang) => {
  applyDocumentLanguage(lang);
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch (_) {}
});

export default i18n;
