/* global console, process, URL */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { Timestamp, getFirestore } from 'firebase-admin/firestore';

const PROJECT_ID = 'goatland-development';
const EMAIL = 'e2e-hosted-player@goatland.test';
const GAME_ID = 'registration-hosted-e2e-game';
const TIER_ID = 'registration-hosted-e2e-tier';
const LEAGUE_START_ID = 'registration-hosted-e2e-league-start';
const OFFERING_ID = 'registration-hosted-e2e-offering';
const LEAGUE_ID = 'registration-hosted-e2e-offering__league-1';
const PROMOTER_ID = 'e2e-hosted-referral-promoter';
const PROMOTER_NAME = 'Hosted Development E2E Referral';
const PROMO_CODE_ID = 'E2E-REFERRAL';
const FIXTURE_STATUSES = new Set(['active', 'disabled', 'retired']);

function requireExactEnvironment(name) {
  if (process.env[name] !== PROJECT_ID) {
    throw new Error(`${name} must be exactly ${PROJECT_ID}.`);
  }
}

requireExactEnvironment('GCLOUD_PROJECT');
requireExactEnvironment('GOATLAND_ALLOW_HOSTED_DEV_SEED');

const promoOnlyEnvironment = process.env.GOATLAND_HOSTED_DEV_PROMO_ONLY;
if (promoOnlyEnvironment !== undefined && promoOnlyEnvironment !== PROJECT_ID) {
  throw new Error(`GOATLAND_HOSTED_DEV_PROMO_ONLY must be exactly ${PROJECT_ID} when set.`);
}
const promoOnly = promoOnlyEnvironment === PROJECT_ID;

if (process.env.FIRESTORE_EMULATOR_HOST !== undefined) {
  throw new Error('FIRESTORE_EMULATOR_HOST must be unset for the hosted development seed.');
}
if (process.env.FIREBASE_AUTH_EMULATOR_HOST !== undefined) {
  throw new Error('FIREBASE_AUTH_EMULATOR_HOST must be unset for the hosted development seed.');
}

const password = process.env.GOATLAND_E2E_TEST_PASSWORD;
if (typeof password !== 'string' || password.length === 0) {
  throw new Error('GOATLAND_E2E_TEST_PASSWORD must be set.');
}

const accountRulesSource = readFileSync(
  new URL('../src/config/rules.ts', import.meta.url),
  'utf8',
);
const accountRulesMatch = accountRulesSource.match(
  /export const CURRENT_RULES_VERSION = '([^']+)';/,
);
if (!accountRulesMatch) throw new Error('Current account rules version could not be loaded.');
const currentAccountRulesVersion = accountRulesMatch[1];

const app = getApps()[0] ?? initializeApp({ projectId: PROJECT_ID });
if (app.options.projectId !== PROJECT_ID) {
  throw new Error(`Firebase Admin project must be exactly ${PROJECT_ID}.`);
}

const firestore = getFirestore(app);
const promoterRef = firestore.collection('promoters').doc(PROMOTER_ID);
const promoCodeRef = firestore.collection('promoCodes').doc(PROMO_CODE_ID);
const [existingPromoter, existingPromoCode] = await Promise.all([
  promoterRef.get(),
  promoCodeRef.get(),
]);

if (existingPromoter.exists) {
  const promoter = existingPromoter.data();
  const hasExactSchema = Object.keys(promoter).sort().join(',')
    === ['createdAt', 'name', 'status', 'updatedAt'].join(',');
  if (
    promoter.name !== PROMOTER_NAME
    || !FIXTURE_STATUSES.has(promoter.status)
    || !(promoter.createdAt instanceof Timestamp)
    || !(promoter.updatedAt instanceof Timestamp)
    || !hasExactSchema
  ) {
    throw new Error('Hosted E2E Promoter fixture is conflicting; refusing writes.');
  }
}

if (existingPromoCode.exists) {
  const promoCode = existingPromoCode.data();
  const hasExactSchema = Object.keys(promoCode).sort().join(',')
    === ['createdAt', 'promoterId', 'status', 'updatedAt'].join(',');
  if (
    promoCode.promoterId !== PROMOTER_ID
    || !FIXTURE_STATUSES.has(promoCode.status)
    || !(promoCode.createdAt instanceof Timestamp)
    || !(promoCode.updatedAt instanceof Timestamp)
    || !hasExactSchema
  ) {
    throw new Error('Hosted E2E PromoCode fixture is conflicting; refusing writes.');
  }
}

function addPromoFixtureWrites(batch, now) {
  batch.set(promoterRef, {
    name: PROMOTER_NAME,
    status: 'active',
    createdAt: existingPromoter.data()?.createdAt ?? now,
    updatedAt: now,
  });
  batch.set(promoCodeRef, {
    promoterId: PROMOTER_ID,
    status: 'active',
    createdAt: existingPromoCode.data()?.createdAt ?? now,
    updatedAt: now,
  });
}

async function runPromoOnlySeed() {
  const now = Timestamp.now();
  const batch = firestore.batch();
  addPromoFixtureWrites(batch, now);
  await batch.commit();

  console.log(`Firebase project ID: ${PROJECT_ID}`);
  console.log('Promo-only mode: yes');
  console.log(`Promoter ID: ${PROMOTER_ID}`);
  console.log(`PromoCode: ${PROMO_CODE_ID}`);
  console.log('Promo fixture writes completed.');
}

async function runFullSeed() {
  const auth = getAuth(app);
  let user;
  let userWasCreated = false;
  try {
  user = await auth.getUserByEmail(EMAIL);
  user = await auth.updateUser(user.uid, {
    password,
    disabled: false,
    displayName: 'Hosted Development E2E Player',
  });
  } catch (error) {
  if (error?.code !== 'auth/user-not-found') throw error;
  user = await auth.createUser({
    email: EMAIL,
    password,
    emailVerified: true,
    disabled: false,
    displayName: 'Hosted Development E2E Player',
  });
  userWasCreated = true;
  }

const now = Timestamp.now();
const registrationId = `${user.uid}|${OFFERING_ID}`;
const rosterId = createHash('sha256')
  .update(`public-roster\0${LEAGUE_ID}\0${registrationId}`)
  .digest('base64url');
const registrationRef = firestore.collection('registrations').doc(registrationId);
const lockRef = firestore.collection('registrationCheckoutLocks').doc(registrationId);
const rosterRef = firestore.collection('leagues').doc(LEAGUE_ID)
  .collection('publicRoster').doc(rosterId);

const [payments, seatHolds, existingRegistration, existingLock, existingRoster, existingPlayer] =
  await Promise.all([
    firestore.collection('payments').where('registrationId', '==', registrationId).get(),
    firestore.collection('seatHolds').where('registrationId', '==', registrationId).get(),
    registrationRef.get(),
    lockRef.get(),
    rosterRef.get(),
    firestore.collection('players').doc(user.uid).get(),
  ]);

if (existingRegistration.exists) {
  const registration = existingRegistration.data();
  if (
    registration?.playerId !== user.uid
    || registration.registrationOfferingId !== OFFERING_ID
    || registration.leagueId !== LEAGUE_ID
  ) {
    throw new Error('Hosted E2E Registration identity is inconsistent; refusing cleanup.');
  }
}
if (existingLock.exists && existingLock.data()?.registrationId !== registrationId) {
  throw new Error('Hosted E2E checkout lock identity is inconsistent; refusing cleanup.');
}
for (const payment of payments.docs) {
  if (payment.data().registrationId !== registrationId) {
    throw new Error('Hosted E2E Payment identity is inconsistent; refusing cleanup.');
  }
}
for (const seatHold of seatHolds.docs) {
  const data = seatHold.data();
  if (
    data.registrationId !== registrationId
    || data.registrationOfferingId !== OFFERING_ID
    || data.leagueId !== LEAGUE_ID
  ) {
    throw new Error('Hosted E2E SeatHold identity is inconsistent; refusing cleanup.');
  }
}

const batch = firestore.batch();
for (const payment of payments.docs) batch.delete(payment.ref);
for (const seatHold of seatHolds.docs) batch.delete(seatHold.ref);
if (existingRegistration.exists) batch.delete(registrationRef);
if (existingLock.exists) batch.delete(lockRef);
if (existingRoster.exists) batch.delete(rosterRef);

batch.set(firestore.collection('players').doc(user.uid), {
  displayName: 'Hosted Development E2E Player',
  email: EMAIL,
  dateOfBirth: '1990-01-01',
  state: 'MA',
  accountStatus: 'active',
  profileComplete: true,
  rulesVersionAccepted: currentAccountRulesVersion,
  rulesAcceptedAt: existingPlayer.data()?.rulesAcceptedAt ?? now,
  createdAt: existingPlayer.data()?.createdAt ?? now,
  updatedAt: now,
});
batch.set(firestore.collection('games').doc(GAME_ID), {
  name: 'Registration Hosted Development E2E Game',
  slug: GAME_ID,
  edition: 'Hosted Development Test Edition',
  status: 'active',
  createdAt: now,
  updatedAt: now,
});
batch.set(firestore.collection('tiers').doc(TIER_ID), {
  name: 'Registration Hosted Development E2E Tier',
  level: 1,
  status: 'active',
  createdAt: now,
  updatedAt: now,
});
batch.set(firestore.collection('leagueStarts').doc(LEAGUE_START_ID), {
  gameId: GAME_ID,
  name: 'Registration Hosted Development E2E League Start',
  status: 'scheduled',
  timeZone: 'America/New_York',
  startsAt: Timestamp.fromMillis(now.toMillis() + 30 * 24 * 60 * 60 * 1000),
  endsAt: Timestamp.fromMillis(now.toMillis() + 60 * 24 * 60 * 60 * 1000),
  createdAt: now,
  updatedAt: now,
});
batch.set(firestore.collection('registrationOfferings').doc(OFFERING_ID), {
  leagueStartId: LEAGUE_START_ID,
  tierId: TIER_ID,
  status: 'enabled',
  registrationOpensAt: Timestamp.fromMillis(now.toMillis() - 60 * 60 * 1000),
  registrationClosesAt: Timestamp.fromMillis(now.toMillis() + 14 * 24 * 60 * 60 * 1000),
  entryFeeCents: 500,
  currency: 'USD',
  createdAt: now,
  updatedAt: now,
});
batch.set(firestore.collection('leagues').doc(LEAGUE_ID), {
  registrationOfferingId: OFFERING_ID,
  leagueNumber: 1,
  capacity: 16,
  status: 'open',
  confirmedCount: 0,
  activeHoldCount: 0,
  lastAssignedRegistrationOrder: 0,
  createdAt: now,
  updatedAt: now,
});
addPromoFixtureWrites(batch, now);

await batch.commit();

console.log(`Firebase project ID: ${PROJECT_ID}`);
console.log(`Test player email: ${EMAIL}`);
console.log(`Auth user: ${userWasCreated ? 'created' : 'reused'}`);
console.log(`Game ID: ${GAME_ID}`);
console.log(`Tier ID: ${TIER_ID}`);
console.log(`LeagueStart ID: ${LEAGUE_START_ID}`);
console.log(`RegistrationOffering ID: ${OFFERING_ID}`);
console.log(`League ID: ${LEAGUE_ID}`);
console.log(`Promoter ID: ${PROMOTER_ID}`);
console.log(`PromoCode: ${PROMO_CODE_ID}`);
console.log('Promo fixture writes completed.');
console.log('Hosted development fixture writes completed.');
console.log('Registration and payment lifecycle documents are intentionally absent.');
}

if (promoOnly) {
  await runPromoOnlySeed();
} else {
  await runFullSeed();
}
