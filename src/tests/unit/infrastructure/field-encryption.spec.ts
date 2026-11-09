import { AesGcmFieldEncryptor } from '../../../infrastructure/crypto/aes-gcm-field-encryptor';

const k1 = Buffer.alloc(32, 1).toString('base64');
const k2 = Buffer.alloc(32, 2).toString('base64');

describe('AES-256-GCM field encryption', () => {
  it('round-trips with random IVs', async () => {
    const enc = new AesGcmFieldEncryptor('k1', { k1 });
    const a = await enc.encrypt('123456789');
    const b = await enc.encrypt('123456789');
    expect(a).not.toBe(b);
    await expect(enc.decrypt(a)).resolves.toBe('123456789');
  });

  it('detects tampering', async () => {
    const enc = new AesGcmFieldEncryptor('k1', { k1 });
    const parts = (await enc.encrypt('secret')).split(':');
    parts[4] = Buffer.from('tampered').toString('base64');
    await expect(enc.decrypt(parts.join(':'))).rejects.toThrow();
  });

  it('supports key rotation: old ciphertexts stay readable', async () => {
    const old = await new AesGcmFieldEncryptor('k1', { k1 }).encrypt('x');
    const rotated = new AesGcmFieldEncryptor('k2', { k1, k2 });
    await expect(rotated.decrypt(old)).resolves.toBe('x');
    expect(await rotated.encrypt('y')).toMatch(/^v1:k2:/);
  });

  it('rejects wrong-size keys', () => {
    expect(
      () => new AesGcmFieldEncryptor('k', { k: Buffer.alloc(16).toString('base64') }),
    ).toThrow();
  });
});
