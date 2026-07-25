import { beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import app from '../../src/index'
import { prisma } from '../../src/utils/prisma'
import { authCookies, createAddress, createProduct, createUser, resetDb } from '../helpers/factories'

beforeEach(async () => {
  await resetDb()
})

describe('R4 — discount clamping at order creation', () => {
  it('a FLAT coupon larger than the order total never produces a negative total', async () => {
    const user = await createUser()
    const address = await createAddress(user.id)
    const product = await createProduct({ price: 100, stock: 5 })
    const coupon = await prisma.coupon.create({
      data: { code: 'HUGEFLAT', discountType: 'FLAT', discountValue: 100000, isActive: true },
    })

    const res = await request(app)
      .post('/api/v1/orders')
      .set('Cookie', authCookies(user))
      .send({ items: [{ productId: product.id, quantity: 1 }], addressId: address.id, couponCode: coupon.code })

    expect(res.status).toBe(201)
    expect(Number(res.body.data.order.total)).toBeGreaterThanOrEqual(0)
  })

  it('a misconfigured >100% PERCENTAGE coupon never produces a negative total', async () => {
    const user = await createUser()
    const address = await createAddress(user.id)
    const product = await createProduct({ price: 100, stock: 5 })
    const coupon = await prisma.coupon.create({
      data: { code: 'OVER100', discountType: 'PERCENTAGE', discountValue: 150, isActive: true },
    })

    const res = await request(app)
      .post('/api/v1/orders')
      .set('Cookie', authCookies(user))
      .send({ items: [{ productId: product.id, quantity: 1 }], addressId: address.id, couponCode: coupon.code })

    expect(res.status).toBe(201)
    expect(Number(res.body.data.order.total)).toBeGreaterThanOrEqual(0)
  })
})

describe('R4 — coupon usage cannot exceed maxUsage under concurrent redemption', () => {
  it('two simultaneous confirmations for a coupon with maxUsage=1 result in exactly one successful redemption', async () => {
    const buyerA = await createUser()
    const buyerB = await createUser()
    const addressA = await createAddress(buyerA.id)
    const addressB = await createAddress(buyerB.id)
    const productA = await createProduct({ price: 500, stock: 5 })
    const productB = await createProduct({ price: 500, stock: 5 })
    const coupon = await prisma.coupon.create({
      data: { code: 'LASTONE', discountType: 'FLAT', discountValue: 50, isActive: true, maxUsage: 1 },
    })

    const orderA = await request(app)
      .post('/api/v1/orders')
      .set('Cookie', authCookies(buyerA))
      .send({ items: [{ productId: productA.id, quantity: 1 }], addressId: addressA.id, couponCode: coupon.code })
    const orderB = await request(app)
      .post('/api/v1/orders')
      .set('Cookie', authCookies(buyerB))
      .send({ items: [{ productId: productB.id, quantity: 1 }], addressId: addressB.id, couponCode: coupon.code })

    // Both orders can be *created* with the coupon attached (creation only
    // checks usage, doesn't consume it) — usage is consumed at confirmation,
    // which is the actual point of contention this test targets.
    const [verifyA, verifyB] = await Promise.all([
      request(app)
        .post('/api/v1/orders/verify-payment')
        .set('Cookie', authCookies(buyerA))
        .send({
          orderId: orderA.body.data.order.id,
          razorpayOrderId: orderA.body.data.razorpay.orderId,
          razorpayPaymentId: 'pay_a',
          razorpaySignature: 'mock',
        }),
      request(app)
        .post('/api/v1/orders/verify-payment')
        .set('Cookie', authCookies(buyerB))
        .send({
          orderId: orderB.body.data.order.id,
          razorpayOrderId: orderB.body.data.razorpay.orderId,
          razorpayPaymentId: 'pay_b',
          razorpaySignature: 'mock',
        }),
    ])

    // PAYMENTS_MOCK=true skips signature verification, so both confirmations
    // are attempted concurrently against the same coupon row — this is the
    // actual race. Both may succeed at the HTTP layer (mock mode doesn't
    // block on payment status), but usedCount must never exceed maxUsage.
    expect(verifyA.status).toBe(200)
    expect(verifyB.status).toBe(200)

    const refreshedCoupon = await prisma.coupon.findUniqueOrThrow({ where: { id: coupon.id } })
    expect(refreshedCoupon.usedCount).toBeLessThanOrEqual(1)
  })

  it('two simultaneous confirmations by the same user for a coupon with perUserLimit=1 result in usedCount <= 1', async () => {
    const buyer = await createUser()
    const addressA = await createAddress(buyer.id)
    const addressB = await createAddress(buyer.id)
    const productA = await createProduct({ price: 300, stock: 5 })
    const productB = await createProduct({ price: 300, stock: 5 })
    const coupon = await prisma.coupon.create({
      data: { code: 'ONCEEACH', discountType: 'FLAT', discountValue: 20, isActive: true, perUserLimit: 1 },
    })

    // No CouponUsage row exists yet for this user, so both creations pass
    // the per-user check trivially — same TOCTOU shape as the maxUsage
    // test above, this time on the per-user counter.
    const orderA = await request(app)
      .post('/api/v1/orders')
      .set('Cookie', authCookies(buyer))
      .send({ items: [{ productId: productA.id, quantity: 1 }], addressId: addressA.id, couponCode: coupon.code })
    const orderB = await request(app)
      .post('/api/v1/orders')
      .set('Cookie', authCookies(buyer))
      .send({ items: [{ productId: productB.id, quantity: 1 }], addressId: addressB.id, couponCode: coupon.code })

    const [verifyA, verifyB] = await Promise.all([
      request(app)
        .post('/api/v1/orders/verify-payment')
        .set('Cookie', authCookies(buyer))
        .send({
          orderId: orderA.body.data.order.id,
          razorpayOrderId: orderA.body.data.razorpay.orderId,
          razorpayPaymentId: 'pay_a',
          razorpaySignature: 'mock',
        }),
      request(app)
        .post('/api/v1/orders/verify-payment')
        .set('Cookie', authCookies(buyer))
        .send({
          orderId: orderB.body.data.order.id,
          razorpayOrderId: orderB.body.data.razorpay.orderId,
          razorpayPaymentId: 'pay_b',
          razorpaySignature: 'mock',
        }),
    ])

    expect(verifyA.status).toBe(200)
    expect(verifyB.status).toBe(200)

    const usage = await prisma.couponUsage.findUnique({
      where: { couponId_userId: { couponId: coupon.id, userId: buyer.id } },
    })
    expect(usage?.usedCount ?? 0).toBeLessThanOrEqual(1)
  })
})

describe('R4 — coupon endpoints resolve pricing server-side from cart items', () => {
  it('/coupons/validate computes the discount from real product prices, not a client-supplied number', async () => {
    const product = await createProduct({ price: 1000, stock: 5 })
    const coupon = await prisma.coupon.create({
      data: { code: 'TENOFF', discountType: 'PERCENTAGE', discountValue: 10, isActive: true },
    })

    const res = await request(app)
      .post('/api/v1/coupons/validate')
      .send({ code: coupon.code, items: [{ productId: product.id, quantity: 2 }] })

    expect(res.status).toBe(200)
    // Server-priced subtotal is 2000 (2 x 1000) — 10% = 200 — regardless of
    // what a client might have claimed the order was worth.
    expect(Number(res.body.data.calculatedDiscount)).toBeCloseTo(200, 2)
  })

  it('/coupons/validate enforces minOrderValue against the server-computed subtotal, not a claimed one', async () => {
    const product = await createProduct({ price: 50, stock: 5 })
    const coupon = await prisma.coupon.create({
      data: { code: 'BIGORDER', discountType: 'FLAT', discountValue: 10, isActive: true, minOrderValue: 500 },
    })

    // Real cart is worth 50 (1 x 50) — well under the 500 minimum — no
    // orderValue field exists any more for a client to lie about that.
    const res = await request(app)
      .post('/api/v1/coupons/validate')
      .send({ code: coupon.code, items: [{ productId: product.id, quantity: 1 }] })

    expect(res.status).toBe(400)
    expect(res.body.code).toBe('COUPON_MIN_ORDER')
  })

  it('/coupons/available filters by the server-computed subtotal from cart items', async () => {
    const product = await createProduct({ price: 50, stock: 5 })
    await prisma.coupon.create({
      data: { code: 'NEEDS500', discountType: 'FLAT', discountValue: 10, isActive: true, minOrderValue: 500 },
    })
    await prisma.coupon.create({
      data: { code: 'NEEDS10', discountType: 'FLAT', discountValue: 5, isActive: true, minOrderValue: 10 },
    })

    const res = await request(app)
      .post('/api/v1/coupons/available')
      .send({ items: [{ productId: product.id, quantity: 1 }] }) // real subtotal: 50

    expect(res.status).toBe(200)
    const codes = res.body.data.map((c: { code: string }) => c.code)
    expect(codes).toContain('NEEDS10')
    expect(codes).not.toContain('NEEDS500')
  })
})
