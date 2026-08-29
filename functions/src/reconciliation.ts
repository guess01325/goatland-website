import { FieldPath, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import type Stripe from 'stripe';
import { releaseProvisioningHold } from './checkout.js';
import { stripeSecretKey } from './config.js';
import type { SeatHoldData } from './seatHolds.js';
import { collections, db, getStripe } from './shared.js';
import { expireCheckout, fulfillSuccessfulCheckout } from './webhook.js';

const RECONCILIATION_BATCH_LIMIT = 100;
type ReconciliationStatus = 'provisioning' | 'active';

export type ReconciliationScanCursor = {
  lastDocumentId: string | null;
  generation: number;
};

export type ReconciliationSummary = {
  scanned: number;
  converted: number;
  expired: number;
  leftReserved: number;
  provisioningReviewRequired: number;
  failures: number;
};

function logContext(holdId: string, hold: SeatHoldData) {
  return {
    holdId,
    paymentId: hold.paymentId,
    registrationId: hold.registrationId,
    leagueId: hold.leagueId,
    providerCheckoutSessionId: hold.providerCheckoutSessionId,
  };
}

export async function readReconciliationScanCursor(
  status: ReconciliationStatus,
): Promise<ReconciliationScanCursor> {
  const snapshot = await db
    .collection(collections.reconciliationScanCursors)
    .doc(status)
    .get();
  const data = snapshot.data();

  if (!snapshot.exists) {
    return { lastDocumentId: null, generation: 0 };
  }

  if (
    (data?.lastDocumentId !== null && typeof data?.lastDocumentId !== 'string')
    || !Number.isInteger(data?.generation)
    || Number(data.generation) < 0
  ) {
    throw new Error(`Reconciliation scan cursor for ${status} is invalid.`);
  }

  return {
    lastDocumentId: data.lastDocumentId as string | null,
    generation: Number(data.generation),
  };
}

export async function advanceReconciliationScanCursor(
  status: ReconciliationStatus,
  expected: ReconciliationScanCursor,
  lastDocumentId: string | null,
): Promise<boolean> {
  const reference = db
    .collection(collections.reconciliationScanCursors)
    .doc(status);

  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    const data = snapshot.data();
    const current: ReconciliationScanCursor = snapshot.exists
      ? {
        lastDocumentId: data?.lastDocumentId ?? null,
        generation: Number(data?.generation),
      }
      : { lastDocumentId: null, generation: 0 };

    if (
      current.lastDocumentId !== expected.lastDocumentId
      || current.generation !== expected.generation
    ) {
      return false;
    }

    transaction.set(reference, {
      lastDocumentId,
      generation: expected.generation + 1,
      updatedAt: Timestamp.now(),
    });
    return true;
  });
}

async function retrieveSession(
  stripe: Stripe,
  holdId: string,
  hold: SeatHoldData,
  summary: ReconciliationSummary,
): Promise<Stripe.Checkout.Session | null> {
  if (!hold.providerCheckoutSessionId) {
    return null;
  }

  try {
    return await stripe.checkout.sessions.retrieve(hold.providerCheckoutSessionId);
  } catch (error) {
    summary.failures += 1;
    logger.error('SeatHold reconciliation provider retrieval failed.', {
      ...logContext(holdId, hold),
      errorType: (error as { type?: unknown })?.type ?? 'unknown',
      errorCode: (error as { code?: unknown })?.code ?? 'unknown',
    });
    return null;
  }
}

async function reconcileActiveHold(
  stripe: Stripe,
  holdId: string,
  hold: SeatHoldData,
  summary: ReconciliationSummary,
): Promise<void> {
  if (!hold.providerCheckoutSessionId) {
    summary.failures += 1;
    logger.error('Active SeatHold has no provider Checkout Session ID.', logContext(holdId, hold));
    return;
  }

  const session = await retrieveSession(stripe, holdId, hold, summary);

  if (!session) {
    return;
  }

  if (session.id !== hold.providerCheckoutSessionId) {
    summary.failures += 1;
    logger.error('SeatHold reconciliation received an inconsistent provider session.', {
      ...logContext(holdId, hold),
      retrievedSessionId: session.id,
    });
    return;
  }

  if (session.status === 'open') {
    summary.leftReserved += 1;
    logger.info('SeatHold remains reserved for an open Stripe session.', logContext(holdId, hold));
    return;
  }

  if (session.status === 'expired') {
    await expireCheckout(null, session);
    summary.expired += 1;
    logger.info('SeatHold reconciled as expired.', logContext(holdId, hold));
    return;
  }

  if (session.status === 'complete' && session.payment_status === 'paid') {
    await fulfillSuccessfulCheckout(null, session);
    summary.converted += 1;
    logger.info('SeatHold reconciled as converted.', logContext(holdId, hold));
    return;
  }

  summary.leftReserved += 1;
  logger.warn('Stripe session is terminal but does not prove successful payment or safe release.', {
    ...logContext(holdId, hold),
    sessionStatus: session.status,
    paymentStatus: session.payment_status,
  });
}

async function reconcileProvisioningHold(
  stripe: Stripe,
  holdId: string,
  hold: SeatHoldData,
  summary: ReconciliationSummary,
): Promise<void> {
  if (!hold.providerCheckoutSessionId) {
    summary.provisioningReviewRequired += 1;
    logger.warn('Provisioning SeatHold has no recoverable provider session identity.', {
      ...logContext(holdId, hold),
      action: 'retry-idempotent-checkout-or-manual-review',
    });
    return;
  }

  const session = await retrieveSession(stripe, holdId, hold, summary);

  if (!session || session.id !== hold.providerCheckoutSessionId) {
    summary.provisioningReviewRequired += 1;
    return;
  }

  if (session.status === 'expired') {
    await releaseProvisioningHold(
      hold.paymentId,
      hold.registrationId,
      hold.leagueId,
      session.id,
    );
    summary.expired += 1;
    logger.info('Provisioning SeatHold released after provider-confirmed expiration.', {
      ...logContext(holdId, hold),
    });
    return;
  }

  summary.provisioningReviewRequired += 1;
  logger.warn('Provisioning SeatHold provider session is not safe to release.', {
    ...logContext(holdId, hold),
    sessionStatus: session.status,
    paymentStatus: session.payment_status,
  });
}

export async function reconcileSeatHolds(): Promise<ReconciliationSummary> {
  const summary: ReconciliationSummary = {
    scanned: 0,
    converted: 0,
    expired: 0,
    leftReserved: 0,
    provisioningReviewRequired: 0,
    failures: 0,
  };
  logger.info('SeatHold reconciliation run started.', {
    batchLimitPerStatus: RECONCILIATION_BATCH_LIMIT,
  });

  const stripe = getStripe();
  await reconcileStatus('provisioning', stripe, summary);
  await reconcileStatus('active', stripe, summary);

  logger.info('SeatHold reconciliation run completed.', summary);
  return summary;
}

async function reconcileStatus(
  status: ReconciliationStatus,
  stripe: Stripe,
  summary: ReconciliationSummary,
): Promise<void> {
  const startingCursor = await readReconciliationScanCursor(status);
  let query = db.collection(collections.seatHolds)
    .where('status', '==', status)
    .orderBy(FieldPath.documentId());

  if (startingCursor.lastDocumentId) {
    query = query.startAfter(startingCursor.lastDocumentId);
  }

  const snapshot = await query.limit(RECONCILIATION_BATCH_LIMIT).get();
  summary.scanned += snapshot.size;

  for (const document of snapshot.docs) {
    const hold = document.data() as SeatHoldData;

    try {
      if (status === 'provisioning') {
        await reconcileProvisioningHold(stripe, document.id, hold, summary);
      } else {
        await reconcileActiveHold(stripe, document.id, hold, summary);
      }
    } catch (error) {
      summary.failures += 1;
      logger.error(`${status} SeatHold reconciliation failed.`, {
        ...logContext(document.id, hold),
        error,
      });
    }
  }

  const reachedEnd = snapshot.size < RECONCILIATION_BATCH_LIMIT;
  const endingCursor = reachedEnd
    ? null
    : snapshot.docs[snapshot.docs.length - 1]?.id ?? null;
  const advanced = await advanceReconciliationScanCursor(
    status,
    startingCursor,
    endingCursor,
  );
  logger.info('SeatHold reconciliation cursor processed.', {
    status,
    startingCursor: startingCursor.lastDocumentId,
    scanned: snapshot.size,
    endingCursor,
    wrapped: reachedEnd,
    advanced,
  });
}

export const reconcileSeatHoldsScheduled = onSchedule(
  {
    schedule: 'every 10 minutes',
    secrets: [stripeSecretKey],
    retryCount: 0,
  },
  async () => {
    await reconcileSeatHolds();
  },
);
