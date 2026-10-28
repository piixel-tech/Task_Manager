import React, { useState } from 'react';
import { Check, MessageSquareX } from 'lucide-react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Textarea } from '../../../components/ui/Input';
import { useConfirm } from '../../../hooks/useConfirm';
import { reviewApi, type Review } from '../../../services/http/reviewApi';

interface Props {
  review: Pick<Review, 'id' | 'task_title' | 'submitted_by'>;
  onDone: () => void;
  size?: 'sm' | 'md';
}

/** Approve, or request changes with comments. Both go through the confirm dialog. */
export const ReviewActions: React.FC<Props> = ({ review, onDone, size = 'sm' }) => {
  const confirm = useConfirm();
  const [asking, setAsking] = useState(false);
  const [comments, setComments] = useState('');
  const [error, setError] = useState<string | null>(null);

  const who = review.submitted_by?.name ?? 'The assignee';

  const approve = async () => {
    const ok = await confirm({
      title: `Approve “${review.task_title}”?`,
      message: `The task is marked complete at 100% and ${who} is notified.`,
      confirmLabel: 'Approve',
      action: async () => {
        await reviewApi.approve(review.id);
      },
      successTitle: 'Task approved'
    });
    if (ok) onDone();
  };

  const requestChanges = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!comments.trim()) return setError('Say what needs to change: comments are required.');
    setError(null);
    const ok = await confirm({
      title: `Request changes on “${review.task_title}”?`,
      message: `${who} is notified with your comments and can resubmit.`,
      confirmLabel: 'Request changes',
      danger: true,
      action: async () => {
        await reviewApi.requestChanges(review.id, comments.trim());
      },
      successTitle: 'Changes requested'
    });
    if (ok) {
      setAsking(false);
      setComments('');
      onDone();
    }
  };

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button size={size} onClick={approve} leftIcon={<Check className="h-4 w-4" />}>
          Approve
        </Button>
        <Button
          size={size}
          variant="outline"
          onClick={() => {
            setError(null);
            setAsking(true);
          }}
          leftIcon={<MessageSquareX className="h-4 w-4" />}
        >
          Request changes
        </Button>
      </div>

      <Modal isOpen={asking} onClose={() => setAsking(false)} title="Request changes" maxWidth="lg">
        <form onSubmit={requestChanges} className="space-y-4">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">{error}</div>
          )}
          <Textarea
            label="Comments (required)"
            rows={5}
            placeholder="What should be fixed or improved?"
            value={comments}
            onChange={(e) => setComments(e.target.value)}
            autoFocus
          />
          <div className="flex justify-end gap-3 border-t border-[var(--tm-border)] pt-5">
            <Button variant="outline" type="button" onClick={() => setAsking(false)}>
              Cancel
            </Button>
            <Button type="submit">Send back</Button>
          </div>
        </form>
      </Modal>
    </>
  );
};
