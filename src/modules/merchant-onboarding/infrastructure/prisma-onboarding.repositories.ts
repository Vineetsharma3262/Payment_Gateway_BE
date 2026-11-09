import { Injectable } from '@nestjs/common';
import type { OnboardingApplication as ApplicationRow, Prisma } from '@prisma/client';
import { ConcurrencyConflictError } from '../../../shared/application/application-error';
import { toPage, type Page, type PageRequest } from '../../../shared/application/pagination';
import { TransactionHost } from '../../../shared/infrastructure/database/transaction-host';
import { OnboardingApplication, type OnboardingStatus } from '../domain/onboarding-application';
import { OnboardingDocument } from '../domain/onboarding-document';
import type {
  Address,
  BankAccountRef,
  BusinessType,
  DocumentType,
  Owner,
} from '../domain/onboarding.types';
import type {
  OnboardingApplicationRepository,
  OnboardingDocumentRepository,
} from '../domain/onboarding.repositories';

const toDomain = (r: ApplicationRow) =>
  OnboardingApplication.rehydrate({
    ...r,
    status: r.status as OnboardingStatus,
    businessType: r.businessType as BusinessType | null,
    address: r.address as Address | null,
    owners: r.owners as unknown as Owner[],
    bankAccount: r.bankAccount as BankAccountRef | null,
    providerRequirements: r.providerRequirements as string[],
  });

function toRow(app: OnboardingApplication) {
  const p = app.toProps();
  return {
    ...p,
    address: (p.address ?? undefined) as Prisma.InputJsonValue | undefined,
    owners: p.owners as unknown as Prisma.InputJsonArray,
    bankAccount: (p.bankAccount ?? undefined) as Prisma.InputJsonValue | undefined,
    providerRequirements: p.providerRequirements,
  };
}

@Injectable()
export class PrismaOnboardingApplicationRepository implements OnboardingApplicationRepository {
  constructor(private readonly host: TransactionHost) {}

  async findByMerchant(merchantId: string): Promise<OnboardingApplication | null> {
    const row = await this.host.client.onboardingApplication.findUnique({ where: { merchantId } });
    return row ? toDomain(row) : null;
  }

  async findById(id: string): Promise<OnboardingApplication | null> {
    const row = await this.host.client.onboardingApplication.findUnique({ where: { id } });
    return row ? toDomain(row) : null;
  }

  async list(
    filter: { status?: OnboardingStatus },
    page: PageRequest,
  ): Promise<Page<OnboardingApplication>> {
    const rows = await this.host.client.onboardingApplication.findMany({
      where: { status: filter.status },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: page.limit + 1,
      ...(page.startingAfter ? { cursor: { id: page.startingAfter }, skip: 1 } : {}),
    });
    return toPage(rows.map(toDomain), page.limit);
  }

  async insert(app: OnboardingApplication): Promise<void> {
    await this.host.client.onboardingApplication.create({ data: { ...toRow(app), version: 0 } });
    app.markPersisted(0);
  }

  async save(app: OnboardingApplication): Promise<void> {
    const { id, version, merchantId: _m, createdAt: _c, ...data } = toRow(app);
    const result = await this.host.client.onboardingApplication.updateMany({
      where: { id, version },
      data: { ...data, version: version + 1 },
    });
    if (result.count !== 1) throw new ConcurrencyConflictError('onboarding_application', id);
    app.markPersisted(version + 1);
  }
}

@Injectable()
export class PrismaOnboardingDocumentRepository implements OnboardingDocumentRepository {
  constructor(private readonly host: TransactionHost) {}

  async listForApplication(
    merchantId: string,
    applicationId: string,
  ): Promise<OnboardingDocument[]> {
    const rows = await this.host.client.onboardingDocument.findMany({
      where: { merchantId, applicationId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) =>
      OnboardingDocument.rehydrate({
        ...r,
        documentType: r.documentType as DocumentType,
        status: r.status as 'pending_upload' | 'uploaded' | 'submitted',
      }),
    );
  }

  async insert(document: OnboardingDocument): Promise<void> {
    await this.host.client.onboardingDocument.create({ data: document.toProps() });
  }
}
