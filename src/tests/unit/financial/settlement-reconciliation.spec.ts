import {
  InvalidStateTransitionError,
  InvariantViolationError,
} from '../../../shared/domain/domain-error';
import { Money } from '../../../shared/domain/money';
import { reconcile, summarize } from '../../../modules/reconciliation/domain/matcher';
import { Settlement } from '../../../modules/settlements/domain/settlement';

const usd = (c: number) => Money.of(c, 'USD');
const now = new Date('2026-10-27T00:00:00Z');

describe('Settlement', () => {
  const base = {
    id: 'stl_1',
    merchantId: 'mer_1',
    provider: 'fake',
    providerSettlementId: 'ps_1',
    gross: usd(10_000),
    fees: usd(300),
    status: 'created' as const,
    settledAt: null,
    createdAt: now,
  };

  it('enforces net = gross − fees', () => {
    expect(Settlement.import(base).net.amountMinor).toBe(9_700);
    expect(() => Settlement.import({ ...base, net: usd(9_800) })).toThrow(InvariantViolationError);
  });

  it('re-imports are idempotent and only move forward', () => {
    const s = Settlement.import(base);
    expect(s.applyReport('processed', now, now)).toBe('applied');
    expect(s.applyReport('processed', now, now)).toBe('unchanged');
    expect(() => s.applyReport('failed', null, now)).toThrow(InvalidStateTransitionError);
  });
});

describe('Reconciliation matcher', () => {
  it('classifies matches, mismatches and missing records on both sides', () => {
    const results = reconcile(
      [
        { payCoId: 'pay_1', kind: 'payment', providerTransactionId: 'p1', amount: usd(1000) },
        { payCoId: 'pay_2', kind: 'payment', providerTransactionId: null, amount: usd(500) },
        { payCoId: 'pay_3', kind: 'payment', providerTransactionId: 'p3', amount: usd(700) },
        { payCoId: 'rfnd_1', kind: 'refund', providerTransactionId: 'r1', amount: usd(100) },
        { payCoId: 'pay_9', kind: 'payment', providerTransactionId: 'p9', amount: usd(900) },
      ],
      [
        {
          providerTransactionId: 'p1',
          providerReference: null,
          kind: 'payment',
          amount: usd(1000),
        },
        {
          providerTransactionId: 'p2',
          providerReference: 'pay_2',
          kind: 'payment',
          amount: usd(500),
        },
        { providerTransactionId: 'p3', providerReference: null, kind: 'payment', amount: usd(699) },
        { providerTransactionId: 'r1', providerReference: null, kind: 'payment', amount: usd(100) },
        { providerTransactionId: 'pX', providerReference: null, kind: 'payment', amount: usd(42) },
      ],
    );
    expect(summarize(results)).toEqual({
      matched: 2,
      amount_mismatch: 1,
      kind_mismatch: 1,
      missing_in_payco: 1,
      missing_at_provider: 1,
    });
    expect(results).toContainEqual({
      type: 'missing_at_provider',
      payCoId: 'pay_9',
      amountMinor: 900,
    });
    expect(results).toContainEqual(
      expect.objectContaining({
        type: 'amount_mismatch',
        payCoId: 'pay_3',
        providerAmountMinor: 699,
      }),
    );
  });

  it('does not match one internal record twice', () => {
    const results = reconcile(
      [{ payCoId: 'pay_1', kind: 'payment', providerTransactionId: 'p1', amount: usd(10) }],
      [
        { providerTransactionId: 'p1', providerReference: null, kind: 'payment', amount: usd(10) },
        {
          providerTransactionId: 'p1b',
          providerReference: 'pay_1',
          kind: 'payment',
          amount: usd(10),
        },
      ],
    );
    expect(summarize(results)).toMatchObject({ matched: 1, missing_in_payco: 1 });
  });
});
