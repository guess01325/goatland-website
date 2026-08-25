import type { Timestamp } from 'firebase/firestore';

export const PROMOTER_STATUSES = ['active', 'disabled', 'retired'] as const;

export type PromoterStatus = (typeof PROMOTER_STATUSES)[number];

export type Promoter = {
  id: string;
  name: string;
  status: PromoterStatus;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

export type PromoterDocument = Omit<Promoter, 'id'>;
