import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '../../src/utils/prisma'
import { getEffectiveAvailability } from '../../src/services/inventory.service'
import { createAddress, createProduct, createUser, resetDb } from '../helpers/factories'
import { getStoreConfig } from '../../src/utils/config'

beforeEach(async () => {
  await resetDb()
})

describe('getEffectiveAvailability (Phase 1)', () => {
  it('returns stock when no reservations exist', async () => {
    const product = await createProduct({ stock: 10 })

    const availability = await getEffectiveAvailability([product.id], 'user-1')

    expect(availability[product.id]).toBe(10)
  })

  it('reduces availability by unexpired reservation from another user', async () => {
    const product = await createProduct({ stock: 10 })
    const otherUser = await createUser()
    const config = getStoreConfig()

    // Create an active reservation from another user
    await prisma.stockReservation.create({
      data: {
        productId: product.id,
        userId: otherUser.id,
        quantity: 3,
        expiresAt: new Date(Date.now() + config.inventory.reservationDurationMinutes * 60_000),
        status: 'ACTIVE',
      },
    })

    const availability = await getEffectiveAvailability([product.id], 'user-1')

    // Stock 10 - other user's hold 3 = 7
    expect(availability[product.id]).toBe(7)
  })

  it('does not reduce availability by expired reservation', async () => {
    const product = await createProduct({ stock: 10 })
    const otherUser = await createUser()

    // Create an expired reservation
    await prisma.stockReservation.create({
      data: {
        productId: product.id,
        userId: otherUser.id,
        quantity: 3,
        expiresAt: new Date(Date.now() - 1000), // Already expired
        status: 'ACTIVE',
      },
    })

    const availability = await getEffectiveAvailability([product.id], 'user-1')

    // Expired reservation doesn't count; lazy expiry means we just ignore it
    expect(availability[product.id]).toBe(10)
  })

  it("does not reduce availability by requester's own active reservation", async () => {
    const product = await createProduct({ stock: 10 })
    const user = await createUser()
    const config = getStoreConfig()

    // Create an active reservation for the requester themselves
    await prisma.stockReservation.create({
      data: {
        productId: product.id,
        userId: user.id,
        quantity: 3,
        expiresAt: new Date(Date.now() + config.inventory.reservationDurationMinutes * 60_000),
        status: 'ACTIVE',
      },
    })

    const availability = await getEffectiveAvailability([product.id], user.id)

    // Requester's own hold doesn't count against them
    expect(availability[product.id]).toBe(10)
  })

  it('handles multiple products correctly', async () => {
    const product1 = await createProduct({ stock: 10 })
    const product2 = await createProduct({ stock: 20 })
    const otherUser = await createUser()
    const config = getStoreConfig()

    await prisma.stockReservation.create({
      data: {
        productId: product1.id,
        userId: otherUser.id,
        quantity: 4,
        expiresAt: new Date(Date.now() + config.inventory.reservationDurationMinutes * 60_000),
        status: 'ACTIVE',
      },
    })

    const availability = await getEffectiveAvailability(
      [product1.id, product2.id],
      'user-1'
    )

    expect(availability[product1.id]).toBe(6) // 10 - 4
    expect(availability[product2.id]).toBe(20) // No holds
  })

  it('handles session-based (guest) reservations', async () => {
    const product = await createProduct({ stock: 10 })
    const config = getStoreConfig()

    // Create a reservation with sessionId instead of userId (for guests)
    await prisma.stockReservation.create({
      data: {
        productId: product.id,
        sessionId: 'guest-session-123',
        quantity: 2,
        expiresAt: new Date(Date.now() + config.inventory.reservationDurationMinutes * 60_000),
        status: 'ACTIVE',
      },
    })

    const availability = await getEffectiveAvailability([product.id], 'user-1')

    // Guest's hold counts toward availability reduction for other requesters
    expect(availability[product.id]).toBe(8)
  })

  it("does not reduce availability by own session reservation", async () => {
    const product = await createProduct({ stock: 10 })
    const config = getStoreConfig()
    const guestSession = 'guest-session-123'

    // Create a reservation for a guest session
    await prisma.stockReservation.create({
      data: {
        productId: product.id,
        sessionId: guestSession,
        quantity: 2,
        expiresAt: new Date(Date.now() + config.inventory.reservationDurationMinutes * 60_000),
        status: 'ACTIVE',
      },
    })

    const availability = await getEffectiveAvailability([product.id], guestSession)

    // Same guest's own hold doesn't count against them
    expect(availability[product.id]).toBe(10)
  })

  it('excludeOrderId excludes only that order\'s own reservation, not the requester\'s other orders (P1-3)', async () => {
    const product = await createProduct({ stock: 1 })
    const user = await createUser()
    const address = await createAddress(user.id)

    const orderData = {
      userId: user.id,
      addressId: address.id,
      subtotal: 500,
      shippingCharge: 0,
      gstAmount: 0,
      total: 500,
    }
    const orderA = await prisma.order.create({ data: { ...orderData, orderNumber: 'ORD-A' } })
    const orderB = await prisma.order.create({ data: { ...orderData, orderNumber: 'ORD-B' } })

    // Two ACTIVE reservations for the same user on the same product, from
    // two different orders — the state payment confirmation must reason
    // about correctly when re-validating one of them.
    await prisma.stockReservation.create({
      data: {
        productId: product.id,
        userId: user.id,
        orderId: orderA.id,
        quantity: 1,
        expiresAt: new Date(Date.now() + 15 * 60_000),
        status: 'ACTIVE',
      },
    })
    await prisma.stockReservation.create({
      data: {
        productId: product.id,
        userId: user.id,
        orderId: orderB.id,
        quantity: 1,
        expiresAt: new Date(Date.now() + 15 * 60_000),
        status: 'ACTIVE',
      },
    })

    // Confirming order A must still see order B's hold on the same unit —
    // excluding by userId (the old, wrong behavior) would hide it and
    // report 1 available when the true remaining stock is 0.
    const availability = await getEffectiveAvailability([product.id], user.id, undefined, orderA.id)
    expect(availability[product.id]).toBe(0)
  })

  it('works inside a Prisma transaction', async () => {
    const product = await createProduct({ stock: 10 })
    const otherUser = await createUser()
    const config = getStoreConfig()

    const result = await prisma.$transaction(async (tx) => {
      await tx.stockReservation.create({
        data: {
          productId: product.id,
          userId: otherUser.id,
          quantity: 3,
          expiresAt: new Date(Date.now() + config.inventory.reservationDurationMinutes * 60_000),
          status: 'ACTIVE',
        },
      })

      return getEffectiveAvailability([product.id], 'user-1', tx)
    })

    expect(result[product.id]).toBe(7) // 10 - 3
  })
})
