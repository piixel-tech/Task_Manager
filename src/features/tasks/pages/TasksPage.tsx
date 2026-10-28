import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, CalendarClock, CheckSquare, Clock, Plus } from 'lucide-react';
import { Card, CardContent } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Avatar } from '../../../components/ui/Avatar';
import { PersonLink } from '../../../components/ui/PersonLink';
import { PageHeader } from '../../../components/ui/PageHeader';
import { PillTabs } from '../../../components/ui/PillTabs';
import { Select } from '../../../components/ui/Select';
import { StatusChip } from '../../../components/ui/StatusChip';
import { ProgressBar } from '../../../components/ui/ProgressRing';
import { EmptyState } from '../../../components/ui/EmptyState';
import { SkeletonGrid } from '../../../components/ui/Skeleton';
import { useAuthStore } from '../../../store/authStore';
import { socket } from '../../../services/socket';
import { projectApi, type Project } from '../../../services/http/projectApi';
import { taskApi, type ApiTask, type ApiTaskStatus } from '../../../services/http/taskApi';
import { formatDate } from '../../../utils/time';
import { formatDuration } from '../../../utils/format';
import { isOverdue, progressTone, StatusDot } from '../components/TaskMeta';
import { TaskFormModal } from '../components/TaskFormModal';

const STATUS_OPTIONS: { value: '' | ApiTaskStatus; label: string }[] = [
  { value: '', label: 'Any status' },
  { value: 'todo', label: 'To do' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'changes_requested', label: 'Changes requested' },
  { value: 'approved', label: 'Approved' }
];

export const TasksPage: React.FC = () => {
  const navigate = useNavigate();
  const me = useAuthStore((s) => s.user);
  const prefix = me?.role === 'admin' ? '/admin' : '/app';

  const [tasks, setTasks] = useState<ApiTask[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [scope, setScope] = useState<'mine' | 'all'>(me?.role === 'admin' ? 'all' : 'mine');
  const [projectId, setProjectId] = useState('');
  const [status, setStatus] = useState<'' | ApiTaskStatus>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      const list = await taskApi.list({
        mine: scope === 'mine' || undefined,
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
  }, [scope, projectId, status]);

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

  return (
    <>
      <PageHeader
        title={scope === 'mine' ? 'My tasks' : 'Tasks'}
        description="Tasks live inside a project's subfolders. Open one to see its assets, progress and timer."
        actions={
          <Button size="sm" onClick={() => setCreating(true)} leftIcon={<Plus className="h-4 w-4" />}>
            New task
          </Button>
        }
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <PillTabs
          activeTab={scope}
          onChange={(t) => setScope(t as 'mine' | 'all')}
          tabs={[
            { id: 'mine', label: 'Assigned to me' },
            { id: 'all', label: me?.role === 'admin' ? 'All tasks' : 'My projects' }
          ]}
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:w-[460px]">
          <Select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            options={[{ value: '', label: 'All projects' }, ...projects.map((p) => ({ value: p.id, label: p.name }))]}
          />
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value as '' | ApiTaskStatus)}
            options={STATUS_OPTIONS}
          />
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">{error}</div>
      )}

      {loading ? (
        <SkeletonGrid count={4} />
      ) : sorted.length === 0 ? (
        <EmptyState
          icon={<CheckSquare className="h-6 w-6 text-[var(--tm-primary)]" />}
          title="No tasks here"
          description={scope === 'mine' ? 'Nothing is assigned to you right now.' : 'No tasks match these filters yet.'}
          actionLabel="New task"
          onAction={() => setCreating(true)}
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {sorted.map((t) => {
            const overdue = isOverdue(t);
            return (
              <Card key={t.id} interactive animate={false} onClick={() => navigate(`${prefix}/tasks/${t.id}`)}>
                <CardContent className="space-y-4 pt-6">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-[15.5px] font-bold text-[var(--tm-ink)]">{t.title}</h3>
                      <p className="mt-0.5 truncate text-[12px] text-[var(--tm-ink-muted)]">
                        {t.project_name} › {t.subfolder_name}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {t.unresolved_changes > 0 && (
                        <span
                          title={`${t.unresolved_changes} open mid-way ${t.unresolved_changes === 1 ? 'change' : 'changes'}`}
                          className="inline-flex h-6 min-w-6 items-center justify-center gap-1 rounded-full bg-[var(--tm-warning-bg)] px-2 text-[11px] font-extrabold text-[var(--tm-warning)]"
                        >
                          <AlertCircle className="h-3.5 w-3.5" />
                          {t.unresolved_changes}
                        </span>
                      )}
                      <StatusChip status={t.priority} size="sm" />
                      <StatusChip status={t.status} size="sm" />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[11.5px] font-semibold text-[var(--tm-ink-muted)]">
                      <span>Progress</span>
                      <span className="tabular-nums text-[var(--tm-ink-soft)]">{t.progress}%</span>
                    </div>
                    <ProgressBar value={t.progress} tone={progressTone(t)} height={7} />
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 text-[12px] font-semibold text-[var(--tm-ink-soft)]">
                    <PersonLink userId={t.assignee?.id} className="flex items-center gap-2">
                      {t.assignee && <Avatar name={t.assignee.name} src={t.assignee.avatar_url ?? undefined} size="xs" />}
                      {t.assignee?.name}
                    </PersonLink>
                    <span className="flex items-center gap-4">
                      {t.due_date && (
                        <span className={`flex items-center gap-1.5 ${overdue ? 'text-[var(--tm-danger)]' : ''}`}>
                          <CalendarClock className="h-3.5 w-3.5" />
                          {overdue ? 'Overdue · ' : ''}
                          {formatDate(t.due_date, 'MMM d')}
                        </span>
                      )}
                      <span className="flex items-center gap-1.5 tabular-nums">
                        <StatusDot running={t.timer_running} />
                        <Clock className="h-3.5 w-3.5" />
                        {formatDuration(t.total_seconds)}
                      </span>
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
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
