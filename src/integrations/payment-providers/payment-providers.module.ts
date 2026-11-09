import { Global, Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../config/configuration';
import { SECRETS_PROVIDER, type SecretsProvider } from '../../shared/application/secrets.port';
import {
  PAYMENT_PROVIDER_REGISTRY,
  type PaymentProvider,
} from './domain-ports/payment-provider.port';
import type { RazorpayCredentials } from './razorpay/razorpay.config';
import { RazorpayPaymentProvider } from './razorpay/razorpay-payment-provider.adapter';
import { StripeConnectPaymentProvider } from './stripe-connect/stripe-connect-payment-provider.adapter';
import { FakePaymentProvider } from './testing/fake-payment-provider';
import { StaticPaymentProviderRegistry } from './testing/in-memory-provider-registry';

/**
 * Builds the provider registry. Each merchant's provider account records which
 * provider serves it, so merchants can be migrated between providers without
 * clients changing their integration (PRD 1, goals). The fake provider is only
 * registered outside staging/production.
 */
@Global()
@Module({
  providers: [
    {
      provide: PAYMENT_PROVIDER_REGISTRY,
      inject: [APP_CONFIG, SECRETS_PROVIDER],
      useFactory: (config: AppConfig, secrets: SecretsProvider) => {
        const providers: PaymentProvider[] = [
          new RazorpayPaymentProvider({
            baseUrl: config.payments.razorpayBaseUrl,
            timeoutMs: config.payments.httpTimeoutMs,
            credentials: (mode) => secrets.getJson<RazorpayCredentials>(`razorpay/${mode}`),
          }),
          new StripeConnectPaymentProvider(),
        ];
        if (!config.isProductionLike) providers.push(new FakePaymentProvider());
        return new StaticPaymentProviderRegistry(providers);
      },
    },
  ],
  exports: [PAYMENT_PROVIDER_REGISTRY],
})
export class PaymentProvidersModule {}
