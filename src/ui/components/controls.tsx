import { useId, type ReactNode } from 'react';

export function Toggle(props: {
  checked: boolean;
  onChange(checked: boolean): void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      className="toggle"
      aria-checked={props.checked}
      aria-label={props.label}
      disabled={props.disabled}
      onClick={() => props.onChange(!props.checked)}
    />
  );
}

export function Segmented<T extends string>(props: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange(value: T): void;
  label: string;
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={props.label}>
      {props.options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={props.value === o.value}
          onClick={() => props.onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Slider(props: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange(value: number): void;
  format(value: number): string;
  label: string;
}) {
  const fill = ((props.value - props.min) / (props.max - props.min)) * 100;
  const id = useId();
  return (
    <div className="slider">
      <input
        id={id}
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        aria-label={props.label}
        style={{ ['--fill' as string]: `${fill}%` }}
        onChange={(e) => props.onChange(Number(e.target.value))}
      />
      <output htmlFor={id}>{props.format(props.value)}</output>
    </div>
  );
}

export function Row(props: { title: string; desc?: ReactNode; children?: ReactNode }) {
  return (
    <div className="row">
      <div className="row-label">
        <span className="row-title">{props.title}</span>
        {props.desc ? <span className="row-desc">{props.desc}</span> : null}
      </div>
      {props.children}
    </div>
  );
}
