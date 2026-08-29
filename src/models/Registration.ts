import type { Timestamp } from 'firebase/firestore';

export const REGISTRATION_STATUSES = [
  'pending_payment',
  'confirmed',
  'cancelled',
  'expired',
] as const;

export type RegistrationStatus = (typeof REGISTRATION_STATUSES)[number];

export type Registration = {
  id: string;
  playerId: string;
  registrationOfferingId: string;
  leagueId: string;
  status: RegistrationStatus;
  competitionRulesVersionAccepted: string;
  competitionRulesAcceptedAt: Timestamp;
  refundPolicyVersionAccepted: string;
  refundPolicyAcceptedAt: Timestamp;
  promoCodeId: string | null;
  promoCodeSnapshot: string | null;
  promoterIdSnapshot: string | null;
  registrationOrder: number | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  submittedAt: Timestamp;
  confirmedAt: Timestamp | null;
  cancelledAt: Timestamp | null;
};

export type RegistrationDocument = Omit<Registration, 'id'>;

export type CreateRegistrationInput = Pick<
  Registration,
  | 'registrationOfferingId'
  | 'leagueId'
  | 'competitionRulesVersionAccepted'
  | 'refundPolicyVersionAccepted'
>;
