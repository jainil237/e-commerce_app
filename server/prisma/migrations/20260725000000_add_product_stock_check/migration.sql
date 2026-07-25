-- Story 1.2 (oversell-race-fix): defence-in-depth invariant. The application-level fix in
-- order.routes.ts (guarded `updateMany` under a transaction) is the primary defence; this
-- constraint ensures `stock` cannot go negative through any future code path either.
--
-- Pre-flight verified before this migration was written: `SELECT COUNT(*) FROM Product WHERE
-- stock < 0` returned 0 on the dev DB, and the DB is MySQL 9.6.0 (CHECK constraints require
-- 8.0.16+). Not expressed in schema.prisma: Prisma does not support or introspect CHECK
-- constraints, so this migration is the only representation of it.
ALTER TABLE `Product` ADD CONSTRAINT `Product_stock_non_negative` CHECK (`stock` >= 0);
