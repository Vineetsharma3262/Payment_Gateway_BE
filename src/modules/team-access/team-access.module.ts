import { Global, Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../config/configuration';
import {
  EMAIL_SENDER,
  type EmailSender,
} from '../../integrations/notifications/domain-ports/email-sender.port';
import { AUDIT_LOG, type AuditLog } from '../../shared/application/audit-log.port';
import { PERMISSION_CHECKER } from '../../shared/application/authorization.port';
import { CLOCK, type Clock } from '../../shared/application/clock.port';
import { ID_GENERATOR, type IdGenerator } from '../../shared/application/id-generator.port';
import { HASHER, type Hasher } from '../../shared/application/request-hash';
import {
  SECURE_TOKEN_GENERATOR,
  type SecureTokenGenerator,
} from '../../shared/application/secure-token.port';
import { UNIT_OF_WORK, type UnitOfWork } from '../../shared/application/unit-of-work.port';
import { USER_DIRECTORY, type UserDirectory } from '../identity-access/public-api';
import { TeamDirectoryService } from './application/team-directory.service';
import { TeamUseCases } from './application/team.use-cases';
import { roleCan } from './domain/roles';
import {
  INVITATION_REPOSITORY,
  MEMBERSHIP_REPOSITORY,
  type InvitationRepository,
  type MembershipRepository,
} from './domain/team.repositories';
import {
  PrismaInvitationRepository,
  PrismaMembershipRepository,
} from './infrastructure/prisma-team.repositories';
import { TeamController } from './presentation/team.controller';
import { TEAM_DIRECTORY } from './public-api';
import { TEAM_USE_CASES } from './team.tokens';

/** Global: PERMISSION_CHECKER and TEAM_DIRECTORY are consumed across contexts. */
@Global()
@Module({
  controllers: [TeamController],
  providers: [
    { provide: MEMBERSHIP_REPOSITORY, useClass: PrismaMembershipRepository },
    { provide: INVITATION_REPOSITORY, useClass: PrismaInvitationRepository },
    { provide: PERMISSION_CHECKER, useValue: { can: roleCan } },
    {
      provide: TEAM_DIRECTORY,
      inject: [MEMBERSHIP_REPOSITORY, INVITATION_REPOSITORY, ID_GENERATOR, CLOCK, HASHER],
      useFactory: (
        m: MembershipRepository,
        i: InvitationRepository,
        ids: IdGenerator,
        clock: Clock,
        hasher: Hasher,
      ) => new TeamDirectoryService(m, i, ids, clock, hasher),
    },
    {
      provide: TEAM_USE_CASES,
      inject: [
        UNIT_OF_WORK,
        MEMBERSHIP_REPOSITORY,
        INVITATION_REPOSITORY,
        USER_DIRECTORY,
        AUDIT_LOG,
        EMAIL_SENDER,
        SECURE_TOKEN_GENERATOR,
        HASHER,
        ID_GENERATOR,
        CLOCK,
        APP_CONFIG,
      ],
      useFactory: (
        unitOfWork: UnitOfWork,
        memberships: MembershipRepository,
        invitations: InvitationRepository,
        users: UserDirectory,
        audit: AuditLog,
        email: EmailSender,
        tokens: SecureTokenGenerator,
        hasher: Hasher,
        ids: IdGenerator,
        clock: Clock,
        config: AppConfig,
      ) =>
        new TeamUseCases({
          unitOfWork,
          memberships,
          invitations,
          users,
          audit,
          email,
          tokens,
          hasher,
          ids,
          clock,
          dashboardBaseUrl: config.auth.dashboardBaseUrl,
        }),
    },
  ],
  exports: [PERMISSION_CHECKER, TEAM_DIRECTORY],
})
export class TeamAccessModule {}
