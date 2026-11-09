import {
  MerchantNotPermittedError,
  ResourceNotFoundError,
} from '../../../shared/application/application-error';
import type { AuditLog } from '../../../shared/application/audit-log.port';
import type { Clock } from '../../../shared/application/clock.port';
import type { IdGenerator } from '../../../shared/application/id-generator.port';
import type { ApiMode } from '../../../shared/application/merchant-context';
import type { SecureTokenGenerator } from '../../../shared/application/secure-token.port';
import type { UnitOfWork } from '../../../shared/application/unit-of-work.port';
import type { MerchantPaymentProfileReader } from '../../merchants/public-api';
import { ApiKey } from '../domain/api-key';
import type { ApiKeyRepository } from '../domain/api-key.repository';
import type { ApiKeyIssuer, IssuedApiKey } from '../public-api';
import type { ApiKeySecretHasher } from './api-key-secret-hasher.port';
import { formatApiKey } from './api-key-format';

export interface ApiKeySummary {
  id: string;
  mode: ApiMode;
  label: string;
  last4: string;
  createdAt: string;
  revokedAt: string | null;
}

export interface ApiKeyDependencies {
  unitOfWork: UnitOfWork;
  keys: ApiKeyRepository;
  hasher: ApiKeySecretHasher;
  merchants: MerchantPaymentProfileReader;
  audit: AuditLog;
  tokens: SecureTokenGenerator;
  ids: IdGenerator;
  clock: Clock;
}

type Actor = { type: 'user' | 'system'; id: string };

export class ApiKeyUseCases implements ApiKeyIssuer {
  constructor(private readonly deps: ApiKeyDependencies) {}

  /** Caller's unit of work is joined when present (e.g. signup). */
  async issue(input: {
    merchantId: string;
    mode: ApiMode;
    label: string;
    actor: Actor;
  }): Promise<IssuedApiKey> {
    if (input.mode === 'live') {
      const profile = await this.deps.merchants.getPaymentProfile(input.merchantId);
      if (!profile?.liveChargesEnabled) {
        throw new MerchantNotPermittedError('Live keys are available once onboarding is approved.');
      }
    }
    const secret = this.deps.tokens.generate().slice(0, 40);
    const key = ApiKey.issue({
      id: this.deps.ids.next('key'),
      merchantId: input.merchantId,
      mode: input.mode,
      label: input.label,
      secretHash: this.deps.hasher.hash(secret),
      last4: secret.slice(-4),
      createdAt: this.deps.clock.now(),
    });
    await this.deps.unitOfWork.run(async () => {
      await this.deps.keys.insert(key);
      await this.deps.audit.record({
        merchantId: input.merchantId,
        actor: input.actor,
        action: 'api_key.issued',
        resource: { type: 'api_key', id: key.id },
        metadata: { mode: input.mode },
      });
    });
    const p = key.toProps();
    return {
      id: p.id,
      secret: formatApiKey(p.mode, p.id, secret),
      mode: p.mode,
      label: p.label,
      last4: p.last4,
      createdAt: p.createdAt.toISOString(),
    };
  }

  async list(merchantId: string): Promise<ApiKeySummary[]> {
    return (await this.deps.keys.listForMerchant(merchantId)).map((k) => {
      const p = k.toProps();
      return {
        id: p.id,
        mode: p.mode,
        label: p.label,
        last4: p.last4,
        createdAt: p.createdAt.toISOString(),
        revokedAt: p.revokedAt?.toISOString() ?? null,
      };
    });
  }

  async revoke(merchantId: string, keyId: string, actor: Actor): Promise<void> {
    await this.deps.unitOfWork.run(async () => {
      const key = await this.deps.keys.findById(keyId);
      if (!key || key.merchantId !== merchantId) throw new ResourceNotFoundError('api_key', keyId);
      key.revoke(this.deps.clock.now());
      await this.deps.keys.save(key);
      await this.deps.audit.record({
        merchantId,
        actor,
        action: 'api_key.revoked',
        resource: { type: 'api_key', id: keyId },
      });
    });
  }
}
