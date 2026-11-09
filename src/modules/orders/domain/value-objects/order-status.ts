/**
 * Order lifecycle.
 *
 *   created ──► awaiting_payment ──► paid
 *      │               │
 *      ▼               ▼
 *    failed         expired
 *
 * `created`: persisted by PayCo, provider order not yet confirmed.
 * `awaiting_payment`: provider order exists; checkout may be opened.
 * `failed`: provider definitively rejected order creation.
 */
export const ORDER_STATUSES = ['created', 'awaiting_payment', 'paid', 'expired', 'failed'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

const ALLOWED_TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  created: ['awaiting_payment', 'failed'],
  awaiting_payment: ['paid', 'expired'],
  paid: [],
  expired: [],
  failed: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function isTerminal(status: OrderStatus): boolean {
  return ALLOWED_TRANSITIONS[status].length === 0;
}
