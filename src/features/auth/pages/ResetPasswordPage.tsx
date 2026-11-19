import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { AuthShell } from '../components/AuthShell';
import { PasswordRules } from '../../../components/ui/PasswordRules';
import { passwordApi, ResetLinkGoneError } from '../../../services/http/passwordApi';
import { tokenStore } from '../../../services/api';
import { toast } from '../../../store/useToastStore';
import { passwordIsValid } from '../../../utils/passwordRules';
import './login.css';

type View = 'checking' | 'form' | 'gone';

const GONE_COPY = {
  expired: { line: 'This link has expired.', text: 'Reset links work for 30 minutes.' },
  used: { line: 'This link was already used.', text: 'A link works once, and asking for a new one cancels the old one.' },
  invalid: { line: "This link isn't valid.", text: 'It may have been copied incompletely.' }
} as const;

/** A password field in the sign-in style with its own Show / Hide button. */
const SecretField: React.FC<{
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
}> = ({ id, label, value, onChange, autoFocus }) => {
  const [shown, setShown] = useState(false);
  return (
    <div>
      <label htmlFor={id} className="z1-label">
        {label}
      </label>
      <div className="z1-field">
        <input
          id={id}
          className="z1-input z1-input-eye"
          type={shown ? 'text' : 'password'}
          autoComplete="new-password"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoFocus={autoFocus}
          required
        />
        <button type="button" className="z1-eye" onClick={() => setShown((v) => !v)} aria-label={shown ? 'Hide password' : 'Show password'} aria-pressed={shown}>
          {shown ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
    </div>
  );
};

/** The page the emailed link opens: choose a new password, or explain that the link no longer works. */
export const ResetPasswordPage: React.FC = () => {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const [view, setView] = useState<View>('checking');
  const [reason, setReason] = useState<keyof typeof GONE_COPY>('invalid');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    passwordApi
      .checkLink(token)
      .then((state) => {
        if (!alive) return;
        if (state.valid) setView('form');
        else {
          setReason(state.reason);
          setView('gone');
        }
      })
      .catch((err) => {
        if (!alive) return;
        setError(err instanceof Error ? err.message : 'Could not check this link.');
        setView('form');
      });
    return () => {
      alive = false;
    };
  }, [token]);

  const ready = passwordIsValid(password) && password === confirm;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready || saving) return;
    setSaving(true);
    setError(null);
    try {
      await passwordApi.reset(token, password);
      tokenStore.clear(); // every sign-in was ended on the server; drop what this browser still holds
      toast.success('Password updated', 'Sign in with your new password.');
      navigate('/login', { replace: true });
    } catch (err) {
      if (err instanceof ResetLinkGoneError) {
        setReason('used');
        setView('gone');
      } else {
        setError(err instanceof Error ? err.message : 'Could not reset your password.');
      }
    } finally {
      setSaving(false);
    }
  };

  if (view === 'checking') {
    return (
      <AuthShell eyebrow="Reset password" title={['One moment,', 'checking your link.']}>
        <span className="z1-spin z1-spin-dark" role="status" aria-label="Checking your link" />
      </AuthShell>
    );
  }

  if (view === 'gone') {
    const copy = GONE_COPY[reason];
    return (
      <AuthShell eyebrow="Reset password" title={['This link', "doesn't work."]}>
        <div role="alert" className="z1-error">
          {copy.line}
        </div>
        <p className="z1-help">{copy.text} Ask for a new link and we'll email it to you.</p>
        <Link to="/forgot-password" className="z1-btn z1-btn-plain">
          Send a new link
        </Link>
        <Link to="/login" className="z1-link z1-link-center">
          Back to sign in
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell eyebrow="Reset password" title={['Choose a', 'new password.']}>
      <form noValidate onSubmit={submit}>
        {error && (
          <div role="alert" className="z1-error">
            {error}
          </div>
        )}
        <div className="z1-fields">
          <SecretField id="new-password" label="New password" value={password} onChange={setPassword} autoFocus />
          <SecretField id="confirm-password" label="Confirm new password" value={confirm} onChange={setConfirm} />
          <PasswordRules password={password} confirm={confirm} />
        </div>
        <button type="submit" className="z1-btn" disabled={!ready || saving} aria-busy={saving}>
          {saving && <span className="z1-spin" aria-hidden="true" />}
          Reset password
        </button>
        <p className="z1-note">You'll be signed out on every device.</p>
      </form>
    </AuthShell>
  );
};
