/**
 * Opt-in instrumentation for the Redis-backed stores and the BullMQ queue.
 *
 * Gated behind QUEUE_CACHE_DEBUG rather than always-on: the response cache and
 * rate limiter run on EVERY request, so unconditional logging would bury the
 * rest of the log and cost real money in a hosted log drain. Off by default;
 * set QUEUE_CACHE_DEBUG=true to trace behaviour and accuracy.
 */

export const isQueueCacheDebugEnabled = process.env.QUEUE_CACHE_DEBUG === 'true'

type Fields = Record<string, unknown>

function render(fields?: Fields): string {
  if (!fields) return ''
  return ' ' + Object.entries(fields)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`)
    .join(' ')
}

/** Never throws — instrumentation must not be able to break the path it observes. */
export function trace(scope: string, event: string, fields?: Fields): void {
  if (!isQueueCacheDebugEnabled) return
  try {
    console.log(`[${scope}] ${event}${render(fields)}`)
  } catch {
    /* ignore */
  }
}

/**
 * Time an operation and trace the outcome. Returns the operation's result
 * untouched, so it can wrap a call site without changing its behaviour.
 */
export async function traced<T>(
  scope: string,
  event: string,
  fn: () => Promise<T>,
  describe?: (result: T) => Fields
): Promise<T> {
  if (!isQueueCacheDebugEnabled) return fn()
  const started = Date.now()
  try {
    const result = await fn()
    trace(scope, event, { ms: Date.now() - started, ...describe?.(result) })
    return result
  } catch (err) {
    trace(scope, `${event} THREW`, { ms: Date.now() - started, error: (err as Error)?.message })
    throw err
  }
}
