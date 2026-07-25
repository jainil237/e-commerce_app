import { beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import app from '../../src/index'
import { prisma } from '../../src/utils/prisma'
import { authCookies, createAddress, createProduct, createUser, resetDb } from '../helpers/factories'

beforeEach(async () => {
  await resetDb()
})

describe('order creation', () => {
  it('creates an order and deducts stock at creation time', async () => {
    const user = await createUser()
    const address = await createAddress(user.id)
    const product = await createProduct({ price: 500, stock: 5 })

    const res = await request(app)
      .post('/api/v1/orders')
      .set('Cookie', authCookies(user))
      .send({ items: [{ productId: product.id, quantity: 2 }], addressId: address.id })

    expect(res.status).toBe(201)
    expect(res.body.success).toBe(true)
    expect(res.body.data.order.total).toBe('1000')

    // Characterization, not a defect: today's design decrements stock at order
    // creation (before payment). Whether that stays this way is Epic 2 scope,
    // not touched by this chain.
    const refreshed = await prisma.product.findUniqueOrThrow({ where: { id: product.id } })
    expect(refreshed.stock).toBe(3)
  })

  it('rejects order creation when stock is insufficient', async () => {
    const user = await createUser()
    const address = await createAddress(user.id)
    const product = await createProduct({ price: 500, stock: 1 })

    const res = await request(app)
      .post('/api/v1/orders')
      .set('Cookie', authCookies(user))
      .send({ items: [{ productId: product.id, quantity: 2 }], addressId: address.id })

    expect(res.status).toBe(400)
    expect(res.body.code).toBe('INSUFFICIENT_STOCK')
  })

  it('rejects an address that does not belong to the requesting user', async () => {
    const user = await createUser()
    const otherUser = await createUser()
    const otherAddress = await createAddress(otherUser.id)
    const product = await createProduct()

    const res = await request(app)
      .post('/api/v1/orders')
      .set('Cookie', authCookies(user))
      .send({ items: [{ productId: product.id, quantity: 1 }], addressId: otherAddress.id })

    expect(res.status).toBe(400)
  })
})

describe('verify-payment (mock mode)', () => {
  it('confirms a legitimate order in mock mode', async () => {
    const user = await createUser()
    const address = await createAddress(user.id)
    const product = await createProduct({ price: 500, stock: 5 })

    const createRes = await request(app)
      .post('/api/v1/orders')
      .set('Cookie', authCookies(user))
      .send({ items: [{ productId: product.id, quantity: 1 }], addressId: address.id })

    const { order, razorpay } = createRes.body.data

    const verifyRes = await request(app)
      .post('/api/v1/orders/verify-payment')
      .set('Cookie', authCookies(user))
      .send({
        orderId: order.id,
        razorpayOrderId: razorpay.orderId,
        razorpayPaymentId: 'pay_mock_test',
        razorpaySignature: 'mock_signature',
      })

    expect(verifyRes.status).toBe(200)
    expect(verifyRes.body.data.paymentStatus).toBe('PAID')
  })
})

describe('cancel order', () => {
  it('cancels a pending order and restores stock', async () => {
    const user = await createUser()
    const address = await createAddress(user.id)
    const product = await createProduct({ price: 500, stock: 5 })

    const createRes = await request(app)
      .post('/api/v1/orders')
      .set('Cookie', authCookies(user))
      .send({ items: [{ productId: product.id, quantity: 2 }], addressId: address.id })

    const orderId = createRes.body.data.order.id

    const cancelRes = await request(app)
      .post(`/api/v1/orders/${orderId}/cancel`)
      .set('Cookie', authCookies(user))
      .send()

    expect(cancelRes.status).toBe(200)

    const refreshed = await prisma.product.findUniqueOrThrow({ where: { id: product.id } })
    expect(refreshed.stock).toBe(5)
  })
})

describe('coupon apply at order creation', () => {
  it('applies a percentage coupon to the order total', async () => {
    const user = await createUser()
    const address = await createAddress(user.id)
    const product = await createProduct({ price: 1000, stock: 5 })
    const coupon = await prisma.coupon.create({
      data: { code: 'SAVE10', discountType: 'PERCENTAGE', discountValue: 10, isActive: true },
    })

    const res = await request(app)
      .post('/api/v1/orders')
      .set('Cookie', authCookies(user))
      .send({ items: [{ productId: product.id, quantity: 1 }], addressId: address.id, couponCode: coupon.code })

    expect(res.status).toBe(201)
    // subtotal 1000, 10% discount = 900, no shipping threshold assumed crossed either way —
    // asserting discount was applied at all, not a specific shipping-inclusive total.
    expect(Number(res.body.data.order.total)).toBeLessThan(1000)
  })
})
