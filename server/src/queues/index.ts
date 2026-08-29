import { Queue, JobsOptions } from 'bullmq'
import IORedis from 'ioredis'
import { trace } from '../utils/observability'

/**
 * Queue layer — BullMQ over Redis (Upstash in production).
 *
 * Everything here degrades to a no-op when REDIS_URL is unset. That keeps
 * local dev and the test suite runnable without a Redis instance, and means a
 * missing REDIS_URL slows delivery down to synchronous-equivalent rather than
 * dropping work on the floor: callers fall back to doing the work inline.
 */

export const JOB_QUEUE_NAME = 'ecom-jobs'

const redisUrl = process.env.REDIS_URL

// BullMQ requires maxRetriesPerRequest: null on the connection it uses for
// blocking commands, otherwise ioredis aborts long blocking reads.
// Constructed defensively for the same reason as utils/redis.ts: IORedis throws
// synchronously on a malformed URL, and this module is imported by index.ts. A
// typo'd REDIS_URL must disable the queue (jobs then run inline), not crash boot.
function createQueueConnection(connectionUrl: string): IORedis | undefined {
  try {
    return new IORedis(connectionUrl, { maxRetriesPerRequest: null })
  } catch (err) {
    console.error(
      '❌ REDIS_URL is not a valid Redis connection string — queue disabled, jobs ' +
      'will run inline. Error:',
      (err as Error)?.message ?? err
    )
    return undefined
  }
}

export const connection = redisUrl ? createQueueConnection(redisUrl) : undefined

// Derived from the client, not the raw env var: a malformed REDIS_URL leaves the
// variable set but the connection undefined, and that must read as "no queue".
export const isQueueEnabled = Boolean(connection)

/**
 * Default job options.
 *
 * `attempts` + exponential backoff cover the transient failures these jobs
 * actually hit — SMTP hiccups, R2 blips, Razorpay timeouts. Completed and
 * failed jobs are trimmed so an idle free-tier Redis does not fill with
 * history: Upstash bills per command and caps stored data.
 */
export const defaultJobOptions: JobsOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5_000 },
  removeOnComplete: { count: 100 },
  removeOnFail: { count: 500 },
}

export const jobQueue = connection
  ? new Queue(JOB_QUEUE_NAME, { connection, defaultJobOptions })
  : undefined

/**
 * Enqueue a job, or return false when no queue is configured so the caller can
 * fall back to inline execution.
 */
export async function enqueue<T>(name: string, data: T, opts?: JobsOptions): Promise<boolean> {
  if (!jobQueue) {
    trace('Queue', 'ENQUEUE SKIPPED', { job: name, reason: 'no-queue-configured', fallback: 'inline' })
    return false
  }
  try {
    const started = Date.now()
    const job = await jobQueue.add(name, data, opts)
    trace('Queue', 'ENQUEUED', { job: name, jobId: job.id, ms: Date.now() - started })
    return true
  } catch (err) {
    // Never let a queue outage break the request that triggered it — the
    // caller's inline fallback is strictly better than a 500 here.
    console.error(`[Queue] enqueue "${name}" failed, caller will run inline:`, err)
    trace('Queue', 'ENQUEUE FAILED', { job: name, error: (err as Error)?.message, fallback: 'inline' })
    return false
  }
}

/**
 * Fire-and-forget variant: enqueue, or run `fallback` inline if there is no
 * queue — without making the caller wait for either.
 *
 * For notification sites that were already non-blocking before the queue
 * existed. Awaiting `enqueue` there would regress them: a slow or unreachable
 * Redis would hold the HTTP response open until ioredis gave up, on a path
 * that previously never waited at all.
 *
 * Never throws — a failed notification must not fail the request that
 * triggered it.
 */
export function enqueueOrRun<T>(
  name: string,
  data: T,
  fallback: () => Promise<unknown>,
  opts?: JobsOptions
): void {
  void (async () => {
    if (await enqueue(name, data, opts)) return
    trace('Queue', 'INLINE FALLBACK', { job: name })
    await fallback()
  })().catch((err) => {
    console.error(`[Queue] "${name}" failed inline after enqueue fell through:`, err)
  })
}

export async function closeQueue() {
  await jobQueue?.close()
  await connection?.quit()
}
