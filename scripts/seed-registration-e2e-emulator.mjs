/* global console, fetch, process, URL */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { getApps, initializeApp } from 'firebase-admin/app';
import { Timestamp, getFirestore } from 'firebase-admin/firestore';

const PROJECT_ID = 'goatland-development';
const EMAIL = 'e2e-player@goatland.test';
const PASSWORD = 'GOATLAND-LOCAL-E2E-ONLY-2026!';
const GAME_ID = 'registration-e2e-game';
const TIER_ID = 'registration-e2e-tier';
const LEAGUE_START_ID = 'registration-e2e-league-start';
const OFFERING_ID = 'registration-e2e-offering';
const LEAGUE_ID = 'registration-e2e-offering__league-1';

function requireLocalEmulator(name, value, expectedPort) {
  const allowedHosts = new Set([
    `localhost:${expectedPort}`,
    `127.0.0.1:${expectedPort}`,
  ]);
  if (typeof value !== 'string' || !allowedHosts.has(value)) {
    throw new Error(`${name} must be localhost:${expectedPort} or 127.0.0.1:${expectedPort}.`);
  }

  return value;
}

const firestoreHost = requireLocalEmulator(
  'FIRESTORE_EMULATOR_HOST',
  process.env.FIRESTORE_EMULATOR_HOST,
  8080,
);
const authHost = requireLocalEmulator(
  'FIREBASE_AUTH_EMULATOR_HOST',
  process.env.FIREBASE_AUTH_EMULATOR_HOST,
  9099,
);

if (process.env.GCLOUD_PROJECT && process.env.GCLOUD_PROJECT !== PROJECT_ID) {
  throw new Error(`GCLOUD_PROJECT must be ${PROJECT_ID}.`);
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

async function authRequest(operation) {
  const response = await fetch(
    `http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:${operation}?key=emulator-only`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD, returnSecureToken: true }),
    },
  );
  return { response, body: await response.json() };
}

async function createOrReuseTestUser() {
  const signUp = await authRequest('signUp');
  if (signUp.response.ok) return signUp.body;
  if (signUp.body?.error?.message !== 'EMAIL_EXISTS') {
    throw new Error(
      `Auth emulator could not create the fixture user: ${signUp.body?.error?.message ?? signUp.response.status}`,
    );
  }

  const signIn = await authRequest('signInWithPassword');
  if (!signIn.response.ok) {
    throw new Error(
      `Auth emulator could not reuse the fixture user: ${signIn.body?.error?.message ?? signIn.response.status}`,
    );
  }
  return signIn.body;
}

function publicRosterEntryId(registrationId) {
  return createHash('sha256')
    .update(`public-roster\0${LEAGUE_ID}\0${registrationId}`)
    .digest('base64url');
}

const auth = await createOrReuseTestUser();
if (typeof auth.localId !== 'string') {
  throw new Error('Auth emulator returned an incomplete fixture identity.');
}

const app = getApps()[0] ?? initializeApp({ projectId: PROJECT_ID });
const firestore = getFirestore(app);
const now = Timestamp.now();
const registrationId = `${auth.localId}|${OFFERING_ID}`;

const [payments, seatHolds, existingPlayer] = await Promise.all([
  firestore.collection('payments').where('registrationId', '==', registrationId).get(),
  firestore.collection('seatHolds').where('registrationId', '==', registrationId).get(),
  firestore.collection('players').doc(auth.localId).get(),
]);

const batch = firestore.batch();
for (const payment of payments.docs) batch.delete(payment.ref);
for (const seatHold of seatHolds.docs) batch.delete(seatHold.ref);
batch.delete(firestore.collection('registrations').doc(registrationId));
batch.delete(firestore.collection('registrationCheckoutLocks').doc(registrationId));
batch.delete(
  firestore.collection('leagues').doc(LEAGUE_ID)
    .collection('publicRoster').doc(publicRosterEntryId(registrationId)),
);

batch.set(firestore.collection('players').doc(auth.localId), {
  displayName: 'Registration E2E Player',
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
  name: 'Registration E2E Game',
  slug: GAME_ID,
  edition: 'Test Edition',
  status: 'active',
  createdAt: now,
  updatedAt: now,
});
batch.set(firestore.collection('tiers').doc(TIER_ID), {
  name: 'Registration E2E Tier',
  level: 1,
  status: 'active',
  createdAt: now,
  updatedAt: now,
});
batch.set(firestore.collection('leagueStarts').doc(LEAGUE_START_ID), {
  gameId: GAME_ID,
  name: 'Registration E2E League Start',
  status: 'scheduled',
  timeZone: 'America/New_York',
  startsAt: Timestamp.fromMillis(now.toMillis() + 7 * 24 * 60 * 60 * 1000),
  endsAt: Timestamp.fromMillis(now.toMillis() + 37 * 24 * 60 * 60 * 1000),
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

await batch.commit();

console.log('Seeded browser Registration E2E fixture in local Firebase emulators only.');
console.log(`Project namespace: ${PROJECT_ID}`);
console.log(`Firestore emulator: ${firestoreHost}`);
console.log(`Auth emulator: ${authHost}`);
console.log(`Email: ${EMAIL}`);
console.log(`Password: ${PASSWORD}`);
console.log(`Player UID: ${auth.localId}`);
console.log(`Game ID: ${GAME_ID}`);
console.log(`Tier ID: ${TIER_ID}`);
console.log(`LeagueStart ID: ${LEAGUE_START_ID}`);
console.log(`RegistrationOffering ID: ${OFFERING_ID}`);
console.log(`League ID: ${LEAGUE_ID}`);
console.log(`Registration ${registrationId} is intentionally absent; create it in the browser.`);
