import { Injectable } from '@nestjs/common';
import type { User as UserRow } from '@prisma/client';
import { ConcurrencyConflictError } from '../../../shared/application/application-error';
import { TransactionHost } from '../../../shared/infrastructure/database/transaction-host';
import type {
  AdminUserListFilters,
  AdminUserListItem,
  AdminUserRepository,
  PasswordResetTokenRepository,
  SessionRepository,
  UserRepository,
} from '../domain/identity.repositories';
import { PasswordResetToken, RefreshSession } from '../domain/refresh-session';
import type { PlatformRole } from '../domain/user';
import { User } from '../domain/user';

const toUser = (r: UserRow) =>
  User.rehydrate({
    ...r,
    status: r.status as 'active' | 'disabled',
    platformRole: (r.platformRole ?? null) as PlatformRole | null,
  });

@Injectable()
export class PrismaUserRepository implements UserRepository {
  constructor(private readonly host: TransactionHost) {}

  async findById(id: string): Promise<User | null> {
    const row = await this.host.client.user.findUnique({ where: { id } });
    return row ? toUser(row) : null;
  }
  async findByEmail(email: string): Promise<User | null> {
    const row = await this.host.client.user.findUnique({ where: { email } });
    return row ? toUser(row) : null;
  }
  async findManyByIds(ids: readonly string[]): Promise<User[]> {
    return (await this.host.client.user.findMany({ where: { id: { in: [...ids] } } })).map(toUser);
  }
  async insert(user: User): Promise<void> {
    await this.host.client.user.create({ data: { ...user.toProps(), version: 0 } });
    user.markPersisted(0);
  }
  async save(user: User): Promise<void> {
    const { id, version, ...data } = user.toProps();
    const result = await this.host.client.user.updateMany({
      where: { id, version },
      data: { ...data, version: version + 1 },
    });
    if (result.count !== 1) throw new ConcurrencyConflictError('user', id);
    user.markPersisted(version + 1);
  }
}

@Injectable()
export class PrismaSessionRepository implements SessionRepository {
  constructor(private readonly host: TransactionHost) {}

  async findByTokenHash(tokenHash: string): Promise<RefreshSession | null> {
    const row = await this.host.client.session.findUnique({ where: { tokenHash } });
    return row ? RefreshSession.rehydrate(row) : null;
  }
  async insert(session: RefreshSession): Promise<void> {
    await this.host.client.session.create({ data: session.toProps() });
  }
  async markRotated(id: string, now: Date): Promise<boolean> {
    const r = await this.host.client.session.updateMany({
      where: { id, rotatedAt: null, revokedAt: null },
      data: { rotatedAt: now },
    });
    return r.count === 1;
  }
  async revokeFamily(familyId: string, now: Date): Promise<void> {
    await this.host.client.session.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: now },
    });
  }
  async revokeAllForUser(userId: string, now: Date): Promise<void> {
    await this.host.client.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: now },
    });
  }
  async isFamilyActive(familyId: string, now: Date): Promise<boolean> {
    const count = await this.host.client.session.count({
      where: { familyId, revokedAt: null, expiresAt: { gt: now } },
    });
    return count > 0;
  }
}

@Injectable()
export class PrismaPasswordResetTokenRepository implements PasswordResetTokenRepository {
  constructor(private readonly host: TransactionHost) {}

  async findByTokenHash(tokenHash: string): Promise<PasswordResetToken | null> {
    const row = await this.host.client.passwordResetToken.findUnique({ where: { tokenHash } });
    return row ? PasswordResetToken.rehydrate(row) : null;
  }
  async insert(token: PasswordResetToken): Promise<void> {
    await this.host.client.passwordResetToken.create({ data: token.toProps() });
  }
  async markUsed(id: string, now: Date): Promise<boolean> {
    const r = await this.host.client.passwordResetToken.updateMany({
      where: { id, usedAt: null },
      data: { usedAt: now },
    });
    return r.count === 1;
  }
}

@Injectable()
export class PrismaAdminUserRepository implements AdminUserRepository {
  constructor(private readonly host: TransactionHost) {}

  async list(f: AdminUserListFilters): Promise<{ items: AdminUserListItem[]; total: number }> {
    // Build a Prisma `where`. Role filter maps to platform_role OR membership
    // existence depending on the choice.
    //
    //   super_admin | admin | staff → platform_role = <value>
    //   merchant                    → platform_role IS NULL AND has memberships
    //
    // Status `invited` is derived: active + mustChangePassword + never signed in.
    const where: Record<string, unknown> = {};
    const AND: Record<string, unknown>[] = [];

    if (f.search) {
      AND.push({
        OR: [
          { email: { contains: f.search, mode: 'insensitive' } },
          { name: { contains: f.search, mode: 'insensitive' } },
          { memberships: { some: { merchant: { displayName: { contains: f.search, mode: 'insensitive' } } } } },
        ],
      });
    }
    if (f.role === 'merchant') {
      AND.push({ platformRole: null, memberships: { some: {} } });
    } else if (f.role) {
      AND.push({ platformRole: f.role });
    }
    if (f.status === 'active') {
      AND.push({ status: 'active', OR: [{ mustChangePassword: false }, { lastLoginAt: { not: null } }] });
    } else if (f.status === 'disabled') {
      AND.push({ status: 'disabled' });
    } else if (f.status === 'invited') {
      AND.push({ status: 'active', mustChangePassword: true, lastLoginAt: null });
    }
    if (AND.length > 0) where.AND = AND;

    const [rows, total] = await Promise.all([
      this.host.client.user.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        skip: (f.page - 1) * f.pageSize,
        take: f.pageSize,
        include: {
          memberships: {
            take: 1,
            orderBy: { createdAt: 'asc' },
            include: { merchant: { select: { id: true, displayName: true } } },
          },
        },
      }),
      this.host.client.user.count({ where }),
    ]);

    const items: AdminUserListItem[] = rows.map((r) => ({
      user: toUser(r),
      merchant: r.memberships[0]?.merchant
        ? { id: r.memberships[0].merchant.id, name: r.memberships[0].merchant.displayName }
        : null,
    }));
    return { items, total };
  }

  async getById(id: string): Promise<AdminUserListItem | null> {
    const row = await this.host.client.user.findUnique({
      where: { id },
      include: {
        memberships: {
          take: 1,
          orderBy: { createdAt: 'asc' },
          include: { merchant: { select: { id: true, displayName: true } } },
        },
      },
    });
    if (!row) return null;
    return {
      user: toUser(row),
      merchant: row.memberships[0]?.merchant
        ? { id: row.memberships[0].merchant.id, name: row.memberships[0].merchant.displayName }
        : null,
    };
  }
}
