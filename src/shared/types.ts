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
export type CharacterColor = (typeof CHARACTER_COLORS)[number];

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

export interface SiteRule {
  id: string;
  name: string;
  /** Registrable domains. Subdomains match automatically (m.youtube.com → youtube.com). */
  domains: string[];
  enabled: boolean;
  /** Accent used in the settings list. */
  color: string;
  /** Per-site countdown override in seconds, or null to use the global delay. */
  delaySeconds: number | null;
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

export interface Settings {
  schemaVersion: 1;
  enabled: boolean;
  /** Off by default: new installs start in nudge mode. */
  autoClose: boolean;
  delaySeconds: number;
  defaultPause: DefaultPause;
  sites: SiteRule[];
  character: CharacterSettings;
  behavior: BehaviorSettings;
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
}

export interface Stats {
  days: Record<string, DayStats>;
  totalIntercepted: number;
  totalClosed: number;
  totalFocusSessions: number;
}

export interface FocusSession {
  id: string;
  startedAt: number;
  intercepted: number;
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
  today: DayStats;
  streak: number;
  totalFocusSessions: number;
  session: FocusSession;
  escalation: {
    enabled: boolean;
    count: number;
    nextLevel: number;
    nextSpeedMultiplier: number;
    resetFrequency: ResetFrequency;
  };
  activeTab: { siteName: string; phase: TabPhase; dueAt: number | null } | null;
  lastClosed: LastClosedTab | null;
  character: CharacterSettings;
}
