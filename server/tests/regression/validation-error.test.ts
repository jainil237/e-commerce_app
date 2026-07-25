import { beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import app from '../../src/index'
import { authCookies, createUser, resetDb } from '../helpers/factories'

beforeEach(async () => {
  await resetDb()
})

// Regression guard for S-02 (error.middleware.ts) — already fixed prior to
// this chain, landed via the frontend-security-a11y merge. Not new work;
// this test exists so the fix cannot silently regress under later phases.
describe('RI6 — ZodError regression guard', () => {
  it('a validation failure on a payment endpoint returns 400 with field errors, not 500', async () => {
    const user = await createUser()

    const res = await request(app)
      .post('/api/v1/orders')
      .set('Cookie', authCookies(user))
      .send({ items: [], addressId: 'not-a-uuid' }) // fails createOrderSchema: items.min(1), addressId.uuid()

    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
    expect(res.body.code).toBe('VALIDATION_ERROR')
    expect(res.body.data).toBeTruthy() // field-level errors present, not just a bare message
  })
})
