import { InvariantViolationError } from '../../../shared/domain/domain-error';
import { Money } from '../../../shared/domain/money';
import {
  DEFAULT_PAYCO_SCHEDULE,
  FeeSchedule,
  paymentMargin,
  RAZORPAY_US_COST_REFERENCE,
} from '../../../modules/platform-fees/domain/fee-schedule';

const usd = (c: number) => Money.of(c, 'USD');

describe('Platform fees — PRD §9 table', () => {
  it.each([
    ['US card $100', { method: 'card' as const, amount: usd(10_000) }, 320, 20],
    ['Apple Pay $100', { method: 'apple_pay' as const, amount: usd(10_000) }, 320, 20],
    [
      'foreign card $100',
      { method: 'card' as const, amount: usd(10_000), foreignCard: true },
      470,
      50,
    ],
    ['ACH $100', { method: 'ach_debit' as const, amount: usd(10_000) }, 80, 30],
    ['ACH $1,000 (both capped)', { method: 'ach_debit' as const, amount: usd(100_000) }, 500, 0],
  ])('%s', (_label, input, priceCents, marginCents) => {
    expect(DEFAULT_PAYCO_SCHEDULE.paymentFee(input).amountMinor).toBe(priceCents);
    expect(
      paymentMargin(DEFAULT_PAYCO_SCHEDULE, RAZORPAY_US_COST_REFERENCE, input).amountMinor,
    ).toBe(marginCents);
  });

  it('ACH return: $10 price, $5 margin; refunds free', () => {
    expect(
      DEFAULT_PAYCO_SCHEDULE.achReturnFee().subtract(RAZORPAY_US_COST_REFERENCE.achReturnFee())
        .amountMinor,
    ).toBe(500);
    expect(DEFAULT_PAYCO_SCHEDULE.refundFee().isZero()).toBe(true);
  });

  it('rounds sub-cent percentages half-up with integer arithmetic', () => {
    expect(DEFAULT_PAYCO_SCHEDULE.paymentFee({ method: 'card', amount: usd(99) }).amountMinor).toBe(
      33,
    );
  });

  it('rejects fractional or negative rates', () => {
    const rates = { ...DEFAULT_PAYCO_SCHEDULE.rates, card: { bps: 2.9, fixedCents: 30 } };
    expect(() =>
      FeeSchedule.define({ id: 'x', name: 'x', version: 1, effectiveFrom: new Date(), rates }),
    ).toThrow(InvariantViolationError);
  });
});
