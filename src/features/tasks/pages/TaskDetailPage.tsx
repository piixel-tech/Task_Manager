import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CalendarClock, Download, MessageSquare, ExternalLink, FileText, Link2, Pencil, Play, Send, Square, Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Avatar } from '../../../components/ui/Avatar';
import { PersonLink } from '../../../components/ui/PersonLink';
import { PageHeader } from '../../../components/ui/PageHeader';
import { StatusChip } from '../../../components/ui/StatusChip';
import { ProgressBar } from '../../../components/ui/ProgressRing';
import { EmptyState } from '../../../components/ui/EmptyState';
import { SkeletonGrid } from '../../../components/ui/Skeleton';
import { useAuthStore } from '../../../store/authStore';
import { useConfirm } from '../../../hooks/useConfirm';
import { toast } from '../../../store/useToastStore';
import { socket } from '../../../services/socket';
import { assetApi, taskApi, type ApiTask, type Asset } from '../../../services/http/taskApi';
import { reviewApi, type Review } from '../../../services/http/reviewApi';
import { formatDate } from '../../../utils/time';
import { formatDuration } from '../../../utils/format';
import { isOverdue, progressTone, StatusDot } from '../components/TaskMeta';
import { TaskFormModal } from '../components/TaskFormModal';
import { ReviewActions } from '../../reviews/components/ReviewActions';
import { ReviewRounds } from '../../reviews/components/ReviewRounds';
import { SubmitReviewModal } from '../../reviews/components/SubmitReviewModal';
import { RichText } from '../../../components/editor/RichText';
import { ActivityPanel } from '../../activity/components/ActivityPanel';

const formatSize = (bytes: number) =>
  bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

export const TaskDetailPage: React.FC = () => {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const me = useAuthStore((s) => s.user);
  const prefix = me?.role === 'admin' ? '/admin' : '/app';

  const [task, setTask] = useState<ApiTask | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [rounds, setRounds] = useState<Review[]>([]);
  const [busy, setBusy] = useState(false);

  // Progress slider: follows the server value until the assignee drags it.
  const [progress, setProgress] = useState(0);
  const [savedAt, setSavedAt] = useState(0);
  // Live timer display: seconds since the last fetch, added to the server total.
  const [tick, setTick] = useState(0);
  const fetchedAt = useRef(Date.now());

  const apply = useCallback((t: ApiTask) => {
    setTask(t);
    setProgress(t.progress);
    fetchedAt.current = Date.now();
    setTick(0);
  }, []);

  const load = useCallback(async () => {
    try {
      const [t, history] = await Promise.all([taskApi.get(id), reviewApi.rounds(id).catch(() => [] as Review[])]);
      apply(t);
      setRounds(history);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the task');
    } finally {
      setLoading(false);
    }
  }, [id, apply]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  // A decision or resubmission on this task arrives live.
  useEffect(
    () => socket.on('notification', (n: { link?: string }) => n?.link?.split('?')[0].endsWith(`/tasks/${id}`) && load()),
    [id, load]
  );

  useEffect(() => {
    if (!task?.timer_running) return;
    const timer = setInterval(() => setTick(Math.floor((Date.now() - fetchedAt.current) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [task?.timer_running]);

  if (loading) return <SkeletonGrid count={2} />;
  if (!task) {
    return (
      <EmptyState
        title="Task unavailable"
        description={error ?? 'This task does not exist or you do not have access to it.'}
        actionLabel="Back to tasks"
        onAction={() => navigate(`${prefix}/tasks`)}
      />
    );
  }

  const overdue = isOverdue(task);
  const totalSeconds = task.total_seconds + (task.timer_running ? tick : 0);

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    try {
      await work();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  const commitProgress = () =>
    progress === task.progress
      ? undefined
      : run(async () => {
          apply(await taskApi.setProgress(task.id, progress));
          setSavedAt(Date.now());
        });

  const startTimer = () =>
    run(async () => {
      const res = await taskApi.startTimer(task.id);
      apply(res.task);
      if (res.stopped_task_id) toast.info('Timer switched', 'The timer on your other task was stopped.');
    });

  const stopTimer = () => run(async () => apply(await taskApi.stopTimer(task.id)));

  const remove = () =>
    confirm({
      title: `Delete “${task.title}”?`,
      message: 'Its attachments and time logs are deleted too, and the assignee is notified.',
      confirmLabel: 'Delete task',
      danger: true,
      action: () => taskApi.remove(task.id),
      successTitle: 'Task deleted'
    }).then((ok) => {
      if (ok) navigate(`${prefix}/tasks`);
    });

  const open = (a: Asset) => assetApi.open(a).catch((err) => toast.error('Could not open the file', err.message));

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {task.title}
            <StatusChip status={task.status} />
            <StatusChip status={task.priority} size="sm" />
          </span>
        }
        description={
          <button
            type="button"
            className="font-semibold text-[var(--tm-primary)] hover:underline"
            onClick={() => navigate(`${prefix}/projects/${task.project_id}/subfolders/${task.subfolder_id}`)}
          >
            {task.project_name} › {task.subfolder_name}
          </button>
        }
        actions={
          <>
            <Button variant="ghost" size="sm" onClick={() => navigate(`${prefix}/tasks`)}>
              All tasks
            </Button>
            {task.can_work && (
              <Button size="sm" onClick={() => setSubmitting(true)} leftIcon={<Send className="h-4 w-4" />}>
                Submit for review
              </Button>
            )}
            {task.can_edit && (
              <>
                <Button variant="outline" size="sm" onClick={() => setEditing(true)} leftIcon={<Pencil className="h-4 w-4" />}>
                  Edit
                </Button>
                <Button variant="danger" size="sm" onClick={remove} leftIcon={<Trash2 className="h-4 w-4" />}>
                  Delete
                </Button>
              </>
            )}
          </>
        }
      />

      {/* Assets sit at the top so the brief is the first thing the assignee sees. */}
      {task.assets.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-extrabold">Assets ({task.assets.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {task.assets.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => open(a)}
                    className="flex w-full items-center justify-between gap-3 rounded-[var(--tm-radius-md)] bg-[var(--tm-card-muted)] px-4 py-3 text-left transition-colors hover:bg-[var(--tm-bg-sunken)]"
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      {a.kind === 'link' ? (
                        <Link2 className="h-4 w-4 shrink-0 text-[var(--tm-primary)]" />
                      ) : (
                        <FileText className="h-4 w-4 shrink-0 text-[var(--tm-primary)]" />
                      )}
                      <span className="min-w-0 leading-tight">
                        <span className="block truncate text-[13px] font-bold text-[var(--tm-ink)]">{a.name}</span>
                        <span className="block truncate text-[11.5px] text-[var(--tm-ink-muted)]">
                          {a.kind === 'link' ? a.url : formatSize(a.size)}
                        </span>
                      </span>
                    </span>
                    {a.kind === 'link' ? <ExternalLink className="h-4 w-4 shrink-0" /> : <Download className="h-4 w-4 shrink-0" />}
                  </button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {task.status === 'submitted' && (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
            <p className="text-[13.5px] text-[var(--tm-ink-soft)]">
              <strong className="text-[var(--tm-ink)]">Waiting for review.</strong>{' '}
              {rounds.length > 0 && rounds[rounds.length - 1].approver
                ? `${rounds[rounds.length - 1].approver?.name} was asked to approve it.`
                : 'An approver will decide soon.'}
            </p>
            {task.can_review && task.pending_review_id && (
              <ReviewActions
                review={{ id: task.pending_review_id, task_title: task.title, submitted_by: task.assignee }}
                onDone={load}
              />
            )}
          </CardContent>
        </Card>
      )}

      {task.status === 'changes_requested' && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-[13px] font-semibold text-red-700">
          Changes were requested. See the comments below, then resubmit for review.
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-extrabold">Description</CardTitle>
            </CardHeader>
            <CardContent>
              {task.description_html ? (
                <RichText html={task.description} className="text-[var(--tm-ink-soft)]" />
              ) : (
                <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-[var(--tm-ink-soft)]">{task.description}</p>
              )}
              {task.source && (
                <button
                  type="button"
                  onClick={() => navigate(`${prefix}/chat?group=${task.source!.group_id}&message=${task.source!.message_id}`)}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-[var(--tm-primary-soft)] px-3 py-1 text-[12px] font-bold text-[var(--tm-primary-dark)] hover:underline"
                >
                  <MessageSquare className="h-3.5 w-3.5" /> Created from chat · {task.source.group_name}
                </button>
              )}
            </CardContent>
          </Card>

          {rounds.length > 0 && (
            <Card>
              <CardHeader className="flex items-center justify-between">
                <CardTitle className="text-base font-extrabold">
                  {rounds.some((r) => r.decision === 'changes_requested') ? 'Changes requested' : 'Review history'}
                </CardTitle>
                <span className="text-[12px] font-semibold text-[var(--tm-ink-muted)]">
                  {rounds.length} {rounds.length === 1 ? 'round' : 'rounds'}
                </span>
              </CardHeader>
              <CardContent>
                <ReviewRounds rounds={rounds} />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="flex items-center justify-between">
              <CardTitle className="text-base font-extrabold">Progress</CardTitle>
              <span className="text-2xl font-black tabular-nums text-[var(--tm-ink)]">{task.progress}%</span>
            </CardHeader>
            <CardContent className="space-y-3">
              <ProgressBar value={task.can_work ? progress : task.progress} tone={progressTone(task)} height={12} />
              {task.can_work ? (
                <div className="space-y-1.5">
                  <input
                    type="range"
                    min={0}
                    max={99}
                    value={progress}
                    disabled={busy}
                    onChange={(e) => setProgress(Number(e.target.value))}
                    onPointerUp={commitProgress}
                    onKeyUp={commitProgress}
                    aria-label="Progress"
                    className="w-full accent-[var(--tm-primary)]"
                  />
                  <p className="text-[11.5px] text-[var(--tm-ink-muted)]">
                    Set how far along you are (up to 99%). It reaches 100% when the task is approved.
                    {savedAt > 0 && progress === task.progress && ' Saved.'}
                  </p>
                </div>
              ) : (
                <p className="text-[11.5px] text-[var(--tm-ink-muted)]">
                  {task.status === 'approved'
                    ? 'Approved: complete.'
                    : task.status === 'submitted'
                    ? 'Submitted: progress is locked until the review is decided.'
                    : 'Only the assignee updates progress. It reaches 100% when the task is approved.'}
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-extrabold">Time tracked</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <StatusDot running={task.timer_running} />
                <span className="text-3xl font-black tabular-nums text-[var(--tm-ink)]">{formatDuration(totalSeconds)}</span>
              </div>
              {task.can_work ? (
                task.timer_running ? (
                  <Button variant="danger" className="w-full" isLoading={busy} onClick={stopTimer} leftIcon={<Square className="h-4 w-4" />}>
                    Stop timer
                  </Button>
                ) : (
                  <Button className="w-full" isLoading={busy} onClick={startTimer} leftIcon={<Play className="h-4 w-4" />}>
                    Start timer
                  </Button>
                )
              ) : (
                <p className="text-[11.5px] text-[var(--tm-ink-muted)]">Only the assignee runs the timer.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base font-extrabold">Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-[13px]">
              <Row label="Assignee">
                {task.assignee && (
                  <PersonLink userId={task.assignee.id} className="flex items-center gap-2 font-semibold text-[var(--tm-ink)]">
                    <Avatar name={task.assignee.name} src={task.assignee.avatar_url ?? undefined} size="xs" />
                    {task.assignee.name}
                  </PersonLink>
                )}
              </Row>
              <Row label="Created by">
                <span className="font-semibold text-[var(--tm-ink)]">{task.created_by?.name ?? 'Unknown'}</span>
              </Row>
              <Row label="Due">
                {task.due_date ? (
                  <span className={`flex items-center gap-1.5 font-semibold ${overdue ? 'text-[var(--tm-danger)]' : 'text-[var(--tm-ink)]'}`}>
                    <CalendarClock className="h-4 w-4" />
                    {formatDate(task.due_date)}
                    {overdue && ' · overdue'}
                  </span>
                ) : (
                  <span className="text-[var(--tm-ink-muted)]">No due date</span>
                )}
              </Row>
              <Row label="Created">
                <span className="font-semibold text-[var(--tm-ink)]">{formatDate(task.created_at)}</span>
              </Row>
            </CardContent>
          </Card>
        </div>
      </div>

        <div className="xl:sticky xl:top-24 xl:self-start">
          <ActivityPanel task={task} />
        </div>
      </div>

      <SubmitReviewModal isOpen={submitting} onClose={() => setSubmitting(false)} task={task} onSubmitted={load} />
      <TaskFormModal isOpen={editing} onClose={() => setEditing(false)} task={task} onSaved={apply} />
    </>
  );
};

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex items-center justify-between gap-3">
    <span className="text-[var(--tm-ink-muted)]">{label}</span>
    {children}
  </div>
);
