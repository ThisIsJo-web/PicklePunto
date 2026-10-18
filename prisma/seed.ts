import { PrismaClient, UserRole, ProductCategory } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting PicklePunto database seed...');

  // 1. Facility Settings (Finalized Decisions: single location, 12h grace, 4 courts)
  const settings = [
    { key: 'facility_name', value: 'PicklePunto Sports Club' },
    { key: 'cancellation_grace_hours', value: '12' },
    { key: 'court_count', value: '4' },
    { key: 'location_mode', value: 'SINGLE' },
    { key: 'ewallet_name', value: 'PicklePunto Pay' },
    { key: 'ewallet_number', value: '+1 (555) 742-5537' },
    { key: 'ewallet_qr_url', value: '/qr-placeholder.png' },
  ];

  for (const s of settings) {
    await prisma.facilitySetting.upsert({
      where: { key: s.key },
      update: { value: s.value },
      create: { key: s.key, value: s.value },
    });
  }
  console.log('✅ Facility settings seeded');

  // 2. Users (Admin, Staff, Player demo accounts)
  const users = [
    {
      id: '00000000-0000-0000-0000-000000000001',
      email: 'admin@picklepunto.com',
      fullName: 'PicklePunto Director',
      phone: '+1 555-0100',
      role: UserRole.ADMIN,
    },
    {
      id: '00000000-0000-0000-0000-000000000002',
      email: 'staff@picklepunto.com',
      fullName: 'Court Operations Staff',
      phone: '+1 555-0101',
      role: UserRole.STAFF,
    },
    {
      id: '00000000-0000-0000-0000-000000000003',
      email: 'player@picklepunto.com',
      fullName: 'Alex Morgan',
      phone: '+1 555-0102',
      role: UserRole.PLAYER,
    },
  ];

  for (const u of users) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: { fullName: u.fullName, phone: u.phone, role: u.role },
      create: u,
    });
  }
  console.log('✅ Users seeded');

  // 3. Courts (4 Initial courts with per-court operating hours — Decisions 1 & 7)
  const courts = [
    {
      id: '10000000-0000-0000-0000-000000000001',
      name: 'Court 1 — Center Court (Indoor)',
      surfaceType: 'Pro Cushion Acrylic',
      isActive: true,
      hourlyRate: 40.0,
      openingTime: '06:00',
      closingTime: '22:00',
    },
    {
      id: '10000000-0000-0000-0000-000000000002',
      name: 'Court 2 — North Court (Outdoor)',
      surfaceType: 'Hardcourt Acrylic',
      isActive: true,
      hourlyRate: 30.0,
      openingTime: '07:00',
      closingTime: '21:00',
    },
    {
      id: '10000000-0000-0000-0000-000000000003',
      name: 'Court 3 — South Court (Outdoor)',
      surfaceType: 'Hardcourt Acrylic',
      isActive: true,
      hourlyRate: 30.0,
      openingTime: '07:00',
      closingTime: '21:00',
    },
    {
      id: '10000000-0000-0000-0000-000000000004',
      name: 'Court 4 — Training Court (Indoor)',
      surfaceType: 'Modular Turf',
      isActive: true,
      hourlyRate: 25.0,
      openingTime: '08:00',
      closingTime: '20:00',
    },
  ];

  for (const c of courts) {
    await prisma.court.upsert({
      where: { id: c.id },
      update: {
        name: c.name,
        surfaceType: c.surfaceType,
        isActive: c.isActive,
        hourlyRate: c.hourlyRate,
        openingTime: c.openingTime,
        closingTime: c.closingTime,
      },
      create: c,
    });
  }
  console.log('✅ Courts seeded (4 courts with per-court hours)');

  // 4. Products (Add-ons & Inventory foundation)
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
      update: {
        name: p.name,
        category: p.category,
        price: p.price,
        stockQty: p.stockQty,
        lowStockThreshold: p.lowStockThreshold,
        sku: p.sku,
      },
      create: p,
    });
  }
  console.log('✅ Products seeded');

  console.log('🎉 PicklePunto database seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Error during seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
