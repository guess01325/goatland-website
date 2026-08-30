import { Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { onRequest } from 'firebase-functions/v2/https';
import type Stripe from 'stripe';
import { stripeSecretKey, stripeWebhookSecret } from './config.js';
import type { SeatHoldData } from './seatHolds.js';
import {
  collections,
  db,
  getLeagueId,
  getPaymentIntentId,
  getPublicRosterEntryId,
  getStripe,
  LEAGUE_CAPACITY,
  LEAGUE_SUCCESSOR_THRESHOLD,
} from './shared.js';

type PaymentData = {
  registrationId?: unknown;
  provider?: unknown;
  status?: unknown;
  amountCents?: unknown;
  currency?: unknown;
  providerCheckoutSessionId?: unknown;
};

type RegistrationData = {
  playerId?: unknown;
  registrationOfferingId?: unknown;
  leagueId?: unknown;
  status?: unknown;
  registrationOrder?: unknown;
  confirmedAt?: unknown;
};

type PlayerData = {
  displayName?: unknown;
};

type PublicRosterData = {
  displayName?: unknown;
  registrationOrder?: unknown;
};

type LeagueData = {
  registrationOfferingId?: unknown;
  leagueNumber?: unknown;
  status?: unknown;
  capacity?: unknown;
  confirmedCount?: unknown;
  activeHoldCount?: unknown;
  lastAssignedRegistrationOrder?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
};

type SuccessorContext = {
  reference: FirebaseFirestore.DocumentReference;
  snapshot: FirebaseFirestore.DocumentSnapshot;
  registrationOfferingId: string;
  leagueNumber: number;
};

function requireMetadata(session: Stripe.Checkout.Session): {
  paymentId: string;
  registrationId: string;
  leagueId: string;
  seatHoldId: string;
} {
  const paymentId = session.metadata?.paymentId;
  const registrationId = session.metadata?.registrationId;
  const leagueId = session.metadata?.leagueId;
  const seatHoldId = session.metadata?.seatHoldId;

  if (!paymentId || !registrationId || !leagueId || !seatHoldId) {
    throw new Error('Stripe Checkout Session metadata is incomplete.');
  }

  return { paymentId, registrationId, leagueId, seatHoldId };
}

function eventRecord(event: Stripe.Event, session: Stripe.Checkout.Session, timestamp: Timestamp) {
  return {
    provider: 'stripe',
    type: event.type,
    objectId: session.id,
    processedAt: timestamp,
  };
}

function requireDisplayName(player: PlayerData | undefined): string {
  if (
    typeof player?.displayName !== 'string'
    || player.displayName.length < 2
    || player.displayName.length > 40
  ) {
    throw new Error('Player public display name is invalid.');
  }

  return player.displayName;
}

function validatePublicRosterProjection(
  rosterSnapshot: FirebaseFirestore.DocumentSnapshot,
  registrationOrder: number,
): void {
  const roster = rosterSnapshot.data() as PublicRosterData;
  if (
    typeof roster.displayName !== 'string'
    || roster.displayName.length < 2
    || roster.displayName.length > 40
    || roster.registrationOrder !== registrationOrder
    || Object.keys(roster).length !== 2
  ) {
    throw new Error('Public roster projection is inconsistent.');
  }
}

function validateFulfillmentLeague(
  snapshot: FirebaseFirestore.DocumentSnapshot,
  registrationOfferingId: string,
): {
    leagueNumber: number;
    capacity: number;
    confirmedCount: number;
    activeHoldCount: number;
    lastAssignedRegistrationOrder: number;
  } {
  const league = snapshot.data() as LeagueData;
  if (
    league.registrationOfferingId !== registrationOfferingId
    || !Number.isInteger(league.leagueNumber)
    || Number(league.leagueNumber) < 1
    || snapshot.id !== getLeagueId(registrationOfferingId, Number(league.leagueNumber))
    || !Number.isInteger(league.capacity)
    || Number(league.capacity) < 1
    || !Number.isInteger(league.confirmedCount)
    || Number(league.confirmedCount) < 0
    || !Number.isInteger(league.activeHoldCount)
    || Number(league.activeHoldCount) < 0
    || !Number.isInteger(league.lastAssignedRegistrationOrder)
    || Number(league.lastAssignedRegistrationOrder) < 0
    || !(league.createdAt instanceof Timestamp)
    || !(league.updatedAt instanceof Timestamp)
    || Number(league.confirmedCount) + Number(league.activeHoldCount) > Number(league.capacity)
  ) {
    throw new Error('League registration state is invalid.');
  }

  return {
    leagueNumber: Number(league.leagueNumber),
    capacity: Number(league.capacity),
    confirmedCount: Number(league.confirmedCount),
    activeHoldCount: Number(league.activeHoldCount),
    lastAssignedRegistrationOrder: Number(league.lastAssignedRegistrationOrder),
  };
}

function validateExistingSuccessor(context: SuccessorContext): void {
  const successor = context.snapshot.data() as LeagueData;
  const expectedKeys = [
    'activeHoldCount',
    'capacity',
    'confirmedCount',
    'createdAt',
    'lastAssignedRegistrationOrder',
    'leagueNumber',
    'registrationOfferingId',
    'status',
    'updatedAt',
  ];

  if (
    successor.registrationOfferingId !== context.registrationOfferingId
    || successor.leagueNumber !== context.leagueNumber
    || successor.capacity !== LEAGUE_CAPACITY
    || !['open', 'full', 'closed', 'cancelled'].includes(String(successor.status))
    || !Number.isInteger(successor.confirmedCount)
    || Number(successor.confirmedCount) < 0
    || !Number.isInteger(successor.activeHoldCount)
    || Number(successor.activeHoldCount) < 0
    || !Number.isInteger(successor.lastAssignedRegistrationOrder)
    || Number(successor.lastAssignedRegistrationOrder) < 0
    || Number(successor.confirmedCount) + Number(successor.activeHoldCount) > LEAGUE_CAPACITY
    || !(successor.createdAt instanceof Timestamp)
    || !(successor.updatedAt instanceof Timestamp)
    || Object.keys(successor).sort().join(',') !== expectedKeys.sort().join(',')
  ) {
    throw new Error('Deterministic successor League is invalid; refusing to overwrite it.');
  }
}

function createSuccessorIfMissing(
  transaction: FirebaseFirestore.Transaction,
  context: SuccessorContext | null,
  timestamp: Timestamp,
): void {
  if (!context || context.snapshot.exists) return;

  transaction.create(context.reference, {
    registrationOfferingId: context.registrationOfferingId,
    leagueNumber: context.leagueNumber,
    capacity: LEAGUE_CAPACITY,
    status: 'open',
    confirmedCount: 0,
    activeHoldCount: 0,
    lastAssignedRegistrationOrder: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

async function ensurePublicRosterProjection(
  transaction: FirebaseFirestore.Transaction,
  rosterRef: FirebaseFirestore.DocumentReference,
  rosterSnapshot: FirebaseFirestore.DocumentSnapshot,
  playerRef: FirebaseFirestore.DocumentReference,
  registrationOrder: number,
): Promise<void> {
  if (rosterSnapshot.exists) {
    validatePublicRosterProjection(rosterSnapshot, registrationOrder);
    return;
  }

  const playerSnapshot = await transaction.get(playerRef);
  if (!playerSnapshot.exists) {
    throw new Error('Player was not found for public roster projection.');
  }

  const displayName = requireDisplayName(playerSnapshot.data() as PlayerData);
  transaction.create(rosterRef, { displayName, registrationOrder });
}

export async function fulfillSuccessfulCheckout(
  event: Stripe.Event | null,
  session: Stripe.Checkout.Session,
): Promise<void> {
  if (session.mode !== 'payment' || session.payment_status !== 'paid') {
    throw new Error('Stripe Checkout Session is not an authoritative paid payment.');
  }

  const { paymentId, registrationId, leagueId, seatHoldId } = requireMetadata(session);
  const eventRef = event
    ? db.collection(collections.stripeWebhookEvents).doc(event.id)
    : null;
  const paymentRef = db.collection(collections.payments).doc(paymentId);
  const registrationRef = db.collection(collections.registrations).doc(registrationId);
  const seatHoldRef = db.collection(collections.seatHolds).doc(seatHoldId);
  const leagueRef = db.collection(collections.leagues).doc(leagueId);
  const checkoutLockRef = db
    .collection(collections.registrationCheckoutLocks)
    .doc(registrationId);

  await db.runTransaction(async (transaction) => {
    const eventSnapshot = eventRef ? await transaction.get(eventRef) : null;
    const paymentSnapshot = await transaction.get(paymentRef);
    const registrationSnapshot = await transaction.get(registrationRef);
    const seatHoldSnapshot = await transaction.get(seatHoldRef);
    const leagueSnapshot = await transaction.get(leagueRef);
    const checkoutLockSnapshot = await transaction.get(checkoutLockRef);

    if (eventSnapshot?.exists) {
      return;
    }

    if (
      !paymentSnapshot.exists
      || !registrationSnapshot.exists
      || !seatHoldSnapshot.exists
      || !leagueSnapshot.exists
    ) {
      throw new Error('Payment, Registration, SeatHold, or League was not found.');
    }

    const payment = paymentSnapshot.data() as PaymentData;
    const registration = registrationSnapshot.data() as RegistrationData;
    const seatHold = seatHoldSnapshot.data() as SeatHoldData;
    const league = leagueSnapshot.data() as LeagueData;

    if (
      payment.registrationId !== registrationId
      || payment.provider !== 'stripe'
      || payment.providerCheckoutSessionId !== session.id
      || payment.amountCents !== session.amount_total
      || payment.currency !== session.currency?.toUpperCase()
    ) {
      throw new Error('Stripe Checkout Session does not match Payment.');
    }

    if (
      typeof registration.playerId !== 'string'
      || registration.playerId.length === 0
      || typeof registration.registrationOfferingId !== 'string'
      || registration.leagueId !== leagueId
      || seatHoldId !== paymentId
    ) {
      throw new Error('Registration offering relationship is invalid.');
    }

    const offeringRef = db
      .collection(collections.registrationOfferings)
      .doc(registration.registrationOfferingId);
    const playerRef = db.collection(collections.players).doc(registration.playerId);
    const rosterRef = leagueRef
      .collection('publicRoster')
      .doc(getPublicRosterEntryId(leagueId, registrationId));
    const [offeringSnapshot, rosterSnapshot] = await Promise.all([
      transaction.get(offeringRef),
      transaction.get(rosterRef),
    ]);

    if (!offeringSnapshot.exists) {
      throw new Error('Registration offering was not found.');
    }

    if (
      league.registrationOfferingId !== registration.registrationOfferingId
      || seatHold.paymentId !== paymentId
      || seatHold.registrationId !== registrationId
      || seatHold.registrationOfferingId !== registration.registrationOfferingId
      || seatHold.leagueId !== leagueId
      || seatHold.providerCheckoutSessionId !== session.id
    ) {
      throw new Error('SeatHold, League, or Registration offering relationship is invalid.');
    }

    const leagueState = validateFulfillmentLeague(
      leagueSnapshot,
      registration.registrationOfferingId,
    );
    const confirmationAlreadyCounted = payment.status === 'succeeded'
      || registration.status === 'confirmed';
    const projectedConfirmedCount = leagueState.confirmedCount
      + (confirmationAlreadyCounted ? 0 : 1);
    let successorContext: SuccessorContext | null = null;

    if (projectedConfirmedCount >= LEAGUE_SUCCESSOR_THRESHOLD) {
      const successorLeagueNumber = leagueState.leagueNumber + 1;
      const successorRef = db.collection(collections.leagues).doc(
        getLeagueId(registration.registrationOfferingId, successorLeagueNumber),
      );
      const successorSnapshot = await transaction.get(successorRef);
      successorContext = {
        reference: successorRef,
        snapshot: successorSnapshot,
        registrationOfferingId: registration.registrationOfferingId,
        leagueNumber: successorLeagueNumber,
      };

      if (successorSnapshot.exists) {
        validateExistingSuccessor(successorContext);
      }
    }

    const timestamp = Timestamp.now();
    const providerPaymentIntentId = getPaymentIntentId(session.payment_intent);

    if (payment.status === 'succeeded') {
      if (
        registration.status !== 'confirmed'
        || !Number.isInteger(registration.registrationOrder)
        || !(registration.confirmedAt instanceof Timestamp)
        || seatHold.status !== 'converted'
      ) {
        throw new Error('Succeeded Payment has inconsistent Registration state.');
      }

      await ensurePublicRosterProjection(
        transaction,
        rosterRef,
        rosterSnapshot,
        playerRef,
        Number(registration.registrationOrder),
      );

      createSuccessorIfMissing(transaction, successorContext, timestamp);

      if (eventRef && event) {
        transaction.create(eventRef, eventRecord(event, session, timestamp));
      }
      if (checkoutLockSnapshot.data()?.paymentId === paymentId) {
        transaction.delete(checkoutLockRef);
      }
      return;
    }

    if (registration.status === 'confirmed') {
      if (seatHold.status !== 'converted') {
        throw new Error('Confirmed Registration has inconsistent SeatHold state.');
      }

      if (!Number.isInteger(registration.registrationOrder)) {
        throw new Error('Confirmed Registration has no registration order.');
      }

      await ensurePublicRosterProjection(
        transaction,
        rosterRef,
        rosterSnapshot,
        playerRef,
        Number(registration.registrationOrder),
      );

      createSuccessorIfMissing(transaction, successorContext, timestamp);

      transaction.update(paymentRef, {
        status: 'succeeded',
        providerPaymentIntentId,
        succeededAt: timestamp,
        updatedAt: timestamp,
      });
      if (eventRef && event) {
        transaction.create(eventRef, eventRecord(event, session, timestamp));
      }
      if (checkoutLockSnapshot.data()?.paymentId === paymentId) {
        transaction.delete(checkoutLockRef);
      }
      return;
    }

    if (
      registration.status !== 'pending_payment'
      || registration.registrationOrder !== null
      || registration.confirmedAt !== null
      || payment.status !== 'pending'
      || seatHold.status !== 'active'
    ) {
      throw new Error('Registration is not eligible for payment fulfillment.');
    }

    if (rosterSnapshot.exists) {
      throw new Error('Pending Registration already has a public roster projection.');
    }

    const playerSnapshot = await transaction.get(playerRef);
    if (!playerSnapshot.exists) {
      throw new Error('Player was not found for public roster projection.');
    }
    const displayName = requireDisplayName(playerSnapshot.data() as PlayerData);

    if (leagueState.activeHoldCount < 1) {
      throw new Error('League registration state is invalid.');
    }

    const nextOrder = leagueState.lastAssignedRegistrationOrder + 1;
    const nextConfirmedCount = leagueState.confirmedCount + 1;
    const nextActiveHoldCount = leagueState.activeHoldCount - 1;

    if (
      nextConfirmedCount > leagueState.capacity
      || nextActiveHoldCount < 0
      || nextConfirmedCount + nextActiveHoldCount > leagueState.capacity
    ) {
      throw new Error('SeatHold conversion would violate League capacity.');
    }

    createSuccessorIfMissing(transaction, successorContext, timestamp);

    transaction.update(leagueRef, {
      confirmedCount: nextConfirmedCount,
      activeHoldCount: nextActiveHoldCount,
      lastAssignedRegistrationOrder: nextOrder,
      status: nextConfirmedCount === leagueState.capacity ? 'full' : league.status,
      updatedAt: timestamp,
    });
    transaction.update(paymentRef, {
      status: 'succeeded',
      providerPaymentIntentId,
      succeededAt: timestamp,
      updatedAt: timestamp,
    });
    transaction.update(registrationRef, {
      status: 'confirmed',
      registrationOrder: nextOrder,
      confirmedAt: timestamp,
      updatedAt: timestamp,
    });
    transaction.update(seatHoldRef, {
      status: 'converted',
      updatedAt: timestamp,
    });
    transaction.create(rosterRef, {
      displayName,
      registrationOrder: nextOrder,
    });
    if (eventRef && event) {
      transaction.create(eventRef, eventRecord(event, session, timestamp));
    }
    if (checkoutLockSnapshot.data()?.paymentId === paymentId) {
      transaction.delete(checkoutLockRef);
    }
  });
}

export async function expireCheckout(
  event: Stripe.Event | null,
  session: Stripe.Checkout.Session,
): Promise<void> {
  const { paymentId, registrationId, leagueId, seatHoldId } = requireMetadata(session);
  const eventRef = event
    ? db.collection(collections.stripeWebhookEvents).doc(event.id)
    : null;
  const paymentRef = db.collection(collections.payments).doc(paymentId);
  const registrationRef = db.collection(collections.registrations).doc(registrationId);
  const seatHoldRef = db.collection(collections.seatHolds).doc(seatHoldId);
  const leagueRef = db.collection(collections.leagues).doc(leagueId);
  const checkoutLockRef = db
    .collection(collections.registrationCheckoutLocks)
    .doc(registrationId);

  await db.runTransaction(async (transaction) => {
    const eventSnapshot = eventRef ? await transaction.get(eventRef) : null;
    const paymentSnapshot = await transaction.get(paymentRef);
    const registrationSnapshot = await transaction.get(registrationRef);
    const seatHoldSnapshot = await transaction.get(seatHoldRef);
    const leagueSnapshot = await transaction.get(leagueRef);
    const checkoutLockSnapshot = await transaction.get(checkoutLockRef);

    if (eventSnapshot?.exists) {
      return;
    }

    if (
      !registrationSnapshot.exists
      || !seatHoldSnapshot.exists
      || !leagueSnapshot.exists
    ) {
      throw new Error('Registration, SeatHold, or League was not found.');
    }

    const registration = registrationSnapshot.data() as RegistrationData;
    const seatHold = seatHoldSnapshot.data() as SeatHoldData;
    const league = leagueSnapshot.data() as LeagueData;
    const timestamp = Timestamp.now();

    if (!paymentSnapshot.exists) {
      if (
        seatHoldId !== paymentId
        || registration.leagueId !== leagueId
        || seatHold.paymentId !== paymentId
        || seatHold.registrationId !== registrationId
        || seatHold.registrationOfferingId !== registration.registrationOfferingId
        || seatHold.leagueId !== leagueId
        || seatHold.providerCheckoutSessionId !== session.id
        || seatHold.status !== 'released'
        || league.registrationOfferingId !== registration.registrationOfferingId
      ) {
        throw new Error('Released SeatHold relationships are inconsistent.');
      }

      if (eventRef && event) {
        transaction.create(eventRef, eventRecord(event, session, timestamp));
      }
      if (checkoutLockSnapshot.data()?.paymentId === paymentId) {
        transaction.delete(checkoutLockRef);
      }
      return;
    }

    const payment = paymentSnapshot.data() as PaymentData;

    if (
      seatHoldId !== paymentId
      || payment.registrationId !== registrationId
      || payment.provider !== 'stripe'
      || payment.providerCheckoutSessionId !== session.id
      || registration.leagueId !== leagueId
      || seatHold.paymentId !== paymentId
      || seatHold.registrationId !== registrationId
      || seatHold.registrationOfferingId !== registration.registrationOfferingId
      || seatHold.leagueId !== leagueId
      || seatHold.providerCheckoutSessionId !== session.id
      || league.registrationOfferingId !== registration.registrationOfferingId
    ) {
      throw new Error('Expired Checkout Session relationships are inconsistent.');
    }

    if (seatHold.status === 'active') {
      if (payment.status !== 'pending') {
        throw new Error('Active SeatHold has inconsistent Payment state.');
      }

      if (
        !Number.isInteger(league.activeHoldCount)
        || Number(league.activeHoldCount) < 1
        || !Number.isInteger(league.confirmedCount)
        || Number(league.confirmedCount) < 0
        || !Number.isInteger(league.capacity)
        || Number(league.capacity) < 1
        || Number(league.confirmedCount) + Number(league.activeHoldCount)
          > Number(league.capacity)
      ) {
        throw new Error('League capacity state is invalid.');
      }

      transaction.update(leagueRef, {
        activeHoldCount: Number(league.activeHoldCount) - 1,
        updatedAt: timestamp,
      });
      transaction.update(seatHoldRef, {
        status: 'expired',
        updatedAt: timestamp,
      });

      transaction.update(paymentRef, {
        status: 'expired',
        expiredAt: timestamp,
        updatedAt: timestamp,
      });
    } else if (seatHold.status === 'converted') {
      if (payment.status !== 'succeeded' || registration.status !== 'confirmed') {
        throw new Error('Converted SeatHold has inconsistent fulfillment state.');
      }
    } else if (seatHold.status === 'expired' || seatHold.status === 'released') {
      if (payment.status === 'pending') {
        transaction.update(paymentRef, {
          status: 'expired',
          expiredAt: timestamp,
          updatedAt: timestamp,
        });
      }
    } else {
      throw new Error('SeatHold is not eligible for expiration.');
    }

    if (eventRef && event) {
      transaction.create(eventRef, eventRecord(event, session, timestamp));
    }
    if (checkoutLockSnapshot.data()?.paymentId === paymentId) {
      transaction.delete(checkoutLockRef);
    }
  });
}

export const stripeWebhook = onRequest(
  { secrets: [stripeSecretKey, stripeWebhookSecret] },
  async (request, response) => {
    let event: Stripe.Event;

    try {
      event = getStripe().webhooks.constructEvent(
        request.rawBody,
        request.header('stripe-signature') ?? '',
        stripeWebhookSecret.value(),
      );
    } catch (error) {
      logger.warn('Stripe webhook signature verification failed.', error);
      response.status(400).send('Invalid Stripe signature.');
      return;
    }

    try {
      if (event.type === 'checkout.session.completed') {
        await fulfillSuccessfulCheckout(event, event.data.object);
      } else if (event.type === 'checkout.session.expired') {
        await expireCheckout(event, event.data.object);
      }

      response.status(200).send('OK');
    } catch (error) {
      logger.error('Stripe webhook processing failed.', error);
      response.status(500).send('Webhook processing failed.');
    }
  },
);
