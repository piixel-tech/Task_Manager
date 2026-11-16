import React, { useEffect, useState } from 'react';
import { useConfirm } from '../../../hooks/useConfirm';
import { leaveApi, type LeaveDuration, type LeaveType } from '../../../services/http/leaveApi';
import type { UserBrief } from '../../../services/http/projectApi';
import { datesText, TYPE_LABEL } from '../leaveUtils';

/**
 * The request form's state and submit, shared by the "Request leave" modal and the summary card on the page.
 * Runs (resets the fields, loads the admins) whenever `active` turns on.
 */
export function useLeaveForm({ active, start, end, onSent }: { active: boolean; start: string | null; end: string | null; onSent: () => void }) {
  const confirm = useConfirm();
  const [type, setType] = useState<LeaveType>('leave');
  const [duration, setDuration] = useState<LeaveDuration>('full');
  const [reason, setReason] = useState('');
  const [adminId, setAdminId] = useState('');
  const [admins, setAdmins] = useState<UserBrief[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const oneDay = !!start && start === end;

  const reset = () => {
    setType('leave');
    setDuration('full');
    setReason('');
    setError(null);
  };

  useEffect(() => {
    if (!active) return;
    reset();
    setAdmins(null);
    leaveApi
      .admins()
      .then((list) => {
        setAdmins(list);
        setAdminId(list.length === 1 ? list[0].id : '');
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load the admins'));
  }, [active]);

  // Several days are always full days.
  const effectiveDuration: LeaveDuration = oneDay ? duration : 'full';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!start || !end) return;
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
      reset();
      onSent();
    }
    return ok;
  };

  return { type, setType, duration, setDuration, reason, setReason, adminId, setAdminId, admins, error, oneDay, submit };
}
