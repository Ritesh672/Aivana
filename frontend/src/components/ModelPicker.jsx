import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { CheckIcon, ChevronDownIcon, LockIcon, SearchIcon } from "./Icons";
import ProviderMark from "./ProviderMark";

// model menu inside the composer. shows each company's recent few models;
// older ones appear with "show all" or when searching
export default function ModelPicker({ models, value, onChange, keyReady, disabled, onNeedKey }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [layout, setLayout] = useState({ placement: "up", listHeight: 380 });
  const rootRef = useRef(null);

  const selected = models.find((m) => m.id === value);
  const hasKey = (m) => !keyReady || keyReady[m.provider];

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => !rootRef.current?.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // open toward whichever side has room, and never run off the screen
  useLayoutEffect(() => {
    if (!open) return;
    const rect = rootRef.current.getBoundingClientRect();
    const below = window.innerHeight - rect.bottom - 16;
    const above = rect.top - 16;
    const chrome = 44 + 41 + 20; // search row + footer + padding
    const placement = below >= 380 || below >= above ? "down" : "up";
    const room = (placement === "down" ? below : above) - chrome;
    setLayout({ placement, listHeight: Math.max(150, Math.min(380, room)) });
  }, [open]);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const result = [];
    for (const m of models) {
      if (q) {
        if (!`${m.label} ${m.provider_label}`.toLowerCase().includes(q)) continue;
      } else if (!showAll && !m.featured && m.id !== value) {
        continue;
      }
      let group = result.find((g) => g.provider === m.provider);
      if (!group) result.push((group = { provider: m.provider, label: m.provider_label, items: [] }));
      group.items.push(m);
    }
    // companies the user can use right now (own key or free) come first
    const ready = (g) => (!keyReady || keyReady[g.provider] ? 1 : 0);
    return result.sort((a, b) => ready(b) - ready(a));
  }, [models, query, showAll, value, keyReady]);

  function choose(m) {
    onChange(m.id);
    setOpen(false);
    setQuery("");
    if (!hasKey(m)) onNeedKey?.(m);
  }

  return (
    <div className="picker" ref={rootRef}>
      <button
        type="button"
        className={`picker-btn ${open ? "open" : ""}`}
        onClick={() => setOpen((o) => !o)}
        disabled={disabled || !selected}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={t("picker.label")}
      >
        {selected && <ProviderMark provider={selected.provider} size={18} />}
        <span className="picker-name">{selected?.label || t("picker.label")}</span>
        <ChevronDownIcon size={14} className="picker-chevron" />
      </button>

      {open && (
        <div className={`popover picker-menu ${layout.placement}`} role="listbox" aria-label={t("picker.label")}>
          <label className="picker-search">
            <SearchIcon size={15} />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("picker.search")}
              onKeyDown={(e) => e.key === "Enter" && groups[0] && choose(groups[0].items[0])}
            />
          </label>

          <div className="picker-list" style={{ maxHeight: layout.listHeight }}>
            {groups.length === 0 && <p className="picker-empty">{t("picker.none")}</p>}
            {groups.map((g) => (
              <div key={g.provider} className="picker-group">
                <div className="picker-group-label">{g.label}</div>
                {g.items.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    role="option"
                    aria-selected={m.id === value}
                    className={`picker-option ${m.id === value ? "selected" : ""} ${hasKey(m) ? "" : "locked"}`}
                    onClick={() => choose(m)}
                    title={hasKey(m) ? m.label : t("picker.locked")}
                  >
                    <ProviderMark provider={m.provider} size={20} />
                    <span className="picker-option-name">{m.label}</span>
                    {m.free ? (
                      <span className="badge free">{t("picker.free")}</span>
                    ) : (
                      m.latest && <span className="badge">{t("picker.latest")}</span>
                    )}
                    <span className="picker-option-end">
                      {m.id === value ? <CheckIcon size={15} /> : !hasKey(m) && <LockIcon size={14} />}
                    </span>
                  </button>
                ))}
              </div>
            ))}
          </div>

          {!query && (
            <button type="button" className="picker-more" onClick={() => setShowAll((s) => !s)}>
              {showAll ? t("picker.fewer") : t("picker.all", { count: models.length })}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
