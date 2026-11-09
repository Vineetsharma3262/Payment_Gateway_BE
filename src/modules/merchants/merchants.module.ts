import { Global, Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../config/configuration';
import {
  PAYMENT_PROVIDER_REGISTRY,
  type PaymentProviderRegistry,
} from '../../integrations/payment-providers/domain-ports/payment-provider.port';
import { AUDIT_LOG, type AuditLog } from '../../shared/application/audit-log.port';
import { CLOCK, type Clock } from '../../shared/application/clock.port';
import {
  DOMAIN_EVENT_PUBLISHER,
  type DomainEventPublisher,
} from '../../shared/application/domain-event-publisher.port';
import { ID_GENERATOR, type IdGenerator } from '../../shared/application/id-generator.port';
import { UNIT_OF_WORK, type UnitOfWork } from '../../shared/application/unit-of-work.port';
import { MerchantUseCases } from './application/merchant.use-cases';
import { MERCHANT_REPOSITORY, type MerchantRepository } from './domain/merchant.repository';
import { PrismaMerchantPaymentProfileReader } from './infrastructure/prisma-merchant-payment-profile.reader';
import { PrismaMerchantRepository } from './infrastructure/prisma-merchant.repository';
import { MERCHANT_USE_CASES } from './merchants.tokens';
import { AdminMerchantsController, MerchantController } from './presentation/merchant.controllers';
import {
  MERCHANT_LIFECYCLE,
  MERCHANT_PAYMENT_PROFILE_READER,
  MERCHANT_REGISTRAR,
} from './public-api';

/** Merchant Management context. Global: its public-api tokens are used by several contexts. */
@Global()
@Module({
  controllers: [MerchantController, AdminMerchantsController],
  providers: [
    { provide: MERCHANT_PAYMENT_PROFILE_READER, useClass: PrismaMerchantPaymentProfileReader },
    { provide: MERCHANT_REPOSITORY, useClass: PrismaMerchantRepository },
    {
      provide: MERCHANT_USE_CASES,
      inject: [
        UNIT_OF_WORK,
        MERCHANT_REPOSITORY,
        DOMAIN_EVENT_PUBLISHER,
        AUDIT_LOG,
        PAYMENT_PROVIDER_REGISTRY,
        ID_GENERATOR,
        CLOCK,
        APP_CONFIG,
      ],
      useFactory: (
        unitOfWork: UnitOfWork,
        merchants: MerchantRepository,
        events: DomainEventPublisher,
        audit: AuditLog,
        providers: PaymentProviderRegistry,
        ids: IdGenerator,
        clock: Clock,
        config: AppConfig,
      ) =>
        new MerchantUseCases({
          unitOfWork,
          merchants,
          events,
          audit,
          providers,
          defaultProvider: config.payments.defaultProvider,
          ids,
          clock,
        }),
    },
    { provide: MERCHANT_REGISTRAR, useExisting: MERCHANT_USE_CASES },
    { provide: MERCHANT_LIFECYCLE, useExisting: MERCHANT_USE_CASES },
  ],
  exports: [MERCHANT_PAYMENT_PROFILE_READER, MERCHANT_REGISTRAR, MERCHANT_LIFECYCLE],
})
export class MerchantsModule {}
