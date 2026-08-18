import { Queue, JobsOptions } from 'bullmq'
import IORedis from 'ioredis'

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

export const isQueueEnabled = Boolean(redisUrl)

// BullMQ requires maxRetriesPerRequest: null on the connection it uses for
// blocking commands, otherwise ioredis aborts long blocking reads.
export const connection = redisUrl
  ? new IORedis(redisUrl, { maxRetriesPerRequest: null })
  : undefined

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
  if (!jobQueue) return false
  try {
    await jobQueue.add(name, data, opts)
    return true
  } catch (err) {
    // Never let a queue outage break the request that triggered it — the
    // caller's inline fallback is strictly better than a 500 here.
    console.error(`[Queue] enqueue "${name}" failed, caller will run inline:`, err)
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
    await fallback()
  })().catch((err) => {
    console.error(`[Queue] "${name}" failed inline after enqueue fell through:`, err)
  })
}

export async function closeQueue() {
  await jobQueue?.close()
  await connection?.quit()
}
