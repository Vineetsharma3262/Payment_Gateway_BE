import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import {
  ACCESS_TOKEN_VERIFIER,
  InvalidTokenError,
  PERMISSION_CHECKER,
  type AccessTokenVerifier,
  type Permission,
  type PermissionChecker,
} from '../../application/authorization.port';
import { ForbiddenError } from '../../application/application-error';
import type { UserContext } from '../../application/user-context';

export type UserRequest = Request & { user?: UserContext };

const PERMISSIONS_KEY = 'payco:permissions';
const PLATFORM_ADMIN_KEY = 'payco:platform-admin';

/** All listed permissions are required. */
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
/** Internal PayCo administration endpoints. */
export const RequirePlatformAdmin = () => SetMetadata(PLATFORM_ADMIN_KEY, true);

/**
 * Dashboard authentication (`Authorization: Bearer <access JWT>`) plus RBAC.
 * Merchant API keys are not accepted here.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    @Inject(ACCESS_TOKEN_VERIFIER) private readonly verifier: AccessTokenVerifier,
    @Inject(PERMISSION_CHECKER) private readonly permissions: PermissionChecker,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<UserRequest>();
    const token = request.header('authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1];
    if (!token || token.startsWith('sk_')) throw new InvalidTokenError();
    const user = await this.verifier.verify(token);
    request.user = user;

    const targets = [context.getHandler(), context.getClass()];
    if (
      this.reflector.getAllAndOverride<boolean>(PLATFORM_ADMIN_KEY, targets) &&
      !user.isPlatformAdmin
    ) {
      throw new ForbiddenError();
    }
    const required = this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS_KEY, targets) ?? [];
    if (required.length > 0) {
      if (!user.merchantId) throw new ForbiddenError('This action requires a merchant workspace.');
      if (!required.every((p) => this.permissions.can(user.role, p))) throw new ForbiddenError();
    }
    return true;
  }
}
