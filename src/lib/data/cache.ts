/**
 * In-process memo for data that only changes on a dataset import. Live writes
 * (bids, chat, fixtures) touch other tables, so they must not invalidate this.
 */
const TTL_MS = 5 * 60_000;
const store = new Map<string, { at: number; value: unknown }>();

export function cachedStatic<T>(key: string, compute: () => T): T {
  const at = Date.now();
  const hit = store.get(key);
  if (hit && at - hit.at < TTL_MS) return hit.value as T;
  const value = compute();
  store.set(key, { at, value });
  return value;
}

export function clearStaticCache(): void {
  store.clear();
}
