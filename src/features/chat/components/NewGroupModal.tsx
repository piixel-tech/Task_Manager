import React, { useEffect, useState } from 'react';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Modal } from '../../../components/ui/Modal';
import { Select } from '../../../components/ui/Select';
import { useConfirm } from '../../../hooks/useConfirm';
import { useAuthStore } from '../../../store/authStore';
import { chatApi, type ChatGroup } from '../../../services/http/chatApi';
import { projectApi, type UserBrief } from '../../../services/http/projectApi';
import { PeoplePickerList } from './PeoplePickerList';
import { useSubfolderOptions } from './useSubfolderOptions';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (g: ChatGroup) => void;
  /** Start with this subfolder linked (when started from the sidebar). */
  defaultSubfolderId?: string;
}

/** Anyone can start a group: a name, some people, and optionally a subfolder to link it to. */
export const NewGroupModal: React.FC<Props> = ({ isOpen, onClose, onCreated, defaultSubfolderId }) => {
  const confirm = useConfirm();
  const meId = useAuthStore((s) => s.user?.id);
  const subfolders = useSubfolderOptions(isOpen);
  const [directory, setDirectory] = useState<UserBrief[]>([]);
  const [name, setName] = useState('');
  const [members, setMembers] = useState<string[]>([]);
  const [subfolderId, setSubfolderId] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setName('');
    setMembers([]);
    setSubfolderId(defaultSubfolderId ?? '');
    setError(null);
    projectApi.directory().then(setDirectory).catch(() => setError('Could not load the team'));
  }, [isOpen, defaultSubfolderId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = name.trim();
    if (!title) return setError('Give the group a name.');
    setError(null);
    let created: ChatGroup | null = null;
    const ok = await confirm({
      title: `Create “${title}”?`,
      message: `${members.length + 1} ${members.length ? 'people' : 'person'} (including you). Everyone you add is notified.`,
      confirmLabel: 'Create group',
      action: async () => {
        created = await chatApi.createGroup(title, members, subfolderId || null);
      },
      successTitle: 'Group created'
    });
    if (ok && created) {
      onCreated(created);
      onClose();
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="New group" description="You are added automatically." maxWidth="lg">
      <form onSubmit={submit} className="space-y-4">
        {error && <div className="tm-error px-4 py-3 text-xs font-semibold">{error}</div>}
        <Input label="Group name" placeholder="e.g. Acme launch" maxLength={100} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        <div>
          <p className="mb-1.5 text-[12.5px] font-bold text-[var(--tm-ink-soft)]">Add people</p>
          <PeoplePickerList people={directory.filter((p) => p.id !== meId)} selected={members} onChange={setMembers} />
        </div>
        <Select
          label="Link to a subfolder (optional)"
          value={subfolderId}
          onChange={(e) => setSubfolderId(e.target.value)}
          options={[{ value: '', label: 'No link' }, ...subfolders]}
        />
        <div className="flex justify-end gap-3 border-t border-[var(--tm-border)] pt-5">
          <Button variant="outline" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={!name.trim()}>
            Create group
          </Button>
        </div>
      </form>
    </Modal>
  );
};
