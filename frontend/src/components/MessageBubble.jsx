import { memo, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useTranslation } from "react-i18next";
import { CheckIcon, CopyIcon, FileIcon } from "./Icons";
import ProviderMark from "./ProviderMark";

function textOf(node) {
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(textOf).join("");
  return node?.props ? textOf(node.props.children) : "";
}

function useCopy() {
  const [copied, setCopied] = useState(false);
  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (_) {}
  }
  return [copied, copy];
}

// fenced code: a quiet header with the language and a copy button
function CodeBlock({ children }) {
  const { t } = useTranslation();
  const [copied, copy] = useCopy();
  const code = Array.isArray(children) ? children[0] : children;
  const lang = /language-(\S+)/.exec(code?.props?.className || "")?.[1] || "text";

  return (
    <div className="code-block">
      <div className="code-head">
        <span>{lang}</span>
        <button type="button" className="ghost-action" onClick={() => copy(textOf(code).replace(/\n$/, ""))}>
          {copied ? <CheckIcon size={13} /> : <CopyIcon size={13} />}
          {copied ? t("message.copied") : t("message.copy")}
        </button>
      </div>
      <pre>{children}</pre>
    </div>
  );
}

// turn the model's [1] citations into links the renderer below shows as chips.
// numbers without a matching source are left as plain text
function linkCitations(content, count) {
  if (!count) return content;
  return content.replace(/\[(\d{1,2})\](?!\()/g, (match, n) =>
    Number(n) >= 1 && Number(n) <= count ? `[${n}](#cite-${n})` : match
  );
}

function citedNumbers(content) {
  return new Set([...content.matchAll(/\[(\d{1,2})\]/g)].map((m) => Number(m[1])));
}

// the passages this answer cited; click one to read it
function Sources({ sources, open, onOpen }) {
  const { t } = useTranslation();
  const active = sources.find((s) => s.n === open);
  return (
    <div className="sources">
      <div className="sources-row">
        <span className="sources-label">{t("message.sources")}</span>
        {sources.map((s) => (
          <button
            key={s.n}
            type="button"
            className={`source-chip ${open === s.n ? "open" : ""}`}
            onClick={() => onOpen(open === s.n ? null : s.n)}
            aria-expanded={open === s.n}
          >
            <span className="source-n">{s.n}</span>
            <span className="source-name">{s.filename}</span>
            <span className="source-page">{t("message.page", { page: s.page })}</span>
          </button>
        ))}
      </div>
      {active && (
        <div className="source-card">
          <div className="source-card-head">
            <FileIcon size={14} /> {active.filename} · {t("message.page", { page: active.page })}
          </div>
          <p>{active.text}</p>
        </div>
      )}
    </div>
  );
}

function MessageBubble({ message, model }) {
  const { t } = useTranslation();
  const [copied, copy] = useCopy();
  const [openSource, setOpenSource] = useState(null);

  const sources = message.sources || [];
  const components = useMemo(
    () => ({
      pre: CodeBlock,
      a: ({ href, children }) =>
        href?.startsWith("#cite-") ? (
          <button type="button" className="cite" onClick={() => setOpenSource(Number(href.slice(6)))}>
            {children}
          </button>
        ) : (
          <a href={href} target="_blank" rel="noreferrer">{children}</a>
        ),
    }),
    []
  );

  if (message.role === "human") {
    return <div className="msg-q" dir="auto">{message.content}</div>;
  }

  const waiting = message.streaming && !message.content;
  const name = model?.label || message.model || "AI";

  return (
    <div className="msg-a" dir="auto">
      <div className="msg-a-head">
        <ProviderMark provider={model?.provider} size={18} />
        <span>{name}</span>
      </div>

      {waiting ? (
        <div className="thinking" aria-label={t("message.thinking")}>
          <span /><span /><span />
        </div>
      ) : (
        <div className="markdown">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
            {linkCitations(message.content, sources.length)}
          </ReactMarkdown>
          {message.streaming && <span className="cursor" />}
        </div>
      )}

      {!message.streaming && sources.length > 0 && (() => {
        // only list what the answer actually cited
        const cited = citedNumbers(message.content);
        const shown = sources.filter((s) => cited.has(s.n));
        return shown.length ? <Sources sources={shown} open={openSource} onOpen={setOpenSource} /> : null;
      })()}

      {!message.streaming && message.content && (
        <div className="msg-actions">
          <button type="button" className="ghost-action" onClick={() => copy(message.content)}>
            {copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
            {copied ? t("message.copied") : t("message.copy")}
          </button>
          {message.stopped && <span className="stopped">{t("message.stopped")}</span>}
        </div>
      )}
    </div>
  );
}

// finished messages never change, so skip re-rendering them while a reply streams
export default memo(MessageBubble);
