import { afterEach, describe, expect, it } from 'vitest'
import { assertRequiredPaymentEnv, isPaymentsMockMode } from '../../src/config/payments'

// Snapshot/restore so these tests can freely mutate NODE_ENV and the
// Razorpay vars without leaking state into the rest of the suite (which
// runs with NODE_ENV=test, PAYMENTS_MOCK=true by default — see tests/setup.ts).
const SNAPSHOT_KEYS = ['NODE_ENV', 'PAYMENTS_MOCK', 'RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET'] as const
let snapshot: Record<string, string | undefined>

function snapshotEnv() {
  snapshot = Object.fromEntries(SNAPSHOT_KEYS.map((k) => [k, process.env[k]]))
}

function restoreEnv() {
  for (const key of SNAPSHOT_KEYS) {
    if (snapshot[key] === undefined) delete process.env[key]
    else process.env[key] = snapshot[key]
  }
}

describe('isPaymentsMockMode', () => {
  afterEach(restoreEnv)

  it('is false when PAYMENTS_MOCK is unset, regardless of RAZORPAY_KEY_ID', () => {
    snapshotEnv()
    process.env.NODE_ENV = 'development'
    delete process.env.PAYMENTS_MOCK
    delete process.env.RAZORPAY_KEY_ID
    expect(isPaymentsMockMode()).toBe(false)
  })

  it('is true when PAYMENTS_MOCK=true outside production', () => {
    snapshotEnv()
    process.env.NODE_ENV = 'development'
    process.env.PAYMENTS_MOCK = 'true'
    expect(isPaymentsMockMode()).toBe(true)
  })

  it('is false under NODE_ENV=production even when PAYMENTS_MOCK=true', () => {
    snapshotEnv()
    process.env.NODE_ENV = 'production'
    process.env.PAYMENTS_MOCK = 'true'
    expect(isPaymentsMockMode()).toBe(false)
  })
})

describe('assertRequiredPaymentEnv', () => {
  afterEach(restoreEnv)

  it('does nothing outside production, even with required vars missing', () => {
    snapshotEnv()
    process.env.NODE_ENV = 'development'
    delete process.env.RAZORPAY_KEY_ID
    delete process.env.RAZORPAY_KEY_SECRET
    expect(() => assertRequiredPaymentEnv()).not.toThrow()
  })

  it('throws in production when RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET is missing', () => {
    snapshotEnv()
    process.env.NODE_ENV = 'production'
    delete process.env.RAZORPAY_KEY_ID
    process.env.RAZORPAY_KEY_SECRET = 'present'
    expect(() => assertRequiredPaymentEnv()).toThrow(/RAZORPAY_KEY_ID/)
  })

  it('does not throw in production when both required vars are present', () => {
    snapshotEnv()
    process.env.NODE_ENV = 'production'
    process.env.RAZORPAY_KEY_ID = 'present'
    process.env.RAZORPAY_KEY_SECRET = 'present'
    expect(() => assertRequiredPaymentEnv()).not.toThrow()
  })
})
