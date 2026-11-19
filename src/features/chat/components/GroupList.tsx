import React, { useMemo, useState } from 'react';
import { AtSign, MessageSquarePlus, Search, Users } from 'lucide-react';
import { Avatar } from '../../../components/ui/Avatar';
import { SkeletonRows } from '../../../components/ui/Skeleton';
import { EmptyState } from '../../../components/ui/EmptyState';
import { PullToRefresh } from '../../../components/ui/PullToRefresh';
import { useChatStore } from '../../../store/useChatStore';
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

type Tab = 'all' | 'unread' | 'groups';

/** A chat with more than two people is a group; with two it is a conversation between them. */
const isGroup = (g: ChatGroup) => g.members.length > 2;

/** Left column: "Chats", a search, All / Unread / Groups, and your chats most recent first with the last message and an unread count. */
export const GroupList: React.FC<Props> = ({ groups, loaded, activeId, meId, onSelect, onNew, onSearch, onMentions }) => {
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<Tab>('all');
  const unread = groups.filter((g) => g.unread_count > 0).length;
  const shown = useMemo(
    () =>
      groups
        .filter((g) => (tab === 'unread' ? g.unread_count > 0 : tab === 'groups' ? isGroup(g) : true))
        .filter((g) => g.name.toLowerCase().includes(q.trim().toLowerCase())),
    [groups, q, tab]
  );
  const icon = 'grid h-9 w-9 place-items-center rounded-full text-[var(--tm-ink-soft)] transition-colors hover:bg-[var(--tm-bg-sunken)] hover:text-[var(--tm-ink)]';

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1 pb-3">
        <h2 className="flex-1 text-[20px] font-bold tracking-[-0.01em] text-[var(--tm-ink)]">Chats</h2>
        {onMentions && (
          <button type="button" aria-label="Messages that mention me" title="Mentions" onClick={onMentions} className={icon}>
            <AtSign className="h-[18px] w-[18px]" />
          </button>
        )}
        {onNew && (
          <button type="button" aria-label="New group" title="New chat" onClick={onNew} className={icon}>
            <MessageSquarePlus className="h-[18px] w-[18px]" />
          </button>
        )}
      </div>

      <label className="mb-3 flex h-10 items-center gap-2 rounded-full bg-[var(--tc-other-bg)] px-3.5 text-[var(--tm-ink-muted)] focus-within:ring-1 focus-within:ring-[var(--tm-ink-muted)]">
        <Search className="h-4 w-4 shrink-0" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Find a chat"
          aria-label="Find a chat"
          className="min-w-0 flex-1 bg-transparent text-[13.5px] text-[var(--tm-ink)] outline-none placeholder:text-[var(--tm-ink-muted)]"
        />
        {onSearch && (
          <button type="button" aria-label="Search messages" title="Search all messages" onClick={onSearch} className="shrink-0 text-[11.5px] font-semibold text-[var(--tm-ink-soft)] hover:text-[var(--tm-ink)]">
            Messages
          </button>
        )}
      </label>

      <div role="tablist" aria-label="Chats" className="mb-1 flex gap-5 border-b border-[var(--tm-border)]">
        {(
          [
            ['all', 'All'],
            ['unread', 'Unread'],
            ['groups', 'Groups']
          ] as [Tab, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`-mb-px border-b-2 pb-2 text-[13px] font-semibold transition-colors ${
              tab === id ? 'border-[var(--tm-ink)] text-[var(--tm-ink)]' : 'border-transparent text-[var(--tm-ink-muted)] hover:text-[var(--tm-ink)]'
            }`}
          >
            {label}
            {id === 'unread' && unread > 0 && <span className="ml-1.5 tabular-nums text-[var(--tm-ink-muted)]">{unread}</span>}
          </button>
        ))}
      </div>

      <PullToRefresh onRefresh={() => useChatStore.getState().loadGroups()} className="min-h-0 flex-1 overflow-y-auto pt-1">
        {!loaded ? (
          <div className="p-3">
            <SkeletonRows count={5} />
          </div>
        ) : shown.length === 0 ? (
          <div className="p-3">
            {groups.length === 0 ? (
              onNew ? (
                <EmptyState size="compact" title="No chats yet" description="Start a group to talk with your team." actionLabel="Start a group" onAction={onNew} />
              ) : (
                <EmptyState size="compact" title="No conversations yet" description="Use the invite link your team sent you to join one." />
              )
            ) : tab === 'unread' && !q ? (
              <EmptyState size="compact" title="Nothing unread" description="New messages show up here." />
            ) : (
              <EmptyState size="compact" title="No chats match" description="Try a different search." />
            )}
          </div>
        ) : (
          <ul className="animate-fade-in space-y-0.5">
            {shown.map((g) => {
              const last = g.last_message;
              const other = !isGroup(g) ? g.members.find((u) => u.id !== meId) : undefined;
              return (
                <li key={g.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(g.id)}
                    aria-current={g.id === activeId}
                    className={`flex w-full items-center gap-3 rounded-[var(--tm-radius-md)] px-2.5 py-2.5 text-left transition-colors ${
                      g.id === activeId ? 'bg-[var(--tc-row-sel)]' : 'hover:bg-[var(--tc-other-bg)]'
                    }`}
                  >
                    {other ? (
                      <Avatar name={other.name} src={other.avatar_url ?? undefined} size="md" />
                    ) : (
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--tc-other-bg)] text-[var(--tm-ink-soft)]">
                        <Users className="h-5 w-5" />
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className={`truncate text-[14px] text-[var(--tm-ink)] ${g.unread_count ? 'font-bold' : 'font-semibold'}`}>{g.name}</span>
                        {last && <span className={`shrink-0 text-[11px] ${g.unread_count ? 'font-semibold text-[var(--tm-ink)]' : 'text-[var(--tm-ink-muted)]'}`}>{listTime(last.at)}</span>}
                      </span>
                      <span className="mt-0.5 flex items-center justify-between gap-2">
                        <span className="truncate text-[12.5px] text-[var(--tm-ink-muted)]">
                          {last ? `${last.mine || last.sender?.id === meId ? 'You' : (last.sender?.name.split(' ')[0] ?? '?')}: ${last.preview}` : `${g.members.length} members`}
                        </span>
                        {g.unread_count > 0 && (
                          <span
                            className="grid h-[18px] min-w-[18px] shrink-0 place-items-center rounded-full bg-[var(--tm-ink)] px-1.5 text-[10.5px] font-bold text-[var(--tm-card)]"
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
      </PullToRefresh>
    </div>
  );
};
