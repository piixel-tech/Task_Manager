import React from 'react';
import { format, formatDistanceToNow, parseISO } from 'date-fns';
import { Button } from '../../../components/ui/Button';
import { StatusChip, type ChipTone } from '../../../components/ui/StatusChip';
import { useConfirm } from '../../../hooks/useConfirm';
import { leaveApi, type LeaveRequest, type LeaveStatus } from '../../../services/http/leaveApi';
import { datesText, STATUS_LABEL, TYPE_LABEL, calendarDays } from '../leaveUtils';

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
    <ul className="space-y-2.5">
      {requests.map((r) => {
        const days = calendarDays(r.start_date, r.end_date, r.duration);
        return (
          <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl bg-[var(--tm-card-muted)] p-3">
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-[var(--tm-card)] text-center leading-none">
              <span>
                <span className="block text-[10.5px] font-semibold uppercase tracking-wide text-[var(--tm-ink-muted)]">{format(parseISO(r.start_date), 'MMM')}</span>
                <span className="mt-1 block text-[20px] font-bold tabular-nums text-[var(--tm-ink)]">{format(parseISO(r.start_date), 'd')}</span>
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-bold text-[var(--tm-ink)]">
                {TYPE_LABEL[r.type]} <span className="font-semibold text-[var(--tm-ink-muted)]">· {days} {days === 1 ? 'day' : 'days'}</span>
              </p>
              <p className="mt-0.5 text-[13px] font-semibold text-[var(--tm-ink-soft)]">
                {datesText(r)} · {r.admin.name}
              </p>
              <p className="mt-1 line-clamp-2 text-[12.5px] text-[var(--tm-ink-soft)]">{r.reason}</p>
              <p className="mt-0.5 text-[11.5px] text-[var(--tm-ink-muted)]">Sent {formatDistanceToNow(parseISO(r.created_at), { addSuffix: true })}</p>
              {r.status === 'rejected' && r.reject_reason && (
                <p className="tm-error mt-2 px-3 py-2 text-[12.5px] font-semibold">
                  <span className="font-bold">Reason: </span>
                  {r.reject_reason}
                </p>
              )}
            </div>
            <div className="ml-auto flex shrink-0 items-center gap-2 self-center">
              <StatusChip tone={TONE[r.status]} size="sm" dot>
                {STATUS_LABEL[r.status]}
              </StatusChip>
              {r.status === 'pending' && (
                <Button size="sm" variant="outline" onClick={() => void cancel(r)} aria-label={`Cancel ${TYPE_LABEL[r.type]} ${datesText(r)}`}>
                  Cancel
                </Button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
};
