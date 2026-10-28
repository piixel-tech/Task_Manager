import React, { useEffect, useRef, useState } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Textarea } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { useConfirm } from '../../../hooks/useConfirm';
import type { UserBrief } from '../../../services/http/projectApi';
import { assetApi, type ApiTask, type Asset } from '../../../services/http/taskApi';
import { reviewApi } from '../../../services/http/reviewApi';
import { AssetPicker } from '../../tasks/components/AssetPicker';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  task: ApiTask;
  onSubmitted: () => void;
}

/** Hand a task in for review: a note, optional files, and which head should approve it. */
export const SubmitReviewModal: React.FC<Props> = ({ isOpen, onClose, task, onSubmitted }) => {
  const confirm = useConfirm();
  const [approvers, setApprovers] = useState<UserBrief[]>([]);
  const [approverId, setApproverId] = useState('');
  const [note, setNote] = useState('');
  const [files, setFiles] = useState<Asset[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Files uploaded while the form is open, so abandoned ones can be removed.
  const uploaded = useRef<Set<string>>(new Set());
  const sent = useRef(false);

  useEffect(() => {
    if (!isOpen) return;
    sent.current = false;
    uploaded.current = new Set();
    setNote('');
    setFiles([]);
    setError(null);
    setApprovers([]);
    setApproverId('');
    setLoading(true);
    reviewApi
      .approvers(task.id)
      .then((list) => {
        setApprovers(list);
        setApproverId(list[0]?.id ?? '');
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [isOpen, task.id]);

  const changeFiles = (next: Asset[]) => {
    files
      .filter((a) => uploaded.current.has(a.id) && !next.some((n) => n.id === a.id))
      .forEach((a) => assetApi.remove(a.id).catch(() => {}));
    setFiles(next);
  };

  const close = () => {
    if (!sent.current) uploaded.current.forEach((id) => assetApi.remove(id).catch(() => {}));
    onClose();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!note.trim()) return setError('Add a note about what you did.');
    if (!approverId) return setError('Pick who should review it.');
    setError(null);

    const approver = approvers.find((a) => a.id === approverId);
    const ok = await confirm({
      title: `Submit “${task.title}” for review?`,
      message: `${approver?.name ?? 'The approver'} is notified. Your timer stops and progress is locked until they decide.`,
      confirmLabel: 'Submit',
      action: async () => {
        await reviewApi.submit(task.id, { note: note.trim(), approver_id: approverId, file_ids: files.map((f) => f.id) });
      },
      successTitle: 'Submitted for review'
    });
    if (ok) {
      sent.current = true;
      onSubmitted();
      onClose();
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={close} title="Submit for review" maxWidth="xl">
      <form onSubmit={submit} className="space-y-4">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">{error}</div>
        )}

        <Textarea
          label="Note (required)"
          rows={4}
          placeholder="What did you do, and what should the reviewer look at?"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />

        <Select
          label="Approver"
          value={approverId}
          onChange={(e) => setApproverId(e.target.value)}
          disabled={loading || approvers.length === 0}
          helperText={
            !loading && approvers.length === 0
              ? 'This subfolder has no other head to review your work. Ask an admin to add one.'
              : 'Only heads of this subfolder can approve.'
          }
          options={
            approvers.length
              ? approvers.map((a) => ({ value: a.id, label: a.name }))
              : [{ value: '', label: loading ? 'Loading…' : 'No approver available' }]
          }
        />

        <AssetPicker
          value={files}
          onChange={changeFiles}
          onUploaded={(ids) => ids.forEach((id) => uploaded.current.add(id))}
        />

        <div className="flex justify-end gap-3 border-t border-[var(--tm-border)] pt-5">
          <Button variant="outline" type="button" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" disabled={loading || approvers.length === 0}>
            Submit for review
          </Button>
        </div>
      </form>
    </Modal>
  );
};
