// Shared by the test harness (tests/helpers/test-db-url.ts) and the db:reset
// preflight (scripts/guard-local-db.ts). Both stand in front of operations
// that destroy every row in whatever DATABASE_URL names, so both ask the same
// question: is this a database we can afford to lose?
//
// A name is a claim about intent; a host is a fact about blast radius. The
// test harness once guarded on name alone — it required the database to be
// called `*_test` — and a production cluster whose database was named `test`
// derived `test_test`, passed, and was reset. Hence: host, always.

export const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])

// Never accepts a URL it cannot parse: an unparseable connection string is not
// evidence of safety.
export function isLocalDatabaseHost(url: string): boolean {
  try {
    return LOCAL_HOSTS.has(new URL(url).hostname.toLowerCase())
  } catch {
    return false
  }
}

// Callers put this in error messages. Returned separately from the URL itself,
// which carries credentials and must never be logged or thrown.
export function databaseHostFor(url: string): string {
  try {
    return new URL(url).hostname || '<unparseable>'
  } catch {
    return '<unparseable>'
  }
}
