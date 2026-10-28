import React, { useMemo, useState } from 'react';
import { AtSign, MessageSquarePlus, Search, Users } from 'lucide-react';
import { Input } from '../../../components/ui/Input';
import { Button } from '../../../components/ui/Button';
import { SkeletonRows } from '../../../components/ui/Skeleton';
import type { ChatGroup } from '../../../services/http/chatApi';
import { listTime } from '../chatUtils';

interface Props {
  groups: ChatGroup[];
  loaded: boolean;
  activeId: string | null;
  meId: string;
  onSelect: (id: string) => void;
  /** Absent for clients, who can't start groups. */
  onNew?: () => void;
  /** Open the message search (all my chats). */
  onSearch?: () => void;
  /** Open the search with "mentions me" ticked. */
  onMentions?: () => void;
}

/** Left column: your groups, most recent first, with the last message and an unread count. */
export const GroupList: React.FC<Props> = ({ groups, loaded, activeId, meId, onSelect, onNew, onSearch, onMentions }) => {
  const [q, setQ] = useState('');
  const shown = useMemo(() => groups.filter((g) => g.name.toLowerCase().includes(q.trim().toLowerCase())), [groups, q]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-[var(--tm-border)] p-3">
        <div className="flex-1">
          <Input pill placeholder="Find a chat" value={q} onChange={(e) => setQ(e.target.value)} leftIcon={<Search className="h-4 w-4" />} />
        </div>
        {onSearch && (
          <Button size="sm" variant="ghost" aria-label="Search messages" title="Search all messages" onClick={onSearch}>
            <Search className="h-4 w-4" />
          </Button>
        )}
        {onMentions && (
          <Button size="sm" variant="ghost" aria-label="Messages that mention me" title="Mentions" onClick={onMentions}>
            <AtSign className="h-4 w-4" />
          </Button>
        )}
        {onNew && (
          <Button size="sm" variant="secondary" aria-label="New group" onClick={onNew}>
            <MessageSquarePlus className="h-4 w-4" />
          </Button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {!loaded ? (
          <div className="p-3">
            <SkeletonRows count={5} />
          </div>
        ) : shown.length === 0 ? (
          <div className="p-6 text-center text-[13px] text-[var(--tm-ink-muted)]">
            {groups.length === 0 ? (
              <>
                <p className="mb-3">{onNew ? 'No chats yet.' : 'No conversations yet. Use the invite link your team sent you to join one.'}</p>
                {onNew && (
                  <Button size="sm" onClick={onNew}>
                    Start a group
                  </Button>
                )}
              </>
            ) : (
              'No chats match.'
            )}
          </div>
        ) : (
          <ul>
            {shown.map((g) => {
              const last = g.last_message;
              return (
                <li key={g.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(g.id)}
                    aria-current={g.id === activeId}
                    className={`flex w-full items-center gap-3 border-b border-[var(--tm-border)] px-3.5 py-3 text-left transition-colors ${
                      g.id === activeId ? 'bg-[var(--tm-primary-soft)]' : 'hover:bg-[var(--tm-card-muted)]'
                    }`}
                  >
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[var(--tm-primary-soft)] text-[var(--tm-primary-dark)]">
                      <Users className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-[14px] font-bold text-[var(--tm-ink)]">{g.name}</span>
                        {last && (
                          <span className={`shrink-0 text-[11px] ${g.unread_count ? 'font-bold text-[var(--tm-primary)]' : 'text-[var(--tm-ink-muted)]'}`}>
                            {listTime(last.at)}
                          </span>
                        )}
                      </span>
                      <span className="mt-0.5 flex items-center justify-between gap-2">
                        <span className="truncate text-[12.5px] text-[var(--tm-ink-muted)]">
                          {last ? `${last.mine || last.sender?.id === meId ? 'You' : (last.sender?.name.split(' ')[0] ?? '?')}: ${last.preview}` : `${g.members.length} members`}
                        </span>
                        {g.unread_count > 0 && (
                          <span
                            className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-[var(--tm-primary)] px-1.5 text-[11px] font-extrabold text-[var(--tm-on-primary)]"
                            aria-label={`${g.unread_count} unread`}
                          >
                            {g.unread_count > 99 ? '99+' : g.unread_count}
                          </span>
                        )}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};
