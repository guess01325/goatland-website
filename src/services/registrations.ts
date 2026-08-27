import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import type {
  CreateRegistrationInput,
  Registration,
  RegistrationDocument,
} from '../models/Registration';

const REGISTRATION_ID_SEPARATOR = '|';

function assertValidRegistrationIdPart(value: string, fieldName: string) {
  if (!value || value.includes(REGISTRATION_ID_SEPARATOR) || value.includes('/')) {
    throw new Error(`${fieldName} cannot be used in a Registration document ID.`);
  }
}

export function getRegistrationId(playerId: string, seasonTierOfferingId: string): string {
  assertValidRegistrationIdPart(playerId, 'playerId');
  assertValidRegistrationIdPart(seasonTierOfferingId, 'seasonTierOfferingId');

  return `${playerId}${REGISTRATION_ID_SEPARATOR}${seasonTierOfferingId}`;
}

function getRegistrationReference(playerId: string, seasonTierOfferingId: string) {
  return doc(db, 'registrations', getRegistrationId(playerId, seasonTierOfferingId));
}

function getAuthenticatedPlayerId(): string {
  const playerId = auth.currentUser?.uid;

  if (!playerId) {
    throw new Error('An authenticated player is required to access Registration.');
  }

  return playerId;
}

export async function getRegistration(
  seasonTierOfferingId: string,
): Promise<Registration | null> {
  const playerId = getAuthenticatedPlayerId();
  const snapshot = await getDoc(getRegistrationReference(playerId, seasonTierOfferingId));

  if (!snapshot.exists()) {
    return null;
  }

  return {
    id: snapshot.id,
    ...(snapshot.data() as RegistrationDocument),
  };
}

export async function createRegistration(input: CreateRegistrationInput): Promise<string> {
  const playerId = getAuthenticatedPlayerId();
  const reference = getRegistrationReference(playerId, input.seasonTierOfferingId);
  const timestamp = serverTimestamp();

  await setDoc(reference, {
    playerId,
    seasonTierOfferingId: input.seasonTierOfferingId,
    status: 'pending_payment',
    competitionRulesVersionAccepted: input.competitionRulesVersionAccepted,
    competitionRulesAcceptedAt: timestamp,
    refundPolicyVersionAccepted: input.refundPolicyVersionAccepted,
    refundPolicyAcceptedAt: timestamp,
    promoCodeId: null,
    promoCodeSnapshot: null,
    promoterIdSnapshot: null,
    registrationOrder: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    submittedAt: timestamp,
    confirmedAt: null,
    cancelledAt: null,
  });

  return reference.id;
}

export async function cancelRegistration(
  seasonTierOfferingId: string,
): Promise<void> {
  const playerId = getAuthenticatedPlayerId();
  const timestamp = serverTimestamp();

  await updateDoc(getRegistrationReference(playerId, seasonTierOfferingId), {
    status: 'cancelled',
    cancelledAt: timestamp,
    updatedAt: timestamp,
  });
}
