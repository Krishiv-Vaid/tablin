import {
  CLOSE_TIMER_MAX_SECONDS,
  CLOSE_TIMER_MIN_SECONDS,
  DELAY_MAX_SECONDS,
  DELAY_MIN_SECONDS,
} from '../../shared/constants';
import type { Settings } from '../../shared/types';
import { Row, Segmented, Slider, Toggle } from '../../ui/components/controls';
import { Section, type SettingsUpdater } from './Section';

export function GeneralSection({
  settings,
  update,
}: {
  settings: Settings;
  update: SettingsUpdater;
}) {
  const name = settings.character.name;
  return (
    <Section id="general" title="General" intro={`The basics of when and how ${name} shows up.`}>
      <div className="card">
        <Row title="Enable companion" desc={`Turn ${name} on or off everywhere.`}>
          <Toggle
            checked={settings.enabled}
            label="Enable companion"
            onChange={(enabled) => void update((s) => ({ ...s, enabled }))}
          />
        </Row>
        <Row
          title="Auto-close tabs"
          desc={
            settings.autoClose
              ? settings.closeTimerSeconds > 0
                ? `On: ${name} reaches the X and waits ${settings.closeTimerSeconds}s (you can cancel), then the tab closes.`
                : `On: ${name} walks over and clicks the X straight away.`
              : `Off (nudge mode): ${name} reminds you but never closes anything.`
          }
        >
          <Toggle
            checked={settings.autoClose}
            label="Auto-close tabs"
            onChange={(autoClose) => void update((s) => ({ ...s, autoClose }))}
          />
        </Row>
        <Row
          title="Close timer"
          desc={
            settings.autoClose
              ? `How long ${name} waits with a hand on the X before closing. 0s = clicks it right away.`
              : 'Used when auto-close is on: how long to wait at the X before closing.'
          }
        >
          <Slider
            value={settings.closeTimerSeconds}
            min={CLOSE_TIMER_MIN_SECONDS}
            max={CLOSE_TIMER_MAX_SECONDS}
            step={1}
            label="Close timer in seconds"
            format={(v) => (v === 0 ? 'Instant' : `${v}s`)}
            onChange={(closeTimerSeconds) => void update((s) => ({ ...s, closeTimerSeconds }))}
          />
        </Row>
        <Row
          title="Countdown"
          desc={`How long you get on a distracting site before ${name} appears.`}
        >
          <Slider
            value={settings.delaySeconds}
            min={DELAY_MIN_SECONDS}
            max={DELAY_MAX_SECONDS}
            step={1}
            label="Countdown in seconds"
            format={(v) => `${v}s`}
            onChange={(delaySeconds) => void update((s) => ({ ...s, delaySeconds }))}
          />
        </Row>
        <Row
          title="Default pause"
          desc="Listed first in the popup and used by the quick-pause shortcut (Alt+Shift+P)."
        >
          <Segmented
            label="Default pause duration"
            value={settings.defaultPause}
            options={[
              { value: '15m', label: '15 minutes' },
              { value: '1h', label: '1 hour' },
            ]}
            onChange={(defaultPause) => void update((s) => ({ ...s, defaultPause }))}
          />
        </Row>
        <Row
          title="When you switch tabs"
          desc="What happens to a running countdown when you leave the tab."
        >
          <Segmented
            label="Switch-away behavior"
            value={settings.behavior.switchAway}
            options={[
              { value: 'pause', label: 'Pause it' },
              { value: 'restart', label: 'Start over' },
            ]}
            onChange={(switchAway) =>
              void update((s) => ({ ...s, behavior: { ...s.behavior, switchAway } }))
            }
          />
        </Row>
      </div>
    </Section>
  );
}
