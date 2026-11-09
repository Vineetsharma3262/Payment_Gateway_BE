import { Entity } from '../../../shared/domain/entity';

/**
 * One refresh token. Tokens issued from the same login share a `familyId`.
 * Presenting a token that was already rotated or revoked is treated as theft
 * and revokes the whole family (refresh-token reuse detection).
 */
export interface RefreshSessionProps {
  id: string;
  userId: string;
  familyId: string;
  merchantId: string | null;
  tokenHash: string;
  expiresAt: Date;
  rotatedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}

export class RefreshSession extends Entity {
  private constructor(private readonly props: RefreshSessionProps) {
    super(props.id);
  }

  static issue(props: Omit<RefreshSessionProps, 'rotatedAt' | 'revokedAt'>): RefreshSession {
    return new RefreshSession({ ...props, rotatedAt: null, revokedAt: null });
  }

  static rehydrate(props: RefreshSessionProps): RefreshSession {
    return new RefreshSession({ ...props });
  }

  get userId(): string {
    return this.props.userId;
  }
  get familyId(): string {
    return this.props.familyId;
  }
  get merchantId(): string | null {
    return this.props.merchantId;
  }
  get expiresAt(): Date {
    return this.props.expiresAt;
  }

  /** Already used or revoked: presenting it again indicates replay. */
  isSpent(): boolean {
    return this.props.rotatedAt !== null || this.props.revokedAt !== null;
  }

  isExpired(now: Date): boolean {
    return this.props.expiresAt <= now;
  }

  toProps(): RefreshSessionProps {
    return { ...this.props };
  }
}

export class PasswordResetToken extends Entity {
  static readonly TTL_MS = 30 * 60 * 1000;

  private constructor(
    private readonly props: {
      id: string;
      userId: string;
      tokenHash: string;
      expiresAt: Date;
      usedAt: Date | null;
      createdAt: Date;
    },
  ) {
    super(props.id);
  }

  static issue(params: {
    id: string;
    userId: string;
    tokenHash: string;
    now: Date;
  }): PasswordResetToken {
    return new PasswordResetToken({
      id: params.id,
      userId: params.userId,
      tokenHash: params.tokenHash,
      expiresAt: new Date(params.now.getTime() + PasswordResetToken.TTL_MS),
      usedAt: null,
      createdAt: params.now,
    });
  }

  static rehydrate(props: PasswordResetToken['props']): PasswordResetToken {
    return new PasswordResetToken({ ...props });
  }

  get userId(): string {
    return this.props.userId;
  }
  get expiresAt(): Date {
    return this.props.expiresAt;
  }

  isUsable(now: Date): boolean {
    return this.props.usedAt === null && this.props.expiresAt > now;
  }

  toProps() {
    return { ...this.props };
  }
}
