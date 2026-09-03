import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Registration } from '../../models/Registration';
import { getGame } from '../../services/games';
import { getLeagueStart } from '../../services/leagueStarts';
import { getRegistrationOffering } from '../../services/registrationOfferings';
import { getRegistrations } from '../../services/registrations';
import { getTier } from '../../services/tiers';

type RegistrationSummary = {
  registration: Registration;
  gameName: string;
  tierName: string;
  startLabel: string;
  registrationPath: string;
};

function formatStartDate(value: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(value);
}

export function YourRegistrations({ refreshKey }: { refreshKey: number }) {
  const [summaries, setSummaries] = useState<RegistrationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let current = true;
    setLoading(true);
    setError('');

    getRegistrations()
      .then(async (registrations) => Promise.all(
        registrations
          .filter(({ status }) => status === 'pending_payment' || status === 'confirmed')
          .map(async (registration) => {
            const offering = await getRegistrationOffering(registration.registrationOfferingId);
            const leagueStart = offering ? await getLeagueStart(offering.leagueStartId) : null;
            const [game, tier] = await Promise.all([
              leagueStart ? getGame(leagueStart.gameId) : null,
              offering ? getTier(offering.tierId) : null,
            ]);
            return {
              registration,
              gameName: game ? `${game.name}${game.edition ? ` ${game.edition}` : ''}` : 'League Registration',
              tierName: tier?.name ?? 'Tier unavailable',
              startLabel: leagueStart?.startsAt
                ? formatStartDate(leagueStart.startsAt.toDate(), leagueStart.timeZone)
                : 'Start date unavailable',
              registrationPath: leagueStart && offering
                ? `/register?game=${encodeURIComponent(leagueStart.gameId)}&tier=${encodeURIComponent(offering.tierId)}&start=${encodeURIComponent(offering.id)}`
                : '/register',
            };
          }),
      ))
      .then((nextSummaries) => {
        if (current) setSummaries(nextSummaries);
      })
      .catch(() => {
        if (current) setError('Your saved Registrations could not be loaded.');
      })
      .finally(() => {
        if (current) setLoading(false);
      });

    return () => {
      current = false;
    };
  }, [refreshKey, retry]);

  return (
    <section className="your-registrations" aria-labelledby="your-registrations-title">
      <div>
        <p className="eyebrow">Your registrations</p>
        <h2 id="your-registrations-title">Saved signup positions</h2>
      </div>
      {loading ? <p className="registration-inline-state">Loading your Registrations…</p> : null}
      {!loading && error ? (
        <div className="registration-inline-state registration-inline-state--error" role="alert">
          <p>{error}</p>
          <button className="button-link button-link--ghost" type="button" onClick={() => setRetry((value) => value + 1)}>
            Try again
          </button>
        </div>
      ) : null}
      {!loading && !error && summaries.length === 0 ? (
        <p>You do not have a current Registration yet.</p>
      ) : null}
      {!loading && !error && summaries.length > 0 ? (
        <ul className="your-registrations__list">
          {summaries.map(({
            registration,
            gameName,
            tierName,
            startLabel,
            registrationPath,
          }) => (
            <li key={registration.id}>
              <div>
                <strong>{gameName} · {tierName}</strong>
                <span>{startLabel}</span>
              </div>
              <div>
                <strong>Priority #{registration.registrationOrder}</strong>
                <span>
                  {registration.status === 'confirmed'
                    ? 'Confirmed'
                    : registration.paymentAvailabilityStatus === 'available'
                      ? 'Payment confirmation available'
                      : 'Saved — payment confirmation not yet launched'}
                </span>
                <Link className="text-link" to={registrationPath}>View Registration</Link>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
