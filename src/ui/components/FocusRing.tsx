import type { ReactNode } from 'react';

/** Circular progress ring around arbitrary content (the countdown). */
export function FocusRing(props: {
  progress: number;
  size: number;
  stroke?: number;
  children?: ReactNode;
  tone?: 'focus' | 'break';
}) {
  const stroke = props.stroke ?? 8;
  const r = (props.size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.min(1, Math.max(0, props.progress));
  return (
    <div
      className={`focus-ring tone-${props.tone ?? 'focus'}`}
      style={{ width: props.size, height: props.size }}
    >
      <svg
        viewBox={`0 0 ${props.size} ${props.size}`}
        width={props.size}
        height={props.size}
        aria-hidden="true"
      >
        <circle
          className="ring-track"
          cx={props.size / 2}
          cy={props.size / 2}
          r={r}
          strokeWidth={stroke}
          fill="none"
        />
        <circle
          className="ring-fill"
          cx={props.size / 2}
          cy={props.size / 2}
          r={r}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${c * p} ${c}`}
          transform={`rotate(-90 ${props.size / 2} ${props.size / 2})`}
        />
      </svg>
      <div className="ring-content">{props.children}</div>
    </div>
  );
}
