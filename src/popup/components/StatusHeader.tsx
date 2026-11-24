import { useState } from 'react';
import type { CharacterState } from '../../character/CharacterStateMachine';
import { CharacterPreview } from '../../ui/components/CharacterPreview';
import { Toggle } from '../../ui/components/controls';
import { formatDuration } from '../../ui/hooks';
import type { StatusSnapshot } from '../../shared/types';

export function statusLine(
  status: StatusSnapshot,
  now: number,
): { text: string; tone: 'live' | 'paused' | 'off' } {
  const name = status.character.name;
  if (!status.enabled) return { text: `${name} is off duty`, tone: 'off' };
  if (status.pause) {
    if (status.pause.mode === 'indefinite')
      return { text: 'Stopped until you resume', tone: 'paused' };
    if (status.pause.mode === 'session')
      return { text: 'Napping until Chrome restarts', tone: 'paused' };
    return {
      text: `Napping · ${formatDuration((status.pause.until ?? now) - now)} left`,
      tone: 'paused',
    };
  }
  const tab = status.activeTab;
  if (tab?.phase === 'appeared') return { text: `On its way on ${tab.siteName}!`, tone: 'live' };
  if (tab?.phase === 'counting' && tab.dueAt) {
    return { text: `Watching ${tab.siteName} · ${formatDuration(tab.dueAt - now)}`, tone: 'live' };
  }
  return { text: 'On watch', tone: 'live' };
}

export function StatusHeader(props: {
  status: StatusSnapshot;
  now: number;
  onToggle(enabled: boolean): void;
}) {
  const { status, now } = props;
  const [celebrate, setCelebrate] = useState(false);
  const line = statusLine(status, now);
  const resting = !status.enabled || status.pause !== null;
  const state: CharacterState = celebrate
    ? 'celebrating'
    : resting
      ? 'sleeping'
      : status.activeTab?.phase === 'appeared'
        ? 'walking'
        : 'idle';

  return (
    <header className="hero">
      <div className="stage hero-stage">
        <CharacterPreview
          color={status.character.color}
          size={84}
          state={state}
          intensity={status.character.intensity}
          name={status.character.name}
          onClick={() => {
            setCelebrate(true);
            setTimeout(() => setCelebrate(false), 1300);
          }}
        />
      </div>
      <div className="hero-text">
        <div className="hero-top">
          <h1>{status.character.name}</h1>
          <Toggle
            checked={status.enabled}
            onChange={props.onToggle}
            label={status.enabled ? 'Turn companion off' : 'Turn companion on'}
          />
        </div>
        <p className="status-line" aria-live="polite">
          <span
            className={`dot ${line.tone === 'live' ? 'live' : line.tone === 'paused' ? 'paused' : ''}`}
          />
          {line.text}
        </p>
        <span className="pill mode-pill">{status.autoClose ? 'Auto-close on' : 'Nudge mode'}</span>
      </div>
    </header>
  );
}
