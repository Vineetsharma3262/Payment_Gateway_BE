import { DomainError } from '../../../shared/domain/domain-error';
import { Money } from '../../../shared/domain/money';
import { accountBook, type AccountCode, type Book } from './accounts';

export class UnbalancedJournalError extends DomainError {
  readonly code = 'UNBALANCED_JOURNAL';

  constructor(message: string, details?: Record<string, unknown>) {
    super(message, details);
  }
}

export interface JournalLine {
  readonly account: AccountCode;
  readonly direction: 'debit' | 'credit';
  readonly amount: Money;
}

export interface JournalTransactionProps {
  id: string;
  /** Unique per business event (e.g. `payment.captured:pay_123`): makes posting idempotent. */
  idempotencyKey: string;
  merchantId: string;
  book: Book;
  description: string;
  /** Source document (payment, refund, settlement…). */
  source: { type: string; id: string };
  lines: readonly JournalLine[];
  occurredAt: Date;
  /** Set on compensating entries. */
  reverses: string | null;
}

/**
 * Immutable, balanced journal transaction. Invariants:
 * - at least two lines, all strictly positive, one currency, one book;
 * - Σ debits = Σ credits.
 * Corrections never edit a transaction; they post `reversal()` and a new one.
 */
export class JournalTransaction {
  private constructor(private readonly props: Readonly<JournalTransactionProps>) {}

  static post(props: JournalTransactionProps): JournalTransaction {
    const { lines } = props;
    if (lines.length < 2)
      throw new UnbalancedJournalError('A journal transaction needs at least two lines.');
    const currency = lines[0].amount.currency;
    let debits = Money.zero(currency);
    let credits = Money.zero(currency);
    for (const line of lines) {
      if (!line.amount.isPositive())
        throw new UnbalancedJournalError('Journal line amounts must be positive.');
      if (line.amount.currency !== currency)
        throw new UnbalancedJournalError('A journal transaction must use one currency.');
      if (accountBook(line.account) !== props.book) {
        throw new UnbalancedJournalError(
          `Account ${line.account} is not in the ${props.book} book.`,
        );
      }
      if (line.direction === 'debit') debits = debits.add(line.amount);
      else credits = credits.add(line.amount);
    }
    if (!debits.equals(credits)) {
      throw new UnbalancedJournalError('Debits must equal credits.', {
        debits: debits.amountMinor,
        credits: credits.amountMinor,
      });
    }
    return new JournalTransaction(Object.freeze({ ...props, lines: Object.freeze([...lines]) }));
  }

  get id(): string {
    return this.props.id;
  }
  get idempotencyKey(): string {
    return this.props.idempotencyKey;
  }
  get lines(): readonly JournalLine[] {
    return this.props.lines;
  }
  get book(): Book {
    return this.props.book;
  }

  /** Compensating entry: same lines, opposite directions. */
  reversal(params: { id: string; reason: string; occurredAt: Date }): JournalTransaction {
    return JournalTransaction.post({
      ...this.props,
      id: params.id,
      idempotencyKey: `reversal:${this.props.idempotencyKey}`,
      description: `Reversal of ${this.props.id}: ${params.reason}`,
      lines: this.props.lines.map((l) => ({
        ...l,
        direction: l.direction === 'debit' ? 'credit' : 'debit',
      })),
      occurredAt: params.occurredAt,
      reverses: this.props.id,
    });
  }

  toProps(): Readonly<JournalTransactionProps> {
    return this.props;
  }
}
