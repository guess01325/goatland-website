/* global console, fetch, process, URL */
import { getApps, initializeApp } from 'firebase-admin/app';
import { Timestamp, getFirestore } from 'firebase-admin/firestore';

const PROJECT_ID = 'goatland-development';
const EMAIL = 'payment-test@goatland.local';
const PASSWORD = 'Goatland-Local-Payment-Test-2026!';
const GAME_ID = 'madden-27';
const TIER_ID = 'tier-1';
const SEASON_ID = 'payment-test-season';
const OFFERING_ID = `${SEASON_ID}__${TIER_ID}`;
const PRINT_TOKEN = process.argv.includes('--print-token');

function requireLocalEmulator(name, value, expectedPort) {
  if (!value) {
    throw new Error(`${name} is required. Refusing to access Firebase without its emulator.`);
  }

  let parsed;

  try {
    parsed = new URL(`http://${value}`);
  } catch {
    throw new Error(`${name} must be localhost:${expectedPort} or 127.0.0.1:${expectedPort}.`);
  }

  if (
    !['localhost', '127.0.0.1'].includes(parsed.hostname)
    || parsed.port !== String(expectedPort)
    || parsed.pathname !== '/'
  ) {
    throw new Error(`${name} must be localhost:${expectedPort} or 127.0.0.1:${expectedPort}.`);
  }

  return `${parsed.hostname}:${parsed.port}`;
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

async function authRequest(operation) {
  const response = await fetch(
    `http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:${operation}?key=emulator-only`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD, returnSecureToken: true }),
    },
  );
  const body = await response.json();

  return { response, body };
}

async function createOrSignInTestUser() {
  const signUp = await authRequest('signUp');

  if (signUp.response.ok) {
    return signUp.body;
  }

  if (signUp.body?.error?.message !== 'EMAIL_EXISTS') {
    throw new Error(`Auth emulator could not create the fixture user: ${signUp.body?.error?.message ?? signUp.response.status}`);
  }

  const signIn = await authRequest('signInWithPassword');

  if (!signIn.response.ok) {
    throw new Error(`Auth emulator could not sign in the fixture user: ${signIn.body?.error?.message ?? signIn.response.status}`);
  }

  return signIn.body;
}

function isTimestamp(value) {
  return value instanceof Timestamp;
}

async function ensureGame(firestore, timestamp) {
  const reference = firestore.collection('games').doc(GAME_ID);
  const snapshot = await reference.get();

  if (!snapshot.exists) {
    await reference.create({
      name: 'Madden 27 — Payment Emulator Test',
      slug: GAME_ID,
      edition: '27',
      status: 'coming_soon',
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    return;
  }

  const game = snapshot.data();
  const validStatuses = ['coming_soon', 'active', 'inactive', 'retired'];

  if (
    typeof game?.name !== 'string'
    || game.slug !== GAME_ID
    || (game.edition !== null && typeof game.edition !== 'string')
    || !validStatuses.includes(game.status)
    || !isTimestamp(game.createdAt)
    || !isTimestamp(game.updatedAt)
  ) {
    throw new Error(`Existing games/${GAME_ID} is incompatible; refusing to overwrite it.`);
  }
}

async function ensureTier(firestore, timestamp) {
  const reference = firestore.collection('tiers').doc(TIER_ID);
  const snapshot = await reference.get();

  if (!snapshot.exists) {
    await reference.create({
      name: 'Tier 1',
      level: 1,
      status: 'active',
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    return;
  }

  const tier = snapshot.data();
  const validStatuses = ['active', 'inactive', 'retired'];

  if (
    typeof tier?.name !== 'string'
    || !Number.isInteger(tier.level)
    || !validStatuses.includes(tier.status)
    || !isTimestamp(tier.createdAt)
    || !isTimestamp(tier.updatedAt)
  ) {
    throw new Error(`Existing tiers/${TIER_ID} is incompatible; refusing to overwrite it.`);
  }
}

const auth = await createOrSignInTestUser();

if (typeof auth.localId !== 'string' || typeof auth.idToken !== 'string') {
  throw new Error('Auth emulator returned an incomplete fixture identity.');
}

if (PRINT_TOKEN) {
  process.stdout.write(auth.idToken);
} else {
  const app = getApps()[0] ?? initializeApp({ projectId: PROJECT_ID });
  const firestore = getFirestore(app);
  const now = Timestamp.now();
  const registrationId = `${auth.localId}|${OFFERING_ID}`;

  await ensureGame(firestore, now);
  await ensureTier(firestore, now);

  const playerReference = firestore.collection('players').doc(auth.localId);
  const existingPlayer = await playerReference.get();
  await playerReference.set({
    displayName: 'Payment Emulator Player',
    email: EMAIL,
    dateOfBirth: '1990-01-01',
    state: 'MA',
    accountStatus: 'active',
    profileComplete: true,
    rulesVersionAccepted: 'payment-emulator-rules-v1',
    rulesAcceptedAt: existingPlayer.data()?.rulesAcceptedAt ?? now,
    createdAt: existingPlayer.data()?.createdAt ?? now,
    updatedAt: now,
  });

  await firestore.collection('seasons').doc(SEASON_ID).set({
    gameId: GAME_ID,
    name: 'Payment Emulator Test Season',
    status: 'active',
    timeZone: 'America/New_York',
    startsAt: Timestamp.fromMillis(now.toMillis() - 24 * 60 * 60 * 1000),
    endsAt: Timestamp.fromMillis(now.toMillis() + 30 * 24 * 60 * 60 * 1000),
    createdAt: now,
    updatedAt: now,
  });

  await firestore.collection('seasonTierOfferings').doc(OFFERING_ID).set({
    seasonId: SEASON_ID,
    tierId: TIER_ID,
    status: 'enabled',
    registrationOpensAt: Timestamp.fromMillis(now.toMillis() - 60 * 60 * 1000),
    registrationClosesAt: Timestamp.fromMillis(now.toMillis() + 14 * 24 * 60 * 60 * 1000),
    entryFeeCents: 500,
    currency: 'USD',
    createdAt: now,
    updatedAt: now,
  });

  await firestore.collection('registrations').doc(registrationId).set({
    playerId: auth.localId,
    seasonTierOfferingId: OFFERING_ID,
    status: 'pending_payment',
    competitionRulesVersionAccepted: 'payment-emulator-competition-rules-v1',
    competitionRulesAcceptedAt: now,
    refundPolicyVersionAccepted: 'payment-emulator-refund-policy-v1',
    refundPolicyAcceptedAt: now,
    promoCodeId: null,
    promoCodeSnapshot: null,
    promoterIdSnapshot: null,
    registrationOrder: null,
    createdAt: now,
    updatedAt: now,
    submittedAt: now,
    confirmedAt: null,
    cancelledAt: null,
  });

  console.log('Seeded emulator-only Payment integration fixture.');
  console.log(`Project namespace: ${PROJECT_ID}`);
  console.log(`Firestore emulator: ${firestoreHost}`);
  console.log(`Auth emulator: ${authHost}`);
  console.log(`Fixture email: ${EMAIL}`);
  console.log(`Player UID: ${auth.localId}`);
  console.log(`Registration ID: ${registrationId}`);
}
