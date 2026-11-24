/**
 * Real upgrade test: installs the actual v0.1.0 build (from git `main`), creates
 * v1 data in Chrome, then replaces it in place with the current build (same path
 * → same extension id → same chrome.storage) and checks the migration in Chrome.
 *
 *   npm run build && npm run test:upgrade [-- <git-ref-of-v1>]
 */
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const work = join(root, '.cache', 'upgrade');
const v1src = join(work, 'v1-src');
const extDir = join(work, 'extension'); // stable path → stable extension id
const profile = join(work, 'profile');
const ref = process.argv[2] ?? 'main';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: 'pipe', encoding: 'utf8' });

function chromePath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const out = run(
    'npx',
    [
      '-y',
      '@puppeteer/browsers@2.6.1',
      'install',
      'chrome@stable',
      '--path',
      join(root, '.cache', 'chrome'),
    ],
    root,
  );
  const line = out.trim().split('\n').pop();
  return line.slice(line.indexOf(' ') + 1);
}

async function launch(executablePath) {
  const browser = await puppeteer.launch({
    executablePath,
    headless: !process.env.HEADFUL,
    userDataDir: profile,
    args: [
      `--disable-extensions-except=${extDir}`,
      `--load-extension=${extDir}`,
      '--no-first-run',
      '--disable-sync',
      '--disable-component-update',
    ],
  });
  const worker = await browser.waitForTarget(
    (t) => t.type() === 'service_worker' && t.url().endsWith('/service-worker.js'),
    { timeout: 15000 },
  );
  const id = new URL(worker.url()).host;
  const page = await browser.newPage();
  await page.goto(`chrome-extension://${id}/options/index.html`);
  return { browser, page, id };
}

async function main() {
  if (!existsSync(join(root, 'dist', 'manifest.json'))) throw new Error('Run npm run build first');
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });

  console.log(`Building v1 from ${ref}…`);
  run('git', ['worktree', 'add', '--detach', v1src, ref], root);
  try {
    cpSync(join(root, 'node_modules'), join(v1src, 'node_modules'), { recursive: true });
    run('npm', ['run', 'build'], v1src);
    cpSync(join(v1src, 'dist'), extDir, { recursive: true });
  } finally {
    run('git', ['worktree', 'remove', '--force', v1src], root);
  }

  const exe = chromePath();
  let { browser, page, id } = await launch(exe);
  const v1Version = await page.evaluate(() => chrome.runtime.getManifest().version);
  console.log(`v1 running: ${v1Version} (${id})`);

  // Create realistic data through v1's own storage format.
  await page.evaluate(async () => {
    const { settings } = await chrome.storage.local.get('settings');
    settings.autoClose = true;
    settings.delaySeconds = 20;
    settings.character = { ...settings.character, color: 'purple', name: 'Mochi' };
    settings.behavior.slingshotEnabled = false;
    settings.sites = settings.sites.map((s) =>
      s.id === 'youtube'
        ? { ...s, enabled: false, delaySeconds: 30 }
        : s.id === 'reddit'
          ? { ...s, delaySeconds: 8 }
          : s,
    );
    settings.onboardingComplete = true;
    await chrome.storage.local.set({
      settings,
      stats: {
        days: { '2026-11-20': { intercepted: 11, closed: 4, snoozed: 1, reminders: 0 } },
        totalIntercepted: 11,
        totalClosed: 4,
        totalFocusSessions: 6,
      },
    });
  });

  console.log('Upgrading in place to the current build…');
  // On a real update Chrome re-registers the extension's service worker. Relaunching with
  // --load-extension in automation doesn't (the cached v1 worker keeps running), so after
  // closing Chrome we drop only the profile's service-worker cache.
  await browser.close();
  // chrome.storage lives in "Local Extension Settings"; only the worker script cache is dropped.
  rmSync(join(profile, 'Default', 'Service Worker'), { recursive: true, force: true });
  rmSync(extDir, { recursive: true, force: true });
  cpSync(join(root, 'dist'), extDir, { recursive: true });
  ({ browser, page, id } = await launch(exe));
  await sleep(1500); // onInstalled + migration

  const v2Version = await page.evaluate(() => chrome.runtime.getManifest().version);
  // Any message waits for the migration; GET_STATUS also proves the new worker is running.
  const status = await page.evaluate(() => chrome.runtime.sendMessage({ type: 'GET_STATUS' }));
  const data = await page.evaluate(() => chrome.storage.local.get(null));
  await browser.close();

  const s = data.settings;
  const site = (x) => s.sites.find((y) => y.id === x);
  const checks = [
    ['version upgraded to 2.0.0', v2Version !== v1Version && v2Version === '2.0.0'],
    ['the v2 worker is running', typeof status.streak === 'object' && 'focus' in status],
    ['schemaVersion = 2', data.schemaVersion === 2],
    ['settings.schemaVersion = 2', s.schemaVersion === 2],
    ['autoClose kept', s.autoClose === true],
    ['global delay kept', s.delaySeconds === 20],
    ['color & name kept', s.character.color === 'purple' && s.character.name === 'Mochi'],
    ['behavior kept', s.behavior.slingshotEnabled === false],
    ['youtube toggle kept', site('youtube').enabled === false],
    [
      'youtube 30s → preset',
      site('youtube').delay?.mode === 'preset' && site('youtube').delay.seconds === 30,
    ],
    [
      'reddit 8s → custom',
      site('reddit').delay?.mode === 'custom' && site('reddit').delay.seconds === 8,
    ],
    ['other sites inherit the default', site('x').delay?.mode === 'inherit'],
    ['focus settings initialised', s.focus?.focusMinutes === 25],
    ['counters kept', data.stats.totalIntercepted === 11 && data.stats.totalClosed === 4],
    [
      'v1 session count → watch sessions',
      data.stats.totalWatchSessions >= 6 && data.stats.totalFocusSessions === 0,
    ],
    [
      'earned achievements unlocked',
      !!data.achievements?.['first-rescue'] && !!data.achievements?.['tab-guardian'],
    ],
    [
      'no unearned achievements',
      !data.achievements?.protector && !data.achievements?.['first-focus'],
    ],
    [
      'inventory initialised empty',
      !!data.inventory && Object.keys(data.inventory.unlocked).length === 0,
    ],
    [
      'worker healthy with migrated data',
      status.enabled === true && status.character.name === 'Mochi',
    ],
  ];
  let failed = 0;
  for (const [name, ok] of checks) {
    console.log(`  ${ok ? '✓' : '✗'} ${name}`);
    if (!ok) failed++;
  }
  console.log(`\n${checks.length - failed}/${checks.length} upgrade checks passed`);
  rmSync(work, { recursive: true, force: true });
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  try {
    run('git', ['worktree', 'remove', '--force', v1src], root);
  } catch {
    // already removed
  }
  process.exit(1);
});
