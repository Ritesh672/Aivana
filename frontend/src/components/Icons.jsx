// small inline icon set (lucide-style strokes), sized by font-size
function Icon({ children, size = 18, ...props }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export const SettingsIcon = (p) => (
  <Icon {...p}><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" /></Icon>
);
export const SunIcon = (p) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </Icon>
);
export const MoonIcon = (p) => (
  <Icon {...p}><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" /></Icon>
);
export const PlusIcon = (p) => (
  <Icon {...p}><path d="M12 5v14M5 12h14" /></Icon>
);
export const SearchIcon = (p) => (
  <Icon {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></Icon>
);
export const ArrowUpIcon = (p) => (
  <Icon {...p}><path d="m5 12 7-7 7 7M12 19V5" /></Icon>
);
export const StopIcon = (p) => (
  <Icon {...p}><rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" /></Icon>
);
export const CopyIcon = (p) => (
  <Icon {...p}>
    <rect x="9" y="9" width="12" height="12" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </Icon>
);
export const CheckIcon = (p) => (
  <Icon {...p}><path d="M20 6 9 17l-5-5" /></Icon>
);
export const TrashIcon = (p) => (
  <Icon {...p}><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></Icon>
);
export const LogOutIcon = (p) => (
  <Icon {...p}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></Icon>
);
export const CloseIcon = (p) => (
  <Icon {...p}><path d="M18 6 6 18M6 6l12 12" /></Icon>
);
export const LockIcon = (p) => (
  <Icon {...p}><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></Icon>
);
export const PanelIcon = (p) => (
  <Icon {...p}><rect x="3" y="3" width="18" height="18" rx="3" /><path d="M9 3v18" /></Icon>
);
export const MenuIcon = (p) => (
  <Icon {...p}><path d="M4 7h16M4 12h16M4 17h16" /></Icon>
);
export const ChevronDownIcon = (p) => (
  <Icon {...p}><path d="m6 9 6 6 6-6" /></Icon>
);
export const ArrowDownIcon = (p) => (
  <Icon {...p}><path d="M12 5v14M19 12l-7 7-7-7" /></Icon>
);
