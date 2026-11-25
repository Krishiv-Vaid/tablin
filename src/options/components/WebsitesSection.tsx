import { useState } from 'react';
import { matchPatternsFor } from '../../detection/website-detector';
import { createCustomSite, siteDelaySeconds } from '../../shared/settings';
import type { Settings, SiteRule } from '../../shared/types';
import { DelayPicker } from '../../ui/components/DelayPicker';
import { Toggle } from '../../ui/components/controls';
import { WebsiteIcon } from '../../ui/components/WebsiteIcon';
import { Section, type SettingsUpdater } from './Section';

function delaySummary(site: SiteRule, settings: Settings): string {
  const seconds = siteDelaySeconds(settings, site);
  if (site.delay.mode === 'inherit') return `${seconds}s · default`;
  return site.delay.mode === 'custom' ? `${seconds}s · custom` : `${seconds}s`;
}

function SiteRow(props: {
  site: SiteRule;
  settings: Settings;
  onChange(patch: Partial<SiteRule>): void;
  onRemove?: () => void;
}) {
  const { site, settings } = props;
  const [open, setOpen] = useState(false);
  return (
    <div className="site-block">
      <div className="row site-row">
        <div className="site-name">
          <WebsiteIcon site={site} size={30} />
          <div className="row-label">
            <span className="row-title">{site.name}</span>
            <span className="row-desc">{site.domains.join(', ')} and subdomains</span>
          </div>
        </div>
        <div className="site-controls">
          <button
            type="button"
            className="delay-button"
            aria-expanded={open}
            aria-label={`Countdown for ${site.name}: ${delaySummary(site, settings)}. Change`}
            onClick={() => setOpen(!open)}
          >
            <span className="delay-value">{delaySummary(site, settings)}</span>
            <svg
              viewBox="0 0 10 6"
              width="10"
              height="6"
              aria-hidden="true"
              className={open ? 'flip' : ''}
            >
              <path
                d="M1 1l4 4 4-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </button>
          <Toggle
            checked={site.enabled}
            label={`Watch ${site.name}`}
            onChange={(enabled) => props.onChange({ enabled })}
          />
          {props.onRemove && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={props.onRemove}
              aria-label={`Remove ${site.name}`}
            >
              Remove
            </button>
          )}
        </div>
      </div>
      {open && (
        <div className="site-delay">
          <DelayPicker
            value={site.delay}
            globalSeconds={settings.delaySeconds}
            label={`Countdown for ${site.name}`}
            onChange={(delay) => props.onChange({ delay })}
          />
          <p className="row-desc">
            Changes apply to the next countdown. One that's already running keeps its time.
          </p>
        </div>
      )}
    </div>
  );
}

export function WebsitesSection({
  settings,
  update,
}: {
  settings: Settings;
  update: SettingsUpdater;
}) {
  const [input, setInput] = useState('');
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const builtIn = settings.sites.filter((s) => s.builtIn);
  const custom = settings.sites.filter((s) => !s.builtIn);

  const patchSite = (id: string, patch: Partial<SiteRule>) =>
    void update((s) => ({
      ...s,
      sites: s.sites.map((site) => (site.id === id ? { ...site, ...patch } : site)),
    }));

  const addSite = async () => {
    const site = createCustomSite(input, settings.sites);
    if (!site) {
      setMessage({
        text: "That doesn't look like a new website domain (e.g. twitch.tv).",
        error: true,
      });
      return;
    }
    // Must run directly from the click so Chrome shows its permission prompt.
    const granted = await chrome.permissions.request({
      origins: site.domains.flatMap(matchPatternsFor),
    });
    if (!granted) {
      setMessage({
        text: `Chrome permission for ${site.domains[0]} wasn't granted, so nothing was added.`,
        error: true,
      });
      return;
    }
    await update((s) => ({ ...s, sites: [...s.sites, site] }));
    setInput('');
    setMessage({ text: `Added ${site.name}. Reload any tabs already open on it.`, error: false });
  };

  const removeSite = async (site: SiteRule) => {
    await update((s) => ({ ...s, sites: s.sites.filter((x) => x.id !== site.id) }));
    await chrome.permissions
      .remove({ origins: site.domains.flatMap(matchPatternsFor) })
      .catch(() => false);
  };

  return (
    <Section
      id="websites"
      title="Websites"
      intro={`Choose which sites count as distractions and how long you get on each. The global default is ${settings.delaySeconds}s (General).`}
    >
      <div className="card">
        {builtIn.map((site) => (
          <SiteRow
            key={site.id}
            site={site}
            settings={settings}
            onChange={(p) => patchSite(site.id, p)}
          />
        ))}
      </div>

      <h3 className="subhead">Your sites</h3>
      <div className="card">
        {custom.length === 0 ? (
          <div className="empty">
            No custom sites yet. Add one below. Chrome will ask for permission for that site only.
          </div>
        ) : (
          custom.map((site) => (
            <SiteRow
              key={site.id}
              site={site}
              settings={settings}
              onChange={(p) => patchSite(site.id, p)}
              onRemove={() => void removeSite(site)}
            />
          ))
        )}
        <form
          className="row add-site"
          onSubmit={(e) => {
            e.preventDefault();
            void addSite();
          }}
        >
          <input
            className="text-input"
            placeholder="twitch.tv"
            value={input}
            aria-label="Website domain"
            aria-invalid={message?.error ? true : undefined}
            onChange={(e) => {
              setInput(e.target.value);
              setMessage(null);
            }}
          />
          <button type="submit" className="btn" disabled={!input.trim()}>
            Add website
          </button>
        </form>
      </div>
      {message && (
        <p className={`form-message ${message.error ? 'error' : ''}`} role="status">
          {message.text}
        </p>
      )}
      <p className="row-desc legal-note">
        Site logos are trademarks of their respective owners and are shown only to identify each
        site. Tablin isn't affiliated with or endorsed by them.
      </p>
    </Section>
  );
}
