import { MemoryStore, type ClientRateLimitInfo, type Options, type Store } from 'express-rate-limit'
import { redis } from './redis'

/**
 * A rate-limit store backed by Redis, falling back to the in-process MemoryStore.
 *
 * Why this exists rather than handing a store to rateLimit() directly:
 *
 *  1. REDIS_URL is optional (docs/deployment.md §2), so the server must work with
 *     and without it from one configuration.
 *  2. express-rate-limit has no store-error handling. An unguarded store turns a
 *     Redis outage into a 500 on every API call — a degraded dependency becoming
 *     a full outage, contradicting the P1-1 decision already made in this repo.
 *
 * On failure the limiter FAILS OPEN to memory: enforcement reverts to per-instance
 * counting, exactly how this repo behaved before Redis. Fail-closed was rejected —
 * locking users out of a working store because a cache is unreachable is worse.
 *
 * ── Why not rate-limit-redis ──
 * It was the original choice (plan D3) for its single-EVAL Lua script, but it
 * issues SCRIPT LOAD from its own constructor and caches the resulting SHA as a
 * promise. If Redis is unreachable at construction that promise rejects, is never
 * awaited (unhandled rejection), and stays rejected — so a transient blip at boot
 * would permanently disable shared counting for the life of the process, silently
 * defeating the whole point of the change.
 *
 * ioredis' defineCommand does the same job in one command and manages
 * EVALSHA/NOSCRIPT reloading itself, with no eager work and no cached failure.
 */

// INCR, set the window on first hit only, and report the remaining TTL — in a
// single round trip, because the general limiter runs on every API request and
// Upstash's free tier is command-metered. A naive INCR + PTTL + PEXPIRE would
// triple the cost of the highest-volume path in the app.
const INCREMENT_LUA = `
local hits = redis.call('INCR', KEYS[1])
if hits == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
return {hits, redis.call('PTTL', KEYS[1])}
`

interface RateLimitCommands {
  rateLimitIncrement(key: string, windowMs: string): Promise<[number, number]>
}

let defined = false

function client(): (NonNullable<typeof redis> & RateLimitCommands) | undefined {
  if (!redis) return undefined
  if (!defined) {
    redis.defineCommand('rateLimitIncrement', { numberOfKeys: 1, lua: INCREMENT_LUA })
    defined = true
  }
  return redis as NonNullable<typeof redis> & RateLimitCommands
}

export class FailOpenRedisStore implements Store {
  private readonly memory = new MemoryStore()
  private windowMs = 60_000
  private warned = false

  // False when Redis is configured: counters are shared, so express-rate-limit's
  // double-count detection must not treat this as a per-instance store.
  localKeys = false

  constructor(private readonly keyPrefix: string) {
    if (!redis) this.localKeys = true
  }

  init(options: Options): void {
    this.windowMs = options.windowMs
    this.memory.init(options)
  }

  private fallback(err: unknown): void {
    if (this.warned) return
    this.warned = true
    console.error(
      `[RateLimit] Redis store "${this.keyPrefix}" failed, failing open to per-instance counting:`,
      (err as Error)?.message ?? err
    )
  }

  async increment(key: string): Promise<ClientRateLimitInfo> {
    const c = client()
    if (c) {
      try {
        const [totalHits, pttl] = await c.rateLimitIncrement(this.keyPrefix + key, String(this.windowMs))
        return {
          totalHits,
          // PTTL returns -1 for a key with no expiry; fall back to a full window
          // rather than reporting a reset time in the past.
          resetTime: new Date(Date.now() + (pttl >= 0 ? pttl : this.windowMs)),
        }
      } catch (err) {
        this.fallback(err)
      }
    }
    return this.memory.increment(key)
  }

  async decrement(key: string): Promise<void> {
    const c = client()
    if (c) {
      try {
        await c.decr(this.keyPrefix + key)
        return
      } catch (err) {
        this.fallback(err)
      }
    }
    await this.memory.decrement(key)
  }

  async resetKey(key: string): Promise<void> {
    const c = client()
    if (c) {
      try {
        await c.del(this.keyPrefix + key)
        return
      } catch (err) {
        this.fallback(err)
      }
    }
    await this.memory.resetKey(key)
  }
}
