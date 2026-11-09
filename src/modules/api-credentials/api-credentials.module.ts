import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AUDIT_LOG, type AuditLog } from '../../shared/application/audit-log.port';
import { API_KEY_AUTHENTICATOR } from '../../shared/application/authentication.port';
import { CLOCK, type Clock } from '../../shared/application/clock.port';
import { ID_GENERATOR, type IdGenerator } from '../../shared/application/id-generator.port';
import { SECRETS_PROVIDER, type SecretsProvider } from '../../shared/application/secrets.port';
import {
  SECURE_TOKEN_GENERATOR,
  type SecureTokenGenerator,
} from '../../shared/application/secure-token.port';
import { UNIT_OF_WORK, type UnitOfWork } from '../../shared/application/unit-of-work.port';
import { ApiKeyAuthGuard } from '../../shared/presentation/guards/api-key-auth.guard';
import {
  MERCHANT_PAYMENT_PROFILE_READER,
  type MerchantPaymentProfileReader,
} from '../merchants/public-api';
import { API_KEY_USE_CASES } from './api-credentials.tokens';
import {
  API_KEY_SECRET_HASHER,
  type ApiKeySecretHasher,
} from './application/api-key-secret-hasher.port';
import { ApiKeyUseCases } from './application/api-key.use-cases';
import { AuthenticateApiKeyUseCase } from './application/authenticate-api-key.use-case';
import {
  API_KEY_REPOSITORY,
  API_REQUEST_LOG_STORE,
  type ApiKeyRepository,
} from './domain/api-key.repository';
import { HmacApiKeySecretHasher } from './infrastructure/hmac-api-key-secret-hasher';
import {
  PrismaApiKeyRepository,
  PrismaApiRequestLogStore,
} from './infrastructure/prisma-api-key.repository';
import { ApiRequestLogInterceptor } from './presentation/api-request-log.interceptor';
import { DevelopersController } from './presentation/developers.controller';
import { API_KEY_ISSUER } from './public-api';

/** API Credentials context. Global so any controller can use ApiKeyAuthGuard. */
@Global()
@Module({
  controllers: [DevelopersController],
  providers: [
    { provide: API_KEY_REPOSITORY, useClass: PrismaApiKeyRepository },
    { provide: API_REQUEST_LOG_STORE, useClass: PrismaApiRequestLogStore },
    {
      provide: API_KEY_SECRET_HASHER,
      inject: [SECRETS_PROVIDER],
      useFactory: async (secrets: SecretsProvider) =>
        new HmacApiKeySecretHasher(await secrets.getString('api-key-pepper')),
    },
    {
      provide: API_KEY_AUTHENTICATOR,
      inject: [API_KEY_REPOSITORY, API_KEY_SECRET_HASHER, CLOCK],
      useFactory: (keys: ApiKeyRepository, hasher: ApiKeySecretHasher, clock: Clock) =>
        new AuthenticateApiKeyUseCase(keys, hasher, clock),
    },
    {
      provide: API_KEY_USE_CASES,
      inject: [
        UNIT_OF_WORK,
        API_KEY_REPOSITORY,
        API_KEY_SECRET_HASHER,
        MERCHANT_PAYMENT_PROFILE_READER,
        AUDIT_LOG,
        SECURE_TOKEN_GENERATOR,
        ID_GENERATOR,
        CLOCK,
      ],
      useFactory: (
        unitOfWork: UnitOfWork,
        keys: ApiKeyRepository,
        hasher: ApiKeySecretHasher,
        merchants: MerchantPaymentProfileReader,
        audit: AuditLog,
        tokens: SecureTokenGenerator,
        ids: IdGenerator,
        clock: Clock,
      ) => new ApiKeyUseCases({ unitOfWork, keys, hasher, merchants, audit, tokens, ids, clock }),
    },
    { provide: API_KEY_ISSUER, useExisting: API_KEY_USE_CASES },
    { provide: APP_INTERCEPTOR, useClass: ApiRequestLogInterceptor },
    ApiKeyAuthGuard,
  ],
  exports: [API_KEY_AUTHENTICATOR, API_KEY_ISSUER, ApiKeyAuthGuard],
})
export class ApiCredentialsModule {}
