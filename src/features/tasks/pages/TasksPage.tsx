import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { endOfWeek, format, startOfWeek } from 'date-fns';
import { AlertCircle, AlertTriangle, ArrowUpRight, CalendarClock, CheckSquare, Clock, ListChecks, Play, Plus, Send, Square } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { Avatar } from '../../../components/ui/Avatar';
import { PersonLink } from '../../../components/ui/PersonLink';
import { PageHeader } from '../../../components/ui/PageHeader';
import { StatCard } from '../../../components/ui/StatCard';
import { FilterBar, FilterPill, FilterSearch } from '../../../components/ui/FilterBar';
import { DetailCard, MasterDetail, MasterRow, useMasterSelection } from '../../../components/ui/MasterDetail';
import { EmptyState } from '../../../components/ui/EmptyState';
import { SkeletonGrid } from '../../../components/ui/Skeleton';
import { toast } from '../../../store/useToastStore';
import { SubmitReviewModal } from '../../reviews/components/SubmitReviewModal';
import { useAuthStore } from '../../../store/authStore';
import { socket } from '../../../services/socket';
import { projectApi, type Project } from '../../../services/http/projectApi';
import { reviewApi } from '../../../services/http/reviewApi';
import { taskApi, type ApiPriority, type ApiTask, type ApiTaskStatus } from '../../../services/http/taskApi';
import { formatDate, getTodayDateString } from '../../../utils/time';
import { formatDuration } from '../../../utils/format';
import { dailyCounts, weekTrend } from '../../../utils/trend';
import { isOverdue, StatusDot } from '../components/TaskMeta';
import { TaskFormModal } from '../components/TaskFormModal';

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

const CHIP = 'inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-semibold leading-none';
const CHIP_SOFT = `${CHIP} bg-[var(--tp-chip)] text-[var(--tp-chip-ink)]`;
const STATUS_LABEL: Record<ApiTaskStatus, string> = {
  todo: 'Pending',
  in_progress: 'In progress',
  submitted: 'Submitted',
  changes_requested: 'Changes requested',
  approved: 'Approved'
};

const StatusPill: React.FC<{ status: ApiTaskStatus }> = ({ status }) => <span className={CHIP_SOFT}>{STATUS_LABEL[status]}</span>;
const PriorityPill: React.FC<{ priority: ApiPriority }> = ({ priority }) => (
  <span className={CHIP_SOFT}>{priority.charAt(0).toUpperCase() + priority.slice(1)}</span>
);
/** A small red dot + "Overdue" (not a pink pill). In the detail it sits in a chip of the same size as the others. */
const OverdueMark: React.FC<{ chip?: boolean; onLight?: boolean }> = ({ chip, onLight }) => (
  <span className={`${chip ? CHIP_SOFT : 'inline-flex items-center gap-1.5 text-[11px] font-semibold leading-none'} ${onLight && !chip ? 'text-[var(--tp-red-on-sel)]' : 'text-[var(--tp-red)]'}`}>
    <span className={`h-1.5 w-1.5 rounded-full ${onLight && !chip ? 'bg-[var(--tp-red-on-sel)]' : 'bg-[var(--tp-red)]'}`} />
    Overdue
  </span>
);

/** A small info card of the detail panel. */
const Mini: React.FC<{ title: string; span?: boolean; children: React.ReactNode }> = ({ title, span, children }) => (
  <section className={`min-w-0 rounded-2xl border border-[var(--tp-card-border)] bg-[var(--tp-card)] p-3.5 text-[var(--tp-text)] ${span ? 'col-span-full' : ''}`}>
    <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--tp-muted)]">{title}</h3>
    {children}
  </section>
);

const ACTION_BTN = 'inline-flex h-10 items-center gap-2 rounded-full px-4 text-[13px] font-semibold transition-colors disabled:opacity-60';

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

export const TasksPage: React.FC = () => {
  const navigate = useNavigate();
  const me = useAuthStore((s) => s.user);
  const prefix = me?.role === 'admin' ? '/admin' : '/app';

  const [tasks, setTasks] = useState<ApiTask[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [scope, setScope] = useState<Scope>(me?.role === 'admin' ? 'all' : 'assigned');
  const [projectId, setProjectId] = useState('');
  const [status, setStatus] = useState<'' | ApiTaskStatus>('');
  const [subfolderId, setSubfolderId] = useState('');
  const [priority, setPriority] = useState<'' | ApiPriority>('');
  const [due, setDue] = useState('');
  const [search, setSearch] = useState('');
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

  const sorted = useMemo(
    () =>
      [...tasks].sort((a, b) => {
        const da = a.due_date ?? '9999-12-31';
        const db = b.due_date ?? '9999-12-31';
        return da.localeCompare(db) || b.created_at.localeCompare(a.created_at);
      }),
    [tasks]
  );

  const visible = useMemo(() => {
    const today = getTodayDateString();
    const weekStart = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');
    const weekEnd = format(endOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');
    const q = search.trim().toLowerCase();
    return sorted.filter((t) => {
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
  }, [sorted, scope, me?.id, quick, subfolderId, priority, due, search]);

  const tabCount = (s: Scope) => tasks.filter((t) => TAB_TEST[s](t, me?.id ?? '')).length;

  // Subfolders of the tasks loaded (narrowed to the chosen project).
  const subfolderOptions = useMemo(() => {
    const seen = new Map<string, string>();
    tasks.forEach((t) => seen.has(t.subfolder_id) || seen.set(t.subfolder_id, t.subfolder_name));
    return [...seen].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [tasks]);

  const { selected, open, select, back } = useMasterSelection(visible);

  // Timer and submit, same rules as the task detail page (only the assignee, `can_work`).
  const [busy, setBusy] = useState(false);
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

  const replaceTask = (next: ApiTask) => setTasks((list) => list.map((x) => (x.id === next.id ? next : x)));
  const runTimer = async (work: () => Promise<void>) => {
    setBusy(true);
    try {
      await work();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };
  const startTimer = () =>
    runTimer(async () => {
      const res = await taskApi.startTimer(selected!.id);
      replaceTask(res.task);
      if (res.stopped_task_id) {
        toast.info('Timer switched', 'The timer on your other task was stopped.');
        load();
      }
    });
  const stopTimer = () => runTimer(async () => replaceTask(await taskApi.stopTimer(selected!.id)));

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
  const activeFilters =
    (projectId ? 1 : 0) + (status ? 1 : 0) + (quick ? 1 : 0) + (subfolderId ? 1 : 0) + (priority ? 1 : 0) + (due ? 1 : 0) + (search.trim() ? 1 : 0);

  return (
    <>
      <PageHeader
        title={scope === 'all' ? 'Tasks' : 'My tasks'}
        description="Tasks live inside a project's subfolders. Open one to see its assets, progress and timer."
        actions={
          <Button size="sm" onClick={() => setCreating(true)} leftIcon={<Plus className="h-4 w-4" />}>
            New task
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Tasks"
          value={tasks.length}
          icon={<ListChecks className="h-5 w-5" />}
          tone="primary"
          hint="Created per day, last 7 days"
          onClick={() => {
            setStatus('');
            setQuick('');
          }}
          {...weekTrend(dailyCounts(tasks, (t) => t.created_at, 14))}
        />
        <StatCard label="In progress" value={tasks.filter((t) => t.status === 'in_progress').length} icon={<Clock className="h-5 w-5" />} tone="warn" hint="Being worked on" onClick={() => { setQuick(''); setStatus('in_progress'); }} />
        <StatCard label="Submitted" value={tasks.filter((t) => t.status === 'submitted').length} icon={<Send className="h-5 w-5" />} tone="neutral" hint="Waiting for review" onClick={() => { setQuick(''); setStatus('submitted'); }} />
        <StatCard
          label="Overdue"
          value={tasks.filter(isOverdue).length}
          icon={<AlertTriangle className="h-5 w-5" />}
          tone="bad"
          hint="Overdue by due date, last 7 days"
          trend={dailyCounts(tasks.filter(isOverdue), (t) => t.due_date, 7)}
          onClick={() => {
            setStatus('');
            setQuick('overdue');
          }}
        />
      </div>

      <FilterBar
        activeCount={activeFilters}
        chips={quick ? [{ key: 'quick', label: QUICK[quick].label, onRemove: () => setQuick('') }] : []}
        onClear={() => {
          setProjectId('');
          setStatus('');
          setQuick('');
          setSubfolderId('');
          setPriority('');
          setDue('');
          setSearch('');
        }}
      >
        <FilterSearch value={search} onChange={setSearch} placeholder="Search tasks by title" />
        <FilterPill
          label="Project"
          value={projectId}
          onChange={(v) => {
            setProjectId(v);
            setSubfolderId('');
          }}
          options={[{ value: '', label: 'All projects' }, ...projects.map((p) => ({ value: p.id, label: p.name }))]}
        />
        <FilterPill
          label="Status"
          value={status}
          onChange={(v) => setStatus(v as '' | ApiTaskStatus)}
          options={STATUS_OPTIONS}
        />
        <FilterPill
          label="Subfolder"
          value={subfolderId}
          onChange={setSubfolderId}
          options={[{ value: '', label: 'All subfolders' }, ...subfolderOptions]}
        />
        <FilterPill label="Priority" value={priority} onChange={(v) => setPriority(v as '' | ApiPriority)} options={PRIORITY_OPTIONS} />
        <FilterPill label="Due" value={due} onChange={setDue} options={DUE_OPTIONS} />
      </FilterBar>

      {error && (
        <div className="tm-error px-4 py-3 text-xs font-semibold">{error}</div>
      )}

      <MasterDetail
        variant="dark"
        tabs={[
          { id: 'created', label: 'My tasks', count: tabCount('created') },
          { id: 'assigned', label: 'Assigned to me', count: tabCount('assigned') },
          { id: 'by_me', label: 'Assigned by me', count: tabCount('by_me') },
          { id: 'review', label: 'Pending review', count: tabCount('review') },
          { id: 'all', label: 'All tasks', count: tabCount('all') }
        ]}
        activeTab={scope}
        onTabChange={(t) => setScope(t as Scope)}
        detailOpen={open}
        onBack={back}
        list={
          loading ? (
            <SkeletonGrid count={4} />
          ) : (
            visible.map((t) => (
              <MasterRow
                variant="dark"
                key={t.id}
                selected={t.id === selected?.id}
                onSelect={() => select(t.id)}
                avatar={t.assignee && <Avatar name={t.assignee.name} src={t.assignee.avatar_url ?? undefined} size="md" className="!h-9 !w-9" />}
                title={t.title}
                subtitle={`${t.project_name} › ${t.subfolder_name}`}
                chip={
                  <span className="flex items-center gap-1.5">
                    {isOverdue(t) && <OverdueMark onLight={t.id === selected?.id} />}
                    <StatusPill status={t.status} />
                  </span>
                }
              />
            ))
          )
        }
        detail={
          loading ? null : !selected ? (
            <EmptyState
              icon={<CheckSquare className="h-6 w-6 text-[var(--tm-primary-dark)]" />}
              title="No tasks here"
              description={scope !== 'all' ? 'Nothing in this tab right now.' : 'No tasks match these filters yet.'}
              actionLabel="New task"
              onAction={() => setCreating(true)}
            />
          ) : (
            <div key={selected.id} className="animate-fade-in">
              <DetailCard
                variant="dark"
                corner={
                  <button
                    type="button"
                    onClick={() => navigate(`${prefix}/tasks/${selected.id}`)}
                    className="inline-flex h-10 items-center gap-2 rounded-full border border-[#E7E2F2] bg-white px-4 text-[13px] font-semibold text-[#2A2933] shadow-sm transition-colors hover:border-[#C4B5E0] hover:bg-[#C4B5E0]"
                  >
                    Open task <ArrowUpRight className="h-4 w-4" />
                  </button>
                }
                title={selected.title}
                subtitle={`${selected.project_name} › ${selected.subfolder_name}`}
                badges={
                  <>
                    {selected.unresolved_changes > 0 && (
                      <span title={`${selected.unresolved_changes} open mid-way ${selected.unresolved_changes === 1 ? 'change' : 'changes'}`} className={CHIP_SOFT}>
                        <AlertCircle className="h-3.5 w-3.5" />
                        {selected.unresolved_changes}
                      </span>
                    )}
                    <PriorityPill priority={selected.priority} />
                    <StatusPill status={selected.status} />
                    {isOverdue(selected) && <OverdueMark chip />}
                  </>
                }
                actions={
                  <>
                    {selected.can_work && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={selected.timer_running ? stopTimer : startTimer}
                        className={`${ACTION_BTN} bg-[#C4B5E0] text-[#2A2933] hover:bg-[#D2C6E9]`}
                      >
                        {selected.timer_running ? <Square className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                        {selected.timer_running ? 'Stop timer' : 'Start timer'}
                        <span className="tabular-nums">· {formatDuration(selected.total_seconds + (selected.timer_running ? tick : 0))}</span>
                      </button>
                    )}
                    {selected.can_work && (
                      <button
                        type="button"
                        onClick={() => setSubmitting(true)}
                        className={`${ACTION_BTN} border border-[var(--tp-outline)] bg-transparent text-[var(--tp-text)] hover:bg-[var(--tp-outline-hover)]`}
                      >
                        <Send className="h-4 w-4" /> Submit for review
                      </button>
                    )}
                  </>
                }
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  {scope === 'review' && selected.status === 'changes_requested' && (
                    <Mini title="Requested changes" span>
                      <p className="whitespace-pre-wrap text-[13px] font-medium">
                        {requested?.taskId === selected.id ? (requested.comments ?? 'No comments were left.') : 'Loading…'}
                      </p>
                    </Mini>
                  )}
                  <Mini title="Progress">
                    <div className="flex items-baseline justify-between">
                      <span className="text-[13px] font-semibold">Done so far</span>
                      <span className="text-[13px] font-semibold tabular-nums text-[var(--tp-text-soft)]">{selected.progress}%</span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--tp-track)]">
                      <div className="h-full rounded-full bg-[var(--tp-bar)] transition-[width]" style={{ width: `${selected.progress}%` }} />
                    </div>
                  </Mini>
                  <Mini title="Assignee">
                    <PersonLink userId={selected.assignee?.id} className="flex items-center gap-2 text-[13px] font-semibold text-[var(--tp-text)]">
                      {selected.assignee && <Avatar name={selected.assignee.name} src={selected.assignee.avatar_url ?? undefined} size="sm" />}
                      {selected.assignee?.name ?? 'Unassigned'}
                    </PersonLink>
                  </Mini>
                  <Mini title="Due">
                    <span className={`flex items-center gap-1.5 text-[13px] font-semibold ${isOverdue(selected) ? 'text-[var(--tp-red)]' : 'text-[var(--tp-text)]'}`}>
                      <CalendarClock className="h-4 w-4" />
                      {selected.due_date ? formatDate(selected.due_date, 'MMM d') : 'No due date'}
                    </span>
                  </Mini>
                  <Mini title="Time tracked">
                    <span className="flex items-center gap-1.5 text-[13px] font-semibold tabular-nums">
                      <StatusDot running={selected.timer_running} />
                      <Clock className="h-4 w-4" />
                      {formatDuration(selected.total_seconds + (selected.timer_running ? tick : 0))}
                    </span>
                  </Mini>
                </div>
              </DetailCard>
            </div>
          )
        }
      />

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
