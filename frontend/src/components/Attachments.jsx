import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertIcon, CheckIcon, CloseIcon, FileIcon, PaperclipIcon, UploadIcon } from "./Icons";

// paperclip menu in the composer: upload a pdf or pick from the library
export function AttachMenu({ docs, attached, onToggle, onUpload, onManage, disabled }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const fileInput = useRef(null);

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

  const usable = docs.filter((d) => d.status !== "failed");

  return (
    <div className="attach" ref={rootRef}>
      <button
        type="button"
        className={`icon-btn attach-btn ${open ? "open" : ""}`}
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        aria-label={t("documents.attach")}
        title={t("documents.attach")}
      >
        <PaperclipIcon size={17} />
      </button>
      <input
        ref={fileInput}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        hidden
        onChange={(e) => {
          onUpload([...e.target.files]);
          e.target.value = "";
          setOpen(false);
        }}
      />

      {open && (
        <div className="popover attach-menu" role="menu">
          <button type="button" className="menu-item" onClick={() => fileInput.current?.click()}>
            <UploadIcon size={16} /> {t("documents.upload")}
          </button>
          {usable.length > 0 && (
            <>
              <div className="menu-sep" />
              <div className="attach-label">{t("documents.library")}</div>
              <div className="attach-list">
                {usable.map((d) => {
                  const on = attached.includes(d.id);
                  return (
                    <button
                      key={d.id}
                      type="button"
                      className={`menu-item attach-item ${on ? "on" : ""}`}
                      role="menuitemcheckbox"
                      aria-checked={on}
                      onClick={() => onToggle(d.id)}
                    >
                      <FileIcon size={16} />
                      <span className="attach-name">{d.filename}</span>
                      <span className="attach-check">{on && <CheckIcon size={15} />}</span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
          {usable.length === 0 && <p className="attach-empty">{t("documents.attachEmpty")}</p>}
          <div className="menu-sep" />
          <button type="button" className="menu-item muted-item" onClick={() => { setOpen(false); onManage(); }}>
            {t("documents.manage")}
          </button>
        </div>
      )}
    </div>
  );
}

// the documents attached to the message being written
export function AttachedChips({ attached, byId, uploads, onRemove }) {
  const { t } = useTranslation();
  if (!attached.length && !uploads.length) return null;

  return (
    <div className="doc-chips">
      {uploads.map((u) => (
        <span key={u.id} className="doc-chip busy">
          <span className="spinner" />
          <span className="doc-chip-name">{u.filename}</span>
          <span className="doc-chip-meta">{t("documents.uploading", { progress: Math.round(u.progress * 100) })}</span>
        </span>
      ))}
      {attached.map((id) => {
        const d = byId[id];
        if (!d) return null;
        return (
          <span key={id} className={`doc-chip ${d.status}`} title={d.error || d.filename}>
            {d.status === "processing" ? (
              <span className="spinner" />
            ) : d.status === "failed" ? (
              <AlertIcon size={14} />
            ) : (
              <FileIcon size={14} />
            )}
            <span className="doc-chip-name">{d.filename}</span>
            <span className="doc-chip-meta">
              {d.status === "processing"
                ? t("documents.processing", { progress: d.progress })
                : d.status === "failed"
                  ? t("documents.failed")
                  : t("documents.pages", { count: d.pages })}
            </span>
            <button type="button" className="doc-chip-x" onClick={() => onRemove(id)} aria-label={t("documents.detach")}>
              <CloseIcon size={12} />
            </button>
          </span>
        );
      })}
    </div>
  );
}
