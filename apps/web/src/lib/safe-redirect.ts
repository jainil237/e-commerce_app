/**
 * Constrain a user-supplied `redirect` param to a same-origin path.
 *
 * `//evil.com` is protocol-relative and is a fully absolute URL to the browser,
 * so a bare `startsWith('/')` check is not enough. Backslashes are rejected too
 * because some browsers normalise `/\evil.com` into a protocol-relative URL.
 */
export function safeRedirect(raw: string | null, fallback = '/account'): string {
  if (!raw) return fallback
  if (!raw.startsWith('/')) return fallback
  if (raw.startsWith('//') || raw.startsWith('/\\')) return fallback
  return raw
}
