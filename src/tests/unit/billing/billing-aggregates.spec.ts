import {
  InvalidStateTransitionError,
  InvariantViolationError,
} from '../../../shared/domain/domain-error';
import { Money } from '../../../shared/domain/money';
import { Dispute, EvidenceDeadlinePassedError } from '../../../modules/disputes/domain/dispute';
import { Invoice } from '../../../modules/invoices/domain/invoice';
import {
  PaymentLink,
  PaymentLinkNotUsableError,
} from '../../../modules/payment-links/domain/payment-link';
import { addMonthsClamped, Subscription } from '../../../modules/subscriptions/domain/subscription';
import { Customer } from '../../../modules/customers/domain/customer';

const usd = (c: number) => Money.of(c, 'USD');
const now = new Date('2026-01-31T10:00:00Z');
const DAY = 86_400_000;

describe('Payment links', () => {
  it('enforces usage limits and lazy expiry', () => {
    const link = PaymentLink.create({
      id: 'plink',
      merchantId: 'm',
      mode: 'test',
      amount: usd(500),
      description: 'Coffee',
      expiresAt: new Date(now.getTime() + DAY),
      maxUses: 2,
      createdAt: now,
    });
    link.recordUse('ord_1', now);
    link.recordUse('ord_2', now);
    expect(link.statusAt(now)).toBe('completed');
    expect(() => link.recordUse('ord_3', now)).toThrow(PaymentLinkNotUsableError);

    const expiring = PaymentLink.create({
      id: 'p2',
      merchantId: 'm',
      mode: 'test',
      amount: usd(500),
      description: 'x',
      expiresAt: new Date(now.getTime() + DAY),
      maxUses: null,
      createdAt: now,
    });
    expect(expiring.statusAt(new Date(now.getTime() + 2 * DAY))).toBe('expired');
    expect(() => expiring.recordUse('o', new Date(now.getTime() + 2 * DAY))).toThrow(
      PaymentLinkNotUsableError,
    );
  });
});

describe('Disputes', () => {
  it('accepts evidence only before the forwarding deadline', () => {
    const open = () =>
      Dispute.open({
        id: 'dsp',
        merchantId: 'm',
        paymentId: 'pay',
        amount: usd(1000),
        reason: 'fraudulent',
        evidenceDueBy: new Date(now.getTime() + 7 * DAY),
        createdAt: now,
      });
    const late = open();
    expect(() => late.submitEvidence(['doc_1'], new Date(now.getTime() + 6.5 * DAY))).toThrow(
      EvidenceDeadlinePassedError,
    );
    const onTime = open();
    onTime.submitEvidence(['doc_1'], new Date(now.getTime() + 2 * DAY));
    onTime.close('won', now);
    onTime.close('won', now);
    expect(() => onTime.close('lost', now)).toThrow(InvalidStateTransitionError);
  });
});

describe('Invoices', () => {
  it('totals lines in integer cents and requires exact payment', () => {
    const inv = Invoice.draft({
      id: 'in',
      merchantId: 'm',
      customerId: 'cus',
      currency: 'USD',
      dueAt: new Date(now.getTime() + 30 * DAY),
      createdAt: now,
    });
    inv.addLine({ description: 'Beans', quantity: 3, unitAmount: usd(1299) });
    inv.addLine({ description: 'Shipping', quantity: 1, unitAmount: usd(500) });
    expect(inv.total().amountMinor).toBe(4397);
    expect(() => inv.markPaid(usd(4397), now)).toThrow(InvalidStateTransitionError);
    inv.finalize(now);
    expect(() => inv.addLine({ description: 'x', quantity: 1, unitAmount: usd(1) })).toThrow(
      InvalidStateTransitionError,
    );
    expect(() => inv.markPaid(usd(4000), now)).toThrow(InvariantViolationError);
    inv.markPaid(usd(4397), now);
    expect(inv.status).toBe('paid');
  });
});

describe('Subscriptions', () => {
  it('clamps month-end billing dates without drifting', () => {
    expect(addMonthsClamped(now, 1, 31).toISOString()).toBe('2026-02-28T10:00:00.000Z');
    const sub = Subscription.start({
      id: 'sub',
      merchantId: 'm',
      customerId: 'c',
      amount: usd(2900),
      interval: 'month',
      intervalCount: 1,
      startAt: now,
    });
    expect(sub.currentPeriodEnd.toISOString()).toBe('2026-02-28T10:00:00.000Z');
    sub.recordChargeSucceeded(now);
    expect(sub.currentPeriodEnd.toISOString()).toBe('2026-03-31T10:00:00.000Z');
  });

  it('retries failed charges after 1, 3 and 5 days, then cancels', () => {
    const sub = Subscription.start({
      id: 'sub',
      merchantId: 'm',
      customerId: 'c',
      amount: usd(2900),
      interval: 'month',
      intervalCount: 1,
      startAt: now,
    });
    const delays: number[] = [];
    for (let i = 0; i < 3; i++) {
      sub.recordChargeFailed(now);
      expect(sub.status).toBe('past_due');
      delays.push((sub.nextRetryAt!.getTime() - now.getTime()) / DAY);
    }
    expect(delays).toEqual([1, 3, 5]);
    sub.recordChargeFailed(now);
    expect(sub.status).toBe('canceled');
    expect(sub.isDue(new Date(now.getTime() + 365 * DAY))).toBe(false);
  });
});

describe('Customers', () => {
  it('normalises email and requires an identifier', () => {
    expect(
      Customer.create({
        id: 'cus',
        merchantId: 'm',
        email: ' A@B.CO ',
        name: null,
        phone: null,
        createdAt: now,
      }).toProps().email,
    ).toBe('a@b.co');
    expect(() =>
      Customer.create({
        id: 'cus',
        merchantId: 'm',
        email: null,
        name: null,
        phone: null,
        createdAt: now,
      }),
    ).toThrow(InvariantViolationError);
  });
});
