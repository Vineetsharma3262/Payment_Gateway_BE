/** Wire shapes used by the adapter only. Never exported beyond the razorpay folder. */
export interface RazorpayOrder {
  id: string;
  amount: number;
  currency: string;
  receipt: string | null;
  status: 'created' | 'attempted' | 'paid';
}

export interface RazorpayCollection<T> {
  count: number;
  items: T[];
}

export interface RazorpayPayment {
  id: string;
  order_id: string | null;
  amount: number;
  currency: string;
  status: 'created' | 'authorized' | 'captured' | 'refunded' | 'failed';
  error_description: string | null;
}

export interface RazorpayRefund {
  id: string;
  amount: number;
  currency: string;
  status: 'pending' | 'processed' | 'failed';
}

export interface RazorpayWebhookEnvelope {
  entity: 'event';
  account_id?: string;
  event: string;
  created_at: number;
  payload: Record<string, unknown>;
}
