// a small tinted letter mark per company, used in the model menu and replies
const MARKS = {
  anthropic: "A",
  openai: "O",
  xai: "X",
  google_genai: "G",
  deepseek: "D",
  huggingface: "H",
};

export default function ProviderMark({ provider, size = 20 }) {
  return (
    <span
      className={`mark mark-${provider || "none"}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.56) }}
      aria-hidden="true"
    >
      {MARKS[provider] || "·"}
    </span>
  );
}
