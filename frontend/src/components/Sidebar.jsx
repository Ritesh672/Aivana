import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ChevronDownIcon, CloseIcon, LogOutIcon, MoonIcon, PanelIcon, PlusIcon,
  SearchIcon, SettingsIcon, SunIcon, TrashIcon,
} from "./Icons";
import { LogoMark } from "./Logo";

const DAY = 24 * 60 * 60 * 1000;

function startOfDay(value) {
  const d = new Date(value);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function groupOf(iso, today) {
  const day = startOfDay(iso);
  if (day >= today) return "today";
  if (day >= today - DAY) return "yesterday";
  if (day >= today - 7 * DAY) return "week";
  return "older";
}

export default function Sidebar({
  user, chats, activeChatId, search, onSearch,
  collapsed, onToggleCollapsed, mobileOpen, onCloseMobile,
  onNewChat, onOpenChat, onDeleteChat, onOpenSettings, theme, onToggleTheme, onLogout,
}) {
  const { t } = useTranslation();
  const [searchOpen, setSearchOpen] = useState(false);
  const [listOpen, setListOpen] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const searchInput = useRef(null);
  const menuRef = useRef(null);
  // hover card showing a chat's generated summary
  const [hover, setHover] = useState(null);
  const hoverTimer = useRef(null);

  function showSummary(chat, el) {
    clearTimeout(hoverTimer.current);
    if (!chat.summary) return;
    hoverTimer.current = setTimeout(() => {
      const rect = el.getBoundingClientRect();
      setHover({ chat, top: Math.min(rect.top, window.innerHeight - 220), left: rect.right + 10 });
    }, 450);
  }

  function hideSummary() {
    clearTimeout(hoverTimer.current);
    setHover(null);
  }

  useEffect(() => () => clearTimeout(hoverTimer.current), []);

  // ctrl/cmd + k opens search
  useEffect(() => {
    function onKey(e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        openSearch();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useEffect(() => {
    if (searchOpen) searchInput.current?.focus();
  }, [searchOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e) => !menuRef.current?.contains(e.target) && setMenuOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuOpen]);

  function openSearch() {
    if (collapsed) onToggleCollapsed();
    setSearchOpen(true);
    setListOpen(true);
    searchInput.current?.focus();
  }

  function closeSearch() {
    setSearchOpen(false);
    onSearch("");
  }

  const groups = useMemo(() => {
    const today = startOfDay(Date.now());
    const result = { today: [], yesterday: [], week: [], older: [] };
    for (const chat of chats) result[groupOf(chat.updated_at, today)].push(chat);
    return result;
  }, [chats]);

  return (
    <>
      <aside className={`sidebar ${mobileOpen ? "open" : ""}`}>
        <div className="sb-head">
          <button
            className="sb-logo"
            onClick={collapsed ? onToggleCollapsed : onNewChat}
            title={collapsed ? t("sidebar.collapse") : t("sidebar.newChat")}
            aria-label="Aivana"
          >
            <LogoMark size={28} />
          </button>
          <span className="sb-brand logo-name">aivana</span>
          <div className="sb-head-actions">
            <button className="icon-btn" onClick={openSearch} aria-label={t("sidebar.search")} title={`${t("sidebar.search")} (Ctrl K)`}>
              <SearchIcon />
            </button>
            <button className="icon-btn desktop-only" onClick={onToggleCollapsed} aria-label={t("sidebar.collapse")} title={t("sidebar.collapse")}>
              <PanelIcon />
            </button>
            <button className="icon-btn mobile-only" onClick={onCloseMobile} aria-label={t("sidebar.close")}>
              <CloseIcon />
            </button>
          </div>
        </div>

        <nav className="sb-nav">
          <button className="sb-item" onClick={onNewChat} title={t("sidebar.newChat")}>
            <PlusIcon />
            <span>{t("sidebar.newChat")}</span>
          </button>
          <button className="sb-item collapsed-only" onClick={openSearch} title={t("sidebar.search")}>
            <SearchIcon />
          </button>
        </nav>

        <div className="sb-body">
          {searchOpen && (
            <label className="sb-search">
              <SearchIcon size={15} />
              <input
                ref={searchInput}
                type="search"
                value={search}
                onChange={(e) => onSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Escape" && closeSearch()}
                placeholder={t("sidebar.searchPlaceholder")}
              />
              <button className="icon-btn tiny" onClick={closeSearch} aria-label={t("sidebar.close")}>
                <CloseIcon size={14} />
              </button>
            </label>
          )}

          <button className="sb-section" onClick={() => setListOpen((o) => !o)} aria-expanded={listOpen}>
            <span>{t("sidebar.chats")}</span>
            <ChevronDownIcon size={15} className={listOpen ? "" : "rotated"} />
          </button>

          {listOpen && (
            <div className="sb-list">
              {chats.length === 0 && (
                <p className="sb-empty">{search ? t("sidebar.noResults") : t("sidebar.empty")}</p>
              )}
              {Object.entries(groups).map(([group, items]) =>
                items.length ? (
                  <div key={group} className="sb-group">
                    <div className="sb-group-label">{t(`sidebar.${group}`)}</div>
                    {items.map((chat) => (
                      <div
                        key={chat.id}
                        className={`sb-chat ${chat.id === activeChatId ? "active" : ""}`}
                        onMouseEnter={(e) => showSummary(chat, e.currentTarget)}
                        onMouseLeave={hideSummary}
                      >
                        <button
                          className="sb-chat-open"
                          onClick={() => {
                            hideSummary();
                            onOpenChat(chat.id);
                          }}
                          title={chat.summary ? undefined : chat.title}
                          aria-description={chat.summary || undefined}
                        >
                          {chat.title}
                        </button>
                        <button
                          className="icon-btn tiny sb-chat-delete"
                          onClick={() => onDeleteChat(chat.id)}
                          aria-label={t("sidebar.deleteChat")}
                          title={t("sidebar.deleteChat")}
                        >
                          <TrashIcon size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null
              )}
            </div>
          )}
        </div>

        <div className="sb-foot" ref={menuRef}>
          {menuOpen && (
            <div className="popover user-menu" role="menu">
              <div className="user-menu-email">{user.email}</div>
              <button className="menu-item" role="menuitem" onClick={() => { setMenuOpen(false); onOpenSettings(); }}>
                <SettingsIcon size={16} /> {t("sidebar.settings")}
              </button>
              <button className="menu-item" role="menuitem" onClick={onToggleTheme}>
                {theme === "dark" ? <SunIcon size={16} /> : <MoonIcon size={16} />}
                {theme === "dark" ? t("sidebar.light") : t("sidebar.dark")}
              </button>
              <div className="menu-sep" />
              <button className="menu-item" role="menuitem" onClick={onLogout}>
                <LogOutIcon size={16} /> {t("sidebar.logout")}
              </button>
            </div>
          )}
          <button className="sb-user" onClick={() => setMenuOpen((o) => !o)} aria-haspopup="menu" aria-expanded={menuOpen}>
            <span className="avatar">{user.email[0].toUpperCase()}</span>
            <span className="sb-user-name">{user.email.split("@")[0]}</span>
            <SettingsIcon size={16} className="sb-user-gear" />
          </button>
        </div>
      </aside>
      {hover && (
        <div className="hover-card" role="tooltip" style={{ top: hover.top, left: hover.left }}>
          <div className="hover-card-title">{hover.chat.title}</div>
          <p>{hover.chat.summary}</p>
        </div>
      )}
      {mobileOpen && <div className="backdrop" onClick={onCloseMobile} />}
    </>
  );
}
