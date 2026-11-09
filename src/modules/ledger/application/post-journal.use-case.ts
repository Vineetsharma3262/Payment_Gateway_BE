import type { Clock } from '../../../shared/application/clock.port';
import type { IdGenerator } from '../../../shared/application/id-generator.port';
import { ResourceNotFoundError } from '../../../shared/application/application-error';
import { JournalTransaction, type JournalTransactionProps } from '../domain/journal-transaction';
import type { LedgerRepository } from '../domain/ledger.repository';

export class LedgerService {
  constructor(
    private readonly ledger: LedgerRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  /** Safe to call repeatedly for the same business event (at-least-once consumers). */
  async post(
    draft: Omit<JournalTransactionProps, 'id' | 'occurredAt' | 'reverses'>,
    occurredAt?: Date,
  ) {
    const transaction = JournalTransaction.post({
      ...draft,
      id: this.ids.next('jtx'),
      occurredAt: occurredAt ?? this.clock.now(),
      reverses: null,
    });
    return this.ledger.postIdempotently(transaction);
  }

  async reverse(transactionId: string, reason: string) {
    const original = await this.ledger.findById(transactionId);
    if (!original) throw new ResourceNotFoundError('journal_transaction', transactionId);
    return this.ledger.postIdempotently(
      original.reversal({ id: this.ids.next('jtx'), reason, occurredAt: this.clock.now() }),
    );
  }
}
