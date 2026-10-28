import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { Bell, Clock, Menu, Shield } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useAppStore } from '../../store/useAppStore';
import { useNotificationStore } from '../../store/useNotificationStore';
import { useDailyStatusStore } from '../../store/useDailyStatusStore';
import { statusMeta } from '../../features/status/statusMeta';
import { formatTimeAgo } from '../../utils/time';
import { useNotificationSync } from '../../features/notifications/useNotificationSync';
import { useChatRealtime } from '../../features/chat/useChatRealtime';
import { AccountMenu } from './AccountMenu';
import { CommandPalette } from './CommandPalette';
import { FocusMenu } from '../../features/focus/FocusMenu';
import { ShortcutsModal } from '../../features/shortcuts/ShortcutList';
import { useShortcuts } from '../../features/shortcuts/shortcuts';
import { useMotionPrefs } from '../ui/useMotionPrefs';
import { EASE_OUT } from '../ui/motion';

export const Topbar: React.FC = () => {
  const { user } = useAuthStore();
  const { toggleSidebar, toastMessage } = useAppStore();
  const navigate = useNavigate();
  const { reduced } = useMotionPrefs();

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

  // Loads notifications and keeps them live over the WebSocket.
  useNotificationSync();
  // Chat stays live (unread badges, ticks) wherever you are in the app.
  useChatRealtime();

  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotificationStore();

  /** Red for things that need action, amber for reminders, accent otherwise. */
  const dotClass = (type: string) => {
    if (type === 'changes_requested' || type === 'review_changes_requested' || type === 'booking_cancelled') return 'bg-[var(--tm-danger)]';
    if (type === 'checklist_updated' || type === 'deliverables_updated') return 'bg-[var(--tm-info)]';
    if (type === 'task_due' || type === 'task_reminder') return 'bg-[var(--tm-warning)]';
    if (type === 'task_approved' || type === 'review_approved' || type === 'office_resolved') return 'bg-[var(--tm-success)]';
    if (type === 'office_post' || type === 'office_reopened') return 'bg-[var(--tm-info)]';
    return 'bg-[var(--tm-primary)]';
  };

  const popTransition = { duration: reduced ? 0 : 0.2, ease: EASE_OUT };

  return (
    <>
      <header
        className="sticky top-0 z-30 flex h-[72px] items-center justify-between gap-4
          border-b border-[var(--tm-border)] bg-[color-mix(in_srgb,var(--tm-bg)_82%,transparent)]
          px-4 backdrop-blur-xl lg:px-8"
      >
        {/* Left: menu toggle + admin console badge */}
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
            <div className="flex items-center gap-1.5 rounded-full bg-[#0F1F17] px-3.5 py-1.5 text-[11.5px] font-extrabold text-emerald-400 border border-emerald-800/40 shadow-xs">
              <Shield className="h-3.5 w-3.5 text-emerald-400" />
              <span>Admin Console</span>
            </div>
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

        {/* Right: status, bell (immediately left of profile avatar), user */}
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          {user && user.role !== 'client' && (
            <button
              type="button"
              onClick={openStatusEditor}
              title="Change today's status"
              className={`hidden items-center gap-2 rounded-full px-3.5 py-2 text-[12px] font-semibold lg:flex ${
                statusInfo
                  ? 'bg-[var(--tm-success-bg)] text-[var(--tm-success)]'
                  : 'bg-[var(--tm-neutral-bg)] text-[var(--tm-neutral)]'
              }`}
            >
              <Clock className="h-3.5 w-3.5" />
              {statusInfo ? statusInfo.label : 'Set status'}
            </button>
          )}

          {user && user.role !== 'client' && <FocusMenu />}

          {/* Notifications bell placed immediately left of profile avatar */}
          <div className="relative flex items-center" ref={bellRef}>
            <button
              onClick={() => setBellOpen((o) => !o)}
              aria-label="Notifications"
              className="relative grid h-10 w-10 place-items-center rounded-full border
                border-[var(--tm-border)] bg-[var(--tm-card)] text-[var(--tm-ink-soft)]
                transition-colors hover:border-[var(--tm-border-strong)] hover:text-[var(--tm-ink)]"
            >
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && (
                <span
                  className="absolute -top-1 -right-1 grid h-4.5 min-w-[18px] place-items-center
                    rounded-full bg-red-600 px-1 text-[10px] font-extrabold text-white
                    ring-2 ring-[var(--tm-card)] shadow-xs"
                >
                  {unreadCount > 99 ? '99+' : unreadCount}
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
                  className="absolute right-0 top-[calc(100%+8px)] w-88 overflow-hidden
                    rounded-[var(--tm-radius-lg)] border border-[var(--tm-border)]
                    bg-[var(--tm-card)] shadow-soft-lg z-50"
                >
                  <div className="flex items-center justify-between border-b border-[var(--tm-border)] px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      <h3 className="text-[14px] font-extrabold text-[var(--tm-ink)]">Notifications</h3>
                      {unreadCount > 0 && (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10.5px] font-bold text-red-600">
                          {unreadCount} new
                        </span>
                      )}
                    </div>
                    {unreadCount > 0 && (
                      <button
                        onClick={() => markAllAsRead()}
                        className="text-[11.5px] font-bold text-[var(--tm-primary)] hover:underline"
                      >
                        Mark all as read
                      </button>
                    )}
                  </div>

                  {notifications.length === 0 ? (
                    <p className="px-5 py-8 text-center text-[13px] text-[var(--tm-ink-muted)]">
                      You are all caught up.
                    </p>
                  ) : (
                    <ul className="max-h-80 overflow-y-auto p-2 divide-y divide-[var(--tm-border)]">
                      {notifications.map((n) => (
                        <li key={n.id}>
                          <button
                            type="button"
                            onClick={() => {
                              markAsRead(n.id);
                              setBellOpen(false);
                              if (n.link) navigate(n.link);
                            }}
                            className={`flex w-full gap-3 text-left rounded-[var(--tm-radius-md)] px-3 py-3
                              transition-colors hover:bg-[var(--tm-bg-sunken)] ${
                                !n.read ? 'bg-[var(--tm-primary-softer)]/60 border-l-2 border-[var(--tm-primary)]' : ''
                              }`}
                          >
                            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dotClass(n.type)}`} />
                            <span className="min-w-0 flex-1">
                              <span className="flex items-center justify-between gap-2">
                                <span className={`text-[13px] font-bold ${!n.read ? 'text-[var(--tm-ink)]' : 'text-[var(--tm-ink-soft)]'}`}>
                                  {n.title}
                                </span>
                                <span className="text-[10.5px] text-[var(--tm-ink-muted)] shrink-0 font-medium">
                                  {formatTimeAgo(n.createdAt)}
                                </span>
                              </span>
                              <span className="block text-[12px] text-[var(--tm-ink-muted)] mt-0.5 leading-snug">
                                {n.message}
                              </span>
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <AccountMenu />
        </div>
      </header>

      <CommandPalette isOpen={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <ShortcutsModal />
    </>
  );
};
