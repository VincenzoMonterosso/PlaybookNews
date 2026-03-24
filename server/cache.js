const CACHE = new Map();


// getChachedValue Function
// @param1: cacheKey: a value the key to get from the map, could be team stat, player, etc...
// @param2: ttlMs: Milliseconds till expiry
// @param3: loader an async function that is expected to be the function to fetch data if it is not already cached
export async function getCachedValue(cacheKey, ttlMs, loader) {
  const now = Date.now();
  const existing = CACHE.get(cacheKey);

  if (existing && existing.value !== undefined && existing.expiresAt > now) {
    return existing.value;
  }

  if (existing?.inFlight) {
    return existing.inFlight;
  }

  // This segment prevents double fetching from API
  const inFlight = (async () => {
    const value = await loader();
    CACHE.set(cacheKey, {
      value,
      expiresAt: Date.now() + ttlMs,
    });
    return value;
  })().finally(() => {
    const latest = CACHE.get(cacheKey);
    if (latest?.inFlight === inFlight) {
      CACHE.delete(cacheKey);
    }
  });

  CACHE.set(cacheKey, {
    inFlight,
    expiresAt: now + ttlMs,
  });

  return inFlight;
}
