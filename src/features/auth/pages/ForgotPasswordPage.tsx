import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { AuthShell } from '../components/AuthShell';
import { passwordApi } from '../../../services/http/passwordApi';
import './login.css';

/** "Forgot password?": enter an email, always get the same answer, whether or not an account exists. */
export const ForgotPasswordPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError('Enter your email address.');
      return;
    }
    setError(null);
    setSending(true);
    try {
      setAnswer(await passwordApi.forgot(email.trim()));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the link.');
    } finally {
      setSending(false);
    }
  };

  return (
    <AuthShell eyebrow="Forgot password" title={['No problem,', "let's reset it."]}>
      {answer ? (
        <div>
          <div role="status" className="z1-notice">
            {answer}
          </div>
          <p className="z1-help">Nothing in your inbox after a few minutes? Check spam, or try again. You can ask up to 3 times an hour.</p>
          <Link to="/login" className="z1-btn z1-btn-plain">
            Back to sign in
          </Link>
          <button type="button" className="z1-link z1-link-center" onClick={() => setAnswer(null)}>
            Use a different email
          </button>
        </div>
      ) : (
        <form noValidate onSubmit={submit}>
          {error && (
            <div role="alert" className="z1-error">
              {error}
            </div>
          )}
          <p className="z1-help">Enter the email you sign in with and we'll send you a link to choose a new password.</p>
          <div className="z1-fields">
            <div>
              <label htmlFor="forgot-email" className="z1-label">
                Email
              </label>
              <div className="z1-field">
                <input
                  id="forgot-email"
                  className="z1-input"
                  type="email"
                  autoComplete="username"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoFocus
                  required
                />
              </div>
            </div>
          </div>
          <button type="submit" className="z1-btn" disabled={sending} aria-busy={sending}>
            {sending && <span className="z1-spin" aria-hidden="true" />}
            Send reset link
          </button>
          <Link to="/login" className="z1-link z1-link-center">
            Back to sign in
          </Link>
        </form>
      )}
    </AuthShell>
  );
};
