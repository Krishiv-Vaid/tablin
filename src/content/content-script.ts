/**
 * Content script: the thin bridge between a web page and the background worker.
 *
 * It never decides on its own to close anything. It reports page lifecycle
 * (ready, visibility), runs a local timer to the worker-provided dueAt, shows
 * the character when the worker says "appear", and asks the worker to close —
 * the worker re-verifies everything before calling chrome.tabs.remove.
 */
import type { ContentMessage, ResponseMap, WorkerToContentMessage } from '../shared/messages';
import type { ApproachPlan, CloseResult, TabSync } from '../shared/types';
import { Overlay } from './overlay/Overlay';
import { UnsavedInputTracker } from './unsaved-input';

const TAKEOVER_EVENT = 'tablin:takeover';

class TablinContent {
  private overlay: Overlay | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private readonly unsaved = new UnsavedInputTracker(document);
  private dead = false;

  start(): void {
    // If an older instance exists (extension reloaded/updated), ask it to step aside.
    document.dispatchEvent(new CustomEvent(TAKEOVER_EVENT));
    document.addEventListener(TAKEOVER_EVENT, this.onTakeover);
    chrome.runtime.onMessage.addListener(this.onMessage);
    document.addEventListener('visibilitychange', this.onVisibility);
    void this.send({ type: 'PAGE_READY', url: location.href }).then((s) => s && this.apply(s));
  }

  private onTakeover = (): void => {
    // Fired by a newer instance (we registered after dispatching our own event).
    this.teardown();
  };

  private async send<M extends ContentMessage>(msg: M): Promise<ResponseMap[M['type']] | null> {
    if (this.dead) return null;
    try {
      const response = (await chrome.runtime.sendMessage(msg)) as
        ResponseMap[M['type']] | { error: string };
      if (response && typeof response === 'object' && 'error' in response) return null;
      return response as ResponseMap[M['type']];
    } catch {
      // "Extension context invalidated": the extension was reloaded/removed.
      if (!chrome.runtime?.id) this.teardown();
      return null;
    }
  }

  private onMessage = (message: unknown): undefined => {
    const msg = message as WorkerToContentMessage | undefined;
    if (msg?.type === 'SYNC' && msg.sync) this.apply(msg.sync);
    return undefined;
  };

  private onVisibility = (): void => {
    const visible = document.visibilityState === 'visible';
    void this.send({ type: 'VISIBILITY_CHANGED', visible }).then((s) => s && this.apply(s));
  };

  private apply(sync: TabSync): void {
    if (this.dead) return;
    clearTimeout(this.timer);
    switch (sync.mode) {
      case 'idle':
      case 'waiting':
        this.overlay?.dismiss();
        break;
      case 'counting': {
        this.overlay?.dismiss();
        const delay = Math.max(0, sync.dueAt - Date.now());
        this.timer = setTimeout(() => {
          void this.send({ type: 'COUNTDOWN_ELAPSED' }).then((s) => s && this.apply(s));
        }, delay);
        break;
      }
      case 'appear':
        this.show(sync.plan);
        break;
    }
  }

  private show(plan: ApproachPlan): void {
    if (this.overlay && !this.overlay.leaving) {
      this.overlay.update(plan);
      return;
    }
    this.overlay?.destroy();
    const overlay = new Overlay(document, plan, {
      onSnooze: () => {
        void this.send({ type: 'SNOOZE_TAB' }).then((s) => {
          // Apply the new countdown, but don't let it dismiss the goodbye animation early.
          if (s && s.mode === 'counting') this.apply(s);
        });
      },
      onRequestClose: async (trigger): Promise<CloseResult> =>
        (await this.send({
          type: 'REQUEST_CLOSE',
          trigger,
          hasUnsavedInput: this.unsaved.hasUnsavedInput(),
        })) ?? { ok: false, reason: 'not-tracked' },
      onGone: () => {
        if (this.overlay === overlay) this.overlay = null;
      },
    });
    this.overlay = overlay;
    overlay.mount();
  }

  private teardown(): void {
    if (this.dead) return;
    this.dead = true;
    clearTimeout(this.timer);
    this.overlay?.destroy();
    this.overlay = null;
    this.unsaved.destroy();
    document.removeEventListener('visibilitychange', this.onVisibility);
    document.removeEventListener(TAKEOVER_EVENT, this.onTakeover);
    try {
      chrome.runtime.onMessage.removeListener(this.onMessage);
    } catch {
      // context already gone
    }
  }
}

// Only run in the top frame of normal web pages.
if (window.top === window && (location.protocol === 'https:' || location.protocol === 'http:')) {
  new TablinContent().start();
}
