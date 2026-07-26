import { beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import app from '../../src/index'
import { prisma } from '../../src/utils/prisma'
import { authCookies, createAddress, createProduct, createUser, resetDb } from '../helpers/factories'

beforeEach(async () => {
  await resetDb()
})

describe('order creation', () => {
  it('creates an order and creates reservations (does not decrement stock)', async () => {
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

    // Phase 2: Stock is no longer decremented at order creation; reservations are created instead.
    // Stock is only decremented at payment confirmation.
    const refreshed = await prisma.product.findUniqueOrThrow({ where: { id: product.id } })
    expect(refreshed.stock).toBe(5) // Stock is unchanged at order creation

    // Verify reservations were created
    const reservations = await prisma.stockReservation.findMany({
      where: { productId: product.id },
    })
    expect(reservations.length).toBe(1)
    expect(reservations[0].quantity).toBe(2)
    expect(reservations[0].status).toBe('ACTIVE')
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

  it('P0 regression guard: two concurrent orders for the last unit yield exactly one reservation', async () => {
    const userA = await createUser()
    const userB = await createUser()
    const addressA = await createAddress(userA.id)
    const addressB = await createAddress(userB.id)
    const product = await createProduct({ price: 500, stock: 1 })

    const [resA, resB] = await Promise.all([
      request(app)
        .post('/api/v1/orders')
        .set('Cookie', authCookies(userA))
        .send({ items: [{ productId: product.id, quantity: 1 }], addressId: addressA.id }),
      request(app)
        .post('/api/v1/orders')
        .set('Cookie', authCookies(userB))
        .send({ items: [{ productId: product.id, quantity: 1 }], addressId: addressB.id }),
    ])

    const statuses = [resA.status, resB.status].sort()
    // Exactly one request must succeed and the other must be rejected as out of stock —
    // both succeeding would mean the last unit was reserved twice (the P0-1 regression).
    expect(statuses).toEqual([201, 400])

    const reservations = await prisma.stockReservation.findMany({
      where: { productId: product.id, status: 'ACTIVE' },
    })
    expect(reservations.length).toBe(1)
  })

  it('same user cannot reserve the last unit twice across two orders', async () => {
    const user = await createUser()
    const address = await createAddress(user.id)
    const product = await createProduct({ price: 500, stock: 1 })

    const firstRes = await request(app)
      .post('/api/v1/orders')
      .set('Cookie', authCookies(user))
      .send({ items: [{ productId: product.id, quantity: 1 }], addressId: address.id })
    expect(firstRes.status).toBe(201)

    // The user's own first order still holds the only unit — a second order
    // for the same product must be rejected, not silently reserve it again.
    const secondRes = await request(app)
      .post('/api/v1/orders')
      .set('Cookie', authCookies(user))
      .send({ items: [{ productId: product.id, quantity: 1 }], addressId: address.id })

    expect(secondRes.status).toBe(400)
    expect(secondRes.body.code).toBe('INSUFFICIENT_STOCK')

    const reservations = await prisma.stockReservation.findMany({
      where: { productId: product.id, status: 'ACTIVE' },
    })
    expect(reservations.length).toBe(1)
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
  it('cancels a paid order and restores exactly the converted quantity', async () => {
    const user = await createUser()
    const address = await createAddress(user.id)
    const product = await createProduct({ price: 500, stock: 5 })

    const createRes = await request(app)
      .post('/api/v1/orders')
      .set('Cookie', authCookies(user))
      .send({ items: [{ productId: product.id, quantity: 2 }], addressId: address.id })
    const { order, razorpay } = createRes.body.data

    await request(app)
      .post('/api/v1/orders/verify-payment')
      .set('Cookie', authCookies(user))
      .send({
        orderId: order.id,
        razorpayOrderId: razorpay.orderId,
        razorpayPaymentId: 'pay_mock_test',
        razorpaySignature: 'mock_signature',
      })

    // Payment confirmed: stock is now decremented (5 -> 3).
    const afterPay = await prisma.product.findUniqueOrThrow({ where: { id: product.id } })
    expect(afterPay.stock).toBe(3)

    const cancelRes = await request(app)
      .post(`/api/v1/orders/${order.id}/cancel`)
      .set('Cookie', authCookies(user))
      .send()
    expect(cancelRes.status).toBe(200)

    // Cancelling a paid order must restore the converted quantity (5), not
    // double-restore and not leave it at the decremented value (3).
    const afterCancel = await prisma.product.findUniqueOrThrow({ where: { id: product.id } })
    expect(afterCancel.stock).toBe(5)

    const reservation = await prisma.stockReservation.findFirstOrThrow({
      where: { orderId: order.id },
    })
    expect(reservation.status).toBe('RELEASED')
  })

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
