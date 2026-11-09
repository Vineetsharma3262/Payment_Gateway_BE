import {
  IdempotencyKeyReusedError,
  ProviderOutcomeUnknownError,
  ProviderUnavailableError,
} from '../../../shared/application/application-error';
import type { MerchantContext } from '../../../shared/application/merchant-context';
import { Money } from '../../../shared/domain/money';
import { FakePaymentProvider } from '../../../integrations/payment-providers/testing/fake-payment-provider';
import { StaticPaymentProviderRegistry } from '../../../integrations/payment-providers/testing/in-memory-provider-registry';
import type { RefundablePayment } from '../../../modules/payments/public-api';
import { CreateRefundUseCase } from '../../../modules/refunds/application/create-refund.use-case';
import { Refund } from '../../../modules/refunds/domain/refund';
import { RefundNotAllowedError } from '../../../modules/refunds/domain/refund-policy';
import type { RefundRepository } from '../../../modules/refunds/domain/refund.repository';
import {
  activeMerchant,
  FixedClock,
  InMemoryIdempotencyStore,
  InMemoryMerchantProfiles,
  PassThroughUnitOfWork,
  RecordingEventPublisher,
  SequentialIdGenerator,
  testHasher,
} from '../../support/fakes';

class MemoryRefunds implements RefundRepository {
  rows = new Map<string, ReturnType<Refund['toProps']>>();
  findForMerchant(m: string, id: string) {
    const r = this.rows.get(id);
    return Promise.resolve(r && r.merchantId === m ? Refund.rehydrate(r) : null);
  }
  inFlightTotal(paymentId: string) {
    const sum = [...this.rows.values()]
      .filter(
        (r) => r.paymentId === paymentId && (r.status === 'pending' || r.status === 'processing'),
      )
      .reduce((s, r) => s + r.amount.amountMinor, 0);
    return Promise.resolve(Money.of(sum, 'USD'));
  }
  insert(r: Refund) {
    this.rows.set(r.id, r.toProps());
    return Promise.resolve();
  }
  save(r: Refund) {
    this.rows.set(r.id, r.toProps());
    return Promise.resolve();
  }
}

const merchant: MerchantContext = {
  merchantId: 'mer_1',
  mode: 'test',
  actor: { type: 'api_key', id: 'key_1' },
};
const payment: RefundablePayment = {
  paymentId: 'pay_1',
  merchantId: 'mer_1',
  mode: 'test',
  status: 'captured',
  amountMinor: 1000,
  amountRefundedMinor: 0,
  currency: 'USD',
  provider: 'fake',
  providerPaymentId: 'fp_1',
};

function setup(p: RefundablePayment = payment) {
  const clock = new FixedClock();
  const provider = new FakePaymentProvider();
  const refunds = new MemoryRefunds();
  const createRefund = jest.spyOn(provider, 'createRefund');
  const useCase = new CreateRefundUseCase({
    unitOfWork: new PassThroughUnitOfWork(),
    refunds,
    payments: {
      getRefundable: (m, id) =>
        Promise.resolve(m === p.merchantId && id === p.paymentId ? p : null),
    },
    merchants: new InMemoryMerchantProfiles().add(activeMerchant('mer_1')),
    providers: new StaticPaymentProviderRegistry([provider]),
    idempotency: new InMemoryIdempotencyStore(clock),
    events: new RecordingEventPublisher(),
    ids: new SequentialIdGenerator(),
    clock,
    hasher: testHasher,
  });
  return { useCase, provider, refunds, createRefund };
}

const req = (o: Partial<Parameters<CreateRefundUseCase['execute']>[0]> = {}) => ({
  merchant,
  paymentId: 'pay_1',
  amountMinor: 300,
  idempotencyKey: 'refund-key-001',
  ...o,
});

describe('CreateRefundUseCase', () => {
  it('creates a partial refund and replays it for the same key', async () => {
    const { useCase, createRefund } = setup();
    const first = await useCase.execute(req());
    expect(first).toMatchObject({ amountMinor: 300, status: 'processing' });
    await expect(useCase.execute(req())).resolves.toEqual(first);
    expect(createRefund).toHaveBeenCalledTimes(1);
    await expect(useCase.execute(req({ amountMinor: 301 }))).rejects.toBeInstanceOf(
      IdempotencyKeyReusedError,
    );
  });

  it('counts in-flight refunds so concurrent requests cannot over-refund', async () => {
    const { useCase } = setup();
    await useCase.execute(req({ amountMinor: 700, idempotencyKey: 'refund-key-a' }));
    await expect(
      useCase.execute(req({ amountMinor: 400, idempotencyKey: 'refund-key-b' })),
    ).rejects.toBeInstanceOf(RefundNotAllowedError);
    await expect(
      useCase.execute(req({ amountMinor: undefined, idempotencyKey: 'refund-key-c' })),
    ).resolves.toMatchObject({ amountMinor: 300 });
  });

  it('refuses refunds on uncaptured payments and other merchants’ payments', async () => {
    await expect(
      setup({ ...payment, status: 'authorized' }).useCase.execute(req()),
    ).rejects.toBeInstanceOf(RefundNotAllowedError);
    await expect(
      setup().useCase.execute(req({ merchant: { ...merchant, merchantId: 'mer_2' } })),
    ).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
  });

  it('NEVER resends a refund after an unknown outcome — a retry waits for reconciliation', async () => {
    const { useCase, provider, createRefund } = setup();
    provider.queueOutcomes('timeout_after_processing');
    await expect(useCase.execute(req())).rejects.toBeInstanceOf(ProviderOutcomeUnknownError);
    await expect(useCase.execute(req())).rejects.toBeInstanceOf(ProviderOutcomeUnknownError);
    expect(createRefund).toHaveBeenCalledTimes(1);
  });

  it('resends after "unavailable" because the gateway never processed it', async () => {
    const { useCase, provider, createRefund } = setup();
    provider.queueOutcomes('unavailable');
    await expect(useCase.execute(req())).rejects.toBeInstanceOf(ProviderUnavailableError);
    await expect(useCase.execute(req())).resolves.toMatchObject({ status: 'processing' });
    expect(createRefund).toHaveBeenCalledTimes(2);
  });
});
