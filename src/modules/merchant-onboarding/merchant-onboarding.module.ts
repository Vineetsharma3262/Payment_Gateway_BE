import { Global, Module } from '@nestjs/common';
import {
  PAYMENT_PROVIDER_REGISTRY,
  type PaymentProviderRegistry,
} from '../../integrations/payment-providers/domain-ports/payment-provider.port';
import { AUDIT_LOG, type AuditLog } from '../../shared/application/audit-log.port';
import { CLOCK, type Clock } from '../../shared/application/clock.port';
import {
  DOCUMENT_STORAGE,
  type DocumentStorage,
} from '../../shared/application/document-storage.port';
import {
  DOMAIN_EVENT_PUBLISHER,
  type DomainEventPublisher,
} from '../../shared/application/domain-event-publisher.port';
import {
  FIELD_ENCRYPTOR,
  type FieldEncryptor,
} from '../../shared/application/field-encryption.port';
import { ID_GENERATOR, type IdGenerator } from '../../shared/application/id-generator.port';
import { UNIT_OF_WORK, type UnitOfWork } from '../../shared/application/unit-of-work.port';
import { MERCHANT_LIFECYCLE, type MerchantLifecycle } from '../merchants/public-api';
import { OnboardingUseCases } from './application/onboarding.use-cases';
import {
  ONBOARDING_APPLICATION_REPOSITORY,
  ONBOARDING_DOCUMENT_REPOSITORY,
  type OnboardingApplicationRepository,
  type OnboardingDocumentRepository,
} from './domain/onboarding.repositories';
import {
  PrismaOnboardingApplicationRepository,
  PrismaOnboardingDocumentRepository,
} from './infrastructure/prisma-onboarding.repositories';
import { ONBOARDING_USE_CASES } from './onboarding.tokens';
import {
  AdminOnboardingController,
  OnboardingController,
} from './presentation/onboarding.controllers';
import { ONBOARDING_STARTER } from './public-api';

@Global()
@Module({
  controllers: [OnboardingController, AdminOnboardingController],
  providers: [
    { provide: ONBOARDING_APPLICATION_REPOSITORY, useClass: PrismaOnboardingApplicationRepository },
    { provide: ONBOARDING_DOCUMENT_REPOSITORY, useClass: PrismaOnboardingDocumentRepository },
    {
      provide: ONBOARDING_USE_CASES,
      inject: [
        UNIT_OF_WORK,
        ONBOARDING_APPLICATION_REPOSITORY,
        ONBOARDING_DOCUMENT_REPOSITORY,
        DOCUMENT_STORAGE,
        FIELD_ENCRYPTOR,
        MERCHANT_LIFECYCLE,
        PAYMENT_PROVIDER_REGISTRY,
        DOMAIN_EVENT_PUBLISHER,
        AUDIT_LOG,
        ID_GENERATOR,
        CLOCK,
      ],
      useFactory: (
        unitOfWork: UnitOfWork,
        applications: OnboardingApplicationRepository,
        documents: OnboardingDocumentRepository,
        storage: DocumentStorage,
        encryptor: FieldEncryptor,
        merchants: MerchantLifecycle,
        providers: PaymentProviderRegistry,
        events: DomainEventPublisher,
        audit: AuditLog,
        ids: IdGenerator,
        clock: Clock,
      ) =>
        new OnboardingUseCases({
          unitOfWork,
          applications,
          documents,
          storage,
          encryptor,
          merchants,
          providers,
          events,
          audit,
          ids,
          clock,
        }),
    },
    { provide: ONBOARDING_STARTER, useExisting: ONBOARDING_USE_CASES },
  ],
  exports: [ONBOARDING_STARTER],
})
export class MerchantOnboardingModule {}
