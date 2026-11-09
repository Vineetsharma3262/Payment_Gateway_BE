import type { Money } from '../../../shared/domain/money';

/**
 * One platform fee charged for a business event. `collection` depends on open
 * question Q4: `split` when the gateway deducts PayCo's fee per payment,
 * `invoice` when PayCo bills the merchant monthly (PRD §3 fallback).
 */
export interface FeeRecord {
  id: string;
  merchantId: string;
  source: { type: 'payment' | 'ach_return' | 'refund'; id: string };
  feeScheduleId: string;
  feeScheduleVersion: number;
  amount: Money;
  collection: 'split' | 'invoice';
  createdAt: Date;
}
