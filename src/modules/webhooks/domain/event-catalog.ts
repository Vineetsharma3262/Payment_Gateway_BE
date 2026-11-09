/**
 * Public PayCo webhook event types (PRD 7.3). Internal domain events are
 * mapped to this stable catalogue; provider event names never reach merchants.
 */
export const PUBLIC_EVENT_TYPES = [
  'order.paid',
  'payment.authorized',
  'payment.succeeded',
  'payment.failed',
  'refund.succeeded',
  'refund.failed',
  'dispute.created',
  'dispute.closed',
  'settlement.paid',
  'payout.paid',
  'payout.failed',
  'payout.returned',
] as const;
export type PublicEventType = (typeof PUBLIC_EVENT_TYPES)[number];

const INTERNAL_TO_PUBLIC: Readonly<Record<string, PublicEventType>> = {
  'order.paid': 'order.paid',
  'payment.authorized': 'payment.authorized',
  'payment.captured': 'payment.succeeded',
  'payment.failed': 'payment.failed',
  'refund.succeeded': 'refund.succeeded',
  'refund.failed': 'refund.failed',
  'dispute.created': 'dispute.created',
  'dispute.won': 'dispute.closed',
  'dispute.lost': 'dispute.closed',
  'settlement.processed': 'settlement.paid',
  'payout.paid': 'payout.paid',
  'payout.failed': 'payout.failed',
  'payout.returned': 'payout.returned',
};

/** Null for internal-only events (e.g. `order.provider_sync_required`). */
export function toPublicEventType(internalType: string): PublicEventType | null {
  return INTERNAL_TO_PUBLIC[internalType] ?? null;
}
