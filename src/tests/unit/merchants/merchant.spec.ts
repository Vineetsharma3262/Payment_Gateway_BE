import {
  InvalidStateTransitionError,
  InvariantViolationError,
} from '../../../shared/domain/domain-error';
import { Merchant } from '../../../modules/merchants/domain/merchant';

const now = new Date('2026-10-27T00:00:00Z');
const newMerchant = () =>
  Merchant.register({ id: 'mer_1', legalName: 'Acme LLC', displayName: 'Acme', now });

describe('Merchant aggregate', () => {
  it('starts in onboarding without live charges', () => {
    const m = newMerchant();
    expect(m.status).toBe('onboarding');
    expect(m.liveChargesEnabled).toBe(false);
  });

  it('enables live charges on approval, idempotently', () => {
    const m = newMerchant();
    m.enableLiveCharges(now);
    m.enableLiveCharges(now);
    expect(m.status).toBe('active');
    expect(m.liveChargesEnabled).toBe(true);
    expect(m.pullEvents().map((e) => e.eventType)).toEqual([
      'merchant.registered',
      'merchant.live_enabled',
    ]);
  });

  it('cannot go live while suspended or closed', () => {
    const m = newMerchant();
    m.enableLiveCharges(now);
    m.changeStatus('suspended', now);
    expect(() => m.enableLiveCharges(now)).toThrow(InvalidStateTransitionError);
    m.changeStatus('closed', now);
    expect(() => m.changeStatus('active', now)).toThrow(InvalidStateTransitionError);
  });

  it.each([
    [{ brandColor: 'red' }],
    [{ logoUrl: 'http://insecure.example/logo.png' }],
    [{ statementDescriptor: '1234' }],
    [{ statementDescriptor: 'BAD*CHAR' }],
    [{ paymentMethods: [] }],
  ])('rejects invalid settings %p', (patch) => {
    expect(() => newMerchant().updateSettings(patch, now)).toThrow(InvariantViolationError);
  });

  it('accepts valid branding', () => {
    const m = newMerchant();
    m.updateSettings(
      {
        brandColor: '#1A2B3C',
        logoUrl: 'https://cdn.acme.co/logo.png',
        statementDescriptor: 'ACME COFFEE',
        paymentMethods: ['card', 'ach_debit'],
      },
      now,
    );
    expect(m.toProps()).toMatchObject({
      brandColor: '#1A2B3C',
      paymentMethods: ['card', 'ach_debit'],
    });
  });
});
