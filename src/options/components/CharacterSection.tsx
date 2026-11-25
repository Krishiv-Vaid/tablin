import { useState } from 'react';
import type { CharacterState } from '../../character/CharacterStateMachine';
import { COLOR_LABELS, paletteFor } from '../../character/characters/palette';
import { ACHIEVEMENTS_BY_ID } from '../../shared/achievements';
import { COSMETICS_BY_ID, isUnlocked } from '../../shared/cosmetics';
import type { ProgressSnapshot } from '../../shared/messages';
import { ALL_CHARACTER_COLORS, type Equipped, type Settings } from '../../shared/types';
import { CharacterPreview } from '../../ui/components/CharacterPreview';
import { Row, Segmented } from '../../ui/components/controls';
import { LockIcon } from '../../ui/components/Icons';
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

export function CharacterSection(props: {
  settings: Settings;
  update: SettingsUpdater;
  progress: ProgressSnapshot | null;
  cosmetics: Equipped;
}) {
  const { settings, update, progress } = props;
  const c = settings.character;
  const [previewState, setPreviewState] = useState<CharacterState>('idle');
  const setChar = (patch: Partial<Settings['character']>) =>
    void update((s) => ({ ...s, character: { ...s.character, ...patch } }));
  const inv = progress?.inventory;
  const worn = Object.values(props.cosmetics)
    .filter((id): id is string => !!id)
    .map((id) => COSMETICS_BY_ID.get(id)?.name)
    .filter(Boolean);

  return (
    <Section
      id="character"
      title="Character"
      intro="Make your companion yours. Changes show up everywhere right away."
    >
      <div className="card character-card">
        <div className="character-stage stage">
          <CharacterPreview
            color={c.color}
            size={SIZE_PX[c.size] * 1.6}
            state={previewState}
            intensity={c.intensity}
            name={c.name}
            cosmetics={props.cosmetics}
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
              {ALL_CHARACTER_COLORS.map((color) => {
                const unlocked = !inv || isUnlocked(inv, `color:${color}`);
                const needs = COSMETICS_BY_ID.get(`color:${color}`)?.unlockedBy;
                if (!unlocked && !needs) return null;
                return (
                  <button
                    key={color}
                    type="button"
                    role="radio"
                    className={`swatch ${unlocked ? '' : 'locked'}`}
                    aria-checked={c.color === color}
                    aria-disabled={!unlocked}
                    aria-label={`${COLOR_LABELS[color]}${unlocked ? '' : ` (locked: ${ACHIEVEMENTS_BY_ID.get(needs!)?.name})`}`}
                    title={
                      unlocked
                        ? COLOR_LABELS[color]
                        : `Unlock with “${ACHIEVEMENTS_BY_ID.get(needs!)?.name}”`
                    }
                    style={{ background: paletteFor(color).body }}
                    onClick={() => unlocked && setChar({ color })}
                  >
                    {!unlocked && <LockIcon size={12} />}
                  </button>
                );
              })}
            </div>
          </Row>
          <Row
            title="Wearing"
            desc={
              worn.length
                ? worn.join(' · ')
                : 'Nothing yet. Earn hats and accessories from achievements.'
            }
          >
            <a className="btn btn-soft btn-sm" href="#collection">
              Open wardrobe
            </a>
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
