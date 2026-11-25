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

/**
 * Close timer: how long the character waits with its hand on the X (auto-close only)
 * before the tab closes. 0 = it walks over and clicks it straight away.
 */
export const CLOSE_TIMER_MIN_SECONDS = 0;
export const CLOSE_TIMER_MAX_SECONDS = 10;
export const DEFAULT_CLOSE_TIMER_SECONDS = 0;
/** How long the "click" on the X reads before the tab closes when the timer is 0. */
export const CLOSE_CLICK_MS = 320;
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
export const STATS_RETENTION_DAYS = 400;

export const PAUSE_DURATIONS_MS = {
  '15m': 15 * 60_000,
  '1h': 60 * 60_000,
} as const;

export const ALARM_PAUSE_END = 'tablin:pause-end';
export const CUSTOM_SCRIPT_ID = 'tablin-custom-sites';

// ---- V2: focus sessions, streaks, achievements --------------------------------

export const FOCUS_MINUTES_MIN = 1;
export const FOCUS_MINUTES_MAX = 240;
export const BREAK_MINUTES_MIN = 1;
export const BREAK_MINUTES_MAX = 60;
export const FOCUS_PRESETS_MINUTES = [15, 25, 45, 60, 90] as const;
/** A completed focus session must be at least this long to count toward the streak. */
export const STREAK_QUALIFYING_MINUTES = 5;
/** Ended-early sessions shorter than this aren't recorded at all. */
export const MIN_RECORDED_FOCUS_MS = 60_000;
export const FOCUS_HISTORY_LIMIT = 500;
export const ALARM_FOCUS_END = 'tablin:focus-end';
export const ALARM_FOCUS_TICK = 'tablin:focus-tick';
export const STORAGE_SCHEMA_VERSION = 2;
