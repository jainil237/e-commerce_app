import NodeCache from 'node-cache'
import { tryRedis, nsKey } from './redis'
import { trace } from './observability'

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
  const started = Date.now()
  const k = nsKey(key)
  const attempt = await tryRedis('cache.get', (c) => c.get(k))
  if (attempt.ok) {
    if (attempt.value === null) {
      trace('Cache', 'MISS', { key, backend: 'redis', ms: Date.now() - started })
      return undefined
    }
    try {
      const parsed = JSON.parse(attempt.value) as T
      trace('Cache', 'HIT', { key, backend: 'redis', bytes: attempt.value.length, ms: Date.now() - started })
      return parsed
    } catch {
      trace('Cache', 'CORRUPT->MISS', { key, backend: 'redis' })
      // A corrupt entry must behave as a miss, not a 500. The caller re-queries
      // and overwrites it on the next set.
      return undefined
    }
  }
  const fromMemory = memory.get<T>(key)
  trace('Cache', fromMemory === undefined ? 'MISS' : 'HIT', { key, backend: 'memory', reason: 'redis-unavailable' })
  return fromMemory
}

export async function cacheSet(key: string, value: unknown, ttlSeconds = DEFAULT_TTL_SECONDS): Promise<void> {
  const payload = JSON.stringify(value)
  const k = nsKey(key)
  const attempt = await tryRedis('cache.set', (c) => c.setex(k, ttlSeconds, payload))
  if (!attempt.ok) {
    memory.set(key, value, ttlSeconds)
    trace('Cache', 'SET', { key, backend: 'memory', ttl: ttlSeconds, bytes: payload.length, reason: 'redis-unavailable' })
    return
  }
  trace('Cache', 'SET', { key, backend: 'redis', ttl: ttlSeconds, bytes: payload.length })
}
