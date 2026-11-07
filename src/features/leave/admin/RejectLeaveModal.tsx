import React, { useEffect, useState } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Textarea } from '../../../components/ui/Input';
import { toast } from '../../../store/useToastStore';
import { leaveApi, type LeaveRequest } from '../../../services/http/leaveApi';
import { datesText, TYPE_LABEL } from '../leaveUtils';

/** "Why are you rejecting this?": the reason is required, and the employee gets it. */
export const RejectLeaveModal: React.FC<{ request: LeaveRequest | null; onClose: () => void; onDone: () => void }> = ({ request, onClose, onDone }) => {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setReason('');
    setError(null);
    setBusy(false);
  }, [request?.id]);

  if (!request) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) return setError('Give a reason: it is sent to the employee.');
    setBusy(true);
    setError(null);
    try {
      await leaveApi.reject(request.id, reason.trim());
      toast.success('Request rejected', `${request.user.name} was told why.`);
      onDone();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reject the request');
      setBusy(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} maxWidth="sm" title="Why are you rejecting this?" description={`${request.user.name} · ${TYPE_LABEL[request.type]} · ${datesText(request)}`}>
      <form onSubmit={submit} className="space-y-4">
        <Textarea
          label="Reason"
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={500}
          placeholder="For example: release week, please pick other days"
          required
          autoFocus
        />
        {error && (
          <div className="tm-error px-4 py-3 text-xs font-semibold" role="alert">
            {error}
          </div>
        )}
        <div className="flex justify-end gap-3 border-t border-[var(--tm-border)] pt-4">
          <Button variant="outline" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" type="submit" isLoading={busy}>
            Reject
          </Button>
        </div>
      </form>
    </Modal>
  );
};
