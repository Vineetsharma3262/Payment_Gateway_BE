import { AggregateRoot } from '../../../shared/domain/aggregate-root';
import {
  InvalidStateTransitionError,
  InvariantViolationError,
} from '../../../shared/domain/domain-error';

export type MerchantStatus = 'onboarding' | 'active' | 'suspended' | 'closed';

/** Methods PayCo can offer at launch, subject to gateway support (PRD 5.1). Google Pay: open question Q9. */
export const PAYMENT_METHODS = ['card', 'apple_pay', 'ach_debit'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

const TRANSITIONS: Record<MerchantStatus, readonly MerchantStatus[]> = {
  onboarding: ['active', 'closed'],
  active: ['suspended', 'closed'],
  suspended: ['active', 'closed'],
  closed: [],
};

export interface MerchantSettings {
  displayName: string;
  brandColor: string | null;
  logoUrl: string | null;
  statementDescriptor: string | null;
  paymentMethods: PaymentMethod[];
}

export interface MerchantProps extends MerchantSettings {
  id: string;
  legalName: string;
  status: MerchantStatus;
  liveChargesEnabled: boolean;
  feeScheduleId: string | null;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

export class Merchant extends AggregateRoot {
  private constructor(private props: MerchantProps) {
    super(props.id, props.version);
  }

  static register(params: {
    id: string;
    legalName: string;
    displayName: string;
    now: Date;
  }): Merchant {
    const merchant = new Merchant({
      id: params.id,
      legalName: params.legalName.trim(),
      displayName: params.displayName.trim(),
      status: 'onboarding',
      liveChargesEnabled: false,
      brandColor: null,
      logoUrl: null,
      statementDescriptor: null,
      paymentMethods: ['card'],
      feeScheduleId: null,
      createdAt: params.now,
      updatedAt: params.now,
      version: 0,
    });
    merchant.emit('merchant.registered', params.now);
    return merchant;
  }

  static rehydrate(props: MerchantProps): Merchant {
    return new Merchant({ ...props, paymentMethods: [...props.paymentMethods] });
  }

  get status(): MerchantStatus {
    return this.props.status;
  }
  get liveChargesEnabled(): boolean {
    return this.props.liveChargesEnabled;
  }
  get legalName(): string {
    return this.props.legalName;
  }

  updateSettings(patch: Partial<MerchantSettings>, now: Date): void {
    if (this.props.status === 'closed')
      throw new InvalidStateTransitionError('Merchant', 'closed', 'updated');
    const next = { ...this.props, ...stripUndefined(patch) };
    if (next.displayName.trim().length < 2)
      throw new InvariantViolationError('Display name is too short.');
    if (next.brandColor !== null && !/^#[0-9A-Fa-f]{6}$/.test(next.brandColor)) {
      throw new InvariantViolationError('Brand colour must be a hex colour like #1A2B3C.');
    }
    if (next.logoUrl !== null && !next.logoUrl.startsWith('https://')) {
      throw new InvariantViolationError('Logo URL must use https.');
    }
    // Card-network descriptor rules: 5–22 chars, at least one letter, no < > \ ' " *.
    if (
      next.statementDescriptor !== null &&
      !/^(?=.*[A-Za-z])[^<>\\'"*]{5,22}$/.test(next.statementDescriptor)
    ) {
      throw new InvariantViolationError(
        'Statement descriptor must be 5–22 characters and contain a letter.',
      );
    }
    if (next.paymentMethods.length === 0)
      throw new InvariantViolationError('At least one payment method is required.');
    this.props = { ...next, paymentMethods: [...new Set(next.paymentMethods)], updatedAt: now };
  }

  /** Gateway approved KYB. Idempotent. */
  enableLiveCharges(now: Date): void {
    if (this.props.liveChargesEnabled && this.props.status === 'active') return;
    if (this.props.status === 'onboarding') this.transition('active', now);
    if (this.props.status !== 'active')
      throw new InvalidStateTransitionError('Merchant', this.props.status, 'live');
    this.props.liveChargesEnabled = true;
    this.props.updatedAt = now;
    this.emit('merchant.live_enabled', now);
  }

  changeStatus(next: MerchantStatus, now: Date): void {
    this.transition(next, now);
    this.emit(`merchant.${next}`, now);
  }

  assignFeeSchedule(feeScheduleId: string | null, now: Date): void {
    this.props.feeScheduleId = feeScheduleId;
    this.props.updatedAt = now;
  }

  toProps(): MerchantProps {
    return { ...this.props, paymentMethods: [...this.props.paymentMethods], version: this.version };
  }

  private transition(next: MerchantStatus, now: Date): void {
    if (!TRANSITIONS[this.props.status].includes(next)) {
      throw new InvalidStateTransitionError('Merchant', this.props.status, next);
    }
    this.props.status = next;
    this.props.updatedAt = now;
  }

  private emit(eventType: string, now: Date): void {
    this.record({
      eventType,
      aggregateType: 'merchant',
      aggregateId: this.id,
      merchantId: this.id,
      occurredAt: now,
      payload: {
        merchantId: this.id,
        status: this.props.status,
        liveChargesEnabled: this.props.liveChargesEnabled,
      },
    });
  }
}

function stripUndefined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as Partial<T>;
}
