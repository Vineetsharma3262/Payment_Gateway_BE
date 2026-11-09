import {
  InvalidStateTransitionError,
  InvariantViolationError,
} from '../../../shared/domain/domain-error';
import { AesGcmFieldEncryptor } from '../../../infrastructure/crypto/aes-gcm-field-encryptor';
import { FakePaymentProvider } from '../../../integrations/payment-providers/testing/fake-payment-provider';
import { StaticPaymentProviderRegistry } from '../../../integrations/payment-providers/testing/in-memory-provider-registry';
import {
  OnboardingUseCases,
  type UpdateApplicationInput,
} from '../../../modules/merchant-onboarding/application/onboarding.use-cases';
import { MerchantUseCases } from '../../../modules/merchants/application/merchant.use-cases';
import {
  FixedClock,
  PassThroughUnitOfWork,
  RecordingEventPublisher,
  SequentialIdGenerator,
} from '../../support/fakes';
import {
  FakeDocumentStorage,
  InMemoryMerchants,
  InMemoryOnboarding,
  onboardingDocumentsOf,
  RecordingAuditLog,
} from '../../support/platform-fakes';

const actor = { type: 'user' as const, id: 'usr_owner' };
const encryptor = new AesGcmFieldEncryptor('k1', { k1: Buffer.alloc(32, 7).toString('base64') });

const complete: UpdateApplicationInput = {
  legalBusinessName: 'Acme Coffee LLC',
  businessType: 'llc',
  ein: '123456789',
  phone: '+14155550100',
  address: {
    line1: '1 Main St',
    line2: null,
    city: 'Austin',
    state: 'TX',
    postalCode: '78701',
    country: 'US',
  },
  owners: [
    {
      firstName: 'Ada',
      lastName: 'Owner',
      email: 'ada@acme.co',
      ownershipPercent: 60,
      isController: true,
      dateOfBirth: '1980-01-01',
      ssnLast4: '1234',
    },
  ],
  bankAccount: { token: 'btok_test_1', last4: '6789' },
  acceptProviderTerms: true,
};

async function setup() {
  const clock = new FixedClock();
  const ids = new SequentialIdGenerator();
  const merchantsStore = new InMemoryMerchants();
  const provider = new FakePaymentProvider();
  const providers = new StaticPaymentProviderRegistry([provider]);
  const audit = new RecordingAuditLog();
  const events = new RecordingEventPublisher();
  const merchants = new MerchantUseCases({
    unitOfWork: new PassThroughUnitOfWork(),
    merchants: merchantsStore,
    events,
    audit,
    providers,
    defaultProvider: 'fake',
    ids,
    clock,
  });
  const store = new InMemoryOnboarding();
  const onboarding = new OnboardingUseCases({
    unitOfWork: new PassThroughUnitOfWork(),
    applications: store,
    documents: onboardingDocumentsOf(store),
    storage: new FakeDocumentStorage(),
    encryptor,
    merchants,
    providers,
    events,
    audit,
    ids,
    clock,
  });
  const { merchantId } = await merchants.register({ legalName: 'Acme', displayName: 'Acme' });
  await onboarding.start(merchantId, 'Acme');
  return { onboarding, merchants, merchantsStore, store, provider, merchantId, audit };
}

describe('Merchant onboarding', () => {
  it('lists outstanding requirements for a new application', async () => {
    const { onboarding, merchantId } = await setup();
    const app = await onboarding.get(merchantId);
    expect(app.requirements).toEqual(
      expect.arrayContaining([
        'business.ein',
        'owners.controlling_person',
        'bank_account',
        'provider_terms_acceptance',
      ]),
    );
    await expect(onboarding.submit(merchantId, actor)).rejects.toBeInstanceOf(
      InvariantViolationError,
    );
  });

  it('encrypts EIN and owner identifiers and never returns them', async () => {
    const { onboarding, store, merchantId } = await setup();
    const dto = await onboarding.update(merchantId, complete, actor);
    expect(dto.einLast4).toBe('6789');
    expect(JSON.stringify(dto)).not.toMatch(/123456789|1980-01-01|"1234"/);
    const stored = store.store.all()[0].toProps();
    expect(stored.einEncrypted).toMatch(/^v1:k1:/);
    await expect(encryptor.decrypt(stored.einEncrypted!)).resolves.toBe('123456789');
    expect(dto.owners[0]).toMatchObject({ dateOfBirthProvided: true, ssnLast4Provided: true });
    expect(dto.requirements).toEqual([]);
  });

  it('keeps encrypted owner data when an owner is re-sent without sensitive fields', async () => {
    const { onboarding, merchantId } = await setup();
    const first = await onboarding.update(merchantId, complete, actor);
    const { dateOfBirth: _d, ssnLast4: _s, ...owner } = complete.owners![0];
    const second = await onboarding.update(
      merchantId,
      { owners: [{ ...owner, id: first.owners[0].id, title: 'CEO' }] },
      actor,
    );
    expect(second.owners[0]).toMatchObject({
      title: 'CEO',
      dateOfBirthProvided: true,
      ssnLast4Provided: true,
    });
  });

  it('rejects owners below 25% who are not the controller, and >100% total', async () => {
    const { onboarding, merchantId } = await setup();
    const minor = {
      firstName: 'B',
      lastName: 'C',
      email: 'b@c.co',
      ownershipPercent: 10,
      isController: false,
    };
    await expect(onboarding.update(merchantId, { owners: [minor] }, actor)).rejects.toBeInstanceOf(
      InvariantViolationError,
    );
    const big = { ...minor, ownershipPercent: 60, isController: false };
    await expect(
      onboarding.update(merchantId, { owners: [big, { ...big, email: 'x@y.co' }] }, actor),
    ).rejects.toBeInstanceOf(InvariantViolationError);
  });

  it('submits, creates the live sub-account and sends KYB data to the gateway', async () => {
    const { onboarding, merchantsStore, provider, merchantId } = await setup();
    await onboarding.update(merchantId, complete, actor);
    const result = await onboarding.submit(merchantId, actor);
    expect(result.providerSubmission).toEqual({ status: 'sent' });
    expect((await onboarding.get(merchantId)).status).toBe('pending_review');
    expect(await merchantsStore.findProviderAccount(merchantId, 'live')).toMatchObject({
      provider: 'fake',
    });
    expect(provider.calls.map((c) => c.operation)).toContain('sub_merchant.submit_onboarding');
    await expect(
      onboarding.update(merchantId, { phone: '+14155550199' }, actor),
    ).rejects.toBeInstanceOf(InvalidStateTransitionError);
  });

  it('keeps the application submitted when the gateway is unavailable, and retries later', async () => {
    const { onboarding, store, provider, merchantId } = await setup();
    await onboarding.update(merchantId, complete, actor);
    provider.queueOutcomes('unavailable');
    const result = await onboarding.submit(merchantId, actor);
    expect(result.providerSubmission.status).toBe('pending');
    expect((await onboarding.get(merchantId)).status).toBe('submitted');
    await expect(onboarding.retryProviderSubmission(store.store.all()[0].id)).resolves.toEqual({
      status: 'sent',
    });
  });

  it('records the gateway decision; approval enables live charges; needs_information reopens editing', async () => {
    const { onboarding, merchantsStore, store, merchantId, audit } = await setup();
    await onboarding.update(merchantId, complete, actor);
    await onboarding.submit(merchantId, actor);
    const appId = store.store.all()[0].id;

    const more = await onboarding.recordProviderDecision(
      appId,
      'needs_information',
      { requirements: ['owner_id_document'] },
      actor,
    );
    expect(more.requirements).toContain('provider.owner_id_document');
    await onboarding.update(merchantId, { website: 'https://acme.co' }, actor);
    await onboarding.submit(merchantId, actor);

    await onboarding.recordProviderDecision(appId, 'approved', {}, actor);
    const merchant = await merchantsStore.findById(merchantId);
    expect(merchant).toMatchObject({ status: 'active', liveChargesEnabled: true });
    expect(audit.actions()).toEqual(
      expect.arrayContaining(['onboarding.provider_decision_recorded', 'merchant.live_enabled']),
    );
  });

  it('issues short-lived upload URLs keyed without personal data', async () => {
    const { onboarding, merchantId } = await setup();
    const { upload } = await onboarding.requestDocumentUpload(
      merchantId,
      { documentType: 'ein_letter', contentType: 'application/pdf' },
      actor,
    );
    expect(upload.storageKey).toMatch(new RegExp(`^onboarding/${merchantId}/doc_`));
    expect(await onboarding.listDocuments(merchantId)).toHaveLength(1);
  });
});
