import React, { useEffect, useState } from 'react';
import { FileCheck, Check, MessageSquareX, ExternalLink, Paperclip, Clock } from 'lucide-react';
import { taskService } from '../../../services';
import type { Task, Submission, User } from '../../../types';
import { useAppStore } from '../../../store/useAppStore';
import { useAuthStore } from '../../../store/authStore';
import { Card, CardContent } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { UserName } from '../../../components/ui/UserName';
import { Modal } from '../../../components/ui/Modal';
import { formatDate } from '../../../utils/time';
import { formatHours } from '../../../utils/format';
import { ReviewBadge } from '../../tasks/components/TaskReview';

export const SubmissionsFeedPage: React.FC = () => {
  const { showToast } = useAppStore();
  const { user } = useAuthStore();

  const [feed, setFeed] = useState<{ submission: Submission; task: Task; user?: User }[]>([]);
  const [selectedSub, setSelectedSub] = useState<{ submission: Submission; task: Task } | null>(null);
  const [needsChangesComment, setNeedsChangesComment] = useState('');

  const fetchFeed = async () => {
    try {
      const list = await taskService.getSubmissionsFeed();
      setFeed(list);
    } catch (err: any) {
      showToast(err.message || 'Error loading submissions feed');
    }
  };

  useEffect(() => {
    fetchFeed();
  }, []);

  const handleApprove = async (taskId: string, submissionId: string) => {
    try {
      await taskService.reviewSubmission(taskId, submissionId, 'approved', undefined, user?.id);
      showToast('Task approved!');
      fetchFeed();
    } catch (err: any) {
      showToast(err.message || 'Failed to approve submission');
    }
  };

  const closeChangesModal = () => {
    setSelectedSub(null);
    setNeedsChangesComment('');
  };

  const handleNeedsChangesSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSub || !needsChangesComment.trim()) return;
    try {
      await taskService.reviewSubmission(
        selectedSub.task.id,
        selectedSub.submission.id,
        'needs_changes',
        needsChangesComment,
        user?.id
      );
      showToast('Changes requested. The task is back with the employee to resubmit.');
      setSelectedSub(null);
      setNeedsChangesComment('');
      fetchFeed();
    } catch (err: any) {
      showToast(err.message || 'Failed to request changes');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-[27px] font-extrabold leading-tight tracking-[-0.03em] text-[var(--tm-ink)] flex items-center gap-2">
            <FileCheck className="w-6 h-6 text-[var(--tm-primary)]" /> Deliverable Submissions Feed
          </h1>
          <p className="text-[14px] leading-relaxed text-[var(--tm-ink-muted)] mt-1.5">
            Review employee task deliverables, view attached proof/files, and approve or request changes.
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {feed.length === 0 ? (
          <div className="p-12 text-center text-[var(--tm-ink-muted)] bg-white rounded-2xl border border-[var(--tm-border)]">
            No submissions recorded yet.
          </div>
        ) : (
          feed.map(({ submission, task, user: submitter }) => (
            <Card key={submission.id} className="hover:border-[var(--tm-primary-soft)] transition-all">
              <CardContent className="p-5 space-y-4">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--tm-border)] pb-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant={task.priority === 'high' ? 'danger' : 'default'} size="sm">
                        {task.priority.toUpperCase()}
                      </Badge>
                      <Badge
                        variant={
                          submission.status === 'approved'
                            ? 'success'
                            : submission.status === 'needs_changes'
                            ? 'danger'
                            : 'warning'
                        }
                        size="sm"
                      >
                        {submission.status.replace('_', ' ').toUpperCase()}
                      </Badge>
                      <ReviewBadge task={task} />
                      <span className="text-xs text-[var(--tm-ink-muted)]">
                        {formatDate(submission.submittedAt)}
                      </span>
                    </div>
                    <h3 className="text-base font-bold text-[var(--tm-ink)]">{task.title}</h3>
                  </div>

                  <div className="flex items-center gap-3">
                    {submitter ? (
                      <UserName user={submitter} size="sm" showBadge={true} />
                    ) : (
                      <UserName userId={submission.userId} size="sm" showBadge={true} />
                    )}
                    <div className="text-xs font-bold text-[var(--tm-primary)] bg-[var(--tm-primary-softer)] px-2.5 py-1 rounded-lg flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      {formatHours(task.loggedHours || 0)}
                    </div>
                  </div>
                </div>

                {/* Submitter Note */}
                {submission.notes && (
                  <div className="bg-[var(--tm-card-muted)] p-3.5 rounded-xl border border-[var(--tm-border)] text-xs text-[var(--tm-ink-soft)] space-y-1">
                    <div className="font-semibold text-[var(--tm-ink-muted)] uppercase text-[10px] tracking-wider">
                      Employee Notes
                    </div>
                    <p className="leading-relaxed">"{submission.notes}"</p>
                  </div>
                )}

                {/* Admin Comment if Needs Changes */}
                {submission.adminComment && (
                  <div className="bg-[var(--tm-danger-bg)] p-3.5 rounded-xl border border-[var(--tm-danger-ring)] text-xs text-[var(--tm-danger)] space-y-1">
                    <div className="font-semibold text-[var(--tm-danger)] uppercase text-[10px] tracking-wider">
                      Admin Requested Changes
                    </div>
                    <p>"{submission.adminComment}"</p>
                  </div>
                )}

                {/* Attached Files & Image Previews */}
                {((submission.files?.length || 0) > 0 || (submission.fileUrls?.length || 0) > 0) && (
                  <div className="space-y-2">
                    <div className="text-[10px] font-bold text-[var(--tm-ink-muted)] uppercase tracking-wider">
                      Attachments & Deliverable Links
                    </div>
                    <div className="flex flex-wrap gap-3">
                      {(submission.files || []).map((file, idx) => (
                        <div
                          key={file.id || idx}
                          className="flex items-center gap-2 p-2 bg-[var(--tm-card-muted)] border border-[var(--tm-border)] rounded-lg text-xs"
                        >
                          {file.dataUrl ? (
                            <img
                              src={file.dataUrl}
                              alt={file.name}
                              className="w-10 h-10 object-cover rounded border border-[var(--tm-border)]"
                            />
                          ) : (
                            <Paperclip className="w-4 h-4 text-[var(--tm-primary)]" />
                          )}
                          <div>
                            <div className="font-semibold text-[var(--tm-ink)]">{file.name}</div>
                            <div className="text-[10px] text-[var(--tm-ink-muted)]">
                              {(file.size / 1024).toFixed(1)} KB
                            </div>
                          </div>
                        </div>
                      ))}

                      {(submission.fileUrls || []).map((url, i) => (
                        <a
                          key={i}
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1.5 px-3 py-2 bg-[var(--tm-primary-softer)] text-[var(--tm-primary)] font-semibold rounded-lg text-xs hover:underline border border-[var(--tm-primary-soft)]"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span className="max-w-[200px] truncate">{url}</span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {/* Action Buttons for Admin */}
                {submission.status === 'pending' && (
                  <div className="pt-2 flex justify-end gap-3 border-t border-[var(--tm-border)]">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedSub({ submission, task })}
                      className="text-[var(--tm-warning)] border-[var(--tm-warning-ring)] hover:bg-[var(--tm-warning-bg)]"
                      leftIcon={<MessageSquareX className="w-4 h-4" />}
                    >
                      Request Changes
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => handleApprove(task.id, submission.id)}
                      className="bg-[var(--tm-success)] hover:bg-[var(--tm-success)]"
                      leftIcon={<Check className="w-4 h-4" />}
                    >
                      Approve
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Needs Changes Comment Modal */}
      <Modal
        isOpen={!!selectedSub}
        onClose={closeChangesModal}
        title="Request Changes"
        description={selectedSub?.task.title}
      >
        <form onSubmit={handleNeedsChangesSubmit} className="space-y-4">
          <div className="space-y-1">
            <label
              htmlFor="what-needs-to-change"
              className="block text-xs font-semibold text-[var(--tm-ink-soft)] uppercase tracking-wider"
            >
              What needs to change? <span className="text-[var(--tm-danger)]">*</span>
            </label>
            <textarea
              id="what-needs-to-change"
              className="w-full text-sm rounded-lg border border-[var(--tm-border-strong)] p-3 text-[var(--tm-ink)] focus:outline-none focus:ring-2 focus:ring-[var(--tm-warning-ring)] focus:border-[var(--tm-warning)]"
              rows={4}
              placeholder="Describe exactly what needs to be fixed or redone..."
              value={needsChangesComment}
              onChange={(e) => setNeedsChangesComment(e.target.value)}
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
            <Button variant="primary" type="submit" disabled={!needsChangesComment.trim()}>
              Save &amp; Send Back
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
