import React, { useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { Shield, X } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import { useAppStore } from '../../store/useAppStore';
import { AuthImage } from '../ui/AuthImage';
import { WithNavItems, type NavItem } from './navItems';

/** Phones only: the menu button in the header opens this drawer with every nav item (the header pill is desktop-only). */
export const NavDrawer: React.FC = () => {
  const { user } = useAuthStore();
  const { sidebarOpen, closeSidebar } = useAppStore();
  const workspace = useWorkspaceStore((s) => s.workspace);

  // Escape closes it, and the page behind it doesn't scroll.
  useEffect(() => {
    if (!sidebarOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeSidebar();
    document.addEventListener('keydown', onKey);
    const narrow = window.matchMedia('(max-width: 1023px)').matches;
    const before = document.body.style.overflow;
    if (narrow) document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = before;
    };
  }, [sidebarOpen, closeSidebar]);

  const isAdmin = user?.role === 'admin';
  const isClient = user?.role === 'client';

  const renderItem = (item: NavItem) => {
    const Icon = item.icon;
    return (
      <NavLink key={item.path} to={item.path} onClick={closeSidebar} className="block">
        {({ isActive }) => (
          <div
            className={`flex items-center gap-3 rounded-full py-2.5 pl-4 pr-3 text-[13.5px] font-semibold
              transition-colors duration-[var(--tm-dur-fast)] ${
                isActive
                  ? 'bg-[var(--tm-solid)] font-bold text-[var(--tm-solid-ink)]'
                  : 'text-[var(--tm-ink-soft)] hover:bg-[var(--tm-bg-sunken)] hover:text-[var(--tm-ink)]'
              }`}
          >
            <Icon className="h-[17px] w-[17px] shrink-0" strokeWidth={2.1} />
            <span className="flex-1 truncate">{item.label}</span>
            {!!item.count && item.count > 0 && (
              <span className="inline-flex min-w-[22px] items-center justify-center rounded-full bg-[var(--tm-accent)] px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-[var(--tm-accent-ink)]">
                {item.count}
              </span>
            )}
          </div>
        )}
      </NavLink>
    );
  };

  return (
    <div className="lg:hidden">
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-[var(--tm-scrim)] backdrop-blur-[4px]" onClick={closeSidebar} />
      )}

      <aside
        aria-label="Menu"
        className={`tm-sidebar fixed bottom-3 left-3 top-3 z-40 flex w-[280px] max-w-[calc(100vw-1.5rem)] flex-col rounded-[var(--tm-radius-xl)]
          transition-transform duration-[var(--tm-dur-slow)] ease-[var(--tm-ease)]
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-[110%]'}`}
      >
        <div className="flex items-center justify-between px-5 pb-4 pt-6">
          <div className="flex items-center gap-3">
            {workspace?.logo_url ? (
              <AuthImage url={workspace.logo_url} alt="" className="h-11 w-11 rounded-full object-cover shadow-soft-sm" />
            ) : (
              <div className="grid h-11 w-11 place-items-center rounded-full bg-[var(--tm-solid)] text-[17px] font-extrabold text-[var(--tm-solid-ink)] shadow-soft-sm">
                {(workspace?.name ?? 'Task Manager')[0].toUpperCase()}
              </div>
            )}
            <div className="leading-tight">
              <div className="text-[15.5px] font-extrabold tracking-[-0.02em] text-[var(--tm-ink)]">
                {workspace?.name ?? 'Task Manager'}
              </div>
              <div className="flex items-center gap-1 text-[11.5px] font-bold text-[var(--tm-ink-muted)]">
                {isAdmin ? (
                  <>
                    <Shield className="h-3.5 w-3.5" />
                    <span>Admin</span>
                  </>
                ) : isClient ? (
                  'Client Portal'
                ) : (
                  'Workspace'
                )}
              </div>
            </div>
          </div>
          <button
            onClick={closeSidebar}
            aria-label="Close menu"
            className="grid h-9 w-9 place-items-center rounded-full bg-[var(--tm-solid)] text-[var(--tm-solid-ink)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav aria-label="Menu" className="flex-1 overflow-y-auto px-4 pb-4">
          <WithNavItems>
            {({ main, more }) => (
              <>
                <div className="space-y-1">{main.map(renderItem)}</div>
                <div className="mb-2.5 mt-7 px-1 text-[10.5px] font-bold uppercase tracking-[0.14em] text-[var(--tm-ink-muted)]">
                  More
                </div>
                <div className="space-y-1">{more.map(renderItem)}</div>
              </>
            )}
          </WithNavItems>
        </nav>

        <div className="mx-4 mb-4 flex items-center justify-between rounded-full bg-[var(--tm-card-muted)] px-5 py-3">
          <span className="text-[11px] font-semibold text-[var(--tm-ink-muted)]">v2.5.0</span>
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[var(--tm-success)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--tm-success)]" />
            Connected
          </span>
        </div>
      </aside>
    </div>
  );
};
