import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import type { UserContext } from '../../../shared/application/user-context';
import { CurrentUser } from '../../../shared/presentation/decorators/current-user.decorator';
import {
  JwtAuthGuard,
  RequirePlatformAdmin,
} from '../../../shared/presentation/guards/jwt-auth.guard';
import {
  toOpenApiSchema,
  ZodValidationPipe,
} from '../../../shared/presentation/validation/zod-validation.pipe';
import {
  USER_ADMIN_USE_CASES,
  UserAdminUseCases,
  type AdminUserDto,
} from '../application/user-admin.use-cases';
import type {
  AdminUserListFilters,
  UserRepository,
} from '../domain/identity.repositories';
import { USER_REPOSITORY } from '../domain/identity.repositories';

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().max(200).optional(),
  status: z.enum(['active', 'disabled', 'invited']).optional(),
  role: z.enum(['super_admin', 'admin', 'staff', 'merchant']).optional(),
});

const createUserSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    email: z.email().max(254),
    role: z.enum(['admin', 'staff', 'merchant']),
    merchantId: z.string().max(40).optional(),
    password: z.string().min(1).max(200),
    sendLoginEmail: z.boolean().default(true),
  })
  .strict();

const setStatusSchema = z.object({ status: z.enum(['active', 'disabled']) }).strict();

const resetPasswordSchema = z
  .object({
    password: z.string().min(1).max(200),
    sendLoginEmail: z.boolean().default(true),
  })
  .strict();

/**
 * `GET /v1/users` lists every account on the platform. `POST /v1/users` creates
 * one and (optionally) emails the login details through Resend. Platform admins
 * only — matches the FE `canManage` rule.
 */
@ApiTags('Users')
@ApiBearerAuth('session')
@UseGuards(JwtAuthGuard)
@RequirePlatformAdmin()
@Controller({ path: 'users', version: '1' })
export class UsersAdminController {
  constructor(
    @Inject(USER_ADMIN_USE_CASES) private readonly users: UserAdminUseCases,
    @Inject(USER_REPOSITORY) private readonly userRepo: UserRepository,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List users (Nimbus team + merchant accounts)' })
  async list(
    @Query(new ZodValidationPipe(listQuerySchema)) q: z.infer<typeof listQuerySchema>,
  ) {
    const filters: AdminUserListFilters = {
      page: q.page,
      pageSize: q.pageSize,
      search: q.search,
      status: q.status,
      role: q.role,
    };
    const result = await this.users.list(filters);
    return {
      data: result.items.map((item) => this.toSnakeCase(UserAdminUseCases.toDto(item))),
      meta: {
        pagination: {
          page: result.page,
          page_size: result.pageSize,
          total_items: result.total,
          total_pages: Math.max(1, Math.ceil(result.total / result.pageSize)),
        },
      },
    };
  }

  @Post()
  @ApiOperation({ summary: 'Create a new user; emails the invitation if asked' })
  @ApiBody({ schema: toOpenApiSchema(createUserSchema) })
  async create(
    @CurrentUser() actor: UserContext,
    @Body(new ZodValidationPipe(createUserSchema)) body: z.infer<typeof createUserSchema>,
  ) {
    const actorEmail = await this.resolveActorEmail(actor.userId);
    const item = await this.users.create({
      name: body.name,
      email: body.email,
      role: body.role,
      merchantId: body.merchantId,
      password: body.password,
      sendLoginEmail: body.sendLoginEmail,
      actorEmail,
    });
    return this.toSnakeCase(UserAdminUseCases.toDto(item));
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Enable or disable a user' })
  @ApiBody({ schema: toOpenApiSchema(setStatusSchema) })
  async patch(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(setStatusSchema)) body: z.infer<typeof setStatusSchema>,
  ) {
    const item = await this.users.setStatus(id, body.status);
    return this.toSnakeCase(UserAdminUseCases.toDto(item));
  }

  @Post(':id/reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Issue a new temporary password + email it' })
  @ApiBody({ schema: toOpenApiSchema(resetPasswordSchema) })
  async resetPassword(
    @CurrentUser() actor: UserContext,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(resetPasswordSchema)) body: z.infer<typeof resetPasswordSchema>,
  ) {
    const actorEmail = await this.resolveActorEmail(actor.userId);
    const item = await this.users.resetPassword(id, {
      password: body.password,
      sendLoginEmail: body.sendLoginEmail,
      actorEmail,
    });
    return this.toSnakeCase(UserAdminUseCases.toDto(item));
  }

  private async resolveActorEmail(userId: string): Promise<string> {
    const actor = await this.userRepo.findById(userId);
    return actor?.email ?? 'A Nimbus admin';
  }

  /** FE DTO is already snake_case for merchant+status; this just emits the right keys. */
  private toSnakeCase(dto: AdminUserDto): Record<string, unknown> {
    return {
      id: dto.id,
      name: dto.name,
      email: dto.email,
      role: dto.role,
      merchant: dto.merchant,
      status: dto.status,
      must_change_password: dto.mustChangePassword,
      last_login_at: dto.lastLoginAt,
      created_at: dto.createdAt,
    };
  }
}
