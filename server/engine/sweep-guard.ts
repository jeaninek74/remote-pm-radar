import { mapLimit } from './http';

export async function forEachWhileLocked<T>(
  items: T[],
  limit: number,
  lock: { readonly held: boolean },
  fn: (item: T) => Promise<void>,
): Promise<{ stoppedEarly: boolean }> {
  let stoppedEarly = false;
  await mapLimit(items, limit, async (item) => {
    if (!lock.held) {
      stoppedEarly = true;
      return;
    }
    await fn(item);
  });
  return { stoppedEarly };
}
