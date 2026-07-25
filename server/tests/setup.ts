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

// server/.env carries a real-looking RAZORPAY_KEY_ID for local dev — force
// placeholder-shaped values here so the suite runs in mock mode by default
// regardless of the developer's local .env. Tests that specifically exercise
// signature verification override these two vars for the scope of one call,
// then restore them — see tests/security/payment-binding.test.ts.
process.env.RAZORPAY_KEY_ID = 'rzp_test_placeholder'
process.env.RAZORPAY_KEY_SECRET = 'rzp_test_placeholder_secret'
