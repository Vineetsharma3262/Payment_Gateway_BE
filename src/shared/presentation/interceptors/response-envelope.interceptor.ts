import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { map, type Observable } from 'rxjs';

const RAW_RESPONSE = 'payco:raw-response';
/** Opt a handler out of the envelope (e.g. health probes consumed by load balancers). */
export const RawResponse = () => SetMetadata(RAW_RESPONSE, true);

export interface CursorPage<T> {
  items: T[];
  hasMore: boolean;
  nextCursor: string | null;
}

export function isCursorPage(value: unknown): value is CursorPage<unknown> {
  return typeof value === 'object' && value !== null && 'items' in value && 'hasMore' in value;
}

/**
 * Success envelope: `{ data, meta: { request_id } }`. Cursor pages become
 * `{ data: [...], meta: { request_id, pagination: { has_more, next_cursor } } }`.
 */
@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const raw = this.reflector.getAllAndOverride<boolean>(RAW_RESPONSE, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (raw || context.getType() !== 'http') return next.handle();
    const requestId = context.switchToHttp().getRequest<Request & { id?: string }>().id;

    return next.handle().pipe(
      map((result: unknown) =>
        isCursorPage(result)
          ? {
              data: result.items,
              meta: {
                request_id: requestId,
                pagination: { has_more: result.hasMore, next_cursor: result.nextCursor },
              },
            }
          : { data: result, meta: { request_id: requestId } },
      ),
    );
  }
}
