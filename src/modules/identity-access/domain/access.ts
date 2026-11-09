/**
 * Who can open which part of the dashboard. Single source for post-login
 * redirects, navigation filtering and the API-side route guard. Mirrors
 * `src/config/access.ts` in the Nimbus dashboard FE — any change there must
 * be reflected here (and vice versa) because the backend is the authoritative
 * enforcement point.
 */
import type { Audience, PlatformRole } from './user';

export type { Audience } from './user';

export type MerchantAccountStatus = 'onboarding' | 'active' | 'suspended' | 'closed' | null;

/**
 * Decide a user's audience from (platformRole, selected merchant status).
 *
 *   platformRole = 'super_admin' | 'admin' → admin
 *   platformRole = 'staff'                 → staff
 *   tenant user, merchant.status = 'active' → merchant
 *   tenant user, otherwise                  → merchant_onboarding
 */
export function audienceFor(
  platformRole: PlatformRole | null,
  merchantStatus: MerchantAccountStatus,
): Audience {
  if (platformRole === 'super_admin' || platformRole === 'admin') return 'admin';
  if (platformRole === 'staff') return 'staff';
  if (merchantStatus === 'active') return 'merchant';
  return 'merchant_onboarding';
}

/** Where each audience lands after sign-in or when a page is off-limits. */
export function homePathFor(audience: Audience): string {
  return audience === 'merchant_onboarding' ? '/onboarding' : '/dashboard';
}

/** Scope groups kept short so new routes slot into the right one. */
const PLATFORM = ['admin', 'staff'] as const;
const ACTIVE = ['admin', 'staff', 'merchant'] as const;
const ADMIN = ['admin'] as const;
const MERCHANT = ['merchant'] as const;

/** Path prefix → audiences allowed. The longest matching prefix wins. */
export const ROUTE_ACCESS: readonly (readonly [string, readonly Audience[]])[] = [
  ['/onboarding', ['merchant_onboarding', 'merchant']],
  ['/dashboard', ACTIVE],
  ['/transactions', ACTIVE],
  ['/payments', ACTIVE],
  ['/refunds', ACTIVE],
  ['/customers', ACTIVE],
  ['/settlements', ACTIVE],
  ['/reports', ACTIVE],
  ['/payment-links', MERCHANT],
  ['/developers', MERCHANT],
  ['/settings', MERCHANT],
  ['/payouts', PLATFORM],
  ['/merchants', PLATFORM],
  ['/merchants/limits', ADMIN],
  ['/banks', ADMIN],
  ['/blocking', ADMIN],
  ['/routing', ADMIN],
  ['/error-settings', ADMIN],
  ['/users', ADMIN],
];

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/** Paths with no rule are allowed. Every app section has a rule. */
export function canAccessPath(audience: Audience, pathname: string): boolean {
  const path = pathname.split('?')[0] ?? pathname;
  let best: (typeof ROUTE_ACCESS)[number] | undefined;
  for (const rule of ROUTE_ACCESS) {
    if (matchesPrefix(path, rule[0]) && (!best || rule[0].length > best[0].length)) best = rule;
  }
  return best ? best[1].includes(audience) : true;
}

/* ────────────────────────────── Navigation ───────────────────────────── */

export interface NavLink {
  readonly title: string;
  readonly href: string;
  readonly icon?: string;
}
export interface NavGroup {
  readonly title: string;
  readonly icon?: string;
  readonly children: readonly NavLink[];
}
export type NavEntry = NavLink | NavGroup;
export interface NavSection {
  readonly title: string;
  readonly items: readonly NavEntry[];
}

export function isNavGroup(entry: NavEntry): entry is NavGroup {
  return 'children' in entry;
}

/** The full sidebar, matching the dashboard FE's `src/config/navigation.ts`. */
export const DASHBOARD_NAVIGATION: readonly NavSection[] = [
  {
    title: 'Get started',
    items: [{ title: 'Onboarding', href: '/onboarding', icon: 'ClipboardCheck' }],
  },
  {
    title: 'Overview',
    items: [{ title: 'Dashboard', href: '/dashboard', icon: 'LayoutDashboard' }],
  },
  {
    title: 'Payments',
    items: [
      { title: 'Transactions', href: '/transactions', icon: 'ArrowLeftRight' },
      { title: 'Payments', href: '/payments', icon: 'CreditCard' },
      { title: 'Payment links', href: '/payment-links', icon: 'Link2' },
      { title: 'Refunds', href: '/refunds', icon: 'Undo2' },
      { title: 'Customers', href: '/customers', icon: 'Users' },
    ],
  },
  {
    title: 'Finance',
    items: [
      {
        title: 'Settlement',
        icon: 'BadgeIndianRupee',
        children: [
          { title: 'Overview', href: '/settlements' },
          { title: 'Settlement Settings', href: '/settlements/settings' },
          { title: 'Settlement Report', href: '/settlements/report' },
        ],
      },
      {
        title: 'Payouts',
        icon: 'HandCoins',
        children: [
          { title: 'Dashboard', href: '/payouts' },
          { title: 'Report', href: '/payouts/report' },
          { title: 'Analytic report', href: '/payouts/analytics' },
        ],
      },
      { title: 'Reports', href: '/reports', icon: 'FileText' },
    ],
  },
  {
    title: 'Network',
    items: [
      {
        title: 'Merchants',
        icon: 'Store',
        children: [
          { title: 'Details', href: '/merchants' },
          { title: 'Limits/Charges', href: '/merchants/limits' },
        ],
      },
      {
        title: 'Banks & MIDs',
        icon: 'Landmark',
        children: [
          { title: 'All banks', href: '/banks' },
          { title: 'Global MID limits', href: '/banks/mid-limits' },
        ],
      },
    ],
  },
  {
    title: 'Risk & routing',
    items: [
      {
        title: 'Global blocking',
        icon: 'ShieldBan',
        children: [
          { title: 'MID', href: '/blocking/mid' },
          { title: 'BIN', href: '/blocking/bin' },
          { title: 'Card', href: '/blocking/card' },
          { title: 'Customer profile', href: '/blocking/customer-profile' },
          { title: 'Country', href: '/blocking/country' },
          { title: 'IP', href: '/blocking/ip' },
        ],
      },
      {
        title: 'Rule engine',
        icon: 'Workflow',
        children: [
          { title: 'Rule based routing', href: '/routing/rules' },
          { title: 'Rule category', href: '/routing/categories' },
          { title: 'Smart retry', href: '/routing/smart-retry' },
          { title: 'Cascading', href: '/routing/cascading' },
        ],
      },
      {
        title: 'Error settings',
        icon: 'Ban',
        children: [
          { title: 'Error code mapping', href: '/error-settings/code-mapping' },
          { title: 'Error code action', href: '/error-settings/code-action' },
          { title: 'Blocking action', href: '/error-settings/blocking-action' },
          { title: 'Error category', href: '/error-settings/category' },
        ],
      },
    ],
  },
  {
    title: 'Configure',
    items: [
      { title: 'Developers', href: '/developers', icon: 'Code2' },
      { title: 'Settings', href: '/settings', icon: 'Settings' },
      { title: 'Users & roles', href: '/users', icon: 'UserCog' },
    ],
  },
];

/** Prune sections / groups / links the audience can't access. */
export function navigationFor(audience: Audience): NavSection[] {
  const sections: NavSection[] = [];
  for (const section of DASHBOARD_NAVIGATION) {
    const items: NavEntry[] = [];
    for (const entry of section.items) {
      if (isNavGroup(entry)) {
        const children = entry.children.filter((c) => canAccessPath(audience, c.href));
        if (children.length > 0) items.push({ ...entry, children });
      } else if (canAccessPath(audience, entry.href)) {
        items.push(entry);
      }
    }
    if (items.length > 0) sections.push({ ...section, items });
  }
  return sections;
}
