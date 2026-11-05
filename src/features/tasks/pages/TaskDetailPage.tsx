import { FadeIn } from '../../../components/ui/FadeIn';
import { InfoTile as Tile } from '../../../components/ui/InfoTile';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CalendarClock, Eye, MessageSquare, ExternalLink, FileText, Link2, Pencil, Play, Send, Square, Trash2 } from 'lucide-react';
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
import { isJobCancelled } from '../../../services/jobs';
import { reviewApi, type Review } from '../../../services/http/reviewApi';
import { formatDate } from '../../../utils/time';
import { formatDuration } from '../../../utils/format';
import { isOverdue, progressTone, StatusDot } from '../components/TaskMeta';
import { useReloadOnTimerChange } from '../components/TaskTimer';
import { useTimerStore } from '../../../store/useTimerStore';
import { TaskFormModal } from '../components/TaskFormModal';
import { ReviewActions } from '../../reviews/components/ReviewActions';
import { ReviewRounds } from '../../reviews/components/ReviewRounds';
import { SubmitReviewModal } from '../../reviews/components/SubmitReviewModal';
import { RichText } from '../../../components/editor/RichText';
import { ActivityPanel } from '../../activity/components/ActivityPanel';
import { TimerLogCard } from '../components/TimerLogCard';
import { DriveFileViewer } from '../../google/DriveFileViewer';
import { DriveKindIcon } from '../../google/DriveKindIcon';
import { AttachMenu } from '../../google/AttachMenu';
import { AssetDownloadButton } from '../../../components/ui/AssetDownloadButton';
import { KIND_LABEL } from '../../google/googleUtils';

/** Progress is automatic: it follows the status (there are no per-task subtasks or checklist to count). */
const STATUS_PROGRESS: Record<ApiTask['status'], number> = {
  todo: 0,
  in_progress: 50,
  changes_requested: 50,
  submitted: 75,
  approved: 100
};

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
  const timerBusy = useTimerStore((s) => s.busy);
  const [previewing, setPreviewing] = useState<Asset | null>(null);

  // Live timer display: seconds since the last fetch, added to the server total.
  const [tick, setTick] = useState(0);
  const fetchedAt = useRef(Date.now());

  const apply = useCallback((t: ApiTask) => {
    setTask(t);
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

  // Opening a task you were given clears its "new" badge in the nav.
  const assigneeId = task?.assignee?.id;
  useEffect(() => {
    if (id && me?.id && assigneeId === me.id) taskApi.markSeen(id).catch(() => {});
  }, [id, me?.id, assigneeId]);

  // A decision or resubmission on this task arrives live.
  useEffect(
    () => socket.on('notification', (n: { link?: string }) => n?.link?.split('?')[0].endsWith(`/tasks/${id}`) && load()),
    [id, load]
  );

  useReloadOnTimerChange(load);

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
  const progress = STATUS_PROGRESS[task.status];
  const totalSeconds = task.total_seconds + (task.timer_running ? tick : 0);

  // Play / pause go through the shared timer (one running timer per person, toast on a switch); this page refreshes after.
  const startTimer = () => useTimerStore.getState().play(task);
  const stopTimer = () => useTimerStore.getState().pause();

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

  /** A Drive file picked or created here joins the task's attachments (the same save the edit form makes). */
  const addAssets = async (files: Asset[]) => {
    if (!task) return;
    await taskApi.update(task.id, { asset_ids: [...task.assets.map((a) => a.id), ...files.map((f) => f.id)] });
    await load();
  };

  return (
    <FadeIn className="grid gap-4">
      <PageHeader
        className="pb-1"
        title={
          <span className="flex flex-wrap items-center gap-3">
            {task.title}
            <StatusChip status={task.status} className={TITLE_CHIP} />
            <StatusChip status={task.priority} className={TITLE_CHIP} />
          </span>
        }
        description={
          <button
            type="button"
            className="font-semibold text-[var(--tm-primary-dark)] hover:underline"
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
      {(task.assets.length > 0 || (task.can_edit && task.status !== 'approved')) && (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="text-base font-extrabold">Assets ({task.assets.length})</CardTitle>
              {task.can_edit && task.status !== 'approved' && (
                <div className="flex flex-wrap items-center gap-2">
                  <AttachMenu
                    onUpload={async (files) => {
                      try {
                        await addAssets(await assetApi.upload(files));
                      } catch (err) {
                        if (!isJobCancelled(err)) toast.error('Could not upload the file', err instanceof Error ? err.message : undefined);
                      }
                    }}
                    onAdded={addAssets}
                  />
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {task.assets.map((a) => (
                <li key={a.id} className="flex items-stretch gap-2">
                  {a.kind !== 'link' ? (
                    <div className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-[var(--tm-radius-md)] bg-[var(--tm-card-muted)] px-4 py-3">
                      <span className="flex min-w-0 items-center gap-3">
                        <FileText className="h-4 w-4 shrink-0 text-[var(--tm-primary-dark)]" />
                        <span className="min-w-0 leading-tight">
                          <span className="block truncate text-[13px] font-bold text-[var(--tm-ink)]">{a.name}</span>
                          <span className="block truncate text-[11.5px] text-[var(--tm-ink-muted)]">{formatSize(a.size)}</span>
                        </span>
                      </span>
                      <AssetDownloadButton asset={a} size="md" />
                    </div>
                  ) : (
                  <button
                    type="button"
                    onClick={() => open(a)}
                    className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-[var(--tm-radius-md)] bg-[var(--tm-card-muted)] px-4 py-3 text-left transition-colors hover:bg-[var(--tm-bg-sunken)]"
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      {a.drive ? (
                        <DriveKindIcon kind={a.drive.kind} />
                      ) : a.kind === 'link' ? (
                        <Link2 className="h-4 w-4 shrink-0 text-[var(--tm-primary-dark)]" />
                      ) : (
                        <FileText className="h-4 w-4 shrink-0 text-[var(--tm-primary-dark)]" />
                      )}
                      <span className="min-w-0 leading-tight">
                        <span className="block truncate text-[13px] font-bold text-[var(--tm-ink)]">{a.name}</span>
                        <span className="block truncate text-[11.5px] text-[var(--tm-ink-muted)]">
                          {a.drive ? KIND_LABEL[a.drive.kind] : a.kind === 'link' ? a.url : formatSize(a.size)}
                        </span>
                      </span>
                    </span>
                    <ExternalLink className="h-4 w-4 shrink-0" />
                  </button>
                  )}
                  {a.drive && (
                    <button
                      type="button"
                      aria-label={`Preview ${a.name}`}
                      title="Preview here"
                      onClick={() => setPreviewing(a)}
                      className="grid w-11 shrink-0 place-items-center rounded-[var(--tm-radius-md)] bg-[var(--tm-card-muted)] text-[var(--tm-primary-dark)] transition-colors hover:bg-[var(--tm-bg-sunken)]"
                    >
                      <Eye className="h-4 w-4" />
                    </button>
                  )}
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
        <div className="tm-error px-4 py-3 text-[13px] font-semibold">
          Changes were requested. See the comments below, then resubmit for review.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Tile label="Start date">
          {task.start_date ? (
            <span className="flex items-center gap-1.5">
              <CalendarClock className="h-4 w-4 text-[var(--tm-ink-muted)]" />
              {formatDate(task.start_date)}
            </span>
          ) : (
            <span className="font-semibold text-[var(--tm-ink-muted)]">No start date</span>
          )}
        </Tile>
        <Tile label="Due">
          {task.due_date ? (
            <span className={`flex items-center gap-1.5 ${overdue ? 'text-[var(--tm-danger)]' : ''}`}>
              <CalendarClock className="h-4 w-4" />
              {formatDate(task.due_date)}
              {overdue && <span className="text-[12px]">· overdue</span>}
            </span>
          ) : (
            <span className="font-semibold text-[var(--tm-ink-muted)]">No due date</span>
          )}
        </Tile>
        <Tile label="Priority">
          <StatusChip status={task.priority} size="sm" />
        </Tile>
        <Tile label="Status">
          <StatusChip status={task.status} size="sm" />
        </Tile>
        <Tile label="Progress">
          <div className="space-y-2">
            <span className="text-xl font-black tabular-nums">{progress}%</span>
            <ProgressBar value={progress} tone={progressTone(task)} hatchRemainder={false} height={4} />
          </div>
        </Tile>
        <Tile label="Assignee">
          {task.assignee ? (
            <PersonLink userId={task.assignee.id} className="flex items-center gap-2">
              <Avatar name={task.assignee.name} src={task.assignee.avatar_url ?? undefined} size="xs" />
              <span className="truncate">{task.assignee.name}</span>
            </PersonLink>
          ) : (
            <span className="font-semibold text-[var(--tm-ink-muted)]">Unassigned</span>
          )}
        </Tile>
        <Tile label="Assigned by" hint={`Created ${formatDate(task.created_at)}`}>
          <span className="truncate">{task.created_by?.name ?? 'Unknown'}</span>
        </Tile>
        <Tile label="Subfolder">
          <span className="truncate">{task.subfolder_name}</span>
        </Tile>
        <Tile label="Time tracked">
          <div className="space-y-2.5">
            <div className="flex items-center gap-2">
              <StatusDot running={task.timer_running} />
              <span className="text-xl font-black tabular-nums">{formatDuration(totalSeconds)}</span>
            </div>
            {task.can_work &&
              (task.timer_running ? (
                <Button size="sm" variant="danger" className="w-full" isLoading={timerBusy} onClick={stopTimer} leftIcon={<Square className="h-4 w-4" />}>
                  Stop timer
                </Button>
              ) : (
                <Button size="sm" className="w-full" isLoading={timerBusy} onClick={startTimer} leftIcon={<Play className="h-4 w-4" />}>
                  Start timer
                </Button>
              ))}
          </div>
        </Tile>
        <Tile label="Attachments">
          <span className="text-xl font-black tabular-nums">{task.assets.length}</span>
        </Tile>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
      <div className="grid min-w-0 content-start gap-4 lg:col-span-3">
        <div className="grid gap-4">
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

          <TimerLogCard taskId={task.id} />

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

        </div>

      </div>

        <div className="min-w-0 lg:sticky lg:top-24 lg:col-span-2 lg:self-start">
          <ActivityPanel task={task} />
        </div>
      </div>

      <SubmitReviewModal isOpen={submitting} onClose={() => setSubmitting(false)} task={task} onSubmitted={load} />
      <DriveFileViewer file={previewing} onClose={() => setPreviewing(null)} />
      <TaskFormModal isOpen={editing} onClose={() => setEditing(false)} task={task} onSaved={apply} />
    </FadeIn>
  );
};

/** The status and priority chips beside the title: sized to sit with the 30-40px heading. */
const TITLE_CHIP = '!px-3.5 !py-1.5 !text-[14px] sm:!text-[16px]';
