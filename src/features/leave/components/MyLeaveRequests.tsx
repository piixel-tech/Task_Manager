import React from 'react';
import { format, formatDistanceToNow, parseISO } from 'date-fns';
import { Trash2 } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { StatusChip, type ChipTone } from '../../../components/ui/StatusChip';
import { useConfirm } from '../../../hooks/useConfirm';
import { leaveApi, type LeaveRequest, type LeaveStatus } from '../../../services/http/leaveApi';
import { EmptyState } from '../../../components/ui/EmptyState';
import { datesText, STATUS_LABEL, TYPE_LABEL, calendarDays } from '../leaveUtils';

const TONE: Record<LeaveStatus, ChipTone> = { pending: 'warn', approved: 'ok', rejected: 'bad', cancelled: 'neutral' };

/** Pending ones can always be cancelled; approved ones only until the day they start. */
/** Pending, rejected and cancelled ones can be deleted. An approved one has to be cancelled first. */
const canDelete = (r: LeaveRequest) => r.status !== 'approved';

const canCancel = (r: LeaveRequest) => r.status === 'pending' || (r.status === 'approved' && r.start_date > format(new Date(), 'yyyy-MM-dd'));

/** "My requests": newest first, with a status badge, the admin's reason when rejected, and Cancel request while pending (or approved but not started). */
export const MyLeaveRequests: React.FC<{ requests: LeaveRequest[]; loading: boolean; onChanged: () => void }> = ({ requests, loading, onChanged }) => {
  const confirm = useConfirm();

  const cancel = async (r: LeaveRequest) => {
    const ok = await confirm({
      title: 'Cancel this request?',
      message:
        r.status === 'approved'
          ? `${TYPE_LABEL[r.type]} for ${datesText(r)} was approved. ${r.decided_by?.name ?? 'The admin'} is told it is cancelled.`
          : `${TYPE_LABEL[r.type]} for ${datesText(r)} will be withdrawn.`,
      confirmLabel: 'Cancel request',
      danger: true,
      action: () => leaveApi.cancel(r.id),
      successTitle: 'Request cancelled'
    });
    if (ok) onChanged();
  };

  const remove = async (r: LeaveRequest) => {
    const ok = await confirm({
      title: 'Delete this request?',
      message: `${TYPE_LABEL[r.type]} for ${datesText(r)} is removed from your list${r.status === 'pending' ? ' and from the admin\u2019s Pending list' : ''}. It cannot be brought back from here.`,
      confirmLabel: 'Delete request',
      danger: true,
      action: () => leaveApi.remove(r.id),
      successTitle: 'Request deleted'
    });
    if (ok) onChanged();
  };

  if (loading && requests.length === 0) return <p className="text-[13px] text-[var(--tm-ink-muted)]">Loading…</p>;
  if (requests.length === 0) {
    return <EmptyState size="compact" title="No requests yet" description="Pick your dates on the calendar to ask for leave or work from home." />;
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
              {canCancel(r) && (
                <Button size="sm" variant="outline" onClick={() => void cancel(r)} aria-label={`Cancel ${TYPE_LABEL[r.type]} ${datesText(r)}`}>
                  Cancel request
                </Button>
              )}
              {canDelete(r) && (
                <button
                  type="button"
                  title="Delete request"
                  aria-label={`Delete ${TYPE_LABEL[r.type]} ${datesText(r)}`}
                  onClick={() => void remove(r)}
                  className="grid h-8 w-8 place-items-center rounded-full text-[var(--tm-ink-muted)] transition-colors hover:bg-[var(--tm-bg-sunken)] hover:text-[var(--tm-danger)]"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
};
