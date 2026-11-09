import { InvalidStateTransitionError } from '../../../shared/domain/domain-error';
import { Money } from '../../../shared/domain/money';
import { Payout, SelfApprovalError } from '../../../modules/payouts/domain/payout';
import {
  assertSufficientPartnerBalance,
  assertWithinLimits,
  InsufficientPartnerBalanceError,
  PayoutLimitExceededError,
  requiresApproval,
  type PayoutLimits,
} from '../../../modules/payouts/domain/payout-policy';
import { Recipient } from '../../../modules/payouts/domain/recipient';

const usd = (c: number) => Money.of(c, 'USD');
const now = new Date('2026-10-27T00:00:00Z');
const limits: PayoutLimits = {
  perPayoutMax: usd(1_000_000),
  dailyMax: usd(2_500_000),
  approvalThreshold: usd(100_000),
};
const request = (amount: number, needsApproval: boolean) =>
  Payout.request({
    id: 'pout',
    merchantId: 'm',
    recipientId: 'rcp',
    amount: usd(amount),
    rail: 'ach',
    createdByUserId: 'usr_maker',
    needsApproval,
    now,
  });

describe('Payouts (behind the payouts-partner port)', () => {
  it('requires a different person to approve (maker-checker)', () => {
    expect(requiresApproval(limits, usd(100_000))).toBe(true);
    expect(requiresApproval(limits, usd(99_999))).toBe(false);
    const p = request(150_000, true);
    expect(p.status).toBe('pending_approval');
    expect(() => p.approve('usr_maker', now)).toThrow(SelfApprovalError);
    p.approve('usr_checker', now);
    expect(p.status).toBe('queued');
  });

  it('follows queued → processing → paid / returned / failed and ignores duplicate partner updates', () => {
    const p = request(5_000, false);
    p.applyPartnerStatus('processing', null, now);
    p.applyPartnerStatus('processing', null, now);
    p.applyPartnerStatus('paid', null, now);
    p.applyPartnerStatus('returned', 'R01 insufficient funds', now);
    expect(p.status).toBe('returned');
    expect(() => p.applyPartnerStatus('paid', null, now)).toThrow(InvalidStateTransitionError);
    expect(p.pullEvents().map((e) => e.eventType)).toEqual([
      'payout.queued',
      'payout.processing',
      'payout.paid',
      'payout.returned',
    ]);
  });

  it('enforces per-payout and daily limits and the partner FBO balance', () => {
    expect(() => assertWithinLimits(limits, usd(1_000_001), usd(0))).toThrow(
      PayoutLimitExceededError,
    );
    expect(() => assertWithinLimits(limits, usd(600_000), usd(2_000_000))).toThrow(
      PayoutLimitExceededError,
    );
    expect(() => assertWithinLimits(limits, usd(500_000), usd(2_000_000))).not.toThrow();
    expect(() => assertSufficientPartnerBalance(usd(999), usd(1000))).toThrow(
      InsufficientPartnerBalanceError,
    );
  });

  it('pays only verified, screened recipients', () => {
    const r = Recipient.create({
      id: 'rcp',
      merchantId: 'm',
      name: 'Supplier Inc',
      type: 'bank_account',
      last4: '6789',
      createdAt: now,
    });
    expect(r.canReceivePayouts()).toBe(false);
    r.recordVerification('cp_1');
    r.recordScreening('review');
    expect(r.canReceivePayouts()).toBe(false);
    r.recordScreening('clear');
    expect(r.canReceivePayouts()).toBe(true);
  });
});
