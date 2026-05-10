"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const bcrypt_1 = __importDefault(require("bcrypt"));
const client_1 = require("@prisma/client");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const prisma = new client_1.PrismaClient();
async function main() {
    console.log('🌱 Starting seed...');
    // Load store config
    const configPath = path_1.default.join(process.cwd(), '..', 'config', 'store.config.json');
    const config = JSON.parse(fs_1.default.readFileSync(configPath, 'utf-8'));
    // Create admin user
    const adminPasswordHash = await bcrypt_1.default.hash('Admin@123', 12);
    const admin = await prisma.user.upsert({
        where: { email: 'admin@store.in' },
        update: {},
        create: {
            name: 'Admin',
            email: 'admin@store.in',
            phone: '9999999999',
            passwordHash: adminPasswordHash,
            role: 'ADMIN',
        },
    });
    console.log('✅ Created admin user:', admin.email);
    // Create categories
    const categories = [
        { name: 'Electronics', slug: 'electronics', description: 'Electronic gadgets and devices' },
        { name: 'Fashion', slug: 'fashion', description: 'Clothing and accessories' },
        { name: 'Home & Kitchen', slug: 'home-kitchen', description: 'Home essentials and kitchenware' },
        { name: 'Beauty & Personal Care', slug: 'beauty-personal-care', description: 'Beauty products and personal care items' },
        { name: 'Sports & Fitness', slug: 'sports-fitness', description: 'Sports equipment and fitness gear' },
        { name: 'Books', slug: 'books', description: 'Books and stationery' },
    ];
    for (const category of categories) {
        await prisma.category.upsert({
            where: { slug: category.slug },
            update: {},
            create: category,
        });
    }
    console.log('✅ Created categories:', categories.length);
    // Create sample products
    const productsData = [
        {
            name: 'Wireless Bluetooth Headphones',
            slug: 'wireless-bluetooth-headphones',
            description: 'High-quality wireless headphones with active noise cancellation, 30-hour battery life, and premium sound quality.',
            price: 2499,
            mrp: 3999,
            stock: 50,
            sku: 'WBH-001',
            categorySlug: 'electronics',
            isFeatured: true,
            gstPercent: 18,
        },
        {
            name: 'Smart Fitness Watch',
            slug: 'smart-fitness-watch',
            description: 'Track your health and fitness with this smartwatch featuring heart rate monitoring, GPS, and 7-day battery life.',
            price: 3999,
            mrp: 5999,
            stock: 30,
            sku: 'SFW-001',
            categorySlug: 'electronics',
            isFeatured: true,
            gstPercent: 18,
        },
        {
            name: 'Premium Cotton T-Shirt',
            slug: 'premium-cotton-tshirt',
            description: '100% organic cotton t-shirt with a comfortable fit. Available in multiple colors and sizes.',
            price: 599,
            mrp: 999,
            stock: 100,
            sku: 'PCT-001',
            categorySlug: 'fashion',
            isFeatured: true,
            gstPercent: 5,
        },
        {
            name: 'Stainless Steel Water Bottle',
            slug: 'stainless-steel-water-bottle',
            description: 'Double-walled insulated water bottle that keeps drinks cold for 24 hours or hot for 12 hours.',
            price: 449,
            mrp: 799,
            stock: 75,
            sku: 'SSW-001',
            categorySlug: 'home-kitchen',
            isFeatured: false,
            gstPercent: 18,
        },
        {
            name: 'Yoga Mat Premium',
            slug: 'yoga-mat-premium',
            description: 'Non-slip yoga mat with extra cushioning for comfort during workouts. 6mm thickness.',
            price: 899,
            mrp: 1499,
            stock: 40,
            sku: 'YMP-001',
            categorySlug: 'sports-fitness',
            isFeatured: true,
            gstPercent: 18,
        },
        {
            name: 'Natural Face Moisturizer',
            slug: 'natural-face-moisturizer',
            description: 'Organic face moisturizer with aloe vera and vitamin E. Suitable for all skin types.',
            price: 349,
            mrp: 499,
            stock: 60,
            sku: 'NFM-001',
            categorySlug: 'beauty-personal-care',
            isFeatured: false,
            gstPercent: 18,
        },
        {
            name: 'Bestseller Novel Collection',
            slug: 'bestseller-novel-collection',
            description: 'Collection of 5 bestselling novels from award-winning authors. Perfect for book lovers.',
            price: 699,
            mrp: 1299,
            stock: 25,
            sku: 'BNC-001',
            categorySlug: 'books',
            isFeatured: false,
            gstPercent: 0,
        },
        {
            name: 'Wireless Charging Pad',
            slug: 'wireless-charging-pad',
            description: 'Fast wireless charging pad compatible with all Qi-enabled devices. Sleek and compact design.',
            price: 999,
            mrp: 1799,
            stock: 45,
            sku: 'WCP-001',
            categorySlug: 'electronics',
            isFeatured: true,
            gstPercent: 18,
        },
    ];
    for (const productData of productsData) {
        const category = await prisma.category.findUnique({
            where: { slug: productData.categorySlug },
        });
        if (category) {
            await prisma.product.upsert({
                where: { slug: productData.slug },
                update: {},
                create: {
                    name: productData.name,
                    slug: productData.slug,
                    description: productData.description,
                    price: productData.price,
                    mrp: productData.mrp,
                    stock: productData.stock,
                    sku: productData.sku,
                    categoryId: category.id,
                    isFeatured: productData.isFeatured,
                    gstPercent: productData.gstPercent,
                    isActive: true,
                },
            });
        }
    }
    console.log('✅ Created products:', productsData.length);
    // Create sample coupon
    await prisma.coupon.upsert({
        where: { code: 'WELCOME10' },
        update: {},
        create: {
            code: 'WELCOME10',
            discountType: 'PERCENTAGE',
            discountValue: 10,
            minOrderValue: 500,
            maxUsage: 1000,
            isActive: true,
        },
    });
    console.log('✅ Created coupon: WELCOME10');
    console.log('🎉 Seed completed successfully!');
    console.log('\n📝 Admin credentials:');
    console.log('   Email: admin@store.in');
    console.log('   Password: Admin@123');
}
main()
    .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
})
    .finally(async () => {
    await prisma.$disconnect();
});
//# sourceMappingURL=seed.js.map