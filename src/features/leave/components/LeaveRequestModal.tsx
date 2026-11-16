import React from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Select } from '../../../components/ui/Select';
import { Textarea } from '../../../components/ui/Input';
import type { LeaveDuration, LeaveType } from '../../../services/http/leaveApi';
import { datesText, DURATION_LABEL, TYPE_LABEL } from '../leaveUtils';
import { useLeaveForm } from './useLeaveForm';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** The picked days, YYYY-MM-DD. */
  start: string;
  end: string;
  onSent: () => void;
}

/** The form that follows the header's "Request leave" once days are picked: type, duration (one day only), reason, who to send it to. */
export const LeaveRequestModal: React.FC<Props> = ({ isOpen, onClose, start, end, onSent }) => {
  const f = useLeaveForm({
    active: isOpen,
    start,
    end,
    onSent: () => {
      onSent();
      onClose();
    }
  });
  const { admins } = f;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Request leave"
      description={datesText({ start_date: start, end_date: end, duration: 'full' })}
    >
      <form onSubmit={f.submit} className="space-y-4">
        <Select
          label="Type"
          value={f.type}
          onChange={(e) => f.setType(e.target.value as LeaveType)}
          options={(Object.keys(TYPE_LABEL) as LeaveType[]).map((v) => ({ value: v, label: TYPE_LABEL[v] }))}
        />
        {f.oneDay && (
          <Select
            label="Duration"
            value={f.duration}
            onChange={(e) => f.setDuration(e.target.value as LeaveDuration)}
            options={(Object.keys(DURATION_LABEL) as LeaveDuration[]).map((v) => ({ value: v, label: DURATION_LABEL[v] }))}
          />
        )}
        <Textarea label="Reason" rows={3} value={f.reason} onChange={(e) => f.setReason(e.target.value)} maxLength={500} placeholder="Why do you need it?" required />
        <Select
          label="Send to"
          value={f.adminId}
          onChange={(e) => f.setAdminId(e.target.value)}
          disabled={!admins || admins.length === 0}
          options={[
            { value: '', label: !admins ? 'Loading…' : admins.length === 0 ? 'No admin in your company' : 'Choose an admin' },
            ...(admins ?? []).map((a) => ({ value: a.id, label: a.name }))
          ]}
        />
        {admins?.length === 0 && <p className="text-[12px] text-[var(--tm-ink-muted)]">Ask an admin to add an admin to your company, then try again.</p>}
        {f.error && (
          <div className="tm-error px-4 py-3 text-xs font-semibold" role="alert">
            {f.error}
          </div>
        )}
        <div className="flex justify-end gap-3 border-t border-[var(--tm-border)] pt-4">
          <Button variant="outline" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={!admins || admins.length === 0}>
            Send for approval
          </Button>
        </div>
      </form>
    </Modal>
  );
};
