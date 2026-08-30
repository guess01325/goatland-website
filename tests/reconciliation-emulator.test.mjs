/* global fetch, process, URL */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const PROJECT_ID = 'goatland-development';
const OFFERING_ID = 'reconciliation-tests__tier-1';
const LEAGUE_1_ID = `${OFFERING_ID}__league-1`;
const LEAGUE_2_ID = `${OFFERING_ID}__league-2`;

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error('Reconciliation integration tests require the Firestore emulator.');
}

process.env.GCLOUD_PROJECT = PROJECT_ID;
const requireFromFunctions = createRequire(new URL('../functions/package.json', import.meta.url));
const { Timestamp } = requireFromFunctions('firebase-admin/firestore');
const { db, setStripeForEmulatorTests } = await import('../functions/lib/shared.js');
const {
  advanceReconciliationScanCursor,
  readReconciliationScanCursor,
  reconcileSeatHolds,
} = await import('../functions/lib/reconciliation.js');
const { expireCheckout, fulfillSuccessfulCheckout } = await import('../functions/lib/webhook.js');

class ReconciliationStripe {
  constructor() {
    this.sessions = new Map();
    this.errors = new Map();
    this.checkout = {
      sessions: {
        retrieve: async (id) => {
          if (this.errors.has(id)) {
            throw this.errors.get(id);
          }
          if (!this.sessions.has(id)) {
            throw Object.assign(new Error('No such checkout session'), {
              type: 'StripeInvalidRequestError',
              code: 'resource_missing',
            });
          }
          return this.sessions.get(id);
        },
      },
    };
  }
}

const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;

async function clearFirestore() {
  const response = await fetch(
    `http://${emulatorHost}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
    { method: 'DELETE' },
  );
  assert.equal(response.ok, true);
}

function refs(label) {
  return {
    paymentId: `payment-${label}`,
    registrationId: `registration-${label}`,
    sessionId: `cs_test_${label}`,
  };
}

function session(label, overrides = {}) {
  const ids = refs(label);
  return {
    id: ids.sessionId,
    mode: 'payment',
    status: 'open',
    payment_status: 'unpaid',
    amount_total: 500,
    currency: 'usd',
    payment_intent: `pi_test_${label}`,
    metadata: {
      paymentId: ids.paymentId,
      registrationId: ids.registrationId,
      leagueId: LEAGUE_1_ID,
      seatHoldId: ids.paymentId,
    },
    ...overrides,
  };
}

function league(number, overrides = {}) {
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

async function seedBase({ league1 = {}, league2 = {} } = {}) {
  await clearFirestore();
  const now = Timestamp.now();
  const batch = db.batch();
  batch.set(db.collection('registrationOfferings').doc(OFFERING_ID), {
    status: 'enabled',
    entryFeeCents: 500,
    currency: 'USD',
    registrationOpensAt: Timestamp.fromMillis(now.toMillis() - 60_000),
    registrationClosesAt: Timestamp.fromMillis(now.toMillis() + 3_600_000),
    createdAt: now,
    updatedAt: now,
  });
  batch.set(db.collection('leagues').doc(LEAGUE_1_ID), league(1, league1));
  batch.set(db.collection('leagues').doc(LEAGUE_2_ID), league(2, league2));
  await batch.commit();
}

async function seedHold(label, {
  holdStatus = 'active',
  paymentStatus = 'pending',
  registrationStatus = 'pending_payment',
  leagueId = LEAGUE_1_ID,
  providerSessionId = refs(label).sessionId,
  registrationOrder = null,
  promoCodeSnapshot = null,
  promoterIdSnapshot = null,
} = {}) {
  const ids = refs(label);
  const now = Timestamp.now();
  const batch = db.batch();
  batch.set(db.collection('players').doc(`player-${label}`), {
    displayName: `Player ${label}`,
    email: `${label}@goatland.local`,
    dateOfBirth: '1990-01-01',
    state: 'MA',
    accountStatus: 'active',
    profileComplete: true,
    rulesVersionAccepted: 'test-rules-v1',
    rulesAcceptedAt: now,
    createdAt: now,
    updatedAt: now,
  });
  batch.set(db.collection('registrations').doc(ids.registrationId), {
    playerId: `player-${label}`,
    registrationOfferingId: OFFERING_ID,
    leagueId,
    status: registrationStatus,
    acquisitionSource: 'facebook',
    acquisitionSourceOther: null,
    promoCodeId: promoCodeSnapshot,
    promoCodeSnapshot,
    promoterIdSnapshot,
    registrationOrder,
    confirmedAt: registrationStatus === 'confirmed' ? now : null,
    createdAt: now,
    updatedAt: now,
  });
  batch.set(db.collection('seatHolds').doc(ids.paymentId), {
    paymentId: ids.paymentId,
    registrationId: ids.registrationId,
    registrationOfferingId: OFFERING_ID,
    leagueId,
    providerCheckoutSessionId: providerSessionId,
    status: holdStatus,
    expiresAt: Timestamp.fromMillis(now.toMillis() + 60_000),
    createdAt: now,
    updatedAt: now,
  });
  batch.set(db.collection('registrationCheckoutLocks').doc(ids.registrationId), {
    paymentId: ids.paymentId,
    registrationId: ids.registrationId,
    updatedAt: now,
  });
  if (paymentStatus !== null) {
    batch.set(db.collection('payments').doc(ids.paymentId), {
      registrationId: ids.registrationId,
      provider: 'stripe',
      status: paymentStatus,
      amountCents: 500,
      currency: 'USD',
      promoCodeSnapshot,
      promoterIdSnapshot,
      providerCheckoutSessionId: providerSessionId,
      providerPaymentIntentId: null,
      createdAt: now,
      updatedAt: now,
      succeededAt: paymentStatus === 'succeeded' ? now : null,
      failedAt: null,
      expiredAt: paymentStatus === 'expired' ? now : null,
    });
  }
  await batch.commit();
}

async function seedUnresolvedPage(status, stripe, count = 100) {
  const now = Timestamp.now();
  const batch = db.batch();

  for (let index = 0; index < count; index += 1) {
    const label = `a${String(index).padStart(3, '0')}`;
    const ids = refs(label);
    batch.set(db.collection('seatHolds').doc(ids.paymentId), {
      paymentId: ids.paymentId,
      registrationId: ids.registrationId,
      registrationOfferingId: OFFERING_ID,
      leagueId: LEAGUE_1_ID,
      providerCheckoutSessionId: status === 'active' ? ids.sessionId : null,
      status,
      expiresAt: null,
      createdAt: now,
      updatedAt: now,
    });

    if (status === 'active') {
      stripe.sessions.set(ids.sessionId, session(label));
    }
  }

  await batch.commit();
}

async function readState(label, leagueId = LEAGUE_1_ID) {
  const ids = refs(label);
  const [leagueSnapshot, holdSnapshot, paymentSnapshot, registrationSnapshot, lockSnapshot, rosterSnapshot] = await Promise.all([
    db.collection('leagues').doc(leagueId).get(),
    db.collection('seatHolds').doc(ids.paymentId).get(),
    db.collection('payments').doc(ids.paymentId).get(),
    db.collection('registrations').doc(ids.registrationId).get(),
    db.collection('registrationCheckoutLocks').doc(ids.registrationId).get(),
    db.collection('leagues').doc(leagueId).collection('publicRoster').get(),
  ]);
  return {
    league: leagueSnapshot.data(),
    hold: holdSnapshot.data(),
    payment: paymentSnapshot.data(),
    registration: registrationSnapshot.data(),
    lockExists: lockSnapshot.exists,
    roster: rosterSnapshot.docs.map((snapshot) => ({ id: snapshot.id, ...snapshot.data() })),
  };
}

function completedEvent(label) {
  return { id: `evt_completed_${label}`, type: 'checkout.session.completed' };
}

function expiredEvent(label) {
  return { id: `evt_expired_${label}`, type: 'checkout.session.expired' };
}

test('SeatHold reconciliation R1-R13 and provisioning', async (t) => {
  await t.test('R1. active plus Stripe open remains reserved', async () => {
    await seedBase({ league1: { activeHoldCount: 1 } });
    await seedHold('r1');
    const stripe = new ReconciliationStripe();
    stripe.sessions.set(refs('r1').sessionId, session('r1'));
    setStripeForEmulatorTests(stripe);
    const summary = await reconcileSeatHolds();
    const state = await readState('r1');
    assert.equal(summary.leftReserved, 1);
    assert.equal(state.hold.status, 'active');
    assert.equal(state.league.activeHoldCount, 1);
    assert.equal(state.lockExists, true);
  });

  await t.test('R2. active plus Stripe expired releases once', async () => {
    await seedBase({ league1: { activeHoldCount: 1 } });
    await seedHold('r2', {
      promoCodeSnapshot: 'NIGHTFLIGHT',
      promoterIdSnapshot: 'promoter-nightflight',
    });
    const stripe = new ReconciliationStripe();
    stripe.sessions.set(refs('r2').sessionId, session('r2', { status: 'expired' }));
    setStripeForEmulatorTests(stripe);
    await reconcileSeatHolds();
    const state = await readState('r2');
    assert.equal(state.hold.status, 'expired');
    assert.equal(state.payment.status, 'expired');
    assert.deepEqual(
      [state.payment.promoCodeSnapshot, state.payment.promoterIdSnapshot],
      ['NIGHTFLIGHT', 'promoter-nightflight'],
    );
    assert.equal(state.league.activeHoldCount, 0);
    assert.equal(state.lockExists, false);
    assert.equal(state.roster.length, 0);
  });

  await t.test('R3 S25. paid reconciliation converts and idempotently ensures successor', async () => {
    await seedBase({
      league1: { confirmedCount: 11, activeHoldCount: 1, lastAssignedRegistrationOrder: 11 },
    });
    await db.collection('leagues').doc(LEAGUE_2_ID).delete();
    await seedHold('r3', {
      promoCodeSnapshot: 'NIGHTFLIGHT',
      promoterIdSnapshot: 'promoter-nightflight',
    });
    const stripe = new ReconciliationStripe();
    stripe.sessions.set(refs('r3').sessionId, session('r3', {
      status: 'complete', payment_status: 'paid',
    }));
    setStripeForEmulatorTests(stripe);
    await reconcileSeatHolds();
    const state = await readState('r3');
    assert.deepEqual(
      [state.league.activeHoldCount, state.league.confirmedCount, state.league.lastAssignedRegistrationOrder],
      [0, 12, 12],
    );
    assert.equal(state.roster.length, 1);
    assert.equal(state.hold.status, 'converted');
    assert.equal(state.payment.status, 'succeeded');
    assert.deepEqual(
      [state.payment.promoCodeSnapshot, state.payment.promoterIdSnapshot],
      ['NIGHTFLIGHT', 'promoter-nightflight'],
    );
    assert.equal(state.registration.status, 'confirmed');
    assert.equal(state.registration.registrationOrder, 12);
    assert.equal(state.lockExists, false);
    assert.deepEqual(
      Object.fromEntries(Object.entries(state.roster[0]).filter(([key]) => key !== 'id')),
      { displayName: 'Player r3', registrationOrder: 12 },
    );
    const successorRef = db.collection('leagues').doc(LEAGUE_2_ID);
    const successor = (await successorRef.get()).data();
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
    await successorRef.update({
      status: 'closed',
      confirmedCount: 2,
      activeHoldCount: 1,
      lastAssignedRegistrationOrder: 3,
      updatedAt: Timestamp.now(),
    });
    const preserved = (await successorRef.get()).data();
    await reconcileSeatHolds();
    assert.deepEqual((await successorRef.get()).data(), preserved);
  });

  await t.test('R4. converted hold is not scanned or mutated', async () => {
    await seedBase({ league1: { confirmedCount: 1, lastAssignedRegistrationOrder: 1 } });
    await seedHold('r4', {
      holdStatus: 'converted', paymentStatus: 'succeeded',
      registrationStatus: 'confirmed', registrationOrder: 1,
    });
    const stripe = new ReconciliationStripe();
    setStripeForEmulatorTests(stripe);
    const summary = await reconcileSeatHolds();
    assert.equal(summary.scanned, 0);
    assert.equal((await readState('r4')).hold.status, 'converted');
  });

  await t.test('R5. expired hold is not scanned or mutated', async () => {
    await seedBase();
    await seedHold('r5', { holdStatus: 'expired', paymentStatus: 'expired' });
    const stripe = new ReconciliationStripe();
    setStripeForEmulatorTests(stripe);
    const summary = await reconcileSeatHolds();
    assert.equal(summary.scanned, 0);
    assert.equal((await readState('r5')).hold.status, 'expired');
  });

  await t.test('R6. repeated paid reconciliation does not double-confirm', async () => {
    await seedBase({ league1: { activeHoldCount: 1 } });
    await seedHold('r6');
    const stripe = new ReconciliationStripe();
    stripe.sessions.set(refs('r6').sessionId, session('r6', {
      status: 'complete', payment_status: 'paid',
    }));
    setStripeForEmulatorTests(stripe);
    await reconcileSeatHolds();
    await reconcileSeatHolds();
    const state = await readState('r6');
    assert.deepEqual(
      [state.league.activeHoldCount, state.league.confirmedCount, state.league.lastAssignedRegistrationOrder],
      [0, 1, 1],
    );
    assert.equal(state.roster.length, 1);
  });

  await t.test('R7. repeated expired reconciliation does not double-release', async () => {
    await seedBase({ league1: { activeHoldCount: 1 } });
    await seedHold('r7');
    const stripe = new ReconciliationStripe();
    stripe.sessions.set(refs('r7').sessionId, session('r7', { status: 'expired' }));
    setStripeForEmulatorTests(stripe);
    await reconcileSeatHolds();
    await reconcileSeatHolds();
    const state = await readState('r7');
    assert.equal(state.league.activeHoldCount, 0);
    assert.equal(state.hold.status, 'expired');
  });

  await t.test('R8. reconciliation versus completed webhook converts once', async () => {
    await seedBase({ league1: { activeHoldCount: 1 } });
    await seedHold('r8');
    const stripe = new ReconciliationStripe();
    const paid = session('r8', { status: 'complete', payment_status: 'paid' });
    stripe.sessions.set(refs('r8').sessionId, paid);
    setStripeForEmulatorTests(stripe);
    const results = await Promise.allSettled([
      reconcileSeatHolds(),
      fulfillSuccessfulCheckout(completedEvent('r8'), paid),
    ]);
    assert.equal(results.filter(({ status }) => status === 'rejected').length, 0);
    const state = await readState('r8');
    assert.deepEqual(
      [state.league.activeHoldCount, state.league.confirmedCount, state.league.lastAssignedRegistrationOrder],
      [0, 1, 1],
    );
    assert.equal(state.roster.length, 1);
  });

  await t.test('R9. reconciliation versus expired webhook releases once', async () => {
    await seedBase({ league1: { activeHoldCount: 1 } });
    await seedHold('r9');
    const stripe = new ReconciliationStripe();
    const expired = session('r9', { status: 'expired' });
    stripe.sessions.set(refs('r9').sessionId, expired);
    setStripeForEmulatorTests(stripe);
    const results = await Promise.allSettled([
      reconcileSeatHolds(),
      expireCheckout(expiredEvent('r9'), expired),
    ]);
    assert.equal(results.filter(({ status }) => status === 'rejected').length, 0);
    const state = await readState('r9');
    assert.equal(state.league.activeHoldCount, 0);
    assert.equal(state.hold.status, 'expired');
  });

  await t.test('R10. temporary Stripe error keeps hold reserved', async () => {
    await seedBase({ league1: { activeHoldCount: 1 } });
    await seedHold('r10');
    const stripe = new ReconciliationStripe();
    stripe.errors.set(refs('r10').sessionId, Object.assign(new Error('temporary'), {
      type: 'StripeConnectionError',
    }));
    setStripeForEmulatorTests(stripe);
    const summary = await reconcileSeatHolds();
    const state = await readState('r10');
    assert.equal(summary.failures, 1);
    assert.equal(state.hold.status, 'active');
    assert.equal(state.league.activeHoldCount, 1);
    assert.equal(state.lockExists, true);
    assert.equal(state.roster.length, 0);
  });

  await t.test('R11. missing or inconsistent session keeps hold reserved', async () => {
    await seedBase({ league1: { activeHoldCount: 1 } });
    await seedHold('r11');
    const stripe = new ReconciliationStripe();
    setStripeForEmulatorTests(stripe);
    await reconcileSeatHolds();
    let state = await readState('r11');
    assert.equal(state.hold.status, 'active');
    assert.equal(state.league.activeHoldCount, 1);

    stripe.sessions.set(refs('r11').sessionId, session('r11', { id: 'cs_wrong' }));
    await reconcileSeatHolds();
    state = await readState('r11');
    assert.equal(state.hold.status, 'active');
    assert.equal(state.league.activeHoldCount, 1);
  });

  await t.test('R11b. complete but unpaid session is not confirmed or released', async () => {
    await seedBase({ league1: { activeHoldCount: 1 } });
    await seedHold('r11b');
    const stripe = new ReconciliationStripe();
    stripe.sessions.set(refs('r11b').sessionId, session('r11b', {
      status: 'complete', payment_status: 'unpaid',
    }));
    setStripeForEmulatorTests(stripe);
    await reconcileSeatHolds();
    const state = await readState('r11b');
    assert.equal(state.hold.status, 'active');
    assert.equal(state.registration.status, 'pending_payment');
    assert.equal(state.league.activeHoldCount, 1);
    assert.equal(state.roster.length, 0);
  });

  await t.test('R12. reconciled paid conversion fills League', async () => {
    await seedBase({
      league1: { confirmedCount: 15, activeHoldCount: 1, lastAssignedRegistrationOrder: 15 },
    });
    await seedHold('r12');
    const stripe = new ReconciliationStripe();
    stripe.sessions.set(refs('r12').sessionId, session('r12', {
      status: 'complete', payment_status: 'paid',
    }));
    setStripeForEmulatorTests(stripe);
    await reconcileSeatHolds();
    const state = await readState('r12');
    assert.equal(state.league.confirmedCount, 16);
    assert.equal(state.league.activeHoldCount, 0);
    assert.equal(state.league.status, 'full');
  });

  await t.test('R13. two Leagues reconcile independently', async () => {
    await seedBase({
      league1: { confirmedCount: 2, activeHoldCount: 1, lastAssignedRegistrationOrder: 2 },
      league2: { confirmedCount: 5, activeHoldCount: 1, lastAssignedRegistrationOrder: 5 },
    });
    await seedHold('r13a');
    await seedHold('r13b', { leagueId: LEAGUE_2_ID });
    const stripe = new ReconciliationStripe();
    stripe.sessions.set(refs('r13a').sessionId, session('r13a', {
      status: 'complete', payment_status: 'paid',
    }));
    stripe.sessions.set(refs('r13b').sessionId, session('r13b', {
      status: 'complete', payment_status: 'paid',
      metadata: {
        paymentId: refs('r13b').paymentId,
        registrationId: refs('r13b').registrationId,
        leagueId: LEAGUE_2_ID,
        seatHoldId: refs('r13b').paymentId,
      },
    }));
    setStripeForEmulatorTests(stripe);
    await reconcileSeatHolds();
    const [first, second] = await Promise.all([
      readState('r13a'), readState('r13b', LEAGUE_2_ID),
    ]);
    assert.deepEqual(
      [first.league.confirmedCount, first.league.activeHoldCount, first.league.lastAssignedRegistrationOrder],
      [3, 0, 3],
    );
    assert.deepEqual(
      [second.league.confirmedCount, second.league.activeHoldCount, second.league.lastAssignedRegistrationOrder],
      [6, 0, 6],
    );
    assert.equal(first.roster.length, 1);
    assert.equal(second.roster.length, 1);
  });

  await t.test('P1. provisioning hold without session ID remains reserved for review', async () => {
    await seedBase({ league1: { activeHoldCount: 1 } });
    await seedHold('p1', {
      holdStatus: 'provisioning', paymentStatus: null, providerSessionId: null,
    });
    const stripe = new ReconciliationStripe();
    setStripeForEmulatorTests(stripe);
    const summary = await reconcileSeatHolds();
    const state = await readState('p1');
    assert.equal(summary.provisioningReviewRequired, 1);
    assert.equal(state.hold.status, 'provisioning');
    assert.equal(state.league.activeHoldCount, 1);
    assert.equal(state.lockExists, true);
    assert.equal(state.roster.length, 0);
  });

  await t.test('P2. provisioning hold with provider-expired session releases safely', async () => {
    await seedBase({ league1: { activeHoldCount: 1 } });
    await seedHold('p2', { holdStatus: 'provisioning', paymentStatus: null });
    const stripe = new ReconciliationStripe();
    stripe.sessions.set(refs('p2').sessionId, session('p2', { status: 'expired' }));
    setStripeForEmulatorTests(stripe);
    await reconcileSeatHolds();
    const state = await readState('p2');
    assert.equal(state.hold.status, 'released');
    assert.equal(state.league.activeHoldCount, 0);
    assert.equal(state.lockExists, false);
    assert.equal(state.roster.length, 0);
  });

  await t.test('F1. more than 100 unresolved active holds do not starve an expired hold', async () => {
    await seedBase({ league1: { activeHoldCount: 1 } });
    const stripe = new ReconciliationStripe();
    await seedUnresolvedPage('active', stripe);
    await seedHold('z-active');
    stripe.sessions.set(refs('z-active').sessionId, session('z-active', { status: 'expired' }));
    setStripeForEmulatorTests(stripe);
    await reconcileSeatHolds();
    assert.equal((await readState('z-active')).hold.status, 'active');
    await reconcileSeatHolds();
    const state = await readState('z-active');
    assert.equal(state.hold.status, 'expired');
    assert.equal(state.league.activeHoldCount, 0);
  });

  await t.test('F2. more than 100 unresolved provisioning holds do not starve an expired hold', async () => {
    await seedBase({ league1: { activeHoldCount: 1 } });
    const stripe = new ReconciliationStripe();
    await seedUnresolvedPage('provisioning', stripe);
    await seedHold('z-provisioning', { holdStatus: 'provisioning', paymentStatus: null });
    stripe.sessions.set(
      refs('z-provisioning').sessionId,
      session('z-provisioning', { status: 'expired' }),
    );
    setStripeForEmulatorTests(stripe);
    await reconcileSeatHolds();
    assert.equal((await readState('z-provisioning')).hold.status, 'provisioning');
    await reconcileSeatHolds();
    const state = await readState('z-provisioning');
    assert.equal(state.hold.status, 'released');
    assert.equal(state.league.activeHoldCount, 0);
  });

  await t.test('F3. scanner wraps and processes an earlier document ID', async () => {
    await seedBase({ league1: { activeHoldCount: 1 } });
    const stripe = new ReconciliationStripe();
    await seedUnresolvedPage('active', stripe);
    await seedHold('z-wrap');
    stripe.sessions.set(refs('z-wrap').sessionId, session('z-wrap'));
    setStripeForEmulatorTests(stripe);
    await reconcileSeatHolds();
    await reconcileSeatHolds();
    assert.equal((await readReconciliationScanCursor('active')).lastDocumentId, null);

    await db.collection('leagues').doc(LEAGUE_1_ID).update({ activeHoldCount: 1 });
    await seedHold('a000');
    stripe.sessions.set(refs('a000').sessionId, session('a000', { status: 'expired' }));
    await reconcileSeatHolds();
    assert.equal((await readState('a000')).hold.status, 'expired');
  });

  await t.test('F4. cursor advances over unresolved documents scanned', async () => {
    await seedBase();
    const stripe = new ReconciliationStripe();
    await seedUnresolvedPage('active', stripe);
    setStripeForEmulatorTests(stripe);
    await reconcileSeatHolds();
    const cursor = await readReconciliationScanCursor('active');
    assert.equal(cursor.lastDocumentId, refs('a099').paymentId);
    assert.equal(cursor.generation, 1);
  });

  await t.test('F5. terminal documents fall out of future status scans', async () => {
    await seedBase({ league1: { activeHoldCount: 1 } });
    await seedHold('f5');
    const stripe = new ReconciliationStripe();
    stripe.sessions.set(refs('f5').sessionId, session('f5', { status: 'expired' }));
    setStripeForEmulatorTests(stripe);
    const first = await reconcileSeatHolds();
    const second = await reconcileSeatHolds();
    assert.equal(first.expired, 1);
    assert.equal(second.scanned, 0);
    assert.equal(second.expired, 0);
    assert.equal((await readState('f5')).hold.status, 'expired');
  });

  await t.test('F6. stale cursor advancement cannot overwrite newer progress', async () => {
    await clearFirestore();
    const original = await readReconciliationScanCursor('active');
    assert.deepEqual(original, { lastDocumentId: null, generation: 0 });
    assert.equal(
      await advanceReconciliationScanCursor('active', original, 'payment-middle'),
      true,
    );
    assert.equal(
      await advanceReconciliationScanCursor('active', original, 'payment-earlier'),
      false,
    );
    const newer = await readReconciliationScanCursor('active');
    assert.deepEqual(newer, { lastDocumentId: 'payment-middle', generation: 1 });
    assert.equal(await advanceReconciliationScanCursor('active', newer, null), true);
    assert.equal(await advanceReconciliationScanCursor('active', original, 'payment-stale'), false);
    assert.deepEqual(
      await readReconciliationScanCursor('active'),
      { lastDocumentId: null, generation: 2 },
    );
  });
});
