import type { Money } from '../../../shared/domain/money';
import { ACCOUNTS } from './accounts';
import type { JournalLine, JournalTransactionProps } from './journal-transaction';

type Draft = Omit<JournalTransactionProps, 'id' | 'occurredAt' | 'reverses'>;

const dr = (account: JournalLine['account'], amount: Money): JournalLine => ({
  account,
  direction: 'debit',
  amount,
});
const cr = (account: JournalLine['account'], amount: Money): JournalLine => ({
  account,
  direction: 'credit',
  amount,
});

/**
 * Accounting rules per business event. Capture is NOT cash in the merchant's
 * bank: it increases the balance held by the processor; only a settlement
 * report moves value to `settled_to_bank`.
 */
export const PostingRules = {
  paymentCaptured(
    merchantId: string,
    paymentId: string,
    amount: Money,
    processorFee: Money | null,
  ): Draft {
    const lines = [dr(ACCOUNTS.PROCESSOR_BALANCE.code, amount), cr(ACCOUNTS.SALES.code, amount)];
    if (processorFee?.isPositive()) {
      lines.push(
        dr(ACCOUNTS.PROCESSOR_FEES.code, processorFee),
        cr(ACCOUNTS.PROCESSOR_BALANCE.code, processorFee),
      );
    }
    return book(
      merchantId,
      `payment.captured:${paymentId}`,
      'Payment captured',
      { type: 'payment', id: paymentId },
      lines,
    );
  },

  refundSucceeded(merchantId: string, refundId: string, amount: Money): Draft {
    return book(
      merchantId,
      `refund.succeeded:${refundId}`,
      'Refund succeeded',
      { type: 'refund', id: refundId },
      [dr(ACCOUNTS.REFUNDS.code, amount), cr(ACCOUNTS.PROCESSOR_BALANCE.code, amount)],
    );
  },

  /** Gateway paid the merchant's bank (from the settlement report, not from the capture). */
  settlementPaid(merchantId: string, settlementId: string, net: Money): Draft {
    return book(
      merchantId,
      `settlement.paid:${settlementId}`,
      'Settled to bank',
      { type: 'settlement', id: settlementId },
      [dr(ACCOUNTS.SETTLED_TO_BANK.code, net), cr(ACCOUNTS.PROCESSOR_BALANCE.code, net)],
    );
  },

  chargebackLost(merchantId: string, disputeId: string, amount: Money, fee: Money | null): Draft {
    const lines = [
      dr(ACCOUNTS.CHARGEBACKS.code, amount),
      cr(ACCOUNTS.PROCESSOR_BALANCE.code, amount),
    ];
    if (fee?.isPositive())
      lines.push(dr(ACCOUNTS.PROCESSOR_FEES.code, fee), cr(ACCOUNTS.PROCESSOR_BALANCE.code, fee));
    return book(
      merchantId,
      `dispute.lost:${disputeId}`,
      'Chargeback lost',
      { type: 'dispute', id: disputeId },
      lines,
    );
  },

  achReturn(merchantId: string, paymentId: string, amount: Money, returnFee: Money): Draft {
    return book(
      merchantId,
      `ach.returned:${paymentId}`,
      'ACH debit returned',
      { type: 'payment', id: paymentId },
      [
        dr(ACCOUNTS.ACH_RETURNS.code, amount),
        cr(ACCOUNTS.PROCESSOR_BALANCE.code, amount),
        dr(ACCOUNTS.PROCESSOR_FEES.code, returnFee),
        cr(ACCOUNTS.PROCESSOR_BALANCE.code, returnFee),
      ],
    );
  },

  /**
   * PayCo platform fee. With a gateway fee split (Q4) it is deducted from the
   * processor balance; without one it is billed monthly and stays payable.
   */
  platformFeeAccrued(
    merchantId: string,
    feeRecordId: string,
    fee: Money,
    collection: 'split' | 'invoice',
  ): { merchant: Draft; platform: Draft } {
    const merchantSide =
      collection === 'split'
        ? ACCOUNTS.PROCESSOR_BALANCE.code
        : ACCOUNTS.PLATFORM_FEES_PAYABLE.code;
    const source = { type: 'fee_record', id: feeRecordId };
    return {
      merchant: book(merchantId, `fee.accrued:${feeRecordId}`, 'PayCo platform fee', source, [
        dr(ACCOUNTS.PLATFORM_FEES.code, fee),
        cr(merchantSide, fee),
      ]),
      platform: {
        idempotencyKey: `fee.revenue:${feeRecordId}`,
        merchantId,
        book: 'platform',
        description: 'Platform fee revenue',
        source,
        lines: [dr(ACCOUNTS.FEE_RECEIVABLE.code, fee), cr(ACCOUNTS.FEE_REVENUE.code, fee)],
      },
    };
  },
};

function book(
  merchantId: string,
  idempotencyKey: string,
  description: string,
  source: Draft['source'],
  lines: JournalLine[],
): Draft {
  return { idempotencyKey, merchantId, book: 'merchant', description, source, lines };
}
