import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import type { AppConfig } from '../config/configuration';

/** Request bodies are small JSON documents; documents/reports go to S3 via pre-signed URLs. */
export const JSON_BODY_LIMIT = '100kb';

export function configureSecurity(app: INestApplication, config: AppConfig): void {
  const express = app as NestExpressApplication;
  express.disable('x-powered-by');
  // Behind exactly one load balancer hop, so req.ip is the client address for rate limiting.
  express.set('trust proxy', 1);
  express.useBodyParser('json', { limit: JSON_BODY_LIMIT });
  express.useBodyParser('urlencoded', { limit: JSON_BODY_LIMIT, extended: false });

  app.use(
    helmet({
      // Swagger UI needs inline styles/scripts; it is disabled in production.
      contentSecurityPolicy: config.http.swaggerEnabled ? false : undefined,
      hsts: config.isProductionLike
        ? { maxAge: 31_536_000, includeSubDomains: true, preload: true }
        : false,
    }),
  );

  app.enableCors({
    origin: config.http.corsAllowedOrigins.length > 0 ? config.http.corsAllowedOrigins : false,
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    allowedHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id', 'Retry-After'],
    credentials: true,
    maxAge: 600,
  });
}
