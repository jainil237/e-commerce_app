// Derives the test database URL from TEST_DATABASE_URL if set, otherwise from
// DATABASE_URL with `_test` appended to the database name. Never logs the
// resulting URL (it carries credentials) — callers get the string only.
//
// Deriving from DATABASE_URL is a convenience for a local-only setup, not a
// licence to follow it anywhere: if DATABASE_URL points at a remote host, the
// derived URL is rejected rather than used. Set TEST_DATABASE_URL to a local
// MySQL when DATABASE_URL has to point somewhere real.
export function resolveTestDatabaseUrl(): string {
  const explicit = process.env.TEST_DATABASE_URL
  if (explicit) {
    assertSafeTestDatabase(explicit)
    return explicit
  }

  const base = process.env.DATABASE_URL
  if (!base) {
    throw new Error('Neither TEST_DATABASE_URL nor DATABASE_URL is set — cannot resolve a test database.')
  }

  const url = new URL(base)
  const dbName = url.pathname.replace(/^\//, '')
  if (!dbName) {
    throw new Error('DATABASE_URL has no database name — cannot derive a test database name.')
  }
  url.pathname = `/${dbName}_test`
  const derived = url.toString()
  assertSafeTestDatabase(derived)
  return derived
}

// Guards every destructive operation in global-setup — global-setup runs
// `prisma db push --force-reset --accept-data-loss`, and every suite's
// beforeEach runs deleteMany() across every table, so whatever this function
// returns WILL be emptied.
//
// The name check alone is not enough, and that gap has already cost a
// production database: server/.env pointed at the managed production cluster,
// the derived name ended in "_test" so this guard passed, and the suite
// reset data on the production host anyway. A name is a claim about intent;
// a host is a fact about blast radius. Both have to hold.
function assertSafeTestDatabase(url: string) {
  const parsed = new URL(url)
  const dbName = parsed.pathname.replace(/^\//, '')

  if (!dbName.endsWith('_test')) {
    throw new Error(`Refusing to use "${dbName}" as a test database — name must end with "_test".`)
  }

  // Hostname only — never interpolate the URL itself into an error, it carries
  // credentials.
  if (!LOCAL_HOSTS.has(parsed.hostname.toLowerCase())) {
    throw new Error(
      `Refusing to run destructive tests against host "${parsed.hostname}" — ` +
        'the suite resets the whole schema, so it only runs on a local database. ' +
        'Point TEST_DATABASE_URL at a local MySQL (its name must still end with "_test").'
    )
  }
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])
