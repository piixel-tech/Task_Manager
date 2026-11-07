import React, { useState } from 'react';
import { format, formatDistanceToNow, parseISO } from 'date-fns';
import { Check, X } from 'lucide-react';
import { Avatar } from '../../../components/ui/Avatar';
import { Button } from '../../../components/ui/Button';
import { StatusChip, type ChipTone } from '../../../components/ui/StatusChip';
import { useConfirm } from '../../../hooks/useConfirm';
import { leaveApi, type LeaveRequest, type LeaveStatus } from '../../../services/http/leaveApi';
import { datesText, STATUS_LABEL, TYPE_LABEL } from '../leaveUtils';
import { RejectLeaveModal } from './RejectLeaveModal';

const TONE: Record<LeaveStatus, ChipTone> = { pending: 'warn', approved: 'ok', rejected: 'bad' };

/**
 * Requests as rows: who, what, when, why, sent when. Pending ones carry Approve / Reject; decided ones say who decided and, for a
 * rejection, why. Used by the dashboard card and the full page, so the two never differ.
 */
export const LeaveReviewList: React.FC<{ requests: LeaveRequest[]; onChanged: () => void }> = ({ requests, onChanged }) => {
  const confirm = useConfirm();
  const [rejecting, setRejecting] = useState<LeaveRequest | null>(null);

  const approve = async (r: LeaveRequest) => {
    const ok = await confirm({
      title: `Approve ${r.user.name}'s request?`,
      message: `${TYPE_LABEL[r.type]} for ${datesText(r)}. ${r.user.name} will be told.`,
      confirmLabel: 'Approve',
      action: () => leaveApi.approve(r.id),
      successTitle: 'Request approved'
    });
    if (ok) onChanged();
  };

  return (
    <>
      <ul className="divide-y divide-[var(--tm-border)]">
        {requests.map((r) => (
          <li key={r.id} className="grid items-center gap-x-4 gap-y-2 py-3.5 md:grid-cols-[minmax(0,1fr)_auto]">
            <div className="flex min-w-0 items-start gap-3">
              <Avatar name={r.user.name} src={r.user.avatar_url ?? undefined} size="sm" />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-[13.5px] font-bold text-[var(--tm-ink)]">{r.user.name}</span>
                  <span className="text-[12px] text-[var(--tm-ink-muted)]">{r.company_name}</span>
                  {r.status !== 'pending' && (
                    <StatusChip tone={TONE[r.status]} size="sm" dot>
                      {STATUS_LABEL[r.status]}
                    </StatusChip>
                  )}
                </div>
                <div className="mt-0.5 text-[13px] font-semibold text-[var(--tm-ink)]">
                  {TYPE_LABEL[r.type]} <span className="font-medium text-[var(--tm-ink-soft)]">· {datesText(r)}</span>
                </div>
                <p className="mt-0.5 line-clamp-2 text-[12.5px] text-[var(--tm-ink-soft)]">{r.reason}</p>
                <p className="mt-0.5 text-[11.5px] text-[var(--tm-ink-muted)]" title={format(parseISO(r.created_at), 'd MMM yyyy, h:mm a')}>
                  Sent {formatDistanceToNow(parseISO(r.created_at), { addSuffix: true })}
                  {r.decided_at && r.decided_by && ` · ${STATUS_LABEL[r.status]} by ${r.decided_by.name} ${formatDistanceToNow(parseISO(r.decided_at), { addSuffix: true })}`}
                </p>
                {r.status === 'rejected' && r.reject_reason && (
                  <p className="tm-error mt-2 px-3 py-2 text-[12.5px] font-semibold">
                    <span className="font-bold">Reason: </span>
                    {r.reject_reason}
                  </p>
                )}
              </div>
            </div>
            {r.status === 'pending' && (
              <div className="flex gap-2 md:justify-end">
                <Button size="sm" variant="outline" leftIcon={<X className="h-4 w-4" />} onClick={() => setRejecting(r)} aria-label={`Reject ${r.user.name}'s request`}>
                  Reject
                </Button>
                <Button size="sm" leftIcon={<Check className="h-4 w-4" />} onClick={() => void approve(r)} aria-label={`Approve ${r.user.name}'s request`}>
                  Approve
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
      <RejectLeaveModal request={rejecting} onClose={() => setRejecting(null)} onDone={onChanged} />
    </>
  );
};
