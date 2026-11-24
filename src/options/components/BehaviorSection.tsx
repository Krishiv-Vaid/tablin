import { speedMultiplierForLevel } from '../../background/escalation-manager';
import {
  MAX_ESCALATION_LEVEL,
  SPEED_MULTIPLIER_MAX,
  SPEED_MULTIPLIER_MIN,
  SPEED_SETTING_MAX,
  SPEED_SETTING_MIN,
} from '../../shared/constants';
import type { Settings } from '../../shared/types';
import { Row, Segmented, Slider, Toggle } from '../../ui/components/controls';
import { Section, type SettingsUpdater } from './Section';

function EscalationPreview({ behavior }: { behavior: Settings['behavior'] }) {
  const levels = Array.from({ length: MAX_ESCALATION_LEVEL }, (_, i) => i + 1);
  const max = Math.max(SPEED_MULTIPLIER_MAX, 1);
  return (
    <div className="escalation" aria-label="Speed at each visit">
      {levels.map((level) => {
        const m = speedMultiplierForLevel(level, behavior);
        return (
          <div key={level} className="esc-step">
            <div className="esc-track">
              <div className="esc-bar" style={{ height: `${(m / max) * 100}%` }} />
            </div>
            <span className="esc-value">{m.toFixed(1)}×</span>
            <span className="esc-label">
              {level === MAX_ESCALATION_LEVEL ? `${level}+` : `#${level}`}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function BehaviorSection({
  settings,
  update,
}: {
  settings: Settings;
  update: SettingsUpdater;
}) {
  const b = settings.behavior;
  const name = settings.character.name;
  const setB = (patch: Partial<Settings['behavior']>) =>
    void update((s) => ({ ...s, behavior: { ...s.behavior, ...patch } }));

  return (
    <Section id="behavior" title="Behavior" intro={`How ${name} moves, reacts and escalates.`}>
      <div className="card">
        <Row title="Base speed" desc="Overall walking speed.">
          <Slider
            value={b.speed}
            min={SPEED_SETTING_MIN}
            max={SPEED_SETTING_MAX}
            step={0.05}
            label="Base speed"
            format={(v) => `${v.toFixed(2)}×`}
            onChange={(speed) => setB({ speed })}
          />
        </Row>
        <Row
          title="Slingshot"
          desc={`Pull ${name} back and let go to launch. When off, dragging just moves ${name}.`}
        >
          <Toggle
            checked={b.slingshotEnabled}
            label="Slingshot"
            onChange={(slingshotEnabled) => setB({ slingshotEnabled })}
          />
        </Row>
        <Row title="Sound effects" desc="Tiny synthesized chirps. Off by default.">
          <Toggle
            checked={b.soundEnabled}
            label="Sound effects"
            onChange={(soundEnabled) => setB({ soundEnabled })}
          />
        </Row>
        <Row
          title="Reduced motion"
          desc="Gentler animation with no bouncing. Follows your system setting by default."
        >
          <Segmented
            label="Reduced motion"
            value={b.reducedMotion}
            options={[
              { value: 'system', label: 'System' },
              { value: 'reduce', label: 'Reduce' },
              { value: 'full', label: 'Full' },
            ]}
            onChange={(reducedMotion) => setB({ reducedMotion })}
          />
        </Row>
        <Row title="Protect tabs playing audio" desc="Never auto-close a tab that's making sound.">
          <Toggle
            checked={b.protectAudible}
            label="Protect tabs playing audio"
            onChange={(protectAudible) => setB({ protectAudible })}
          />
        </Row>
      </div>

      <h3 className="subhead">Escalation</h3>
      <div className="card">
        <Row
          title="Get faster on repeat visits"
          desc={`Each time ${name} catches you again, it notices sooner and moves faster, up to the cap.`}
        >
          <Toggle
            checked={b.escalationEnabled}
            label="Escalation"
            onChange={(escalationEnabled) => setB({ escalationEnabled })}
          />
        </Row>
        <Row title="Maximum speed" desc="The cap for the fifth and later visits.">
          <Slider
            value={b.maxSpeedMultiplier}
            min={SPEED_MULTIPLIER_MIN}
            max={SPEED_MULTIPLIER_MAX}
            step={0.1}
            label="Maximum speed multiplier"
            format={(v) => `${v.toFixed(1)}×`}
            onChange={(maxSpeedMultiplier) => setB({ maxSpeedMultiplier })}
          />
        </Row>
        <Row title="Curve" desc="How quickly it ramps toward the cap.">
          <Segmented
            label="Escalation curve"
            value={b.escalationCurve}
            options={[
              { value: 'gentle', label: 'Gentle' },
              { value: 'linear', label: 'Steady' },
              { value: 'steep', label: 'Steep' },
            ]}
            onChange={(escalationCurve) => setB({ escalationCurve })}
          />
        </Row>
        <Row title="Reset" desc="When the visit count goes back to zero.">
          <Segmented
            label="Escalation reset"
            value={b.resetFrequency}
            options={[
              { value: 'daily', label: 'Every day' },
              { value: 'session', label: 'Every browser session' },
            ]}
            onChange={(resetFrequency) => setB({ resetFrequency })}
          />
        </Row>
        <div className={`row escalation-row ${b.escalationEnabled ? '' : 'disabled'}`}>
          <EscalationPreview behavior={b} />
        </div>
      </div>
    </Section>
  );
}
