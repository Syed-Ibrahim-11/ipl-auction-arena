export function hashUnit(...parts: Array<string | number>): number {
  const text = parts.join("|");
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  hash ^= hash >>> 16;
  return (hash >>> 0) / 4294967296;
}

export function hashInt(maxExclusive: number, ...parts: Array<string | number>): number {
  if (maxExclusive <= 0) return 0;
  return Math.floor(hashUnit(...parts) * maxExclusive);
}

export function pickWeighted<T>(entries: Array<{ value: T; weight: number }>, roll: number): T {
  const total = entries.reduce((sum, entry) => sum + Math.max(0, entry.weight), 0);
  if (total <= 0) return entries[0].value;
  let cursor = roll * total;
  for (const entry of entries) {
    cursor -= Math.max(0, entry.weight);
    if (cursor <= 0) return entry.value;
  }
  return entries[entries.length - 1].value;
}
