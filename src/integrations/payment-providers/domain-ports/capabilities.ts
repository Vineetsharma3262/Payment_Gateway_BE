/**
 * Not every provider (or every contract with a provider) supports every
 * operation. Adapters declare a status per capability and unsupported or
 * unconfirmed operations fail explicitly instead of silently degrading.
 *
 * `unconfirmed` means the provider may offer it, but PayCo has not confirmed it
 * under the proposed contract (see docs/open-questions.md). Unconfirmed
 * capabilities are refused in live mode.
 */
export const PAYMENT_PROVIDER_CAPABILITIES = [
  'sub_merchant.create',
  'sub_merchant.submit_onboarding',
  'sub_merchant.retrieve_status',
  'order.create',
  'order.find_by_reference',
  'payment.retrieve',
  'checkout.verify_signature',
  'refund.create',
  'refund.retrieve',
  'settlement.retrieve',
  'webhook.verify',
  'reconciliation.transactions',
  'platform_fee.split',
  'branding.statement_descriptor',
] as const;

export type PaymentProviderCapability = (typeof PAYMENT_PROVIDER_CAPABILITIES)[number];
export type CapabilityStatus = 'supported' | 'unconfirmed' | 'unsupported';
export type CapabilityMatrix = Readonly<Record<PaymentProviderCapability, CapabilityStatus>>;

export function capabilityMatrix(
  overrides: Partial<Record<PaymentProviderCapability, CapabilityStatus>>,
): CapabilityMatrix {
  const matrix = {} as Record<PaymentProviderCapability, CapabilityStatus>;
  for (const capability of PAYMENT_PROVIDER_CAPABILITIES) {
    matrix[capability] = overrides[capability] ?? 'unsupported';
  }
  return Object.freeze(matrix);
}
