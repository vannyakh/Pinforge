/** Lightweight concurrency pool (p-limit style) for download tasks. */

export type PoolTask<T> = () => Promise<T>;

export interface MapPoolOptions {
  concurrency: number;
  /** Optional yield between task starts for IPC/UI breathing room */
  onTaskStart?: (index: number, total: number) => void;
  onTaskDone?: (index: number, total: number) => void;
}

/**
 * Run async tasks with a fixed concurrency limit.
 * Preserves input order in the returned results array.
 */
export async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
  opts?: Omit<MapPoolOptions, "concurrency">
): Promise<R[]> {
  const limit = Math.max(1, Math.floor(concurrency) || 1);
  const results = new Array<R>(items.length);
  let next = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      opts?.onTaskStart?.(i, items.length);
      results[i] = await mapper(items[i]!, i);
      opts?.onTaskDone?.(i, items.length);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

export async function runPool<T>(tasks: PoolTask<T>[], concurrency: number): Promise<T[]> {
  return mapPool(tasks, concurrency, (task) => task());
}
