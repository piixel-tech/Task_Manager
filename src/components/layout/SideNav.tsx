import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { MoreHorizontal } from 'lucide-react';
import { motion } from 'motion/react';
import { useMotionPrefs } from '../ui/useMotionPrefs';
import { spring } from '../ui/motion';
import { CountBadge } from '../ui/CountBadge';
import { WithNavItems, type NavItem, type NavModel } from './navItems';

/** Every item is the same size: icon over a one-line label. */
const ITEM =
  'relative flex h-14 w-[60px] flex-col items-center justify-center gap-1 rounded-[20px] text-center ' +
  'transition-colors duration-[var(--tm-dur-fast)]';

const ITEM_H = 56;
const GAP = 4;
const DIVIDER_H = 13; // h-px + my-1.5

/** Rail-only short labels; the full name stays in the tooltip. */
const SHORT_LABEL: Record<string, string> = {
  'Office board': 'Board',
  'Monthly Wrapped': 'Wrapped',
  'Daily Updates': 'Daily',
  'Team Members': 'Team',
  'Book a meeting': 'Meetings',
  Deliverables: 'Deliver',
  Requirements: 'Reqs'
};

/** Group order inside the rail. Anything not listed lands in "work", so no item is ever dropped. */
const MAIN = ['Home', 'Projects', 'My Tasks', 'Task Hub', 'Chats', 'Inbox', 'Calendar'];
const WORK = ['Reviews', 'Office board', 'Monthly Wrapped'];
const BOTTOM = ['My Profile', 'Settings'];

const rank = (order: string[], item: NavItem) => order.indexOf(item.label);

const Divider: React.FC = () => <span aria-hidden className="my-1.5 h-px w-8 shrink-0 bg-[var(--tm-border)]" />;

const SideNavBody: React.FC<NavModel> = ({ main, more }) => {
  const { reduced } = useMotionPrefs();
  const location = useLocation();
  const navRef = useRef<HTMLElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  const [visibleCount, setVisibleCount] = useState(Infinity);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ left: 0, bottom: 0 });
  const all = [...main, ...more];

  const top = all.filter((i) => MAIN.includes(i.label)).sort((a, b) => rank(MAIN, a) - rank(MAIN, b));
  const bottom = all.filter((i) => BOTTOM.includes(i.label)).sort((a, b) => rank(BOTTOM, a) - rank(BOTTOM, b));
  const work = all
    .filter((i) => !MAIN.includes(i.label) && !BOTTOM.includes(i.label))
    .sort((a, b) => {
      const ra = rank(WORK, a);
      const rb = rank(WORK, b);
      return (ra < 0 ? 99 : ra) - (rb < 0 ? 99 : rb);
    });

  // One priority-ordered list with each item's group, so the tail can be cut when the screen is short.
  const ordered = [
    ...top.map((item) => ({ item, group: 0 })),
    ...work.map((item) => ({ item, group: 1 })),
    ...bottom.map((item) => ({ item, group: 2 }))
  ];
  const total = ordered.length;
  const key = ordered.map((o) => `${o.item.label}:${o.group}`).join('|');

  useLayoutEffect(() => {
    const el = navRef.current;
    if (!el) return;
    const measure = () => {
      const avail = el.clientHeight - 24; // py-3
      const heightOf = (n: number) => {
        let h = 0;
        for (let k = 0; k < n; k++) {
          if (k > 0) h += GAP + (ordered[k].group !== ordered[k - 1].group ? DIVIDER_H + GAP : 0);
          h += ITEM_H;
        }
        return h;
      };
      if (heightOf(total) <= avail) return setVisibleCount(total);
      // Reserve room for the More button and its divider.
      const reserve = GAP + DIVIDER_H + GAP + ITEM_H;
      let n = 0;
      while (n < total && heightOf(n + 1) + reserve <= avail) n++;
      setVisibleCount(n);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const shown = ordered.slice(0, visibleCount);
  const hidden = ordered.slice(visibleCount).map((o) => o.item);
  const hiddenActive = hidden.some((i) => location.pathname.startsWith(i.path));
  const hiddenCount = hidden.reduce((n, i) => n + (i.count ?? 0), 0);

  useEffect(() => setOpen(false), [location.pathname, hidden.length]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (moreRef.current?.contains(t) || t.closest?.('[data-rail-more]')) return;
      setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [open]);

  const toggleMore = () => {
    const r = moreRef.current?.getBoundingClientRect();
    if (r) setPos({ left: r.right + 12, bottom: Math.max(16, window.innerHeight - r.bottom) });
    setOpen((o) => !o);
  };

  const renderItem = (item: NavItem) => {
    const Icon = item.icon;
    return (
      <NavLink key={item.path} to={item.path} title={item.label} aria-label={item.label} className="block shrink-0 rounded-[20px]">
        {({ isActive }) => (
          <span
            className={`${ITEM} ${
              isActive
                ? 'text-[var(--tm-solid-ink)]'
                : 'text-[var(--tm-ink-soft)] hover:bg-[var(--tm-bg-sunken)] hover:text-[var(--tm-ink)]'
            }`}
          >
            {isActive && (
              <motion.span
                layoutId={reduced ? undefined : 'sidenav-pill'}
                transition={reduced ? { duration: 0 } : { ...spring, stiffness: 520, damping: 30 }}
                className="absolute inset-0 rounded-[20px] bg-[var(--tm-solid)]"
              />
            )}
            <span className="relative grid h-5 w-5 shrink-0 place-items-center">
              <Icon className="h-5 w-5" strokeWidth={2} />
              <CountBadge count={item.count} className="absolute -right-2.5 -top-2" />
            </span>
            <span className="relative w-full overflow-hidden text-ellipsis whitespace-nowrap px-1 text-[10px] font-bold leading-none">
              {SHORT_LABEL[item.label] ?? item.label}
            </span>
          </span>
        )}
      </NavLink>
    );
  };

  return (
    <>
      <nav
        ref={navRef}
        aria-label="Main"
        className="tm-sidebar fixed bottom-4 left-4 top-[88px] z-30 hidden w-[72px] flex-col items-center gap-1 overflow-hidden
          rounded-full px-1.5 py-3 lg:flex"
      >
        {shown.map(({ item, group }, k) => (
          <React.Fragment key={item.path}>
            {k > 0 && group !== shown[k - 1].group && <Divider />}
            {/* With nothing hidden, the last group sits at the bottom of the rail. */}
            {hidden.length === 0 && group === 2 && shown[k - 1]?.group !== 2 ? (
              <div className="mt-auto flex flex-col items-center gap-1">{renderItem(item)}</div>
            ) : (
              renderItem(item)
            )}
          </React.Fragment>
        ))}
        {hidden.length > 0 && (
          <div className="mt-auto flex flex-col items-center gap-1">
            <Divider />
            <button
              ref={moreRef}
              type="button"
              onClick={toggleMore}
              aria-haspopup="menu"
              aria-expanded={open}
              title="More"
              className={`${ITEM} ${
                open || hiddenActive
                  ? 'bg-[var(--tm-solid)] text-[var(--tm-solid-ink)]'
                  : 'text-[var(--tm-ink-soft)] hover:bg-[var(--tm-bg-sunken)] hover:text-[var(--tm-ink)]'
              }`}
            >
              <span className="relative grid h-5 w-5 place-items-center">
                <MoreHorizontal className="h-5 w-5" strokeWidth={2} />
                <CountBadge count={hiddenCount} className="absolute -right-2.5 -top-2" />
              </span>
              <span className="text-[10px] font-bold leading-none">More</span>
            </button>
          </div>
        )}
      </nav>
      {open && hidden.length > 0 && (
        <div
          data-rail-more
          role="menu"
          style={{ left: pos.left, bottom: pos.bottom }}
          className="glass-strong fixed z-40 hidden max-h-[calc(100vh-32px)] min-w-[200px] flex-col gap-1 overflow-y-auto rounded-[24px] p-2 lg:flex"
        >
          {hidden.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                role="menuitem"
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-full px-4 py-2.5 text-[13.5px] font-bold transition-colors ${
                    isActive
                      ? 'bg-[var(--tm-primary-soft)] text-[var(--tm-ink)]'
                      : 'text-[var(--tm-ink-soft)] hover:bg-[var(--tm-bg-sunken)] hover:text-[var(--tm-ink)]'
                  }`
                }
              >
                <Icon className="h-5 w-5 shrink-0" strokeWidth={2} />
                <span className="flex-1 whitespace-nowrap">{item.label}</span>
                <CountBadge count={item.count} className="!h-5 !min-w-5 !px-1.5 !text-[11px]" />
              </NavLink>
            );
          })}
        </div>
      )}
    </>
  );
};

/** The slim vertical charcoal pill fixed to the left of the screen (desktop): grouped nav items; what doesn't fit the height collapses into a More popover. Phones use the drawer and the bottom tab bar. */
export const SideNav: React.FC = () => <WithNavItems>{(nav) => <SideNavBody {...nav} />}</WithNavItems>;
