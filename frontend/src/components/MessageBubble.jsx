import { memo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useTranslation } from "react-i18next";
import { CheckIcon, CopyIcon } from "./Icons";
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

const markdownComponents = { pre: CodeBlock };

function MessageBubble({ message, model }) {
  const { t } = useTranslation();
  const [copied, copy] = useCopy();

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
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {message.content}
          </ReactMarkdown>
          {message.streaming && <span className="cursor" />}
        </div>
      )}

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
