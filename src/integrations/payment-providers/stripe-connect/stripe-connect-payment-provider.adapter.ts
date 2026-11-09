import { capabilityMatrix, type CapabilityMatrix } from '../domain-ports/capabilities';
import type {
  PaymentProvider,
  ProviderAccountState,
  ProviderOrder,
  ProviderPayment,
  ProviderRefund,
  ProviderSettlement,
  ProviderTransaction,
  VerifiedProviderEvent,
} from '../domain-ports/payment-provider.port';
import { ProviderOperationNotImplementedError } from '../domain-ports/provider-errors';

/**
 * Fallback provider named by the PRD decision gate (section 2). Stripe Connect
 * publicly offers connected accounts, application fees and webhooks for
 * connected accounts, but PayCo's eligibility and contract are not established,
 * so everything is `unconfirmed` and no call is implemented yet. The adapter
 * exists so the registry, configuration and capability checks are exercised
 * against a second provider from day one.
 */
const STRIPE_CONNECT_CAPABILITIES = capabilityMatrix({
  'sub_merchant.create': 'unconfirmed',
  'sub_merchant.submit_onboarding': 'unconfirmed',
  'sub_merchant.retrieve_status': 'unconfirmed',
  'order.create': 'unconfirmed',
  'order.find_by_reference': 'unconfirmed',
  'payment.retrieve': 'unconfirmed',
  'checkout.verify_signature': 'unsupported',
  'refund.create': 'unconfirmed',
  'refund.retrieve': 'unconfirmed',
  'settlement.retrieve': 'unconfirmed',
  'webhook.verify': 'unconfirmed',
  'reconciliation.transactions': 'unconfirmed',
  'platform_fee.split': 'unconfirmed',
  'branding.statement_descriptor': 'unconfirmed',
});

export class StripeConnectPaymentProvider implements PaymentProvider {
  readonly name = 'stripe_connect' as const;

  capabilities(): CapabilityMatrix {
    return STRIPE_CONNECT_CAPABILITIES;
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
  createOrder(): Promise<ProviderOrder> {
    return this.notImplemented('order.create');
  }
  findOrderByReference(): Promise<ProviderOrder | null> {
    return this.notImplemented('order.find_by_reference');
  }
  retrievePayment(): Promise<ProviderPayment> {
    return this.notImplemented('payment.retrieve');
  }
  verifyCheckoutSignature(): Promise<boolean> {
    return this.notImplemented('checkout.verify_signature');
  }
  createRefund(): Promise<ProviderRefund> {
    return this.notImplemented('refund.create');
  }
  retrieveRefund(): Promise<ProviderRefund> {
    return this.notImplemented('refund.retrieve');
  }
  listSettlements(): Promise<readonly ProviderSettlement[]> {
    return this.notImplemented('settlement.retrieve');
  }
  listTransactions(): Promise<readonly ProviderTransaction[]> {
    return this.notImplemented('reconciliation.transactions');
  }
  verifyWebhook(): Promise<VerifiedProviderEvent> {
    return this.notImplemented('webhook.verify');
  }

  private notImplemented<T>(operation: string): Promise<T> {
    return Promise.reject(
      new ProviderOperationNotImplementedError(
        this.name,
        operation,
        'fallback provider not contracted',
      ),
    );
  }
}
