import { useState } from 'react';
import { ACHIEVEMENTS_BY_ID } from '../../shared/achievements';
import { COSMETICS, isUnlocked, type Cosmetic, type EquipSlot } from '../../shared/cosmetics';
import { sendToWorker, type ProgressSnapshot } from '../../shared/messages';
import type { CharacterColor, CosmeticSlot, Settings } from '../../shared/types';
import { CharacterPreview } from '../../ui/components/CharacterPreview';
import { CosmeticThumb } from '../../ui/components/CosmeticThumb';
import { CheckIcon, LockIcon } from '../../ui/components/Icons';
import { Section, type SettingsUpdater } from './Section';

const GROUPS: { slot: CosmeticSlot; title: string; single: string }[] = [
  { slot: 'color', title: 'Colors', single: 'Color' },
  { slot: 'hat', title: 'Hats', single: 'Hat' },
  { slot: 'accessory', title: 'Accessories', single: 'Accessory' },
  { slot: 'effect', title: 'Effects', single: 'Effect' },
  { slot: 'celebration', title: 'Celebrations', single: 'Celebration' },
];

export function CollectionSection(props: {
  settings: Settings;
  update: SettingsUpdater;
  progress: ProgressSnapshot | null;
}) {
  const { settings, update, progress } = props;
  const [error, setError] = useState<string | null>(null);
  if (!progress) return null;
  const inv = progress.inventory;
  const eq = inv.equipped;
  const color = settings.character.color;
  const owned = COSMETICS.filter((c) => isUnlocked(inv, c.id)).length;

  const equip = async (slot: EquipSlot, id: string | null) => {
    const res = await sendToWorker({ type: 'EQUIP', slot, id });
    setError(res.ok ? null : res.error);
  };

  const isEquipped = (c: Cosmetic) =>
    c.slot === 'color' ? `color:${color}` === c.id : eq[c.slot as EquipSlot] === c.id;

  const choose = (c: Cosmetic) => {
    if (!isUnlocked(inv, c.id)) return;
    if (c.slot === 'color') {
      const next = c.id.slice('color:'.length) as CharacterColor;
      void update((s) => ({ ...s, character: { ...s.character, color: next } }));
      return;
    }
    const slot = c.slot as EquipSlot;
    void equip(slot, eq[slot] === c.id ? null : c.id);
  };

  return (
    <Section
      id="collection"
      title="Collection"
      intro={`${settings.character.name}'s little wardrobe. Everything here is earned through achievements and is purely cosmetic.`}
    >
      <div className="card wardrobe-hero">
        <div className="stage wardrobe-stage">
          <CharacterPreview
            color={color}
            size={150}
            state="idle"
            cosmetics={eq}
            intensity={settings.character.intensity}
            name={settings.character.name}
          />
        </div>
        <div className="wardrobe-info">
          <h3>{settings.character.name}</h3>
          <dl className="equipped-list">
            {GROUPS.map((g) => {
              const id = g.slot === 'color' ? `color:${color}` : eq[g.slot as EquipSlot];
              const item = id ? COSMETICS.find((c) => c.id === id) : null;
              return (
                <div key={g.slot}>
                  <dt>{g.single}</dt>
                  <dd>{item?.name ?? <span className="muted">None</span>}</dd>
                </div>
              );
            })}
          </dl>
          <div className="meter-row">
            <div
              className="meter"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={COSMETICS.length}
              aria-valuenow={owned}
              aria-label="Collection progress"
            >
              <div style={{ width: `${(owned / COSMETICS.length) * 100}%` }} />
            </div>
            <span className="row-desc">
              {owned} / {COSMETICS.length} collected
            </span>
          </div>
        </div>
      </div>
      {error && <p className="form-message error">{error}</p>}
      {GROUPS.map((g) => (
        <div key={g.slot}>
          <h3 className="subhead">{g.title}</h3>
          <div className="item-grid">
            {COSMETICS.filter((c) => c.slot === g.slot).map((c) => {
              const unlocked = isUnlocked(inv, c.id);
              const equipped = isEquipped(c);
              const source = c.unlockedBy ? ACHIEVEMENTS_BY_ID.get(c.unlockedBy) : null;
              const previewColor = c.slot === 'color' ? (c.id.slice(6) as CharacterColor) : color;
              const previewCosmetics = c.slot === 'color' ? {} : { [c.slot]: c.id };
              return (
                <button
                  key={c.id}
                  type="button"
                  className={`item card ${unlocked ? 'unlocked' : 'locked'} ${equipped ? 'equipped' : ''}`}
                  aria-pressed={unlocked ? equipped : undefined}
                  aria-disabled={!unlocked}
                  aria-label={`${c.name}. ${unlocked ? (equipped ? 'Equipped' : 'Unlocked, click to equip') : `Locked: ${source?.name ?? ''}`}`}
                  onClick={() => choose(c)}
                >
                  <div className="item-art">
                    <CosmeticThumb
                      color={previewColor}
                      cosmetics={previewCosmetics}
                      size={76}
                      state={c.slot === 'celebration' ? 'celebrating' : undefined}
                    />
                    {!unlocked && (
                      <span className="item-lock">
                        <LockIcon size={14} />
                      </span>
                    )}
                    {equipped && (
                      <span className="item-check">
                        <CheckIcon size={13} />
                      </span>
                    )}
                  </div>
                  <span className="item-name">{c.name}</span>
                  <span className="item-meta">
                    {unlocked
                      ? equipped
                        ? c.slot === 'color'
                          ? 'In use'
                          : 'Equipped · click to remove'
                        : c.unlockedBy
                          ? 'Unlocked'
                          : 'Always available'
                      : `Unlock: ${source?.name ?? 'achievement'}`}
                  </span>
                  {!unlocked && source && <span className="item-req">{source.description}</span>}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </Section>
  );
}
