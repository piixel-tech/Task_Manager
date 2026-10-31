import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertCircle, Building2, LogOut, MessageSquare } from 'lucide-react';
import { useAuthStore } from '../../../store/authStore';
import { joinApi, type InvitePreview } from '../../../services/http/joinApi';
import { Card, CardContent } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';

type Mode = 'signup' | 'login';

const errorText = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback);

/** /join/<token>: a client opens an invite link, signs up or logs in, and lands in the group. */
export const ClientJoinPage: React.FC = () => {
  const { code: token } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { user, initialized, loadCurrentUser, login, logout } = useAuthStore();

  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [invalid, setInvalid] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('signup');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!initialized) void loadCurrentUser();
  }, [initialized, loadCurrentUser]);

  useEffect(() => {
    if (!token) return setInvalid('This invite link is not valid');
    joinApi.preview(token).then(setPreview).catch((err) => setInvalid(errorText(err, 'This invite link is not valid')));
  }, [token]);

  const enter = (groupId: string) => navigate(`/client/portal?group=${groupId}`, { replace: true });

  /** Run a step, showing its error on the form instead of throwing. */
  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (err) {
      setError(errorText(err, 'Something went wrong'));
    } finally {
      setBusy(false);
    }
  };

  const signup = (e: React.FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const { group_id } = await joinApi.signup(token!, { name: name.trim(), email: email.trim(), password });
      await login(email.trim(), password);
      enter(group_id);
    });
  };

  const logIn = (e: React.FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const u = await login(email.trim(), password);
      if (u.role !== 'client') return; // the staff notice below takes over; nothing to join
      enter((await joinApi.join(token!)).group_id);
    });
  };

  const joinAsCurrent = () => void run(async () => enter((await joinApi.join(token!)).group_id));

  let body: React.ReactNode;
  if (invalid) {
    body = (
      <div className="space-y-4 text-center">
        <AlertCircle className="mx-auto h-10 w-10 text-[var(--tm-danger)]" />
        <h1 className="text-xl font-extrabold text-[var(--tm-ink)]">{invalid}</h1>
        <p className="text-[13.5px] text-[var(--tm-ink-muted)]">Ask the person who sent it for a new link.</p>
      </div>
    );
  } else if (!preview || !initialized) {
    body = <p className="py-10 text-center text-[13px] text-[var(--tm-ink-muted)]">Checking your invite…</p>;
  } else {
    body = (
      <div className="space-y-6">
        <div className="space-y-2 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-[var(--tm-radius-md)] bg-[var(--tm-primary-soft)] text-[var(--tm-primary-dark)]">
            <MessageSquare className="h-6 w-6" />
          </span>
          <h1 className="text-xl font-extrabold text-[var(--tm-ink)]">Join “{preview.group_name}”</h1>
          <p className="text-[13.5px] text-[var(--tm-ink-muted)]">
            {preview.invited_by ? `${preview.invited_by} invited you` : 'You are invited'}
            {preview.project_name && (
              <>
                {' '}
                to the <span className="inline-flex items-center gap-1 font-semibold text-[var(--tm-ink-soft)]"><Building2 className="h-3.5 w-3.5" />{preview.project_name}</span> project chat
              </>
            )}
            .
          </p>
        </div>

        {error && <div className="tm-error px-4 py-3 text-xs font-semibold" role="alert">{error}</div>}

        {user && user.role === 'client' ? (
          <div className="space-y-3 text-center">
            <p className="text-[13.5px] text-[var(--tm-ink-soft)]">
              Signed in as <span className="font-bold">{user.name}</span>.
            </p>
            <Button className="w-full" isLoading={busy} onClick={joinAsCurrent}>
              Join the group
            </Button>
            <button type="button" onClick={() => logout()} className="text-[12.5px] font-semibold text-[var(--tm-ink-muted)] hover:underline">
              Not you? Use a different account
            </button>
          </div>
        ) : user ? (
          <div className="space-y-3 text-center">
            <p className="text-[13.5px] text-[var(--tm-ink-soft)]">
              You are signed in as <span className="font-bold">{user.name}</span> (team). Invite links are for clients, so log out to continue as a client.
            </p>
            <Button variant="outline" className="w-full" onClick={() => logout()} leftIcon={<LogOut className="h-4 w-4" />}>
              Log out
            </Button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-1 rounded-full bg-[var(--tm-bg-sunken)] p-1" role="tablist">
              {(['signup', 'login'] as Mode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  aria-selected={mode === m}
                  onClick={() => {
                    setMode(m);
                    setError(null);
                  }}
                  className={`h-9 rounded-full text-[13px] font-bold ${mode === m ? 'bg-[var(--tm-card)] text-[var(--tm-ink)] shadow-soft-xs' : 'text-[var(--tm-ink-muted)]'}`}
                >
                  {m === 'signup' ? 'Create account' : 'I have an account'}
                </button>
              ))}
            </div>

            <form onSubmit={mode === 'signup' ? signup : logIn} className="space-y-4">
              {mode === 'signup' && <Input label="Your name" autoComplete="name" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} required />}
              <Input label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              <Input
                label="Password"
                type="password"
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                helperText={mode === 'signup' ? 'At least 8 characters.' : undefined}
                minLength={mode === 'signup' ? 8 : undefined}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <Button type="submit" className="w-full" isLoading={busy}>
                {mode === 'signup' ? 'Create account and join' : 'Log in and join'}
              </Button>
            </form>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="grid min-h-screen place-items-center bg-[var(--tm-bg)] px-4 py-10">
      <Card className="w-full max-w-md">
        <CardContent className="pt-6">{body}</CardContent>
      </Card>
    </div>
  );
};
