import type { Timestamp } from 'firebase/firestore';

export const PAYMENT_STATUSES = ['pending', 'succeeded', 'failed', 'expired'] as const;

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export type Payment = {
  id: string;
  registrationId: string;
  provider: 'stripe';
  status: PaymentStatus;
  amountCents: number;
  currency: 'USD';
  providerCheckoutSessionId: string;
  providerPaymentIntentId: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  succeededAt: Timestamp | null;
  failedAt: Timestamp | null;
  expiredAt: Timestamp | null;
};

export type PaymentDocument = Omit<Payment, 'id'>;
