/** Published contract of the Orders context (framework-free). */
export interface OrderPaymentRecorder {
  /** Marks the order paid after a captured payment. Idempotent; joins the caller's unit of work. */
  markPaid(merchantId: string, orderId: string): Promise<void>;
}

export const ORDER_PAYMENT_RECORDER = Symbol('OrderPaymentRecorder');
