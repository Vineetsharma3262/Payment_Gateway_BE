import {
  CapabilityNotSupportedError,
  IdempotencyKeyInProgressError,
  IdempotencyKeyReusedError,
  MerchantNotPermittedError,
  ProviderOutcomeUnknownError,
  ProviderRejectedError,
  ProviderUnavailableError,
  ReplayedApplicationError,
  UnsupportedCurrencyError,
} from '../../../../shared/application/application-error';
import type { Clock } from '../../../../shared/application/clock.port';
import type { DomainEventPublisher } from '../../../../shared/application/domain-event-publisher.port';
import type { IdGenerator } from '../../../../shared/application/id-generator.port';
import type {
  IdempotencyClaim,
  IdempotencyStore,
} from '../../../../shared/application/idempotency.port';
import type { MerchantContext } from '../../../../shared/application/merchant-context';
import { canonicalJson, type Hasher } from '../../../../shared/application/request-hash';
import type { UnitOfWork } from '../../../../shared/application/unit-of-work.port';
import type { UseCase } from '../../../../shared/application/use-case';
import { Money } from '../../../../shared/domain/money';
import type {
  PaymentProvider,
  PaymentProviderRegistry,
  ProviderAccountRef,
} from '../../../../integrations/payment-providers/domain-ports/payment-provider.port';
import * as ProviderErrors from '../../../../integrations/payment-providers/domain-ports/provider-errors';
import type { MerchantPaymentProfileReader } from '../../../merchants/public-api';
import { Order } from '../../domain/entities/order';
import type { OrderRepository } from '../../domain/repositories/order.repository';
import { ProviderOrderRef } from '../../domain/value-objects/provider-order-ref';
import type { CreateOrderInput, OrderDto } from '../dto/order.dto';
import { toOrderDto } from '../mappers/order-dto.mapper';

const IDEMPOTENCY_SCOPE = 'orders.create';
/** Must exceed the provider HTTP timeout so a live request never loses its lease mid-call. */
export const ORDER_IDEMPOTENCY_LEASE_MS = 30_000;

type ClaimResult =
  | { proceed: true; recordId: string; order: Order; resumed: boolean }
  | { proceed: false; claim: Exclude<IdempotencyClaim, { kind: 'claimed' | 'resumed' }> };

export interface CreateOrderDependencies {
  unitOfWork: UnitOfWork;
  orders: OrderRepository;
  idempotency: IdempotencyStore;
  events: DomainEventPublisher;
  merchants: MerchantPaymentProfileReader;
  providers: PaymentProviderRegistry;
  ids: IdGenerator;
  clock: Clock;
  hasher: Hasher;
}

/**
 * POST /v1/orders (PRD 5.1, 7.1).
 *
 * 1. Validate merchant, mode and currency.
 * 2. In ONE transaction: claim the idempotency key, persist the order (status
 *    `created`) and its `order.created` outbox event.
 * 3. Outside any transaction: create the provider order under the merchant's
 *    sub-account.
 * 4. In a second transaction: record the outcome and complete the key.
 *
 * If step 3 has an unknown outcome the order stays `created`, the key's lease
 * is released, and a retry with the same key first asks the provider whether
 * an order with this reference exists before creating one.
 */
export class CreateOrderUseCase implements UseCase<CreateOrderInput, OrderDto> {
  constructor(private readonly deps: CreateOrderDependencies) {}

  async execute(input: CreateOrderInput): Promise<OrderDto> {
    const currency = input.currency.toUpperCase();
    if (!Money.isSupportedCurrency(currency)) throw new UnsupportedCurrencyError(input.currency);
    const amount = Money.of(input.amountMinor, currency);
    const account = await this.resolveProviderAccount(input.merchant);

    const requestHash = this.deps.hasher.sha256Hex(
      canonicalJson({
        mode: input.merchant.mode,
        amountMinor: amount.amountMinor,
        currency,
        receipt: input.receipt ?? null,
        notes: input.notes ?? {},
      }),
    );

    const started = await this.deps.unitOfWork.run(async (): Promise<ClaimResult> => {
      const claim = await this.deps.idempotency.claim({
        merchantId: input.merchant.merchantId,
        scope: IDEMPOTENCY_SCOPE,
        key: input.idempotencyKey,
        requestHash,
        leaseMs: ORDER_IDEMPOTENCY_LEASE_MS,
      });

      switch (claim.kind) {
        case 'replay':
        case 'in_progress':
        case 'payload_mismatch':
          return { proceed: false, claim };
        case 'claimed': {
          const order = Order.create({
            id: this.deps.ids.next('ord'),
            merchantId: input.merchant.merchantId,
            mode: input.merchant.mode,
            amount,
            receipt: input.receipt,
            notes: input.notes,
            now: this.deps.clock.now(),
          });
          await this.deps.orders.insert(order);
          await this.deps.events.publish(order.pullEvents());
          await this.deps.idempotency.attachResource(claim.recordId, order.id);
          return { proceed: true, recordId: claim.recordId, order, resumed: false };
        }
        case 'resumed': {
          const order = claim.resourceId
            ? await this.deps.orders.findForMerchant(input.merchant.merchantId, claim.resourceId)
            : null;
          // The claim and the order commit together, so a resumed key always has its order.
          if (!order) throw new IdempotencyKeyInProgressError();
          return { proceed: true, recordId: claim.recordId, order, resumed: true };
        }
      }
    });

    if (started.proceed) {
      return this.ensureProviderOrder(
        started.order,
        account,
        started.recordId,
        input.idempotencyKey,
        started.resumed,
      );
    }
    const { claim } = started;
    if (claim.kind === 'replay') {
      if (claim.outcome.kind === 'success') return claim.outcome.body as OrderDto;
      throw new ReplayedApplicationError(
        claim.outcome.code,
        claim.outcome.message,
        claim.outcome.details,
      );
    }
    if (claim.kind === 'in_progress') throw new IdempotencyKeyInProgressError();
    throw new IdempotencyKeyReusedError();
  }

  private async ensureProviderOrder(
    order: Order,
    account: ProviderAccountRef,
    recordId: string,
    idempotencyKey: string,
    resumed: boolean,
  ): Promise<OrderDto> {
    if (order.status !== 'created') {
      // A previous attempt reached the provider and recorded the result but crashed before completing the key.
      const dto = toOrderDto(order);
      await this.deps.idempotency.complete(recordId, { kind: 'success', body: dto });
      return dto;
    }

    const provider = this.deps.providers.get(account.provider);
    let providerOrderId: string;
    try {
      providerOrderId = await this.createOrRecoverProviderOrder(
        provider,
        order,
        account,
        idempotencyKey,
        resumed,
      );
    } catch (error) {
      return this.handleProviderFailure(error, order, recordId);
    }

    return this.deps.unitOfWork.run(async () => {
      order.attachProviderOrder(
        ProviderOrderRef.of(provider.name, providerOrderId),
        this.deps.clock.now(),
      );
      await this.deps.orders.save(order);
      await this.deps.events.publish(order.pullEvents());
      const dto = toOrderDto(order);
      await this.deps.idempotency.complete(recordId, { kind: 'success', body: dto });
      return dto;
    });
  }

  private async createOrRecoverProviderOrder(
    provider: PaymentProvider,
    order: Order,
    account: ProviderAccountRef,
    idempotencyKey: string,
    resumed: boolean,
  ): Promise<string> {
    if (resumed && provider.capabilities()['order.find_by_reference'] !== 'unsupported') {
      const existing = await provider.findOrderByReference(order.mode, account, order.id);
      if (existing) return existing.providerOrderId;
    }
    const created = await provider.createOrder({
      mode: order.mode,
      account,
      reference: order.id,
      amount: order.amount,
      idempotencyKey: `${order.merchantId}:${idempotencyKey}`,
    });
    return created.providerOrderId;
  }

  private async handleProviderFailure(
    error: unknown,
    order: Order,
    recordId: string,
  ): Promise<never> {
    if (error instanceof ProviderErrors.ProviderRejectedError) {
      const failure = new ProviderRejectedError('order.create', error.reason);
      await this.deps.unitOfWork.run(async () => {
        order.markProviderRejected(error.reason, this.deps.clock.now());
        await this.deps.orders.save(order);
        await this.deps.events.publish(order.pullEvents());
        await this.deps.idempotency.complete(recordId, {
          kind: 'error',
          code: failure.code,
          message: failure.message,
          details: { order_id: order.id },
        });
      });
      throw failure;
    }

    if (error instanceof ProviderErrors.ProviderOutcomeUnknownError) {
      await this.deps.unitOfWork.run(async () => {
        order.flagProviderOutcomeUnknown(this.deps.clock.now());
        await this.deps.events.publish(order.pullEvents());
        await this.deps.idempotency.release(recordId);
      });
      throw new ProviderOutcomeUnknownError('order.create', order.id);
    }

    await this.deps.idempotency.release(recordId);
    if (error instanceof ProviderErrors.ProviderUnavailableError)
      throw new ProviderUnavailableError('order.create');
    if (error instanceof ProviderErrors.ProviderCapabilityError) {
      throw new CapabilityNotSupportedError(error.provider, error.capability, error.status);
    }
    if (error instanceof ProviderErrors.ProviderOperationNotImplementedError) {
      throw new CapabilityNotSupportedError(error.provider, error.operation, 'not implemented');
    }
    throw error;
  }

  private async resolveProviderAccount(merchant: MerchantContext): Promise<ProviderAccountRef> {
    const profile = await this.deps.merchants.getPaymentProfile(merchant.merchantId);
    // PRD 5.3: test keys work from signup (status `onboarding`); live requires gateway approval.
    const allowed = merchant.mode === 'test' ? ['onboarding', 'active'] : ['active'];
    if (!profile || !allowed.includes(profile.status)) {
      throw new MerchantNotPermittedError(
        `Merchant cannot accept ${merchant.mode}-mode payments in its current status.`,
      );
    }
    if (merchant.mode === 'live' && !profile.liveChargesEnabled) {
      throw new MerchantNotPermittedError(
        'Live payments are not enabled until onboarding is approved.',
      );
    }
    const account = profile.providerAccounts[merchant.mode];
    if (!account) {
      throw new MerchantNotPermittedError(
        `No ${merchant.mode}-mode payment account is configured for this merchant.`,
      );
    }
    return account;
  }
}
