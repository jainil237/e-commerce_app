import NodeCache from 'node-cache'
import { tryRedis } from './redis'

/**
 * Shared read-through cache for product and category responses.
 *
 * Pure TTL, no invalidation — admin writes do not bust these entries and never
 * did; they age out. Moving the cache to Redis does not change that, but it does
 * mean one stale entry now serves every instance instead of each instance holding
 * its own copy, which slightly widens the existing staleness window.
 *
 * Unlike the OTP store this does NOT dual-write: a cache miss just re-queries the
 * database, so spending a second write to guard against one is not worth it.
 */

export const DEFAULT_TTL_SECONDS = 60

const memory = new NodeCache({ stdTTL: DEFAULT_TTL_SECONDS, checkperiod: 120 })

export async function cacheGet<T>(key: string): Promise<T | undefined> {
  const attempt = await tryRedis('cache.get', (c) => c.get(key))
  if (attempt.ok) {
    if (attempt.value === null) return undefined
    try {
      return JSON.parse(attempt.value) as T
    } catch {
      // A corrupt entry must behave as a miss, not a 500. The caller re-queries
      // and overwrites it on the next set.
      return undefined
    }
  }
  return memory.get<T>(key)
}

export async function cacheSet(key: string, value: unknown, ttlSeconds = DEFAULT_TTL_SECONDS): Promise<void> {
  const attempt = await tryRedis('cache.set', (c) => c.setex(key, ttlSeconds, JSON.stringify(value)))
  if (!attempt.ok) memory.set(key, value, ttlSeconds)
}
