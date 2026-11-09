import { AggregateRoot } from '../../../shared/domain/aggregate-root';
import {
  InvalidStateTransitionError,
  InvariantViolationError,
} from '../../../shared/domain/domain-error';
import { Money, type Currency } from '../../../shared/domain/money';

/**
 * Invoices are built in PayCo's layer because Razorpay US does not list them
 * (PRD §2, 5.1). Paid by card/ACH through a normal order, or charged to a
 * saved payment method.
 *
 *   draft ─► open ─► paid
 *     │       ├────► void
 *     └───────┴────► void        open ─► uncollectible
 */
export type InvoiceStatus = 'draft' | 'open' | 'paid' | 'void' | 'uncollectible';

export interface InvoiceLine {
  description: string;
  quantity: number;
  unitAmount: Money;
}

export interface InvoiceProps {
  id: string;
  merchantId: string;
  customerId: string;
  currency: Currency;
  lines: InvoiceLine[];
  status: InvoiceStatus;
  dueAt: Date;
  paidAt: Date | null;
  createdAt: Date;
  version: number;
}

export class Invoice extends AggregateRoot {
  private constructor(private props: InvoiceProps) {
    super(props.id, props.version);
  }

  static draft(params: Omit<InvoiceProps, 'status' | 'lines' | 'paidAt' | 'version'>): Invoice {
    return new Invoice({ ...params, status: 'draft', lines: [], paidAt: null, version: 0 });
  }

  get status(): InvoiceStatus {
    return this.props.status;
  }

  addLine(line: InvoiceLine): void {
    if (this.props.status !== 'draft')
      throw new InvalidStateTransitionError('Invoice', this.props.status, 'edited');
    if (!Number.isInteger(line.quantity) || line.quantity < 1)
      throw new InvariantViolationError('Quantity must be a positive integer.');
    if (!line.unitAmount.isPositive())
      throw new InvariantViolationError('Unit amount must be positive.');
    if (line.unitAmount.currency !== this.props.currency)
      throw new InvariantViolationError('Line currency differs from invoice.');
    this.props.lines.push(line);
  }

  total(): Money {
    return this.props.lines.reduce(
      (sum, l) => sum.add(Money.of(l.unitAmount.amountMinor * l.quantity, this.props.currency)),
      Money.zero(this.props.currency),
    );
  }

  finalize(now: Date): void {
    if (this.props.status !== 'draft')
      throw new InvalidStateTransitionError('Invoice', this.props.status, 'open');
    if (this.props.lines.length === 0)
      throw new InvariantViolationError('An invoice needs at least one line.');
    this.props.status = 'open';
    this.emit('invoice.finalized', now);
  }

  markPaid(amount: Money, now: Date): void {
    if (this.props.status === 'paid') return;
    if (this.props.status !== 'open')
      throw new InvalidStateTransitionError('Invoice', this.props.status, 'paid');
    if (!amount.equals(this.total())) {
      throw new InvariantViolationError('Payment amount does not match the invoice total.', {
        total: this.total().amountMinor,
        paid: amount.amountMinor,
      });
    }
    this.props.status = 'paid';
    this.props.paidAt = now;
    this.emit('invoice.paid', now);
  }

  void(now: Date): void {
    if (!['draft', 'open'].includes(this.props.status))
      throw new InvalidStateTransitionError('Invoice', this.props.status, 'void');
    this.props.status = 'void';
    this.emit('invoice.voided', now);
  }

  markUncollectible(now: Date): void {
    if (this.props.status !== 'open')
      throw new InvalidStateTransitionError('Invoice', this.props.status, 'uncollectible');
    this.props.status = 'uncollectible';
    this.emit('invoice.uncollectible', now);
  }

  isOverdue(now: Date): boolean {
    return this.props.status === 'open' && this.props.dueAt < now;
  }

  private emit(eventType: string, now: Date): void {
    this.record({
      eventType,
      aggregateType: 'invoice',
      aggregateId: this.id,
      merchantId: this.props.merchantId,
      occurredAt: now,
      payload: {
        invoiceId: this.id,
        totalMinor: this.total().amountMinor,
        status: this.props.status,
      },
    });
  }
}
