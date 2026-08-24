import type { Timestamp } from 'firebase/firestore';

export const SEASON_STATUSES = ['draft', 'scheduled', 'active', 'completed', 'cancelled'] as const;

export type SeasonStatus = (typeof SEASON_STATUSES)[number];

export type Season = {
  id: string;
  gameId: string;
  name: string;
  status: SeasonStatus;
  timeZone: string;
  startsAt: Timestamp | null;
  endsAt: Timestamp | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

export type SeasonDocument = Omit<Season, 'id'>;
