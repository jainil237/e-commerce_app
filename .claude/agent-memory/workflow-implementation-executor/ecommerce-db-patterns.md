---
name: ecommerce-db-patterns
description: Database patterns and transaction locking used in the e-commerce API
metadata:
  type: reference
---

# Database Patterns — E-commerce API

## Pessimistic Locking Pattern (FOR UPDATE)

Used in mission-critical paths to prevent write skew and ensure atomic check-then-update operations.

**Pattern location:** `server/src/services/inventory.service.ts:116`
```typescript
const locked = await tx.$queryRaw<Array<{ id: string; name: string }>>(
  Prisma.sql`SELECT id, name FROM Product WHERE id = ${item.productId} FOR UPDATE`
)
const product = locked[0]
if (!product) throw error
```

**Applied to RMA transactions (Phase 1 fix):**
- `approveRmaRequest` — locks RMA before PENDING check
- `markReceived` — locks RMA before null check  
- `issueRefund` — locks RMA before PAID check (prevents double-refund)

**Key rules:**
- Lock a single row by primary key (no gap locks in TiDB)
- Lock BEFORE the status check, not after
- Remove `isolationLevel: Serializable` when adding explicit locks
- TiDB implements SERIALIZABLE as snapshot isolation — FOR UPDATE is required

## Storage Architecture

**File:** `server/src/services/storage.service.ts`
**Pattern:** Provider priority fallback (R2 → Cloudinary → fail in production)
**Phase 2 change:** Removed local fallback, added startup guard

## Environment-Aware Services

**Email:** `server/src/services/email.service.ts`
- Uses Nodemailer with SMTP fallback to MockTransporter
- Mock mode checks `PAYMENTS_MOCK=true` (set by test setup)
- Dev-only disk write guard (not in production)

**Payments:** `server/src/config/payments.ts`
- Mock mode gated by `PAYMENTS_MOCK` env var
- Test setup (`server/tests/setup.ts`) sets this to 'true'
- Production verification tests override for HMAC validation
