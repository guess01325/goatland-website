import { Timestamp } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import type Stripe from 'stripe';
import {
  checkoutCancelUrl,
  checkoutSuccessUrl,
  CURRENT_COMPETITION_RULES_VERSION,
  CURRENT_REFUND_POLICY_VERSION,
  stripeSecretKey,
} from './config.js';
import {
  collections,
  db,
  getPaymentId,
  getPaymentIntentId,
  getPromoCodeId,
  getStripe,
  isUuid,
} from './shared.js';
import type { SeatHoldData } from './seatHolds.js';

type CheckoutRequest = {
  registrationId?: unknown;
  checkoutRequestId?: unknown;
  promoCode?: unknown;
};

type RegistrationData = {
  playerId?: unknown;
  registrationOfferingId?: unknown;
  leagueId?: unknown;
  status?: unknown;
  promoCodeId?: unknown;
  promoCodeSnapshot?: unknown;
  promoterIdSnapshot?: unknown;
  acquisitionSource?: unknown;
  acquisitionSourceOther?: unknown;
  competitionRulesVersionAccepted?: unknown;
  competitionRulesAcceptedAt?: unknown;
  refundPolicyVersionAccepted?: unknown;
  refundPolicyAcceptedAt?: unknown;
};

type OfferingData = {
  status?: unknown;
  registrationOpensAt?: unknown;
  registrationClosesAt?: unknown;
  entryFeeCents?: unknown;
  currency?: unknown;
};

type LeagueData = {
  registrationOfferingId?: unknown;
  status?: unknown;
  capacity?: unknown;
  confirmedCount?: unknown;
  activeHoldCount?: unknown;
};

type PlayerData = {
  accountStatus?: unknown;
  profileComplete?: unknown;
};

type Attribution = {
  promoCodeId: string;
  promoCodeSnapshot: string;
  promoterIdSnapshot: string;
} | null;

type CheckoutTestHookStage =
  | 'before-provisioning-transaction'
  | 'before-activation-transaction'
  | 'before-locked-checkout-return';
type CheckoutTestHook = (stage: CheckoutTestHookStage) => Promise<void>;

let checkoutTestHook: CheckoutTestHook | null = null;

export function setCheckoutTestHookForEmulatorTests(hook: CheckoutTestHook | null): void {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error('Checkout test hooks are only available with the Firestore emulator.');
  }

  checkoutTestHook = hook;
}

async function runCheckoutTestHook(stage: CheckoutTestHookStage): Promise<void> {
  if (process.env.FIRESTORE_EMULATOR_HOST && checkoutTestHook) {
    await checkoutTestHook(stage);
  }
}

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
const ACQUISITION_SOURCE_OTHER_MAX_LENGTH = 100;

type AcquisitionAttribution = {
  acquisitionSource: string;
  acquisitionSourceOther: string | null;
};

function validateAcquisitionAttribution(
  registration: RegistrationData,
): AcquisitionAttribution {
  const { acquisitionSource, acquisitionSourceOther } = registration;

  if (typeof acquisitionSource !== 'string' || !ACQUISITION_SOURCES.has(acquisitionSource)) {
    throw new HttpsError('failed-precondition', 'Registration acquisition source is invalid.');
  }

  if (acquisitionSource !== 'other') {
    if (acquisitionSourceOther !== null) {
      throw new HttpsError('failed-precondition', 'Registration acquisition source is invalid.');
    }
    return { acquisitionSource, acquisitionSourceOther: null };
  }

  if (
    typeof acquisitionSourceOther !== 'string'
    || acquisitionSourceOther !== acquisitionSourceOther.trim()
    || Array.from(acquisitionSourceOther).length === 0
    || Array.from(acquisitionSourceOther).length > ACQUISITION_SOURCE_OTHER_MAX_LENGTH
  ) {
    throw new HttpsError('failed-precondition', 'Registration acquisition source is invalid.');
  }

  return { acquisitionSource, acquisitionSourceOther };
}

function sameAcquisitionAttribution(
  first: AcquisitionAttribution,
  second: AcquisitionAttribution,
): boolean {
  return first.acquisitionSource === second.acquisitionSource
    && first.acquisitionSourceOther === second.acquisitionSourceOther;
}

function requireString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new HttpsError('invalid-argument', `${fieldName} is required.`);
  }

  return value;
}

function requireConfiguredUrl(value: string, fieldName: string): string {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(value);
  } catch {
    throw new HttpsError('failed-precondition', `${fieldName} is not configured correctly.`);
  }

  const isLocalHttp = parsedUrl.protocol === 'http:'
    && (parsedUrl.hostname === 'localhost' || parsedUrl.hostname === '127.0.0.1');

  if (parsedUrl.protocol !== 'https:' && !isLocalHttp) {
    throw new HttpsError('failed-precondition', `${fieldName} must use HTTPS or local HTTP.`);
  }

  return parsedUrl.toString();
}

function validateRegistrationOwner(
  registration: RegistrationData,
  playerId: string,
): string {
  if (registration.playerId !== playerId) {
    throw new HttpsError('permission-denied', 'Registration does not belong to this player.');
  }

  if (registration.status !== 'pending_payment') {
    throw new HttpsError('failed-precondition', 'Registration is not awaiting payment.');
  }

  return requireString(registration.registrationOfferingId, 'Registration offering');
}

function validateRegistrationPolicies(registration: RegistrationData): void {
  if (
    registration.competitionRulesVersionAccepted !== CURRENT_COMPETITION_RULES_VERSION
    || registration.refundPolicyVersionAccepted !== CURRENT_REFUND_POLICY_VERSION
    || !(registration.competitionRulesAcceptedAt instanceof Timestamp)
    || !(registration.refundPolicyAcceptedAt instanceof Timestamp)
  ) {
    throw new HttpsError(
      'failed-precondition',
      'Registration policy acceptance is no longer current.',
    );
  }
}

function validateOffering(offering: OfferingData, now: Timestamp): { amountCents: number; currency: 'USD' } {
  if (offering.status !== 'enabled') {
    throw new HttpsError('failed-precondition', 'Registration offering is not enabled.');
  }

  if (
    !(offering.registrationOpensAt instanceof Timestamp)
    || !(offering.registrationClosesAt instanceof Timestamp)
  ) {
    throw new HttpsError('failed-precondition', 'Registration offering window is not configured.');
  }

  if (
    offering.registrationOpensAt.toMillis() > now.toMillis()
    || now.toMillis() >= offering.registrationClosesAt.toMillis()
  ) {
    throw new HttpsError('failed-precondition', 'Registration offering is not currently open.');
  }

  if (!Number.isInteger(offering.entryFeeCents) || Number(offering.entryFeeCents) <= 0) {
    throw new HttpsError('failed-precondition', 'Registration offering price is invalid.');
  }

  if (offering.currency !== 'USD') {
    throw new HttpsError('failed-precondition', 'Registration offering currency is invalid.');
  }

  return { amountCents: Number(offering.entryFeeCents), currency: 'USD' };
}

function validateLeague(
  league: LeagueData,
  registrationOfferingId: string,
  requireAvailableSeat = true,
): { capacity: number; confirmedCount: number; activeHoldCount: number } {
  if (league.registrationOfferingId !== registrationOfferingId) {
    throw new HttpsError('failed-precondition', 'League does not belong to Registration offering.');
  }

  if (league.status !== 'open') {
    throw new HttpsError('failed-precondition', 'League is not open for registration.');
  }

  if (
    !Number.isInteger(league.capacity)
    || Number(league.capacity) < 1
    || !Number.isInteger(league.confirmedCount)
    || Number(league.confirmedCount) < 0
    || !Number.isInteger(league.activeHoldCount)
    || Number(league.activeHoldCount) < 0
  ) {
    throw new HttpsError('failed-precondition', 'League registration state is invalid.');
  }

  const capacity = Number(league.capacity);
  const confirmedCount = Number(league.confirmedCount);
  const activeHoldCount = Number(league.activeHoldCount);

  if (confirmedCount + activeHoldCount > capacity) {
    throw new HttpsError('failed-precondition', 'League capacity state is inconsistent.');
  }

  if (requireAvailableSeat && confirmedCount + activeHoldCount >= capacity) {
    throw new HttpsError('resource-exhausted', 'League is full.');
  }

  return { capacity, confirmedCount, activeHoldCount };
}

function getLockedAttribution(registration: RegistrationData): Attribution {
  const values = [
    registration.promoCodeId ?? null,
    registration.promoCodeSnapshot ?? null,
    registration.promoterIdSnapshot ?? null,
  ];

  if (values.every((value) => value === null)) {
    return null;
  }

  if (!values.every((value) => typeof value === 'string' && value.length > 0)) {
    throw new HttpsError('failed-precondition', 'Registration referral attribution is inconsistent.');
  }

  return {
    promoCodeId: values[0] as string,
    promoCodeSnapshot: values[1] as string,
    promoterIdSnapshot: values[2] as string,
  };
}

async function validateAttribution(
  registration: RegistrationData,
  requestedPromoCode: unknown,
): Promise<Attribution> {
  const lockedAttribution = getLockedAttribution(registration);
  let requestedPromoCodeId: string | null = null;

  if (requestedPromoCode !== undefined && requestedPromoCode !== null && requestedPromoCode !== '') {
    if (typeof requestedPromoCode !== 'string') {
      throw new HttpsError('invalid-argument', 'PromoCode must be a string.');
    }

    try {
      requestedPromoCodeId = getPromoCodeId(requestedPromoCode);
    } catch {
      throw new HttpsError('failed-precondition', 'PromoCode is invalid or unavailable.');
    }
  }

  if (lockedAttribution && requestedPromoCodeId && requestedPromoCodeId !== lockedAttribution.promoCodeId) {
    throw new HttpsError('failed-precondition', 'Registration referral attribution is already locked.');
  }

  const promoCodeId = lockedAttribution?.promoCodeId ?? requestedPromoCodeId;

  if (!promoCodeId) {
    return null;
  }

  const promoSnapshot = await db.collection(collections.promoCodes).doc(promoCodeId).get();
  const promo = promoSnapshot.data();

  if (!promoSnapshot.exists || promo?.status !== 'active' || typeof promo.promoterId !== 'string') {
    throw new HttpsError('failed-precondition', 'PromoCode is invalid or unavailable.');
  }

  const promoterSnapshot = await db.collection(collections.promoters).doc(promo.promoterId).get();

  if (!promoterSnapshot.exists || promoterSnapshot.data()?.status !== 'active') {
    throw new HttpsError('failed-precondition', 'PromoCode is invalid or unavailable.');
  }

  if (lockedAttribution && lockedAttribution.promoterIdSnapshot !== promo.promoterId) {
    throw new HttpsError('failed-precondition', 'Registration referral attribution is inconsistent.');
  }

  return lockedAttribution ?? {
    promoCodeId,
    promoCodeSnapshot: promoCodeId,
    promoterIdSnapshot: promo.promoterId,
  };
}

async function getExistingCheckoutUrl(
  paymentId: string,
  registrationId: string,
): Promise<string | null> {
  const [paymentSnapshot, seatHoldSnapshot] = await Promise.all([
    db.collection(collections.payments).doc(paymentId).get(),
    db.collection(collections.seatHolds).doc(paymentId).get(),
  ]);

  if (!paymentSnapshot.exists) {
    return null;
  }

  const payment = paymentSnapshot.data();
  const seatHold = seatHoldSnapshot.data() as SeatHoldData | undefined;

  if (
    !seatHoldSnapshot.exists
    || payment?.registrationId !== registrationId
    || payment.provider !== 'stripe'
    || payment.status !== 'pending'
    || typeof payment.providerCheckoutSessionId !== 'string'
    || seatHold?.paymentId !== paymentId
    || seatHold.registrationId !== registrationId
    || seatHold.status !== 'active'
    || seatHold.providerCheckoutSessionId !== payment.providerCheckoutSessionId
  ) {
    throw new HttpsError('already-exists', 'This checkout request has already been used.');
  }

  const session = await getStripe().checkout.sessions.retrieve(payment.providerCheckoutSessionId);

  if (session.status !== 'open' || !session.url) {
    throw new HttpsError('failed-precondition', 'The existing Checkout Session is no longer open.');
  }

  return session.url;
}

async function getLockedCheckoutUrl(
  checkoutLockRef: FirebaseFirestore.DocumentReference,
  registrationRef: FirebaseFirestore.DocumentReference,
  registrationId: string,
  requestedPaymentId: string,
  playerId: string,
  offeringId: string,
  leagueId: string,
): Promise<{ paymentId: string; checkoutUrl: string } | null> {
  const checkoutLockSnapshot = await checkoutLockRef.get();
  if (!checkoutLockSnapshot.exists) return null;

  const lock = checkoutLockSnapshot.data();
  const lockedPaymentId = lock?.paymentId;
  if (
    lock?.registrationId !== registrationId
    || typeof lockedPaymentId !== 'string'
    || lockedPaymentId.length === 0
  ) {
    throw new HttpsError('failed-precondition', 'Checkout lock relationship is inconsistent.');
  }

  const paymentRef = db.collection(collections.payments).doc(lockedPaymentId);
  const seatHoldRef = db.collection(collections.seatHolds).doc(lockedPaymentId);
  const [paymentSnapshot, seatHoldSnapshot] = await Promise.all([
    paymentRef.get(),
    seatHoldRef.get(),
  ]);
  const payment = paymentSnapshot.data();
  const seatHold = seatHoldSnapshot.data() as SeatHoldData | undefined;

  if (!paymentSnapshot.exists) {
    if (
      lockedPaymentId === requestedPaymentId
      && seatHoldSnapshot.exists
      && seatHold?.paymentId === lockedPaymentId
      && seatHold.registrationId === registrationId
      && seatHold.registrationOfferingId === offeringId
      && seatHold.leagueId === leagueId
      && seatHold.status === 'provisioning'
    ) {
      return null;
    }
    throw new HttpsError('failed-precondition', 'Locked Checkout Payment was not found.');
  }

  if (
    !seatHoldSnapshot.exists
    || payment?.registrationId !== registrationId
    || payment.provider !== 'stripe'
    || payment.status !== 'pending'
    || typeof payment.providerCheckoutSessionId !== 'string'
    || seatHold?.paymentId !== lockedPaymentId
    || seatHold.registrationId !== registrationId
    || seatHold.registrationOfferingId !== offeringId
    || seatHold.leagueId !== leagueId
    || seatHold.status !== 'active'
    || seatHold.providerCheckoutSessionId !== payment.providerCheckoutSessionId
  ) {
    throw new HttpsError('failed-precondition', 'Locked Checkout relationship is inconsistent.');
  }

  const session = await getStripe().checkout.sessions.retrieve(payment.providerCheckoutSessionId);
  if (session.status !== 'open' || !session.url) {
    throw new HttpsError('failed-precondition', 'The existing Checkout Session is no longer open.');
  }

  await runCheckoutTestHook('before-locked-checkout-return');
  await db.runTransaction(async (transaction) => {
    const [currentRegistrationSnapshot, currentLockSnapshot, currentPaymentSnapshot,
      currentSeatHoldSnapshot] = await Promise.all([
      transaction.get(registrationRef),
      transaction.get(checkoutLockRef),
      transaction.get(paymentRef),
      transaction.get(seatHoldRef),
    ]);

    if (
      !currentRegistrationSnapshot.exists
      || !currentLockSnapshot.exists
      || !currentPaymentSnapshot.exists
      || !currentSeatHoldSnapshot.exists
    ) {
      throw new HttpsError('failed-precondition', 'Locked Checkout changed before resume.');
    }

    const currentRegistration = currentRegistrationSnapshot.data() as RegistrationData;
    const currentOfferingId = validateRegistrationOwner(currentRegistration, playerId);
    validateRegistrationPolicies(currentRegistration);
    const currentLock = currentLockSnapshot.data();
    const currentPayment = currentPaymentSnapshot.data() as Record<string, unknown>;
    const currentSeatHold = currentSeatHoldSnapshot.data() as SeatHoldData;

    if (
      currentOfferingId !== offeringId
      || requireString(currentRegistration.leagueId, 'Registration league') !== leagueId
      || currentLock?.registrationId !== registrationId
      || currentLock.paymentId !== lockedPaymentId
      || currentPayment.registrationId !== registrationId
      || currentPayment.provider !== 'stripe'
      || currentPayment.status !== 'pending'
      || currentPayment.providerCheckoutSessionId !== session.id
      || currentSeatHold.paymentId !== lockedPaymentId
      || currentSeatHold.registrationId !== registrationId
      || currentSeatHold.registrationOfferingId !== offeringId
      || currentSeatHold.leagueId !== leagueId
      || currentSeatHold.status !== 'active'
      || currentSeatHold.providerCheckoutSessionId !== session.id
    ) {
      throw new HttpsError('failed-precondition', 'Locked Checkout changed before resume.');
    }
  });

  return { paymentId: lockedPaymentId, checkoutUrl: session.url };
}

async function expireSessionQuietly(session: Stripe.Checkout.Session): Promise<boolean> {
  if (session.status === 'expired') {
    return true;
  }

  if (session.status !== 'open') {
    return false;
  }

  try {
    await getStripe().checkout.sessions.expire(session.id);
    return true;
  } catch {
    return false;
  }
}

export async function releaseProvisioningHold(
  paymentId: string,
  registrationId: string,
  leagueId: string,
  providerCheckoutSessionId: string | null = null,
): Promise<void> {
  const seatHoldRef = db.collection(collections.seatHolds).doc(paymentId);
  const leagueRef = db.collection(collections.leagues).doc(leagueId);
  const checkoutLockRef = db
    .collection(collections.registrationCheckoutLocks)
    .doc(registrationId);

  await db.runTransaction(async (transaction) => {
    const seatHoldSnapshot = await transaction.get(seatHoldRef);
    const leagueSnapshot = await transaction.get(leagueRef);
    const checkoutLockSnapshot = await transaction.get(checkoutLockRef);

    if (!seatHoldSnapshot.exists || !leagueSnapshot.exists) {
      throw new Error('Provisioning SeatHold or League was not found.');
    }

    const seatHold = seatHoldSnapshot.data() as SeatHoldData;

    if (seatHold.status !== 'provisioning') {
      return;
    }

    if (
      seatHold.paymentId !== paymentId
      || seatHold.registrationId !== registrationId
      || seatHold.leagueId !== leagueId
    ) {
      throw new Error('Provisioning SeatHold relationship is invalid.');
    }

    const league = leagueSnapshot.data() as LeagueData;

    if (!Number.isInteger(league.activeHoldCount) || Number(league.activeHoldCount) < 1) {
      throw new Error('League active hold count is invalid.');
    }

    const timestamp = Timestamp.now();
    transaction.update(leagueRef, {
      activeHoldCount: Number(league.activeHoldCount) - 1,
      updatedAt: timestamp,
    });
    transaction.update(seatHoldRef, {
      providerCheckoutSessionId,
      status: 'released',
      updatedAt: timestamp,
    });

    if (checkoutLockSnapshot.data()?.paymentId === paymentId) {
      transaction.delete(checkoutLockRef);
    }
  });
}

export const createRegistrationCheckout = onCall(
  { secrets: [stripeSecretKey] },
  async (request) => {
    const playerId = request.auth?.uid;

    if (!playerId) {
      throw new HttpsError('unauthenticated', 'Authentication is required.');
    }

    const data = request.data as CheckoutRequest;
    const registrationId = requireString(data.registrationId, 'registrationId');
    const checkoutRequestId = requireString(data.checkoutRequestId, 'checkoutRequestId');

    if (registrationId.includes('/') || !isUuid(checkoutRequestId)) {
      throw new HttpsError('invalid-argument', 'Checkout request identifiers are invalid.');
    }

    const playerRef = db.collection(collections.players).doc(playerId);
    const registrationRef = db.collection(collections.registrations).doc(registrationId);
    const paymentId = getPaymentId(playerId, registrationId, checkoutRequestId);
    const paymentRef = db.collection(collections.payments).doc(paymentId);
    const seatHoldRef = db.collection(collections.seatHolds).doc(paymentId);
    const checkoutLockRef = db
      .collection(collections.registrationCheckoutLocks)
      .doc(registrationId);
    const [playerSnapshot, registrationSnapshot] = await Promise.all([
      playerRef.get(),
      registrationRef.get(),
    ]);

    const player = playerSnapshot.data() as PlayerData | undefined;

    if (
      !playerSnapshot.exists
      || player?.accountStatus !== 'active'
      || player.profileComplete !== true
    ) {
      throw new HttpsError('failed-precondition', 'An active Player profile is required.');
    }

    if (!registrationSnapshot.exists) {
      throw new HttpsError('not-found', 'Registration was not found.');
    }

    const registration = registrationSnapshot.data() as RegistrationData;
    const offeringId = validateRegistrationOwner(registration, playerId);
    validateRegistrationPolicies(registration);
    const leagueId = requireString(registration.leagueId, 'Registration league');

    const lockedCheckout = await getLockedCheckoutUrl(
      checkoutLockRef,
      registrationRef,
      registrationId,
      paymentId,
      playerId,
      offeringId,
      leagueId,
    );

    if (lockedCheckout) return lockedCheckout;

    const existingUrl = await getExistingCheckoutUrl(paymentId, registrationId);

    if (existingUrl) {
      return { paymentId, checkoutUrl: existingUrl };
    }

    let acquisition = validateAcquisitionAttribution(registration);
    const offeringRef = db.collection(collections.registrationOfferings).doc(offeringId);
    const leagueRef = db.collection(collections.leagues).doc(leagueId);
    const [offeringSnapshot, leagueSnapshot, seatHoldSnapshot] = await Promise.all([
      offeringRef.get(),
      leagueRef.get(),
      seatHoldRef.get(),
    ]);

    if (!offeringSnapshot.exists || !leagueSnapshot.exists) {
      throw new HttpsError('failed-precondition', 'Registration offering or League was not found.');
    }

    const price = validateOffering(offeringSnapshot.data() as OfferingData, Timestamp.now());
    const existingSeatHold = seatHoldSnapshot.data() as SeatHoldData | undefined;
    const isProvisioningRetry = seatHoldSnapshot.exists
      && existingSeatHold?.paymentId === paymentId
      && existingSeatHold.registrationId === registrationId
      && existingSeatHold.registrationOfferingId === offeringId
      && existingSeatHold.leagueId === leagueId
      && existingSeatHold.status === 'provisioning';
    validateLeague(leagueSnapshot.data() as LeagueData, offeringId, !isProvisioningRetry);
    const attribution = await validateAttribution(registration, data.promoCode);
    const successUrl = requireConfiguredUrl(checkoutSuccessUrl.value(), 'CHECKOUT_SUCCESS_URL');
    const cancelUrl = requireConfiguredUrl(checkoutCancelUrl.value(), 'CHECKOUT_CANCEL_URL');

    await runCheckoutTestHook('before-provisioning-transaction');
    await db.runTransaction(async (transaction) => {
      const currentPlayerSnapshot = await transaction.get(playerRef);
      const currentRegistrationSnapshot = await transaction.get(registrationRef);
      const currentOfferingSnapshot = await transaction.get(offeringRef);
      const currentLeagueSnapshot = await transaction.get(leagueRef);
      const paymentSnapshot = await transaction.get(paymentRef);
      const currentSeatHoldSnapshot = await transaction.get(seatHoldRef);
      const checkoutLockSnapshot = await transaction.get(checkoutLockRef);
      const currentPromoSnapshot = attribution
        ? await transaction.get(db.collection(collections.promoCodes).doc(attribution.promoCodeId))
        : null;
      const currentPromoterSnapshot = attribution
        ? await transaction.get(
          db.collection(collections.promoters).doc(attribution.promoterIdSnapshot),
        )
        : null;

      const currentPlayer = currentPlayerSnapshot.data() as PlayerData | undefined;

      if (
        !currentPlayerSnapshot.exists
        || currentPlayer?.accountStatus !== 'active'
        || currentPlayer.profileComplete !== true
        || !currentRegistrationSnapshot.exists
        || !currentOfferingSnapshot.exists
        || !currentLeagueSnapshot.exists
      ) {
        throw new HttpsError('failed-precondition', 'Checkout eligibility changed.');
      }

      const currentRegistration = currentRegistrationSnapshot.data() as RegistrationData;
      const currentOfferingId = validateRegistrationOwner(currentRegistration, playerId);
      validateRegistrationPolicies(currentRegistration);
      acquisition = validateAcquisitionAttribution(currentRegistration);

      if (
        currentOfferingId !== offeringId
        || requireString(currentRegistration.leagueId, 'Registration league') !== leagueId
      ) {
        throw new HttpsError('failed-precondition', 'Checkout eligibility changed.');
      }

      const currentPrice = validateOffering(
        currentOfferingSnapshot.data() as OfferingData,
        Timestamp.now(),
      );

      if (
        currentPrice.amountCents !== price.amountCents
        || currentPrice.currency !== price.currency
        || JSON.stringify(getLockedAttribution(currentRegistration))
          !== JSON.stringify(getLockedAttribution(registration))
      ) {
        throw new HttpsError('failed-precondition', 'Checkout terms changed.');
      }

      if (
        attribution
        && (
          !currentPromoSnapshot?.exists
          || currentPromoSnapshot.data()?.status !== 'active'
          || currentPromoSnapshot.data()?.promoterId !== attribution.promoterIdSnapshot
          || !currentPromoterSnapshot?.exists
          || currentPromoterSnapshot.data()?.status !== 'active'
        )
      ) {
        throw new HttpsError('failed-precondition', 'PromoCode is invalid or unavailable.');
      }

      if (paymentSnapshot.exists) {
        throw new HttpsError('already-exists', 'Checkout request already exists.');
      }

      if (
        checkoutLockSnapshot.exists
        && checkoutLockSnapshot.data()?.paymentId !== paymentId
      ) {
        throw new HttpsError(
          'failed-precondition',
          'Registration already has an open Checkout Session.',
        );
      }

      if (currentSeatHoldSnapshot.exists) {
        const currentSeatHold = currentSeatHoldSnapshot.data() as SeatHoldData;

        if (
          currentSeatHold.paymentId !== paymentId
          || currentSeatHold.registrationId !== registrationId
          || currentSeatHold.registrationOfferingId !== offeringId
          || currentSeatHold.leagueId !== leagueId
          || currentSeatHold.status !== 'provisioning'
          || checkoutLockSnapshot.data()?.paymentId !== paymentId
        ) {
          throw new HttpsError('already-exists', 'Checkout request already exists.');
        }

        validateLeague(currentLeagueSnapshot.data() as LeagueData, offeringId, false);
        return;
      }

      const { activeHoldCount } = validateLeague(
        currentLeagueSnapshot.data() as LeagueData,
        offeringId,
      );
      const timestamp = Timestamp.now();

      transaction.create(seatHoldRef, {
        registrationId,
        registrationOfferingId: offeringId,
        leagueId,
        paymentId,
        providerCheckoutSessionId: null,
        status: 'provisioning',
        expiresAt: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      transaction.update(leagueRef, {
        activeHoldCount: activeHoldCount + 1,
        updatedAt: timestamp,
      });
      transaction.set(checkoutLockRef, {
        paymentId,
        registrationId,
        updatedAt: timestamp,
      });
    });

    const stripe = getStripe();
    let session: Stripe.Checkout.Session;

    try {
      session = await stripe.checkout.sessions.create(
        {
          mode: 'payment',
          managed_payments: { enabled: false },
          payment_method_types: ['card'],
          client_reference_id: registrationId,
          success_url: successUrl,
          cancel_url: cancelUrl,
          expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
          line_items: [{
            quantity: 1,
            price_data: {
              currency: price.currency.toLowerCase(),
              unit_amount: price.amountCents,
              product_data: { name: 'GOATLAND registration entry' },
            },
          }],
          metadata: { paymentId, registrationId, leagueId, seatHoldId: paymentId },
          payment_intent_data: {
            metadata: { paymentId, registrationId, leagueId, seatHoldId: paymentId },
          },
        },
        { idempotencyKey: `goatland-checkout-${paymentId}` },
      );
    } catch (error) {
      const isIndeterminateConnectionFailure = (
        error as { type?: unknown }
      )?.type === 'StripeConnectionError';

      if (!isIndeterminateConnectionFailure) {
        await releaseProvisioningHold(paymentId, registrationId, leagueId);
      }
      throw error;
    }

    const sessionExpiresAt = Number.isInteger(session.expires_at)
      ? Timestamp.fromMillis(session.expires_at * 1000)
      : null;

    if (
      session.status !== 'open'
      || !session.url
      || !sessionExpiresAt
      || sessionExpiresAt.toMillis() <= Timestamp.now().toMillis()
    ) {
      const sessionExpired = await expireSessionQuietly(session);
      if (sessionExpired) {
        await releaseProvisioningHold(paymentId, registrationId, leagueId, session.id);
      }
      throw new HttpsError('internal', 'Stripe did not return a usable Checkout Session.');
    }

    try {
      await runCheckoutTestHook('before-activation-transaction');
      await db.runTransaction(async (transaction) => {
        const currentPlayerSnapshot = await transaction.get(playerRef);
        const currentRegistrationSnapshot = await transaction.get(registrationRef);
        const currentOfferingSnapshot = await transaction.get(offeringRef);
        const currentLeagueSnapshot = await transaction.get(leagueRef);
        const paymentSnapshot = await transaction.get(paymentRef);
        const currentSeatHoldSnapshot = await transaction.get(seatHoldRef);
        const checkoutLockSnapshot = await transaction.get(checkoutLockRef);
        const currentPromoSnapshot = attribution
          ? await transaction.get(db.collection(collections.promoCodes).doc(attribution.promoCodeId))
          : null;
        const currentPromoterSnapshot = attribution
          ? await transaction.get(
            db.collection(collections.promoters).doc(attribution.promoterIdSnapshot),
          )
          : null;
        const currentPlayer = currentPlayerSnapshot.data() as PlayerData | undefined;

        if (
          !currentPlayerSnapshot.exists
          || currentPlayer?.accountStatus !== 'active'
          || currentPlayer.profileComplete !== true
          || !currentRegistrationSnapshot.exists
          || !currentOfferingSnapshot.exists
          || !currentLeagueSnapshot.exists
          || !currentSeatHoldSnapshot.exists
        ) {
          throw new HttpsError('failed-precondition', 'Checkout eligibility changed.');
        }

        const currentRegistration = currentRegistrationSnapshot.data() as RegistrationData;
        const currentOfferingId = validateRegistrationOwner(currentRegistration, playerId);
        validateRegistrationPolicies(currentRegistration);
        const currentAcquisition = validateAcquisitionAttribution(currentRegistration);
        const currentSeatHold = currentSeatHoldSnapshot.data() as SeatHoldData;

        if (
          paymentSnapshot.exists
          && paymentSnapshot.data()?.providerCheckoutSessionId === session.id
          && currentSeatHold.paymentId === paymentId
          && currentSeatHold.registrationId === registrationId
          && currentSeatHold.registrationOfferingId === offeringId
          && currentSeatHold.leagueId === leagueId
          && currentSeatHold.status === 'active'
          && currentSeatHold.providerCheckoutSessionId === session.id
          && checkoutLockSnapshot.data()?.paymentId === paymentId
        ) {
          return;
        }

        if (
          currentOfferingId !== offeringId
          || requireString(currentRegistration.leagueId, 'Registration league') !== leagueId
          || !sameAcquisitionAttribution(currentAcquisition, acquisition)
          || currentSeatHold.paymentId !== paymentId
          || currentSeatHold.registrationId !== registrationId
          || currentSeatHold.registrationOfferingId !== offeringId
          || currentSeatHold.leagueId !== leagueId
          || currentSeatHold.status !== 'provisioning'
          || checkoutLockSnapshot.data()?.paymentId !== paymentId
        ) {
          throw new HttpsError('failed-precondition', 'Checkout eligibility changed.');
        }

        validateLeague(currentLeagueSnapshot.data() as LeagueData, offeringId, false);
        const currentPrice = validateOffering(
          currentOfferingSnapshot.data() as OfferingData,
          Timestamp.now(),
        );

        if (
          currentPrice.amountCents !== price.amountCents
          || currentPrice.currency !== price.currency
          || JSON.stringify(getLockedAttribution(currentRegistration))
            !== JSON.stringify(getLockedAttribution(registration))
        ) {
          throw new HttpsError('failed-precondition', 'Checkout terms changed.');
        }

        if (
          attribution
          && (
            !currentPromoSnapshot?.exists
            || currentPromoSnapshot.data()?.status !== 'active'
            || currentPromoSnapshot.data()?.promoterId !== attribution.promoterIdSnapshot
            || !currentPromoterSnapshot?.exists
            || currentPromoterSnapshot.data()?.status !== 'active'
          )
        ) {
          throw new HttpsError('failed-precondition', 'PromoCode is invalid or unavailable.');
        }

        if (paymentSnapshot.exists) {
          throw new HttpsError('already-exists', 'Checkout request already exists.');
        }

        const timestamp = Timestamp.now();
        transaction.create(paymentRef, {
          registrationId,
          provider: 'stripe',
          status: 'pending',
          amountCents: price.amountCents,
          currency: price.currency,
          promoCodeSnapshot: attribution?.promoCodeSnapshot ?? null,
          promoterIdSnapshot: attribution?.promoterIdSnapshot ?? null,
          providerCheckoutSessionId: session.id,
          providerPaymentIntentId: getPaymentIntentId(session.payment_intent),
          createdAt: timestamp,
          updatedAt: timestamp,
          succeededAt: null,
          failedAt: null,
          expiredAt: null,
        });
        transaction.update(seatHoldRef, {
          providerCheckoutSessionId: session.id,
          status: 'active',
          expiresAt: sessionExpiresAt,
          updatedAt: timestamp,
        });

        if (attribution && !getLockedAttribution(currentRegistration)) {
          transaction.update(registrationRef, {
            promoCodeId: attribution.promoCodeId,
            promoCodeSnapshot: attribution.promoCodeSnapshot,
            promoterIdSnapshot: attribution.promoterIdSnapshot,
            updatedAt: timestamp,
          });
        }
      });
    } catch (error) {
      const sessionExpired = await expireSessionQuietly(session);
      if (sessionExpired) {
        await releaseProvisioningHold(paymentId, registrationId, leagueId, session.id);
      }
      throw error;
    }

    return { paymentId, checkoutUrl: session.url };
  },
);
