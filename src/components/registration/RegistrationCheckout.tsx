import type { Game } from '../../models/Game';
import type { League } from '../../models/League';
import type { LeagueStart } from '../../models/LeagueStart';
import type { Registration } from '../../models/Registration';
import type { RegistrationOffering } from '../../models/RegistrationOffering';
import type { Tier } from '../../models/Tier';
import { REGISTRATION_PAYMENT_UNAVAILABLE_MESSAGE } from '../../lib/registrationPaymentGate';

type RegistrationCheckoutProps = {
  registration: Registration;
  offering: RegistrationOffering;
  league: League;
  game: Game;
  tier: Tier;
  leagueStart: LeagueStart;
  promoCode: string;
  promoLocked: boolean;
  eligible: boolean;
  policiesCurrent: boolean;
  paymentsEnabled: boolean;
  starting: boolean;
  error: string;
  onPay: () => void;
};

function formatEntryFee(offering: RegistrationOffering): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: offering.currency,
  }).format(offering.entryFeeCents / 100);
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

export function RegistrationCheckout({
  registration,
  offering,
  league,
  game,
  tier,
  leagueStart,
  promoCode,
  promoLocked,
  eligible,
  policiesCurrent,
  paymentsEnabled,
  starting,
  error,
  onPay,
}: RegistrationCheckoutProps) {
  return (
    <section className="registration-checkout" aria-labelledby="registration-checkout-title">
      <div>
        <p className="eyebrow">Step 7</p>
        <h2 id="registration-checkout-title">Review &amp; Pay</h2>
        <p>Review your Registration before continuing to Stripe Checkout.</p>
      </div>

      <dl className="registration-checkout__summary">
        <div><dt>Game</dt><dd>{game.name}{game.edition ? ` ${game.edition}` : ''}</dd></div>
        <div><dt>Tier</dt><dd>{tier.name}</dd></div>
        <div><dt>League Start Date</dt><dd>{formatStartDate(leagueStart)}</dd></div>
        <div><dt>League</dt><dd>League {league.leagueNumber}</dd></div>
        <div><dt>Entry fee</dt><dd>{formatEntryFee(offering)}</dd></div>
        <div>
          <dt>Promo</dt>
          <dd>{promoLocked ? 'Attached to Registration' : promoCode || 'None'}</dd>
        </div>
      </dl>

      {!policiesCurrent ? (
        <p className="registration-field-error" role="alert">
          Updated registration policies must be accepted before payment can continue.
        </p>
      ) : null}

      {!paymentsEnabled ? (
        <p className="registration-field-error" role="status">
          {REGISTRATION_PAYMENT_UNAVAILABLE_MESSAGE}
        </p>
      ) : null}

      <button
        className="button-link"
        type="button"
        aria-busy={starting || undefined}
        disabled={
          !paymentsEnabled
          || !eligible
          || starting
          || registration.status !== 'pending_payment'
        }
        onClick={onPay}
      >
        {starting ? 'Opening secure checkout…' : 'Continue to Payment'}
      </button>

      <p className="registration-field-help">
        Stripe verifies payment securely. Your Registration is confirmed only after GOATLAND
        receives authoritative payment confirmation.
      </p>
      {error ? <p className="registration-field-error" role="alert">{error}</p> : null}
    </section>
  );
}
