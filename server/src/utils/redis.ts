import IORedis from 'ioredis'

/**
 * Shared Redis client for request-path state: rate-limit counters, password-reset
 * OTPs, and product/category response caches.
 *
 * Deliberately NOT the client exported by queues/index.ts. That one is built with
 * `maxRetriesPerRequest: null`, which BullMQ requires for its blocking reads and
 * which is exactly wrong here: an ordinary command would retry forever instead of
 * failing, so a Redis outage would hang request handlers rather than letting them
 * fall back. Both clients talk to the same Upstash database; only the options differ.
 *
 * Everything degrades to in-process memory when REDIS_URL is unset or Redis is
 * unreachable — see docs/deployment.md. That contract is why REDIS_URL stays
 * [OPTIONAL] in .env.example.
 */

const url = process.env.REDIS_URL

export const isRedisEnabled = Boolean(url)

export const redis = url
  ? new IORedis(url, {
      // Fail fast so the caller's memory fallback takes over. BullMQ's `null`
      // would retry forever and hold the request open.
      maxRetriesPerRequest: 1,
      // Bounds how long a command may wait, whether it is queued during the
      // initial connect or stuck against a dead server. This is what makes the
      // fallback timely.
      //
      // enableOfflineQueue is deliberately left at its default (true). Setting it
      // false rejects any command issued before the connection is established —
      // which includes the very first request after boot, and every request
      // during a reconnect — so the store would silently fall back to memory at
      // exactly the moments it matters. commandTimeout gives the fail-fast
      // behaviour without that hole.
      commandTimeout: 1_000,
      connectTimeout: 3_000,
    })
  : undefined

// An ioredis client with no 'error' listener throws on connection failure and
// takes the process down. A Redis outage must cost degraded behaviour, not the API.
const seen = new Set<string>()

function logOnce(context: string, err: unknown) {
  // Redis outages produce one error per command; logging each would bury the
  // rest of the log. One line per failure kind is enough to diagnose.
  const key = `${context}:${(err as Error)?.message ?? String(err)}`
  if (seen.has(key)) return
  seen.add(key)
  console.error(`[Redis] ${context} failed, falling back to memory:`, (err as Error)?.message ?? err)
}

redis?.on('error', (err) => logOnce('connection', err))

export type RedisAttempt<T> = { ok: true; value: T } | { ok: false }

/**
 * Run one Redis operation, or report failure so the caller can fall back.
 *
 * Every store in this codebase goes through here, so the "REDIS_URL unset" path
 * and the "Redis is down" path are the same code and cannot drift apart.
 * Never throws.
 */
export async function tryRedis<T>(
  context: string,
  op: (client: IORedis) => Promise<T>
): Promise<RedisAttempt<T>> {
  if (!redis) return { ok: false }
  try {
    return { ok: true, value: await op(redis) }
  } catch (err) {
    logOnce(context, err)
    return { ok: false }
  }
}

export async function closeRedis() {
  await redis?.quit().catch(() => undefined)
}
