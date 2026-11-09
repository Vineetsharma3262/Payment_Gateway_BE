import 'reflect-metadata';
import { setTimeout as sleep } from 'node:timers/promises';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { APP_CONFIG, type AppConfig } from '../../config/configuration';
import { OutboxRelay } from '../../infrastructure/messaging/outbox/outbox-relay';
import { OutboxRelayWorkerModule } from './outbox-relay-worker.module';

/**
 * Separate process from the API (same codebase and image, different command):
 * `npm run start:worker:outbox-relay`. Scales independently; safe to run N copies.
 */
async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(OutboxRelayWorkerModule, {
    bufferLogs: true,
  });
  const logger = app.get(Logger);
  app.useLogger(logger);
  app.enableShutdownHooks();

  const relay = app.get(OutboxRelay);
  const { outboxRelay } = app.get<AppConfig>(APP_CONFIG);
  let running = true;
  const stop = () => {
    running = false;
  };
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);

  while (running) {
    try {
      const published = await relay.runOnce();
      if (published === 0) await sleep(outboxRelay.pollIntervalMs);
    } catch (error) {
      logger.error({ err: error }, 'Outbox relay iteration failed');
      await sleep(outboxRelay.pollIntervalMs);
    }
  }
  await app.close();
}

void main();
