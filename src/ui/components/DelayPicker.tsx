import { useEffect, useId, useRef, useState } from 'react';
import { DELAY_MAX_SECONDS, DELAY_MIN_SECONDS } from '../../shared/constants';
import { parseCustomDelay } from '../../shared/settings';
import { DELAY_PRESETS, type DelayConfig } from '../../shared/types';

type Choice = 'inherit' | 'custom' | number;

const choiceOf = (d: DelayConfig): Choice =>
  d.mode === 'inherit' ? 'inherit' : d.mode === 'custom' ? 'custom' : d.seconds;

/**
 * Countdown chooser: Default (inherit the global delay), presets, or Custom
 * with a validated whole-seconds field revealed below.
 */
export function DelayPicker(props: {
  value: DelayConfig;
  globalSeconds: number;
  onChange(value: DelayConfig): void;
  label: string;
  presets?: readonly number[];
}) {
  const presets = props.presets ?? DELAY_PRESETS;
  const [choice, setChoice] = useState<Choice>(choiceOf(props.value));
  const [draft, setDraft] = useState(
    props.value.mode === 'custom' ? String(props.value.seconds) : '',
  );
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const errorId = useId();

  useEffect(() => {
    setChoice(choiceOf(props.value));
    if (props.value.mode === 'custom') setDraft(String(props.value.seconds));
  }, [props.value]);

  const pick = (c: Choice) => {
    setChoice(c);
    setError(null);
    if (c === 'inherit') props.onChange({ mode: 'inherit' });
    else if (typeof c === 'number') props.onChange({ mode: 'preset', seconds: c });
    else {
      const seed =
        draft || String(props.value.mode === 'inherit' ? props.globalSeconds : props.value.seconds);
      setDraft(seed);
      const parsed = parseCustomDelay(seed);
      if (parsed.ok) props.onChange({ mode: 'custom', seconds: parsed.value });
      requestAnimationFrame(() => input.current?.select());
    }
  };

  const commit = (text: string) => {
    setDraft(text);
    const parsed = parseCustomDelay(text);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setError(null);
    props.onChange({ mode: 'custom', seconds: parsed.value });
  };

  const step = (delta: number) => {
    const base = Number(draft) || props.globalSeconds;
    commit(String(Math.min(DELAY_MAX_SECONDS, Math.max(DELAY_MIN_SECONDS, base + delta))));
  };

  const options: { value: Choice; label: string }[] = [
    { value: 'inherit', label: `Default · ${props.globalSeconds}s` },
    ...presets.map((s) => ({ value: s as Choice, label: `${s}s` })),
    { value: 'custom', label: 'Custom' },
  ];

  return (
    <div className="delay-picker">
      <div className="chips" role="radiogroup" aria-label={props.label}>
        {options.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            className="chip"
            aria-checked={choice === o.value}
            onClick={() => pick(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
      {choice === 'custom' && (
        <div className="custom-delay">
          <label className="custom-delay-field">
            <span>Custom delay</span>
            <span className="stepper">
              <button
                type="button"
                className="stepper-btn"
                aria-label="One second less"
                onClick={() => step(-1)}
              >
                −
              </button>
              <input
                ref={input}
                className="text-input stepper-input"
                inputMode="numeric"
                value={draft}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? errorId : undefined}
                aria-label={`${props.label}: custom seconds`}
                onChange={(e) => commit(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    step(1);
                  } else if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    step(-1);
                  }
                }}
              />
              <button
                type="button"
                className="stepper-btn"
                aria-label="One second more"
                onClick={() => step(1)}
              >
                +
              </button>
            </span>
            <span className="unit">seconds</span>
          </label>
          <span
            id={errorId}
            className={`field-hint ${error ? 'error' : ''}`}
            role={error ? 'alert' : undefined}
          >
            {error ?? `Any whole number from ${DELAY_MIN_SECONDS} to ${DELAY_MAX_SECONDS}.`}
          </span>
        </div>
      )}
    </div>
  );
}
