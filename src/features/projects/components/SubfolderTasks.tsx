import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowUpRight, CalendarClock, CheckCircle2, CheckSquare, Clock, Timer } from 'lucide-react';
import { Avatar } from '../../../components/ui/Avatar';
import { Button } from '../../../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/Card';
import { EmptyState } from '../../../components/ui/EmptyState';
import { FilterBar, FilterSearch } from '../../../components/ui/FilterBar';
import { Stagger, StaggerItem } from '../../../components/ui/Stagger';
import { StatCard } from '../../../components/ui/StatCard';
import { StatusChip } from '../../../components/ui/StatusChip';
import { ItemCardSkeletons } from '../../../components/ui/ItemCard';
import { useAuthStore } from '../../../store/authStore';
import { socket } from '../../../services/socket';
import { taskApi, type ApiTask } from '../../../services/http/taskApi';
import { formatDate } from '../../../utils/time';
import { formatDuration } from '../../../utils/format';
import { isOverdue, StatusDot } from '../../tasks/components/TaskMeta';

export type TaskFilter = 'all' | 'in_progress' | 'upcoming' | 'overdue' | 'completed';
type Group = 'in_progress' | 'upcoming' | 'completed';

/** In review and changes-requested still count as in progress: the work is not finished. */
const groupOf = (t: ApiTask): Group => (t.status === 'approved' ? 'completed' : t.status === 'todo' ? 'upcoming' : 'in_progress');

const GROUPS: { id: Group; label: string }[] = [
  { id: 'in_progress', label: 'In progress' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'completed', label: 'Completed' }
];

const FILTER_LABEL: Record<TaskFilter, string> = {
  all: 'All',
  in_progress: 'In progress',
  upcoming: 'Upcoming',
  overdue: 'Overdue',
  completed: 'Completed'
};

const matches = (f: TaskFilter, t: ApiTask) => f === 'all' || (f === 'overdue' ? isOverdue(t) : groupOf(t) === f);

const REFRESH_MS = 30_000;
const COMPLETED_SHOWN = 8;

/**
 * This subfolder's tasks through the same endpoint as the main task pages, so people only get what they may see.
 * Refreshes on task notifications and every 30s (teammates start and stop timers without a notification),
 * and ticks once a second while a timer is running.
 */
export const useSubfolderTasks = (subfolderId: string) => {
  const [tasks, setTasks] = useState<ApiTask[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const fetchedAt = useRef(Date.now());

  const load = useCallback(async () => {
    try {
      const list = await taskApi.list({ subfolder_id: subfolderId });
      fetchedAt.current = Date.now();
      setNow(Date.now());
      setTasks(list);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the tasks');
    }
  }, [subfolderId]);

  useEffect(() => {
    setTasks(null);
    load();
  }, [load]);

  useEffect(() => socket.on('notification', (n: { type?: string }) => n?.type?.startsWith('task_') && load()), [load]);

  useEffect(() => {
    const t = setInterval(() => document.visibilityState === 'visible' && load(), REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  const anyRunning = !!tasks?.some((t) => t.timer_running);
  useEffect(() => {
    if (!anyRunning) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [anyRunning]);

  /** Total tracked time, counting the running session as it grows. */
  const spent = (t: ApiTask) => t.total_seconds + (t.timer_running ? Math.max(0, (now - fetchedAt.current) / 1000) : 0);
  /** How long the current session has been running. */
  const sessionSeconds = (t: ApiTask) => {
    const start = t.timer_started_at ? Date.parse(t.timer_started_at) : NaN;
    return Number.isNaN(start) ? 0 : Math.max(0, (now - start) / 1000);
  };

  return { tasks, error, spent, sessionSeconds };
};

export type SubfolderTasksData = ReturnType<typeof useSubfolderTasks>;

const byDue = (a: ApiTask, b: ApiTask) => (a.due_date ?? '9999-12-31').localeCompare(b.due_date ?? '9999-12-31') || b.created_at.localeCompare(a.created_at);

const minutes = (seconds: number) => `${Math.max(1, Math.floor(seconds / 60))} min`;

const useTaskPath = () => {
  const role = useAuthStore((s) => s.user?.role);
  return (id: string) => `${role === 'admin' ? '/admin' : '/app'}/tasks/${id}`;
};

const counts = (tasks: ApiTask[]) => ({
  in_progress: tasks.filter((t) => groupOf(t) === 'in_progress').length,
  upcoming: tasks.filter((t) => groupOf(t) === 'upcoming').length,
  overdue: tasks.filter(isOverdue).length,
  completed: tasks.filter((t) => groupOf(t) === 'completed').length
});

/** Avatars of everyone with a running timer, with the task and how long this session has run. */
const WorkingNow: React.FC<{ tasks: ApiTask[]; sessionSeconds: (t: ApiTask) => number; taskPath: (id: string) => string }> = ({ tasks, sessionSeconds, taskPath }) => {
  const navigate = useNavigate();
  const running = tasks.filter((t) => t.timer_running);
  if (running.length === 0) return null;
  return (
    <section aria-label="Who's working now" className="rounded-[var(--tm-radius-card)] border border-[var(--tm-border)] bg-[var(--tm-card)] p-4 shadow-soft-sm">
      <h3 className="mb-3 flex items-center gap-2 text-[13px] font-extrabold text-[var(--tm-ink)]">
        <StatusDot running /> Who's working now
        <span className="font-semibold text-[var(--tm-ink-muted)]">· {running.length}</span>
      </h3>
      <ul className="flex flex-wrap gap-3">
        {running.map((t) => (
          <li key={t.id}>
            <button
              type="button"
              onClick={() => navigate(taskPath(t.id))}
              className="flex max-w-[320px] items-center gap-2.5 rounded-full bg-[var(--tm-card-muted)] py-1.5 pl-1.5 pr-4 text-left transition-colors hover:bg-[var(--tm-bg-sunken)]"
            >
              <Avatar name={t.assignee?.name ?? '?'} src={t.assignee?.avatar_url ?? undefined} size="sm" />
              <span className="min-w-0">
                <span className="block truncate text-[12.5px] font-bold text-[var(--tm-ink)]">{t.title}</span>
                <span className="block truncate text-[11.5px] text-[var(--tm-ink-muted)]">
                  {t.assignee?.name ?? 'Someone'} ·{' '}
                  <span className="font-semibold tabular-nums text-[var(--tm-success)]">{formatDuration(sessionSeconds(t))}</span>
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
};

const TaskRow: React.FC<{ task: ApiTask; spent: number; sessionSeconds: number; onOpen: () => void }> = ({ task: t, spent, sessionSeconds, onOpen }) => (
  <StaggerItem>
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 rounded-[var(--tm-radius-card)] border border-[var(--tm-border)] bg-[var(--tm-card)] p-4 text-left shadow-soft-sm transition-[border-color,box-shadow] hover:border-[var(--tm-primary-light)] hover:shadow-soft"
    >
      <span className="flex min-w-0 flex-1 basis-[220px] items-center gap-3">
        <Avatar name={t.assignee?.name ?? '?'} src={t.assignee?.avatar_url ?? undefined} size="md" />
        <span className="min-w-0">
          <span className="block truncate text-[14px] font-bold text-[var(--tm-ink)]">{t.title}</span>
          <span className="block truncate text-[12px] text-[var(--tm-ink-muted)]">{t.assignee?.name ?? 'Unassigned'}</span>
        </span>
      </span>
      <StatusChip status={t.status} size="sm" />
      <span
        className={`flex ${t.start_date ? 'w-40' : 'w-24'} items-center gap-1.5 text-[12.5px] font-semibold ${isOverdue(t) ? 'text-[var(--tm-danger)]' : 'text-[var(--tm-ink-soft)]'}`}
        title={t.due_date ? (isOverdue(t) ? 'Overdue' : 'Due date') : undefined}
      >
        <CalendarClock className="h-4 w-4 shrink-0" />
        {t.start_date ? `${formatDate(t.start_date, 'MMM d')} → ` : ''}
        {t.due_date ? formatDate(t.due_date, 'MMM d') : 'No date'}
      </span>
      <span className="flex w-20 items-center gap-1.5 text-[12.5px] font-semibold tabular-nums text-[var(--tm-ink-soft)]" title="Time spent">
        <Clock className="h-4 w-4 shrink-0" />
        {formatDuration(spent)}
      </span>
      {t.timer_running && (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--tm-success-bg)] px-2.5 py-1 text-[11px] font-bold text-[var(--tm-success)]">
          <StatusDot running /> Running {minutes(sessionSeconds)}
        </span>
      )}
    </button>
  </StaggerItem>
);

interface TabProps {
  data: SubfolderTasksData;
  filter: TaskFilter;
  onFilter: (f: TaskFilter) => void;
}

/** The Tasks tab: KPI row (click to filter), who's working now, then the tasks grouped by progress. */
export const SubfolderTasksTab: React.FC<TabProps> = ({ data, filter, onFilter }) => {
  const navigate = useNavigate();
  const taskPath = useTaskPath();
  const { tasks, error, spent, sessionSeconds } = data;
  const [search, setSearch] = useState('');
  const [allCompleted, setAllCompleted] = useState(false);

  const c = useMemo(() => counts(tasks ?? []), [tasks]);
  const q = search.trim().toLowerCase();
  const visible = useMemo(
    () =>
      (tasks ?? [])
        .filter((t) => matches(filter, t) && (!q || t.title.toLowerCase().includes(q) || (t.assignee?.name ?? '').toLowerCase().includes(q)))
        .sort(byDue),
    [tasks, filter, q]
  );

  const toggle = (f: TaskFilter) => onFilter(filter === f ? 'all' : f);

  if (!tasks) return error ? <div className="tm-error px-4 py-3 text-xs font-semibold">{error}</div> : <ItemCardSkeletons count={4} />;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="In progress" value={c.in_progress} icon={<Clock className="h-5 w-5" />} tone="warn" hint="Being worked on or in review" onClick={() => toggle('in_progress')} />
        <StatCard label="Upcoming" value={c.upcoming} icon={<CalendarClock className="h-5 w-5" />} tone="primary" hint="Not started yet" onClick={() => toggle('upcoming')} />
        <StatCard label="Overdue" value={c.overdue} icon={<AlertTriangle className="h-5 w-5" />} tone="bad" hint="Past the due date" onClick={() => toggle('overdue')} />
        <StatCard label="Completed" value={c.completed} icon={<CheckCircle2 className="h-5 w-5" />} tone="ok" hint="Approved" onClick={() => toggle('completed')} />
      </div>

      <WorkingNow tasks={tasks} sessionSeconds={sessionSeconds} taskPath={taskPath} />

      {tasks.length > 0 && (
        <FilterBar
          activeCount={(filter !== 'all' ? 1 : 0) + (q ? 1 : 0)}
          chips={filter !== 'all' ? [{ key: 'filter', label: FILTER_LABEL[filter], onRemove: () => onFilter('all') }] : []}
          onClear={() => {
            onFilter('all');
            setSearch('');
          }}
        >
          <FilterSearch value={search} onChange={setSearch} placeholder="Search tasks or people" />
        </FilterBar>
      )}

      {error && <div className="tm-error px-4 py-3 text-xs font-semibold">{error}</div>}

      {visible.length === 0 ? (
        <EmptyState
          icon={<CheckSquare className="h-6 w-6 text-[var(--tm-primary-dark)]" />}
          title={tasks.length === 0 ? 'No tasks in this subfolder yet' : 'No tasks match'}
          description={tasks.length === 0 ? 'Tasks created for this subfolder show up here.' : 'Try another filter or search.'}
        />
      ) : (
        <div className="space-y-5">
          {GROUPS.map((g) => {
            const all = visible.filter((t) => groupOf(t) === g.id);
            if (all.length === 0) return null;
            const rows = g.id === 'completed' && !allCompleted ? all.slice(0, COMPLETED_SHOWN) : all;
            return (
              <section key={`${g.id}-${filter}-${q}`} aria-label={g.label}>
                <h3 className="mb-3 flex items-center gap-2 px-1 text-[13px] font-extrabold text-[var(--tm-ink)]">
                  {g.label}
                  <span className="rounded-full bg-[var(--tm-bg-sunken)] px-2 py-0.5 text-[11px] font-bold tabular-nums text-[var(--tm-ink-soft)]">{all.length}</span>
                </h3>
                <Stagger className="space-y-3" role="list">
                  {rows.map((t) => (
                    <TaskRow key={t.id} task={t} spent={spent(t)} sessionSeconds={sessionSeconds(t)} onOpen={() => navigate(taskPath(t.id))} />
                  ))}
                </Stagger>
                {g.id === 'completed' && all.length > COMPLETED_SHOWN && (
                  <div className="mt-3 flex justify-center">
                    <Button variant="outline" size="sm" onClick={() => setAllCompleted((v) => !v)}>
                      {allCompleted ? 'Show fewer' : `Show all ${all.length}`}
                    </Button>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
};

/** Overview card: the four counts and the first few tasks in progress. Opens the Tasks tab, filtered. */
export const SubfolderTaskSummary: React.FC<{ data: SubfolderTasksData; onOpen: (f: TaskFilter) => void; className?: string }> = ({ data, onOpen, className = '' }) => {
  const navigate = useNavigate();
  const taskPath = useTaskPath();
  const { tasks, error, spent } = data;
  const c = useMemo(() => counts(tasks ?? []), [tasks]);
  const active = (tasks ?? []).filter((t) => groupOf(t) === 'in_progress').sort(byDue).slice(0, 3);

  const stats: { f: TaskFilter; label: string; value: number; tone: string }[] = [
    { f: 'in_progress', label: 'In progress', value: c.in_progress, tone: 'text-[var(--tm-warning)]' },
    { f: 'upcoming', label: 'Upcoming', value: c.upcoming, tone: 'text-[var(--tm-ink)]' },
    { f: 'overdue', label: 'Overdue', value: c.overdue, tone: 'text-[var(--tm-danger)]' },
    { f: 'completed', label: 'Completed', value: c.completed, tone: 'text-[var(--tm-success)]' }
  ];

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-base font-extrabold">Tasks</CardTitle>
          <Button variant="ghost" size="sm" onClick={() => onOpen('all')} rightIcon={<ArrowUpRight className="h-4 w-4" />}>
            View all
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!tasks ? (
          error ? (
            <p className="text-[13px] text-[var(--tm-ink-muted)]">{error}</p>
          ) : (
            <div className="h-16 animate-pulse rounded-[var(--tm-radius-md)] bg-[var(--tm-bg-sunken)]" />
          )
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {stats.map((s) => (
                <button
                  key={s.f}
                  type="button"
                  onClick={() => onOpen(s.f)}
                  className="rounded-[var(--tm-radius-md)] bg-[var(--tm-card-muted)] px-4 py-3 text-left transition-colors hover:bg-[var(--tm-bg-sunken)]"
                >
                  <span className={`block text-[24px] font-extrabold leading-none tabular-nums ${s.tone}`}>{s.value}</span>
                  <span className="mt-1.5 block text-[12px] font-semibold text-[var(--tm-ink-muted)]">{s.label}</span>
                </button>
              ))}
            </div>
            {active.length > 0 && (
              <ul className="space-y-2">
                {active.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => navigate(taskPath(t.id))}
                      className="flex w-full items-center gap-3 rounded-[var(--tm-radius-md)] px-2 py-1.5 text-left transition-colors hover:bg-[var(--tm-card-muted)]"
                    >
                      <Avatar name={t.assignee?.name ?? '?'} src={t.assignee?.avatar_url ?? undefined} size="sm" />
                      <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-[var(--tm-ink)]">{t.title}</span>
                      {t.timer_running && (
                        <span className="inline-flex items-center gap-1 text-[11.5px] font-bold text-[var(--tm-success)]">
                          <Timer className="h-3.5 w-3.5" />
                          {formatDuration(spent(t))}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {tasks.length === 0 && <p className="text-[13px] text-[var(--tm-ink-muted)]">No tasks in this subfolder yet.</p>}
          </>
        )}
      </CardContent>
    </Card>
  );
};
