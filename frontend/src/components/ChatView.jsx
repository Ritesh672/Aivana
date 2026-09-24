import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, streamChat } from "../api";
import { AttachedChips, AttachMenu } from "./Attachments";
import { ArrowDownIcon, ArrowUpIcon, CloseIcon, StopIcon } from "./Icons";
import MessageBubble from "./MessageBubble";
import ModelPicker from "./ModelPicker";

const MODEL_KEY = "chat_model";
// "1" when the app chose the model (so it may switch it), "0" when the user did
const AUTO_KEY = "chat_model_auto";
const SUGGESTIONS = ["explain", "code", "summarize", "plan"];

function read(key) {
  try {
    return localStorage.getItem(key);
  } catch (_) {
    return null;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (_) {}
}

function readModel() {
  try {
    return JSON.parse(read(MODEL_KEY));
  } catch (_) {
    return null;
  }
}

export default function ChatView({
  chatId, catalog, modelsById, keyReady, library,
  onChatCreated, onChatUpdated, onChatRemoved, onTurnFinished, onOpenSettings, onOpenDocuments,
}) {
  const { t, i18n } = useTranslation();
  const models = catalog.models;
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [notice, setNotice] = useState(null);
  const [draft, setDraft] = useState("");
  const [model, setModel] = useState(readModel);
  const [atBottom, setAtBottom] = useState(true);
  // documents attached to this chat (ids); sent with every message
  const [attached, setAttached] = useState([]);
  const [dragging, setDragging] = useState(false);

  const autoRef = useRef(read(AUTO_KEY) !== "0");
  const prevReadyRef = useRef(null);
  const abortRef = useRef(null);
  // the chat this view created itself mid-stream, so switching to it
  // doesn't reload (and wipe) the reply that is still arriving
  const createdChatRef = useRef(null);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const stickToBottom = useRef(true);

  const current = modelsById[model];
  const hasPaidKey = !!keyReady && catalog.paid_preference.some((p) => keyReady[p]);

  // the model the app would pick: the user's best paid company, else free
  function bestModel() {
    for (const provider of catalog.paid_preference) {
      const id = catalog.provider_defaults[provider];
      if (keyReady?.[provider] && modelsById[id]) return id;
    }
    return catalog.free_default || catalog.default || models[0]?.id;
  }

  function pickByUser(id) {
    autoRef.current = false;
    write(AUTO_KEY, "0");
    setModel(id);
  }

  function pickAutomatically(id) {
    autoRef.current = true;
    write(AUTO_KEY, "1");
    setModel(id);
  }

  // choose or switch the model whenever the user's keys change
  useEffect(() => {
    if (!models.length || !keyReady) return;
    const prev = prevReadyRef.current;
    prevReadyRef.current = keyReady;

    // a paid key was just added: start using that company's model
    if (prev) {
      const added = catalog.paid_preference.find(
        (p) => keyReady[p] && !prev[p] && modelsById[catalog.provider_defaults[p]]
      );
      if (added) {
        const id = catalog.provider_defaults[added];
        pickAutomatically(id);
        setNotice({ kind: "info", code: "switched", model: modelsById[id].label });
        return;
      }
    }

    // the current model can't be used (no key, or it no longer exists):
    // fall back on first load, or whenever the app chose it
    const cur = modelsById[model];
    const usable = cur && keyReady[cur.provider];
    if (!cur || (!usable && (!prev || autoRef.current))) pickAutomatically(bestModel());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyReady, models]);

  useEffect(() => {
    if (model) write(MODEL_KEY, JSON.stringify(model));
  }, [model]);

  // load the selected chat
  useEffect(() => {
    if (chatId && chatId === createdChatRef.current) return;
    createdChatRef.current = null;
    if (abortRef.current) {
      abortRef.current.switched = true;
      abortRef.current.abort();
    }
    setNotice(null);
    stickToBottom.current = true;
    setAtBottom(true);
    if (!chatId) {
      setMessages([]);
      setAttached([]);
      inputRef.current?.focus();
      return;
    }
    let cancelled = false;
    setLoading(true);
    api
      .messages(chatId)
      .then((list) => !cancelled && setMessages(list))
      .catch(() => !cancelled && setMessages([]))
      .finally(() => !cancelled && setLoading(false));
    setAttached([]);
    if (library.enabled) {
      api
        .chatDocuments(chatId)
        .then((list) => !cancelled && setAttached(list.map((d) => d.id)))
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId]);

  // ---------- documents ----------

  function attach(id) {
    setAttached((list) => (list.includes(id) ? list : [...list, id]));
  }

  function detach(id) {
    setAttached((list) => list.filter((x) => x !== id));
    if (chatId) api.detachDocument(chatId, id).catch(() => {});
  }

  function toggleAttached(id) {
    if (attached.includes(id)) detach(id);
    else attach(id);
  }

  async function uploadAndAttach(files) {
    for (const file of files) {
      try {
        const doc = await library.upload(file);
        attach(doc.id);
      } catch (e) {
        setNotice(uploadNotice(e));
      }
    }
  }

  function uploadNotice(e) {
    if (e.code === "not_pdf") return { code: "doc", message: t("documents.notPdf") };
    if (e.code === "too_large") return { code: "doc", message: t("documents.tooLarge", { mb: library.config?.max_mb }) };
    return { code: "doc", message: e.message };
  }

  const attachedDocs = attached.map((id) => library.byId[id]).filter(Boolean);
  const docsBusy = library.uploads.length > 0 || attachedDocs.some((d) => d.status === "processing");

  // follow new tokens, unless the user scrolled up to read
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  function onScroll() {
    const el = scrollRef.current;
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    stickToBottom.current = bottom;
    setAtBottom(bottom);
  }

  function jumpToBottom() {
    const el = scrollRef.current;
    stickToBottom.current = true;
    el?.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }

  function updateLast(fn) {
    setMessages((list) => [...list.slice(0, -1), fn(list[list.length - 1])]);
  }

  async function send(text) {
    const controller = new AbortController();
    abortRef.current = controller;
    const startChatId = chatId;
    const provider = current?.provider_label;
    let gotTokens = false;
    let failure = null;
    let done = false;

    setNotice(null);
    setStreaming(true);
    stickToBottom.current = true;
    const stamp = Date.now();
    setMessages((list) => [
      ...list,
      { id: `human-${stamp}`, role: "human", content: text },
      { id: `ai-${stamp}`, role: "ai", content: "", model, streaming: true },
    ]);

    // the reply is complete: unlock the ui right away, even though the
    // stream stays open a moment longer for the chat's generated title
    function finishReply() {
      done = true;
      if (abortRef.current === controller) abortRef.current = null;
      setStreaming(false);
      updateLast((m) => ({ ...m, streaming: false }));
      onTurnFinished();
    }

    try {
      const request = { message: text, model, chatId: startChatId, documentIds: attached };
      await streamChat(request, controller.signal, (event, data) => {
        if (event === "meta" && !startChatId) {
          createdChatRef.current = data.chat_id;
          onChatCreated({ id: data.chat_id, title: data.title, last_model: model });
        } else if (event === "sources") {
          updateLast((m) => ({ ...m, sources: data.sources }));
        } else if (event === "token") {
          gotTokens = true;
          updateLast((m) => ({ ...m, content: m.content + data.text }));
        } else if (event === "done") {
          finishReply();
        } else if (event === "title") {
          onChatUpdated(data.chat_id, { title: data.title, summary: data.summary });
        } else if (event === "error") {
          failure = data;
        }
      });
    } catch (e) {
      if (done) return; // lost the connection while waiting for the title; nothing to undo
      failure = e.name === "AbortError" ? { code: "stopped" } : { code: e.code || "network", message: e.message };
    }
    if (done) return;

    if (abortRef.current === controller) abortRef.current = null;
    setStreaming(false);

    // the user moved to another chat; that view owns the screen now
    if (controller.switched) {
      onTurnFinished();
      return;
    }

    const stopped = failure?.code === "stopped";

    if (failure && !gotTokens) {
      // nothing came back, so the server discarded this turn:
      // remove both messages and put the text back for a retry
      setMessages((list) => list.slice(0, -2));
      setDraft(text);
      if (!stopped) setNotice({ ...failure, provider, restored: true });
      if (!startChatId && createdChatRef.current) {
        const removedId = createdChatRef.current;
        createdChatRef.current = null;
        onChatRemoved(removedId);
        return;
      }
    } else {
      updateLast((m) => ({ ...m, streaming: false, stopped }));
      if (failure && !stopped) setNotice({ ...failure, provider });
    }
    onTurnFinished();
  }

  function submit(e) {
    e?.preventDefault();
    const text = draft.trim();
    if (!text || streaming || !model || docsBusy) return;
    setDraft("");
    send(text);
  }

  // grow the textarea with its content
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
  }, [draft]);

  function noticeText(n) {
    if (n.code === "switched") return t("chat.switched", { model: n.model });
    const key = `errors.${n.code}`;
    return i18n.exists(key) ? t(key, { provider: n.provider }) : n.message;
  }

  const empty = !loading && messages.length === 0;
  const needsSettings = notice && ["missing_key", "invalid_key", "free_limit"].includes(notice.code);

  const composer = (
    <form
      className={`composer ${dragging ? "dragging" : ""}`}
      onSubmit={submit}
      onDragOver={(e) => {
        if (!library.enabled || !e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        if (!library.enabled) return;
        e.preventDefault();
        setDragging(false);
        uploadAndAttach([...e.dataTransfer.files]);
      }}
    >
      <AttachedChips attached={attached} byId={library.byId} uploads={library.uploads} onRemove={detach} />
      <textarea
        ref={inputRef}
        rows={empty ? 2 : 1}
        value={draft}
        placeholder={empty ? t("chat.placeholderHero") : t("chat.placeholder")}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            submit();
          }
        }}
        autoFocus
      />
      <div className="composer-bar">
        <div className="composer-tools">
          {library.enabled && (
            <AttachMenu
              docs={library.docs}
              attached={attached}
              onToggle={toggleAttached}
              onUpload={uploadAndAttach}
              onManage={onOpenDocuments}
              disabled={streaming}
            />
          )}
          <ModelPicker
            models={models}
            value={model}
            onChange={pickByUser}
            keyReady={keyReady}
            disabled={streaming}
            onNeedKey={(m) => setNotice({ code: "missing_key", provider: m.provider_label })}
          />
        </div>
        {streaming ? (
          <button type="button" className="send-btn" onClick={() => abortRef.current?.abort()} aria-label={t("chat.stop")} title={t("chat.stop")}>
            <StopIcon size={14} />
          </button>
        ) : (
          <button type="submit" className="send-btn" disabled={!draft.trim() || !model || docsBusy} aria-label={t("chat.send")} title={docsBusy ? t("documents.waitProcessing") : t("chat.send")}>
            <ArrowUpIcon size={18} />
          </button>
        )}
      </div>
    </form>
  );

  const noticeBox = notice && (
    <div className={`notice ${notice.kind === "info" ? "info" : ""}`} role={notice.kind === "info" ? "status" : "alert"}>
      <div className="notice-text">
        <p>{noticeText(notice)}</p>
        {notice.restored && <p className="notice-sub">{t("errors.notSent")}</p>}
      </div>
      {needsSettings && (
        <button className="btn small" onClick={onOpenSettings}>{t("errors.openSettings")}</button>
      )}
      <button className="icon-btn tiny" onClick={() => setNotice(null)} aria-label={t("errors.dismiss")}>
        <CloseIcon size={14} />
      </button>
    </div>
  );

  if (empty) {
    return (
      <div className="chat">
        <div className="hero">
          <h1 className="hero-title">{t("chat.heroTitle")}</h1>
          {noticeBox}
          {composer}
          <div className="suggestions">
            {SUGGESTIONS.map((key) => (
              <button
                key={key}
                className="suggestion"
                onClick={() => {
                  setDraft(t(`chat.suggestionPrompts.${key}`));
                  inputRef.current?.focus();
                }}
              >
                {t(`chat.suggestions.${key}`)}
              </button>
            ))}
          </div>
          {current?.free && keyReady && !hasPaidKey && (
            <p className="free-hint">
              {t("chat.freeHint")}{" "}
              <button className="link-btn" onClick={onOpenSettings}>{t("chat.freeHintAction")}</button>
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="chat">
      <div className="messages" ref={scrollRef} onScroll={onScroll}>
        <div className="thread">
          {loading && <div className="thinking center-block"><span /><span /><span /></div>}
          {messages.map((m) => (
            <MessageBubble key={m.id} message={m} model={modelsById[m.model]} />
          ))}
        </div>
      </div>

      <div className="dock">
        {!atBottom && (
          <button className="jump-btn" onClick={jumpToBottom} aria-label={t("chat.jump")} title={t("chat.jump")}>
            <ArrowDownIcon size={16} />
          </button>
        )}
        {noticeBox}
        {composer}
        <p className="dock-hint">{t("chat.hint")}</p>
      </div>
    </div>
  );
}
