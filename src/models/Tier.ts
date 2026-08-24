import type { Timestamp } from 'firebase/firestore';

export const TIER_STATUSES = ['active', 'inactive', 'retired'] as const;

export type TierStatus = (typeof TIER_STATUSES)[number];

export type Tier = {
  id: string;
  name: string;
  level: number;
  status: TierStatus;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

export type TierDocument = Omit<Tier, 'id'>;
