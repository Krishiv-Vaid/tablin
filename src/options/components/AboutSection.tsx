import { REPO_URL } from '../../shared/constants';
import { Section } from './Section';

export function AboutSection() {
  const version = chrome.runtime.getManifest().version;
  return (
    <Section id="about" title="About">
      <div className="card">
        <div className="row">
          <div className="row-label">
            <span className="row-title">Tablin {version}</span>
            <span className="row-desc">A tiny companion that helps you stop procrastinating.</span>
          </div>
          <a className="btn btn-soft btn-sm" href={REPO_URL} target="_blank" rel="noreferrer">
            GitHub
          </a>
        </div>
        <div className="row">
          <div className="row-label">
            <span className="row-title">Privacy</span>
            <span className="row-desc">
              Everything stays on this device: settings, counters, focus history, achievements, your
              companion's wardrobe, and the last closed tab's address (kept for 10 minutes so you
              can reopen it). There are no accounts, no analytics, no ads and no network requests.
              Tablin only runs on the sites you enable.
            </span>
          </div>
        </div>
        <div className="row">
          <div className="row-label">
            <span className="row-title">Keyboard shortcuts</span>
            <span className="row-desc">
              <kbd>Esc</kbd> sends the character away · <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd>{' '}
              emergency stop · <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> quick pause ·{' '}
              <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd> reopen the last closed tab
            </span>
          </div>
          <button
            type="button"
            className="btn btn-soft btn-sm"
            onClick={() => void chrome.tabs.create({ url: 'chrome://extensions/shortcuts' })}
          >
            Customize
          </button>
        </div>
        <div className="row">
          <div className="row-label">
            <span className="row-title">Limitation</span>
            <span className="row-desc">
              Chrome doesn't allow extensions to draw over its tab strip. The character walks along
              the top of the web page to a close button there, and Tablin closes the tab with
              Chrome's tabs API.
            </span>
          </div>
        </div>
      </div>
    </Section>
  );
}
