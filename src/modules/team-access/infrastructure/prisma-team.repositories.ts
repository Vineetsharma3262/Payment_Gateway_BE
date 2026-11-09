import { Injectable } from '@nestjs/common';
import type { Invitation as InvitationRow, Membership as MembershipRow } from '@prisma/client';
import { TransactionHost } from '../../../shared/infrastructure/database/transaction-host';
import { Invitation } from '../domain/invitation';
import { Membership } from '../domain/membership';
import type { InvitableRole, Role } from '../domain/roles';
import type { InvitationRepository, MembershipRepository } from '../domain/team.repositories';

const toMembership = (r: MembershipRow) => Membership.rehydrate({ ...r, role: r.role as Role });
const toInvitation = (r: InvitationRow) =>
  Invitation.rehydrate({ ...r, role: r.role as InvitableRole });

@Injectable()
export class PrismaMembershipRepository implements MembershipRepository {
  constructor(private readonly host: TransactionHost) {}

  async findById(merchantId: string, id: string): Promise<Membership | null> {
    const row = await this.host.client.membership.findFirst({ where: { id, merchantId } });
    return row ? toMembership(row) : null;
  }
  async findForUser(userId: string): Promise<Membership[]> {
    return (await this.host.client.membership.findMany({ where: { userId } })).map(toMembership);
  }
  async findByUserAndMerchant(userId: string, merchantId: string): Promise<Membership | null> {
    const row = await this.host.client.membership.findUnique({
      where: { userId_merchantId: { userId, merchantId } },
    });
    return row ? toMembership(row) : null;
  }
  async listForMerchant(merchantId: string): Promise<Membership[]> {
    const rows = await this.host.client.membership.findMany({
      where: { merchantId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toMembership);
  }
  countOwners(merchantId: string): Promise<number> {
    return this.host.client.membership.count({ where: { merchantId, role: 'owner' } });
  }
  async insert(membership: Membership): Promise<void> {
    await this.host.client.membership.create({ data: membership.toProps() });
  }
  async save(membership: Membership): Promise<void> {
    const { id, merchantId, role, updatedAt } = membership.toProps();
    await this.host.client.membership.updateMany({
      where: { id, merchantId },
      data: { role, updatedAt },
    });
  }
}

@Injectable()
export class PrismaInvitationRepository implements InvitationRepository {
  constructor(private readonly host: TransactionHost) {}

  async findById(merchantId: string, id: string): Promise<Invitation | null> {
    const row = await this.host.client.invitation.findFirst({ where: { id, merchantId } });
    return row ? toInvitation(row) : null;
  }
  async findByTokenHash(tokenHash: string): Promise<Invitation | null> {
    const row = await this.host.client.invitation.findUnique({ where: { tokenHash } });
    return row ? toInvitation(row) : null;
  }
  async insert(invitation: Invitation): Promise<void> {
    await this.host.client.invitation.create({ data: invitation.toProps() });
  }
  async save(invitation: Invitation): Promise<void> {
    const { id, merchantId, acceptedAt, revokedAt } = invitation.toProps();
    await this.host.client.invitation.updateMany({
      where: { id, merchantId },
      data: { acceptedAt, revokedAt },
    });
  }
}
