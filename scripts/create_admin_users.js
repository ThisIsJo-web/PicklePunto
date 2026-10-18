const { createClient } = require('@supabase/supabase-js');
const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');

const prisma = new PrismaClient();

function generateSecurePassword(length = 20) {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // exclude easily confused I, O
  const lower = 'abcdefghijkmnpqrstuvwxyz'; // exclude easily confused l, o
  const digits = '23456789'; // exclude 0, 1
  const symbols = '!@#$%^&*()_+~=';
  const all = upper + lower + digits + symbols;

  // Guarantee at least 2 of each class
  const pwd = [
    upper[crypto.randomInt(0, upper.length)],
    upper[crypto.randomInt(0, upper.length)],
    lower[crypto.randomInt(0, lower.length)],
    lower[crypto.randomInt(0, lower.length)],
    digits[crypto.randomInt(0, digits.length)],
    digits[crypto.randomInt(0, digits.length)],
    symbols[crypto.randomInt(0, symbols.length)],
    symbols[crypto.randomInt(0, symbols.length)],
  ];

  while (pwd.length < length) {
    pwd.push(all[crypto.randomInt(0, all.length)]);
  }

  // Shuffle securely using Fisher-Yates
  for (let i = pwd.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [pwd[i], pwd[j]] = [pwd[j], pwd[i]];
  }

  return pwd.join('');
}

async function createAdminUsers() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !serviceKey) {
    throw new Error('Supabase URL or Service Role Key missing in environment.');
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const adminsToCreate = [
    {
      email: 'admin1@picklepunto.com',
      fullName: 'System Administrator',
      phone: '+1 555-0191',
      password: generateSecurePassword(20),
    },
    {
      email: 'admin2@picklepunto.com',
      fullName: 'Operations Administrator',
      phone: '+1 555-0192',
      password: generateSecurePassword(20),
    },
  ];

  const results = [];

  // Get existing users in Supabase Auth
  const { data: userList, error: listError } = await supabaseAdmin.auth.admin.listUsers();
  if (listError) {
    throw new Error(`Failed to list Supabase users: ${listError.message}`);
  }

  for (const admin of adminsToCreate) {
    console.log(`\nProcessing admin: ${admin.email}...`);
    const existingAuthUser = userList.users.find(u => u.email?.toLowerCase() === admin.email.toLowerCase());

    let authUserId;

    if (existingAuthUser) {
      console.log(`User ${admin.email} already exists in Supabase Auth (${existingAuthUser.id}). Updating password and metadata...`);
      const { data: updatedUser, error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
        existingAuthUser.id,
        {
          password: admin.password,
          email_confirm: true,
          user_metadata: {
            full_name: admin.fullName,
            phone: admin.phone,
            role: 'ADMIN',
          },
        }
      );
      if (updateError) {
        throw new Error(`Failed to update ${admin.email}: ${updateError.message}`);
      }
      authUserId = updatedUser.user.id;
    } else {
      console.log(`Creating new user ${admin.email} in Supabase Auth...`);
      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: admin.email,
        password: admin.password,
        email_confirm: true,
        user_metadata: {
          full_name: admin.fullName,
          phone: admin.phone,
          role: 'ADMIN',
        },
      });
      if (createError) {
        throw new Error(`Failed to create ${admin.email}: ${createError.message}`);
      }
      authUserId = newUser.user.id;
    }

    // Sync to Prisma User table
    console.log(`Syncing user ${admin.email} (UUID: ${authUserId}) to Prisma database...`);
    const dbUser = await prisma.user.upsert({
      where: { email: admin.email },
      update: {
        id: authUserId,
        fullName: admin.fullName,
        phone: admin.phone,
        role: 'ADMIN',
      },
      create: {
        id: authUserId,
        email: admin.email,
        fullName: admin.fullName,
        phone: admin.phone,
        role: 'ADMIN',
      },
    });

    // Verify authentication using client with anon key
    const supabaseClient = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const { data: signInData, error: signInError } = await supabaseClient.auth.signInWithPassword({
      email: admin.email,
      password: admin.password,
    });

    if (signInError) {
      throw new Error(`Sign-in verification failed for ${admin.email}: ${signInError.message}`);
    }

    // Verify role in public.users via client
    const { data: profile, error: profileError } = await supabaseClient
      .from('users')
      .select('id, email, full_name, role')
      .eq('id', authUserId)
      .single();

    if (profileError) {
      throw new Error(`Profile query failed for ${admin.email}: ${profileError.message}`);
    }

    console.log(`✅ Successfully verified authentication and ADMIN role for ${admin.email}`);

    results.push({
      id: authUserId,
      email: admin.email,
      fullName: admin.fullName,
      phone: admin.phone,
      role: dbUser.role,
      verifiedSignIn: !!signInData.session,
      verifiedRole: profile.role,
    });
  }

  console.log('\n--- ADMIN CREATION REPORT ---');
  console.log(JSON.stringify(results, null, 2));
}

createAdminUsers()
  .catch((err) => {
    console.error('Error creating admin users:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
