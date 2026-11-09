import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import type { UserContext } from '../../../shared/application/user-context';
import { CurrentUser } from '../../../shared/presentation/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../../shared/presentation/guards/jwt-auth.guard';
import {
  toOpenApiSchema,
  ZodValidationPipe,
} from '../../../shared/presentation/validation/zod-validation.pipe';
import type { IdentityUseCases, SessionTokens } from '../application/identity.use-cases';
import { PASSWORD_MAX_LENGTH } from '../domain/password-policy';
import { IDENTITY_USE_CASES } from '../identity.tokens';

const password = z.string().min(1).max(PASSWORD_MAX_LENGTH);
const registerSchema = z
  .object({
    email: z.string().max(254),
    password,
    business_name: z.string().trim().min(2).max(200),
  })
  .strict();
const loginSchema = z
  .object({ email: z.string().max(254), password, merchant_id: z.string().max(40).optional() })
  .strict();
const refreshSchema = z.object({ refresh_token: z.string().min(16).max(200) }).strict();
const forgotSchema = z.object({ email: z.string().max(254) }).strict();
const resetSchema = z.object({ token: z.string().min(16).max(200), password }).strict();
const acceptSchema = z.object({ token: z.string().min(16).max(200), password }).strict();

/** Brute-force protection on credential endpoints, in addition to account lockout. */
const STRICT = { default: { limit: 10, ttl: 60_000 } };

function sessionResponse(s: SessionTokens) {
  return {
    token_type: 'Bearer',
    access_token: s.accessToken,
    expires_in: s.expiresInSeconds,
    refresh_token: s.refreshToken,
    refresh_token_expires_at: s.refreshTokenExpiresAt,
    user: {
      id: s.user.id,
      email: s.user.email,
      is_platform_admin: s.user.isPlatformAdmin,
      platform_role: s.user.platformRole,
    },
    merchant: s.merchant
      ? { id: s.merchant.id, role: s.merchant.role, status: s.merchant.status }
      : null,
    audience: s.audience,
    home_path: s.homePath,
    navigation: s.navigation,
  };
}

/**
 * Dashboard authentication. Refresh tokens are single-use (rotated on every
 * refresh). Browser clients should keep them in an httpOnly cookie set by the
 * dashboard's backend-for-frontend, never in localStorage.
 */
@ApiTags('Auth')
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(@Inject(IDENTITY_USE_CASES) private readonly identity: IdentityUseCases) {}

  @Post('register')
  @Throttle(STRICT)
  @ApiOperation({
    summary: 'Sign up: creates user, merchant workspace and a test API key (shown once)',
  })
  @ApiBody({ schema: toOpenApiSchema(registerSchema) })
  async register(
    @Body(new ZodValidationPipe(registerSchema)) body: z.infer<typeof registerSchema>,
  ) {
    const result = await this.identity.register({
      email: body.email,
      password: body.password,
      businessName: body.business_name,
    });
    return {
      ...sessionResponse(result),
      test_api_key: {
        id: result.testApiKey.id,
        secret: result.testApiKey.secret,
        mode: result.testApiKey.mode,
        note: 'Store this key now. It will not be shown again.',
      },
    };
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle(STRICT)
  @ApiOperation({ summary: 'Sign in' })
  @ApiBody({ schema: toOpenApiSchema(loginSchema) })
  async login(@Body(new ZodValidationPipe(loginSchema)) body: z.infer<typeof loginSchema>) {
    return sessionResponse(
      await this.identity.login({
        email: body.email,
        password: body.password,
        merchantId: body.merchant_id,
      }),
    );
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate the refresh token and get a new access token' })
  @ApiBody({ schema: toOpenApiSchema(refreshSchema) })
  async refresh(@Body(new ZodValidationPipe(refreshSchema)) body: z.infer<typeof refreshSchema>) {
    return sessionResponse(await this.identity.refresh(body.refresh_token));
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke the session (all tokens of this login)' })
  @ApiBody({ schema: toOpenApiSchema(refreshSchema) })
  async logout(
    @Body(new ZodValidationPipe(refreshSchema)) body: z.infer<typeof refreshSchema>,
  ): Promise<void> {
    await this.identity.logout(body.refresh_token);
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle(STRICT)
  @ApiOperation({
    summary: 'Email a password reset link (same response whether or not the account exists)',
  })
  @ApiBody({ schema: toOpenApiSchema(forgotSchema) })
  async forgot(@Body(new ZodValidationPipe(forgotSchema)) body: z.infer<typeof forgotSchema>) {
    await this.identity.requestPasswordReset(body.email);
    return { status: 'accepted' };
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle(STRICT)
  @ApiOperation({ summary: 'Set a new password with a reset token; signs out all sessions' })
  @ApiBody({ schema: toOpenApiSchema(resetSchema) })
  async reset(
    @Body(new ZodValidationPipe(resetSchema)) body: z.infer<typeof resetSchema>,
  ): Promise<void> {
    await this.identity.resetPassword(body.token, body.password);
  }

  @Post('invitations/accept')
  @HttpCode(HttpStatus.OK)
  @Throttle(STRICT)
  @ApiOperation({ summary: 'Accept a team invitation (creates the account if needed)' })
  @ApiBody({ schema: toOpenApiSchema(acceptSchema) })
  async accept(@Body(new ZodValidationPipe(acceptSchema)) body: z.infer<typeof acceptSchema>) {
    return sessionResponse(await this.identity.acceptInvitation(body));
  }

  @Get('me')
  @ApiBearerAuth('session')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Current user, audience, home path and sidebar' })
  async me(@CurrentUser() user: UserContext) {
    const me = await this.identity.me(user.userId, user.merchantId ?? null);
    return {
      id: me.id,
      email: me.email,
      is_platform_admin: me.isPlatformAdmin,
      platform_role: me.platformRole,
      audience: me.audience,
      home_path: me.homePath,
      navigation: me.navigation,
      active_merchant: me.activeMerchant
        ? {
            id: me.activeMerchant.id,
            role: me.activeMerchant.role,
            status: me.activeMerchant.status,
          }
        : null,
      memberships: me.memberships.map((m) => ({ merchant_id: m.merchantId, role: m.role })),
    };
  }

  @Get('navigation')
  @ApiBearerAuth('session')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Audience, home path and the sidebar sections the current user may open',
  })
  async navigation(@CurrentUser() user: UserContext) {
    const nav = await this.identity.navigation(user.userId, user.merchantId ?? null);
    return {
      audience: nav.audience,
      home_path: nav.homePath,
      navigation: nav.navigation,
    };
  }
}
