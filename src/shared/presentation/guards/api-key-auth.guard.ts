import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import {
  API_KEY_AUTHENTICATOR,
  AuthenticationFailedError,
  type ApiKeyAuthenticator,
} from '../../application/authentication.port';
import type { AuthenticatedRequest } from '../decorators/current-merchant.decorator';

/**
 * Server-to-server merchant authentication: `Authorization: Bearer sk_{mode}_…`.
 * Secret keys must never be embedded in browsers or mobile apps.
 */
@Injectable()
export class ApiKeyAuthGuard implements CanActivate {
  constructor(@Inject(API_KEY_AUTHENTICATOR) private readonly authenticator: ApiKeyAuthenticator) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.header('authorization');
    const match = header?.match(/^Bearer\s+(\S+)$/i);
    if (!match) throw new AuthenticationFailedError();
    request.merchant = await this.authenticator.authenticate(match[1]);
    return true;
  }
}
