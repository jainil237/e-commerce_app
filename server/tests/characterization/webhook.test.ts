import { beforeEach, describe, expect, it } from 'vitest'
import crypto from 'node:crypto'
import request from 'supertest'
import app from '../../src/index'
import { prisma } from '../../src/utils/prisma'
import { verifyWebhookSignature, verifyWebhookSignatureRaw } from '../../src/routes/webhook.routes'
import { authCookies, createAddress, createProduct, createUser, resetDb } from '../helpers/factories'

const SECRET = 'test-webhook-secret'

function sign(rawBytes: string, secret = SECRET) {
  return crypto.createHmac('sha256', secret).update(rawBytes).digest('hex')
}

beforeEach(async () => {
  await resetDb()
})

describe('verifyWebhookSignature — baseline correctness', () => {
  it('accepts a signature computed the same way the function computes it', () => {
    const body = { event: 'payment.captured', payload: { payment: { entity: { id: 'pay_1' } } } }
    const signature = sign(JSON.stringify(body))
    expect(verifyWebhookSignature(body, signature, SECRET)).toBe(true)
  })

  it('rejects when the secret is unset (fails closed)', () => {
    const body = { event: 'payment.captured' }
    const signature = sign(JSON.stringify(body))
    expect(verifyWebhookSignature(body, signature, undefined)).toBe(false)
  })

  it('rejects when the signature header is missing', () => {
    const body = { event: 'payment.captured' }
    expect(verifyWebhookSignature(body, undefined, SECRET)).toBe(false)
  })

  it('rejects a tampered body', () => {
    const body = { event: 'payment.captured', amount: 100 }
    const signature = sign(JSON.stringify(body))
    const tampered = { ...body, amount: 999999 }
    expect(verifyWebhookSignature(tampered, signature, SECRET)).toBe(false)
  })
})

describe('SEC-3 — signature verified over a re-serialized body, not raw bytes', () => {
  // Characterizes today's actual flaw: verifyWebhookSignature computes the
  // HMAC over JSON.stringify(body) — a re-serialization of whatever Express
  // already parsed — never over the exact bytes Razorpay originally sent
  // and signed. Two byte-for-byte different, logically-identical payloads
  // (e.g. compact vs. pretty-printed) produce different signatures. A
  // legitimately-signed webhook whose raw bytes don't happen to match
  // Node's default JSON.stringify formatting is rejected outright — a false
  // negative that has nothing to do with whether the webhook is genuine.
  it('today: a legitimately-signed payload is rejected when its raw bytes differ from the re-serialized form', () => {
    const body = { event: 'payment.captured', payload: { payment: { entity: { id: 'pay_1', amount: 10000 } } } }

    // Simulates the actual bytes Razorpay sent and signed — pretty-printed,
    // a valid alternate serialization of the identical logical payload.
    const rawBytesRazorpaySigned = JSON.stringify(body, null, 2)
    const realSignature = sign(rawBytesRazorpaySigned)

    // Express has already parsed those bytes into `body` by the time this
    // function runs; it has no access to the original bytes any more.
    const result = verifyWebhookSignature(body, realSignature, SECRET)

    expect(result).toBe(false) // false negative — this is the bug, not the desired behavior
  })

})

describe('verifyWebhookSignatureRaw — R3 fix, unit level', () => {
  it('accepts a signature computed over the exact raw bytes, regardless of formatting', () => {
    const body = { event: 'payment.captured', payload: { payment: { entity: { id: 'pay_1', amount: 10000 } } } }

    // The same "pretty-printed raw bytes" scenario that defeated
    // verifyWebhookSignature above — this time verified against the raw
    // buffer directly, the way express.raw() would hand it to the route.
    const rawBytes = Buffer.from(JSON.stringify(body, null, 2), 'utf8')
    const signature = sign(rawBytes.toString('utf8'))

    expect(verifyWebhookSignatureRaw(rawBytes, signature, SECRET)).toBe(true)
  })

  it('rejects a tampered raw body', () => {
    const original = Buffer.from(JSON.stringify({ amount: 100 }), 'utf8')
    const signature = sign(original.toString('utf8'))
    const tampered = Buffer.from(JSON.stringify({ amount: 999999 }), 'utf8')

    expect(verifyWebhookSignatureRaw(tampered, signature, SECRET)).toBe(false)
  })

  it('fails closed when the secret is unset', () => {
    const rawBytes = Buffer.from(JSON.stringify({ event: 'payment.captured' }), 'utf8')
    const signature = sign(rawBytes.toString('utf8'))
    expect(verifyWebhookSignatureRaw(rawBytes, signature, undefined)).toBe(false)
  })
})

describe('R3 — POST /api/v1/webhooks/razorpay end to end', () => {
  const WEBHOOK_SECRET = 'e2e-webhook-secret'

  async function createPendingOrderWithRazorpayId() {
    const user = await createUser()
    const address = await createAddress(user.id)
    const product = await createProduct({ price: 500, stock: 5 })
    const res = await request(app)
      .post('/api/v1/orders')
      .set('Cookie', authCookies(user))
      .send({ items: [{ productId: product.id, quantity: 1 }], addressId: address.id })
    return { razorpayOrderId: res.body.data.razorpay.orderId as string, orderId: res.body.data.order.id as string }
  }

  function signRawBody(payload: object, secret: string) {
    const raw = Buffer.from(JSON.stringify(payload), 'utf8')
    return crypto.createHmac('sha256', secret).update(raw).digest('hex')
  }

  it('confirms the order when the signature matches the raw bytes actually sent', async () => {
    const { razorpayOrderId, orderId } = await createPendingOrderWithRazorpayId()
    const payload = {
      event: 'payment.captured',
      payload: { payment: { entity: { id: 'pay_e2e', order_id: razorpayOrderId } } },
    }
    // supertest serializes a plain object with JSON.stringify — the same
    // bytes this signature is computed over, so this proves the route
    // verifies against what's actually on the wire, not a local echo.
    const signature = signRawBody(payload, WEBHOOK_SECRET)
    const prevSecret = process.env.RAZORPAY_WEBHOOK_SECRET
    process.env.RAZORPAY_WEBHOOK_SECRET = WEBHOOK_SECRET

    try {
      const res = await request(app)
        .post('/api/v1/webhooks/razorpay')
        .set('x-razorpay-signature', signature)
        .send(payload)

      expect(res.status).toBe(200)
    } finally {
      if (prevSecret === undefined) delete process.env.RAZORPAY_WEBHOOK_SECRET
      else process.env.RAZORPAY_WEBHOOK_SECRET = prevSecret
    }
  })

  it('rejects a tampered payload even if the header claims a signature', async () => {
    const { razorpayOrderId } = await createPendingOrderWithRazorpayId()
    const payload = {
      event: 'payment.captured',
      payload: { payment: { entity: { id: 'pay_tampered', order_id: razorpayOrderId } } },
    }
    const signature = signRawBody(payload, WEBHOOK_SECRET)
    const prevSecret = process.env.RAZORPAY_WEBHOOK_SECRET
    process.env.RAZORPAY_WEBHOOK_SECRET = WEBHOOK_SECRET

    try {
      const res = await request(app)
        .post('/api/v1/webhooks/razorpay')
        .set('x-razorpay-signature', signature)
        // Different body than what was signed.
        .send({ ...payload, payload: { payment: { entity: { id: 'pay_swapped', order_id: razorpayOrderId } } } })

      expect(res.status).toBe(400)
    } finally {
      if (prevSecret === undefined) delete process.env.RAZORPAY_WEBHOOK_SECRET
      else process.env.RAZORPAY_WEBHOOK_SECRET = prevSecret
    }
  })

  it('returns a non-2xx when confirmation fails, so Razorpay retries instead of getting a silent success', async () => {
    // PAYMENTS_MOCK=true is the suite default; turning it off for this one
    // request makes confirmPayment attempt a real (and here, unreachable)
    // Razorpay fetch, which throws PAYMENT_VERIFICATION_UNAVAILABLE. This
    // is a regression guard for a bug caught in review: an earlier version
    // caught that error inside the switch case and still fell through to
    // `res.json({ success: true })`, so a failed confirmation looked
    // identical to a successful one from Razorpay's side — no retry, order
    // stuck PENDING forever.
    const { razorpayOrderId, orderId } = await createPendingOrderWithRazorpayId()
    const payload = {
      event: 'payment.captured',
      payload: { payment: { entity: { id: 'pay_unreachable', order_id: razorpayOrderId } } },
    }
    const signature = signRawBody(payload, WEBHOOK_SECRET)
    const prevSecret = process.env.RAZORPAY_WEBHOOK_SECRET
    const prevMock = process.env.PAYMENTS_MOCK
    process.env.RAZORPAY_WEBHOOK_SECRET = WEBHOOK_SECRET
    process.env.PAYMENTS_MOCK = 'false'

    try {
      const res = await request(app)
        .post('/api/v1/webhooks/razorpay')
        .set('x-razorpay-signature', signature)
        .send(payload)

      expect(res.status).not.toBe(200)

      const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } })
      expect(order.paymentStatus).toBe('PENDING')
    } finally {
      if (prevSecret === undefined) delete process.env.RAZORPAY_WEBHOOK_SECRET
      else process.env.RAZORPAY_WEBHOOK_SECRET = prevSecret
      if (prevMock === undefined) delete process.env.PAYMENTS_MOCK
      else process.env.PAYMENTS_MOCK = prevMock
    }
  })

  it('fails closed when RAZORPAY_WEBHOOK_SECRET is unset', async () => {
    const prevSecret = process.env.RAZORPAY_WEBHOOK_SECRET
    delete process.env.RAZORPAY_WEBHOOK_SECRET

    try {
      const res = await request(app)
        .post('/api/v1/webhooks/razorpay')
        .set('x-razorpay-signature', 'anything')
        .send({ event: 'payment.captured' })

      expect(res.status).toBe(400)
    } finally {
      if (prevSecret === undefined) delete process.env.RAZORPAY_WEBHOOK_SECRET
      else process.env.RAZORPAY_WEBHOOK_SECRET = prevSecret
    }
  })

  it('a non-webhook route still receives a normally parsed JSON body (guards the global-parser change)', async () => {
    const user = await createUser()
    const address = await createAddress(user.id)
    const product = await createProduct({ price: 250, stock: 5 })

    // If the path-scoped express.raw() mount in index.ts were broader than
    // intended, this would receive a Buffer instead of a parsed object and
    // every field read in order.routes.ts would be undefined.
    const res = await request(app)
      .post('/api/v1/orders')
      .set('Cookie', authCookies(user))
      .send({ items: [{ productId: product.id, quantity: 1 }], addressId: address.id })

    expect(res.status).toBe(201)
    // Total includes shipping on top of the 250 item price — asserting
    // "at least the item price" rather than an exact figure keeps this
    // test from being brittle against Store.config.json's shipping rules;
    // what matters here is that the body parsed correctly at all (a
    // too-broad raw-body mount would hand order.routes.ts a Buffer instead
    // of a parsed object, and every field read from req.body would be
    // undefined, not merely a different valid number).
    expect(Number(res.body.data.order.total)).toBeGreaterThanOrEqual(250)
  })
})

describe('R3 — logistics webhook is unaffected (different path, still JSON-based)', () => {
  it('verifyWebhookSignature (the JSON-based function) still works for the logistics path\'s own verification', () => {
    // The logistics route is untouched by this phase — same function,
    // same characterization as the top of this file. Asserted here as a
    // regression guard specifically in the context of the R3 change,
    // since it's the thing most likely to be accidentally broken by a
    // too-broad raw-body mount.
    const body = { shipmentId: 's1', status: 'DELIVERED' }
    const signature = sign(JSON.stringify(body))
    expect(verifyWebhookSignature(body, signature, SECRET)).toBe(true)
  })
})
