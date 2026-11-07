import React from 'react';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { Button } from '../../../components/ui/Button';
import { StatusChip, type ChipTone } from '../../../components/ui/StatusChip';
import { useConfirm } from '../../../hooks/useConfirm';
import { leaveApi, type LeaveRequest, type LeaveStatus } from '../../../services/http/leaveApi';
import { datesText, STATUS_LABEL, TYPE_LABEL } from '../leaveUtils';

const TONE: Record<LeaveStatus, ChipTone> = { pending: 'warn', approved: 'ok', rejected: 'bad' };

/** "My requests": newest first, with a status badge, the admin's reason when rejected, and Cancel while pending. */
export const MyLeaveRequests: React.FC<{ requests: LeaveRequest[]; loading: boolean; onChanged: () => void }> = ({ requests, loading, onChanged }) => {
  const confirm = useConfirm();

  const cancel = async (r: LeaveRequest) => {
    const ok = await confirm({
      title: 'Cancel this request?',
      message: `${TYPE_LABEL[r.type]} for ${datesText(r)} will be withdrawn.`,
      confirmLabel: 'Cancel request',
      danger: true,
      action: () => leaveApi.cancel(r.id),
      successTitle: 'Request cancelled'
    });
    if (ok) onChanged();
  };

  if (loading && requests.length === 0) return <p className="text-[13px] text-[var(--tm-ink-muted)]">Loading…</p>;
  if (requests.length === 0) {
    return <p className="rounded-[var(--tm-radius-md)] bg-[var(--tm-card-muted)] p-4 text-[13px] font-semibold text-[var(--tm-ink-muted)]">No requests yet. Pick your dates on the calendar to ask for leave or to work from home.</p>;
  }

  return (
    <ul className="divide-y divide-[var(--tm-border)]">
      {requests.map((r) => (
        <li key={r.id} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 py-3.5">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[14px] font-bold text-[var(--tm-ink)]">{TYPE_LABEL[r.type]}</span>
              <span className="text-[13px] font-semibold text-[var(--tm-ink-soft)]">{datesText(r)}</span>
              <StatusChip tone={TONE[r.status]} size="sm" dot>
                {STATUS_LABEL[r.status]}
              </StatusChip>
            </div>
            <p className="mt-1 line-clamp-2 text-[12.5px] text-[var(--tm-ink-soft)]">{r.reason}</p>
            <p className="mt-0.5 text-[11.5px] text-[var(--tm-ink-muted)]">
              Sent to {r.admin.name} · {formatDistanceToNow(parseISO(r.created_at), { addSuffix: true })}
            </p>
            {r.status === 'rejected' && r.reject_reason && (
              <p className="tm-error mt-2 px-3 py-2 text-[12.5px] font-semibold">
                <span className="font-bold">Reason: </span>
                {r.reject_reason}
              </p>
            )}
          </div>
          {r.status === 'pending' && (
            <Button size="sm" variant="outline" onClick={() => void cancel(r)} aria-label={`Cancel ${TYPE_LABEL[r.type]} ${datesText(r)}`}>
              Cancel
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
};
