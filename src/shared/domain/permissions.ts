/**
 * Cross-cutting permission vocabulary. The role → permission mapping is owned
 * by the Team Access context and provided through PERMISSION_CHECKER.
 */
export const PERMISSIONS = [
  'merchant:read',
  'merchant:write',
  'team:read',
  'team:manage',
  'onboarding:read',
  'onboarding:write',
  'api_keys:read',
  'api_keys:write',
  'developers:read',
  'webhooks:manage',
  'payments:read',
  'refunds:create',
  'payment_links:manage',
  'settlements:read',
  'reports:read',
  'payouts:create',
  'payouts:approve',
  'disputes:manage',
] as const;
export type Permission = (typeof PERMISSIONS)[number];
