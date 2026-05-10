import '../config/env';
import { PrismaClient } from '@prisma/client';
declare const prisma: PrismaClient<{
    log: ("info" | "query" | "warn" | "error")[];
}, never, import("@prisma/client/runtime/library").DefaultArgs>;
export { prisma };
//# sourceMappingURL=prisma.d.ts.map