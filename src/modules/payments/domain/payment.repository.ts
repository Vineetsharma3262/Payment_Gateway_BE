import type { Page, PageRequest } from '../../../shared/domain/pagination';
import type { Payment, PaymentStatus } from './payment';

export interface PaymentRepository {
  findForMerchant(merchantId: string, paymentId: string): Promise<Payment | null>;
  findByProviderPayment(provider: string, providerPaymentId: string): Promise<Payment | null>;
  list(
    merchantId: string,
    mode: 'test' | 'live',
    filter: { status?: PaymentStatus; orderId?: string },
    page: PageRequest,
  ): Promise<Page<Payment>>;
  /** Persists the payment and its provider-id mapping. */
  insert(payment: Payment, provider: { name: string; providerPaymentId: string }): Promise<void>;
  save(payment: Payment): Promise<void>;
}

export const PAYMENT_REPOSITORY = Symbol('PaymentRepository');
