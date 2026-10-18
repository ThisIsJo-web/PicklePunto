const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function setup() {
  console.log('1. Adding tables to supabase_realtime publication...');
  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      -- Add tables to realtime publication
      BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE bookings, court_blocks, courts;
      EXCEPTION WHEN duplicate_object THEN
        -- already added
      END;
    END $$;
  `);

  console.log('2. Setting up RLS policies...');
  // For users, allow authenticated and anon to SELECT
  const tables = [
    'users',
    'courts',
    'court_blocks',
    'bookings',
    'booking_participants',
    'booking_addons',
    'products',
    'facility_settings'
  ];

  for (const table of tables) {
    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        -- Drop existing policy if any
        EXECUTE 'DROP POLICY IF EXISTS "allow_read_all" ON ' || quote_ident('${table}');
        -- Create read policy for anon and authenticated
        EXECUTE 'CREATE POLICY "allow_read_all" ON ' || quote_ident('${table}') || ' FOR SELECT TO anon, authenticated USING (true)';
      END $$;
    `);
    console.log(`Policy created for ${table}`);
  }

  // Also set REPLICA IDENTITY FULL for bookings and court_blocks so Supabase Realtime sends full rows on UPDATE/DELETE
  await prisma.$executeRawUnsafe(`ALTER TABLE bookings REPLICA IDENTITY FULL;`);
  await prisma.$executeRawUnsafe(`ALTER TABLE court_blocks REPLICA IDENTITY FULL;`);
  console.log('REPLICA IDENTITY FULL set for realtime tables.');

  console.log('Setup completed successfully!');
}

setup().catch(console.error).finally(() => prisma.$disconnect());
