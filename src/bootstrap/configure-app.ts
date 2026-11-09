import { type INestApplication, VersioningType } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { APP_CONFIG, type AppConfig } from '../config/configuration';
import { requestContextMiddleware } from '../shared/infrastructure/observability/request-context';
import { configureOpenApi } from './configure-openapi';
import { configureSecurity } from './configure-security';
import { configureValidation } from './configure-validation';

/** Shared by main.ts and e2e tests so tests exercise the real HTTP pipeline. */
export function configureApp(app: INestApplication): AppConfig {
  const config = app.get<AppConfig>(APP_CONFIG);
  app.useLogger(app.get(Logger));
  app.use(requestContextMiddleware);
  app.enableVersioning({ type: VersioningType.URI, prefix: 'v' });
  configureSecurity(app, config);
  configureValidation(app);
  configureOpenApi(app, config);
  app.enableShutdownHooks();
  return config;
}
