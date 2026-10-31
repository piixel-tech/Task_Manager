import React, { useEffect, useRef, useState } from 'react';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Modal } from '../../../components/ui/Modal';
import { Select } from '../../../components/ui/Select';
import { useConfirm } from '../../../hooks/useConfirm';
import { assetApi, type Asset } from '../../../services/http/taskApi';
import { requirementApi, type Requirement } from '../../../services/http/requirementApi';
import { AssetPicker } from '../../tasks/components/AssetPicker';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  subfolders: { id: string; name: string }[];
  /** Present when editing. */
  requirement?: Requirement | null;
  onSaved: () => void;
}

/** Add a requirement, or edit your own. Edits keep the earlier version in the history. */
export const RequirementFormModal: React.FC<Props> = ({ isOpen, onClose, projectId, subfolders, requirement, onSaved }) => {
  const confirm = useConfirm();
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [files, setFiles] = useState<Asset[]>([]);
  const [subfolderId, setSubfolderId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const uploaded = useRef<Set<string>>(new Set()); // uploads made in this form: removable if it is cancelled
  const saved = useRef(false);

  useEffect(() => {
    if (!isOpen) return;
    setTitle(requirement?.title ?? '');
    setDetails(requirement?.details ?? '');
    setFiles(requirement?.attachments ?? []);
    setSubfolderId(requirement?.subfolder?.id ?? '');
    setError(null);
    uploaded.current = new Set();
    saved.current = false;
  }, [isOpen, requirement]);

  const close = () => {
    if (!saved.current) uploaded.current.forEach((id) => assetApi.remove(id).catch(() => {}));
    onClose();
  };

  const changeFiles = (next: Asset[]) => {
    // Only files uploaded during this edit are deleted; older attachments live on in the history.
    files.filter((a) => uploaded.current.has(a.id) && !next.some((n) => n.id === a.id)).forEach((a) => assetApi.remove(a.id).catch(() => {}));
    setFiles(next);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return setError('Give the requirement a title.');
    if (!details.trim() && files.length === 0) return setError('Write some details or attach a file or link.');
    setError(null);
    const input = { title: title.trim(), details: details.trim(), attachment_ids: files.map((f) => f.id), subfolder_id: subfolderId || null };
    const editing = !!requirement;
    const ok = await confirm({
      title: editing ? 'Save your changes?' : 'Add this requirement?',
      message: editing
        ? 'The earlier version stays in the history, and the project heads are notified.'
        : 'It is added to the project record and the project heads and admins are notified.',
      confirmLabel: editing ? 'Save' : 'Add requirement',
      action: async () => {
        if (requirement) await requirementApi.edit(requirement.id, input);
        else await requirementApi.add(projectId, input);
      },
      successTitle: editing ? 'Requirement updated' : 'Requirement added'
    });
    if (ok) {
      saved.current = true;
      onSaved();
      onClose();
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={close} title={requirement ? 'Edit requirement' : 'New requirement'} maxWidth="lg">
      <form onSubmit={submit} className="space-y-4">
        {error && <div className="tm-error px-4 py-3 text-xs font-semibold">{error}</div>}
        <Input label="Title" value={title} maxLength={200} placeholder="e.g. Logo must work on dark backgrounds" onChange={(e) => setTitle(e.target.value)} autoFocus />
        <div>
          <label htmlFor="req-details" className="mb-1.5 block text-[12.5px] font-bold text-[var(--tm-ink-soft)]">
            Details
          </label>
          <textarea
            id="req-details"
            value={details}
            rows={6}
            maxLength={10000}
            placeholder="Describe what is needed. You can also just attach a document."
            onChange={(e) => setDetails(e.target.value)}
            className="w-full resize-y rounded-[var(--tm-radius-md)] border border-[var(--tm-border)] bg-[var(--tm-card)] p-3 text-[14px] text-[var(--tm-ink)] outline-none focus:border-[var(--tm-primary)]"
          />
        </div>
        <AssetPicker value={files} onChange={changeFiles} onUploaded={(ids) => ids.forEach((id) => uploaded.current.add(id))} />
        <Select
          label="Subfolder (optional)"
          value={subfolderId}
          onChange={(e) => setSubfolderId(e.target.value)}
          options={[{ value: '', label: 'Whole project' }, ...subfolders.map((s) => ({ value: s.id, label: s.name }))]}
        />
        <div className="flex justify-end gap-3 border-t border-[var(--tm-border)] pt-5">
          <Button type="button" variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" disabled={!title.trim()}>
            {requirement ? 'Save changes' : 'Add requirement'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
