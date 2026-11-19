import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../../store/authStore';
import { homeForRole } from '../../../app/roleHome';
import { BrandPanel } from '../components/AuthShell';
import './login.css';

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { login, isLoading, error, clearError, loadCurrentUser } = useAuthStore();

  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    clearError();
    loadCurrentUser().then((u) => {
      if (u) {
        navigate(u.mustChangePassword ? '/change-password' : homeForRole(u.role), { replace: true });
      }
    });
    // Runs once on mount — the redirect target comes from the loaded session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    try {
      const user = await login(loginId, password);
      navigate(user.mustChangePassword ? '/change-password' : homeForRole(user.role), {
        replace: true
      });
    } catch {
      // surfaced via the store's `error`
    }
  };

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="z1">
      <BrandPanel />

      <main className="z1-form">
        <div className="z1-inner">
          <p className="z1-eyebrow">Sign in</p>
          <h1 className="z1-title">
            <span className="z1-clip">
              <span className="light">{greeting},</span>
            </span>
            <span className="z1-clip">
              <span className="bold">welcome back.</span>
            </span>
          </h1>

          <form noValidate onSubmit={handleSubmit}>
            {error && (
              <div role="alert" className="z1-error">
                {error}
              </div>
            )}

            <div className="z1-fields">
              <div>
                <label htmlFor="login-email" className="z1-label">
                  Email
                </label>
                <div className="z1-field">
                  <input
                    id="login-email"
                    className="z1-input"
                    type="email"
                    autoComplete="username"
                    placeholder="you@company.com"
                    value={loginId}
                    onChange={(e) => setLoginId(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div>
                <label htmlFor="login-password" className="z1-label">
                  Password
                </label>
                <div className="z1-field">
                  <input
                    id="login-password"
                    className="z1-input"
                    type="password"
                    autoComplete="current-password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
                <Link to="/forgot-password" className="z1-link">
                  Forgot password?
                </Link>
              </div>
            </div>

            <button type="submit" className="z1-btn" disabled={isLoading} aria-busy={isLoading}>
              {isLoading && <span className="z1-spin" aria-hidden="true" />}
              Sign in
            </button>
          </form>

          <p className="z1-note">Protected workspace · access by invitation only</p>
        </div>
      </main>
    </div>
  );
};
