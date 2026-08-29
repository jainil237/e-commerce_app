import NodeCache from 'node-cache'
import { tryRedis, nsKey } from './redis'

/**
 * Password-reset OTP storage.
 *
 * Previously a bare in-process NodeCache. On Render's free tier the web service
 * spins down after ~15 minutes idle while the OTP TTL is 10 minutes, and a
 * password-reset request is often the only traffic on an idle store — so the
 * sequence "request OTP → open email → return" routinely crossed a spin-down and
 * the user got INVALID_OTP for a code that had not expired.
 */

export const OTP_TTL_SECONDS = 600

// Retained as the fallback, so an unset REDIS_URL or a Redis outage behaves
// exactly as this code did before Redis existed — never worse than the status quo.
const memory = new NodeCache({ stdTTL: OTP_TTL_SECONDS })

const key = (email: string) => nsKey(`pwd_reset_${email}`)

/**
 * Written to BOTH backends on purpose. Password resets are far too low-volume for
 * the extra command to matter against the Upstash budget, and dual-writing means a
 * Redis outage occurring between set and verify still resolves on the same
 * instance instead of stranding the user mid-flow.
 */
export async function setOtp(email: string, otp: string): Promise<void> {
  await tryRedis('otp.set', (c) => c.setex(key(email), OTP_TTL_SECONDS, otp))
  memory.set(key(email), otp)
}

/**
 * Returns null when absent or expired.
 *
 * Checks memory even on a successful Redis read that came back empty. Because
 * setOtp dual-writes, a code created while Redis was unreachable exists only in
 * memory; if Redis then recovers before the user submits it, treating the empty
 * Redis read as authoritative would reject a code this process is still holding.
 * That is the exact mid-flow outage the dual-write exists to survive.
 */
export async function getOtp(email: string): Promise<string | null> {
  const attempt = await tryRedis('otp.get', (c) => c.get(key(email)))
  if (attempt.ok && attempt.value !== null) return attempt.value
  return memory.get<string>(key(email)) ?? null
}

/** Clears both backends — a code invalidated in one must not survive in the other. */
export async function delOtp(email: string): Promise<void> {
  await tryRedis('otp.del', (c) => c.del(key(email)))
  memory.del(key(email))
}
