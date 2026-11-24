import { useId } from 'react';
import { SITE_LOGOS } from '../logos/site-logos';

/**
 * Site identity mark: the bundled logo for built-in sites, or a tidy letter
 * tile (in the site's accent color) for custom sites and as a fallback.
 */
export function WebsiteIcon(props: {
  site: { id: string; name: string; color?: string };
  size?: number;
  decorative?: boolean;
}) {
  const size = props.size ?? 28;
  const uid = useId().replace(/:/g, '');
  const logo = SITE_LOGOS[props.site.id];
  const a11y = props.decorative
    ? { 'aria-hidden': true as const }
    : { role: 'img', 'aria-label': `${props.site.name} logo` };

  if (logo) {
    return (
      <svg
        className={`site-icon${logo.dark ? ' site-icon-dark' : ''}`}
        viewBox="0 0 24 24"
        width={size}
        height={size}
        data-site={props.site.id}
        {...a11y}
      >
        {logo.render(`l${uid}`)}
      </svg>
    );
  }
  return (
    <span
      className="site-icon site-icon-letter"
      style={{
        width: size,
        height: size,
        background: props.site.color ?? '#8A8F98',
        fontSize: size * 0.45,
      }}
      data-site={props.site.id}
      {...a11y}
    >
      {props.site.name.charAt(0).toUpperCase()}
    </span>
  );
}
