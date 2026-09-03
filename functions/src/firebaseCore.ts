import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

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
  registrationPriorityCounters: 'registrationPriorityCounters',
  registrationOfferings: 'registrationOfferings',
  registrationCheckoutLocks: 'registrationCheckoutLocks',
  reconciliationScanCursors: 'reconciliationScanCursors',
  seatHolds: 'seatHolds',
  stripeWebhookEvents: 'stripeWebhookEvents',
} as const;
