import { AggregateRoot } from '../../../shared/domain/aggregate-root';
import {
  InvalidStateTransitionError,
  InvariantViolationError,
} from '../../../shared/domain/domain-error';
import type { Money } from '../../../shared/domain/money';

/**
 * A payout from the gateway to the merchant's bank (cards T+2, ACH T+5 on
 * Razorpay US, PRD 5.1). Imported from gateway settlement reports; PayCo never
 * moves these funds. Invariant: net = gross − fees.
 */
export type SettlementStatus = 'created' | 'processed' | 'failed';

export interface SettlementProps {
  id: string;
  merchantId: string;
  provider: string;
  providerSettlementId: string;
  gross: Money;
  fees: Money;
  net: Money;
  status: SettlementStatus;
  settledAt: Date | null;
  createdAt: Date;
  version: number;
}

export class Settlement extends AggregateRoot {
  private constructor(private props: SettlementProps) {
    super(props.id, props.version);
  }

  static import(params: Omit<SettlementProps, 'version' | 'net'> & { net?: Money }): Settlement {
    const net = params.gross.subtract(params.fees);
    if (params.net && !params.net.equals(net)) {
      throw new InvariantViolationError('Settlement net must equal gross minus fees.', {
        gross: params.gross.amountMinor,
        fees: params.fees.amountMinor,
        net: params.net.amountMinor,
      });
    }
    const settlement = new Settlement({ ...params, net, version: 0 });
    if (params.status === 'processed') settlement.emit('settlement.processed', params.createdAt);
    return settlement;
  }

  static rehydrate(props: SettlementProps): Settlement {
    return new Settlement({ ...props });
  }

  get status(): SettlementStatus {
    return this.props.status;
  }
  get net(): Money {
    return this.props.net;
  }

  /** Re-imports are idempotent; only forward transitions apply. */
  applyReport(
    status: SettlementStatus,
    settledAt: Date | null,
    now: Date,
  ): 'applied' | 'unchanged' {
    if (status === this.props.status) return 'unchanged';
    if (this.props.status !== 'created')
      throw new InvalidStateTransitionError('Settlement', this.props.status, status);
    this.props.status = status;
    this.props.settledAt = settledAt;
    this.emit(`settlement.${status}`, now);
    return 'applied';
  }

  toProps(): SettlementProps {
    return { ...this.props, version: this.version };
  }

  private emit(eventType: string, now: Date): void {
    this.record({
      eventType,
      aggregateType: 'settlement',
      aggregateId: this.id,
      merchantId: this.props.merchantId,
      occurredAt: now,
      payload: {
        settlementId: this.id,
        netMinor: this.props.net.amountMinor,
        status: this.props.status,
      },
    });
  }
}
