import { InvariantViolationError } from '../../../shared/domain/domain-error';

export const BUSINESS_TYPES = [
  'sole_proprietorship',
  'llc',
  'corporation',
  'partnership',
  'non_profit',
] as const;
export type BusinessType = (typeof BUSINESS_TYPES)[number];

export const DOCUMENT_TYPES = [
  'business_registration',
  'ein_letter',
  'owner_identification',
  'bank_statement',
  'other',
] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export interface Address {
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: 'US';
}

/** Owners with 25%+ ownership and the controlling person (PRD 5.3 step 2). */
export interface Owner {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  title: string | null;
  ownershipPercent: number;
  isController: boolean;
  /** Application-encrypted; null when not yet provided. */
  dateOfBirthEncrypted: string | null;
  ssnLast4Encrypted: string | null;
}

/** Only a gateway token and display digits; PayCo never stores bank account numbers. */
export interface BankAccountRef {
  token: string;
  last4: string;
}

export const BENEFICIAL_OWNERSHIP_THRESHOLD = 25;

export function assertValidEin(ein: string): void {
  if (!/^\d{9}$/.test(ein)) throw new InvariantViolationError('EIN must be 9 digits.');
}

export function assertValidAddress(address: Address): void {
  if (!/^[A-Z]{2}$/.test(address.state))
    throw new InvariantViolationError('State must be a 2-letter code.');
  if (!/^\d{5}(-\d{4})?$/.test(address.postalCode))
    throw new InvariantViolationError('ZIP code is invalid.');
  if (address.country !== 'US')
    throw new InvariantViolationError('Only US businesses are supported.');
}

export function assertValidOwners(owners: readonly Owner[]): void {
  const total = owners.reduce((sum, o) => sum + o.ownershipPercent, 0);
  if (total > 100) throw new InvariantViolationError('Total ownership cannot exceed 100%.');
  for (const o of owners) {
    if (
      !Number.isInteger(o.ownershipPercent) ||
      o.ownershipPercent < 0 ||
      o.ownershipPercent > 100
    ) {
      throw new InvariantViolationError('Ownership must be a whole percentage between 0 and 100.');
    }
    if (o.ownershipPercent < BENEFICIAL_OWNERSHIP_THRESHOLD && !o.isController) {
      throw new InvariantViolationError(
        'List owners with 25% or more, and the controlling person.',
      );
    }
  }
  if (owners.filter((o) => o.isController).length > 1) {
    throw new InvariantViolationError('Exactly one controlling person is required.');
  }
}
