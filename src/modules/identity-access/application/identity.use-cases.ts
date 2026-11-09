import type { AuditLog } from '../../../shared/application/audit-log.port';
import type { Clock } from '../../../shared/application/clock.port';
import type { IdGenerator } from '../../../shared/application/id-generator.port';
import type { Hasher } from '../../../shared/application/request-hash';
import type { SecureTokenGenerator } from '../../../shared/application/secure-token.port';
import type { UnitOfWork } from '../../../shared/application/unit-of-work.port';
import { InvalidTokenError } from '../../../shared/application/authorization.port';
import { ConflictError, ForbiddenError } from '../../../shared/application/application-error';
import type { EmailSender } from '../../../integrations/notifications/domain-ports/email-sender.port';
import type { ApiKeyIssuer, IssuedApiKey } from '../../api-credentials/public-api';
import type {
  MerchantLifecycle,
  MerchantPaymentProfileReader,
  MerchantRegistrar,
} from '../../merchants/public-api';
import type { OnboardingStarter } from '../../merchant-onboarding/public-api';
import type { TeamDirectory } from '../../team-access/public-api';
import {
  type Audience,
  type MerchantAccountStatus,
  audienceFor,
  homePathFor,
  navigationFor,
  type NavSection,
} from '../domain/access';
import { normalizeEmail } from '../domain/email';
import { InvalidCredentialsError } from '../domain/identity.errors';
import type {
  PasswordResetTokenRepository,
  SessionRepository,
  UserRepository,
} from '../domain/identity.repositories';
import { assertAcceptablePassword } from '../domain/password-policy';
import { PasswordResetToken, RefreshSession } from '../domain/refresh-session';
import { User } from '../domain/user';
import type { PlatformRole } from '../domain/user';
import type { AccessTokenService, PasswordHasher } from './identity.ports';

export interface IdentityDependencies {
  unitOfWork: UnitOfWork;
  users: UserRepository;
  sessions: SessionRepository;
  resetTokens: PasswordResetTokenRepository;
  passwords: PasswordHasher;
  accessTokens: AccessTokenService;
  tokens: SecureTokenGenerator;
  hasher: Hasher;
  ids: IdGenerator;
  clock: Clock;
  audit: AuditLog;
  email: EmailSender;
  team: TeamDirectory;
  merchants: MerchantRegistrar;
  merchantLifecycle: MerchantLifecycle;
  /** Needed to decide audience (`merchant` vs `merchant_onboarding`). */
  merchantPaymentProfiles: MerchantPaymentProfileReader;
  onboarding: OnboardingStarter;
  apiKeys: ApiKeyIssuer;
  refreshTokenTtlMs: number;
  dashboardBaseUrl: string;
  /** Best-effort follow-up failures (e.g. sandbox account provisioning) are reported here. */
  onBackgroundError: (operation: string, error: unknown) => void;
}

export interface SessionTokens {
  accessToken: string;
  expiresInSeconds: number;
  refreshToken: string;
  refreshTokenExpiresAt: string;
  user: {
    id: string;
    email: string;
    isPlatformAdmin: boolean;
    platformRole: PlatformRole | null;
  };
  merchant: { id: string; role: string; status: MerchantAccountStatus } | null;
  /** `admin` | `staff` | `merchant` | `merchant_onboarding`. */
  audience: Audience;
  /** Where the dashboard should navigate right after sign-in. */
  homePath: string;
  /** The sidebar tree the FE should render, already pruned to this audience. */
  navigation: NavSection[];
}

export interface RegistrationResult extends SessionTokens {
  testApiKey: IssuedApiKey;
}

/**
 * Hash computed once and used when the email is unknown, so failed sign-ins
 * cost the same time whether or not the account exists.
 */
let decoyHash: Promise<string> | null = null;

export class IdentityUseCases {
  constructor(private readonly deps: IdentityDependencies) {}

  /** PRD 5.3 step 1: sign up, test keys issued instantly. */
  async register(input: {
    email: string;
    password: string;
    businessName: string;
  }): Promise<RegistrationResult> {
    const email = normalizeEmail(input.email);
    assertAcceptablePassword(input.password, email);
    const passwordHash = await this.deps.passwords.hash(input.password);
    const now = this.deps.clock.now();

    const { user, merchantId, testApiKey } = await this.deps.unitOfWork.run(async () => {
      if (await this.deps.users.findByEmail(email)) {
        throw new ConflictError(
          'An account with this email already exists. Sign in or reset your password.',
        );
      }
      const user = User.register({ id: this.deps.ids.next('usr'), email, passwordHash, now });
      await this.deps.users.insert(user);
      const { merchantId } = await this.deps.merchants.register({
        legalName: input.businessName,
        displayName: input.businessName,
      });
      await this.deps.team.addOwner(user.id, merchantId);
      await this.deps.onboarding.start(merchantId, input.businessName);
      const testApiKey = await this.deps.apiKeys.issue({
        merchantId,
        mode: 'test',
        label: 'Default test key',
        actor: { type: 'user', id: user.id },
      });
      await this.deps.audit.record({
        merchantId,
        actor: { type: 'user', id: user.id },
        action: 'identity.registered',
        resource: { type: 'user', id: user.id },
      });
      return { user, merchantId, testApiKey };
    });

    // Sandbox account at the gateway's test mode, outside the transaction. Failure is non-fatal:
    // test orders report a clear "no test account" error until provisioning succeeds.
    try {
      await this.deps.merchantLifecycle.ensureProviderAccount(
        merchantId,
        'test',
        input.businessName,
        email,
      );
    } catch (error) {
      this.deps.onBackgroundError('merchant.provision_test_account', error);
    }

    // A fresh registration is always in onboarding until the gateway approves KYB.
    const session = await this.startSession(user, {
      merchantId,
      role: 'owner',
      status: 'onboarding',
    });
    return { ...session, testApiKey };
  }

  async login(input: {
    email: string;
    password: string;
    merchantId?: string;
  }): Promise<SessionTokens> {
    let email: string;
    try {
      email = normalizeEmail(input.email);
    } catch {
      throw new InvalidCredentialsError();
    }
    const now = this.deps.clock.now();
    const user = await this.deps.users.findByEmail(email);
    if (!user) {
      await this.deps.passwords.verify(await this.decoy(), input.password);
      throw new InvalidCredentialsError();
    }
    user.assertNotLocked(now);

    const valid = await this.deps.passwords.verify(user.passwordHash, input.password);
    if (!valid || !user.isActive) {
      user.recordFailedLogin(now);
      await this.deps.users.save(user);
      throw new InvalidCredentialsError();
    }
    user.recordSuccessfulLogin(now);
    await this.deps.users.save(user);

    const workspace = await this.pickWorkspace(user.id, input.merchantId);
    return this.startSession(user, workspace);
  }

  async refresh(refreshToken: string): Promise<SessionTokens> {
    const now = this.deps.clock.now();
    const current = await this.deps.sessions.findByTokenHash(
      this.deps.hasher.sha256Hex(refreshToken),
    );
    if (!current) throw new InvalidTokenError();
    if (current.isSpent()) {
      await this.deps.sessions.revokeFamily(current.familyId, now);
      await this.deps.unitOfWork.run(() =>
        this.deps.audit.record({
          merchantId: current.merchantId,
          actor: { type: 'system', id: 'identity' },
          action: 'identity.refresh_token_reuse_detected',
          resource: { type: 'session_family', id: current.familyId },
          metadata: { user_id: current.userId },
        }),
      );
      throw new InvalidTokenError();
    }
    if (current.isExpired(now)) throw new InvalidTokenError();
    if (!(await this.deps.sessions.markRotated(current.id, now))) {
      await this.deps.sessions.revokeFamily(current.familyId, now);
      throw new InvalidTokenError();
    }

    const user = await this.deps.users.findById(current.userId);
    if (!user || !user.isActive) throw new InvalidTokenError();
    // Role is re-read on every refresh so permission changes apply within one access-token lifetime.
    const workspace = current.merchantId
      ? await this.pickWorkspace(user.id, current.merchantId)
      : null;
    return this.issueTokens(user, current.familyId, workspace);
  }

  async logout(refreshToken: string): Promise<void> {
    const session = await this.deps.sessions.findByTokenHash(
      this.deps.hasher.sha256Hex(refreshToken),
    );
    if (session) await this.deps.sessions.revokeFamily(session.familyId, this.deps.clock.now());
  }

  /** Always succeeds from the caller's point of view (no account enumeration). */
  async requestPasswordReset(rawEmail: string): Promise<void> {
    let email: string;
    try {
      email = normalizeEmail(rawEmail);
    } catch {
      return;
    }
    const user = await this.deps.users.findByEmail(email);
    if (!user || !user.isActive) return;
    const token = this.deps.tokens.generate();
    const reset = PasswordResetToken.issue({
      id: this.deps.ids.next('prt'),
      userId: user.id,
      tokenHash: this.deps.hasher.sha256Hex(token),
      now: this.deps.clock.now(),
    });
    await this.deps.resetTokens.insert(reset);
    const resetUrl = `${this.deps.dashboardBaseUrl}/reset-password?token=${token}`;
    const expiresInMinutes = Math.round(
      (reset.expiresAt.getTime() - this.deps.clock.now().getTime()) / 60_000,
    );
    await this.deps.email.send({
      to: user.email,
      template: 'password_reset',
      variables: {
        brand: 'Nimbus',
        name: user.email.split('@')[0] ?? 'there',
        email: user.email,
        resetUrl,
        expiresInMinutes: String(Math.max(1, expiresInMinutes)),
      },
      idempotencyKey: reset.id,
    });
  }

  /** Sets the new password and signs out every session of the user. */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    const now = this.deps.clock.now();
    const reset = await this.deps.resetTokens.findByTokenHash(this.deps.hasher.sha256Hex(token));
    if (!reset || !reset.isUsable(now)) throw new InvalidTokenError();
    const user = await this.deps.users.findById(reset.userId);
    if (!user || !user.isActive) throw new InvalidTokenError();
    assertAcceptablePassword(newPassword, user.email);
    const passwordHash = await this.deps.passwords.hash(newPassword);

    await this.deps.unitOfWork.run(async () => {
      if (!(await this.deps.resetTokens.markUsed(reset.id, now))) throw new InvalidTokenError();
      user.changePassword(passwordHash, now);
      await this.deps.users.save(user);
      await this.deps.sessions.revokeAllForUser(user.id, now);
      await this.deps.audit.record({
        merchantId: null,
        actor: { type: 'user', id: user.id },
        action: 'identity.password_reset',
        resource: { type: 'user', id: user.id },
      });
    });
  }

  /**
   * New users choose a password; existing users prove theirs. The invited
   * email must match the account email.
   */
  async acceptInvitation(input: { token: string; password: string }): Promise<SessionTokens> {
    const invitation = await this.deps.team.findUsableInvitation(input.token);
    if (!invitation) throw new InvalidTokenError();
    const now = this.deps.clock.now();
    let user = await this.deps.users.findByEmail(invitation.email);
    let isNew = false;
    if (user) {
      if (
        !(await this.deps.passwords.verify(user.passwordHash, input.password)) ||
        !user.isActive
      ) {
        throw new InvalidCredentialsError();
      }
    } else {
      assertAcceptablePassword(input.password, invitation.email);
      user = User.register({
        id: this.deps.ids.next('usr'),
        email: invitation.email,
        passwordHash: await this.deps.passwords.hash(input.password),
        now,
      });
      isNew = true;
    }
    const member = user;
    const membership = await this.deps.unitOfWork.run(async () => {
      if (isNew) await this.deps.users.insert(member);
      const result = await this.deps.team.redeemInvitation(input.token, member.id);
      await this.deps.audit.record({
        merchantId: result.merchantId,
        actor: { type: 'user', id: member.id },
        action: 'team.invitation_accepted',
        resource: { type: 'membership', id: result.membershipId },
        metadata: { role: result.role },
      });
      return result;
    });
    const profile = await this.deps.merchantPaymentProfiles.getPaymentProfile(
      membership.merchantId,
    );
    return this.startSession(member, {
      merchantId: membership.merchantId,
      role: membership.role,
      status: profile?.status ?? null,
    });
  }

  async me(userId: string, activeMerchantId: string | null = null) {
    const user = await this.deps.users.findById(userId);
    if (!user) throw new InvalidTokenError();
    const memberships = await this.deps.team.membershipsOf(user.id);
    const active = activeMerchantId
      ? memberships.find((m) => m.merchantId === activeMerchantId) ?? null
      : null;
    const profile = active
      ? await this.deps.merchantPaymentProfiles.getPaymentProfile(active.merchantId)
      : null;
    const audience = audienceFor(user.platformRole, profile?.status ?? null);
    return {
      id: user.id,
      email: user.email,
      isPlatformAdmin: user.isPlatformAdmin,
      platformRole: user.platformRole,
      audience,
      homePath: homePathFor(audience),
      navigation: navigationFor(audience),
      memberships,
      activeMerchant: active
        ? { id: active.merchantId, role: active.role, status: profile?.status ?? null }
        : null,
    };
  }

  /**
   * Returns just the audience + sidebar for the currently signed-in user. Used
   * by `GET /v1/auth/navigation` so the dashboard FE can refresh its sidebar
   * without a full `me` round-trip (e.g. after switching merchant).
   */
  async navigation(userId: string, activeMerchantId: string | null = null) {
    const user = await this.deps.users.findById(userId);
    if (!user) throw new InvalidTokenError();
    let status: MerchantAccountStatus = null;
    if (activeMerchantId) {
      const memberships = await this.deps.team.membershipsOf(user.id);
      if (!memberships.some((m) => m.merchantId === activeMerchantId)) {
        throw new ForbiddenError('You are not a member of this merchant.');
      }
      const profile = await this.deps.merchantPaymentProfiles.getPaymentProfile(activeMerchantId);
      status = profile?.status ?? null;
    }
    const audience = audienceFor(user.platformRole, status);
    return {
      audience,
      homePath: homePathFor(audience),
      navigation: navigationFor(audience),
    };
  }

  private async pickWorkspace(
    userId: string,
    requested?: string,
  ): Promise<{ merchantId: string; role: string; status: MerchantAccountStatus } | null> {
    const memberships = await this.deps.team.membershipsOf(userId);
    const match = requested
      ? memberships.find((m) => m.merchantId === requested)
      : memberships[0];
    if (requested && !match) throw new ForbiddenError('You are not a member of this merchant.');
    if (!match) return null;
    const profile = await this.deps.merchantPaymentProfiles.getPaymentProfile(match.merchantId);
    return { merchantId: match.merchantId, role: match.role, status: profile?.status ?? null };
  }

  private startSession(
    user: User,
    workspace: { merchantId: string; role: string; status: MerchantAccountStatus } | null,
  ): Promise<SessionTokens> {
    return this.issueTokens(user, this.deps.ids.next('fam'), workspace);
  }

  private async issueTokens(
    user: User,
    familyId: string,
    workspace: { merchantId: string; role: string; status: MerchantAccountStatus } | null,
  ): Promise<SessionTokens> {
    const now = this.deps.clock.now();
    const refreshToken = this.deps.tokens.generate();
    const session = RefreshSession.issue({
      id: this.deps.ids.next('ses'),
      userId: user.id,
      familyId,
      merchantId: workspace?.merchantId ?? null,
      tokenHash: this.deps.hasher.sha256Hex(refreshToken),
      expiresAt: new Date(now.getTime() + this.deps.refreshTokenTtlMs),
      createdAt: now,
    });
    await this.deps.sessions.insert(session);
    const access = await this.deps.accessTokens.issue({
      userId: user.id,
      sessionFamilyId: familyId,
      merchantId: workspace?.merchantId ?? null,
      role: workspace?.role ?? null,
      isPlatformAdmin: user.isPlatformAdmin,
    });
    const audience = audienceFor(user.platformRole, workspace?.status ?? null);
    return {
      accessToken: access.token,
      expiresInSeconds: access.expiresInSeconds,
      refreshToken,
      refreshTokenExpiresAt: session.expiresAt.toISOString(),
      user: {
        id: user.id,
        email: user.email,
        isPlatformAdmin: user.isPlatformAdmin,
        platformRole: user.platformRole,
      },
      merchant: workspace
        ? { id: workspace.merchantId, role: workspace.role, status: workspace.status }
        : null,
      audience,
      homePath: homePathFor(audience),
      navigation: navigationFor(audience),
    };
  }

  private decoy(): Promise<string> {
    decoyHash ??= this.deps.passwords.hash('decoy-password-for-timing-equalisation');
    return decoyHash;
  }
}
