import { Entity } from '../../../shared/domain/entity';
import type { InvitableRole } from './roles';
import { InvitationNotUsableError } from './team.errors';

export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface InvitationProps {
  id: string;
  merchantId: string;
  email: string;
  role: InvitableRole;
  tokenHash: string;
  invitedByUserId: string;
  expiresAt: Date;
  acceptedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}

export class Invitation extends Entity {
  private constructor(private props: InvitationProps) {
    super(props.id);
  }

  static create(
    params: Omit<InvitationProps, 'expiresAt' | 'acceptedAt' | 'revokedAt'>,
  ): Invitation {
    return new Invitation({
      ...params,
      email: params.email.trim().toLowerCase(),
      expiresAt: new Date(params.createdAt.getTime() + INVITATION_TTL_MS),
      acceptedAt: null,
      revokedAt: null,
    });
  }

  static rehydrate(props: InvitationProps): Invitation {
    return new Invitation({ ...props });
  }

  get merchantId(): string {
    return this.props.merchantId;
  }
  get email(): string {
    return this.props.email;
  }
  get role(): InvitableRole {
    return this.props.role;
  }

  isUsable(now: Date): boolean {
    return !this.props.acceptedAt && !this.props.revokedAt && this.props.expiresAt > now;
  }

  accept(now: Date): void {
    if (!this.isUsable(now)) throw new InvitationNotUsableError();
    this.props.acceptedAt = now;
  }

  revoke(now: Date): void {
    if (this.props.acceptedAt) throw new InvitationNotUsableError();
    this.props.revokedAt ??= now;
  }

  toProps(): InvitationProps {
    return { ...this.props };
  }
}
