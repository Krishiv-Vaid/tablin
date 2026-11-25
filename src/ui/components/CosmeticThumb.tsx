import { useEffect, useRef } from 'react';
import { Character } from '../../character/Character';
import type { CharacterState } from '../../character/CharacterStateMachine';
import type { CharacterColor, Equipped } from '../../shared/types';
import '../../character/character.css';

/**
 * Still render of the real character wearing an item (one frame, no animation
 * loop), so collection thumbnails are exactly what the user will see.
 */
export function CosmeticThumb(props: {
  color: CharacterColor;
  cosmetics: Partial<Equipped>;
  size: number;
  state?: CharacterState;
}) {
  const host = useRef<HTMLDivElement>(null);
  const key = `${props.color}|${JSON.stringify(props.cosmetics)}|${props.size}|${props.state ?? ''}`;
  useEffect(() => {
    if (!host.current) return;
    const c = new Character(document, {
      color: props.color,
      sizePx: props.size,
      intensity: 'normal',
      reducedMotion: true,
      slingshot: false,
      sound: false,
      name: 'Tablin',
      mode: 'preview',
      interactive: false,
      cosmetics: props.cosmetics,
      animate: false,
    });
    c.mount(host.current);
    if (props.state) {
      c.preview(props.state);
      c.redraw();
    }
    return () => c.destroy();
    // `key` captures every input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return (
    <div
      ref={host}
      className="cosmetic-thumb"
      style={{ width: props.size, height: props.size }}
      aria-hidden="true"
    />
  );
}
