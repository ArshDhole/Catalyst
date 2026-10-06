// Catalyst cache — simple in-memory cache with TTL (for analysis + plans)
// Week 2 will swap this for Redis/Postgres. API-compatible on purpose.
const store = new Map();

export function cacheGet(key) {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }
  return entry.value;
}

export function cacheSet(key, value, ttlMs = 1000 * 60 * 60) {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

export function cacheDel(key) {
  store.delete(key);
}

export function cacheClear() {
  store.clear();
}
