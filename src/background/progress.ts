import { computeMetrics, evaluateAchievements } from '../shared/achievements';
import type { TablinStore } from '../shared/storage';
import type { UnlockEvent } from '../shared/types';

/**
 * Re-evaluates achievements from stored data and grants rewards.
 * Must be called inside the shared Serial lock. Idempotent.
 */
export async function syncProgress(store: TablinStore, now: number): Promise<UnlockEvent[]> {
  const [stats, record, inventory] = await Promise.all([
    store.getStats(),
    store.getAchievements(),
    store.getInventory(),
  ]);
  const result = evaluateAchievements(computeMetrics(stats, now), record, inventory, now);
  const inventoryChanged =
    Object.keys(result.inventory.unlocked).length !== Object.keys(inventory.unlocked).length;
  if (result.events.length > 0) {
    await store.setAchievements(result.record);
    await store.setUnseenUnlocks([...(await store.getUnseenUnlocks()), ...result.events]);
  }
  if (inventoryChanged) await store.setInventory(result.inventory);
  return result.events;
}
