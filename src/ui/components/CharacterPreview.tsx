import { useEffect, useRef } from 'react';
import { Character } from '../../character/Character';
import type { CharacterState } from '../../character/CharacterStateMachine';
import type { AnimationIntensity, CharacterColor, Equipped } from '../../shared/types';
import '../../character/character.css';

/** Mounts the real character engine in preview mode inside a React tree. */
export function CharacterPreview(props: {
  color: CharacterColor;
  size: number;
  state: CharacterState;
  intensity?: AnimationIntensity;
  name?: string;
  cosmetics?: Partial<Equipped>;
  onClick?(): void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const character = useRef<Character | null>(null);
  const reduced =
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    if (!host.current) return;
    const c = new Character(document, {
      color: props.color,
      sizePx: props.size,
      intensity: props.intensity ?? 'normal',
      reducedMotion: reduced,
      slingshot: false,
      sound: false,
      name: props.name ?? 'Tablin',
      mode: 'preview',
      interactive: false,
      cosmetics: props.cosmetics,
    });
    c.mount(host.current);
    c.preview(props.state);
    character.current = c;
    return () => {
      c.destroy();
      character.current = null;
    };
    // The engine instance is created once per size; other props update it below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.size]);

  useEffect(() => character.current?.setColor(props.color), [props.color]);
  const cosmeticsKey = JSON.stringify(props.cosmetics ?? {});
  useEffect(
    () => character.current?.setCosmetics(props.cosmetics ?? {}),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cosmeticsKey],
  );
  useEffect(() => character.current?.preview(props.state), [props.state]);
  useEffect(() => character.current?.setIntensity(props.intensity ?? 'normal'), [props.intensity]);

  return (
    <div
      ref={host}
      className="character-preview"
      style={{
        width: props.size,
        height: props.size,
        cursor: props.onClick ? 'pointer' : 'default',
      }}
      onClick={props.onClick}
      {...(props.onClick
        ? {
            role: 'button',
            tabIndex: 0,
            'aria-label': `Pet ${props.name ?? 'Tablin'}`,
            onKeyDown: (e: React.KeyboardEvent) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                props.onClick?.();
              }
            },
          }
        : { 'aria-hidden': true })}
    />
  );
}
