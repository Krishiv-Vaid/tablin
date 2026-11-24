/** Small consistent line icons (16px grid, currentColor). */
import type { ReactNode } from 'react';

function Icon({
  children,
  size = 16,
  title,
}: {
  children: ReactNode;
  size?: number;
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      aria-label={title}
    >
      {children}
    </svg>
  );
}

export const FlameIcon = (p: { size?: number }) => (
  <Icon {...p}>
    <path d="M8 14.5c2.6 0 4.5-1.8 4.5-4.4 0-2.7-2.3-4.3-2.8-7.6-1.5 1.1-2.4 2.7-2.4 4.4-.9-.6-1.3-1.5-1.4-2.4C4.6 5.6 3.5 7.6 3.5 10.1c0 2.6 1.9 4.4 4.5 4.4Z" />
  </Icon>
);
export const HomeIcon = (p: { size?: number }) => (
  <Icon {...p}>
    <path d="M2.5 7.2 8 2.5l5.5 4.7V13a.8.8 0 0 1-.8.8H9.8V10H6.2v3.8H3.3a.8.8 0 0 1-.8-.8Z" />
  </Icon>
);
export const TimerIcon = (p: { size?: number }) => (
  <Icon {...p}>
    <circle cx="8" cy="9" r="5.3" />
    <path d="M8 6.2V9l1.8 1.2M6.3 1.8h3.4" />
  </Icon>
);
export const TrophyIcon = (p: { size?: number }) => (
  <Icon {...p}>
    <path d="M4.5 2.5h7v3.2a3.5 3.5 0 0 1-7 0Z M4.5 3.5H2.5v1a2 2 0 0 0 2 2M11.5 3.5h2v1a2 2 0 0 1-2 2M8 9.2v2.6M5.5 13.5h5M6.3 11.8h3.4" />
  </Icon>
);
export const ShirtIcon = (p: { size?: number }) => (
  <Icon {...p}>
    <path d="M5.6 2.5 2.3 4.3l1.2 2.6 1.4-.6v7.2h6.2V6.3l1.4.6 1.2-2.6-3.3-1.8a2.4 2.4 0 0 1-4.8 0Z" />
  </Icon>
);
export const ChartIcon = (p: { size?: number }) => (
  <Icon {...p}>
    <path d="M2.5 13.5h11M4.5 11V8M8 11V4.5M11.5 11V6.5" />
  </Icon>
);
export const GearIcon = (p: { size?: number }) => (
  <Icon {...p}>
    <circle cx="8" cy="8" r="2.1" />
    <path d="M8 1.8v1.6M8 12.6v1.6M3.6 3.6l1.1 1.1M11.3 11.3l1.1 1.1M1.8 8h1.6M12.6 8h1.6M3.6 12.4l1.1-1.1M11.3 4.7l1.1-1.1" />
  </Icon>
);
export const LockIcon = (p: { size?: number }) => (
  <Icon {...p}>
    <rect x="3.5" y="7" width="9" height="6.5" rx="1.6" />
    <path d="M5.5 7V5.2a2.5 2.5 0 0 1 5 0V7" />
  </Icon>
);
export const CheckIcon = (p: { size?: number }) => (
  <Icon {...p}>
    <path d="M3.5 8.4 6.6 11.4 12.5 4.8" />
  </Icon>
);
