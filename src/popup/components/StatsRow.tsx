import type { StatusSnapshot } from '../../shared/types';
import { formatMinutes } from '../../ui/hooks';

function Tile(props: { value: string; label: string; hint?: string }) {
  return (
    <div className="tile">
      <span className="tile-value">{props.value}</span>
      <span className="tile-label">{props.label}</span>
      {props.hint ? <span className="tile-hint">{props.hint}</span> : null}
    </div>
  );
}

export function StatsRow({ status }: { status: StatusSnapshot }) {
  const esc = status.escalation;
  return (
    <section className="tiles four" aria-label="Today">
      <Tile
        value={String(status.today.intercepted)}
        label="Caught today"
        hint={`${status.session.intercepted} this session`}
      />
      <Tile
        value={formatMinutes(status.today.focusMinutes)}
        label="Focus today"
        hint={`${status.today.focusSessions} done`}
      />
      <Tile
        value={`${status.streak.current}d`}
        label="Streak"
        hint={`best ${status.streak.longest}d`}
      />
      <Tile
        value={esc.enabled ? `Lv ${esc.nextLevel}` : 'Off'}
        label="Next speed"
        hint={esc.enabled ? `${esc.nextSpeedMultiplier.toFixed(1)}×` : undefined}
      />
    </section>
  );
}
