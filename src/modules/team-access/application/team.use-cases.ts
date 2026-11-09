import {
  ConflictError,
  ResourceNotFoundError,
} from '../../../shared/application/application-error';
import type { AuditLog } from '../../../shared/application/audit-log.port';
import type { Clock } from '../../../shared/application/clock.port';
import type { IdGenerator } from '../../../shared/application/id-generator.port';
import type { Hasher } from '../../../shared/application/request-hash';
import type { SecureTokenGenerator } from '../../../shared/application/secure-token.port';
import type { UnitOfWork } from '../../../shared/application/unit-of-work.port';
import type { EmailSender } from '../../../integrations/notifications/domain-ports/email-sender.port';
import type { UserDirectory } from '../../identity-access/public-api';
import { Invitation } from '../domain/invitation';
import type { InvitableRole, Role } from '../domain/roles';
import { LastOwnerError } from '../domain/team.errors';
import type { InvitationRepository, MembershipRepository } from '../domain/team.repositories';

export interface TeamDependencies {
  unitOfWork: UnitOfWork;
  memberships: MembershipRepository;
  invitations: InvitationRepository;
  users: UserDirectory;
  audit: AuditLog;
  email: EmailSender;
  tokens: SecureTokenGenerator;
  hasher: Hasher;
  ids: IdGenerator;
  clock: Clock;
  dashboardBaseUrl: string;
}

export interface Actor {
  merchantId: string;
  userId: string;
}

export interface TeamMemberDto {
  membershipId: string;
  userId: string;
  email: string | null;
  role: Role;
  createdAt: string;
}

export class TeamUseCases {
  constructor(private readonly deps: TeamDependencies) {}

  async listMembers(actor: Actor): Promise<TeamMemberDto[]> {
    const members = await this.deps.memberships.listForMerchant(actor.merchantId);
    const emails = await this.deps.users.emailsOf(members.map((m) => m.userId));
    return members.map((m) => ({
      membershipId: m.id,
      userId: m.userId,
      email: emails.get(m.userId) ?? null,
      role: m.role,
      createdAt: m.createdAt.toISOString(),
    }));
  }

  /** The token is emailed, never returned in the API response or stored in plaintext. */
  async invite(
    actor: Actor,
    email: string,
    role: InvitableRole,
  ): Promise<{ invitationId: string; expiresAt: string }> {
    const token = this.deps.tokens.generate();
    const invitation = Invitation.create({
      id: this.deps.ids.next('inv'),
      merchantId: actor.merchantId,
      email,
      role,
      tokenHash: this.deps.hasher.sha256Hex(token),
      invitedByUserId: actor.userId,
      createdAt: this.deps.clock.now(),
    });
    await this.deps.unitOfWork.run(async () => {
      await this.deps.invitations.insert(invitation);
      await this.deps.audit.record({
        merchantId: actor.merchantId,
        actor: { type: 'user', id: actor.userId },
        action: 'team.invitation_created',
        resource: { type: 'invitation', id: invitation.id },
        metadata: { role },
      });
    });
    await this.deps.email.send({
      to: invitation.email,
      template: 'team_invitation',
      variables: {
        acceptUrl: `${this.deps.dashboardBaseUrl}/accept-invitation?token=${token}`,
        role,
      },
      idempotencyKey: invitation.id,
    });
    return { invitationId: invitation.id, expiresAt: invitation.toProps().expiresAt.toISOString() };
  }

  async revokeInvitation(actor: Actor, invitationId: string): Promise<void> {
    await this.deps.unitOfWork.run(async () => {
      const invitation = await this.deps.invitations.findById(actor.merchantId, invitationId);
      if (!invitation) throw new ResourceNotFoundError('invitation', invitationId);
      invitation.revoke(this.deps.clock.now());
      await this.deps.invitations.save(invitation);
      await this.deps.audit.record({
        merchantId: actor.merchantId,
        actor: { type: 'user', id: actor.userId },
        action: 'team.invitation_revoked',
        resource: { type: 'invitation', id: invitationId },
      });
    });
  }

  async changeRole(actor: Actor, membershipId: string, role: Role): Promise<void> {
    await this.deps.unitOfWork.run(async () => {
      const membership = await this.deps.memberships.findById(actor.merchantId, membershipId);
      if (!membership) throw new ResourceNotFoundError('membership', membershipId);
      if (membership.userId === actor.userId)
        throw new ConflictError('You cannot change your own role.');
      if (
        membership.role === 'owner' &&
        role !== 'owner' &&
        (await this.deps.memberships.countOwners(actor.merchantId)) <= 1
      ) {
        throw new LastOwnerError();
      }
      const previous = membership.role;
      membership.changeRole(role, this.deps.clock.now());
      await this.deps.memberships.save(membership);
      await this.deps.audit.record({
        merchantId: actor.merchantId,
        actor: { type: 'user', id: actor.userId },
        action: 'team.role_changed',
        resource: { type: 'membership', id: membershipId },
        metadata: { from: previous, to: role },
      });
    });
  }
}
