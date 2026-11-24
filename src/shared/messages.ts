import { isEquipSlot, type EquipSlot } from './cosmetics';
import {
  FOCUS_KINDS,
  type AchievementRecord,
  type CloseResult,
  type FocusKind,
  type FocusSnapshot,
  type Inventory,
  type LastClosedTab,
  type PauseMode,
  type Stats,
  type StatusSnapshot,
  type TabSync,
  type UnlockEvent,
} from './types';

/** Messages sent by the content script (sender.tab identifies the tab). */
export type ContentMessage =
  | { type: 'PAGE_READY'; url: string }
  | { type: 'VISIBILITY_CHANGED'; visible: boolean }
  | { type: 'COUNTDOWN_ELAPSED' }
  | { type: 'REQUEST_CLOSE'; trigger: 'auto' | 'manual'; hasUnsavedInput: boolean }
  | { type: 'SNOOZE_TAB' };

/** Messages sent by the popup and settings page. */
export type UiMessage =
  | { type: 'GET_STATUS' }
  | { type: 'SET_ENABLED'; enabled: boolean }
  | { type: 'SET_AUTO_CLOSE'; enabled: boolean }
  | { type: 'PAUSE'; mode: PauseMode }
  | { type: 'RESUME' }
  | { type: 'EMERGENCY_STOP' }
  | { type: 'CANCEL_ACTIVE' }
  | { type: 'REOPEN_LAST' }
  | { type: 'RESET_STATS' }
  // V2
  | { type: 'FOCUS_GET' }
  | { type: 'FOCUS_START'; kind: FocusKind; minutes?: number }
  | { type: 'FOCUS_PAUSE' }
  | { type: 'FOCUS_RESUME' }
  | { type: 'FOCUS_END' }
  | { type: 'FOCUS_ACK' }
  | { type: 'PROGRESS_GET' }
  | { type: 'EQUIP'; slot: EquipSlot; id: string | null }
  | { type: 'ACK_UNLOCKS' };

export type TablinMessage = ContentMessage | UiMessage;
export type MessageType = TablinMessage['type'];

/** Messages pushed from the worker to a tab's content script. */
export type WorkerToContentMessage = { type: 'SYNC'; sync: TabSync };

export interface ResponseMap {
  PAGE_READY: TabSync;
  VISIBILITY_CHANGED: TabSync;
  COUNTDOWN_ELAPSED: TabSync;
  REQUEST_CLOSE: CloseResult;
  SNOOZE_TAB: TabSync;
  GET_STATUS: StatusSnapshot;
  SET_ENABLED: StatusSnapshot;
  SET_AUTO_CLOSE: StatusSnapshot;
  PAUSE: StatusSnapshot;
  RESUME: StatusSnapshot;
  EMERGENCY_STOP: StatusSnapshot;
  CANCEL_ACTIVE: StatusSnapshot;
  REOPEN_LAST: { reopened: boolean; tab: LastClosedTab | null };
  RESET_STATS: StatusSnapshot;
  FOCUS_GET: FocusSnapshot;
  FOCUS_START: FocusSnapshot | { ok: false; error: string };
  FOCUS_PAUSE: FocusSnapshot;
  FOCUS_RESUME: FocusSnapshot;
  FOCUS_END: FocusSnapshot;
  FOCUS_ACK: FocusSnapshot;
  PROGRESS_GET: ProgressSnapshot;
  EQUIP: { ok: true; inventory: Inventory } | { ok: false; error: string };
  ACK_UNLOCKS: ProgressSnapshot;
}

export interface ProgressSnapshot {
  now: number;
  achievements: AchievementRecord;
  inventory: Inventory;
  unseen: UnlockEvent[];
  stats: Stats;
}

const MESSAGE_TYPES: ReadonlySet<string> = new Set<MessageType>([
  'PAGE_READY',
  'VISIBILITY_CHANGED',
  'COUNTDOWN_ELAPSED',
  'REQUEST_CLOSE',
  'SNOOZE_TAB',
  'GET_STATUS',
  'SET_ENABLED',
  'SET_AUTO_CLOSE',
  'PAUSE',
  'RESUME',
  'EMERGENCY_STOP',
  'CANCEL_ACTIVE',
  'REOPEN_LAST',
  'RESET_STATS',
  'FOCUS_GET',
  'FOCUS_START',
  'FOCUS_PAUSE',
  'FOCUS_RESUME',
  'FOCUS_END',
  'FOCUS_ACK',
  'PROGRESS_GET',
  'EQUIP',
  'ACK_UNLOCKS',
]);

const CONTENT_TYPES: ReadonlySet<string> = new Set<MessageType>([
  'PAGE_READY',
  'VISIBILITY_CHANGED',
  'COUNTDOWN_ELAPSED',
  'REQUEST_CLOSE',
  'SNOOZE_TAB',
]);

/** Structural validation for anything arriving over chrome.runtime messaging. */
export function isTablinMessage(value: unknown): value is TablinMessage {
  if (typeof value !== 'object' || value === null) return false;
  const msg = value as Record<string, unknown>;
  if (typeof msg.type !== 'string' || !MESSAGE_TYPES.has(msg.type)) return false;
  switch (msg.type) {
    case 'PAGE_READY':
      return typeof msg.url === 'string';
    case 'VISIBILITY_CHANGED':
      return typeof msg.visible === 'boolean';
    case 'REQUEST_CLOSE':
      return (
        (msg.trigger === 'auto' || msg.trigger === 'manual') &&
        typeof msg.hasUnsavedInput === 'boolean'
      );
    case 'SET_ENABLED':
    case 'SET_AUTO_CLOSE':
      return typeof msg.enabled === 'boolean';
    case 'PAUSE':
      return (
        msg.mode === '15m' ||
        msg.mode === '1h' ||
        msg.mode === 'session' ||
        msg.mode === 'indefinite'
      );
    case 'FOCUS_START':
      return (
        typeof msg.kind === 'string' &&
        (FOCUS_KINDS as readonly string[]).includes(msg.kind) &&
        (msg.minutes === undefined ||
          (typeof msg.minutes === 'number' && Number.isInteger(msg.minutes)))
      );
    case 'EQUIP':
      return isEquipSlot(msg.slot) && (msg.id === null || typeof msg.id === 'string');
    default:
      return true;
  }
}

export function isContentMessage(msg: TablinMessage): msg is ContentMessage {
  return CONTENT_TYPES.has(msg.type);
}

export interface SenderInfo {
  tabId?: number;
  windowId?: number;
  url?: string;
  /** True when the sender is one of Tablin's own pages (popup, settings). */
  isExtensionPage: boolean;
}

export type Handlers = {
  [K in MessageType]: (
    msg: Extract<TablinMessage, { type: K }>,
    sender: SenderInfo,
  ) => Promise<ResponseMap[K]>;
};

export class MessageError extends Error {}

/**
 * Builds a dispatcher. Content messages must come from a content script in a tab;
 * UI messages must come from Tablin's own extension pages. This stops web pages
 * (via the content script) from driving popup-only actions like pausing.
 */
export function createRouter(handlers: Handlers) {
  return async (raw: unknown, sender: SenderInfo): Promise<unknown> => {
    if (!isTablinMessage(raw)) throw new MessageError('Unrecognised message');
    const validSender = isContentMessage(raw)
      ? typeof sender.tabId === 'number' && !sender.isExtensionPage
      : sender.isExtensionPage;
    if (!validSender) throw new MessageError(`Unexpected sender for ${raw.type}`);
    const handler = handlers[raw.type] as (m: TablinMessage, s: SenderInfo) => Promise<unknown>;
    return handler(raw, sender);
  };
}

/** Typed sendMessage for extension pages. */
export async function sendToWorker<M extends UiMessage>(msg: M): Promise<ResponseMap[M['type']]> {
  const response = (await chrome.runtime.sendMessage(msg)) as
    ResponseMap[M['type']] | { error: string };
  if (response && typeof response === 'object' && 'error' in response) {
    throw new Error(response.error);
  }
  return response as ResponseMap[M['type']];
}
