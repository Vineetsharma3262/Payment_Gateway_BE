import { capabilityMatrix, type CapabilityMatrix } from '../domain-ports/capabilities';
import type {
  CheckoutSignatureInput,
  CreateProviderOrderCommand,
  CreateProviderRefundCommand,
  PaymentProvider,
  ProviderAccountRef,
  ProviderAccountState,
  ProviderMode,
  ProviderOrder,
  ProviderPayment,
  ProviderPaymentStatus,
  ProviderRefund,
  ProviderSettlement,
  ProviderTransaction,
  RawProviderWebhook,
  VerifiedProviderEvent,
} from '../domain-ports/payment-provider.port';
import {
  ProviderOperationNotImplementedError,
  ProviderSignatureInvalidError,
} from '../domain-ports/provider-errors';
import { assertCapability, usdFromProviderCents } from '../provider-base';
import { hmacSha256Hex, safeEqual } from '../signatures';
import { RazorpayHttpClient } from './razorpay-http.client';
import type { RazorpayAdapterConfig } from './razorpay.config';
import type {
  RazorpayCollection,
  RazorpayOrder,
  RazorpayPayment,
  RazorpayRefund,
  RazorpayWebhookEnvelope,
} from './razorpay.types';

/**
 * Capability statuses reflect PRD section 2 ("Partner fit: Razorpay US").
 * Pay-in primitives are listed as available; the platform / sub-merchant
 * programme, fee split and statement-descriptor control are NOT publicly listed
 * for the US and stay `unconfirmed` until Razorpay confirms them in writing.
 */
const RAZORPAY_US_CAPABILITIES = capabilityMatrix({
  'order.create': 'supported',
  'order.find_by_reference': 'supported',
  'payment.retrieve': 'supported',
  'checkout.verify_signature': 'supported',
  'refund.create': 'supported',
  'refund.retrieve': 'supported',
  'webhook.verify': 'supported',
  'settlement.retrieve': 'unconfirmed',
  'reconciliation.transactions': 'unconfirmed',
  'sub_merchant.create': 'unconfirmed',
  'sub_merchant.submit_onboarding': 'unconfirmed',
  'sub_merchant.retrieve_status': 'unconfirmed',
  'platform_fee.split': 'unconfirmed',
  'branding.statement_descriptor': 'unconfirmed',
});

const PAYMENT_STATUS: Record<RazorpayPayment['status'], ProviderPaymentStatus> = {
  created: 'pending',
  authorized: 'authorized',
  captured: 'captured',
  refunded: 'refunded',
  failed: 'failed',
};

const EVENT_TYPES: Record<string, VerifiedProviderEvent['type']> = {
  'payment.authorized': 'payment.authorized',
  'payment.captured': 'payment.captured',
  'payment.failed': 'payment.failed',
  'refund.processed': 'refund.processed',
  'refund.failed': 'refund.failed',
  'payment.dispute.created': 'dispute.created',
  'payment.dispute.won': 'dispute.updated',
  'payment.dispute.lost': 'dispute.updated',
  'payment.dispute.closed': 'dispute.updated',
  'settlement.processed': 'settlement.processed',
  'account.updated': 'account.updated',
};

/** Razorpay limits `receipt` to 40 characters; PayCo ids are well under that. */
const MAX_RECEIPT_LENGTH = 40;

export class RazorpayPaymentProvider implements PaymentProvider {
  readonly name = 'razorpay' as const;
  private readonly http: RazorpayHttpClient;

  constructor(private readonly config: RazorpayAdapterConfig) {
    this.http = new RazorpayHttpClient(config);
  }

  capabilities(): CapabilityMatrix {
    return RAZORPAY_US_CAPABILITIES;
  }

  /**
   * Razorpay does not document an idempotency header for order creation, so
   * PayCo's order id is sent as `receipt` and `findOrderByReference` is used to
   * detect an order created by a request whose response was lost.
   */
  async createOrder(command: CreateProviderOrderCommand): Promise<ProviderOrder> {
    this.assert('order.create', command.mode);
    if (command.reference.length > MAX_RECEIPT_LENGTH) {
      throw new Error('PayCo order reference exceeds Razorpay receipt length.');
    }
    const order = await this.http.request<RazorpayOrder>({
      mode: command.mode,
      operation: 'order.create',
      method: 'POST',
      path: '/v1/orders',
      accountId: command.account.accountId,
      body: {
        amount: command.amount.amountMinor,
        currency: command.amount.currency,
        receipt: command.reference,
        notes: { payco_reference: command.reference },
      },
    });
    return this.toProviderOrder(order);
  }

  async findOrderByReference(
    mode: ProviderMode,
    account: ProviderAccountRef,
    reference: string,
  ): Promise<ProviderOrder | null> {
    this.assert('order.find_by_reference', mode);
    const result = await this.http.request<RazorpayCollection<RazorpayOrder>>({
      mode,
      operation: 'order.find_by_reference',
      method: 'GET',
      path: `/v1/orders?receipt=${encodeURIComponent(reference)}`,
      accountId: account.accountId,
    });
    const match = result.items.find((o) => o.receipt === reference);
    return match ? this.toProviderOrder(match) : null;
  }

  async retrievePayment(
    mode: ProviderMode,
    account: ProviderAccountRef,
    providerPaymentId: string,
  ): Promise<ProviderPayment> {
    this.assert('payment.retrieve', mode);
    const payment = await this.http.request<RazorpayPayment>({
      mode,
      operation: 'payment.retrieve',
      method: 'GET',
      path: `/v1/payments/${encodeURIComponent(providerPaymentId)}`,
      accountId: account.accountId,
    });
    return {
      providerPaymentId: payment.id,
      providerOrderId: payment.order_id,
      amount: usdFromProviderCents(payment.amount, payment.currency),
      status: PAYMENT_STATUS[payment.status],
      failureReason: payment.error_description,
    };
  }

  /** Razorpay checkout signature: HMAC-SHA256(`order_id|payment_id`, key_secret). */
  async verifyCheckoutSignature(input: CheckoutSignatureInput): Promise<boolean> {
    this.assert('checkout.verify_signature', input.mode);
    const { keySecret } = await this.config.credentials(input.mode);
    const expected = hmacSha256Hex(
      keySecret,
      `${input.providerOrderId}|${input.providerPaymentId}`,
    );
    return safeEqual(expected, input.signature);
  }

  async createRefund(command: CreateProviderRefundCommand): Promise<ProviderRefund> {
    this.assert('refund.create', command.mode);
    const refund = await this.http.request<RazorpayRefund>({
      mode: command.mode,
      operation: 'refund.create',
      method: 'POST',
      path: `/v1/payments/${encodeURIComponent(command.providerPaymentId)}/refund`,
      accountId: command.account.accountId,
      body: {
        amount: command.amount.amountMinor,
        receipt: command.reference,
        notes: { payco_reference: command.reference },
      },
    });
    return this.toProviderRefund(refund);
  }

  async retrieveRefund(
    mode: ProviderMode,
    account: ProviderAccountRef,
    providerRefundId: string,
  ): Promise<ProviderRefund> {
    this.assert('refund.retrieve', mode);
    const refund = await this.http.request<RazorpayRefund>({
      mode,
      operation: 'refund.retrieve',
      method: 'GET',
      path: `/v1/refunds/${encodeURIComponent(providerRefundId)}`,
      accountId: account.accountId,
    });
    return this.toProviderRefund(refund);
  }

  /** Razorpay webhook signature: HMAC-SHA256(raw body, webhook secret), header `X-Razorpay-Signature`. */
  async verifyWebhook(webhook: RawProviderWebhook): Promise<VerifiedProviderEvent> {
    this.assert('webhook.verify', webhook.mode);
    const signature = webhook.headers['x-razorpay-signature'];
    const eventId = webhook.headers['x-razorpay-event-id'];
    const { webhookSecret } = await this.config.credentials(webhook.mode);
    if (!signature || !safeEqual(hmacSha256Hex(webhookSecret, webhook.rawBody), signature)) {
      throw new ProviderSignatureInvalidError(this.name, 'webhook.verify');
    }
    const envelope = JSON.parse(webhook.rawBody.toString('utf8')) as RazorpayWebhookEnvelope;
    if (!eventId) throw new ProviderSignatureInvalidError(this.name, 'webhook.verify');
    return {
      provider: this.name,
      providerEventId: eventId,
      type: EVENT_TYPES[envelope.event] ?? 'unknown',
      providerType: envelope.event,
      accountId: envelope.account_id ?? null,
      occurredAt: new Date(envelope.created_at * 1000),
      payload: envelope.payload,
    };
  }

  createSubMerchantAccount(): Promise<ProviderAccountState> {
    return this.notImplemented('sub_merchant.create');
  }

  submitAccountOnboarding(): Promise<ProviderAccountState> {
    return this.notImplemented('sub_merchant.submit_onboarding');
  }

  retrieveAccountStatus(): Promise<ProviderAccountState> {
    return this.notImplemented('sub_merchant.retrieve_status');
  }

  listSettlements(): Promise<readonly ProviderSettlement[]> {
    return this.notImplemented('settlement.retrieve');
  }

  listTransactions(): Promise<readonly ProviderTransaction[]> {
    return this.notImplemented('reconciliation.transactions');
  }

  private assert(capability: Parameters<typeof assertCapability>[2], mode: ProviderMode): void {
    assertCapability(this.name, RAZORPAY_US_CAPABILITIES, capability, mode);
  }

  private notImplemented<T>(operation: string): Promise<T> {
    return Promise.reject(
      new ProviderOperationNotImplementedError(
        this.name,
        operation,
        'awaiting confirmation of the Razorpay US platform programme (docs/open-questions.md Q1-Q2)',
      ),
    );
  }

  private toProviderOrder(order: RazorpayOrder): ProviderOrder {
    return {
      providerOrderId: order.id,
      reference: order.receipt ?? '',
      amount: usdFromProviderCents(order.amount, order.currency),
      status: order.status,
    };
  }

  private toProviderRefund(refund: RazorpayRefund): ProviderRefund {
    return {
      providerRefundId: refund.id,
      status: refund.status,
      amount: usdFromProviderCents(refund.amount, refund.currency),
    };
  }
}
