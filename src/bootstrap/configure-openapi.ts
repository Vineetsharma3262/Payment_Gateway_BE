import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import type { AppConfig } from '../config/configuration';

export function buildOpenApiDocument(app: INestApplication, config: AppConfig): OpenAPIObject {
  const document = new DocumentBuilder()
    .setTitle('PayCo API')
    .setDescription(
      [
        'PayCo merchant API. All amounts are integer cents; currency is `usd`.',
        'Authenticate server-to-server with a secret key: `Authorization: Bearer sk_test_…`. Never embed secret keys in browsers or mobile apps.',
        'Dashboard endpoints use a session access token (`POST /v1/auth/login`). Endpoints marked *Admin* are restricted to PayCo administrators.',
        'Financial create operations require an `Idempotency-Key` header.',
        'Endpoints answering `501 not_implemented` are part of the published contract and are scheduled for a later phase.',
        'Payments are processed by PayCo’s licensed payment processing partner; PayCo is not the payment processor.',
      ].join('\n\n'),
    )
    .setVersion('1')
    .addServer(config.http.publicBaseUrl)
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'sk_{mode}_…' }, 'api-key')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'session')
    .build();
  return SwaggerModule.createDocument(app, document);
}

export function configureOpenApi(app: INestApplication, config: AppConfig): void {
  if (!config.http.swaggerEnabled) return;
  SwaggerModule.setup('docs', app, buildOpenApiDocument(app, config), {
    jsonDocumentUrl: 'docs/openapi.json',
  });
}
