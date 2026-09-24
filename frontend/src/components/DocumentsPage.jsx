import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertIcon, CloseIcon, FileIcon, TrashIcon, UploadIcon } from "./Icons";

function formatSize(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// the document library: upload, watch processing, delete
export default function DocumentsPage({ library, onBack }) {
  const { t, i18n } = useTranslation();
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const fileInput = useRef(null);
  const { config, docs, uploads } = library;

  async function remove(id) {
    if (!window.confirm(t("documents.confirmDelete"))) return;
    await library.remove(id).catch(() => {});
  }

  async function uploadFiles(files) {
    setError("");
    for (const file of files) {
      try {
        await library.upload(file);
      } catch (e) {
        if (e.code === "not_pdf") setError(t("documents.notPdf"));
        else if (e.code === "too_large") setError(t("documents.tooLarge", { mb: config.max_mb }));
        else setError(e.message);
      }
    }
  }

  function onDrop(e) {
    e.preventDefault();
    setDragging(false);
    uploadFiles([...e.dataTransfer.files]);
  }

  return (
    <div className="settings">
      <div className="settings-inner">
        <div className="settings-head">
          <h1>{t("documents.title")}</h1>
          <button className="icon-btn" onClick={onBack} aria-label={t("settings.back")}>
            <CloseIcon />
          </button>
        </div>
        <p className="page-intro">{t("documents.subtitle")}</p>

        {!library.enabled ? (
          <p className="notice-inline">{t("documents.unavailable")}</p>
        ) : (
          <>
            <button
              type="button"
              className={`dropzone ${dragging ? "dragging" : ""}`}
              onClick={() => fileInput.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
            >
              <UploadIcon size={22} />
              <span className="dropzone-title">{t("documents.dropHint")}</span>
              <span className="dropzone-sub">
                {t("documents.limits", {
                  mb: config.max_mb, pages: config.max_pages, used: docs.length, max: config.max_documents,
                })}
              </span>
            </button>
            <input
              ref={fileInput}
              type="file"
              accept="application/pdf,.pdf"
              multiple
              hidden
              onChange={(e) => {
                uploadFiles([...e.target.files]);
                e.target.value = "";
              }}
            />

            {error && <p className="error-text doc-error">{error}</p>}

            <div className="doc-list">
              {uploads.map((u) => (
                <div key={u.id} className="doc-row">
                  <span className="doc-icon"><span className="spinner" /></span>
                  <div className="doc-main">
                    <div className="doc-name">{u.filename}</div>
                    <div className="progress"><span style={{ width: `${Math.round(u.progress * 100)}%` }} /></div>
                  </div>
                </div>
              ))}
              {docs.length === 0 && uploads.length === 0 && <p className="sb-empty">{t("documents.empty")}</p>}
              {docs.map((d) => (
                <div key={d.id} className={`doc-row ${d.status}`}>
                  <span className="doc-icon">
                    {d.status === "failed" ? <AlertIcon size={18} /> : <FileIcon size={18} />}
                  </span>
                  <div className="doc-main">
                    <div className="doc-name" title={d.filename}>{d.filename}</div>
                    {d.status === "processing" ? (
                      <>
                        <div className="progress"><span style={{ width: `${d.progress}%` }} /></div>
                        <div className="doc-meta">{t("documents.processing", { progress: d.progress })}</div>
                      </>
                    ) : d.status === "failed" ? (
                      <div className="doc-meta error-text">{d.error || t("documents.failed")}</div>
                    ) : (
                      <div className="doc-meta">
                        {t("documents.pages", { count: d.pages })} · {formatSize(d.size_bytes)} ·{" "}
                        {new Date(d.created_at).toLocaleDateString(i18n.language, { month: "short", day: "numeric" })}
                      </div>
                    )}
                  </div>
                  <button className="icon-btn" onClick={() => remove(d.id)} aria-label={t("documents.delete")} title={t("documents.delete")}>
                    <TrashIcon size={16} />
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
