/**
 * End-to-end test: loads dist/ into a real Chrome for Testing and exercises the
 * whole extension — worker, content script, character, drag/slingshot, closing.
 *
 * All network traffic is intercepted: the "distracting sites" are served from a
 * local fixture page, and every other request is blocked, so nothing leaves the machine.
 *
 *   npm run build && npm run test:e2e        (downloads Chrome for Testing once into .cache/)
 *   HEADFUL=1 npm run test:e2e                (watch it run)
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const dist = join(root, 'dist');
const profile = join(here, '.profile');
const shots = join(root, 'docs', 'screenshots');
const fixture = readFileSync(join(here, 'fixture.html'), 'utf8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!existsSync(join(dist, 'manifest.json'))) {
  console.error('dist/ missing: run `npm run build` first.');
  process.exit(1);
}

function chromePath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const out = execFileSync(
    'npx',
    [
      '-y',
      '@puppeteer/browsers@2.6.1',
      'install',
      'chrome@stable',
      '--path',
      join(root, '.cache', 'chrome'),
    ],
    { encoding: 'utf8' },
  );
  const line = out.trim().split('\n').pop();
  return line.slice(line.indexOf(' ') + 1);
}

// ---------------------------------------------------------------------------
// Tiny test harness

const results = [];
async function check(name, fn) {
  const started = Date.now();
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`  ✓ ${name} (${((Date.now() - started) / 1000).toFixed(1)}s)`);
  } catch (error) {
    results.push({ name, ok: false, error });
    console.log(
      `  ✗ ${name}\n      ${error?.stack?.split('\n').slice(0, 3).join('\n      ') ?? error}`,
    );
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}
async function waitFor(fn, { timeout = 15000, interval = 100, message = 'condition' } = {}) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    try {
      last = await fn();
      if (last) return last;
    } catch {
      // keep polling
    }
    await sleep(interval);
  }
  throw new Error(`Timed out waiting for ${message} (last: ${JSON.stringify(last)})`);
}

// ---------------------------------------------------------------------------
// Browser helpers

const isFixtureHost = (url) =>
  /^https?:\/\/([a-z0-9-]+\.)*(youtube\.com|reddit\.com|instagram\.com|tiktok\.com|facebook\.com|x\.com|example\.com)\//.test(
    url,
  );

async function launch(executablePath) {
  const browser = await puppeteer.launch({
    executablePath,
    headless: !process.env.HEADFUL,
    userDataDir: profile,
    defaultViewport: null,
    args: [
      `--disable-extensions-except=${dist}`,
      `--load-extension=${dist}`,
      '--window-size=1280,860',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-features=Translate,OptimizationHints,MediaRouter',
      '--disable-background-networking',
      '--disable-component-update',
      '--disable-sync',
    ],
  });
  const worker = await browser.waitForTarget(
    (t) => t.type() === 'service_worker' && t.url().endsWith('/service-worker.js'),
    { timeout: 15000 },
  );
  const extId = new URL(worker.url()).host;
  return { browser, extId };
}

/** Opens a page with all network requests answered locally. */
async function openSite(browser, url) {
  const page = await browser.newPage();
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const u = req.url();
    if (u.startsWith('chrome-extension://') || u.startsWith('data:')) return req.continue();
    if (req.isNavigationRequest() && isFixtureHost(u)) {
      return req.respond({
        status: 200,
        contentType: 'text/html',
        body: fixture.replace('{{URL}}', new URL(u).host),
      });
    }
    return req.respond({ status: 204, body: '' });
  });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.bringToFront();
  return page;
}

async function extPage(browser, extId, path, scheme = 'light') {
  const page = await browser.newPage();
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }]);
  await page.goto(`chrome-extension://${extId}/${path}`, { waitUntil: 'domcontentloaded' });
  return page;
}

/** Runs code with chrome.* access inside an extension page. */
async function inExt(page, fn, ...args) {
  return page.evaluate(fn, ...args);
}

async function setSettings(ext, patch) {
  await inExt(
    ext,
    async (p) => {
      const { settings } = await chrome.storage.local.get('settings');
      const merged = {
        ...settings,
        ...p,
        behavior: { ...settings.behavior, ...(p.behavior ?? {}) },
        character: { ...settings.character, ...(p.character ?? {}) },
      };
      await chrome.storage.local.set({ settings: merged });
    },
    patch,
  );
}

/**
 * Reads the character state from inside the overlay's *closed* shadow root via
 * the DevTools protocol (pages themselves can't see into it).
 */
async function overlayInfo(page) {
  const cdp = await page.createCDPSession();
  try {
    const { root } = await cdp.send('DOM.getDocument', { depth: -1, pierce: true });
    let character = null;
    let bubble = null;
    const buttons = [];
    const cosmetics = [];
    let hostFound = false;
    const attrs = (n) =>
      Object.fromEntries(
        (n.attributes ?? []).reduce(
          (acc, v, i, arr) => (i % 2 ? acc : [...acc, [v, arr[i + 1]]]),
          [],
        ),
      );
    const text = (n) => (n.nodeType === 3 ? n.nodeValue : (n.children ?? []).map(text).join(''));
    const walk = (n) => {
      if (n.nodeName === 'TABLIN-OVERLAY') hostFound = true;
      const a = attrs(n);
      const cls = a.class ?? '';
      if (cls.includes('tb-character')) character = { node: n, ...a };
      if (a['data-cosmetic']) cosmetics.push(a['data-cosmetic']);
      if (cls.includes('tb-bubble') && cls.includes('tb-on')) bubble = { node: n, text: text(n) };
      if (n.nodeName === 'BUTTON' && cls.includes('tb-btn'))
        buttons.push({ node: n, text: text(n) });
      for (const c of [...(n.children ?? []), ...(n.shadowRoots ?? [])]) walk(c);
    };
    walk(root);
    let center = null;
    if (character) {
      const { model } = await cdp.send('DOM.getBoxModel', { nodeId: character.node.nodeId });
      const q = model.border;
      center = { x: (q[0] + q[4]) / 2, y: (q[1] + q[5]) / 2 };
    }
    const boxOf = async (n) => {
      const { model } = await cdp.send('DOM.getBoxModel', { nodeId: n.nodeId });
      const q = model.border;
      return { x: (q[0] + q[4]) / 2, y: (q[1] + q[5]) / 2 };
    };
    const visibleButtons = [];
    for (const b of buttons) {
      try {
        visibleButtons.push({ text: b.text, at: await boxOf(b.node) });
      } catch {
        // not rendered
      }
    }
    return {
      hostFound,
      state: character?.['data-state'] ?? null,
      mode: character?.['data-mode'] ?? null,
      center,
      bubble: bubble?.text ?? null,
      buttons: visibleButtons,
      cosmetics,
    };
  } finally {
    await cdp.detach();
  }
}

async function clickButton(page, label) {
  const info = await overlayInfo(page);
  const b = info.buttons.find((x) => x.text.includes(label));
  assert(b, `button "${label}" not found (have: ${info.buttons.map((x) => x.text).join(', ')})`);
  await page.mouse.click(b.at.x, b.at.y);
}

async function tabExists(browser, page) {
  return (await browser.pages()).includes(page) && !page.isClosed();
}

// ---------------------------------------------------------------------------

async function main() {
  rmSync(profile, { recursive: true, force: true });
  mkdirSync(shots, { recursive: true });
  const executablePath = chromePath();
  console.log(`Chrome for Testing: ${executablePath.split('/').slice(-1)[0]}`);
  let { browser, extId } = await launch(executablePath);
  console.log(`Extension id: ${extId}\n`);

  // The install flow opens the welcome page.
  const welcome = await waitFor(
    async () => (await browser.pages()).find((p) => p.url().includes('options/index.html#welcome')),
    {
      message: 'welcome page',
    },
  );

  await check('install opens onboarding; defaults are nudge mode with a 12s delay', async () => {
    await welcome.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
    await welcome.waitForSelector('.welcome');
    const { settings } = await inExt(welcome, () => chrome.storage.local.get('settings'));
    assert(settings.autoClose === false, 'autoClose should default to false');
    assert(settings.delaySeconds === 12, 'default delay should be 12');
    await welcome.setViewport({ width: 1180, height: 820 });
    await welcome.screenshot({ path: join(shots, 'onboarding.png') });
  });

  const ext = await extPage(browser, extId, 'options/index.html');
  await setSettings(ext, { delaySeconds: 5, onboardingComplete: true });

  let yt;
  await check(
    'character appears on a supported site after the countdown, then walks toward the exit',
    async () => {
      yt = await openSite(browser, 'https://www.youtube.com/watch?v=fixture');
      await sleep(2500);
      const early = await overlayInfo(yt);
      assert(
        !early.hostFound || early.mode === 'hidden' || early.mode === null,
        'character must not appear before the delay',
      );
      const first = await waitFor(
        async () => {
          const i = await overlayInfo(yt);
          return i.center && i.mode === 'moving' ? i : null;
        },
        { message: 'character walking' },
      );
      await sleep(1500);
      const later = await overlayInfo(yt);
      assert(
        later.center.x > first.center.x + 30,
        `should walk right (x ${first.center.x} → ${later.center.x})`,
      );
      assert(later.center.y < 120, 'should stay near the top edge');
      assert(
        ['walking', 'running', 'approaching'].includes(later.state),
        `walking state, got ${later.state}`,
      );
      await yt.screenshot({ path: join(shots, 'walking.png') });
    },
  );

  await check('nudge mode: reaches the corner, asks, and does not close the tab', async () => {
    const parked = await waitFor(
      async () => {
        const i = await overlayInfo(yt);
        return i.mode === 'parked' && i.bubble ? i : null;
      },
      { timeout: 25000, message: 'parked with nudge bubble' },
    );
    assert(/time to focus/.test(parked.bubble), `nudge copy, got: ${parked.bubble}`);
    await sleep(500);
    await yt.screenshot({ path: join(shots, 'nudge.png') });
    await sleep(3500);
    assert(await tabExists(browser, yt), 'tab must stay open in nudge mode');
  });

  await check('"5 more minutes" sends the character away and keeps the tab', async () => {
    await clickButton(yt, '5 more minutes');
    await waitFor(async () => !(await overlayInfo(yt)).hostFound, { message: 'overlay removed' });
    assert(await tabExists(browser, yt), 'tab still open');
    await yt.close();
  });

  await setSettings(ext, { autoClose: true });

  await check(
    'slingshot: dragging back charges tension; release launches; closes after the cancel window',
    async () => {
      const page = await openSite(browser, 'https://www.reddit.com/r/fixture');
      const info = await waitFor(
        async () => {
          const i = await overlayInfo(page);
          return i.mode === 'moving' && i.center ? i : null;
        },
        { message: 'character moving' },
      );
      const start = info.center;
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      let charging = false;
      for (let i = 1; i <= 40; i++) {
        await page.mouse.move(start.x - i * 6, start.y + i * 3);
        await sleep(30);
        if (i === 30) {
          const mid = await overlayInfo(page);
          charging = mid.state === 'charging';
          await page.screenshot({ path: join(shots, 'slingshot.png') });
        }
      }
      await sleep(500);
      const held = await overlayInfo(page);
      assert(charging || held.state === 'charging', `expected charging state, got ${held.state}`);
      await page.mouse.up();
      const launched = await waitFor(
        async () => {
          const i = await overlayInfo(page);
          return i.mode === 'launching' ? i : null;
        },
        { timeout: 2000, interval: 30, message: 'launching' },
      );
      assert(launched, 'launches');
      // Released: must NOT close immediately.
      await sleep(400);
      assert(await tabExists(browser, page), 'tab must not close right after release');
      const countdown = await waitFor(
        async () => {
          const i = await overlayInfo(page);
          return i.bubble && /Closing this tab/.test(i.bubble) ? i : null;
        },
        { timeout: 8000, message: 'cancel window' },
      );
      assert(countdown, 'cancel window shown');
      await sleep(450);
      await page.screenshot({ path: join(shots, 'countdown.png') });
      await waitFor(async () => !(await tabExists(browser, page)), {
        timeout: 8000,
        message: 'tab closed',
      });
    },
  );

  await check('closed tab can be reopened from the popup', async () => {
    const popup = await extPage(browser, extId, 'popup/index.html');
    await popup.setViewport({ width: 380, height: 640 });
    await popup.waitForSelector('.banner');
    await popup.screenshot({
      path: join(shots, 'popup.png'),
      clip: {
        x: 0,
        y: 0,
        width: 348,
        height: await popup.$eval('main', (m) => m.getBoundingClientRect().height),
      },
    });
    const dark = await extPage(browser, extId, 'popup/index.html', 'dark');
    await dark.setViewport({ width: 380, height: 640 });
    await dark.waitForSelector('.banner');
    await dark.screenshot({
      path: join(shots, 'popup-dark.png'),
      clip: {
        x: 0,
        y: 0,
        width: 348,
        height: await dark.$eval('main', (m) => m.getBoundingClientRect().height),
      },
    });
    await dark.close();
    const before = (await browser.pages()).length;
    await popup.click('.banner .btn');
    await waitFor(
      async () => (await browser.pages()).some((p) => p.url().includes('reddit.com/r/fixture')),
      { message: 'reopened tab' },
    );
    assert((await browser.pages()).length === before + 1, 'one tab reopened');
    const reopened = (await browser.pages()).find((p) => p.url().includes('reddit.com/r/fixture'));
    await reopened.close();
    await popup.close();
  });

  await check('cancel window: "Keep this tab" keeps it', async () => {
    const page = await openSite(browser, 'https://www.instagram.com/');
    await waitFor(async () => /Closing this tab/.test((await overlayInfo(page)).bubble ?? ''), {
      timeout: 30000,
      message: 'cancel window',
    });
    await clickButton(page, 'Keep this tab');
    await sleep(4500);
    assert(await tabExists(browser, page), 'tab kept');
    await page.close();
  });

  await check('switching tabs prevents background closure', async () => {
    const page = await openSite(browser, 'https://www.tiktok.com/');
    await sleep(1000);
    const other = await openSite(browser, 'https://example.com/');
    await other.bringToFront();
    await sleep(14000);
    assert(await tabExists(browser, page), 'background distracting tab must not be closed');
    const info = await overlayInfo(page);
    assert(!info.hostFound, 'no character on a background tab');
    await other.close();
    await page.bringToFront();
    // Returning resumes the countdown and the character shows up.
    await waitFor(async () => (await overlayInfo(page)).center, {
      timeout: 15000,
      message: 'character after returning',
    });
    await page.close();
  });

  await check('pinned tabs are protected', async () => {
    const page = await openSite(browser, 'https://www.facebook.com/');
    await inExt(ext, async () => {
      const [tab] = await chrome.tabs.query({ url: '*://*.facebook.com/*' });
      await chrome.tabs.update(tab.id, { pinned: true });
    });
    await page.bringToFront();
    await waitFor(async () => /pinned/.test((await overlayInfo(page)).bubble ?? ''), {
      timeout: 40000,
      message: 'pinned notice',
    });
    assert(await tabExists(browser, page), 'pinned tab stays');
    await page.close();
  });

  await check('repeat visits escalate speed (within the cap)', async () => {
    const status = await inExt(ext, () => chrome.runtime.sendMessage({ type: 'GET_STATUS' }));
    assert(status.escalation.count >= 4, `count ${status.escalation.count}`);
    assert(status.escalation.nextSpeedMultiplier > 1, 'faster than 1×');
    assert(status.escalation.nextSpeedMultiplier <= 3, 'capped');
    assert(status.today.intercepted >= 4, 'intercepts recorded');
  });

  await check('emergency stop sends a visible character away and pauses', async () => {
    const page = await openSite(browser, 'https://x.com/home');
    await waitFor(async () => (await overlayInfo(page)).center, {
      timeout: 20000,
      message: 'character',
    });
    const popup = await extPage(browser, extId, 'popup/index.html');
    await popup.waitForSelector('.btn-danger');
    await popup.click('.btn-danger');
    await popup.close();
    await page.bringToFront();
    await waitFor(async () => !(await overlayInfo(page)).hostFound, {
      timeout: 5000,
      message: 'character gone',
    });
    await sleep(7000);
    assert(!(await overlayInfo(page)).hostFound, 'stays gone while stopped');
    const status = await inExt(ext, () => chrome.runtime.sendMessage({ type: 'RESUME' }));
    assert(status.pause === null, 'resumed');
    await page.close();
  });

  // ---------------------------------------------------------------------------
  // V2

  const msg = (m) => inExt(ext, (x) => chrome.runtime.sendMessage(x), m);
  const local = (key) => inExt(ext, async (k) => (await chrome.storage.local.get(k))[k], key);

  await check(
    'V2 websites: brand logos render and a custom 27-second delay is set through the picker',
    async () => {
      await ext.setViewport({ width: 1180, height: 900 });
      await ext.reload({ waitUntil: 'domcontentloaded' });
      await ext.waitForSelector('#websites svg.site-icon[data-site="instagram"]');
      const logos = await ext.$$eval('#websites .site-icon', (els) =>
        els.map((e) => e.getAttribute('data-site')),
      );
      for (const id of ['instagram', 'tiktok', 'youtube', 'facebook', 'reddit', 'x'])
        assert(logos.includes(id), `logo ${id}`);
      await ext.click('#websites button[aria-label^="Countdown for YouTube:"]');
      await ext.waitForSelector('#websites .site-delay .chip');
      const chips = await ext.$$('#websites .site-delay .chip');
      await chips[chips.length - 1].click(); // Custom
      const input = await ext.waitForSelector(
        'input[aria-label="Countdown for YouTube: custom seconds"]',
      );
      await input.click({ clickCount: 3 });
      await input.type('4');
      await waitFor(
        async () =>
          (await ext.$eval('.custom-delay .field-hint', (e) => e.textContent)).includes(
            'between 5 and 60',
          ),
        { message: 'validation error' },
      );
      await input.click({ clickCount: 3 });
      await input.type('27');
      await waitFor(
        async () => {
          const yt = (await local('settings')).sites.find((x) => x.id === 'youtube');
          return yt.delay.mode === 'custom' && yt.delay.seconds === 27;
        },
        { message: 'custom 27 saved' },
      );
      await ext.evaluate(() => document.getElementById('websites').scrollIntoView());
      await sleep(300);
      await ext.screenshot({ path: join(shots, 'v2-websites.png') });
      const page = await openSite(browser, 'https://www.youtube.com/watch?v=custom');
      const status = await waitFor(
        async () => {
          const st = await msg({ type: 'GET_STATUS' });
          return st.activeTab?.siteId === 'youtube' ? st : null;
        },
        { message: 'youtube tracked' },
      );
      assert(status.activeTab.delaySeconds === 27, `delaySeconds ${status.activeTab.delaySeconds}`);
      await page.close();
    },
  );

  await check(
    'V2 focus: start a custom session from the popup, close the popup, it keeps running; pause & resume',
    async () => {
      const popup = await extPage(browser, extId, 'popup/index.html');
      await popup.setViewport({ width: 380, height: 640 });
      await popup.waitForSelector('.popup-tabs');
      await popup.click('.popup-tabs button:nth-child(2)');
      await popup.waitForSelector('.focus-presets .chip');
      const chips = await popup.$$('.focus-presets .chip');
      await chips[chips.length - 1].click();
      const input = await popup.waitForSelector('input[aria-label="Custom length in minutes"]');
      await input.type('1');
      await popup.click('.focus-panel .btn-lg');
      await popup.waitForSelector('.focus-time');
      await sleep(1200);
      await popup.screenshot({
        path: join(shots, 'v2-popup-focus.png'),
        clip: {
          x: 0,
          y: 0,
          width: 348,
          height: await popup.$eval('main', (m) => m.getBoundingClientRect().height),
        },
      });
      await popup.close();
      await sleep(3000);
      let snap = await msg({ type: 'FOCUS_GET' });
      assert(snap.current?.status === 'running', 'running with popup closed');
      assert(
        snap.remainingMs < 57_500 && snap.remainingMs > 40_000,
        `remaining ${snap.remainingMs}`,
      );
      const again = await extPage(browser, extId, 'popup/index.html');
      await again.waitForSelector('.tab-badge');
      await again.click('.popup-tabs button:nth-child(2)');
      await again.waitForSelector('.focus-actions .btn');
      await again.click('.focus-actions .btn'); // Pause
      await waitFor(async () => (await msg({ type: 'FOCUS_GET' })).current?.status === 'paused', {
        message: 'paused',
      });
      const pausedAt = (await msg({ type: 'FOCUS_GET' })).remainingMs;
      await sleep(2500);
      snap = await msg({ type: 'FOCUS_GET' });
      assert(Math.abs(snap.remainingMs - pausedAt) < 50, 'paused time does not tick');
      await again.click('.focus-actions .btn'); // Resume
      await waitFor(async () => (await msg({ type: 'FOCUS_GET' })).current?.status === 'running', {
        message: 'resumed',
      });
      await again.close();
    },
  );

  await check(
    'V2 focus: completes on its own (popup closed), celebrates, records stats, unlocks First Focus + Party Hat',
    async () => {
      const snap = await waitFor(
        async () => {
          const x = await msg({ type: 'FOCUS_GET' });
          return x.celebrate ? x : null;
        },
        { timeout: 90_000, interval: 1000, message: 'focus completion' },
      );
      assert(
        snap.celebrate.kind === 'focus' && snap.celebrate.outcome === 'completed',
        'completed',
      );
      const stats = await local('stats');
      assert(stats.totalFocusSessions === 1, `sessions ${stats.totalFocusSessions}`);
      assert(Math.abs(stats.totalFocusMinutes - 1) < 0.01, `minutes ${stats.totalFocusMinutes}`);
      const achievements = await local('achievements');
      assert(achievements['first-focus'], 'first-focus unlocked');
      const inv = await local('inventory');
      assert(inv.unlocked['hat:party'], 'party hat unlocked');
      assert(!inv.unlocked['hat:crown'], 'no unearned rewards');
      const popup = await extPage(browser, extId, 'popup/index.html');
      await popup.setViewport({ width: 380, height: 640 });
      await popup.waitForSelector('.unlock-toast');
      await popup.click('.popup-tabs button:nth-child(2)');
      await popup.waitForSelector('.focus-cheer');
      await sleep(700);
      await popup.screenshot({
        path: join(shots, 'v2-popup-celebrate.png'),
        clip: {
          x: 0,
          y: 0,
          width: 348,
          height: await popup.$eval('main', (m) => m.getBoundingClientRect().height),
        },
      });
      const buttons = await popup.$$('.focus-actions .btn');
      await buttons[buttons.length - 1].click(); // Done
      await waitFor(async () => (await msg({ type: 'FOCUS_GET' })).celebrate === null, {
        message: 'acknowledged',
      });
      await popup.close();
      // Only one completion recorded even after more ticks.
      await msg({ type: 'FOCUS_GET' });
      assert((await local('focusHistory')).length === 1, 'single history entry');
    },
  );

  await check('V2 collection: equip the Party Hat; achievements & collection render', async () => {
    await ext.reload({ waitUntil: 'domcontentloaded' });
    await ext.waitForSelector('#collection .item');
    await ext.click('#collection button[aria-label^="Party Hat."]');
    await waitFor(async () => (await local('inventory')).equipped.hat === 'hat:party', {
      message: 'hat equipped',
    });
    // Locked items can't be equipped.
    await ext.click('#collection button[aria-label^="Little Crown."]');
    await sleep(500);
    assert((await local('inventory')).equipped.hat === 'hat:party', 'locked crown not equipped');
    await ext.evaluate(() => document.getElementById('collection').scrollIntoView());
    await sleep(500);
    await ext.screenshot({ path: join(shots, 'v2-collection.png') });
    await ext.evaluate(() => document.getElementById('achievements').scrollIntoView());
    await sleep(400);
    await ext.screenshot({ path: join(shots, 'v2-achievements.png') });
    await ext.evaluate(() => document.getElementById('statistics').scrollIntoView());
    await sleep(400);
    await ext.screenshot({ path: join(shots, 'v2-statistics.png') });
    await ext.evaluate(() => window.scrollTo(0, 0));
    await sleep(400);
    await ext.screenshot({ path: join(shots, 'v2-focus.png') });
  });

  await check(
    'V2 regression: the hatted character still walks, charges and slingshots; safety window intact',
    async () => {
      const page = await openSite(browser, 'https://www.instagram.com/explore/');
      const info = await waitFor(
        async () => {
          const i = await overlayInfo(page);
          return i.mode === 'moving' && i.center ? i : null;
        },
        { timeout: 30000, message: 'character moving' },
      );
      assert(info.cosmetics.includes('hat:party'), `hat on page (${info.cosmetics})`);
      await sleep(900);
      const later = await overlayInfo(page);
      assert(later.center.x > info.center.x + 20, 'walks toward the exit');
      await page.screenshot({ path: join(shots, 'v2-hat-walking.png') });
      const start = later.center;
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      for (let i = 1; i <= 40; i++) {
        await page.mouse.move(start.x - i * 6, start.y + i * 3);
        await sleep(30);
      }
      await sleep(400);
      assert((await overlayInfo(page)).state === 'charging', 'charging');
      await page.mouse.up();
      await waitFor(async () => (await overlayInfo(page)).mode === 'launching', {
        timeout: 2000,
        interval: 30,
        message: 'launching',
      });
      await sleep(300);
      assert(await tabExists(browser, page), 'no instant close on release');
      await waitFor(async () => /Closing this tab/.test((await overlayInfo(page)).bubble ?? ''), {
        timeout: 8000,
        message: 'cancel window',
      });
      assert(
        (await overlayInfo(page)).cosmetics.includes('hat:party'),
        'hat still attached after slingshot',
      );
      await clickButton(page, 'Keep this tab');
      await sleep(4000);
      assert(await tabExists(browser, page), 'kept');
      await page.close();
    },
  );

  await check('settings page: choosing a color persists', async () => {
    await ext.setViewport({ width: 1180, height: 900 });
    await ext.reload({ waitUntil: 'domcontentloaded' });
    await ext.waitForSelector('[aria-label="Lavender"]');
    await ext.click('#character [aria-label="Lavender"]');
    await waitFor(
      async () =>
        (await inExt(ext, () => chrome.storage.local.get('settings'))).settings.character.color ===
        'purple',
      { message: 'purple saved' },
    );
    await ext.evaluate(() => document.getElementById('character').scrollIntoView());
    await sleep(400);
    await ext.screenshot({ path: join(shots, 'settings-character.png') });
  });

  await check('settings persist after restarting Chrome', async () => {
    await browser.close();
    ({ browser, extId } = await launch(executablePath));
    const page = await extPage(browser, extId, 'options/index.html');
    const { settings } = await inExt(page, () => chrome.storage.local.get('settings'));
    assert(settings.character.color === 'purple', `color ${settings.character.color}`);
    assert(settings.autoClose === true, 'autoClose persisted');
    assert(settings.delaySeconds === 5, 'delay persisted');
    const stats = (await inExt(page, () => chrome.storage.local.get('stats'))).stats;
    assert(stats.totalClosed >= 1, 'stats persisted');
    // V2 data
    const yt = settings.sites.find((x) => x.id === 'youtube');
    assert(yt.delay.mode === 'custom' && yt.delay.seconds === 27, 'custom delay persisted');
    const v2 = await inExt(page, () =>
      chrome.storage.local.get(['inventory', 'achievements', 'focusHistory', 'schemaVersion']),
    );
    assert(v2.inventory.equipped.hat === 'hat:party', 'equipped hat persisted');
    assert(v2.achievements['first-focus'], 'achievements persisted');
    assert(v2.focusHistory.length === 1, 'focus history persisted');
    assert(v2.schemaVersion === 2, 'schema v2');
    assert(stats.totalFocusSessions === 1, 'focus stats persisted');
  });

  await browser.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} end-to-end checks passed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
