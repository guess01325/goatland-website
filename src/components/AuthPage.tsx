import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { getAuthErrorMessage } from '../auth/authErrors';
import { useAuth } from '../auth/AuthProvider';

type AuthPageProps = {
  mode: 'login' | 'signup';
};

export function AuthPage({ mode }: AuthPageProps) {
  const { user, loading, logIn, signUp, signInWithGoogle } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const isSignUp = mode === 'signup';
  const requestedPath = (location.state as { from?: unknown } | null)?.from;
  const returnPath = typeof requestedPath === 'string'
    && requestedPath.startsWith('/')
    && !requestedPath.startsWith('//')
    ? requestedPath
    : '/onboarding';

  if (loading) {
    return <AuthLoading />;
  }

  if (user) {
    return <Navigate to="/" replace />;
  }

  const handleEmailSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');

    if (isSignUp && password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      if (isSignUp) {
        await signUp(email.trim(), password);
      } else {
        await logIn(email.trim(), password);
      }
      navigate(returnPath, { replace: true });
    } catch (authError) {
      setError(getAuthErrorMessage(authError));
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError('');
    setSubmitting(true);
    try {
      await signInWithGoogle();
      navigate(returnPath, { replace: true });
    } catch (authError) {
      setError(getAuthErrorMessage(authError));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="auth-section">
      <div className="container auth-section__inner">
        <div className="auth-intro">
          <p className="eyebrow">GOATLAND Account</p>
          <h1>{isSignUp ? 'Join the Competition' : 'Welcome Back'}</h1>
          <p>
            {isSignUp
              ? 'Create your account to get ready for the next stage of GOATLAND competition.'
              : 'Log in to your GOATLAND account and return to the arena.'}
          </p>
        </div>

        <div className="auth-card">
          <form className="auth-form" onSubmit={handleEmailSubmit}>
            <label htmlFor={`${mode}-email`}>Email</label>
            <input
              id={`${mode}-email`}
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              disabled={submitting}
            />

            <label htmlFor={`${mode}-password`}>Password</label>
            <input
              id={`${mode}-password`}
              type="password"
              autoComplete={isSignUp ? 'new-password' : 'current-password'}
              minLength={6}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              disabled={submitting}
            />

            {isSignUp ? (
              <>
                <label htmlFor="signup-confirm-password">Confirm password</label>
                <input
                  id="signup-confirm-password"
                  type="password"
                  autoComplete="new-password"
                  minLength={6}
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  required
                  disabled={submitting}
                />
              </>
            ) : null}

            {!isSignUp ? (
              <Link className="auth-form__forgot" to="/forgot-password">
                Forgot password?
              </Link>
            ) : null}

            {error ? <p className="auth-message auth-message--error" role="alert">{error}</p> : null}

            <button className="button-link auth-submit" type="submit" disabled={submitting}>
              {submitting ? 'Please wait…' : isSignUp ? 'Create account' : 'Log in'}
            </button>
          </form>

          <div className="auth-divider"><span>or</span></div>

          <button
            className="button-link button-link--ghost auth-submit"
            type="button"
            onClick={handleGoogleSignIn}
            disabled={submitting}
          >
            Continue with Google
          </button>

          <p className="auth-card__switch">
            {isSignUp ? 'Already have an account?' : 'New to GOATLAND?'}{' '}
            <Link to={isSignUp ? '/login' : '/signup'}>
              {isSignUp ? 'Log in' : 'Create an account'}
            </Link>
          </p>
        </div>
      </div>
    </section>
  );
}

function AuthLoading() {
  return (
    <section className="auth-section" aria-live="polite">
      <div className="container auth-loading">Loading your account…</div>
    </section>
  );
}
