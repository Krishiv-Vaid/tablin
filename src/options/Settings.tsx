import { useEffect, useState } from 'react';
import { CharacterPreview } from '../ui/components/CharacterPreview';
import { useAccent, useSettings, useStats } from '../ui/hooks';
import { AboutSection } from './components/AboutSection';
import { BehaviorSection } from './components/BehaviorSection';
import { CharacterSection } from './components/CharacterSection';
import { GeneralSection } from './components/GeneralSection';
import { StatsSection } from './components/StatsSection';
import { Welcome } from './components/Welcome';
import { WebsitesSection } from './components/WebsitesSection';

const NAV = [
  { id: 'general', label: 'General' },
  { id: 'websites', label: 'Websites' },
  { id: 'character', label: 'Character' },
  { id: 'behavior', label: 'Behavior' },
  { id: 'statistics', label: 'Statistics' },
  { id: 'about', label: 'About' },
] as const;

export function Settings() {
  const { settings, update } = useSettings();
  const stats = useStats();
  const [welcome, setWelcome] = useState(() => location.hash === '#welcome');
  const [active, setActive] = useState<string>('general');
  useAccent(settings?.character.color);

  useEffect(() => {
    if (settings && !settings.onboardingComplete) setWelcome(true);
  }, [settings]);

  const loaded = settings !== null;
  useEffect(() => {
    const sections = NAV.map((n) => document.getElementById(n.id)).filter(
      (x): x is HTMLElement => !!x,
    );
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: '-20% 0px -60% 0px' },
    );
    sections.forEach((s) => observer.observe(s));
    return () => observer.disconnect();
  }, [loaded, welcome]);

  if (!settings) return <div className="page-loading">Loading…</div>;

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">
          <CharacterPreview
            color={settings.character.color}
            size={40}
            state="idle"
            name={settings.character.name}
          />
          <div>
            <div className="brand-name">Tablin</div>
            <div className="brand-sub">Settings</div>
          </div>
        </div>
        <nav aria-label="Settings sections">
          {NAV.map((n) => (
            <a
              key={n.id}
              href={`#${n.id}`}
              className={active === n.id ? 'active' : ''}
              aria-current={active === n.id ? 'true' : undefined}
            >
              {n.label}
            </a>
          ))}
        </nav>
        {!welcome && (
          <button
            type="button"
            className="btn btn-ghost btn-sm replay"
            onClick={() => setWelcome(true)}
          >
            Replay welcome
          </button>
        )}
      </aside>
      <main className="content">
        {welcome && (
          <Welcome
            settings={settings}
            update={update}
            onDone={() => {
              setWelcome(false);
              history.replaceState(null, '', location.pathname);
              window.scrollTo({ top: 0 });
            }}
          />
        )}
        <GeneralSection settings={settings} update={update} />
        <WebsitesSection settings={settings} update={update} />
        <CharacterSection settings={settings} update={update} />
        <BehaviorSection settings={settings} update={update} />
        <StatsSection stats={stats} />
        <AboutSection />
      </main>
    </div>
  );
}
