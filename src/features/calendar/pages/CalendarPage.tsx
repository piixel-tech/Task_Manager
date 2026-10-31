import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
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
import { AnimatePresence, motion } from 'motion/react';
import { CalendarDays, ChevronLeft, ChevronRight, Clock, Trash2, X } from 'lucide-react';
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
import { DAY_STATUSES, statusMeta } from '../../status/statusMeta';
import { useMotionPrefs } from '../../../components/ui/useMotionPrefs';
import { popoverVariants } from '../../../components/ui/motion';

const DAY_START_HOUR = 0; // the whole day is bookable, day and night
const DAY_END_HOUR = 24;
const OFFICE_START_HOUR = 9; // where the grid opens when it isn't today
const STEP_MINUTES = 30;
const DURATIONS = [30, 60, 90, 120];
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const HOURS = Array.from({ length: DAY_END_HOUR - DAY_START_HOUR }, (_, i) => DAY_START_HOUR + i);
const HOUR_PX = 56;
/** Soft tints for booking blocks, from the status/accent tokens so dark mode follows. */
const PASTELS = [
  'color-mix(in srgb, var(--tm-primary-light) 38%, var(--tm-card))',
  'var(--tm-info-bg)',
  'var(--tm-warning-bg)',
  'var(--tm-success-bg)'
];

interface GridBlock {
  key: string;
  start: Date;
  end: Date;
  title: string;
  tint: number;
  external: boolean;
  people: { user_id: string; name: string; avatar_url: string | null }[];
  lane: number;
  lanes: number;
}

const ymd = (d: Date) => format(d, 'yyyy-MM-dd');

/** Someone's calendar: daily status, bookings, and free slots anyone on the team can book. */
export const CalendarPage: React.FC = () => {
  const navigate = useNavigate();
  const params = useParams<{ userId?: string }>();
  const me = useAuthStore((s) => s.user);
  const confirm = useConfirm();
  const { reduced } = useMotionPrefs();
  const { overview, overviewLoaded, loadOverview } = useDailyStatusStore();

  const hostId = params.userId ?? me?.id ?? '';
  const isOwn = hostId === me?.id;
  const prefix = me?.role === 'admin' ? '/admin' : '/app';

  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [selected, setSelected] = useState(() => startOfDay(new Date()));
  const [statuses, setStatuses] = useState<StatusEntry[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [external, setExternal] = useState<ExternalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Booking form
  const [slotStart, setSlotStart] = useState<Date | null>(null);
  const [duration, setDuration] = useState(60);
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');

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
      const [s, b, x] = await Promise.all([
        statusApi.range(hostId, from, to),
        bookingApi.list(hostId, from, to),
        // Connected calendars (Google) are optional: the calendar still works if they can't be loaded.
        externalEventApi.list(hostId, from, to).catch(() => [] as ExternalEvent[])
      ]);
      setStatuses(s);
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
          note: note.trim()
        }),
      successTitle: 'Slot booked',
      successMessage: label
    }).then((ok) => {
      if (ok) {
        setSlotStart(null);
        setTitle('');
        setNote('');
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

  const todayStatus = statusMeta(statusByDate.get(ymd(new Date())));

  // Open the grid at the current time (when this week has today) or at the office start.
  const gridScroll = useRef<HTMLDivElement>(null);
  const weekKey = ymd(startOfWeek(selected, { weekStartsOn: 1 }));
  useEffect(() => {
    const el = gridScroll.current;
    if (!el) return;
    const now = new Date();
    const thisWeek = ymd(startOfWeek(now, { weekStartsOn: 1 })) === weekKey;
    const hour = thisWeek ? Math.max(0, now.getHours() - 1) : OFFICE_START_HOUR;
    el.scrollTop = hour * HOUR_PX;
  }, [weekKey, hostId]);

  // --- Look only: the week shown in the grid, derived from what is already loaded ------------------------
  const weekDays = eachDayOfInterval({
    start: startOfWeek(selected, { weekStartsOn: 1 }),
    end: endOfWeek(selected, { weekStartsOn: 1 })
  });
  const pending = slotStart && canBook ? { start: slotStart, end: addMinutes(slotStart, duration) } : null;
  const labelFor = (b: Booking) => (b.title === 'Busy' && !isOwn ? 'Busy' : b.title);

  const dayBlocks = (day: Date): GridBlock[] => {
    const items: Omit<GridBlock, 'lane' | 'lanes'>[] = [
      ...bookings
        .filter((b) => isSameDay(parseISO(b.start), day))
        .map((b, i) => ({
          key: b.id,
          start: parseISO(b.start),
          end: parseISO(b.end),
          title: labelFor(b),
          tint: i % PASTELS.length,
          external: false,
          people: [people.get(b.host_user_id), people.get(b.booked_by)].filter(
            (p, idx, all): p is NonNullable<typeof p> => !!p && all.indexOf(p) === idx
          )
        })),
      ...externalOn(day)
        .filter((e) => !e.all_day)
        .map((e) => ({
          key: e.id,
          start: parseISO(e.start),
          end: parseISO(e.end),
          title: isOwn ? e.title : 'Busy',
          tint: 0,
          external: true,
          people: []
        }))
    ].sort((a, b) => a.start.getTime() - b.start.getTime());

    const laneEnds: Date[] = [];
    const placed = items.map((it) => {
      let lane = laneEnds.findIndex((end) => end <= it.start);
      if (lane === -1) lane = laneEnds.length;
      laneEnds[lane] = it.end;
      return { ...it, lane };
    });
    return placed.map((it) => ({ ...it, lanes: Math.max(laneEnds.length, 1) }));
  };

  const place = (start: Date, end: Date) => {
    const from = Math.max(0, (start.getHours() * 60 + start.getMinutes() - DAY_START_HOUR * 60) / 60);
    const to = Math.min(HOURS.length, (end.getHours() * 60 + end.getMinutes() - DAY_START_HOUR * 60) / 60 || HOURS.length);
    return { top: from * HOUR_PX, height: Math.max((to - from) * HOUR_PX, 22) };
  };

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
                  const meta = statusMeta(statusByDate.get(key));
                  const isSelected = isSameDay(day, selected);
                  const isToday = isSameDay(day, new Date());
                  const inWeek = weekDays.some((d) => isSameDay(d, day));
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setSelected(day)}
                      aria-label={`${format(day, 'EEEE d MMMM')}${meta ? `, ${meta.label}` : ''}`}
                      aria-pressed={isSelected}
                      className={`relative mx-auto grid h-9 w-9 place-items-center rounded-full text-[12.5px] font-bold transition-colors ${
                        isSelected
                          ? 'bg-[var(--tm-solid)] text-[var(--tm-solid-ink)]'
                          : `text-[var(--tm-ink)] hover:bg-[var(--tm-bg-sunken)] ${inWeek ? 'bg-[var(--tm-bg-sunken)]' : ''}`
                      } ${isToday && !isSelected ? 'ring-2 ring-[var(--tm-accent)]' : ''} ${isSameMonth(day, month) ? '' : 'opacity-40'}`}
                      style={!isSelected && dayOff(day) ? { background: 'color-mix(in srgb, var(--tm-primary-light) 24%, transparent)' } : undefined}
                      title={dayOff(day)?.name}
                    >
                      {format(day, 'd')}
                      {meta && (
                        <span
                          className="absolute bottom-1 h-1.5 w-1.5 rounded-full ring-1 ring-[var(--tm-card)]"
                          style={{ background: meta.color }}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
              <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-[11.5px] text-[var(--tm-ink-muted)]">
                {DAY_STATUSES.map((s) => (
                  <span key={s.value} className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                    {s.label}
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

        {/* Main: week grid, then the selected day */}
        <div className="min-w-0 space-y-6">
          <div className="relative">
            <Card className={`overflow-hidden !p-0 ${loading ? 'opacity-70' : ''}`}>
              <div className="flex items-center justify-between px-6 pb-3 pt-5">
                <h3 className="text-[18px] font-extrabold text-[var(--tm-ink)]">
                  {format(weekDays[0], 'd MMM')} - {format(weekDays[6], 'd MMM yyyy')}
                </h3>
              </div>
              <div className="overflow-x-auto">
                <div className="min-w-[760px] px-4 pb-4">
                  {/* Day headers tinted by daily status */}
                  <div className="grid grid-cols-[48px_repeat(7,minmax(0,1fr))] gap-1.5">
                    <div />
                    {weekDays.map((day) => {
                      const meta = statusMeta(statusByDate.get(ymd(day)));
                      const isSelected = isSameDay(day, selected);
                      const allDay = externalOn(day).filter((e) => e.all_day);
                      return (
                        <button
                          key={ymd(day)}
                          type="button"
                          onClick={() => setSelected(day)}
                          aria-pressed={isSelected}
                          className={`flex flex-col items-center rounded-[var(--tm-radius-md)] px-2 py-2.5 transition-colors ${
                            isSelected ? 'bg-[var(--tm-solid)] text-[var(--tm-solid-ink)]' : 'text-[var(--tm-ink)]'
                          }`}
                          style={
                            isSelected
                              ? undefined
                              : { background: `color-mix(in srgb, ${meta?.color ?? 'var(--tm-border-strong)'} 16%, var(--tm-card-muted))` }
                          }
                        >
                          <span className="text-[11px] font-bold uppercase tracking-wider opacity-70">{format(day, 'EEE')}</span>
                          <span className="text-[22px] font-extrabold leading-tight tabular-nums">{format(day, 'd')}</span>
                          <span className="mt-0.5 flex h-4 items-center gap-1 text-[10.5px] font-semibold opacity-80">
                            {meta && <span className="h-1.5 w-1.5 rounded-full" style={{ background: meta.color }} />}
                            <span className="truncate" title={dayOff(day)?.name}>{meta ? meta.label : dayOff(day) ? dayOff(day)!.name : allDay.length > 0 ? (isOwn ? 'All day' : 'Busy') : ''}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Hours x days */}
                  <div ref={gridScroll} className="mt-2 grid max-h-[560px] grid-cols-[48px_repeat(7,minmax(0,1fr))] gap-1.5 overflow-y-auto">
                    <div className="relative" style={{ height: HOURS.length * HOUR_PX }}>
                      {HOURS.map((h, i) => (
                        <span
                          key={h}
                          className="absolute right-2 -translate-y-1/2 text-[10.5px] font-semibold tabular-nums text-[var(--tm-ink-muted)]"
                          style={{ top: i * HOUR_PX + 8 }}
                        >
                          {format(addMinutes(startOfDay(new Date()), h * 60), 'h a')}
                        </span>
                      ))}
                    </div>
                    {weekDays.map((day) => {
                      const status = statusByDate.get(ymd(day));
                      const blocks = dayBlocks(day);
                      const showPending = pending && isSameDay(pending.start, day);
                      return (
                        <div
                          key={ymd(day)}
                          className="relative overflow-hidden rounded-[var(--tm-radius-sm)] bg-[var(--tm-card-muted)]"
                          style={{
                            height: HOURS.length * HOUR_PX,
                            backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent ${HOUR_PX - 1}px, var(--tm-border) ${HOUR_PX - 1}px, var(--tm-border) ${HOUR_PX}px)`
                          }}
                        >
                          {dayOff(day) && (
                            <div aria-hidden className="absolute inset-0" style={{ background: 'color-mix(in srgb, var(--tm-primary-light) 22%, transparent)' }}>
                              <span className="sticky top-1 mx-1 mt-1 block truncate rounded-full bg-[var(--tm-card)]/70 px-2 py-0.5 text-center text-[10.5px] font-bold text-[var(--tm-primary-dark)]">{dayOff(day)!.name}</span>
                            </div>
                          )}
                          {status === 'leave' && (
                            <div
                              aria-hidden
                              className="absolute inset-0"
                              style={{
                                background:
                                  'repeating-linear-gradient(135deg, color-mix(in srgb, var(--tm-danger) 14%, transparent) 0 6px, transparent 6px 12px)'
                              }}
                            />
                          )}
                          {status === 'half_day' && (
                            <div
                              aria-hidden
                              className="absolute inset-x-0 bottom-0 h-1/2"
                              style={{ background: 'color-mix(in srgb, var(--tm-warning) 14%, transparent)' }}
                            />
                          )}
                          {blocks.map((b) => {
                            const { top, height } = place(b.start, b.end);
                            const pastel = PASTELS[b.tint];
                            return (
                              <div
                                key={b.key}
                                className="absolute overflow-hidden rounded-[12px] px-2 py-1.5 text-[var(--tm-ink)]"
                                style={{
                                  top,
                                  height: height - 2,
                                  left: `calc(${(b.lane / b.lanes) * 100}% + 2px)`,
                                  width: `calc(${100 / b.lanes}% - 4px)`,
                                  background: b.external
                                    ? 'repeating-linear-gradient(135deg, var(--tm-bg-sunken) 0 6px, var(--tm-card-muted) 6px 12px)'
                                    : pastel
                                }}
                                title={`${b.title}, ${format(b.start, 'HH:mm')} - ${format(b.end, 'HH:mm')}`}
                              >
                                <div className="truncate text-[11.5px] font-bold leading-tight">{b.title}</div>
                                <div className="truncate text-[10px] font-semibold tabular-nums text-[var(--tm-ink-soft)]">
                                  {format(b.start, 'HH:mm')} - {format(b.end, 'HH:mm')}
                                </div>
                                {height > 54 && b.people.length > 0 && (
                                  <div className="mt-1.5 flex items-center">
                                    {b.people.map((p, i) => (
                                      <span key={p.user_id} className={i === 0 ? '' : '-ml-1.5'}>
                                        <Avatar name={p.name} src={p.avatar_url ?? undefined} size="xs" ring />
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                          {showPending && pending && (
                            <div
                              aria-hidden
                              className="absolute inset-x-[2px] rounded-[12px] border-2 border-dashed border-[var(--tm-primary)] bg-[var(--tm-accent)]/30"
                              style={place(pending.start, pending.end)}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </Card>

            {/* Booking form: a floating glass popup over the grid */}
            <AnimatePresence>
              {slotStart && canBook && (
                <motion.div
                  key="booking-popup"
                  role="dialog"
                  aria-label="New booking"
                  variants={reduced ? undefined : popoverVariants}
                  initial={reduced ? false : 'hidden'}
                  animate="show"
                  exit={reduced ? undefined : 'exit'}
                  onKeyDown={(e) => e.key === 'Escape' && setSlotStart(null)}
                  className="glass-strong absolute right-4 top-16 z-20 w-[min(320px,calc(100%-2rem))] space-y-3 rounded-[var(--tm-radius-lg)] p-5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className={eyebrow}>{format(slotStart, 'EEE d MMM')}</div>
                      <p className="mt-0.5 flex items-center gap-1.5 text-[13px] font-bold tabular-nums text-[var(--tm-ink)]">
                        <Clock className="h-3.5 w-3.5" />
                        {format(slotStart, 'HH:mm')} - {format(addMinutes(slotStart, duration), 'HH:mm')}
                      </p>
                    </div>
                    <button
                      type="button"
                      aria-label="Close"
                      onClick={() => setSlotStart(null)}
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[var(--tm-solid)] text-[var(--tm-solid-ink)]"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <Input label="Title" placeholder="e.g. Design review" value={title} onChange={(e) => setTitle(e.target.value)} />
                  <Textarea label="Note (optional)" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
                  <Button className="w-full" disabled={!title.trim()} onClick={submitBooking}>
                    Book slot
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
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
        </div>
      </div>
    </>
  );
};
