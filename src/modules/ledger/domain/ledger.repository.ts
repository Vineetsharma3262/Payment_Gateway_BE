import type { JournalTransaction } from './journal-transaction';

export interface LedgerRepository {
  /**
   * Inserts the transaction unless one with the same idempotency key exists;
   * returns the stored transaction either way. Implementations must enforce
   * balance with a deferred constraint trigger as a second line of defence.
   */
  postIdempotently(
    transaction: JournalTransaction,
  ): Promise<{ transaction: JournalTransaction; created: boolean }>;
  findById(id: string): Promise<JournalTransaction | null>;
}

export const LEDGER_REPOSITORY = Symbol('LedgerRepository');
