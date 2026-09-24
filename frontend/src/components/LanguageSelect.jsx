import { useTranslation } from "react-i18next";
import { UI_LANGUAGES } from "../i18n";

export default function LanguageSelect() {
  const { t, i18n } = useTranslation();
  return (
    <select
      className="select"
      aria-label={t("settings.interface")}
      value={i18n.resolvedLanguage}
      onChange={(e) => i18n.changeLanguage(e.target.value)}
    >
      {Object.entries(UI_LANGUAGES).map(([code, lang]) => (
        <option key={code} value={code}>
          {lang.label}
        </option>
      ))}
    </select>
  );
}
