import React from 'react';
import { NavLink } from 'react-router-dom';
import { CalendarClock, ClipboardList, Home, Layers, MessageSquare, ShieldQuestion } from 'lucide-react';
import { useChatStore } from '../../store/useChatStore';
import { AccountMenu } from './AccountMenu';
import { RouteTransition } from './RouteTransition';
import { useNotificationSync } from '../../features/notifications/useNotificationSync';
import { useChatRealtime } from '../../features/chat/useChatRealtime';
import { usePendingApprovals } from '../../features/client/usePendingApprovals';

/** The client portal shell: a plain top bar with six sections. Clients get nothing else in the app. */
export const ClientLayout: React.FC = () => {
  const unreadChats = useChatStore((s) => s.groups.reduce((n, g) => n + g.unread_count, 0));
  const { items: pending } = usePendingApprovals();

  // Live toasts and chat (messages, ticks, approvals) need the WebSocket, which the team layouts open from their top bar.
  useNotificationSync();
  useChatRealtime();

  const links = [
    { to: '/client/home', label: 'Home', icon: Home, count: 0 },
    { to: '/client/chats', label: 'Chats', icon: MessageSquare, count: unreadChats },
    { to: '/client/approvals', label: 'Approvals', icon: ShieldQuestion, count: pending.length },
    { to: '/client/deliverables', label: 'Deliverables', icon: Layers, count: 0 },
    { to: '/client/requirements', label: 'Requirements', icon: ClipboardList, count: 0 },
    { to: '/client/meetings', label: 'Book a meeting', icon: CalendarClock, count: 0 }
  ];

  return (
    <div className="flex min-h-screen flex-col bg-[var(--tm-bg)]">
      <header className="sticky top-0 z-30 border-b border-[var(--tm-border)] bg-[color-mix(in_srgb,var(--tm-bg)_88%,transparent)] backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-[1200px] items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--tm-primary)] text-[16px] font-extrabold text-white">P</div>
            <span className="hidden text-[15px] font-extrabold tracking-[-0.02em] text-[var(--tm-ink)] sm:block">Client Portal</span>
          </div>
          <div className="flex items-center gap-3">
            <AccountMenu />
          </div>
        </div>

        <nav aria-label="Portal sections" className="mx-auto w-full max-w-[1200px] overflow-x-auto px-4 sm:px-6">
          <ul className="flex min-w-max gap-1 pb-2">
            {links.map(({ to, label, icon: Icon, count }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  className={({ isActive }) =>
                    `flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-semibold transition-colors ${
                      isActive
                        ? 'bg-[var(--tm-primary-soft)] text-[var(--tm-primary-dark)]'
                        : 'text-[var(--tm-ink-soft)] hover:bg-[var(--tm-bg-sunken)] hover:text-[var(--tm-ink)]'
                    }`
                  }
                >
                  <Icon className="h-4 w-4" />
                  {label}
                  {count > 0 && (
                    <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[var(--tm-danger)] px-1.5 text-[11px] font-extrabold text-white" aria-label={`${count} waiting`}>
                      {count > 99 ? '99+' : count}
                    </span>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-[1200px] flex-1 px-4 py-6 sm:px-6 lg:py-8">
        <RouteTransition className="space-y-6 lg:space-y-7" />
      </main>
    </div>
  );
};
