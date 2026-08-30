import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import type {
  CreateRegistrationInput,
  Registration,
  RegistrationDocument,
  AcquisitionAttribution,
} from '../models/Registration';
import { normalizeAcquisitionAttribution } from '../models/Registration';

const REGISTRATION_ID_SEPARATOR = '|';

function assertValidRegistrationIdPart(value: string, fieldName: string) {
  if (!value || value.includes(REGISTRATION_ID_SEPARATOR) || value.includes('/')) {
    throw new Error(`${fieldName} cannot be used in a Registration document ID.`);
  }
}

export function getRegistrationId(playerId: string, registrationOfferingId: string): string {
  assertValidRegistrationIdPart(playerId, 'playerId');
  assertValidRegistrationIdPart(registrationOfferingId, 'registrationOfferingId');

  return `${playerId}${REGISTRATION_ID_SEPARATOR}${registrationOfferingId}`;
}

function getRegistrationReference(playerId: string, registrationOfferingId: string) {
  return doc(db, 'registrations', getRegistrationId(playerId, registrationOfferingId));
}

function getAuthenticatedPlayerId(): string {
  const playerId = auth.currentUser?.uid;

  if (!playerId) {
    throw new Error('An authenticated player is required to access Registration.');
  }

  return playerId;
}

export async function getRegistration(
  registrationOfferingId: string,
): Promise<Registration | null> {
  const playerId = getAuthenticatedPlayerId();
  const snapshot = await getDoc(getRegistrationReference(playerId, registrationOfferingId));

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
  const reference = getRegistrationReference(playerId, input.registrationOfferingId);
  const timestamp = serverTimestamp();
  const acquisition = normalizeAcquisitionAttribution(input);

  await setDoc(reference, {
    playerId,
    registrationOfferingId: input.registrationOfferingId,
    leagueId: null,
    status: 'pending_payment',
    competitionRulesVersionAccepted: input.competitionRulesVersionAccepted,
    competitionRulesAcceptedAt: timestamp,
    refundPolicyVersionAccepted: input.refundPolicyVersionAccepted,
    refundPolicyAcceptedAt: timestamp,
    ...acquisition,
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

export async function updateRegistrationAcquisitionSource(
  registrationOfferingId: string,
  input: AcquisitionAttribution,
): Promise<void> {
  const playerId = getAuthenticatedPlayerId();
  const acquisition = normalizeAcquisitionAttribution(input);

  await updateDoc(getRegistrationReference(playerId, registrationOfferingId), {
    ...acquisition,
    updatedAt: serverTimestamp(),
  });
}

export async function cancelRegistration(
  registrationOfferingId: string,
): Promise<void> {
  const playerId = getAuthenticatedPlayerId();
  const timestamp = serverTimestamp();

  await updateDoc(getRegistrationReference(playerId, registrationOfferingId), {
    status: 'cancelled',
    cancelledAt: timestamp,
    updatedAt: timestamp,
  });
}
