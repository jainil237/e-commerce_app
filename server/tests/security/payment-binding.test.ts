import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import crypto from 'node:crypto'
import request from 'supertest'
import app from '../../src/index'
import { authCookies, createAddress, createProduct, createUser, resetDb } from '../helpers/factories'

beforeEach(async () => {
  await resetDb()
})

// verify-payment's HMAC check is skipped entirely in mock mode, so these
// tests leave mock mode for exactly the one request under test, then restore
// the environment. No live Razorpay call happens either way — the signature
// check itself is local HMAC math, computed with the same secret the route
// reads from process.env.
const REAL_LOOKING_KEY_ID = 'rzp_test_realistic_1234567890'
const REAL_LOOKING_KEY_SECRET = 'a-realistic-looking-secret-value'

function withRealSignatureVerification<T>(fn: () => Promise<T>): Promise<T> {
  const prevId = process.env.RAZORPAY_KEY_ID
  const prevSecret = process.env.RAZORPAY_KEY_SECRET
  process.env.RAZORPAY_KEY_ID = REAL_LOOKING_KEY_ID
  process.env.RAZORPAY_KEY_SECRET = REAL_LOOKING_KEY_SECRET
  // supertest's Test object is thenable but not a real Promise (no .finally).
  return Promise.resolve(fn()).finally(() => {
    if (prevId === undefined) delete process.env.RAZORPAY_KEY_ID
    else process.env.RAZORPAY_KEY_ID = prevId
    if (prevSecret === undefined) delete process.env.RAZORPAY_KEY_SECRET
    else process.env.RAZORPAY_KEY_SECRET = prevSecret
  })
}

function signPayment(razorpayOrderId: string, razorpayPaymentId: string) {
  return crypto
    .createHmac('sha256', REAL_LOOKING_KEY_SECRET)
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest('hex')
}

async function createUnpaidOrder(overrides: { price?: number } = {}) {
  const user = await createUser()
  const address = await createAddress(user.id)
  const product = await createProduct({ price: overrides.price ?? 500, stock: 5 })
  const res = await request(app)
    .post('/api/v1/orders')
    .set('Cookie', authCookies(user))
    .send({ items: [{ productId: product.id, quantity: 1 }], addressId: address.id })
  return { user, order: res.body.data.order, razorpayOrderId: res.body.data.razorpay.orderId as string }
}

describe('SEC-1 — order binding on verify-payment', () => {
  // Documents today's behavior: `verify-payment` never compares the request
  // body's razorpayOrderId to the order's own stored razorpayOrderId. Owning
  // fix: plan Phase 3 (R1). This assertion describes the FIXED state, so it
  // is expected to fail until Phase 3 lands — flip to `it` then.
  it.fails('rejects a valid signature for one order when replayed against a different unpaid order', async () => {
    const { razorpayOrderId: orderARazorpayId } = await createUnpaidOrder({ price: 100 })
    const { user: userB, order: orderB } = await createUnpaidOrder({ price: 100000 })

    const paymentId = 'pay_replayed'
    const validSignatureForOrderA = signPayment(orderARazorpayId, paymentId)

    const res = await withRealSignatureVerification(() =>
      request(app)
        .post('/api/v1/orders/verify-payment')
        .set('Cookie', authCookies(userB))
        .send({
          orderId: orderB.id,
          razorpayOrderId: orderARazorpayId, // order A's Razorpay id, not order B's
          razorpayPaymentId: paymentId,
          razorpaySignature: validSignatureForOrderA,
        })
    )

    expect(res.status).not.toBe(200)
  })

  // Same replay, characterized as it actually behaves today: the request
  // above currently succeeds and marks order B PAID, because the signature
  // is valid for the (razorpayOrderId, paymentId) pair in the body and that
  // pair is never checked against the order being confirmed.
  it('today: the same replay currently succeeds (this is the bug SEC-1 fixes)', async () => {
    const { razorpayOrderId: orderARazorpayId } = await createUnpaidOrder({ price: 100 })
    const { user: userB, order: orderB } = await createUnpaidOrder({ price: 100000 })

    const paymentId = 'pay_replayed_2'
    const validSignatureForOrderA = signPayment(orderARazorpayId, paymentId)

    const res = await withRealSignatureVerification(() =>
      request(app)
        .post('/api/v1/orders/verify-payment')
        .set('Cookie', authCookies(userB))
        .send({
          orderId: orderB.id,
          razorpayOrderId: orderARazorpayId,
          razorpayPaymentId: paymentId,
          razorpaySignature: validSignatureForOrderA,
        })
    )

    expect(res.status).toBe(200)
    expect(res.body.data.paymentStatus).toBe('PAID')
  })
})

describe('SEC-2 / TD-2 — mock mode derived from env-var shape', () => {
  afterEach(() => {
    delete process.env.RAZORPAY_KEY_ID
  })

  // Characterizes today's actual gate: any value that merely fails to look
  // like a real key disables signature verification, with no NODE_ENV check
  // and no explicit opt-in flag.
  it('today: an unset RAZORPAY_KEY_ID silently skips signature verification', async () => {
    // Order creation has its own, narrower mock-mode gate (equality/startsWith
    // on the placeholder string — it does not treat "unset" as mock). Create
    // the order under the default placeholder-shaped key from setup.ts, then
    // unset the key for the verify-payment call under test.
    const { user, order, razorpayOrderId } = await createUnpaidOrder()
    delete process.env.RAZORPAY_KEY_ID

    const res = await request(app)
      .post('/api/v1/orders/verify-payment')
      .set('Cookie', authCookies(user))
      .send({
        orderId: order.id,
        razorpayOrderId,
        razorpayPaymentId: 'pay_x',
        razorpaySignature: 'not-a-real-signature',
      })

    // No signature error — mock mode accepted a garbage signature outright.
    expect(res.status).toBe(200)
  })

  // Describes the FIXED state (plan Phase 2 / R2): mock mode must require an
  // explicit PAYMENTS_MOCK=true opt-in, not just an env var that happens to
  // be unset or placeholder-shaped. Expected to fail until Phase 2 lands.
  it.fails('mock mode requires an explicit PAYMENTS_MOCK=true opt-in, not just a missing key', async () => {
    const { user, order, razorpayOrderId } = await createUnpaidOrder()
    delete process.env.RAZORPAY_KEY_ID
    delete process.env.PAYMENTS_MOCK

    const res = await request(app)
      .post('/api/v1/orders/verify-payment')
      .set('Cookie', authCookies(user))
      .send({
        orderId: order.id,
        razorpayOrderId,
        razorpayPaymentId: 'pay_x',
        razorpaySignature: 'not-a-real-signature',
      })

    expect(res.status).not.toBe(200)
  })
})
