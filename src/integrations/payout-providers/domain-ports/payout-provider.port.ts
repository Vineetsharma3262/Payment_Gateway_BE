import type { Money } from '../../../shared/domain/money';

/**
 * Supplier payouts (PRD 5.2) run through a separate US payouts partner (bank
 * with payments APIs or a payouts API company). The partner is not selected
 * (docs/open-questions.md), so this port defines only the operations the PRD
 * requires and no adapter moves real funds yet.
 *
 * Balances belong to the partner's FBO account model. PayCo records mirror the
 * partner's ledger; they never represent PayCo-held funds.
 */
export type PayoutRail = 'ach' | 'same_day_ach' | 'rtp' | 'fednow' | 'wire' | 'push_to_card';
export type PayoutProviderStatus = 'queued' | 'processing' | 'paid' | 'returned' | 'failed';

export interface CreateCounterpartyCommand {
  readonly reference: string;
  readonly name: string;
  /** Tokenised destination reference from the partner; raw account numbers are not passed through PayCo logs. */
  readonly destinationToken: string;
}

export interface CreatePartnerPayoutCommand {
  readonly reference: string;
  readonly idempotencyKey: string;
  readonly counterpartyId: string;
  readonly amount: Money;
  readonly rail: PayoutRail;
}

export interface PartnerPayout {
  readonly partnerPayoutId: string;
  readonly status: PayoutProviderStatus;
  readonly failureReason: string | null;
}

export interface PayoutProvider {
  readonly name: string;
  supportedRails(): readonly PayoutRail[];
  createCounterparty(command: CreateCounterpartyCommand): Promise<{ counterpartyId: string }>;
  screenCounterparty(counterpartyId: string): Promise<{ result: 'clear' | 'review' | 'blocked' }>;
  createPayout(command: CreatePartnerPayoutCommand): Promise<PartnerPayout>;
  retrievePayout(partnerPayoutId: string): Promise<PartnerPayout>;
}

export const PAYOUT_PROVIDER = Symbol('PayoutProvider');
