import type { Timestamp } from 'firebase/firestore';

export const REGISTRATION_OFFERING_STATUSES = [
  'draft',
  'enabled',
  'disabled',
  'cancelled',
] as const;

export type RegistrationOfferingStatus = (typeof REGISTRATION_OFFERING_STATUSES)[number];

export type RegistrationOffering = {
  id: string;
  leagueStartId: string;
  tierId: string;
  status: RegistrationOfferingStatus;
  registrationOpensAt: Timestamp | null;
  registrationClosesAt: Timestamp | null;
  entryFeeCents: number;
  currency: 'USD';
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

export type RegistrationOfferingDocument = Omit<RegistrationOffering, 'id'>;
