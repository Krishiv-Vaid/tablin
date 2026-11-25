import { useState } from 'react';
import { ACHIEVEMENTS } from '../../shared/achievements';
import { sendToWorker, type ProgressSnapshot } from '../../shared/messages';
import { focusStreak, recentDays, recentWeeks, todayStats } from '../../shared/stats';
import { formatMinutes, useFocus, useNow } from '../../ui/hooks';
import { FlameIcon } from '../../ui/components/Icons';
import { BarChart } from './BarChart';
import { Section } from './Section';

const shortDate = (key: string) =>
  new Date(`${key}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

export function StatsSection({ progress }: { progress: ProgressSnapshot | null }) {
  const now = useNow(60_000);
  const { snap } = useFocus(30_000);
  const [confirming, setConfirming] = useState(false);
  if (!progress) return null;
  const stats = progress.stats;
  const today = todayStats(stats, now);
  const streak = focusStreak(stats, now);
  const weeks = recentWeeks(stats, now, 8);
  const days = recentDays(stats, now, 14);
  const thisWeek = weeks[weeks.length - 1]!;
  const history = snap?.history ?? [];
  const completedFocus = history.filter((h) => h.kind === 'focus' && h.outcome === 'completed');
  const average = completedFocus.length
    ? completedFocus.reduce((sum, h) => sum + h.focusedMs, 0) / completedFocus.length / 60_000
    : 0;
  const unlocked = Object.keys(progress.achievements).length;

  const tiles = [
    { value: formatMinutes(today.focusMinutes), label: 'Focused today' },
    { value: formatMinutes(thisWeek.focusMinutes), label: 'This week' },
    {
      value:
        stats.totalFocusMinutes < 60
          ? formatMinutes(stats.totalFocusMinutes)
          : `${(stats.totalFocusMinutes / 60).toFixed(1).replace(/\.0$/, '')} h`,
      label: 'Total focus',
    },
    { value: String(stats.totalFocusSessions), label: 'Sessions completed' },
    {
      value: stats.longestFocusMinutes ? formatMinutes(stats.longestFocusMinutes) : '—',
      label: 'Longest session',
    },
    { value: average ? formatMinutes(average) : '—', label: 'Average session' },
    { value: String(stats.totalIntercepted), label: 'Distractions caught' },
    { value: String(stats.totalClosed), label: 'Tabs closed' },
  ];
  const noFocus = stats.totalFocusMinutes === 0;

  return (
    <Section
      id="statistics"
      title="Statistics"
      intro="Everything is counted on this device, grouped by your local calendar day."
    >
      <div className="card streak-card">
        <div className={`streak-flame ${streak.current > 0 ? 'on' : ''}`}>
          <FlameIcon size={26} />
        </div>
        <div>
          <span className="stat-value">
            {streak.current} day{streak.current === 1 ? '' : 's'}
          </span>
          <span className="stat-label">
            Current focus streak · longest {streak.longest} day{streak.longest === 1 ? '' : 's'}
          </span>
        </div>
        <p className="row-desc streak-note">
          {streak.current === 0
            ? 'Finish a focus session of 5+ minutes to start one. Streaks restart gently: no guilt, just a fresh start.'
            : streak.todayDone
              ? 'Today counts already. Nice.'
              : 'Focus at least 5 minutes today to keep it going.'}
        </p>
      </div>

      <div className="stat-tiles">
        {tiles.map((t) => (
          <div key={t.label} className="card stat-tile">
            <span className="stat-value">{t.value}</span>
            <span className="stat-label">{t.label}</span>
          </div>
        ))}
      </div>

      <div className="card chart-card">
        {noFocus ? (
          <div className="empty">
            No focus time yet. Start a session in Focus and it'll show up here.
          </div>
        ) : (
          <BarChart
            title="Daily focus"
            subtitle={`Last 14 days · ${formatMinutes(days.reduce((s, d) => s + d.day.focusMinutes, 0))}`}
            data={days.map((d) => ({
              key: d.key,
              label: shortDate(d.key),
              value: d.day.focusMinutes,
              details: [
                `${d.day.focusSessions} session${d.day.focusSessions === 1 ? '' : 's'} completed`,
              ],
            }))}
            format={(v) => formatMinutes(v)}
            axis={[shortDate(days[0]!.key), 'Today']}
          />
        )}
      </div>

      <div className="two-col">
        <div className="card chart-card">
          {noFocus ? (
            <div className="empty">Weekly totals appear after your first session.</div>
          ) : (
            <BarChart
              title="Weekly focus"
              subtitle="Last 8 weeks (Mon–Sun)"
              data={weeks.map((w) => ({
                key: w.start,
                label: `Week of ${shortDate(w.start)}`,
                value: w.focusMinutes,
                details: [`${w.focusSessions} sessions`],
              }))}
              format={(v) => formatMinutes(v)}
              axis={[shortDate(weeks[0]!.start), 'This week']}
            />
          )}
        </div>
        <div className="card chart-card">
          {stats.totalIntercepted === 0 ? (
            <div className="empty">Nothing caught yet.</div>
          ) : (
            <BarChart
              title="Distractions caught"
              subtitle={`Last 14 days · ${days.reduce((s, d) => s + d.day.intercepted, 0)} total`}
              data={days.map((d) => ({
                key: d.key,
                label: shortDate(d.key),
                value: d.day.intercepted,
                details: [`${d.day.closed} closed · ${d.day.snoozed} snoozed`],
              }))}
              format={(v) => String(Math.round(v))}
              axis={[shortDate(days[0]!.key), 'Today']}
            />
          )}
        </div>
      </div>

      <h3 className="subhead">Recent sessions</h3>
      <div className="card">
        {history.length === 0 ? (
          <div className="empty">Your session history will appear here.</div>
        ) : (
          <ul className="history">
            {history.slice(0, 10).map((h) => (
              <li key={h.id} className="row">
                <div className="row-label">
                  <span className="row-title">
                    {h.kind === 'focus'
                      ? 'Focus'
                      : h.kind === 'shortBreak'
                        ? 'Short break'
                        : 'Long break'}
                    <span className={`pill ${h.outcome}`}>
                      {h.outcome === 'completed' ? 'Completed' : 'Ended early'}
                    </span>
                  </span>
                  <span className="row-desc">
                    {new Date(h.endedAt).toLocaleString(undefined, {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
                <span className="history-mins">{formatMinutes(h.focusedMs / 60_000)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card progress-summary small">
        <span className="row-title">Achievements</span>
        <div className="meter">
          <div style={{ width: `${(unlocked / ACHIEVEMENTS.length) * 100}%` }} />
        </div>
        <a href="#achievements" className="row-desc">
          {unlocked} / {ACHIEVEMENTS.length} unlocked →
        </a>
      </div>

      <div className="danger-zone">
        {confirming ? (
          <>
            <span>
              Reset counters, focus history and escalation? Achievements and rewards you've earned
              are kept.
            </span>
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
