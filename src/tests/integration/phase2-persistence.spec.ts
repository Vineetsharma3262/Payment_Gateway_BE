import { Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/infrastructure/database/prisma.service';
import { PrismaUnitOfWork } from '../../shared/infrastructure/database/prisma-unit-of-work';
import { TransactionHost } from '../../shared/infrastructure/database/transaction-host';
import { RandomIdGenerator } from '../../shared/infrastructure/system/random-id-generator';
import { SystemClock } from '../../shared/infrastructure/system/system-clock';
import { ConcurrencyConflictError } from '../../shared/application/application-error';
import { PrismaAuditLog } from '../../modules/audit/infrastructure/prisma-audit-log';
import { RefreshSession } from '../../modules/identity-access/domain/refresh-session';
import { User } from '../../modules/identity-access/domain/user';
import {
  PrismaSessionRepository,
  PrismaUserRepository,
} from '../../modules/identity-access/infrastructure/prisma-identity.repositories';
import { Merchant } from '../../modules/merchants/domain/merchant';
import { PrismaMerchantRepository } from '../../modules/merchants/infrastructure/prisma-merchant.repository';
import { Membership } from '../../modules/team-access/domain/membership';
import { PrismaMembershipRepository } from '../../modules/team-access/infrastructure/prisma-team.repositories';

/** Requires INTEGRATION_DATABASE_URL pointing at a migrated database (see postgres-persistence.spec.ts). */
const url = process.env.INTEGRATION_DATABASE_URL;
const describeDb = url ? describe : describe.skip;

describeDb('Phase 2 persistence (integration)', () => {
  let prisma: PrismaService;
  let host: TransactionHost;
  let uow: PrismaUnitOfWork;
  const ids = new RandomIdGenerator();
  const clock = new SystemClock();

  beforeAll(async () => {
    prisma = new PrismaService({ datasources: { db: { url } } });
    await prisma.$connect();
    host = new TransactionHost(prisma);
    uow = new PrismaUnitOfWork(prisma, host);
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      'TRUNCATE audit_records, api_request_logs, onboarding_documents, onboarding_applications, invitations, memberships, password_reset_tokens, refresh_tokens, users, outbox_events, idempotency_records, provider_resource_mappings, orders, api_keys, merchant_provider_accounts, merchants CASCADE',
    );
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('audit records are append-only at the database level', async () => {
    const audit = new PrismaAuditLog(host, ids, clock);
    await audit.record({
      merchantId: null,
      actor: { type: 'system', id: 'test' },
      action: 'x',
      resource: { type: 't', id: 'i' },
    });
    await expect(prisma.auditRecord.updateMany({ data: { action: 'tampered' } })).rejects.toThrow(
      /append-only/,
    );
    await expect(prisma.auditRecord.deleteMany({})).rejects.toThrow(/append-only/);
  });

  it('refresh-token rotation is compare-and-set under concurrency', async () => {
    const users = new PrismaUserRepository(host);
    const user = User.register({
      id: ids.next('usr'),
      email: 'a@b.co',
      passwordHash: '$argon2id$v=19$x',
      now: new Date(),
    });
    await users.insert(user);
    const sessions = new PrismaSessionRepository(host);
    const session = RefreshSession.issue({
      id: ids.next('ses'),
      userId: user.id,
      familyId: ids.next('fam'),
      merchantId: null,
      tokenHash: 'a'.repeat(64),
      expiresAt: new Date(Date.now() + 3600_000),
      createdAt: new Date(),
    });
    await sessions.insert(session);
    const results = await Promise.all(
      Array.from({ length: 5 }, () => sessions.markRotated(session.id, new Date())),
    );
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it('enforces lower-case emails, argon2id hashes and optimistic versions on users', async () => {
    await expect(
      prisma.user.create({
        data: {
          id: 'usr_bad',
          email: 'Upper@B.co',
          passwordHash: '$argon2id$x',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      }),
    ).rejects.toThrow(/users_email_lowercase/);
    await expect(
      prisma.user.create({
        data: {
          id: 'usr_bad2',
          email: 'x@b.co',
          passwordHash: 'plaintext',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      }),
    ).rejects.toThrow(/users_password_argon2id/);

    const users = new PrismaUserRepository(host);
    const user = User.register({
      id: ids.next('usr'),
      email: 'v@b.co',
      passwordHash: '$argon2id$v=19$x',
      now: new Date(),
    });
    await users.insert(user);
    const a = (await users.findById(user.id))!;
    const b = (await users.findById(user.id))!;
    a.recordFailedLogin(new Date());
    await users.save(a);
    b.recordFailedLogin(new Date());
    await expect(users.save(b)).rejects.toBeInstanceOf(ConcurrencyConflictError);
  });

  it('memberships are unique per user and merchant and scoped by merchant on read', async () => {
    const merchants = new PrismaMerchantRepository(host, ids);
    const m1 = Merchant.register({
      id: ids.next('mer'),
      legalName: 'A',
      displayName: 'A',
      now: new Date(),
    });
    const m2 = Merchant.register({
      id: ids.next('mer'),
      legalName: 'B',
      displayName: 'B',
      now: new Date(),
    });
    await uow.run(async () => {
      await merchants.insert(m1);
      await merchants.insert(m2);
    });
    const users = new PrismaUserRepository(host);
    const user = User.register({
      id: ids.next('usr'),
      email: 'm@b.co',
      passwordHash: '$argon2id$v=19$x',
      now: new Date(),
    });
    await users.insert(user);
    const repo = new PrismaMembershipRepository(host);
    const membership = Membership.create({
      id: ids.next('mem'),
      userId: user.id,
      merchantId: m1.id,
      role: 'owner',
      createdAt: new Date(),
    });
    await repo.insert(membership);
    await expect(
      repo.insert(
        Membership.create({
          id: ids.next('mem'),
          userId: user.id,
          merchantId: m1.id,
          role: 'admin',
          createdAt: new Date(),
        }),
      ),
    ).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    expect(await repo.findById(m2.id, membership.id)).toBeNull();
    expect(await repo.findById(m1.id, membership.id)).not.toBeNull();
  });

  it('rejects invalid merchant branding at the database level', async () => {
    await expect(
      prisma.merchant.create({
        data: { id: 'mer_bad', legalName: 'x', displayName: 'x', brandColor: 'red' },
      }),
    ).rejects.toThrow(/merchants_brand_color_hex/);
  });
});
