import React, { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Ellipsis } from 'lucide-react';
import { BottomSheet } from '../ui/BottomSheet';
import { CountBadge } from '../ui/CountBadge';
import { WithNavItems, type NavItem } from './navItems';

/** The four places that get their own button on a phone, in this order (the labels come from the shared nav list). */
const TEAM_TABS = ['Home', 'My Tasks', 'Task Hub', 'Projects', 'Chats'];
const TABS = 4;

/** The tabs: for the team Home, Tasks, Projects, Chats; for a client the first four of their own places. */
const split = (main: NavItem[], more: NavItem[]) => {
  const preferred = TEAM_TABS.map((l) => main.find((i) => i.label === l)).filter((i): i is NavItem => !!i);
  const tabs = preferred.length >= TABS ? preferred.slice(0, TABS) : main.slice(0, TABS);
  return { tabs, rest: [...main, ...more].filter((i) => !tabs.includes(i)) };
};

/**
 * Phones only (under 768px): the left rail becomes a dark pill floating above the bottom edge. The active place is lavender, badges
 * stay on the icons, and "More" opens a dark bottom sheet with every other place. It reads the same list as the rail, so they never drift.
 */
export const PhoneTabBar: React.FC = () => {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();

  return (
    <WithNavItems>
      {({ main, more }) => {
        const { tabs, rest } = split(main, more);
        const restCount = rest.reduce((n, i) => n + (i.count ?? 0), 0);
        const inRest = rest.some((i) => pathname === i.path || pathname.startsWith(`${i.path}/`));
        const cell = 'relative flex min-h-[52px] min-w-[44px] flex-1 flex-col items-center justify-center gap-0.5 rounded-full text-[10px] leading-none transition-colors';
        const on = 'bg-[var(--tm-solid)] font-bold text-[var(--tm-solid-ink)]';
        const off = 'font-semibold text-[var(--tm-ink-soft)]';
        return (
          <>
            <nav
              aria-label="Main"
              className="tm-sidebar fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-50 flex items-stretch justify-around gap-1 rounded-full p-1.5 md:hidden"
            >
              {tabs.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink key={item.path} to={item.path} className={({ isActive }) => `${cell} ${isActive ? on : off}`}>
                    {({ isActive }) => (
                      <>
                        <span className="relative">
                          <Icon className="h-5 w-5" strokeWidth={isActive ? 2.4 : 2} />
                          <CountBadge count={item.count} className="absolute -right-2.5 -top-2" />
                        </span>
                        <span className="max-w-full truncate px-0.5">{item.label}</span>
                      </>
                    )}
                  </NavLink>
                );
              })}
              <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" className={`${cell} ${inRest ? on : off}`}>
                <span className="relative">
                  <Ellipsis className="h-5 w-5" strokeWidth={inRest ? 2.4 : 2} />
                  <CountBadge count={restCount} className="absolute -right-2.5 -top-2" />
                </span>
                More
              </button>
            </nav>

            <BottomSheet dark isOpen={open} onClose={() => setOpen(false)} title="More">
              <ul className="grid grid-cols-3 gap-2">
                {rest.map((item) => {
                  const Icon = item.icon;
                  return (
                    <li key={item.path}>
                      <NavLink
                        to={item.path}
                        onClick={() => setOpen(false)}
                        className={({ isActive }) =>
                          `relative flex min-h-[84px] flex-col items-center justify-center gap-1.5 rounded-[var(--tm-radius-md)] px-1 py-3 text-center text-[12px] font-semibold leading-tight ${
                            isActive ? 'bg-[var(--tm-solid)] text-[var(--tm-solid-ink)]' : 'bg-[var(--tm-card-muted)] text-[var(--tm-ink-soft)]'
                          }`
                        }
                      >
                        <span className="relative">
                          <Icon className="h-[22px] w-[22px]" strokeWidth={2} />
                          <CountBadge count={item.count} className="absolute -right-3 -top-2" />
                        </span>
                        {item.label}
                      </NavLink>
                    </li>
                  );
                })}
              </ul>
            </BottomSheet>
          </>
        );
      }}
    </WithNavItems>
  );
};
