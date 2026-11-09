import { InvariantViolationError } from '../../../shared/domain/domain-error';
import { Money } from '../../../shared/domain/money';
import {
  ApplyProviderPaymentEventUseCase,
  type ProviderPaymentEvent,
} from '../../../modules/payments/application/apply-provider-payment-event.use-case';
import { Payment } from '../../../modules/payments/domain/payment';
import type { PaymentRepository } from '../../../modules/payments/domain/payment.repository';
import {
  FixedClock,
  PassThroughUnitOfWork,
  RecordingEventPublisher,
  SequentialIdGenerator,
} from '../../support/fakes';

const now = new Date('2026-10-27T00:00:00Z');
const usd = (c: number) => Money.of(c, 'USD');
const open = () =>
  Payment.open({
    id: 'pay_1',
    merchantId: 'mer_1',
    orderId: 'ord_1',
    mode: 'test',
    amount: usd(1000),
    method: 'card',
    now,
  });

describe('Payment aggregate', () => {
  it('moves forward only; older statuses arriving late are stale', () => {
    const p = open();
    expect(p.applyProviderStatus('captured', {}, now)).toBe('applied');
    expect(p.applyProviderStatus('authorized', {}, now)).toBe('stale');
    expect(p.applyProviderStatus('captured', {}, now)).toBe('duplicate');
    expect(p.applyProviderStatus('failed', { failureReason: 'late' }, now)).toBe('stale');
    expect(p.status).toBe('captured');
  });

  it('tracks partial refunds and refuses over-refunds', () => {
    const p = open();
    expect(p.refundableAmount().amountMinor).toBe(0);
    p.applyProviderStatus('captured', {}, now);
    p.recordRefund(usd(400), now);
    p.recordRefund(usd(600), now);
    expect(p.refundableAmount().isZero()).toBe(true);
    expect(() => p.recordRefund(usd(1), now)).toThrow(InvariantViolationError);
  });
});

class MemoryPayments implements PaymentRepository {
  rows = new Map<string, { payment: ReturnType<Payment['toProps']>; providerId: string }>();
  findForMerchant(m: string, id: string) {
    const r = this.rows.get(id);
    return Promise.resolve(r && r.payment.merchantId === m ? Payment.rehydrate(r.payment) : null);
  }
  findByProviderPayment(_p: string, providerId: string) {
    const r = [...this.rows.values()].find((x) => x.providerId === providerId);
    return Promise.resolve(r ? Payment.rehydrate(r.payment) : null);
  }
  list() {
    return Promise.resolve({ items: [], hasMore: false, nextCursor: null });
  }
  insert(p: Payment, provider: { providerPaymentId: string }) {
    this.rows.set(p.id, { payment: p.toProps(), providerId: provider.providerPaymentId });
    return Promise.resolve();
  }
  save(p: Payment) {
    const r = this.rows.get(p.id)!;
    r.payment = p.toProps();
    return Promise.resolve();
  }
}

describe('ApplyProviderPaymentEventUseCase (duplicate / out-of-order webhooks)', () => {
  const event = (status: ProviderPaymentEvent['status']): ProviderPaymentEvent => ({
    provider: 'fake',
    providerPaymentId: 'fp_1',
    merchantId: 'mer_1',
    orderId: 'ord_1',
    mode: 'test',
    status,
    amountMinor: 1000,
    currency: 'usd',
    method: 'card',
    failureReason: null,
  });

  it('marks the order paid exactly once across duplicate and late events', async () => {
    const paid: string[] = [];
    const events = new RecordingEventPublisher();
    const useCase = new ApplyProviderPaymentEventUseCase({
      unitOfWork: new PassThroughUnitOfWork(),
      payments: new MemoryPayments(),
      orders: { markPaid: (_m, orderId) => (paid.push(orderId), Promise.resolve()) },
      events,
      ids: new SequentialIdGenerator(),
      clock: new FixedClock(),
    });
    expect((await useCase.execute(event('authorized'))).outcome).toBe('created');
    expect((await useCase.execute(event('captured'))).outcome).toBe('applied');
    expect((await useCase.execute(event('captured'))).outcome).toBe('duplicate');
    expect((await useCase.execute(event('authorized'))).outcome).toBe('stale');
    expect(paid).toEqual(['ord_1']);
    expect(events.types()).toEqual(['payment.authorized', 'payment.captured']);
  });
});
