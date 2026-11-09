import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap/configure-app';

async function bootstrap(): Promise<void> {
  // rawBody: provider webhook signatures are verified against the exact bytes received.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    rawBody: true,
  });
  const config = configureApp(app);
  await app.listen(config.http.port);
}

void bootstrap();
