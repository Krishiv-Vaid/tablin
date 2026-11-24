import type { ReactNode } from 'react';
import type { Settings } from '../../shared/types';

export function Section(props: { id: string; title: string; intro?: string; children: ReactNode }) {
  return (
    <section id={props.id} className="section" aria-labelledby={`${props.id}-title`}>
      <header className="section-head">
        <h2 id={`${props.id}-title`}>{props.title}</h2>
        {props.intro ? <p>{props.intro}</p> : null}
      </header>
      {props.children}
    </section>
  );
}

export type SettingsUpdater = (fn: (s: Settings) => Settings) => Promise<unknown>;
