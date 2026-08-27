import { Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { onRequest } from 'firebase-functions/v2/https';
import type Stripe from 'stripe';
import { stripeSecretKey, stripeWebhookSecret } from './config.js';
import { collections, db, getPaymentIntentId, getStripe } from './shared.js';

type PaymentData = {
  registrationId?: unknown;
  provider?: unknown;
  status?: unknown;
  amountCents?: unknown;
  currency?: unknown;
  providerCheckoutSessionId?: unknown;
};

type RegistrationData = {
  seasonTierOfferingId?: unknown;
  status?: unknown;
  registrationOrder?: unknown;
  confirmedAt?: unknown;
};

function requireMetadata(session: Stripe.Checkout.Session): {
  paymentId: string;
  registrationId: string;
} {
  const paymentId = session.metadata?.paymentId;
  const registrationId = session.metadata?.registrationId;

  if (!paymentId || !registrationId) {
    throw new Error('Stripe Checkout Session metadata is incomplete.');
  }

  return { paymentId, registrationId };
}

function eventRecord(event: Stripe.Event, session: Stripe.Checkout.Session, timestamp: Timestamp) {
  return {
    provider: 'stripe',
    type: event.type,
    objectId: session.id,
    processedAt: timestamp,
  };
}

async function fulfillSuccessfulCheckout(
  event: Stripe.Event,
  session: Stripe.Checkout.Session,
): Promise<void> {
  if (session.mode !== 'payment' || session.payment_status !== 'paid') {
    throw new Error('Stripe Checkout Session is not an authoritative paid payment.');
  }

  const { paymentId, registrationId } = requireMetadata(session);
  const eventRef = db.collection(collections.stripeWebhookEvents).doc(event.id);
  const paymentRef = db.collection(collections.payments).doc(paymentId);
  const registrationRef = db.collection(collections.registrations).doc(registrationId);
  const checkoutLockRef = db
    .collection(collections.registrationCheckoutLocks)
    .doc(registrationId);

  await db.runTransaction(async (transaction) => {
    const eventSnapshot = await transaction.get(eventRef);
    const paymentSnapshot = await transaction.get(paymentRef);
    const registrationSnapshot = await transaction.get(registrationRef);
    const checkoutLockSnapshot = await transaction.get(checkoutLockRef);

    if (eventSnapshot.exists) {
      return;
    }

    if (!paymentSnapshot.exists || !registrationSnapshot.exists) {
      throw new Error('Payment or Registration was not found.');
    }

    const payment = paymentSnapshot.data() as PaymentData;
    const registration = registrationSnapshot.data() as RegistrationData;

    if (
      payment.registrationId !== registrationId
      || payment.provider !== 'stripe'
      || payment.providerCheckoutSessionId !== session.id
      || payment.amountCents !== session.amount_total
      || payment.currency !== session.currency?.toUpperCase()
    ) {
      throw new Error('Stripe Checkout Session does not match Payment.');
    }

    if (typeof registration.seasonTierOfferingId !== 'string') {
      throw new Error('Registration offering relationship is invalid.');
    }

    const counterRef = db
      .collection(collections.registrationCounters)
      .doc(registration.seasonTierOfferingId);
    const counterSnapshot = await transaction.get(counterRef);
    const timestamp = Timestamp.now();
    const providerPaymentIntentId = getPaymentIntentId(session.payment_intent);

    if (payment.status === 'succeeded') {
      if (
        registration.status !== 'confirmed'
        || !Number.isInteger(registration.registrationOrder)
        || !(registration.confirmedAt instanceof Timestamp)
      ) {
        throw new Error('Succeeded Payment has inconsistent Registration state.');
      }

      transaction.create(eventRef, eventRecord(event, session, timestamp));
      if (checkoutLockSnapshot.data()?.paymentId === paymentId) {
        transaction.delete(checkoutLockRef);
      }
      return;
    }

    if (registration.status === 'confirmed') {
      transaction.update(paymentRef, {
        status: 'succeeded',
        providerPaymentIntentId,
        succeededAt: timestamp,
        updatedAt: timestamp,
      });
      transaction.create(eventRef, eventRecord(event, session, timestamp));
      if (checkoutLockSnapshot.data()?.paymentId === paymentId) {
        transaction.delete(checkoutLockRef);
      }
      return;
    }

    if (
      registration.status !== 'pending_payment'
      || registration.registrationOrder !== null
      || registration.confirmedAt !== null
    ) {
      throw new Error('Registration is not eligible for payment fulfillment.');
    }

    const lastAssignedOrder = counterSnapshot.exists
      ? counterSnapshot.data()?.lastAssignedOrder
      : 0;

    if (!Number.isInteger(lastAssignedOrder) || lastAssignedOrder < 0) {
      throw new Error('Registration counter is invalid.');
    }

    const nextOrder = lastAssignedOrder + 1;

    transaction.set(counterRef, {
      lastAssignedOrder: nextOrder,
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
    transaction.create(eventRef, eventRecord(event, session, timestamp));
    if (checkoutLockSnapshot.data()?.paymentId === paymentId) {
      transaction.delete(checkoutLockRef);
    }
  });
}

async function expireCheckout(
  event: Stripe.Event,
  session: Stripe.Checkout.Session,
): Promise<void> {
  const { paymentId, registrationId } = requireMetadata(session);
  const eventRef = db.collection(collections.stripeWebhookEvents).doc(event.id);
  const paymentRef = db.collection(collections.payments).doc(paymentId);
  const checkoutLockRef = db
    .collection(collections.registrationCheckoutLocks)
    .doc(registrationId);

  await db.runTransaction(async (transaction) => {
    const eventSnapshot = await transaction.get(eventRef);
    const paymentSnapshot = await transaction.get(paymentRef);
    const checkoutLockSnapshot = await transaction.get(checkoutLockRef);

    if (eventSnapshot.exists) {
      return;
    }

    if (!paymentSnapshot.exists) {
      transaction.create(
        eventRef,
        eventRecord(event, session, Timestamp.now()),
      );
      return;
    }

    const payment = paymentSnapshot.data() as PaymentData;

    if (
      payment.registrationId !== registrationId
      || payment.provider !== 'stripe'
      || payment.providerCheckoutSessionId !== session.id
    ) {
      throw new Error('Stripe Checkout Session does not match Payment.');
    }

    const timestamp = Timestamp.now();

    if (payment.status === 'pending') {
      transaction.update(paymentRef, {
        status: 'expired',
        expiredAt: timestamp,
        updatedAt: timestamp,
      });
    }

    transaction.create(eventRef, eventRecord(event, session, timestamp));
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
