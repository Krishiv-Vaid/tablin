/** Core domain types shared by the background worker, content script and UI. */

export const CHARACTER_COLORS = [
  'orange',
  'pink',
  'purple',
  'blue',
  'green',
  'yellow',
  'red',
] as const;
/** Colors earned through achievements (cosmetic only). */
export const UNLOCKABLE_COLORS = ['pastel'] as const;
export const ALL_CHARACTER_COLORS = [...CHARACTER_COLORS, ...UNLOCKABLE_COLORS] as const;
export type CharacterColor = (typeof ALL_CHARACTER_COLORS)[number];

export const CHARACTER_SIZES = ['small', 'medium', 'large'] as const;
export type CharacterSize = (typeof CHARACTER_SIZES)[number];

export const ANIMATION_INTENSITIES = ['calm', 'normal', 'lively'] as const;
export type AnimationIntensity = (typeof ANIMATION_INTENSITIES)[number];

export const RESET_FREQUENCIES = ['session', 'daily'] as const;
export type ResetFrequency = (typeof RESET_FREQUENCIES)[number];

export const ESCALATION_CURVES = ['gentle', 'linear', 'steep'] as const;
export type EscalationCurve = (typeof ESCALATION_CURVES)[number];

/** What happens to a running countdown when the user switches away from the tab. */
export const SWITCH_AWAY_BEHAVIORS = ['pause', 'restart'] as const;
export type SwitchAwayBehavior = (typeof SWITCH_AWAY_BEHAVIORS)[number];

export const REDUCED_MOTION_PREFERENCES = ['system', 'reduce', 'full'] as const;
export type ReducedMotionPreference = (typeof REDUCED_MOTION_PREFERENCES)[number];

export const PAUSE_MODES = ['15m', '1h', 'session', 'indefinite'] as const;
export type PauseMode = (typeof PAUSE_MODES)[number];
export type DefaultPause = '15m' | '1h';

/** Character designs. Only one ships today; the registry is ready for more. */
export const CHARACTER_DESIGNS = ['tablin'] as const;
export type CharacterDesignId = (typeof CHARACTER_DESIGNS)[number];

/** Countdown preset choices offered per site (seconds). */
export const DELAY_PRESETS = [5, 10, 15, 20, 30, 45, 60] as const;

/**
 * Per-site countdown configuration.
 * inherit – use the global default (follows it when it changes)
 * preset  – one of DELAY_PRESETS
 * custom  – any whole number of seconds within the allowed range
 */
export type DelayConfig =
  { mode: 'inherit' } | { mode: 'preset'; seconds: number } | { mode: 'custom'; seconds: number };

export interface SiteRule {
  id: string;
  name: string;
  /** Registrable domains. Subdomains match automatically (m.youtube.com → youtube.com). */
  domains: string[];
  enabled: boolean;
  /** Accent used in the settings list. */
  color: string;
  delay: DelayConfig;
  builtIn: boolean;
}

export interface CharacterSettings {
  design: CharacterDesignId;
  color: CharacterColor;
  size: CharacterSize;
  intensity: AnimationIntensity;
  name: string;
}

export interface BehaviorSettings {
  escalationEnabled: boolean;
  maxSpeedMultiplier: number;
  escalationCurve: EscalationCurve;
  resetFrequency: ResetFrequency;
  slingshotEnabled: boolean;
  soundEnabled: boolean;
  reducedMotion: ReducedMotionPreference;
  /** Base character speed, 0.5–2. */
  speed: number;
  protectAudible: boolean;
  switchAway: SwitchAwayBehavior;
}

export interface FocusSettings {
  /** Default focus length, minutes (1–240). */
  focusMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
  /** A long break is suggested after this many completed focus sessions. */
  sessionsBeforeLongBreak: number;
  /** Start the suggested break automatically when a focus session completes. */
  autoStartBreaks: boolean;
  /** Don't intercept distracting sites during breaks. */
  relaxDuringBreaks: boolean;
  /** Show a Chrome notification when a session ends. */
  notifications: boolean;
}

export const SETTINGS_SCHEMA_VERSION = 2;

export interface Settings {
  schemaVersion: 2;
  enabled: boolean;
  /** Off by default: new installs start in nudge mode. */
  autoClose: boolean;
  delaySeconds: number;
  defaultPause: DefaultPause;
  sites: SiteRule[];
  character: CharacterSettings;
  behavior: BehaviorSettings;
  focus: FocusSettings;
  onboardingComplete: boolean;
}

export interface PauseState {
  mode: PauseMode;
  startedAt: number;
  /** Epoch ms when the pause ends, or null for session/indefinite pauses. */
  until: number | null;
}

/**
 * waiting  – tracked, but not counting (tab inactive, hidden, or companion paused)
 * counting – countdown running since `resumedAt`
 * appeared – the character is on the page
 */
export type TabPhase = 'waiting' | 'counting' | 'appeared';

export interface TabRecord {
  tabId: number;
  windowId: number;
  siteId: string;
  url: string;
  phase: TabPhase;
  /** Countdown time left when last paused (or the full delay when fresh). */
  remainingMs: number;
  /** When counting resumed, or null when not counting. */
  resumedAt: number | null;
  snoozedUntil: number | null;
  appearedAt: number | null;
  /** Escalation level of the current/next appearance. */
  level: number;
}

export interface EscalationState {
  count: number;
  periodKey: string;
}

export interface LastClosedTab {
  url: string;
  title: string;
  siteName: string;
  windowId: number;
  index: number;
  closedAt: number;
}

export interface DayStats {
  intercepted: number;
  closed: number;
  snoozed: number;
  reminders: number;
  /** Minutes focused that day (completed sessions + time from sessions ended early). */
  focusMinutes: number;
  /** Completed focus sessions. */
  focusSessions: number;
  /** Completed focus sessions long enough to count toward the streak. */
  qualifyingSessions: number;
}

export interface Stats {
  days: Record<string, DayStats>;
  totalIntercepted: number;
  totalClosed: number;
  /** Browser sessions Tablin has watched (v1 called these "focus sessions"). */
  totalWatchSessions: number;
  /** Completed focus-timer sessions. */
  totalFocusSessions: number;
  totalFocusMinutes: number;
  longestFocusMinutes: number;
  longestStreak: number;
}

/** A browser session (or the time since resuming from a pause), used for escalation. */
export interface WatchSession {
  id: string;
  startedAt: number;
  intercepted: number;
}

// ---- Focus sessions ---------------------------------------------------------

export const FOCUS_KINDS = ['focus', 'shortBreak', 'longBreak'] as const;
export type FocusKind = (typeof FOCUS_KINDS)[number];

export interface ActiveFocusSession {
  id: string;
  kind: FocusKind;
  status: 'running' | 'paused';
  /** Planned length. */
  durationMs: number;
  startedAt: number;
  /** When it will complete (while running). */
  endsAt: number | null;
  /** Time left (while paused). */
  remainingMs: number;
}

export interface FocusHistoryEntry {
  id: string;
  kind: FocusKind;
  /** completed – ran to the end; ended – stopped early by the user (never penalised). */
  outcome: 'completed' | 'ended';
  startedAt: number;
  endedAt: number;
  plannedMs: number;
  /** Time actually spent (excluding pauses). */
  focusedMs: number;
  /** Local calendar day it ended on (fixed at the time, so timezone changes don't rewrite history). */
  day: string;
}

export interface FocusState {
  current: ActiveFocusSession | null;
  /** Completed focus sessions since the last long break. */
  cycleCount: number;
  /** Last completed session, until the user has seen the celebration. */
  celebrate: FocusHistoryEntry | null;
}

export interface FocusSnapshot {
  now: number;
  current: ActiveFocusSession | null;
  /** Remaining ms for the current session (derived from timestamps). */
  remainingMs: number;
  celebrate: FocusHistoryEntry | null;
  nextBreak: 'shortBreak' | 'longBreak';
  cycleCount: number;
  settings: FocusSettings;
  streak: StreakInfo;
  today: { focusMinutes: number; focusSessions: number };
  history: FocusHistoryEntry[];
}

export interface StreakInfo {
  current: number;
  longest: number;
  lastQualifyingDay: string | null;
  /** Whether today already has a qualifying session. */
  todayDone: boolean;
}

// ---- Achievements & cosmetics ----------------------------------------------

export type AchievementCategory = 'focus' | 'streaks' | 'distractions' | 'time';

export type CosmeticSlot = 'color' | 'hat' | 'accessory' | 'effect' | 'celebration';

export interface Equipped {
  hat: string | null;
  accessory: string | null;
  effect: string | null;
  celebration: string | null;
}

export interface Inventory {
  /** Cosmetic id → epoch ms it was unlocked. */
  unlocked: Record<string, number>;
  equipped: Equipped;
}

/** Achievement id → epoch ms it was unlocked. */
export type AchievementRecord = Record<string, number>;

export interface UnlockEvent {
  achievementId: string;
  rewardId: string | null;
  at: number;
}

export type Gait = 'walk' | 'run';
export type Mood = 'casual' | 'curious' | 'determined' | 'frustrated';

/** Everything the content script needs to run one appearance. */
export interface ApproachPlan {
  level: number;
  speedMultiplier: number;
  gait: Gait;
  mood: Mood;
  message: string | null;
  autoClose: boolean;
  siteName: string;
  character: CharacterSettings;
  /** Equipped cosmetics, already filtered to what's unlocked. */
  cosmetics: Equipped;
  /** A focus session is running: the character says so. */
  focusActive: boolean;
  behavior: Pick<BehaviorSettings, 'slingshotEnabled' | 'soundEnabled' | 'reducedMotion' | 'speed'>;
}

export type TabSync =
  | { mode: 'idle' }
  | { mode: 'waiting' }
  | { mode: 'counting'; dueAt: number }
  | { mode: 'appear'; plan: ApproachPlan };

export type CloseRefusal =
  | 'disabled'
  | 'paused'
  | 'auto-close-off'
  | 'not-tracked'
  | 'not-approaching'
  | 'too-soon'
  | 'tab-missing'
  | 'inactive'
  | 'url-mismatch'
  | 'pinned'
  | 'audible'
  | 'snoozed'
  | 'unsaved-input';

export type CloseResult = { ok: true } | { ok: false; reason: CloseRefusal };

export interface StatusSnapshot {
  enabled: boolean;
  autoClose: boolean;
  onboardingComplete: boolean;
  defaultPause: DefaultPause;
  pause: PauseState | null;
  /** Distractions aren't intercepted right now because a break is running. */
  relaxing: boolean;
  today: DayStats;
  streak: StreakInfo;
  session: WatchSession;
  escalation: {
    enabled: boolean;
    count: number;
    nextLevel: number;
    nextSpeedMultiplier: number;
    resetFrequency: ResetFrequency;
  };
  activeTab: {
    siteId: string;
    siteName: string;
    phase: TabPhase;
    dueAt: number | null;
    /** The site's configured countdown (seconds). */
    delaySeconds: number;
  } | null;
  lastClosed: LastClosedTab | null;
  character: CharacterSettings;
  cosmetics: Equipped;
  focus: {
    kind: FocusKind;
    status: 'running' | 'paused';
    endsAt: number | null;
    remainingMs: number;
  } | null;
  achievements: { unlocked: number; total: number; unseen: number };
}
