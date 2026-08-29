import type { Timestamp } from 'firebase-admin/firestore';

export const SEAT_HOLD_STATUSES = [
  'provisioning',
  'active',
  'converted',
  'expired',
  'released',
] as const;

export type SeatHoldStatus = (typeof SEAT_HOLD_STATUSES)[number];

export type SeatHold = {
  id: string;
  registrationId: string;
  registrationOfferingId: string;
  leagueId: string;
  paymentId: string;
  providerCheckoutSessionId: string | null;
  status: SeatHoldStatus;
  expiresAt: Timestamp | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

export type SeatHoldData = Omit<SeatHold, 'id'>;
