import type { Timestamp } from 'firebase/firestore';

export const LEAGUE_STATUSES = [
  'draft',
  'open',
  'full',
  'closed',
  'cancelled',
] as const;

export type LeagueStatus = (typeof LEAGUE_STATUSES)[number];

export type League = {
  id: string;
  registrationOfferingId: string;
  leagueNumber: number;
  capacity: number;
  status: LeagueStatus;
  confirmedCount: number;
  activeHoldCount: number;
  lastAssignedRegistrationOrder: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

export type LeagueDocument = Omit<League, 'id'>;
