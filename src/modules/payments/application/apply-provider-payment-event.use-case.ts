import type { Clock } from '../../../shared/application/clock.port';
import type { DomainEventPublisher } from '../../../shared/application/domain-event-publisher.port';
import type { IdGenerator } from '../../../shared/application/id-generator.port';
import type { UnitOfWork } from '../../../shared/application/unit-of-work.port';
import { Money } from '../../../shared/domain/money';
import type { OrderPaymentRecorder } from '../../orders/public-api';
import {
  Payment,
  type ApplyOutcome,
  type PaymentMethod,
  type PaymentStatus,
} from '../domain/payment';
import type { PaymentRepository } from '../domain/payment.repository';

/** A provider payment event, already signature-verified and resolved to PayCo ids by the webhooks context. */
export interface ProviderPaymentEvent {
  provider: string;
  providerPaymentId: string;
  merchantId: string;
  orderId: string;
  mode: 'test' | 'live';
  status: PaymentStatus;
  amountMinor: number;
  currency: string;
  method: PaymentMethod | null;
  failureReason: string | null;
}

export interface PaymentEventDependencies {
  unitOfWork: UnitOfWork;
  payments: PaymentRepository;
  orders: OrderPaymentRecorder;
  events: DomainEventPublisher;
  ids: IdGenerator;
  clock: Clock;
}

/**
 * Step 9–10 of the pay-in flow: apply a provider event idempotently. Runs in
 * one transaction with optimistic concurrency; a concurrent writer causes a
 * ConcurrencyConflictError and the queue redelivers the message.
 */
export class ApplyProviderPaymentEventUseCase {
  constructor(private readonly deps: PaymentEventDependencies) {}

  execute(
    event: ProviderPaymentEvent,
  ): Promise<{ paymentId: string; outcome: ApplyOutcome | 'created' }> {
    return this.deps.unitOfWork.run(async () => {
      const now = this.deps.clock.now();
      let payment = await this.deps.payments.findByProviderPayment(
        event.provider,
        event.providerPaymentId,
      );
      let outcome: ApplyOutcome | 'created';

      if (!payment) {
        const currency = event.currency.toUpperCase();
        if (!Money.isSupportedCurrency(currency))
          throw new Error(`Unsupported currency ${event.currency}`);
        payment = Payment.open({
          id: this.deps.ids.next('pay'),
          merchantId: event.merchantId,
          orderId: event.orderId,
          mode: event.mode,
          amount: Money.of(event.amountMinor, currency),
          method: event.method,
          now,
        });
        payment.applyProviderStatus(event.status, { failureReason: event.failureReason }, now);
        await this.deps.payments.insert(payment, {
          name: event.provider,
          providerPaymentId: event.providerPaymentId,
        });
        outcome = 'created';
      } else {
        outcome = payment.applyProviderStatus(
          event.status,
          { failureReason: event.failureReason },
          now,
        );
        if (outcome === 'applied') await this.deps.payments.save(payment);
      }

      if (payment.status === 'captured' && (outcome === 'applied' || outcome === 'created')) {
        await this.deps.orders.markPaid(payment.merchantId, payment.orderId);
      }
      await this.deps.events.publish(payment.pullEvents());
      return { paymentId: payment.id, outcome };
    });
  }
}
