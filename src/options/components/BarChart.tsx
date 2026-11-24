import { useState } from 'react';

export interface BarDatum {
  key: string;
  label: string;
  value: number;
  /** Extra tooltip lines. */
  details?: string[];
}

/**
 * Single-series bar chart (custom SVG/CSS, no chart library): thin bars with
 * 4px rounded tops, a recessive baseline, hover/focus tooltips, and a hidden
 * data table for screen readers. One hue (the character accent).
 */
export function BarChart(props: {
  title: string;
  subtitle: string;
  data: BarDatum[];
  format(value: number): string;
  axis: [string, string];
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...props.data.map((d) => d.value));
  return (
    <figure className="chart">
      <figcaption className="chart-head">
        <span className="row-title">{props.title}</span>
        <span className="row-desc">{props.subtitle}</span>
      </figcaption>
      <div className="chart-plot" role="img" aria-label={`${props.title}: ${props.subtitle}`}>
        <div className="chart-grid" aria-hidden="true">
          <span style={{ bottom: '100%' }}>{props.format(max)}</span>
        </div>
        <div
          className="chart-bars"
          style={{ gridTemplateColumns: `repeat(${props.data.length}, 1fr)` }}
        >
          {props.data.map((d, i) => (
            <div
              key={d.key}
              className="chart-col"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              tabIndex={0}
              aria-label={`${d.label}: ${props.format(d.value)}`}
            >
              <div
                className={`chart-bar ${hover === i ? 'active' : ''}`}
                style={{ height: `${(d.value / max) * 100}%` }}
              />
              {hover === i && (
                <div
                  className={`chart-tip ${i > props.data.length * 0.7 ? 'left' : ''}`}
                  role="tooltip"
                >
                  <strong>{d.label}</strong>
                  <span>{props.format(d.value)}</span>
                  {d.details?.map((line) => (
                    <span key={line}>{line}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="chart-axis" aria-hidden="true">
        <span>{props.axis[0]}</span>
        <span>{props.axis[1]}</span>
      </div>
      <table className="sr-only">
        <caption>{props.title}</caption>
        <tbody>
          {props.data.map((d) => (
            <tr key={d.key}>
              <th scope="row">{d.label}</th>
              <td>{props.format(d.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
