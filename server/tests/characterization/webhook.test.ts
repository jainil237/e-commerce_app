import { describe, expect, it } from 'vitest'
import crypto from 'node:crypto'
import { verifyWebhookSignature } from '../../src/routes/webhook.routes'

const SECRET = 'test-webhook-secret'

function sign(rawBytes: string, secret = SECRET) {
  return crypto.createHmac('sha256', secret).update(rawBytes).digest('hex')
}

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

  // R3 (plan Phase 5) fixes this by verifying against the raw Buffer via
  // `express.raw()`, before JSON parsing. That changes the function's input
  // shape, and per the plan this requirement is closed with a captured real
  // Razorpay test-mode event (manual QA), not a synthesized unit test — a
  // synthesized payload cannot prove byte-exactness against a real signer.
  it.todo('R3: verification uses the exact raw request bytes — closed via manual QA against a captured Razorpay test-mode event, see plan Phase 5')
})
