import { parseEnvironment, type Environment } from './environment.schema';

/** Typed, grouped configuration consumed by the rest of the application via APP_CONFIG. */
export interface AppConfig {
  env: Environment['NODE_ENV'];
  isProductionLike: boolean;
  http: {
    port: number;
    publicBaseUrl: string;
    corsAllowedOrigins: string[];
    swaggerEnabled: boolean;
  };
  logging: { level: Environment['LOG_LEVEL'] };
  checkout: { baseUrl: string };
  database: { url: string };
  redis: { url: string | undefined };
  rateLimit: { ttlMs: number; limit: number };
  payments: {
    defaultProvider: Environment['PAYMENT_PROVIDER_DEFAULT'];
    razorpayBaseUrl: string;
    httpTimeoutMs: number;
  };
  aws: { region: string; outboxQueueUrl: string | undefined };
  outboxRelay: { pollIntervalMs: number };
  secrets: { provider: Environment['SECRETS_PROVIDER']; namespace: string };
  auth: { accessTokenTtlSeconds: number; refreshTokenTtlDays: number; dashboardBaseUrl: string };
  email: {
    provider: Environment['EMAIL_PROVIDER'];
    from: string;
    replyTo: string | undefined;
  };
  storage: { documentsBucket: string | undefined; kmsKeyId: string | undefined };
}

export const APP_CONFIG = Symbol('AppConfig');

export function buildConfiguration(
  raw: Record<string, string | undefined> = process.env,
): AppConfig {
  const env = parseEnvironment(raw);
  return {
    env: env.NODE_ENV,
    isProductionLike: env.NODE_ENV === 'staging' || env.NODE_ENV === 'production',
    http: {
      port: env.APP_PORT,
      publicBaseUrl: env.APP_PUBLIC_BASE_URL,
      corsAllowedOrigins: env.CORS_ALLOWED_ORIGINS,
      swaggerEnabled: env.SWAGGER_ENABLED,
    },
    logging: { level: env.LOG_LEVEL },
    checkout: { baseUrl: env.CHECKOUT_BASE_URL },
    database: { url: env.DATABASE_URL },
    redis: { url: env.REDIS_URL },
    rateLimit: { ttlMs: env.RATE_LIMIT_TTL_MS, limit: env.RATE_LIMIT_MAX },
    payments: {
      defaultProvider: env.PAYMENT_PROVIDER_DEFAULT,
      razorpayBaseUrl: env.RAZORPAY_API_BASE_URL,
      httpTimeoutMs: env.PROVIDER_HTTP_TIMEOUT_MS,
    },
    aws: { region: env.AWS_REGION, outboxQueueUrl: env.SQS_OUTBOX_QUEUE_URL },
    outboxRelay: { pollIntervalMs: env.OUTBOX_RELAY_POLL_INTERVAL_MS },
    secrets: { provider: env.SECRETS_PROVIDER, namespace: env.SECRETS_NAMESPACE },
    auth: {
      accessTokenTtlSeconds: env.ACCESS_TOKEN_TTL_SECONDS,
      refreshTokenTtlDays: env.REFRESH_TOKEN_TTL_DAYS,
      dashboardBaseUrl: env.DASHBOARD_BASE_URL,
    },
    email: {
      provider: env.EMAIL_PROVIDER,
      from: env.EMAIL_FROM,
      replyTo: env.EMAIL_REPLY_TO,
    },
    storage: { documentsBucket: env.DOCUMENTS_BUCKET, kmsKeyId: env.DOCUMENTS_KMS_KEY_ID },
  };
}
