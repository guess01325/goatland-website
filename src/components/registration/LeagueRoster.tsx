import type { PublicRosterEntry } from '../../models/PublicRosterEntry';

type LeagueRosterProps = {
  leagueLabel: string;
  entries: PublicRosterEntry[];
  loading: boolean;
  error: string;
  onRetry: () => void;
};

export function LeagueRoster({
  leagueLabel,
  entries,
  loading,
  error,
  onRetry,
}: LeagueRosterProps) {
  return (
    <aside className="preview-card registration-roster" aria-live="polite">
      <p className="eyebrow">{leagueLabel}</p>
      <h2>Confirmed Roster</h2>
      {loading ? <p>Loading confirmed roster…</p> : null}
      {!loading && error ? (
        <div className="registration-inline-state registration-inline-state--error" role="alert">
          <p>{error}</p>
          <button className="button-link button-link--ghost" type="button" onClick={onRetry}>
            Try again
          </button>
        </div>
      ) : null}
      {!loading && !error && entries.length === 0 ? <p>No confirmed players yet.</p> : null}
      {!loading && !error && entries.length > 0 ? (
        <ul className="registration-roster__list">
          {entries.map((entry) => (
            <li key={`${entry.registrationOrder}-${entry.displayName}`}>{entry.displayName}</li>
          ))}
        </ul>
      ) : null}
    </aside>
  );
}
