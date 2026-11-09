import { Entity } from '../../../shared/domain/entity';

export type ApiKeyMode = 'test' | 'live';

export interface ApiKeyProps {
  id: string;
  merchantId: string;
  mode: ApiKeyMode;
  label: string;
  secretHash: string;
  last4: string;
  createdAt: Date;
  expiresAt: Date | null;
  revokedAt: Date | null;
}

/** A merchant's server-side secret key. Test keys are issued at signup; live keys after approval (PRD 5.3). */
export class ApiKey extends Entity {
  private constructor(private readonly props: ApiKeyProps) {
    super(props.id);
  }

  static issue(props: Omit<ApiKeyProps, 'revokedAt' | 'expiresAt'>): ApiKey {
    return new ApiKey({ ...props, expiresAt: null, revokedAt: null });
  }

  static rehydrate(props: ApiKeyProps): ApiKey {
    return new ApiKey({ ...props });
  }

  get merchantId(): string {
    return this.props.merchantId;
  }
  get mode(): ApiKeyMode {
    return this.props.mode;
  }
  get secretHash(): string {
    return this.props.secretHash;
  }

  isUsableAt(now: Date): boolean {
    if (this.props.revokedAt && this.props.revokedAt <= now) return false;
    if (this.props.expiresAt && this.props.expiresAt <= now) return false;
    return true;
  }

  /** Immediate by default; a future `at` supports rolling with an overlap window. */
  revoke(at: Date): void {
    if (!this.props.revokedAt || at < this.props.revokedAt) this.props.revokedAt = at;
  }

  toProps(): ApiKeyProps {
    return { ...this.props };
  }
}
