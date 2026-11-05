import React, { useEffect, useState } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { useConfirm } from '../../../hooks/useConfirm';
import { projectApi, type Subfolder, type UserBrief, type Visibility } from '../../../services/http/projectApi';
import { PeoplePicker } from './PeoplePicker';
import { VISIBILITIES, VISIBILITY } from './VisibilityIcon';

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
  const [visibility, setVisibility] = useState<Visibility>('private');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setName(subfolder?.name ?? '');
    setVisibility(subfolder?.visibility ?? 'private');
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
        if (subfolder?.can_set_visibility && visibility !== subfolder.visibility) saved = await projectApi.setVisibility(subfolder.id, visibility);
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
          <div className="tm-error px-4 py-3 text-xs font-semibold">
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
        {subfolder?.can_set_visibility && (
          <fieldset>
            <legend className="mb-2 text-[13px] font-bold text-[var(--tm-ink)]">Visibility</legend>
            <div className="grid gap-2" role="radiogroup" aria-label="Visibility">
              {VISIBILITIES.map((v) => {
                const { label, hint, Icon } = VISIBILITY[v];
                const on = visibility === v;
                return (
                  <label
                    key={v}
                    className={`flex cursor-pointer items-start gap-3 rounded-[var(--tm-radius-md)] border px-3.5 py-3 transition-colors ${on ? 'border-[var(--primary)] bg-[var(--tm-primary-soft)]' : 'border-[var(--tm-border)] hover:bg-[var(--tm-bg-sunken)]'}`}
                  >
                    <input type="radio" name="visibility" value={v} checked={on} onChange={() => setVisibility(v)} className="mt-1 accent-[var(--primary)]" />
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--tm-ink)]" strokeWidth={2.1} />
                    <span className="min-w-0">
                      <span className="block text-[13.5px] font-bold text-[var(--tm-ink)]">{label}</span>
                      <span className="block text-[12.5px] text-[var(--tm-ink-soft)]">{hint}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        )}
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
