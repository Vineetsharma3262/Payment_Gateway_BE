import type { Money } from '../../../shared/domain/money';

/**
 * Nightly reconciliation (PRD 7.3): compare PayCo's records with the gateway's
 * transactions to catch missed webhooks and amount drift. Pure function; the
 * worker loads both sides for a time window and persists the results.
 */
export type TransactionKind = 'payment' | 'refund' | 'adjustment' | 'dispute';

export interface InternalRecord {
  payCoId: string;
  kind: TransactionKind;
  providerTransactionId: string | null;
  amount: Money;
}

export interface ProviderRecord {
  providerTransactionId: string;
  /** PayCo id sent as reference (receipt/notes), when the gateway echoes it. */
  providerReference: string | null;
  kind: TransactionKind;
  amount: Money;
}

export type MatchResult =
  | { type: 'matched'; payCoId: string; providerTransactionId: string }
  | {
      type: 'amount_mismatch';
      payCoId: string;
      providerTransactionId: string;
      payCoAmountMinor: number;
      providerAmountMinor: number;
    }
  | { type: 'kind_mismatch'; payCoId: string; providerTransactionId: string }
  | {
      type: 'missing_in_payco';
      providerTransactionId: string;
      providerReference: string | null;
      amountMinor: number;
    }
  | { type: 'missing_at_provider'; payCoId: string; amountMinor: number };

export function reconcile(
  internal: readonly InternalRecord[],
  provider: readonly ProviderRecord[],
): MatchResult[] {
  const results: MatchResult[] = [];
  const byProviderId = new Map(
    internal.filter((r) => r.providerTransactionId).map((r) => [r.providerTransactionId!, r]),
  );
  const byPayCoId = new Map(internal.map((r) => [r.payCoId, r]));
  const matched = new Set<string>();

  for (const p of provider) {
    const own =
      byProviderId.get(p.providerTransactionId) ??
      (p.providerReference ? byPayCoId.get(p.providerReference) : undefined);
    if (!own || matched.has(own.payCoId)) {
      results.push({
        type: 'missing_in_payco',
        providerTransactionId: p.providerTransactionId,
        providerReference: p.providerReference,
        amountMinor: p.amount.amountMinor,
      });
      continue;
    }
    matched.add(own.payCoId);
    if (own.kind !== p.kind) {
      results.push({
        type: 'kind_mismatch',
        payCoId: own.payCoId,
        providerTransactionId: p.providerTransactionId,
      });
    } else if (!own.amount.equals(p.amount)) {
      results.push({
        type: 'amount_mismatch',
        payCoId: own.payCoId,
        providerTransactionId: p.providerTransactionId,
        payCoAmountMinor: own.amount.amountMinor,
        providerAmountMinor: p.amount.amountMinor,
      });
    } else {
      results.push({
        type: 'matched',
        payCoId: own.payCoId,
        providerTransactionId: p.providerTransactionId,
      });
    }
  }
  for (const own of internal) {
    if (!matched.has(own.payCoId)) {
      results.push({
        type: 'missing_at_provider',
        payCoId: own.payCoId,
        amountMinor: own.amount.amountMinor,
      });
    }
  }
  return results;
}

export function summarize(results: readonly MatchResult[]): Record<MatchResult['type'], number> {
  const summary = {
    matched: 0,
    amount_mismatch: 0,
    kind_mismatch: 0,
    missing_in_payco: 0,
    missing_at_provider: 0,
  };
  for (const r of results) summary[r.type]++;
  return summary;
}
