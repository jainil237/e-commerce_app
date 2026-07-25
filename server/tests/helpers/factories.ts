import { randomUUID } from 'node:crypto'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import { prisma } from '../../src/utils/prisma'

// Deletes in FK-safe order (children before parents). Runs before each test
// so every test starts from an empty *_test schema without paying the cost
// of a full db push per test.
export async function resetDb() {
  await prisma.orderAuditLog.deleteMany()
  await prisma.rMAImage.deleteMany()
  await prisma.rMAItem.deleteMany()
  await prisma.refund.deleteMany()
  await prisma.shipment.deleteMany()
  await prisma.rMARequest.deleteMany()
  await prisma.stockReservation.deleteMany()
  await prisma.orderItem.deleteMany()
  await prisma.order.deleteMany()
  await prisma.couponUsage.deleteMany()
  await prisma.coupon.deleteMany()
  await prisma.wishlist.deleteMany()
  await prisma.refreshToken.deleteMany()
  await prisma.address.deleteMany()
  await prisma.productImage.deleteMany()
  await prisma.product.deleteMany()
  await prisma.category.deleteMany()
  await prisma.user.deleteMany()
}

export async function createUser(overrides: Partial<{ email: string; role: 'CUSTOMER' | 'ADMIN'; name: string }> = {}) {
  const passwordHash = await bcrypt.hash('Test@1234', 4) // low cost factor — this is a fixture, not a security surface
  return prisma.user.create({
    data: {
      name: overrides.name ?? 'Test User',
      email: overrides.email ?? `user-${randomUUID()}@example.test`,
      phone: `9${Math.floor(100000000 + Math.random() * 899999999)}`,
      passwordHash,
      role: overrides.role ?? 'CUSTOMER',
    },
  })
}

export async function createAddress(userId: string) {
  return prisma.address.create({
    data: {
      userId,
      label: 'Home',
      line1: '221B Baker Street',
      city: 'Metropolis',
      state: 'State',
      pincode: '400001',
    },
  })
}

export async function createCategory() {
  const id = randomUUID()
  return prisma.category.create({
    data: { name: `Category ${id}`, slug: `category-${id}` },
  })
}

export async function createProduct(overrides: Partial<{ price: number; stock: number; gstPercent: number; isActive: boolean }> = {}) {
  const category = await createCategory()
  const id = randomUUID()
  return prisma.product.create({
    data: {
      name: `Product ${id}`,
      slug: `product-${id}`,
      description: 'A test product',
      price: overrides.price ?? 1000,
      mrp: overrides.price ?? 1000,
      stock: overrides.stock ?? 10,
      sku: `SKU-${id}`,
      categoryId: category.id,
      isActive: overrides.isActive ?? true,
      gstPercent: overrides.gstPercent ?? 18,
    },
  })
}

// Mints the same access-token cookie `/auth/login` would issue, without
// calling the route — the shared in-memory rate limiter on `/auth/*` allows
// only 5 requests per 15 minutes outside NODE_ENV=development, and it is
// process-wide, so hitting the real login endpoint from every fixture would
// poison the rest of the suite. This still exercises the real
// `authenticate` middleware on every subsequent request; login itself keeps
// one dedicated test in checkout.test.ts.
export function authCookies(user: { id: string; email: string; role: string }) {
  const accessToken = jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET!,
    { expiresIn: '15m' }
  )
  return [`accessToken=${accessToken}`]
}
