import { useState } from 'react';
import { matchPatternsFor } from '../../detection/website-detector';
import { createCustomSite } from '../../shared/settings';
import type { Settings, SiteRule } from '../../shared/types';
import { Toggle } from '../../ui/components/controls';
import { Section, type SettingsUpdater } from './Section';

const DELAY_CHOICES = [null, 5, 8, 12, 20, 30, 45, 60] as const;

function SiteRow(props: {
  site: SiteRule;
  globalDelay: number;
  onChange(patch: Partial<SiteRule>): void;
  onRemove?: () => void;
}) {
  const { site } = props;
  return (
    <div className="row site-row">
      <div className="site-name">
        <span className="site-badge" style={{ background: site.color }} aria-hidden="true">
          {site.name.charAt(0).toUpperCase()}
        </span>
        <div className="row-label">
          <span className="row-title">{site.name}</span>
          <span className="row-desc">{site.domains.join(', ')} and subdomains</span>
        </div>
      </div>
      <div className="site-controls">
        <label className="select-wrap">
          <span className="sr-only">Countdown for {site.name}</span>
          <select
            className="select"
            value={site.delaySeconds === null ? 'default' : String(site.delaySeconds)}
            onChange={(e) =>
              props.onChange({
                delaySeconds: e.target.value === 'default' ? null : Number(e.target.value),
              })
            }
          >
            {DELAY_CHOICES.map((d) => (
              <option key={String(d)} value={d === null ? 'default' : String(d)}>
                {d === null ? `Default (${props.globalDelay}s)` : `${d}s`}
              </option>
            ))}
          </select>
        </label>
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
      intro="Choose which sites count as distractions. Subdomains are included."
    >
      <div className="card">
        {builtIn.map((site) => (
          <SiteRow
            key={site.id}
            site={site}
            globalDelay={settings.delaySeconds}
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
              globalDelay={settings.delaySeconds}
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
    </Section>
  );
}
