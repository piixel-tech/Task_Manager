import React, { useEffect, useState } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { useConfirm } from '../../../hooks/useConfirm';
import { useFieldErrors } from '../../../hooks/useFieldErrors';
import { FieldGroup } from '../../../components/ui/FieldError';
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
  const f = useFieldErrors<'name' | 'heads'>();
  const [people, setPeople] = useState<UserBrief[]>([]);
  const [name, setName] = useState('');
  const [heads, setHeads] = useState<string[]>([]);
  const [members, setMembers] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    f.reset();
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
    const problems: Parameters<typeof f.fail>[0] = {};
    if (!name.trim()) problems.name = 'Enter a name for the subfolder';
    if (heads.length === 0) problems.heads = 'Pick at least one head';
    if (Object.keys(problems).length > 0) return f.fail(problems);
    f.reset();
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
      <form noValidate onSubmit={submit} className="space-y-4">
        {error && (
          <div className="tm-error px-4 py-3 text-xs font-semibold">
            {error}
          </div>
        )}
        <Input
          label="Name"
          placeholder="e.g. Design"
          value={name}
          data-field="name"
          data-label="subfolder name"
          error={f.errors.name}
          onChange={(e) => {
            setName(e.target.value);
            f.clear('name');
          }}
          required
        />
        <FieldGroup name="heads" error={f.errors.heads}>
          <PeoplePicker
            label="Heads"
            hint="At least one. A head is also a member."
            people={people}
            value={heads}
            onChange={(ids) => {
              toggleHead(ids);
              f.clear('heads');
            }}
          />
        </FieldGroup>
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
