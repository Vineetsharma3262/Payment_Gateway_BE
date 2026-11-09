import { Money } from '../../../shared/domain/money';
import { ACCOUNTS } from '../../../modules/ledger/domain/accounts';
import { balances } from '../../../modules/ledger/domain/balances';
import {
  JournalTransaction,
  UnbalancedJournalError,
} from '../../../modules/ledger/domain/journal-transaction';
import { PostingRules } from '../../../modules/ledger/domain/posting-rules';
import { LedgerService } from '../../../modules/ledger/application/post-journal.use-case';
import type { LedgerRepository } from '../../../modules/ledger/domain/ledger.repository';
import { FixedClock, SequentialIdGenerator } from '../../support/fakes';

const usd = (c: number) => Money.of(c, 'USD');
const at = new Date('2026-10-27T00:00:00Z');
const post = (draft: ReturnType<typeof PostingRules.paymentCaptured>, id = 'jtx_1') =>
  JournalTransaction.post({ ...draft, id, occurredAt: at, reverses: null });

describe('Ledger: balanced, immutable double entry', () => {
  it('rejects unbalanced, single-line, zero and mixed-book transactions', () => {
    const base = {
      id: 'j',
      idempotencyKey: 'k',
      merchantId: 'm',
      book: 'merchant' as const,
      description: 'd',
      source: { type: 't', id: 'i' },
      occurredAt: at,
      reverses: null,
    };
    expect(() =>
      JournalTransaction.post({
        ...base,
        lines: [{ account: ACCOUNTS.SALES.code, direction: 'credit', amount: usd(1) }],
      }),
    ).toThrow(UnbalancedJournalError);
    expect(() =>
      JournalTransaction.post({
        ...base,
        lines: [
          { account: ACCOUNTS.PROCESSOR_BALANCE.code, direction: 'debit', amount: usd(100) },
          { account: ACCOUNTS.SALES.code, direction: 'credit', amount: usd(99) },
        ],
      }),
    ).toThrow(UnbalancedJournalError);
    expect(() =>
      JournalTransaction.post({
        ...base,
        lines: [
          { account: ACCOUNTS.PROCESSOR_BALANCE.code, direction: 'debit', amount: usd(0) },
          { account: ACCOUNTS.SALES.code, direction: 'credit', amount: usd(0) },
        ],
      }),
    ).toThrow(UnbalancedJournalError);
    expect(() =>
      JournalTransaction.post({
        ...base,
        lines: [
          { account: ACCOUNTS.FEE_RECEIVABLE.code, direction: 'debit', amount: usd(1) },
          { account: ACCOUNTS.SALES.code, direction: 'credit', amount: usd(1) },
        ],
      }),
    ).toThrow(UnbalancedJournalError);
  });

  it('every posting rule balances', () => {
    const drafts = [
      PostingRules.paymentCaptured('m', 'pay', usd(10_000), usd(300)),
      PostingRules.refundSucceeded('m', 'rf', usd(2_500)),
      PostingRules.settlementPaid('m', 'stl', usd(7_000)),
      PostingRules.chargebackLost('m', 'dsp', usd(1_000), usd(1_500)),
      PostingRules.achReturn('m', 'pay2', usd(5_000), usd(500)),
      PostingRules.platformFeeAccrued('m', 'fee', usd(320), 'split').merchant,
      PostingRules.platformFeeAccrued('m', 'fee', usd(320), 'invoice').platform,
    ];
    drafts.forEach((d, i) =>
      expect(() =>
        JournalTransaction.post({ ...d, id: `j${i}`, occurredAt: at, reverses: null }),
      ).not.toThrow(),
    );
  });

  it('posted transactions are immutable', () => {
    const tx = post(PostingRules.paymentCaptured('m', 'pay', usd(100), null));
    expect(Object.isFrozen(tx.toProps())).toBe(true);
    expect(Object.isFrozen(tx.lines)).toBe(true);
  });

  it('a capture is money at the processor, not in the bank, until settlement', () => {
    const capture = post(PostingRules.paymentCaptured('m', 'pay', usd(10_000), usd(300)));
    let b = balances([capture], 'USD');
    expect(b.get(ACCOUNTS.PROCESSOR_BALANCE.code)!.amountMinor).toBe(9_700);
    expect(b.get(ACCOUNTS.SETTLED_TO_BANK.code)).toBeUndefined();

    const settlement = JournalTransaction.post({
      ...PostingRules.settlementPaid('m', 'stl', usd(9_700)),
      id: 'jtx_2',
      occurredAt: at,
      reverses: null,
    });
    b = balances([capture, settlement], 'USD');
    expect(b.get(ACCOUNTS.PROCESSOR_BALANCE.code)!.amountMinor).toBe(0);
    expect(b.get(ACCOUNTS.SETTLED_TO_BANK.code)!.amountMinor).toBe(9_700);
    expect(b.get(ACCOUNTS.SALES.code)!.amountMinor).toBe(10_000);
  });

  it('corrections use compensating entries that net to zero', () => {
    const tx = post(PostingRules.refundSucceeded('m', 'rf', usd(2_500)));
    const reversal = tx.reversal({ id: 'jtx_r', reason: 'posted twice', occurredAt: at });
    expect(reversal.toProps().reverses).toBe(tx.id);
    const b = balances([tx, reversal], 'USD');
    for (const value of b.values()) expect(value.amountMinor).toBe(0);
  });

  it('posting is idempotent per business event', async () => {
    const stored = new Map<string, JournalTransaction>();
    const repo: LedgerRepository = {
      postIdempotently: (t) => {
        const existing = stored.get(t.idempotencyKey);
        if (existing) return Promise.resolve({ transaction: existing, created: false });
        stored.set(t.idempotencyKey, t);
        return Promise.resolve({ transaction: t, created: true });
      },
      findById: (id) => Promise.resolve([...stored.values()].find((t) => t.id === id) ?? null),
    };
    const ledger = new LedgerService(repo, new SequentialIdGenerator(), new FixedClock());
    const draft = PostingRules.paymentCaptured('m', 'pay_1', usd(100), null);
    const a = await ledger.post(draft);
    const b = await ledger.post(draft);
    expect(a.created).toBe(true);
    expect(b.created).toBe(false);
    expect(b.transaction.id).toBe(a.transaction.id);
    expect(stored.size).toBe(1);
  });
});
