import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_CONFIG, buildConfiguration, type AppConfig } from './configuration';

/**
 * Loads `.env` only outside staging/production (deployed environments inject
 * configuration and use the secret manager), validates it, and exposes the
 * typed AppConfig under the APP_CONFIG token.
 */
@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      cache: true,
      ignoreEnvFile: ['staging', 'production', 'test'].includes(process.env.NODE_ENV ?? ''),
      load: [() => ({ app: buildConfiguration(process.env) })],
    }),
  ],
  providers: [
    {
      provide: APP_CONFIG,
      inject: [ConfigService],
      useFactory: (config: ConfigService): AppConfig => config.getOrThrow<AppConfig>('app'),
    },
  ],
  exports: [APP_CONFIG],
})
export class ConfigurationModule {}
