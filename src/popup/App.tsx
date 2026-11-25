import { useState, type ReactNode } from 'react';
import { siteDelaySeconds } from '../shared/settings';
import { sendToWorker } from '../shared/messages';
import type { PauseMode, StatusSnapshot } from '../shared/types';
import { FocusPanel } from '../ui/components/FocusPanel';
import {
  ChartIcon,
  GearIcon,
  HomeIcon,
  ShirtIcon,
  TimerIcon,
  TrophyIcon,
} from '../ui/components/Icons';
import { Toggle } from '../ui/components/controls';
import { UnlockToast } from '../ui/components/UnlockToast';
import { WebsiteIcon } from '../ui/components/WebsiteIcon';
import {
  formatClock,
  openOptions,
  timeAgo,
  useAccent,
  useNow,
  useProgress,
  useSettings,
  useStatus,
} from '../ui/hooks';
import { StatsRow } from './components/StatsRow';
import { StatusHeader } from './components/StatusHeader';

const PAUSES: { mode: PauseMode; label: string }[] = [
  { mode: '15m', label: '15 min' },
  { mode: '1h', label: '1 hour' },
  { mode: 'session', label: 'This session' },
];

type Tab = 'home' | 'focus';

function NavButton(props: { icon: ReactNode; label: string; onClick(): void }) {
  return (
    <button type="button" className="nav-btn" onClick={props.onClick}>
      {props.icon}
      <span>{props.label}</span>
    </button>
  );
}

export function App() {
  const { status, setStatus, refresh, error } = useStatus(1000);
  const { settings } = useSettings();
  const { progress, setProgress } = useProgress();
  const now = useNow(1000);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<Tab>(() => (location.hash === '#focus' ? 'focus' : 'home'));
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
  const focus = status.focus;
  const enabledSites = settings?.sites.filter((s) => s.enabled) ?? [];

  return (
    <main className="popup">
      <StatusHeader
        status={status}
        now={now}
        onToggle={(enabled) => run(() => sendToWorker({ type: 'SET_ENABLED', enabled }))}
      />

      <div className="segmented popup-tabs" role="tablist" aria-label="Popup sections">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'home'}
          aria-checked={tab === 'home'}
          onClick={() => setTab('home')}
        >
          <HomeIcon size={14} /> Home
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'focus'}
          aria-checked={tab === 'focus'}
          onClick={() => setTab('focus')}
        >
          <TimerIcon size={14} /> Focus
          {focus && (
            <span className="tab-badge">
              {formatClock(
                focus.status === 'running' ? (focus.endsAt ?? now) - now : focus.remainingMs,
              )}
            </span>
          )}
        </button>
      </div>

      {progress && progress.unseen.length > 0 && (
        <UnlockToast
          unseen={progress.unseen}
          onView={() => openOptions('achievements')}
          onDismiss={() => void sendToWorker({ type: 'ACK_UNLOCKS' }).then(setProgress)}
        />
      )}

      {tab === 'focus' ? (
        <section className="card focus-pop" role="tabpanel" aria-label="Focus">
          <FocusPanel
            variant="compact"
            name={status.character.name}
            color={status.character.color}
            cosmetics={status.cosmetics}
            intensity={status.character.intensity}
          />
        </section>
      ) : (
        <div className="home" role="tabpanel" aria-label="Home">
          {focus && (
            <button type="button" className="banner focus-banner" onClick={() => setTab('focus')}>
              <span>
                <strong>{focus.kind === 'focus' ? 'Focusing' : 'On a break'}</strong>
                {focus.status === 'paused' ? ' · paused' : ''}
              </span>
              <span className="banner-time">
                {formatClock(
                  focus.status === 'running' ? (focus.endsAt ?? now) - now : focus.remainingMs,
                )}
              </span>
            </button>
          )}

          {active && status.enabled && !paused && !status.relaxing && (
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
                    ? status.closeTimerSeconds > 0
                      ? `${status.character.name} closes the tab after a ${status.closeTimerSeconds}-second countdown.`
                      : `${status.character.name} walks over and closes the tab.`
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
                      Number(b.mode === status.defaultPause) -
                      Number(a.mode === status.defaultPause),
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

          {settings && enabledSites.length > 0 && (
            <button
              type="button"
              className="site-strip"
              onClick={() => openOptions('websites')}
              aria-label="Watched websites. Open website settings"
            >
              <span className="site-strip-label">Watching</span>
              <span className="site-strip-icons">
                {enabledSites.slice(0, 8).map((s) => (
                  <span
                    key={s.id}
                    className="site-strip-item"
                    title={`${s.name} · ${siteDelaySeconds(settings, s)}s`}
                  >
                    <WebsiteIcon site={s} size={20} decorative />
                    <span className="site-strip-delay">{siteDelaySeconds(settings, s)}s</span>
                  </span>
                ))}
              </span>
            </button>
          )}

          <button
            type="button"
            className="btn btn-danger btn-sm emergency"
            disabled={busy || (paused && status.pause?.mode === 'indefinite')}
            onClick={() => run(() => sendToWorker({ type: 'EMERGENCY_STOP' }))}
            title="Sends the character away everywhere and pauses until you resume (Alt+Shift+S)"
          >
            Emergency stop
          </button>
        </div>
      )}

      <nav className="popup-nav" aria-label="Open in full page">
        <NavButton
          icon={<ShirtIcon />}
          label="Character"
          onClick={() => openOptions('collection')}
        />
        <NavButton
          icon={<TrophyIcon />}
          label={`${status.achievements.unlocked}/${status.achievements.total}`}
          onClick={() => openOptions('achievements')}
        />
        <NavButton icon={<ChartIcon />} label="Stats" onClick={() => openOptions('statistics')} />
        <NavButton icon={<GearIcon />} label="Settings" onClick={() => openOptions('general')} />
      </nav>
      {!status.onboardingComplete && (
        <button type="button" className="onboarding-link" onClick={() => openOptions('welcome')}>
          Finish setting up {status.character.name} →
        </button>
      )}
    </main>
  );
}
