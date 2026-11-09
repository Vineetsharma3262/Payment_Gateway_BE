import type { INestApplication } from '@nestjs/common';

/**
 * Validation strategy: Zod only. There is intentionally no global
 * class-validator ValidationPipe; each route binds a ZodValidationPipe to its
 * request schema (shared/presentation/validation), and the global
 * HttpExceptionFilter (registered as APP_FILTER) renders failures as
 * `400 validation_failed` with per-field details.
 */
export function configureValidation(_app: INestApplication): void {
  // Nothing to register globally; kept as the documented extension point.
}
