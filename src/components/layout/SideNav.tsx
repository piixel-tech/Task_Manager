import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { MoreHorizontal } from 'lucide-react';
import { motion } from 'motion/react';
import { useMotionPrefs } from '../ui/useMotionPrefs';
import { spring } from '../ui/motion';
import { CountBadge } from '../ui/CountBadge';
import { WithNavItems, type NavItem, type NavModel } from './navItems';
import { RailTimer } from '../../features/tasks/components/RailTimer';
import { useAuthStore } from '../../store/authStore';

/** Every item is the same size: icon over a one-line label. On short screens the rail goes "dense": slightly lower items, tighter gaps. */
const itemClass = (dense: boolean) =>
  `relative flex ${dense ? 'h-[52px]' : 'h-14'} w-[60px] flex-col items-center justify-center gap-1 rounded-[20px] text-center ` +
  'transition-colors duration-[var(--tm-dur-fast)]';

/** Sizes the fit calculation needs, in px, for the normal and the dense rail. */
const METRICS = {
  normal: { item: 56, gap: 4, divider: 13, pad: 80 }, // divider = h-px + my-1.5; pad = py-10 top and bottom
  dense: { item: 52, gap: 2, divider: 9, pad: 64 } // my-1; py-8
};

/** Rail-only short labels; the full name stays in the tooltip. */
const SHORT_LABEL: Record<string, string> = {
  'Office board': 'Board',
  'Leave requests': 'Leave',
  'Team Members': 'Team',
  'Book a meeting': 'Meetings',
  Deliverables: 'Deliver',
  Requirements: 'Reqs'
};

/** Group order inside the rail. Anything not listed lands in "work", so no item is ever dropped. */
const MAIN = ['Home', 'Projects', 'My Tasks', 'Task Hub', 'Chats', 'Activity', 'Calendar', 'Leave', 'Leave requests'];
const WORK = ['Reviews', 'Office board'];
const BOTTOM = ['Settings'];

/** Never moved into More. */
const PINNED = ['Home', 'Calendar'];
/** When the rail is too short, these move into More first, in this order. Then the rest from the bottom up. */
const MOVE_FIRST = ['Office board', 'Reviews', 'Activity'];

const rank = (order: string[], item: NavItem) => order.indexOf(item.label);

const Divider: React.FC<{ dense: boolean }> = ({ dense }) => (
  <span aria-hidden className={`${dense ? 'my-1' : 'my-1.5'} h-px w-8 shrink-0 bg-[var(--tm-border)]`} />
);

interface Entry {
  item: NavItem;
  group: number;
}

/** What fits in `avail` px: everything at normal spacing if it can, else the dense rail with items moved into More one by one. */
/** Height the timer at the bottom of the rail takes (divider, gaps and the 44px button). */
export const TIMER_SLOT = 64;

export function fitRail(ordered: Entry[], avail: number, reserve = 0): { dense: boolean; hidden: string[] } {
  avail -= reserve;
  const labels = ordered.map((o) => o.item.label);
  const cutOrder = [
    ...MOVE_FIRST.filter((l) => labels.includes(l)),
    ...[...labels].reverse().filter((l) => !MOVE_FIRST.includes(l) && !PINNED.includes(l))
  ];
  const heightOf = (list: Entry[], m: (typeof METRICS)['normal']) =>
    list.reduce((h, o, k) => h + m.item + (k > 0 ? m.gap + (o.group !== list[k - 1].group ? m.divider + m.gap : 0) : 0), 0);
  const fits = (list: Entry[], m: (typeof METRICS)['normal'], withMore: boolean) =>
    heightOf(list, m) + (withMore ? m.gap + m.divider + m.gap + m.item : 0) <= avail - m.pad;

  if (fits(ordered, METRICS.normal, false)) return { dense: false, hidden: [] };
  for (let k = 0; k <= cutOrder.length; k++) {
    const cut = cutOrder.slice(0, k);
    if (fits(ordered.filter((o) => !cut.includes(o.item.label)), METRICS.dense, k > 0)) return { dense: true, hidden: cut };
  }
  return { dense: true, hidden: cutOrder };
}

const SideNavBody: React.FC<NavModel> = ({ main, more }) => {
  const { reduced } = useMotionPrefs();
  const location = useLocation();
  const navRef = useRef<HTMLElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  const [fit, setFit] = useState<{ dense: boolean; hidden: string }>({ dense: false, hidden: '' });
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ left: 0, bottom: 0 });
  const showTimer = useAuthStore((s) => s.user?.role) !== 'client';
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

  // One list in display order with each item's group.
  const ordered: Entry[] = [
    ...top.map((item) => ({ item, group: 0 })),
    ...work.map((item) => ({ item, group: 1 })),
    ...bottom.map((item) => ({ item, group: 2 }))
  ];
  const key = ordered.map((o) => `${o.item.label}:${o.group}`).join('|');

  useLayoutEffect(() => {
    const el = navRef.current;
    if (!el) return;
    const measure = () => {
      const r = fitRail(ordered, el.clientHeight, showTimer ? TIMER_SLOT : 0);
      const hidden = r.hidden.join('|');
      setFit((cur) => (cur.dense === r.dense && cur.hidden === hidden ? cur : { dense: r.dense, hidden }));
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
  }, [key, showTimer]);

  const dense = fit.dense;
  const hiddenLabels = fit.hidden ? fit.hidden.split('|') : [];
  const shown = ordered.filter((o) => !hiddenLabels.includes(o.item.label));
  const hidden = ordered.filter((o) => hiddenLabels.includes(o.item.label)).map((o) => o.item);
  const ITEM = itemClass(dense);
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
                ? 'text-[var(--primary)]'
                : 'text-[var(--tm-ink-soft)] hover:bg-[color-mix(in_srgb,var(--tm-on-dark)_6%,transparent)] hover:text-[var(--tm-ink)]'
            }`}
          >
            {isActive && (
              <motion.span
                aria-hidden
                layoutId={reduced ? undefined : 'sidenav-pill'}
                transition={reduced ? { duration: 0 } : { ...spring, stiffness: 520, damping: 30 }}
                className="tm-nav-tab pointer-events-none absolute inset-y-0 left-px right-[-5px]"
              >
                {/* The concave corners above and below, cut out in the rail's colour and kept inside the rail. */}
                <i className="tm-nav-tab-curve tm-nav-tab-curve-top" />
                <i className="tm-nav-tab-curve tm-nav-tab-curve-bottom" />
              </motion.span>
            )}
            <span className={`relative grid h-5 w-5 shrink-0 place-items-center ${isActive ? 'tm-nav-icon-pop' : ''}`}>
              <Icon className="h-5 w-5" strokeWidth={2} />
              <CountBadge count={item.count} className="absolute -right-2.5 -top-2" />
            </span>
            <span className={`relative w-full overflow-hidden text-ellipsis whitespace-nowrap px-1 text-[10px] leading-none ${isActive ? 'font-semibold' : 'font-bold'}`}>
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
        className={`tm-sidebar fixed bottom-4 left-4 top-[88px] z-30 hidden w-[72px] flex-col items-center overflow-hidden
          rounded-full px-1.5 lg:flex ${dense ? 'gap-0.5 py-8' : 'gap-1 py-10'}`}
      >
        {shown.map(({ item, group }, k) => (
          <React.Fragment key={item.path}>
            {k > 0 && group !== shown[k - 1].group && <Divider dense={dense} />}
            {/* With nothing hidden, the last group sits at the bottom of the rail. */}
            {hidden.length === 0 && group === 2 && shown[k - 1]?.group !== 2 ? (
              <div className={`mt-auto flex flex-col items-center ${dense ? 'gap-0.5' : 'gap-1'}`}>{renderItem(item)}</div>
            ) : (
              renderItem(item)
            )}
          </React.Fragment>
        ))}
        {hidden.length > 0 && (
          <div className={`mt-auto flex flex-col items-center ${dense ? 'gap-0.5' : 'gap-1'}`}>
            <Divider dense={dense} />
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
                  : 'text-[var(--tm-ink-soft)] hover:bg-[color-mix(in_srgb,var(--tm-on-dark)_6%,transparent)] hover:text-[var(--tm-ink)]'
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
        {showTimer && (
          <div className="flex shrink-0 flex-col items-center">
            <Divider dense={dense} />
            <RailTimer />
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
