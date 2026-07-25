// Derives the test database URL from TEST_DATABASE_URL if set, otherwise from
// DATABASE_URL with `_test` appended to the database name. Never logs the
// resulting URL (it carries credentials) — callers get the string only.
export function resolveTestDatabaseUrl(): string {
  const explicit = process.env.TEST_DATABASE_URL
  if (explicit) {
    assertTestSuffix(explicit)
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
  assertTestSuffix(derived)
  return derived
}

// Guards every destructive operation in global-setup — this must never be able
// to point at a non-test schema, regardless of how the URL was resolved.
function assertTestSuffix(url: string) {
  const dbName = new URL(url).pathname.replace(/^\//, '')
  if (!dbName.endsWith('_test')) {
    throw new Error(`Refusing to use "${dbName}" as a test database — name must end with "_test".`)
  }
}
