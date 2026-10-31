import React, { useEffect, useState } from 'react';
import { Link2, LogOut, Trash2, UserMinus, UserPlus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Avatar } from '../../../components/ui/Avatar';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Modal } from '../../../components/ui/Modal';
import { PillTabs } from '../../../components/ui/PillTabs';
import { Select } from '../../../components/ui/Select';
import { focusEndLabel, useFocusOf } from '../../../store/useFocusStore';
import { useConfirm } from '../../../hooks/useConfirm';
import { useAuthStore } from '../../../store/authStore';
import { useChatStore } from '../../../store/useChatStore';
import { chatApi, type ChatGroup } from '../../../services/http/chatApi';
import { projectApi, type UserBrief } from '../../../services/http/projectApi';
import { InviteSection } from './InviteSection';
import { PeoplePickerList } from './PeoplePickerList';
import { SharedTabs } from './SharedTabs';
import { useSubfolderOptions } from './useSubfolderOptions';

interface Props {
  group: ChatGroup | null;
  onClose: () => void;
}

/** A member's avatar and name, with a moon and "In focus until..." while they are in Focus mode. */
const MemberIdentity: React.FC<{ user: UserBrief; isMe: boolean }> = ({ user, isMe }) => {
  const until = useFocusOf(user);
  return (
    <>
      <Avatar name={user.name} src={user.avatar_url ?? undefined} size="xs" focus={until != null} />
      <span className="text-[13.5px] font-semibold text-[var(--tm-ink)]">
        {user.name}
        {isMe && ' (you)'}
        {until && <span className="ml-2 text-[11.5px] font-medium text-[var(--tm-ink-muted)]">In focus until {focusEndLabel(until)}</span>}
      </span>
    </>
  );
};

/** Members, subfolder link and housekeeping. Anyone can add people or leave; the creator manages the rest. */
export const GroupInfoModal: React.FC<Props> = ({ group, onClose }) => {
  const confirm = useConfirm();
  const navigate = useNavigate();
  const me = useAuthStore((s) => s.user);
  const { upsertGroup, dropGroup } = useChatStore.getState();
  const subfolders = useSubfolderOptions(!!group);
  const [directory, setDirectory] = useState<UserBrief[]>([]);
  const [name, setName] = useState('');
  const [subfolderId, setSubfolderId] = useState('');
  const [adding, setAdding] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [tab, setTab] = useState<'info' | 'shared'>('info');

  useEffect(() => {
    if (!group) return;
    setName(group.name);
    setSubfolderId(group.subfolder?.id ?? '');
    setAdding(false);
    setPicked([]);
    setTab('info');
    if (useAuthStore.getState().user?.role !== 'client') projectApi.directory().then(setDirectory).catch(() => {}); // clients can't browse the team
    // Reset only when a different group is opened, not on every live update of the same one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group?.id]);

  if (!group || !me) return null;
  const isClient = me.role === 'client';
  const prefix = me.role === 'admin' ? '/admin' : '/app';
  const outside = directory.filter((p) => !group.members.some((m) => m.id === p.id));
  const dirty = name.trim() !== group.name || subfolderId !== (group.subfolder?.id ?? '');

  const save = () =>
    confirm({
      title: 'Save group changes?',
      message: 'Members are notified of the change.',
      confirmLabel: 'Save',
      action: async () => {
        const patch: { name?: string; subfolder_id?: string | null } = {};
        if (name.trim() !== group.name) patch.name = name.trim();
        if (subfolderId !== (group.subfolder?.id ?? '')) patch.subfolder_id = subfolderId || null;
        upsertGroup(await chatApi.updateGroup(group.id, patch));
      },
      successTitle: 'Group updated'
    });

  const add = () =>
    confirm({
      title: `Add ${picked.length} ${picked.length === 1 ? 'person' : 'people'}?`,
      message: 'They can read the earlier messages and are notified.',
      confirmLabel: 'Add',
      action: async () => {
        upsertGroup(await chatApi.addMembers(group.id, picked));
      },
      successTitle: 'People added'
    }).then((ok) => {
      if (ok) {
        setAdding(false);
        setPicked([]);
      }
    });

  const remove = (u: UserBrief) =>
    confirm({
      title: `Remove ${u.name}?`,
      message: 'They lose access to this group and are notified.',
      confirmLabel: 'Remove',
      danger: true,
      action: async () => {
        const g = await chatApi.removeMember(group.id, u.id);
        if (g) upsertGroup(g);
      },
      successTitle: 'Person removed'
    });

  const leave = () =>
    confirm({
      title: `Leave “${group.name}”?`,
      message: 'You will no longer see this group or its messages.',
      confirmLabel: 'Leave group',
      danger: true,
      action: async () => {
        await chatApi.removeMember(group.id, me.id);
        dropGroup(group.id);
      },
      successTitle: 'You left the group'
    }).then((ok) => ok && onClose());

  const destroy = () =>
    confirm({
      title: `Delete “${group.name}”?`,
      message: 'The group, all its messages and their files are deleted for everyone. This cannot be undone.',
      confirmLabel: 'Delete group',
      danger: true,
      action: async () => {
        await chatApi.deleteGroup(group.id);
        dropGroup(group.id);
      },
      successTitle: 'Group deleted'
    }).then((ok) => ok && onClose());

  return (
    <Modal isOpen onClose={onClose} title="Group info" maxWidth="lg">
      <PillTabs
        size="sm"
        className="mb-5"
        activeTab={tab}
        onChange={(id) => setTab(id as 'info' | 'shared')}
        tabs={[
          { id: 'info', label: 'Info' },
          { id: 'shared', label: 'Media, docs & links' }
        ]}
      />
      {tab === 'shared' ? (
        <SharedTabs
          groupId={group.id}
          onOpenMessage={(messageId) => {
            onClose();
            void useChatStore.getState().jumpTo(group.id, messageId);
          }}
        />
      ) : (
      <div className="space-y-6">
        {group.can_manage ? (
          <div className="space-y-3">
            <Input label="Group name" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} />
            <Select
              label="Linked subfolder"
              value={subfolderId}
              onChange={(e) => setSubfolderId(e.target.value)}
              options={[
                { value: '', label: 'No link' },
                // keep showing a link the creator can no longer pick (e.g. left that subfolder)
                ...(group.subfolder && !subfolders.some((s) => s.value === group.subfolder!.id) ? [{ value: group.subfolder.id, label: group.subfolder.name }] : []),
                ...subfolders
              ]}
            />
            <div className="flex justify-end">
              <Button size="sm" disabled={!dirty || !name.trim()} onClick={save}>
                Save changes
              </Button>
            </div>
          </div>
        ) : (
          group.subfolder && (
            <button
              type="button"
              onClick={() => navigate(`${prefix}/projects/${group.subfolder!.project_id}/subfolders/${group.subfolder!.id}`)}
              className="flex items-center gap-2 text-[13px] font-semibold text-[var(--tm-primary-dark)] hover:underline"
            >
              <Link2 className="h-4 w-4" />
              Linked to {group.subfolder.name}
            </button>
          )
        )}

        <section>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-[13px] font-extrabold text-[var(--tm-ink)]">{group.members.length} members</h3>
            {!isClient && (
              <Button size="sm" variant="outline" onClick={() => setAdding((v) => !v)} leftIcon={<UserPlus className="h-4 w-4" />}>
                Add people
              </Button>
            )}
          </div>
          {adding && (
            <div className="mb-3 space-y-2">
              <PeoplePickerList people={outside} selected={picked} onChange={setPicked} emptyText="Everyone is already in this group." />
              <div className="flex justify-end">
                <Button size="sm" disabled={picked.length === 0} onClick={add}>
                  Add {picked.length || ''}
                </Button>
              </div>
            </div>
          )}
          <ul className="divide-y divide-[var(--tm-border)] rounded-[var(--tm-radius-md)] border border-[var(--tm-border)]">
            {group.members.map((u) => (
              <li key={u.id} className="flex items-center gap-3 px-3 py-2">
                <MemberIdentity user={u} isMe={u.id === me.id} />
                {u.id === group.created_by && (
                  <span className="rounded-full bg-[var(--tm-primary-soft)] px-2 py-0.5 text-[10.5px] font-bold text-[var(--tm-primary-dark)]">Creator</span>
                )}
                {u.role === 'client' && (
                  <span className="rounded-full bg-[var(--tm-info-bg)] px-2 py-0.5 text-[10.5px] font-bold text-[var(--tm-info)]">Client</span>
                )}
                {group.can_manage && u.id !== me.id && (
                  <Button variant="ghost" size="sm" className="ml-auto" aria-label={`Remove ${u.name}`} onClick={() => remove(u)}>
                    <UserMinus className="h-4 w-4 text-[var(--tm-danger)]" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </section>

        {group.can_invite && <InviteSection group={group} />}

        <div className="flex flex-wrap justify-end gap-3 border-t border-[var(--tm-border)] pt-5">
          {group.created_by !== me.id && (
            <Button variant="outline" onClick={leave} leftIcon={<LogOut className="h-4 w-4" />}>
              Leave group
            </Button>
          )}
          {group.can_manage && (
            <Button variant="danger" onClick={destroy} leftIcon={<Trash2 className="h-4 w-4" />}>
              Delete group
            </Button>
          )}
        </div>
      </div>
      )}
    </Modal>
  );
};
