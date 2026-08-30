import { createHash } from 'node:crypto';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import Stripe from 'stripe';
import { stripeSecretKey } from './config.js';

if (getApps().length === 0) {
  initializeApp();
}

export const db = getFirestore();

export const collections = {
  payments: 'payments',
  players: 'players',
  leagues: 'leagues',
  promoCodes: 'promoCodes',
  promoters: 'promoters',
  registrations: 'registrations',
  registrationOfferings: 'registrationOfferings',
  registrationCheckoutLocks: 'registrationCheckoutLocks',
  reconciliationScanCursors: 'reconciliationScanCursors',
  seatHolds: 'seatHolds',
  stripeWebhookEvents: 'stripeWebhookEvents',
} as const;

export const LEAGUE_CAPACITY = 16;
export const LEAGUE_SUCCESSOR_THRESHOLD = 12;
const LEAGUE_ID_SEPARATOR = '__league-';

export function getLeagueId(registrationOfferingId: string, leagueNumber: number): string {
  if (
    !registrationOfferingId
    || registrationOfferingId.includes('/')
    || registrationOfferingId.includes(LEAGUE_ID_SEPARATOR)
  ) {
    throw new Error('registrationOfferingId cannot be used in a League document ID.');
  }

  if (!Number.isInteger(leagueNumber) || leagueNumber < 1) {
    throw new Error('leagueNumber must be a positive integer.');
  }

  return `${registrationOfferingId}${LEAGUE_ID_SEPARATOR}${leagueNumber}`;
}

export function getPublicRosterEntryId(leagueId: string, registrationId: string): string {
  return createHash('sha256')
    .update(`public-roster\0${leagueId}\0${registrationId}`)
    .digest('base64url');
}

let stripeOverride: Stripe | null = null;

export function getStripe(): Stripe {
  return stripeOverride ?? new Stripe(stripeSecretKey.value());
}

export function setStripeForEmulatorTests(stripe: Stripe | null): void {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error('Stripe test overrides require the Firestore emulator.');
  }

  stripeOverride = stripe;
}

const PROMO_CODE_MIN_LENGTH = 3;
const PROMO_CODE_MAX_LENGTH = 32;
const PROMO_CODE_PATTERN = /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/;

export function getPromoCodeId(code: string): string {
  const normalizedCode = code.trim().toUpperCase();

  if (
    normalizedCode.length < PROMO_CODE_MIN_LENGTH
    || normalizedCode.length > PROMO_CODE_MAX_LENGTH
    || !PROMO_CODE_PATTERN.test(normalizedCode)
  ) {
    throw new Error('INVALID_PROMO_CODE');
  }

  return normalizedCode;
}

export function getPaymentId(
  playerId: string,
  registrationId: string,
  checkoutRequestId: string,
): string {
  return createHash('sha256')
    .update(`${playerId}\0${registrationId}\0${checkoutRequestId}`)
    .digest('base64url');
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function getPaymentIntentId(
  paymentIntent: string | Stripe.PaymentIntent | null,
): string | null {
  if (typeof paymentIntent === 'string') {
    return paymentIntent;
  }

  return paymentIntent?.id ?? null;
}
