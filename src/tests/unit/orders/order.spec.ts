import { InvalidStateTransitionError } from '../../../shared/domain/domain-error';
import { Money } from '../../../shared/domain/money';
import { Order } from '../../../modules/orders/domain/entities/order';
import {
  InvalidOrderAmountError,
  InvalidOrderNotesError,
  InvalidOrderReceiptError,
} from '../../../modules/orders/domain/errors/order.errors';
import {
  canTransition,
  ORDER_STATUSES,
} from '../../../modules/orders/domain/value-objects/order-status';
import { ProviderOrderRef } from '../../../modules/orders/domain/value-objects/provider-order-ref';

const now = new Date('2026-10-27T12:00:00Z');
const newOrder = (amount = 2500) =>
  Order.create({
    id: 'ord_1',
    merchantId: 'mer_1',
    mode: 'test',
    amount: Money.of(amount, 'USD'),
    now,
  });

describe('Order aggregate', () => {
  it('is created in `created` state and records order.created', () => {
    const order = newOrder();
    expect(order.status).toBe('created');
    expect(order.pullEvents().map((e) => e.eventType)).toEqual(['order.created']);
    expect(order.pullEvents()).toEqual([]);
  });

  it.each([0, -100])('rejects non-positive amount %p', (amount) => {
    expect(() => newOrder(amount)).toThrow(InvalidOrderAmountError);
  });

  it('validates receipt and notes limits', () => {
    const base = {
      id: 'o',
      merchantId: 'm',
      mode: 'test' as const,
      amount: Money.of(1, 'USD'),
      now,
    };
    expect(() => Order.create({ ...base, receipt: 'x'.repeat(41) })).toThrow(
      InvalidOrderReceiptError,
    );
    const tooMany = Object.fromEntries(Array.from({ length: 16 }, (_, i) => [`k${i}`, 'v']));
    expect(() => Order.create({ ...base, notes: tooMany })).toThrow(InvalidOrderNotesError);
    expect(() => Order.create({ ...base, notes: { k: 'v'.repeat(257) } })).toThrow(
      InvalidOrderNotesError,
    );
  });

  it('follows the allowed lifecycle', () => {
    const order = newOrder();
    order.attachProviderOrder(ProviderOrderRef.of('fake', 'po_1'), now);
    expect(order.status).toBe('awaiting_payment');
    order.markPaid(now);
    expect(order.status).toBe('paid');
    expect(order.pullEvents().map((e) => e.eventType)).toEqual([
      'order.created',
      'order.awaiting_payment',
      'order.paid',
    ]);
  });

  it('treats a duplicate paid signal as a no-op (duplicate webhooks)', () => {
    const order = newOrder();
    order.attachProviderOrder(ProviderOrderRef.of('fake', 'po_1'), now);
    order.markPaid(now);
    order.pullEvents();
    order.markPaid(now);
    expect(order.pullEvents()).toEqual([]);
  });

  it('rejects invalid transitions (out-of-order events)', () => {
    const order = newOrder();
    expect(() => order.markPaid(now)).toThrow(InvalidStateTransitionError);
    order.markProviderRejected('declined', now);
    expect(() => order.attachProviderOrder(ProviderOrderRef.of('fake', 'po'), now)).toThrow(
      InvalidStateTransitionError,
    );
  });

  it('has no transitions out of terminal states', () => {
    for (const from of ['paid', 'expired', 'failed'] as const) {
      for (const to of ORDER_STATUSES) expect(canTransition(from, to)).toBe(false);
    }
  });
});
