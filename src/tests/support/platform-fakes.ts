import { ConcurrencyConflictError } from '../../shared/application/application-error';
import type { AuditEntry, AuditLog } from '../../shared/application/audit-log.port';
import { InvalidTokenError } from '../../shared/application/authorization.port';
import type {
  DocumentStorage,
  PresignedUpload,
} from '../../shared/application/document-storage.port';
import type { ApiMode } from '../../shared/application/merchant-context';
import { toPage, type Page, type PageRequest } from '../../shared/application/pagination';
import type { SecureTokenGenerator } from '../../shared/application/secure-token.port';
import { ApiKey } from '../../modules/api-credentials/domain/api-key';
import type {
  ApiKeyRepository,
  ApiRequestLogEntry,
  ApiRequestLogStore,
} from '../../modules/api-credentials/domain/api-key.repository';
import type {
  AccessTokenClaims,
  AccessTokenService,
  PasswordHasher,
} from '../../modules/identity-access/application/identity.ports';
import type {
  PasswordResetTokenRepository,
  SessionRepository,
  UserRepository,
} from '../../modules/identity-access/domain/identity.repositories';
import {
  PasswordResetToken,
  RefreshSession,
} from '../../modules/identity-access/domain/refresh-session';
import { User } from '../../modules/identity-access/domain/user';
import {
  OnboardingApplication,
  type OnboardingStatus,
} from '../../modules/merchant-onboarding/domain/onboarding-application';
import type { OnboardingDocument } from '../../modules/merchant-onboarding/domain/onboarding-document';
import type {
  OnboardingApplicationRepository,
  OnboardingDocumentRepository,
} from '../../modules/merchant-onboarding/domain/onboarding.repositories';
import { Merchant, type MerchantStatus } from '../../modules/merchants/domain/merchant';
import type {
  MerchantRepository,
  ProviderAccountRecord,
} from '../../modules/merchants/domain/merchant.repository';
import type {
  MerchantPaymentProfile,
  MerchantPaymentProfileReader,
} from '../../modules/merchants/public-api';
import type { PaymentProviderName } from '../../integrations/payment-providers/domain-ports/payment-provider.port';
import { Invitation } from '../../modules/team-access/domain/invitation';
import { Membership } from '../../modules/team-access/domain/membership';
import type {
  InvitationRepository,
  MembershipRepository,
} from '../../modules/team-access/domain/team.repositories';

/** Optimistic-versioned in-memory store keyed by id, storing snapshots. */
class VersionedStore<
  T extends { toProps(): P; version: number; id: string; markPersisted(v: number): void },
  P extends { version: number },
> {
  readonly rows = new Map<string, P>();
  constructor(
    private readonly name: string,
    private readonly rehydrate: (p: P) => T,
  ) {}
  get(id: string): T | null {
    const row = this.rows.get(id);
    return row ? this.rehydrate({ ...row }) : null;
  }
  all(): T[] {
    return [...this.rows.values()].map((r) => this.rehydrate({ ...r }));
  }
  insert(entity: T): void {
    if (this.rows.has(entity.id)) throw new Error(`duplicate ${this.name}`);
    this.rows.set(entity.id, { ...entity.toProps(), version: 0 });
    entity.markPersisted(0);
  }
  save(entity: T): void {
    const stored = this.rows.get(entity.id);
    if (!stored || stored.version !== entity.version)
      throw new ConcurrencyConflictError(this.name, entity.id);
    this.rows.set(entity.id, { ...entity.toProps(), version: entity.version + 1 });
    entity.markPersisted(entity.version + 1);
  }
}

export class InMemoryUsers implements UserRepository {
  readonly store = new VersionedStore('user', User.rehydrate);
  findById(id: string) {
    return Promise.resolve(this.store.get(id));
  }
  findByEmail(email: string) {
    return Promise.resolve(this.store.all().find((u) => u.email === email) ?? null);
  }
  findManyByIds(ids: readonly string[]) {
    return Promise.resolve(this.store.all().filter((u) => ids.includes(u.id)));
  }
  insert(user: User) {
    this.store.insert(user);
    return Promise.resolve();
  }
  save(user: User) {
    this.store.save(user);
    return Promise.resolve();
  }
}

export class InMemorySessions implements SessionRepository {
  readonly rows = new Map<string, ReturnType<RefreshSession['toProps']>>();
  findByTokenHash(hash: string) {
    const row = [...this.rows.values()].find((r) => r.tokenHash === hash);
    return Promise.resolve(row ? RefreshSession.rehydrate(row) : null);
  }
  insert(s: RefreshSession) {
    this.rows.set(s.id, s.toProps());
    return Promise.resolve();
  }
  markRotated(id: string, now: Date) {
    const row = this.rows.get(id);
    if (!row || row.rotatedAt || row.revokedAt) return Promise.resolve(false);
    row.rotatedAt = now;
    return Promise.resolve(true);
  }
  revokeFamily(familyId: string, now: Date) {
    for (const r of this.rows.values()) if (r.familyId === familyId) r.revokedAt ??= now;
    return Promise.resolve();
  }
  revokeAllForUser(userId: string, now: Date) {
    for (const r of this.rows.values()) if (r.userId === userId) r.revokedAt ??= now;
    return Promise.resolve();
  }
  isFamilyActive(familyId: string, now: Date) {
    return Promise.resolve(
      [...this.rows.values()].some(
        (r) => r.familyId === familyId && !r.revokedAt && r.expiresAt > now,
      ),
    );
  }
}

export class InMemoryResetTokens implements PasswordResetTokenRepository {
  readonly rows = new Map<string, ReturnType<PasswordResetToken['toProps']>>();
  findByTokenHash(hash: string) {
    const row = [...this.rows.values()].find((r) => r.tokenHash === hash);
    return Promise.resolve(row ? PasswordResetToken.rehydrate(row) : null);
  }
  insert(t: PasswordResetToken) {
    this.rows.set(t.id, t.toProps());
    return Promise.resolve();
  }
  markUsed(id: string, now: Date) {
    const row = this.rows.get(id);
    if (!row || row.usedAt) return Promise.resolve(false);
    row.usedAt = now;
    return Promise.resolve(true);
  }
}

/** Fast stand-in for Argon2id in unit tests (the real adapter has its own test). */
export class FakePasswordHasher implements PasswordHasher {
  hash(password: string) {
    return Promise.resolve(`$argon2id$fake$${password}`);
  }
  verify(hash: string, password: string) {
    return Promise.resolve(hash === `$argon2id$fake$${password}`);
  }
}

export class FakeAccessTokens implements AccessTokenService {
  issue(claims: AccessTokenClaims) {
    return Promise.resolve({
      token: `at.${Buffer.from(JSON.stringify(claims)).toString('base64url')}`,
      expiresInSeconds: 900,
    });
  }
  verify(token: string) {
    if (!token.startsWith('at.')) return Promise.reject(new InvalidTokenError());
    return Promise.resolve(
      JSON.parse(Buffer.from(token.slice(3), 'base64url').toString()) as AccessTokenClaims,
    );
  }
}

export class SequentialTokens implements SecureTokenGenerator {
  private n = 0;
  generate() {
    return `token${String(++this.n).padStart(43, '0')}`;
  }
}

export class InMemoryMemberships implements MembershipRepository {
  readonly rows = new Map<string, ReturnType<Membership['toProps']>>();
  private hydrate = (r: ReturnType<Membership['toProps']>) => Membership.rehydrate(r);
  findById(merchantId: string, id: string) {
    const r = this.rows.get(id);
    return Promise.resolve(r && r.merchantId === merchantId ? this.hydrate(r) : null);
  }
  findForUser(userId: string) {
    return Promise.resolve(
      [...this.rows.values()].filter((r) => r.userId === userId).map(this.hydrate),
    );
  }
  findByUserAndMerchant(userId: string, merchantId: string) {
    const r = [...this.rows.values()].find(
      (m) => m.userId === userId && m.merchantId === merchantId,
    );
    return Promise.resolve(r ? this.hydrate(r) : null);
  }
  listForMerchant(merchantId: string) {
    return Promise.resolve(
      [...this.rows.values()].filter((r) => r.merchantId === merchantId).map(this.hydrate),
    );
  }
  countOwners(merchantId: string) {
    return Promise.resolve(
      [...this.rows.values()].filter((r) => r.merchantId === merchantId && r.role === 'owner')
        .length,
    );
  }
  insert(m: Membership) {
    this.rows.set(m.id, m.toProps());
    return Promise.resolve();
  }
  save(m: Membership) {
    this.rows.set(m.id, m.toProps());
    return Promise.resolve();
  }
}

export class InMemoryInvitations implements InvitationRepository {
  readonly rows = new Map<string, ReturnType<Invitation['toProps']>>();
  findById(merchantId: string, id: string) {
    const r = this.rows.get(id);
    return Promise.resolve(r && r.merchantId === merchantId ? Invitation.rehydrate(r) : null);
  }
  findByTokenHash(hash: string) {
    const r = [...this.rows.values()].find((i) => i.tokenHash === hash);
    return Promise.resolve(r ? Invitation.rehydrate(r) : null);
  }
  insert(i: Invitation) {
    this.rows.set(i.id, i.toProps());
    return Promise.resolve();
  }
  save(i: Invitation) {
    this.rows.set(i.id, i.toProps());
    return Promise.resolve();
  }
}

/** Also serves MerchantPaymentProfileReader from the same data, like the Prisma adapters. */
export class InMemoryMerchants implements MerchantRepository, MerchantPaymentProfileReader {
  readonly store = new VersionedStore('merchant', Merchant.rehydrate);
  readonly accounts = new Map<string, ProviderAccountRecord>();
  findById(id: string) {
    return Promise.resolve(this.store.get(id));
  }
  list(filter: { status?: MerchantStatus }, page: PageRequest): Promise<Page<Merchant>> {
    const rows = this.store.all().filter((m) => !filter.status || m.status === filter.status);
    return Promise.resolve(toPage(rows.slice(0, page.limit + 1), page.limit));
  }
  insert(m: Merchant) {
    this.store.insert(m);
    return Promise.resolve();
  }
  save(m: Merchant) {
    this.store.save(m);
    return Promise.resolve();
  }
  findProviderAccount(merchantId: string, mode: ApiMode) {
    return Promise.resolve(this.accounts.get(`${merchantId}:${mode}`) ?? null);
  }
  saveProviderAccount(merchantId: string, account: ProviderAccountRecord) {
    this.accounts.set(`${merchantId}:${account.mode}`, account);
    return Promise.resolve();
  }
  getPaymentProfile(merchantId: string): Promise<MerchantPaymentProfile | null> {
    const m = this.store.get(merchantId);
    if (!m) return Promise.resolve(null);
    const acc = (mode: ApiMode) => {
      const a = this.accounts.get(`${merchantId}:${mode}`);
      return a
        ? { provider: a.provider as PaymentProviderName, accountId: a.providerAccountId }
        : null;
    };
    return Promise.resolve({
      merchantId,
      status: m.status,
      liveChargesEnabled: m.liveChargesEnabled,
      providerAccounts: { test: acc('test'), live: acc('live') },
    });
  }
}

export class InMemoryOnboarding implements OnboardingApplicationRepository {
  readonly store = new VersionedStore('onboarding_application', OnboardingApplication.rehydrate);
  readonly documents: OnboardingDocument[] = [];
  findByMerchant(merchantId: string) {
    return Promise.resolve(this.store.all().find((a) => a.merchantId === merchantId) ?? null);
  }
  findById(id: string) {
    return Promise.resolve(this.store.get(id));
  }
  list(filter: { status?: OnboardingStatus }, page: PageRequest) {
    const rows = this.store.all().filter((a) => !filter.status || a.status === filter.status);
    return Promise.resolve(toPage(rows.slice(0, page.limit + 1), page.limit));
  }
  insert(a: OnboardingApplication) {
    this.store.insert(a);
    return Promise.resolve();
  }
  save(a: OnboardingApplication) {
    this.store.save(a);
    return Promise.resolve();
  }
  listForApplication(merchantId: string, applicationId: string) {
    return Promise.resolve(
      this.documents.filter(
        (d) => d.toProps().merchantId === merchantId && d.toProps().applicationId === applicationId,
      ),
    );
  }
  insertDocument = (d: OnboardingDocument) => this.documents.push(d);
}
// OnboardingDocumentRepository.insert is declared separately to avoid clashing with the application insert.
export function onboardingDocumentsOf(store: InMemoryOnboarding): OnboardingDocumentRepository {
  return {
    listForApplication: (m, a) => store.listForApplication(m, a),
    insert: (d) => {
      store.insertDocument(d);
      return Promise.resolve();
    },
  };
}

export class InMemoryApiKeys implements ApiKeyRepository, ApiRequestLogStore {
  readonly rows = new Map<string, ReturnType<ApiKey['toProps']>>();
  readonly logs: (ApiRequestLogEntry & { id: string; createdAt: Date })[] = [];
  findById(id: string) {
    const r = this.rows.get(id);
    return Promise.resolve(r ? ApiKey.rehydrate(r) : null);
  }
  listForMerchant(merchantId: string) {
    return Promise.resolve(
      [...this.rows.values()]
        .filter((r) => r.merchantId === merchantId)
        .map((r) => ApiKey.rehydrate(r)),
    );
  }
  insert(k: ApiKey) {
    this.rows.set(k.id, k.toProps());
    return Promise.resolve();
  }
  save(k: ApiKey) {
    this.rows.set(k.id, k.toProps());
    return Promise.resolve();
  }
  append(entry: ApiRequestLogEntry) {
    this.logs.push({ ...entry, id: `log_${this.logs.length + 1}`, createdAt: new Date() });
    return Promise.resolve();
  }
  list(merchantId: string, page: { limit: number }) {
    return Promise.resolve(
      toPage(
        this.logs.filter((l) => l.merchantId === merchantId).slice(0, page.limit + 1),
        page.limit,
      ),
    );
  }
}

export class RecordingAuditLog implements AuditLog {
  readonly entries: AuditEntry[] = [];
  record(entry: AuditEntry) {
    this.entries.push(entry);
    return Promise.resolve();
  }
  actions(): string[] {
    return this.entries.map((e) => e.action);
  }
}

export class FakeDocumentStorage implements DocumentStorage {
  createUploadUrl(input: { storageKey: string; contentType: string }): Promise<PresignedUpload> {
    return Promise.resolve({
      url: `https://uploads.test/${input.storageKey}`,
      storageKey: input.storageKey,
      expiresAt: new Date(Date.now() + 300_000),
      requiredHeaders: { 'Content-Type': input.contentType },
    });
  }
  createDownloadUrl(key: string) {
    return Promise.resolve(`https://uploads.test/${key}`);
  }
}
