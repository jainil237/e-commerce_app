import { execSync } from 'node:child_process'
import path from 'node:path'
import dotenv from 'dotenv'
import { resolveTestDatabaseUrl } from './helpers/test-db-url'

// globalSetup runs in its own process, separate from each test worker, and
// never imports src/config/env.ts — so DATABASE_URL isn't loaded yet. Load
// server/.env directly, the same file config/env.ts reads.
dotenv.config({ path: path.resolve(__dirname, '../.env') })

// Runs once, in the main process, before any test file's worker starts.
// Rebuilds the *_test schema from scratch on every run so tests never depend
// on leftover state from a previous run or another developer's machine.
//
// Uses `db push`, not `migrate deploy`: a database built purely from this
// repo's migrations is currently broken (CouponUsage has no creating
// migration, and migrations create `OrderItem` while the schema maps it to
// `orderitem`). Tracked as finding F1 in the plan, owned by a later chain
// (migration baseline). `db push` builds directly from schema.prisma and
// sidesteps the drift; switch back to `migrate deploy` once F1 is fixed.
export default async function globalSetup() {
  const testUrl = resolveTestDatabaseUrl() // throws if it can't derive a *_test-suffixed URL

  const schemaPath = path.resolve(__dirname, '../prisma/schema.prisma')

  execSync(
    `npx prisma db push --schema="${schemaPath}" --force-reset --accept-data-loss --skip-generate`,
    {
      cwd: path.resolve(__dirname, '..'),
      env: { ...process.env, DATABASE_URL: testUrl },
      stdio: 'pipe',
    }
  )
}
