import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, LogOut, ShieldCheck } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { RouteTransition } from './RouteTransition';

export const ClientLayout: React.FC = () => {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="flex min-h-screen flex-col bg-[var(--tm-bg)]">
      <header
        className="sticky top-0 z-30 flex h-[72px] items-center justify-between gap-4
          border-b border-[var(--tm-border)] bg-[color-mix(in_srgb,var(--tm-bg)_82%,transparent)]
          px-4 backdrop-blur-xl sm:px-8"
      >
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-[14px] bg-[var(--tm-primary)] text-[17px] font-extrabold text-white shadow-soft-sm">
            P
          </div>
          <div className="min-w-0 leading-tight">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-[15.5px] font-extrabold tracking-[-0.02em] text-[var(--tm-ink)]">
                Client Portal
              </h1>
              <Badge variant="primary" size="sm" className="hidden sm:inline-flex">
                <ShieldCheck className="h-3 w-3" /> Secure access
              </Badge>
            </div>
            <p className="truncate text-[11.5px] text-[var(--tm-ink-muted)]">
              Real-time project updates &amp; team chat
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          {user && (
            <div className="hidden items-center gap-2.5 rounded-full border border-[var(--tm-border)] bg-[var(--tm-card)] px-4 py-2 sm:flex">
              <Building2 className="h-4 w-4 text-[var(--tm-ink-muted)]" />
              <div className="leading-tight">
                <div className="text-[13px] font-bold text-[var(--tm-ink)]">{user.name}</div>
                <div className="text-[11px] text-[var(--tm-ink-muted)]">{user.loginId}</div>
              </div>
              <Badge
                variant={user.company === 'piixel' ? 'piixel' : 'unwork'}
                size="sm"
                className="capitalize"
              >
                {user.company}
              </Badge>
            </div>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={handleLogout}
            leftIcon={<LogOut className="h-4 w-4" />}
          >
            Exit
          </Button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <RouteTransition className="space-y-6 lg:space-y-7" />
      </main>
    </div>
  );
};
