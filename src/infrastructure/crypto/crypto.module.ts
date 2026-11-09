import { Global, Module } from '@nestjs/common';
import { FIELD_ENCRYPTOR } from '../../shared/application/field-encryption.port';
import { SECRETS_PROVIDER, type SecretsProvider } from '../../shared/application/secrets.port';
import { AesGcmFieldEncryptor } from './aes-gcm-field-encryptor';

interface FieldKeys {
  active: string;
  keys: Record<string, string>;
}

@Global()
@Module({
  providers: [
    {
      provide: FIELD_ENCRYPTOR,
      inject: [SECRETS_PROVIDER],
      useFactory: async (secrets: SecretsProvider) => {
        const config = await secrets.getJson<FieldKeys>('field-encryption-keys');
        return new AesGcmFieldEncryptor(config.active, config.keys);
      },
    },
  ],
  exports: [FIELD_ENCRYPTOR],
})
export class CryptoModule {}
