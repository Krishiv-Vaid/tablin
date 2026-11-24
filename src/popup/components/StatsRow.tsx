import type { StatusSnapshot } from '../../shared/types';

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
    <section className="tiles" aria-label="Today">
      <Tile value={String(status.today.intercepted)} label="Caught today" />
      <Tile value={String(status.session.intercepted)} label="This session" />
      <Tile
        value={esc.enabled ? `Lv ${esc.nextLevel}` : 'Off'}
        label="Next speed"
        hint={esc.enabled ? `${esc.nextSpeedMultiplier.toFixed(1)}×` : undefined}
      />
    </section>
  );
}
