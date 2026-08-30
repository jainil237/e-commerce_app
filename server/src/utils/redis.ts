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

/**
 * Every Redis key this app writes is namespaced by environment.
 *
 * Without this, any machine pointed at the same REDIS_URL shares one keyspace.
 * That is not hypothetical: during testing a local server run with a LOCAL
 * database but the production REDIS_URL wrote local rows into the production
 * response cache, which was then served to API clients as if it were real data
 * — while the production database was empty. The same collision applies to
 * rate-limit counters and, worst of all, the BullMQ queue: a developer's worker
 * will happily consume and fail production jobs.
 */
export const REDIS_NAMESPACE = process.env.NODE_ENV || 'development'

/** Prefix a key with the current environment. */
export const nsKey = (key: string) => `${REDIS_NAMESPACE}:${key}`

const url = process.env.REDIS_URL

export const isRedisEnabled = Boolean(url)

/**
 * Construct the client without letting a bad value take the process down.
 *
 * `new IORedis(url)` throws synchronously on a malformed connection string, and
 * this module is imported by index.ts — so a typo in REDIS_URL, or the Upstash
 * REST URL pasted where the rediss:// TCP string belongs (the mistake
 * docs/deployment.md §2 explicitly warns about), would crash the server at boot.
 * Redis is a degraded-mode dependency here, not a boot dependency (P1-1), so a
 * bad value must fall back to memory with a loud line, not kill the deploy.
 */
function createClient(connectionUrl: string): IORedis | undefined {
  try {
    return new IORedis(connectionUrl, {
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
  } catch (err) {
    console.error(
      '❌ REDIS_URL is not a valid Redis connection string — falling back to ' +
      'in-process memory for rate limits, OTPs, and cache. Use the rediss:// TCP ' +
      'string from the Upstash console, not the REST URL. Error:',
      (err as Error)?.message ?? err
    )
    return undefined
  }
}

export const redis = url ? createClient(url) : undefined

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

/**
 * Describe the configured Redis endpoint, without its credentials.
 *
 * Upstash requires TLS. A plaintext `redis://` URL pointed at Upstash simply
 * fails to connect — and because every store here falls back to in-process
 * memory, that failure is SILENT: the app keeps serving with per-instance state,
 * the OTP spin-down bug comes back, rate limits stop being shared, and nothing
 * in the logs says why. This makes the target visible at startup instead.
 *
 * Returns null when REDIS_URL is unset (a supported configuration) or unparseable.
 */
export function describeRedisTarget(): { host: string; tls: boolean; upstash: boolean } | null {
  if (!url) return null
  try {
    const parsed = new URL(url)
    return {
      host: parsed.hostname,
      tls: parsed.protocol === 'rediss:',
      upstash: parsed.hostname.endsWith('.upstash.io'),
    }
  } catch {
    return null
  }
}

/**
 * Log the Redis target at boot, and warn on configurations that will not work.
 *
 * Never throws and never exits: Redis is a degraded-mode dependency here, not a
 * boot dependency (the P1-1 decision), so a bad value must produce a loud line,
 * not a dead service.
 */
export function reportRedisTarget(): void {
  if (!url) {
    console.log('🔴 Redis: not configured — rate limits, OTPs, and cache use in-process memory')
    return
  }

  const target = describeRedisTarget()

  // Set but not a parseable URL. ioredis does not necessarily throw on these —
  // it may treat the value as a bare hostname and fail later at DNS — so this is
  // distinct from "not configured" and must not be reported as such.
  if (!target) {
    console.warn(
      '⚠️  Redis: REDIS_URL is set but is not a valid connection URL. Expected ' +
      'rediss://<user>:<password>@<host>.upstash.io:6379 — the TCP string from the ' +
      'Upstash console, not the REST URL. Connection will fail and every store ' +
      'will fall back to in-process memory.'
    )
    return
  }

  const label = target.upstash ? 'Upstash' : 'non-Upstash'
  console.log(`🔴 Redis: ${target.host} (${label}, ${target.tls ? 'TLS' : 'PLAINTEXT'})`)

  // Upstash refuses plaintext, so this combination cannot work. Scoped to Upstash
  // hosts on purpose: a plaintext localhost is the normal local-dev setup and
  // warning about it would train people to ignore this line.
  if (target.upstash && !target.tls) {
    console.warn(
      '⚠️  REDIS_URL points at Upstash over plaintext redis://. Upstash requires ' +
      'TLS — use the rediss:// TCP connection string. Every store will fall back ' +
      'to in-process memory.'
    )
  }

  if (process.env.NODE_ENV === 'production') {
    if (!target.tls) {
      console.warn('⚠️  REDIS_URL is plaintext in production — credentials and data are unencrypted in transit.')
    }
    if (!target.upstash) {
      console.warn(
        `⚠️  REDIS_URL points at ${target.host}, not *.upstash.io. This deployment is ` +
        'documented to run on Upstash (docs/deployment.md §2); verify this is intentional.'
      )
    }
  }
}

export async function closeRedis() {
  await redis?.quit().catch(() => undefined)
}
