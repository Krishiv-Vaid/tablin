import { useEffect, useState } from 'react';
import { effectiveColor, effectiveEquipped, emptyInventory } from '../shared/cosmetics';
import { sendToWorker } from '../shared/messages';
import { CharacterPreview } from '../ui/components/CharacterPreview';
import { UnlockToast } from '../ui/components/UnlockToast';
import { useAccent, useProgress, useSettings } from '../ui/hooks';
import { AboutSection } from './components/AboutSection';
import { AchievementsSection } from './components/AchievementsSection';
import { BehaviorSection } from './components/BehaviorSection';
import { CharacterSection } from './components/CharacterSection';
import { CollectionSection } from './components/CollectionSection';
import { FocusSection } from './components/FocusSection';
import { GeneralSection } from './components/GeneralSection';
import { StatsSection } from './components/StatsSection';
import { Welcome } from './components/Welcome';
import { WebsitesSection } from './components/WebsitesSection';

const NAV = [
  { id: 'focus', label: 'Focus' },
  { id: 'general', label: 'General' },
  { id: 'websites', label: 'Websites' },
  { id: 'character', label: 'Character' },
  { id: 'collection', label: 'Collection' },
  { id: 'achievements', label: 'Achievements' },
  { id: 'behavior', label: 'Behavior' },
  { id: 'statistics', label: 'Statistics' },
  { id: 'about', label: 'About' },
] as const;

export function Settings() {
  const { settings, update } = useSettings();
  const { progress, setProgress } = useProgress();
  const [welcome, setWelcome] = useState(() => location.hash === '#welcome');
  const [active, setActive] = useState<string>('focus');
  const inventory = progress?.inventory ?? emptyInventory();
  const color = settings ? effectiveColor(settings, inventory) : 'orange';
  const cosmetics = effectiveEquipped(inventory);
  useAccent(settings ? color : undefined);

  useEffect(() => {
    if (settings && !settings.onboardingComplete) setWelcome(true);
  }, [settings]);

  const loaded = settings !== null && progress !== null;

  // Deep links from the popup (#focus, #achievements, …): scroll once content exists.
  useEffect(() => {
    if (!loaded) return;
    const id = location.hash.slice(1);
    if (id && id !== 'welcome')
      requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView());
  }, [loaded]);

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
            color={color}
            size={40}
            state="idle"
            name={settings.character.name}
            cosmetics={cosmetics}
          />
          <div>
            <div className="brand-name">Tablin</div>
            <div className="brand-sub">{settings.character.name}'s home</div>
          </div>
        </div>
        <nav aria-label="Sections">
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
        {progress && progress.unseen.length > 0 && (
          <div className="toast-dock">
            <UnlockToast
              unseen={progress.unseen}
              onView={() =>
                document.getElementById('achievements')?.scrollIntoView({ behavior: 'smooth' })
              }
              onDismiss={() => void sendToWorker({ type: 'ACK_UNLOCKS' }).then(setProgress)}
            />
          </div>
        )}
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
        <FocusSection settings={settings} update={update} cosmetics={cosmetics} color={color} />
        <GeneralSection settings={settings} update={update} />
        <WebsitesSection settings={settings} update={update} />
        <CharacterSection
          settings={settings}
          update={update}
          progress={progress}
          cosmetics={cosmetics}
        />
        <CollectionSection settings={settings} update={update} progress={progress} />
        <AchievementsSection progress={progress} />
        <BehaviorSection settings={settings} update={update} />
        <StatsSection progress={progress} />
        <AboutSection />
      </main>
    </div>
  );
}
