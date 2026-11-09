import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

/** PRD 7.2: gateway ids are stored internally and never shown to clients. */
describe('Architecture: provider identifiers stay internal', () => {
  const root = resolve(__dirname, '../../modules');
  const responseDtos = (function walk(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) return walk(full);
      return full.includes('/response-dto/') ? [full] : [];
    });
  })(root);

  it('finds response DTOs to check', () => {
    expect(responseDtos.length).toBeGreaterThan(0);
  });

  it.each(responseDtos)('%s exposes no provider fields', (file) => {
    const text = readFileSync(file, 'utf8');
    expect(text).not.toMatch(
      /provider(Order|Payment|Refund|Account)Id|providerOrder\b|razorpay|stripe/i,
    );
  });
});
