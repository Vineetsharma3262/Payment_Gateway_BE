import type { Clock } from '../../../shared/application/clock.port';
import type { IdGenerator } from '../../../shared/application/id-generator.port';
import type { Hasher } from '../../../shared/application/request-hash';
import { Membership } from '../domain/membership';
import type { InvitationRepository, MembershipRepository } from '../domain/team.repositories';
import { InvitationNotUsableError } from '../domain/team.errors';
import type { MembershipSummary, PendingInvitation, TeamDirectory } from '../public-api';

export class TeamDirectoryService implements TeamDirectory {
  constructor(
    private readonly memberships: MembershipRepository,
    private readonly invitations: InvitationRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly hasher: Hasher,
  ) {}

  async membershipsOf(userId: string): Promise<MembershipSummary[]> {
    const rows = await this.memberships.findForUser(userId);
    return rows
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((m) => ({ membershipId: m.id, merchantId: m.merchantId, role: m.role }));
  }

  async addOwner(userId: string, merchantId: string): Promise<void> {
    await this.memberships.insert(
      Membership.create({
        id: this.ids.next('mem'),
        userId,
        merchantId,
        role: 'owner',
        createdAt: this.clock.now(),
      }),
    );
  }

  async findUsableInvitation(token: string): Promise<PendingInvitation | null> {
    const invitation = await this.invitations.findByTokenHash(this.hasher.sha256Hex(token));
    if (!invitation || !invitation.isUsable(this.clock.now())) return null;
    return {
      invitationId: invitation.id,
      merchantId: invitation.merchantId,
      email: invitation.email,
      role: invitation.role,
    };
  }

  async redeemInvitation(token: string, userId: string): Promise<MembershipSummary> {
    const now = this.clock.now();
    const invitation = await this.invitations.findByTokenHash(this.hasher.sha256Hex(token));
    if (!invitation) throw new InvitationNotUsableError();
    invitation.accept(now);
    await this.invitations.save(invitation);

    const existing = await this.memberships.findByUserAndMerchant(userId, invitation.merchantId);
    if (existing)
      return { membershipId: existing.id, merchantId: existing.merchantId, role: existing.role };
    const membership = Membership.create({
      id: this.ids.next('mem'),
      userId,
      merchantId: invitation.merchantId,
      role: invitation.role,
      createdAt: now,
    });
    await this.memberships.insert(membership);
    return {
      membershipId: membership.id,
      merchantId: membership.merchantId,
      role: membership.role,
    };
  }
}
