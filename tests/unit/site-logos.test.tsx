// @vitest-environment jsdom
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BUILT_IN_SITES } from '../../src/detection/distraction-rules';
import { WebsiteIcon } from '../../src/ui/components/WebsiteIcon';
import { hasLogo, SITE_LOGOS } from '../../src/ui/logos/site-logos';

describe('website logos', () => {
  it('every built-in site has a bundled logo', () => {
    for (const site of BUILT_IN_SITES) {
      expect(hasLogo(site.id)).toBe(true);
      expect(SITE_LOGOS[site.id]!.label).toBe(site.name);
    }
  });

  it('renders inline SVG with no external URLs and an accessible label', () => {
    for (const site of BUILT_IN_SITES) {
      const html = renderToStaticMarkup(createElement(WebsiteIcon, { site }));
      expect(html).toContain('<svg');
      expect(html).toContain(`aria-label="${site.name} logo"`);
      expect(html).not.toMatch(/https?:\/\//);
    }
  });

  it('falls back to a letter tile for custom sites', () => {
    expect(hasLogo('custom:twitch.tv')).toBe(false);
    const html = renderToStaticMarkup(
      createElement(WebsiteIcon, {
        site: { id: 'custom:twitch.tv', name: 'twitch.tv', color: '#9146FF' },
      }),
    );
    expect(html).toContain('>T<');
    expect(html).not.toContain('<svg');
  });

  it('gradient ids are unique per instance (no clashes when rendered many times)', () => {
    const html = renderToStaticMarkup(
      createElement(
        'div',
        null,
        createElement(WebsiteIcon, { site: BUILT_IN_SITES[0]! }),
        createElement(WebsiteIcon, { site: BUILT_IN_SITES[0]! }),
      ),
    );
    const ids = [...html.matchAll(/id="([^"]+-ig)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(2);
  });
});
