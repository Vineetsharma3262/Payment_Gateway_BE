import { ConcurrencyConflictError } from '../../shared/application/application-error';
import { Money } from '../../shared/domain/money';
import { OutboxEventPublisher } from '../../shared/infrastructure/database/outbox-event-publisher';
import { PrismaService } from '../../shared/infrastructure/database/prisma.service';
import { PrismaUnitOfWork } from '../../shared/infrastructure/database/prisma-unit-of-work';
import { TransactionHost } from '../../shared/infrastructure/database/transaction-host';
import { PrismaIdempotencyStore } from '../../shared/infrastructure/idempotency/prisma-idempotency.store';
import { RandomIdGenerator } from '../../shared/infrastructure/system/random-id-generator';
import { SystemClock } from '../../shared/infrastructure/system/system-clock';
import { Order } from '../../modules/orders/domain/entities/order';
import { ProviderOrderRef } from '../../modules/orders/domain/value-objects/provider-order-ref';
import { PrismaOrderRepository } from '../../modules/orders/infrastructure/persistence/prisma-order.repository';

/**
 * Requires a migrated PostgreSQL database:
 *   INTEGRATION_DATABASE_URL=postgresql://… npx prisma migrate deploy && npm run test:integration
 * CI provides one (see .github/workflows/ci.yml). Skipped when the variable is unset.
 */
const url = process.env.INTEGRATION_DATABASE_URL;
const describeDb = url ? describe : describe.skip;

describeDb('PostgreSQL persistence (integration)', () => {
  let prisma: PrismaService;
  let host: TransactionHost;
  let uow: PrismaUnitOfWork;
  let orders: PrismaOrderRepository;
  let idempotency: PrismaIdempotencyStore;
  let outbox: OutboxEventPublisher;
  const ids = new RandomIdGenerator();
  const clock = new SystemClock();

  beforeAll(async () => {
    prisma = new PrismaService({ datasources: { db: { url } } });
    await prisma.$connect();
    host = new TransactionHost(prisma);
    uow = new PrismaUnitOfWork(prisma, host);
    orders = new PrismaOrderRepository(host, ids);
    idempotency = new PrismaIdempotencyStore(host, ids, clock);
    outbox = new OutboxEventPublisher(host, ids);
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      'TRUNCATE api_request_logs, onboarding_documents, onboarding_applications, invitations, memberships, password_reset_tokens, refresh_tokens, users, outbox_events, idempotency_records, provider_resource_mappings, orders, api_keys, merchant_provider_accounts, merchants CASCADE',
    );
    for (const id of ['mer_A', 'mer_B']) {
      await prisma.merchant.create({
        data: { id, legalName: id, displayName: id, status: 'active' },
      });
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const newOrder = (merchantId = 'mer_A') =>
    Order.create({
      id: ids.next('ord'),
      merchantId,
      mode: 'test',
      amount: Money.of(2500, 'USD'),
      now: new Date(),
    });

  it('round-trips an order and scopes reads by merchant', async () => {
    const order = newOrder();
    await uow.run(() => orders.insert(order));
    expect((await orders.findForMerchant('mer_A', order.id))?.amount.amountMinor).toBe(2500);
    expect(await orders.findForMerchant('mer_B', order.id)).toBeNull();
  });

  it('stores provider ids only in the mapping table and resolves them back', async () => {
    const order = newOrder();
    await uow.run(() => orders.insert(order));
    order.attachProviderOrder(ProviderOrderRef.of('fake', 'po_123'), new Date());
    await uow.run(() => orders.save(order));
    expect((await orders.findByProviderOrder('fake', 'po_123'))?.id).toBe(order.id);
  });

  it('rejects stale concurrent writes', async () => {
    const order = newOrder();
    await uow.run(() => orders.insert(order));
    const a = (await orders.findForMerchant('mer_A', order.id))!;
    const b = (await orders.findForMerchant('mer_A', order.id))!;
    a.attachProviderOrder(ProviderOrderRef.of('fake', 'po_a'), new Date());
    b.markProviderRejected('x', new Date());
    await uow.run(() => orders.save(a));
    await expect(uow.run(() => orders.save(b))).rejects.toBeInstanceOf(ConcurrencyConflictError);
  });

  it('enforces money CHECK constraints at the database level', async () => {
    await expect(
      prisma.order.create({
        data: {
          id: 'ord_bad',
          merchantId: 'mer_A',
          mode: 'test',
          amountMinor: 100n,
          currency: 'EUR',
          status: 'created',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      }),
    ).rejects.toThrow(/orders_currency_usd/);
  });

  it('grants an idempotency key to exactly one of many concurrent claimants', async () => {
    const attempt = () =>
      uow.run(() =>
        idempotency.claim({
          merchantId: 'mer_A',
          scope: 'orders.create',
          key: 'k-1',
          requestHash: 'a'.repeat(64),
          leaseMs: 30_000,
        }),
      );
    const results = await Promise.all(Array.from({ length: 8 }, attempt));
    expect(results.filter((r) => r.kind === 'claimed')).toHaveLength(1);
    expect(results.filter((r) => r.kind === 'in_progress')).toHaveLength(7);
  });

  it('rolls back outbox events together with the state change', async () => {
    const order = newOrder();
    await expect(
      uow.run(async () => {
        await orders.insert(order);
        await outbox.publish(order.pullEvents());
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(await prisma.order.count()).toBe(0);
    expect(await prisma.outboxEvent.count()).toBe(0);
  });

  it('refuses to write outbox events outside a transaction', async () => {
    await expect(outbox.publish(newOrder().pullEvents())).rejects.toThrow(/unit of work/);
  });
});
