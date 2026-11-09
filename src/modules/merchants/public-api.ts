/**
 * Published contract of the Merchant Management context. Other modules depend
 * on these types and tokens only; they never read merchant tables directly.
 * Must stay free of framework and infrastructure imports.
 */
import type { ApiMode } from '../../shared/application/merchant-context';
import type { PaymentProviderName } from '../../integrations/payment-providers/domain-ports/payment-provider.port';

export type MerchantStatus = 'onboarding' | 'active' | 'suspended' | 'closed';

export interface MerchantPaymentProfile {
  readonly merchantId: string;
  readonly status: MerchantStatus;
  /** Live charges are enabled only after the gateway approves KYB (PRD 5.3 step 5). */
  readonly liveChargesEnabled: boolean;
  /** Internal provider account per mode; null if not yet created at the gateway. */
  readonly providerAccounts: Readonly<
    Record<ApiMode, { provider: PaymentProviderName; accountId: string } | null>
  >;
}

export interface MerchantPaymentProfileReader {
  getPaymentProfile(merchantId: string): Promise<MerchantPaymentProfile | null>;
}

export const MERCHANT_PAYMENT_PROFILE_READER = Symbol('MerchantPaymentProfileReader');

/** Creates the merchant workspace at signup (status `onboarding`, test mode only). */
export interface MerchantRegistrar {
  register(input: { legalName: string; displayName: string }): Promise<{ merchantId: string }>;
}

export const MERCHANT_REGISTRAR = Symbol('MerchantRegistrar');

export type ProviderAccountProvisioning =
  | { status: 'ready'; provider: PaymentProviderName; accountId: string }
  | { status: 'unavailable'; reason: string };

/** Lifecycle operations other contexts trigger (e.g. onboarding approval). */
export interface MerchantLifecycle {
  /** Gateway approved KYB: merchant becomes active and may use live keys (PRD 5.3 step 5). */
  enableLiveCharges(
    merchantId: string,
    actor: { type: 'user' | 'system' | 'provider'; id: string },
  ): Promise<void>;
  /** Creates the merchant's gateway sub-account for `mode` if missing. Never call inside a unit of work. */
  ensureProviderAccount(
    merchantId: string,
    mode: ApiMode,
    legalName: string,
    email: string,
  ): Promise<ProviderAccountProvisioning>;
}

export const MERCHANT_LIFECYCLE = Symbol('MerchantLifecycle');
