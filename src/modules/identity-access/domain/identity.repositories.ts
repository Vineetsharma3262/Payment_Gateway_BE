import type { PasswordResetToken, RefreshSession } from './refresh-session';
import type { User } from './user';

export interface UserRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  findManyByIds(ids: readonly string[]): Promise<User[]>;
  insert(user: User): Promise<void>;
  /** Optimistic concurrency on `version`. */
  save(user: User): Promise<void>;
}

export interface SessionRepository {
  findByTokenHash(tokenHash: string): Promise<RefreshSession | null>;
  insert(session: RefreshSession): Promise<void>;
  /** Compare-and-set: true only for the first caller that rotates this token. */
  markRotated(id: string, now: Date): Promise<boolean>;
  revokeFamily(familyId: string, now: Date): Promise<void>;
  revokeAllForUser(userId: string, now: Date): Promise<void>;
  isFamilyActive(familyId: string, now: Date): Promise<boolean>;
}

export interface PasswordResetTokenRepository {
  findByTokenHash(tokenHash: string): Promise<PasswordResetToken | null>;
  insert(token: PasswordResetToken): Promise<void>;
  /** Compare-and-set: true only for the first use. */
  markUsed(id: string, now: Date): Promise<boolean>;
}

export const USER_REPOSITORY = Symbol('UserRepository');
export const SESSION_REPOSITORY = Symbol('SessionRepository');
export const PASSWORD_RESET_TOKEN_REPOSITORY = Symbol('PasswordResetTokenRepository');

/** Admin-side list filters for Users & Roles. Owned by the domain layer so
 *  application + infrastructure both depend on it. */
export interface AdminUserListFilters {
  search?: string;
  status?: 'active' | 'disabled' | 'invited';
  role?: 'super_admin' | 'admin' | 'staff' | 'merchant';
  page: number;
  pageSize: number;
}

export interface AdminUserListItem {
  user: User;
  merchant: { id: string; name: string } | null;
}

export interface AdminUserRepository {
  list(filters: AdminUserListFilters): Promise<{ items: AdminUserListItem[]; total: number }>;
  getById(id: string): Promise<AdminUserListItem | null>;
}

export const ADMIN_USER_REPOSITORY = Symbol('AdminUserRepository');
