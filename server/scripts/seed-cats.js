"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
async function main() {
    const cats = ['Groceries', 'Mobile', 'Clothes', 'Miscellaneous'];
    for (const name of cats) {
        const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        await prisma.category.upsert({
            where: { slug },
            update: {},
            create: { name, slug, description: `${name} category` }
        });
    }
}
main().then(() => process.exit(0));
//# sourceMappingURL=seed-cats.js.map