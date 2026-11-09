import type { Invitation } from './invitation';
import type { Membership } from './membership';

export interface MembershipRepository {
  findById(merchantId: string, id: string): Promise<Membership | null>;
  findForUser(userId: string): Promise<Membership[]>;
  findByUserAndMerchant(userId: string, merchantId: string): Promise<Membership | null>;
  listForMerchant(merchantId: string): Promise<Membership[]>;
  countOwners(merchantId: string): Promise<number>;
  insert(membership: Membership): Promise<void>;
  save(membership: Membership): Promise<void>;
}

export interface InvitationRepository {
  findById(merchantId: string, id: string): Promise<Invitation | null>;
  findByTokenHash(tokenHash: string): Promise<Invitation | null>;
  insert(invitation: Invitation): Promise<void>;
  save(invitation: Invitation): Promise<void>;
}

export const MEMBERSHIP_REPOSITORY = Symbol('MembershipRepository');
export const INVITATION_REPOSITORY = Symbol('InvitationRepository');
