import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../../app.module';
import { configureApp } from '../../bootstrap/configure-app';
import { PAYMENT_PROVIDER_REGISTRY } from '../../integrations/payment-providers/domain-ports/payment-provider.port';
import { FakePaymentProvider } from '../../integrations/payment-providers/testing/fake-payment-provider';
import { StaticPaymentProviderRegistry } from '../../integrations/payment-providers/testing/in-memory-provider-registry';
import {
  API_KEY_REPOSITORY,
  API_REQUEST_LOG_STORE,
} from '../../modules/api-credentials/domain/api-key.repository';
import { PASSWORD_HASHER } from '../../modules/identity-access/application/identity.ports';
import {
  PASSWORD_RESET_TOKEN_REPOSITORY,
  SESSION_REPOSITORY,
  USER_REPOSITORY,
} from '../../modules/identity-access/domain/identity.repositories';
import { User } from '../../modules/identity-access/domain/user';
import {
  ONBOARDING_APPLICATION_REPOSITORY,
  ONBOARDING_DOCUMENT_REPOSITORY,
} from '../../modules/merchant-onboarding/domain/onboarding.repositories';
import { MERCHANT_REPOSITORY } from '../../modules/merchants/domain/merchant.repository';
import { MERCHANT_PAYMENT_PROFILE_READER } from '../../modules/merchants/public-api';
import { ORDER_REPOSITORY } from '../../modules/orders/domain/repositories/order.repository';
import {
  INVITATION_REPOSITORY,
  MEMBERSHIP_REPOSITORY,
} from '../../modules/team-access/domain/team.repositories';
import { CheckReadinessUseCase } from '../../modules/health/application/readiness';
import { AUDIT_LOG } from '../../shared/application/audit-log.port';
import { DOMAIN_EVENT_PUBLISHER } from '../../shared/application/domain-event-publisher.port';
import { IDEMPOTENCY_STORE } from '../../shared/application/idempotency.port';
import { UNIT_OF_WORK } from '../../shared/application/unit-of-work.port';
import { PrismaService } from '../../shared/infrastructure/database/prisma.service';
import {
  InMemoryIdempotencyStore,
  InMemoryOrderRepository,
  PassThroughUnitOfWork,
  RecordingEventPublisher,
} from '../support/fakes';
import {
  FakePasswordHasher,
  InMemoryApiKeys,
  InMemoryInvitations,
  InMemoryMemberships,
  InMemoryMerchants,
  InMemoryOnboarding,
  InMemoryResetTokens,
  InMemorySessions,
  InMemoryUsers,
  onboardingDocumentsOf,
  RecordingAuditLog,
} from '../support/platform-fakes';

const PASSWORD = 'correct horse battery staple';

describe('Platform API (e2e, in-memory adapters)', () => {
  let app: INestApplication<App>;
  const users = new InMemoryUsers();
  const merchants = new InMemoryMerchants();
  const onboarding = new InMemoryOnboarding();
  const apiKeys = new InMemoryApiKeys();
  const audit = new RecordingAuditLog();
  let http: () => ReturnType<typeof request>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({})
      .overrideProvider(UNIT_OF_WORK)
      .useValue(new PassThroughUnitOfWork())
      .overrideProvider(IDEMPOTENCY_STORE)
      .useValue(new InMemoryIdempotencyStore({ now: () => new Date() }))
      .overrideProvider(DOMAIN_EVENT_PUBLISHER)
      .useValue(new RecordingEventPublisher())
      .overrideProvider(ORDER_REPOSITORY)
      .useValue(new InMemoryOrderRepository())
      .overrideProvider(PAYMENT_PROVIDER_REGISTRY)
      .useValue(new StaticPaymentProviderRegistry([new FakePaymentProvider()]))
      .overrideProvider(USER_REPOSITORY)
      .useValue(users)
      .overrideProvider(SESSION_REPOSITORY)
      .useValue(new InMemorySessions())
      .overrideProvider(PASSWORD_RESET_TOKEN_REPOSITORY)
      .useValue(new InMemoryResetTokens())
      .overrideProvider(PASSWORD_HASHER)
      .useValue(new FakePasswordHasher())
      .overrideProvider(MEMBERSHIP_REPOSITORY)
      .useValue(new InMemoryMemberships())
      .overrideProvider(INVITATION_REPOSITORY)
      .useValue(new InMemoryInvitations())
      .overrideProvider(MERCHANT_REPOSITORY)
      .useValue(merchants)
      .overrideProvider(MERCHANT_PAYMENT_PROFILE_READER)
      .useValue(merchants)
      .overrideProvider(ONBOARDING_APPLICATION_REPOSITORY)
      .useValue(onboarding)
      .overrideProvider(ONBOARDING_DOCUMENT_REPOSITORY)
      .useValue(onboardingDocumentsOf(onboarding))
      .overrideProvider(API_KEY_REPOSITORY)
      .useValue(apiKeys)
      .overrideProvider(API_REQUEST_LOG_STORE)
      .useValue(apiKeys)
      .overrideProvider(AUDIT_LOG)
      .useValue(audit)
      .overrideProvider(CheckReadinessUseCase)
      .useValue(new CheckReadinessUseCase([]))
      .compile();
    app = moduleRef.createNestApplication({ rawBody: true, bufferLogs: true });
    configureApp(app);
    await app.init();
    http = () => request(app.getHttpServer());
  });

  afterAll(async () => {
    await app.close();
  });

  const register = (email: string) =>
    http()
      .post('/v1/auth/register')
      .send({ email, password: PASSWORD, business_name: 'Acme Coffee' })
      .expect(201);
  const bearer = (token: unknown) => ({ Authorization: `Bearer ${String(token)}` });

  it('signup returns a session and a test API key that works on the merchant API immediately', async () => {
    const res = await register('owner@acme.co');
    const { access_token, test_api_key, merchant } = res.body.data;
    expect(merchant.role).toBe('owner');
    expect(test_api_key.secret).toMatch(/^sk_test_/);

    const order = await http()
      .post('/v1/orders')
      .set('Authorization', `Bearer ${test_api_key.secret}`)
      .set('Idempotency-Key', 'e2e-order-0001')
      .send({ amount: 1500, currency: 'usd' })
      .expect(201);
    expect(order.body.data.status).toBe('awaiting_payment');

    const logs = await http()
      .get('/v1/developers/request-logs')
      .set(bearer(access_token))
      .expect(200);
    expect(logs.body.data[0]).toMatchObject({
      method: 'POST',
      route: '/v1/orders',
      status_code: 201,
    });
    expect(JSON.stringify(logs.body)).not.toContain(test_api_key.secret);
  });

  it('API keys are not accepted on dashboard routes and vice versa', async () => {
    const { access_token, test_api_key } = (await register('split@acme.co')).body.data;
    await http()
      .get('/v1/merchant')
      .set('Authorization', `Bearer ${test_api_key.secret}`)
      .expect(401);
    await http()
      .post('/v1/orders')
      .set(bearer(access_token))
      .set('Idempotency-Key', 'e2e-mixed-01')
      .send({ amount: 1, currency: 'usd' })
      .expect(401);
  });

  it('rotates refresh tokens and kills the session when an old token is replayed', async () => {
    const { refresh_token, access_token } = (await register('rotate@acme.co')).body.data;
    await http().get('/v1/auth/me').set(bearer(access_token)).expect(200);
    const next = await http().post('/v1/auth/refresh').send({ refresh_token }).expect(200);

    const replay = await http().post('/v1/auth/refresh').send({ refresh_token }).expect(401);
    expect(replay.body.error.code).toBe('invalid_token');
    await http()
      .post('/v1/auth/refresh')
      .send({ refresh_token: next.body.data.refresh_token })
      .expect(401);
    await http().get('/v1/auth/me').set(bearer(next.body.data.access_token)).expect(401);
    expect(audit.actions()).toContain('identity.refresh_token_reuse_detected');
  });

  it('login failures are uniform; logout ends the session', async () => {
    await register('login@acme.co');
    const bad = await http()
      .post('/v1/auth/login')
      .send({ email: 'login@acme.co', password: 'wrong password!!' })
      .expect(401);
    const unknown = await http()
      .post('/v1/auth/login')
      .send({ email: 'ghost@acme.co', password: PASSWORD })
      .expect(401);
    expect(bad.body.error).toEqual(unknown.body.error);
    const s = (
      await http()
        .post('/v1/auth/login')
        .send({ email: 'login@acme.co', password: PASSWORD })
        .expect(200)
    ).body.data;
    await http().post('/v1/auth/logout').send({ refresh_token: s.refresh_token }).expect(204);
    await http().get('/v1/auth/me').set(bearer(s.access_token)).expect(401);
    await http().post('/v1/auth/forgot-password').send({ email: 'ghost@acme.co' }).expect(202);
  });

  it('onboarding: update (sensitive fields write-only), submit, and live keys stay locked until approval', async () => {
    const { access_token } = (await register('kyb@acme.co')).body.data;
    const updated = await http()
      .patch('/v1/onboarding/application')
      .set(bearer(access_token))
      .send({
        legal_business_name: 'Acme Coffee LLC',
        business_type: 'llc',
        ein: '12-3456789',
        phone: '+14155550100',
        address: {
          line1: '1 Main St',
          city: 'Austin',
          state: 'TX',
          postal_code: '78701',
          country: 'US',
        },
        owners: [
          {
            first_name: 'Ada',
            last_name: 'Lovelace',
            email: 'ada@acme.co',
            ownership_percent: 100,
            is_controller: true,
            date_of_birth: '1980-02-03',
            ssn_last4: '4321',
          },
        ],
        bank_account: { token: 'btok_123', last4: '6789' },
        accept_provider_terms: true,
      })
      .expect(200);
    expect(updated.body.data.business.ein_last4).toBe('6789');
    expect(JSON.stringify(updated.body)).not.toMatch(/123456789|1980-02-03|4321/);
    expect(updated.body.data.requirements).toEqual([]);

    await http()
      .post('/v1/developers/api-keys')
      .set(bearer(access_token))
      .send({ mode: 'live', label: 'prod' })
      .expect(403);
    const submitted = await http()
      .post('/v1/onboarding/application/submit')
      .set(bearer(access_token))
      .expect(200);
    expect(submitted.body.data).toMatchObject({
      status: 'pending_review',
      provider_submission: 'sent',
    });
  });

  it('admin endpoints require a platform administrator; approval enables live keys', async () => {
    const owner = (await register('approve@acme.co')).body.data;
    await http().get('/v1/admin/merchants').set(bearer(owner.access_token)).expect(403);

    const admin = User.register({
      id: 'usr_admin',
      email: 'admin@payco.test',
      passwordHash: `$argon2id$fake$${PASSWORD}`,
      now: new Date(),
    });
    await users.insert(User.rehydrate({ ...admin.toProps(), isPlatformAdmin: true }));
    const adminSession = (
      await http()
        .post('/v1/auth/login')
        .send({ email: 'admin@payco.test', password: PASSWORD })
        .expect(200)
    ).body.data;
    await http().get('/v1/admin/merchants').set(bearer(adminSession.access_token)).expect(200);

    const decide = (applicationId: string) =>
      http()
        .post(`/v1/admin/onboarding/applications/${applicationId}/provider-decision`)
        .set(bearer(adminSession.access_token))
        .send({ decision: 'approved' });

    // A draft cannot be approved: the gateway only decides on submitted applications.
    const draft = onboarding.store.all().find((a) => a.merchantId === owner.merchant.id)!;
    await decide(draft.id).expect(422);
    expect((await merchants.findById(String(owner.merchant.id)))!.liveChargesEnabled).toBe(false);

    // The application submitted in the previous test is pending review: approve it.
    const kybOwner = (
      await http()
        .post('/v1/auth/login')
        .send({ email: 'kyb@acme.co', password: PASSWORD })
        .expect(200)
    ).body.data;
    const pending = onboarding.store.all().find((a) => a.merchantId === kybOwner.merchant.id)!;
    expect(pending.status).toBe('pending_review');
    await decide(pending.id).expect(200);

    const live = await http()
      .post('/v1/developers/api-keys')
      .set(bearer(kybOwner.access_token))
      .send({ mode: 'live', label: 'prod' })
      .expect(201);
    expect(live.body.data.secret).toMatch(/^sk_live_/);
    expect(audit.actions()).toEqual(
      expect.arrayContaining([
        'onboarding.provider_decision_recorded',
        'merchant.live_enabled',
        'api_key.issued',
      ]),
    );
  });

  it('RBAC: a viewer invited to the team cannot manage keys', async () => {
    const owner = (await register('team@acme.co')).body.data;
    await http()
      .post('/v1/team/invitations')
      .set(bearer(owner.access_token))
      .send({ email: 'viewer@acme.co', role: 'viewer' })
      .expect(201);
    await http()
      .post('/v1/team/invitations')
      .set(bearer(owner.access_token))
      .send({ email: 'x@acme.co', role: 'owner' })
      .expect(400);
    const members = await http()
      .get('/v1/team/members')
      .set(bearer(owner.access_token))
      .expect(200);
    expect(members.body.data).toHaveLength(1);
  });

  it('routes of later phases are published and answer 501 after auth and validation', async () => {
    const { test_api_key } = (await register('later@acme.co')).body.data;
    const key = { Authorization: `Bearer ${test_api_key.secret}` };
    const res = await http().get('/v1/payments').set(key).expect(501);
    expect(res.body.error).toMatchObject({
      code: 'not_implemented',
      details: { phase: 'Phase 3' },
    });
    await http().get('/v1/payments').expect(401);
    await http()
      .post('/v1/payment-links')
      .set(key)
      .set('Idempotency-Key', 'e2e-link-0001')
      .send({ amount: -1 })
      .expect(400);
  });
});
