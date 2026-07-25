import { beforeEach, describe, expect, it } from 'vitest'
import crypto from 'node:crypto'
import request from 'supertest'
import app from '../../src/index'
import { authCookies, createAddress, createProduct, createUser, resetDb } from '../helpers/factories'

beforeEach(async () => {
  await resetDb()
})

// The suite runs with PAYMENTS_MOCK=true by default (tests/setup.ts), so
// order creation and verify-payment never hit the real Razorpay API. These
// helpers turn mock mode off for exactly one call, supply a real-looking
// secret to compute a genuine signature against, then restore the prior env.
const REAL_SECRET = 'a-realistic-looking-secret-value'

async function withRealSignatureVerification<T>(fn: () => Promise<T>): Promise<T> {
  const prevMock = process.env.PAYMENTS_MOCK
  const prevSecret = process.env.RAZORPAY_KEY_SECRET
  process.env.PAYMENTS_MOCK = 'false'
  process.env.RAZORPAY_KEY_SECRET = REAL_SECRET
  try {
    return await fn()
  } finally {
    if (prevMock === undefined) delete process.env.PAYMENTS_MOCK
    else process.env.PAYMENTS_MOCK = prevMock
    if (prevSecret === undefined) delete process.env.RAZORPAY_KEY_SECRET
    else process.env.RAZORPAY_KEY_SECRET = prevSecret
  }
}

function signPayment(razorpayOrderId: string, razorpayPaymentId: string) {
  return crypto
    .createHmac('sha256', REAL_SECRET)
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

describe('R2 — mock mode requires an explicit opt-in, independent of key shape', () => {
  // Fixed as of Phase 2: mock mode used to be inferred from RAZORPAY_KEY_ID's
  // shape (unset, or matching/starting with a placeholder string). It is now
  // decided by a single explicit PAYMENTS_MOCK flag, hard-disabled in
  // production, regardless of what RAZORPAY_KEY_ID looks like.
  it('signature verification runs when PAYMENTS_MOCK is unset, even with RAZORPAY_KEY_ID absent', async () => {
    const { user, order, razorpayOrderId } = await createUnpaidOrder()
    const prevMock = process.env.PAYMENTS_MOCK
    const prevKey = process.env.RAZORPAY_KEY_ID
    delete process.env.PAYMENTS_MOCK
    delete process.env.RAZORPAY_KEY_ID
    try {
      const res = await request(app)
        .post('/api/v1/orders/verify-payment')
        .set('Cookie', authCookies(user))
        .send({
          orderId: order.id,
          razorpayOrderId,
          razorpayPaymentId: 'pay_x',
          razorpaySignature: 'not-a-real-signature',
        })
      // Real verification ran and rejected the garbage signature — no bypass.
      expect(res.status).not.toBe(200)
    } finally {
      if (prevMock === undefined) delete process.env.PAYMENTS_MOCK
      else process.env.PAYMENTS_MOCK = prevMock
      if (prevKey === undefined) delete process.env.RAZORPAY_KEY_ID
      else process.env.RAZORPAY_KEY_ID = prevKey
    }
  })

  it('signature verification runs when PAYMENTS_MOCK is unset, even with RAZORPAY_KEY_ID placeholder-shaped', async () => {
    const { user, order, razorpayOrderId } = await createUnpaidOrder()
    const prevMock = process.env.PAYMENTS_MOCK
    const prevKey = process.env.RAZORPAY_KEY_ID
    delete process.env.PAYMENTS_MOCK
    process.env.RAZORPAY_KEY_ID = 'rzp_test_placeholder'
    try {
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
    } finally {
      if (prevMock === undefined) delete process.env.PAYMENTS_MOCK
      else process.env.PAYMENTS_MOCK = prevMock
      if (prevKey === undefined) delete process.env.RAZORPAY_KEY_ID
      else process.env.RAZORPAY_KEY_ID = prevKey
    }
  })

  it('mock mode is available via an explicit PAYMENTS_MOCK=true opt-in', async () => {
    // PAYMENTS_MOCK=true is already the suite's default (tests/setup.ts) —
    // asserted directly here rather than relying on every other test's
    // incidental use of it.
    const { user, order, razorpayOrderId } = await createUnpaidOrder()

    const res = await request(app)
      .post('/api/v1/orders/verify-payment')
      .set('Cookie', authCookies(user))
      .send({
        orderId: order.id,
        razorpayOrderId,
        razorpayPaymentId: 'pay_x',
        razorpaySignature: 'not-a-real-signature',
      })

    expect(res.status).toBe(200)
  })
})
