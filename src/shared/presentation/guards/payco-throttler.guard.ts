import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';

/**
 * Rate limit per API key id when a key is presented (so one merchant cannot
 * exhaust another's budget behind a shared NAT), otherwise per client IP.
 * Only the non-secret key-id segment is used as the tracker.
 */
@Injectable()
export class PaycoThrottlerGuard extends ThrottlerGuard {
  protected override getTracker(req: Record<string, unknown>): Promise<string> {
    const request = req as unknown as Request;
    const keyId = request
      .header('authorization')
      ?.match(/^Bearer\s+sk_(?:test|live)_([A-Za-z0-9]+)_/i)?.[1];
    return Promise.resolve(keyId ? `key:${keyId}` : `ip:${request.ip ?? 'unknown'}`);
  }
}
