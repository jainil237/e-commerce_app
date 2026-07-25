import path from 'path'
import dotenv from 'dotenv'
import { assertRequiredPaymentEnv } from './payments'

// Always load backend env from server/.env regardless of the launch directory.
dotenv.config({ path: path.resolve(__dirname, '../../.env') })

// Fails the boot as early as possible — this module is imported before
// almost anything else (utils/prisma, every route file). A production
// deploy missing required payment env vars must never come up serving
// traffic; a crashed deploy is the correct outcome here, not a warning.
try {
  assertRequiredPaymentEnv()
} catch (error) {
  console.error('❌', (error as Error).message)
  process.exit(1)
}
