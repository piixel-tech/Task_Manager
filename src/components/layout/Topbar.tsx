import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { Bell, Calendar, Clock, Menu, Search, Shield } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useAppStore } from '../../store/useAppStore';
import { useNotificationStore } from '../../store/useNotificationStore';
import { useDailyStatusStore } from '../../store/useDailyStatusStore';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import { statusMeta } from '../../features/status/statusMeta';
import { basePath } from '../../features/settings/settingsMenu';
import { formatDate } from '../../utils/time';
import { AuthImage } from '../ui/AuthImage';
import { UserAvatar } from '../ui/UserAvatar';
import { useNotificationSync } from '../../features/notifications/useNotificationSync';
import { useChatRealtime } from '../../features/chat/useChatRealtime';
import { AccountMenu } from './AccountMenu';
import { CommandPalette } from './CommandPalette';
import { FocusMenu } from '../../features/focus/FocusMenu';
import { ShortcutsModal } from '../../features/shortcuts/ShortcutList';
import { useShortcuts } from '../../features/shortcuts/shortcuts';
import { AllCaughtUp, NotificationGroups, NotificationSkeleton } from '../../features/notifications/notificationVisuals';
import { useMotionPrefs } from '../ui/useMotionPrefs';
import { EASE_OUT, popoverVariants } from '../ui/motion';

/** Round header button: card-coloured, charcoal on hover. */
const ICON_BTN =
  'relative grid h-11 w-11 shrink-0 place-items-center rounded-full border border-[var(--tm-border)] bg-[var(--tm-card)] ' +
  'text-[var(--tm-ink)] shadow-soft-xs transition-colors hover:border-transparent hover:bg-[var(--tm-solid)] ' +
  'hover:text-[var(--tm-solid-ink)]';

/** The top header every role shares: logo, centred nav pill, icon buttons and the avatar menu. */
export const Topbar: React.FC = () => {
  const { user } = useAuthStore();
  const { toggleSidebar, toastMessage } = useAppStore();
  const navigate = useNavigate();
  const { reduced } = useMotionPrefs();
  const workspace = useWorkspaceStore((s) => s.workspace);
  useEffect(() => {
    void useWorkspaceStore.getState().load();
  }, []);

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);

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
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  useShortcuts();
  const todayStatus = useDailyStatusStore((state) => state.today?.status);
  const openStatusEditor = useDailyStatusStore((state) => state.openEditor);
  const statusInfo = statusMeta(todayStatus);
  const isAdmin = user?.role === 'admin';
  const isClient = user?.role === 'client';
  const prefix = basePath(user?.role);

  // Loads notifications and keeps them live over the WebSocket.
  useNotificationSync();
  // Chat stays live (unread badges, ticks) wherever you are in the app.
  useChatRealtime();

  const { notifications, unreadCount, isLoading, markAsRead, markAllAsRead } = useNotificationStore();

  // Presentation only: wiggle the bell whenever the unread count goes up.
  const [ring, setRing] = useState(0);
  const prevUnread = useRef(unreadCount);
  useEffect(() => {
    if (unreadCount > prevUnread.current) setRing((r) => r + 1);
    prevUnread.current = unreadCount;
  }, [unreadCount]);

  const popTransition = { duration: reduced ? 0 : 0.2, ease: EASE_OUT };

  return (
    <>
      <header
        className="tm-topbar sticky top-0 z-30 bg-[color-mix(in_srgb,var(--tm-bg)_84%,transparent)] backdrop-blur-xl"
      >
        <div className="relative mx-auto flex h-[76px] w-full max-w-[1600px] items-center justify-between gap-3 px-4 sm:px-6 lg:pl-[108px] lg:pr-8">
          {/* Left: menu toggle (phones) + logo */}
          <div className="flex min-w-0 items-center gap-3">
            <button
              onClick={toggleSidebar}
              className={`${ICON_BTN} lg:hidden`}
              aria-label="Toggle menu"
            >
              <Menu className="h-5 w-5" />
            </button>

            <Link to="/" className="flex shrink-0 items-center gap-3" aria-label="Home">
              {/* On desktop the logo is centred over the 96px nav rail (fixed left-4) */}
              <span className="grid shrink-0 place-items-center lg:fixed lg:left-4 lg:top-4 lg:z-30 lg:w-[72px]">
                {workspace?.logo_url ? (
                  <AuthImage url={workspace.logo_url} alt="" className="h-11 w-11 shrink-0 rounded-full object-cover shadow-soft-sm" />
                ) : (
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[var(--tm-solid)] text-[17px] font-extrabold text-[var(--tm-solid-ink)] shadow-soft-sm">
                    {(workspace?.name ?? 'Task Manager')[0].toUpperCase()}
                  </div>
                )}
              </span>
              <div className="hidden whitespace-nowrap leading-tight sm:block">
                <div className="truncate text-[15.5px] font-extrabold tracking-[-0.02em] text-[var(--tm-ink)]">
                  {workspace?.name ?? 'Task Manager'}
                </div>
                <div className="flex items-center gap-1 text-[11.5px] font-bold text-[var(--tm-ink-muted)]">
                  {isAdmin ? (
                    <>
                      <Shield className="h-3.5 w-3.5" />
                      <span>Admin Console</span>
                    </>
                  ) : isClient ? (
                    'Client Portal'
                  ) : (
                    'Workspace'
                  )}
                </div>
              </div>
            </Link>
          </div>

          {/* Right: status, search, calendar, notifications, settings, avatar */}
          <div className="flex shrink-0 items-center justify-end gap-2">
            {user && !isClient && (
              <button
                type="button"
                onClick={openStatusEditor}
                title="Change today's status"
                className="hidden items-center gap-2 rounded-full bg-[var(--tm-card)] p-1 pr-1.5 text-[12px] font-semibold
                  text-[var(--tm-ink)] shadow-soft-xs transition-all hover:-translate-y-px 2xl:flex"
              >
                <span className="flex items-center gap-1.5 rounded-full bg-[var(--tm-solid)] px-3 py-1.5 text-[11.5px] font-bold text-[var(--tm-solid-ink)]">
                  <Clock className="h-3.5 w-3.5 text-[var(--tm-solid-accent)]" />
                  {formatDate(new Date().toISOString(), 'd MMM')}
                </span>
                <span
                  className={`flex items-center gap-2 rounded-full py-1 pl-1 pr-3 ${
                    statusInfo ? 'bg-[var(--tm-accent)] text-[var(--tm-accent-ink)]' : 'bg-[var(--tm-bg-sunken)] text-[var(--tm-ink-soft)]'
                  }`}
                >
                  <UserAvatar user={user} size="xs" ring />
                  {statusInfo ? statusInfo.label : 'Set status'}
                </span>
              </button>
            )}
            {user && !isClient && (
              <button
                type="button"
                onClick={openStatusEditor}
                title={statusInfo ? `Today: ${statusInfo.label}` : "Change today's status"}
                aria-label="Change today's status"
                className={`${ICON_BTN} hidden lg:grid 2xl:hidden`}
              >
                <Clock className="h-4 w-4" />
                {statusInfo && (
                  <span className="absolute right-0.5 top-0.5 h-2.5 w-2.5 rounded-full bg-[var(--tm-accent)] ring-2 ring-[var(--tm-bg)]" />
                )}
              </button>
            )}

            {user && !isClient && <FocusMenu />}

            <button type="button" onClick={() => setPaletteOpen(true)} aria-label="Search" title="Search (Ctrl+K)" className={ICON_BTN}>
              <Search className="h-4 w-4" />
            </button>

            {!isClient && (
              <Link to={`${prefix}/calendar`} aria-label="Calendar" title="Calendar" className={`${ICON_BTN} hidden sm:grid`}>
                <Calendar className="h-4 w-4" />
              </Link>
            )}

            {/* Notifications bell */}
            <div className="relative flex items-center" ref={bellRef}>
              <button onClick={() => setBellOpen((o) => !o)} aria-label="Notifications" title="Notifications" className={ICON_BTN}>
                <motion.span
                  key={ring}
                  className="grid place-items-center"
                  style={{ transformOrigin: '50% 10%' }}
                  animate={ring > 0 && !reduced ? { rotate: [0, -18, 16, -12, 8, 0] } : undefined}
                  transition={{ duration: 0.6, ease: EASE_OUT }}
                >
                  <Bell className="h-4 w-4" />
                </motion.span>
                <AnimatePresence>
                  {unreadCount > 0 && (
                    <motion.span
                      key={unreadCount}
                      initial={reduced ? false : { scale: 0.4, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.4, opacity: 0, transition: { duration: 0.12 } }}
                      transition={{ type: 'spring', stiffness: 520, damping: 18 }}
                      className="absolute -top-1 -right-1 grid h-4.5 min-w-[18px] place-items-center
                        rounded-full bg-[var(--tm-danger)] px-1 text-[10px] font-extrabold text-[var(--tm-on-primary)]
                        ring-2 ring-[var(--tm-bg)] shadow-xs"
                    >
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </motion.span>
                  )}
                </AnimatePresence>
              </button>

              <AnimatePresence>
                {bellOpen && (
                  <motion.div
                    variants={popoverVariants}
                    initial={reduced ? 'show' : 'hidden'}
                    animate="show"
                    exit={reduced ? 'show' : 'exit'}
                    className="glass-strong absolute right-0 top-[calc(100%+10px)] z-50 w-96 max-w-[calc(100vw-2rem)] origin-top-right
                      overflow-hidden rounded-[var(--tm-radius-xl)]"
                  >
                    <div className="flex items-center justify-between border-b border-[var(--tm-border)] px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <h3 className="text-[14px] font-extrabold text-[var(--tm-ink)]">Notifications</h3>
                        {unreadCount > 0 && (
                          <span className="rounded-full bg-[var(--tm-danger-bg)] px-2 py-0.5 text-[10.5px] font-bold text-[var(--tm-danger)]">
                            {unreadCount} new
                          </span>
                        )}
                      </div>
                      {unreadCount > 0 && (
                        <button
                          onClick={() => markAllAsRead()}
                          className="text-[11.5px] font-bold text-[var(--tm-primary-dark)] hover:underline"
                        >
                          Mark all as read
                        </button>
                      )}
                    </div>

                    {isLoading && notifications.length === 0 ? (
                      <NotificationSkeleton />
                    ) : notifications.length === 0 ? (
                      <AllCaughtUp />
                    ) : (
                      <div className="max-h-[26rem] overflow-y-auto px-2 pb-1">
                        <NotificationGroups
                          items={notifications}
                          onOpen={(n) => {
                            markAsRead(n.id);
                            setBellOpen(false);
                            if (n.link) navigate(n.link);
                          }}
                        />
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <AccountMenu />
          </div>

          <AnimatePresence>
            {toastMessage && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={popTransition}
                className="pointer-events-none absolute left-1/2 top-full z-40 hidden -translate-x-1/2 items-center gap-2 rounded-full
                  bg-[var(--tm-success-bg)] px-3.5 py-2 text-[12px] font-semibold text-[var(--tm-success)] shadow-soft-sm md:flex"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--tm-success)]" />
                {toastMessage}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </header>

      <CommandPalette isOpen={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <ShortcutsModal />
    </>
  );
};
