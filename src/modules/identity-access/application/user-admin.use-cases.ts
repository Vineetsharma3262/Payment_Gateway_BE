/**
 * Admin-side user management for the dashboard's `/users` page. Scoped to
 * platform admins; see `UsersAdminController` for the HTTP surface.
 *
 * The underlying `User` row + optional first `Membership` is the system of
 * record. "Role" in this context collapses three concepts:
 *   platform_role = 'super_admin' | 'admin' | 'staff'  → platform user
 *   platform_role = null  + membership                  → merchant user
 */
import type { Clock } from '../../../shared/application/clock.port';
import type { IdGenerator } from '../../../shared/application/id-generator.port';
import type { UnitOfWork } from '../../../shared/application/unit-of-work.port';
import {
  ConflictError,
  ResourceNotFoundError,
} from '../../../shared/application/application-error';

/** Local validation helper used until the shared `ValidationError` lands. */
class ValidationError extends ConflictError {}
import type { EmailSender } from '../../../integrations/notifications/domain-ports/email-sender.port';
import type { MerchantRegistrar, MerchantPaymentProfileReader } from '../../merchants/public-api';
import type { TeamDirectory } from '../../team-access/public-api';
import { normalizeEmail } from '../domain/email';
import type { User } from '../domain/user';
import { User as UserAggregate, type PlatformRole } from '../domain/user';
import { assertAcceptablePassword } from '../domain/password-policy';
import type {
  AdminUserListFilters,
  AdminUserListItem,
  AdminUserRepository,
  UserRepository,
} from '../domain/identity.repositories';
import type { PasswordHasher } from './identity.ports';

export type AdminRole = 'admin' | 'staff' | 'merchant';
export type AdminStatus = 'active' | 'invited' | 'disabled';

export interface AdminUserListResult {
  items: AdminUserListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CreateAdminUserInput {
  name: string;
  email: string;
  role: AdminRole;
  merchantId?: string;
  password: string;
  sendLoginEmail: boolean;
  actorEmail: string;
}

export interface UserAdminDependencies {
  unitOfWork: UnitOfWork;
  users: UserRepository;
  adminUsers: AdminUserRepository;
  passwords: PasswordHasher;
  team: TeamDirectory;
  merchants: MerchantRegistrar;
  merchantProfiles: MerchantPaymentProfileReader;
  email: EmailSender;
  ids: IdGenerator;
  clock: Clock;
  dashboardBaseUrl: string;
}

/** Projection used by the controller DTO. */
export interface AdminUserDto {
  id: string;
  name: string;
  email: string;
  role: AdminRole | 'super_admin';
  merchant: { id: string; name: string } | null;
  status: AdminStatus;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export class UserAdminUseCases {
  constructor(private readonly deps: UserAdminDependencies) {}

  async list(filters: AdminUserListFilters): Promise<AdminUserListResult> {
    const result = await this.deps.adminUsers.list(filters);
    return {
      items: result.items,
      total: result.total,
      page: filters.page,
      pageSize: filters.pageSize,
    };
  }

  async create(input: CreateAdminUserInput): Promise<AdminUserListItem> {
    const email = normalizeEmail(input.email);
    assertAcceptablePassword(input.password, email);
    const name = input.name.trim();
    if (!name) throw new ValidationError('Name is required.');
    if (input.role === 'merchant' && !input.merchantId) {
      throw new ValidationError('Pick a merchant for merchant users.');
    }

    const passwordHash = await this.deps.passwords.hash(input.password);
    const now = this.deps.clock.now();

    const createdUser = await this.deps.unitOfWork.run(async () => {
      if (await this.deps.users.findByEmail(email)) {
        throw new ConflictError('An account with this email already exists.');
      }
      const platformRole: PlatformRole | null =
        input.role === 'merchant' ? null : input.role;
      const user = UserAggregate.register({
        id: this.deps.ids.next('usr'),
        email,
        name,
        passwordHash,
        now,
        platformRole,
        mustChangePassword: true,
      });
      await this.deps.users.insert(user);
      if (input.role === 'merchant' && input.merchantId) {
        await this.deps.team.addOwner(user.id, input.merchantId);
      }
      return user;
    });

    if (input.sendLoginEmail) {
      await this.sendInvitationEmail({
        user: createdUser,
        temporaryPassword: input.password,
        invitedBy: input.actorEmail,
      });
    }

    const persisted = await this.deps.adminUsers.getById(createdUser.id);
    if (!persisted) throw new ResourceNotFoundError('user', 'post-create readback failed');
    return persisted;
  }

  async setStatus(id: string, status: 'active' | 'disabled'): Promise<AdminUserListItem> {
    const now = this.deps.clock.now();
    await this.deps.unitOfWork.run(async () => {
      const user = await this.deps.users.findById(id);
      if (!user) throw new ResourceNotFoundError('user', id);
      if (user.platformRole === 'super_admin') {
        throw new ValidationError('The super admin account cannot be disabled.');
      }
      user.setStatus(status, now);
      await this.deps.users.save(user);
    });
    const refreshed = await this.deps.adminUsers.getById(id);
    if (!refreshed) throw new ResourceNotFoundError('user', id);
    return refreshed;
  }

  async resetPassword(
    id: string,
    input: { password: string; sendLoginEmail: boolean; actorEmail: string },
  ): Promise<AdminUserListItem> {
    const now = this.deps.clock.now();
    const user = await this.deps.users.findById(id);
    if (!user) throw new ResourceNotFoundError('user', id);
    if (user.platformRole === 'super_admin') {
      throw new ValidationError('The super admin password cannot be reset from here.');
    }
    assertAcceptablePassword(input.password, user.email);
    const passwordHash = await this.deps.passwords.hash(input.password);
    await this.deps.unitOfWork.run(async () => {
      user.resetPasswordByAdmin(passwordHash, now);
      await this.deps.users.save(user);
    });
    if (input.sendLoginEmail) {
      await this.sendInvitationEmail({
        user,
        temporaryPassword: input.password,
        invitedBy: input.actorEmail,
        reset: true,
      });
    }
    const refreshed = await this.deps.adminUsers.getById(id);
    if (!refreshed) throw new ResourceNotFoundError('user', id);
    return refreshed;
  }

  private async sendInvitationEmail(params: {
    user: User;
    temporaryPassword: string;
    invitedBy: string;
    reset?: boolean;
  }): Promise<void> {
    const name = params.user.name ?? params.user.email.split('@')[0] ?? 'there';
    await this.deps.email.send({
      to: params.user.email,
      template: params.reset ? 'user_password_reset' : 'user_invitation',
      variables: {
        brand: 'Nimbus',
        name,
        email: params.user.email,
        temporaryPassword: params.temporaryPassword,
        signInUrl: `${this.deps.dashboardBaseUrl}/login`,
        invitedBy: params.invitedBy,
      },
      idempotencyKey: `${params.reset ? 'reset' : 'invite'}:${params.user.id}:${Date.now()}`,
    });
  }

  /** Map an aggregate + merchant row to the FE DTO. */
  static toDto(item: AdminUserListItem): AdminUserDto {
    const u = item.user;
    const role: AdminRole | 'super_admin' = u.platformRole ?? 'merchant';
    const status: AdminStatus =
      u.status === 'disabled'
        ? 'disabled'
        : u.mustChangePassword && u.lastLoginAt === null
          ? 'invited'
          : 'active';
    return {
      id: u.id,
      name: u.name ?? u.email.split('@')[0] ?? u.email,
      email: u.email,
      role,
      merchant: item.merchant,
      status,
      mustChangePassword: u.mustChangePassword,
      lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
      createdAt: u.createdAt.toISOString(),
    };
  }
}

export const USER_ADMIN_USE_CASES = Symbol('UserAdminUseCases');
