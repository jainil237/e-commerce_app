import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resolveTestDatabaseUrl } from './test-db-url'

// This guard is the only thing standing between `npm test` and a real
// database: global-setup runs `prisma db push --force-reset` against whatever
// it returns. It has failed open once already — a production cluster whose
// derived name ended in "_test" was accepted and reset — so the remote-host
// cases below are the point of this file, not an afterthought.

const saved = { db: process.env.DATABASE_URL, test: process.env.TEST_DATABASE_URL }

beforeEach(() => {
  delete process.env.DATABASE_URL
  delete process.env.TEST_DATABASE_URL
})

afterEach(() => {
  process.env.DATABASE_URL = saved.db
  process.env.TEST_DATABASE_URL = saved.test
})

describe('resolveTestDatabaseUrl — remote hosts', () => {
  it('refuses a remote DATABASE_URL even when the derived name ends in _test', () => {
    // The exact shape that cost a production database: derive "test" -> "test_test",
    // which satisfies the name rule while still pointing at the managed cluster.
    process.env.DATABASE_URL = 'mysql://u:p@gateway01.ap-southeast-1.prod.aws.tidbcloud.com:4000/test'
    expect(() => resolveTestDatabaseUrl()).toThrow(/Refusing to run destructive tests against host/)
  })

  it('refuses an explicit remote TEST_DATABASE_URL', () => {
    process.env.TEST_DATABASE_URL = 'mysql://u:p@db.example.com:3306/anything_test'
    expect(() => resolveTestDatabaseUrl()).toThrow(/Refusing to run destructive tests against host/)
  })

  it('never puts credentials in the error it throws', () => {
    process.env.DATABASE_URL = 'mysql://root:hunter2@db.example.com:3306/test'
    expect(() => resolveTestDatabaseUrl()).toThrow(/db\.example\.com/)
    expect(() => resolveTestDatabaseUrl()).not.toThrow(/hunter2/)
  })
})

describe('resolveTestDatabaseUrl — local hosts', () => {
  it('derives a _test schema from a local DATABASE_URL', () => {
    process.env.DATABASE_URL = 'mysql://root:pw@localhost:3306/ecom'
    expect(resolveTestDatabaseUrl()).toContain('/ecom_test')
  })

  it('accepts 127.0.0.1 and an explicit local TEST_DATABASE_URL', () => {
    process.env.TEST_DATABASE_URL = 'mysql://root:pw@127.0.0.1:3306/ecom_test'
    expect(resolveTestDatabaseUrl()).toContain('/ecom_test')
  })

  it('still refuses a local database whose name does not end in _test', () => {
    process.env.TEST_DATABASE_URL = 'mysql://root:pw@localhost:3306/production'
    expect(() => resolveTestDatabaseUrl()).toThrow(/must end with "_test"/)
  })

  it('refuses when neither variable is set', () => {
    expect(() => resolveTestDatabaseUrl()).toThrow(/Neither TEST_DATABASE_URL nor DATABASE_URL/)
  })
})
