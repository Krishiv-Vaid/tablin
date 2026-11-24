import { ACHIEVEMENTS_BY_ID } from '../../shared/achievements';
import { COSMETICS_BY_ID } from '../../shared/cosmetics';
import type { UnlockEvent } from '../../shared/types';
import { AchievementBadge } from './AchievementBadge';

/** Celebrates achievements the user hasn't seen yet. */
export function UnlockToast(props: { unseen: UnlockEvent[]; onDismiss(): void; onView?(): void }) {
  if (props.unseen.length === 0) return null;
  const first = props.unseen[props.unseen.length - 1]!;
  const a = ACHIEVEMENTS_BY_ID.get(first.achievementId);
  if (!a) return null;
  const reward = first.rewardId ? COSMETICS_BY_ID.get(first.rewardId) : null;
  const more = props.unseen.length - 1;
  return (
    <div className="unlock-toast" role="status" aria-live="polite">
      <AchievementBadge achievement={a} unlocked size={42} />
      <div className="unlock-text">
        <span className="unlock-kicker">
          Achievement unlocked{more > 0 ? ` (+${more} more)` : ''}
        </span>
        <strong>{a.name}</strong>
        {reward && <span className="unlock-reward">New for your companion: {reward.name}</span>}
      </div>
      <div className="unlock-actions">
        {props.onView && (
          <button type="button" className="btn btn-sm" onClick={props.onView}>
            View
          </button>
        )}
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={props.onDismiss}
          aria-label="Dismiss"
        >
          OK
        </button>
      </div>
    </div>
  );
}
