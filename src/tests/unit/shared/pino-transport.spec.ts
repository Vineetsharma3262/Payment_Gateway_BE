import { developmentLogTransport } from '../../../shared/infrastructure/logging/pino-transport';

describe('development log transport', () => {
  const present = () => true;
  const missing = () => false;

  it('uses pino-pretty only in development when the package is installed', () => {
    expect(developmentLogTransport('development', present)).toEqual({
      target: 'pino-pretty',
      options: { singleLine: true },
    });
  });

  it('falls back to JSON logs when pino-pretty was pruned from the image', () => {
    expect(developmentLogTransport('development', missing)).toBeUndefined();
  });

  it('never enables pretty logs outside development', () => {
    for (const env of ['test', 'staging', 'production']) {
      expect(developmentLogTransport(env, present)).toBeUndefined();
    }
  });
});
