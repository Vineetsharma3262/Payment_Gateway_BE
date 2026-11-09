import { ResourceNotFoundError } from '../../../shared/application/application-error';
import type { AuditLog } from '../../../shared/application/audit-log.port';
import type { Clock } from '../../../shared/application/clock.port';
import type { DomainEventPublisher } from '../../../shared/application/domain-event-publisher.port';
import type { IdGenerator } from '../../../shared/application/id-generator.port';
import type { ApiMode } from '../../../shared/application/merchant-context';
import type { Page, PageRequest } from '../../../shared/application/pagination';
import type { UnitOfWork } from '../../../shared/application/unit-of-work.port';
import type {
  PaymentProviderName,
  PaymentProviderRegistry,
} from '../../../integrations/payment-providers/domain-ports/payment-provider.port';
import { ProviderError } from '../../../integrations/payment-providers/domain-ports/provider-errors';
import { Merchant, type MerchantSettings, type MerchantStatus } from '../domain/merchant';
import type { MerchantRepository } from '../domain/merchant.repository';
import type {
  MerchantLifecycle,
  MerchantRegistrar,
  ProviderAccountProvisioning,
} from '../public-api';

export interface MerchantDto {
  id: string;
  legalName: string;
  displayName: string;
  status: MerchantStatus;
  liveChargesEnabled: boolean;
  brandColor: string | null;
  logoUrl: string | null;
  statementDescriptor: string | null;
  paymentMethods: string[];
  feeScheduleId: string | null;
  createdAt: string;
}

export interface MerchantDependencies {
  unitOfWork: UnitOfWork;
  merchants: MerchantRepository;
  events: DomainEventPublisher;
  audit: AuditLog;
  providers: PaymentProviderRegistry;
  defaultProvider: PaymentProviderName;
  ids: IdGenerator;
  clock: Clock;
}

type Actor = { type: 'user' | 'system' | 'provider'; id: string };

export function toMerchantDto(m: Merchant): MerchantDto {
  const p = m.toProps();
  return {
    id: p.id,
    legalName: p.legalName,
    displayName: p.displayName,
    status: p.status,
    liveChargesEnabled: p.liveChargesEnabled,
    brandColor: p.brandColor,
    logoUrl: p.logoUrl,
    statementDescriptor: p.statementDescriptor,
    paymentMethods: p.paymentMethods,
    feeScheduleId: p.feeScheduleId,
    createdAt: p.createdAt.toISOString(),
  };
}

export class MerchantUseCases implements MerchantRegistrar, MerchantLifecycle {
  constructor(private readonly deps: MerchantDependencies) {}

  async register(input: {
    legalName: string;
    displayName: string;
  }): Promise<{ merchantId: string }> {
    const merchant = Merchant.register({
      id: this.deps.ids.next('mer'),
      ...input,
      now: this.deps.clock.now(),
    });
    await this.deps.merchants.insert(merchant);
    await this.deps.events.publish(merchant.pullEvents());
    return { merchantId: merchant.id };
  }

  async get(merchantId: string): Promise<MerchantDto> {
    return toMerchantDto(await this.load(merchantId));
  }

  async updateSettings(
    merchantId: string,
    patch: Partial<MerchantSettings>,
    actor: Actor,
  ): Promise<MerchantDto> {
    return this.deps.unitOfWork.run(async () => {
      const merchant = await this.load(merchantId);
      merchant.updateSettings(patch, this.deps.clock.now());
      await this.deps.merchants.save(merchant);
      await this.deps.audit.record({
        merchantId,
        actor,
        action: 'merchant.settings_updated',
        resource: { type: 'merchant', id: merchantId },
        metadata: { fields: Object.keys(patch) },
      });
      return toMerchantDto(merchant);
    });
  }

  async enableLiveCharges(merchantId: string, actor: Actor): Promise<void> {
    await this.deps.unitOfWork.run(async () => {
      const merchant = await this.load(merchantId);
      merchant.enableLiveCharges(this.deps.clock.now());
      await this.deps.merchants.save(merchant);
      await this.deps.events.publish(merchant.pullEvents());
      await this.deps.audit.record({
        merchantId,
        actor,
        action: 'merchant.live_enabled',
        resource: { type: 'merchant', id: merchantId },
      });
    });
  }

  async ensureProviderAccount(
    merchantId: string,
    mode: ApiMode,
    legalName: string,
    email: string,
  ): Promise<ProviderAccountProvisioning> {
    const existing = await this.deps.merchants.findProviderAccount(merchantId, mode);
    if (existing) {
      return {
        status: 'ready',
        provider: existing.provider as PaymentProviderName,
        accountId: existing.providerAccountId,
      };
    }
    const provider = this.deps.providers.get(this.deps.defaultProvider);
    try {
      const state = await provider.createSubMerchantAccount({
        mode,
        reference: merchantId,
        legalBusinessName: legalName,
        email,
      });
      await this.deps.merchants.saveProviderAccount(merchantId, {
        provider: provider.name,
        mode,
        providerAccountId: state.account.accountId,
        providerStatus: state.status,
      });
      return { status: 'ready', provider: provider.name, accountId: state.account.accountId };
    } catch (error) {
      if (error instanceof ProviderError) return { status: 'unavailable', reason: error.message };
      throw error;
    }
  }

  async list(filter: { status?: MerchantStatus }, page: PageRequest): Promise<Page<MerchantDto>> {
    const result = await this.deps.merchants.list(filter, page);
    return { ...result, items: result.items.map(toMerchantDto) };
  }

  async changeStatus(
    merchantId: string,
    status: MerchantStatus,
    reason: string,
    actor: Actor,
  ): Promise<MerchantDto> {
    return this.deps.unitOfWork.run(async () => {
      const merchant = await this.load(merchantId);
      const from = merchant.status;
      merchant.changeStatus(status, this.deps.clock.now());
      await this.deps.merchants.save(merchant);
      await this.deps.events.publish(merchant.pullEvents());
      await this.deps.audit.record({
        merchantId,
        actor,
        action: 'merchant.status_changed',
        resource: { type: 'merchant', id: merchantId },
        metadata: { from, to: status, reason },
      });
      return toMerchantDto(merchant);
    });
  }

  async assignFeeSchedule(
    merchantId: string,
    feeScheduleId: string | null,
    actor: Actor,
  ): Promise<MerchantDto> {
    return this.deps.unitOfWork.run(async () => {
      const merchant = await this.load(merchantId);
      merchant.assignFeeSchedule(feeScheduleId, this.deps.clock.now());
      await this.deps.merchants.save(merchant);
      await this.deps.audit.record({
        merchantId,
        actor,
        action: 'merchant.fee_schedule_assigned',
        resource: { type: 'merchant', id: merchantId },
        metadata: { fee_schedule_id: feeScheduleId },
      });
      return toMerchantDto(merchant);
    });
  }

  private async load(merchantId: string): Promise<Merchant> {
    const merchant = await this.deps.merchants.findById(merchantId);
    if (!merchant) throw new ResourceNotFoundError('merchant', merchantId);
    return merchant;
  }
}
