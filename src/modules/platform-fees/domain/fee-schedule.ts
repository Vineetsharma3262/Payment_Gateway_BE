import { InvariantViolationError } from '../../../shared/domain/domain-error';
import { Money } from '../../../shared/domain/money';

export type FeeMethod = 'card' | 'apple_pay' | 'ach_debit';

export interface FeeRates {
  card: { bps: number; fixedCents: number };
  foreignCardSurchargeBps: number;
  achDebit: { bps: number; capCents: number };
  achReturnCents: number;
  refundCents: number;
}

export interface FeeScheduleProps {
  id: string;
  name: string;
  version: number;
  effectiveFrom: Date;
  rates: FeeRates;
}

/**
 * Versioned pricing. A schedule is never edited: a new version is created and
 * fee records reference the version that priced them.
 */
export class FeeSchedule {
  private constructor(private readonly props: Readonly<FeeScheduleProps>) {}

  static define(props: FeeScheduleProps): FeeSchedule {
    const r = props.rates;
    const ints = [
      r.card.bps,
      r.card.fixedCents,
      r.foreignCardSurchargeBps,
      r.achDebit.bps,
      r.achDebit.capCents,
      r.achReturnCents,
      r.refundCents,
    ];
    if (!ints.every((v) => Number.isSafeInteger(v) && v >= 0)) {
      throw new InvariantViolationError(
        'Fee rates must be non-negative integers (basis points / cents).',
      );
    }
    return new FeeSchedule(Object.freeze({ ...props }));
  }

  get id(): string {
    return this.props.id;
  }
  get version(): number {
    return this.props.version;
  }
  get rates(): FeeRates {
    return this.props.rates;
  }

  /** Fee for one successful payment. Integer arithmetic only. */
  paymentFee(input: { method: FeeMethod; amount: Money; foreignCard?: boolean }): Money {
    const r = this.props.rates;
    if (input.method === 'ach_debit') {
      const fee = input.amount.percentageBps(r.achDebit.bps);
      return fee.amountMinor > r.achDebit.capCents
        ? Money.of(r.achDebit.capCents, input.amount.currency)
        : fee;
    }
    const bps = r.card.bps + (input.foreignCard ? r.foreignCardSurchargeBps : 0);
    return input.amount.percentageBps(bps).add(Money.of(r.card.fixedCents, input.amount.currency));
  }

  achReturnFee(): Money {
    return Money.of(this.props.rates.achReturnCents, 'USD');
  }

  refundFee(): Money {
    return Money.of(this.props.rates.refundCents, 'USD');
  }

  toProps(): Readonly<FeeScheduleProps> {
    return this.props;
  }
}

/**
 * PRD §9 "Proposed PayCo price" — a starting proposal, not an approved price
 * list. Admins assign versioned schedules per merchant.
 */
export const DEFAULT_PAYCO_SCHEDULE = FeeSchedule.define({
  id: 'fsch_default_v1',
  name: 'PayCo standard (PRD §9 proposal)',
  version: 1,
  effectiveFrom: new Date('2026-01-01T00:00:00Z'),
  rates: {
    card: { bps: 290, fixedCents: 30 },
    foreignCardSurchargeBps: 150,
    achDebit: { bps: 80, capCents: 500 },
    achReturnCents: 1000,
    refundCents: 0,
  },
});

/** PRD §9 Razorpay US standard-plan cost reference (May 2026). Used for margin reporting only. */
export const RAZORPAY_US_COST_REFERENCE = FeeSchedule.define({
  id: 'fsch_razorpay_us_cost_2026_05',
  name: 'Razorpay US standard cost (reference)',
  version: 1,
  effectiveFrom: new Date('2026-05-01T00:00:00Z'),
  rates: {
    card: { bps: 270, fixedCents: 30 },
    foreignCardSurchargeBps: 120,
    achDebit: { bps: 50, capCents: 500 },
    achReturnCents: 500,
    refundCents: 0,
  },
});

/** PayCo margin on one payment = PayCo price − gateway cost. */
export function paymentMargin(
  price: FeeSchedule,
  cost: FeeSchedule,
  input: Parameters<FeeSchedule['paymentFee']>[0],
): Money {
  return price.paymentFee(input).subtract(cost.paymentFee(input));
}
