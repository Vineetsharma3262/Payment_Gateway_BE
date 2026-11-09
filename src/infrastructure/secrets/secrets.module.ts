import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { Global, Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../config/configuration';
import { SECRETS_PROVIDER } from '../../shared/application/secrets.port';
import { AwsSecretsManagerProvider } from './aws-secrets-manager.provider';
import { EnvSecretsProvider } from './env-secrets.provider';

@Global()
@Module({
  providers: [
    {
      provide: SECRETS_PROVIDER,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) =>
        config.secrets.provider === 'aws'
          ? new AwsSecretsManagerProvider(
              new SecretsManagerClient({ region: config.aws.region }),
              config.secrets.namespace,
            )
          : new EnvSecretsProvider(),
    },
  ],
  exports: [SECRETS_PROVIDER],
})
export class SecretsModule {}
