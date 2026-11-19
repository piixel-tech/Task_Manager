import React, { useEffect, useRef } from 'react';
import { NavLink } from 'react-router-dom';
import { useAppStore } from '../../store/useAppStore';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import { useIsPhone } from '../../hooks/useBreakpoint';
import { AuthImage } from '../ui/AuthImage';
import { CountBadge } from '../ui/CountBadge';
import { WithNavItems, type NavItem } from './navItems';

/** The rail's short names, so a label fits under its icon. */
const SHORT: Record<string, string> = {
  'My Tasks': 'Tasks',
  'Task Hub': 'Tasks',
  'Office board': 'Board',
  Inbox: 'Activity',
  'Leave requests': 'Leave',
  'Monthly Report': 'Report',
  'Team Members': 'Team',
  'Book a meeting': 'Meetings',
  Deliverables: 'Deliver',
  Requirements: 'Reqs'
};

/**
 * Phones only (under 768px): the menu button opens a slim dark pill on the left edge, with every place in one column (icon over a small
 * label), a thin divider between the main places and the rest, and the active place in lavender. It slides in over a dimmed page; tapping
 * outside, swiping left, Esc or choosing a place closes it. It reads the same list as the rail, so the roles' own items are always right.
 */
export const PhoneDrawer: React.FC = () => {
  const phone = useIsPhone();
  const { sidebarOpen, closeSidebar } = useAppStore();
  const workspace = useWorkspaceStore((s) => s.workspace);
  const swipe = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!phone || !sidebarOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeSidebar();
    const before = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = before;
      document.removeEventListener('keydown', onKey);
    };
  }, [phone, sidebarOpen, closeSidebar]);

  // Resizing past the phone width must not leave the page locked behind a hidden drawer.
  useEffect(() => {
    if (!phone && sidebarOpen) closeSidebar();
  }, [phone, sidebarOpen, closeSidebar]);

  if (!phone) return null;

  const item = (i: NavItem) => {
    const Icon = i.icon;
    return (
      <NavLink
        key={i.path}
        to={i.path}
        onClick={closeSidebar}
        aria-label={i.label}
        className={({ isActive }) =>
          `relative flex min-h-[58px] w-full shrink-0 flex-col items-center justify-center gap-1 rounded-[20px] px-0.5 text-[10px] leading-none transition-colors ${
            isActive ? 'bg-[var(--tm-solid)] font-bold text-[var(--tm-solid-ink)]' : 'font-semibold text-[var(--tm-ink-soft)]'
          }`
        }
      >
        {({ isActive }) => (
          <>
            <span className="relative">
              <Icon className="h-5 w-5" strokeWidth={isActive ? 2.4 : 2} />
              <CountBadge count={i.count} className="absolute -right-2.5 -top-2" />
            </span>
            <span className="w-full truncate px-0.5 text-center">{SHORT[i.label] ?? i.label}</span>
          </>
        )}
      </NavLink>
    );
  };

  return (
    <>
      <div
        aria-hidden
        onClick={closeSidebar}
        className={`fixed inset-0 z-40 bg-[var(--tm-scrim)] backdrop-blur-[4px] transition-opacity duration-200 md:hidden ${sidebarOpen ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
      />
      <aside
        aria-label="Menu"
        aria-hidden={!sidebarOpen}
        onTouchStart={(e) => {
          swipe.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        }}
        onTouchEnd={(e) => {
          const s = swipe.current;
          swipe.current = null;
          if (!s) return;
          const dx = e.changedTouches[0].clientX - s.x;
          const dy = e.changedTouches[0].clientY - s.y;
          if (dx < -50 && Math.abs(dx) > Math.abs(dy) * 1.5) closeSidebar();
        }}
        className={`tm-sidebar fixed bottom-[calc(0.75rem+env(safe-area-inset-bottom))] left-[calc(0.75rem+env(safe-area-inset-left))] top-[calc(0.75rem+env(safe-area-inset-top))] z-[45] flex w-[76px] flex-col items-center rounded-full px-1.5 py-3 transition-[transform,visibility] duration-300 ease-[var(--tm-ease)] md:hidden ${
          sidebarOpen ? 'translate-x-0' : 'invisible -translate-x-[130%]'
        }`}
      >
        <div className="mb-2 shrink-0">
          {workspace?.logo_url ? (
            <AuthImage url={workspace.logo_url} alt="" className="h-10 w-10 rounded-full object-cover" />
          ) : (
            <div className="grid h-10 w-10 place-items-center rounded-full bg-[var(--tm-solid)] text-[16px] font-extrabold text-[var(--tm-solid-ink)]">
              {(workspace?.name ?? 'Task Manager')[0].toUpperCase()}
            </div>
          )}
        </div>
        <nav aria-label="Menu" className="flex min-h-0 w-full flex-1 flex-col items-center gap-1 overflow-y-auto overscroll-contain scrollbar-none">
          <WithNavItems>
            {({ main, more }) => (
              <>
                {main.map(item)}
                {more.length > 0 && <div role="separator" className="my-1.5 h-px w-8 shrink-0 bg-[var(--tm-border-strong)]" />}
                {more.map(item)}
              </>
            )}
          </WithNavItems>
        </nav>
      </aside>
    </>
  );
};
