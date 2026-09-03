import type { Timestamp } from 'firebase/firestore';

export const REGISTRATION_STATUSES = [
  'pending_payment',
  'confirmed',
  'cancelled',
  'expired',
] as const;

export type RegistrationStatus = (typeof REGISTRATION_STATUSES)[number];

export const PAYMENT_AVAILABILITY_STATUSES = [
  'unavailable',
  'available',
  'expired',
] as const;

export type PaymentAvailabilityStatus = (typeof PAYMENT_AVAILABILITY_STATUSES)[number];

export const ACQUISITION_SOURCES = [
  'facebook',
  'instagram',
  'tiktok',
  'discord',
  'google',
  'friend_family',
  'event',
  'other',
] as const;

export type AcquisitionSource = (typeof ACQUISITION_SOURCES)[number];

export const ACQUISITION_SOURCE_OTHER_MAX_LENGTH = 100;

export type AcquisitionAttribution = {
  acquisitionSource: AcquisitionSource;
  acquisitionSourceOther: string | null;
};

export function normalizeAcquisitionAttribution(input: {
  acquisitionSource: unknown;
  acquisitionSourceOther: unknown;
}): AcquisitionAttribution {
  if (!ACQUISITION_SOURCES.includes(input.acquisitionSource as AcquisitionSource)) {
    throw new Error('Acquisition source is invalid.');
  }

  const acquisitionSource = input.acquisitionSource as AcquisitionSource;
  if (acquisitionSource !== 'other') {
    return { acquisitionSource, acquisitionSourceOther: null };
  }

  if (typeof input.acquisitionSourceOther !== 'string') {
    throw new Error('Acquisition source details are required.');
  }

  const acquisitionSourceOther = input.acquisitionSourceOther.trim();
  const acquisitionSourceOtherLength = Array.from(acquisitionSourceOther).length;
  if (
    acquisitionSourceOtherLength === 0
    || acquisitionSourceOtherLength > ACQUISITION_SOURCE_OTHER_MAX_LENGTH
  ) {
    throw new Error('Acquisition source details must be 1–100 characters.');
  }

  return { acquisitionSource, acquisitionSourceOther };
}

export type Registration = {
  id: string;
  playerId: string;
  registrationOfferingId: string;
  leagueId: string | null;
  status: RegistrationStatus;
  competitionRulesVersionAccepted: string;
  competitionRulesAcceptedAt: Timestamp;
  refundPolicyVersionAccepted: string;
  refundPolicyAcceptedAt: Timestamp;
  acquisitionSource: AcquisitionSource;
  acquisitionSourceOther: string | null;
  promoCodeId: string | null;
  promoCodeSnapshot: string | null;
  promoterIdSnapshot: string | null;
  registrationOrder: number;
  paymentAvailabilityStatus: PaymentAvailabilityStatus;
  paymentAvailableAt: Timestamp | null;
  paymentDueAt: Timestamp | null;
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
  | 'competitionRulesVersionAccepted'
  | 'refundPolicyVersionAccepted'
  | 'acquisitionSource'
  | 'acquisitionSourceOther'
>;
