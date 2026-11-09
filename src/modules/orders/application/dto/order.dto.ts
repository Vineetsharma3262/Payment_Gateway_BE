import type { MerchantContext } from '../../../../shared/application/merchant-context';
import type { Currency } from '../../../../shared/domain/money';
import type { OrderStatus } from '../../domain/value-objects/order-status';

/** JSON-safe application output. Also stored verbatim as the idempotent replay body. */
export interface OrderDto {
  id: string;
  merchantId: string;
  mode: 'test' | 'live';
  amountMinor: number;
  currency: Currency;
  status: OrderStatus;
  receipt: string | null;
  notes: Record<string, string>;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateOrderInput {
  merchant: MerchantContext;
  idempotencyKey: string;
  amountMinor: number;
  /** As received; the use case enforces the USD-only restriction. */
  currency: string;
  receipt?: string;
  notes?: Record<string, string>;
}

export interface GetOrderInput {
  merchant: MerchantContext;
  orderId: string;
}
