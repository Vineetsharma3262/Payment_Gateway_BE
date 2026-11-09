import { createRequire } from 'node:module';

/** Pretty stdout is a local-dev convenience. Deployed images omit the package. */
export interface PinoPrettyTransport {
  target: 'pino-pretty';
  options: { singleLine: true };
}

const nodeRequire = createRequire(__filename);

function pinoPrettyInstalled(specifier: string): boolean {
  try {
    nodeRequire.resolve(specifier);
    return true;
  } catch {
    return false;
  }
}

/**
 * Attach `pino-pretty` only in development and only when the package is on disk.
 * Production images prune devDependencies, and a development `NODE_ENV` on that
 * image otherwise crashes with "unable to determine transport target".
 */
export function developmentLogTransport(
  env: string,
  canResolve: (specifier: string) => boolean = pinoPrettyInstalled,
): PinoPrettyTransport | undefined {
  if (env !== 'development' || !canResolve('pino-pretty')) return undefined;
  return { target: 'pino-pretty', options: { singleLine: true } };
}
