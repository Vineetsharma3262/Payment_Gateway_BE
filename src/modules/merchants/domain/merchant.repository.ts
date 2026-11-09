import type { Page, PageRequest } from '../../../shared/domain/pagination';
import type { Merchant, MerchantStatus } from './merchant';

type ApiMode = 'test' | 'live';

export interface ProviderAccountRecord {
  provider: string;
  mode: ApiMode;
  providerAccountId: string;
  providerStatus: string;
}

export interface MerchantRepository {
  findById(id: string): Promise<Merchant | null>;
  list(filter: { status?: MerchantStatus }, page: PageRequest): Promise<Page<Merchant>>;
  insert(merchant: Merchant): Promise<void>;
  save(merchant: Merchant): Promise<void>;
  findProviderAccount(merchantId: string, mode: ApiMode): Promise<ProviderAccountRecord | null>;
  saveProviderAccount(merchantId: string, account: ProviderAccountRecord): Promise<void>;
}

export const MERCHANT_REPOSITORY = Symbol('MerchantRepository');
