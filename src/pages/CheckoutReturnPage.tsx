import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';
import { LeagueRoster } from '../components/registration/LeagueRoster';
import { clearCheckoutAttempt, getCurrentCheckoutAttempt } from '../lib/checkoutAttempt';
import { auth } from '../lib/firebase';
import type { Game } from '../models/Game';
import type { League } from '../models/League';
import type { LeagueStart } from '../models/LeagueStart';
import type { PublicRosterEntry } from '../models/PublicRosterEntry';
import type { Registration } from '../models/Registration';
import type { RegistrationOffering } from '../models/RegistrationOffering';
import type { Tier } from '../models/Tier';
import { getGame } from '../services/games';
import { getLeagueStart } from '../services/leagueStarts';
import { getLeague, getPublicRoster } from '../services/leagues';
import { getRegistrationOffering } from '../services/registrationOfferings';
import { getRegistration } from '../services/registrations';
import { getTier } from '../services/tiers';

const POLL_INTERVAL_MS = 2_500;
const MAX_POLL_ATTEMPTS = 12;

type CheckoutReturnMode = 'success' | 'cancel';

type ReturnContext = {
  registration: Registration;
  offering: RegistrationOffering;
  league: League;
  leagueStart: LeagueStart;
  game: Game;
  tier: Tier;
  roster: PublicRosterEntry[];
};

class CheckoutReturnIdentityError extends Error {}

async function loadReturnContext(registrationOfferingId: string): Promise<ReturnContext> {
  const registration = await getRegistration(registrationOfferingId);
  const offering = await getRegistrationOffering(registrationOfferingId);
  if (!registration || !offering || registration.registrationOfferingId !== offering.id) {
    throw new Error('Registration return context is unavailable.');
  }
  if (!registration.leagueId) {
    throw new Error('Registration League assignment is unavailable.');
  }

  const [league, leagueStart, tier] = await Promise.all([
    getLeague(registration.leagueId),
    getLeagueStart(offering.leagueStartId),
    getTier(offering.tierId),
  ]);
  if (!league || !leagueStart || !tier || league.registrationOfferingId !== offering.id) {
    throw new Error('Registration return context is inconsistent.');
  }

  const game = await getGame(leagueStart.gameId);
  if (!game) throw new Error('Registration Game is unavailable.');
  const roster = registration.status === 'confirmed' ? await getPublicRoster(league.id) : [];
  return { registration, offering, league, leagueStart, game, tier, roster };
}

function formatStartDate(leagueStart: LeagueStart): string {
  if (!leagueStart.startsAt) return 'Date unavailable';
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: leagueStart.timeZone,
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    }).format(leagueStart.startsAt.toDate());
  } catch {
    return 'Date unavailable';
  }
}

export function CheckoutReturnPage({ mode }: { mode: CheckoutReturnMode }) {
  const attempt = useRef(
    auth.currentUser ? getCurrentCheckoutAttempt(auth.currentUser.uid) : null,
  ).current;
  const [context, setContext] = useState<ReturnContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [timedOut, setTimedOut] = useState(false);
  const [retry, setRetry] = useState(0);

  const load = useCallback(async () => {
    if (!attempt) {
      throw new CheckoutReturnIdentityError(
        'Checkout return details are unavailable in this browser tab.',
      );
    }
    const nextContext = await loadReturnContext(attempt.registrationOfferingId);
    if (nextContext.registration.id !== attempt.registrationId) {
      clearCheckoutAttempt(attempt.registrationId, attempt.registrationOfferingId);
      throw new CheckoutReturnIdentityError('Checkout return context does not match this Registration.');
    }
    return nextContext;
  }, [attempt]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    setTimedOut(false);
    load()
      .then((nextContext) => {
        if (!active) return;
        setContext(nextContext);
        if (nextContext.registration.status === 'confirmed') {
          clearCheckoutAttempt(nextContext.registration.id, nextContext.registration.registrationOfferingId);
        }
      })
      .catch((loadError: unknown) => {
        if (!active) return;
        setError(loadError instanceof CheckoutReturnIdentityError
          ? 'We could not identify this checkout return. Return to Registration and try again.'
          : 'We could not reload your Registration. Try again shortly.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [load, retry]);

  useEffect(() => {
    if (
      mode !== 'success'
      || loading
      || error
      || !attempt
      || context?.registration.status !== 'pending_payment'
    ) return;

    let active = true;
    let pollCount = 0;
    let timer: number | undefined;

    const poll = async () => {
      pollCount += 1;
      try {
        const registration = await getRegistration(attempt.registrationOfferingId);
        if (!active) return;
        if (!registration) {
          setError('We could not load this Registration. Return to Registration and try again.');
          return;
        }
        if (registration.id !== attempt.registrationId) {
          clearCheckoutAttempt(attempt.registrationId, attempt.registrationOfferingId);
          setError('We could not identify this checkout return. Return to Registration and try again.');
          return;
        }
        if (registration.status !== 'pending_payment') {
          const nextContext = await loadReturnContext(attempt.registrationOfferingId);
          if (!active) return;
          setContext(nextContext);
          if (registration.status === 'confirmed') {
            clearCheckoutAttempt(registration.id, attempt.registrationOfferingId);
          }
          return;
        }
      } catch {
        // A later bounded poll or manual refresh can recover a temporary read failure.
      }

      if (!active) return;
      if (pollCount >= MAX_POLL_ATTEMPTS) {
        setTimedOut(true);
        return;
      }
      timer = window.setTimeout(() => void poll(), POLL_INTERVAL_MS);
    };

    timer = window.setTimeout(() => void poll(), POLL_INTERVAL_MS);
    return () => {
      active = false;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [attempt, context?.registration.status, error, loading, mode]);

  const registrationPath = attempt?.registrationPath ?? '/register';
  const confirmed = context?.registration.status === 'confirmed';
  const pending = context?.registration.status === 'pending_payment';

  return (
    <>
      <PageHeader
        eyebrow="Registration Checkout"
        title={confirmed ? 'Registration confirmed' : mode === 'success' ? 'Checking your Registration' : 'Payment was not completed'}
        description={confirmed
          ? 'GOATLAND has authoritatively confirmed your Registration.'
          : mode === 'success'
            ? 'Your return from Stripe has been received. Payment confirmation may still be processing.'
            : 'Returning from Stripe does not cancel or change your GOATLAND Registration.'}
      />

      <section className="section checkout-return-section">
        <div className="container">
          {loading ? <p className="profile-state-card" role="status">Loading your Registration…</p> : null}
          {error ? (
            <div className="profile-state-card">
              <p role="alert">{error}</p>
              <button className="button-link" type="button" onClick={() => setRetry((value) => value + 1)}>
                Try again
              </button>
            </div>
          ) : null}

          {!loading && !error && context ? (
            <div className="checkout-return-card">
              {confirmed ? (
                <>
                  <h2>Registration confirmed</h2>
                  <RegistrationSummary context={context} />
                  <LeagueRoster
                    leagueLabel={`League ${context.league.leagueNumber}`}
                    entries={context.roster}
                    loading={false}
                    error=""
                    onRetry={() => setRetry((value) => value + 1)}
                  />
                </>
              ) : pending && mode === 'success' ? (
                <div aria-live="polite">
                  <h2>Payment is processing</h2>
                  <p>
                    GOATLAND is waiting for authoritative payment confirmation. You may safely
                    leave this page; the Stripe webhook and reconciliation process continue.
                  </p>
                  {timedOut ? (
                    <p role="status">
                      Your payment is still being processed. You can refresh this page shortly.
                    </p>
                  ) : <p role="status">Checking for confirmation…</p>}
                  <button className="button-link" type="button" onClick={() => setRetry((value) => value + 1)}>
                    Refresh Registration
                  </button>
                </div>
              ) : pending ? (
                <>
                  <h2>Registration is awaiting payment</h2>
                  <p>
                    Stripe Checkout may remain open until it expires. Return to Registration to
                    continue using the same safe checkout attempt.
                  </p>
                </>
              ) : (
                <>
                  <h2>Registration status: {context.registration.status.replace('_', ' ')}</h2>
                  <p>Your authoritative Registration state is shown above.</p>
                </>
              )}

              <div className="hero-actions">
                <Link className="button-link" to={registrationPath}>Back to Registration</Link>
              </div>
            </div>
          ) : null}
        </div>
      </section>
    </>
  );
}

function RegistrationSummary({ context }: { context: ReturnContext }) {
  const entryFee = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: context.offering.currency,
  }).format(context.offering.entryFeeCents / 100);

  return (
    <dl className="registration-checkout__summary">
      <div><dt>Game</dt><dd>{context.game.name}{context.game.edition ? ` ${context.game.edition}` : ''}</dd></div>
      <div><dt>Tier</dt><dd>{context.tier.name}</dd></div>
      <div><dt>League Start Date</dt><dd>{formatStartDate(context.leagueStart)}</dd></div>
      <div><dt>League</dt><dd>League {context.league.leagueNumber}</dd></div>
      <div><dt>Entry fee</dt><dd>{entryFee}</dd></div>
    </dl>
  );
}
