/** Published contract of the Team Access context (framework-free). */
export type { Role, InvitableRole } from './domain/roles';

export interface MembershipSummary {
  membershipId: string;
  merchantId: string;
  role: string;
}

export interface PendingInvitation {
  invitationId: string;
  merchantId: string;
  email: string;
  role: string;
}

export interface TeamDirectory {
  /** The user's merchant workspaces (first is the default session workspace). */
  membershipsOf(userId: string): Promise<MembershipSummary[]>;
  addOwner(userId: string, merchantId: string): Promise<void>;
  /** Resolves a presented invitation token (hashed internally); null if unusable. */
  findUsableInvitation(token: string): Promise<PendingInvitation | null>;
  /** Marks the invitation accepted and creates the membership. Call inside a unit of work. */
  redeemInvitation(token: string, userId: string): Promise<MembershipSummary>;
}

export const TEAM_DIRECTORY = Symbol('TeamDirectory');
