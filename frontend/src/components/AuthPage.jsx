import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api";
import { MoonIcon, SunIcon } from "./Icons";
import Logo from "./Logo";
import LanguageSelect from "./LanguageSelect";

export default function AuthPage({ onAuth, theme, onTheme }) {
  const { t } = useTranslation();
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const isSignup = mode === "signup";

  async function submit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const user = isSignup ? await api.signup(email, password) : await api.login(email, password);
      onAuth(user);
    } catch (err) {
      setError(err.code === "http_error" ? err.message : t("errors.network"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <div className="auth-corner">
        <LanguageSelect />
        <button
          className="icon-btn"
          onClick={() => onTheme(theme === "dark" ? "light" : "dark")}
          aria-label={theme === "dark" ? t("sidebar.light") : t("sidebar.dark")}
        >
          {theme === "dark" ? <SunIcon /> : <MoonIcon />}
        </button>
      </div>

      <form className="auth-card" onSubmit={submit}>
        <div className="auth-brand"><Logo size={34} /></div>
        <h1>{isSignup ? t("auth.signupTitle") : t("auth.loginTitle")}</h1>
        <p className="auth-sub">{t("auth.subtitle")}</p>

        <label className="field">
          <span>{t("auth.email")}</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </label>

        <label className="field">
          <span>{t("auth.password")}</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
            autoComplete={isSignup ? "new-password" : "current-password"}
          />
          {isSignup && <small className="field-hint">{t("auth.passwordHint")}</small>}
        </label>

        {error && <p className="error-text">{error}</p>}

        <button className="btn primary block large" type="submit" disabled={busy}>
          {isSignup ? t("auth.signup") : t("auth.login")}
        </button>

        <p className="auth-switch">
          {isSignup ? t("auth.haveAccount") : t("auth.noAccount")}{" "}
          <button
            type="button"
            className="link-btn"
            onClick={() => {
              setMode(isSignup ? "login" : "signup");
              setError("");
            }}
          >
            {isSignup ? t("auth.login") : t("auth.signup")}
          </button>
        </p>
      </form>
    </div>
  );
}
