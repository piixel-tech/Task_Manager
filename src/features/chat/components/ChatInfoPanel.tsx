import React from 'react';
import { Settings2, Users } from 'lucide-react';
import { Avatar } from '../../../components/ui/Avatar';
import { Button } from '../../../components/ui/Button';
import { PersonLink } from '../../../components/ui/PersonLink';
import { useChatStore } from '../../../store/useChatStore';
import type { ChatGroup } from '../../../services/http/chatApi';
import { SharedTabs } from './SharedTabs';

/** Right column: who is in the chat, and everything shared in it (media, docs, links). Management stays in the group info dialog. */
export const ChatInfoPanel: React.FC<{ group: ChatGroup; meId: string; onManage: () => void }> = ({ group, meId, onManage }) => (
  <div className="flex h-full min-h-0 flex-col overflow-y-auto p-5">
    <div className="flex flex-col items-center gap-2 pb-4 text-center">
      <span className="grid h-16 w-16 place-items-center rounded-full bg-[var(--tm-primary-soft)] text-[var(--tm-primary-dark)]">
        <Users className="h-7 w-7" />
      </span>
      <h2 className="text-[16px] font-extrabold text-[var(--tm-ink)]">{group.name}</h2>
      <p className="text-[12px] text-[var(--tm-ink-muted)]">{group.members.length} members</p>
      <Button size="sm" variant="outline" onClick={onManage} leftIcon={<Settings2 className="h-4 w-4" />}>
        Group info
      </Button>
    </div>

    <h3 className="pb-2 text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--tm-ink-muted)]">Members</h3>
    <ul className="space-y-1 pb-5">
      {group.members.map((u) => (
        <li key={u.id}>
          <PersonLink userId={u.id} className="flex items-center gap-2.5 rounded-full px-1 py-1 text-[13px] font-semibold text-[var(--tm-ink)] hover:bg-[var(--tp-row-hover)]">
            <Avatar name={u.name} src={u.avatar_url ?? undefined} size="sm" />
            <span className="truncate">
              {u.name}
              {u.id === meId && ' (you)'}
            </span>
          </PersonLink>
        </li>
      ))}
    </ul>

    <h3 className="pb-2 text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--tm-ink-muted)]">Shared</h3>
    <SharedTabs groupId={group.id} onOpenMessage={(id) => void useChatStore.getState().jumpTo(group.id, id)} />
  </div>
);
