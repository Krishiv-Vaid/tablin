import type { Achievement } from '../../shared/achievements';

/** Category glyphs drawn on a 40×40 badge. */
const GLYPHS: Record<Achievement['category'], string> = {
  focus: 'M20 11.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17Zm0 3.5v5l3.4 2.2', // clock
  streaks:
    'M20 29c4 0 7-2.8 7-6.8 0-4.2-3.6-6.6-4.3-11.7-2.3 1.7-3.7 4.2-3.7 6.8-1.4-.9-2-2.3-2.2-3.7-2.2 2-3.8 5-3.8 8.6 0 4 3 6.8 7 6.8Z', // flame
  distractions:
    'M20 10.5 27.5 13v6.3c0 4.8-3.2 8.6-7.5 10.2-4.3-1.6-7.5-5.4-7.5-10.2V13Zm-3.4 9.4 2.4 2.4 4.6-4.8', // shield
  time: 'M14 11h12M14 29h12M15.5 11c0 4.6 4.5 5.8 4.5 9s-4.5 4.4-4.5 9M24.5 11c0 4.6-4.5 5.8-4.5 9s4.5 4.4 4.5 9', // hourglass
};

const TONES: Record<Achievement['category'], string> = {
  focus: '#E8772A',
  streaks: '#E5484D',
  distractions: '#3E8FD8',
  time: '#8367E0',
};

/** Consistent SVG badge: category glyph, tier rings, locked state. */
export function AchievementBadge(props: {
  achievement: Achievement;
  unlocked: boolean;
  size?: number;
}) {
  const { achievement: a, unlocked } = props;
  const size = props.size ?? 52;
  const tone = TONES[a.category];
  return (
    <svg
      className={`badge ${unlocked ? 'unlocked' : 'locked'}`}
      viewBox="0 0 40 40"
      width={size}
      height={size}
      aria-hidden="true"
      style={{ ['--badge' as string]: tone }}
    >
      <circle cx="20" cy="20" r="18.5" className="badge-bg" />
      {Array.from({ length: a.tier }, (_, i) => (
        <circle
          key={i}
          cx="20"
          cy="20"
          r={18.5 - i * 2.2}
          className="badge-ring"
          fill="none"
          strokeWidth="1"
        />
      ))}
      <path
        d={GLYPHS[a.category]}
        className="badge-glyph"
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
