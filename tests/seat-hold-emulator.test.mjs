/* global fetch, process, URL */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { deleteApp, initializeApp } from 'firebase/app';
import {
  connectAuthEmulator,
  getAuth,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import {
  collection,
  connectFirestoreEmulator,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore as getClientFirestore,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

const PROJECT_ID = 'goatland-development';
const OFFERING_ID = 'seat-hold-tests__tier-1';
const OTHER_OFFERING_ID = 'seat-hold-tests__tier-2';
const LEAGUE_1_ID = `${OFFERING_ID}__league-1`;
const LEAGUE_2_ID = `${OFFERING_ID}__league-2`;
const OTHER_LEAGUE_ID = `${OTHER_OFFERING_ID}__league-1`;
const REQUEST_IDS = [
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000003',
  '00000000-0000-4000-8000-000000000004',
];
const AUTH_PASSWORD = 'Emulator-only-SeatHold-2026!';

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  throw new Error('SeatHold integration tests require the Firestore and Auth emulators.');
}

process.env.GCLOUD_PROJECT = PROJECT_ID;
process.env.CHECKOUT_SUCCESS_URL = 'http://localhost/checkout/success';
process.env.CHECKOUT_CANCEL_URL = 'http://localhost/checkout/cancel';

const requireFromFunctions = createRequire(
  new URL('../functions/package.json', import.meta.url),
);
const { FieldValue, Timestamp } = requireFromFunctions('firebase-admin/firestore');
const {
  db,
  getPublicRosterEntryId,
  setStripeForEmulatorTests,
} = await import('../functions/lib/shared.js');
const {
  createRegistrationCheckout,
  releaseProvisioningHold,
  setCheckoutTestHookForEmulatorTests,
} = await import('../functions/lib/checkout.js');
const {
  expireCheckout,
  fulfillSuccessfulCheckout,
} = await import('../functions/lib/webhook.js');
const { normalizeAcquisitionAttribution } = await import('../src/models/Registration.ts');

class FakeStripe {
  constructor() {
    this.sessions = new Map();
    this.createCount = 0;
    this.creationError = null;
    this.expirationError = null;
    this.checkout = {
      sessions: {
        create: async (parameters) => {
          this.createCount += 1;

          if (this.creationError) {
            throw this.creationError;
          }

          const id = `cs_test_${this.createCount}`;
          const session = {
            id,
            mode: 'payment',
            status: 'open',
            payment_status: 'unpaid',
            url: `https://checkout.stripe.test/${id}`,
            expires_at: Math.floor(Date.now() / 1000) + 1800,
            amount_total: parameters.line_items[0].price_data.unit_amount,
            currency: parameters.line_items[0].price_data.currency,
            metadata: parameters.metadata,
            payment_intent: `pi_test_${this.createCount}`,
          };
          this.sessions.set(id, session);
          return session;
        },
        retrieve: async (id) => this.sessions.get(id),
        expire: async (id) => {
          if (this.expirationError) {
            throw this.expirationError;
          }
          const session = this.sessions.get(id);
          session.status = 'expired';
          session.url = null;
          return session;
        },
      },
    };
  }
}

const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
const [firestoreHostname, firestorePort] = emulatorHost.split(':');
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const [authHostname, authPort] = authHost.split(':');
const identities = {};
let appSequence = 0;

async function createIdentity(label) {
  const email = `seat-hold-${label}@goatland.local`;
  const response = await fetch(
    `http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=emulator-only`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: AUTH_PASSWORD, returnSecureToken: true }),
    },
  );
  const body = await response.json();

  if (!response.ok) {
    throw new Error(`Could not create Auth emulator identity ${label}: ${body.error?.message}`);
  }

  identities[label] = { uid: body.localId, email };
}

async function clearFirestore() {
  const response = await fetch(
    `http://${emulatorHost}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
    { method: 'DELETE' },
  );

  assert.equal(response.ok, true, `Firestore emulator reset failed: ${response.status}`);
}

function registrationId(label) {
  return `${identities[label].uid}|${OFFERING_ID}`;
}

function leagueData(number, overrides = {}) {
  const now = Timestamp.now();
  return {
    registrationOfferingId: OFFERING_ID,
    leagueNumber: number,
    capacity: 16,
    status: 'open',
    confirmedCount: 0,
    activeHoldCount: 0,
    lastAssignedRegistrationOrder: 0,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

async function seedFixture({ league1 = {}, league2 = {}, registrations = [] } = {}) {
  await clearFirestore();
  const now = Timestamp.now();
  const batch = db.batch();

  batch.set(db.collection('registrationOfferings').doc(OFFERING_ID), {
    status: 'enabled',
    registrationOpensAt: Timestamp.fromMillis(now.toMillis() - 60_000),
    registrationClosesAt: Timestamp.fromMillis(now.toMillis() + 3_600_000),
    entryFeeCents: 500,
    currency: 'USD',
    createdAt: now,
    updatedAt: now,
  });
  batch.set(db.collection('leagues').doc(LEAGUE_1_ID), leagueData(1, league1));
  batch.set(db.collection('leagues').doc(LEAGUE_2_ID), leagueData(2, league2));

  for (const {
    label,
    leagueId = LEAGUE_1_ID,
    acquisitionSource = 'facebook',
    acquisitionSourceOther = null,
  } of registrations) {
    const identity = identities[label];
    batch.set(db.collection('players').doc(identity.uid), {
      displayName: `Player ${label}`,
      email: identity.email,
      dateOfBirth: '1990-01-01',
      state: 'MA',
      accountStatus: 'active',
      profileComplete: true,
      rulesVersionAccepted: 'test-rules-v1',
      rulesAcceptedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    batch.set(db.collection('registrations').doc(registrationId(label)), {
      playerId: identity.uid,
      registrationOfferingId: OFFERING_ID,
      leagueId,
      status: 'pending_payment',
      competitionRulesVersionAccepted: 'competition-rules-2026-08-29-v1',
      competitionRulesAcceptedAt: now,
      refundPolicyVersionAccepted: 'refund-policy-2026-08-29-v1',
      refundPolicyAcceptedAt: now,
      acquisitionSource,
      acquisitionSourceOther,
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
  }

  await batch.commit();
}

function checkout(label, requestId = REQUEST_IDS[0], promoCode = undefined) {
  return createRegistrationCheckout.run({
    auth: { uid: identities[label].uid, token: { email: identities[label].email } },
    data: { registrationId: registrationId(label), checkoutRequestId: requestId, promoCode },
  });
}

async function documents(collectionName) {
  return (await db.collection(collectionName).get()).docs.map((snapshot) => ({
    id: snapshot.id,
    ...snapshot.data(),
  }));
}

async function state(label, leagueId = LEAGUE_1_ID) {
  const [league, registration, holds, payments, lock, roster] = await Promise.all([
    db.collection('leagues').doc(leagueId).get(),
    db.collection('registrations').doc(registrationId(label)).get(),
    documents('seatHolds'),
    documents('payments'),
    db.collection('registrationCheckoutLocks').doc(registrationId(label)).get(),
    db.collection('leagues').doc(leagueId).collection('publicRoster').get(),
  ]);
  return {
    league: league.data(),
    registration: registration.data(),
    holds,
    payments,
    lock,
    roster: roster.docs.map((snapshot) => ({ id: snapshot.id, ...snapshot.data() })),
  };
}

function paidSession(fakeStripe, providerSessionId) {
  return {
    ...fakeStripe.sessions.get(providerSessionId),
    payment_status: 'paid',
  };
}

function stripeEvent(id, type) {
  return { id, type };
}

async function activate(label, requestId = REQUEST_IDS[0]) {
  const result = await checkout(label, requestId);
  const payment = (await db.collection('payments').doc(result.paymentId).get()).data();
  return { result, payment };
}

async function cancelAsClient(label) {
  const app = initializeApp({ projectId: PROJECT_ID, apiKey: 'emulator-only' }, `client-${appSequence += 1}`);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${authHostname}:${authPort}`, { disableWarnings: true });
  await signInWithEmailAndPassword(auth, identities[label].email, AUTH_PASSWORD);
  const firestore = getClientFirestore(app);
  connectFirestoreEmulator(firestore, firestoreHostname, Number(firestorePort));

  try {
    await updateDoc(doc(firestore, 'registrations', registrationId(label)), {
      status: 'cancelled',
      cancelledAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } finally {
    await deleteApp(app);
  }
}

async function withClient(label, action) {
  const app = initializeApp({ projectId: PROJECT_ID, apiKey: 'emulator-only' }, `client-${appSequence += 1}`);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${authHostname}:${authPort}`, { disableWarnings: true });
  if (label) {
    await signInWithEmailAndPassword(auth, identities[label].email, AUTH_PASSWORD);
  }
  const firestore = getClientFirestore(app);
  connectFirestoreEmulator(firestore, firestoreHostname, Number(firestorePort));

  try {
    return await action(firestore);
  } finally {
    await deleteApp(app);
  }
}

function clientRegistrationData(label, acquisition = {
  acquisitionSource: 'facebook',
  acquisitionSourceOther: null,
}, overrides = {}) {
  const timestamp = serverTimestamp();
  return {
    playerId: identities[label].uid,
    registrationOfferingId: OFFERING_ID,
    leagueId: LEAGUE_1_ID,
    status: 'pending_payment',
    competitionRulesVersionAccepted: 'competition-rules-2026-08-29-v1',
    competitionRulesAcceptedAt: timestamp,
    refundPolicyVersionAccepted: 'refund-policy-2026-08-29-v1',
    refundPolicyAcceptedAt: timestamp,
    ...acquisition,
    promoCodeId: null,
    promoCodeSnapshot: null,
    promoterIdSnapshot: null,
    registrationOrder: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    submittedAt: timestamp,
    confirmedAt: null,
    cancelledAt: null,
    ...overrides,
  };
}

async function recreateRegistrationAsClient(label, acquisition) {
  await seedFixture({ registrations: [{ label }] });
  await db.collection('registrations').doc(registrationId(label)).delete();
  await withClient(label, (firestore) => setDoc(
    doc(firestore, 'registrations', registrationId(label)),
    clientRegistrationData(label, acquisition),
  ));
}

async function updateAcquisitionAsClient(label, acquisition) {
  return withClient(label, (firestore) => updateDoc(
    doc(firestore, 'registrations', registrationId(label)),
    { ...acquisition, updatedAt: serverTimestamp() },
  ));
}

async function updateLeagueAsClient(label, leagueId) {
  return withClient(label, (firestore) => updateDoc(
    doc(firestore, 'registrations', registrationId(label)),
    { leagueId, updatedAt: serverTimestamp() },
  ));
}

async function seedOtherOfferingLeague(overrides = {}) {
  const now = Timestamp.now();
  const batch = db.batch();
  batch.set(db.collection('registrationOfferings').doc(OTHER_OFFERING_ID), {
    status: 'enabled',
    registrationOpensAt: Timestamp.fromMillis(now.toMillis() - 60_000),
    registrationClosesAt: Timestamp.fromMillis(now.toMillis() + 3_600_000),
    entryFeeCents: 500,
    currency: 'USD',
    createdAt: now,
    updatedAt: now,
  });
  batch.set(db.collection('leagues').doc(OTHER_LEAGUE_ID), {
    ...leagueData(1, overrides),
    registrationOfferingId: OTHER_OFFERING_ID,
  });
  await batch.commit();
}

await Promise.all(['a', 'b', 'c'].map(createIdentity));

test('Registration deterministic get rules RGET1-RGET7', async (t) => {
  await t.test('RGET1 owner get of an absent Registration resolves as not found', async () => {
    await seedFixture({ registrations: [{ label: 'a' }] });
    await db.collection('registrations').doc(registrationId('a')).delete();

    const snapshot = await withClient('a', (firestore) => getDoc(
      doc(firestore, 'registrations', registrationId('a')),
    ));
    assert.equal(snapshot.exists(), false);
  });

  await t.test('RGET2 another player cannot get the owner\'s absent path', async () => {
    await seedFixture({ registrations: [{ label: 'a' }] });
    await db.collection('registrations').doc(registrationId('a')).delete();

    await assert.rejects(withClient('b', (firestore) => getDoc(
      doc(firestore, 'registrations', registrationId('a')),
    )));
  });

  await t.test('RGET3 owner can get an existing Registration', async () => {
    await seedFixture({ registrations: [{ label: 'a' }] });

    const snapshot = await withClient('a', (firestore) => getDoc(
      doc(firestore, 'registrations', registrationId('a')),
    ));
    assert.equal(snapshot.exists(), true);
    assert.equal(snapshot.data().playerId, identities.a.uid);
  });

  await t.test('RGET4 another player cannot get an existing Registration', async () => {
    await seedFixture({ registrations: [{ label: 'a' }] });

    await assert.rejects(withClient('b', (firestore) => getDoc(
      doc(firestore, 'registrations', registrationId('a')),
    )));
  });

  await t.test('RGET5 Registration list access remains denied', async () => {
    await seedFixture({ registrations: [{ label: 'a' }] });

    await assert.rejects(withClient('a', (firestore) => getDocs(
      collection(firestore, 'registrations'),
    )));
  });

  await t.test('RGET6 malformed deterministic Registration IDs are denied', async () => {
    await seedFixture({ registrations: [{ label: 'a' }] });

    for (const malformedId of [
      identities.a.uid,
      `${identities.a.uid}|`,
      `|${OFFERING_ID}`,
      `${identities.a.uid}|${OFFERING_ID}|extra`,
    ]) {
      await assert.rejects(withClient('a', (firestore) => getDoc(
        doc(firestore, 'registrations', malformedId),
      )));
    }
  });

  await t.test('RGET7 owner-looking path with mismatched stored player is denied', async () => {
    await seedFixture({ registrations: [{ label: 'a' }] });
    await db.collection('registrations').doc(registrationId('a')).update({
      playerId: identities.b.uid,
    });

    await assert.rejects(withClient('a', (firestore) => getDoc(
      doc(firestore, 'registrations', registrationId('a')),
    )));
  });
});

test('Registration policy authority P1-P20', async (t) => {
  async function prepareClientCreation({ league1 = {}, offering = {} } = {}) {
    await seedFixture({ league1, registrations: [{ label: 'a' }] });
    await db.collection('registrations').doc(registrationId('a')).delete();
    if (Object.keys(offering).length > 0) {
      await db.collection('registrationOfferings').doc(OFFERING_ID).update(offering);
    }
  }

  async function createAsClient(overrides = {}) {
    return withClient('a', (firestore) => setDoc(
      doc(firestore, 'registrations', registrationId('a')),
      clientRegistrationData('a', undefined, overrides),
    ));
  }

  await t.test('P1 exact current versions create a pending Registration', async () => {
    await prepareClientCreation();
    await createAsClient();
    const current = await state('a');
    assert.equal(current.registration.status, 'pending_payment');
    assert.equal(current.registration.competitionRulesVersionAccepted, 'competition-rules-2026-08-29-v1');
    assert.equal(current.registration.refundPolicyVersionAccepted, 'refund-policy-2026-08-29-v1');
    assert.equal(current.roster.length, 0);
    assert.deepEqual(
      [current.registration.promoCodeId, current.registration.promoCodeSnapshot, current.registration.promoterIdSnapshot],
      [null, null, null],
    );
  });

  for (const [name, overrides] of [
    ['P2 wrong Competition version', { competitionRulesVersionAccepted: 'wrong-competition' }],
    ['P3 wrong Refund version', { refundPolicyVersionAccepted: 'wrong-refund' }],
    ['P4 empty Competition version', { competitionRulesVersionAccepted: '' }],
    ['P4 empty Refund version', { refundPolicyVersionAccepted: '' }],
    ['P5 account version as Competition version', { competitionRulesVersionAccepted: '2026-08-21' }],
  ]) {
    await t.test(`${name} is rejected`, async () => {
      await prepareClientCreation();
      await assert.rejects(createAsClient(overrides));
      assert.equal((await db.collection('registrations').doc(registrationId('a')).get()).exists, false);
    });
  }

  await t.test('P6-P7 current pending League and acquisition updates still work', async () => {
    await seedFixture({ registrations: [{ label: 'a' }] });
    await updateLeagueAsClient('a', LEAGUE_2_ID);
    await updateAcquisitionAsClient('a', {
      acquisitionSource: 'other', acquisitionSourceOther: 'Community event',
    });
    const registration = (await state('a', LEAGUE_2_ID)).registration;
    assert.equal(registration.leagueId, LEAGUE_2_ID);
    assert.equal(registration.acquisitionSourceOther, 'Community event');
  });

  await t.test('P8-P9 legacy pending cancellation works without migration', async () => {
    await seedFixture({ registrations: [{ label: 'a' }] });
    await db.collection('registrations').doc(registrationId('a')).update({
      competitionRulesVersionAccepted: 'legacy-competition-v0',
      refundPolicyVersionAccepted: 'legacy-refund-v0',
    });
    await cancelAsClient('a');
    const registration = (await state('a')).registration;
    assert.equal(registration.status, 'cancelled');
    assert.equal(registration.competitionRulesVersionAccepted, 'legacy-competition-v0');
    assert.equal(registration.refundPolicyVersionAccepted, 'legacy-refund-v0');
  });

  await t.test('P10 checkout with current versions reaches trusted setup', async () => {
    await seedFixture({ registrations: [{ label: 'a' }] });
    const stripe = new FakeStripe();
    setStripeForEmulatorTests(stripe);
    await checkout('a');
    const current = await state('a');
    assert.equal(current.holds.length, 1);
    assert.equal(current.payments.length, 1);
    assert.equal(stripe.createCount, 1);
  });

  for (const [name, field, value] of [
    ['P11 stale Competition version', 'competitionRulesVersionAccepted', 'legacy-competition-v0'],
    ['P12 stale Refund version', 'refundPolicyVersionAccepted', 'legacy-refund-v0'],
  ]) {
    await t.test(`${name} rejects before state or Stripe creation`, async () => {
      await seedFixture({ registrations: [{ label: 'a' }] });
      await db.collection('registrations').doc(registrationId('a')).update({ [field]: value });
      const stripe = new FakeStripe();
      setStripeForEmulatorTests(stripe);
      await assert.rejects(checkout('a'));
      const current = await state('a');
      assert.equal(current.holds.length, 0);
      assert.equal(current.payments.length, 0);
      assert.equal(current.lock.exists, false);
      assert.equal(stripe.createCount, 0);
    });
  }

  for (const [name, field, value] of [
    ['PR1 active retry with stale Competition acceptance', 'competitionRulesVersionAccepted', 'legacy-competition-v0'],
    ['PR2 active retry with stale Refund acceptance', 'refundPolicyVersionAccepted', 'legacy-refund-v0'],
    ['PR3 active retry with an invalid acceptance timestamp', 'competitionRulesAcceptedAt', 'not-a-timestamp'],
  ]) {
    await t.test(`${name} rejects without changing the issued checkout state`, async () => {
      await seedFixture({ registrations: [{ label: 'a' }] });
      const stripe = new FakeStripe();
      setStripeForEmulatorTests(stripe);
      const issued = await checkout('a', REQUEST_IDS[0]);
      await db.collection('registrations').doc(registrationId('a')).update({ [field]: value });

      await assert.rejects(checkout('a', REQUEST_IDS[0]));

      const current = await state('a');
      assert.equal(stripe.createCount, 1);
      assert.equal(current.holds.length, 1);
      assert.equal(current.holds[0].paymentId, issued.paymentId);
      assert.equal(current.holds[0].status, 'active');
      assert.equal(current.payments.length, 1);
      assert.equal(current.payments[0].id, issued.paymentId);
      assert.equal(current.payments[0].status, 'pending');
      assert.equal(current.lock.exists, true);
      assert.equal(current.lock.data().paymentId, issued.paymentId);
      assert.equal(current.league.activeHoldCount, 1);
    });
  }

  await t.test('PR4 a policy change before provisioning rejects without reserving or calling Stripe', async () => {
    await seedFixture({ registrations: [{ label: 'a' }] });
    const stripe = new FakeStripe();
    setStripeForEmulatorTests(stripe);
    setCheckoutTestHookForEmulatorTests(async (stage) => {
      if (stage === 'before-provisioning-transaction') {
        await db.collection('registrations').doc(registrationId('a')).update({
          competitionRulesVersionAccepted: 'legacy-competition-v0',
        });
      }
    });

    try {
      await assert.rejects(checkout('a'));
    } finally {
      setCheckoutTestHookForEmulatorTests(null);
    }

    const current = await state('a');
    assert.equal(stripe.createCount, 0);
    assert.equal(current.holds.length, 0);
    assert.equal(current.payments.length, 0);
    assert.equal(current.lock.exists, false);
    assert.equal(current.league.activeHoldCount, 0);
  });

  await t.test('PR5 a policy change before activation expires Stripe and safely releases the reservation', async () => {
    await seedFixture({ registrations: [{ label: 'a' }] });
    const stripe = new FakeStripe();
    setStripeForEmulatorTests(stripe);
    setCheckoutTestHookForEmulatorTests(async (stage) => {
      if (stage === 'before-activation-transaction') {
        await db.collection('registrations').doc(registrationId('a')).update({
          refundPolicyVersionAccepted: 'legacy-refund-v0',
        });
      }
    });

    try {
      await assert.rejects(checkout('a'));
    } finally {
      setCheckoutTestHookForEmulatorTests(null);
    }

    const current = await state('a');
    const session = stripe.sessions.get('cs_test_1');
    assert.equal(stripe.createCount, 1);
    assert.equal(session.status, 'expired');
    assert.equal(session.url, null);
    assert.equal(current.holds.length, 1);
    assert.equal(current.holds[0].status, 'released');
    assert.equal(current.payments.length, 0);
    assert.equal(current.lock.exists, false);
    assert.equal(current.league.activeHoldCount, 0);
  });

  await t.test('PR6 indeterminate Stripe expiration retains provisioning state for reconciliation', async () => {
    await seedFixture({ registrations: [{ label: 'a' }] });
    const stripe = new FakeStripe();
    stripe.expirationError = new Error('expiration unavailable');
    setStripeForEmulatorTests(stripe);
    setCheckoutTestHookForEmulatorTests(async (stage) => {
      if (stage === 'before-activation-transaction') {
        await db.collection('registrations').doc(registrationId('a')).update({
          competitionRulesVersionAccepted: 'legacy-competition-v0',
        });
      }
    });

    try {
      await assert.rejects(checkout('a'));
    } finally {
      setCheckoutTestHookForEmulatorTests(null);
    }

    const current = await state('a');
    const session = stripe.sessions.get('cs_test_1');
    assert.equal(stripe.createCount, 1);
    assert.equal(session.status, 'open');
    assert.ok(session.url);
    assert.equal(current.holds.length, 1);
    assert.equal(current.holds[0].status, 'provisioning');
    assert.equal(current.payments.length, 0);
    assert.equal(current.lock.exists, true);
    assert.equal(current.league.activeHoldCount, 1);
  });

  await t.test('P15 duplicate creation cannot overwrite the deterministic Registration', async () => {
    await prepareClientCreation();
    await createAsClient();
    await assert.rejects(createAsClient({ leagueId: LEAGUE_2_ID }));
    assert.equal((await state('a')).registration.leagueId, LEAGUE_1_ID);
  });

  await t.test('P16 cross-offering League creation is rejected', async () => {
    await prepareClientCreation();
    await seedOtherOfferingLeague();
    await assert.rejects(createAsClient({ leagueId: OTHER_LEAGUE_ID }));
  });

  await t.test('P17 creation against a non-open League is rejected', async () => {
    await prepareClientCreation({ league1: { status: 'closed' } });
    await assert.rejects(createAsClient());
  });

  await t.test('P18 creation after the registration window closes is rejected', async () => {
    await prepareClientCreation({
      offering: { registrationClosesAt: Timestamp.fromMillis(Date.now() - 1_000) },
    });
    await assert.rejects(createAsClient());
  });
});

test('SeatHold emulator lifecycle A-L', async (t) => {
  await t.test('A. final-seat concurrency', async () => {
    await seedFixture({
      league1: { confirmedCount: 15, lastAssignedRegistrationOrder: 15 },
      registrations: [{ label: 'a' }, { label: 'b' }],
    });
    const stripe = new FakeStripe();
    setStripeForEmulatorTests(stripe);

    const results = await Promise.allSettled([
      checkout('a', REQUEST_IDS[0]),
      checkout('b', REQUEST_IDS[1]),
    ]);
    assert.equal(results.filter(({ status }) => status === 'fulfilled').length, 1);
    assert.equal(results.filter(({ status }) => status === 'rejected').length, 1);
    assert.equal(stripe.createCount, 1);
    const league = (await db.collection('leagues').doc(LEAGUE_1_ID).get()).data();
    assert.equal(league.confirmedCount, 15);
    assert.equal(league.activeHoldCount, 1);
    assert.equal((await documents('seatHolds')).length, 1);
  });

  await t.test('B. same-registration checkout concurrency', async () => {
    await seedFixture({ registrations: [{ label: 'a' }] });
    const stripe = new FakeStripe();
    setStripeForEmulatorTests(stripe);
    const attempts = await Promise.allSettled([
      checkout('a', REQUEST_IDS[0]),
      checkout('a', REQUEST_IDS[1]),
    ]);
    const success = attempts.find(({ status }) => status === 'fulfilled');
    assert.equal(attempts.filter(({ status }) => status === 'fulfilled').length, 1);
    assert.equal((await documents('seatHolds')).length, 1);
    assert.equal((await state('a')).league.activeHoldCount, 1);
    assert.equal(stripe.createCount, 1);

    const winningRequest = success.value.paymentId === (await import('../functions/lib/shared.js'))
      .getPaymentId(identities.a.uid, registrationId('a'), REQUEST_IDS[0])
      ? REQUEST_IDS[0]
      : REQUEST_IDS[1];
    const retry = await checkout('a', winningRequest);
    assert.equal(retry.paymentId, success.value.paymentId);
    assert.equal(stripe.createCount, 1);
  });

  await t.test('C. definite Stripe creation failure', async () => {
    await seedFixture({ registrations: [{ label: 'a' }] });
    const stripe = new FakeStripe();
    stripe.creationError = Object.assign(new Error('definite failure'), {
      type: 'StripeInvalidRequestError',
    });
    setStripeForEmulatorTests(stripe);
    await assert.rejects(checkout('a'));
    let current = await state('a');
    assert.equal(current.holds[0].status, 'released');
    assert.equal(current.league.activeHoldCount, 0);
    assert.equal(current.lock.exists, false);
    assert.equal(current.registration.status, 'pending_payment');
    assert.equal(current.roster.length, 0);

    await releaseProvisioningHold(
      current.holds[0].paymentId,
      registrationId('a'),
      LEAGUE_1_ID,
    );
    current = await state('a');
    assert.equal(current.league.activeHoldCount, 0);
  });

  await t.test('D. successful checkout activation', async () => {
    await seedFixture({ registrations: [{ label: 'a' }] });
    const stripe = new FakeStripe();
    setStripeForEmulatorTests(stripe);
    const { result, payment } = await activate('a');
    const current = await state('a');
    const hold = current.holds.find(({ paymentId }) => paymentId === result.paymentId);
    assert.equal(hold.status, 'active');
    assert.equal(hold.providerCheckoutSessionId, payment.providerCheckoutSessionId);
    assert.equal(hold.expiresAt.toMillis(), stripe.sessions.get(payment.providerCheckoutSessionId).expires_at * 1000);
    assert.equal(payment.status, 'pending');
    assert.equal(current.league.activeHoldCount, 1);
    assert.equal(current.registration.registrationOrder, null);
    assert.equal(current.lock.data().paymentId, result.paymentId);
    assert.equal(current.roster.length, 0);
  });

  await t.test('E. successful payment conversion', async () => {
    await seedFixture({ registrations: [{ label: 'a' }] });
    const stripe = new FakeStripe();
    setStripeForEmulatorTests(stripe);
    const { result, payment } = await activate('a');
    await fulfillSuccessfulCheckout(
      stripeEvent('evt_complete_e', 'checkout.session.completed'),
      paidSession(stripe, payment.providerCheckoutSessionId),
    );
    const current = await state('a');
    assert.deepEqual(
      [current.league.activeHoldCount, current.league.confirmedCount, current.league.lastAssignedRegistrationOrder],
      [0, 1, 1],
    );
    assert.equal(current.registration.status, 'confirmed');
    assert.equal(current.registration.registrationOrder, 1);
    assert.equal(current.payments.find(({ id }) => id === result.paymentId).status, 'succeeded');
    assert.equal(current.holds[0].status, 'converted');
    assert.equal(current.lock.exists, false);
    assert.equal(current.roster.length, 1);
    assert.deepEqual(
      Object.fromEntries(Object.entries(current.roster[0]).filter(([key]) => key !== 'id')),
      { displayName: 'Player a', registrationOrder: 1 },
    );
    assert.equal(current.roster[0].id.includes(identities.a.uid), false);
    assert.equal(current.roster[0].id.includes(registrationId('a')), false);
  });

  await t.test('F. duplicate completed webhook', async () => {
    await seedFixture({ registrations: [{ label: 'a' }] });
    const stripe = new FakeStripe();
    setStripeForEmulatorTests(stripe);
    const { payment } = await activate('a');
    const session = paidSession(stripe, payment.providerCheckoutSessionId);
    const event = stripeEvent('evt_complete_f', 'checkout.session.completed');
    await fulfillSuccessfulCheckout(event, session);
    await fulfillSuccessfulCheckout(event, session);
    await fulfillSuccessfulCheckout(
      stripeEvent('evt_complete_f_distinct', 'checkout.session.completed'),
      session,
    );
    const current = await state('a');
    assert.deepEqual(
      [current.league.activeHoldCount, current.league.confirmedCount, current.league.lastAssignedRegistrationOrder],
      [0, 1, 1],
    );
    assert.deepEqual(current.roster, [{
      id: getPublicRosterEntryId(LEAGUE_1_ID, registrationId('a')),
      displayName: 'Player a',
      registrationOrder: 1,
    }]);
  });

  await t.test('G. checkout expiration', async () => {
    await seedFixture({ registrations: [{ label: 'a' }] });
    const stripe = new FakeStripe();
    setStripeForEmulatorTests(stripe);
    const { payment } = await activate('a');
    await expireCheckout(
      stripeEvent('evt_expire_g', 'checkout.session.expired'),
      stripe.sessions.get(payment.providerCheckoutSessionId),
    );
    const current = await state('a');
    assert.equal(current.holds[0].status, 'expired');
    assert.equal(current.league.activeHoldCount, 0);
    assert.equal(current.roster.length, 0);
    assert.equal(current.payments[0].status, 'expired');
    assert.equal(current.registration.status, 'pending_payment');
    assert.equal(current.lock.exists, false);
  });

  await t.test('H. duplicate expiration', async () => {
    await seedFixture({ registrations: [{ label: 'a' }] });
    const stripe = new FakeStripe();
    setStripeForEmulatorTests(stripe);
    const { payment } = await activate('a');
    const session = stripe.sessions.get(payment.providerCheckoutSessionId);
    const event = stripeEvent('evt_expire_h', 'checkout.session.expired');
    await expireCheckout(event, session);
    await expireCheckout(event, session);
    await expireCheckout(stripeEvent('evt_expire_h_distinct', 'checkout.session.expired'), session);
    const current = await state('a');
    assert.equal(current.league.activeHoldCount, 0);
    assert.equal(current.holds[0].status, 'expired');
  });

  await t.test('I. completed versus expired race', async () => {
    await seedFixture({ registrations: [{ label: 'a' }] });
    const stripe = new FakeStripe();
    setStripeForEmulatorTests(stripe);
    const { payment } = await activate('a');
    const session = stripe.sessions.get(payment.providerCheckoutSessionId);
    await Promise.allSettled([
      fulfillSuccessfulCheckout(
        stripeEvent('evt_complete_i', 'checkout.session.completed'),
        paidSession(stripe, payment.providerCheckoutSessionId),
      ),
      expireCheckout(stripeEvent('evt_expire_i', 'checkout.session.expired'), session),
    ]);
    const current = await state('a');
    assert.ok(current.league.activeHoldCount >= 0);
    assert.ok(current.league.confirmedCount + current.league.activeHoldCount <= 16);
    assert.ok(['converted', 'expired'].includes(current.holds[0].status));
    if (current.holds[0].status === 'converted') {
      assert.equal(current.registration.status, 'confirmed');
      assert.equal(current.league.confirmedCount, 1);
    } else {
      assert.equal(current.registration.status, 'pending_payment');
      assert.equal(current.league.confirmedCount, 0);
    }
  });

  await t.test('J. cancellation versus checkout acquisition', async () => {
    await seedFixture({ registrations: [{ label: 'a' }] });
    let stripe = new FakeStripe();
    setStripeForEmulatorTests(stripe);
    await cancelAsClient('a');
    await assert.rejects(checkout('a'));
    let current = await state('a');
    assert.equal(current.registration.status, 'cancelled');
    assert.equal(current.holds.length, 0);
    assert.equal(stripe.createCount, 0);

    await seedFixture({ registrations: [{ label: 'a' }] });
    stripe = new FakeStripe();
    setStripeForEmulatorTests(stripe);
    await checkout('a');
    await assert.rejects(cancelAsClient('a'));
    current = await state('a');
    assert.equal(current.registration.status, 'pending_payment');
    assert.equal(current.holds[0].status, 'active');
    assert.equal(current.lock.exists, true);
  });

  await t.test('K. full League', async () => {
    await seedFixture({
      league1: { confirmedCount: 15, lastAssignedRegistrationOrder: 15 },
      registrations: [{ label: 'a' }, { label: 'b' }],
    });
    const stripe = new FakeStripe();
    setStripeForEmulatorTests(stripe);
    const { payment } = await activate('a');
    await fulfillSuccessfulCheckout(
      stripeEvent('evt_complete_k', 'checkout.session.completed'),
      paidSession(stripe, payment.providerCheckoutSessionId),
    );
    const league = (await db.collection('leagues').doc(LEAGUE_1_ID).get()).data();
    assert.equal(league.confirmedCount, 16);
    assert.equal(league.activeHoldCount, 0);
    assert.equal(league.status, 'full');
    await assert.rejects(checkout('b', REQUEST_IDS[1]));
    assert.equal(stripe.createCount, 1);
  });

  await t.test('L. two initial Leagues are independent', async () => {
    await seedFixture({
      league1: { confirmedCount: 2, lastAssignedRegistrationOrder: 2 },
      league2: { confirmedCount: 5, lastAssignedRegistrationOrder: 5 },
      registrations: [
        { label: 'a', leagueId: LEAGUE_1_ID },
        { label: 'b', leagueId: LEAGUE_2_ID },
      ],
    });
    const stripe = new FakeStripe();
    setStripeForEmulatorTests(stripe);
    const [first, second] = await Promise.all([activate('a'), activate('b', REQUEST_IDS[1])]);
    await fulfillSuccessfulCheckout(
      stripeEvent('evt_complete_l1', 'checkout.session.completed'),
      paidSession(stripe, first.payment.providerCheckoutSessionId),
    );
    await fulfillSuccessfulCheckout(
      stripeEvent('evt_complete_l2', 'checkout.session.completed'),
      paidSession(stripe, second.payment.providerCheckoutSessionId),
    );
    const [league1, league2] = await Promise.all([
      db.collection('leagues').doc(LEAGUE_1_ID).get(),
      db.collection('leagues').doc(LEAGUE_2_ID).get(),
    ]);
    assert.deepEqual(
      [league1.data().confirmedCount, league1.data().activeHoldCount, league1.data().lastAssignedRegistrationOrder],
      [3, 0, 3],
    );
    assert.deepEqual(
      [league2.data().confirmedCount, league2.data().activeHoldCount, league2.data().lastAssignedRegistrationOrder],
      [6, 0, 6],
    );
    const [roster1, roster2] = await Promise.all([
      db.collection('leagues').doc(LEAGUE_1_ID).collection('publicRoster').get(),
      db.collection('leagues').doc(LEAGUE_2_ID).collection('publicRoster').get(),
    ]);
    assert.equal(roster1.size, 1);
    assert.equal(roster2.size, 1);
    assert.equal(roster1.docs[0].data().registrationOrder, 3);
    assert.equal(roster2.docs[0].data().registrationOrder, 6);
  });
});

test('Acquisition source lifecycle A1-A28', async (t) => {
  for (const acquisition of [
    { acquisitionSource: 'facebook', acquisitionSourceOther: null },
    { acquisitionSource: 'instagram', acquisitionSourceOther: null },
    { acquisitionSource: 'friend_family', acquisitionSourceOther: null },
    { acquisitionSource: 'other', acquisitionSourceOther: 'Local football event' },
  ]) {
    await t.test(`valid creation accepts ${acquisition.acquisitionSource}`, async () => {
      await recreateRegistrationAsClient('a', acquisition);
      const registration = (await db.collection('registrations').doc(registrationId('a')).get()).data();
      assert.equal(registration.acquisitionSource, acquisition.acquisitionSource);
      assert.equal(registration.acquisitionSourceOther, acquisition.acquisitionSourceOther);
    });
  }

  for (const [name, acquisition] of [
    ['Other plus null', { acquisitionSource: 'other', acquisitionSourceOther: null }],
    ['Other plus blank text', { acquisitionSource: 'other', acquisitionSourceOther: '' }],
    ['Other plus text over 100 characters', { acquisitionSource: 'other', acquisitionSourceOther: 'x'.repeat(101) }],
    ['non-Other plus text', { acquisitionSource: 'facebook', acquisitionSourceOther: 'Event' }],
    ['unknown source', { acquisitionSource: 'youtube', acquisitionSourceOther: null }],
    ['leading whitespace', { acquisitionSource: 'other', acquisitionSourceOther: ' Local event' }],
    ['trailing whitespace', { acquisitionSource: 'other', acquisitionSourceOther: 'Local event ' }],
  ]) {
    await t.test(`invalid creation rejects ${name}`, async () => {
      await seedFixture({ registrations: [{ label: 'a' }] });
      await db.collection('registrations').doc(registrationId('a')).delete();
      await assert.rejects(withClient('a', (firestore) => setDoc(
        doc(firestore, 'registrations', registrationId('a')),
        clientRegistrationData('a', acquisition),
      )));
    });
  }

  await t.test('creation rejects missing acquisition fields', async () => {
    await seedFixture({ registrations: [{ label: 'a' }] });
    await db.collection('registrations').doc(registrationId('a')).delete();
    const data = clientRegistrationData('a');
    delete data.acquisitionSource;
    delete data.acquisitionSourceOther;
    await assert.rejects(withClient('a', (firestore) => setDoc(
      doc(firestore, 'registrations', registrationId('a')),
      data,
    )));
  });

  await t.test('client normalization trims Other and preserves capitalization', () => {
    assert.deepEqual(normalizeAcquisitionAttribution({
      acquisitionSource: 'other',
      acquisitionSourceOther: ' LOCAL Event ',
    }), {
      acquisitionSource: 'other',
      acquisitionSourceOther: 'LOCAL Event',
    });
    assert.deepEqual(normalizeAcquisitionAttribution({
      acquisitionSource: 'discord',
      acquisitionSourceOther: 'discarded',
    }), {
      acquisitionSource: 'discord',
      acquisitionSourceOther: null,
    });
    assert.throws(() => normalizeAcquisitionAttribution({
      acquisitionSource: 'youtube',
      acquisitionSourceOther: null,
    }));
  });

  await t.test('pending Registration without a lock can update attribution', async () => {
    await seedFixture({ registrations: [{ label: 'a' }] });
    await updateAcquisitionAsClient('a', {
      acquisitionSource: 'other',
      acquisitionSourceOther: 'Current Name',
    });
    const registration = (await state('a')).registration;
    assert.equal(registration.acquisitionSource, 'other');
    assert.equal(registration.acquisitionSourceOther, 'Current Name');
  });

  await t.test('A19-B deterministic lock-first denies attribution updates', async () => {
    await seedFixture({ registrations: [{ label: 'a' }] });
    const stripe = new FakeStripe();
    setStripeForEmulatorTests(stripe);
    await activate('a');
    await assert.rejects(updateAcquisitionAsClient('a', {
      acquisitionSource: 'instagram', acquisitionSourceOther: null,
    }));
    const current = await state('a');
    assert.equal(current.lock.exists, true);
    assert.equal(current.registration.acquisitionSource, 'facebook');
    assert.equal(current.registration.acquisitionSourceOther, null);
  });

  await t.test('A19-A deterministic update-first checkout uses updated attribution', async () => {
    await seedFixture({ registrations: [{ label: 'a' }] });
    await updateAcquisitionAsClient('a', {
      acquisitionSource: 'instagram', acquisitionSourceOther: null,
    });
    let current = await state('a');
    assert.equal(current.registration.acquisitionSource, 'instagram');
    assert.equal(current.registration.acquisitionSourceOther, null);

    const stripe = new FakeStripe();
    setStripeForEmulatorTests(stripe);
    await activate('a');
    current = await state('a');
    assert.equal(current.lock.exists, true);
    assert.equal(current.holds[0].status, 'active');
    assert.equal(current.payments[0].status, 'pending');
    assert.equal(current.registration.acquisitionSource, 'instagram');
    assert.equal(current.registration.acquisitionSourceOther, null);
  });

  await t.test('definite failure removes lock and restores attribution editing', async () => {
    await seedFixture({ registrations: [{ label: 'a' }] });
    const stripe = new FakeStripe();
    stripe.creationError = Object.assign(new Error('definite failure'), {
      type: 'StripeInvalidRequestError',
    });
    setStripeForEmulatorTests(stripe);
    await assert.rejects(checkout('a'));
    await updateAcquisitionAsClient('a', {
      acquisitionSource: 'instagram', acquisitionSourceOther: null,
    });
    assert.equal((await state('a')).registration.acquisitionSource, 'instagram');
  });

  await t.test('expiration removes lock and restores attribution editing', async () => {
    await seedFixture({ registrations: [{ label: 'a' }] });
    const stripe = new FakeStripe();
    setStripeForEmulatorTests(stripe);
    const { payment } = await activate('a');
    await expireCheckout(
      stripeEvent('evt_acquisition_expired', 'checkout.session.expired'),
      stripe.sessions.get(payment.providerCheckoutSessionId),
    );
    await updateAcquisitionAsClient('a', {
      acquisitionSource: 'friend_family', acquisitionSourceOther: null,
    });
    assert.equal((await state('a')).registration.acquisitionSource, 'friend_family');
  });

  await t.test('indeterminate Stripe failure retains lock and freezes attribution', async () => {
    await seedFixture({ registrations: [{ label: 'a' }] });
    const stripe = new FakeStripe();
    stripe.creationError = Object.assign(new Error('indeterminate failure'), {
      type: 'StripeConnectionError',
    });
    setStripeForEmulatorTests(stripe);
    await assert.rejects(checkout('a'));
    const current = await state('a');
    assert.equal(current.holds[0].status, 'provisioning');
    assert.equal(current.lock.exists, true);
    await assert.rejects(updateAcquisitionAsClient('a', {
      acquisitionSource: 'instagram', acquisitionSourceOther: null,
    }));
  });

  await t.test('checkout rejects invalid attribution before capacity or payment state', async () => {
    for (const badData of [
      { acquisitionSource: 'other', acquisitionSourceOther: ' ' },
      { acquisitionSource: 'youtube', acquisitionSourceOther: null },
      {
        acquisitionSource: FieldValue.delete(),
        acquisitionSourceOther: FieldValue.delete(),
      },
    ]) {
      await seedFixture({ registrations: [{ label: 'a' }] });
      await db.collection('registrations').doc(registrationId('a')).update(badData);
      const stripe = new FakeStripe();
      setStripeForEmulatorTests(stripe);
      await assert.rejects(checkout('a'));
      const current = await state('a');
      assert.equal(current.holds.length, 0);
      assert.equal(current.payments.length, 0);
      assert.equal(current.league.activeHoldCount, 0);
      assert.equal(current.lock.exists, false);
      assert.equal(stripe.createCount, 0);
    }
  });

  await t.test('source update and checkout-lock acquisition serialize safely', async () => {
    await seedFixture({ registrations: [{ label: 'a' }] });
    const stripe = new FakeStripe();
    setStripeForEmulatorTests(stripe);
    const results = await Promise.allSettled([
      updateAcquisitionAsClient('a', {
        acquisitionSource: 'instagram', acquisitionSourceOther: null,
      }),
      checkout('a'),
    ]);
    assert.equal(results[1].status, 'fulfilled');
    const current = await state('a');
    assert.equal(current.lock.exists, true);
    assert.equal(
      current.registration.acquisitionSource,
      results[0].status === 'fulfilled' ? 'instagram' : 'facebook',
    );
  });

  await t.test('success preserves attribution and confirmed Registration rejects updates', async () => {
    await seedFixture({
      registrations: [{
        label: 'a', acquisitionSource: 'other', acquisitionSourceOther: 'LOCAL Event',
      }],
    });
    const stripe = new FakeStripe();
    setStripeForEmulatorTests(stripe);
    const { payment } = await activate('a');
    await fulfillSuccessfulCheckout(
      stripeEvent('evt_acquisition_success', 'checkout.session.completed'),
      paidSession(stripe, payment.providerCheckoutSessionId),
    );
    const current = await state('a');
    assert.equal(current.registration.acquisitionSource, 'other');
    assert.equal(current.registration.acquisitionSourceOther, 'LOCAL Event');
    assert.equal(current.registration.registrationOrder, 1);
    assert.equal(current.payments[0].amountCents, 500);
    assert.deepEqual(
      Object.fromEntries(Object.entries(current.roster[0]).filter(([key]) => key !== 'id')),
      { displayName: 'Player a', registrationOrder: 1 },
    );
    await assert.rejects(updateAcquisitionAsClient('a', {
      acquisitionSource: 'google', acquisitionSourceOther: null,
    }));
  });

  await t.test('promo attribution remains independent of acquisition and price', async () => {
    await seedFixture({ registrations: [{ label: 'a' }] });
    const now = Timestamp.now();
    await db.collection('promoters').doc('promoter-nightflight').set({
      name: 'Nightflight', status: 'active', createdAt: now, updatedAt: now,
    });
    await db.collection('promoCodes').doc('NIGHTFLIGHT').set({
      promoterId: 'promoter-nightflight', status: 'active', createdAt: now, updatedAt: now,
    });
    const stripe = new FakeStripe();
    setStripeForEmulatorTests(stripe);
    const result = await checkout('a', REQUEST_IDS[0], 'NIGHTFLIGHT');
    const current = await state('a');
    assert.equal(current.registration.acquisitionSource, 'facebook');
    assert.equal(current.registration.acquisitionSourceOther, null);
    assert.equal(current.registration.promoCodeSnapshot, 'NIGHTFLIGHT');
    assert.equal(current.registration.promoterIdSnapshot, 'promoter-nightflight');
    assert.equal(current.payments.find(({ id }) => id === result.paymentId).amountCents, 500);
  });

  await t.test('another player cannot read acquisition attribution', async () => {
    await seedFixture({ registrations: [{ label: 'a' }] });
    await assert.rejects(withClient('b', (firestore) => getDoc(
      doc(firestore, 'registrations', registrationId('a')),
    )));
  });

  await t.test('LC1 legacy pending Registration can cancel without a lock', async () => {
    await seedFixture({ registrations: [{ label: 'a' }] });
    const reference = db.collection('registrations').doc(registrationId('a'));
    await reference.update({
      acquisitionSource: FieldValue.delete(),
      acquisitionSourceOther: FieldValue.delete(),
    });
    const before = (await reference.get()).data();
    await cancelAsClient('a');
    const after = (await reference.get()).data();

    assert.equal(after.status, 'cancelled');
    assert.ok(after.cancelledAt instanceof Timestamp);
    assert.ok(after.updatedAt instanceof Timestamp);
    assert.equal('acquisitionSource' in after, false);
    assert.equal('acquisitionSourceOther' in after, false);
    for (const [key, value] of Object.entries(before)) {
      if (!['status', 'cancelledAt', 'updatedAt'].includes(key)) {
        assert.deepEqual(after[key], value);
      }
    }
  });

  await t.test('LC2 legacy pending Registration cannot cancel with a lock', async () => {
    await seedFixture({ registrations: [{ label: 'a' }] });
    const reference = db.collection('registrations').doc(registrationId('a'));
    await reference.update({
      acquisitionSource: FieldValue.delete(),
      acquisitionSourceOther: FieldValue.delete(),
    });
    await db.collection('registrationCheckoutLocks').doc(registrationId('a')).set({
      paymentId: 'legacy-payment',
      registrationId: registrationId('a'),
      updatedAt: Timestamp.now(),
    });
    await assert.rejects(cancelAsClient('a'));
    assert.equal((await reference.get()).data().status, 'pending_payment');
  });

  await t.test('LC3 legacy cancellation cannot introduce acquisition or other changes', async () => {
    await seedFixture({ registrations: [{ label: 'a' }] });
    const reference = db.collection('registrations').doc(registrationId('a'));
    await reference.update({
      acquisitionSource: FieldValue.delete(),
      acquisitionSourceOther: FieldValue.delete(),
    });

    await assert.rejects(withClient('a', (firestore) => {
      const timestamp = serverTimestamp();
      return updateDoc(doc(firestore, 'registrations', registrationId('a')), {
        status: 'cancelled',
        cancelledAt: timestamp,
        updatedAt: timestamp,
        acquisitionSource: 'facebook',
        acquisitionSourceOther: null,
      });
    }));
    assert.equal((await reference.get()).data().status, 'pending_payment');
  });

  await t.test('legacy Registration cannot checkout or use acquisition update compatibility', async () => {
    await seedFixture({ registrations: [{ label: 'a' }] });
    await db.collection('registrations').doc(registrationId('a')).update({
      acquisitionSource: FieldValue.delete(),
      acquisitionSourceOther: FieldValue.delete(),
    });
    const stripe = new FakeStripe();
    setStripeForEmulatorTests(stripe);
    await assert.rejects(checkout('a'));
    await assert.rejects(updateAcquisitionAsClient('a', {
      acquisitionSource: 'instagram', acquisitionSourceOther: null,
    }));
    const current = await state('a');
    assert.equal(current.holds.length, 0);
    assert.equal(current.payments.length, 0);
    assert.equal(current.lock.exists, false);
  });
});

test('Pending Registration sibling League switching L1-L30', async (t) => {
  await t.test('L1 pending Registration without a lock switches sibling Leagues', async () => {
    await seedFixture({ registrations: [{ label: 'a' }] });
    await updateLeagueAsClient('a', LEAGUE_2_ID);
    assert.equal((await state('a')).registration.leagueId, LEAGUE_2_ID);
  });

  await t.test('L2 destination League must exist and be open for the same offering', async () => {
    await seedFixture({ league2: { status: 'closed' }, registrations: [{ label: 'a' }] });
    await assert.rejects(updateLeagueAsClient('a', LEAGUE_2_ID));
    await assert.rejects(updateLeagueAsClient('a', `${OFFERING_ID}__league-99`));
    assert.equal((await state('a')).registration.leagueId, LEAGUE_1_ID);
  });

  await t.test('L3 League under another offering is rejected', async () => {
    await seedFixture({ registrations: [{ label: 'a' }] });
    await seedOtherOfferingLeague();
    await assert.rejects(updateLeagueAsClient('a', OTHER_LEAGUE_ID));
    assert.equal((await state('a')).registration.leagueId, LEAGUE_1_ID);
  });

  await t.test('L4 registrationOfferingId cannot change', async () => {
    await seedFixture({ registrations: [{ label: 'a' }] });
    await seedOtherOfferingLeague();
    await assert.rejects(withClient('a', (firestore) => updateDoc(
      doc(firestore, 'registrations', registrationId('a')),
      {
        registrationOfferingId: OTHER_OFFERING_ID,
        leagueId: OTHER_LEAGUE_ID,
        updatedAt: serverTimestamp(),
      },
    )));
    assert.equal((await state('a')).registration.registrationOfferingId, OFFERING_ID);
  });

  await t.test('L5 only leagueId and updatedAt may change', async () => {
    await seedFixture({ registrations: [{ label: 'a' }] });
    await assert.rejects(withClient('a', (firestore) => updateDoc(
      doc(firestore, 'registrations', registrationId('a')),
      { leagueId: LEAGUE_2_ID, submittedAt: serverTimestamp(), updatedAt: serverTimestamp() },
    )));
    assert.equal((await state('a')).registration.leagueId, LEAGUE_1_ID);
  });

  await t.test('L6 active checkout lock blocks League switch', async () => {
    await seedFixture({ registrations: [{ label: 'a' }] });
    const stripe = new FakeStripe();
    setStripeForEmulatorTests(stripe);
    await activate('a');
    await assert.rejects(updateLeagueAsClient('a', LEAGUE_2_ID));
    const current = await state('a');
    assert.equal(current.registration.leagueId, LEAGUE_1_ID);
    assert.equal(current.holds[0].leagueId, LEAGUE_1_ID);
  });

  await t.test('L7 provisioning indeterminate lock blocks League switch', async () => {
    await seedFixture({ registrations: [{ label: 'a' }] });
    const stripe = new FakeStripe();
    stripe.creationError = Object.assign(new Error('indeterminate failure'), {
      type: 'StripeConnectionError',
    });
    setStripeForEmulatorTests(stripe);
    await assert.rejects(checkout('a'));
    await assert.rejects(updateLeagueAsClient('a', LEAGUE_2_ID));
    const current = await state('a');
    assert.equal(current.lock.exists, true);
    assert.equal(current.holds[0].status, 'provisioning');
    assert.equal(current.registration.leagueId, current.holds[0].leagueId);
  });

  await t.test('L8 provider-confirmed expiration permits League switch', async () => {
    await seedFixture({ registrations: [{ label: 'a' }] });
    const stripe = new FakeStripe();
    setStripeForEmulatorTests(stripe);
    const { payment } = await activate('a');
    await expireCheckout(
      stripeEvent('evt_league_l8', 'checkout.session.expired'),
      stripe.sessions.get(payment.providerCheckoutSessionId),
    );
    await updateLeagueAsClient('a', LEAGUE_2_ID);
    const current = await state('a');
    assert.equal(current.lock.exists, false);
    assert.equal(current.registration.leagueId, LEAGUE_2_ID);
  });

  await t.test('L9 definite Stripe failure cleanup permits League switch', async () => {
    await seedFixture({ registrations: [{ label: 'a' }] });
    const stripe = new FakeStripe();
    stripe.creationError = Object.assign(new Error('definite failure'), {
      type: 'StripeInvalidRequestError',
    });
    setStripeForEmulatorTests(stripe);
    await assert.rejects(checkout('a'));
    await updateLeagueAsClient('a', LEAGUE_2_ID);
    const current = await state('a');
    assert.equal(current.lock.exists, false);
    assert.equal(current.holds[0].status, 'released');
    assert.equal(current.registration.leagueId, LEAGUE_2_ID);
  });

  await t.test('L10 confirmed Registration cannot switch', async () => {
    await seedFixture({ registrations: [{ label: 'a' }] });
    const stripe = new FakeStripe();
    setStripeForEmulatorTests(stripe);
    const { payment } = await activate('a');
    await fulfillSuccessfulCheckout(
      stripeEvent('evt_league_l10', 'checkout.session.completed'),
      paidSession(stripe, payment.providerCheckoutSessionId),
    );
    await assert.rejects(updateLeagueAsClient('a', LEAGUE_2_ID));
    assert.equal((await state('a')).registration.leagueId, LEAGUE_1_ID);
  });

  await t.test('L11 cancelled Registration cannot switch', async () => {
    await seedFixture({ registrations: [{ label: 'a' }] });
    await cancelAsClient('a');
    await assert.rejects(updateLeagueAsClient('a', LEAGUE_2_ID));
    const registration = (await state('a')).registration;
    assert.equal(registration.status, 'cancelled');
    assert.equal(registration.leagueId, LEAGUE_1_ID);
  });

  await t.test('L12 League switch and cancellation cannot share a write', async () => {
    await seedFixture({ registrations: [{ label: 'a' }] });
    await assert.rejects(withClient('a', (firestore) => {
      const timestamp = serverTimestamp();
      return updateDoc(doc(firestore, 'registrations', registrationId('a')), {
        leagueId: LEAGUE_2_ID,
        status: 'cancelled',
        cancelledAt: timestamp,
        updatedAt: timestamp,
      });
    }));
    assert.equal((await state('a')).registration.status, 'pending_payment');
  });

  await t.test('L13 League switch and acquisition change cannot share a write', async () => {
    await seedFixture({ registrations: [{ label: 'a' }] });
    await assert.rejects(withClient('a', (firestore) => updateDoc(
      doc(firestore, 'registrations', registrationId('a')),
      {
        leagueId: LEAGUE_2_ID,
        acquisitionSource: 'instagram',
        acquisitionSourceOther: null,
        updatedAt: serverTimestamp(),
      },
    )));
    assert.equal((await state('a')).registration.leagueId, LEAGUE_1_ID);
  });

  await t.test('L14 League switch cannot change promo or policy fields', async () => {
    for (const extra of [
      { promoCodeId: 'NIGHTFLIGHT' },
      { competitionRulesVersionAccepted: 'changed-rules' },
      { refundPolicyVersionAccepted: 'changed-refund' },
    ]) {
      await seedFixture({ registrations: [{ label: 'a' }] });
      await assert.rejects(withClient('a', (firestore) => updateDoc(
        doc(firestore, 'registrations', registrationId('a')),
        { leagueId: LEAGUE_2_ID, ...extra, updatedAt: serverTimestamp() },
      )));
      assert.equal((await state('a')).registration.leagueId, LEAGUE_1_ID);
    }
  });

  await t.test('L15 update-first checkout reserves the newly selected League', async () => {
    await seedFixture({ registrations: [{ label: 'a' }] });
    await updateLeagueAsClient('a', LEAGUE_2_ID);
    const stripe = new FakeStripe();
    setStripeForEmulatorTests(stripe);
    const { result, payment } = await activate('a');
    const current = await state('a', LEAGUE_2_ID);
    assert.equal(current.registration.leagueId, LEAGUE_2_ID);
    assert.equal(current.holds[0].leagueId, LEAGUE_2_ID);
    assert.equal(current.holds[0].paymentId, result.paymentId);
    assert.equal(payment.registrationId, registrationId('a'));
    assert.equal(stripe.sessions.get(payment.providerCheckoutSessionId).metadata.leagueId, LEAGUE_2_ID);
    assert.equal(current.league.activeHoldCount, 1);
  });

  await t.test('L16 lock-first checkout freezes the current League', async () => {
    await seedFixture({ registrations: [{ label: 'a' }] });
    const stripe = new FakeStripe();
    setStripeForEmulatorTests(stripe);
    await activate('a');
    await assert.rejects(updateLeagueAsClient('a', LEAGUE_2_ID));
    const current = await state('a');
    assert.equal(current.registration.leagueId, LEAGUE_1_ID);
    assert.equal(current.holds[0].leagueId, LEAGUE_1_ID);
  });

  await t.test('L17 concurrent switch and checkout never leave mismatched active state', async () => {
    await seedFixture({ registrations: [{ label: 'a' }] });
    const stripe = new FakeStripe();
    setStripeForEmulatorTests(stripe);
    await Promise.allSettled([
      updateLeagueAsClient('a', LEAGUE_2_ID),
      checkout('a'),
    ]);
    const current = await state('a');
    for (const hold of current.holds.filter(({ status }) => ['provisioning', 'active'].includes(status))) {
      assert.equal(hold.leagueId, current.registration.leagueId);
    }
  });

  await t.test('L18 expiration then fresh attempt creates League 2 records', async () => {
    await seedFixture({ registrations: [{ label: 'a' }] });
    const stripe = new FakeStripe();
    setStripeForEmulatorTests(stripe);
    const first = await activate('a', REQUEST_IDS[0]);
    await expireCheckout(
      stripeEvent('evt_league_l18', 'checkout.session.expired'),
      stripe.sessions.get(first.payment.providerCheckoutSessionId),
    );
    await updateLeagueAsClient('a', LEAGUE_2_ID);
    const second = await activate('a', REQUEST_IDS[1]);
    const current = await state('a', LEAGUE_2_ID);
    const newHold = current.holds.find(({ paymentId }) => paymentId === second.result.paymentId);
    assert.equal(newHold.leagueId, LEAGUE_2_ID);
    assert.equal(newHold.status, 'active');
    assert.equal(current.league.activeHoldCount, 1);
  });

  await t.test('L19 definite failure then fresh attempt creates League 2 records', async () => {
    await seedFixture({ registrations: [{ label: 'a' }] });
    const stripe = new FakeStripe();
    stripe.creationError = Object.assign(new Error('definite failure'), {
      type: 'StripeInvalidRequestError',
    });
    setStripeForEmulatorTests(stripe);
    await assert.rejects(checkout('a', REQUEST_IDS[0]));
    await updateLeagueAsClient('a', LEAGUE_2_ID);
    stripe.creationError = null;
    const second = await activate('a', REQUEST_IDS[1]);
    const current = await state('a', LEAGUE_2_ID);
    const newHold = current.holds.find(({ paymentId }) => paymentId === second.result.paymentId);
    assert.equal(newHold.leagueId, LEAGUE_2_ID);
    assert.equal(newHold.status, 'active');
  });

  await t.test('L20 old checkoutRequestId cannot be reused after switch', async () => {
    await seedFixture({ registrations: [{ label: 'a' }] });
    const stripe = new FakeStripe();
    setStripeForEmulatorTests(stripe);
    const first = await activate('a', REQUEST_IDS[0]);
    await expireCheckout(
      stripeEvent('evt_league_l20', 'checkout.session.expired'),
      stripe.sessions.get(first.payment.providerCheckoutSessionId),
    );
    await updateLeagueAsClient('a', LEAGUE_2_ID);
    await assert.rejects(checkout('a', REQUEST_IDS[0]));
    assert.equal((await state('a', LEAGUE_2_ID)).league.activeHoldCount, 0);
  });

  await t.test('L21 historical Payment and SeatHold remain attached to League 1', async () => {
    await seedFixture({ registrations: [{ label: 'a' }] });
    const stripe = new FakeStripe();
    setStripeForEmulatorTests(stripe);
    const first = await activate('a');
    await expireCheckout(
      stripeEvent('evt_league_l21', 'checkout.session.expired'),
      stripe.sessions.get(first.payment.providerCheckoutSessionId),
    );
    await updateLeagueAsClient('a', LEAGUE_2_ID);
    const current = await state('a');
    const oldHold = current.holds.find(({ paymentId }) => paymentId === first.result.paymentId);
    const oldPayment = current.payments.find(({ id }) => id === first.result.paymentId);
    assert.equal(oldHold.leagueId, LEAGUE_1_ID);
    assert.equal(oldHold.status, 'expired');
    assert.equal(oldPayment.status, 'expired');
    assert.equal(current.registration.leagueId, LEAGUE_2_ID);
  });

  await t.test('L22 late historical League 1 completion cannot mutate League 2 selection', async () => {
    await seedFixture({ registrations: [{ label: 'a' }] });
    const stripe = new FakeStripe();
    setStripeForEmulatorTests(stripe);
    const first = await activate('a');
    const historicalSession = stripe.sessions.get(first.payment.providerCheckoutSessionId);
    await expireCheckout(
      stripeEvent('evt_league_l22_expired', 'checkout.session.expired'),
      historicalSession,
    );
    await updateLeagueAsClient('a', LEAGUE_2_ID);
    const before = await state('a');
    const league2Before = (await db.collection('leagues').doc(LEAGUE_2_ID).get()).data();
    await assert.rejects(expireCheckout(
      stripeEvent('evt_league_l22_late_expired', 'checkout.session.expired'),
      historicalSession,
    ));
    await assert.rejects(fulfillSuccessfulCheckout(
      stripeEvent('evt_league_l22_late_paid', 'checkout.session.completed'),
      paidSession(stripe, first.payment.providerCheckoutSessionId),
    ));
    const after = await state('a');
    const league2After = (await db.collection('leagues').doc(LEAGUE_2_ID).get()).data();
    assert.equal(after.registration.leagueId, LEAGUE_2_ID);
    assert.deepEqual(after.league, before.league);
    assert.deepEqual(league2After, league2Before);
    assert.equal(after.roster.length, 0);
    assert.equal((await db.collection('leagues').doc(LEAGUE_2_ID).collection('publicRoster').get()).size, 0);
  });

  await t.test('L23 pending switch creates no public roster rows', async () => {
    await seedFixture({ registrations: [{ label: 'a' }] });
    await updateLeagueAsClient('a', LEAGUE_2_ID);
    const [first, second] = await Promise.all([
      db.collection('leagues').doc(LEAGUE_1_ID).collection('publicRoster').get(),
      db.collection('leagues').doc(LEAGUE_2_ID).collection('publicRoster').get(),
    ]);
    assert.equal(first.size, 0);
    assert.equal(second.size, 0);
  });

  await t.test('L24 successful new League 2 checkout creates only League 2 roster', async () => {
    await seedFixture({ registrations: [{ label: 'a' }] });
    await updateLeagueAsClient('a', LEAGUE_2_ID);
    const stripe = new FakeStripe();
    setStripeForEmulatorTests(stripe);
    const { payment } = await activate('a');
    await fulfillSuccessfulCheckout(
      stripeEvent('evt_league_l24', 'checkout.session.completed'),
      paidSession(stripe, payment.providerCheckoutSessionId),
    );
    const [first, second] = await Promise.all([
      db.collection('leagues').doc(LEAGUE_1_ID).collection('publicRoster').get(),
      db.collection('leagues').doc(LEAGUE_2_ID).collection('publicRoster').get(),
    ]);
    assert.equal(first.size, 0);
    assert.equal(second.size, 1);
  });

  await t.test('L25 acquisition fields are preserved by League switch', async () => {
    await seedFixture({
      registrations: [{
        label: 'a', acquisitionSource: 'other', acquisitionSourceOther: 'Local event',
      }],
    });
    await updateLeagueAsClient('a', LEAGUE_2_ID);
    const registration = (await state('a')).registration;
    assert.equal(registration.acquisitionSource, 'other');
    assert.equal(registration.acquisitionSourceOther, 'Local event');
  });

  await t.test('L26 locked promo snapshots are preserved by League switch', async () => {
    await seedFixture({ registrations: [{ label: 'a' }] });
    const reference = db.collection('registrations').doc(registrationId('a'));
    await reference.update({
      promoCodeId: 'NIGHTFLIGHT',
      promoCodeSnapshot: 'NIGHTFLIGHT',
      promoterIdSnapshot: 'promoter-nightflight',
    });
    await updateLeagueAsClient('a', LEAGUE_2_ID);
    const registration = (await reference.get()).data();
    assert.deepEqual(
      [registration.promoCodeId, registration.promoCodeSnapshot, registration.promoterIdSnapshot],
      ['NIGHTFLIGHT', 'NIGHTFLIGHT', 'promoter-nightflight'],
    );
  });

  await t.test('L27 policy acceptance is preserved by League switch', async () => {
    await seedFixture({ registrations: [{ label: 'a' }] });
    const before = (await state('a')).registration;
    await updateLeagueAsClient('a', LEAGUE_2_ID);
    const after = (await state('a')).registration;
    for (const key of [
      'competitionRulesVersionAccepted',
      'competitionRulesAcceptedAt',
      'refundPolicyVersionAccepted',
      'refundPolicyAcceptedAt',
    ]) {
      assert.deepEqual(after[key], before[key]);
    }
  });

  await t.test('L28 alternate Registration ID cannot bypass offering uniqueness', async () => {
    await seedFixture({ registrations: [{ label: 'a' }] });
    await assert.rejects(withClient('a', (firestore) => setDoc(
      doc(firestore, 'registrations', `${identities.a.uid}|${LEAGUE_2_ID}`),
      { ...clientRegistrationData('a'), leagueId: LEAGUE_2_ID },
    )));
    assert.equal((await db.collection('registrations').get()).size, 1);
  });

  await t.test('L29 legacy Registration cannot switch League', async () => {
    await seedFixture({ registrations: [{ label: 'a' }] });
    await db.collection('registrations').doc(registrationId('a')).update({
      acquisitionSource: FieldValue.delete(),
      acquisitionSourceOther: FieldValue.delete(),
    });
    await assert.rejects(updateLeagueAsClient('a', LEAGUE_2_ID));
    assert.equal((await state('a')).registration.leagueId, LEAGUE_1_ID);
  });

  await t.test('L30 legacy narrow cancellation remains allowed without a lock', async () => {
    await seedFixture({ registrations: [{ label: 'a' }] });
    await db.collection('registrations').doc(registrationId('a')).update({
      acquisitionSource: FieldValue.delete(),
      acquisitionSourceOther: FieldValue.delete(),
    });
    await cancelAsClient('a');
    const registration = (await state('a')).registration;
    assert.equal(registration.status, 'cancelled');
    assert.equal('acquisitionSource' in registration, false);
    assert.equal('acquisitionSourceOther' in registration, false);
  });
});

test('Public roster projection and rules PR1-PR22', async (t) => {
  await t.test('opaque IDs are deterministic and League-scoped', () => {
    const first = getPublicRosterEntryId(LEAGUE_1_ID, registrationId('a'));
    assert.equal(first, getPublicRosterEntryId(LEAGUE_1_ID, registrationId('a')));
    assert.notEqual(first, getPublicRosterEntryId(LEAGUE_2_ID, registrationId('a')));
    assert.equal(first.includes(identities.a.uid), false);
    assert.equal(first.includes(registrationId('a')), false);
  });

  await t.test('duplicate success preserves the original snapshot', async () => {
    await seedFixture({ registrations: [{ label: 'a' }] });
    const stripe = new FakeStripe();
    setStripeForEmulatorTests(stripe);
    const { payment } = await activate('a');
    const paid = paidSession(stripe, payment.providerCheckoutSessionId);
    await fulfillSuccessfulCheckout(stripeEvent('evt_roster_first', 'checkout.session.completed'), paid);
    await db.collection('players').doc(identities.a.uid).update({ displayName: 'Changed Name' });
    await fulfillSuccessfulCheckout(stripeEvent('evt_roster_distinct', 'checkout.session.completed'), paid);
    assert.deepEqual((await state('a')).roster, [{
      id: getPublicRosterEntryId(LEAGUE_1_ID, registrationId('a')),
      displayName: 'Player a',
      registrationOrder: 1,
    }]);
  });

  for (const playerChange of ['deleted', 'invalid displayName']) {
    await t.test(`terminal duplicate succeeds when Player is ${playerChange}`, async () => {
      await seedFixture({ registrations: [{ label: 'a' }] });
      const stripe = new FakeStripe();
      setStripeForEmulatorTests(stripe);
      const { payment } = await activate('a');
      const paid = paidSession(stripe, payment.providerCheckoutSessionId);
      await fulfillSuccessfulCheckout(stripeEvent('evt_roster_terminal_first', 'checkout.session.completed'), paid);
      const before = await state('a');

      if (playerChange === 'deleted') {
        await db.collection('players').doc(identities.a.uid).delete();
      } else {
        await db.collection('players').doc(identities.a.uid).update({ displayName: 'x' });
      }

      await fulfillSuccessfulCheckout(
        stripeEvent(`evt_roster_terminal_${playerChange.replaceAll(' ', '_')}`, 'checkout.session.completed'),
        paid,
      );
      const after = await state('a');
      const eventSnapshot = await db.collection('stripeWebhookEvents')
        .doc(`evt_roster_terminal_${playerChange.replaceAll(' ', '_')}`).get();

      assert.equal(eventSnapshot.exists, true);
      assert.deepEqual(after.roster, before.roster);
      assert.deepEqual(after.registration, before.registration);
      assert.deepEqual(after.payments, before.payments);
      assert.deepEqual(after.holds, before.holds);
      assert.deepEqual(after.league, before.league);
    });
  }

  await t.test('confirmed success retry repairs only a missing projection', async () => {
    await seedFixture({ registrations: [{ label: 'a' }] });
    await db.collection('players').doc(identities.a.uid).update({ displayName: 'Original Name' });
    const stripe = new FakeStripe();
    setStripeForEmulatorTests(stripe);
    const { payment } = await activate('a');
    const paid = paidSession(stripe, payment.providerCheckoutSessionId);
    await fulfillSuccessfulCheckout(stripeEvent('evt_roster_repair_first', 'checkout.session.completed'), paid);
    const before = await state('a');
    await db.collection('leagues').doc(LEAGUE_1_ID).collection('publicRoster')
      .doc(getPublicRosterEntryId(LEAGUE_1_ID, registrationId('a'))).delete();
    await db.collection('players').doc(identities.a.uid).update({ displayName: 'Current Name' });
    await fulfillSuccessfulCheckout(stripeEvent('evt_roster_repair_retry', 'checkout.session.completed'), paid);
    const after = await state('a');
    assert.deepEqual(after.league, before.league);
    assert.deepEqual(after.registration, before.registration);
    assert.deepEqual(after.payments, before.payments);
    assert.deepEqual(after.holds, before.holds);
    assert.deepEqual(after.roster, [{
      id: getPublicRosterEntryId(LEAGUE_1_ID, registrationId('a')),
      displayName: 'Current Name',
      registrationOrder: 1,
    }]);
  });

  await t.test('missing Player prevents atomic confirmation', async () => {
    await seedFixture({ registrations: [{ label: 'a' }] });
    const stripe = new FakeStripe();
    setStripeForEmulatorTests(stripe);
    const { payment } = await activate('a');
    await db.collection('players').doc(identities.a.uid).delete();
    await assert.rejects(fulfillSuccessfulCheckout(
      stripeEvent('evt_missing_player', 'checkout.session.completed'),
      paidSession(stripe, payment.providerCheckoutSessionId),
    ));
    const current = await state('a');
    assert.equal(current.registration.status, 'pending_payment');
    assert.equal(current.league.activeHoldCount, 1);
    assert.equal(current.holds[0].status, 'active');
    assert.equal(current.roster.length, 0);
  });

  await t.test('invalid displayName prevents atomic confirmation', async () => {
    await seedFixture({ registrations: [{ label: 'a' }] });
    const stripe = new FakeStripe();
    setStripeForEmulatorTests(stripe);
    const { payment } = await activate('a');
    await db.collection('players').doc(identities.a.uid).update({ displayName: 'x' });
    await assert.rejects(fulfillSuccessfulCheckout(
      stripeEvent('evt_invalid_player', 'checkout.session.completed'),
      paidSession(stripe, payment.providerCheckoutSessionId),
    ));
    const current = await state('a');
    assert.equal(current.registration.status, 'pending_payment');
    assert.equal(current.league.activeHoldCount, 1);
    assert.equal(current.roster.length, 0);
  });

  await t.test('authenticated read is allowed and all client writes are denied', async () => {
    await seedFixture({ registrations: [{ label: 'a' }] });
    const stripe = new FakeStripe();
    setStripeForEmulatorTests(stripe);
    const { payment } = await activate('a');
    await fulfillSuccessfulCheckout(
      stripeEvent('evt_roster_rules', 'checkout.session.completed'),
      paidSession(stripe, payment.providerCheckoutSessionId),
    );
    const rosterId = getPublicRosterEntryId(LEAGUE_1_ID, registrationId('a'));

    await withClient('b', async (firestore) => {
      const roster = await getDocs(collection(firestore, 'leagues', LEAGUE_1_ID, 'publicRoster'));
      assert.equal(roster.size, 1);
      await assert.rejects(getDoc(doc(firestore, 'players', identities.a.uid)));
      await assert.rejects(getDocs(collection(firestore, 'players')));
      await assert.rejects(setDoc(
        doc(firestore, 'leagues', LEAGUE_1_ID, 'publicRoster', 'client-created'),
        { displayName: 'Client', registrationOrder: 2 },
      ));
      await assert.rejects(updateDoc(
        doc(firestore, 'leagues', LEAGUE_1_ID, 'publicRoster', rosterId),
        { displayName: 'Changed' },
      ));
      await assert.rejects(deleteDoc(
        doc(firestore, 'leagues', LEAGUE_1_ID, 'publicRoster', rosterId),
      ));
    });

    await withClient(null, async (firestore) => {
      await assert.rejects(getDocs(collection(firestore, 'leagues', LEAGUE_1_ID, 'publicRoster')));
    });
  });
});
