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
const LEAGUE_1_ID = `${OFFERING_ID}__league-1`;
const LEAGUE_2_ID = `${OFFERING_ID}__league-2`;
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
const { Timestamp } = requireFromFunctions('firebase-admin/firestore');
const {
  db,
  getPublicRosterEntryId,
  setStripeForEmulatorTests,
} = await import('../functions/lib/shared.js');
const {
  createRegistrationCheckout,
  releaseProvisioningHold,
} = await import('../functions/lib/checkout.js');
const {
  expireCheckout,
  fulfillSuccessfulCheckout,
} = await import('../functions/lib/webhook.js');

class FakeStripe {
  constructor() {
    this.sessions = new Map();
    this.createCount = 0;
    this.creationError = null;
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

  for (const { label, leagueId = LEAGUE_1_ID } of registrations) {
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
      competitionRulesVersionAccepted: 'test-competition-v1',
      competitionRulesAcceptedAt: now,
      refundPolicyVersionAccepted: 'test-refund-v1',
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
  }

  await batch.commit();
}

function checkout(label, requestId = REQUEST_IDS[0]) {
  return createRegistrationCheckout.run({
    auth: { uid: identities[label].uid, token: { email: identities[label].email } },
    data: { registrationId: registrationId(label), checkoutRequestId: requestId },
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

await Promise.all(['a', 'b', 'c'].map(createIdentity));

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
