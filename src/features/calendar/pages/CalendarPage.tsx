import { AnimatePresence, motion } from 'motion/react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  addMinutes,
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isBefore,
  isSameDay,
  isSameMonth,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfWeek
} from 'date-fns';
import { ArrowDown, CalendarDays, ChevronLeft, ChevronRight, Clock, Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Avatar } from '../../../components/ui/Avatar';
import { Input, Textarea } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { StatusChip } from '../../../components/ui/StatusChip';
import { PageHeader } from '../../../components/ui/PageHeader';
import { useAuthStore } from '../../../store/authStore';
import { useDailyStatusStore } from '../../../store/useDailyStatusStore';
import { useWorkspaceStore } from '../../../store/useWorkspaceStore';
import { dayOffOn } from '../../workspace/dayOff';
import { UpcomingHolidays } from '../../workspace/UpcomingHolidays';
import { useConfirm } from '../../../hooks/useConfirm';
import { socket } from '../../../services/socket';
import { bookingApi, statusApi, type Booking, type StatusEntry } from '../../../services/http/calendarApi';
import { externalEventApi, type ExternalEvent } from '../../../services/http/integrationApi';
import { statusMeta } from '../../status/statusMeta';
import { MonthStatusBoard } from '../components/MonthStatusBoard';
import { MeetLink } from '../../google/MeetButtons';
import { Modal } from '../../../components/ui/Modal';
import { EmailInvite, guestPayload, MemberSelect, type GuestPerson } from '../components/GuestFields';
import { directoryApi } from '../../../services/http/directoryApi';
import { KIND_META, type DayKind } from '../dayStatusMeta';

const DAY_START_HOUR = 0; // the whole day is bookable, day and night
const DAY_END_HOUR = 24;
const STEP_MINUTES = 30;
const DURATIONS = [30, 60, 90, 120];
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Soft tints for booking rows, from the status/accent tokens so dark mode follows. */
const PASTELS = [
  'color-mix(in srgb, var(--tm-primary-light) 38%, var(--tm-card))',
  'var(--tm-info-bg)',
  'var(--tm-warning-bg)',
  'var(--tm-success-bg)'
];

/** The mini month's legend: the four statuses and holidays, in fixed colours. */
const MINI_LEGEND: DayKind[] = ['present', 'wfh', 'half_day', 'leave', 'holiday'];

const ymd = (d: Date) => format(d, 'yyyy-MM-dd');

/** Someone's calendar: daily status, bookings, and free slots anyone on the team can book. */
export const CalendarPage: React.FC = () => {
  const navigate = useNavigate();
  const params = useParams<{ userId?: string }>();
  const me = useAuthStore((s) => s.user);
  const confirm = useConfirm();
  const { overview, overviewLoaded, loadOverview } = useDailyStatusStore();

  const hostId = params.userId ?? me?.id ?? '';
  const isOwn = hostId === me?.id;
  const prefix = me?.role === 'admin' ? '/admin' : '/app';

  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [selected, setSelected] = useState(() => startOfDay(new Date()));
  const [statuses, setStatuses] = useState<StatusEntry[]>([]);
  const [team, setTeam] = useState<StatusEntry[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [external, setExternal] = useState<ExternalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Booking form
  const [slotStart, setSlotStart] = useState<Date | null>(null);
  const [duration, setDuration] = useState(60);
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [emails, setEmails] = useState<string[]>([]);
  const slotsRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const scrolledToHash = useRef(false);
  const [team2, setTeam2] = useState<GuestPerson[] | null>(null);
  const [teamError, setTeamError] = useState<string | null>(null);
  const [scrolled, setScrolled] = useState(false);

  const gridDays = useMemo(
    () =>
      eachDayOfInterval({
        start: startOfWeek(startOfMonth(month), { weekStartsOn: 1 }),
        end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 })
      }),
    [month]
  );

  useEffect(() => {
    if (!overviewLoaded) loadOverview();
  }, [overviewLoaded, loadOverview]);

  const people = useMemo(() => new Map(overview.map((r) => [r.user_id, r])), [overview]);
  const host = people.get(hostId) ?? (isOwn && me ? { name: me.name, avatar_url: me.avatarUrl ?? null } : undefined);

  const load = useCallback(async () => {
    if (!hostId) return;
    const from = ymd(gridDays[0]);
    const to = ymd(gridDays[gridDays.length - 1]);
    try {
      const [s, b, x, t] = await Promise.all([
        statusApi.range(hostId, from, to),
        bookingApi.list(hostId, from, to),
        // Connected calendars (Google) are optional: the calendar still works if they can't be loaded.
        externalEventApi.list(hostId, from, to).catch(() => [] as ExternalEvent[]),
        // The team view and day popover are extras: the calendar still works without them.
        statusApi.team(from, to).catch(() => [] as StatusEntry[])
      ]);
      setStatuses(s);
      setTeam(t);
      setBookings(b);
      setExternal(x);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not load this calendar');
    } finally {
      setLoading(false);
    }
  }, [hostId, gridDays]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  // Someone's status changed: refresh this month.
  useEffect(() => socket.on('daily_status', () => load()), [load]);
  // A background sync pulled in new Google events.
  useEffect(() => socket.on('calendar_sync', () => load()), [load]);

  // Reset the booking form when the day or person changes.
  useEffect(() => {
    setSlotStart(null);
    setTitle('');
    setNote('');
    setMemberIds([]);
    setEmails([]);
  }, [selected, hostId]);

  const statusByDate = useMemo(() => new Map(statuses.map((s) => [s.date, s.status])), [statuses]);
  const dayBookings = useMemo(
    () =>
      bookings
        .filter((b) => isSameDay(parseISO(b.start), selected))
        .sort((a, b) => a.start.localeCompare(b.start)),
    [bookings, selected]
  );

  /** Connected-calendar events touching a day (all-day events end at midnight, exclusive). */
  const externalOn = useCallback(
    (day: Date) => external.filter((e) => parseISO(e.start) < addMinutes(startOfDay(day), 24 * 60) && parseISO(e.end) > startOfDay(day)),
    [external]
  );
  const dayExternal = useMemo(() => externalOn(selected), [externalOn, selected]);

  const selectedStatus = statusByDate.get(ymd(selected));
  const isPastDay = isBefore(selected, startOfDay(new Date()));
  const onLeave = selectedStatus === 'leave';
  // Holidays and weekly offs (workspace settings) are shown as a band on the day; booking stays open.
  const workspace = useWorkspaceStore((s) => s.workspace);
  useEffect(() => {
    if (!workspace) void useWorkspaceStore.getState().load();
  }, [workspace]);
  const hostCompany = people.get(hostId)?.company_id ?? (isOwn ? me?.companyId : null) ?? null;
  const dayOff = (day: Date) => dayOffOn(workspace, ymd(day), hostCompany);
  const canBook = !isOwn && me?.role !== 'client' && !isPastDay && !onLeave;

  /** A start time is free if [start, start+duration) overlaps nothing and isn't in the past. */
  const slots = useMemo(() => {
    const result: { start: Date; free: boolean }[] = [];
    const first = addMinutes(startOfDay(selected), DAY_START_HOUR * 60);
    const last = addMinutes(startOfDay(selected), DAY_END_HOUR * 60);
    for (let t = first; isBefore(t, last); t = addMinutes(t, STEP_MINUTES)) {
      const end = addMinutes(t, duration);
      const fits = !isBefore(last, end);
      const clash =
        bookings.some((b) => parseISO(b.start) < end && parseISO(b.end) > t) ||
        external.some((e) => e.busy && !e.all_day && parseISO(e.start) < end && parseISO(e.end) > t);
      result.push({ start: t, free: fits && !clash && !isBefore(t, new Date()) });
    }
    return result;
  }, [selected, duration, bookings, external]);

  const changeMonth = (delta: number) => {
    const next = addMonths(month, delta);
    setMonth(next);
    setSelected(isSameMonth(next, new Date()) ? startOfDay(new Date()) : next);
  };

  const submitBooking = async () => {
    if (!slotStart) return;
    const end = addMinutes(slotStart, duration);
    const label = `${format(slotStart, 'EEE d MMM, HH:mm')} - ${format(end, 'HH:mm')}`;
    await confirm({
      title: `Book ${label}?`,
      message: `${host?.name ?? 'This person'} will be notified.`,
      confirmLabel: 'Book slot',
      action: () =>
        bookingApi.create({
          host_user_id: hostId,
          start: slotStart.toISOString(),
          end: end.toISOString(),
          title: title.trim(),
          note: note.trim(),
          attendees: guestPayload(memberIds, emails)
        }),
      successTitle: 'Slot booked',
      successMessage:
        memberIds.length + emails.length
          ? `${label}. Google is emailing ${memberIds.length + emails.length} guest${memberIds.length + emails.length === 1 ? '' : 's'}.`
          : label
    }).then((ok) => {
      if (ok) {
        setSlotStart(null);
        setTitle('');
        setNote('');
        setMemberIds([]);
        setEmails([]);
        load();
      }
    });
  };

  const cancelBooking = (b: Booking) =>
    confirm({
      title: 'Cancel this booking?',
      message: `${format(parseISO(b.start), 'EEE d MMM, HH:mm')} - ${format(parseISO(b.end), 'HH:mm')}. The other person will be notified.`,
      confirmLabel: 'Cancel booking',
      danger: true,
      action: () => bookingApi.cancel(b.id),
      successTitle: 'Booking cancelled'
    }).then((ok) => {
      if (ok) load();
    });

  // The team picker needs everyone, so it comes from its own endpoint (all companies, no paging), fetched when the dialog first opens.
  const dialogOpen = !!slotStart && canBook;
  useEffect(() => {
    if (!dialogOpen || team2 !== null) return;
    directoryApi
      .team()
      .then((rows) => {
        setTeam2(rows.map((r) => ({ id: r.id, name: r.name, avatar_url: r.avatar_url, title: r.title, role: r.role, company: r.company_name })));
        setTeamError(null);
      })
      .catch((err) => setTeamError(err instanceof Error ? err.message : 'Could not load the team'));
  }, [dialogOpen, team2]);

  /** Everyone who can be invited: the whole team except you (excluded by the server) and the host, who already has the booking. */
  const guestPeople = useMemo(() => (team2 ?? []).filter((p) => p.id !== hostId), [team2, hostId]);

  // The "Scroll to book" cue goes away as soon as the page is scrolled (any scrolling container), and comes back on another calendar.
  useEffect(() => {
    setScrolled(false);
    const onScroll = (e: Event) => {
      const t = e.target;
      const top = t instanceof Element ? t.scrollTop : window.scrollY;
      if (top > 24) setScrolled(true);
    };
    window.addEventListener('scroll', onScroll, { capture: true, passive: true });
    return () => window.removeEventListener('scroll', onScroll, true);
  }, [hostId]);

  const freeCount = slots.filter((s) => s.free).length;
  const scrollToSlots = () => slotsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  // Arriving from a profile ("…/calendar/<id>#book") goes straight to the free slots, once the calendar has loaded.
  useEffect(() => {
    if (location.hash === '#book' && !loading && canBook && !scrolledToHash.current) {
      scrolledToHash.current = true;
      scrollToSlots();
    }
  }, [location.hash, loading, canBook]);

  const todayStatus = statusMeta(statusByDate.get(ymd(new Date())));

  const eyebrow = 'text-[10.5px] font-bold uppercase tracking-[0.14em] text-[var(--tm-ink-muted)]';

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            {host && <Avatar name={host.name} src={host.avatar_url ?? undefined} size="md" />}
            {isOwn ? 'My calendar' : `${host?.name ?? 'Calendar'}`}
          </span>
        }
        description={
          isOwn
            ? 'Your daily status and bookings. Teammates can book your free slots.'
            : 'Daily status and bookings. Pick a day, then a free slot to book time.'
        }
        actions={
          <>
            {todayStatus && (
              <StatusChip tone={todayStatus.tone} dot>
                Today: {todayStatus.label}
              </StatusChip>
            )}
            {!isOwn && (
              <Button variant="outline" size="sm" onClick={() => navigate(`${prefix}/calendar`)}>
                My calendar
              </Button>
            )}
          </>
        }
      />

      {loadError && (
        <div className="tm-error px-4 py-3 text-xs font-semibold">
          {loadError}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[300px_minmax(0,1fr)]">
        {/* Left rail: mini month + people */}
        <div className="space-y-6">
          <Card className="!p-0">
            <CardContent className="pt-6">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-[16px] font-extrabold text-[var(--tm-ink)]">{format(month, 'MMMM yyyy')}</h3>
                <div className="flex items-center gap-1.5">
                  <Button variant="solid" size="sm" onClick={() => changeMonth(-1)} aria-label="Previous month">
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setMonth(startOfMonth(new Date()));
                      setSelected(startOfDay(new Date()));
                    }}
                  >
                    Today
                  </Button>
                  <Button variant="solid" size="sm" onClick={() => changeMonth(1)} aria-label="Next month">
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-7 text-center text-[10.5px] font-bold uppercase tracking-wider text-[var(--tm-ink-muted)]">
                {WEEKDAYS.map((d) => (
                  <div key={d} className="py-1">
                    {d.slice(0, 2)}
                  </div>
                ))}
              </div>
              <div className={`mt-1 grid grid-cols-7 gap-y-1 ${loading ? 'opacity-60' : ''}`}>
                {gridDays.map((day) => {
                  const key = ymd(day);
                  const inMonth = isSameMonth(day, month);
                  const status = inMonth ? statusByDate.get(key) : undefined;
                  const off = inMonth ? dayOff(day) : null;
                  const holiday = off?.kind === 'holiday';
                  const weekend = off?.kind === 'weekoff';
                  const isSelected = isSameDay(day, selected);
                  const isToday = isSameDay(day, new Date());
                  const label = `${format(day, 'EEEE d MMMM')}${holiday ? `, ${off.name}` : weekend ? ', weekly off' : ''}${status ? `, ${KIND_META[status].long}` : ''}`;
                  // One meaning per style: today = solid circle, selected = thin ring, weekend = muted number, holiday = purple number + dot,
                  // my status = the 6px dot underneath. Days of other months stay faint and show no dots.
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setSelected(day)}
                      aria-label={label}
                      aria-pressed={isSelected}
                      title={holiday ? off.name : undefined}
                      className={`relative mx-auto flex h-11 w-9 flex-col items-center gap-0.5 ${inMonth ? '' : 'opacity-30'}`}
                    >
                      <span
                        className={`grid h-8 w-8 place-items-center rounded-full text-[12.5px] font-bold transition-shadow ${
                          isToday
                            ? 'bg-[var(--primary)] text-[var(--tm-on-primary)]'
                            : holiday
                              ? 'text-[var(--st-holiday)]'
                              : weekend
                                ? 'text-[var(--tm-ink-muted)]'
                                : 'text-[var(--tm-ink)]'
                        } ${
                          isSelected
                            ? `ring-[1.5px] ring-[var(--primary)] ${isToday ? 'ring-offset-2 ring-offset-[var(--tm-card)]' : ''}`
                            : 'hover:ring-1 hover:ring-[var(--tm-border-strong)]'
                        }`}
                      >
                        {format(day, 'd')}
                      </span>
                      {holiday && <span aria-hidden className="absolute right-0.5 top-0.5 h-1 w-1 rounded-full" style={{ background: 'var(--st-holiday)' }} />}
                      {status && <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: KIND_META[status].color }} />}
                    </button>
                  );
                })}
              </div>
              <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-[11.5px] text-[var(--tm-ink-muted)]">
                {MINI_LEGEND.map((k) => (
                  <span key={k} className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: KIND_META[k].color }} />
                    {KIND_META[k].label}
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>

          <UpcomingHolidays />

          {overview.length > 0 && (
            <Card>
              <CardContent className="pt-6">
                <h4 className={`mb-3 ${eyebrow}`}>People</h4>
                <div className="flex flex-wrap gap-2.5">
                  {overview.map((r) => {
                    const meta = statusMeta(r.status);
                    return (
                      <button
                        key={r.user_id}
                        type="button"
                        title={`${r.name}${meta ? `, ${meta.label}` : ''}`}
                        aria-label={`${r.name}'s calendar`}
                        onClick={() => navigate(r.user_id === me?.id ? `${prefix}/calendar` : `${prefix}/calendar/${r.user_id}`)}
                        className={`relative rounded-full transition-transform hover:-translate-y-0.5 ${
                          r.user_id === hostId ? 'ring-2 ring-[var(--tm-accent)] ring-offset-2 ring-offset-[var(--tm-card)]' : ''
                        }`}
                      >
                        <Avatar name={r.name} src={r.avatar_url ?? undefined} size="md" />
                        {meta && (
                          <span
                            className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-[var(--tm-card)]"
                            style={{ background: meta.color }}
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Main: the month with every day's status, then the week grid and the selected day */}
        <div className="min-w-0 space-y-6">
          <MonthStatusBoard
            month={month}
            days={gridDays}
            selected={selected}
            onSelect={setSelected}
            onMonth={changeMonth}
            hostName={isOwn ? 'My status' : (host?.name ?? 'Person')}
            hostStatuses={statusByDate}
            team={team}
            people={people}
            dayOff={dayOff}
            loading={loading}
          />
          <div className="relative grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Selected day */}
            <Card>
              <CardHeader>
                <div>
                  <CardTitle className="text-base font-extrabold">{format(selected, 'EEEE, d MMMM')}</CardTitle>
                  <div className="mt-2">
                    {selectedStatus ? (
                      <StatusChip tone={statusMeta(selectedStatus)?.tone} size="sm" dot>
                        {statusMeta(selectedStatus)?.label}
                      </StatusChip>
                    ) : (
                      <StatusChip tone="neutral" size="sm" dot>
                        No status set
                      </StatusChip>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <section>
                  <h4 className={`mb-2 ${eyebrow}`}>Bookings</h4>
                  {dayBookings.length === 0 ? (
                    <p className="rounded-[var(--tm-radius-md)] bg-[var(--tm-card-muted)] px-4 py-5 text-center text-[13px] text-[var(--tm-ink-muted)]">
                      Nothing booked.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {dayBookings.map((b, i) => {
                        const canCancel = me?.role === 'admin' || b.host_user_id === me?.id || b.booked_by === me?.id;
                        return (
                          <li
                            key={b.id}
                            className="flex items-start justify-between gap-3 rounded-[var(--tm-radius-md)] px-4 py-3"
                            style={{ background: PASTELS[i % PASTELS.length] }}
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 text-[12.5px] font-bold tabular-nums text-[var(--tm-ink-soft)]">
                                <Clock className="h-3.5 w-3.5" />
                                {format(parseISO(b.start), 'HH:mm')} - {format(parseISO(b.end), 'HH:mm')}
                              </div>
                              <div className="mt-0.5 truncate text-[13px] font-bold text-[var(--tm-ink)]">{b.title}</div>
                              {b.note && <p className="mt-0.5 text-[12px] leading-snug text-[var(--tm-ink-soft)]">{b.note}</p>}
                              {b.title !== 'Busy' && (
                                <p className="mt-1 text-[11.5px] text-[var(--tm-ink-soft)]">
                                  Booked by {people.get(b.booked_by)?.name ?? 'a teammate'}
                                </p>
                              )}
                              <MeetLink url={b.meet_url} className="mt-2 inline-block" />
                            </div>
                            {canCancel && (
                              <Button
                                variant="ghost"
                                size="sm"
                                aria-label="Cancel booking"
                                onClick={() => cancelBooking(b)}
                                className="text-[var(--tm-danger)]"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>

                {dayExternal.length > 0 && (
                  <section>
                    <h4 className={`mb-2 ${eyebrow}`}>{isOwn ? 'Google Calendar' : 'Busy elsewhere'}</h4>
                    <ul className="space-y-2">
                      {dayExternal.map((e) => (
                        <li key={e.id} className="rounded-[var(--tm-radius-md)] bg-[var(--tm-card-muted)] px-4 py-3">
                          <div className="flex items-center gap-1.5 text-[12.5px] font-bold tabular-nums text-[var(--tm-ink-soft)]">
                            <CalendarDays className="h-3.5 w-3.5" />
                            {e.all_day ? 'All day' : `${format(parseISO(e.start), 'HH:mm')} - ${format(parseISO(e.end), 'HH:mm')}`}
                          </div>
                          <div className="mt-0.5 truncate text-[13px] font-bold text-[var(--tm-ink)]">{e.title}</div>
                          {e.location && <p className="mt-0.5 text-[12px] text-[var(--tm-ink-muted)]">{e.location}</p>}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
              </CardContent>
            </Card>

            {/* Slot picker; the booking form itself floats over the week grid */}
            <div ref={slotsRef} id="book" className="scroll-mt-24">
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-extrabold">Book a slot</CardTitle>
              </CardHeader>
              <CardContent>
                {isOwn ? (
                  <p className="text-[13px] text-[var(--tm-ink-muted)]">
                    This is your calendar. Teammates book your free slots from here.
                  </p>
                ) : me?.role === 'client' ? (
                  <p className="text-[13px] text-[var(--tm-ink-muted)]">Booking isn’t available for your account yet.</p>
                ) : isPastDay ? (
                  <p className="text-[13px] text-[var(--tm-ink-muted)]">This day has passed.</p>
                ) : onLeave ? (
                  <p className="text-[13px] text-[var(--tm-ink-muted)]">{host?.name ?? 'They'} are on leave this day.</p>
                ) : (
                  canBook && (
                    <div className="space-y-4">
                      <Select
                        label="Length"
                        value={String(duration)}
                        onChange={(e) => {
                          setDuration(Number(e.target.value));
                          setSlotStart(null);
                        }}
                        options={DURATIONS.map((d) => ({ value: String(d), label: `${d} minutes` }))}
                      />
                      <div>
                        <span className="mb-1.5 block text-[12px] font-semibold text-[var(--tm-ink-soft)]">Free start times</span>
                        <div className="grid grid-cols-4 gap-1.5">
                          {slots.map(({ start, free }) => {
                            const active = slotStart !== null && isSameDay(start, slotStart) && start.getTime() === slotStart.getTime();
                            return (
                              <button
                                key={start.toISOString()}
                                type="button"
                                disabled={!free}
                                aria-label={free ? `Book ${format(start, 'HH:mm')}` : `${format(start, 'HH:mm')} is not free`}
                                title={free ? `Book ${format(start, 'HH:mm')} - ${format(addMinutes(start, duration), 'HH:mm')}` : undefined}
                                onClick={() => setSlotStart(start)}
                                className={`rounded-full border py-2 text-[12px] font-semibold tabular-nums transition-colors ${
                                  active
                                    ? 'border-[var(--tm-solid)] bg-[var(--tm-solid)] text-[var(--tm-solid-ink)]'
                                    : free
                                      ? 'border-[var(--tm-border)] bg-[var(--tm-card)] text-[var(--tm-ink)] hover:border-[var(--tm-solid)]'
                                      : 'cursor-not-allowed border-transparent bg-[var(--tm-bg-sunken)] text-[var(--tm-ink-muted)] line-through opacity-60'
                                }`}
                              >
                                {format(start, 'HH:mm')}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )
                )}
              </CardContent>
            </Card>
            </div>

            {/* Booking form: a dialog (portal), so it always opens centred and on top whatever the page layout does */}
            <Modal
              isOpen={!!slotStart && canBook}
              onClose={() => setSlotStart(null)}
              title="New booking"
              description={
                slotStart
                  ? `${host?.name ?? 'This person'} · ${format(slotStart, 'EEE d MMM')}, ${format(slotStart, 'HH:mm')} - ${format(addMinutes(slotStart, duration), 'HH:mm')}`
                  : undefined
              }
              maxWidth="lg"
              footer={
                <>
                  <Button type="button" variant="secondary" size="sm" onClick={() => setSlotStart(null)}>
                    Cancel
                  </Button>
                  <Button type="button" size="sm" disabled={!title.trim()} onClick={submitBooking}>
                    Book slot
                  </Button>
                </>
              }
            >
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (title.trim()) void submitBooking();
                }}
              >
                <Input label="Title" autoFocus placeholder="e.g. Design review" value={title} onChange={(e) => setTitle(e.target.value)} />
                <Textarea label="Note (optional)" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
                <MemberSelect people={guestPeople} value={memberIds} onChange={setMemberIds} loading={team2 === null && !teamError} error={teamError} />
                <EmailInvite value={emails} onChange={setEmails} />
              </form>
            </Modal>
          </div>
        </div>
      </div>
      {/* A small cue at the bottom of someone else's calendar; gone once they scroll. */}
      <AnimatePresence>
        {!isOwn && canBook && !loading && !scrolled && freeCount > 0 && (
          <motion.button
            key="scroll-to-book"
            type="button"
            onClick={scrollToSlots}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.25 }}
            className="fixed bottom-5 left-1/2 z-30 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-[var(--tm-card)]/80 px-3.5 py-1.5 text-[12px] font-semibold text-[var(--tm-ink-soft)] shadow-soft-sm ring-1 ring-[var(--tm-border)] backdrop-blur hover:text-[var(--tm-ink)]"
          >
            Scroll to book
            <ArrowDown className="h-3.5 w-3.5 motion-safe:animate-bounce" />
          </motion.button>
        )}
      </AnimatePresence>
    </>
  );
};
