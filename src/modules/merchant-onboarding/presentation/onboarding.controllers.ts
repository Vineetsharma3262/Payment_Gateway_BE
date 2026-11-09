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
  RequirePermissions,
  RequirePlatformAdmin,
} from '../../../shared/presentation/guards/jwt-auth.guard';
import { paginationQuerySchema } from '../../../shared/presentation/validation/pagination';
import {
  toOpenApiSchema,
  ZodValidationPipe,
} from '../../../shared/presentation/validation/zod-validation.pipe';
import type { ApplicationDto, OnboardingUseCases } from '../application/onboarding.use-cases';
import { ALLOWED_DOCUMENT_CONTENT_TYPES } from '../domain/onboarding-document';
import { BUSINESS_TYPES, DOCUMENT_TYPES } from '../domain/onboarding.types';
import { ONBOARDING_USE_CASES } from '../onboarding.tokens';

const addressSchema = z
  .object({
    line1: z.string().trim().min(1).max(200),
    line2: z.string().trim().max(200).nullable().optional(),
    city: z.string().trim().min(1).max(100),
    state: z.string().trim().length(2),
    postal_code: z.string().trim().max(10),
    country: z.literal('US'),
  })
  .strict();

const ownerSchema = z
  .object({
    id: z.string().max(40).optional(),
    first_name: z.string().trim().min(1).max(100),
    last_name: z.string().trim().min(1).max(100),
    email: z.email().max(254),
    title: z.string().trim().max(100).nullable().optional(),
    ownership_percent: z.number().int().min(0).max(100),
    is_controller: z.boolean(),
    date_of_birth: z.iso.date().optional().describe('Write-only. YYYY-MM-DD.'),
    ssn_last4: z
      .string()
      .regex(/^\d{4}$/)
      .optional()
      .describe('Write-only.'),
  })
  .strict();

const updateSchema = z
  .object({
    legal_business_name: z.string().trim().min(2).max(200).optional(),
    doing_business_as: z.string().trim().max(200).nullable().optional(),
    business_type: z.enum(BUSINESS_TYPES).optional(),
    ein: z
      .string()
      .regex(/^\d{2}-?\d{7}$/)
      .transform((v) => v.replace('-', ''))
      .optional()
      .describe('Write-only. Only the last 4 digits are ever returned.'),
    website: z.url().max(300).nullable().optional(),
    phone: z
      .string()
      .trim()
      .regex(/^\+1\d{10}$/, 'E.164 US number, e.g. +14155550100')
      .optional(),
    address: addressSchema.optional(),
    owners: z.array(ownerSchema).max(5).optional(),
    bank_account: z
      .object({ token: z.string().min(4).max(200), last4: z.string().regex(/^\d{4}$/) })
      .strict()
      .optional()
      .describe('Token from the gateway-hosted bank account field; never raw account numbers.'),
    accept_provider_terms: z
      .literal(true)
      .optional()
      .describe('Accept the payment processor’s sub-merchant terms.'),
  })
  .strict();

const documentSchema = z
  .object({
    document_type: z.enum(DOCUMENT_TYPES),
    content_type: z.enum(ALLOWED_DOCUMENT_CONTENT_TYPES),
  })
  .strict();

const decisionSchema = z
  .object({
    decision: z.enum(['approved', 'needs_information', 'rejected']),
    requirements: z.array(z.string().max(100)).max(50).optional(),
    reason: z.string().max(500).optional(),
  })
  .strict();

const adminListSchema = paginationQuerySchema.extend({
  status: z
    .enum(['draft', 'submitted', 'pending_review', 'needs_information', 'approved', 'rejected'])
    .optional(),
});

function applicationResponse(a: ApplicationDto) {
  return {
    id: a.id,
    object: 'onboarding_application',
    status: a.status,
    business: {
      legal_business_name: a.legalBusinessName,
      doing_business_as: a.doingBusinessAs,
      business_type: a.businessType,
      ein_last4: a.einLast4,
      website: a.website,
      phone: a.phone,
      address: a.address && {
        line1: a.address.line1,
        line2: a.address.line2,
        city: a.address.city,
        state: a.address.state,
        postal_code: a.address.postalCode,
        country: a.address.country,
      },
    },
    owners: a.owners.map((o) => ({
      id: o.id,
      first_name: o.firstName,
      last_name: o.lastName,
      email: o.email,
      title: o.title,
      ownership_percent: o.ownershipPercent,
      is_controller: o.isController,
      date_of_birth_provided: o.dateOfBirthProvided,
      ssn_last4_provided: o.ssnLast4Provided,
    })),
    bank_account: a.bankAccountLast4 ? { last4: a.bankAccountLast4 } : null,
    provider_terms_accepted: a.providerTermsAccepted,
    requirements: a.requirements,
    submitted_at: a.submittedAt,
    decided_at: a.decidedAt,
    rejection_reason: a.rejectionReason,
  };
}

/**
 * Merchant onboarding (dashboard). PayCo collects and forwards KYB/KYC data;
 * the payment processor makes the verification decision.
 */
@ApiTags('Onboarding')
@ApiBearerAuth('session')
@UseGuards(JwtAuthGuard)
@Controller({ path: 'onboarding', version: '1' })
export class OnboardingController {
  constructor(@Inject(ONBOARDING_USE_CASES) private readonly onboarding: OnboardingUseCases) {}

  @Post('application')
  @RequirePermissions('onboarding:write')
  @ApiOperation({ summary: 'Create the onboarding application (idempotent; created at signup)' })
  async create(@CurrentUser() user: UserContext) {
    const existing = await this.onboarding.get(user.merchantId!).catch(() => null);
    if (existing) return applicationResponse(existing);
    await this.onboarding.start(user.merchantId!, '');
    return applicationResponse(await this.onboarding.get(user.merchantId!));
  }

  @Get('application')
  @RequirePermissions('onboarding:read')
  @ApiOperation({ summary: 'Get onboarding application and status' })
  async get(@CurrentUser() user: UserContext) {
    return applicationResponse(await this.onboarding.get(user.merchantId!));
  }

  @Patch('application')
  @RequirePermissions('onboarding:write')
  @ApiOperation({
    summary: 'Update business, owner and bank details (draft / needs_information only)',
  })
  @ApiBody({ schema: toOpenApiSchema(updateSchema) })
  async update(
    @CurrentUser() user: UserContext,
    @Body(new ZodValidationPipe(updateSchema)) b: z.infer<typeof updateSchema>,
  ) {
    const dto = await this.onboarding.update(
      user.merchantId!,
      {
        legalBusinessName: b.legal_business_name,
        doingBusinessAs: b.doing_business_as,
        businessType: b.business_type,
        ein: b.ein,
        website: b.website,
        phone: b.phone,
        address: b.address && {
          line1: b.address.line1,
          line2: b.address.line2 ?? null,
          city: b.address.city,
          state: b.address.state.toUpperCase(),
          postalCode: b.address.postal_code,
          country: 'US',
        },
        owners: b.owners?.map((o) => ({
          id: o.id,
          firstName: o.first_name,
          lastName: o.last_name,
          email: o.email,
          title: o.title,
          ownershipPercent: o.ownership_percent,
          isController: o.is_controller,
          dateOfBirth: o.date_of_birth,
          ssnLast4: o.ssn_last4,
        })),
        bankAccount: b.bank_account,
        acceptProviderTerms: b.accept_provider_terms,
      },
      { type: 'user', id: user.userId },
    );
    return applicationResponse(dto);
  }

  @Get('requirements')
  @RequirePermissions('onboarding:read')
  @ApiOperation({ summary: 'Outstanding verification requirements' })
  async requirements(@CurrentUser() user: UserContext) {
    const app = await this.onboarding.get(user.merchantId!);
    return { status: app.status, requirements: app.requirements };
  }

  @Post('application/submit')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('onboarding:write')
  @ApiOperation({ summary: 'Submit for verification by the payment processor' })
  async submit(@CurrentUser() user: UserContext) {
    const result = await this.onboarding.submit(user.merchantId!, {
      type: 'user',
      id: user.userId,
    });
    return {
      ...applicationResponse(result.application),
      provider_submission: result.providerSubmission.status,
    };
  }

  @Post('documents')
  @RequirePermissions('onboarding:write')
  @ApiOperation({ summary: 'Get a short-lived upload URL for a verification document' })
  @ApiBody({ schema: toOpenApiSchema(documentSchema) })
  async document(
    @CurrentUser() user: UserContext,
    @Body(new ZodValidationPipe(documentSchema)) b: z.infer<typeof documentSchema>,
  ) {
    const result = await this.onboarding.requestDocumentUpload(
      user.merchantId!,
      { documentType: b.document_type, contentType: b.content_type },
      { type: 'user', id: user.userId },
    );
    return {
      id: result.documentId,
      upload: {
        url: result.upload.url,
        method: 'PUT',
        headers: result.upload.requiredHeaders,
        expires_at: result.upload.expiresAt.toISOString(),
      },
    };
  }

  @Get('documents')
  @RequirePermissions('onboarding:read')
  @ApiOperation({ summary: 'List uploaded verification documents (metadata only)' })
  async documents(@CurrentUser() user: UserContext) {
    return (await this.onboarding.listDocuments(user.merchantId!)).map((d) => ({
      id: d.id,
      document_type: d.documentType,
      content_type: d.contentType,
      status: d.status,
      created_at: d.createdAt,
    }));
  }
}

/** Internal administrators: onboarding review status as reported by the gateway. */
@ApiTags('Admin')
@ApiBearerAuth('session')
@UseGuards(JwtAuthGuard)
@RequirePlatformAdmin()
@Controller({ path: 'admin/onboarding/applications', version: '1' })
export class AdminOnboardingController {
  constructor(@Inject(ONBOARDING_USE_CASES) private readonly onboarding: OnboardingUseCases) {}

  @Get()
  @ApiOperation({ summary: 'List onboarding applications by status' })
  async list(@Query(new ZodValidationPipe(adminListSchema)) q: z.infer<typeof adminListSchema>) {
    const page = await this.onboarding.adminList(
      { status: q.status },
      { limit: q.limit, startingAfter: q.starting_after },
    );
    return {
      ...page,
      items: page.items.map((a) => ({ ...applicationResponse(a), merchant_id: a.merchantId })),
    };
  }

  @Post(':applicationId/provider-decision')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Record the payment processor’s KYB decision (audited). Approval enables live mode.',
  })
  @ApiBody({ schema: toOpenApiSchema(decisionSchema) })
  async decision(
    @CurrentUser() user: UserContext,
    @Param('applicationId') applicationId: string,
    @Body(new ZodValidationPipe(decisionSchema)) b: z.infer<typeof decisionSchema>,
  ) {
    const dto = await this.onboarding.recordProviderDecision(
      applicationId,
      b.decision,
      { requirements: b.requirements, reason: b.reason },
      { type: 'user', id: user.userId },
    );
    return applicationResponse(dto);
  }

  @Post(':applicationId/retry-provider-submission')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Retry sending a submitted application to the payment processor' })
  async retry(@Param('applicationId') applicationId: string) {
    return {
      provider_submission: (await this.onboarding.retryProviderSubmission(applicationId)).status,
    };
  }
}
