import { AggregateRoot } from '../../../shared/domain/aggregate-root';
import { InvariantViolationError } from '../../../shared/domain/domain-error';
import type { PublicEventType } from './event-catalog';

/** Old secrets keep signing for this long after rotation. */
export const SECRET_ROTATION_OVERLAP_MS = 24 * 60 * 60 * 1000;

export interface EndpointSecret {
  id: string;
  /** Application-encrypted signing secret. */
  secretEncrypted: string;
  createdAt: Date;
  expiresAt: Date | null;
}

export interface WebhookEndpointProps {
  id: string;
  merchantId: string;
  mode: 'test' | 'live';
  url: string;
  enabledEvents: PublicEventType[];
  secrets: EndpointSecret[];
  disabled: boolean;
  createdAt: Date;
  version: number;
}

export class WebhookEndpoint extends AggregateRoot {
  private constructor(private props: WebhookEndpointProps) {
    super(props.id, props.version);
  }

  static create(
    params: Omit<WebhookEndpointProps, 'disabled' | 'version' | 'secrets'> & {
      secret: EndpointSecret;
    },
  ): WebhookEndpoint {
    WebhookEndpoint.assertUrl(params.url, params.mode);
    if (params.enabledEvents.length === 0)
      throw new InvariantViolationError('Select at least one event type.');
    const { secret, ...rest } = params;
    return new WebhookEndpoint({ ...rest, secrets: [secret], disabled: false, version: 0 });
  }

  static rehydrate(props: WebhookEndpointProps): WebhookEndpoint {
    return new WebhookEndpoint({ ...props });
  }

  /** Live endpoints must be https and must not target private/loopback hosts (SSRF). */
  static assertUrl(url: string, mode: 'test' | 'live'): void {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new InvariantViolationError('Webhook URL is invalid.');
    }
    if (mode === 'live' && parsed.protocol !== 'https:')
      throw new InvariantViolationError('Live webhook URLs must use https.');
    if (!['https:', 'http:'].includes(parsed.protocol))
      throw new InvariantViolationError('Webhook URL must be http(s).');
    const host = parsed.hostname;
    const privateHost =
      host === 'localhost' ||
      /^127\./.test(host) ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
      /^169\.254\./.test(host) ||
      host === '[::1]' ||
      host.endsWith('.internal');
    if (privateHost) throw new InvariantViolationError('Webhook URL must be publicly reachable.');
  }

  subscribesTo(type: PublicEventType): boolean {
    return !this.props.disabled && this.props.enabledEvents.includes(type);
  }

  /** Secrets that sign deliveries at `now` (new + not-yet-expired old). */
  activeSecrets(now: Date): EndpointSecret[] {
    return this.props.secrets.filter((s) => !s.expiresAt || s.expiresAt > now);
  }

  rotateSecret(next: EndpointSecret, now: Date): void {
    const overlapEnds = new Date(now.getTime() + SECRET_ROTATION_OVERLAP_MS);
    this.props.secrets = [
      next,
      ...this.activeSecrets(now).map((s) => ({
        ...s,
        expiresAt: s.expiresAt && s.expiresAt < overlapEnds ? s.expiresAt : overlapEnds,
      })),
    ];
  }

  toProps(): WebhookEndpointProps {
    return { ...this.props, version: this.version };
  }
}
