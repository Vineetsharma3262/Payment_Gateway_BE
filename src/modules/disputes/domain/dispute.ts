import { AggregateRoot } from '../../../shared/domain/aggregate-root';
import { DomainError, InvalidStateTransitionError } from '../../../shared/domain/domain-error';
import type { Money } from '../../../shared/domain/money';

export class EvidenceDeadlinePassedError extends DomainError {
  readonly code = 'EVIDENCE_DEADLINE_PASSED';

  constructor(deadline: Date) {
    super('The evidence deadline has passed.', { evidence_due_by: deadline.toISOString() });
  }
}

/**
 * PRD 5.1: the gateway notifies PayCo; the merchant uploads evidence in the
 * dashboard; PayCo forwards it before the deadline. The network decides.
 *
 *   needs_response ─► evidence_submitted ─► won | lost
 *          └──────────────────────────────► lost (deadline missed / accepted)
 */
export type DisputeStatus = 'needs_response' | 'evidence_submitted' | 'won' | 'lost';

/** Forward evidence with a safety margin before the network deadline. */
export const FORWARDING_MARGIN_MS = 24 * 60 * 60 * 1000;

export interface DisputeProps {
  id: string;
  merchantId: string;
  paymentId: string;
  amount: Money;
  reason: string;
  status: DisputeStatus;
  evidenceDueBy: Date;
  evidenceDocumentIds: string[];
  createdAt: Date;
  version: number;
}

export class Dispute extends AggregateRoot {
  private constructor(private props: DisputeProps) {
    super(props.id, props.version);
  }

  static open(params: Omit<DisputeProps, 'status' | 'evidenceDocumentIds' | 'version'>): Dispute {
    const dispute = new Dispute({
      ...params,
      status: 'needs_response',
      evidenceDocumentIds: [],
      version: 0,
    });
    dispute.emit('dispute.created', params.createdAt);
    return dispute;
  }

  get status(): DisputeStatus {
    return this.props.status;
  }

  /** Latest time PayCo accepts evidence so it can still reach the gateway in time. */
  merchantDeadline(): Date {
    return new Date(this.props.evidenceDueBy.getTime() - FORWARDING_MARGIN_MS);
  }

  submitEvidence(documentIds: string[], now: Date): void {
    if (this.props.status !== 'needs_response') {
      throw new InvalidStateTransitionError('Dispute', this.props.status, 'evidence_submitted');
    }
    if (now > this.merchantDeadline())
      throw new EvidenceDeadlinePassedError(this.merchantDeadline());
    this.props.evidenceDocumentIds = [...documentIds];
    this.props.status = 'evidence_submitted';
    this.emit('dispute.evidence_submitted', now);
  }

  close(outcome: 'won' | 'lost', now: Date): void {
    if (this.props.status === 'won' || this.props.status === 'lost') {
      if (this.props.status === outcome) return;
      throw new InvalidStateTransitionError('Dispute', this.props.status, outcome);
    }
    this.props.status = outcome;
    this.emit(`dispute.${outcome}`, now);
  }

  toProps(): DisputeProps {
    return { ...this.props, version: this.version };
  }

  private emit(eventType: string, now: Date): void {
    this.record({
      eventType,
      aggregateType: 'dispute',
      aggregateId: this.id,
      merchantId: this.props.merchantId,
      occurredAt: now,
      payload: {
        disputeId: this.id,
        paymentId: this.props.paymentId,
        amountMinor: this.props.amount.amountMinor,
        status: this.props.status,
      },
    });
  }
}
