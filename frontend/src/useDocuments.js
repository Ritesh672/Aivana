import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError, api, uploadDocument } from "./api";

// the user's document library, shared by the chat composer and the documents page
export default function useDocuments() {
  const [config, setConfig] = useState(null);
  const [docs, setDocs] = useState([]);
  const [uploads, setUploads] = useState([]); // files still being sent: {id, filename, progress}

  const refresh = useCallback(() => api.documents().then(setDocs).catch(() => {}), []);

  useEffect(() => {
    api
      .documentsConfig()
      .then((c) => {
        setConfig(c);
        if (c.enabled) refresh();
      })
      .catch(() => setConfig({ enabled: false }));
  }, [refresh]);

  // while anything is processing, check back every couple of seconds
  const processing = docs.some((d) => d.status === "processing");
  useEffect(() => {
    if (!processing) return;
    const timer = setInterval(refresh, 2000);
    return () => clearInterval(timer);
  }, [processing, refresh]);

  const upload = useCallback(
    async (file) => {
      const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
      if (!isPdf) throw new ApiError(400, "not_pdf", "not_pdf");
      if (config && file.size > config.max_mb * 1024 * 1024) throw new ApiError(413, "too_large", "too_large");

      const id = `upload-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      setUploads((list) => [...list, { id, filename: file.name, progress: 0 }]);
      try {
        const doc = await uploadDocument(file, (progress) =>
          setUploads((list) => list.map((u) => (u.id === id ? { ...u, progress } : u)))
        );
        await refresh();
        return doc;
      } finally {
        setUploads((list) => list.filter((u) => u.id !== id));
      }
    },
    [config, refresh]
  );

  const remove = useCallback(
    async (id) => {
      await api.deleteDocument(id);
      await refresh();
    },
    [refresh]
  );

  const byId = useMemo(() => Object.fromEntries(docs.map((d) => [d.id, d])), [docs]);
  const enabled = !!config?.enabled;

  return { config, enabled, docs, byId, uploads, upload, remove, refresh };
}
