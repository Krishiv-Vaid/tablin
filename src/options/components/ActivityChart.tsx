import { useState } from 'react';
import { recentDays } from '../../shared/stats';
import type { Stats } from '../../shared/types';

const DAYS = 14;

/** Single-series bar chart of interceptions per day (last 14 days), with hover tooltips. */
export function ActivityChart({ stats, now }: { stats: Stats; now: number }) {
  const days = recentDays(stats, now, DAYS);
  const max = Math.max(1, ...days.map((d) => d.day.intercepted));
  const [hover, setHover] = useState<number | null>(null);
  const label = (key: string) =>
    new Date(`${key}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const total = days.reduce((sum, d) => sum + d.day.intercepted, 0);

  return (
    <figure className="chart">
      <figcaption className="chart-head">
        <span className="row-title">Distractions caught</span>
        <span className="row-desc">
          Last {DAYS} days · {total} total
        </span>
      </figcaption>
      <div
        className="chart-plot"
        role="img"
        aria-label={`Distractions caught per day over the last ${DAYS} days, ${total} total`}
      >
        <div className="chart-grid" aria-hidden="true">
          <span style={{ bottom: '100%' }}>{max}</span>
          <span style={{ bottom: '50%' }}>{max >= 2 ? Math.round(max / 2) : ''}</span>
        </div>
        <div className="chart-bars">
          {days.map((d, i) => (
            <div
              key={d.key}
              className="chart-col"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              tabIndex={0}
              aria-label={`${label(d.key)}: ${d.day.intercepted} caught, ${d.day.closed} closed`}
            >
              <div
                className={`chart-bar ${hover === i ? 'active' : ''}`}
                style={{ height: `${(d.day.intercepted / max) * 100}%` }}
              />
              {hover === i && (
                <div className="chart-tip" role="tooltip">
                  <strong>{label(d.key)}</strong>
                  <span>{d.day.intercepted} caught</span>
                  <span>
                    {d.day.closed} closed · {d.day.snoozed} snoozed
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="chart-axis" aria-hidden="true">
        <span>{label(days[0]!.key)}</span>
        <span>Today</span>
      </div>
      <table className="sr-only">
        <caption>Distractions caught per day</caption>
        <thead>
          <tr>
            <th>Day</th>
            <th>Caught</th>
            <th>Closed</th>
            <th>Snoozed</th>
          </tr>
        </thead>
        <tbody>
          {days.map((d) => (
            <tr key={d.key}>
              <td>{label(d.key)}</td>
              <td>{d.day.intercepted}</td>
              <td>{d.day.closed}</td>
              <td>{d.day.snoozed}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
