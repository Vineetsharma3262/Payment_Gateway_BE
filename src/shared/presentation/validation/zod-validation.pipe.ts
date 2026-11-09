import { type PipeTransform } from '@nestjs/common';
import { z, type ZodType } from 'zod';
import { RequestValidationError } from './request-validation.error';

/**
 * Zod is the single validation mechanism for HTTP input. Schemas live in each
 * module's presentation/request-dto folder and also generate the OpenAPI schema.
 */
export class ZodValidationPipe<T extends ZodType> implements PipeTransform<unknown, z.output<T>> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.output<T> {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;
    throw new RequestValidationError(
      result.error.issues.map((issue) => ({
        field: issue.path.join('.') || '(body)',
        message: issue.message,
      })),
    );
  }
}

/** OpenAPI 3 schema object derived from a Zod schema, for @ApiBody / @ApiQuery. */
export function toOpenApiSchema(schema: ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema, { target: 'openapi-3.0', io: 'input' }) as Record<
    string,
    unknown
  >;
  delete json.$schema;
  return json;
}
