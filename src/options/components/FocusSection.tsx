import {
  BREAK_MINUTES_MAX,
  BREAK_MINUTES_MIN,
  FOCUS_MINUTES_MAX,
  FOCUS_MINUTES_MIN,
} from '../../shared/constants';
import type { Equipped, Settings } from '../../shared/types';
import { FocusPanel } from '../../ui/components/FocusPanel';
import { Row, Slider, Toggle } from '../../ui/components/controls';
import { Section, type SettingsUpdater } from './Section';

export function FocusSection(props: {
  settings: Settings;
  update: SettingsUpdater;
  cosmetics: Equipped;
  color: Settings['character']['color'];
}) {
  const { settings, update } = props;
  const f = settings.focus;
  const name = settings.character.name;
  const setF = (patch: Partial<Settings['focus']>) =>
    void update((s) => ({ ...s, focus: { ...s.focus, ...patch } }));

  // Notifications use an optional permission: ask Chrome only when the user opts in.
  const setNotifications = async (on: boolean) => {
    if (!on) {
      setF({ notifications: false });
      await chrome.permissions.remove({ permissions: ['notifications'] }).catch(() => false);
      return;
    }
    const granted = await chrome.permissions.request({ permissions: ['notifications'] });
    setF({ notifications: granted });
  };

  return (
    <Section
      id="focus"
      title="Focus"
      intro={`Start a session and ${name} keeps you company. The timer keeps running even if you close this page.`}
    >
      <div className="card focus-card">
        <FocusPanel
          variant="full"
          name={name}
          color={props.color}
          cosmetics={props.cosmetics}
          intensity={settings.character.intensity}
        />
      </div>

      <h3 className="subhead">Session lengths</h3>
      <div className="card">
        <Row title="Focus length" desc="Your default when you press Start.">
          <Slider
            value={f.focusMinutes}
            min={FOCUS_MINUTES_MIN}
            max={120}
            step={1}
            label="Default focus minutes"
            format={(v) => `${v} min`}
            onChange={(focusMinutes) => setF({ focusMinutes })}
          />
        </Row>
        <Row title="Short break">
          <Slider
            value={f.shortBreakMinutes}
            min={BREAK_MINUTES_MIN}
            max={30}
            step={1}
            label="Short break minutes"
            format={(v) => `${v} min`}
            onChange={(shortBreakMinutes) => setF({ shortBreakMinutes })}
          />
        </Row>
        <Row title="Long break">
          <Slider
            value={f.longBreakMinutes}
            min={BREAK_MINUTES_MIN}
            max={BREAK_MINUTES_MAX}
            step={1}
            label="Long break minutes"
            format={(v) => `${v} min`}
            onChange={(longBreakMinutes) => setF({ longBreakMinutes })}
          />
        </Row>
        <Row title="Long break every" desc="Suggested after this many completed focus sessions.">
          <Slider
            value={f.sessionsBeforeLongBreak}
            min={2}
            max={8}
            step={1}
            label="Sessions before a long break"
            format={(v) => `${v} sessions`}
            onChange={(sessionsBeforeLongBreak) => setF({ sessionsBeforeLongBreak })}
          />
        </Row>
      </div>
      <p className="row-desc">
        Need something unusual? Choose <em>Custom</em> when starting: {FOCUS_MINUTES_MIN}–
        {FOCUS_MINUTES_MAX} minutes for focus, {BREAK_MINUTES_MIN}–{BREAK_MINUTES_MAX} for breaks.
      </p>

      <h3 className="subhead">During sessions</h3>
      <div className="card">
        <Row
          title="Start breaks automatically"
          desc="When a focus session ends, the suggested break begins right away."
        >
          <Toggle
            checked={f.autoStartBreaks}
            label="Start breaks automatically"
            onChange={(autoStartBreaks) => setF({ autoStartBreaks })}
          />
        </Row>
        <Row
          title="Relax during breaks"
          desc={`${name} won't intercept distracting sites while a break is running.`}
        >
          <Toggle
            checked={f.relaxDuringBreaks}
            label="Relax during breaks"
            onChange={(relaxDuringBreaks) => setF({ relaxDuringBreaks })}
          />
        </Row>
        <Row
          title="Notify when a session ends"
          desc="A Chrome notification, so you hear about it even with the popup closed. Chrome will ask for permission the first time."
        >
          <Toggle
            checked={f.notifications}
            label="Session notifications"
            onChange={(on) => void setNotifications(on)}
          />
        </Row>
      </div>
    </Section>
  );
}
