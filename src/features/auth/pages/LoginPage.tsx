import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { ArrowRight, Lock, Mail, ShieldCheck, Sparkles } from 'lucide-react';
import { useAuthStore } from '../../../store/authStore';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Badge } from '../../../components/ui/Badge';
import { CurvePattern } from '../../../components/ui/HeroCard';
import { Stagger, StaggerItem } from '../../../components/ui/Stagger';
import { useMotionPrefs } from '../../../components/ui/useMotionPrefs';
import { fastT } from '../../../components/ui/motion';

interface DemoLogin {
  id: string;
  name: string;
  role: string;
  tag: string;
  variant: 'both' | 'warning' | 'piixel' | 'unwork';
  icon?: React.ReactNode;
}

const demoLogins: DemoLogin[] = [
  {
    id: 'aarav-piixel@ceo',
    name: 'Aarav Sharma',
    role: 'CEO & Admin',
    tag: 'Admin',
    variant: 'both',
    icon: <ShieldCheck className="h-4 w-4" />
  }
];

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { login, isLoading, error, clearError, loadCurrentUser } = useAuthStore();
  const { reduced } = useMotionPrefs();

  const [loginId, setLoginId] = useState('aarav-piixel@ceo');
  const [password, setPassword] = useState('password123');

  useEffect(() => {
    clearError();
    loadCurrentUser().then((u) => {
      if (u) {
        if (u.mustChangePassword) navigate('/change-password');
        else if (u.role === 'admin') navigate('/admin/dashboard');
        else if (u.role === 'client') navigate('/client/portal');
        else navigate('/app/attendance');
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
      if (user.mustChangePassword) {
        navigate('/change-password');
      } else if (user.role === 'admin') {
        navigate('/admin/dashboard');
      } else {
        navigate('/app/tasks');
      }
    } catch {
      // surfaced via the store's `error`
    }
  };

  const handleQuickLogin = (quickId: string) => {
    setLoginId(quickId);
    setPassword('password123');
  };

  return (
    <div className="flex min-h-screen bg-[var(--tm-bg)]">
      {/* Brand panel */}
      <aside className="relative hidden w-[46%] max-w-[620px] overflow-hidden lg:block">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              'linear-gradient(145deg, var(--tm-primary) 0%, var(--tm-primary-dark) 70%)'
          }}
        />
        <CurvePattern opacity={0.18} />

        <div className="relative flex h-full flex-col justify-between p-12 text-white">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-[14px] bg-white/15 text-[18px] font-extrabold backdrop-blur-sm">
              P
            </div>
            <div className="leading-tight">
              <div className="text-[15.5px] font-extrabold tracking-[-0.02em]">Task Manager</div>
              <div className="text-[11.5px] text-white/65">Piixel &amp; Unwork</div>
            </div>
          </div>

          <div>
            <h1 className="max-w-md text-[38px] font-extrabold leading-[1.1] tracking-[-0.03em]">
              One workspace for design, engineering and growth.
            </h1>
            <p className="mt-5 max-w-sm text-[14.5px] leading-relaxed text-white/70">
              Attendance, tasks, projects and team chat — tracked together, across both companies.
            </p>

            <div className="mt-10 flex gap-10">
              {[
                ['Attendance', 'Punch in, breaks, audits'],
                ['Tasks', 'Assign, track, submit'],
                ['Projects', 'Clients and weekly reports']
              ].map(([title, sub]) => (
                <div key={title} className="max-w-[140px]">
                  <div className="text-[13.5px] font-bold">{title}</div>
                  <div className="mt-1 text-[11.5px] leading-snug text-white/55">{sub}</div>
                </div>
              ))}
            </div>
          </div>

          <p className="text-[11.5px] text-white/45">v2.5.0 · Secure workspace access</p>
        </div>
      </aside>

      {/* Form */}
      <main className="flex flex-1 items-center justify-center px-4 py-12 sm:px-8">
        <Stagger className="w-full max-w-[420px] space-y-6">
          <StaggerItem className="text-center lg:text-left">
            <div className="mb-6 inline-flex items-center gap-3 lg:hidden">
              <div className="grid h-11 w-11 place-items-center rounded-[14px] bg-[var(--tm-primary)] text-[18px] font-extrabold text-white shadow-soft-sm">
                P
              </div>
              <div className="text-left leading-tight">
                <div className="text-[15.5px] font-extrabold tracking-[-0.02em] text-[var(--tm-ink)]">
                  Task Manager
                </div>
                <div className="text-[11.5px] text-[var(--tm-ink-muted)]">Piixel &amp; Unwork</div>
              </div>
            </div>

            <h2 className="text-[27px] font-extrabold tracking-[-0.03em] text-[var(--tm-ink)]">
              Welcome back
            </h2>
            <p className="mt-1.5 text-[14px] text-[var(--tm-ink-muted)]">
              Sign in with your workspace login ID.
            </p>
          </StaggerItem>

          <StaggerItem>
            <div className="rounded-[var(--tm-radius-xl)] border border-[var(--tm-border)] bg-[var(--tm-card)] p-7 shadow-soft-sm">
              <form onSubmit={handleSubmit} className="space-y-5">
                {error && (
                  <motion.div
                    initial={reduced ? false : { opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={fastT}
                    className="rounded-[var(--tm-radius-md)] bg-[var(--tm-danger-bg)] px-4 py-3
                      text-[13px] font-semibold text-[var(--tm-danger)]"
                  >
                    {error}
                  </motion.div>
                )}

                <Input
                  label="Login ID"
                  type="text"
                  placeholder="name-company@jobtitle"
                  value={loginId}
                  onChange={(e) => setLoginId(e.target.value)}
                  leftIcon={<Mail className="h-4 w-4" />}
                  helperText="e.g. rahul-piixel@seo-executive"
                  required
                />

                <Input
                  label="Password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  leftIcon={<Lock className="h-4 w-4" />}
                  required
                />

                <Button
                  type="submit"
                  size="lg"
                  isLoading={isLoading}
                  className="w-full"
                  rightIcon={<ArrowRight className="h-4 w-4" />}
                >
                  Sign in to workspace
                </Button>
              </form>
            </div>
          </StaggerItem>

          {/* Quick demo logins */}
          <StaggerItem>
            <div className="mb-3 flex items-center gap-1.5 px-1">
              <Sparkles className="h-3.5 w-3.5 text-[var(--tm-primary)]" />
              <span className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-[var(--tm-ink-muted)]">
                Quick demo logins
              </span>
            </div>

            <div className="space-y-2">
              {demoLogins.map((d) => {
                const selected = loginId === d.id;
                return (
                  <motion.button
                    key={d.id}
                    type="button"
                    onClick={() => handleQuickLogin(d.id)}
                    whileTap={reduced ? undefined : { scale: 0.99 }}
                    transition={fastT}
                    className={`flex w-full items-center justify-between gap-3 rounded-[var(--tm-radius-md)]
                      border px-4 py-3 text-left transition-colors
                      ${selected
                        ? 'border-[var(--tm-primary)] bg-[var(--tm-primary-softer)]'
                        : 'border-[var(--tm-border)] bg-[var(--tm-card)] hover:border-[var(--tm-border-strong)]'
                      }`}
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      {d.icon && (
                        <span className="text-[var(--tm-primary)]">{d.icon}</span>
                      )}
                      <span className="min-w-0 leading-tight">
                        <span className="block truncate text-[13px] font-bold text-[var(--tm-ink)]">
                          {d.name}
                        </span>
                        <span className="block truncate text-[11.5px] text-[var(--tm-ink-muted)]">
                          {d.id}
                        </span>
                      </span>
                    </span>
                    <Badge variant={d.variant} size="sm">
                      {d.tag}
                    </Badge>
                  </motion.button>
                );
              })}
            </div>
          </StaggerItem>
        </Stagger>
      </main>
    </div>
  );
};
