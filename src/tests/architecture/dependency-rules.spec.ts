import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

/**
 * Executable version of docs/architecture/module-ownership.md. Runs on the
 * import graph (static imports and `import()` / `require()` of literals), so
 * it holds even if lint is skipped.
 */
const SRC = resolve(__dirname, '../..');

const FRAMEWORK_AND_IO = [
  /^@nestjs\//,
  /^@prisma\//,
  /^prisma$/,
  /^@aws-sdk\//,
  /^ioredis$/,
  /^express$/,
  /^razorpay$/,
  /^stripe$/,
  /^pino/,
  /^nestjs-pino$/,
  /^helmet$/,
];

interface SourceFile {
  path: string; // relative to src, posix separators
  imports: string[]; // raw specifiers
}

function listTs(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return name === 'tests' ? [] : listTs(full);
    return name.endsWith('.ts') && !name.endsWith('.spec.ts') ? [full] : [];
  });
}

const IMPORT_RE =
  /(?:import|export)\s[^'"]*?from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)|require\(\s*['"]([^'"]+)['"]\s*\)/g;

const files: SourceFile[] = listTs(SRC).map((full) => {
  const text = readFileSync(full, 'utf8');
  const imports = [...text.matchAll(IMPORT_RE)].map((m) => m[1] ?? m[2] ?? m[3]);
  return { path: relative(SRC, full).split(sep).join('/'), imports };
});

/** Resolve a relative specifier to a src-relative posix path; packages are returned unchanged. */
function target(file: SourceFile, specifier: string): string {
  if (!specifier.startsWith('.')) return specifier;
  return relative(SRC, resolve(SRC, dirname(file.path), specifier))
    .split(sep)
    .join('/');
}

function violations(
  selector: (f: SourceFile) => boolean,
  forbidden: (t: string, f: SourceFile) => string | null,
): string[] {
  return files.filter(selector).flatMap((file) =>
    file.imports
      .map((spec) => forbidden(target(file, spec), file))
      .filter((reason): reason is string => reason !== null)
      .map((reason) => `${file.path}: ${reason}`),
  );
}

const isPackage = (t: string) =>
  !t.includes('/') ||
  t.startsWith('@') ||
  !/^(shared|modules|integrations|infrastructure|config|bootstrap|workers)\//.test(t);
const layerOf = (p: string) =>
  /\/(domain|application|infrastructure|presentation)\//.exec(`/${p}`)?.[1] ?? null;

describe('Architecture: dependency rules', () => {
  it('scans a meaningful number of files', () => {
    expect(files.length).toBeGreaterThan(40);
  });

  it('domain code imports no framework, ORM, cloud SDK or provider SDK', () => {
    const found = violations(
      (f) => layerOf(f.path) === 'domain',
      (t) => (FRAMEWORK_AND_IO.some((re) => re.test(t)) ? `imports ${t}` : null),
    );
    expect(found).toEqual([]);
  });

  it('domain code depends only on domain code', () => {
    const found = violations(
      (f) => layerOf(f.path) === 'domain',
      (t) => (!isPackage(t) && layerOf(t) !== 'domain' ? `imports non-domain ${t}` : null),
    );
    expect(found).toEqual([]);
  });

  it('application code imports no framework/IO packages and no infrastructure or presentation', () => {
    const found = violations(
      (f) => layerOf(f.path) === 'application',
      (t) => {
        if (FRAMEWORK_AND_IO.some((re) => re.test(t))) return `imports ${t}`;
        const layer = layerOf(t);
        if (layer === 'infrastructure' || layer === 'presentation') return `imports ${layer} ${t}`;
        return null;
      },
    );
    expect(found).toEqual([]);
  });

  it('application code reaches providers only through domain ports', () => {
    const found = violations(
      (f) => layerOf(f.path) === 'application',
      (t) =>
        t.startsWith('integrations/') && !t.includes('/domain-ports/')
          ? `imports adapter ${t}`
          : null,
    );
    expect(found).toEqual([]);
  });

  it('modules use other modules only through public-api.ts (or Nest module classes for wiring)', () => {
    const found = violations(
      (f) => f.path.startsWith('modules/'),
      (t, f) => {
        if (!t.startsWith('modules/')) return null;
        const own = f.path.split('/')[1];
        const [, other, ...rest] = t.split('/');
        if (other === own) return null;
        const inner = rest.join('/');
        if (inner === 'public-api') return null;
        if (f.path.endsWith('.module.ts') && inner.endsWith('.module')) return null;
        return `reaches into module '${other}' (${t})`;
      },
    );
    expect(found).toEqual([]);
  });

  it('public-api.ts files stay framework-free', () => {
    const found = violations(
      (f) => f.path.endsWith('/public-api.ts'),
      (t) =>
        FRAMEWORK_AND_IO.some((re) => re.test(t)) || layerOf(t) === 'infrastructure'
          ? `imports ${t}`
          : null,
    );
    expect(found).toEqual([]);
  });

  it('integrations never depend on business modules', () => {
    const found = violations(
      (f) => f.path.startsWith('integrations/'),
      (t) => (t.startsWith('modules/') ? `imports ${t}` : null),
    );
    expect(found).toEqual([]);
  });

  it('shared kernel domain is self-contained', () => {
    const found = violations(
      (f) => f.path.startsWith('shared/domain/'),
      (t) => (!isPackage(t) && !t.startsWith('shared/domain/') ? `imports ${t}` : null),
    );
    expect(found).toEqual([]);
  });

  it('provider SDK objects never appear in public response DTOs', () => {
    const found = violations(
      (f) => f.path.includes('/presentation/'),
      (t) => (t.startsWith('integrations/') ? `presentation imports ${t}` : null),
    );
    expect(found).toEqual([]);
  });
});
