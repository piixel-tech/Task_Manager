import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Play, Square, Send, Clock, ThumbsUp, AlertCircle, Sparkles, Paperclip } from 'lucide-react';
import { taskService, gamificationService } from '../../../services';
import type { Task, Kudos, TaskSession, Submission, TaskPauseReason } from '../../../types';
import { useAuthStore } from '../../../store/authStore';
import { useAppStore } from '../../../store/useAppStore';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { UserName } from '../../../components/ui/UserName';
import { formatDate, formatTime } from '../../../utils/time';
import { formatHours } from '../../../utils/format';
import { TaskSubmitModal } from '../components/TaskSubmitModal';

export const TaskDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { showToast } = useAppStore();
  const isAdmin = user?.role === 'admin';
  const prefix = isAdmin ? '/admin' : '/app';

  const [task, setTask] = useState<Task | null>(null);
  const [kudosList, setKudosList] = useState<Kudos[]>([]);
  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false);

  const fetchTask = async () => {
    if (!id) return;
    const t = await taskService.getTaskById(id);
    setTask(t);
    if (t) {
      gamificationService.getKudosForTask(t.id).then(setKudosList).catch(console.error);
    }
  };

  useEffect(() => {
    fetchTask();
  }, [id]);

  if (!task) {
    return <div className="p-8 text-center text-[var(--tm-ink-muted)]">Loading task details...</div>;
  }

  const activeSession = task.sessions.find((s: TaskSession) => !s.endTime);

  const handleToggleTimer = async () => {
    if (!user || !id) return;
    if (activeSession) {
      try {
        await taskService.stopTaskSession(id, user.id);
        showToast('Timer paused.');
        fetchTask();
      } catch (err: any) {
        showToast(err.message || 'Error stopping timer');
      }
    } else {
      try {
        await taskService.startTaskSession(id, user.id);
        showToast('Started timer on task!');
        fetchTask();
      } catch (err: any) {
        showToast(err.message || 'Error starting timer');
      }
    }
  };

  const handleEndTask = async () => {
    if (!user || !id) return;
    if (activeSession) {
      await taskService.stopTaskSession(id, user.id).catch(() => {});
    }
    setIsSubmitModalOpen(true);
  };

  const handleGiveKudos = async () => {
    if (!user || !task) return;
    try {
      await gamificationService.giveKudos(task.id, user.id, task.assignedUserId);
      showToast('Gave Kudos! 👏');
      fetchTask();
    } catch {
      showToast('Failed to give kudos');
    }
  };

  const handleReview = async (submissionId: string, status: 'approved' | 'needs_changes') => {
    if (!id) return;
    try {
      await taskService.reviewSubmission(id, submissionId, status);
      if (status === 'needs_changes') {
        await taskService.updateTask(id, { status: 'in_progress' });
      }
      showToast(`Submission marked as ${status}.`);
      fetchTask();
    } catch (err: any) {
      showToast(err.message || 'Error reviewing submission');
    }
  };

  const hasSubmissions = task.submissions && task.submissions.length > 0;

  return (
    <div className="space-y-6">
      <button
        onClick={() => navigate(`${prefix}/tasks`)}
        className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--tm-ink-muted)] hover:text-[var(--tm-ink)]"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Tasks
      </button>

      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={task.priority === 'urgent' ? 'danger' : 'warning'}>
                  {task.priority} Priority
                </Badge>
                <Badge variant="primary">{task.status.replace('_', ' ')}</Badge>
                {(task.revisions || 0) > 0 && (
                  <Badge variant="danger">
                    {task.revisions} {task.revisions === 1 ? 'Revision' : 'Revisions'}
                  </Badge>
                )}
              </div>
              <h1 className="text-2xl font-bold text-[var(--tm-ink)]">{task.title}</h1>
              {task.subHeading && (
                <p className="text-sm font-semibold text-[var(--tm-ink-soft)]">{task.subHeading}</p>
              )}
              <p className="text-xs text-[var(--tm-ink-muted)] max-w-2xl">{task.description}</p>

              <div className="pt-2 flex flex-wrap items-center gap-4 text-xs text-[var(--tm-ink-soft)]">
                <div className="flex items-center gap-2">
                  <span>Assigned to:</span>
                  <UserName userId={task.assignedUserId} size="sm" showBadge={false} />
                </div>

                {/* Kudos Button for completed tasks */}
                {task.status === 'completed' && user && user.id !== task.assignedUserId && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleGiveKudos}
                    className="text-[var(--tm-warning)] bg-[var(--tm-warning-bg)] border-[var(--tm-warning-ring)] hover:bg-[var(--tm-warning-bg)]"
                    leftIcon={<ThumbsUp className="w-3.5 h-3.5" />}
                  >
                    Give Kudos ({kudosList.length}) 👏
                  </Button>
                )}
                {task.status === 'completed' && kudosList.length > 0 && (
                  <span className="text-xs text-[var(--tm-warning)] font-semibold flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5" /> Received {kudosList.length} Kudos!
                  </span>
                )}
              </div>
            </div>

            <div className="bg-[var(--tm-card-muted)] p-4 rounded-xl border border-[var(--tm-border)] text-center space-y-3 shrink-0">
              <div className="text-xs font-semibold text-[var(--tm-ink-muted)] uppercase">Timer &amp; Hours</div>
              <div className="text-2xl font-bold text-[var(--tm-primary)]">
                {formatHours(task.loggedHours || 0)} / {task.estimatedHours || 8}h
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                {task.status !== 'completed' && (
                  <Button
                    variant={activeSession ? 'danger' : 'primary'}
                    size="sm"
                    onClick={handleToggleTimer}
                    leftIcon={activeSession ? <Square className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  >
                    {activeSession ? 'Pause Timer' : 'Start Timer'}
                  </Button>
                )}
                {task.status !== 'completed' && (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleEndTask}
                    leftIcon={<Send className="w-3.5 h-3.5" />}
                  >
                    End your task
                  </Button>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Deliverable Submissions Section (Hidden until submitted) */}
        {hasSubmissions && (
          <Card>
            <CardHeader>
              <CardTitle>Deliverable Submissions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 p-6">
              <div className="space-y-4">
                {task.submissions.map((sub: Submission) => (
                  <div key={sub.id} className="p-4 bg-[var(--tm-card-muted)] rounded-xl border border-[var(--tm-border)] text-xs space-y-3">
                    <div className="flex items-center justify-between">
                      <UserName userId={sub.userId} size="sm" showBadge={false} />
                      <Badge variant={sub.status === 'approved' ? 'success' : sub.status === 'rejected' ? 'danger' : 'warning'}>
                        {sub.status}
                      </Badge>
                    </div>

                    <p className="text-[var(--tm-ink-soft)] font-medium text-sm">"{sub.notes}"</p>

                    {/* Attached Files & Image Previews */}
                    {sub.files && sub.files.length > 0 && (
                      <div className="space-y-2 pt-2 border-t border-[var(--tm-border)]">
                        <div className="text-[11px] font-bold text-[var(--tm-ink-muted)] uppercase">Attached Files:</div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {sub.files.map((f, idx) => (
                            <div key={f.id || idx} className="p-2 bg-[var(--tm-card)] rounded-lg border border-[var(--tm-border)] flex items-center gap-2 overflow-hidden">
                              {f.dataUrl || (f.url && f.type.startsWith('image/')) ? (
                                <img src={f.dataUrl || f.url} alt={f.name} className="w-10 h-10 object-cover rounded border border-[var(--tm-border)] shrink-0" />
                              ) : (
                                <Paperclip className="w-4 h-4 text-[var(--tm-primary)] shrink-0" />
                              )}
                              <div className="min-w-0 flex-1">
                                <div className="font-semibold text-[var(--tm-ink)] truncate text-xs">{f.name}</div>
                                {f.size && <div className="text-[10px] text-[var(--tm-ink-muted)]">{(f.size / 1024).toFixed(1)} KB</div>}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Attached Links */}
                    {sub.fileUrls && sub.fileUrls.length > 0 && (
                      <div className="space-y-1.5 pt-2 border-t border-[var(--tm-border)]">
                        <div className="text-[11px] font-bold text-[var(--tm-ink-muted)] uppercase">Links:</div>
                        {sub.fileUrls.map((link, idx) => (
                          <a key={idx} href={link} target="_blank" rel="noreferrer" className="block text-[var(--tm-primary)] font-semibold hover:underline truncate">
                            {link}
                          </a>
                        ))}
                      </div>
                    )}

                    <div className="text-[10px] text-[var(--tm-ink-muted)] pt-1">{formatDate(sub.submittedAt)}</div>

                    {isAdmin && sub.status === 'pending' && (
                      <div className="pt-2 flex justify-end gap-2 border-t border-[var(--tm-border)]">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleReview(sub.id, 'needs_changes')}
                          className="text-[var(--tm-danger)] border-[var(--tm-danger-ring)] hover:bg-[var(--tm-danger-bg)]"
                        >
                          Needs Changes
                        </Button>
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => handleReview(sub.id, 'approved')}
                          className="bg-[var(--tm-success)] hover:bg-[var(--tm-success)]"
                        >
                          Approve Deliverable
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Recorded Timer Sessions</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-[var(--tm-border)]">
              {task.sessions.length === 0 ? (
                <p className="text-xs text-[var(--tm-ink-muted)] text-center p-8">No timer sessions recorded yet.</p>
              ) : (
                task.sessions.map((sess: TaskSession) => (
                  <div key={sess.id} className="p-4 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-3">
                      <Clock className="w-4 h-4 text-[var(--tm-primary)]" />
                      <div>
                        <div className="font-semibold text-[var(--tm-ink)]">
                          {formatTime(sess.startTime)} - {sess.endTime ? formatTime(sess.endTime) : 'Running...'}
                        </div>
                        <div className="text-[var(--tm-ink-muted)]">{formatDate(sess.startTime)}</div>
                      </div>
                    </div>
                    <div className="font-bold text-[var(--tm-primary)]">
                      {sess.durationMinutes ? `${sess.durationMinutes} mins` : 'Active'}
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Interruption Logs */}
      {((task.pauseReasons?.length || 0) > 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-[var(--tm-warning)]" /> Interruption & Pause Logs
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 divide-y divide-[var(--tm-border)] text-xs">
            {task.pauseReasons?.map((pr: TaskPauseReason) => (
              <div key={pr.id} className="p-3.5 flex items-center justify-between">
                <div>
                  <span className="font-semibold text-[var(--tm-ink)]">{pr.reason}</span>
                  {pr.note && <span className="text-[var(--tm-ink-muted)] ml-2 italic">"{pr.note}"</span>}
                </div>
                <span className="text-[10px] text-[var(--tm-ink-muted)]">{formatTime(pr.timestamp)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Deliverable Submission Modal */}
      <TaskSubmitModal
        isOpen={isSubmitModalOpen}
        onClose={() => setIsSubmitModalOpen(false)}
        task={task}
        onSubmitSuccess={fetchTask}
      />
    </div>
  );
};
