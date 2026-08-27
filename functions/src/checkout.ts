import { Timestamp } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import type Stripe from 'stripe';
import {
  checkoutCancelUrl,
  checkoutSuccessUrl,
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

type CheckoutRequest = {
  registrationId?: unknown;
  checkoutRequestId?: unknown;
  promoCode?: unknown;
};

type RegistrationData = {
  playerId?: unknown;
  seasonTierOfferingId?: unknown;
  status?: unknown;
  promoCodeId?: unknown;
  promoCodeSnapshot?: unknown;
  promoterIdSnapshot?: unknown;
};

type OfferingData = {
  status?: unknown;
  registrationOpensAt?: unknown;
  registrationClosesAt?: unknown;
  entryFeeCents?: unknown;
  currency?: unknown;
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

  return requireString(registration.seasonTierOfferingId, 'Registration offering');
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
  const paymentSnapshot = await db.collection(collections.payments).doc(paymentId).get();

  if (!paymentSnapshot.exists) {
    return null;
  }

  const payment = paymentSnapshot.data();

  if (
    payment?.registrationId !== registrationId
    || payment.provider !== 'stripe'
    || payment.status !== 'pending'
    || typeof payment.providerCheckoutSessionId !== 'string'
  ) {
    throw new HttpsError('already-exists', 'This checkout request has already been used.');
  }

  const session = await getStripe().checkout.sessions.retrieve(payment.providerCheckoutSessionId);

  if (session.status !== 'open' || !session.url) {
    throw new HttpsError('failed-precondition', 'The existing Checkout Session is no longer open.');
  }

  return session.url;
}

async function expireSessionQuietly(session: Stripe.Checkout.Session): Promise<void> {
  if (session.status !== 'open') {
    return;
  }

  try {
    await getStripe().checkout.sessions.expire(session.id);
  } catch {
    // The failed request remains safe because no Payment was persisted or returned.
  }
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

    const paymentId = getPaymentId(playerId, registrationId, checkoutRequestId);
    const existingUrl = await getExistingCheckoutUrl(paymentId, registrationId);

    if (existingUrl) {
      return { paymentId, checkoutUrl: existingUrl };
    }

    const playerRef = db.collection(collections.players).doc(playerId);
    const registrationRef = db.collection(collections.registrations).doc(registrationId);
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
    const offeringRef = db.collection(collections.seasonTierOfferings).doc(offeringId);
    const offeringSnapshot = await offeringRef.get();

    if (!offeringSnapshot.exists) {
      throw new HttpsError('failed-precondition', 'Registration offering was not found.');
    }

    const price = validateOffering(offeringSnapshot.data() as OfferingData, Timestamp.now());
    const attribution = await validateAttribution(registration, data.promoCode);
    const successUrl = requireConfiguredUrl(checkoutSuccessUrl.value(), 'CHECKOUT_SUCCESS_URL');
    const cancelUrl = requireConfiguredUrl(checkoutCancelUrl.value(), 'CHECKOUT_CANCEL_URL');
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create(
      {
        mode: 'payment',
        managed_payments: { enabled: false },
        payment_method_types: ['card'],
        client_reference_id: registrationId,
        success_url: successUrl,
        cancel_url: cancelUrl,
        line_items: [{
          quantity: 1,
          price_data: {
            currency: price.currency.toLowerCase(),
            unit_amount: price.amountCents,
            product_data: { name: 'GOATLAND registration entry' },
          },
        }],
        metadata: { paymentId, registrationId },
        payment_intent_data: { metadata: { paymentId, registrationId } },
      },
      { idempotencyKey: `goatland-checkout-${paymentId}` },
    );

    if (!session.url) {
      await expireSessionQuietly(session);
      throw new HttpsError('internal', 'Stripe did not return a Checkout URL.');
    }

    await db.runTransaction(async (transaction) => {
        const currentPlayerSnapshot = await transaction.get(playerRef);
        const currentRegistrationSnapshot = await transaction.get(registrationRef);
        const currentOfferingSnapshot = await transaction.get(offeringRef);
        const paymentRef = db.collection(collections.payments).doc(paymentId);
        const paymentSnapshot = await transaction.get(paymentRef);
        const checkoutLockRef = db
          .collection(collections.registrationCheckoutLocks)
          .doc(registrationId);
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
        ) {
          throw new HttpsError('failed-precondition', 'Checkout eligibility changed.');
        }

        const currentRegistration = currentRegistrationSnapshot.data() as RegistrationData;
        const currentOfferingId = validateRegistrationOwner(currentRegistration, playerId);

        if (currentOfferingId !== offeringId) {
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

        if (
          checkoutLockSnapshot.exists
          && checkoutLockSnapshot.data()?.paymentId !== paymentId
        ) {
          throw new HttpsError(
            'failed-precondition',
            'Registration already has an open Checkout Session.',
          );
        }

        if (paymentSnapshot.exists) {
          if (paymentSnapshot.data()?.providerCheckoutSessionId !== session.id) {
            throw new HttpsError('already-exists', 'Checkout request already exists.');
          }
          return;
        }

        const timestamp = Timestamp.now();

        transaction.create(paymentRef, {
          registrationId,
          provider: 'stripe',
          status: 'pending',
          amountCents: price.amountCents,
          currency: price.currency,
          providerCheckoutSessionId: session.id,
          providerPaymentIntentId: getPaymentIntentId(session.payment_intent),
          createdAt: timestamp,
          updatedAt: timestamp,
          succeededAt: null,
          failedAt: null,
          expiredAt: null,
        });
        transaction.set(checkoutLockRef, {
          paymentId,
          registrationId,
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

    return { paymentId, checkoutUrl: session.url };
  },
);
