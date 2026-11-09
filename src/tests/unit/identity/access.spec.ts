import {
  audienceFor,
  canAccessPath,
  homePathFor,
  navigationFor,
} from '../../../modules/identity-access/domain/access';

describe('access.ts (audience + navigation)', () => {
  describe('audienceFor', () => {
    it('maps platform roles to admin / staff', () => {
      expect(audienceFor('super_admin', null)).toBe('admin');
      expect(audienceFor('admin', null)).toBe('admin');
      expect(audienceFor('staff', null)).toBe('staff');
    });

    it('maps tenant users to merchant / merchant_onboarding by merchant status', () => {
      expect(audienceFor(null, 'active')).toBe('merchant');
      expect(audienceFor(null, 'onboarding')).toBe('merchant_onboarding');
      expect(audienceFor(null, 'suspended')).toBe('merchant_onboarding');
      expect(audienceFor(null, 'closed')).toBe('merchant_onboarding');
      expect(audienceFor(null, null)).toBe('merchant_onboarding');
    });

    it('platform role wins over merchant status', () => {
      expect(audienceFor('super_admin', 'active')).toBe('admin');
      expect(audienceFor('staff', 'onboarding')).toBe('staff');
    });
  });

  describe('homePathFor', () => {
    it('sends onboarding merchants to /onboarding and everyone else to /dashboard', () => {
      expect(homePathFor('admin')).toBe('/dashboard');
      expect(homePathFor('staff')).toBe('/dashboard');
      expect(homePathFor('merchant')).toBe('/dashboard');
      expect(homePathFor('merchant_onboarding')).toBe('/onboarding');
    });
  });

  describe('canAccessPath', () => {
    it('restricts /users, /banks, /blocking, /routing, /error-settings to admin only', () => {
      for (const path of ['/users', '/banks', '/blocking/bin', '/routing/rules', '/error-settings/category']) {
        expect(canAccessPath('admin', path)).toBe(true);
        expect(canAccessPath('staff', path)).toBe(false);
        expect(canAccessPath('merchant', path)).toBe(false);
      }
    });

    it('restricts /payouts and /merchants to platform (admin + staff)', () => {
      expect(canAccessPath('admin', '/payouts/analytics')).toBe(true);
      expect(canAccessPath('staff', '/payouts/analytics')).toBe(true);
      expect(canAccessPath('merchant', '/payouts/analytics')).toBe(false);
    });

    it('reserves /payment-links, /developers and /settings for merchant', () => {
      expect(canAccessPath('merchant', '/payment-links')).toBe(true);
      expect(canAccessPath('admin', '/payment-links')).toBe(false);
      expect(canAccessPath('merchant', '/developers')).toBe(true);
      expect(canAccessPath('staff', '/developers')).toBe(false);
    });

    it('lets merchants (not merchant_onboarding) open the shared pages', () => {
      expect(canAccessPath('merchant', '/transactions')).toBe(true);
      expect(canAccessPath('merchant', '/settlements')).toBe(true);
      expect(canAccessPath('merchant_onboarding', '/transactions')).toBe(false);
    });

    it('/onboarding is open to merchants and onboarding-merchants only', () => {
      expect(canAccessPath('merchant_onboarding', '/onboarding')).toBe(true);
      expect(canAccessPath('merchant', '/onboarding')).toBe(true);
      expect(canAccessPath('admin', '/onboarding')).toBe(false);
      expect(canAccessPath('staff', '/onboarding')).toBe(false);
    });
  });

  describe('navigationFor', () => {
    it('super admin sees Risk & routing, Network and Configure sections', () => {
      const nav = navigationFor('admin');
      const titles = nav.map((s) => s.title);
      expect(titles).toContain('Network');
      expect(titles).toContain('Risk & routing');
      expect(titles).toContain('Configure');
    });

    it('staff never sees admin-only groups', () => {
      const nav = navigationFor('staff');
      expect(nav.map((s) => s.title)).not.toContain('Risk & routing');
      expect(nav.map((s) => s.title)).not.toContain('Configure');
    });

    it('merchant sees Payments and Finance but not Network', () => {
      const nav = navigationFor('merchant');
      const titles = nav.map((s) => s.title);
      expect(titles).toContain('Payments');
      expect(titles).toContain('Finance');
      expect(titles).not.toContain('Network');
    });

    it('merchant_onboarding sees only Get started', () => {
      const nav = navigationFor('merchant_onboarding');
      expect(nav).toHaveLength(1);
      expect(nav[0]?.title).toBe('Get started');
    });
  });
});
