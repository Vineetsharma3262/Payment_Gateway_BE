import { CurrencyMismatchError, Money } from '../../../shared/domain/money';
import { InvariantViolationError } from '../../../shared/domain/domain-error';

describe('Money', () => {
  it('stores integer cents and rejects fractional amounts', () => {
    expect(Money.of(1050, 'USD').amountMinor).toBe(1050);
    expect(() => Money.of(10.5, 'USD')).toThrow(InvariantViolationError);
    expect(() => Money.of(Number.MAX_SAFE_INTEGER + 1, 'USD')).toThrow(InvariantViolationError);
  });

  it('rejects unsupported currencies (USD-only scope)', () => {
    expect(() => Money.of(100, 'EUR' as never)).toThrow(InvariantViolationError);
    expect(Money.isSupportedCurrency('USD')).toBe(true);
    expect(Money.isSupportedCurrency('usd')).toBe(false);
  });

  it('adds and subtracts exactly', () => {
    const a = Money.of(10, 'USD');
    const b = Money.of(20, 'USD');
    expect(a.add(b).amountMinor).toBe(30);
    expect(a.subtract(b).amountMinor).toBe(-10);
    expect(a.add(b).equals(Money.of(30, 'USD'))).toBe(true);
  });

  it('refuses to mix currencies', () => {
    const usd = Money.of(1, 'USD');
    const fake = Object.assign(Object.create(Money.prototype) as Money, {
      props: { amountMinor: 1, currency: 'EUR' },
    });
    expect(() => usd.add(fake)).toThrow(CurrencyMismatchError);
  });

  it('computes basis-point fees with integer half-up rounding (PRD 9 pricing)', () => {
    // 2.90% of $100.00 = $2.90
    expect(Money.of(10_000, 'USD').percentageBps(290).amountMinor).toBe(290);
    // 2.90% of $0.99 = 2.871 cents -> 3 cents
    expect(Money.of(99, 'USD').percentageBps(290).amountMinor).toBe(3);
    // 0.5 cent rounds half-up: 50 bps of 100 cents = 0.5 -> 1
    expect(Money.of(100, 'USD').percentageBps(50).amountMinor).toBe(1);
    expect(Money.of(-100, 'USD').percentageBps(50).amountMinor).toBe(-1);
  });
});
