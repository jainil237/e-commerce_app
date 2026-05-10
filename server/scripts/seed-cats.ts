import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const cats = ['Groceries', 'Mobile', 'Clothes', 'Miscellaneous']
  for (const name of cats) {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
    await prisma.category.upsert({
      where: { slug },
      update: {},
      create: { name, slug, description: `${name} category` }
    })
  }
}
main().then(() => process.exit(0))
