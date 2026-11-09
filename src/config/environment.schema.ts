import { z } from 'zod';

const booleanString = z.enum(['true', 'false']).transform((v) => v === 'true');

const commaList = z
  .string()
  .transform((v) =>
    v
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  )
  .pipe(z.array(z.url()));

/**
 * Process environment contract. Validated once at startup; the process exits on
 * any violation. Per-environment rules (refinements below) prevent development
 * shortcuts from reaching staging or production.
 */
export const environmentSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'staging', 'production']),
    APP_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    APP_PUBLIC_BASE_URL: z.url(),
    CHECKOUT_BASE_URL: z.url(),
    CORS_ALLOWED_ORIGINS: commaList.default([]),
    SWAGGER_ENABLED: booleanString.default(false),

    DATABASE_URL: z.string().startsWith('postgresql://'),
    REDIS_URL: z
      .string()
      .regex(/^rediss?:\/\//)
      .optional()
      .or(z.literal('').transform(() => undefined)),

    RATE_LIMIT_TTL_MS: z.coerce.number().int().positive().default(60_000),
    RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120),

    PAYMENT_PROVIDER_DEFAULT: z.enum(['razorpay', 'stripe_connect', 'fake']).default('razorpay'),
    RAZORPAY_API_BASE_URL: z.url().default('https://api.razorpay.com'),
    PROVIDER_HTTP_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(25_000).default(10_000),

    AWS_REGION: z.string().min(1).default('us-east-1'),
    SQS_OUTBOX_QUEUE_URL: z
      .url()
      .optional()
      .or(z.literal('').transform(() => undefined)),
    OUTBOX_RELAY_POLL_INTERVAL_MS: z.coerce.number().int().min(100).default(1_000),

    DASHBOARD_BASE_URL: z.url().default('http://localhost:3001'),
    ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),

    /** Transactional email (Resend). `log` means logger-only (dev/test). */
    EMAIL_PROVIDER: z.enum(['log', 'resend']).default('log'),
    EMAIL_FROM: z.string().min(3).default('Nimbus <onboarding@resend.dev>'),
    EMAIL_REPLY_TO: z
      .string()
      .optional()
      .or(z.literal('').transform(() => undefined)),

    DOCUMENTS_BUCKET: z
      .string()
      .optional()
      .or(z.literal('').transform(() => undefined)),
    DOCUMENTS_KMS_KEY_ID: z
      .string()
      .optional()
      .or(z.literal('').transform(() => undefined)),

    SECRETS_PROVIDER: z.enum(['env', 'aws']).default('aws'),
    SECRETS_NAMESPACE: z
      .string()
      .regex(/^[a-z0-9/_-]+$/)
      .default('payco/local'),
  })
  .superRefine((env, ctx) => {
    const deployed = env.NODE_ENV === 'staging' || env.NODE_ENV === 'production';
    if (!deployed) return;
    if (env.SECRETS_PROVIDER !== 'aws') {
      ctx.addIssue({
        code: 'custom',
        path: ['SECRETS_PROVIDER'],
        message: 'must be "aws" in staging/production',
      });
    }
    if (env.PAYMENT_PROVIDER_DEFAULT === 'fake') {
      ctx.addIssue({
        code: 'custom',
        path: ['PAYMENT_PROVIDER_DEFAULT'],
        message: 'fake provider is not allowed',
      });
    }
    if (!env.REDIS_URL) {
      ctx.addIssue({
        code: 'custom',
        path: ['REDIS_URL'],
        message: 'required for distributed rate limiting',
      });
    }
    for (const origin of env.CORS_ALLOWED_ORIGINS) {
      if (!origin.startsWith('https://')) {
        ctx.addIssue({
          code: 'custom',
          path: ['CORS_ALLOWED_ORIGINS'],
          message: `non-https origin ${origin}`,
        });
      }
    }
    if (!env.DOCUMENTS_BUCKET) {
      ctx.addIssue({
        code: 'custom',
        path: ['DOCUMENTS_BUCKET'],
        message: 'required for onboarding documents',
      });
    }
    if (env.NODE_ENV === 'production' && env.SWAGGER_ENABLED) {
      ctx.addIssue({
        code: 'custom',
        path: ['SWAGGER_ENABLED'],
        message: 'disable public docs UI in production',
      });
    }
  });

export type Environment = z.infer<typeof environmentSchema>;

export function parseEnvironment(raw: Record<string, string | undefined>): Environment {
  const result = environmentSchema.safeParse(raw);
  if (!result.success) {
    // Names and messages only; never echo values, which may be secrets.
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return result.data;
}
