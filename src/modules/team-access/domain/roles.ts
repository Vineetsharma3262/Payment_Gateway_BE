import type { Permission } from '../../../shared/domain/permissions';

export const ROLES = ['owner', 'admin', 'developer', 'finance', 'support', 'viewer'] as const;
export type Role = (typeof ROLES)[number];
/** `owner` is granted at signup only; it cannot be handed out through invitations. */
export const INVITABLE_ROLES = ['admin', 'developer', 'finance', 'support', 'viewer'] as const;
export type InvitableRole = (typeof INVITABLE_ROLES)[number];

const READ_ONLY: Permission[] = [
  'merchant:read',
  'team:read',
  'onboarding:read',
  'payments:read',
  'settlements:read',
  'reports:read',
];

/**
 * Least privilege by default. Money-moving permissions (refunds, payouts) and
 * payout approval are separated so creation and approval can be split
 * between people (PRD 5.2 approval workflows).
 */
export const ROLE_PERMISSIONS: Readonly<Record<Role, readonly Permission[]>> = {
  owner: [
    ...READ_ONLY,
    'merchant:write',
    'team:manage',
    'onboarding:write',
    'api_keys:read',
    'api_keys:write',
    'developers:read',
    'webhooks:manage',
    'refunds:create',
    'payment_links:manage',
    'payouts:create',
    'payouts:approve',
    'disputes:manage',
  ],
  admin: [
    ...READ_ONLY,
    'merchant:write',
    'team:manage',
    'onboarding:write',
    'api_keys:read',
    'api_keys:write',
    'developers:read',
    'webhooks:manage',
    'refunds:create',
    'payment_links:manage',
    'payouts:create',
    'disputes:manage',
  ],
  developer: [
    ...READ_ONLY,
    'api_keys:read',
    'api_keys:write',
    'developers:read',
    'webhooks:manage',
  ],
  finance: [...READ_ONLY, 'refunds:create', 'payouts:create', 'payouts:approve'],
  support: [...READ_ONLY, 'refunds:create', 'disputes:manage', 'payment_links:manage'],
  viewer: READ_ONLY,
};

export function isRole(value: string | null): value is Role {
  return value !== null && (ROLES as readonly string[]).includes(value);
}

export function roleCan(role: string | null, permission: Permission): boolean {
  return isRole(role) && ROLE_PERMISSIONS[role].includes(permission);
}
