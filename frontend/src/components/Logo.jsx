// aivana brand: an open "A" whose crossbar is replaced by an accent dot,
// plus the lowercase wordmark

export function LogoMark({ size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true" className="logo-mark">
      <rect width="32" height="32" rx="9" className="logo-mark-bg" />
      <path
        d="M9.5 23 L16 8.5 L22.5 23"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="16" cy="18" r="2.1" className="logo-mark-dot" />
    </svg>
  );
}

export default function Logo({ size = 24, showName = true }) {
  return (
    <span className="logo" aria-label="Aivana">
      <LogoMark size={size} />
      {showName && <span className="logo-name">aivana</span>}
    </span>
  );
}
