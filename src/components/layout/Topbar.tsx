import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import {
  Bell,
  ChevronDown,
  Clock,
  LogOut,
  Menu,
  Search,
  Settings,
  Shield,
  User as UserIcon
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useAppStore } from '../../store/useAppStore';
import { useNavCounts } from '../../hooks/useNavCounts';
import { attendanceService, userService } from '../../services';
import type { AttendanceDay, User } from '../../types';
import { getTodayDateString } from '../../utils/time';
import { Avatar } from '../ui/Avatar';
import { Badge } from '../ui/Badge';
import { CommandPalette } from './CommandPalette';
import { useMotionPrefs } from '../ui/useMotionPrefs';
import { EASE_OUT } from '../ui/motion';

/** Is this a Mac? Only affects which modifier glyph we print. */
const isMac = () =>
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || '');

export const Topbar: React.FC = () => {
  const { user, logout } = useAuthStore();
  const { toggleSidebar, toastMessage } = useAppStore();
  const counts = useNavCounts();
  const navigate = useNavigate();
  const { reduced } = useMotionPrefs();

  const [todayAttendance, setTodayAttendance] = useState<AttendanceDay | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const [allUsers, setAllUsers] = useState<User[]>([]);

  useEffect(() => {
    if (user?.id) {
      attendanceService.getAttendance(user.id, getTodayDateString()).then((records) => {
        if (records.length > 0) setTodayAttendance(records[0]);
      });
      userService.getUsers().then(setAllUsers);
    }
  }, [user]);

  // ⌘K / Ctrl+K opens search.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Dismiss the popovers on an outside click.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) setBellOpen(false);
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const activePunch = todayAttendance?.punchSessions.find((s) => !s.punchOut);
  const isAdmin = user?.role === 'admin';
  const prefix = isAdmin ? '/admin' : '/app';

  const todayMMDD = getTodayDateString().slice(5);

  const birthdayNotifications = allUsers
    .filter((u) => u.birthday && u.birthday.endsWith(todayMMDD))
    .map((bdayUser) => ({
      id: `bday-${bdayUser.id}`,
      tone: 'warn' as const,
      title: bdayUser.id === user?.id ? `🎉 Happy Birthday, ${user?.name || 'there'}!` : `🎉 Today is ${bdayUser.name}'s birthday!`,
      body: bdayUser.id === user?.id ? 'Hope you have a wonderful day!' : 'Wish them a happy birthday in team chat!',
      to: bdayUser.id === user?.id ? `${prefix}/profile` : `${prefix}/chat`
    }));

  const notifications = [
    ...birthdayNotifications,
    counts.overdue > 0 && {
      id: 'overdue',
      tone: 'bad' as const,
      title: `${counts.overdue} overdue ${counts.overdue === 1 ? 'task' : 'tasks'}`,
      body: 'Past the due date and still open.',
      to: `${prefix}/tasks`
    },
    isAdmin &&
      counts.pendingSubmissions > 0 && {
        id: 'submissions',
        tone: 'warn' as const,
        title: `${counts.pendingSubmissions} submission${
          counts.pendingSubmissions === 1 ? '' : 's'
        } to review`,
        body: 'Waiting on your approval.',
        to: `${prefix}/submissions`
      },
    !activePunch &&
      user?.role === 'employee' && {
        id: 'punch',
        tone: 'warn' as const,
        title: 'You are not punched in',
        body: 'Mark attendance to start tracking time.',
        to: `${prefix}/attendance`
      }
  ].filter(Boolean) as {
    id: string;
    tone: 'bad' | 'warn';
    title: string;
    body: string;
    to: string;
  }[];

  const popTransition = { duration: reduced ? 0 : 0.2, ease: EASE_OUT };

  return (
    <>
      <header
        className="sticky top-0 z-30 flex h-[72px] items-center justify-between gap-4
          border-b border-[var(--tm-border)] bg-[color-mix(in_srgb,var(--tm-bg)_82%,transparent)]
          px-4 backdrop-blur-xl lg:px-8"
      >
        {/* Left: menu toggle + search */}
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <button
            onClick={toggleSidebar}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-[var(--tm-ink-soft)]
              hover:bg-[var(--tm-bg-sunken)] lg:hidden"
            aria-label="Toggle menu"
          >
            <Menu className="h-5 w-5" />
          </button>

          {isAdmin && (
            <button
              onClick={() => setPaletteOpen(true)}
              className="group flex h-11 w-full max-w-sm items-center gap-2.5 rounded-full
                border border-[var(--tm-border)] bg-[var(--tm-card)] px-4 text-left
                transition-colors hover:border-[var(--tm-border-strong)]"
            >
              <Search className="h-[17px] w-[17px] shrink-0 text-[var(--tm-ink-muted)]" />
              <span className="flex-1 truncate text-[13.5px] text-[var(--tm-ink-muted)]">
                Search tasks, projects, people…
              </span>
              <kbd
                className="hidden shrink-0 rounded-md bg-[var(--tm-bg-sunken)] px-2 py-1
                  text-[10.5px] font-bold text-[var(--tm-ink-muted)] sm:block"
              >
                {isMac() ? '⌘' : 'Ctrl'} K
              </kbd>
            </button>
          )}

          <AnimatePresence>
            {toastMessage && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={popTransition}
                className="hidden items-center gap-2 rounded-full bg-[var(--tm-success-bg)]
                  px-3.5 py-2 text-[12px] font-semibold text-[var(--tm-success)] md:flex"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--tm-success)]" />
                {toastMessage}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Right: status, bell, user */}
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          {user?.role === 'employee' && (
            <div
              className={`hidden items-center gap-2 rounded-full px-3.5 py-2 text-[12px] font-semibold lg:flex
                ${
                  activePunch
                    ? 'bg-[var(--tm-success-bg)] text-[var(--tm-success)]'
                    : 'bg-[var(--tm-neutral-bg)] text-[var(--tm-neutral)]'
                }`}
            >
              <Clock className="h-3.5 w-3.5" />
              {activePunch ? 'Punched in' : 'Not punched in'}
            </div>
          )}

          {/* Notifications */}
          <div className="relative" ref={bellRef}>
            <button
              onClick={() => setBellOpen((o) => !o)}
              aria-label="Notifications"
              className="relative grid h-11 w-11 place-items-center rounded-full border
                border-[var(--tm-border)] bg-[var(--tm-card)] text-[var(--tm-ink-soft)]
                transition-colors hover:border-[var(--tm-border-strong)] hover:text-[var(--tm-ink)]"
            >
              <Bell className="h-[18px] w-[18px]" />
              {notifications.length > 0 && (
                <span
                  className="absolute right-2.5 top-2.5 grid h-[17px] min-w-[17px] place-items-center
                    rounded-full bg-[var(--tm-danger)] px-1 text-[10px] font-bold text-white
                    ring-2 ring-[var(--tm-card)]"
                >
                  {notifications.length}
                </span>
              )}
            </button>

            <AnimatePresence>
              {bellOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -8, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.98 }}
                  transition={popTransition}
                  className="absolute right-0 top-[calc(100%+10px)] w-80 overflow-hidden
                    rounded-[var(--tm-radius-lg)] border border-[var(--tm-border)]
                    bg-[var(--tm-card)] shadow-soft-lg"
                >
                  <div className="border-b border-[var(--tm-border)] px-5 py-3.5">
                    <h3 className="text-[14px] font-bold text-[var(--tm-ink)]">Notifications</h3>
                  </div>

                  {notifications.length === 0 ? (
                    <p className="px-5 py-8 text-center text-[13px] text-[var(--tm-ink-muted)]">
                      You are all caught up.
                    </p>
                  ) : (
                    <ul className="max-h-80 overflow-y-auto p-2">
                      {notifications.map((n) => (
                        <li key={n.id}>
                          <Link
                            to={n.to}
                            onClick={() => setBellOpen(false)}
                            className="flex gap-3 rounded-[var(--tm-radius-md)] px-3 py-3
                              transition-colors hover:bg-[var(--tm-bg-sunken)]"
                          >
                            <span
                              className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
                                n.tone === 'bad'
                                  ? 'bg-[var(--tm-danger)]'
                                  : 'bg-[var(--tm-warning)]'
                              }`}
                            />
                            <span className="min-w-0">
                              <span className="block text-[13px] font-semibold text-[var(--tm-ink)]">
                                {n.title}
                              </span>
                              <span className="block text-[12px] text-[var(--tm-ink-muted)]">
                                {n.body}
                              </span>
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* User */}
          {user && (
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen((o) => !o)}
                className="flex items-center gap-2.5 rounded-full border border-[var(--tm-border)]
                  bg-[var(--tm-card)] py-1.5 pl-1.5 pr-3 transition-colors
                  hover:border-[var(--tm-border-strong)]"
              >
                <Avatar name={user.name} src={user.avatarUrl} size="md" />
                <span className="hidden text-left leading-tight sm:block">
                  <span className="block text-[13px] font-bold text-[var(--tm-ink)]">
                    {user.name}
                  </span>
                  <span className="block text-[11.5px] text-[var(--tm-ink-muted)]">
                    {user.jobTitle}
                  </span>
                </span>
                <ChevronDown className="hidden h-4 w-4 text-[var(--tm-ink-muted)] sm:block" />
              </button>

              <AnimatePresence>
                {menuOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -8, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -6, scale: 0.98 }}
                    transition={popTransition}
                    className="absolute right-0 top-[calc(100%+10px)] w-64 overflow-hidden
                      rounded-[var(--tm-radius-lg)] border border-[var(--tm-border)]
                      bg-[var(--tm-card)] shadow-soft-lg"
                  >
                    <div className="flex items-center gap-3 border-b border-[var(--tm-border)] px-5 py-4">
                      <Avatar name={user.name} src={user.avatarUrl} size="lg" />
                      <div className="min-w-0 leading-tight">
                        <div className="truncate text-[14px] font-bold text-[var(--tm-ink)]">
                          {user.name}
                        </div>
                        <div className="truncate text-[12px] text-[var(--tm-ink-muted)]">
                          {user.jobTitle}
                        </div>
                        <div className="mt-1.5 flex items-center gap-1.5">
                          {isAdmin && (
                            <Badge
                              variant={user.company === 'piixel' ? 'piixel' : 'unwork'}
                              size="sm"
                              className="capitalize"
                            >
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
                    </div>

                    <div className="p-2">
                      {user.role === 'employee' && (
                        <Link
                          to={`${prefix}/profile`}
                          onClick={() => setMenuOpen(false)}
                          className="flex items-center gap-3 rounded-[var(--tm-radius-md)] px-3 py-2.5
                            text-[13px] font-semibold text-[var(--tm-ink-soft)]
                            transition-colors hover:bg-[var(--tm-bg-sunken)] hover:text-[var(--tm-ink)]"
                        >
                          <UserIcon className="h-4 w-4" /> My profile
                        </Link>
                      )}
                      {isAdmin && (
                        <Link
                          to={`${prefix}/settings`}
                          onClick={() => setMenuOpen(false)}
                          className="flex items-center gap-3 rounded-[var(--tm-radius-md)] px-3 py-2.5
                            text-[13px] font-semibold text-[var(--tm-ink-soft)]
                            transition-colors hover:bg-[var(--tm-bg-sunken)] hover:text-[var(--tm-ink)]"
                        >
                          <Settings className="h-4 w-4" /> Settings
                        </Link>
                      )}
                      <button
                        onClick={async () => {
                          setMenuOpen(false);
                          await logout();
                          navigate('/login');
                        }}
                        className="flex w-full items-center gap-3 rounded-[var(--tm-radius-md)] px-3 py-2.5
                          text-[13px] font-semibold text-[var(--tm-danger)]
                          transition-colors hover:bg-[var(--tm-danger-bg)]"
                      >
                        <LogOut className="h-4 w-4" /> Sign out
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>
      </header>

      <CommandPalette isOpen={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </>
  );
};
