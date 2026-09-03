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
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
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
  getPaymentId,
  getPublicRosterEntryId,
  setStripeForEmulatorTests,
} = await import('../functions/lib/shared.js');
const {
  createRegistrationCheckout,
  releaseProvisioningHold,
  setCheckoutTestHookForEmulatorTests,
  setRegistrationPaymentLaunchForEmulatorTests,
} = await import('../functions/lib/checkout.js');
const { createLeagueRegistration } = await import('../functions/lib/registrations.js');
const {
  expireCheckout,
  fulfillSuccessfulCheckout,
} = await import('../functions/lib/webhook.js');
const { normalizeAcquisitionAttribution } = await import('../src/models/Registration.ts');

class FakeStripe {
  constructor() {
    this.sessions = new Map();
    this.createCount = 0;
    this.createParameters = [];
    this.creationError = null;
    this.expirationError = null;
    this.retrievalError = null;
    this.checkout = {
      sessions: {
        create: async (parameters) => {
          this.createCount += 1;
          this.createParameters.push(parameters);

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
            expires_at: parameters.expires_at,
            amount_total: parameters.line_items[0].price_data.unit_amount,
            currency: parameters.line_items[0].price_data.currency,
            metadata: parameters.metadata,
            payment_intent: `pi_test_${this.createCount}`,
          };
          this.sessions.set(id, session);
          return session;
        },
        retrieve: async (id) => {
          if (this.retrievalError) throw this.retrievalError;
          return this.sessions.get(id);
        },
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

  const firstRegistrationOrder = Math.max(
    Number(league1.lastAssignedRegistrationOrder ?? 0),
    Number(league2.lastAssignedRegistrationOrder ?? 0),
  ) + 1;
  for (const [index, {
    label,
    leagueId = null,
    acquisitionSource = 'facebook',
    acquisitionSourceOther = null,
    registrationOrder = firstRegistrationOrder + index,
  }] of registrations.entries()) {
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
      registrationOrder,
      paymentAvailabilityStatus: 'available',
      paymentAvailableAt: Timestamp.fromMillis(now.toMillis() - 60 * 60 * 1000),
      paymentDueAt: Timestamp.fromMillis(now.toMillis() + 47 * 60 * 60 * 1000),
      createdAt: now,
      updatedAt: now,
      submittedAt: now,
      confirmedAt: null,
      cancelledAt: null,
    });
  }

  await batch.commit();
}

async function seedPromo(code, promoterId) {
  const now = Timestamp.now();
  const batch = db.batch();
  batch.set(db.collection('promoters').doc(promoterId), {
    name: `Test Promoter ${promoterId}`,
    status: 'active',
    createdAt: now,
    updatedAt: now,
  });
  batch.set(db.collection('promoCodes').doc(code), {
    promoterId,
    status: 'active',
    createdAt: now,
    updatedAt: now,
  });
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
    leagueId: null,
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
    paymentAvailabilityStatus: 'unavailable',
    paymentAvailableAt: null,
    paymentDueAt: null,
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
  await createLeagueRegistration.run({
    auth: { uid: identities[label].uid, token: { email: identities[label].email } },
    data: {
      registrationOfferingId: OFFERING_ID,
      competitionRulesVersionAccepted: 'competition-rules-2026-08-29-v1',
      refundPolicyVersionAccepted: 'refund-policy-2026-08-29-v1',
      ...acquisition,
    },
  });
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
setRegistrationPaymentLaunchForEmulatorTests(true);

test('launch registration assigns atomic priority without starting payment', async () => {
  await seedFixture({ registrations: [{ label: 'a' }, { label: 'b' }] });
  await Promise.all([
    db.collection('registrations').doc(registrationId('a')).delete(),
    db.collection('registrations').doc(registrationId('b')).delete(),
  ]);

  const createRequest = (label) => createLeagueRegistration.run({
    auth: { uid: identities[label].uid, token: { email: identities[label].email } },
    data: {
      registrationOfferingId: OFFERING_ID,
      competitionRulesVersionAccepted: 'competition-rules-2026-08-29-v1',
      refundPolicyVersionAccepted: 'refund-policy-2026-08-29-v1',
      acquisitionSource: 'facebook',
      acquisitionSourceOther: null,
    },
  });

  setRegistrationPaymentLaunchForEmulatorTests(false);
  try {
    const created = await Promise.all([createRequest('a'), createRequest('b')]);
    assert.deepEqual(
      created.map(({ registrationOrder }) => registrationOrder).sort((a, b) => a - b),
      [1, 2],
    );

    const registrations = await Promise.all(['a', 'b'].map(async (label) => (
      (await db.collection('registrations').doc(registrationId(label)).get()).data()
    )));
    assert.deepEqual(
      registrations.map(({ registrationOrder }) => registrationOrder).sort((a, b) => a - b),
      [1, 2],
    );
    for (const registration of registrations) {
      assert.equal(registration.leagueId, null);
      assert.equal(registration.status, 'pending_payment');
      assert.equal(registration.paymentAvailabilityStatus, 'unavailable');
      assert.equal(registration.paymentAvailableAt, null);
      assert.equal(registration.paymentDueAt, null);
    }

    const stripe = new FakeStripe();
    setStripeForEmulatorTests(stripe);
    await assert.rejects(
      checkout('a'),
      /Payment confirmation has not launched/,
    );
    assert.equal(stripe.createCount, 0);
    assert.equal((await documents('payments')).length, 0);
    assert.equal((await documents('seatHolds')).length, 0);
  } finally {
    setRegistrationPaymentLaunchForEmulatorTests(true);
  }
});

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

  await t.test('RGET5 owner-filtered Registration list is allowed and unrestricted list is denied', async () => {
    await seedFixture({ registrations: [{ label: 'a' }] });

    const snapshot = await withClient('a', (firestore) => getDocs(query(
      collection(firestore, 'registrations'),
      where('playerId', '==', identities.a.uid),
    )));
    assert.equal(snapshot.size, 1);
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
    return createLeagueRegistration.run({
      auth: { uid: identities.a.uid, token: { email: identities.a.email } },
      data: {
        registrationOfferingId: OFFERING_ID,
        competitionRulesVersionAccepted: 'competition-rules-2026-08-29-v1',
        refundPolicyVersionAccepted: 'refund-policy-2026-08-29-v1',
        acquisitionSource: 'facebook',
        acquisitionSourceOther: null,
        ...overrides,
      },
    });
  }

  await t.test('P1 exact current versions create a pending Registration', async () => {
    await prepareClientCreation();
    await createAsClient();
    const current = await state('a');
    assert.equal(current.registration.status, 'pending_payment');
    assert.equal(current.registration.leagueId, null);
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

  await t.test('P6-P7 pending acquisition updates work but client League updates are denied', async () => {
    await seedFixture({ registrations: [{ label: 'a' }] });
    await assert.rejects(updateLeagueAsClient('a', LEAGUE_2_ID));
    await updateAcquisitionAsClient('a', {
      acquisitionSource: 'other', acquisitionSourceOther: 'Community event',
    });
    const registration = (await state('a')).registration;
    assert.equal(registration.leagueId, null);
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
    assert.equal((await state('a')).registration.leagueId, null);
  });

  await t.test('P16 cross-offering League creation is rejected', async () => {
    await prepareClientCreation();
    await seedOtherOfferingLeague();
    await assert.rejects(createAsClient({ leagueId: OTHER_LEAGUE_ID }));
  });

  await t.test('P17 creation is independent of internal League status', async () => {
    await prepareClientCreation({ league1: { status: 'closed' } });
    await createAsClient();
    assert.equal((await state('a')).registration.leagueId, null);
  });

  await t.test('P18 creation after the registration window closes is rejected', async () => {
    await prepareClientCreation({
      offering: { registrationClosesAt: Timestamp.fromMillis(Date.now() - 1_000) },
    });
    await assert.rejects(createAsClient());
  });
});

test('Backend-authoritative Checkout resume RES1-RES15 and expiration EXP1-EXP7', async (t) => {
  await t.test('RES1 EXP1 EXP2 creates one 30-minute authoritative attempt', async () => {
    await seedFixture({ registrations: [{ label: 'a' }] });
    const stripe = new FakeStripe();
    setStripeForEmulatorTests(stripe);
    const beforeSeconds = Math.floor(Date.now() / 1000);
    const issued = await checkout('a', REQUEST_IDS[0]);
    const afterSeconds = Math.floor(Date.now() / 1000);
    const current = await state('a');
    const session = stripe.sessions.get(current.payments[0].providerCheckoutSessionId);

    assert.equal(current.payments.length, 1);
    assert.equal(current.holds.length, 1);
    assert.equal(current.lock.exists, true);
    assert.equal(current.lock.data().paymentId, issued.paymentId);
    assert.equal(current.league.activeHoldCount, 1);
    assert.equal(stripe.createCount, 1);
    assert.equal(stripe.createParameters[0].expires_at, session.expires_at);
    assert.ok(session.expires_at >= beforeSeconds + 1800);
    assert.ok(session.expires_at <= afterSeconds + 1800);
    assert.equal(current.holds[0].expiresAt.toMillis(), session.expires_at * 1000);
  });

  await t.test('RES2 EXP3 same UUID returns the same Session without extending expiry', async () => {
    await seedFixture({ registrations: [{ label: 'a' }] });
    const stripe = new FakeStripe();
    setStripeForEmulatorTests(stripe);
    const first = await checkout('a', REQUEST_IDS[0]);
    const originalSession = stripe.sessions.get('cs_test_1');
    const originalExpiry = originalSession.expires_at;
    const retry = await checkout('a', REQUEST_IDS[0]);
    const current = await state('a');

    assert.deepEqual(retry, first);
    assert.equal(stripe.createCount, 1);
    assert.equal(originalSession.expires_at, originalExpiry);
    assert.equal(current.payments.length, 1);
    assert.equal(current.holds.length, 1);
    assert.equal(current.league.activeHoldCount, 1);
  });

  await t.test('RES3 RES4 EXP4 fresh UUID resumes the locked Session without duplicate state', async () => {
    await seedFixture({ registrations: [{ label: 'a' }] });
    const stripe = new FakeStripe();
    setStripeForEmulatorTests(stripe);
    const first = await checkout('a', REQUEST_IDS[0]);
    const originalExpiry = stripe.sessions.get('cs_test_1').expires_at;
    const resumed = await checkout('a', REQUEST_IDS[1]);
    const current = await state('a');
    const paymentBId = getPaymentId(identities.a.uid, registrationId('a'), REQUEST_IDS[1]);

    assert.deepEqual(resumed, first);
    assert.equal(stripe.createCount, 1);
    assert.equal(stripe.sessions.get('cs_test_1').expires_at, originalExpiry);
    assert.equal(current.payments.some(({ id }) => id === paymentBId), false);
    assert.equal(current.holds.some(({ id }) => id === paymentBId), false);
    assert.equal(current.payments.length, 1);
    assert.equal(current.holds.length, 1);
    assert.equal(current.lock.data().paymentId, first.paymentId);
    assert.equal(current.league.activeHoldCount, 1);
  });

  await t.test('RES5 another player cannot resume the locked Session', async () => {
    await seedFixture({ registrations: [{ label: 'a' }, { label: 'b' }] });
    const stripe = new FakeStripe();
    setStripeForEmulatorTests(stripe);
    await checkout('a', REQUEST_IDS[0]);
    await assert.rejects(createRegistrationCheckout.run({
      auth: { uid: identities.b.uid, token: { email: identities.b.email } },
      data: { registrationId: registrationId('a'), checkoutRequestId: REQUEST_IDS[1] },
    }), (error) => error?.code === 'permission-denied');
    assert.equal(stripe.createCount, 1);
    assert.equal((await state('a')).league.activeHoldCount, 1);
  });

  for (const [name, field, value] of [
    ['RES6 stale Competition policy', 'competitionRulesVersionAccepted', 'legacy-competition-v0'],
    ['RES7 stale Refund policy', 'refundPolicyVersionAccepted', 'legacy-refund-v0'],
  ]) {
    await t.test(`${name} cannot resume`, async () => {
      await seedFixture({ registrations: [{ label: 'a' }] });
      const stripe = new FakeStripe();
      setStripeForEmulatorTests(stripe);
      await checkout('a', REQUEST_IDS[0]);
      await db.collection('registrations').doc(registrationId('a')).update({ [field]: value });
      await assert.rejects(checkout('a', REQUEST_IDS[1]));
      const current = await state('a');
      assert.equal(stripe.createCount, 1);
      assert.equal(current.payments.length, 1);
      assert.equal(current.holds[0].status, 'active');
      assert.equal(current.lock.exists, true);
      assert.equal(current.league.activeHoldCount, 1);
    });
  }

  await t.test('RES8 confirmed Registration cannot resume', async () => {
    await seedFixture({ registrations: [{ label: 'a' }] });
    const stripe = new FakeStripe();
    setStripeForEmulatorTests(stripe);
    await checkout('a', REQUEST_IDS[0]);
    await db.collection('registrations').doc(registrationId('a')).update({ status: 'confirmed' });
    await assert.rejects(checkout('a', REQUEST_IDS[1]));
    assert.equal(stripe.createCount, 1);
  });

  await t.test('RES9 lock with missing Payment fails closed', async () => {
    await seedFixture({ registrations: [{ label: 'a' }] });
    const stripe = new FakeStripe();
    setStripeForEmulatorTests(stripe);
    await db.collection('registrationCheckoutLocks').doc(registrationId('a')).set({
      registrationId: registrationId('a'), paymentId: 'missing-payment', updatedAt: Timestamp.now(),
    });
    await assert.rejects(checkout('a', REQUEST_IDS[0]));
    const current = await state('a');
    assert.equal(stripe.createCount, 0);
    assert.equal(current.payments.length, 0);
    assert.equal(current.holds.length, 0);
    assert.equal(current.league.activeHoldCount, 0);
  });

  for (const [name, mutation] of [
    ['RES10 mismatched Payment/SeatHold relationship', { registrationOfferingId: 'wrong-offering' }],
    ['RES11 inactive SeatHold', { status: 'released' }],
  ]) {
    await t.test(`${name} fails closed`, async () => {
      await seedFixture({ registrations: [{ label: 'a' }] });
      const stripe = new FakeStripe();
      setStripeForEmulatorTests(stripe);
      const issued = await checkout('a', REQUEST_IDS[0]);
      await db.collection('seatHolds').doc(issued.paymentId).update(mutation);
      await assert.rejects(checkout('a', REQUEST_IDS[1]));
      const current = await state('a');
      assert.equal(stripe.createCount, 1);
      assert.equal(current.payments.length, 1);
      assert.equal(current.holds.length, 1);
      assert.equal(current.league.activeHoldCount, 1);
    });
  }

  await t.test('RES12 expired provider Session returns no URL and EXP5 releases exactly once', async () => {
    await seedFixture({ registrations: [{ label: 'a' }] });
    const stripe = new FakeStripe();
    setStripeForEmulatorTests(stripe);
    const { payment } = await activate('a', REQUEST_IDS[0]);
    const session = stripe.sessions.get(payment.providerCheckoutSessionId);
    session.status = 'expired';
    session.url = null;
    await assert.rejects(checkout('a', REQUEST_IDS[1]));
    await expireCheckout(stripeEvent('evt_res12_expired', 'checkout.session.expired'), session);
    await expireCheckout(stripeEvent('evt_res12_expired', 'checkout.session.expired'), session);
    const current = await state('a');
    assert.equal(stripe.createCount, 1);
    assert.equal(current.payments[0].status, 'expired');
    assert.equal(current.holds[0].status, 'expired');
    assert.equal(current.lock.exists, false);
    assert.equal(current.league.activeHoldCount, 0);
  });

  await t.test('RES13 indeterminate provider lookup preserves the authoritative attempt', async () => {
    await seedFixture({ registrations: [{ label: 'a' }] });
    const stripe = new FakeStripe();
    setStripeForEmulatorTests(stripe);
    const issued = await checkout('a', REQUEST_IDS[0]);
    stripe.retrievalError = Object.assign(new Error('provider unavailable'), {
      type: 'StripeConnectionError',
    });
    await assert.rejects(checkout('a', REQUEST_IDS[1]));
    const current = await state('a');
    assert.equal(stripe.createCount, 1);
    assert.equal(current.lock.data().paymentId, issued.paymentId);
    assert.equal(current.payments[0].status, 'pending');
    assert.equal(current.holds[0].status, 'active');
    assert.equal(current.league.activeHoldCount, 1);
  });

  await t.test('RES14 lock change before return prevents stale URL return', async () => {
    await seedFixture({ registrations: [{ label: 'a' }] });
    const stripe = new FakeStripe();
    setStripeForEmulatorTests(stripe);
    await checkout('a', REQUEST_IDS[0]);
    setCheckoutTestHookForEmulatorTests(async (stage) => {
      if (stage === 'before-locked-checkout-return') {
        await db.collection('registrationCheckoutLocks').doc(registrationId('a')).delete();
      }
    });
    try {
      await assert.rejects(checkout('a', REQUEST_IDS[1]));
    } finally {
      setCheckoutTestHookForEmulatorTests(null);
    }
    assert.equal(stripe.createCount, 1);
  });

  await t.test('RES15 EXP7 released expiration permits a fresh 30-minute attempt', async () => {
    await seedFixture({ registrations: [{ label: 'a' }] });
    const stripe = new FakeStripe();
    setStripeForEmulatorTests(stripe);
    const { payment } = await activate('a', REQUEST_IDS[0]);
    const firstSession = stripe.sessions.get(payment.providerCheckoutSessionId);
    firstSession.status = 'expired';
    firstSession.url = null;
    await expireCheckout(stripeEvent('evt_res15_expired', 'checkout.session.expired'), firstSession);
    const beforeSeconds = Math.floor(Date.now() / 1000);
    const fresh = await checkout('a', REQUEST_IDS[1]);
    const current = await state('a');
    const freshSession = stripe.sessions.get(current.payments.find(({ id }) => id === fresh.paymentId).providerCheckoutSessionId);
    assert.equal(stripe.createCount, 2);
    assert.ok(freshSession.expires_at >= beforeSeconds + 1800);
    assert.equal(current.holds.find(({ id }) => id === fresh.paymentId).expiresAt.toMillis(), freshSession.expires_at * 1000);
    assert.equal(current.league.activeHoldCount, 1);
  });

  await t.test('EXP6 reconciliation expiration remains covered by the reconciliation emulator suite', () => {
    assert.ok(true);
  });
});

test('SeatHold emulator lifecycle A-L', async (t) => {
  await t.test('A. final-seat concurrency spills atomically into League 2', async () => {
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
    assert.equal(results.filter(({ status }) => status === 'fulfilled').length, 2);
    assert.equal(stripe.createCount, 2);
    const [league1, league2, holds] = await Promise.all([
      db.collection('leagues').doc(LEAGUE_1_ID).get(),
      db.collection('leagues').doc(LEAGUE_2_ID).get(),
      documents('seatHolds'),
    ]);
    assert.deepEqual(
      [league1.data().activeHoldCount, league2.data().activeHoldCount],
      [1, 1],
    );
    assert.deepEqual(new Set(holds.map(({ leagueId }) => leagueId)), new Set([
      LEAGUE_1_ID,
      LEAGUE_2_ID,
    ]));
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
    assert.equal(current.registration.registrationOrder, 1);
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
    const second = await checkout('b', REQUEST_IDS[1]);
    const secondHold = (await db.collection('seatHolds').doc(second.paymentId).get()).data();
    assert.equal(secondHold.leagueId, LEAGUE_2_ID);
    assert.equal(stripe.createCount, 2);
  });

  await t.test('L. two initial Leagues still prefer the earliest available League', async () => {
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
      [4, 0, 7],
    );
    assert.deepEqual(
      [league2.data().confirmedCount, league2.data().activeHoldCount, league2.data().lastAssignedRegistrationOrder],
      [5, 0, 5],
    );
    const [roster1, roster2] = await Promise.all([
      db.collection('leagues').doc(LEAGUE_1_ID).collection('publicRoster').get(),
      db.collection('leagues').doc(LEAGUE_2_ID).collection('publicRoster').get(),
    ]);
    assert.equal(roster1.size, 2);
    assert.equal(roster2.size, 0);
    assert.deepEqual(
      roster1.docs.map((doc) => doc.data().registrationOrder).sort((a, b) => a - b),
      [6, 7],
    );
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

test('Automatic League assignment AL1-AL16 and successors S17-S24/S26', async (t) => {
  await t.test('AL1 new client Registration stores leagueId null', async () => {
    await seedFixture({ registrations: [{ label: 'a' }] });
    await db.collection('registrations').doc(registrationId('a')).delete();
    await createLeagueRegistration.run({
      auth: { uid: identities.a.uid, token: { email: identities.a.email } },
      data: {
        registrationOfferingId: OFFERING_ID,
        competitionRulesVersionAccepted: 'competition-rules-2026-08-29-v1',
        refundPolicyVersionAccepted: 'refund-policy-2026-08-29-v1',
        acquisitionSource: 'facebook',
        acquisitionSourceOther: null,
      },
    });
    assert.equal((await state('a')).registration.leagueId, null);
  });

  await t.test('AL2 client cannot create a Registration with arbitrary leagueId', async () => {
    await seedFixture({ registrations: [{ label: 'a' }] });
    await db.collection('registrations').doc(registrationId('a')).delete();
    await assert.rejects(withClient('a', (firestore) => setDoc(
      doc(firestore, 'registrations', registrationId('a')),
      clientRegistrationData('a', undefined, { leagueId: LEAGUE_2_ID }),
    )));
    assert.equal((await db.collection('registrations').doc(registrationId('a')).get()).exists, false);
  });

  await t.test('AL3 client cannot mutate leagueId after creation', async () => {
    await seedFixture({ registrations: [{ label: 'a' }] });
    await assert.rejects(updateLeagueAsClient('a', LEAGUE_2_ID));
    assert.equal((await state('a')).registration.leagueId, null);
  });

  await t.test('AL4 S26 League 1 at 12/16 remains the earliest assignment target', async () => {
    await seedFixture({
      league1: { confirmedCount: 12, lastAssignedRegistrationOrder: 12 },
      registrations: [{ label: 'a' }],
    });
    const stripe = new FakeStripe();
    setStripeForEmulatorTests(stripe);
    const issued = await checkout('a');
    const current = await state('a');
    assert.equal(current.registration.leagueId, LEAGUE_1_ID);
    assert.equal(current.holds.find(({ id }) => id === issued.paymentId).leagueId, LEAGUE_1_ID);
    assert.deepEqual(
      [(await db.collection('leagues').doc(LEAGUE_1_ID).get()).data().activeHoldCount,
        (await db.collection('leagues').doc(LEAGUE_2_ID).get()).data().activeHoldCount],
      [1, 0],
    );
  });

  await t.test('AL5 effective 16/16 League 1 assigns League 2', async () => {
    await seedFixture({
      league1: { confirmedCount: 15, activeHoldCount: 1, lastAssignedRegistrationOrder: 15 },
      registrations: [{ label: 'a' }],
    });
    const stripe = new FakeStripe();
    setStripeForEmulatorTests(stripe);
    const issued = await checkout('a');
    const hold = (await db.collection('seatHolds').doc(issued.paymentId).get()).data();
    assert.equal(hold.leagueId, LEAGUE_2_ID);
    assert.equal((await state('a')).registration.leagueId, LEAGUE_2_ID);
  });

  for (const [status, counters] of [
    ['full', { confirmedCount: 16, lastAssignedRegistrationOrder: 16 }],
    ['closed', {}],
  ]) {
    await t.test(`AL6 ${status} lower-number League is skipped`, async () => {
      await seedFixture({
        league1: { status, ...counters },
        registrations: [{ label: 'a' }],
      });
      const stripe = new FakeStripe();
      setStripeForEmulatorTests(stripe);
      const issued = await checkout('a');
      assert.equal(
        (await db.collection('seatHolds').doc(issued.paymentId).get()).data().leagueId,
        LEAGUE_2_ID,
      );
    });
  }

  await t.test('AL7 concurrent final-seat attempts split across League 1 and League 2', async () => {
    await seedFixture({
      league1: { confirmedCount: 15, lastAssignedRegistrationOrder: 15 },
      registrations: [{ label: 'a' }, { label: 'b' }],
    });
    const stripe = new FakeStripe();
    setStripeForEmulatorTests(stripe);
    const attempts = await Promise.all([
      checkout('a', REQUEST_IDS[0]),
      checkout('b', REQUEST_IDS[1]),
    ]);
    const holds = await Promise.all(attempts.map(({ paymentId }) => (
      db.collection('seatHolds').doc(paymentId).get()
    )));
    assert.deepEqual(
      new Set(holds.map((snapshot) => snapshot.data().leagueId)),
      new Set([LEAGUE_1_ID, LEAGUE_2_ID]),
    );
    assert.deepEqual(
      [(await db.collection('leagues').doc(LEAGUE_1_ID).get()).data().activeHoldCount,
        (await db.collection('leagues').doc(LEAGUE_2_ID).get()).data().activeHoldCount],
      [1, 1],
    );
  });

  await t.test('AL8 higher concurrency never exceeds effective capacity', async () => {
    await seedFixture({
      league1: { confirmedCount: 15, lastAssignedRegistrationOrder: 15 },
      registrations: [{ label: 'a' }, { label: 'b' }, { label: 'c' }],
    });
    const stripe = new FakeStripe();
    setStripeForEmulatorTests(stripe);
    await Promise.all([
      checkout('a', REQUEST_IDS[0]),
      checkout('b', REQUEST_IDS[1]),
      checkout('c', REQUEST_IDS[2]),
    ]);
    for (const leagueId of [LEAGUE_1_ID, LEAGUE_2_ID]) {
      const league = (await db.collection('leagues').doc(leagueId).get()).data();
      assert.ok(league.confirmedCount + league.activeHoldCount <= league.capacity);
    }
  });

  await t.test('AL9 no availability produces no partial lifecycle or counter writes', async () => {
    await seedFixture({
      league1: {
        status: 'full', confirmedCount: 16, lastAssignedRegistrationOrder: 16,
      },
      league2: {
        status: 'full', confirmedCount: 16, lastAssignedRegistrationOrder: 16,
      },
      registrations: [{ label: 'a' }],
    });
    const stripe = new FakeStripe();
    setStripeForEmulatorTests(stripe);
    await assert.rejects(checkout('a'));
    const current = await state('a');
    assert.equal(current.registration.leagueId, null);
    assert.equal(current.holds.length, 0);
    assert.equal(current.payments.length, 0);
    assert.equal(current.lock.exists, false);
    assert.equal(stripe.createCount, 0);
    assert.deepEqual(
      [(await db.collection('leagues').doc(LEAGUE_1_ID).get()).data().activeHoldCount,
        (await db.collection('leagues').doc(LEAGUE_2_ID).get()).data().activeHoldCount],
      [0, 0],
    );
  });

  await t.test('AL10 assignment is isolated to the trusted RegistrationOffering', async () => {
    await seedFixture({
      league1: {
        status: 'full', confirmedCount: 16, lastAssignedRegistrationOrder: 16,
      },
      league2: {
        status: 'full', confirmedCount: 16, lastAssignedRegistrationOrder: 16,
      },
      registrations: [{ label: 'a' }],
    });
    await seedOtherOfferingLeague({ confirmedCount: 2, lastAssignedRegistrationOrder: 2 });
    const before = (await db.collection('leagues').doc(OTHER_LEAGUE_ID).get()).data();
    const stripe = new FakeStripe();
    setStripeForEmulatorTests(stripe);
    await assert.rejects(checkout('a'));
    assert.deepEqual((await db.collection('leagues').doc(OTHER_LEAGUE_ID).get()).data(), before);
    assert.equal((await state('a')).registration.leagueId, null);
  });

  await t.test('AL11 same UUID retry preserves assignment and increments once', async () => {
    await seedFixture({ registrations: [{ label: 'a' }] });
    const stripe = new FakeStripe();
    setStripeForEmulatorTests(stripe);
    const first = await checkout('a', REQUEST_IDS[0]);
    const retry = await checkout('a', REQUEST_IDS[0]);
    assert.deepEqual(retry, first);
    const current = await state('a');
    assert.equal(current.registration.leagueId, LEAGUE_1_ID);
    assert.equal(current.holds.length, 1);
    assert.equal(current.league.activeHoldCount, 1);
  });

  await t.test('AL12 new UUID active-lock resume preserves assignment', async () => {
    await seedFixture({ registrations: [{ label: 'a' }] });
    const stripe = new FakeStripe();
    setStripeForEmulatorTests(stripe);
    const first = await checkout('a', REQUEST_IDS[0]);
    await db.collection('leagues').doc(LEAGUE_1_ID).update({
      status: 'closed',
      updatedAt: Timestamp.now(),
    });
    const resumed = await checkout('a', REQUEST_IDS[1]);
    assert.deepEqual(resumed, first);
    const current = await state('a');
    assert.equal(current.registration.leagueId, LEAGUE_1_ID);
    assert.equal(current.holds[0].leagueId, LEAGUE_1_ID);
    assert.equal(current.league.activeHoldCount, 1);
  });

  await t.test('AL13 AL14 expired attempt can reassign while history stays on its original League', async () => {
    await seedFixture({ registrations: [{ label: 'a' }] });
    const stripe = new FakeStripe();
    setStripeForEmulatorTests(stripe);
    const first = await activate('a', REQUEST_IDS[0]);
    await expireCheckout(
      stripeEvent('evt_assignment_expired', 'checkout.session.expired'),
      stripe.sessions.get(first.payment.providerCheckoutSessionId),
    );
    await db.collection('leagues').doc(LEAGUE_1_ID).update({
      status: 'full',
      confirmedCount: 16,
      lastAssignedRegistrationOrder: 16,
      updatedAt: Timestamp.now(),
    });
    const second = await activate('a', REQUEST_IDS[1]);
    const current = await state('a', LEAGUE_2_ID);
    const historicalHold = current.holds.find(({ id }) => id === first.result.paymentId);
    const historicalPayment = current.payments.find(({ id }) => id === first.result.paymentId);
    assert.equal(current.registration.leagueId, LEAGUE_2_ID);
    assert.equal(current.holds.find(({ id }) => id === second.result.paymentId).leagueId, LEAGUE_2_ID);
    assert.equal(historicalHold.leagueId, LEAGUE_1_ID);
    assert.equal(historicalHold.status, 'expired');
    assert.equal(historicalPayment.status, 'expired');
  });

  await t.test('AL15 confirmed Registration cannot be moved or checked out again', async () => {
    await seedFixture({ registrations: [{ label: 'a' }] });
    const stripe = new FakeStripe();
    setStripeForEmulatorTests(stripe);
    const { payment } = await activate('a');
    await fulfillSuccessfulCheckout(
      stripeEvent('evt_assignment_confirmed', 'checkout.session.completed'),
      paidSession(stripe, payment.providerCheckoutSessionId),
    );
    await assert.rejects(updateLeagueAsClient('a', LEAGUE_2_ID));
    await assert.rejects(checkout('a', REQUEST_IDS[1]));
    assert.equal((await state('a')).registration.leagueId, LEAGUE_1_ID);
  });

  await t.test('AL16 active checkout Registration cannot be moved', async () => {
    await seedFixture({ registrations: [{ label: 'a', leagueId: LEAGUE_2_ID }] });
    const stripe = new FakeStripe();
    setStripeForEmulatorTests(stripe);
    const issued = await checkout('a');
    await assert.rejects(updateLeagueAsClient('a', LEAGUE_2_ID));
    const current = await state('a');
    assert.equal(current.registration.leagueId, LEAGUE_1_ID);
    assert.equal(current.holds.find(({ id }) => id === issued.paymentId).leagueId, LEAGUE_1_ID);
  });

  await t.test('S17 11 to 12 confirmed creates an exact open League 2', async () => {
    await seedFixture({
      league1: { confirmedCount: 11, lastAssignedRegistrationOrder: 11 },
      registrations: [{ label: 'a' }],
    });
    await db.collection('leagues').doc(LEAGUE_2_ID).delete();
    const stripe = new FakeStripe();
    setStripeForEmulatorTests(stripe);
    const { payment } = await activate('a');
    await fulfillSuccessfulCheckout(
      stripeEvent('evt_successor_17', 'checkout.session.completed'),
      paidSession(stripe, payment.providerCheckoutSessionId),
    );
    const successor = (await db.collection('leagues').doc(LEAGUE_2_ID).get()).data();
    assert.deepEqual(
      Object.fromEntries(Object.entries(successor).filter(([key]) => !['createdAt', 'updatedAt'].includes(key))),
      {
        registrationOfferingId: OFFERING_ID,
        leagueNumber: 2,
        capacity: 16,
        status: 'open',
        confirmedCount: 0,
        activeHoldCount: 0,
        lastAssignedRegistrationOrder: 0,
      },
    );
    assert.ok(successor.createdAt instanceof Timestamp);
    assert.ok(successor.updatedAt instanceof Timestamp);
  });

  await t.test('S18 below 12 confirmed does not create a successor', async () => {
    await seedFixture({
      league1: { confirmedCount: 10, lastAssignedRegistrationOrder: 10 },
      registrations: [{ label: 'a' }],
    });
    await db.collection('leagues').doc(LEAGUE_2_ID).delete();
    const stripe = new FakeStripe();
    setStripeForEmulatorTests(stripe);
    const { payment } = await activate('a');
    await fulfillSuccessfulCheckout(
      stripeEvent('evt_successor_18', 'checkout.session.completed'),
      paidSession(stripe, payment.providerCheckoutSessionId),
    );
    assert.equal((await db.collection('leagues').doc(LEAGUE_2_ID).get()).exists, false);
  });

  await t.test('S19 S21 an existing successor is validated and preserved without reopening', async () => {
    await seedFixture({
      league1: { confirmedCount: 11, lastAssignedRegistrationOrder: 11 },
      league2: {
        status: 'closed',
        confirmedCount: 3,
        activeHoldCount: 2,
        lastAssignedRegistrationOrder: 5,
      },
      registrations: [{ label: 'a' }],
    });
    const before = (await db.collection('leagues').doc(LEAGUE_2_ID).get()).data();
    const stripe = new FakeStripe();
    setStripeForEmulatorTests(stripe);
    const { payment } = await activate('a');
    await fulfillSuccessfulCheckout(
      stripeEvent('evt_successor_19', 'checkout.session.completed'),
      paidSession(stripe, payment.providerCheckoutSessionId),
    );
    assert.deepEqual((await db.collection('leagues').doc(LEAGUE_2_ID).get()).data(), before);
  });

  await t.test('S19b conflicting deterministic successor data fails closed', async () => {
    await seedFixture({
      league1: { confirmedCount: 11, lastAssignedRegistrationOrder: 11 },
      league2: { capacity: 15 },
      registrations: [{ label: 'a' }],
    });
    const successorBefore = (await db.collection('leagues').doc(LEAGUE_2_ID).get()).data();
    const stripe = new FakeStripe();
    setStripeForEmulatorTests(stripe);
    const { payment } = await activate('a');
    await assert.rejects(fulfillSuccessfulCheckout(
      stripeEvent('evt_successor_19b', 'checkout.session.completed'),
      paidSession(stripe, payment.providerCheckoutSessionId),
    ));
    const current = await state('a');
    assert.deepEqual(
      [current.league.confirmedCount, current.league.activeHoldCount],
      [11, 1],
    );
    assert.equal(current.registration.status, 'pending_payment');
    assert.equal(current.payments[0].status, 'pending');
    assert.equal(current.holds[0].status, 'active');
    assert.deepEqual((await db.collection('leagues').doc(LEAGUE_2_ID).get()).data(), successorBefore);
  });

  await t.test('S20 concurrent threshold fulfillment creates exactly one League 2', async () => {
    await seedFixture({
      league1: { confirmedCount: 10, lastAssignedRegistrationOrder: 10 },
      registrations: [{ label: 'a' }, { label: 'b' }],
    });
    await db.collection('leagues').doc(LEAGUE_2_ID).delete();
    const stripe = new FakeStripe();
    setStripeForEmulatorTests(stripe);
    const [first, second] = await Promise.all([
      activate('a', REQUEST_IDS[0]),
      activate('b', REQUEST_IDS[1]),
    ]);
    await Promise.all([
      fulfillSuccessfulCheckout(
        stripeEvent('evt_successor_20a', 'checkout.session.completed'),
        paidSession(stripe, first.payment.providerCheckoutSessionId),
      ),
      fulfillSuccessfulCheckout(
        stripeEvent('evt_successor_20b', 'checkout.session.completed'),
        paidSession(stripe, second.payment.providerCheckoutSessionId),
      ),
    ]);
    const successors = await db.collection('leagues')
      .where('registrationOfferingId', '==', OFFERING_ID)
      .get();
    assert.equal(successors.docs.filter(({ id }) => id === LEAGUE_2_ID).length, 1);
    assert.equal((await db.collection('leagues').doc(LEAGUE_1_ID).get()).data().confirmedCount, 12);
  });

  await t.test('S22 League 2 reaching 12 creates League 3', async () => {
    const league3Id = `${OFFERING_ID}__league-3`;
    await seedFixture({
      league1: {
        status: 'full', confirmedCount: 16, lastAssignedRegistrationOrder: 16,
      },
      league2: { confirmedCount: 11, lastAssignedRegistrationOrder: 11 },
      registrations: [{ label: 'a' }],
    });
    const stripe = new FakeStripe();
    setStripeForEmulatorTests(stripe);
    const { payment } = await activate('a');
    await fulfillSuccessfulCheckout(
      stripeEvent('evt_successor_22', 'checkout.session.completed'),
      paidSession(stripe, payment.providerCheckoutSessionId),
    );
    const league3 = (await db.collection('leagues').doc(league3Id).get()).data();
    assert.equal(league3.registrationOfferingId, OFFERING_ID);
    assert.equal(league3.leagueNumber, 3);
    assert.equal(league3.status, 'open');
    assert.equal(league3.capacity, 16);
  });

  await t.test('S23 successor creation never crosses RegistrationOfferings', async () => {
    await seedFixture({
      league1: { confirmedCount: 11, lastAssignedRegistrationOrder: 11 },
      registrations: [{ label: 'a' }],
    });
    await db.collection('leagues').doc(LEAGUE_2_ID).delete();
    await seedOtherOfferingLeague({ confirmedCount: 11, lastAssignedRegistrationOrder: 11 });
    const otherSuccessorId = `${OTHER_OFFERING_ID}__league-2`;
    const stripe = new FakeStripe();
    setStripeForEmulatorTests(stripe);
    const { payment } = await activate('a');
    await fulfillSuccessfulCheckout(
      stripeEvent('evt_successor_23', 'checkout.session.completed'),
      paidSession(stripe, payment.providerCheckoutSessionId),
    );
    assert.equal((await db.collection('leagues').doc(LEAGUE_2_ID).get()).exists, true);
    assert.equal((await db.collection('leagues').doc(otherSuccessorId).get()).exists, false);
  });

  await t.test('S24 webhook replays never duplicate or reset the successor', async () => {
    await seedFixture({
      league1: { confirmedCount: 11, lastAssignedRegistrationOrder: 11 },
      registrations: [{ label: 'a' }],
    });
    await db.collection('leagues').doc(LEAGUE_2_ID).delete();
    const stripe = new FakeStripe();
    setStripeForEmulatorTests(stripe);
    const { payment } = await activate('a');
    const paid = paidSession(stripe, payment.providerCheckoutSessionId);
    await fulfillSuccessfulCheckout(
      stripeEvent('evt_successor_24', 'checkout.session.completed'),
      paid,
    );
    await db.collection('leagues').doc(LEAGUE_2_ID).update({
      status: 'closed',
      confirmedCount: 2,
      activeHoldCount: 1,
      lastAssignedRegistrationOrder: 3,
      updatedAt: Timestamp.now(),
    });
    const before = (await db.collection('leagues').doc(LEAGUE_2_ID).get()).data();
    await fulfillSuccessfulCheckout(
      stripeEvent('evt_successor_24', 'checkout.session.completed'),
      paid,
    );
    await fulfillSuccessfulCheckout(
      stripeEvent('evt_successor_24_replay', 'checkout.session.completed'),
      paid,
    );
    assert.deepEqual((await db.collection('leagues').doc(LEAGUE_2_ID).get()).data(), before);
  });
});


test('Payment promo attribution T1-T10', async (t) => {
  await t.test('T1 T2 T4 T5 validated normalized attribution is atomic and price-independent', async () => {
    await seedFixture({ registrations: [{ label: 'a' }] });
    await seedPromo('NIGHTFLIGHT', 'promoter-nightflight');
    const stripe = new FakeStripe();
    setStripeForEmulatorTests(stripe);

    const result = await checkout('a', REQUEST_IDS[0], ' nightflight ');
    const current = await state('a');
    const payment = current.payments.find(({ id }) => id === result.paymentId);
    const parameters = stripe.createParameters[0];
    const offering = (await db.collection('registrationOfferings').doc(OFFERING_ID).get()).data();

    assert.deepEqual(
      [payment.promoCodeSnapshot, payment.promoterIdSnapshot],
      ['NIGHTFLIGHT', 'promoter-nightflight'],
    );
    assert.deepEqual(
      [current.registration.promoCodeSnapshot, current.registration.promoterIdSnapshot],
      [payment.promoCodeSnapshot, payment.promoterIdSnapshot],
    );
    assert.equal(offering.entryFeeCents, 500);
    assert.equal(payment.amountCents, 500);
    assert.equal(parameters.line_items[0].price_data.unit_amount, 500);
    assert.equal('discounts' in parameters, false);
  });

  await t.test('T3 no-promo Payment contains explicit null attribution', async () => {
    await seedFixture({ registrations: [{ label: 'a' }] });
    const stripe = new FakeStripe();
    setStripeForEmulatorTests(stripe);

    const { payment } = await activate('a');

    assert.deepEqual(
      [payment.promoCodeSnapshot, payment.promoterIdSnapshot],
      [null, null],
    );
  });

  await t.test('T6 same-attempt retry cannot replace Payment attribution', async () => {
    await seedFixture({ registrations: [{ label: 'a' }] });
    await seedPromo('NIGHTFLIGHT', 'promoter-nightflight');
    await seedPromo('DAYBREAK', 'promoter-daybreak');
    const stripe = new FakeStripe();
    setStripeForEmulatorTests(stripe);

    const first = await checkout('a', REQUEST_IDS[0], 'NIGHTFLIGHT');
    const retry = await checkout('a', REQUEST_IDS[0], 'DAYBREAK');
    const current = await state('a');

    assert.deepEqual(retry, first);
    assert.equal(stripe.createCount, 1);
    assert.equal(current.payments.length, 1);
    assert.deepEqual(
      [current.payments[0].promoCodeSnapshot, current.payments[0].promoterIdSnapshot],
      ['NIGHTFLIGHT', 'promoter-nightflight'],
    );
  });

  await t.test('T7 new-UUID lock resume cannot replace Payment attribution', async () => {
    await seedFixture({ registrations: [{ label: 'a' }] });
    await seedPromo('NIGHTFLIGHT', 'promoter-nightflight');
    await seedPromo('DAYBREAK', 'promoter-daybreak');
    const stripe = new FakeStripe();
    setStripeForEmulatorTests(stripe);

    const first = await checkout('a', REQUEST_IDS[0], 'NIGHTFLIGHT');
    const resumed = await checkout('a', REQUEST_IDS[1], 'DAYBREAK');
    const current = await state('a');
    const replacementPaymentId = getPaymentId(
      identities.a.uid,
      registrationId('a'),
      REQUEST_IDS[1],
    );

    assert.deepEqual(resumed, first);
    assert.equal(stripe.createCount, 1);
    assert.equal(current.payments.some(({ id }) => id === replacementPaymentId), false);
    assert.deepEqual(
      [current.payments[0].promoCodeSnapshot, current.payments[0].promoterIdSnapshot],
      ['NIGHTFLIGHT', 'promoter-nightflight'],
    );
  });

  await t.test('T8 webhook success preserves Payment attribution', async () => {
    await seedFixture({ registrations: [{ label: 'a' }] });
    await seedPromo('NIGHTFLIGHT', 'promoter-nightflight');
    const stripe = new FakeStripe();
    setStripeForEmulatorTests(stripe);

    const result = await checkout('a', REQUEST_IDS[0], 'NIGHTFLIGHT');
    const payment = (await db.collection('payments').doc(result.paymentId).get()).data();
    await fulfillSuccessfulCheckout(
      stripeEvent('evt_payment_promo_success', 'checkout.session.completed'),
      paidSession(stripe, payment.providerCheckoutSessionId),
    );
    const succeeded = (await db.collection('payments').doc(result.paymentId).get()).data();

    assert.equal(succeeded.status, 'succeeded');
    assert.deepEqual(
      [succeeded.promoCodeSnapshot, succeeded.promoterIdSnapshot],
      ['NIGHTFLIGHT', 'promoter-nightflight'],
    );
  });

  await t.test('T9 expiration preserves unsuccessful Payment attribution', async () => {
    await seedFixture({ registrations: [{ label: 'a' }] });
    await seedPromo('NIGHTFLIGHT', 'promoter-nightflight');
    const stripe = new FakeStripe();
    setStripeForEmulatorTests(stripe);

    const result = await checkout('a', REQUEST_IDS[0], 'NIGHTFLIGHT');
    const payment = (await db.collection('payments').doc(result.paymentId).get()).data();
    const session = stripe.sessions.get(payment.providerCheckoutSessionId);
    session.status = 'expired';
    session.url = null;
    await expireCheckout(
      stripeEvent('evt_payment_promo_expired', 'checkout.session.expired'),
      session,
    );
    const expired = (await db.collection('payments').doc(result.paymentId).get()).data();

    assert.equal(expired.status, 'expired');
    assert.deepEqual(
      [expired.promoCodeSnapshot, expired.promoterIdSnapshot],
      ['NIGHTFLIGHT', 'promoter-nightflight'],
    );
  });

  await t.test('T10 nonexistent promo creates no Payment or reserved capacity', async () => {
    await seedFixture({ registrations: [{ label: 'a' }] });
    const stripe = new FakeStripe();
    setStripeForEmulatorTests(stripe);

    await assert.rejects(
      checkout('a', REQUEST_IDS[0], 'NOT-FOUND'),
      /PromoCode is invalid or unavailable/,
    );
    const current = await state('a');

    assert.equal(stripe.createCount, 0);
    assert.equal(current.payments.length, 0);
    assert.equal(current.holds.length, 0);
    assert.equal(current.lock.exists, false);
    assert.equal(current.league.activeHoldCount, 0);
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
