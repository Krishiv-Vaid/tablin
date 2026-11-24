import {
  ACHIEVEMENTS,
  CATEGORY_LABELS,
  computeMetrics,
  progressList,
} from '../../shared/achievements';
import { COSMETICS_BY_ID } from '../../shared/cosmetics';
import type { ProgressSnapshot } from '../../shared/messages';
import type { AchievementCategory } from '../../shared/types';
import { AchievementBadge } from '../../ui/components/AchievementBadge';
import { CheckIcon, LockIcon } from '../../ui/components/Icons';
import { Section } from './Section';

const ORDER: AchievementCategory[] = ['focus', 'streaks', 'distractions', 'time'];

function formatValue(metric: string, value: number): string {
  if (metric === 'totalFocusMinutes' || metric === 'longestSessionMinutes') {
    return value >= 60 && metric === 'totalFocusMinutes'
      ? `${(value / 60).toFixed(1).replace(/\.0$/, '')} h`
      : `${Math.round(value)} min`;
  }
  return String(Math.floor(value));
}

export function AchievementsSection({ progress }: { progress: ProgressSnapshot | null }) {
  if (!progress) return null;
  const list = progressList(computeMetrics(progress.stats, progress.now), progress.achievements);
  const unlocked = list.filter((p) => p.unlockedAt !== null).length;
  const fresh = new Set(progress.unseen.map((u) => u.achievementId));

  return (
    <Section
      id="achievements"
      title="Achievements"
      intro="Earned from what you actually do. Some come with a little reward for your companion."
    >
      <div className="card progress-summary">
        <div>
          <span className="stat-value">
            {unlocked}
            <span className="of"> / {ACHIEVEMENTS.length}</span>
          </span>
          <span className="stat-label">achievements unlocked</span>
        </div>
        <div
          className="meter"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={ACHIEVEMENTS.length}
          aria-valuenow={unlocked}
          aria-label="Achievements unlocked"
        >
          <div style={{ width: `${(unlocked / ACHIEVEMENTS.length) * 100}%` }} />
        </div>
      </div>
      {ORDER.map((cat) => (
        <div key={cat} className="ach-group">
          <h3 className="subhead">{CATEGORY_LABELS[cat]}</h3>
          <div className="ach-grid">
            {list
              .filter((p) => p.achievement.category === cat)
              .map((p) => {
                const a = p.achievement;
                const done = p.unlockedAt !== null;
                const reward = p.rewardId ? COSMETICS_BY_ID.get(p.rewardId) : null;
                return (
                  <article
                    key={a.id}
                    className={`ach card ${done ? 'done' : 'locked'} ${fresh.has(a.id) ? 'fresh' : ''}`}
                    aria-label={`${a.name}${done ? ', unlocked' : ', locked'}`}
                  >
                    <AchievementBadge achievement={a} unlocked={done} />
                    <div className="ach-body">
                      <h4>
                        {a.name}
                        {done ? <CheckIcon size={14} /> : <LockIcon size={13} />}
                      </h4>
                      <p>{a.description}</p>
                      {done ? (
                        <span className="ach-date">
                          Unlocked{' '}
                          {new Date(p.unlockedAt!).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </span>
                      ) : (
                        <div className="ach-progress">
                          <div className="meter small">
                            <div style={{ width: `${p.ratio * 100}%` }} />
                          </div>
                          <span>
                            {formatValue(a.metric, p.value)} / {formatValue(a.metric, a.target)}
                          </span>
                        </div>
                      )}
                      {reward && (
                        <span className={`reward-pill ${done ? 'earned' : ''}`}>
                          {done ? 'Reward: ' : 'Unlocks: '}
                          {reward.name}
                        </span>
                      )}
                    </div>
                  </article>
                );
              })}
          </div>
        </div>
      ))}
    </Section>
  );
}
