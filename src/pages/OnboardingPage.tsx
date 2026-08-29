import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { CURRENT_RULES_VERSION } from '../config/rules';

const US_STATES = [
  'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut',
  'Delaware', 'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa',
  'Kansas', 'Kentucky', 'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan',
  'Minnesota', 'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada', 'New Hampshire',
  'New Jersey', 'New Mexico', 'New York', 'North Carolina', 'North Dakota', 'Ohio',
  'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island', 'South Carolina', 'South Dakota',
  'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington', 'West Virginia',
  'Wisconsin', 'Wyoming', 'District of Columbia',
] as const;

export function OnboardingPage() {
  const { user, loading, player, playerLoading, playerError, createPlayer } = useAuth();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [state, setState] = useState('');
  const [rulesAccepted, setRulesAccepted] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (loading || (user && playerLoading)) {
    return (
      <section className="auth-section" aria-live="polite">
        <div className="container auth-loading">Loading your player profile…</div>
      </section>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (player) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');

    if (!rulesAccepted) {
      setError('You must accept the GOATLAND rules to continue.');
      return;
    }

    setSubmitting(true);
    try {
      await createPlayer({ displayName, dateOfBirth, state });
      navigate('/', { replace: true });
    } catch {
      setError('We could not create your player profile. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="auth-section">
      <div className="container auth-section__inner">
        <div className="auth-intro">
          <p className="eyebrow">Player Onboarding</p>
          <h1>Enter the Arena</h1>
          <p>Complete your core GOATLAND player profile. Game identities will be added separately later.</p>
        </div>

        <div className="auth-card">
          {playerError ? <p className="auth-message auth-message--error" role="alert">{playerError}</p> : null}
          <form className="auth-form" onSubmit={handleSubmit}>
            <label htmlFor="onboarding-display-name">Display name</label>
            <input
              id="onboarding-display-name"
              type="text"
              autoComplete="nickname"
              minLength={2}
              maxLength={40}
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              required
              disabled={submitting || Boolean(playerError)}
            />

            <label htmlFor="onboarding-email">Email</label>
            <input id="onboarding-email" type="email" value={user.email ?? ''} readOnly disabled />

            <label htmlFor="onboarding-date-of-birth">Date of birth</label>
            <input
              id="onboarding-date-of-birth"
              type="date"
              max={new Date().toISOString().slice(0, 10)}
              value={dateOfBirth}
              onChange={(event) => setDateOfBirth(event.target.value)}
              required
              disabled={submitting || Boolean(playerError)}
            />

            <label htmlFor="onboarding-state">State</label>
            <select
              id="onboarding-state"
              value={state}
              onChange={(event) => setState(event.target.value)}
              required
              disabled={submitting || Boolean(playerError)}
            >
              <option value="">Select your state</option>
              {US_STATES.map((stateName) => <option value={stateName} key={stateName}>{stateName}</option>)}
            </select>

            <label className="auth-checkbox" htmlFor="onboarding-rules">
              <input
                id="onboarding-rules"
                type="checkbox"
                checked={rulesAccepted}
                onChange={(event) => setRulesAccepted(event.target.checked)}
                required
                disabled={submitting || Boolean(playerError)}
              />
              <span>I accept the GOATLAND account rules (version {CURRENT_RULES_VERSION}).</span>
            </label>

            {error ? <p className="auth-message auth-message--error" role="alert">{error}</p> : null}

            <button className="button-link auth-submit" type="submit" disabled={submitting || Boolean(playerError)}>
              {submitting ? 'Creating profile…' : 'Complete player profile'}
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}
