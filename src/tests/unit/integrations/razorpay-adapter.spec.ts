import { Money } from '../../../shared/domain/money';
import {
  ProviderCapabilityError,
  ProviderOperationNotImplementedError,
  ProviderOutcomeUnknownError,
  ProviderRejectedError,
  ProviderSignatureInvalidError,
  ProviderUnavailableError,
} from '../../../integrations/payment-providers/domain-ports/provider-errors';
import { RazorpayPaymentProvider } from '../../../integrations/payment-providers/razorpay/razorpay-payment-provider.adapter';
import { hmacSha256Hex } from '../../../integrations/payment-providers/signatures';

const credentials = {
  keyId: 'rzp_test_key',
  keySecret: 'checkout_secret',
  webhookSecret: 'webhook_secret',
};
const adapter = new RazorpayPaymentProvider({
  baseUrl: 'https://razorpay.invalid',
  timeoutMs: 1_000,
  credentials: () => Promise.resolve(credentials),
});
const account = { provider: 'razorpay' as const, accountId: 'acc_123' };
const createCommand = {
  mode: 'test' as const,
  account,
  reference: 'ord_123',
  amount: Money.of(2500, 'USD'),
  idempotencyKey: 'k',
};

function mockFetch(impl: () => Promise<Response>) {
  return jest.spyOn(globalThis, 'fetch').mockImplementation(impl);
}

afterEach(() => jest.restoreAllMocks());

describe('Razorpay adapter — signatures', () => {
  it('verifies checkout signatures (order_id|payment_id)', async () => {
    const signature = hmacSha256Hex(credentials.keySecret, 'order_1|pay_1');
    const input = { mode: 'test' as const, providerOrderId: 'order_1', providerPaymentId: 'pay_1' };
    await expect(adapter.verifyCheckoutSignature({ ...input, signature })).resolves.toBe(true);
    await expect(
      adapter.verifyCheckoutSignature({ ...input, providerPaymentId: 'pay_2', signature }),
    ).resolves.toBe(false);
  });

  const rawBody = Buffer.from(
    '{"entity":"event","account_id":"acc_123","event":"payment.captured","created_at":1761566400,"payload":{"payment":{}}}',
  );

  it('verifies webhooks against the exact raw body and maps the event', async () => {
    const event = await adapter.verifyWebhook({
      mode: 'test',
      rawBody,
      headers: {
        'x-razorpay-signature': hmacSha256Hex(credentials.webhookSecret, rawBody),
        'x-razorpay-event-id': 'evt_1',
      },
    });
    expect(event).toMatchObject({
      providerEventId: 'evt_1',
      type: 'payment.captured',
      accountId: 'acc_123',
    });
  });

  it('rejects a webhook whose body was re-serialised or tampered with', async () => {
    const signature = hmacSha256Hex(credentials.webhookSecret, rawBody);
    const reserialised = Buffer.from(JSON.stringify(JSON.parse(rawBody.toString()), null, 2));
    await expect(
      adapter.verifyWebhook({
        mode: 'test',
        rawBody: reserialised,
        headers: { 'x-razorpay-signature': signature, 'x-razorpay-event-id': 'e' },
      }),
    ).rejects.toBeInstanceOf(ProviderSignatureInvalidError);
    await expect(
      adapter.verifyWebhook({ mode: 'test', rawBody, headers: { 'x-razorpay-event-id': 'e' } }),
    ).rejects.toBeInstanceOf(ProviderSignatureInvalidError);
  });
});

describe('Razorpay adapter — capabilities', () => {
  it('refuses unconfirmed capabilities in live mode', async () => {
    await expect(
      adapter.verifyCheckoutSignature({
        mode: 'live',
        providerOrderId: 'o',
        providerPaymentId: 'p',
        signature: 's',
      }),
    ).resolves.toBe(false); // supported capability: allowed
    expect(adapter.capabilities()['sub_merchant.create']).toBe('unconfirmed');
    await expect(adapter.createSubMerchantAccount()).rejects.toBeInstanceOf(
      ProviderOperationNotImplementedError,
    );
  });
});

describe('Razorpay adapter — outcome taxonomy for order creation', () => {
  it('maps success', async () => {
    mockFetch(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            id: 'order_X',
            amount: 2500,
            currency: 'USD',
            receipt: 'ord_123',
            status: 'created',
          }),
          { status: 200 },
        ),
      ),
    );
    await expect(adapter.createOrder(createCommand)).resolves.toMatchObject({
      providerOrderId: 'order_X',
      reference: 'ord_123',
    });
  });

  it('4xx → rejected (definitive)', async () => {
    mockFetch(() =>
      Promise.resolve(
        new Response(JSON.stringify({ error: { description: 'bad amount' } }), { status: 400 }),
      ),
    );
    await expect(adapter.createOrder(createCommand)).rejects.toBeInstanceOf(ProviderRejectedError);
  });

  it('429 → unavailable (safe to retry)', async () => {
    mockFetch(() => Promise.resolve(new Response('{}', { status: 429 })));
    await expect(adapter.createOrder(createCommand)).rejects.toBeInstanceOf(
      ProviderUnavailableError,
    );
  });

  it('5xx on POST → outcome unknown (must reconcile, never blind retry)', async () => {
    mockFetch(() => Promise.resolve(new Response('{}', { status: 502 })));
    await expect(adapter.createOrder(createCommand)).rejects.toBeInstanceOf(
      ProviderOutcomeUnknownError,
    );
  });

  it('timeout on POST → outcome unknown', async () => {
    mockFetch(() =>
      Promise.reject(Object.assign(new Error('timed out'), { name: 'TimeoutError' })),
    );
    await expect(adapter.createOrder(createCommand)).rejects.toBeInstanceOf(
      ProviderOutcomeUnknownError,
    );
  });

  it('connection refused → unavailable (request never sent)', async () => {
    mockFetch(() =>
      Promise.reject(
        Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } }),
      ),
    );
    await expect(adapter.createOrder(createCommand)).rejects.toBeInstanceOf(
      ProviderUnavailableError,
    );
  });

  it('never sends provider secrets anywhere but the Authorization header', async () => {
    const spy = mockFetch(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            id: 'o',
            amount: 2500,
            currency: 'USD',
            receipt: 'ord_123',
            status: 'created',
          }),
          { status: 200 },
        ),
      ),
    );
    await adapter.createOrder(createCommand);
    const [url, init] = spy.mock.calls[0];
    expect(url as string).not.toContain(credentials.keySecret);
    expect(init?.body as string).not.toContain(credentials.keySecret);
  });
});

describe('Capability guard', () => {
  it('throws ProviderCapabilityError for unsupported operations', async () => {
    const { FakePaymentProvider } =
      await import('../../../integrations/payment-providers/testing/fake-payment-provider');
    const { capabilityMatrix } =
      await import('../../../integrations/payment-providers/domain-ports/capabilities');
    const limited = new FakePaymentProvider(capabilityMatrix({ 'order.create': 'unconfirmed' }));
    await expect(
      limited.createOrder({ ...createCommand, account: { provider: 'fake', accountId: 'a' } }),
    ).resolves.toBeDefined();
    await expect(
      limited.createOrder({
        ...createCommand,
        mode: 'live',
        account: { provider: 'fake', accountId: 'a' },
      }),
    ).rejects.toBeInstanceOf(ProviderCapabilityError);
  });
});
