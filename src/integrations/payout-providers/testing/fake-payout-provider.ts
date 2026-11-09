import type {
  CreateCounterpartyCommand,
  CreatePartnerPayoutCommand,
  PartnerPayout,
  PayoutProvider,
  PayoutRail,
} from '../domain-ports/payout-provider.port';

export class FakePayoutProvider implements PayoutProvider {
  readonly name = 'fake_payouts';
  private readonly payouts = new Map<string, PartnerPayout>();
  private sequence = 0;

  supportedRails(): readonly PayoutRail[] {
    return ['ach', 'same_day_ach', 'rtp'];
  }

  createCounterparty(command: CreateCounterpartyCommand): Promise<{ counterpartyId: string }> {
    return Promise.resolve({ counterpartyId: `fake_cp_${command.reference}` });
  }

  screenCounterparty(): Promise<{ result: 'clear' | 'review' | 'blocked' }> {
    return Promise.resolve({ result: 'clear' });
  }

  createPayout(command: CreatePartnerPayoutCommand): Promise<PartnerPayout> {
    const existing = this.payouts.get(command.idempotencyKey);
    if (existing) return Promise.resolve(existing);
    const payout: PartnerPayout = {
      partnerPayoutId: `fake_po_${++this.sequence}`,
      status: 'queued',
      failureReason: null,
    };
    this.payouts.set(command.idempotencyKey, payout);
    return Promise.resolve(payout);
  }

  retrievePayout(partnerPayoutId: string): Promise<PartnerPayout> {
    const payout = [...this.payouts.values()].find((p) => p.partnerPayoutId === partnerPayoutId);
    return payout ? Promise.resolve(payout) : Promise.reject(new Error('unknown payout'));
  }
}
