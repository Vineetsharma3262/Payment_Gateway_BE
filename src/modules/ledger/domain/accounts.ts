/**
 * Chart of accounts. PayCo keeps two books:
 *
 * - `merchant` book: a mirror of each merchant's money as it moves through the
 *   gateway, for dashboards and reconciliation. Pay-in funds belong to the
 *   merchant and sit with the gateway until settled to the merchant's bank
 *   (sub-merchant model, PRD §3). Nothing here is PayCo's money.
 * - `platform` book: PayCo's own revenue from platform fees.
 *
 * There is deliberately no account for PayCo holding pay-in funds.
 * Payout accounts mirror the payout partner's FBO balance (PRD 5.2) and are
 * added with the partner's account model.
 */
export type AccountType = 'asset' | 'liability' | 'revenue' | 'expense' | 'contra_revenue';
export type Book = 'merchant' | 'platform';

export const ACCOUNTS = {
  // merchant book
  PROCESSOR_BALANCE: { code: 'merchant.processor_balance', book: 'merchant', type: 'asset' },
  SETTLED_TO_BANK: { code: 'merchant.settled_to_bank', book: 'merchant', type: 'asset' },
  SALES: { code: 'merchant.sales', book: 'merchant', type: 'revenue' },
  REFUNDS: { code: 'merchant.refunds', book: 'merchant', type: 'contra_revenue' },
  PROCESSOR_FEES: { code: 'merchant.processor_fees', book: 'merchant', type: 'expense' },
  PLATFORM_FEES: { code: 'merchant.platform_fees', book: 'merchant', type: 'expense' },
  CHARGEBACKS: { code: 'merchant.chargebacks', book: 'merchant', type: 'expense' },
  ACH_RETURNS: { code: 'merchant.ach_returns', book: 'merchant', type: 'expense' },
  PLATFORM_FEES_PAYABLE: {
    code: 'merchant.platform_fees_payable',
    book: 'merchant',
    type: 'liability',
  },
  // platform book
  FEE_RECEIVABLE: { code: 'platform.fee_receivable', book: 'platform', type: 'asset' },
  FEE_REVENUE: { code: 'platform.fee_revenue', book: 'platform', type: 'revenue' },
} as const satisfies Record<string, { code: string; book: Book; type: AccountType }>;

export type AccountCode = (typeof ACCOUNTS)[keyof typeof ACCOUNTS]['code'];

const ALL = Object.values(ACCOUNTS);

export function accountBook(code: AccountCode): Book {
  return ALL.find((a) => a.code === code)!.book;
}

/** Debit-normal accounts grow with debits; credit-normal with credits. */
export function isDebitNormal(code: AccountCode): boolean {
  const type = ALL.find((a) => a.code === code)!.type;
  return type === 'asset' || type === 'expense' || type === 'contra_revenue';
}
