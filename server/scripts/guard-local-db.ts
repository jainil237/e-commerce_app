import path from 'node:path'
import dotenv from 'dotenv'
import { databaseHostFor, isLocalDatabaseHost } from './lib/local-db'

// Preflight for `npm run db:reset`, which runs `prisma migrate reset --force`
// — it drops every table and every row in DATABASE_URL with no confirmation
// prompt and no undo. Nothing else stood between that command and production:
// a dev machine whose server/.env holds the production connection string is
// one habitual command away from losing the database.
//
// The test harness has its own guard for the same reason. This one covers the
// path that harness never sees.
dotenv.config({ path: path.resolve(__dirname, '../.env') })

const url = process.env.DATABASE_URL

if (!url) {
  console.error('db:reset: DATABASE_URL is not set — refusing to run a destructive reset against an unknown target.')
  process.exit(1)
}

if (!isLocalDatabaseHost(url)) {
  console.error(
    `\ndb:reset refused.\n\n` +
      `  DATABASE_URL points at "${databaseHostFor(url)}", which is not a local database.\n` +
      `  This command runs "prisma migrate reset --force": every table dropped, every row gone, no prompt.\n\n` +
      `  Production credentials do not belong in server/.env. Move them to the host's\n` +
      `  environment and point DATABASE_URL at a local MySQL.\n\n` +
      `  If you genuinely mean to reset a remote database, run Prisma directly and own\n` +
      `  the consequences — this guard deliberately has no flag to disable it.\n`
  )
  process.exit(1)
}
