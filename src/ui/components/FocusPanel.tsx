import { useEffect, useRef, useState } from 'react';
import type { CharacterState } from '../../character/CharacterStateMachine';
import {
  BREAK_MINUTES_MAX,
  BREAK_MINUTES_MIN,
  FOCUS_MINUTES_MAX,
  FOCUS_MINUTES_MIN,
  FOCUS_PRESETS_MINUTES,
} from '../../shared/constants';
import { completionMessage } from '../../shared/focus-messages';
import { sendToWorker } from '../../shared/messages';
import { parseMinutes } from '../../shared/settings';
import type { AnimationIntensity, CharacterColor, Equipped, FocusKind } from '../../shared/types';
import { formatClock, formatMinutes, useFocus } from '../hooks';
import { CharacterPreview } from './CharacterPreview';
import { FocusRing } from './FocusRing';
import { FlameIcon } from './Icons';

const KIND_LABEL: Record<FocusKind, string> = {
  focus: 'Focusing',
  shortBreak: 'Short break',
  longBreak: 'Long break',
};

type Mode = 'focus' | 'break';

export function FocusPanel(props: {
  variant: 'compact' | 'full';
  name: string;
  color: CharacterColor;
  cosmetics: Equipped;
  intensity?: AnimationIntensity;
}) {
  const { snap, setSnap } = useFocus(1000);
  const [mode, setMode] = useState<Mode>('focus');
  const [preset, setPreset] = useState<number | 'custom' | null>(null);
  const [custom, setCustom] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cheer, setCheer] = useState(false);
  const cheerTimer = useRef<ReturnType<typeof setTimeout>>();
  const full = props.variant === 'full';

  useEffect(() => () => clearTimeout(cheerTimer.current), []);

  if (!snap) return <div className="focus-loading">Loading focus…</div>;

  const s = snap.settings;
  const current = snap.current;
  const breakPresets = [s.shortBreakMinutes, s.longBreakMinutes];
  const presets: readonly number[] = mode === 'focus' ? FOCUS_PRESETS_MINUTES : breakPresets;
  const defaultMinutes =
    mode === 'focus'
      ? s.focusMinutes
      : snap.nextBreak === 'longBreak'
        ? s.longBreakMinutes
        : s.shortBreakMinutes;
  const selected = preset ?? defaultMinutes;
  const limits =
    mode === 'focus'
      ? [FOCUS_MINUTES_MIN, FOCUS_MINUTES_MAX]
      : [BREAK_MINUTES_MIN, BREAK_MINUTES_MAX];

  const celebrate = (ms = 1400) => {
    setCheer(true);
    clearTimeout(cheerTimer.current);
    cheerTimer.current = setTimeout(() => setCheer(false), ms);
  };

  async function run<T>(fn: () => Promise<T>): Promise<T | undefined> {
    setBusy(true);
    try {
      return await fn();
    } finally {
      setBusy(false);
    }
  }

  const start = async (kind?: FocusKind, minutesOverride?: number) => {
    let minutes = minutesOverride;
    if (minutes === undefined) {
      if (selected === 'custom') {
        const parsed = parseMinutes(custom, limits[0]!, limits[1]!);
        if (!parsed.ok) {
          setError(parsed.error);
          return;
        }
        minutes = parsed.value;
      } else {
        minutes = selected;
      }
    }
    const k: FocusKind =
      kind ??
      (mode === 'focus'
        ? 'focus'
        : minutes === s.longBreakMinutes && minutes !== s.shortBreakMinutes
          ? 'longBreak'
          : 'shortBreak');
    const result = await run(() => sendToWorker({ type: 'FOCUS_START', kind: k, minutes }));
    if (result && 'ok' in result) {
      setError(result.error);
      return;
    }
    if (result) {
      setSnap(result);
      setError(null);
      celebrate();
    }
  };

  const act = async (type: 'FOCUS_PAUSE' | 'FOCUS_RESUME' | 'FOCUS_END' | 'FOCUS_ACK') => {
    const result = await run(() => sendToWorker({ type }));
    if (result) setSnap(result);
  };

  // ---- character state ----
  let charState: CharacterState = 'idle';
  if (snap.celebrate || cheer) charState = 'celebrating';
  else if (current?.status === 'running')
    charState = current.kind === 'focus' ? 'sleeping' : 'idle';

  const ringSize = full ? 248 : 168;
  const progress = current ? 1 - snap.remainingMs / current.durationMs : 0;
  const streak = snap.streak;

  const streakLine = (
    <div className={`streak-line ${streak.current > 0 ? 'on' : ''}`}>
      <FlameIcon size={15} />
      {streak.current > 0 ? (
        <span>
          <strong>{streak.current}-day streak</strong>
          {streak.todayDone ? ' · today done' : ' · focus today to keep it going'}
        </span>
      ) : (
        <span>Complete a 5+ minute session to start a streak</span>
      )}
    </div>
  );

  // ---- completion celebration ----
  if (snap.celebrate) {
    const c = snap.celebrate;
    const minutes = Math.round(c.focusedMs / 60_000);
    const wasFocus = c.kind === 'focus';
    const nextBreak = snap.nextBreak;
    return (
      <div className={`focus-panel ${props.variant} celebrating`} aria-live="polite">
        <div className="focus-character">
          <CharacterPreview
            color={props.color}
            size={full ? 150 : 96}
            state="celebrating"
            cosmetics={props.cosmetics}
            intensity={props.intensity}
            name={props.name}
          />
        </div>
        <h2 className="focus-cheer">
          {wasFocus ? completionMessage(c.id, minutes, props.name) : 'Break is over'}
        </h2>
        <p className="focus-sub">
          {wasFocus
            ? `${formatMinutes(minutes)} of focus, logged.`
            : `${props.name} is ready when you are.`}
        </p>
        {wasFocus && streakLine}
        <div className="focus-actions">
          {wasFocus ? (
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() =>
                void act('FOCUS_ACK').then(() =>
                  start(
                    nextBreak,
                    nextBreak === 'longBreak' ? s.longBreakMinutes : s.shortBreakMinutes,
                  ),
                )
              }
            >
              Start {nextBreak === 'longBreak' ? 'long' : 'short'} break
            </button>
          ) : (
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() => void act('FOCUS_ACK').then(() => start('focus', s.focusMinutes))}
            >
              Focus again ({s.focusMinutes} min)
            </button>
          )}
          <button
            type="button"
            className="btn btn-soft"
            disabled={busy}
            onClick={() => void act('FOCUS_ACK')}
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  // ---- running / paused ----
  if (current) {
    const isFocus = current.kind === 'focus';
    return (
      <div className={`focus-panel ${props.variant} active`}>
        <FocusRing
          progress={progress}
          size={ringSize}
          stroke={full ? 10 : 7}
          tone={isFocus ? 'focus' : 'break'}
        >
          <div className="focus-ring-inner">
            {full && (
              <CharacterPreview
                color={props.color}
                size={96}
                state={charState}
                cosmetics={props.cosmetics}
                intensity={props.intensity}
                name={props.name}
                onClick={() => celebrate(900)}
              />
            )}
            <span className="focus-time" role="timer" aria-live="off">
              {formatClock(snap.remainingMs)}
            </span>
            <span className={`focus-kind ${current.status}`}>
              {current.status === 'paused' ? 'Paused' : KIND_LABEL[current.kind]}
            </span>
          </div>
        </FocusRing>
        {!full && (
          <p className="focus-sub">
            {isFocus
              ? current.status === 'paused'
                ? `${props.name} is waiting for you.`
                : `${props.name} is keeping watch quietly.`
              : 'Stretch, sip some water, look away from the screen.'}
          </p>
        )}
        <div className="focus-actions">
          {current.status === 'running' ? (
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() => void act('FOCUS_PAUSE')}
            >
              Pause
            </button>
          ) : (
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() => void act('FOCUS_RESUME')}
            >
              Resume
            </button>
          )}
          <button
            type="button"
            className="btn btn-soft"
            disabled={busy}
            onClick={() => void act('FOCUS_END')}
          >
            {isFocus ? 'End session' : 'End break'}
          </button>
        </div>
        {full && streakLine}
      </div>
    );
  }

  // ---- idle: choose & start ----
  return (
    <div className={`focus-panel ${props.variant} idle`}>
      {full ? (
        <div className="focus-character">
          <CharacterPreview
            color={props.color}
            size={150}
            state={charState}
            cosmetics={props.cosmetics}
            intensity={props.intensity}
            name={props.name}
            onClick={() => celebrate(900)}
          />
        </div>
      ) : null}
      <div className="segmented focus-mode" role="radiogroup" aria-label="Session type">
        {(['focus', 'break'] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={mode === m}
            onClick={() => {
              setMode(m);
              setPreset(null);
              setError(null);
            }}
          >
            {m === 'focus' ? 'Focus' : 'Break'}
          </button>
        ))}
      </div>
      <div className="focus-big-number" aria-hidden="true">
        {selected === 'custom' ? custom || '—' : selected}
        <span>min</span>
      </div>
      <div
        className="chips focus-presets"
        role="radiogroup"
        aria-label={mode === 'focus' ? 'Focus length' : 'Break length'}
      >
        {[...new Set(presets)].map((p, i) => (
          <button
            key={p}
            type="button"
            role="radio"
            className="chip"
            aria-checked={selected === p}
            onClick={() => {
              setPreset(p);
              setError(null);
            }}
          >
            {mode === 'break' ? `${i === 0 ? 'Short' : 'Long'} · ${p}m` : `${p}m`}
          </button>
        ))}
        <button
          type="button"
          role="radio"
          className="chip"
          aria-checked={selected === 'custom'}
          onClick={() => setPreset('custom')}
        >
          Custom
        </button>
      </div>
      {selected === 'custom' && (
        <div className="custom-delay">
          <label className="custom-delay-field">
            <span>Length</span>
            <input
              className="text-input stepper-input boxed"
              inputMode="numeric"
              autoFocus
              value={custom}
              aria-invalid={error ? true : undefined}
              aria-label="Custom length in minutes"
              onChange={(e) => {
                setCustom(e.target.value);
                const parsed = parseMinutes(e.target.value, limits[0]!, limits[1]!);
                setError(parsed.ok ? null : parsed.error);
              }}
              onKeyDown={(e) => e.key === 'Enter' && void start()}
            />
            <span className="unit">minutes</span>
          </label>
          <span className={`field-hint ${error ? 'error' : ''}`} role={error ? 'alert' : undefined}>
            {error ?? `${limits[0]}–${limits[1]} minutes.`}
          </span>
        </div>
      )}
      {error && selected !== 'custom' && <p className="field-hint error">{error}</p>}
      <button
        type="button"
        className="btn btn-block btn-lg"
        disabled={busy}
        onClick={() => void start()}
      >
        {mode === 'focus' ? 'Start focus' : 'Start break'}
      </button>
      {streakLine}
      <p className="focus-today">
        Today: {formatMinutes(snap.today.focusMinutes)} focused · {snap.today.focusSessions} session
        {snap.today.focusSessions === 1 ? '' : 's'}
      </p>
    </div>
  );
}
