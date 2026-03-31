
export async function getCachedValue(_cacheKey, _ttlMs, loader) {
  if (typeof loader !== "function") {
    throw new TypeError("getCachedValue not implemented yet, come back later!!!");
  }
  return await loader();
}
