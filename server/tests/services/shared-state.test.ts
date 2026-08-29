import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import IORedis from 'ioredis'

/**
 * Covers the Redis-backed shared stores (R1, R2, R3) and, critically, their
 * fallback behaviour (RI1, RI3).
 *
 * Every test loads the store modules through `vi.resetModules()` + dynamic
 * import, because `utils/redis.ts` reads REDIS_URL once at module scope. That is
 * also what makes the restart test below meaningful: a fresh module graph has an
 * empty NodeCache, exactly like a freshly spun-up Render instance.
 */

const TEST_REDIS_URL = process.env.TEST_REDIS_URL || 'redis://localhost:6379'

async function loadStores(redisUrl: string | undefined) {
  vi.resetModules()
  if (redisUrl) process.env.REDIS_URL = redisUrl
  else delete process.env.REDIS_URL
  return {
    otp: await import('../../src/utils/otp.store'),
    cache: await import('../../src/utils/response.cache'),
    redis: await import('../../src/utils/redis'),
  }
}

const originalRedisUrl = process.env.REDIS_URL
let probe: IORedis

beforeEach(async () => {
  probe = new IORedis(TEST_REDIS_URL, { maxRetriesPerRequest: 1, lazyConnect: true })
  await probe.connect()
  await probe.flushdb()
})

afterEach(async () => {
  await probe.quit().catch(() => undefined)
  if (originalRedisUrl === undefined) delete process.env.REDIS_URL
  else process.env.REDIS_URL = originalRedisUrl
  vi.resetModules()
})

describe('OTP store (R1)', () => {
  it('round-trips an OTP through Redis', async () => {
    const { otp } = await loadStores(TEST_REDIS_URL)
    await otp.setOtp('a@example.com', '123456')
    expect(await otp.getOtp('a@example.com')).toBe('123456')
  })

  it('survives a process restart — the bug this change exists to fix', async () => {
    const first = await loadStores(TEST_REDIS_URL)
    await first.otp.setOtp('restart@example.com', '654321')

    // A brand-new module graph: new NodeCache, nothing in process memory.
    // This is a Render instance waking from spin-down.
    const second = await loadStores(TEST_REDIS_URL)
    expect(await second.otp.getOtp('restart@example.com')).toBe('654321')
  })

  it('is discarded across a restart when Redis is absent — documents the old behaviour', async () => {
    const first = await loadStores(undefined)
    await first.otp.setOtp('nored@example.com', '111111')
    expect(await first.otp.getOtp('nored@example.com')).toBe('111111')

    const second = await loadStores(undefined)
    expect(await second.otp.getOtp('nored@example.com')).toBeNull()
  })

  it('clears both backends on delete', async () => {
    const { otp } = await loadStores(TEST_REDIS_URL)
    await otp.setOtp('del@example.com', '999999')
    await otp.delOtp('del@example.com')
    expect(await otp.getOtp('del@example.com')).toBeNull()
    expect(await probe.get('pwd_reset_del@example.com')).toBeNull()
  })

  it('sets a TTL rather than persisting forever', async () => {
    const { otp } = await loadStores(TEST_REDIS_URL)
    await otp.setOtp('ttl@example.com', '222222')
    const ttl = await probe.ttl('pwd_reset_ttl@example.com')
    expect(ttl).toBeGreaterThan(0)
    expect(ttl).toBeLessThanOrEqual(600)
  })

  it('falls back to memory when Redis is unreachable mid-flight (RI3)', async () => {
    // Port 1 is reserved and refuses connections — a stand-in for an outage.
    const { otp } = await loadStores('redis://127.0.0.1:1')
    await otp.setOtp('down@example.com', '333333')
    // Dual-write means the memory copy still answers.
    expect(await otp.getOtp('down@example.com')).toBe('333333')
  })
})

describe('Response cache (R3)', () => {
  it('round-trips a JSON payload through Redis', async () => {
    const { cache } = await loadStores(TEST_REDIS_URL)
    const payload = { success: true, data: [{ id: 'p1', price: 100 }] }
    await cache.cacheSet('products:test', payload)
    expect(await cache.cacheGet('products:test')).toEqual(payload)
  })

  it('is shared across instances', async () => {
    const first = await loadStores(TEST_REDIS_URL)
    await first.cache.cacheSet('categories:all', { data: ['x'] })
    const second = await loadStores(TEST_REDIS_URL)
    expect(await second.cache.cacheGet('categories:all')).toEqual({ data: ['x'] })
  })

  it('returns undefined on a miss', async () => {
    const { cache } = await loadStores(TEST_REDIS_URL)
    expect(await cache.cacheGet('nothing:here')).toBeUndefined()
  })

  it('treats a corrupt entry as a miss rather than throwing', async () => {
    const { cache } = await loadStores(TEST_REDIS_URL)
    await probe.set('corrupt:key', '{not-json')
    expect(await cache.cacheGet('corrupt:key')).toBeUndefined()
  })

  it('falls back to memory when Redis is unreachable (RI1, RI3)', async () => {
    const { cache } = await loadStores('redis://127.0.0.1:1')
    await cache.cacheSet('offline:key', { ok: true })
    expect(await cache.cacheGet('offline:key')).toEqual({ ok: true })
  })

  it('expires entries', async () => {
    const { cache } = await loadStores(TEST_REDIS_URL)
    await cache.cacheSet('ttl:key', { a: 1 })
    const ttl = await probe.ttl('ttl:key')
    expect(ttl).toBeGreaterThan(0)
    expect(ttl).toBeLessThanOrEqual(60)
  })
})

describe('Rate limit store (R2)', () => {
  async function loadStore(redisUrl: string | undefined, prefix: string) {
    vi.resetModules()
    if (redisUrl) process.env.REDIS_URL = redisUrl
    else delete process.env.REDIS_URL
    const { FailOpenRedisStore } = await import('../../src/utils/rate-limit.store')
    const store = new FailOpenRedisStore(prefix)
    store.init({ windowMs: 60_000 } as never)
    return store
  }

  it('counts hits in Redis and shares them across instances', async () => {
    const a = await loadStore(TEST_REDIS_URL, 'rl:test:')
    expect((await a.increment('1.2.3.4')).totalHits).toBe(1)

    const b = await loadStore(TEST_REDIS_URL, 'rl:test:')
    // A second instance sees the first instance's count — the point of R2.
    expect((await b.increment('1.2.3.4')).totalHits).toBe(2)
  })

  it('counts per key', async () => {
    const store = await loadStore(TEST_REDIS_URL, 'rl:perkey:')
    await store.increment('ip-a')
    await store.increment('ip-a')
    expect((await store.increment('ip-b')).totalHits).toBe(1)
  })

  it('resets a key', async () => {
    const store = await loadStore(TEST_REDIS_URL, 'rl:reset:')
    await store.increment('ip-c')
    await store.resetKey('ip-c')
    expect((await store.increment('ip-c')).totalHits).toBe(1)
  })

  it('fails OPEN to per-instance counting when Redis is down (Q1, RI3)', async () => {
    const store = await loadStore('redis://127.0.0.1:1', 'rl:down:')
    // Must not throw — a Redis outage may not become an API outage.
    // totalHits is read inline on purpose: express-rate-limit's MemoryStore
    // returns a live reference to its internal record, so holding the result
    // object and reading it later would show the post-increment value.
    expect((await store.increment('1.2.3.4')).totalHits).toBe(1)
    expect((await store.increment('1.2.3.4')).totalHits).toBe(2)
  })

  it('counts in memory when REDIS_URL is unset (RI1)', async () => {
    const store = await loadStore(undefined, 'rl:none:')
    expect((await store.increment('x')).totalHits).toBe(1)
    expect((await store.increment('x')).totalHits).toBe(2)
  })
})

describe('OTP store — recovery edge case (review finding V1)', () => {
  it('still verifies a code written during an outage after Redis recovers', async () => {
    // Written while Redis was unreachable: memory only.
    const { otp } = await loadStores('redis://127.0.0.1:1')
    await otp.setOtp('recover@example.com', '444444')

    // Redis is now reachable and legitimately has no such key. The user's code
    // must still verify — it was never invalid, just never persisted.
    process.env.REDIS_URL = TEST_REDIS_URL
    expect(await otp.getOtp('recover@example.com')).toBe('444444')
  })
})

describe('Upstash target reporting', () => {
  async function describe_(url: string | undefined) {
    vi.resetModules()
    if (url) process.env.REDIS_URL = url
    else delete process.env.REDIS_URL
    const { describeRedisTarget } = await import('../../src/utils/redis')
    return describeRedisTarget()
  }

  it('recognises an Upstash TLS endpoint', async () => {
    expect(await describe_('rediss://default:tok@apn1-fake-12345.upstash.io:6379')).toEqual({
      host: 'apn1-fake-12345.upstash.io',
      tls: true,
      upstash: true,
    })
  })

  it('flags a plaintext URL — Upstash requires TLS', async () => {
    const t = await describe_('redis://default:tok@apn1-fake-12345.upstash.io:6379')
    expect(t?.tls).toBe(false)
    expect(t?.upstash).toBe(true)
  })

  it('flags a non-Upstash host', async () => {
    const t = await describe_('redis://localhost:6379')
    expect(t?.upstash).toBe(false)
  })

  it('never exposes credentials — host only', async () => {
    const t = await describe_('rediss://default:supersecrettoken@apn1-fake-12345.upstash.io:6379')
    expect(JSON.stringify(t)).not.toContain('supersecrettoken')
  })

  it('returns null when unset, and does not throw on a malformed URL', async () => {
    expect(await describe_(undefined)).toBeNull()
    expect(await describe_('not a url')).toBeNull()
  })
})

describe('Malformed REDIS_URL must not crash boot (P1-1)', () => {
  it('importing the store module survives an unparseable URL', async () => {
    vi.resetModules()
    process.env.REDIS_URL = 'not a url'
    const mod = await import('../../src/utils/redis')
    expect(mod.redis).toBeUndefined()
    expect(mod.describeRedisTarget()).toBeNull()
  })

  it('stores still work, on memory, with an unparseable URL', async () => {
    vi.resetModules()
    process.env.REDIS_URL = 'not a url'
    const { setOtp, getOtp } = await import('../../src/utils/otp.store')
    await setOtp('broken@example.com', '555555')
    expect(await getOtp('broken@example.com')).toBe('555555')
  })

  it('disables the queue rather than throwing', async () => {
    vi.resetModules()
    process.env.REDIS_URL = 'not a url'
    const q = await import('../../src/queues/index')
    expect(q.connection).toBeUndefined()
    expect(q.isQueueEnabled).toBe(false)
  })
})
