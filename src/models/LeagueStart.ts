import type { Timestamp } from 'firebase/firestore';

export const LEAGUE_START_STATUSES = [
  'draft',
  'scheduled',
  'active',
  'completed',
  'cancelled',
] as const;

export type LeagueStartStatus = (typeof LEAGUE_START_STATUSES)[number];

export type LeagueStart = {
  id: string;
  gameId: string;
  name: string;
  status: LeagueStartStatus;
  timeZone: string;
  startsAt: Timestamp | null;
  endsAt: Timestamp | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

export type LeagueStartDocument = Omit<LeagueStart, 'id'>;
