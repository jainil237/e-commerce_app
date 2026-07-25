// Single source of truth for "is payment/refund signature verification
// disabled". Previously this was decided independently at three call sites
// (order creation, verify-payment, RMA refund) by checking whether
// RAZORPAY_KEY_ID looked like a real key — so an unset or misconfigured env
// var silently accepted unsigned payments instead of refusing them. Mock
// mode now requires an explicit opt-in and is hard-disabled in production.
export function isPaymentsMockMode(): boolean {
  if (process.env.NODE_ENV === 'production') return false
  return process.env.PAYMENTS_MOCK === 'true'
}

const REQUIRED_PAYMENT_VARS = ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET'] as const

// Called at boot. A production deploy missing these must refuse to start —
// a crashed deploy is a good outcome; a running deploy that silently accepts
// unsigned payments is not. Throws rather than exiting directly so it stays
// a pure, testable function; the caller decides what "fail" means.
export function assertRequiredPaymentEnv(): void {
  if (process.env.NODE_ENV !== 'production') return

  const missing = REQUIRED_PAYMENT_VARS.filter((key) => !process.env[key])
  if (missing.length > 0) {
    throw new Error(`Missing required payment environment variable(s) in production: ${missing.join(', ')}`)
  }
}
