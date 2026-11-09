import { AggregateRoot } from '../../../shared/domain/aggregate-root';
import { AccountLockedError } from './identity.errors';

export const MAX_FAILED_LOGINS = 5;
export const LOCKOUT_MS = 15 * 60 * 1000;

/** Platform-side roles. Tenant users have `platformRole = null`. */
export type PlatformRole = 'super_admin' | 'admin' | 'staff';

/** Mirrors `src/config/access.ts` in the dashboard FE. */
export type Audience = 'admin' | 'staff' | 'merchant' | 'merchant_onboarding';

export const PLATFORM_ROLES: readonly PlatformRole[] = ['super_admin', 'admin', 'staff'];

export interface UserProps {
  id: string;
  email: string;
  name: string | null;
  passwordHash: string;
  status: 'active' | 'disabled';
  isPlatformAdmin: boolean;
  platformRole: PlatformRole | null;
  mustChangePassword: boolean;
  lastLoginAt: Date | null;
  emailVerifiedAt: Date | null;
  failedLoginCount: number;
  lockedUntil: Date | null;
  mfaEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

export class User extends AggregateRoot {
  private constructor(private props: UserProps) {
    super(props.id, props.version);
  }

  static register(params: {
    id: string;
    email: string;
    passwordHash: string;
    now: Date;
    name?: string;
    platformRole?: PlatformRole | null;
    mustChangePassword?: boolean;
  }): User {
    const platformRole = params.platformRole ?? null;
    const isPlatformAdmin = platformRole === 'super_admin' || platformRole === 'admin';
    return new User({
      id: params.id,
      email: params.email,
      name: params.name ?? null,
      passwordHash: params.passwordHash,
      status: 'active',
      isPlatformAdmin,
      platformRole,
      mustChangePassword: params.mustChangePassword ?? false,
      lastLoginAt: null,
      emailVerifiedAt: null,
      failedLoginCount: 0,
      lockedUntil: null,
      mfaEnabled: false,
      createdAt: params.now,
      updatedAt: params.now,
      version: 0,
    });
  }

  static rehydrate(props: UserProps): User {
    return new User({ ...props });
  }

  get email(): string {
    return this.props.email;
  }
  get passwordHash(): string {
    return this.props.passwordHash;
  }
  get isActive(): boolean {
    return this.props.status === 'active';
  }
  get isPlatformAdmin(): boolean {
    return this.props.isPlatformAdmin;
  }
  get platformRole(): PlatformRole | null {
    return this.props.platformRole;
  }
  /** True for every platform user, including staff. */
  get isPlatformUser(): boolean {
    return this.props.platformRole !== null;
  }
  get name(): string | null {
    return this.props.name;
  }
  get mustChangePassword(): boolean {
    return this.props.mustChangePassword;
  }
  get lastLoginAt(): Date | null {
    return this.props.lastLoginAt;
  }
  get status(): 'active' | 'disabled' {
    return this.props.status;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }

  setStatus(status: 'active' | 'disabled', now: Date): void {
    this.props.status = status;
    this.props.updatedAt = now;
    if (status === 'active') {
      this.props.failedLoginCount = 0;
      this.props.lockedUntil = null;
    }
  }

  resetPasswordByAdmin(passwordHash: string, now: Date): void {
    this.props.passwordHash = passwordHash;
    this.props.mustChangePassword = true;
    this.props.failedLoginCount = 0;
    this.props.lockedUntil = null;
    this.props.updatedAt = now;
  }

  assertNotLocked(now: Date): void {
    if (this.props.lockedUntil && this.props.lockedUntil > now)
      throw new AccountLockedError(this.props.lockedUntil);
  }

  recordFailedLogin(now: Date): void {
    if (this.props.lockedUntil && this.props.lockedUntil <= now) this.props.failedLoginCount = 0;
    this.props.failedLoginCount += 1;
    if (this.props.failedLoginCount >= MAX_FAILED_LOGINS) {
      this.props.lockedUntil = new Date(now.getTime() + LOCKOUT_MS);
    }
    this.props.updatedAt = now;
  }

  recordSuccessfulLogin(now: Date): void {
    this.props.failedLoginCount = 0;
    this.props.lockedUntil = null;
    this.props.lastLoginAt = now;
    this.props.updatedAt = now;
  }

  changePassword(passwordHash: string, now: Date): void {
    this.props.passwordHash = passwordHash;
    this.props.mustChangePassword = false;
    this.props.failedLoginCount = 0;
    this.props.lockedUntil = null;
    this.props.updatedAt = now;
  }

  toProps(): UserProps {
    return { ...this.props, version: this.version };
  }
}
