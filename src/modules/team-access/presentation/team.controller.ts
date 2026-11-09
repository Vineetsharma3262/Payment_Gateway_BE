import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import type { UserContext } from '../../../shared/application/user-context';
import { CurrentUser } from '../../../shared/presentation/decorators/current-user.decorator';
import {
  JwtAuthGuard,
  RequirePermissions,
} from '../../../shared/presentation/guards/jwt-auth.guard';
import {
  toOpenApiSchema,
  ZodValidationPipe,
} from '../../../shared/presentation/validation/zod-validation.pipe';
import type { TeamUseCases } from '../application/team.use-cases';
import { INVITABLE_ROLES, ROLES } from '../domain/roles';
import { TEAM_USE_CASES } from '../team.tokens';

const inviteSchema = z
  .object({ email: z.email().max(254), role: z.enum(INVITABLE_ROLES) })
  .strict();
const changeRoleSchema = z.object({ role: z.enum(ROLES) }).strict();

const actorOf = (user: UserContext) => ({ merchantId: user.merchantId!, userId: user.userId });

/** Dashboard (JWT session + RBAC). */
@ApiTags('Team')
@ApiBearerAuth('session')
@UseGuards(JwtAuthGuard)
@Controller({ path: 'team', version: '1' })
export class TeamController {
  constructor(@Inject(TEAM_USE_CASES) private readonly team: TeamUseCases) {}

  @Get('members')
  @RequirePermissions('team:read')
  @ApiOperation({ summary: 'List team members' })
  async members(@CurrentUser() user: UserContext) {
    const members = await this.team.listMembers(actorOf(user));
    return members.map((m) => ({
      id: m.membershipId,
      user_id: m.userId,
      email: m.email,
      role: m.role,
      created_at: m.createdAt,
    }));
  }

  @Post('invitations')
  @RequirePermissions('team:manage')
  @ApiOperation({ summary: 'Invite a team member (link is emailed)' })
  @ApiBody({ schema: toOpenApiSchema(inviteSchema) })
  async invite(
    @CurrentUser() user: UserContext,
    @Body(new ZodValidationPipe(inviteSchema)) body: z.infer<typeof inviteSchema>,
  ) {
    const result = await this.team.invite(actorOf(user), body.email, body.role);
    return { id: result.invitationId, expires_at: result.expiresAt };
  }

  @Delete('invitations/:invitationId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('team:manage')
  @ApiOperation({ summary: 'Revoke a pending invitation' })
  async revoke(
    @CurrentUser() user: UserContext,
    @Param('invitationId') invitationId: string,
  ): Promise<void> {
    await this.team.revokeInvitation(actorOf(user), invitationId);
  }

  @Patch('members/:membershipId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('team:manage')
  @ApiOperation({ summary: 'Change a member’s role' })
  @ApiBody({ schema: toOpenApiSchema(changeRoleSchema) })
  async changeRole(
    @CurrentUser() user: UserContext,
    @Param('membershipId') membershipId: string,
    @Body(new ZodValidationPipe(changeRoleSchema)) body: z.infer<typeof changeRoleSchema>,
  ): Promise<void> {
    await this.team.changeRole(actorOf(user), membershipId, body.role);
  }
}
