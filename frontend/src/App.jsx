import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "./api";
import { applyTheme, initialTheme } from "./theme";
import AuthPage from "./components/AuthPage";
import ChatView from "./components/ChatView";
import DocumentsPage from "./components/DocumentsPage";
import { MenuIcon, MoonIcon, PlusIcon, SunIcon } from "./components/Icons";
import SettingsPage from "./components/SettingsPage";
import Sidebar from "./components/Sidebar";
import useDocuments from "./useDocuments";

const COLLAPSED_KEY = "sidebar_collapsed";

export default function App() {
  const { t } = useTranslation();
  // undefined while checking the session, null when logged out
  const [user, setUser] = useState(undefined);
  const [theme, setTheme] = useState(initialTheme);

  useEffect(() => {
    api.me().then(setUser).catch(() => setUser(null));
  }, []);

  function changeTheme(next) {
    applyTheme(next, true);
    setTheme(next);
  }

  const themeProps = { theme, onTheme: changeTheme };

  if (user === undefined) return <div className="page-center muted">{t("app.loading")}</div>;
  if (!user) return <AuthPage onAuth={setUser} {...themeProps} />;
  return <Workspace user={user} {...themeProps} onLogout={() => setUser(null)} />;
}

function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === "1";
  } catch (_) {
    return false;
  }
}

function Workspace({ user, theme, onTheme, onLogout }) {
  const { t } = useTranslation();
  const [chats, setChats] = useState([]);
  const [search, setSearch] = useState("");
  const [activeChatId, setActiveChatId] = useState(null);
  const [view, setView] = useState("chat");
  const [catalog, setCatalog] = useState({
    default: null, free_default: null, provider_defaults: {}, paid_preference: [], models: [],
  });
  const [keys, setKeys] = useState(null);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);
  const library = useDocuments();

  const searchRef = useRef("");
  searchRef.current = search;

  const refreshChats = useCallback(
    () => api.chats(searchRef.current.trim()).then(setChats).catch(() => {}),
    []
  );
  const refreshKeys = useCallback(() => api.keys().then(setKeys).catch(() => {}), []);

  useEffect(() => {
    refreshKeys();
    api.models().then(setCatalog).catch(() => {});
  }, [refreshKeys]);

  // search as the user types, with a short pause so we don't query every key
  useEffect(() => {
    const timer = setTimeout(refreshChats, search ? 250 : 0);
    return () => clearTimeout(timer);
  }, [search, refreshChats]);

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSED_KEY, collapsed ? "1" : "0");
    } catch (_) {}
  }, [collapsed]);

  const modelsById = useMemo(
    () => Object.fromEntries(catalog.models.map((m) => [m.id, m])),
    [catalog]
  );

  // provider -> true if a key is available (null until keys have loaded)
  const keyReady = useMemo(
    () => keys && Object.fromEntries(keys.map((k) => [k.provider, k.saved || k.server_fallback])),
    [keys]
  );

  function openChat(id) {
    setActiveChatId(id);
    setView("chat");
    setMobileOpen(false);
  }

  function openSettings() {
    setView("settings");
    setMobileOpen(false);
  }

  function openDocuments() {
    setView("documents");
    setMobileOpen(false);
  }

  async function deleteChat(id) {
    if (!window.confirm(t("sidebar.confirmDelete"))) return;
    await api.deleteChat(id).catch(() => {});
    if (id === activeChatId) setActiveChatId(null);
    refreshChats();
  }

  async function logout() {
    await api.logout().catch(() => {});
    onLogout();
  }

  const toggleTheme = () => onTheme(theme === "dark" ? "light" : "dark");

  return (
    <div className={`shell ${collapsed ? "collapsed" : ""}`}>
      <Sidebar
        user={user}
        chats={chats}
        activeChatId={view === "chat" ? activeChatId : null}
        search={search}
        onSearch={setSearch}
        collapsed={collapsed}
        onToggleCollapsed={() => setCollapsed((c) => !c)}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
        onNewChat={() => openChat(null)}
        onOpenChat={openChat}
        onDeleteChat={deleteChat}
        onOpenSettings={openSettings}
        onOpenDocuments={library.enabled ? openDocuments : null}
        view={view}
        theme={theme}
        onToggleTheme={toggleTheme}
        onLogout={logout}
      />

      <main className="main">
        <header className="main-top">
          <button className="icon-btn mobile-only" onClick={() => setMobileOpen(true)} aria-label={t("sidebar.menu")}>
            <MenuIcon />
          </button>
          <div className="main-top-end">
            <button
              className="icon-btn"
              onClick={toggleTheme}
              aria-label={theme === "dark" ? t("sidebar.light") : t("sidebar.dark")}
              title={theme === "dark" ? t("sidebar.light") : t("sidebar.dark")}
            >
              {theme === "dark" ? <SunIcon /> : <MoonIcon />}
            </button>
            <button className="icon-btn mobile-only" onClick={() => openChat(null)} aria-label={t("sidebar.newChat")}>
              <PlusIcon />
            </button>
          </div>
        </header>

        {/* chat stays mounted while settings is open so a running reply isn't cut off */}
        <div className="view" hidden={view !== "chat"}>
          <ChatView
            chatId={activeChatId}
            catalog={catalog}
            modelsById={modelsById}
            keyReady={keyReady}
            library={library}
            onOpenDocuments={openDocuments}
            onChatCreated={(chat) => {
              setActiveChatId(chat.id);
              setChats((list) => [{ ...chat, updated_at: new Date().toISOString() }, ...list]);
            }}
            onChatUpdated={(id, patch) => {
              setChats((list) => list.map((c) => (c.id === id ? { ...c, ...patch } : c)));
            }}
            onChatRemoved={(id) => {
              setActiveChatId((current) => (current === id ? null : current));
              setChats((list) => list.filter((c) => c.id !== id));
            }}
            onTurnFinished={refreshChats}
            onOpenSettings={openSettings}
          />
        </div>
        {view === "documents" && (
          <div className="view">
            <DocumentsPage library={library} onBack={() => setView("chat")} />
          </div>
        )}
        {view === "settings" && (
          <div className="view">
            <SettingsPage
              onBack={() => setView("chat")}
              onKeysChanged={refreshKeys}
              theme={theme}
              onTheme={onTheme}
            />
          </div>
        )}
      </main>
    </div>
  );
}
