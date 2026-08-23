import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { getAuthErrorMessage } from '../auth/authErrors';
import { useAuth } from '../auth/AuthProvider';

export function ForgotPasswordPage() {
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setSent(false);
    setSubmitting(true);

    try {
      await resetPassword(email.trim());
      setSent(true);
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
          <p className="eyebrow">Account Recovery</p>
          <h1>Reset Password</h1>
          <p>Enter your email and we’ll send you a secure link to reset your password.</p>
        </div>

        <div className="auth-card">
          <form className="auth-form" onSubmit={handleSubmit}>
            <label htmlFor="reset-email">Email</label>
            <input
              id="reset-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              disabled={submitting}
            />

            {error ? <p className="auth-message auth-message--error" role="alert">{error}</p> : null}
            {sent ? (
              <p className="auth-message auth-message--success" role="status">
                If an account exists for that email, a reset link has been sent. Check your inbox and spam folder.
              </p>
            ) : null}

            <button className="button-link auth-submit" type="submit" disabled={submitting}>
              {submitting ? 'Sending…' : 'Send reset email'}
            </button>
          </form>

          <p className="auth-card__switch">
            Remembered your password? <Link to="/login">Back to log in</Link>
          </p>
        </div>
      </div>
    </section>
  );
}
