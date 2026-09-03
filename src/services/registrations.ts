import { collection, doc, getDoc, getDocs, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { auth, db, functions } from '../lib/firebase';
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
  getAuthenticatedPlayerId();
  const acquisition = normalizeAcquisitionAttribution(input);
  const callable = httpsCallable<CreateRegistrationInput, {
    registrationId: string;
    registrationOrder: number;
  }>(functions, 'createLeagueRegistration');
  const response = await callable({ ...input, ...acquisition });

  if (
    typeof response.data.registrationId !== 'string'
    || !Number.isInteger(response.data.registrationOrder)
    || response.data.registrationOrder < 1
  ) {
    throw new Error('Registration service returned an invalid response.');
  }
  return response.data.registrationId;
}

export async function getRegistrations(): Promise<Registration[]> {
  const playerId = getAuthenticatedPlayerId();
  const snapshot = await getDocs(query(
    collection(db, 'registrations'),
    where('playerId', '==', playerId),
  ));

  return snapshot.docs
    .map((registrationDocument) => ({
      id: registrationDocument.id,
      ...(registrationDocument.data() as RegistrationDocument),
    }))
    .sort((first, second) => second.submittedAt.toMillis() - first.submittedAt.toMillis());
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
