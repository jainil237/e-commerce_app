/**
 * Self-check for webhook HMAC verification. Run: npx tsx scripts/check-webhook-signature.ts
 * ponytail: no test framework in this repo, so plain asserts.
 */
import assert from 'assert'
import crypto from 'crypto'
import { verifyWebhookSignature } from '../src/routes/webhook.routes'

const SECRET = 'test_secret'
const body = { shipmentId: 'ship_1', status: 'DELIVERED' }
const sign = (b: unknown, s: string) =>
  crypto.createHmac('sha256', s).update(JSON.stringify(b)).digest('hex')

// valid signature passes
assert.strictEqual(verifyWebhookSignature(body, sign(body, SECRET), SECRET), true)

// tampered body fails (the actual attack: flipping a shipment to DELIVERED)
const tampered = { ...body, shipmentId: 'ship_victim' }
assert.strictEqual(verifyWebhookSignature(tampered, sign(body, SECRET), SECRET), false)

// wrong secret fails
assert.strictEqual(verifyWebhookSignature(body, sign(body, 'wrong'), SECRET), false)

// fails closed: no signature, no secret, empty secret, malformed signature
assert.strictEqual(verifyWebhookSignature(body, undefined, SECRET), false)
assert.strictEqual(verifyWebhookSignature(body, sign(body, SECRET), undefined), false)
assert.strictEqual(verifyWebhookSignature(body, sign(body, SECRET), ''), false)
assert.strictEqual(verifyWebhookSignature(body, 'short', SECRET), false)

console.log('webhook signature checks passed')
