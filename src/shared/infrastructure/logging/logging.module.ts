import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { APP_CONFIG, type AppConfig } from '../../../config/configuration';
import { resolveRequestId } from '../observability/request-id';
import { REDACTED_LOG_PATHS } from './redaction';

@Module({
  imports: [
    LoggerModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({
        pinoHttp: {
          level: config.logging.level,
          genReqId: resolveRequestId,
          redact: { paths: REDACTED_LOG_PATHS, censor: '[REDACTED]' },
          autoLogging: { ignore: (req) => (req.url ?? '').startsWith('/health') },
          // Never log bodies or query strings: they can carry customer data.
          serializers: {
            req: (req: { id: string; method: string; url: string }) => ({
              id: req.id,
              method: req.method,
              path: req.url.split('?')[0],
            }),
            res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
          },
          transport:
            config.env === 'development'
              ? { target: 'pino-pretty', options: { singleLine: true } }
              : undefined,
        },
      }),
    }),
  ],
})
export class LoggingModule {}
