/**
 * Locally bundled, simplified logo marks for the built-in sites, used only to
 * identify them in Tablin's own settings (no runtime fetching). The marks are
 * trademarks of their respective owners; Tablin is not affiliated with them.
 */
import type { ReactElement } from 'react';

export interface LogoDef {
  label: string;
  /** Tile needs a hairline border on dark backgrounds (dark marks). */
  dark: boolean;
  render(id: string): ReactElement;
}

const IG = (id: string) => (
  <>
    <defs>
      <radialGradient id={`${id}-ig`} cx="30%" cy="107%" r="150%">
        <stop offset="0" stopColor="#FDF497" />
        <stop offset="0.05" stopColor="#FDF497" />
        <stop offset="0.45" stopColor="#FD5949" />
        <stop offset="0.6" stopColor="#D6249F" />
        <stop offset="0.9" stopColor="#285AEB" />
      </radialGradient>
    </defs>
    <rect x="1" y="1" width="22" height="22" rx="6.2" fill={`url(#${id}-ig)`} />
    <rect
      x="5.6"
      y="5.6"
      width="12.8"
      height="12.8"
      rx="3.9"
      fill="none"
      stroke="#fff"
      strokeWidth="1.7"
    />
    <circle cx="12" cy="12" r="3.1" fill="none" stroke="#fff" strokeWidth="1.7" />
    <circle cx="15.9" cy="8.1" r="0.95" fill="#fff" />
  </>
);

const TIKTOK_NOTE =
  'M15.6 3.2c.3 1.7 1.3 3 2.9 3.6.6.2 1.1.3 1.7.3v2.8c-1.6 0-3.2-.5-4.5-1.4v6.1a5.3 5.3 0 1 1-5.3-5.3c.3 0 .6 0 .9.1v2.9a2.5 2.5 0 1 0 1.6 2.3V3.2h2.7Z';

const TT = () => (
  <>
    <rect x="1" y="1" width="22" height="22" rx="6.2" fill="#111" />
    <path d={TIKTOK_NOTE} fill="#25F4EE" transform="translate(-0.9 -0.7)" />
    <path d={TIKTOK_NOTE} fill="#FE2C55" transform="translate(0.9 0.7)" />
    <path d={TIKTOK_NOTE} fill="#fff" />
  </>
);

const YT = () => (
  <>
    <rect x="1" y="4.6" width="22" height="14.8" rx="4.4" fill="#FF0033" />
    <path d="M9.8 8.6v6.8l5.8-3.4Z" fill="#fff" />
  </>
);

const FB = () => (
  <>
    <circle cx="12" cy="12" r="11" fill="#0866FF" />
    <path
      d="M13.4 23v-8.3h2.7l.4-3.2h-3.1V9.5c0-.9.3-1.6 1.6-1.6h1.7V5.1c-.3 0-1.3-.1-2.4-.1-2.4 0-4 1.4-4 4.1v2.4H7.6v3.2h2.7V23Z"
      fill="#fff"
    />
  </>
);

const RD = () => (
  <>
    <circle cx="12" cy="12" r="11" fill="#FF4500" />
    <path
      d="M12.2 9.3 13.1 5.4l3.1.7"
      fill="none"
      stroke="#fff"
      strokeWidth="1"
      strokeLinecap="round"
    />
    <circle cx="16.9" cy="6.3" r="1.25" fill="#fff" />
    <circle cx="6.9" cy="11.2" r="1.6" fill="#fff" />
    <circle cx="17.1" cy="11.2" r="1.6" fill="#fff" />
    <ellipse cx="12" cy="14" rx="6.3" ry="4.4" fill="#fff" />
    <circle cx="9.6" cy="13.4" r="1.05" fill="#FF4500" />
    <circle cx="14.4" cy="13.4" r="1.05" fill="#FF4500" />
    <path
      d="M9.6 15.9q2.4 1.4 4.8 0"
      fill="none"
      stroke="#FF4500"
      strokeWidth="0.8"
      strokeLinecap="round"
    />
  </>
);

const X = () => (
  <>
    <rect x="1" y="1" width="22" height="22" rx="6.2" fill="#000" />
    <path
      d="M16.2 5.5h2.1l-4.6 5.3 5.4 7.2h-4.2l-3.3-4.3-3.8 4.3H5.7l4.9-5.6-5.2-6.9h4.3l3 4Zm-.7 11.2h1.2L9.2 6.7H8Z"
      fill="#fff"
    />
  </>
);

export const SITE_LOGOS: Record<string, LogoDef> = {
  instagram: { label: 'Instagram', dark: false, render: IG },
  tiktok: { label: 'TikTok', dark: true, render: TT },
  youtube: { label: 'YouTube', dark: false, render: YT },
  facebook: { label: 'Facebook', dark: false, render: FB },
  reddit: { label: 'Reddit', dark: false, render: RD },
  x: { label: 'X', dark: true, render: X },
};

export function hasLogo(siteId: string): boolean {
  return Object.prototype.hasOwnProperty.call(SITE_LOGOS, siteId);
}
