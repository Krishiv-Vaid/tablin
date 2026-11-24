import { useState } from 'react';
import type { CharacterState } from '../../character/CharacterStateMachine';
import { COLOR_LABELS, paletteFor } from '../../character/characters/palette';
import { CHARACTER_COLORS, type Settings } from '../../shared/types';
import { CharacterPreview } from '../../ui/components/CharacterPreview';
import { Row, Segmented } from '../../ui/components/controls';
import { NameInput } from '../../ui/components/NameInput';
import { Section, type SettingsUpdater } from './Section';

const PREVIEW_STATES: { value: CharacterState; label: string }[] = [
  { value: 'idle', label: 'Idle' },
  { value: 'walking', label: 'Walk' },
  { value: 'running', label: 'Run' },
  { value: 'charging', label: 'Stretch' },
  { value: 'celebrating', label: 'Party' },
  { value: 'sleeping', label: 'Sleep' },
];

const SIZE_PX = { small: 60, medium: 74, large: 90 } as const;

export function CharacterSection({
  settings,
  update,
}: {
  settings: Settings;
  update: SettingsUpdater;
}) {
  const c = settings.character;
  const [previewState, setPreviewState] = useState<CharacterState>('idle');
  const setChar = (patch: Partial<Settings['character']>) =>
    void update((s) => ({ ...s, character: { ...s.character, ...patch } }));

  return (
    <Section id="character" title="Character" intro="Make your companion yours.">
      <div className="card character-card">
        <div className="character-stage stage">
          <CharacterPreview
            color={c.color}
            size={SIZE_PX[c.size] * 1.6}
            state={previewState}
            intensity={c.intensity}
            name={c.name}
          />
          <div className="preview-states">
            <Segmented<CharacterState>
              label="Preview animation"
              value={previewState}
              options={PREVIEW_STATES}
              onChange={setPreviewState}
            />
          </div>
        </div>
        <div className="character-fields">
          <Row title="Name">
            <NameInput value={c.name} label="Character name" onSave={(name) => setChar({ name })} />
          </Row>
          <Row title="Color" desc={COLOR_LABELS[c.color]}>
            <div className="swatches" role="radiogroup" aria-label="Character color">
              {CHARACTER_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  role="radio"
                  className="swatch"
                  aria-checked={c.color === color}
                  aria-label={COLOR_LABELS[color]}
                  title={COLOR_LABELS[color]}
                  style={{ background: paletteFor(color).body }}
                  onClick={() => setChar({ color })}
                />
              ))}
            </div>
          </Row>
          <Row title="Size" desc="Scales down a little on narrow windows.">
            <Segmented
              label="Character size"
              value={c.size}
              options={[
                { value: 'small', label: 'Small' },
                { value: 'medium', label: 'Medium' },
                { value: 'large', label: 'Large' },
              ]}
              onChange={(size) => setChar({ size })}
            />
          </Row>
          <Row title="Animation intensity" desc="How bouncy and expressive the movement is.">
            <Segmented
              label="Animation intensity"
              value={c.intensity}
              options={[
                { value: 'calm', label: 'Calm' },
                { value: 'normal', label: 'Normal' },
                { value: 'lively', label: 'Lively' },
              ]}
              onChange={(intensity) => setChar({ intensity })}
            />
          </Row>
        </div>
      </div>
    </Section>
  );
}
