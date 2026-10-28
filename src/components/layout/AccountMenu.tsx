import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronDown, LogOut, Shield } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useFocusOf } from '../../store/useFocusStore';
import { basePath, profilePath, settingsGroupsFor } from '../../features/settings/settingsMenu';
import { UserAvatar } from '../ui/UserAvatar';
import { Badge } from '../ui/Badge';
import { useMotionPrefs } from '../ui/useMotionPrefs';
import { EASE_OUT } from '../ui/motion';

/** The avatar button and its menu, shared by every role's top bar. What it lists comes from `settingsMenu`, so roles never drift apart. */
export const AccountMenu: React.FC = () => {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const { reduced } = useMotionPrefs();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const focusEnds = useFocusOf(user ? { id: user.id } : null);

  // Dismiss on an outside click.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  if (!user) return null;
  const isAdmin = user.role === 'admin';
  const prefix = basePath(user.role);
  const groups = settingsGroupsFor(user.role);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className="flex items-center gap-2.5 rounded-full border border-[var(--tm-border)]
          bg-[var(--tm-card)] py-1.5 pl-1.5 pr-3 transition-colors
          hover:border-[var(--tm-border-strong)]"
      >
        <UserAvatar userId={user.id} size="md" focus={focusEnds != null} />
        <span className="hidden text-left leading-tight sm:block">
          <span className="block text-[13px] font-bold text-[var(--tm-ink)]">{user.nickname || user.name}</span>
          <span className="block text-[11.5px] text-[var(--tm-ink-muted)]">{user.jobTitle}</span>
        </span>
        <ChevronDown className="hidden h-4 w-4 text-[var(--tm-ink-muted)] sm:block" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: reduced ? 0 : 0.2, ease: EASE_OUT }}
            className="absolute right-0 top-[calc(100%+8px)] z-50 w-72 overflow-hidden
              rounded-[var(--tm-radius-lg)] border border-[var(--tm-border)]
              bg-[var(--tm-card)] shadow-soft-lg"
          >
            <Link
              to={profilePath(user.role, user.id)}
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 border-b border-[var(--tm-border)] px-5 py-4 transition-colors hover:bg-[var(--tm-bg-sunken)]"
            >
              <UserAvatar userId={user.id} size="lg" />
              <div className="min-w-0 leading-tight">
                <div className="truncate text-[14px] font-bold text-[var(--tm-ink)]">{user.name}</div>
                <div className="truncate text-[12px] text-[var(--tm-ink-muted)]">{user.jobTitle}</div>
                <div className="mt-1.5 flex items-center gap-1.5">
                  {isAdmin && (
                    <Badge variant={user.company === 'piixel' ? 'piixel' : 'unwork'} size="sm" className="capitalize">
                      {user.company}
                    </Badge>
                  )}
                  {isAdmin && (
                    <Badge variant="both" size="sm">
                      <Shield className="h-2.5 w-2.5" /> Admin
                    </Badge>
                  )}
                </div>
              </div>
            </Link>

            <div className="max-h-[min(70vh,34rem)] overflow-y-auto p-2">
              {groups.map((g, i) => (
                <React.Fragment key={g.title}>
                  <p
                    className={`px-3 pb-1 text-[10.5px] font-bold uppercase tracking-[0.14em] text-[var(--tm-ink-muted)] ${
                      i === 0 ? 'pt-1.5' : 'mt-2 border-t border-[var(--tm-border)] pt-3'
                    }`}
                  >
                    {g.title}
                  </p>
                  {g.items.map(({ id, label, icon: Icon }) => (
                    <Link
                      key={id}
                      role="menuitem"
                      to={`${prefix}/settings/${id}`}
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-3 rounded-[var(--tm-radius-md)] px-3 py-2 text-[13px] font-semibold
                        text-[var(--tm-ink-soft)] transition-colors hover:bg-[var(--tm-bg-sunken)] hover:text-[var(--tm-ink)]"
                    >
                      <Icon className="h-4 w-4" /> {label}
                    </Link>
                  ))}
                </React.Fragment>
              ))}
              <button
                role="menuitem"
                onClick={async () => {
                  setOpen(false);
                  await logout();
                  navigate('/login');
                }}
                className="mt-2 flex w-full items-center gap-3 rounded-[var(--tm-radius-md)] border-t border-[var(--tm-border)] px-3 py-2.5
                  text-[13px] font-semibold text-[var(--tm-danger)]
                  transition-colors hover:bg-[var(--tm-danger-bg)]"
              >
                <LogOut className="h-4 w-4" /> Log out
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
