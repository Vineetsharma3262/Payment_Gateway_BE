import { DomainError } from '../../../shared/domain/domain-error';
import { Money } from '../../../shared/domain/money';

export class RefundNotAllowedError extends DomainError {
  readonly code = 'REFUND_NOT_ALLOWED';

  constructor(message: string, details?: Record<string, unknown>) {
    super(message, details);
  }
}

/**
 * Partial and full refunds (PRD 5.1). Pending/processing refunds count against
 * the refundable amount so concurrent requests cannot over-refund.
 */
export function assertRefundable(params: {
  paymentStatus: string;
  captured: Money;
  alreadyRefunded: Money;
  inFlight: Money;
  requested: Money;
}): void {
  if (params.paymentStatus !== 'captured') {
    throw new RefundNotAllowedError('Only captured payments can be refunded.', {
      status: params.paymentStatus,
    });
  }
  if (!params.requested.isPositive())
    throw new RefundNotAllowedError('Refund amount must be positive.');
  const available = params.captured.subtract(params.alreadyRefunded).subtract(params.inFlight);
  if (params.requested.greaterThan(available)) {
    throw new RefundNotAllowedError('Refund exceeds the remaining refundable amount.', {
      refundable: Math.max(0, available.amountMinor),
      requested: params.requested.amountMinor,
    });
  }
}

export function fullRefundAmount(captured: Money, alreadyRefunded: Money, inFlight: Money): Money {
  const remaining = captured.subtract(alreadyRefunded).subtract(inFlight);
  return remaining.amountMinor > 0 ? remaining : Money.zero(captured.currency);
}
