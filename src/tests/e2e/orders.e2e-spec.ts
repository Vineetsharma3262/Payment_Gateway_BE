import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../../app.module';
import { configureApp } from '../../bootstrap/configure-app';
import { buildOpenApiDocument } from '../../bootstrap/configure-openapi';
import { APP_CONFIG, type AppConfig } from '../../config/configuration';
import { PAYMENT_PROVIDER_REGISTRY } from '../../integrations/payment-providers/domain-ports/payment-provider.port';
import { FakePaymentProvider } from '../../integrations/payment-providers/testing/fake-payment-provider';
import { StaticPaymentProviderRegistry } from '../../integrations/payment-providers/testing/in-memory-provider-registry';
import { formatApiKey } from '../../modules/api-credentials/application/api-key-format';
import { ApiKey } from '../../modules/api-credentials/domain/api-key';
import { API_KEY_REPOSITORY } from '../../modules/api-credentials/domain/api-key.repository';
import { HmacApiKeySecretHasher } from '../../modules/api-credentials/infrastructure/hmac-api-key-secret-hasher';
import { CheckReadinessUseCase } from '../../modules/health/application/readiness';
import { MERCHANT_PAYMENT_PROFILE_READER } from '../../modules/merchants/public-api';
import { ORDER_REPOSITORY } from '../../modules/orders/domain/repositories/order.repository';
import { DOMAIN_EVENT_PUBLISHER } from '../../shared/application/domain-event-publisher.port';
import { IDEMPOTENCY_STORE } from '../../shared/application/idempotency.port';
import { UNIT_OF_WORK } from '../../shared/application/unit-of-work.port';
import { PrismaService } from '../../shared/infrastructure/database/prisma.service';
import {
  activeMerchant,
  InMemoryIdempotencyStore,
  InMemoryMerchantProfiles,
  InMemoryOrderRepository,
  PassThroughUnitOfWork,
  RecordingEventPublisher,
} from '../support/fakes';

const hasher = new HmacApiKeySecretHasher(process.env.SECRET_API_KEY_PEPPER!);
const SECRET = 'e2eSecret'.padEnd(40, 'x');
const keys = {
  A: { id: 'key_' + 'A'.repeat(24), merchantId: 'mer_A' },
  B: { id: 'key_' + 'B'.repeat(24), merchantId: 'mer_B' },
  revoked: { id: 'key_' + 'R'.repeat(24), merchantId: 'mer_A', revokedAt: new Date('2026-01-01') },
};
const bearer = (k: { id: string }) => `Bearer ${formatApiKey('test', k.id, SECRET)}`;

describe('Orders API (e2e, in-memory adapters)', () => {
  let app: INestApplication<App>;
  let provider: FakePaymentProvider;

  beforeAll(async () => {
    provider = new FakePaymentProvider();
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
      .overrideProvider(MERCHANT_PAYMENT_PROFILE_READER)
      .useValue(
        new InMemoryMerchantProfiles().add(activeMerchant('mer_A')).add(activeMerchant('mer_B')),
      )
      .overrideProvider(PAYMENT_PROVIDER_REGISTRY)
      .useValue(new StaticPaymentProviderRegistry([provider]))
      .overrideProvider(API_KEY_REPOSITORY)
      .useValue({
        findById: (id: string) => {
          const k = Object.values(keys).find((x) => x.id === id);
          return Promise.resolve(
            k
              ? ApiKey.rehydrate({
                  id: k.id,
                  merchantId: k.merchantId,
                  mode: 'test',
                  label: 'e2e',
                  last4: SECRET.slice(-4),
                  createdAt: new Date('2026-01-01'),
                  secretHash: hasher.hash(SECRET),
                  expiresAt: null,
                  revokedAt: 'revokedAt' in k ? k.revokedAt : null,
                })
              : null,
          );
        },
      })
      .overrideProvider(CheckReadinessUseCase)
      .useValue(new CheckReadinessUseCase([{ name: 'postgres', check: () => Promise.resolve() }]))
      .compile();

    app = moduleRef.createNestApplication({ rawBody: true, bufferLogs: true });
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const createOrder = (body: object, key = 'order-key-0001', auth = bearer(keys.A)) =>
    request(app.getHttpServer())
      .post('/v1/orders')
      .set('Authorization', auth)
      .set('Idempotency-Key', key)
      .send(body);

  describe('health', () => {
    it('GET /health/live is unversioned, unauthenticated and un-enveloped', async () => {
      const res = await request(app.getHttpServer()).get('/health/live').expect(200);
      expect(res.body).toEqual({ status: 'ok' });
    });

    it('GET /health/ready reports dependency checks', async () => {
      const res = await request(app.getHttpServer()).get('/health/ready').expect(200);
      expect(res.body).toEqual({ status: 'ok', checks: { postgres: 'up' } });
    });
  });

  describe('authentication', () => {
    it('rejects missing credentials with the error envelope and a request id', async () => {
      const res = await request(app.getHttpServer()).post('/v1/orders').send({}).expect(401);
      expect(res.body.error.code).toBe('authentication_failed');
      expect(res.body.meta.request_id).toEqual(res.headers['x-request-id']);
    });

    it('propagates a well-formed caller request id', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/orders/x')
        .set('X-Request-Id', 'lb-trace-12345678');
      expect(res.headers['x-request-id']).toBe('lb-trace-12345678');
    });

    it('rejects revoked API keys', async () => {
      await createOrder(
        { amount: 100, currency: 'usd' },
        'order-key-revoked',
        bearer(keys.revoked),
      ).expect(401);
    });
  });

  describe('POST /v1/orders', () => {
    it('requires an Idempotency-Key', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/orders')
        .set('Authorization', bearer(keys.A))
        .send({ amount: 100, currency: 'usd' })
        .expect(400);
      expect(res.body.error.code).toBe('validation_failed');
    });

    it('validates the body shape with field details', async () => {
      const res = await createOrder(
        { amount: 10.5, currency: 'usd', extra: true },
        'order-key-invalid',
      ).expect(400);
      expect(res.body.error.code).toBe('validation_failed');
      const details = res.body.error.details as { field: string }[];
      expect(details.map((d) => d.field)).toEqual(expect.arrayContaining(['amount']));
    });

    it('rejects non-USD currencies at the application boundary', async () => {
      const res = await createOrder({ amount: 100, currency: 'eur' }, 'order-key-eur').expect(422);
      expect(res.body.error.code).toBe('unsupported_currency');
    });

    it('creates an order and returns a PayCo checkout URL without provider ids', async () => {
      const res = await createOrder({ amount: 2500, currency: 'usd', receipt: 'INV-42' }).expect(
        201,
      );
      expect(res.body.data).toMatchObject({
        object: 'order',
        amount: 2500,
        currency: 'usd',
        status: 'awaiting_payment',
        livemode: false,
        receipt: 'INV-42',
      });
      expect(res.body.data.id).toMatch(/^ord_/);
      expect(res.body.data.checkout.url).toBe(
        `https://pay.payco.test/checkout/${res.body.data.id}`,
      );
      expect(JSON.stringify(res.body)).not.toMatch(/fake_order_|merchantId|providerOrder/);
    });

    it('returns the same order for an idempotent retry and rejects a changed payload', async () => {
      const first = await createOrder({ amount: 700, currency: 'usd' }, 'order-key-retry').expect(
        201,
      );
      const again = await createOrder({ amount: 700, currency: 'usd' }, 'order-key-retry').expect(
        201,
      );
      expect(again.body.data).toEqual(first.body.data);

      const changed = await createOrder({ amount: 701, currency: 'usd' }, 'order-key-retry').expect(
        422,
      );
      expect(changed.body.error.code).toBe('idempotency_key_reused');
    });

    it('returns 503 with Retry-After when the provider outcome is unknown', async () => {
      provider.queueOutcomes('timeout_after_processing');
      const res = await createOrder({ amount: 900, currency: 'usd' }, 'order-key-unknown').expect(
        503,
      );
      expect(res.body.error.code).toBe('provider_outcome_unknown');
      expect(res.headers['retry-after']).toBe('5');
      await createOrder({ amount: 900, currency: 'usd' }, 'order-key-unknown').expect(201);
    });
  });

  describe('GET /v1/orders/:orderId — merchant isolation', () => {
    it('returns the order to its owner and 404 to any other merchant', async () => {
      const created = await createOrder(
        { amount: 1234, currency: 'usd' },
        'order-key-isolation',
      ).expect(201);
      const id = created.body.data.id as string;

      await request(app.getHttpServer())
        .get(`/v1/orders/${id}`)
        .set('Authorization', bearer(keys.A))
        .expect(200);
      const other = await request(app.getHttpServer())
        .get(`/v1/orders/${id}`)
        .set('Authorization', bearer(keys.B))
        .expect(404);
      expect(other.body.error.code).toBe('resource_not_found');
    });
  });

  it('unknown routes return the error envelope', async () => {
    const res = await request(app.getHttpServer()).get('/v1/nope').expect(404);
    expect(res.body.error.code).toBe('route_not_found');
  });

  it('publishes an OpenAPI document for the versioned API', () => {
    const doc = buildOpenApiDocument(app, app.get<AppConfig>(APP_CONFIG));
    expect(Object.keys(doc.paths)).toEqual(
      expect.arrayContaining(['/v1/orders', '/v1/orders/{orderId}']),
    );
    expect(Object.keys(doc.paths).some((p) => p.startsWith('/health'))).toBe(false);
  });
});
