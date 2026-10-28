import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { CalendarDays, ChevronLeft, ChevronRight, Clock, Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Avatar } from '../../../components/ui/Avatar';
import { Input, Textarea } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { StatusChip } from '../../../components/ui/StatusChip';
import { HeadBadge } from '../../../components/ui/HeadBadge';
import { PageHeader } from '../../../components/ui/PageHeader';
import { useAuthStore } from '../../../store/authStore';
import { useDailyStatusStore } from '../../../store/useDailyStatusStore';
import { useConfirm } from '../../../hooks/useConfirm';
import { socket } from '../../../services/socket';
import { bookingApi, statusApi, type Booking, type StatusEntry } from '../../../services/http/calendarApi';
import { externalEventApi, type ExternalEvent } from '../../../services/http/integrationApi';
import { DAY_STATUSES, statusMeta } from '../../status/statusMeta';

const DAY_START_HOUR = 9;
const DAY_END_HOUR = 19;
const STEP_MINUTES = 30;
const DURATIONS = [30, 60, 90, 120];
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

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

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            {host && <Avatar name={host.name} src={host.avatar_url ?? undefined} size="md" />}
            {isOwn ? 'My calendar' : `${host?.name ?? 'Calendar'}`}
            {people.get(hostId)?.is_head && <HeadBadge />}
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
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">
          {loadError}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* Month grid */}
        <Card className="xl:col-span-2">
          <CardHeader className="flex items-center justify-between">
            <CardTitle className="text-base font-extrabold">{format(month, 'MMMM yyyy')}</CardTitle>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => changeMonth(-1)} aria-label="Previous month">
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
              <Button variant="outline" size="sm" onClick={() => changeMonth(1)} aria-label="Next month">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-7 gap-1.5 text-center text-[11px] font-bold uppercase tracking-wider text-[var(--tm-ink-muted)]">
              {WEEKDAYS.map((d) => (
                <div key={d} className="py-1">
                  {d}
                </div>
              ))}
            </div>
            <div className={`mt-1 grid grid-cols-7 gap-1.5 ${loading ? 'opacity-60' : ''}`}>
              {gridDays.map((day) => {
                const key = ymd(day);
                const meta = statusMeta(statusByDate.get(key));
                const count = bookings.filter((b) => isSameDay(parseISO(b.start), day)).length;
                const googleCount = externalOn(day).length;
                const isSelected = isSameDay(day, selected);
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSelected(day)}
                    className={`flex min-h-[74px] flex-col items-start rounded-[var(--tm-radius-md)] border p-2 text-left
                      transition-colors ${
                        isSelected
                          ? 'border-[var(--tm-primary)] bg-[var(--tm-primary-softer)]'
                          : 'border-[var(--tm-border)] bg-[var(--tm-card)] hover:border-[var(--tm-border-strong)]'
                      } ${isSameMonth(day, month) ? '' : 'opacity-45'}`}
                  >
                    <span
                      className={`text-[12.5px] font-bold ${
                        isSameDay(day, new Date()) ? 'text-[var(--tm-primary)]' : 'text-[var(--tm-ink)]'
                      }`}
                    >
                      {format(day, 'd')}
                    </span>
                    {meta && (
                      <span className="mt-1 flex items-center gap-1 text-[10.5px] font-semibold text-[var(--tm-ink-soft)]">
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: meta.color }} />
                        <span className="truncate">{meta.label}</span>
                      </span>
                    )}
                    {count > 0 && (
                      <span className="mt-auto text-[10.5px] font-bold text-[var(--tm-primary)]">
                        {count} booking{count > 1 ? 's' : ''}
                      </span>
                    )}
                    {googleCount > 0 && (
                      <span className={`${count > 0 ? '' : 'mt-auto '}text-[10.5px] font-semibold text-[var(--tm-ink-muted)]`}>
                        {isOwn ? `${googleCount} on Google` : 'Busy'}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="mt-4 flex flex-wrap gap-4 text-[11.5px] text-[var(--tm-ink-muted)]">
              {DAY_STATUSES.map((s) => (
                <span key={s.value} className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                  {s.label}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Selected day */}
        <Card>
          <CardHeader>
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
          </CardHeader>
          <CardContent className="space-y-6">
            <section>
              <h4 className="mb-2 text-[10.5px] font-bold uppercase tracking-[0.14em] text-[var(--tm-ink-muted)]">
                Bookings
              </h4>
              {dayBookings.length === 0 ? (
                <p className="rounded-[var(--tm-radius-md)] bg-[var(--tm-card-muted)] px-4 py-5 text-center text-[13px] text-[var(--tm-ink-muted)]">
                  Nothing booked.
                </p>
              ) : (
                <ul className="space-y-2">
                  {dayBookings.map((b) => {
                    const canCancel = me?.role === 'admin' || b.host_user_id === me?.id || b.booked_by === me?.id;
                    return (
                      <li
                        key={b.id}
                        className="flex items-start justify-between gap-3 rounded-[var(--tm-radius-md)] bg-[var(--tm-card-muted)] px-4 py-3"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 text-[12.5px] font-bold tabular-nums text-[var(--tm-primary)]">
                            <Clock className="h-3.5 w-3.5" />
                            {format(parseISO(b.start), 'HH:mm')} - {format(parseISO(b.end), 'HH:mm')}
                          </div>
                          <div className="mt-0.5 truncate text-[13px] font-bold text-[var(--tm-ink)]">{b.title}</div>
                          {b.note && (
                            <p className="mt-0.5 text-[12px] leading-snug text-[var(--tm-ink-muted)]">{b.note}</p>
                          )}
                          {b.title !== 'Busy' && (
                            <p className="mt-1 text-[11.5px] text-[var(--tm-ink-muted)]">
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
                <h4 className="mb-2 text-[10.5px] font-bold uppercase tracking-[0.14em] text-[var(--tm-ink-muted)]">
                  {isOwn ? 'Google Calendar' : 'Busy elsewhere'}
                </h4>
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

            <section>
              <h4 className="mb-2 text-[10.5px] font-bold uppercase tracking-[0.14em] text-[var(--tm-ink-muted)]">
                Book a slot
              </h4>
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
                      <span className="mb-1.5 block text-[12px] font-semibold text-[var(--tm-ink-soft)]">
                        Free start times
                      </span>
                      <div className="grid grid-cols-4 gap-1.5">
                        {slots.map(({ start, free }) => {
                          const active = slotStart !== null && isSameDay(start, slotStart) && start.getTime() === slotStart.getTime();
                          return (
                            <button
                              key={start.toISOString()}
                              type="button"
                              disabled={!free}
                              onClick={() => setSlotStart(start)}
                              className={`rounded-[var(--tm-radius-md)] border py-2 text-[12px] font-semibold tabular-nums transition-colors ${
                                active
                                  ? 'border-[var(--tm-primary)] bg-[var(--tm-primary)] text-white'
                                  : free
                                    ? 'border-[var(--tm-border)] bg-[var(--tm-card)] text-[var(--tm-ink)] hover:border-[var(--tm-primary)]'
                                    : 'cursor-not-allowed border-transparent bg-[var(--tm-bg-sunken)] text-[var(--tm-ink-muted)] line-through opacity-60'
                              }`}
                            >
                              {format(start, 'HH:mm')}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {slotStart && (
                      <div className="space-y-3">
                        <p className="text-[12.5px] font-semibold text-[var(--tm-ink-soft)]">
                          {format(slotStart, 'HH:mm')} - {format(addMinutes(slotStart, duration), 'HH:mm')}
                        </p>
                        <Input label="Title" placeholder="e.g. Design review" value={title} onChange={(e) => setTitle(e.target.value)} />
                        <Textarea label="Note (optional)" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
                        <Button className="w-full" disabled={!title.trim()} onClick={submitBooking}>
                          Book slot
                        </Button>
                      </div>
                    )}
                  </div>
                )
              )}
            </section>
          </CardContent>
        </Card>
      </div>
    </>
  );
};
