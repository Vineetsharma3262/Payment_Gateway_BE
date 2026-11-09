import type { Money } from '../../../shared/domain/money';
import type { Refund } from './refund';

export interface RefundRepository {
  findForMerchant(merchantId: string, refundId: string): Promise<Refund | null>;
  /** Sum of pending + processing refunds for a payment, read inside the caller's transaction. */
  inFlightTotal(paymentId: string): Promise<Money>;
  insert(refund: Refund): Promise<void>;
  save(refund: Refund): Promise<void>;
}

export const REFUND_REPOSITORY = Symbol('RefundRepository');
