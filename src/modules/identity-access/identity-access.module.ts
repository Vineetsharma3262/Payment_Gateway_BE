import { Global, Logger, Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../config/configuration';
import {
  EMAIL_SENDER,
  type EmailSender,
} from '../../integrations/notifications/domain-ports/email-sender.port';
import { AUDIT_LOG, type AuditLog } from '../../shared/application/audit-log.port';
import { ACCESS_TOKEN_VERIFIER } from '../../shared/application/authorization.port';
import { CLOCK, type Clock } from '../../shared/application/clock.port';
import { ID_GENERATOR, type IdGenerator } from '../../shared/application/id-generator.port';
import { HASHER, type Hasher } from '../../shared/application/request-hash';
import { SECRETS_PROVIDER, type SecretsProvider } from '../../shared/application/secrets.port';
import {
  SECURE_TOKEN_GENERATOR,
  type SecureTokenGenerator,
} from '../../shared/application/secure-token.port';
import { UNIT_OF_WORK, type UnitOfWork } from '../../shared/application/unit-of-work.port';
import { API_KEY_ISSUER, type ApiKeyIssuer } from '../api-credentials/public-api';
import {
  MERCHANT_LIFECYCLE,
  MERCHANT_PAYMENT_PROFILE_READER,
  MERCHANT_REGISTRAR,
  type MerchantLifecycle,
  type MerchantPaymentProfileReader,
  type MerchantRegistrar,
} from '../merchants/public-api';
import { ONBOARDING_STARTER, type OnboardingStarter } from '../merchant-onboarding/public-api';
import { TEAM_DIRECTORY, type TeamDirectory } from '../team-access/public-api';
import {
  ACCESS_TOKEN_SERVICE,
  PASSWORD_HASHER,
  type AccessTokenService,
  type PasswordHasher,
} from './application/identity.ports';
import { IdentityUseCases } from './application/identity.use-cases';
import { SessionVerifier } from './application/session-verifier';
import {
  USER_ADMIN_USE_CASES,
  UserAdminUseCases,
} from './application/user-admin.use-cases';
import {
  ADMIN_USER_REPOSITORY,
  PASSWORD_RESET_TOKEN_REPOSITORY,
  SESSION_REPOSITORY,
  USER_REPOSITORY,
  type AdminUserRepository,
  type PasswordResetTokenRepository,
  type SessionRepository,
  type UserRepository,
} from './domain/identity.repositories';
import { IDENTITY_USE_CASES } from './identity.tokens';
import { Argon2PasswordHasher } from './infrastructure/argon2-password-hasher';
import { JwtAccessTokenService } from './infrastructure/jwt-access-token.service';
import {
  PrismaAdminUserRepository,
  PrismaPasswordResetTokenRepository,
  PrismaSessionRepository,
  PrismaUserRepository,
} from './infrastructure/prisma-identity.repositories';
import { AuthController } from './presentation/auth.controller';
import { UsersAdminController } from './presentation/users-admin.controller';
import { USER_DIRECTORY } from './public-api';

/** Global: ACCESS_TOKEN_VERIFIER (JwtAuthGuard) and USER_DIRECTORY are used across contexts. */
@Global()
@Module({
  controllers: [AuthController, UsersAdminController],
  providers: [
    { provide: USER_REPOSITORY, useClass: PrismaUserRepository },
    { provide: ADMIN_USER_REPOSITORY, useClass: PrismaAdminUserRepository },
    { provide: SESSION_REPOSITORY, useClass: PrismaSessionRepository },
    { provide: PASSWORD_RESET_TOKEN_REPOSITORY, useClass: PrismaPasswordResetTokenRepository },
    { provide: PASSWORD_HASHER, useClass: Argon2PasswordHasher },
    {
      provide: ACCESS_TOKEN_SERVICE,
      inject: [SECRETS_PROVIDER, APP_CONFIG],
      useFactory: async (secrets: SecretsProvider, config: AppConfig) =>
        new JwtAccessTokenService(
          await secrets.getString('jwt-signing-key'),
          config.auth.accessTokenTtlSeconds,
        ),
    },
    {
      provide: ACCESS_TOKEN_VERIFIER,
      inject: [ACCESS_TOKEN_SERVICE, SESSION_REPOSITORY, CLOCK],
      useFactory: (tokens: AccessTokenService, sessions: SessionRepository, clock: Clock) =>
        new SessionVerifier(tokens, sessions, clock),
    },
    {
      provide: USER_DIRECTORY,
      inject: [USER_REPOSITORY],
      useFactory: (users: UserRepository) => ({
        emailsOf: async (ids: readonly string[]) =>
          new Map((await users.findManyByIds(ids)).map((u) => [u.id, u.email] as const)),
      }),
    },
    {
      provide: IDENTITY_USE_CASES,
      inject: [
        UNIT_OF_WORK,
        USER_REPOSITORY,
        SESSION_REPOSITORY,
        PASSWORD_RESET_TOKEN_REPOSITORY,
        PASSWORD_HASHER,
        ACCESS_TOKEN_SERVICE,
        SECURE_TOKEN_GENERATOR,
        HASHER,
        ID_GENERATOR,
        CLOCK,
        AUDIT_LOG,
        EMAIL_SENDER,
        TEAM_DIRECTORY,
        MERCHANT_REGISTRAR,
        MERCHANT_LIFECYCLE,
        MERCHANT_PAYMENT_PROFILE_READER,
        ONBOARDING_STARTER,
        API_KEY_ISSUER,
        APP_CONFIG,
      ],
      useFactory: (
        unitOfWork: UnitOfWork,
        users: UserRepository,
        sessions: SessionRepository,
        resetTokens: PasswordResetTokenRepository,
        passwords: PasswordHasher,
        accessTokens: AccessTokenService,
        tokens: SecureTokenGenerator,
        hasher: Hasher,
        ids: IdGenerator,
        clock: Clock,
        audit: AuditLog,
        email: EmailSender,
        team: TeamDirectory,
        merchants: MerchantRegistrar,
        merchantLifecycle: MerchantLifecycle,
        merchantPaymentProfiles: MerchantPaymentProfileReader,
        onboarding: OnboardingStarter,
        apiKeys: ApiKeyIssuer,
        config: AppConfig,
      ) => {
        const logger = new Logger('Identity');
        return new IdentityUseCases({
          unitOfWork,
          users,
          sessions,
          resetTokens,
          passwords,
          accessTokens,
          tokens,
          hasher,
          ids,
          clock,
          audit,
          email,
          team,
          merchants,
          merchantLifecycle,
          merchantPaymentProfiles,
          onboarding,
          apiKeys,
          refreshTokenTtlMs: config.auth.refreshTokenTtlDays * 24 * 60 * 60 * 1000,
          dashboardBaseUrl: config.auth.dashboardBaseUrl,
          onBackgroundError: (operation, error) =>
            logger.warn({ err: error, operation }, 'background step failed'),
        });
      },
    },
    {
      provide: USER_ADMIN_USE_CASES,
      inject: [
        UNIT_OF_WORK,
        USER_REPOSITORY,
        ADMIN_USER_REPOSITORY,
        PASSWORD_HASHER,
        TEAM_DIRECTORY,
        MERCHANT_REGISTRAR,
        MERCHANT_PAYMENT_PROFILE_READER,
        EMAIL_SENDER,
        ID_GENERATOR,
        CLOCK,
        APP_CONFIG,
      ],
      useFactory: (
        unitOfWork: UnitOfWork,
        users: UserRepository,
        adminUsers: AdminUserRepository,
        passwords: PasswordHasher,
        team: TeamDirectory,
        merchants: MerchantRegistrar,
        merchantProfiles: MerchantPaymentProfileReader,
        email: EmailSender,
        ids: IdGenerator,
        clock: Clock,
        config: AppConfig,
      ) =>
        new UserAdminUseCases({
          unitOfWork,
          users,
          adminUsers,
          passwords,
          team,
          merchants,
          merchantProfiles,
          email,
          ids,
          clock,
          dashboardBaseUrl: config.auth.dashboardBaseUrl,
        }),
    },
  ],
  exports: [ACCESS_TOKEN_VERIFIER, USER_DIRECTORY],
})
export class IdentityAccessModule {}
