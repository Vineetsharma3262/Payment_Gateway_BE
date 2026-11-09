import { Money, type Currency } from '../../../shared/domain/money';
import { isDebitNormal, type AccountCode } from './accounts';
import type { JournalTransaction } from './journal-transaction';

/** Natural-sign balances per account (debit-normal accounts positive when debited). */
export function balances(
  transactions: readonly JournalTransaction[],
  currency: Currency,
): Map<AccountCode, Money> {
  const result = new Map<AccountCode, Money>();
  for (const tx of transactions) {
    for (const line of tx.lines) {
      const sign = (line.direction === 'debit') === isDebitNormal(line.account) ? 1 : -1;
      const current = result.get(line.account) ?? Money.zero(currency);
      result.set(line.account, sign > 0 ? current.add(line.amount) : current.subtract(line.amount));
    }
  }
  return result;
}
