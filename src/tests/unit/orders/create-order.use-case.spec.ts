import {
  IdempotencyKeyInProgressError,
  IdempotencyKeyReusedError,
  MerchantNotPermittedError,
  ProviderOutcomeUnknownError,
  ProviderRejectedError,
  ProviderUnavailableError,
  ReplayedApplicationError,
  UnsupportedCurrencyError,
} from '../../../shared/application/application-error';
import type { MerchantContext } from '../../../shared/application/merchant-context';
import { FakePaymentProvider } from '../../../integrations/payment-providers/testing/fake-payment-provider';
import { StaticPaymentProviderRegistry } from '../../../integrations/payment-providers/testing/in-memory-provider-registry';
import {
  CreateOrderUseCase,
  ORDER_IDEMPOTENCY_LEASE_MS,
} from '../../../modules/orders/application/use-cases/create-order.use-case';
import {
  activeMerchant,
  FixedClock,
  InMemoryIdempotencyStore,
  InMemoryMerchantProfiles,
  InMemoryOrderRepository,
  PassThroughUnitOfWork,
  RecordingEventPublisher,
  SequentialIdGenerator,
  testHasher,
} from '../../support/fakes';

const merchantA: MerchantContext = {
  merchantId: 'mer_A',
  mode: 'test',
  actor: { type: 'api_key', id: 'key_A' },
};
const merchantB: MerchantContext = {
  merchantId: 'mer_B',
  mode: 'test',
  actor: { type: 'api_key', id: 'key_B' },
};

function setup() {
  const clock = new FixedClock();
  const provider = new FakePaymentProvider();
  const orders = new InMemoryOrderRepository();
  const events = new RecordingEventPublisher();
  const merchants = new InMemoryMerchantProfiles()
    .add(activeMerchant('mer_A'))
    .add(activeMerchant('mer_B'))
    .add(activeMerchant('mer_onboarding', { status: 'onboarding', liveChargesEnabled: false }))
    .add(activeMerchant('mer_suspended', { status: 'suspended' }))
    .add(activeMerchant('mer_test_only', { liveChargesEnabled: false }));
  const useCase = new CreateOrderUseCase({
    unitOfWork: new PassThroughUnitOfWork(),
    orders,
    idempotency: new InMemoryIdempotencyStore(clock),
    events,
    merchants,
    providers: new StaticPaymentProviderRegistry([provider]),
    ids: new SequentialIdGenerator(),
    clock,
    hasher: testHasher,
  });
  return { useCase, provider, orders, events, clock };
}

const request = (overrides: Partial<Parameters<CreateOrderUseCase['execute']>[0]> = {}) => ({
  merchant: merchantA,
  idempotencyKey: 'idem-key-0001',
  amountMinor: 2500,
  currency: 'usd',
  receipt: 'INV-1',
  ...overrides,
});

describe('CreateOrderUseCase', () => {
  it('persists the order, creates the provider order and returns awaiting_payment', async () => {
    const { useCase, provider, events } = setup();
    const result = await useCase.execute(request());

    expect(result).toMatchObject({
      merchantId: 'mer_A',
      amountMinor: 2500,
      currency: 'USD',
      status: 'awaiting_payment',
    });
    expect(result.id).toMatch(/^ord_/);
    expect(provider.calls.filter((c) => c.operation === 'order.create')).toHaveLength(1);
    expect(events.types()).toEqual(['order.created', 'order.awaiting_payment']);
    expect(JSON.stringify(result)).not.toContain('fake_order_'); // provider ids never leave the domain
  });

  describe('idempotency', () => {
    it('replays the original result for a retry with the same key and body', async () => {
      const { useCase, provider, orders } = setup();
      const first = await useCase.execute(request());
      const second = await useCase.execute(request());

      expect(second).toEqual(first);
      expect(orders.count()).toBe(1);
      expect(provider.calls.filter((c) => c.operation === 'order.create')).toHaveLength(1);
    });

    it('rejects reuse of a key with a different payload', async () => {
      const { useCase } = setup();
      await useCase.execute(request());
      await expect(useCase.execute(request({ amountMinor: 9999 }))).rejects.toBeInstanceOf(
        IdempotencyKeyReusedError,
      );
    });

    it('scopes keys per merchant', async () => {
      const { useCase, orders } = setup();
      const a = await useCase.execute(request());
      const b = await useCase.execute(request({ merchant: merchantB }));
      expect(a.id).not.toBe(b.id);
      expect(orders.count()).toBe(2);
    });

    it('reports in-progress while another request holds the key', async () => {
      const { useCase, provider } = setup();
      let release!: () => void;
      const gate = new Promise<void>((resolve) => (release = resolve));
      const original = provider.createOrder.bind(provider);
      jest.spyOn(provider, 'createOrder').mockImplementationOnce(async (cmd) => {
        await gate;
        return original(cmd);
      });

      const first = useCase.execute(request());
      await new Promise((r) => setImmediate(r));
      await expect(useCase.execute(request())).rejects.toBeInstanceOf(
        IdempotencyKeyInProgressError,
      );
      release();
      await expect(first).resolves.toMatchObject({ status: 'awaiting_payment' });
    });
  });

  describe('provider outcomes', () => {
    it('does not blindly re-create after an unknown outcome: retry recovers the existing provider order', async () => {
      const { useCase, provider, events, orders } = setup();
      provider.queueOutcomes('timeout_after_processing');

      await expect(useCase.execute(request())).rejects.toBeInstanceOf(ProviderOutcomeUnknownError);
      expect(events.types()).toContain('order.provider_sync_required');
      expect(provider.orders.size).toBe(1);

      const retried = await useCase.execute(request());
      expect(retried.status).toBe('awaiting_payment');
      expect(provider.orders.size).toBe(1); // no duplicate provider order
      expect(provider.calls.map((c) => c.operation)).toEqual([
        'order.create',
        'order.find_by_reference',
      ]);
      expect(orders.count()).toBe(1);
    });

    it('creates the provider order on retry when the first attempt was never processed', async () => {
      const { useCase, provider } = setup();
      provider.queueOutcomes('unavailable');
      await expect(useCase.execute(request())).rejects.toBeInstanceOf(ProviderUnavailableError);

      const retried = await useCase.execute(request());
      expect(retried.status).toBe('awaiting_payment');
      expect(provider.orders.size).toBe(1);
    });

    it('marks the order failed on a definitive rejection and replays the same error', async () => {
      const { useCase, provider, events } = setup();
      provider.queueOutcomes('reject');

      await expect(useCase.execute(request())).rejects.toBeInstanceOf(ProviderRejectedError);
      expect(events.types()).toContain('order.provider_creation_failed');

      const replay = useCase.execute(request());
      await expect(replay).rejects.toBeInstanceOf(ReplayedApplicationError);
      await expect(replay).rejects.toMatchObject({ code: 'PROVIDER_REJECTED' });
      expect(provider.calls.filter((c) => c.operation === 'order.create')).toHaveLength(1);
    });

    it('lets a retry take over an abandoned lease after it expires', async () => {
      const { useCase, provider, clock } = setup();
      jest
        .spyOn(provider, 'createOrder')
        .mockImplementationOnce(() => new Promise(() => undefined)); // hangs forever
      void useCase.execute(request());
      await new Promise((r) => setImmediate(r));

      await expect(useCase.execute(request())).rejects.toBeInstanceOf(
        IdempotencyKeyInProgressError,
      );
      clock.advance(ORDER_IDEMPOTENCY_LEASE_MS + 1);
      await expect(useCase.execute(request())).resolves.toMatchObject({
        status: 'awaiting_payment',
      });
    });
  });

  describe('validation and permissions', () => {
    it('enforces the USD-only restriction', async () => {
      const { useCase } = setup();
      await expect(useCase.execute(request({ currency: 'eur' }))).rejects.toBeInstanceOf(
        UnsupportedCurrencyError,
      );
    });

    it('allows test mode during onboarding but not live mode (PRD 5.3)', async () => {
      const { useCase } = setup();
      const merchant = { ...merchantA, merchantId: 'mer_onboarding' };
      await expect(useCase.execute(request({ merchant }))).resolves.toMatchObject({
        status: 'awaiting_payment',
      });
      await expect(
        useCase.execute(
          request({ merchant: { ...merchant, mode: 'live' }, idempotencyKey: 'idem-live-01' }),
        ),
      ).rejects.toBeInstanceOf(MerchantNotPermittedError);
    });

    it('rejects suspended and unknown merchants', async () => {
      const { useCase } = setup();
      const merchant = { ...merchantA, merchantId: 'mer_suspended' };
      await expect(useCase.execute(request({ merchant }))).rejects.toBeInstanceOf(
        MerchantNotPermittedError,
      );
      await expect(
        useCase.execute(request({ merchant: { ...merchantA, merchantId: 'mer_unknown' } })),
      ).rejects.toBeInstanceOf(MerchantNotPermittedError);
    });

    it('blocks live mode until live charges are enabled (PRD 5.3 step 5)', async () => {
      const { useCase } = setup();
      const merchant: MerchantContext = { ...merchantA, merchantId: 'mer_test_only', mode: 'live' };
      await expect(useCase.execute(request({ merchant }))).rejects.toBeInstanceOf(
        MerchantNotPermittedError,
      );
      await expect(
        useCase.execute(request({ merchant: { ...merchant, mode: 'test' } })),
      ).resolves.toBeDefined();
    });
  });
});
