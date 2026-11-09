import { canonicalJson } from '../../../shared/application/request-hash';

describe('canonicalJson', () => {
  it('is independent of key order and drops undefined', () => {
    expect(canonicalJson({ b: 1, a: { d: [1, 2], c: 'x' }, z: undefined })).toBe(
      canonicalJson({ a: { c: 'x', d: [1, 2] }, b: 1 }),
    );
  });

  it('distinguishes different values', () => {
    expect(canonicalJson({ amount: 100 })).not.toBe(canonicalJson({ amount: 101 }));
  });
});
