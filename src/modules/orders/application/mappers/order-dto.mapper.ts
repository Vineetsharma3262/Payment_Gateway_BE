import type { Order } from '../../domain/entities/order';
import type { OrderDto } from '../dto/order.dto';

/** Deliberately omits the provider order reference: provider ids are internal. */
export function toOrderDto(order: Order): OrderDto {
  return {
    id: order.id,
    merchantId: order.merchantId,
    mode: order.mode,
    amountMinor: order.amount.amountMinor,
    currency: order.amount.currency,
    status: order.status,
    receipt: order.receipt,
    notes: { ...order.notes },
    failureReason: order.failureReason,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
  };
}
