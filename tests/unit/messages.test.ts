import { describe, expect, it, vi } from 'vitest';
import { createRouter, isTablinMessage, type Handlers } from '../../src/shared/messages';

function handlers(): Handlers {
  const ok = vi.fn(async () => ({ mode: 'idle' }) as never);
  return new Proxy({} as Handlers, { get: () => ok });
}

const page = { isExtensionPage: true };
const content = { isExtensionPage: false, tabId: 7 };

describe('message passing', () => {
  it('validates message shapes', () => {
    expect(isTablinMessage({ type: 'PAGE_READY', url: 'https://x.com' })).toBe(true);
    expect(isTablinMessage({ type: 'PAGE_READY' })).toBe(false);
    expect(isTablinMessage({ type: 'PAUSE', mode: '15m' })).toBe(true);
    expect(isTablinMessage({ type: 'PAUSE', mode: 'forever' })).toBe(false);
    expect(
      isTablinMessage({ type: 'REQUEST_CLOSE', trigger: 'auto', hasUnsavedInput: false }),
    ).toBe(true);
    expect(isTablinMessage({ type: 'REQUEST_CLOSE', trigger: 'now', hasUnsavedInput: false })).toBe(
      false,
    );
    expect(isTablinMessage({ type: 'DELETE_EVERYTHING' })).toBe(false);
    expect(isTablinMessage(null)).toBe(false);
    expect(isTablinMessage('PAGE_READY')).toBe(false);
  });

  it('routes content messages from tabs and UI messages from extension pages', async () => {
    const h = handlers();
    const route = createRouter(h);
    await expect(route({ type: 'COUNTDOWN_ELAPSED' }, content)).resolves.toEqual({ mode: 'idle' });
    await expect(route({ type: 'GET_STATUS' }, page)).resolves.toEqual({ mode: 'idle' });
  });

  it('refuses UI commands coming from web pages (content scripts)', async () => {
    const route = createRouter(handlers());
    await expect(route({ type: 'PAUSE', mode: 'indefinite' }, content)).rejects.toThrow(
      /Unexpected sender/,
    );
    await expect(route({ type: 'RESET_STATS' }, content)).rejects.toThrow(/Unexpected sender/);
  });

  it('refuses content messages without a tab', async () => {
    const route = createRouter(handlers());
    await expect(
      route({ type: 'REQUEST_CLOSE', trigger: 'auto', hasUnsavedInput: false }, page),
    ).rejects.toThrow();
    await expect(
      route({ type: 'PAGE_READY', url: 'https://x.com' }, { isExtensionPage: false }),
    ).rejects.toThrow();
  });

  it('rejects unknown messages', async () => {
    const route = createRouter(handlers());
    await expect(route({ type: 'NOPE' }, page)).rejects.toThrow(/Unrecognised/);
  });
});
