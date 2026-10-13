import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Play,
  Square,
  Send,
  Clock,
  ThumbsUp,
  AlertCircle,
  Sparkles,
  Paperclip,
  Trash2,
  Edit2,
  History,
  RefreshCw
} from 'lucide-react';
import { taskService, gamificationService } from '../../../services';
import type { Task, Kudos, TaskSession, Submission, TaskPauseReason } from '../../../types';
import { useAuthStore } from '../../../store/authStore';
import { useAppStore } from '../../../store/useAppStore';
import { useTaskStore } from '../../../store/useTaskStore';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { UserName } from '../../../components/ui/UserName';
import { Modal } from '../../../components/ui/Modal';
import { Input, Textarea } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { formatDate, formatTime } from '../../../utils/time';
import { formatHours } from '../../../utils/format';
import { TaskSubmitModal } from '../components/TaskSubmitModal';
import { ChangeRequestBox, ReviewBadge, ReviewHistoryTimeline } from '../components/TaskReview';

export const TaskDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { showToast } = useAppStore();
  const isAdmin = user?.role === 'admin';
  const prefix = isAdmin ? '/admin' : '/app';

  const [task, setTask] = useState<Task | null>(null);
  const [kudosList, setKudosList] = useState<Kudos[]>([]);

  // Modal controls
  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [changesForSubmissionId, setChangesForSubmissionId] = useState<string | null>(null);
  const [changesMessage, setChangesMessage] = useState('');

  // Edit form states
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editPriority, setEditPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [editDueDate, setEditDueDate] = useState('');

  const fetchTask = async () => {
    if (!id) return;
    const t = await taskService.getTaskById(id);
    setTask(t);
    if (t) {
      gamificationService.getKudosForTask(t.id).then(setKudosList).catch(console.error);
      setEditTitle(t.title);
      setEditDescription(t.description || '');
      setEditPriority(t.priority as any);
      setEditDueDate(t.dueDate || '');
    }
  };

  useEffect(() => {
    fetchTask();
  }, [id]);

  if (!task) {
    return <div className="p-8 text-center text-[var(--tm-ink-muted)]">Loading task details...</div>;
  }

  const isAssignedToMe = user?.id === task.assignedUserId;
  const isCreatedByMe = user?.id === task.assignedByUserId;
  // Employees can only delete tasks they created themselves. If someone else assigned it to them, they can't delete it.
  const canDelete = isAdmin || (isAssignedToMe && isCreatedByMe);
  const canEdit = isAdmin || isAssignedToMe;

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

  const handleConfirmDelete = async () => {
    if (!task) return;
    try {
      await useTaskStore.getState().deleteTask(task.id);
      showToast(`Task "${task.title}" deleted.`);
      setIsDeleteModalOpen(false);
      navigate(`${prefix}/tasks`);
    } catch (err: any) {
      showToast(err.message || 'Failed to delete task');
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!task || !editTitle.trim()) return;
    try {
      await useTaskStore.getState().updateTask(task.id, {
        title: editTitle.trim(),
        description: editDescription,
        priority: editPriority,
        dueDate: editDueDate
      });
      showToast('Task updated successfully!');
      setIsEditModalOpen(false);
      fetchTask();
    } catch (err: any) {
      showToast(err.message || 'Failed to update task');
    }
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

  const handleApprove = async (submissionId: string) => {
    if (!id) return;
    try {
      await taskService.reviewSubmission(id, submissionId, 'approved', undefined, user?.id);
      showToast('Task approved!');
      fetchTask();
    } catch (err: any) {
      showToast(err.message || 'Error reviewing submission');
    }
  };

  const closeChangesModal = () => {
    setChangesForSubmissionId(null);
    setChangesMessage('');
  };

  const handleRequestChanges = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !changesForSubmissionId || !changesMessage.trim()) return;
    try {
      await taskService.reviewSubmission(
        id,
        changesForSubmissionId,
        'needs_changes',
        changesMessage,
        user?.id
      );
      showToast('Changes requested. The task is back with the employee to resubmit.');
      closeChangesModal();
      fetchTask();
    } catch (err: any) {
      showToast(err.message || 'Error requesting changes');
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
                <ReviewBadge task={task} size="md" />
                {(task.revisions || 0) > 0 && (
                  <Badge variant="danger">
                    {task.revisions} {task.revisions === 1 ? 'Revision' : 'Revisions'}
                  </Badge>
                )}

                {/* Start Date & End Date displayed at the top */}
                <div className="flex items-center gap-3 text-xs font-semibold text-[var(--tm-ink-soft)] bg-[var(--tm-card-muted)] px-2.5 py-1 rounded-md border border-[var(--tm-border)] ml-1">
                  {task.startDate && (
                    <span>Start: <strong className="text-[var(--tm-ink)]">{formatDate(task.startDate)}</strong></span>
                  )}
                  {task.startDate && (task.dueDate || task.completedAt) && <span className="text-[var(--tm-ink-muted)]">•</span>}
                  <span>
                    End: <strong className="text-[var(--tm-ink)]">{formatDate(task.status === 'completed' ? task.completedAt || task.dueDate : task.dueDate)}</strong>
                  </span>
                </div>
              </div>
              <h1 className="text-2xl font-bold text-[var(--tm-ink)]">{task.title}</h1>
              {task.subHeading && (
                <p className="text-sm font-semibold text-[var(--tm-ink-soft)]">{task.subHeading}</p>
              )}
              <p className="text-xs text-[var(--tm-ink-muted)] max-w-2xl">{task.description}</p>

              {/* Changes requested by the reviewer */}
              <div className="max-w-2xl pt-1">
                <ChangeRequestBox task={task} />
              </div>

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
                {/* Action buttons appear only on tasks assigned to the logged-in user */}
                {task.status !== 'completed' && isAssignedToMe && (
                  <Button
                    variant={activeSession ? 'danger' : 'primary'}
                    size="sm"
                    onClick={handleToggleTimer}
                    leftIcon={activeSession ? <Square className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  >
                    {activeSession ? 'Pause Timer' : 'Start Timer'}
                  </Button>
                )}
                {task.status !== 'completed' && isAssignedToMe && (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleEndTask}
                    leftIcon={
                      task.reviewStatus === 'changes_requested' ? (
                        <RefreshCw className="w-3.5 h-3.5" />
                      ) : (
                        <Send className="w-3.5 h-3.5" />
                      )
                    }
                  >
                    {task.reviewStatus === 'changes_requested' ? 'Resubmit' : 'End your task'}
                  </Button>
                )}
                {canEdit && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsEditModalOpen(true)}
                    leftIcon={<Edit2 className="w-3.5 h-3.5" />}
                  >
                    Edit
                  </Button>
                )}
                {canDelete && (
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => setIsDeleteModalOpen(true)}
                    leftIcon={<Trash2 className="w-3.5 h-3.5" />}
                  >
                    Delete
                  </Button>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Deliverable Submissions Section */}
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
                          onClick={() => setChangesForSubmissionId(sub.id)}
                          className="text-[var(--tm-warning)] border-[var(--tm-warning-ring)] hover:bg-[var(--tm-warning-bg)]"
                        >
                          Request Changes
                        </Button>
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => handleApprove(sub.id)}
                          className="bg-[var(--tm-success)] hover:bg-[var(--tm-success)]"
                        >
                          Approve
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

      {/* Review History: submitted -> changes requested -> resubmitted -> approved */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <History className="w-4 h-4 text-[var(--tm-primary)]" /> Review History
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <ReviewHistoryTimeline task={task} />
        </CardContent>
      </Card>

      {/* Interruption Logs */}
      {((task.pauseReasons?.length || 0) > 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-[var(--tm-warning)]" /> Interruption &amp; Pause Logs
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

      {/* Request Changes Modal */}
      <Modal
        isOpen={!!changesForSubmissionId}
        onClose={closeChangesModal}
        title="Request Changes"
        description={task.title}
      >
        <form onSubmit={handleRequestChanges} className="space-y-4">
          <div className="space-y-1">
            <label
              htmlFor="detail-what-needs-to-change"
              className="block text-xs font-semibold text-[var(--tm-ink-soft)] uppercase tracking-wider"
            >
              What needs to change? <span className="text-[var(--tm-danger)]">*</span>
            </label>
            <textarea
              id="detail-what-needs-to-change"
              className="w-full text-sm rounded-lg border border-[var(--tm-border-strong)] p-3 text-[var(--tm-ink)] focus:outline-none focus:ring-2 focus:ring-[var(--tm-warning-ring)] focus:border-[var(--tm-warning)]"
              rows={4}
              placeholder="Describe exactly what needs to be fixed or redone..."
              value={changesMessage}
              onChange={(e) => setChangesMessage(e.target.value)}
              required
            />
            <p className="text-[11px] text-[var(--tm-ink-muted)]">
              This message is shown on the task and saved to its review history.
            </p>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" type="button" onClick={closeChangesModal}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={!changesMessage.trim()}>
              Save &amp; Send Back
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        title="Delete Task?"
        description={`Are you sure you want to delete "${task.title}"? This action cannot be undone.`}
        footer={
          <>
            <Button variant="outline" onClick={() => setIsDeleteModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleConfirmDelete}>
              Delete Task
            </Button>
          </>
        }
      >
        <p className="text-xs text-[var(--tm-ink-muted)]">
          All associated timer logs and submissions for this task will be permanently removed.
        </p>
      </Modal>

      {/* Edit Task Modal */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title="Edit Task"
      >
        <form onSubmit={handleSaveEdit} className="space-y-4">
          <Input
            label="Task Title *"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            required
          />
          <Textarea
            label="Description"
            rows={3}
            value={editDescription}
            onChange={(e) => setEditDescription(e.target.value)}
          />
          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Priority"
              value={editPriority}
              onChange={(e) => setEditPriority(e.target.value as any)}
              options={[
                { value: 'low', label: 'Low' },
                { value: 'medium', label: 'Medium' },
                { value: 'high', label: 'High' }
              ]}
            />
            <Input
              label="Due Date"
              type="date"
              value={editDueDate}
              onChange={(e) => setEditDueDate(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-3 pt-3 border-t border-[var(--tm-border)]">
            <Button variant="outline" type="button" onClick={() => setIsEditModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">
              Save Changes
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
