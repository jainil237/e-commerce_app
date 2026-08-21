import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '../../src/utils/prisma'
import { sweepExpiredReservations } from '../../src/services/inventory.service'
import { createProduct, createUser, resetDb } from '../helpers/factories'

beforeEach(async () => {
  await resetDb()
})

const makeReservation = async (
  productId: string,
  userId: string,
  opts: { minutesFromNow: number; status?: 'ACTIVE' | 'CONVERTED' | 'RELEASED' }
) =>
  prisma.stockReservation.create({
    data: {
      productId,
      userId,
      quantity: 1,
      expiresAt: new Date(Date.now() + opts.minutesFromNow * 60_000),
      status: opts.status ?? 'ACTIVE',
    },
  })

describe('sweepExpiredReservations (RI5)', () => {
  it('marks lapsed ACTIVE reservations EXPIRED and leaves live ones alone', async () => {
    const product = await createProduct({ stock: 10 })
    const user = await createUser()

    const lapsed = await makeReservation(product.id, user.id, { minutesFromNow: -5 })
    const live = await makeReservation(product.id, user.id, { minutesFromNow: 10 })

    const count = await sweepExpiredReservations()

    expect(count).toBe(1)
    expect((await prisma.stockReservation.findUnique({ where: { id: lapsed.id } }))?.status).toBe('EXPIRED')
    expect((await prisma.stockReservation.findUnique({ where: { id: live.id } }))?.status).toBe('ACTIVE')
  })

  it('does not touch CONVERTED or RELEASED reservations even when lapsed', async () => {
    const product = await createProduct({ stock: 10 })
    const user = await createUser()

    // A CONVERTED reservation already decremented stock; re-expiring it would
    // corrupt the audit trail and risk double-restoring inventory later.
    const converted = await makeReservation(product.id, user.id, { minutesFromNow: -60, status: 'CONVERTED' })
    const released = await makeReservation(product.id, user.id, { minutesFromNow: -60, status: 'RELEASED' })

    const count = await sweepExpiredReservations()

    expect(count).toBe(0)
    expect((await prisma.stockReservation.findUnique({ where: { id: converted.id } }))?.status).toBe('CONVERTED')
    expect((await prisma.stockReservation.findUnique({ where: { id: released.id } }))?.status).toBe('RELEASED')
  })

  it('never changes Product.stock — an ACTIVE hold was never decremented', async () => {
    const product = await createProduct({ stock: 10 })
    const user = await createUser()
    await makeReservation(product.id, user.id, { minutesFromNow: -5 })

    await sweepExpiredReservations()

    expect((await prisma.product.findUnique({ where: { id: product.id } }))?.stock).toBe(10)
  })

  it('is idempotent — a second sweep finds nothing left to do', async () => {
    const product = await createProduct({ stock: 10 })
    const user = await createUser()
    await makeReservation(product.id, user.id, { minutesFromNow: -5 })

    expect(await sweepExpiredReservations()).toBe(1)
    expect(await sweepExpiredReservations()).toBe(0)
  })
})
