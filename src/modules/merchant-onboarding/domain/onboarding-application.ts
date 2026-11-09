import { AggregateRoot } from '../../../shared/domain/aggregate-root';
import {
  InvalidStateTransitionError,
  InvariantViolationError,
} from '../../../shared/domain/domain-error';
import {
  assertValidAddress,
  assertValidOwners,
  type Address,
  type BankAccountRef,
  type BusinessType,
  type Owner,
} from './onboarding.types';

/**
 *   draft ─► submitted ─► pending_review ─► approved
 *     ▲          │               │       └─► rejected
 *     │          └───────┬───────┘
 *     └─ needs_information ◄┘   (gateway asks for more; merchant edits and resubmits)
 *
 * PayCo collects and forwards data; the gateway makes the regulated decision
 * (PRD 5.3 step 4, §8). PayCo only records the decision it receives.
 */
export type OnboardingStatus =
  'draft' | 'submitted' | 'pending_review' | 'needs_information' | 'approved' | 'rejected';
export type ProviderDecision = 'approved' | 'needs_information' | 'rejected';

const EDITABLE: readonly OnboardingStatus[] = ['draft', 'needs_information'];

export interface BusinessProfile {
  legalBusinessName: string | null;
  doingBusinessAs: string | null;
  businessType: BusinessType | null;
  einEncrypted: string | null;
  einLast4: string | null;
  website: string | null;
  phone: string | null;
  address: Address | null;
}

export interface OnboardingApplicationProps extends BusinessProfile {
  id: string;
  merchantId: string;
  status: OnboardingStatus;
  owners: Owner[];
  bankAccount: BankAccountRef | null;
  providerRequirements: string[];
  providerTermsAcceptedAt: Date | null;
  submittedAt: Date | null;
  decidedAt: Date | null;
  rejectionReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

export interface ApplicationPatch extends Partial<BusinessProfile> {
  owners?: Owner[];
  bankAccount?: BankAccountRef | null;
  acceptProviderTerms?: boolean;
}

export class OnboardingApplication extends AggregateRoot {
  private constructor(private props: OnboardingApplicationProps) {
    super(props.id, props.version);
  }

  static start(params: {
    id: string;
    merchantId: string;
    legalBusinessName: string;
    now: Date;
  }): OnboardingApplication {
    return new OnboardingApplication({
      id: params.id,
      merchantId: params.merchantId,
      status: 'draft',
      legalBusinessName: params.legalBusinessName,
      doingBusinessAs: null,
      businessType: null,
      einEncrypted: null,
      einLast4: null,
      website: null,
      phone: null,
      address: null,
      owners: [],
      bankAccount: null,
      providerRequirements: [],
      providerTermsAcceptedAt: null,
      submittedAt: null,
      decidedAt: null,
      rejectionReason: null,
      createdAt: params.now,
      updatedAt: params.now,
      version: 0,
    });
  }

  static rehydrate(props: OnboardingApplicationProps): OnboardingApplication {
    return new OnboardingApplication({ ...props, owners: [...props.owners] });
  }

  get merchantId(): string {
    return this.props.merchantId;
  }
  get status(): OnboardingStatus {
    return this.props.status;
  }

  update(patch: ApplicationPatch, now: Date): void {
    if (!EDITABLE.includes(this.props.status)) {
      throw new InvalidStateTransitionError('OnboardingApplication', this.props.status, 'edited');
    }
    if (patch.address) assertValidAddress(patch.address);
    if (patch.owners) assertValidOwners(patch.owners);
    const { acceptProviderTerms, ...fields } = patch;
    const defined = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
    this.props = { ...this.props, ...defined, updatedAt: now };
    // Client must accept the gateway's sub-merchant terms inside PayCo's signup (PRD §4).
    if (acceptProviderTerms) this.props.providerTermsAcceptedAt ??= now;
  }

  /** Outstanding items; empty means the application can be submitted. */
  requirements(): string[] {
    const p = this.props;
    const missing: string[] = [];
    if (!p.legalBusinessName) missing.push('business.legal_business_name');
    if (!p.businessType) missing.push('business.business_type');
    if (!p.einEncrypted) missing.push('business.ein');
    if (!p.phone) missing.push('business.phone');
    if (!p.address) missing.push('business.address');
    if (!p.owners.some((o) => o.isController)) missing.push('owners.controlling_person');
    p.owners.forEach((o, i) => {
      if (!o.dateOfBirthEncrypted) missing.push(`owners[${i}].date_of_birth`);
      if (!o.ssnLast4Encrypted) missing.push(`owners[${i}].ssn_last4`);
    });
    if (!p.bankAccount) missing.push('bank_account');
    if (!p.providerTermsAcceptedAt) missing.push('provider_terms_acceptance');
    return [...missing, ...p.providerRequirements.map((r) => `provider.${r}`)];
  }

  submit(now: Date): void {
    if (!EDITABLE.includes(this.props.status)) {
      throw new InvalidStateTransitionError(
        'OnboardingApplication',
        this.props.status,
        'submitted',
      );
    }
    // Gateway-requested items are answered by the resubmission itself.
    const missing = this.requirements().filter((r) => !r.startsWith('provider.'));
    if (missing.length > 0) {
      throw new InvariantViolationError('The application is incomplete.', {
        requirements: missing,
      });
    }
    this.props.status = 'submitted';
    this.props.providerRequirements = [];
    this.props.submittedAt = now;
    this.props.updatedAt = now;
    this.emit('onboarding.submitted', now);
  }

  markSentToProvider(now: Date): void {
    if (this.props.status !== 'submitted') return;
    this.props.status = 'pending_review';
    this.props.updatedAt = now;
  }

  recordProviderDecision(
    decision: ProviderDecision,
    details: { requirements?: string[]; reason?: string },
    now: Date,
  ): void {
    if (!['submitted', 'pending_review', 'needs_information'].includes(this.props.status)) {
      throw new InvalidStateTransitionError('OnboardingApplication', this.props.status, decision);
    }
    this.props.status = decision;
    this.props.updatedAt = now;
    if (decision === 'needs_information') {
      this.props.providerRequirements = details.requirements ?? [];
    } else {
      this.props.decidedAt = now;
      this.props.rejectionReason = decision === 'rejected' ? (details.reason ?? null) : null;
    }
    this.emit(`onboarding.${decision}`, now);
  }

  toProps(): OnboardingApplicationProps {
    return { ...this.props, owners: [...this.props.owners], version: this.version };
  }

  private emit(eventType: string, now: Date): void {
    this.record({
      eventType,
      aggregateType: 'onboarding_application',
      aggregateId: this.id,
      merchantId: this.props.merchantId,
      occurredAt: now,
      payload: { applicationId: this.id, status: this.props.status },
    });
  }
}
