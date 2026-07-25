/**
 * Reproduces + verifies the checkout overselling race (Story 1.2, oversell-race-fix plan Phase 1).
 * Fires N concurrent POST /api/v1/orders for a product at stock = 1 and asserts exactly one
 * succeeds and final stock is 0 — never negative.
 *
 * Spawns its own server instance on an isolated port with RAZORPAY_KEY_ID forced to the
 * placeholder (mock order-creation path in order.routes.ts), so this never calls Razorpay and
 * never touches a developer's real keys. Creates and tears down its own user/category/product.
 *
 * ponytail: no test framework in this repo (server/scripts/check-webhook-signature.ts sets the
 * precedent), so plain asserts + a spawned process instead of supertest/msw.
 *
 * Run: npx tsx scripts/oversell-race-check.ts [concurrency]
 */
import assert from 'assert'
import { spawn, ChildProcess } from 'child_process'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const PORT = 4999
const BASE = `http://localhost:${PORT}/api/v1`
const CONCURRENCY = Number(process.argv[2]) || 10

const run = crypto.randomUUID().slice(0, 8)
const EMAIL = `oversell-check-${run}@test.local`
const PASSWORD = 'Test1234!'
// valid Indian mobile format (auth.routes.ts registerSchema: /^[6-9]\d{9}$/), randomized to avoid
// colliding with seeded/other test users
const PHONE = `9${Math.floor(100000000 + Math.random() * 899999999)}`

let server: ChildProcess | null = null

async function waitForServer(timeoutMs = 15000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://localhost:${PORT}/health`)
      if (res.ok) return
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 300))
  }
  throw new Error('server did not become healthy in time')
}

function startServer() {
  server = spawn('npx', ['tsx', 'src/index.ts'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(PORT),
      RAZORPAY_KEY_ID: 'rzp_test_placeholder',
      RAZORPAY_KEY_SECRET: 'rzp_test_placeholder',
    },
    stdio: 'ignore',
  })
}

function stopServer() {
  if (server && !server.killed) server.kill('SIGTERM')
}

function parseSetCookies(res: Response): string {
  const raw = res.headers.getSetCookie?.() ?? []
  return raw.map((c) => c.split(';')[0]).join('; ')
}

async function main() {
  console.log(`[oversell-race-check] run=${run} concurrency=${CONCURRENCY}`)

  startServer()
  try {
    await waitForServer()

    // Setup: category + product at stock = 1, directly via Prisma (test fixture, not the code
    // path under test).
    const category = await prisma.category.create({
      data: { name: `Oversell Check ${run}`, slug: `oversell-check-${run}` },
    })
    const product = await prisma.product.create({
      data: {
        name: `Oversell Check Product ${run}`,
        slug: `oversell-check-product-${run}`,
        description: 'race-condition fixture',
        price: 100,
        mrp: 100,
        stock: 1,
        sku: `OVR-${run}`,
        categoryId: category.id,
        isActive: true,
      },
    })

    // Register a user through the real route (also exercises cookie auth).
    const registerRes = await fetch(`${BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Oversell Check', email: EMAIL, phone: PHONE, password: PASSWORD }),
    })
    const registerBody = await registerRes.json()
    assert.strictEqual(registerRes.status, 201, `register failed: ${JSON.stringify(registerBody)}`)
    const cookie = parseSetCookies(registerRes)
    const userId = registerBody.data.user.id as string

    const address = await prisma.address.create({
      data: { userId, line1: '1 Race St', city: 'Testville', state: 'TS', pincode: '110001' },
    })

    // The actual code path under test: concurrent POST /orders for qty=1 against stock=1.
    const requests = Array.from({ length: CONCURRENCY }, () =>
      fetch(`${BASE}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({ items: [{ productId: product.id, quantity: 1 }], addressId: address.id }),
      })
    )
    const responses = await Promise.all(requests)
    const statuses = await Promise.all(
      responses.map(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }))
    )

    const successes = statuses.filter((s) => s.status === 201)
    const insufficientStock = statuses.filter(
      (s) => s.status === 400 && s.body?.code === 'INSUFFICIENT_STOCK'
    )
    const other = statuses.filter((s) => s.status !== 201 && s.body?.code !== 'INSUFFICIENT_STOCK')

    const finalProduct = await prisma.product.findUniqueOrThrow({ where: { id: product.id } })

    console.log(
      `[oversell-race-check] successes=${successes.length} insufficient_stock=${insufficientStock.length} ` +
        `other=${other.length} final_stock=${finalProduct.stock}`
    )
    if (other.length > 0) {
      console.log('[oversell-race-check] unexpected responses:', JSON.stringify(other, null, 2))
    }

    // Cleanup fixtures before asserting, so a failed assertion doesn't leak test data.
    await prisma.orderItem.deleteMany({ where: { productId: product.id } })
    await prisma.order.deleteMany({ where: { userId } })
    await prisma.address.deleteMany({ where: { userId } })
    await prisma.refreshToken.deleteMany({ where: { userId } })
    await prisma.user.delete({ where: { id: userId } })
    await prisma.product.delete({ where: { id: product.id } })
    await prisma.category.delete({ where: { id: category.id } })

    assert.strictEqual(successes.length, 1, `expected exactly 1 success, got ${successes.length}`)
    assert.strictEqual(finalProduct.stock, 0, `expected final stock 0, got ${finalProduct.stock}`)
    assert.ok(finalProduct.stock >= 0, 'stock went negative')

    console.log('[oversell-race-check] PASS — no oversell')
  } finally {
    stopServer()
    await prisma.$disconnect()
  }
}

main().catch((err) => {
  console.error('[oversell-race-check] FAIL —', err.message)
  stopServer()
  prisma.$disconnect().finally(() => process.exit(1))
})
