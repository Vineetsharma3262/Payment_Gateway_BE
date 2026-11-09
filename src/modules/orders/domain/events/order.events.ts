import type { DomainEvent } from '../../../../shared/domain/domain-event';

/** Internal event types. Public merchant webhook names are mapped separately by the webhooks context. */
export const OrderEventTypes = {
  Created: 'order.created',
  AwaitingPayment: 'order.awaiting_payment',
  ProviderCreationFailed: 'order.provider_creation_failed',
  ProviderSyncRequired: 'order.provider_sync_required',
  Paid: 'order.paid',
  Expired: 'order.expired',
} as const;

export type OrderEventType = (typeof OrderEventTypes)[keyof typeof OrderEventTypes];

export interface OrderEventPayload {
  orderId: string;
  mode: 'test' | 'live';
  amountMinor: number;
  currency: string;
  status: string;
  [key: string]: unknown;
}

export type OrderEvent = DomainEvent<OrderEventPayload>;
