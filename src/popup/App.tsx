import { useState } from 'react';
import { sendToWorker } from '../shared/messages';
import type { PauseMode, StatusSnapshot } from '../shared/types';
import { Toggle } from '../ui/components/controls';
import { timeAgo, useAccent, useNow, useStatus } from '../ui/hooks';
import { StatsRow } from './components/StatsRow';
import { StatusHeader } from './components/StatusHeader';

const PAUSES: { mode: PauseMode; label: string }[] = [
  { mode: '15m', label: '15 min' },
  { mode: '1h', label: '1 hour' },
  { mode: 'session', label: 'This session' },
];

export function App() {
  const { status, setStatus, refresh, error } = useStatus(1000);
  const now = useNow(1000);
  const [busy, setBusy] = useState(false);
  useAccent(status?.character.color);

  async function run(action: () => Promise<StatusSnapshot | unknown>) {
    setBusy(true);
    try {
      const result = await action();
      if (result && typeof result === 'object' && 'enabled' in result)
        setStatus(result as StatusSnapshot);
      else await refresh();
    } finally {
      setBusy(false);
    }
  }

  if (!status) {
    return (
      <main className="popup">
        <div className="loading" role="status">
          {error ? `Couldn't reach Tablin (${error}).` : 'Waking Tablin up…'}
        </div>
      </main>
    );
  }

  const paused = status.pause !== null;
  const active = status.activeTab;

  return (
    <main className="popup">
      <StatusHeader
        status={status}
        now={now}
        onToggle={(enabled) => run(() => sendToWorker({ type: 'SET_ENABLED', enabled }))}
      />

      {active && status.enabled && !paused && (
        <button
          type="button"
          className="btn btn-soft btn-block"
          disabled={busy}
          onClick={() => run(() => sendToWorker({ type: 'CANCEL_ACTIVE' }))}
        >
          Not now on {active.siteName} (5 min)
        </button>
      )}

      {status.lastClosed && (
        <div className="banner">
          <span>
            Closed <strong>{status.lastClosed.siteName || 'a tab'}</strong>{' '}
            {timeAgo(now - status.lastClosed.closedAt)}
          </span>
          <button
            type="button"
            className="btn btn-sm"
            disabled={busy}
            onClick={() => run(() => sendToWorker({ type: 'REOPEN_LAST' }))}
          >
            Reopen
          </button>
        </div>
      )}

      <section className="card">
        <div className="row">
          <div className="row-label">
            <span className="row-title">Auto-close tabs</span>
            <span className="row-desc">
              {status.autoClose
                ? `${status.character.name} closes the tab after a 3-second countdown.`
                : `${status.character.name} only reminds you. Nothing gets closed.`}
            </span>
          </div>
          <Toggle
            checked={status.autoClose}
            onChange={(enabled) => run(() => sendToWorker({ type: 'SET_AUTO_CLOSE', enabled }))}
            label="Auto-close tabs"
            disabled={busy}
          />
        </div>
        <div className="row pause-row">
          <div className="row-label">
            <span className="row-title">{paused ? 'Paused' : 'Take a break'}</span>
            <span className="row-desc">
              {paused
                ? 'No characters until you resume.'
                : `${status.character.name} naps meanwhile.`}
            </span>
          </div>
          {paused ? (
            <button
              type="button"
              className="btn btn-sm"
              disabled={busy}
              onClick={() => run(() => sendToWorker({ type: 'RESUME' }))}
            >
              Resume
            </button>
          ) : null}
        </div>
        {!paused && (
          <div className="pause-buttons">
            {[...PAUSES]
              .sort(
                (a, b) =>
                  Number(b.mode === status.defaultPause) - Number(a.mode === status.defaultPause),
              )
              .map((p) => (
                <button
                  key={p.mode}
                  type="button"
                  className="btn btn-soft btn-sm"
                  disabled={busy || !status.enabled}
                  onClick={() => run(() => sendToWorker({ type: 'PAUSE', mode: p.mode }))}
                >
                  {p.label}
                </button>
              ))}
          </div>
        )}
      </section>

      <StatsRow status={status} />

      <footer className="popup-footer">
        <button
          type="button"
          className="btn btn-danger btn-sm"
          disabled={busy || (paused && status.pause?.mode === 'indefinite')}
          onClick={() => run(() => sendToWorker({ type: 'EMERGENCY_STOP' }))}
          title="Sends the character away everywhere and pauses until you resume (Alt+Shift+S)"
        >
          Emergency stop
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => chrome.runtime.openOptionsPage()}
        >
          Settings
        </button>
      </footer>
      {!status.onboardingComplete && (
        <button
          type="button"
          className="onboarding-link"
          onClick={() => chrome.runtime.openOptionsPage()}
        >
          Finish setting up {status.character.name} →
        </button>
      )}
    </main>
  );
}
