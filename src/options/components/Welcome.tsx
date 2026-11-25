import { useState } from 'react';
import { CHARACTER_COLORS, type Settings } from '../../shared/types';
import { COLOR_LABELS, paletteFor } from '../../character/characters/palette';
import { CharacterPreview } from '../../ui/components/CharacterPreview';
import { NameInput } from '../../ui/components/NameInput';
import type { SettingsUpdater } from './Section';

const STEPS = ['Meet', 'How it works', 'Permissions', 'Mode'] as const;

export function Welcome(props: { settings: Settings; update: SettingsUpdater; onDone(): void }) {
  const { settings, update } = props;
  const [step, setStep] = useState(0);
  const name = settings.character.name;

  const finish = async (autoClose: boolean) => {
    await update((s) => ({ ...s, autoClose, onboardingComplete: true }));
    props.onDone();
  };

  return (
    <section className="welcome card" aria-label="Welcome to Tablin">
      <div className="welcome-stage stage">
        <CharacterPreview
          color={settings.character.color}
          size={132}
          state={step === 3 ? 'celebrating' : step === 1 ? 'walking' : 'idle'}
          name={name}
        />
      </div>
      <div className="welcome-body">
        <ol className="steps" aria-label="Setup steps">
          {STEPS.map((label, i) => (
            <li
              key={label}
              aria-current={i === step ? 'step' : undefined}
              className={i <= step ? 'done' : ''}
            >
              {label}
            </li>
          ))}
        </ol>

        {step === 0 && (
          <div className="welcome-step">
            <h1>Hi, I'm {name}.</h1>
            <p>
              I'm a tiny focus buddy. When you drift onto a distracting site, I'll wander over and
              remind you to get back to what matters.
            </p>
            <label className="field">
              <span>Name your companion</span>
              <NameInput
                value={name}
                label="Character name"
                onSave={(n) =>
                  void update((s) => ({ ...s, character: { ...s.character, name: n } }))
                }
              />
            </label>
            <div className="field">
              <span>Pick a color</span>
              <div className="swatches" role="radiogroup" aria-label="Character color">
                {CHARACTER_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    className="swatch"
                    aria-checked={settings.character.color === c}
                    aria-label={COLOR_LABELS[c]}
                    title={COLOR_LABELS[c]}
                    style={{ background: paletteFor(c).body }}
                    onClick={() =>
                      void update((s) => ({ ...s, character: { ...s.character, color: c } }))
                    }
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="welcome-step">
            <h1>How it works</h1>
            <ul className="bullets">
              <li>
                Open Instagram, TikTok, YouTube, Facebook, Reddit or X and after{' '}
                {settings.delaySeconds} seconds {name} pops in at the top of the page.
              </li>
              <li>{name} walks toward a close button in the top-right corner of the page.</li>
              <li>
                <strong>Grab {name} and pull back</strong> to build tension. Let go and {name}{' '}
                slingshots forward.
              </li>
              <li>Keep coming back and {name} gets faster, up to a fair cap.</li>
              <li>
                Press <kbd>Esc</kbd> or choose <em>Not now</em> any time to send {name} away for 5
                minutes.
              </li>
              <li>
                Start a <strong>focus session</strong> from the popup and {name} keeps you company,
                earning achievements and little rewards to wear along the way.
              </li>
            </ul>
            <p className="note">
              Chrome doesn't let extensions draw over its own tab strip, so {name} lives inside the
              web page and closes tabs through Chrome's tabs API.
            </p>
          </div>
        )}

        {step === 2 && (
          <div className="welcome-step">
            <h1>What {name} can access</h1>
            <ul className="bullets">
              <li>
                <strong>The six supported sites</strong>, so {name} can appear on them. {name}{' '}
                doesn't read or collect page content.
              </li>
              <li>
                <strong>Storage</strong> for your settings and counters, kept on this device only.
              </li>
              <li>
                <strong>Alarms</strong> to end timed pauses, and <strong>scripting</strong> to
                support sites you add yourself. Chrome asks you before Tablin gets access to any
                extra site.
              </li>
            </ul>
            <p className="note">
              No accounts, analytics or ads. Tablin never sends anything anywhere.
            </p>
          </div>
        )}

        {step === 3 && (
          <div className="welcome-step">
            <h1>Choose how strict {name} is</h1>
            <div className="mode-choices">
              <button type="button" className="mode-choice" onClick={() => void finish(false)}>
                <span className="mode-title">
                  Nudge mode <span className="pill">Recommended</span>
                </span>
                <span className="row-desc">
                  {name} walks over and asks. You decide whether to close the tab. Nothing closes on
                  its own.
                </span>
              </button>
              <button type="button" className="mode-choice" onClick={() => void finish(true)}>
                <span className="mode-title">Auto-close</span>
                <span className="row-desc">
                  When {name} reaches the corner, you get a 3-second countdown to keep the tab, then
                  it closes. Pinned tabs, tabs playing audio and tabs with typed text are left
                  alone, and you can reopen what was closed.
                </span>
              </button>
            </div>
          </div>
        )}

        <div className="welcome-nav">
          {step > 0 ? (
            <button type="button" className="btn btn-ghost" onClick={() => setStep(step - 1)}>
              Back
            </button>
          ) : (
            <span />
          )}
          {step < 3 && (
            <button type="button" className="btn" onClick={() => setStep(step + 1)}>
              Continue
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
