/** Published contract of the Payments context (framework-free). */
export interface RefundablePayment {
  paymentId: string;
  merchantId: string;
  mode: 'test' | 'live';
  status: 'pending' | 'authorized' | 'captured' | 'failed';
  amountMinor: number;
  amountRefundedMinor: number;
  currency: 'USD';
  provider: string;
  providerPaymentId: string;
}

export interface PaymentReader {
  getRefundable(merchantId: string, paymentId: string): Promise<RefundablePayment | null>;
}

export const PAYMENT_READER = Symbol('PaymentReader');
