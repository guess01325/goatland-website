import { Timestamp } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import {
  CURRENT_COMPETITION_RULES_VERSION,
  CURRENT_REFUND_POLICY_VERSION,
} from './registrationPolicies.js';
import { collections, db } from './firebaseCore.js';

type CreateRegistrationRequest = {
  registrationOfferingId?: unknown;
  competitionRulesVersionAccepted?: unknown;
  refundPolicyVersionAccepted?: unknown;
  acquisitionSource?: unknown;
  acquisitionSourceOther?: unknown;
};

type PlayerData = {
  accountStatus?: unknown;
  profileComplete?: unknown;
};

type OfferingData = {
  status?: unknown;
  registrationOpensAt?: unknown;
  registrationClosesAt?: unknown;
};

const ACQUISITION_SOURCES = new Set([
  'facebook',
  'instagram',
  'tiktok',
  'discord',
  'google',
  'friend_family',
  'event',
  'other',
]);

function requireIdentifier(value: unknown, fieldName: string): string {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.includes('|')
    || value.includes('/')
  ) {
    throw new HttpsError('invalid-argument', `${fieldName} is invalid.`);
  }
  return value;
}

function validateAcquisition(data: CreateRegistrationRequest): {
  acquisitionSource: string;
  acquisitionSourceOther: string | null;
} {
  if (
    typeof data.acquisitionSource !== 'string'
    || !ACQUISITION_SOURCES.has(data.acquisitionSource)
  ) {
    throw new HttpsError('invalid-argument', 'Acquisition source is invalid.');
  }

  if (data.acquisitionSource !== 'other') {
    if (data.acquisitionSourceOther !== null) {
      throw new HttpsError('invalid-argument', 'Acquisition source details are invalid.');
    }
    return { acquisitionSource: data.acquisitionSource, acquisitionSourceOther: null };
  }

  if (
    typeof data.acquisitionSourceOther !== 'string'
    || data.acquisitionSourceOther !== data.acquisitionSourceOther.trim()
    || Array.from(data.acquisitionSourceOther).length < 1
    || Array.from(data.acquisitionSourceOther).length > 100
  ) {
    throw new HttpsError('invalid-argument', 'Acquisition source details are invalid.');
  }

  return {
    acquisitionSource: data.acquisitionSource,
    acquisitionSourceOther: data.acquisitionSourceOther,
  };
}

function validateOffering(offering: OfferingData | undefined, now: Timestamp): void {
  if (
    offering?.status !== 'enabled'
    || !(offering.registrationOpensAt instanceof Timestamp)
    || !(offering.registrationClosesAt instanceof Timestamp)
    || offering.registrationOpensAt.toMillis() > now.toMillis()
    || now.toMillis() >= offering.registrationClosesAt.toMillis()
  ) {
    throw new HttpsError('failed-precondition', 'Registration offering is not currently open.');
  }
}

export const createLeagueRegistration = onCall(async (request) => {
  const playerId = request.auth?.uid;
  if (!playerId) {
    throw new HttpsError('unauthenticated', 'Authentication is required.');
  }

  if (!request.data || typeof request.data !== 'object' || Array.isArray(request.data)) {
    throw new HttpsError('invalid-argument', 'Registration request is invalid.');
  }
  const data = request.data as CreateRegistrationRequest;
  const allowedKeys = [
    'acquisitionSource',
    'acquisitionSourceOther',
    'competitionRulesVersionAccepted',
    'refundPolicyVersionAccepted',
    'registrationOfferingId',
  ];
  if (Object.keys(data).some((key) => !allowedKeys.includes(key))) {
    throw new HttpsError('invalid-argument', 'Registration request contains unsupported fields.');
  }
  const offeringId = requireIdentifier(
    data.registrationOfferingId,
    'registrationOfferingId',
  );
  requireIdentifier(playerId, 'playerId');

  if (
    data.competitionRulesVersionAccepted !== CURRENT_COMPETITION_RULES_VERSION
    || data.refundPolicyVersionAccepted !== CURRENT_REFUND_POLICY_VERSION
  ) {
    throw new HttpsError('failed-precondition', 'Current registration policies are required.');
  }

  const acquisition = validateAcquisition(data);
  const registrationId = `${playerId}|${offeringId}`;
  const playerRef = db.collection(collections.players).doc(playerId);
  const offeringRef = db.collection(collections.registrationOfferings).doc(offeringId);
  const registrationRef = db.collection(collections.registrations).doc(registrationId);
  const counterRef = db.collection(collections.registrationPriorityCounters).doc(offeringId);
  const registrationsQuery = db.collection(collections.registrations)
    .where('registrationOfferingId', '==', offeringId);

  const registrationOrder = await db.runTransaction(async (transaction) => {
    const [playerSnapshot, offeringSnapshot, registrationSnapshot, counterSnapshot] =
      await Promise.all([
        transaction.get(playerRef),
        transaction.get(offeringRef),
        transaction.get(registrationRef),
        transaction.get(counterRef),
      ]);

    if (registrationSnapshot.exists) {
      throw new HttpsError('already-exists', 'A Registration already exists for this offering.');
    }

    const player = playerSnapshot.data() as PlayerData | undefined;
    if (
      !playerSnapshot.exists
      || player?.accountStatus !== 'active'
      || player.profileComplete !== true
    ) {
      throw new HttpsError('failed-precondition', 'An active Player profile is required.');
    }

    const now = Timestamp.now();
    validateOffering(offeringSnapshot.data() as OfferingData | undefined, now);

    let lastAssignedRegistrationOrder = 0;
    if (counterSnapshot.exists) {
      const storedOrder = counterSnapshot.data()?.lastAssignedRegistrationOrder;
      if (!Number.isInteger(storedOrder) || Number(storedOrder) < 0) {
        throw new HttpsError('failed-precondition', 'Registration priority state is invalid.');
      }
      lastAssignedRegistrationOrder = Number(storedOrder);
    } else {
      const registrationsSnapshot = await transaction.get(registrationsQuery);
      for (const snapshot of registrationsSnapshot.docs) {
        const existingOrder = snapshot.data().registrationOrder;
        if (Number.isInteger(existingOrder) && Number(existingOrder) > lastAssignedRegistrationOrder) {
          lastAssignedRegistrationOrder = Number(existingOrder);
        }
      }
    }

    const nextOrder = lastAssignedRegistrationOrder + 1;
    transaction.set(counterRef, {
      lastAssignedRegistrationOrder: nextOrder,
      createdAt: counterSnapshot.exists ? counterSnapshot.data()?.createdAt ?? now : now,
      updatedAt: now,
    });
    transaction.create(registrationRef, {
      playerId,
      registrationOfferingId: offeringId,
      leagueId: null,
      status: 'pending_payment',
      competitionRulesVersionAccepted: CURRENT_COMPETITION_RULES_VERSION,
      competitionRulesAcceptedAt: now,
      refundPolicyVersionAccepted: CURRENT_REFUND_POLICY_VERSION,
      refundPolicyAcceptedAt: now,
      ...acquisition,
      promoCodeId: null,
      promoCodeSnapshot: null,
      promoterIdSnapshot: null,
      registrationOrder: nextOrder,
      paymentAvailabilityStatus: 'unavailable',
      paymentAvailableAt: null,
      paymentDueAt: null,
      createdAt: now,
      updatedAt: now,
      submittedAt: now,
      confirmedAt: null,
      cancelledAt: null,
    });
    return nextOrder;
  });

  return { registrationId, registrationOrder };
});
