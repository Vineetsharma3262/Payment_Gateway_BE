import type { Order } from '../entities/order';

/**
 * Every read is scoped by merchant: there is deliberately no `findById(id)`
 * for merchant-facing flows. Internal flows that resolve an order from a
 * provider event use `findByProviderOrder` and must then act on the order's own
 * merchant id.
 */
export interface OrderRepository {
  findForMerchant(merchantId: string, orderId: string): Promise<Order | null>;
  findByProviderOrder(provider: string, providerOrderId: string): Promise<Order | null>;
  insert(order: Order): Promise<void>;
  /** Optimistic concurrency: fails with ConcurrencyConflictError if the stored version changed. */
  save(order: Order): Promise<void>;
}

export const ORDER_REPOSITORY = Symbol('OrderRepository');
