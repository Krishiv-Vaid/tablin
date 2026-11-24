export const APP_NAME = 'Tablin';
export const REPO_URL = 'https://github.com/Krishiv-Vaid/tablin';

/** Countdown before the character appears (user-configurable range). */
export const DELAY_MIN_SECONDS = 5;
export const DELAY_MAX_SECONDS = 60;
export const DEFAULT_DELAY_SECONDS = 12;

/** Escalation may shorten the countdown, but never below this. */
export const MIN_ESCALATED_DELAY_MS = 4_000;
export const MAX_ESCALATION_LEVEL = 5;
export const SPEED_MULTIPLIER_MIN = 1;
export const SPEED_MULTIPLIER_MAX = 3;
export const DEFAULT_MAX_SPEED_MULTIPLIER = 2.2;

/** Base character speed setting (multiplies everything). */
export const SPEED_SETTING_MIN = 0.5;
export const SPEED_SETTING_MAX = 2;

/** After the character reaches the exit, the user gets this long to keep the tab. */
export const CANCEL_WINDOW_MS = 3_000;
/** Server-side guard: a close is refused if the character appeared less than this long ago. */
export const MIN_APPEAR_TO_CLOSE_MS = 2_500;
/** "Not now" snoozes the tab for this long. */
export const SNOOZE_MS = 5 * 60_000;
/** After reload/return mid-approach with "pause" behavior, the character comes back this fast. */
export const REAPPEAR_MS = 1_500;
/** A closed tab can be reopened from the popup for this long. */
export const REOPEN_WINDOW_MS = 10 * 60_000;
/** Tolerance for clock jitter between content-script and worker timers. */
export const ELAPSE_TOLERANCE_MS = 300;

export const MAX_CUSTOM_SITES = 40;
export const MAX_NAME_LENGTH = 24;
export const STATS_RETENTION_DAYS = 120;

export const PAUSE_DURATIONS_MS = {
  '15m': 15 * 60_000,
  '1h': 60 * 60_000,
} as const;

export const ALARM_PAUSE_END = 'tablin:pause-end';
export const CUSTOM_SCRIPT_ID = 'tablin-custom-sites';
