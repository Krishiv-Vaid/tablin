import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BUILT_IN_SITES } from '../../src/detection/distraction-rules';
import { matchPatternsFor } from '../../src/detection/website-detector';

const manifest = JSON.parse(
  readFileSync(new URL('../../public/manifest.json', import.meta.url), 'utf8'),
);

describe('manifest', () => {
  it('is Manifest V3 with a module service worker', () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.background).toEqual({ service_worker: 'service-worker.js', type: 'module' });
  });

  it('covers exactly the built-in site registry in host permissions and content scripts', () => {
    const expected = BUILT_IN_SITES.flatMap((s) => s.domains.flatMap(matchPatternsFor)).sort();
    expect([...manifest.host_permissions].sort()).toEqual(expected);
    expect([...manifest.content_scripts[0].matches].sort()).toEqual(expected);
  });

  it('requests only minimal permissions (no tabs, history, or <all_urls>)', () => {
    expect([...manifest.permissions].sort()).toEqual(['alarms', 'scripting', 'storage']);
    expect(JSON.stringify(manifest.host_permissions)).not.toContain('<all_urls>');
    expect(manifest.optional_host_permissions).toEqual(['*://*/*']);
  });

  it('keeps version in sync with package.json', () => {
    const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
    expect(manifest.version).toBe(pkg.version);
  });
});
