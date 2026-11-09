import { Entity } from '../../../shared/domain/entity';

/**
 * A verified inbound gateway event, stored before PayCo acknowledges it
 * (pay-in flow step 8) and processed asynchronously and idempotently.
 */
export type ProviderEventStatus = 'received' | 'processed' | 'ignored' | 'failed';

export interface ProviderEventProps {
  id: string;
  provider: string;
  mode: 'test' | 'live';
  providerEventId: string;
  type: string;
  providerType: string;
  accountId: string | null;
  payload: unknown;
  status: ProviderEventStatus;
  receivedAt: Date;
  processedAt: Date | null;
  lastError: string | null;
}

export class ProviderEvent extends Entity {
  private constructor(private props: ProviderEventProps) {
    super(props.id);
  }

  static receive(
    params: Omit<ProviderEventProps, 'status' | 'processedAt' | 'lastError'>,
  ): ProviderEvent {
    return new ProviderEvent({ ...params, status: 'received', processedAt: null, lastError: null });
  }

  static rehydrate(props: ProviderEventProps): ProviderEvent {
    return new ProviderEvent({ ...props });
  }

  get status(): ProviderEventStatus {
    return this.props.status;
  }

  markProcessed(now: Date): void {
    this.props.status = 'processed';
    this.props.processedAt = now;
  }

  markIgnored(reason: string, now: Date): void {
    this.props.status = 'ignored';
    this.props.processedAt = now;
    this.props.lastError = reason.slice(0, 500);
  }

  markFailed(error: string): void {
    this.props.status = 'failed';
    this.props.lastError = error.slice(0, 500);
  }

  toProps(): ProviderEventProps {
    return { ...this.props };
  }
}
