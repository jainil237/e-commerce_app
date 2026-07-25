// Vitest setupFile — runs once per worker, before any test file in that
// worker imports application code. This file must NOT statically import
// anything from `../src`: ES module imports are evaluated before the rest of
// this file's top-level code runs, and `src/config/env.ts` calls
// `dotenv.config()` on first import, which does not overwrite variables that
// are already set. So the env overrides below have to land before `src/`
// loads at all, which means they must be set with zero src imports ahead of
// them in this file.
import { resolveTestDatabaseUrl } from './helpers/test-db-url'

process.env.NODE_ENV = 'test'
process.env.DATABASE_URL = resolveTestDatabaseUrl()

// Mock mode (server/src/config/payments.ts) is decided solely by this flag
// as of plan Phase 2 — RAZORPAY_KEY_ID/SECRET are irrelevant to that
// decision now, so the suite runs in mock mode by default regardless of
// whatever real-looking values server/.env provides for local dev. Tests
// that specifically exercise signature verification override this flag for
// the scope of one call, then restore it — see
// tests/security/payment-binding.test.ts.
process.env.PAYMENTS_MOCK = 'true'
