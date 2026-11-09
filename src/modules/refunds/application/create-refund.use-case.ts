import {
  CapabilityNotSupportedError,
  IdempotencyKeyInProgressError,
  IdempotencyKeyReusedError,
  ProviderOutcomeUnknownError,
  ProviderRejectedError,
  ProviderUnavailableError,
  ReplayedApplicationError,
  ResourceNotFoundError,
} from '../../../shared/application/application-error';
import type { Clock } from '../../../shared/application/clock.port';
import type { DomainEventPublisher } from '../../../shared/application/domain-event-publisher.port';
import type { IdGenerator } from '../../../shared/application/id-generator.port';
import type { IdempotencyStore } from '../../../shared/application/idempotency.port';
import type { MerchantContext } from '../../../shared/application/merchant-context';
import { canonicalJson, type Hasher } from '../../../shared/application/request-hash';
import type { UnitOfWork } from '../../../shared/application/unit-of-work.port';
import { Money } from '../../../shared/domain/money';
import type {
  PaymentProviderName,
  PaymentProviderRegistry,
} from '../../../integrations/payment-providers/domain-ports/payment-provider.port';
import * as ProviderErrors from '../../../integrations/payment-providers/domain-ports/provider-errors';
import type { MerchantPaymentProfileReader } from '../../merchants/public-api';
import type { PaymentReader } from '../../payments/public-api';
import { Refund } from '../domain/refund';
import { assertRefundable, fullRefundAmount } from '../domain/refund-policy';
import type { RefundRepository } from '../domain/refund.repository';

export interface RefundDto {
  id: string;
  paymentId: string;
  amountMinor: number;
  currency: string;
  status: string;
  createdAt: string;
}

export interface CreateRefundDependencies {
  unitOfWork: UnitOfWork;
  refunds: RefundRepository;
  payments: PaymentReader;
  merchants: MerchantPaymentProfileReader;
  providers: PaymentProviderRegistry;
  idempotency: IdempotencyStore;
  events: DomainEventPublisher;
  ids: IdGenerator;
  clock: Clock;
  hasher: Hasher;
}

const SCOPE = 'refunds.create';
const LEASE_MS = 30_000;

const toDto = (r: Refund): RefundDto => {
  const p = r.toProps();
  return {
    id: p.id,
    paymentId: p.paymentId,
    amountMinor: p.amount.amountMinor,
    currency: p.amount.currency,
    status: p.status,
    createdAt: p.createdAt.toISOString(),
  };
};

/**
 * POST /v1/payments/:id/refunds. Same two-transaction shape as order creation,
 * with one stricter rule because a refund moves money: after an unknown
 * gateway outcome the refund is never sent again by a client retry; only
 * reconciliation (payment-status-sync worker) may resolve it.
 */
export class CreateRefundUseCase {
  constructor(private readonly deps: CreateRefundDependencies) {}

  async execute(input: {
    merchant: MerchantContext;
    paymentId: string;
    amountMinor?: number;
    reason?: string;
    idempotencyKey: string;
  }): Promise<RefundDto> {
    const payment = await this.deps.payments.getRefundable(
      input.merchant.merchantId,
      input.paymentId,
    );
    if (!payment || payment.mode !== input.merchant.mode)
      throw new ResourceNotFoundError('payment', input.paymentId);

    const requestHash = this.deps.hasher.sha256Hex(
      canonicalJson({
        paymentId: input.paymentId,
        amountMinor: input.amountMinor ?? null,
        reason: input.reason ?? null,
      }),
    );

    const started = await this.deps.unitOfWork.run(async () => {
      const claim = await this.deps.idempotency.claim({
        merchantId: input.merchant.merchantId,
        scope: SCOPE,
        key: input.idempotencyKey,
        requestHash,
        leaseMs: LEASE_MS,
      });
      if (
        claim.kind === 'replay' ||
        claim.kind === 'in_progress' ||
        claim.kind === 'payload_mismatch'
      ) {
        return { proceed: false as const, claim };
      }
      if (claim.kind === 'resumed') {
        const refund = claim.resourceId
          ? await this.deps.refunds.findForMerchant(input.merchant.merchantId, claim.resourceId)
          : null;
        if (!refund) throw new IdempotencyKeyInProgressError();
        return { proceed: true as const, recordId: claim.recordId, refund };
      }

      const captured = Money.of(payment.amountMinor, payment.currency);
      const refunded = Money.of(payment.amountRefundedMinor, payment.currency);
      const inFlight = await this.deps.refunds.inFlightTotal(payment.paymentId);
      const amount =
        input.amountMinor === undefined
          ? fullRefundAmount(captured, refunded, inFlight)
          : Money.of(input.amountMinor, payment.currency);
      assertRefundable({
        paymentStatus: payment.status,
        captured,
        alreadyRefunded: refunded,
        inFlight,
        requested: amount,
      });

      const refund = Refund.request({
        id: this.deps.ids.next('rfnd'),
        merchantId: input.merchant.merchantId,
        paymentId: payment.paymentId,
        amount,
        reason: input.reason,
        now: this.deps.clock.now(),
      });
      await this.deps.refunds.insert(refund);
      await this.deps.events.publish(refund.pullEvents());
      await this.deps.idempotency.attachResource(claim.recordId, refund.id);
      return { proceed: true as const, recordId: claim.recordId, refund };
    });

    if (!started.proceed) {
      const { claim } = started;
      if (claim.kind === 'replay') {
        if (claim.outcome.kind === 'success') return claim.outcome.body as RefundDto;
        throw new ReplayedApplicationError(
          claim.outcome.code,
          claim.outcome.message,
          claim.outcome.details,
        );
      }
      if (claim.kind === 'in_progress') throw new IdempotencyKeyInProgressError();
      throw new IdempotencyKeyReusedError();
    }

    const { refund, recordId } = started;
    if (!refund.canBeSent()) {
      if (refund.submission === 'unknown') {
        await this.deps.idempotency.release(recordId);
        throw new ProviderOutcomeUnknownError('refund.create', refund.id);
      }
      const dto = toDto(refund);
      await this.deps.idempotency.complete(recordId, { kind: 'success', body: dto });
      return dto;
    }

    const profile = await this.deps.merchants.getPaymentProfile(input.merchant.merchantId);
    const account = profile?.providerAccounts[input.merchant.mode];
    if (!account) throw new ResourceNotFoundError('payment_account', input.merchant.mode);
    const provider = this.deps.providers.get(payment.provider as PaymentProviderName);

    try {
      const result = await provider.createRefund({
        mode: input.merchant.mode,
        account,
        providerPaymentId: payment.providerPaymentId,
        amount: refund.amount,
        reference: refund.id,
        idempotencyKey: `${input.merchant.merchantId}:${input.idempotencyKey}`,
      });
      return await this.deps.unitOfWork.run(async () => {
        refund.markSubmitted(result.status, this.deps.clock.now());
        await this.deps.refunds.save(refund);
        await this.deps.events.publish(refund.pullEvents());
        const dto = toDto(refund);
        await this.deps.idempotency.complete(recordId, { kind: 'success', body: dto });
        return dto;
      });
    } catch (error) {
      return this.handleFailure(error, refund, recordId);
    }
  }

  private async handleFailure(error: unknown, refund: Refund, recordId: string): Promise<never> {
    if (error instanceof ProviderErrors.ProviderRejectedError) {
      const failure = new ProviderRejectedError('refund.create', error.reason);
      await this.deps.unitOfWork.run(async () => {
        refund.markFailed(error.reason, this.deps.clock.now());
        await this.deps.refunds.save(refund);
        await this.deps.events.publish(refund.pullEvents());
        await this.deps.idempotency.complete(recordId, {
          kind: 'error',
          code: failure.code,
          message: failure.message,
          details: { refund_id: refund.id },
        });
      });
      throw failure;
    }
    if (error instanceof ProviderErrors.ProviderOutcomeUnknownError) {
      await this.deps.unitOfWork.run(async () => {
        refund.markOutcomeUnknown(this.deps.clock.now());
        await this.deps.refunds.save(refund);
        await this.deps.events.publish(refund.pullEvents());
        await this.deps.idempotency.release(recordId);
      });
      throw new ProviderOutcomeUnknownError('refund.create', refund.id);
    }
    await this.deps.idempotency.release(recordId);
    if (error instanceof ProviderErrors.ProviderUnavailableError)
      throw new ProviderUnavailableError('refund.create');
    if (error instanceof ProviderErrors.ProviderCapabilityError) {
      throw new CapabilityNotSupportedError(error.provider, error.capability, error.status);
    }
    throw error;
  }
}
