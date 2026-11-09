/**
 * Paths removed from every log line. Card data never reaches PayCo servers
 * (PRD 8: gateway-hosted fields, SAQ A), but these paths are redacted anyway as
 * defence in depth.
 */
export const REDACTED_LOG_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-api-key"]',
  'req.headers["x-razorpay-signature"]',
  'req.headers["stripe-signature"]',
  'req.headers["x-payco-signature"]',
  'res.headers["set-cookie"]',
  '*.password',
  '*.newPassword',
  '*.token',
  '*.accessToken',
  '*.refreshToken',
  '*.secret',
  '*.keySecret',
  '*.webhookSecret',
  '*.apiKey',
  '*.card',
  '*.cvv',
  '*.cvc',
  '*.accountNumber',
  '*.routingNumber',
  '*.ssn',
  '*.ein',
  '*.taxId',
];
