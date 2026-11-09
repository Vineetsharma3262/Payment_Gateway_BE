import { ConflictError } from '../../../shared/application/application-error';
import { InvalidTokenError } from '../../../shared/application/authorization.port';
import { LoggingEmailSender } from '../../../integrations/notifications/adapters/logging-email-sender';
import { IdentityUseCases } from '../../../modules/identity-access/application/identity.use-cases';
import {
  AccountLockedError,
  InvalidCredentialsError,
  WeakPasswordError,
} from '../../../modules/identity-access/domain/identity.errors';
import { TeamDirectoryService } from '../../../modules/team-access/application/team-directory.service';
import { Invitation } from '../../../modules/team-access/domain/invitation';
import {
  FixedClock,
  PassThroughUnitOfWork,
  SequentialIdGenerator,
  testHasher,
} from '../../support/fakes';
import {
  FakeAccessTokens,
  FakePasswordHasher,
  InMemoryInvitations,
  InMemoryMemberships,
  InMemoryResetTokens,
  InMemorySessions,
  InMemoryUsers,
  RecordingAuditLog,
  SequentialTokens,
} from '../../support/platform-fakes';

const PASSWORD = 'correct horse battery staple';

function setup() {
  const clock = new FixedClock();
  const ids = new SequentialIdGenerator();
  const users = new InMemoryUsers();
  const sessions = new InMemorySessions();
  const resetTokens = new InMemoryResetTokens();
  const memberships = new InMemoryMemberships();
  const invitations = new InMemoryInvitations();
  const audit = new RecordingAuditLog();
  const email = new LoggingEmailSender();
  const team = new TeamDirectoryService(memberships, invitations, ids, clock, testHasher);
  const calls: string[] = [];
  const identity = new IdentityUseCases({
    unitOfWork: new PassThroughUnitOfWork(),
    users,
    sessions,
    resetTokens,
    passwords: new FakePasswordHasher(),
    accessTokens: new FakeAccessTokens(),
    tokens: new SequentialTokens(),
    hasher: testHasher,
    ids,
    clock,
    audit,
    email,
    team,
    merchants: {
      register: () => {
        calls.push('merchant.register');
        return Promise.resolve({ merchantId: 'mer_new' });
      },
    },
    merchantLifecycle: {
      enableLiveCharges: () => Promise.resolve(),
      ensureProviderAccount: () => {
        calls.push('merchant.provision_test');
        return Promise.reject(new Error('gateway down'));
      },
    },
    merchantPaymentProfiles: {
      getPaymentProfile: (merchantId: string) =>
        Promise.resolve({
          merchantId,
          status: 'onboarding' as const,
          liveChargesEnabled: false,
          providerAccounts: { test: null, live: null },
        }),
    },
    onboarding: {
      start: () => {
        calls.push('onboarding.start');
        return Promise.resolve();
      },
    },
    apiKeys: {
      issue: (i) => {
        calls.push(`api_key.${i.mode}`);
        return Promise.resolve({
          id: 'key_1',
          secret: 'sk_test_x',
          mode: i.mode,
          label: i.label,
          last4: 'abcd',
          createdAt: '',
        });
      },
    },
    refreshTokenTtlMs: 30 * 24 * 3600 * 1000,
    dashboardBaseUrl: 'https://dashboard.payco.test',
    onBackgroundError: (op) => calls.push(`background_error:${op}`),
  });
  return { identity, users, sessions, memberships, invitations, audit, email, clock, calls };
}

describe('Identity & Access', () => {
  describe('registration (PRD 5.3 step 1)', () => {
    it('creates user, merchant, owner membership, onboarding draft and a test key in one unit of work', async () => {
      const { identity, memberships, calls, audit } = setup();
      const result = await identity.register({
        email: 'Owner@Example.com',
        password: PASSWORD,
        businessName: 'Acme',
      });

      expect(result.user.email).toBe('owner@example.com');
      expect(result.merchant).toEqual({ id: 'mer_new', role: 'owner', status: 'onboarding' });
      expect(result.audience).toBe('merchant_onboarding');
      expect(result.homePath).toBe('/onboarding');
      expect(result.testApiKey.mode).toBe('test');
      expect([...memberships.rows.values()]).toEqual([
        expect.objectContaining({ role: 'owner', merchantId: 'mer_new' }),
      ]);
      expect(calls).toEqual(
        expect.arrayContaining(['merchant.register', 'onboarding.start', 'api_key.test']),
      );
      expect(audit.actions()).toContain('identity.registered');
    });

    it('treats sandbox account provisioning as best-effort', async () => {
      const { identity, calls } = setup();
      await expect(
        identity.register({ email: 'a@b.co', password: PASSWORD, businessName: 'Acme' }),
      ).resolves.toBeDefined();
      expect(calls).toContain('background_error:merchant.provision_test_account');
    });

    it('rejects duplicate emails and weak passwords', async () => {
      const { identity } = setup();
      await identity.register({ email: 'a@b.co', password: PASSWORD, businessName: 'Acme' });
      await expect(
        identity.register({ email: 'A@B.co', password: PASSWORD, businessName: 'X' }),
      ).rejects.toBeInstanceOf(ConflictError);
      await expect(
        identity.register({ email: 'c@d.co', password: 'short', businessName: 'X' }),
      ).rejects.toBeInstanceOf(WeakPasswordError);
      await expect(
        identity.register({
          email: 'longname@d.co',
          password: 'my-longname-password',
          businessName: 'X',
        }),
      ).rejects.toBeInstanceOf(WeakPasswordError);
    });
  });

  describe('login', () => {
    it('returns the same error for unknown email and wrong password', async () => {
      const { identity } = setup();
      await identity.register({ email: 'a@b.co', password: PASSWORD, businessName: 'Acme' });
      await expect(
        identity.login({ email: 'nobody@b.co', password: PASSWORD }),
      ).rejects.toBeInstanceOf(InvalidCredentialsError);
      await expect(
        identity.login({ email: 'a@b.co', password: 'wrong password!!' }),
      ).rejects.toBeInstanceOf(InvalidCredentialsError);
      await expect(identity.login({ email: 'a@b.co', password: PASSWORD })).resolves.toMatchObject({
        merchant: { id: 'mer_new' },
      });
    });

    it('locks the account after 5 failures for 15 minutes', async () => {
      const { identity, clock } = setup();
      await identity.register({ email: 'a@b.co', password: PASSWORD, businessName: 'Acme' });
      for (let i = 0; i < 5; i++) {
        await expect(
          identity.login({ email: 'a@b.co', password: 'nope-nope-nope' }),
        ).rejects.toBeInstanceOf(InvalidCredentialsError);
      }
      await expect(identity.login({ email: 'a@b.co', password: PASSWORD })).rejects.toBeInstanceOf(
        AccountLockedError,
      );
      clock.advance(15 * 60 * 1000 + 1);
      await expect(identity.login({ email: 'a@b.co', password: PASSWORD })).resolves.toBeDefined();
    });
  });

  describe('refresh-token rotation', () => {
    it('rotates on use and revokes the whole session family when a used token is replayed', async () => {
      const { identity, sessions } = setup();
      const first = await identity.register({
        email: 'a@b.co',
        password: PASSWORD,
        businessName: 'Acme',
      });
      const second = await identity.refresh(first.refreshToken);
      expect(second.refreshToken).not.toBe(first.refreshToken);

      await expect(identity.refresh(first.refreshToken)).rejects.toBeInstanceOf(InvalidTokenError); // replay
      await expect(identity.refresh(second.refreshToken)).rejects.toBeInstanceOf(InvalidTokenError); // family revoked
      const familyIds = new Set([...sessions.rows.values()].map((r) => r.familyId));
      expect(familyIds.size).toBe(1);
      expect([...sessions.rows.values()].every((r) => r.revokedAt)).toBe(true);
    });

    it('expires refresh tokens', async () => {
      const { identity, clock } = setup();
      const s = await identity.register({
        email: 'a@b.co',
        password: PASSWORD,
        businessName: 'Acme',
      });
      clock.advance(31 * 24 * 3600 * 1000);
      await expect(identity.refresh(s.refreshToken)).rejects.toBeInstanceOf(InvalidTokenError);
    });

    it('logout revokes the session family', async () => {
      const { identity } = setup();
      const s = await identity.register({
        email: 'a@b.co',
        password: PASSWORD,
        businessName: 'Acme',
      });
      await identity.logout(s.refreshToken);
      await expect(identity.refresh(s.refreshToken)).rejects.toBeInstanceOf(InvalidTokenError);
    });
  });

  describe('password reset', () => {
    it('does not reveal whether an account exists', async () => {
      const { identity, email } = setup();
      await expect(identity.requestPasswordReset('ghost@b.co')).resolves.toBeUndefined();
      expect(email.sent).toHaveLength(0);
    });

    it('resets with a single-use token and signs out every session', async () => {
      const { identity, email } = setup();
      const s = await identity.register({
        email: 'a@b.co',
        password: PASSWORD,
        businessName: 'Acme',
      });
      await identity.requestPasswordReset('a@b.co');
      const token = new URL(email.sent[0].variables.resetUrl).searchParams.get('token')!;

      await identity.resetPassword(token, 'a brand new passphrase');
      await expect(identity.resetPassword(token, 'another new passphrase')).rejects.toBeInstanceOf(
        InvalidTokenError,
      );
      await expect(identity.refresh(s.refreshToken)).rejects.toBeInstanceOf(InvalidTokenError);
      await expect(identity.login({ email: 'a@b.co', password: PASSWORD })).rejects.toBeInstanceOf(
        InvalidCredentialsError,
      );
      await expect(
        identity.login({ email: 'a@b.co', password: 'a brand new passphrase' }),
      ).resolves.toBeDefined();
    });
  });

  describe('invitation acceptance', () => {
    it('creates the account and membership, and refuses reuse of the token', async () => {
      const { identity, invitations, clock } = setup();
      const token = 'invitation-token-0000000000000000000000000000';
      await invitations.insert(
        Invitation.create({
          id: 'inv_1',
          merchantId: 'mer_team',
          email: 'dev@acme.co',
          role: 'developer',
          tokenHash: testHasher.sha256Hex(token),
          invitedByUserId: 'usr_owner',
          createdAt: clock.now(),
        }),
      );
      const session = await identity.acceptInvitation({ token, password: PASSWORD });
      expect(session.merchant).toEqual({
        id: 'mer_team',
        role: 'developer',
        status: 'onboarding',
      });
      await expect(identity.acceptInvitation({ token, password: PASSWORD })).rejects.toBeInstanceOf(
        InvalidTokenError,
      );
    });
  });
});
