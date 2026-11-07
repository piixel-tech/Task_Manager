import React, { useEffect, useState } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Select } from '../../../components/ui/Select';
import { Textarea } from '../../../components/ui/Input';
import { useConfirm } from '../../../hooks/useConfirm';
import { leaveApi, type LeaveDuration, type LeaveType } from '../../../services/http/leaveApi';
import type { UserBrief } from '../../../services/http/projectApi';
import { datesText, DURATION_LABEL, TYPE_LABEL } from '../leaveUtils';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** The picked days, YYYY-MM-DD. */
  start: string;
  end: string;
  onSent: () => void;
}

/** The form that follows "Continue": type, duration (one day only), reason, who to send it to. */
export const LeaveRequestModal: React.FC<Props> = ({ isOpen, onClose, start, end, onSent }) => {
  const confirm = useConfirm();
  const [type, setType] = useState<LeaveType>('leave');
  const [duration, setDuration] = useState<LeaveDuration>('full');
  const [reason, setReason] = useState('');
  const [adminId, setAdminId] = useState('');
  const [admins, setAdmins] = useState<UserBrief[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const oneDay = start === end;

  useEffect(() => {
    if (!isOpen) return;
    setType('leave');
    setDuration('full');
    setReason('');
    setError(null);
    setAdmins(null);
    leaveApi
      .admins()
      .then((list) => {
        setAdmins(list);
        setAdminId(list.length === 1 ? list[0].id : '');
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load the admins'));
  }, [isOpen]);

  // Several days are always full days.
  const effectiveDuration: LeaveDuration = oneDay ? duration : 'full';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) return setError('Give a reason.');
    if (!adminId) return setError('Choose who to send it to.');
    setError(null);
    const adminName = admins?.find((a) => a.id === adminId)?.name ?? 'your admin';
    const ok = await confirm({
      title: 'Send for approval?',
      message: `${TYPE_LABEL[type]} for ${datesText({ start_date: start, end_date: end, duration: effectiveDuration })} goes to ${adminName}.`,
      confirmLabel: 'Send for approval',
      action: async () => {
        await leaveApi.create({ type, start_date: start, end_date: end, duration: effectiveDuration, reason: reason.trim(), admin_id: adminId });
      },
      successTitle: 'Request sent'
    });
    if (ok) {
      onSent();
      onClose();
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Request leave"
      description={datesText({ start_date: start, end_date: end, duration: 'full' })}
    >
      <form onSubmit={submit} className="space-y-4">
        <Select
          label="Type"
          value={type}
          onChange={(e) => setType(e.target.value as LeaveType)}
          options={(Object.keys(TYPE_LABEL) as LeaveType[]).map((v) => ({ value: v, label: TYPE_LABEL[v] }))}
        />
        {oneDay && (
          <Select
            label="Duration"
            value={duration}
            onChange={(e) => setDuration(e.target.value as LeaveDuration)}
            options={(Object.keys(DURATION_LABEL) as LeaveDuration[]).map((v) => ({ value: v, label: DURATION_LABEL[v] }))}
          />
        )}
        <Textarea label="Reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder="Why do you need it?" required />
        <Select
          label="Send to"
          value={adminId}
          onChange={(e) => setAdminId(e.target.value)}
          disabled={!admins || admins.length === 0}
          options={[
            { value: '', label: !admins ? 'Loading…' : admins.length === 0 ? 'No admin in your company' : 'Choose an admin' },
            ...(admins ?? []).map((a) => ({ value: a.id, label: a.name }))
          ]}
        />
        {admins?.length === 0 && <p className="text-[12px] text-[var(--tm-ink-muted)]">Ask an admin to add an admin to your company, then try again.</p>}
        {error && (
          <div className="tm-error px-4 py-3 text-xs font-semibold" role="alert">
            {error}
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
