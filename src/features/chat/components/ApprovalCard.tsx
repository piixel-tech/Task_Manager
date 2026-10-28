import React, { useState } from 'react';
import { CheckCircle2, Clock, FileText, Link2, ShieldQuestion, XCircle } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { useConfirm } from '../../../hooks/useConfirm';
import { toast } from '../../../store/useToastStore';
import { useChatStore } from '../../../store/useChatStore';
import { assetApi } from '../../../services/http/taskApi';
import { chatApi, type Approval } from '../../../services/http/chatApi';

const when = (iso: string) => new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

const STATUS = {
  pending: { label: 'Waiting for an answer', icon: Clock, tone: 'text-[var(--tm-warning)] bg-[var(--tm-warning-bg)]' },
  approved: { label: 'Approved', icon: CheckCircle2, tone: 'text-[var(--tm-success)] bg-[var(--tm-success-bg)]' },
  rejected: { label: 'Rejected', icon: XCircle, tone: 'text-[var(--tm-danger)] bg-[var(--tm-danger-bg)]' },
  cancelled: { label: 'Withdrawn', icon: XCircle, tone: 'text-[var(--tm-ink-muted)] bg-[var(--tm-card-muted)]' }
} as const;

interface Props {
  /** A repeat of a card that is still waiting. */
  reminder?: boolean;
  approval: Approval;
  /** The viewer is a client in this group, so they can answer. */
  canAnswer: boolean;
  /** Called after the viewer's answer is saved. */
  onAnswered?: () => void;
}

/** An approval request: the question, any files, a live status, and for clients the two answer buttons. */
export const ApprovalCard: React.FC<Props> = ({ reminder, approval: a, canAnswer, onAnswered }) => {
  const confirm = useConfirm();
  const upsertMessage = useChatStore((s) => s.upsertMessage);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const status = STATUS[a.status];
  const Icon = status.icon;

  const answer = async (decision: 'approved' | 'rejected', why?: string) => {
    const label = decision === 'approved' ? a.approve_label : a.reject_label;
    return confirm({
      title: `${label}?`,
      message: `Your answer is sent to the team straight away and can't be changed.${why ? `\n\nReason: ${why}` : ''}`,
      confirmLabel: label,
      danger: decision === 'rejected',
      action: async () => {
        upsertMessage(await chatApi.answerApproval(a.id, decision, why));
        onAnswered?.();
      },
      successTitle: decision === 'approved' ? 'Approved' : 'Rejected'
    });
  };

  const submitRejection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) return;
    if (await answer('rejected', reason.trim())) {
      setRejecting(false);
      setReason('');
    }
  };

  const open = (f: Approval['files'][number]) => assetApi.open(f).catch((err) => toast.error('Could not open the file', err.message));

  return (
    <div className="w-[min(22rem,100%)] space-y-3">
      <div className="flex items-center gap-2 text-[11.5px] font-extrabold uppercase tracking-wide text-[var(--tm-primary-dark)]">
        <ShieldQuestion className="h-4 w-4" />
        {reminder ? '⏰ Reminder · approval needed' : 'Approval needed'}
      </div>

      <p className="whitespace-pre-wrap break-words text-[14.5px] font-semibold leading-snug text-[var(--tm-ink)]">{a.question}</p>

      {a.files.length > 0 && (
        <ul className="space-y-1.5">
          {a.files.map((f) => (
            <li key={f.id}>
              <button
                type="button"
                onClick={() => open(f)}
                className="flex w-full items-center gap-2 rounded-xl bg-black/5 px-2.5 py-2 text-left text-[12.5px] font-semibold hover:bg-black/10 dark:bg-white/10"
              >
                {f.kind === 'link' ? <Link2 className="h-4 w-4 shrink-0" /> : <FileText className="h-4 w-4 shrink-0" />}
                <span className="truncate">{f.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className={`flex items-start gap-2 rounded-xl px-3 py-2 text-[12.5px] font-semibold ${status.tone}`} role="status">
        <Icon className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="min-w-0">
          <p>
            {a.status === 'approved' && `${a.approve_label} · `}
            {a.status === 'rejected' && `${a.reject_label} · `}
            {status.label}
          </p>
          {a.answered_by && a.answered_at && (
            <p className="font-normal">
              {a.answered_by.name} · {when(a.answered_at)}
            </p>
          )}
          {a.status === 'rejected' && a.reason && <p className="mt-1 whitespace-pre-wrap break-words font-normal">“{a.reason}”</p>}
          {a.status === 'pending' && !canAnswer && a.next_reminder_at && (
            <p className="font-normal">Next reminder {when(a.next_reminder_at)}</p>
          )}
        </div>
      </div>

      {a.status === 'pending' && canAnswer && (
        <div className="grid grid-cols-2 gap-2">
          <Button size="sm" onClick={() => answer('approved')}>
            {a.approve_label}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setRejecting(true)}>
            {a.reject_label}
          </Button>
        </div>
      )}

      <Modal isOpen={rejecting} onClose={() => setRejecting(false)} title={a.reject_label} description="Tell the team what needs to change." maxWidth="md">
        <form onSubmit={submitRejection} className="space-y-4">
          <p className="rounded-xl bg-[var(--tm-card-muted)] p-3 text-[13px] text-[var(--tm-ink-soft)]">{a.question}</p>
          <div>
            <label htmlFor={`reason-${a.id}`} className="mb-1.5 block text-[12.5px] font-bold text-[var(--tm-ink-soft)]">
              Reason (required)
            </label>
            <textarea
              id={`reason-${a.id}`}
              autoFocus
              value={reason}
              maxLength={1000}
              rows={4}
              onChange={(e) => setReason(e.target.value)}
              className="w-full resize-y rounded-[var(--tm-radius-md)] border border-[var(--tm-border)] bg-[var(--tm-card)] p-3 text-[14px] text-[var(--tm-ink)] outline-none focus:border-[var(--tm-primary)]"
            />
          </div>
          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => setRejecting(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="danger" disabled={!reason.trim()}>
              {a.reject_label}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
