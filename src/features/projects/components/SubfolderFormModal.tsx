import React, { useEffect, useState } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { useConfirm } from '../../../hooks/useConfirm';
import { projectApi, type Subfolder, type UserBrief } from '../../../services/http/projectApi';
import { PeoplePicker } from './PeoplePicker';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Create mode: the project to add the subfolder to. */
  projectId: string;
  /** Edit mode: the subfolder being changed. */
  subfolder?: Subfolder | null;
  onSaved: (subfolder: Subfolder) => void;
}

/** Create or edit a subfolder: name, heads, members. */
export const SubfolderFormModal: React.FC<Props> = ({ isOpen, onClose, projectId, subfolder, onSaved }) => {
  const confirm = useConfirm();
  const [people, setPeople] = useState<UserBrief[]>([]);
  const [name, setName] = useState('');
  const [heads, setHeads] = useState<string[]>([]);
  const [members, setMembers] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setName(subfolder?.name ?? '');
    setHeads(subfolder?.heads.map((h) => h.id) ?? []);
    // Heads are listed separately, so keep only the other members here.
    const headIds = new Set(subfolder?.heads.map((h) => h.id));
    setMembers(subfolder?.members.filter((m) => !headIds.has(m.id)).map((m) => m.id) ?? []);
    projectApi
      .directory()
      .then(setPeople)
      .catch((err) => setError(err.message));
  }, [isOpen, subfolder]);

  const toggleHead = (ids: string[]) => {
    setHeads(ids);
    setMembers((current) => current.filter((id) => !ids.includes(id)));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError('Give the subfolder a name.');
    if (heads.length === 0) return setError('Pick at least one head.');
    setError(null);

    const input = { name: name.trim(), head_ids: heads, member_ids: members };
    let saved: Subfolder | undefined;
    const ok = await confirm({
      title: subfolder ? `Save changes to ${subfolder.name}?` : `Create subfolder “${input.name}”?`,
      message: 'Everyone added, appointed or removed will be notified.',
      confirmLabel: subfolder ? 'Save' : 'Create',
      action: async () => {
        saved = subfolder
          ? await projectApi.updateSubfolder(subfolder.id, input)
          : await projectApi.createSubfolder(projectId, input);
      },
      successTitle: subfolder ? 'Subfolder updated' : 'Subfolder created'
    });
    if (ok && saved) {
      onSaved(saved);
      onClose();
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={subfolder ? `Edit ${subfolder.name}` : 'New subfolder'}
      description="Heads manage the subfolder. Everyone else on it can work in it but not change it."
      maxWidth="lg"
    >
      <form onSubmit={submit} className="space-y-4">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">
            {error}
          </div>
        )}
        <Input label="Name" placeholder="e.g. Design" value={name} onChange={(e) => setName(e.target.value)} required />
        <PeoplePicker
          label="Heads"
          hint="At least one. A head is also a member."
          people={people}
          value={heads}
          onChange={toggleHead}
        />
        <PeoplePicker label="Members" people={people} value={members} onChange={setMembers} lockedIds={heads} />
        <div className="flex justify-end gap-3 border-t border-[var(--tm-border)] pt-5">
          <Button variant="outline" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">{subfolder ? 'Save changes' : 'Create subfolder'}</Button>
        </div>
      </form>
    </Modal>
  );
};
