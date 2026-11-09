import type { Money } from '../../../shared/domain/money';
import type { CapabilityMatrix } from './capabilities';

/**
 * Provider-neutral contract between PayCo's application layer and payment
 * processors (Razorpay US, Stripe Connect, fakes). No provider SDK type crosses
 * this boundary. Provider identifiers appear here only so they can be stored in
 * PayCo's internal mapping tables; they are never returned by the public API.
 */
export type PaymentProviderName = 'razorpay' | 'stripe_connect' | 'fake';
export type ProviderMode = 'test' | 'live';

/** Reference to a merchant's sub-merchant / connected account at the provider. Internal only. */
export interface ProviderAccountRef {
  readonly provider: PaymentProviderName;
  readonly accountId: string;
}

export interface CreateProviderOrderCommand {
  readonly mode: ProviderMode;
  readonly account: ProviderAccountRef;
  /** PayCo order id, sent as the provider-side reference so orphaned orders can be found again. */
  readonly reference: string;
  readonly amount: Money;
  /** PRD 7.2: idempotency keys are passed through to the gateway where it supports them. */
  readonly idempotencyKey: string;
}

export interface ProviderOrder {
  readonly providerOrderId: string;
  readonly reference: string;
  readonly amount: Money;
  readonly status: 'created' | 'attempted' | 'paid';
}

export type ProviderPaymentStatus = 'pending' | 'authorized' | 'captured' | 'failed' | 'refunded';

export interface ProviderPayment {
  readonly providerPaymentId: string;
  readonly providerOrderId: string | null;
  readonly amount: Money;
  readonly status: ProviderPaymentStatus;
  readonly failureReason: string | null;
}

export interface CheckoutSignatureInput {
  readonly mode: ProviderMode;
  readonly providerOrderId: string;
  readonly providerPaymentId: string;
  readonly signature: string;
}

export interface CreateProviderRefundCommand {
  readonly mode: ProviderMode;
  readonly account: ProviderAccountRef;
  readonly providerPaymentId: string;
  readonly amount: Money;
  readonly reference: string;
  readonly idempotencyKey: string;
}

export interface ProviderRefund {
  readonly providerRefundId: string;
  readonly status: 'pending' | 'processed' | 'failed';
  readonly amount: Money;
}

export interface CreateSubMerchantCommand {
  readonly mode: ProviderMode;
  /** PayCo merchant id used as provider-side reference. */
  readonly reference: string;
  readonly legalBusinessName: string;
  readonly email: string;
}

/** KYB/KYC data PayCo collected and passes to the gateway (PRD 5.3 step 3). Decrypted only for this call. */
export interface SubmitAccountOnboardingCommand {
  readonly mode: ProviderMode;
  readonly account: ProviderAccountRef;
  readonly business: {
    readonly legalName: string;
    readonly doingBusinessAs: string | null;
    readonly type: string;
    readonly ein: string;
    readonly website: string | null;
    readonly phone: string;
    readonly address: Readonly<Record<string, string | null>>;
  };
  readonly owners: readonly {
    readonly firstName: string;
    readonly lastName: string;
    readonly email: string;
    readonly title: string | null;
    readonly ownershipPercent: number;
    readonly isController: boolean;
    readonly dateOfBirth: string;
    readonly ssnLast4: string;
  }[];
  /** Gateway-issued token for the bank account (never raw account numbers). */
  readonly bankAccountToken: string;
  readonly termsAcceptedAt: Date;
}

export type ProviderAccountStatus =
  'pending_review' | 'needs_information' | 'approved' | 'rejected';

export interface ProviderAccountState {
  readonly account: ProviderAccountRef;
  readonly status: ProviderAccountStatus;
  readonly requirements: readonly string[];
}

export interface SettlementQuery {
  readonly mode: ProviderMode;
  readonly account: ProviderAccountRef;
  readonly from: Date;
  readonly to: Date;
}

export interface ProviderSettlement {
  readonly providerSettlementId: string;
  readonly amount: Money;
  readonly fees: Money;
  readonly status: 'created' | 'processed' | 'failed';
  readonly settledAt: Date | null;
}

export interface ProviderTransaction {
  readonly providerTransactionId: string;
  readonly kind: 'payment' | 'refund' | 'adjustment' | 'dispute';
  readonly providerReference: string | null;
  readonly amount: Money;
  readonly fee: Money;
  readonly occurredAt: Date;
}

export interface RawProviderWebhook {
  readonly mode: ProviderMode;
  /** The exact bytes received. Signatures are computed over these, never over re-serialised JSON. */
  readonly rawBody: Buffer;
  readonly headers: Readonly<Record<string, string | undefined>>;
}

/** A provider event translated into PayCo vocabulary after its signature was verified. */
export interface VerifiedProviderEvent {
  readonly provider: PaymentProviderName;
  /** Provider's event id, used for deduplication. */
  readonly providerEventId: string;
  readonly type:
    | 'payment.authorized'
    | 'payment.captured'
    | 'payment.failed'
    | 'refund.processed'
    | 'refund.failed'
    | 'dispute.created'
    | 'dispute.updated'
    | 'settlement.processed'
    | 'account.updated'
    | 'unknown';
  readonly providerType: string;
  readonly accountId: string | null;
  readonly occurredAt: Date;
  /** Parsed provider payload, stored for audit and replay. Treated as untrusted beyond the signature. */
  readonly payload: unknown;
}

export interface PaymentProvider {
  readonly name: PaymentProviderName;
  capabilities(): CapabilityMatrix;

  createSubMerchantAccount(command: CreateSubMerchantCommand): Promise<ProviderAccountState>;
  submitAccountOnboarding(command: SubmitAccountOnboardingCommand): Promise<ProviderAccountState>;
  retrieveAccountStatus(
    mode: ProviderMode,
    account: ProviderAccountRef,
  ): Promise<ProviderAccountState>;

  createOrder(command: CreateProviderOrderCommand): Promise<ProviderOrder>;
  /** Used to recover after an unknown outcome: did the provider create an order for this reference? */
  findOrderByReference(
    mode: ProviderMode,
    account: ProviderAccountRef,
    reference: string,
  ): Promise<ProviderOrder | null>;

  retrievePayment(
    mode: ProviderMode,
    account: ProviderAccountRef,
    providerPaymentId: string,
  ): Promise<ProviderPayment>;
  verifyCheckoutSignature(input: CheckoutSignatureInput): Promise<boolean>;

  createRefund(command: CreateProviderRefundCommand): Promise<ProviderRefund>;
  retrieveRefund(
    mode: ProviderMode,
    account: ProviderAccountRef,
    providerRefundId: string,
  ): Promise<ProviderRefund>;

  listSettlements(query: SettlementQuery): Promise<readonly ProviderSettlement[]>;
  listTransactions(query: SettlementQuery): Promise<readonly ProviderTransaction[]>;

  /** Throws ProviderSignatureInvalidError when the signature does not match the raw body. */
  verifyWebhook(webhook: RawProviderWebhook): Promise<VerifiedProviderEvent>;
}

export interface PaymentProviderRegistry {
  get(name: PaymentProviderName): PaymentProvider;
}

export const PAYMENT_PROVIDER_REGISTRY = Symbol('PaymentProviderRegistry');
