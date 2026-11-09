import { ResourceNotFoundError } from '../../../shared/application/application-error';
import type { AuditLog } from '../../../shared/application/audit-log.port';
import type { Clock } from '../../../shared/application/clock.port';
import type {
  DocumentStorage,
  PresignedUpload,
} from '../../../shared/application/document-storage.port';
import type { DomainEventPublisher } from '../../../shared/application/domain-event-publisher.port';
import type { FieldEncryptor } from '../../../shared/application/field-encryption.port';
import type { IdGenerator } from '../../../shared/application/id-generator.port';
import type { Page, PageRequest } from '../../../shared/application/pagination';
import type { UnitOfWork } from '../../../shared/application/unit-of-work.port';
import type { PaymentProviderRegistry } from '../../../integrations/payment-providers/domain-ports/payment-provider.port';
import { ProviderError } from '../../../integrations/payment-providers/domain-ports/provider-errors';
import type { MerchantLifecycle } from '../../merchants/public-api';
import {
  OnboardingApplication,
  type ApplicationPatch,
  type OnboardingStatus,
  type ProviderDecision,
} from '../domain/onboarding-application';
import { OnboardingDocument } from '../domain/onboarding-document';
import {
  assertValidEin,
  type Address,
  type BankAccountRef,
  type BusinessType,
  type DocumentType,
  type Owner,
} from '../domain/onboarding.types';
import type {
  OnboardingApplicationRepository,
  OnboardingDocumentRepository,
} from '../domain/onboarding.repositories';
import type { OnboardingStarter } from '../public-api';

export interface OwnerInput {
  id?: string;
  firstName: string;
  lastName: string;
  email: string;
  title?: string | null;
  ownershipPercent: number;
  isController: boolean;
  /** YYYY-MM-DD, write-only. */
  dateOfBirth?: string;
  ssnLast4?: string;
}

export interface UpdateApplicationInput {
  legalBusinessName?: string;
  doingBusinessAs?: string | null;
  businessType?: BusinessType;
  ein?: string;
  website?: string | null;
  phone?: string;
  address?: Address;
  owners?: OwnerInput[];
  bankAccount?: BankAccountRef;
  acceptProviderTerms?: boolean;
}

export interface ApplicationDto {
  id: string;
  merchantId: string;
  status: OnboardingStatus;
  legalBusinessName: string | null;
  doingBusinessAs: string | null;
  businessType: BusinessType | null;
  einLast4: string | null;
  website: string | null;
  phone: string | null;
  address: Address | null;
  owners: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    title: string | null;
    ownershipPercent: number;
    isController: boolean;
    dateOfBirthProvided: boolean;
    ssnLast4Provided: boolean;
  }[];
  bankAccountLast4: string | null;
  providerTermsAccepted: boolean;
  requirements: string[];
  submittedAt: string | null;
  decidedAt: string | null;
  rejectionReason: string | null;
}

export type ProviderSubmission = { status: 'sent' } | { status: 'pending'; reason: string };

export interface OnboardingDependencies {
  unitOfWork: UnitOfWork;
  applications: OnboardingApplicationRepository;
  documents: OnboardingDocumentRepository;
  storage: DocumentStorage;
  encryptor: FieldEncryptor;
  merchants: MerchantLifecycle;
  providers: PaymentProviderRegistry;
  events: DomainEventPublisher;
  audit: AuditLog;
  ids: IdGenerator;
  clock: Clock;
}

type Actor = { type: 'user' | 'system' | 'provider'; id: string };

/** Never exposes encrypted values; only whether sensitive fields were provided. */
export function toApplicationDto(app: OnboardingApplication): ApplicationDto {
  const p = app.toProps();
  return {
    id: p.id,
    merchantId: p.merchantId,
    status: p.status,
    legalBusinessName: p.legalBusinessName,
    doingBusinessAs: p.doingBusinessAs,
    businessType: p.businessType,
    einLast4: p.einLast4,
    website: p.website,
    phone: p.phone,
    address: p.address,
    owners: p.owners.map((o) => ({
      id: o.id,
      firstName: o.firstName,
      lastName: o.lastName,
      email: o.email,
      title: o.title,
      ownershipPercent: o.ownershipPercent,
      isController: o.isController,
      dateOfBirthProvided: o.dateOfBirthEncrypted !== null,
      ssnLast4Provided: o.ssnLast4Encrypted !== null,
    })),
    bankAccountLast4: p.bankAccount?.last4 ?? null,
    providerTermsAccepted: p.providerTermsAcceptedAt !== null,
    requirements: app.requirements(),
    submittedAt: p.submittedAt?.toISOString() ?? null,
    decidedAt: p.decidedAt?.toISOString() ?? null,
    rejectionReason: p.rejectionReason,
  };
}

export class OnboardingUseCases implements OnboardingStarter {
  constructor(private readonly deps: OnboardingDependencies) {}

  async start(merchantId: string, legalBusinessName: string): Promise<void> {
    if (await this.deps.applications.findByMerchant(merchantId)) return;
    await this.deps.applications.insert(
      OnboardingApplication.start({
        id: this.deps.ids.next('onb'),
        merchantId,
        legalBusinessName,
        now: this.deps.clock.now(),
      }),
    );
  }

  async get(merchantId: string): Promise<ApplicationDto> {
    return toApplicationDto(await this.load(merchantId));
  }

  async update(
    merchantId: string,
    input: UpdateApplicationInput,
    actor: Actor,
  ): Promise<ApplicationDto> {
    return this.deps.unitOfWork.run(async () => {
      const app = await this.load(merchantId);
      const patch: ApplicationPatch = {
        legalBusinessName: input.legalBusinessName,
        doingBusinessAs: input.doingBusinessAs,
        businessType: input.businessType,
        website: input.website,
        phone: input.phone,
        address: input.address,
        bankAccount: input.bankAccount,
        acceptProviderTerms: input.acceptProviderTerms,
      };
      if (input.ein !== undefined) {
        assertValidEin(input.ein);
        patch.einEncrypted = await this.deps.encryptor.encrypt(input.ein);
        patch.einLast4 = input.ein.slice(-4);
      }
      if (input.owners) patch.owners = await this.mergeOwners(app.toProps().owners, input.owners);
      app.update(patch, this.deps.clock.now());
      await this.deps.applications.save(app);
      await this.deps.audit.record({
        merchantId,
        actor,
        action: 'onboarding.updated',
        resource: { type: 'onboarding_application', id: app.id },
        metadata: { fields: Object.keys(input) },
      });
      return toApplicationDto(app);
    });
  }

  /**
   * PRD 5.3 steps 3–4. The application is committed as `submitted` first; the
   * gateway calls happen outside the transaction. If the gateway cannot be
   * reached or the capability is not yet available, the application stays
   * `submitted` and submission is retried later — data is never lost.
   */
  async submit(
    merchantId: string,
    actor: Actor,
  ): Promise<{ application: ApplicationDto; providerSubmission: ProviderSubmission }> {
    const app = await this.deps.unitOfWork.run(async () => {
      const app = await this.load(merchantId);
      app.submit(this.deps.clock.now());
      await this.deps.applications.save(app);
      await this.deps.events.publish(app.pullEvents());
      await this.deps.audit.record({
        merchantId,
        actor,
        action: 'onboarding.submitted',
        resource: { type: 'onboarding_application', id: app.id },
      });
      return app;
    });
    const providerSubmission = await this.sendToProvider(app);
    return { application: toApplicationDto(app), providerSubmission };
  }

  /** Retry hook for the scheduler / admins when an earlier gateway submission did not go through. */
  async retryProviderSubmission(applicationId: string): Promise<ProviderSubmission> {
    const app = await this.deps.applications.findById(applicationId);
    if (!app) throw new ResourceNotFoundError('onboarding_application', applicationId);
    if (app.status !== 'submitted') return { status: 'sent' };
    return this.sendToProvider(app);
  }

  async requestDocumentUpload(
    merchantId: string,
    input: { documentType: DocumentType; contentType: string },
    actor: Actor,
  ): Promise<{ documentId: string; upload: PresignedUpload }> {
    const app = await this.load(merchantId);
    const document = OnboardingDocument.request({
      id: this.deps.ids.next('doc'),
      merchantId,
      applicationId: app.id,
      documentType: input.documentType,
      contentType: input.contentType,
      createdAt: this.deps.clock.now(),
    });
    await this.deps.unitOfWork.run(async () => {
      await this.deps.documents.insert(document);
      await this.deps.audit.record({
        merchantId,
        actor,
        action: 'onboarding.document_requested',
        resource: { type: 'onboarding_document', id: document.id },
        metadata: { document_type: input.documentType },
      });
    });
    const upload = await this.deps.storage.createUploadUrl({
      storageKey: document.storageKey,
      contentType: input.contentType,
      maxBytes: 10 * 1024 * 1024,
    });
    return { documentId: document.id, upload };
  }

  async listDocuments(merchantId: string) {
    const app = await this.load(merchantId);
    return (await this.deps.documents.listForApplication(merchantId, app.id)).map((d) => {
      const p = d.toProps();
      return {
        id: p.id,
        documentType: p.documentType,
        contentType: p.contentType,
        status: p.status,
        createdAt: p.createdAt.toISOString(),
      };
    });
  }

  async adminList(
    filter: { status?: OnboardingStatus },
    page: PageRequest,
  ): Promise<Page<ApplicationDto>> {
    const result = await this.deps.applications.list(filter, page);
    return { ...result, items: result.items.map(toApplicationDto) };
  }

  /**
   * Records the gateway's KYB/KYC decision (from its webhook or entered by an
   * administrator from the gateway's portal). Approval activates live mode.
   */
  async recordProviderDecision(
    applicationId: string,
    decision: ProviderDecision,
    details: { requirements?: string[]; reason?: string },
    actor: Actor,
  ): Promise<ApplicationDto> {
    return this.deps.unitOfWork.run(async () => {
      const app = await this.deps.applications.findById(applicationId);
      if (!app) throw new ResourceNotFoundError('onboarding_application', applicationId);
      app.recordProviderDecision(decision, details, this.deps.clock.now());
      await this.deps.applications.save(app);
      await this.deps.events.publish(app.pullEvents());
      await this.deps.audit.record({
        merchantId: app.merchantId,
        actor,
        action: 'onboarding.provider_decision_recorded',
        resource: { type: 'onboarding_application', id: app.id },
        metadata: { decision, requirements: details.requirements ?? [] },
      });
      if (decision === 'approved')
        await this.deps.merchants.enableLiveCharges(app.merchantId, actor);
      return toApplicationDto(app);
    });
  }

  private async sendToProvider(app: OnboardingApplication): Promise<ProviderSubmission> {
    const p = app.toProps();
    const controller = p.owners.find((o) => o.isController);
    try {
      const account = await this.deps.merchants.ensureProviderAccount(
        p.merchantId,
        'live',
        p.legalBusinessName ?? '',
        controller?.email ?? '',
      );
      if (account.status !== 'ready') return { status: 'pending', reason: account.reason };
      const provider = this.deps.providers.get(account.provider);
      await provider.submitAccountOnboarding({
        mode: 'live',
        account: { provider: account.provider, accountId: account.accountId },
        business: {
          legalName: p.legalBusinessName ?? '',
          doingBusinessAs: p.doingBusinessAs,
          type: p.businessType ?? '',
          ein: await this.deps.encryptor.decrypt(p.einEncrypted ?? ''),
          website: p.website,
          phone: p.phone ?? '',
          address: { ...p.address! },
        },
        owners: await Promise.all(
          p.owners.map(async (o) => ({
            firstName: o.firstName,
            lastName: o.lastName,
            email: o.email,
            title: o.title,
            ownershipPercent: o.ownershipPercent,
            isController: o.isController,
            dateOfBirth: await this.deps.encryptor.decrypt(o.dateOfBirthEncrypted ?? ''),
            ssnLast4: await this.deps.encryptor.decrypt(o.ssnLast4Encrypted ?? ''),
          })),
        ),
        bankAccountToken: p.bankAccount?.token ?? '',
        termsAcceptedAt: p.providerTermsAcceptedAt!,
      });
    } catch (error) {
      if (error instanceof ProviderError) return { status: 'pending', reason: error.message };
      throw error;
    }
    await this.deps.unitOfWork.run(async () => {
      app.markSentToProvider(this.deps.clock.now());
      await this.deps.applications.save(app);
    });
    return { status: 'sent' };
  }

  /** Owners are replaced as a list; existing owners keep their encrypted values unless new ones are given. */
  private async mergeOwners(existing: Owner[], input: OwnerInput[]): Promise<Owner[]> {
    return Promise.all(
      input.map(async (o) => {
        const previous = o.id ? existing.find((e) => e.id === o.id) : undefined;
        return {
          id: previous?.id ?? this.deps.ids.next('own'),
          firstName: o.firstName,
          lastName: o.lastName,
          email: o.email.toLowerCase(),
          title: o.title ?? null,
          ownershipPercent: o.ownershipPercent,
          isController: o.isController,
          dateOfBirthEncrypted: o.dateOfBirth
            ? await this.deps.encryptor.encrypt(o.dateOfBirth)
            : (previous?.dateOfBirthEncrypted ?? null),
          ssnLast4Encrypted: o.ssnLast4
            ? await this.deps.encryptor.encrypt(o.ssnLast4)
            : (previous?.ssnLast4Encrypted ?? null),
        };
      }),
    );
  }

  private async load(merchantId: string): Promise<OnboardingApplication> {
    const app = await this.deps.applications.findByMerchant(merchantId);
    if (!app) throw new ResourceNotFoundError('onboarding_application', merchantId);
    return app;
  }
}
