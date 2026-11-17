import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { endOfWeek, format, startOfWeek } from 'date-fns';
import { AlertTriangle, CheckSquare, ChevronLeft, ChevronDown, ClipboardCheck, Clock, Inbox, LayoutList, ListChecks, Plus, Search, Send, User } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { PageHeader } from '../../../components/ui/PageHeader';
import { StatCard } from '../../../components/ui/StatCard';
import { useMasterSelection } from '../../../components/ui/MasterDetail';
import { EmptyState } from '../../../components/ui/EmptyState';
import { SkeletonGrid } from '../../../components/ui/Skeleton';
import { useTimerStore } from '../../../store/useTimerStore';
import { SubmitReviewModal } from '../../reviews/components/SubmitReviewModal';
import { useAuthStore } from '../../../store/authStore';
import { socket } from '../../../services/socket';
import { projectApi, type Project } from '../../../services/http/projectApi';
import { reviewApi } from '../../../services/http/reviewApi';
import { taskApi, type ApiPriority, type ApiTask, type ApiTaskStatus } from '../../../services/http/taskApi';
import { getTodayDateString } from '../../../utils/time';
import { dailyCounts, weekTrend } from '../../../utils/trend';
import { isOverdue } from '../components/TaskMeta';
import { useReloadOnTimerChange } from '../components/TaskTimer';
import { deadlineHeat } from '../../../utils/deadlineHeat';
import { TaskFormModal } from '../components/TaskFormModal';
import { ViewTiles, type ViewTileGroup } from '../components/ViewTiles';
import { FilterChips, FiltersPopover } from '../components/TaskFilters';
import { TaskListRow } from '../components/TaskListRow';
import { TaskDetailPanel } from '../components/TaskDetailPanel';

const STATUS_OPTIONS: { value: '' | ApiTaskStatus; label: string }[] = [
  { value: '', label: 'Any status' },
  { value: 'todo', label: 'To do' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'changes_requested', label: 'Changes requested' },
  { value: 'approved', label: 'Approved' }
];

const PRIORITY_OPTIONS: { value: '' | ApiPriority; label: string }[] = [
  { value: '', label: 'Any priority' },
  { value: 'urgent', label: 'Urgent' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' }
];

const DUE_OPTIONS = [
  { value: '', label: 'Any due date' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: 'none', label: 'No date' }
];

type Scope = 'created' | 'assigned' | 'by_me' | 'review' | 'all';

/** Which tab a task belongs to, for the signed-in person. */
const TAB_TEST: Record<Scope, (t: ApiTask, me: string) => boolean> = {
  created: (t, me) => t.created_by?.id === me && t.assignee?.id === me,
  assigned: (t, me) => t.assignee?.id === me,
  by_me: (t, me) => t.created_by?.id === me && t.assignee?.id !== me,
  review: (t, me) => t.assignee?.id === me && (t.status === 'submitted' || t.status === 'changes_requested'),
  all: () => true
};

/** Quick filters a stat card can set through `?quick=`. */
const OPEN_STATUSES = ['todo', 'in_progress', 'changes_requested'];
const QUICK: Record<string, { label: string; test: (t: ApiTask, today: string) => boolean }> = {
  overdue: { label: 'Overdue', test: (t) => isOverdue(t) },
  due_today: { label: 'Due today', test: (t, today) => OPEN_STATUSES.includes(t.status) && t.due_date === today },
  running: { label: 'Timer running', test: (t) => t.timer_running },
  open: { label: 'Open', test: (t) => OPEN_STATUSES.includes(t.status) },
  in_review: { label: 'In review', test: (t) => t.status === 'submitted' || t.status === 'changes_requested' }
};

const VIEW_INFO: Record<Scope, { label: string; hint: string }> = {
  created: { label: 'My tasks', hint: 'Created by me, for me' },
  assigned: { label: 'Assigned to me', hint: 'Everything on my plate' },
  by_me: { label: 'Assigned by me', hint: 'Handed to others' },
  review: { label: 'Pending review', hint: 'Waiting or changes asked' },
  all: { label: 'All tasks', hint: 'Everyone, every project' }
};

type GroupId = 'changes' | 'overdue' | 'in_progress' | 'upcoming' | 'submitted' | 'done';
/** Always listed (even when empty) in the views that hold open work, so these sections never seem to have gone missing. */
const CORE_GROUPS: GroupId[] = ['overdue', 'in_progress', 'upcoming', 'done'];
const GROUPS: { id: GroupId; label: string }[] = [
  { id: 'changes', label: 'Changes requested' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'in_progress', label: 'In progress' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'submitted', label: 'Submitted' },
  { id: 'done', label: 'Completed' }
];

type SortKey = 'due' | 'newest' | 'priority' | 'title';
const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'due', label: 'Due date' },
  { value: 'newest', label: 'Newest' },
  { value: 'priority', label: 'Priority' },
  { value: 'title', label: 'Title' }
];
const GROUP_DOT: Record<GroupId, string> = {
  changes: 'var(--tm-danger)',
  overdue: 'var(--tp-red)',
  in_progress: 'var(--tm-accent)',
  upcoming: 'var(--tm-primary-dark)',
  submitted: 'var(--tm-info)',
  done: 'var(--tm-success)'
};
/** What an empty section says, so Overdue, In progress, Upcoming and Completed are never just blank. */
const GROUP_EMPTY: Partial<Record<GroupId, { title: string; description: string; action?: string }>> = {
  overdue: { title: 'Nothing overdue', description: 'Tasks past their due date show up here.' },
  in_progress: { title: 'Nothing in progress', description: 'Start a task’s timer and it moves here.' },
  upcoming: { title: 'Nothing coming up', description: 'Tasks you have not started show up here.', action: 'New task' },
  done: { title: 'Nothing completed yet', description: 'Approved tasks are kept here.' }
};
const PRIORITY_RANK: Record<ApiPriority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

const byDue = (a: ApiTask, b: ApiTask) => (a.due_date ?? '9999-12-31').localeCompare(b.due_date ?? '9999-12-31') || b.created_at.localeCompare(a.created_at);
const SORTERS: Record<SortKey, (a: ApiTask, b: ApiTask) => number> = {
  due: byDue,
  newest: (a, b) => b.created_at.localeCompare(a.created_at),
  priority: (a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || byDue(a, b),
  title: (a, b) => a.title.localeCompare(b.title)
};

export const TasksPage: React.FC = () => {
  const navigate = useNavigate();
  const me = useAuthStore((s) => s.user);
  const prefix = me?.role === 'admin' ? '/admin' : '/app';

  const [tasks, setTasks] = useState<ApiTask[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [scope, setScope] = useState<Scope>('all');
  const [projectId, setProjectId] = useState('');
  const [status, setStatus] = useState<'' | ApiTaskStatus>('');
  const [subfolderId, setSubfolderId] = useState('');
  const [priority, setPriority] = useState<'' | ApiPriority>('');
  const [due, setDue] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortKey>('due');
  const [collapsed, setCollapsed] = useState<Set<GroupId>>(new Set(['done'])); // Completed starts closed
  const toggleGroup = (id: GroupId) =>
    setCollapsed((c) => {
      const next = new Set(c);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // A stat card elsewhere can open this page already filtered (?quick=overdue).
  const [params, setParams] = useSearchParams();
  const quickParam = params.get('quick') ?? '';
  const quick = quickParam in QUICK ? quickParam : '';
  const setQuick = (v: string) => setParams(v ? { quick: v } : {}, { replace: true });

  const load = useCallback(async () => {
    try {
      const list = await taskApi.list({
        project_id: projectId || undefined,
        status: status || undefined
      });
      setTasks(list);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load tasks');
    } finally {
      setLoading(false);
    }
  }, [projectId, status]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  useEffect(() => {
    projectApi.list().then(setProjects).catch(() => {});
  }, []);

  // A new assignment arrives live: refresh the list.
  useEffect(() => socket.on('notification', (n: { type?: string }) => n?.type?.startsWith('task_') && load()), [load]);

  const weekEnd = format(endOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');

  // Filtered, sorted, then split into the list's groups (the flat order is what the detail selection follows).
  const visible = useMemo(() => {
    const today = getTodayDateString();
    const weekStart = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');
    const q = search.trim().toLowerCase();
    const groupOf = (t: ApiTask): GroupId =>
      t.status === 'changes_requested' ? 'changes' : t.status === 'approved' ? 'done' : t.status === 'submitted' ? 'submitted' : isOverdue(t) ? 'overdue' : t.status === 'in_progress' ? 'in_progress' : 'upcoming';
    const kept = tasks.filter((t) => {
      if (!TAB_TEST[scope](t, me?.id ?? '')) return false;
      if (quick && !QUICK[quick].test(t, today)) return false;
      if (subfolderId && t.subfolder_id !== subfolderId) return false;
      if (priority && t.priority !== priority) return false;
      if (q && !t.title.toLowerCase().includes(q)) return false;
      if (due === 'overdue') return isOverdue(t);
      if (due === 'today') return t.due_date === today;
      if (due === 'week') return !!t.due_date && t.due_date >= weekStart && t.due_date <= weekEnd;
      if (due === 'none') return !t.due_date;
      return true;
    });
    kept.sort(SORTERS[sort]);
    const showCore = kept.length > 0 && ['created', 'assigned', 'all'].includes(scope) && !quick && !status && !search.trim();
    const groups = GROUPS.map((g) => ({ ...g, tasks: kept.filter((t) => groupOf(t) === g.id) })).filter((g) => g.tasks.length > 0 || (showCore && CORE_GROUPS.includes(g.id)));
    return { groups, flat: groups.flatMap((g) => g.tasks) };
  }, [tasks, scope, me?.id, quick, status, subfolderId, priority, due, search, sort, weekEnd]);

  const tabCount = (s: Scope) => tasks.filter((t) => TAB_TEST[s](t, me?.id ?? '')).length;
  const scoped = useMemo(() => tasks.filter((t) => TAB_TEST[scope](t, me?.id ?? '')), [tasks, scope, me?.id]);

  // Subfolders of the tasks loaded (narrowed to the chosen project).
  const subfolderOptions = useMemo(() => {
    const seen = new Map<string, string>();
    tasks.forEach((t) => seen.has(t.subfolder_id) || seen.set(t.subfolder_id, t.subfolder_name));
    return [...seen].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [tasks]);

  const { selected, open, select, back } = useMasterSelection(visible.flat);

  // Timer and submit, same rules as the task detail page (only the assignee, `can_work`).
  const busy = useTimerStore((s) => s.busy);
  useReloadOnTimerChange(load);
  const [submitting, setSubmitting] = useState(false);
  const [tick, setTick] = useState(0);
  const fetchedAt = useRef(Date.now());
  const timerRunning = selected?.timer_running;
  const timerTotal = selected?.total_seconds;
  useEffect(() => {
    fetchedAt.current = Date.now();
    setTick(0);
    if (!timerRunning) return;
    const timer = setInterval(() => setTick(Math.floor((Date.now() - fetchedAt.current) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [selected?.id, timerRunning, timerTotal]);

  // Play / pause go through the shared timer (one running timer per person, toast on a switch); the list refreshes after.
  const startTimer = () => useTimerStore.getState().play(selected!);
  const stopTimer = () => useTimerStore.getState().pause();

  // Pending review tab: what the reviewer asked to change on the selected task.
  const [requested, setRequested] = useState<{ taskId: string; comments: string | null } | null>(null);
  const selectedId = selected?.id;
  const selectedStatus = selected?.status;
  useEffect(() => {
    if (scope !== 'review' || !selectedId || selectedStatus !== 'changes_requested') return;
    let live = true;
    reviewApi
      .rounds(selectedId)
      .then((rounds) => {
        const last = [...rounds].reverse().find((r) => r.decision === 'changes_requested');
        if (live) setRequested({ taskId: selectedId, comments: last?.comments ?? null });
      })
      .catch(() => live && setRequested({ taskId: selectedId, comments: null }));
    return () => {
      live = false;
    };
  }, [scope, selectedId, selectedStatus]);
  // Sent-back tasks show who asked for changes and what they wrote (the newest "changes requested" round).
  const [feedback, setFeedback] = useState<Record<string, { reviewer: string | null; comments: string | null }>>({});
  const sentBackKey = tasks.filter((t) => t.status === 'changes_requested').map((t) => t.id + ':' + t.review_rounds).join(','); // a new round refetches
  useEffect(() => {
    let live = true;
    sentBackKey.split(',').filter(Boolean).map((k) => k.split(':')[0]).forEach((id) =>
      reviewApi
        .rounds(id)
        .then((rounds) => {
          const last = [...rounds].reverse().find((r) => r.decision === 'changes_requested');
          if (live) setFeedback((f) => ({ ...f, [id]: { reviewer: last?.decided_by?.name ?? null, comments: last?.comments ?? null } }));
        })
        .catch(() => live && setFeedback((f) => ({ ...f, [id]: { reviewer: null, comments: null } })))
    );
    return () => {
      live = false;
    };
  }, [sentBackKey]);

  const filterCount = (projectId ? 1 : 0) + (status ? 1 : 0) + (quick ? 1 : 0) + (subfolderId ? 1 : 0) + (priority ? 1 : 0) + (due ? 1 : 0);
  const clearAll = () => {
    setProjectId('');
    setStatus('');
    setQuick('');
    setSubfolderId('');
    setPriority('');
    setDue('');
    setSearch('');
  };
  const projectOptions = [{ value: '', label: 'All projects' }, ...projects.map((p) => ({ value: p.id, label: p.name }))];
  const subfolderChoices = [{ value: '', label: 'All subfolders' }, ...subfolderOptions];
  const labelOf = (opts: { value: string; label: string }[], v: string) => opts.find((o) => o.value === v)?.label ?? v;
  const chips = [
    quick && { key: 'quick', label: QUICK[quick].label, onRemove: () => setQuick('') },
    projectId && { key: 'project', label: labelOf(projectOptions, projectId), onRemove: () => { setProjectId(''); setSubfolderId(''); } },
    subfolderId && { key: 'subfolder', label: labelOf(subfolderChoices, subfolderId), onRemove: () => setSubfolderId('') },
    status && { key: 'status', label: labelOf(STATUS_OPTIONS, status), onRemove: () => setStatus('') },
    priority && { key: 'priority', label: labelOf(PRIORITY_OPTIONS, priority), onRemove: () => setPriority('') },
    due && { key: 'due', label: labelOf(DUE_OPTIONS, due), onRemove: () => setDue('') }
  ].filter(Boolean) as { key: string; label: string; onRemove: () => void }[];

  const view = VIEW_INFO[scope];
  const tileGroups: ViewTileGroup[] = [
    { label: 'To do', tiles: [
      { id: 'created', ...VIEW_INFO.created, icon: <User />, count: tabCount('created') },
      { id: 'assigned', ...VIEW_INFO.assigned, icon: <Inbox />, count: tabCount('assigned') }
    ] },
    { label: 'Delegated', tiles: [{ id: 'by_me', ...VIEW_INFO.by_me, icon: <Send />, count: tabCount('by_me') }] },
    { label: 'To approve', tiles: [{ id: 'review', ...VIEW_INFO.review, icon: <ClipboardCheck />, count: tabCount('review'), alert: true }] },
    { label: 'Overview', tiles: [{ id: 'all', ...VIEW_INFO.all, icon: <LayoutList />, count: tabCount('all') }] }
  ];

  return (
    <>
      <PageHeader
        title={scope === 'all' ? 'Tasks' : 'My tasks'}
        description="Open a task for its files, progress and timer."
        actions={
          <Button size="sm" onClick={() => setCreating(true)} leftIcon={<Plus className="h-4 w-4" />}>
            New task
          </Button>
        }
      />

      <ViewTiles groups={tileGroups} active={scope} onChange={(id) => setScope(id as Scope)} />

      <section aria-label={`${view.label} at a glance`} className="space-y-3">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <h2 className="text-[15px] font-semibold text-[var(--tm-ink)]">{view.label} at a glance</h2>
          <p className="text-[12.5px] font-medium text-[var(--tm-ink-muted)]">Click a number to show only those tasks</p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Tasks"
            value={scoped.length}
            icon={<ListChecks className="h-5 w-5" />}
            tone="primary"
            hint="Created per day, last 7 days"
            onClick={() => {
              setStatus('');
              setQuick('');
            }}
            {...weekTrend(dailyCounts(scoped, (t) => t.created_at, 14))}
          />
          <StatCard label="In progress" value={scoped.filter((t) => t.status === 'in_progress').length} icon={<Clock className="h-5 w-5" />} tone="warn" hint="Being worked on" onClick={() => { setQuick(''); setStatus('in_progress'); }} />
          <StatCard label="Submitted" value={scoped.filter((t) => t.status === 'submitted').length} icon={<Send className="h-5 w-5" />} tone="neutral" hint="Waiting for review" onClick={() => { setQuick(''); setStatus('submitted'); }} />
          <StatCard
            label="Overdue"
            value={scoped.filter(isOverdue).length}
            icon={<AlertTriangle className="h-5 w-5" />}
            tone="bad"
            className="bg-[var(--tm-danger-bg)]!"
            valueClassName="text-[var(--tm-danger)]"
            hint="Overdue by due date, last 7 days"
            trend={dailyCounts(scoped.filter(isOverdue), (t) => t.due_date, 7)}
            onClick={() => {
              setStatus('');
              setQuick('overdue');
            }}
          />
        </div>
      </section>

      {error && (
        <div className="tm-error px-4 py-3 text-xs font-semibold">{error}</div>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(320px,460px)_minmax(0,1fr)]">
        <section
          aria-label={view.label}
          className={`min-w-0 flex-col gap-3 rounded-[var(--tm-radius-card)] border border-[var(--tm-border)]/60 bg-[var(--tm-card)] p-4 shadow-soft-xs ${open ? 'hidden lg:flex' : 'flex'}`}
        >
          <label className="flex h-11 items-center gap-2 rounded-full border border-[var(--tm-border)] bg-[var(--tm-card)] px-4 text-[var(--tm-ink-muted)] transition-[border-color,box-shadow] focus-within:border-[var(--tm-primary-light)] focus-within:shadow-glow">
            <Search className="h-4 w-4 shrink-0" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search in ${view.label}`}
              aria-label={`Search in ${view.label}`}
              className="min-w-0 flex-1 bg-transparent text-[13px] font-medium text-[var(--tm-ink)] outline-none placeholder:text-[var(--tm-ink-muted)]"
            />
          </label>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-[15px] font-semibold text-[var(--tm-ink)]">
              {view.label} <span className="tabular-nums text-[var(--tm-ink-muted)]">· {visible.flat.length}</span>
            </h3>
            <div className="flex items-center gap-2">
              <FiltersPopover
                activeCount={filterCount}
                resultCount={visible.flat.length}
                onClearAll={clearAll}
                fields={[
                  { key: 'project', label: 'Project', value: projectId, options: projectOptions, onChange: (v) => { setProjectId(v); setSubfolderId(''); } },
                  { key: 'subfolder', label: 'Subfolder', value: subfolderId, options: subfolderChoices, onChange: setSubfolderId },
                  { key: 'status', label: 'Status', value: status, options: STATUS_OPTIONS, onChange: (v) => setStatus(v as '' | ApiTaskStatus) },
                  { key: 'priority', label: 'Priority', value: priority, options: PRIORITY_OPTIONS, onChange: (v) => setPriority(v as '' | ApiPriority) },
                  { key: 'due', label: 'Due', value: due, options: DUE_OPTIONS, onChange: setDue }
                ]}
              />
              <label className="inline-flex h-10 items-center gap-2 rounded-full border border-[var(--tm-border)] bg-[var(--tm-card)] pl-4 pr-2 text-[13px] font-semibold text-[var(--tm-ink-muted)]">
                Sort
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as SortKey)}
                  aria-label="Sort tasks"
                  className="bg-transparent font-semibold text-[var(--tm-ink)] outline-none"
                >
                  {SORT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <FilterChips chips={chips} />

          <div className="max-h-[calc(100dvh-16rem)] min-h-[240px] space-y-4 overflow-y-auto pr-1">
            {loading ? (
              <SkeletonGrid count={4} />
            ) : visible.groups.length === 0 ? (
              filterCount > 0 || search.trim() ? (
                <EmptyState size="compact" title="No tasks match" description="Try another search, or clear the filters." actionLabel="Clear filters" onAction={clearAll} />
              ) : (
                <EmptyState size="compact" title="No tasks yet" description="Tasks you create or are given show up here." actionLabel="New task" onAction={() => setCreating(true)} />
              )
            ) : (
              visible.groups.map((g) => (
                <div key={g.id}>
                  <button
                    type="button"
                    aria-expanded={!collapsed.has(g.id)}
                    onClick={() => toggleGroup(g.id)}
                    className="mb-1 flex w-full items-center gap-2 px-3 py-1 text-left"
                  >
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: GROUP_DOT[g.id] }} />
                    <span className={`text-[11px] font-semibold uppercase tracking-[0.1em] ${g.id === 'overdue' || g.id === 'changes' ? 'text-[var(--tp-red)]' : 'text-[var(--tm-ink-muted)]'}`}>
                      {g.id === 'done' ? (
                        `Completed (${g.tasks.length})`
                      ) : (
                        <>
                          {g.label} <span className="tabular-nums">· {g.tasks.length}</span>
                        </>
                      )}
                    </span>
                    <span className="h-px flex-1 bg-[var(--tm-border)]" />
                    <ChevronDown className={`h-4 w-4 shrink-0 text-[var(--tm-ink-muted)] transition-transform ${collapsed.has(g.id) ? '-rotate-90' : ''}`} />
                  </button>
                  <div className={`space-y-1 ${collapsed.has(g.id) ? 'hidden' : ''}`}>
                    {g.tasks.map((t) => (
                      <TaskListRow
                        key={t.id}
                        task={t}
                        selected={t.id === selected?.id}
                        heat={deadlineHeat(t.due_date, OPEN_STATUSES.includes(t.status))}
                        onSelect={() => select(t.id)}
                        feedback={feedback[t.id]}
                        onFix={() => navigate(`${prefix}/tasks/${t.id}`)}
                      />
                    ))}
                    {g.tasks.length === 0 && (
                      <EmptyState
                        size="compact"
                        className="py-4"
                        title={GROUP_EMPTY[g.id]?.title ?? 'Nothing here'}
                        description={GROUP_EMPTY[g.id]?.description ?? 'Matching tasks show up here.'}
                        actionLabel={GROUP_EMPTY[g.id]?.action}
                        onAction={GROUP_EMPTY[g.id]?.action ? () => setCreating(true) : undefined}
                      />
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <div className={`min-w-0 ${open ? 'block' : 'hidden lg:block'}`}>
          <button
            type="button"
            onClick={back}
            className="mb-3 inline-flex items-center gap-1 rounded-full px-3 py-2 text-[13px] font-bold text-[var(--tm-ink)] hover:bg-[var(--tm-bg-sunken)] lg:hidden"
          >
            <ChevronLeft className="h-4 w-4" /> All
          </button>
          {loading ? null : !selected ? (
            <EmptyState
              icon={<CheckSquare className="h-6 w-6 text-[var(--tm-primary-dark)]" />}
              title="No tasks here"
              description={scope !== 'all' ? 'Nothing in this tab right now.' : 'No tasks match these filters yet.'}
              actionLabel="New task"
              onAction={() => setCreating(true)}
            />
          ) : (
            <div key={selected.id} data-focus-keep className="animate-fade-in">
              <TaskDetailPanel
                task={selected}
                meId={me?.id}
                requestedChanges={
                  scope === 'review' && selected.status === 'changes_requested'
                    ? requested?.taskId === selected.id
                      ? (requested.comments ?? 'No comments were left.')
                      : 'Loading…'
                    : null
                }
                busy={busy}
                tick={tick}
                onToggleTimer={selected.timer_running ? stopTimer : startTimer}
                onSubmit={() => setSubmitting(true)}
                onOpen={() => navigate(`${prefix}/tasks/${selected.id}`)}
              />
            </div>
          )}
        </div>
      </div>

      {selected && (
        <SubmitReviewModal isOpen={submitting} onClose={() => setSubmitting(false)} task={selected} onSubmitted={load} />
      )}
      <TaskFormModal
        isOpen={creating}
        onClose={() => setCreating(false)}
        defaultProjectId={projectId || undefined}
        onSaved={(t) => navigate(`${prefix}/tasks/${t.id}`)}
      />
    </>
  );
};
