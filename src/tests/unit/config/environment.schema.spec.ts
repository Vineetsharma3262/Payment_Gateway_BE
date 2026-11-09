import { parseEnvironment } from '../../../config/environment.schema';

const base = {
  NODE_ENV: 'development',
  APP_PUBLIC_BASE_URL: 'http://localhost:3000',
  CHECKOUT_BASE_URL: 'http://localhost:3001/checkout',
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  SECRETS_PROVIDER: 'env',
  PAYMENT_PROVIDER_DEFAULT: 'fake',
};

const production = {
  ...base,
  NODE_ENV: 'production',
  SECRETS_PROVIDER: 'aws',
  PAYMENT_PROVIDER_DEFAULT: 'razorpay',
  REDIS_URL: 'rediss://cache:6379',
  CORS_ALLOWED_ORIGINS: 'https://dashboard.payco.com',
  DOCUMENTS_BUCKET: 'payco-prod-documents',
};

describe('environment validation', () => {
  it('accepts a development configuration with defaults', () => {
    const env = parseEnvironment(base);
    expect(env.APP_PORT).toBe(3000);
    expect(env.SWAGGER_ENABLED).toBe(false);
  });

  it('accepts a correct production configuration', () => {
    expect(() => parseEnvironment(production)).not.toThrow();
  });

  it.each([
    ['env secrets', { SECRETS_PROVIDER: 'env' }, 'SECRETS_PROVIDER'],
    ['fake provider', { PAYMENT_PROVIDER_DEFAULT: 'fake' }, 'PAYMENT_PROVIDER_DEFAULT'],
    ['missing redis', { REDIS_URL: '' }, 'REDIS_URL'],
    [
      'http CORS origin',
      { CORS_ALLOWED_ORIGINS: 'http://dashboard.payco.com' },
      'CORS_ALLOWED_ORIGINS',
    ],
    ['swagger UI', { SWAGGER_ENABLED: 'true' }, 'SWAGGER_ENABLED'],
  ])('rejects %s in production', (_label, override, field) => {
    expect(() => parseEnvironment({ ...production, ...override })).toThrow(field);
  });

  it('never echoes values in error messages', () => {
    expect(() =>
      parseEnvironment({ ...base, DATABASE_URL: 'mysql://secret-password@host' }),
    ).not.toThrow(/secret-password/);
    expect(() =>
      parseEnvironment({ ...base, DATABASE_URL: 'mysql://secret-password@host' }),
    ).toThrow('DATABASE_URL');
  });
});
