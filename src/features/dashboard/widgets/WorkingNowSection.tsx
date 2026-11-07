import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, Timer } from 'lucide-react';
import { Avatar } from '../../../components/ui/Avatar';
import { Button } from '../../../components/ui/Button';
import { StatusChip, type ChipTone } from '../../../components/ui/StatusChip';
import { StaggerItem } from '../../../components/ui/Stagger';
import { socket } from '../../../services/socket';
import { timerApi, type ActiveTimer, type ActiveTimers } from '../../../services/http/timerApi';
import { STATUS_LABEL } from '../../tasks/components/TaskMeta';
import { formatDate, getTodayDateString } from '../../../utils/time';
import { DashboardCard, WidgetEmpty, WidgetSkeleton, timeOf } from './DashboardCard';

const PRIORITY_TONE: Record<ActiveTimer['task']['priority'], ChipTone> = { urgent: 'bad', high: 'warn', medium: 'info', low: 'neutral' };
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** 3725 -> "1:02:05". */
const clock = (seconds: number) => {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}:${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

/** 3725 -> "1:02" (hours and minutes). */
const hm = (seconds: number) => {
  const m = Math.floor(Math.max(0, seconds) / 60);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
};

/** One tick a second, in the browser's clock; every row counts from the server's start time, so a skewed clock cannot show the wrong time. */
function useNowMs(serverNow: string | undefined): number {
  const offset = useRef(0);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (serverNow) offset.current = Date.parse(serverNow) - Date.now();
  }, [serverNow]);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return now + offset.current;
}

const Row: React.FC<{ item: ActiveTimer; nowMs: number; serverMs: number; today: string }> = ({ item, nowMs, serverMs, today }) => {
  const { user, task } = item;
  const navigate = useNavigate();
  const overdue = !!task.due_date && task.due_date < today;
  return (
    <li className="grid items-center gap-x-4 gap-y-2 rounded-[var(--tm-radius-md)] px-2 py-3 hover:bg-[var(--tm-bg-sunken)] md:grid-cols-[minmax(0,1.1fr)_minmax(0,1.8fr)_auto_auto] xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1.9fr)_minmax(0,1fr)_190px_64px_172px_84px]">
      <div className="flex min-w-0 items-center gap-3">
        <Avatar name={user.name} src={user.avatar_url ?? undefined} size="sm" />
        <span className="truncate text-[13.5px] font-bold text-[var(--tm-ink)]">{user.name}</span>
      </div>

      <div className="min-w-0">
        <div className="truncate text-[13.5px] font-semibold text-[var(--tm-ink)]">{task.title}</div>
        {task.description && <div className="line-clamp-1 text-[12px] text-[var(--tm-ink-soft)]">{task.description}</div>}
      </div>

      <div className="min-w-0 text-[12px] text-[var(--tm-ink-soft)] md:col-span-2 xl:col-span-1">
        <span className="block truncate font-semibold text-[var(--tm-ink)]">{task.project_name}</span>
        <span className="block truncate">{task.subfolder_name}</span>
      </div>

      <div className="flex flex-col text-[11px] text-[var(--tm-ink-muted)]">
        {/* Everything spent on the task: earlier sessions as the server counted them, plus the time since that answer. */}
        <span
          className="font-mono text-[15px] font-bold tabular-nums text-[var(--tm-ink)]"
          title="Total time spent on this task, the same number the task page shows"
        >
          {clock(task.total_seconds + (nowMs - serverMs) / 1000)}
        </span>
        <span>
          this session {hm((nowMs - Date.parse(item.started_at)) / 1000)} · since {timeOf(item.started_at)}
        </span>
      </div>

      <div className={`text-[12px] ${overdue ? 'font-semibold text-[var(--tm-danger)]' : 'text-[var(--tm-ink-soft)]'}`}>
        <span className="block text-[11px] text-[var(--tm-ink-muted)]">Due</span>
        {task.due_date ? formatDate(task.due_date, 'd MMM') : 'No date'}
      </div>

      <div className="flex flex-wrap gap-1.5">
        <StatusChip tone={PRIORITY_TONE[task.priority]} size="sm">
          {cap(task.priority)}
        </StatusChip>
        <StatusChip status={task.status} size="sm">
          {STATUS_LABEL[task.status as keyof typeof STATUS_LABEL] ?? task.status}
        </StatusChip>
      </div>

      {/* The same task page the employee sees; an admin gets it with the admin controls. */}
      <Button size="sm" variant="outline" aria-label={`View ${task.title}`} onClick={() => navigate(`/admin/tasks/${task.id}`)} leftIcon={<Eye className="h-4 w-4" />}>
        View
      </Button>
    </li>
  );
};

/** "Working now" on the admin home: everyone with a task timer running, grouped by company, counting live. */
export const WorkingNowSection: React.FC = () => {
  const [data, setData] = useState<ActiveTimers | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(() => {
    timerApi
      .active()
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load who is working'));
  }, []);

  // A timer starting or stopping anywhere arrives as a "presence" event: refresh (once, even if several come together).
  const soon = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(load, 300);
  }, [load]);

  useEffect(() => {
    load();
    const off = socket.on('presence', soon);
    const offLive = socket.on('timer', soon);
    const safety = setInterval(load, 60_000); // in case an event was missed while the socket was reconnecting
    return () => {
      off();
      offLive();
      clearInterval(safety);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [load, soon]);

  const nowMs = useNowMs(data?.server_now);
  const today = getTodayDateString();

  const groups = useMemo(() => {
    if (!data) return [];
    const known = new Set(data.companies.map((c) => c.id));
    const list = data.companies.map((c) => ({ id: c.id, name: c.name, items: data.items.filter((i) => i.company_id === c.id) }));
    const other = data.items.filter((i) => !i.company_id || !known.has(i.company_id));
    return other.length ? [...list, { id: 'other', name: 'No company', items: other }] : list;
  }, [data]);

  return (
    <StaggerItem className="lg:col-span-12">
      <DashboardCard animate={false} icon={<Timer className="h-5 w-5" />} title="Working now" to="/admin/tasks?quick=open" cta="Open tasks" className="h-full">
        {error && <div className="tm-error px-4 py-3 text-xs font-semibold">{error}</div>}
        {!data ? (
          !error && <WidgetSkeleton />
        ) : (
          <div className="space-y-5">
            {groups.map((g) => (
              <section key={g.id} aria-label={`${g.name}: ${g.items.length} working`}>
                <h3 className="mb-1 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--tm-ink-muted)]">
                  {g.name}
                  <span className="rounded-full bg-[var(--tm-primary-soft)] px-2 py-0.5 text-[11px] font-bold leading-none tracking-normal text-[var(--tm-primary-dark)]">{g.items.length}</span>
                </h3>
                {g.items.length === 0 ? (
                  <WidgetEmpty>No one is working on a task right now.</WidgetEmpty>
                ) : (
                  <ul className="divide-y divide-[var(--tm-border)]">
                    {g.items.map((i) => (
                      <Row key={`${i.user.id}-${i.task.id}`} item={i} nowMs={nowMs} serverMs={Date.parse(data.server_now)} today={today} />
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </div>
        )}
      </DashboardCard>
    </StaggerItem>
  );
};
