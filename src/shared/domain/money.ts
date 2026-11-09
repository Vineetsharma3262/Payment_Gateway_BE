import { InvariantViolationError } from './domain-error';
import { ValueObject } from './value-object';

/**
 * ISO-4217 currencies PayCo understands. The PRD scope is US merchants and USD
 * only; widening this list is a product decision, not a code change alone.
 */
export const SUPPORTED_CURRENCIES = ['USD'] as const;
export type Currency = (typeof SUPPORTED_CURRENCIES)[number];

/** Minor units per major unit. USD is cents. */
const MINOR_UNIT_FACTOR: Record<Currency, number> = { USD: 100 };

export class CurrencyMismatchError extends InvariantViolationError {
  constructor(a: Currency, b: Currency) {
    super(`Cannot combine ${a} and ${b} amounts.`, { left: a, right: b });
  }
}

/**
 * Money in integer minor units (cents). Never use floating point for money.
 * `amountMinor` is restricted to safe integers; values beyond that are rejected,
 * which is far above any realistic single USD transaction.
 */
export class Money extends ValueObject<{ amountMinor: number; currency: Currency }> {
  static of(amountMinor: number, currency: Currency): Money {
    if (!Number.isSafeInteger(amountMinor)) {
      throw new InvariantViolationError('Money amount must be an integer number of minor units.', {
        amountMinor,
      });
    }
    if (!Money.isSupportedCurrency(currency)) {
      throw new InvariantViolationError(`Unsupported currency '${String(currency)}'.`);
    }
    return new Money({ amountMinor, currency });
  }

  static zero(currency: Currency): Money {
    return Money.of(0, currency);
  }

  static isSupportedCurrency(value: string): value is Currency {
    return (SUPPORTED_CURRENCIES as readonly string[]).includes(value);
  }

  get amountMinor(): number {
    return this.props.amountMinor;
  }

  get currency(): Currency {
    return this.props.currency;
  }

  get minorUnitFactor(): number {
    return MINOR_UNIT_FACTOR[this.currency];
  }

  isPositive(): boolean {
    return this.amountMinor > 0;
  }

  isZero(): boolean {
    return this.amountMinor === 0;
  }

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return Money.of(this.amountMinor + other.amountMinor, this.currency);
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other);
    return Money.of(this.amountMinor - other.amountMinor, this.currency);
  }

  negate(): Money {
    return Money.of(-this.amountMinor, this.currency);
  }

  greaterThan(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.amountMinor > other.amountMinor;
  }

  /**
   * Percentage in basis points (1 bp = 0.01%), rounded half-up to the minor unit.
   * Integer arithmetic only: 290 bps of 10_000 cents = 290 cents.
   */
  percentageBps(bps: number): Money {
    if (!Number.isSafeInteger(bps) || bps < 0) {
      throw new InvariantViolationError('Basis points must be a non-negative integer.', { bps });
    }
    const product = BigInt(this.amountMinor) * BigInt(bps);
    const sign = product < 0n ? -1n : 1n;
    const abs = product * sign;
    const rounded = ((abs + 5_000n) / 10_000n) * sign;
    return Money.of(Number(rounded), this.currency);
  }

  toJSON(): { amountMinor: number; currency: Currency } {
    return { amountMinor: this.amountMinor, currency: this.currency };
  }

  private assertSameCurrency(other: Money): void {
    if (other.currency !== this.currency)
      throw new CurrencyMismatchError(this.currency, other.currency);
  }
}
