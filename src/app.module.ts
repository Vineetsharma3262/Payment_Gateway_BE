import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import type Redis from 'ioredis';
import { APP_CONFIG, type AppConfig } from './config/configuration';
import { ConfigurationModule } from './config/configuration.module';
import { RedisThrottlerStorage } from './infrastructure/cache/redis-throttler.storage';
import { RedisModule } from './infrastructure/cache/redis.module';
import { REDIS_CLIENT } from './infrastructure/cache/redis.tokens';
import { SecretsModule } from './infrastructure/secrets/secrets.module';
import { PaymentProvidersModule } from './integrations/payment-providers/payment-providers.module';
import { ApiCredentialsModule } from './modules/api-credentials/api-credentials.module';
import { HealthModule } from './modules/health/health.module';
import { AuditModule } from './modules/audit/audit.module';
import { IdentityAccessModule } from './modules/identity-access/identity-access.module';
import { MerchantOnboardingModule } from './modules/merchant-onboarding/merchant-onboarding.module';
import { MerchantsModule } from './modules/merchants/merchants.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { OrdersModule } from './modules/orders/orders.module';
import { TeamAccessModule } from './modules/team-access/team-access.module';
import { CustomersModule } from './modules/customers/customers.module';
import { DisputesModule } from './modules/disputes/disputes.module';
import { InvoicesModule } from './modules/invoices/invoices.module';
import { LedgerModule } from './modules/ledger/ledger.module';
import { PaymentLinksModule } from './modules/payment-links/payment-links.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { PayoutsModule } from './modules/payouts/payouts.module';
import { PlatformFeesModule } from './modules/platform-fees/platform-fees.module';
import { ReconciliationModule } from './modules/reconciliation/reconciliation.module';
import { RefundsModule } from './modules/refunds/refunds.module';
import { ReportingModule } from './modules/reporting/reporting.module';
import { SettlementsModule } from './modules/settlements/settlements.module';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { CryptoModule } from './infrastructure/crypto/crypto.module';
import { StorageModule } from './infrastructure/storage/storage.module';
import { DatabaseModule } from './shared/infrastructure/database/database.module';
import { LoggingModule } from './shared/infrastructure/logging/logging.module';
import { HttpExceptionFilter } from './shared/presentation/filters/http-exception.filter';
import { PaycoThrottlerGuard } from './shared/presentation/guards/payco-throttler.guard';
import { ResponseEnvelopeInterceptor } from './shared/presentation/interceptors/response-envelope.interceptor';

@Module({
  imports: [
    // Platform
    ConfigurationModule,
    LoggingModule,
    SecretsModule,
    DatabaseModule,
    RedisModule,
    PaymentProvidersModule,
    StorageModule,
    CryptoModule,
    ThrottlerModule.forRootAsync({
      inject: [APP_CONFIG, REDIS_CLIENT],
      useFactory: (config: AppConfig, redis: Redis | null) => ({
        throttlers: [{ ttl: config.rateLimit.ttlMs, limit: config.rateLimit.limit }],
        storage: redis ? new RedisThrottlerStorage(redis) : undefined,
      }),
    }),
    // Bounded contexts — Phase 1/2 (implemented)
    HealthModule,
    AuditModule,
    NotificationsModule,
    IdentityAccessModule,
    TeamAccessModule,
    MerchantsModule,
    MerchantOnboardingModule,
    ApiCredentialsModule,
    OrdersModule,
    // Bounded contexts — Phases 3–5 (domain cores implemented; routes answer 501 until their phase)
    CustomersModule,
    PaymentsModule,
    RefundsModule,
    PaymentLinksModule,
    LedgerModule,
    PlatformFeesModule,
    SettlementsModule,
    ReconciliationModule,
    DisputesModule,
    WebhooksModule,
    InvoicesModule,
    SubscriptionsModule,
    PayoutsModule,
    ReportingModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: PaycoThrottlerGuard },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: ResponseEnvelopeInterceptor },
  ],
})
export class AppModule {}
