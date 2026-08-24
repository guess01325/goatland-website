import type { Timestamp } from 'firebase/firestore';

export const SEASON_TIER_OFFERING_STATUSES = [
  'draft',
  'enabled',
  'disabled',
  'cancelled',
] as const;

export type SeasonTierOfferingStatus = (typeof SEASON_TIER_OFFERING_STATUSES)[number];

export type SeasonTierOffering = {
  id: string;
  seasonId: string;
  tierId: string;
  status: SeasonTierOfferingStatus;
  registrationOpensAt: Timestamp | null;
  registrationClosesAt: Timestamp | null;
  entryFeeCents: number;
  currency: 'USD';
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

export type SeasonTierOfferingDocument = Omit<SeasonTierOffering, 'id'>;
