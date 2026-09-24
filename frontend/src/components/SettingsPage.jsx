import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api";
import { CloseIcon, MoonIcon, SunIcon } from "./Icons";
import LanguageSelect from "./LanguageSelect";
import ProviderMark from "./ProviderMark";

// languages the ai can be told to always reply in (sent to the model in english)
const REPLY_LANGUAGES = [
  "English", "Hindi", "Spanish", "Arabic", "French", "German", "Portuguese",
  "Bengali", "Marathi", "Tamil", "Telugu", "Urdu", "Japanese", "Chinese",
];

export default function SettingsPage({ onBack, onKeysChanged, theme, onTheme }) {
  const { t } = useTranslation();
  const [settings, setSettings] = useState(null);
  const [saved, setSaved] = useState(false);
  const [keys, setKeys] = useState([]);

  useEffect(() => {
    api.settings().then(setSettings).catch(() => {});
    api.keys().then(setKeys).catch(() => {});
  }, []);

  // reply-language changes save straight away
  async function updateSettings(patch) {
    const next = { ...settings, ...patch };
    setSettings(next);
    const result = await api.saveSettings(next).catch(() => null);
    if (result) {
      setSaved(true);
      setTimeout(() => setSaved(false), 1600);
    }
  }

  async function refreshKeys() {
    setKeys(await api.keys());
    onKeysChanged();
  }

  return (
    <div className="settings">
      <div className="settings-inner">
        <div className="settings-head">
          <h1>{t("settings.title")}</h1>
          {saved && <span className="saved-pill">{t("settings.saved")}</span>}
          <button className="icon-btn" onClick={onBack} aria-label={t("settings.back")} title={t("settings.back")}>
            <CloseIcon />
          </button>
        </div>

        <section className="settings-section">
          <h2>{t("settings.general")}</h2>
          <div className="setting-row">
            <div>
              <div className="setting-label">{t("settings.theme")}</div>
            </div>
            <div className="segmented" role="radiogroup" aria-label={t("settings.theme")}>
              {[["light", SunIcon], ["dark", MoonIcon]].map(([value, Icon]) => (
                <button
                  key={value}
                  role="radio"
                  aria-checked={theme === value}
                  className={theme === value ? "active" : ""}
                  onClick={() => onTheme(value)}
                >
                  <Icon size={15} /> {t(`settings.${value}`)}
                </button>
              ))}
            </div>
          </div>
          <div className="setting-row">
            <div>
              <div className="setting-label">{t("settings.interface")}</div>
            </div>
            <LanguageSelect />
          </div>
        </section>

        <section className="settings-section">
          <h2>{t("settings.reply")}</h2>
          {settings && (
            <>
              <div className="setting-row">
                <div>
                  <div className="setting-label">{t("settings.replyMode")}</div>
                  <div className="setting-desc">{t(`settings.modeDesc_${settings.reply_language_mode}`)}</div>
                </div>
                <div className="segmented" role="radiogroup" aria-label={t("settings.replyMode")}>
                  {["auto", "match", "fixed"].map((mode) => (
                    <button
                      key={mode}
                      role="radio"
                      aria-checked={settings.reply_language_mode === mode}
                      className={settings.reply_language_mode === mode ? "active" : ""}
                      onClick={() => updateSettings({ reply_language_mode: mode })}
                    >
                      {t(`settings.mode_${mode}`)}
                    </button>
                  ))}
                </div>
              </div>
              {settings.reply_language_mode === "fixed" && (
                <div className="setting-row">
                  <div className="setting-label">{t("settings.fixedLanguage")}</div>
                  <select
                    className="select"
                    value={settings.reply_language}
                    onChange={(e) => updateSettings({ reply_language: e.target.value })}
                  >
                    {REPLY_LANGUAGES.map((lang) => <option key={lang} value={lang}>{lang}</option>)}
                  </select>
                </div>
              )}
            </>
          )}
        </section>

        <section className="settings-section">
          <h2>{t("settings.keysTitle")}</h2>
          <p className="section-desc">{t("settings.keysHelp")}</p>
          <div className="key-list">
            {keys.map((k) => <KeyRow key={k.provider} info={k} onChange={refreshKeys} />)}
          </div>
        </section>
      </div>
    </div>
  );
}

function KeyRow({ info, onChange }) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const status = info.saved ? "saved" : info.free ? "free" : info.server_fallback ? "server" : "missing";

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.saveKey(info.provider, value.trim());
      setValue(""); // the key is never kept or shown again
      setEditing(false);
      await onChange();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    await api.deleteKey(info.provider).catch(() => {});
    await onChange();
    setBusy(false);
  }

  return (
    <div className="key-row">
      <div className="key-main">
        <ProviderMark provider={info.provider} size={28} />
        <div className="key-text">
          <div className="setting-label">{info.label}</div>
          <div className={`key-status ${status}`}>
            <span className="status-dot" /> {t(`settings.status_${status}`)}
          </div>
        </div>
        {!editing && (
          <div className="key-actions">
            <button className="btn small" onClick={() => setEditing(true)}>
              {info.saved ? t("settings.replace") : info.free ? t("settings.ownKey") : t("settings.addKey")}
            </button>
            {info.saved && (
              <button className="btn small ghost" onClick={remove} disabled={busy}>{t("settings.remove")}</button>
            )}
          </div>
        )}
      </div>
      {editing && (
        <form className="key-form" onSubmit={save}>
          <input
            type="password"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={t("settings.keyPlaceholder")}
            autoComplete="off"
            autoFocus
            aria-label={`${info.label} API key`}
          />
          <button className="btn small primary" type="submit" disabled={busy || value.trim().length < 8}>
            {t("settings.saveKey")}
          </button>
          <button className="btn small ghost" type="button" onClick={() => { setEditing(false); setValue(""); }}>
            {t("settings.cancel")}
          </button>
        </form>
      )}
      {error && <p className="error-text">{error}</p>}
    </div>
  );
}
