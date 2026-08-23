import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';

export function PlayerProfileGate() {
  const { user, loading, player, playerLoading, playerError, logOut } = useAuth();
  const location = useLocation();

  if (loading || (user && playerLoading)) {
    return (
      <section className="auth-section" aria-live="polite">
        <div className="container auth-loading">Loading your player profile…</div>
      </section>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (playerError) {
    return (
      <section className="auth-section">
        <div className="container profile-state-card">
          <p className="eyebrow">Player Profile</p>
          <h1>Profile unavailable</h1>
          <p role="alert">{playerError}</p>
          <div className="hero-actions">
            <button className="button-link" type="button" onClick={() => window.location.reload()}>
              Try again
            </button>
            <button className="button-link button-link--ghost" type="button" onClick={() => void logOut()}>
              Log out
            </button>
          </div>
        </div>
      </section>
    );
  }

  if (!player) {
    return <Navigate to="/onboarding" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}
