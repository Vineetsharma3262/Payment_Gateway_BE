import { Entity } from '../../../shared/domain/entity';

/**
 * Supplier receiving payouts (PRD 5.2). Destination is a partner token; PayCo
 * does not store account or card numbers. OFAC screening is run through the
 * payouts partner before any payout.
 */
export type ScreeningStatus = 'pending' | 'clear' | 'review' | 'blocked';

export interface RecipientProps {
  id: string;
  merchantId: string;
  name: string;
  type: 'bank_account' | 'debit_card';
  partnerCounterpartyId: string | null;
  last4: string;
  verified: boolean;
  screening: ScreeningStatus;
  createdAt: Date;
}

export class Recipient extends Entity {
  private constructor(private props: RecipientProps) {
    super(props.id);
  }

  static create(
    params: Omit<RecipientProps, 'verified' | 'screening' | 'partnerCounterpartyId'>,
  ): Recipient {
    return new Recipient({
      ...params,
      verified: false,
      screening: 'pending',
      partnerCounterpartyId: null,
    });
  }

  static rehydrate(props: RecipientProps): Recipient {
    return new Recipient({ ...props });
  }

  get merchantId(): string {
    return this.props.merchantId;
  }

  canReceivePayouts(): boolean {
    return (
      this.props.verified &&
      this.props.screening === 'clear' &&
      this.props.partnerCounterpartyId !== null
    );
  }

  recordScreening(result: ScreeningStatus): void {
    this.props.screening = result;
  }

  recordVerification(partnerCounterpartyId: string): void {
    this.props.partnerCounterpartyId = partnerCounterpartyId;
    this.props.verified = true;
  }

  toProps(): RecipientProps {
    return { ...this.props };
  }
}
