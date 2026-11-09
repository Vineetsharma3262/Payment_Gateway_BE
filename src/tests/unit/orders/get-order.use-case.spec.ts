import { ResourceNotFoundError } from '../../../shared/application/application-error';
import { Money } from '../../../shared/domain/money';
import { Order } from '../../../modules/orders/domain/entities/order';
import { GetOrderUseCase } from '../../../modules/orders/application/use-cases/get-order.use-case';
import { ConcurrencyConflictError } from '../../../shared/application/application-error';
import { ProviderOrderRef } from '../../../modules/orders/domain/value-objects/provider-order-ref';
import { InMemoryOrderRepository } from '../../support/fakes';

const now = new Date('2026-10-27T12:00:00Z');

async function seed(repo: InMemoryOrderRepository) {
  const order = Order.create({
    id: 'ord_A1',
    merchantId: 'mer_A',
    mode: 'test',
    amount: Money.of(100, 'USD'),
    now,
  });
  await repo.insert(order);
  return order;
}

describe('GetOrderUseCase — merchant isolation', () => {
  it('returns the order to its owner', async () => {
    const repo = new InMemoryOrderRepository();
    await seed(repo);
    const dto = await new GetOrderUseCase(repo).execute({
      merchant: { merchantId: 'mer_A', mode: 'test', actor: { type: 'api_key', id: 'k' } },
      orderId: 'ord_A1',
    });
    expect(dto.id).toBe('ord_A1');
  });

  it('returns not-found (not forbidden) for another merchant’s order', async () => {
    const repo = new InMemoryOrderRepository();
    await seed(repo);
    await expect(
      new GetOrderUseCase(repo).execute({
        merchant: { merchantId: 'mer_B', mode: 'test', actor: { type: 'api_key', id: 'k' } },
        orderId: 'ord_A1',
      }),
    ).rejects.toBeInstanceOf(ResourceNotFoundError);
  });

  it('does not show test-mode orders to live-mode keys', async () => {
    const repo = new InMemoryOrderRepository();
    await seed(repo);
    await expect(
      new GetOrderUseCase(repo).execute({
        merchant: { merchantId: 'mer_A', mode: 'live', actor: { type: 'api_key', id: 'k' } },
        orderId: 'ord_A1',
      }),
    ).rejects.toBeInstanceOf(ResourceNotFoundError);
  });
});

describe('Order persistence — concurrent updates', () => {
  it('rejects a stale write (optimistic concurrency)', async () => {
    const repo = new InMemoryOrderRepository();
    await seed(repo);
    const copy1 = (await repo.findForMerchant('mer_A', 'ord_A1'))!;
    const copy2 = (await repo.findForMerchant('mer_A', 'ord_A1'))!;

    copy1.attachProviderOrder(ProviderOrderRef.of('fake', 'po_1'), now);
    await repo.save(copy1);

    copy2.markProviderRejected('late failure', now);
    await expect(repo.save(copy2)).rejects.toBeInstanceOf(ConcurrencyConflictError);
    expect((await repo.findForMerchant('mer_A', 'ord_A1'))!.status).toBe('awaiting_payment');
  });
});
