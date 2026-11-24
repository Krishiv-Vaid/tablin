import { useState } from 'react';
import { sendToWorker } from '../../shared/messages';
import { computeStreak, todayStats } from '../../shared/stats';
import type { Stats } from '../../shared/types';
import { useNow } from '../../ui/hooks';
import { ActivityChart } from './ActivityChart';
import { Section } from './Section';

export function StatsSection({ stats }: { stats: Stats | null }) {
  const now = useNow(60_000);
  const [confirming, setConfirming] = useState(false);
  if (!stats) return null;
  const today = todayStats(stats, now);
  const streak = computeStreak(stats, now);
  const tiles = [
    { value: today.intercepted, label: 'Caught today' },
    { value: stats.totalIntercepted, label: 'Caught all time' },
    { value: stats.totalClosed, label: 'Tabs closed' },
    { value: streak, label: streak === 1 ? 'Day streak' : 'Days streak' },
    { value: stats.totalFocusSessions, label: 'Focus sessions' },
  ];
  const empty = stats.totalIntercepted === 0;

  return (
    <Section id="statistics" title="Statistics" intro="Stored only on this device.">
      <div className="stat-tiles">
        {tiles.map((t) => (
          <div key={t.label} className="card stat-tile">
            <span className="stat-value">{t.value}</span>
            <span className="stat-label">{t.label}</span>
          </div>
        ))}
      </div>
      <div className="card chart-card">
        {empty ? (
          <div className="empty">
            Nothing caught yet. Visit a distracting site and see what happens.
          </div>
        ) : (
          <ActivityChart stats={stats} now={now} />
        )}
      </div>
      <p className="row-desc stat-footnote">
        The streak counts consecutive days Tablin was on watch. A focus session starts each time
        Chrome starts or you resume from a pause.
      </p>
      <div className="danger-zone">
        {confirming ? (
          <>
            <span>Reset all statistics and escalation?</span>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setConfirming(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-danger btn-sm"
              onClick={() =>
                void sendToWorker({ type: 'RESET_STATS' }).then(() => setConfirming(false))
              }
            >
              Yes, reset
            </button>
          </>
        ) : (
          <button type="button" className="btn btn-soft btn-sm" onClick={() => setConfirming(true)}>
            Reset statistics
          </button>
        )}
      </div>
    </Section>
  );
}
