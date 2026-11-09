// Runs before any e2e module import: configuration is read when AppModule loads.
Object.assign(process.env, {
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  APP_PUBLIC_BASE_URL: 'http://localhost:3000',
  CHECKOUT_BASE_URL: 'https://pay.payco.test/checkout',
  CORS_ALLOWED_ORIGINS: 'http://localhost:3001',
  SWAGGER_ENABLED: 'true',
  DATABASE_URL: 'postgresql://unused:unused@localhost:5432/unused',
  REDIS_URL: '',
  SECRETS_PROVIDER: 'env',
  PAYMENT_PROVIDER_DEFAULT: 'fake',
  RATE_LIMIT_MAX: '1000',
  SECRET_API_KEY_PEPPER: 'e2e-pepper-0123456789abcdef0123456789',
  SECRET_JWT_SIGNING_KEY: 'e2e-jwt-signing-key-0123456789abcdef0123',
  SECRET_FIELD_ENCRYPTION_KEYS: JSON.stringify({
    active: 'e2e',
    keys: { e2e: Buffer.from('e2e-field-key-exactly-32-bytes!!').toString('base64') },
  }),
});
