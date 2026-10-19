const { PrismaClient, ProductCategory } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const courts = [
    {
      id: '10000000-0000-0000-0000-000000000001',
      name: 'Court 1 - Center Court (Indoor)',
      surfaceType: 'Pro Cushion Acrylic',
      isActive: true,
      hourlyRate: 40.0,
      openingTime: '05:00',
      closingTime: '02:00',
    },
    {
      id: '10000000-0000-0000-0000-000000000002',
      name: 'Court 2 - North Court (Outdoor)',
      surfaceType: 'Hardcourt Acrylic',
      isActive: true,
      hourlyRate: 30.0,
      openingTime: '05:00',
      closingTime: '02:00',
    },
    {
      id: '10000000-0000-0000-0000-000000000003',
      name: 'Court 3 - South Court (Outdoor)',
      surfaceType: 'Hardcourt Acrylic',
      isActive: true,
      hourlyRate: 30.0,
      openingTime: '05:00',
      closingTime: '02:00',
    },
    {
      id: '10000000-0000-0000-0000-000000000004',
      name: 'Court 4 - Training Court (Indoor)',
      surfaceType: 'Modular Turf',
      isActive: true,
      hourlyRate: 25.0,
      openingTime: '05:00',
      closingTime: '02:00',
    },
  ];

  for (const c of courts) {
    await prisma.court.upsert({
      where: { id: c.id },
      update: c,
      create: c,
    });
  }
  console.log('✅ 4 Courts seeded');

  const products = [
    {
      id: '20000000-0000-0000-0000-000000000001',
      name: 'Pro Paddle Rental (Carbon Fiber)',
      category: ProductCategory.RENTAL,
      price: 5.0,
      stockQty: 30,
      lowStockThreshold: 5,
      sku: 'RENT-PAD-01',
    },
    {
      id: '20000000-0000-0000-0000-000000000002',
      name: 'Pickleball Can (3-Pack Dura Fast 40)',
      category: ProductCategory.RETAIL,
      price: 9.5,
      stockQty: 50,
      lowStockThreshold: 10,
      sku: 'RET-BALL-03',
    },
    {
      id: '20000000-0000-0000-0000-000000000003',
      name: 'Electrolyte Sports Drink (500ml)',
      category: ProductCategory.FOOD_DRINK,
      price: 3.5,
      stockQty: 100,
      lowStockThreshold: 20,
      sku: 'FD-DRK-01',
    },
    {
      id: '20000000-0000-0000-0000-000000000004',
      name: 'Mineral Spring Water (500ml)',
      category: ProductCategory.FOOD_DRINK,
      price: 2.0,
      stockQty: 120,
      lowStockThreshold: 25,
      sku: 'FD-WTR-02',
    },
    {
      id: '20000000-0000-0000-0000-000000000005',
      name: 'Whey Protein Bar (Chocolate Crunch)',
      category: ProductCategory.FOOD_DRINK,
      price: 3.75,
      stockQty: 60,
      lowStockThreshold: 15,
      sku: 'FD-BAR-03',
    },
    {
      id: '20000000-0000-0000-0000-000000000006',
      name: 'PicklePunto Tour Pro Grip Tape (3-Pack)',
      category: ProductCategory.RETAIL,
      price: 6.0,
      stockQty: 45,
      lowStockThreshold: 10,
      sku: 'RET-GRP-04',
    },
    {
      id: '20000000-0000-0000-0000-000000000007',
      name: 'Microfiber Tournament Court Towel',
      category: ProductCategory.RETAIL,
      price: 12.0,
      stockQty: 30,
      lowStockThreshold: 5,
      sku: 'RET-TWL-05',
    },
    {
      id: '20000000-0000-0000-0000-000000000008',
      name: 'Ball Machine Rental (60 Mins)',
      category: ProductCategory.RENTAL,
      price: 15.0,
      stockQty: 3,
      lowStockThreshold: 1,
      sku: 'RENT-MCH-02',
    },
  ];

  for (const p of products) {
    await prisma.product.upsert({
      where: { id: p.id },
      update: p,
      create: p,
    });
  }
  console.log('✅ 8 Products seeded');
}

run()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
