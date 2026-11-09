/**
 * Development seed: one merchant in onboarding (test mode works immediately)
 * with a fake-provider test account, a test API key, and four demo logins
 * covering every audience the dashboard supports (`src/config/access.ts`):
 *
 *   super_admin  → platform admin, full access.
 *   admin        → platform admin (same screens, kept distinct for audit).
 *   staff        → platform staff, view-only operations.
 *   owner        → tenant owner of the demo merchant (merchant_onboarding until
 *                  the gateway approves KYB; then merchant).
 *
 * No real or sensitive data. Refuses to run in staging / production.
 *
 *   npm run db:seed
 */
import { PrismaClient } from '@prisma/client';
import { Argon2PasswordHasher } from '../src/modules/identity-access/infrastructure/argon2-password-hasher';
import { formatApiKey } from '../src/modules/api-credentials/application/api-key-format';
import { HmacApiKeySecretHasher } from '../src/modules/api-credentials/infrastructure/hmac-api-key-secret-hasher';
import { randomBase62 } from '../src/shared/infrastructure/system/random-id-generator';

const MERCHANT_ID = 'mer_devseed000000000000000001';
const OWNER_EMAIL = 'owner@example.test';
const SUPER_ADMIN_EMAIL = 'reply.vipinrai@gmail.com';
const ADMIN_EMAIL = 'admin@example.test';
const STAFF_EMAIL = 'staff@example.test';

async function main(): Promise<void> {
  const env = process.env.NODE_ENV ?? 'development';
  if (env !== 'development' && env !== 'test') {
    throw new Error(`Refusing to seed in NODE_ENV=${env}.`);
  }
  const pepper = process.env.SECRET_API_KEY_PEPPER;
  if (!pepper) throw new Error('SECRET_API_KEY_PEPPER must be set (see .env.example).');

  const prisma = new PrismaClient();
  try {
    await prisma.merchant.upsert({
      where: { id: MERCHANT_ID },
      update: {},
      create: {
        id: MERCHANT_ID,
        legalName: 'Example Coffee Roasters LLC',
        displayName: 'Example Coffee',
        status: 'onboarding',
        liveChargesEnabled: false,
      },
    });

    await prisma.merchantProviderAccount.upsert({
      where: { merchantId_mode: { merchantId: MERCHANT_ID, mode: 'test' } },
      update: {},
      create: {
        id: `mpa_${randomBase62(24)}`,
        merchantId: MERCHANT_ID,
        provider: 'fake',
        mode: 'test',
        providerAccountId: 'fake_acc_devseed',
        providerStatus: 'approved',
      },
    });

    // Rotate: revoke previous seed keys, issue a fresh one, print it once.
    await prisma.apiKey.updateMany({
      where: { merchantId: MERCHANT_ID, label: 'dev-seed', revokedAt: null },
      data: { revokedAt: new Date() },
    });
    const keyId = `key_${randomBase62(24)}`;
    const secret = randomBase62(40);
    await prisma.apiKey.create({
      data: {
        id: keyId,
        merchantId: MERCHANT_ID,
        mode: 'test',
        label: 'dev-seed',
        secretHash: new HmacApiKeySecretHasher(pepper).hash(secret),
        last4: secret.slice(-4),
      },
    });

    // Dashboard logins: fresh random passwords on every run, printed once.
    const passwords = new Argon2PasswordHasher();
    const ownerPassword = randomBase62(20);
    const superAdminPassword = randomBase62(20);
    const adminPassword = randomBase62(20);
    const staffPassword = randomBase62(20);
    const now = new Date();
    const owner = await prisma.user.upsert({
      where: { email: OWNER_EMAIL },
      update: {
        name: 'Example Owner',
        passwordHash: await passwords.hash(ownerPassword),
        failedLoginCount: 0,
        lockedUntil: null,
      },
      create: {
        id: `usr_${randomBase62(24)}`,
        email: OWNER_EMAIL,
        name: 'Example Owner',
        passwordHash: await passwords.hash(ownerPassword),
        createdAt: now,
        updatedAt: now,
      },
    });
    // Super admin: distinct account from `admin` for audit, same screens.
    await prisma.user.upsert({
      where: { email: SUPER_ADMIN_EMAIL },
      update: {
        name: 'Vipin Rai',
        passwordHash: await passwords.hash(superAdminPassword),
        isPlatformAdmin: true,
        platformRole: 'super_admin',
      },
      create: {
        id: `usr_${randomBase62(24)}`,
        email: SUPER_ADMIN_EMAIL,
        name: 'Vipin Rai',
        passwordHash: await passwords.hash(superAdminPassword),
        isPlatformAdmin: true,
        platformRole: 'super_admin',
        createdAt: now,
        updatedAt: now,
      },
    });
    await prisma.user.upsert({
      where: { email: ADMIN_EMAIL },
      update: {
        name: 'Nimbus Admin',
        passwordHash: await passwords.hash(adminPassword),
        isPlatformAdmin: true,
        platformRole: 'admin',
      },
      create: {
        id: `usr_${randomBase62(24)}`,
        email: ADMIN_EMAIL,
        name: 'Nimbus Admin',
        passwordHash: await passwords.hash(adminPassword),
        isPlatformAdmin: true,
        platformRole: 'admin',
        createdAt: now,
        updatedAt: now,
      },
    });
    // Staff: view-only on configuration pages per PRD §3 (dashboard-FE
    // `canManage` returns false for this audience).
    await prisma.user.upsert({
      where: { email: STAFF_EMAIL },
      update: {
        name: 'Nimbus Staff',
        passwordHash: await passwords.hash(staffPassword),
        isPlatformAdmin: false,
        platformRole: 'staff',
      },
      create: {
        id: `usr_${randomBase62(24)}`,
        email: STAFF_EMAIL,
        name: 'Nimbus Staff',
        passwordHash: await passwords.hash(staffPassword),
        isPlatformAdmin: false,
        platformRole: 'staff',
        createdAt: now,
        updatedAt: now,
      },
    });
    await prisma.membership.upsert({
      where: { userId_merchantId: { userId: owner.id, merchantId: MERCHANT_ID } },
      update: {},
      create: {
        id: `mem_${randomBase62(24)}`,
        userId: owner.id,
        merchantId: MERCHANT_ID,
        role: 'owner',
        createdAt: now,
        updatedAt: now,
      },
    });
    await prisma.onboardingApplication.upsert({
      where: { merchantId: MERCHANT_ID },
      update: {},
      create: {
        id: `onb_${randomBase62(24)}`,
        merchantId: MERCHANT_ID,
        status: 'draft',
        legalBusinessName: 'Example Coffee Roasters LLC',
        createdAt: now,
        updatedAt: now,
      },
    });

    console.log(`Seeded merchant ${MERCHANT_ID}`);
    console.log('');
    console.log('Dashboard logins (first run only; passwords are rotated on every seed):');
    console.log(`  super_admin: ${SUPER_ADMIN_EMAIL} / ${superAdminPassword}`);
    console.log(`  admin:       ${ADMIN_EMAIL}        / ${adminPassword}`);
    console.log(`  staff:       ${STAFF_EMAIL}        / ${staffPassword}`);
    console.log(`  merchant:    ${OWNER_EMAIL}        / ${ownerPassword}`);
    console.log('');
    console.log(`Test API key (shown once): ${formatApiKey('test', keyId, secret)}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
