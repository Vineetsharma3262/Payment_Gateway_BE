import {
  capabilityMatrix,
  PAYMENT_PROVIDER_CAPABILITIES,
  type CapabilityMatrix,
} from '../domain-ports/capabilities';
import type {
  CheckoutSignatureInput,
  CreateProviderOrderCommand,
  CreateProviderRefundCommand,
  CreateSubMerchantCommand,
  PaymentProvider,
  ProviderAccountRef,
  ProviderAccountState,
  ProviderMode,
  ProviderOrder,
  ProviderPayment,
  ProviderRefund,
  ProviderSettlement,
  ProviderTransaction,
  RawProviderWebhook,
  SubmitAccountOnboardingCommand,
  VerifiedProviderEvent,
} from '../domain-ports/payment-provider.port';
import {
  ProviderOutcomeUnknownError,
  ProviderRejectedError,
  ProviderSignatureInvalidError,
  ProviderUnavailableError,
} from '../domain-ports/provider-errors';
import { assertCapability } from '../provider-base';
import { hmacSha256Hex, safeEqual } from '../signatures';

export type FakeOutcome =
  'ok' | 'reject' | 'unavailable' | 'timeout_after_processing' | 'timeout_before_processing';

/**
 * Deterministic in-memory provider for unit, e2e and local development.
 * `timeout_after_processing` simulates the dangerous case: the provider created
 * the resource but PayCo never saw the response.
 */
export class FakePaymentProvider implements PaymentProvider {
  readonly name = 'fake' as const;
  static readonly CHECKOUT_SECRET = 'fake_checkout_secret';
  static readonly WEBHOOK_SECRET = 'fake_webhook_secret';

  readonly orders = new Map<string, ProviderOrder & { accountId: string }>();
  readonly refunds = new Map<string, ProviderRefund>();
  readonly calls: { operation: string; reference?: string }[] = [];
  private queuedOutcomes: FakeOutcome[] = [];
  private sequence = 0;

  constructor(
    private readonly matrix: CapabilityMatrix = capabilityMatrix(
      Object.fromEntries(PAYMENT_PROVIDER_CAPABILITIES.map((c) => [c, 'supported'])),
    ),
  ) {}

  /** Queue outcomes consumed by subsequent mutating calls (FIFO). Default is `ok`. */
  queueOutcomes(...outcomes: FakeOutcome[]): void {
    this.queuedOutcomes.push(...outcomes);
  }

  capabilities(): CapabilityMatrix {
    return this.matrix;
  }

  async createOrder(command: CreateProviderOrderCommand): Promise<ProviderOrder> {
    this.calls.push({ operation: 'order.create', reference: command.reference });
    assertCapability(this.name, this.matrix, 'order.create', command.mode);
    return await this.mutate('order.create', () => {
      const order = {
        providerOrderId: `fake_order_${++this.sequence}`,
        reference: command.reference,
        amount: command.amount,
        status: 'created' as const,
        accountId: command.account.accountId,
      };
      this.orders.set(order.providerOrderId, order);
      return order;
    });
  }

  async findOrderByReference(
    mode: ProviderMode,
    account: ProviderAccountRef,
    reference: string,
  ): Promise<ProviderOrder | null> {
    this.calls.push({ operation: 'order.find_by_reference', reference });
    assertCapability(this.name, this.matrix, 'order.find_by_reference', mode);
    await Promise.resolve();
    const match = [...this.orders.values()].find(
      (o) => o.reference === reference && o.accountId === account.accountId,
    );
    return match ?? null;
  }

  retrievePayment(
    _mode: ProviderMode,
    _account: ProviderAccountRef,
    id: string,
  ): Promise<ProviderPayment> {
    return Promise.reject(
      new ProviderRejectedError(this.name, 'payment.retrieve', `unknown payment ${id}`),
    );
  }

  verifyCheckoutSignature(input: CheckoutSignatureInput): Promise<boolean> {
    const expected = hmacSha256Hex(
      FakePaymentProvider.CHECKOUT_SECRET,
      `${input.providerOrderId}|${input.providerPaymentId}`,
    );
    return Promise.resolve(safeEqual(expected, input.signature));
  }

  async createRefund(command: CreateProviderRefundCommand): Promise<ProviderRefund> {
    assertCapability(this.name, this.matrix, 'refund.create', command.mode);
    return await this.mutate('refund.create', () => {
      const refund: ProviderRefund = {
        providerRefundId: `fake_refund_${++this.sequence}`,
        status: 'pending',
        amount: command.amount,
      };
      this.refunds.set(refund.providerRefundId, refund);
      return refund;
    });
  }

  retrieveRefund(
    _mode: ProviderMode,
    _account: ProviderAccountRef,
    id: string,
  ): Promise<ProviderRefund> {
    const refund = this.refunds.get(id);
    return refund
      ? Promise.resolve(refund)
      : Promise.reject(
          new ProviderRejectedError(this.name, 'refund.retrieve', `unknown refund ${id}`),
        );
  }

  createSubMerchantAccount(command: CreateSubMerchantCommand): Promise<ProviderAccountState> {
    return Promise.resolve({
      account: { provider: this.name, accountId: `fake_acc_${command.reference}` },
      status: 'pending_review',
      requirements: [],
    });
  }

  submitAccountOnboarding(command: SubmitAccountOnboardingCommand): Promise<ProviderAccountState> {
    this.calls.push({
      operation: 'sub_merchant.submit_onboarding',
      reference: command.account.accountId,
    });
    return this.mutate('sub_merchant.submit_onboarding', () => ({
      account: command.account,
      status: 'pending_review' as const,
      requirements: [],
    }));
  }

  retrieveAccountStatus(
    _mode: ProviderMode,
    account: ProviderAccountRef,
  ): Promise<ProviderAccountState> {
    return Promise.resolve({ account, status: 'approved', requirements: [] });
  }

  listSettlements(): Promise<readonly ProviderSettlement[]> {
    return Promise.resolve([]);
  }

  listTransactions(): Promise<readonly ProviderTransaction[]> {
    return Promise.resolve([]);
  }

  verifyWebhook(webhook: RawProviderWebhook): Promise<VerifiedProviderEvent> {
    const signature = webhook.headers['x-fake-signature'];
    if (
      !signature ||
      !safeEqual(hmacSha256Hex(FakePaymentProvider.WEBHOOK_SECRET, webhook.rawBody), signature)
    ) {
      return Promise.reject(new ProviderSignatureInvalidError(this.name, 'webhook.verify'));
    }
    const body = JSON.parse(webhook.rawBody.toString('utf8')) as {
      id: string;
      type: VerifiedProviderEvent['type'];
      account_id?: string;
      created_at: string;
      data: unknown;
    };
    return Promise.resolve({
      provider: this.name,
      providerEventId: body.id,
      type: body.type,
      providerType: body.type,
      accountId: body.account_id ?? null,
      occurredAt: new Date(body.created_at),
      payload: body.data,
    });
  }

  /** Test helper: sign a body the way the fake provider would. */
  static signWebhook(rawBody: Buffer | string): string {
    return hmacSha256Hex(FakePaymentProvider.WEBHOOK_SECRET, rawBody);
  }

  private mutate<T>(operation: string, effect: () => T): Promise<T> {
    const outcome = this.queuedOutcomes.shift() ?? 'ok';
    switch (outcome) {
      case 'ok':
        return Promise.resolve(effect());
      case 'reject':
        return Promise.reject(
          new ProviderRejectedError(this.name, operation, 'simulated rejection'),
        );
      case 'unavailable':
      case 'timeout_before_processing':
        return Promise.reject(new ProviderUnavailableError(this.name, operation, outcome));
      case 'timeout_after_processing':
        effect();
        return Promise.reject(
          new ProviderOutcomeUnknownError(this.name, operation, 'simulated timeout'),
        );
    }
  }
}
