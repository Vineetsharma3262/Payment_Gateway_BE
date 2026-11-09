import { DomainError } from '../../../shared/domain/domain-error';
import type { Money } from '../../../shared/domain/money';

export class PayoutLimitExceededError extends DomainError {
  readonly code = 'PAYOUT_LIMIT_EXCEEDED';

  constructor(message: string, details: Record<string, unknown>) {
    super(message, details);
  }
}

export class InsufficientPartnerBalanceError extends DomainError {
  readonly code = 'INSUFFICIENT_BALANCE';

  constructor(available: Money, requested: Money) {
    super('The payout balance held at the payouts partner is insufficient.', {
      available: available.amountMinor,
      requested: requested.amountMinor,
    });
  }
}

/** Per-merchant limits and approval threshold (PRD 5.2 "approval workflows, roles, limits"). */
export interface PayoutLimits {
  perPayoutMax: Money;
  dailyMax: Money;
  /** Payouts at or above this amount need a second person to approve. */
  approvalThreshold: Money;
}

export function assertWithinLimits(limits: PayoutLimits, amount: Money, alreadyToday: Money): void {
  if (amount.greaterThan(limits.perPayoutMax)) {
    throw new PayoutLimitExceededError('Payout exceeds the per-payout limit.', {
      limit: limits.perPayoutMax.amountMinor,
    });
  }
  if (alreadyToday.add(amount).greaterThan(limits.dailyMax)) {
    throw new PayoutLimitExceededError('Payout exceeds the daily limit.', {
      limit: limits.dailyMax.amountMinor,
    });
  }
}

export function requiresApproval(limits: PayoutLimits, amount: Money): boolean {
  return !limits.approvalThreshold.greaterThan(amount);
}

/**
 * The balance is the partner's FBO sub-ledger balance for this merchant, as
 * last reported by the partner (PRD 5.2, §6). It is never PayCo's money and
 * PayCo never computes it from pay-ins.
 */
export function assertSufficientPartnerBalance(available: Money, requested: Money): void {
  if (requested.greaterThan(available))
    throw new InsufficientPartnerBalanceError(available, requested);
}
